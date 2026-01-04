
import logging
import sys
import os
from datetime import datetime

def configure_logging():
    """
    Configure logging for the database initialization service.
    Includes detailed logging for database restoration operations and troubleshooting.
    """
    # Create logs directory if it doesn't exist
    log_dir = "/app/logs"
    os.makedirs(log_dir, exist_ok=True)

    # Create formatters
    console_formatter = logging.Formatter(
        "%(asctime)s  %(name)-25s  %(levelname)-8s  %(message)s"
    )

    # Very detailed formatter for file logs including process info
    detailed_formatter = logging.Formatter(
        "%(asctime)s  %(name)s  %(levelname)s  %(filename)s:%(lineno)d  %(funcName)s  %(process)d:%(thread)d  %(message)s"
    )

    # Console handler for stdout with INFO level
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)

    # File handler for detailed initialization logs
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_filename = f"{log_dir}/db_init_{timestamp}.log"
    file_handler = logging.FileHandler(log_filename, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(detailed_formatter)

    # Error-only file handler for quick troubleshooting
    error_filename = f"{log_dir}/db_init_errors_{timestamp}.log"
    error_handler = logging.FileHandler(error_filename, encoding="utf-8")
    error_handler.setLevel(logging.WARNING)
    error_handler.setFormatter(detailed_formatter)

    # Configure root logger
    logging.basicConfig(
        level=logging.DEBUG,
        handlers=[console_handler, file_handler, error_handler]
    )

    # Set specific log levels for different components
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("google.cloud.storage").setLevel(logging.INFO)
    logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)

    # Database initialization specific loggers
    logging.getLogger("gcs_client").setLevel(logging.DEBUG)
    logging.getLogger("__main__").setLevel(logging.DEBUG)  # Main init script gets debug level

    # Log the initialization start
    logger = logging.getLogger(__name__)
    logger.info("=" * 80)
    logger.info("DATABASE INITIALIZATION SERVICE STARTED")
    logger.info(f"Log files: {log_filename}")
    logger.info(f"Error log: {error_filename}")
    logger.info("=" * 80)

