
import logging
import sys
import os
from logging.handlers import RotatingFileHandler

def configure_logging():
    """
    Configure logging for the backend FastAPI service.
    Includes structured logging, file rotation, and appropriate log levels for web service.
    """
    # Create logs directory if it doesn't exist
    log_dir = "/app/logs"
    os.makedirs(log_dir, exist_ok=True)

    # Create formatters
    console_formatter = logging.Formatter(
        "%(asctime)s  %(name)-22s  %(levelname)-8s  %(message)s"
    )

    # Detailed formatter for file logs
    file_formatter = logging.Formatter(
        "%(asctime)s  %(name)s  %(levelname)s  %(filename)s:%(lineno)d  %(message)s"
    )

    # Console handler for stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)

    # File handler with rotation for persistent logs
    file_handler = RotatingFileHandler(
        "/app/logs/backend.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(file_formatter)

    # Configure root logger
    logging.basicConfig(
        level=logging.DEBUG,
        handlers=[console_handler, file_handler]
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
