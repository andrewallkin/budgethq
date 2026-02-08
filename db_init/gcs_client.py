"""
Google Cloud Storage Client for database backup downloads.
Handles authentication and file operations with GCS for database initialization.
"""

import logging
import os
import json
import base64
import tempfile
from typing import Optional
from google.cloud import storage

# Initialize logger
logger = logging.getLogger(__name__)


class GoogleCloudStorageClient:
    """Client class for Google Cloud Storage backup download operations."""

    def __init__(self):
        self.client: Optional[storage.Client] = None
        # Strip "_local" suffix from bucket name if present
        bucket_name = os.getenv("GCS_DB_BACKUP_BUCKET_NAME", "budgethq_database_backups")
        self.bucket_name = bucket_name.replace("_local", "") if bucket_name.endswith("_local") else bucket_name
        self._temp_credentials_file: Optional[str] = None
        self._initialize_service()

    def _initialize_service(self):
        """Initialize the Google Cloud Storage client using base64-encoded credentials."""
        credentials_b64 = os.getenv("GCP_SERVICE_ACCOUNT_CREDENTIALS")

        if not credentials_b64:
            logger.warning("GCP_SERVICE_ACCOUNT_CREDENTIALS environment variable not set")
            return

        try:
            # Decode the base64 credentials
            credentials_json = base64.b64decode(credentials_b64).decode("utf-8")
            credentials_dict = json.loads(credentials_json)

            # Create a temporary file for google-cloud-storage to use
            # The library expects GOOGLE_APPLICATION_CREDENTIALS env var pointing to a file
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False
            ) as f:
                json.dump(credentials_dict, f)
                self._temp_credentials_file = f.name

            # Set the environment variable for google-cloud-storage
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self._temp_credentials_file

            # Create the GCS client
            self.client = storage.Client()
            logger.info(
                f"Google Cloud Storage client initialized successfully (bucket: {self.bucket_name})"
            )

        except Exception as e:
            logger.error(f"Error initializing Google Cloud Storage client: {e}")
            self.client = None

    def is_available(self) -> bool:
        """Check if the Google Cloud Storage client is available."""
        return self.client is not None and self.bucket_name is not None

    def get_latest_backup_filename(self) -> Optional[str]:
        """
        Get the filename of the latest backup from GCS bucket.
        Parses timestamp from filename format: backup_YYYY-MM-DD_HH-MM-SS.sql.gz

        Returns:
            Filename of the latest backup, or None if not found
        """
        if not self.is_available():
            logger.error("Google Cloud Storage client not available")
            return None

        try:
            import re
            from datetime import datetime

            bucket = self.client.bucket(self.bucket_name)
            blobs = list(bucket.list_blobs())

            if not blobs:
                logger.error("No backup files found in GCS bucket")
                return None

            # Filter for .sql.gz files and parse timestamps from filenames
            backup_blobs = []
            timestamp_pattern = re.compile(r'backup_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.sql\.gz$')
            
            for blob in blobs:
                if blob.name.endswith('.sql.gz'):
                    match = timestamp_pattern.match(blob.name)
                    if match:
                        try:
                            # Parse timestamp from filename: YYYY-MM-DD_HH-MM-SS
                            timestamp_str = match.group(1)
                            timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d_%H-%M-%S')
                            backup_blobs.append((timestamp, blob.name))
                        except ValueError:
                            logger.warning(f"Could not parse timestamp from filename: {blob.name}")
                            # Fallback to time_created if filename parsing fails
                            backup_blobs.append((blob.time_created, blob.name))

            if not backup_blobs:
                logger.error("No valid .sql.gz backup files found in GCS bucket")
                return None

            # Sort by timestamp (newest first)
            backup_blobs.sort(key=lambda x: x[0], reverse=True)
            
            # Get blob sizes and find the first non-empty backup
            bucket = self.client.bucket(self.bucket_name)
            for timestamp, backup_name in backup_blobs:
                blob = bucket.blob(backup_name)
                if blob.exists():
                    blob.reload()
                    blob_size = blob.size
                    logger.info(f"Backup {backup_name}: {blob_size} bytes ({blob_size / 1024:.2f} KB)")
                    
                    # Skip backups that are suspiciously small (likely empty)
                    if blob_size > 1000:  # More than 1KB
                        logger.info(
                            f"Selected backup: {backup_name} (timestamp: {timestamp}, size: {blob_size} bytes)"
                        )
                        return backup_name
                    else:
                        logger.warning(
                            f"Skipping empty/small backup: {backup_name} ({blob_size} bytes)"
                        )
            
            # If all backups are empty, return the latest one anyway
            if backup_blobs:
                latest_backup_name = backup_blobs[0][1]
                logger.warning(
                    f"All backups appear empty. Using latest: {latest_backup_name} (timestamp: {backup_blobs[0][0]})"
                )
                return latest_backup_name

        except Exception as e:
            logger.error(f"Error getting latest backup filename: {e}", exc_info=True)
            return None

    def download_file(self, blob_name: str, destination_path: str) -> bool:
        """
        Download a file from the configured GCS bucket.

        Args:
            blob_name: Name of the blob/file in GCS
            destination_path: Local path where the file should be saved

        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            logger.error("Google Cloud Storage client not available")
            return False

        logger.info(f"Downloading {blob_name} from GCS bucket: {self.bucket_name}...")

        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(blob_name)
            
            # Check if blob exists and get its size
            if not blob.exists():
                logger.error(f"Blob {blob_name} does not exist in bucket {self.bucket_name}")
                return False
            
            blob.reload()  # Reload to get metadata
            blob_size = blob.size
            logger.info(f"Blob size in GCS: {blob_size} bytes ({blob_size / 1024:.2f} KB)")
            
            # Download the file
            blob.download_to_filename(destination_path)

            # Verify downloaded file size matches
            file_size = os.path.getsize(destination_path)
            logger.info(
                f"Successfully downloaded: {blob_name} ({file_size} bytes, {file_size / 1024:.2f} KB)"
            )
            
            if file_size != blob_size:
                logger.error(
                    f"Downloaded file size ({file_size} bytes) does not match blob size ({blob_size} bytes)!"
                )
                return False
            
            if file_size == 0:
                logger.error("Downloaded file is empty!")
                return False
            
            return True

        except Exception as e:
            logger.error(f"Error during GCS download: {e}", exc_info=True)
            return False

    def __del__(self):
        """Cleanup temporary credentials file on destruction."""
        if self._temp_credentials_file and os.path.exists(self._temp_credentials_file):
            try:
                os.unlink(self._temp_credentials_file)
                # Also clean up the env var if it points to our temp file
                if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") == self._temp_credentials_file:
                    del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
            except Exception as e:
                logger.warning(f"Failed to delete temp credentials file: {e}")

