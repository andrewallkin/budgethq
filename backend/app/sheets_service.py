"""
Google Sheets Service for ETF price management.
Handles reading prices and managing ETF entries in the Google Sheet.
"""

import os
import json
import base64
from typing import List, Dict, Optional
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


# Scopes for read/write access to Google Sheets
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']


class GoogleSheetsService:
    """Service class for Google Sheets ETF operations."""
    
    def __init__(self):
        self.service = None
        self.spreadsheet_id = os.getenv('GOOGLE_SPREADSHEET_ID')
        self.sheet_name = os.getenv('GOOGLE_SHEET_NAME', 'Sheet1')
        self._initialize_service()
    
    def _initialize_service(self):
        """Initialize the Google Sheets API service using base64-encoded credentials."""
        credentials_b64 = os.getenv('GOOGLE_SHEETS_CREDENTIALS')
        
        if not credentials_b64:
            print("Warning: GOOGLE_SHEETS_CREDENTIALS environment variable not set")
            return
        
        if not self.spreadsheet_id:
            print("Warning: GOOGLE_SPREADSHEET_ID environment variable not set")
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
            print("Google Sheets service initialized successfully")
            
        except Exception as e:
            print(f"Error initializing Google Sheets service: {e}")
            self.service = None
    
    def is_available(self) -> bool:
        """Check if the Google Sheets service is available."""
        return self.service is not None
    
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
        
        # Range A2:C to skip the header row (3 columns now)
        range_name = f'{self.sheet_name}!A2:C'
        
        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=range_name
            ).execute()
            
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
            
        except HttpError as err:
            print(f"HTTP error reading from Google Sheets: {err}")
            return []
        except Exception as e:
            print(f"Error reading from Google Sheets: {e}")
            return []
    
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
    
    def add_etf_to_sheet(self, jse_ticker: str, etf_name: str) -> bool:
        """
        Add a new ETF row to the Google Sheet.
        The price formula will be automatically calculated by Google Sheets.
        
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
        
        # First, find the next row number
        try:
            # Get current data to find the last row
            range_name = f'{self.sheet_name}!A:A'
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
                range=f'{self.sheet_name}!A1',
                valueInputOption='USER_ENTERED',
                body=body
            ).execute()
            
            print(f"Successfully added ETF {jse_ticker} to Google Sheet")
            return True
            
        except HttpError as err:
            print(f"HTTP error adding ETF to Google Sheets: {err}")
            return False
        except Exception as e:
            print(f"Error adding ETF to Google Sheets: {e}")
            return False
    
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
        
        try:
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
                print(f"Could not find sheet: {self.sheet_name}")
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
                print(f"Ticker {jse_ticker} not found in sheet")
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
            
            print(f"Successfully deleted ETF {jse_ticker} from Google Sheet")
            return True
            
        except HttpError as err:
            print(f"HTTP error deleting ETF from Google Sheets: {err}")
            return False
        except Exception as e:
            print(f"Error deleting ETF from Google Sheets: {e}")
            return False
    
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


# Global instance for use across the application
_sheets_service: Optional[GoogleSheetsService] = None


def get_sheets_service() -> GoogleSheetsService:
    """Get or create the global Google Sheets service instance."""
    global _sheets_service
    if _sheets_service is None:
        _sheets_service = GoogleSheetsService()
    return _sheets_service

