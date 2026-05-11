"""
Google Sheet FX rates for investment portfolio aggregates.

Uses the **same workbook** as portfolio ETF tabs (`GOOGLE_SPREADSHEET_ID`). Tab name is
parsed from `GOOGLE_FX_RANGE` (default sheet title `BudgetHQ_FX`).

On first use, if that worksheet is missing, the backend **creates** it and seeds rows for
each portfolio currency except `INVESTMENTS_FX_BASE_CURRENCY`, with
`=GOOGLEFINANCE("CURRENCY:{FOREIGN}{BASE}")` in column B (base units per 1 unit of column A).

Row 2+ example when base is ZAR: USD / =GOOGLEFINANCE("CURRENCY:USDZAR").

Share the workbook with your Sheets service account (same as ETF sync). Reads use
spreadsheets.values.get (evaluated numbers).

Env (see `.env.example`):
- GOOGLE_FX_RANGE — A1 notation, default `BudgetHQ_FX!A2:B`
- INVESTMENTS_FX_BASE_CURRENCY — default ZAR
- INVESTMENTS_FX_CACHE_SECONDS — TTL for cached FX reads, default 900
"""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any, Optional

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Currencies we seed on the FX tab (aligned with investments ALLOWED_CURRENCY_CODES).
FX_SHEET_CURRENCIES = frozenset({"ZAR", "USD", "EUR", "GBP"})

# Module-level cache
_cache_lock = threading.Lock()
_cache_rates: Optional[dict[str, float]] = None
_cache_fetched_at: float = 0.0
_cache_error: Optional[str] = None

_ensure_fx_tab_lock = threading.Lock()
_fx_tab_ensured_for_id: Optional[str] = None


@dataclass(frozen=True)
class FxRatesResult:
    base_currency: str
    rates: dict[str, float]
    fetched_at_unix: Optional[float]
    source: str
    configured: bool
    error_message: Optional[str]


def investments_fx_base_currency() -> str:
    return (os.getenv("INVESTMENTS_FX_BASE_CURRENCY") or "ZAR").strip().upper()


def _fx_ttl_seconds() -> int:
    try:
        return max(60, int(os.getenv("INVESTMENTS_FX_CACHE_SECONDS") or "900"))
    except ValueError:
        return 900


def _fx_spreadsheet_id() -> Optional[str]:
    sid = os.getenv("GOOGLE_SPREADSHEET_ID")
    return sid.strip() if sid else None


def _fx_range() -> str:
    return (os.getenv("GOOGLE_FX_RANGE") or "BudgetHQ_FX!A2:B").strip()


def _fx_sheet_title() -> str:
    """Sheet tab name from GOOGLE_FX_RANGE (part before !)."""
    r = _fx_range()
    if "!" in r:
        title = r.split("!", 1)[0].strip()
        if title.startswith("'") and title.endswith("'"):
            title = title[1:-1].replace("''", "'")
        return title or "BudgetHQ_FX"
    return "BudgetHQ_FX"


def _a1_sheet_prefix(title: str) -> str:
    """Prefix for A1 ranges (quote sheet title when needed)."""
    if not title:
        return "BudgetHQ_FX"
    if title.replace("_", "").isalnum() and " " not in title:
        return title
    escaped = title.replace("'", "''")
    return f"'{escaped}'"


def _googlefinance_fx_formula(foreign: str, base: str) -> str:
    return f'=GOOGLEFINANCE("CURRENCY:{foreign}{base}")'


def ensure_fx_rates_tab(sheets_api_service, spreadsheet_id: str) -> None:
    """
    If the FX worksheet (from GOOGLE_FX_RANGE) is missing, create it and seed GOOGLEFINANCE rows.
    Idempotent per process and spreadsheet_id. Does not modify an existing tab.
    """
    global _fx_tab_ensured_for_id
    if not sheets_api_service or not spreadsheet_id:
        return

    base = investments_fx_base_currency()
    tab = _fx_sheet_title()
    prefix = _a1_sheet_prefix(tab)

    with _ensure_fx_tab_lock:
        if _fx_tab_ensured_for_id == spreadsheet_id:
            return

        try:
            meta = (
                sheets_api_service.spreadsheets()
                .get(spreadsheetId=spreadsheet_id, fields="sheets(properties(title))")
                .execute()
            )
            titles = {s["properties"]["title"] for s in meta.get("sheets", [])}
            if tab in titles:
                _fx_tab_ensured_for_id = spreadsheet_id
                return

            sheets_api_service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={
                    "requests": [
                        {
                            "addSheet": {
                                "properties": {
                                    "title": tab,
                                    "sheetType": "GRID",
                                    "gridProperties": {"rowCount": 1000, "columnCount": 4},
                                }
                            }
                        }
                    ]
                },
            ).execute()

            sheets_api_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"{prefix}!A1:B1",
                valueInputOption="RAW",
                body={"values": [["Currency", "Rate"]]},
            ).execute()

            codes = sorted(FX_SHEET_CURRENCIES - {base})
            rows = [[c, _googlefinance_fx_formula(c, base)] for c in codes]
            if rows:
                sheets_api_service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=f"{prefix}!A2:B{1 + len(rows)}",
                    valueInputOption="USER_ENTERED",
                    body={"values": rows},
                ).execute()

            logger.info(
                "FX worksheet created and seeded",
                extra={"spreadsheet_id": spreadsheet_id, "tab": tab, "base_currency": base},
            )
            _fx_tab_ensured_for_id = spreadsheet_id
        except Exception:
            logger.exception(
                "FX: ensure_fx_rates_tab failed",
                extra={"spreadsheet_id": spreadsheet_id, "tab": tab},
            )


