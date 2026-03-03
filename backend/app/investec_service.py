"""
Investec API Integration Service

Handles OAuth authentication and API requests to Investec Developer API.
API Documentation: https://developer.investec.com/za/api-products
"""

import requests
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import logging

from .logging_utils import redact_account

logger = logging.getLogger(__name__)


class InvestecService:
    """Handles Investec API authentication and requests"""

    def __init__(self, client_id: str, client_secret: str, api_key: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_key = api_key
        self.base_url = "https://openapi.investec.com"
        self._token = None
        self._token_expires = None

    def get_access_token(self) -> str:
        """
        Get OAuth2 access token using client credentials flow.
        Tokens are valid for 30 minutes and cached for reuse.

        Requires:
            - CLIENT_ID: Investec API client ID
            - CLIENT_SECRET: Investec API client secret
            - API_KEY: Investec API key (x-api-key header)

        Returns:
            Bearer token string

        Raises:
            Exception: If authentication fails
        """
        # Return cached token if still valid (with 1-minute buffer)
        if self._token and self._token_expires:
            if datetime.utcnow() < self._token_expires - timedelta(minutes=1):
                return self._token

        # Request new token
        auth_url = f"{self.base_url}/identity/v2/oauth2/token"

        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/x-www-form-urlencoded"
        }

        data = {
            "grant_type": "client_credentials"
        }

        try:
            # Use requests' built-in basic auth (cleaner than manual base64 encoding)
            response = requests.post(
                auth_url,
                auth=(self.client_id, self.client_secret),
                headers=headers,
                data=data,
                timeout=10
            )
            response.raise_for_status()

            token_data = response.json()
            self._token = token_data["access_token"]

            # Tokens expire in 30 minutes (1800 seconds)
            expires_in = token_data.get("expires_in", 1800)
            self._token_expires = datetime.utcnow() + timedelta(seconds=expires_in)

            logger.info("Investec access token obtained")
            return self._token

        except requests.exceptions.RequestException as e:
            logger.exception("Investec access token failed: %s: %s", type(e).__name__, e)
            raise Exception(f"Investec authentication failed: {str(e)}")

    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """
        Make authenticated request to Investec API.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path (e.g., "/za/pb/v1/accounts")
            **kwargs: Additional requests kwargs (params, json, etc.)

        Returns:
            Response JSON data

        Raises:
            Exception: If request fails
        """
        token = self.get_access_token()

        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {token}",
            "x-api-key": self.api_key,
            "Accept": "application/json"
        }

        try:
            response = requests.request(method, url, headers=headers, timeout=30, **kwargs)
            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            logger.exception(
                "Investec API request failed: %s %s: %s: %s",
                method,
                endpoint,
                type(e).__name__,
                e,
            )
            raise Exception(f"Investec API error: {str(e)}")

    def list_accounts(self) -> List[Dict]:
        """
        Get list of all user's accounts.

        Returns:
            List of account dictionaries with structure:
            {
                "accountId": "string",
                "accountNumber": "string",
                "accountName": "string",
                "referenceName": "string",
                "productName": "string"
            }
        """
        data = self._make_request("GET", "/za/pb/v1/accounts")
        accounts = data.get("data", {}).get("accounts", [])

        logger.info("Investec accounts retrieved: %d items", len(accounts))
        return accounts

    def get_account_balance(self, account_id: str) -> Dict:
        """
        Get current balance for specific account.

        Args:
            account_id: Investec account ID

        Returns:
            Balance dictionary with structure:
            {
                "accountId": "string",
                "currentBalance": float,
                "availableBalance": float,
                "currency": "ZAR"
            }
        """
        data = self._make_request("GET", f"/za/pb/v1/accounts/{account_id}/balance")
        balance = data.get("data", {})

        logger.info(
            "Investec account balance retrieved",
            extra={"account_id": redact_account(account_id)},
        )
        return balance

    def get_transactions(
        self,
        account_id: str,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        transaction_type: Optional[str] = None,
        include_pending: bool = True
    ) -> List[Dict]:
        """
        Get transactions for specific account.

        Args:
            account_id: Investec account ID
            from_date: Start date in ISO format (YYYY-MM-DD) - defaults to 90 days ago
            to_date: End date in ISO format (YYYY-MM-DD) - defaults to today
            transaction_type: Filter by type ("credit" or "debit")
            include_pending: Include pending (unposted) transactions in response (default True)

        Returns:
            List of transaction dictionaries with structure:
            {
                "accountId": "string",
                "type": "CREDIT" or "DEBIT",
                "transactionType": "string",  # e.g., "CardPurchases", "Deposits"
                "status": "POSTED" or "PENDING",
                "description": "string",
                "cardNumber": "string",
                "postingDate": "YYYY-MM-DD",
                "valueDate": "YYYY-MM-DD",
                "transactionDate": "YYYY-MM-DD",
                "amount": float,
                "runningBalance": float
            }
        """
        # Default date range: last 90 days
        if not to_date:
            to_date = datetime.utcnow().strftime("%Y-%m-%d")
        if not from_date:
            from_date_dt = datetime.utcnow() - timedelta(days=90)
            from_date = from_date_dt.strftime("%Y-%m-%d")

        params = {
            "fromDate": from_date,
            "toDate": to_date,
            "includePending": include_pending
        }

        if transaction_type:
            params["transactionType"] = transaction_type

        data = self._make_request(
            "GET",
            f"/za/pb/v1/accounts/{account_id}/transactions",
            params=params
        )

        transactions = data.get("data", {}).get("transactions", [])

        logger.info(
            "Investec transactions retrieved: %d items",
            len(transactions),
            extra={"account_id": redact_account(account_id), "from_date": from_date, "to_date": to_date},
        )
        return transactions

    def test_connection(self) -> bool:
        """
        Test if credentials are valid by attempting to list accounts.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.list_accounts()
            return True
        except Exception as e:
            logger.exception("Investec connection test failed: %s: %s", type(e).__name__, e)
            return False
