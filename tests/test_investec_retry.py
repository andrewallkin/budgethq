"""Retry behaviour for Investec API requests (transient timeouts)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.investec_service import InvestecService


def _service() -> InvestecService:
    svc = InvestecService("cid", "csecret", "apikey")
    svc._token = "tok"
    from datetime import datetime, timedelta

    svc._token_expires = datetime.utcnow() + timedelta(minutes=10)
    return svc


class TestInvestecRequestRetry:
    def test_retries_after_a_read_timeout_and_succeeds(self):
        """A ReadTimeout on the first attempt is retried, second attempt succeeds."""
        ok = MagicMock(status_code=200)
        ok.json.return_value = {"data": {}}
        ok.raise_for_status = MagicMock()

        with patch(
            "app.investec_service.requests.request",
            side_effect=[
                requests.exceptions.ReadTimeout("read timed out"),
                ok,
            ],
        ) as mock_request, patch(
            "app.investec_service.time.sleep"
        ) as mock_sleep:
            svc = _service()
            result = svc._make_request("GET", "/za/pb/v1/accounts")

        assert result == {"data": {}}
        assert mock_request.call_count == 2
        mock_sleep.assert_called_once()

    def test_raises_after_exhausting_retries(self):
        """Persistent timeouts surface as 'Investec API error' after max attempts."""
        with patch(
            "app.investec_service.requests.request",
            side_effect=requests.exceptions.ReadTimeout("read timed out"),
        ) as mock_request, patch("app.investec_service.time.sleep"):
            svc = _service()
            with pytest.raises(Exception) as exc:
                svc._make_request("GET", "/za/pb/v1/accounts")

        assert "Investec API error" in str(exc.value)
        assert mock_request.call_count == 3

    def test_does_not_retry_http_error_responses(self):
        """A 4xx/5xx response is not retried — only network/timeout errors are."""
        bad = MagicMock(status_code=500)
        bad.raise_for_status.side_effect = requests.exceptions.HTTPError("500")

        with patch(
            "app.investec_service.requests.request",
            side_effect=[bad, bad],
        ) as mock_request, patch("app.investec_service.time.sleep"):
            svc = _service()
            with pytest.raises(Exception) as exc:
                svc._make_request("GET", "/za/pb/v1/accounts")

        assert "Investec API error" in str(exc.value)
        assert mock_request.call_count == 1

    def test_transaction_request_uses_60s_timeout(self):
        """Transaction reads use a 60 second read timeout."""
        ok = MagicMock(status_code=200)
        ok.json.return_value = {"data": {"transactions": []}}
        ok.raise_for_status = MagicMock()

        with patch(
            "app.investec_service.requests.request",
            return_value=ok,
        ) as mock_request:
            svc = _service()
            svc.get_transactions("acc-1", from_date="2026-01-01", to_date="2026-01-31")

        _, kwargs = mock_request.call_args
        assert kwargs["timeout"] == 60