def _build_sheets_client():
    credentials_b64 = os.getenv("GCP_SERVICE_ACCOUNT_CREDENTIALS")
    if not credentials_b64:
        logger.warning("FX: GCP_SERVICE_ACCOUNT_CREDENTIALS not set")
        return None
    try:
        raw = json.loads(base64.b64decode(credentials_b64).decode("utf-8"))
        creds = Credentials.from_service_account_info(raw, scopes=SCOPES)
        return build("sheets", "v4", credentials=creds, cache_discovery=False)
    except Exception:
        logger.exception("FX: failed to initialize Google Sheets client")
        return None


def _parse_rate_cell(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _fetch_sheet_rates() -> tuple[dict[str, float], Optional[str]]:
    """Returns (rates map currency->multiplier_to_base, error_message)."""
    spreadsheet_id = _fx_spreadsheet_id()
    rng = _fx_range()
    if not spreadsheet_id:
        return {}, "FX spreadsheet ID not configured (GOOGLE_SPREADSHEET_ID)"
    svc = _build_sheets_client()
    if svc is None:
        return {}, "Google Sheets credentials unavailable"

    ensure_fx_rates_tab(svc, spreadsheet_id)

    try:
        result = (
            svc.spreadsheets()
            .values()
            .get(spreadsheetId=spreadsheet_id, range=rng)
            .execute()
        )
    except Exception as e:
        logger.exception("FX: sheet read failed: %s", e)
        return {}, f"Sheets read failed: {e!s}"

    values = result.get("values") or []
    rates: dict[str, float] = {}
    for row in values:
        if len(row) < 2:
            continue
        code = str(row[0]).strip().upper()
        rate = _parse_rate_cell(row[1])
        if not code or rate is None or rate <= 0:
            continue
        rates[code] = rate

    if not rates:
        return {}, f"No valid FX rows in range {rng}"

    return rates, None


def get_fx_rates_cached(force_refresh: bool = False) -> FxRatesResult:
    """Return FX rates → base_currency with TTL cache (single-process)."""
    global _cache_rates, _cache_fetched_at, _cache_error
    base = investments_fx_base_currency()
    now = time.time()
    ttl = _fx_ttl_seconds()

    if not force_refresh:
        with _cache_lock:
            if _cache_rates is not None and (now - _cache_fetched_at) < ttl:
                return FxRatesResult(
                    base_currency=base,
                    rates=dict(_cache_rates),
                    fetched_at_unix=_cache_fetched_at,
                    source="google_sheets",
                    configured=bool(_fx_spreadsheet_id() and os.getenv("GCP_SERVICE_ACCOUNT_CREDENTIALS")),
                    error_message=_cache_error,
                )

    rates, err = _fetch_sheet_rates()
    with _cache_lock:
        if err:
            stale = dict(_cache_rates) if _cache_rates is not None else {}
            ft = _cache_fetched_at if _cache_fetched_at > 0 else None
            if stale:
                # Keep serving last good values
                _cache_error = err
                return FxRatesResult(
                    base_currency=base,
                    rates=stale,
                    fetched_at_unix=ft,
                    source="google_sheets_cached_stale",
                    configured=True,
                    error_message=err,
                )
            return FxRatesResult(
                base_currency=base,
                rates={},
                fetched_at_unix=None,
                source="google_sheets",
                configured=bool(_fx_spreadsheet_id() and os.getenv("GCP_SERVICE_ACCOUNT_CREDENTIALS")),
                error_message=err,
            )

        _cache_rates = dict(rates)
        _cache_fetched_at = now
        _cache_error = None
        return FxRatesResult(
            base_currency=base,
            rates=dict(rates),
            fetched_at_unix=now,
            source="google_sheets",
            configured=True,
            error_message=None,
        )


def amount_in_base(amount: float, currency_code: str, fx: FxRatesResult) -> Optional[float]:
    """Convert holdings value from portfolio currency into base_currency using fx.rates."""
    cc = (currency_code or "").strip().upper()
    base = fx.base_currency
    if cc == base:
        return amount
    r = fx.rates.get(cc)
    if r is None:
        return None
    return amount * r


def aggregate_portfolios_base(
    items: list[tuple[float, str]], fx: FxRatesResult
) -> tuple[Optional[float], Optional[str]]:
    """
    Sum (value, currency) tuples in base_currency.
    Returns (total_or_none, error_if_partial).
    """
    if all((c or "").strip().upper() == fx.base_currency for _, c in items):
        return sum(v for v, _ in items), None

    if not fx.rates:
        missing = sorted({((c or "ZAR").strip().upper()) for _, c in items if (c or "ZAR").strip().upper() != fx.base_currency})
        return None, f"FX rates unavailable; need sheet rates for: {', '.join(missing)}"

    total = 0.0
    missing: list[str] = []
    for value, curr in items:
        conv = amount_in_base(value, curr, fx)
        if conv is None:
            missing.append((curr or "ZAR").strip().upper())
            continue
        total += conv
    if missing:
        return None, f"Missing FX rate for currencies: {', '.join(sorted(set(missing)))}"
    return total, None

