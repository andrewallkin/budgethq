"""
Google Sheets Service for ETF price management.
Handles reading prices and managing ETF entries in the Google Sheet.
"""

import logging
import os
import json
import base64
from typing import List, Dict, Optional
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session
from .database import get_db
from . import models


# Scopes for read/write access to Google Sheets
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

# Initialize logger
logger = logging.getLogger(__name__)


class GoogleSheetsService:
    """Service class for Google Sheets ETF operations."""

    def __init__(self, user_id: int):
        self.service = None
        self.spreadsheet_id = os.getenv('GOOGLE_SPREADSHEET_ID')
        self.user_id = user_id
        self._sheet_name = None  # Lazy-loaded
        self._initialize_service()

    @property
    def sheet_name(self) -> str:
        """Get the sheet name, lazy-loading from database if needed."""
        if self._sheet_name is None:
            self._sheet_name = self.get_sheet_name_for_user(self.user_id)
        return self._sheet_name

    @staticmethod
    def get_sheet_name_for_user(user_id: int) -> str:
        """Get the sheet name for a user from database, creating if necessary."""
        if user_id is None:
            raise ValueError("user_id cannot be None - all operations must be user-specific")

        # Create database session
        db = next(get_db())

        try:
            # Check if user sheet record exists
            user_sheet = db.query(models.UserSheet).filter(
                models.UserSheet.user_id == user_id
            ).first()

            if user_sheet:
                return user_sheet.sheet_name

            # Create new user sheet record with user ID based name
            sheet_name = f"user_{user_id}"
            user_sheet = models.UserSheet(
                user_id=user_id,
                sheet_name=sheet_name
            )
            db.add(user_sheet)
            db.commit()

            logger.info(
                "User sheet record created",
                extra={"user_id": user_id, "sheet_name": sheet_name},
            )
            return sheet_name

        except Exception as e:
            logger.exception(
                "User sheet get/create failed: %s: %s",
                type(e).__name__,
                e,
                extra={"user_id": user_id},
            )
            # Fallback to user ID based name (not stored in DB)
            fallback_name = f"user_{user_id}"
            logger.warning(
                "Using fallback sheet name",
                extra={"user_id": user_id, "fallback_name": fallback_name},
            )
            return fallback_name
        finally:
            db.close()

    
    def _initialize_service(self):
        """Initialize the Google Sheets API service using base64-encoded credentials."""
        credentials_b64 = os.getenv('GCP_SERVICE_ACCOUNT_CREDENTIALS')
        
        if not credentials_b64:
            logger.warning("GCP_SERVICE_ACCOUNT_CREDENTIALS environment variable not set")
            return
        
        if not self.spreadsheet_id:
            logger.warning("GOOGLE_SPREADSHEET_ID environment variable not set")
            return
        
        try:
            # Decode the base64 credentials
            credentials_json = base64.b64decode(credentials_b64).decode('utf-8')
            credentials_dict = json.loads(credentials_json)
            
            # Create credentials from the decoded JSON
            credentials = Credentials.from_service_account_info(
                credentials_dict, scopes=SCOPES
            )
            
            # Build the Sheets API service
            self.service = build('sheets', 'v4', credentials=credentials)
            logger.info("Google Sheets service initialized")
            
        except Exception as e:
            logger.exception(
                "Google Sheets initialization failed: %s: %s",
                type(e).__name__,
                e,
            )
            self.service = None
    
    def is_available(self) -> bool:
        """Check if the Google Sheets service is available."""
        return self.service is not None

    def _ensure_user_sheet_exists(self) -> bool:
        """
        Ensure the user-specific sheet tab exists and has proper headers.
        Creates the tab if it doesn't exist.

        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            return False

        try:
            # Get spreadsheet metadata to check existing sheets
            spreadsheet_data = self.service.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id
            ).execute()

            # Check if our desired sheet already exists
            sheet_exists = any(
                sheet['properties']['title'] == self.sheet_name
                for sheet in spreadsheet_data.get('sheets', [])
            )

            if sheet_exists:
                # Sheet already exists with correct name
                return True

            # Create new sheet tab
            request_body = {
                'requests': [{
                    'addSheet': {
                        'properties': {
                            'title': self.sheet_name,
                            'sheetType': 'GRID',
                            'gridProperties': {
                                'rowCount': 1000,
                                'columnCount': 3
                            }
                        }
                    }
                }]
            }

            self.service.spreadsheets().batchUpdate(
                spreadsheetId=self.spreadsheet_id,
                body=request_body
            ).execute()

            # Add headers to the new sheet
            headers = [['Ticker', 'ETF Name', 'Price']]
            body = {'values': headers}

            self.service.spreadsheets().values().update(
                spreadsheetId=self.spreadsheet_id,
                range=f'{self.sheet_name}!A1:C1',
                valueInputOption='RAW',
                body=body
            ).execute()

            logger.info(
                "Sheet tab created with headers",
                extra={"sheet_name": self.sheet_name},
            )
            return True

        except Exception as e:
            logger.exception(
                "User sheet ensure failed: %s: %s",
                type(e).__name__,
                e,
                extra={"sheet_name": self.sheet_name},
            )
            return False
    

    def _retry_on_connection_error(func):
        """Decorator to retry operation once on connection errors."""
        def wrapper(self, *args, **kwargs):
            try:
                return func(self, *args, **kwargs)
            except (BrokenPipeError, ConnectionError) as e:
                logger.warning(
                    "Connection error, retrying: %s: %s",
                    type(e).__name__,
                    e,
                    extra={"function": func.__name__},
                )
                # Re-initialize service
                self._initialize_service()
                if not self.is_available():
                    logger.error("Google Sheets service unavailable after re-initialization")
                    return [] if func.__name__ == 'get_all_etf_prices' else False
                try:
                    return func(self, *args, **kwargs)
                except Exception as retry_err:
                    logger.exception(
                        "Retry failed: %s: %s",
                        type(retry_err).__name__,
                        retry_err,
                        extra={"function": func.__name__},
                    )
                    return [] if func.__name__ == 'get_all_etf_prices' else False
            except HttpError as err:
                logger.error(
                    "HTTP error: %s",
                    err,
                    extra={"function": func.__name__},
                )
                return [] if func.__name__ == 'get_all_etf_prices' else False
            except Exception as e:
                logger.exception(
                    "Sheets operation failed: %s: %s",
                    type(e).__name__,
                    e,
                    extra={"function": func.__name__},
                )
                return [] if func.__name__ == 'get_all_etf_prices' else False
        return wrapper

    @_retry_on_connection_error
    def get_all_etf_prices(self) -> List[Dict]:
        """
        Read all ETF data from the Google Sheet.

        Sheet format (3 columns):
            A: Ticker (e.g., JSE:STX40)
            B: ETF Name (e.g., Satrix Top 40)
            C: Price (formula: =GOOGLEFINANCE(A2,"price")/100)

        Returns:
            List of dicts with keys: jse_ticker, etf_name, current_price
        """
        if not self.is_available():
            return []

        # Ensure user sheet exists before reading
        if not self._ensure_user_sheet_exists():
            return []

        # Range A2:C to skip the header row (3 columns now)
        range_name = f'{self.sheet_name}!A2:C'
        
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.spreadsheet_id,
            range=range_name
        ).execute()
        
        logger.info(
            "ETF prices fetched",
            extra={"range_name": range_name, "user_id": self.user_id},
        )
        
        values = result.get('values', [])
        
        if not values:
            return []
        
        etf_prices = []
        for row in values:
            if len(row) >= 3:
                ticker = row[0]
                name = row[1] if len(row) > 1 else ''
                
                # Parse price (column C)
                try:
                    price = float(row[2]) if row[2] else None
                except (ValueError, IndexError):
                    price = None
                
                etf_prices.append({
                    'jse_ticker': ticker,
                    'etf_name': name,
                    'current_price': price
                })
        
        return etf_prices
    
    def get_price_for_ticker(self, jse_ticker: str) -> Optional[float]:
        """
        Get the current price for a specific ticker.
        
        Args:
            jse_ticker: The JSE ticker symbol (e.g., "JSE:STX40")
            
        Returns:
            The current price or None if not found
        """
        all_prices = self.get_all_etf_prices()
        for etf in all_prices:
            if etf['jse_ticker'] == jse_ticker:
                return etf['current_price']
        return None
    
    def _add_etf_to_specific_sheet(self, sheet_name: str, jse_ticker: str, etf_name: str) -> bool:
        """
        Add a new ETF row to a specific sheet.

        Args:
            sheet_name: Name of the sheet to add to
            jse_ticker: JSE ticker (e.g., "JSE:STX40")
            etf_name: ETF display name (e.g., "Satrix Top 40")

        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            return False

        try:
            # First, find the next row number
            # Get current data to find the last row
            range_name = f'{sheet_name}!A:A'
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=range_name
            ).execute()

            values = result.get('values', [])
            next_row = len(values) + 1

            # Create the price formula for the new row
            # =GOOGLEFINANCE(A{row}, "price")/100
            price_formula = f'=GOOGLEFINANCE(A{next_row}, "price")/100'

            # Prepare the new row data (3 columns: ticker, name, price formula)
            new_row = [[jse_ticker, etf_name, price_formula]]

            # Append the new row
            body = {'values': new_row}

            self.service.spreadsheets().values().append(
                spreadsheetId=self.spreadsheet_id,
                range=f'{sheet_name}!A1',
                valueInputOption='USER_ENTERED',
                body=body
            ).execute()

            logger.info(
                "ETF added to sheet",
                extra={"jse_ticker": jse_ticker, "sheet_name": sheet_name},
            )
            return True

        except Exception as e:
            logger.exception(
                "ETF add to sheet failed: %s: %s",
                type(e).__name__,
                e,
                extra={"jse_ticker": jse_ticker, "sheet_name": sheet_name},
            )
            return False

    @_retry_on_connection_error
    def add_etf_to_sheet(self, jse_ticker: str, etf_name: str) -> bool:
        """
        Add a new ETF row to the user's Google Sheet.

        Sheet format (3 columns):
            A: Ticker
            B: ETF Name
            C: Price (auto-generated formula)

        Args:
            jse_ticker: JSE ticker (e.g., "JSE:STX40")
            etf_name: ETF display name (e.g., "Satrix Top 40")

        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            return False

        # Ensure user sheet exists before adding
        if not self._ensure_user_sheet_exists():
            return False

        # Add to user sheet only
        return self._add_etf_to_specific_sheet(self.sheet_name, jse_ticker, etf_name)

    @_retry_on_connection_error
    def delete_etf_from_sheet(self, jse_ticker: str) -> bool:
        """
        Delete an ETF row from the Google Sheet by ticker.

        Args:
            jse_ticker: The JSE ticker to delete

        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            return False

        # Ensure user sheet exists (though it should if we're deleting from it)
        if not self._ensure_user_sheet_exists():
            return False
        
        # First, get the sheet ID (GID)
        spreadsheet_data = self.service.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id
        ).execute()
        
        sheet_id = None
        for sheet in spreadsheet_data.get('sheets', []):
            if sheet['properties']['title'] == self.sheet_name:
                sheet_id = sheet['properties']['sheetId']
                break
        
        if sheet_id is None:
            logger.error("Sheet not found", extra={"sheet_name": self.sheet_name})
            return False
        
        # Find the row with the matching ticker
        range_name = f'{self.sheet_name}!A:A'
        result = self.service.spreadsheets().values().get(
            spreadsheetId=self.spreadsheet_id,
            range=range_name
        ).execute()
        
        values = result.get('values', [])
        row_to_delete = None
        
        for i, row in enumerate(values):
            if row and row[0] == jse_ticker:
                row_to_delete = i
                break
        
        if row_to_delete is None:
            logger.warning(
                "Ticker not found in sheet",
                extra={"jse_ticker": jse_ticker, "sheet_name": self.sheet_name},
            )
            return False
        
        # Delete the row (0-indexed for the API)
        request_body = {
            'requests': [{
                'deleteDimension': {
                    'range': {
                        'sheetId': sheet_id,
                        'dimension': 'ROWS',
                        'startIndex': row_to_delete,
                        'endIndex': row_to_delete + 1
                    }
                }
            }]
        }
        
        self.service.spreadsheets().batchUpdate(
            spreadsheetId=self.spreadsheet_id,
            body=request_body
        ).execute()
        

        
        logger.info(
            "ETF deleted from sheet",
            extra={"jse_ticker": jse_ticker, "sheet_name": self.sheet_name},
        )
        return True
    
    def check_ticker_exists(self, jse_ticker: str) -> bool:
        """
        Check if a ticker already exists in the Google Sheet.
        
        Args:
            jse_ticker: The JSE ticker to check
            
        Returns:
            True if the ticker exists, False otherwise
        """
        all_etfs = self.get_all_etf_prices()
        return any(etf['jse_ticker'] == jse_ticker for etf in all_etfs)


# Global instances cache for use across the application
_sheets_services: Dict[Optional[int], GoogleSheetsService] = {}


def get_sheets_service(user_id: int) -> GoogleSheetsService:
    """
    Get or create a Google Sheets service instance for a specific user.

    Args:
        user_id: The user ID to get the service for. Each user has their own sheet.

    Returns:
        GoogleSheetsService instance for the specified user
    """
    global _sheets_services
    if user_id not in _sheets_services:
        _sheets_services[user_id] = GoogleSheetsService(user_id=user_id)
    return _sheets_services[user_id]

