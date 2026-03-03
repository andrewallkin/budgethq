import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Context vars for request-scoped log metadata (set by middleware)
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)


class ContextInjectorFilter(logging.Filter):
    """Inject request_id and user_id from contextvars into LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.user_id = user_id_var.get()
        return True


class JSONFormatter(logging.Formatter):
    """Emit structured JSON logs for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if getattr(record, "request_id", None):
            log_obj["request_id"] = record.request_id
        if getattr(record, "user_id", None):
            log_obj["user_id"] = record.user_id
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        # Merge extra dict into log object (avoid "msg", "args" from LogRecord)
        skip = {"msg", "args", "message", "exc_info", "exc_text", "stack_info"}
        for k, v in record.__dict__.items():
            if k not in skip and v is not None:
                log_obj[k] = v
        return json.dumps(log_obj)


def configure_logging():
    """
    Configure logging for the backend FastAPI service.
    Includes structured logging, file rotation, and appropriate log levels for web service.
    Use LOG_FORMAT=json for production; human-readable default for development.
    """
    log_dir = os.getenv("LOG_DIR")
    if not log_dir:
        # Use ./logs for local dev, /app/logs in Docker
        log_dir = "logs" if not os.path.exists("/app") else "/app/logs"
    log_dir = os.path.abspath(log_dir)
    os.makedirs(log_dir, exist_ok=True)

    use_json = os.getenv("LOG_FORMAT", "").lower() == "json"

    # Human-readable formatters
    console_formatter = logging.Formatter(
        "%(asctime)s  %(name)-22s  %(levelname)-8s  %(message)s"
    )
    file_formatter = logging.Formatter(
        "%(asctime)s  %(name)s  %(levelname)s  %(filename)s:%(lineno)d  %(message)s"
    )

    # Choose formatter based on env
    formatter = JSONFormatter() if use_json else console_formatter
    file_formatter_final = JSONFormatter() if use_json else file_formatter

    # Console handler for stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    # File handler with rotation for persistent logs
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, "backend.log"),
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(file_formatter_final)

    # Inject request_id/user_id into all log records (for JSON and human formats)
    context_filter = ContextInjectorFilter()
    console_handler.addFilter(context_filter)
    file_handler.addFilter(context_filter)

    # Configure root logger
    logging.basicConfig(
        level=logging.DEBUG,
        handlers=[console_handler, file_handler],
        force=True,
    )

    # Set specific log levels for different components
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)  # Reduce access log noise
    logging.getLogger("fastapi").setLevel(logging.INFO)
    logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.INFO)

    # Application-specific loggers
    logging.getLogger("app.routers").setLevel(logging.INFO)
    logging.getLogger("app.scheduler").setLevel(logging.INFO)
    logging.getLogger("app.database").setLevel(logging.WARNING)
