
import logging
import sys

def configure_logging():
    """
    Configure the root logger for aligned logs.
    """
    logging.basicConfig(
        level=logging.INFO,
        format=(
            "%(asctime)s  "
            "%(name)-22s  "      # logger name padded to 20 chars
            "%(levelname)-8s  "  # log level padded to 8 chars
            "%(message)s"
        ),
        handlers=[logging.StreamHandler(sys.stdout)]
    )

    logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
    
    # Optional: Lower noise from third-party libraries if needed
    # logging.getLogger("urllib3").setLevel(logging.WARNING)
    # logging.getLogger("apscheduler").setLevel(logging.INFO)

