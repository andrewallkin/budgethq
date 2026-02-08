"""
Google Cloud Storage Service for payslip PDF uploads.
Handles authentication and file operations with GCS for payslip storage.
"""

import logging
import os
import json
import base64
import tempfile
from typing import Optional
from google.cloud import storage
from io import BytesIO

# Initialize logger
logger = logging.getLogger(__name__)


class PayslipGCSService:
    """Service class for Google Cloud Storage payslip operations."""

    def __init__(self):
        self.client: Optional[storage.Client] = None
        self.bucket_name = os.getenv("GCS_PAYSLIPS_BUCKET_NAME")
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
                f"Payslip GCS service initialized successfully (bucket: {self.bucket_name})"
            )

        except Exception as e:
            logger.error(f"Error initializing Payslip GCS service: {e}")
            self.client = None

    def is_available(self) -> bool:
        """Check if the Google Cloud Storage service is available."""
        return self.client is not None and self.bucket_name is not None

    def upload_payslip(
        self, user_id: int, year: int, month: int, file_content: bytes
    ) -> Optional[str]:
        """
        Upload a payslip PDF to GCS.

        Args:
            user_id: User ID
            year: Year of payslip
            month: Month of payslip (1-12)
            file_content: PDF file content as bytes

        Returns:
            GCS path if successful, None otherwise
        """
        if not self.is_available():
            logger.error("Payslip GCS service not available")
            return None

        # Create path: payslips/{user_id}/{year}-{month:02d}.pdf
        gcs_path = f"payslips/{user_id}/{year}-{month:02d}.pdf"
        logger.info(f"Uploading payslip to GCS: {gcs_path}")

        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(gcs_path)
            
            # Upload from bytes
            blob.upload_from_file(BytesIO(file_content), content_type="application/pdf")

            logger.info(f"Successfully uploaded payslip: {gcs_path}")
            return gcs_path

        except Exception as e:
            logger.error(f"Error uploading payslip to GCS: {e}")
            return None

    def download_payslip(self, gcs_path: str) -> Optional[bytes]:
        """
        Download a payslip PDF from GCS.

        Args:
            gcs_path: Path to the file in GCS

        Returns:
            File content as bytes if successful, None otherwise
        """
        if not self.is_available():
            logger.error("Payslip GCS service not available")
            return None

        logger.info(f"Downloading payslip from GCS: {gcs_path}")

        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(gcs_path)
            
            # Download as bytes
            file_content = blob.download_as_bytes()
            
            logger.info(f"Successfully downloaded payslip: {gcs_path}")
            return file_content

        except Exception as e:
            logger.error(f"Error downloading payslip from GCS: {e}")
            return None

    def delete_payslip(self, gcs_path: str) -> bool:
        """
        Delete a payslip PDF from GCS.

        Args:
            gcs_path: Path to the file in GCS

        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            logger.error("Payslip GCS service not available")
            return False

        if not gcs_path:
            logger.warning("No GCS path provided for deletion")
            return False

        logger.info(f"Deleting payslip from GCS: {gcs_path}")

        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(gcs_path)
            blob.delete()

            logger.info(f"Successfully deleted payslip: {gcs_path}")
            return True

        except Exception as e:
            logger.error(f"Error deleting payslip from GCS: {e}")
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
