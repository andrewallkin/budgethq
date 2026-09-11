"""Investments 2.0 API — live Sygnia accounts."""

from __future__ import annotations

import asyncio
import calendar
import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import auth, database, models
from ..services.account_product import remaining_ra_room
from ..services.sygnia import sync_account, test_login_and_list_accounts
from ..services.sygnia.extract import parse_zar_amount
from ..tax_engine import get_tax_config
from ..utils import (
    decrypt_api_key,
    encrypt_api_key,
    format_sa_financial_year_label,
    get_sa_financial_year_start,
    get_sast_now,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investments-v2", tags=["investments-v2"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class SygniaTestLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class SygniaDiscoveredAccount(BaseModel):
    accountCode: str | None = None
    accountTypeName: str | None = None
    accountTypeCode: str | None = None
    foreignAllocation: float | None = None
    reg28Compliant: bool | None = None


class SygniaTestLoginResponse(BaseModel):
    ok: bool
    message: str
    accounts: list[SygniaDiscoveredAccount] = Field(default_factory=list)


class SygniaLoginSummary(BaseModel):
    id: int
    username_masked: str


class CreateSygniaAccountRequest(BaseModel):
    login_id: Optional[int] = None
    username: Optional[str] = Field(default=None, max_length=200)
    password: Optional[str] = Field(default=None, max_length=200)
    account_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    product_type: str = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def validate_login_source(self) -> "CreateSygniaAccountRequest":
        has_login_id = self.login_id is not None
        has_username = bool((self.username or "").strip())
        has_password = bool(self.password)
        has_credentials = has_username and has_password

        if has_login_id and has_credentials:
            raise ValueError("Provide either login_id or username+password, not both.")
        if not has_login_id and not has_credentials:
            raise ValueError("Provide either login_id or username+password.")
        if has_username != has_password:
            raise ValueError("username and password must both be provided.")
        return self


class UpdateSygniaAccountRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    product_type: Optional[str] = Field(default=None, max_length=32)


class SygniaSnapshotData(BaseModel):
    month: str  # YYYY-MM
    portfolio_value: float


class SygniaContributionData(BaseModel):
    month: str  # YYYY-MM
    amount: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_month_to_date(month_str: str) -> date:
    """Parse YYYY-MM to date(year, month, 1). Raises ValueError if invalid."""
    if not month_str or len(month_str) < 7:
        raise ValueError("month required as YYYY-MM")
    parts = month_str.strip().split("-")
    if len(parts) != 2:
        raise ValueError("month must be YYYY-MM")
    year = int(parts[0])
    month = int(parts[1])
    if month < 1 or month > 12:
        raise ValueError("month must be 1-12")
    return date(year, month, 1)


def _parse_month_to_last_day(month_str: str) -> date:
    """Parse YYYY-MM to the last calendar day of that month."""
    first = _parse_month_to_date(month_str)
    last_day = calendar.monthrange(first.year, first.month)[1]
    return date(first.year, first.month, last_day)


def _mask_username(username: str) -> str:
    """Mask username for display, e.g. j***@example.com."""
    username = (username or "").strip()
    if not username:
        return "***"
    if "@" in username:
        local, domain = username.split("@", 1)
        if len(local) <= 1:
            masked_local = "*"
        else:
            masked_local = local[0] + "***"
        return f"{masked_local}@{domain}"
    if len(username) <= 2:
        return username[0] + "***"
    return username[0] + "***" + username[-1]


def _history_start_date(range_param: str) -> date | None:
    """Return start date for history filter based on range (SAST today as reference)."""
    today = get_sast_now().date()
    if range_param == "1m":
        return today - timedelta(days=30)
    if range_param == "3m":
        return today - timedelta(days=90)
    if range_param == "6m":
        return today - timedelta(days=180)
    if range_param == "1y":
        return today - timedelta(days=365)
    return None


def _sync_account_in_thread(account_id: int, source: str) -> dict:
    db = database.SessionLocal()
    try:
        return sync_account(db, account_id, source)
    finally:
        db.close()


def _connected_account_codes(db: Session, user_id: int) -> set[str]:
    rows = (
        db.query(models.SygniaAccount.account_code)
        .filter(models.SygniaAccount.user_id == user_id)
        .all()
    )
    return {row[0] for row in rows}


def _latest_portfolio_value(
    db: Session,
    account_id: int,
    as_of_date: Optional[date] = None,
) -> float:
    """Current portfolio value: last scrape as-of, else newest history row that is not in the future.

    Manual month-end snapshots are stored as the last day of the month, which can be after
    today's T−1 scrape. Prefer the scrape as-of date so the overview card matches holdings.
    """
    today = get_sast_now().date()
    if as_of_date is None:
        as_of_date = (
            db.query(models.SygniaAccount.as_of_date)
            .filter(models.SygniaAccount.id == account_id)
            .scalar()
        )
    if as_of_date is not None:
        synced = (
            db.query(models.SygniaValueHistory)
            .filter(
                models.SygniaValueHistory.account_id == account_id,
                models.SygniaValueHistory.record_date == as_of_date,
            )
            .first()
        )
        if synced:
            return round(synced.portfolio_value or 0, 2)

    latest = (
        db.query(models.SygniaValueHistory)
        .filter(
            models.SygniaValueHistory.account_id == account_id,
            models.SygniaValueHistory.record_date <= today,
        )
        .order_by(models.SygniaValueHistory.record_date.desc())
        .first()
    )
    return round(latest.portfolio_value or 0, 2) if latest else 0.0


def _get_user_account(
    db: Session,
    account_id: int,
    user_id: int,
    *,
    with_children: bool = False,
) -> models.SygniaAccount:
    query = db.query(models.SygniaAccount).filter(
        models.SygniaAccount.id == account_id,
        models.SygniaAccount.user_id == user_id,
    )
    if with_children:
        query = query.options(
            joinedload(models.SygniaAccount.holdings),
            joinedload(models.SygniaAccount.retirement_components),
            joinedload(models.SygniaAccount.beneficiaries),
            joinedload(models.SygniaAccount.debit_order).joinedload(
                models.SygniaDebitOrder.allocations
            ),
        )
    account = query.first()
    if account is None:
        raise HTTPException(status_code=404, detail="Sygnia account not found")
    return account


def _benefit_lines_list(text: str | None) -> list[str]:
    if not text:
        return []
    return [line for line in text.split("\n") if line]


def _serialize_account_summary(account: models.SygniaAccount, latest_value: float) -> dict:
    return {
        "id": account.id,
        "login_id": account.login_id,
        "name": account.name,
        "product_type": account.product_type,
        "account_code": account.account_code,
        "account_type_name": account.account_type_name,
        "account_type_code": account.account_type_code,
        "foreign_allocation": account.foreign_allocation,
        "reg28_compliant": account.reg28_compliant,
        "as_of_date": account.as_of_date.isoformat() if account.as_of_date else None,
        "last_synced_at": account.last_synced_at.isoformat() if account.last_synced_at else None,
        "last_sync_status": account.last_sync_status,
        "last_sync_error": account.last_sync_error,
        "latest_portfolio_value": latest_value,
    }


def _serialize_account_detail(account: models.SygniaAccount, latest_value: float) -> dict:
    payload = _serialize_account_summary(account, latest_value)
    payload["investment_summary"] = {
        "rows": [
            {
                "investment_code": h.investment_code,
                "investment_name": h.investment_name,
                "units": h.units,
                "unit_price": h.unit_price,
                "market_value": h.market_value,
                "percentage": h.percentage,
            }
            for h in account.holdings
        ],
        "total_market_value": account.holdings_total_market_value,
        "total_percentage": account.holdings_total_percentage,
    }
    payload["retirement_fund_components"] = {
        "components": [
            {
                "component": c.component,
                "market_value": c.market_value,
                "benefit_lines": _benefit_lines_list(c.benefit_lines),
            }
            for c in account.retirement_components
        ],
        "account_market_value": account.retirement_account_market_value,
    }
    payload["beneficiaries"] = [
        {
            "name": b.name,
            "relationship": b.beneficiary_relationship,
            "allocation": b.allocation,
        }
        for b in account.beneficiaries
    ]
    debit = account.debit_order
    if debit is None:
        payload["debit_order"] = None
    else:
        payload["debit_order"] = {
            "details": {
                "debit_order_amount": debit.debit_order_amount,
                "escalation_rate": debit.escalation_rate,
                "escalation_month": debit.escalation_month,
                "day_of_month": debit.day_of_month,
                "effective_date": debit.effective_date,
                "linked_bank": debit.linked_bank,
            },
            "allocations": [
                {
                    "investment_code": a.investment_code,
                    "investment_name": a.investment_name,
                    "allocation": a.allocation,
                }
                for a in debit.allocations
            ],
        }
    return payload


def _month_key(d: date) -> tuple[int, int]:
    return (d.year, d.month)


def _build_monthly_chart_data(
    snapshot_rows: list[models.SygniaValueHistory],
    contribution_rows: list[models.SygniaContribution],
) -> list[dict]:
    """Build month-to-month chart points (date = 1st of month)."""
    months: set[tuple[int, int]] = set()
    for row in snapshot_rows:
        months.add(_month_key(row.record_date))
    for row in contribution_rows:
        months.add(_month_key(row.contribution_date))

    if not months:
        return []

    snapshots_by_month: dict[tuple[int, int], models.SygniaValueHistory] = {}
    for row in snapshot_rows:
        key = _month_key(row.record_date)
        existing = snapshots_by_month.get(key)
        if existing is None or row.record_date > existing.record_date:
            snapshots_by_month[key] = row

    contributions_sorted = sorted(contribution_rows, key=lambda r: r.contribution_date)
    cumulative = 0.0
    contrib_idx = 0

    chart_data = []
    for year, month in sorted(months):
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        while (
            contrib_idx < len(contributions_sorted)
            and contributions_sorted[contrib_idx].contribution_date <= month_end
        ):
            cumulative += contributions_sorted[contrib_idx].amount or 0
            contrib_idx += 1

        snapshot = snapshots_by_month.get((year, month))
        portfolio_value = round(snapshot.portfolio_value or 0, 2) if snapshot else None
        chart_data.append(
            {
                "date": date(year, month, 1).isoformat(),
                "portfolio_value": portfolio_value,
                "cumulative_contributions": round(cumulative, 2),
            }
        )
    return chart_data


def _build_history_payload(
    db: Session,
    account: models.SygniaAccount,
    range_param: str,
) -> dict:
    start_date = _history_start_date(range_param)

    q_snapshots = (
        db.query(models.SygniaValueHistory)
        .filter(models.SygniaValueHistory.account_id == account.id)
        .order_by(models.SygniaValueHistory.record_date)
    )
    if start_date is not None:
        q_snapshots = q_snapshots.filter(models.SygniaValueHistory.record_date >= start_date)
    snapshot_rows = q_snapshots.all()

    value_snapshots = [
        {
            "id": r.id,
            "date": r.record_date.isoformat(),
            "portfolio_value": round(r.portfolio_value or 0, 2),
            "source": r.source,
        }
        for r in snapshot_rows
    ]

    q_contributions = (
        db.query(models.SygniaContribution)
        .filter(models.SygniaContribution.account_id == account.id)
        .order_by(models.SygniaContribution.contribution_date)
    )
    if start_date is not None:
        q_contributions = q_contributions.filter(
            models.SygniaContribution.contribution_date >= start_date
        )
    contribution_rows = q_contributions.all()

    contributions = [
        {
            "id": r.id,
            "date": r.contribution_date.isoformat(),
            "amount": round(r.amount or 0, 2),
        }
        for r in contribution_rows
    ]

    chart_data = _build_monthly_chart_data(snapshot_rows, contribution_rows)

    fy_start_year = get_sa_financial_year_start()
    fy_start_date = date(fy_start_year, 3, 1)
    fy_end_date = date(fy_start_year + 1, 2, 28)
    financial_year_label = format_sa_financial_year_label(fy_start_year)

    fy_contributions = (
        db.query(models.SygniaContribution)
        .filter(
            models.SygniaContribution.account_id == account.id,
            models.SygniaContribution.contribution_date >= fy_start_date,
            models.SygniaContribution.contribution_date <= fy_end_date,
        )
        .all()
    )
    contributions_current_fy = round(sum(c.amount or 0 for c in fy_contributions), 2)

    all_contributions = (
        db.query(models.SygniaContribution)
        .filter(models.SygniaContribution.account_id == account.id)
        .all()
    )
    total_contributions = round(sum(c.amount or 0 for c in all_contributions), 2)
    latest_portfolio_value = _latest_portfolio_value(db, account.id, account.as_of_date)
    growth = round(latest_portfolio_value - total_contributions, 2)

    return {
        "value_snapshots": value_snapshots,
        "contributions": contributions,
        "chart_data": chart_data,
        "contributions_current_fy": contributions_current_fy,
        "financial_year_label": financial_year_label,
        "total_contributions": total_contributions,
        "latest_portfolio_value": latest_portfolio_value,
        "growth": growth,
    }


def _latest_payslip_gross_monthly(db: Session, user_id: int) -> float:
    """Monthly gross from latest payslip (same logic as GET /salary)."""
    latest_payslip = (
        db.query(models.MonthlyPayslip)
        .filter(models.MonthlyPayslip.user_id == user_id)
        .order_by(models.MonthlyPayslip.year.desc(), models.MonthlyPayslip.month.desc())
        .options(
            selectinload(models.MonthlyPayslip.items),
            selectinload(models.MonthlyPayslip.additional_income),
        )
        .first()
    )
    if not latest_payslip:
        return 0.0

    company_contrib = sum(
        i.amount for i in latest_payslip.items if i.item_type == "company_contribution"
    )
    additional_income = sum(i.amount for i in (latest_payslip.additional_income or []))
    return round(latest_payslip.gross_salary + company_contrib + additional_income, 2)


def _build_ra_summary_payload(db: Session, user_id: int) -> dict:
    fy_start_year = get_sa_financial_year_start()
    fy_start_date = date(fy_start_year, 3, 1)
    fy_end_date = date(fy_start_year + 1, 2, 28)
    financial_year_label = format_sa_financial_year_label(fy_start_year)

    ra_accounts = (
        db.query(models.SygniaAccount)
        .filter(
            models.SygniaAccount.user_id == user_id,
            models.SygniaAccount.product_type == "ra",
        )
        .options(joinedload(models.SygniaAccount.debit_order))
        .order_by(models.SygniaAccount.name)
        .all()
    )

    account_ids = [account.id for account in ra_accounts]
    fy_contrib_by_account: dict[int, float] = {account_id: 0.0 for account_id in account_ids}
    if account_ids:
        contribution_rows = (
            db.query(models.SygniaContribution)
            .filter(
                models.SygniaContribution.account_id.in_(account_ids),
                models.SygniaContribution.contribution_date >= fy_start_date,
                models.SygniaContribution.contribution_date <= fy_end_date,
            )
            .all()
        )
        for row in contribution_rows:
            fy_contrib_by_account[row.account_id] = fy_contrib_by_account.get(row.account_id, 0) + (
                row.amount or 0
            )

    accounts_payload: list[dict] = []
    total_value = 0.0
    contributions_current_fy_total = 0.0

    for account in ra_accounts:
        latest_value = _latest_portfolio_value(db, account.id, account.as_of_date)
        account_fy = round(fy_contrib_by_account.get(account.id, 0), 2)
        contributions_current_fy_total += account_fy
        total_value += latest_value

        suggested_monthly: float | None = None
        debit = account.debit_order
        if debit and debit.debit_order_amount:
            suggested_monthly = parse_zar_amount(debit.debit_order_amount)

        accounts_payload.append(
            {
                "id": account.id,
                "name": account.name,
                "latest_portfolio_value": latest_value,
                "contributions_current_fy": account_fy,
                "suggested_monthly_from_debit_order": suggested_monthly,
            }
        )

    contributions_current_fy_total = round(contributions_current_fy_total, 2)
    total_value = round(total_value, 2)

    gross = _latest_payslip_gross_monthly(db, user_id)
    ra_max_deduction: float | None = None
    remaining_room: float | None = None
    if gross > 0:
        tax_config = get_tax_config(fy_start_year)
        ra_max_deduction = round(min(gross * 12 * 0.275, tax_config["ra_max_deduction"]), 2)
        remaining_room = remaining_ra_room(ra_max_deduction, contributions_current_fy_total)

    return {
        "accounts": accounts_payload,
        "total_value": total_value,
        "contributions_current_fy": contributions_current_fy_total,
        "ra_max_deduction": ra_max_deduction,
        "remaining_room": remaining_room,
        "financial_year_label": financial_year_label,
        "financial_year_start": fy_start_year,
    }


# ---------------------------------------------------------------------------
# RA summary
# ---------------------------------------------------------------------------


@router.get("/ra-summary")
async def get_ra_summary(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Aggregate RA accounts, FY contributions, and remaining deduction room."""
    return _build_ra_summary_payload(db, current_user.id)


# ---------------------------------------------------------------------------
# Sygnia login routes
# ---------------------------------------------------------------------------


@router.post("/sygnia/logins/test", response_model=SygniaTestLoginResponse)
async def sygnia_test_login(
    body: SygniaTestLoginRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Test Sygnia credentials and list portal accounts (not persisted)."""
    logger.info("Sygnia test-login requested by user_id=%s", current_user.id)

    result = await asyncio.to_thread(
        test_login_and_list_accounts,
        body.username,
        body.password,
    )

    connected = _connected_account_codes(db, current_user.id)
    accounts = [
        a
        for a in (result.get("accounts") or [])
        if (a.get("accountCode") or "") not in connected
    ]

    return SygniaTestLoginResponse(
        ok=bool(result.get("ok")),
        message=str(result.get("message") or ""),
        accounts=accounts,
    )


@router.post("/sygnia/logins/{login_id}/test", response_model=SygniaTestLoginResponse)
async def sygnia_test_saved_login(
    login_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List portal accounts using saved Sygnia credentials (not persisted)."""
    login = (
        db.query(models.SygniaLogin)
        .filter(
            models.SygniaLogin.id == login_id,
            models.SygniaLogin.user_id == current_user.id,
        )
        .first()
    )
    if login is None:
        raise HTTPException(status_code=404, detail="Sygnia login not found.")

    username = decrypt_api_key(login.username_encrypted)
    password = decrypt_api_key(login.password_encrypted)
    logger.info("Sygnia saved-login test requested by user_id=%s login_id=%s", current_user.id, login_id)

    result = await asyncio.to_thread(
        test_login_and_list_accounts,
        username,
        password,
    )

    connected = _connected_account_codes(db, current_user.id)
    accounts = [
        a
        for a in (result.get("accounts") or [])
        if (a.get("accountCode") or "") not in connected
    ]

    return SygniaTestLoginResponse(
        ok=bool(result.get("ok")),
        message=str(result.get("message") or ""),
        accounts=accounts,
    )


@router.get("/sygnia/logins", response_model=list[SygniaLoginSummary])
async def list_sygnia_logins(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List saved Sygnia logins (masked username only)."""
    logins = (
        db.query(models.SygniaLogin)
        .filter(models.SygniaLogin.user_id == current_user.id)
        .order_by(models.SygniaLogin.created_at.desc())
        .all()
    )
    return [
        SygniaLoginSummary(
            id=login.id,
            username_masked=_mask_username(decrypt_api_key(login.username_encrypted)),
        )
        for login in logins
    ]


# ---------------------------------------------------------------------------
# Sygnia account routes
# ---------------------------------------------------------------------------


@router.post("/sygnia/accounts")
async def create_sygnia_account(
    body: CreateSygniaAccountRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Connect a Sygnia account and run the initial sync."""
    account_code = body.account_code.strip()
    if not account_code:
        raise HTTPException(status_code=400, detail="account_code is required.")

    from ..services.account_product import is_valid_product_type

    if not is_valid_product_type(body.product_type):
        raise HTTPException(status_code=400, detail="Invalid product_type.")

    existing = (
        db.query(models.SygniaAccount)
        .filter(
            models.SygniaAccount.user_id == current_user.id,
            models.SygniaAccount.account_code == account_code,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Account {account_code} is already connected.",
        )

    if body.login_id is not None:
        login = (
            db.query(models.SygniaLogin)
            .filter(
                models.SygniaLogin.id == body.login_id,
                models.SygniaLogin.user_id == current_user.id,
            )
            .first()
        )
        if login is None:
            raise HTTPException(status_code=404, detail="Sygnia login not found.")
    else:
        username = (body.username or "").strip()
        password = body.password or ""
        # Reuse an existing login for this user when the portal username matches
        # (usernames are encrypted, so compare after decrypt).
        login = None
        existing_logins = (
            db.query(models.SygniaLogin)
            .filter(models.SygniaLogin.user_id == current_user.id)
            .all()
        )
        for candidate in existing_logins:
            try:
                stored_username = decrypt_api_key(candidate.username_encrypted)
            except Exception:  # noqa: BLE001
                continue
            if stored_username.strip().lower() == username.lower():
                login = candidate
                login.password_encrypted = encrypt_api_key(password)
                break
        if login is None:
            login = models.SygniaLogin(
                user_id=current_user.id,
                username_encrypted=encrypt_api_key(username),
                password_encrypted=encrypt_api_key(password),
            )
            db.add(login)
        db.flush()

    account = models.SygniaAccount(
        user_id=current_user.id,
        login_id=login.id,
        account_code=account_code,
        name=body.name.strip(),
        product_type=body.product_type,
        last_sync_status="pending",
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    logger.info(
        "Sygnia account created user_id=%s account_id=%s code=%s",
        current_user.id,
        account.id,
        account_code,
    )

    sync_result = await asyncio.to_thread(_sync_account_in_thread, account.id, "connect")

    db.refresh(account)
    if not sync_result.get("ok"):
        logger.warning(
            "Sygnia initial sync failed account_id=%s: %s",
            account.id,
            sync_result.get("message"),
        )

    account = _get_user_account(db, account.id, current_user.id, with_children=True)
    latest_value = _latest_portfolio_value(db, account.id, account.as_of_date)
    detail = _serialize_account_detail(account, latest_value)
    detail["initial_sync"] = {
        "ok": bool(sync_result.get("ok")),
        "message": str(sync_result.get("message") or ""),
    }
    return detail


@router.get("/sygnia/accounts")
async def list_sygnia_accounts(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List connected Sygnia accounts (card summary fields)."""
    accounts = (
        db.query(models.SygniaAccount)
        .filter(models.SygniaAccount.user_id == current_user.id)
        .order_by(models.SygniaAccount.created_at.desc())
        .all()
    )
    return [
        _serialize_account_summary(
            account, _latest_portfolio_value(db, account.id, account.as_of_date)
        )
        for account in accounts
    ]


@router.patch("/sygnia/accounts/{account_id}")
async def update_sygnia_account(
    account_id: int,
    body: UpdateSygniaAccountRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update Sygnia account name and/or product type."""
    from ..services.account_product import is_valid_product_type

    account = _get_user_account(db, account_id, current_user.id)
    if body.name is not None:
        account.name = body.name.strip()
    if body.product_type is not None:
        if not is_valid_product_type(body.product_type):
            raise HTTPException(status_code=400, detail="Invalid product_type.")
        account.product_type = body.product_type
    db.commit()
    db.refresh(account)
    latest_value = _latest_portfolio_value(db, account.id, account.as_of_date)
    return _serialize_account_summary(account, latest_value)


@router.get("/sygnia/product-type-suggestion")
async def sygnia_product_type_suggestion(
    account_type_name: Optional[str] = None,
    account_type_code: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
):
    from ..services.account_product import PRODUCT_TYPE_LABELS, suggest_product_type

    product_type = suggest_product_type(account_type_name, account_type_code)
    if product_type is None:
        return {"product_type": None, "label": None}
    return {"product_type": product_type, "label": PRODUCT_TYPE_LABELS[product_type]}


@router.get("/sygnia/accounts/{account_id}")
async def get_sygnia_account(
    account_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Sygnia account detail with current-state children and latest value."""
    account = _get_user_account(db, account_id, current_user.id, with_children=True)
    latest_value = _latest_portfolio_value(db, account.id, account.as_of_date)
    return _serialize_account_detail(account, latest_value)


@router.post("/sygnia/accounts/{account_id}/sync")
async def sync_sygnia_account(
    account_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Trigger an on-demand Playwright sync (for testing and catch-up)."""
    account = _get_user_account(db, account_id, current_user.id)
    logger.info(
        "Sygnia manual sync requested user_id=%s account_id=%s code=%s",
        current_user.id,
        account.id,
        account.account_code,
    )
    sync_result = await asyncio.to_thread(_sync_account_in_thread, account.id, "manual")
    db.refresh(account)
    logger.info(
        "Sygnia manual sync finished account_id=%s ok=%s message=%s",
        account.id,
        sync_result.get("ok"),
        sync_result.get("message"),
    )
    account = _get_user_account(db, account.id, current_user.id, with_children=True)
    latest_value = _latest_portfolio_value(db, account.id, account.as_of_date)
    detail = _serialize_account_detail(account, latest_value)
    detail["sync"] = {
        "ok": bool(sync_result.get("ok")),
        "message": str(sync_result.get("message") or ""),
    }
    return detail


@router.delete("/sygnia/accounts/{account_id}")
async def delete_sygnia_account(
    account_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete a connected Sygnia account and cascaded history/state."""
    account = _get_user_account(db, account_id, current_user.id)
    db.delete(account)
    db.commit()
    logger.info(
        "Sygnia account deleted user_id=%s account_id=%s",
        current_user.id,
        account_id,
    )
    return {"status": "success"}


# ---------------------------------------------------------------------------
# History, snapshots, contributions
# ---------------------------------------------------------------------------


@router.get("/sygnia/accounts/{account_id}/history")
async def get_sygnia_account_history(
    account_id: int,
    range_param: str = Query("all", alias="range"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Portfolio history, contributions, monthly chart, and FY totals."""
    range_param = range_param if range_param in ("1m", "3m", "6m", "1y", "all") else "all"
    account = _get_user_account(db, account_id, current_user.id)
    return _build_history_payload(db, account, range_param)


@router.post("/sygnia/accounts/{account_id}/snapshots")
async def create_sygnia_snapshot(
    account_id: int,
    body: SygniaSnapshotData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Upsert a manual portfolio value for the given month (stored as month-end)."""
    _get_user_account(db, account_id, current_user.id)
    try:
        record_date = _parse_month_to_last_day(body.month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    portfolio_value = body.portfolio_value if body.portfolio_value is not None else 0
    if portfolio_value < 0:
        raise HTTPException(status_code=400, detail="portfolio_value must be non-negative")

    existing = (
        db.query(models.SygniaValueHistory)
        .filter(
            models.SygniaValueHistory.account_id == account_id,
            models.SygniaValueHistory.record_date == record_date,
        )
        .first()
    )
    if existing:
        existing.portfolio_value = portfolio_value
        existing.source = "manual"
    else:
        db.add(
            models.SygniaValueHistory(
                account_id=account_id,
                record_date=record_date,
                portfolio_value=portfolio_value,
                source="manual",
            )
        )
    db.commit()
    return {"status": "success"}


@router.put("/sygnia/accounts/{account_id}/snapshots/{snapshot_id}")
async def update_sygnia_snapshot(
    account_id: int,
    snapshot_id: int,
    body: SygniaSnapshotData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update a manual portfolio value snapshot."""
    _get_user_account(db, account_id, current_user.id)
    row = (
        db.query(models.SygniaValueHistory)
        .filter(
            models.SygniaValueHistory.id == snapshot_id,
            models.SygniaValueHistory.account_id == account_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    try:
        record_date = _parse_month_to_last_day(body.month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    portfolio_value = body.portfolio_value if body.portfolio_value is not None else 0
    if portfolio_value < 0:
        raise HTTPException(status_code=400, detail="portfolio_value must be non-negative")

    row.record_date = record_date
    row.portfolio_value = portfolio_value
    row.source = "manual"
    db.commit()
    return {"status": "success"}


@router.delete("/sygnia/accounts/{account_id}/snapshots/{snapshot_id}")
async def delete_sygnia_snapshot(
    account_id: int,
    snapshot_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete a portfolio value snapshot."""
    _get_user_account(db, account_id, current_user.id)
    row = (
        db.query(models.SygniaValueHistory)
        .filter(
            models.SygniaValueHistory.id == snapshot_id,
            models.SygniaValueHistory.account_id == account_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(row)
    db.commit()
    return {"status": "success"}


@router.post("/sygnia/accounts/{account_id}/contributions")
async def create_sygnia_contribution(
    account_id: int,
    body: SygniaContributionData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Create a manual deposit/contribution (stored on the 1st of the month)."""
    _get_user_account(db, account_id, current_user.id)
    try:
        contribution_date = _parse_month_to_date(body.month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    amount = body.amount if body.amount is not None else 0
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount must be non-negative")

    duplicate = (
        db.query(models.SygniaContribution)
        .filter(
            models.SygniaContribution.account_id == account_id,
            models.SygniaContribution.contribution_date == contribution_date,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"A contribution already exists for {body.month}. Edit it instead.",
        )

    row = models.SygniaContribution(
        account_id=account_id,
        contribution_date=contribution_date,
        amount=amount,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": row.id}


@router.put("/sygnia/accounts/{account_id}/contributions/{contribution_id}")
async def update_sygnia_contribution(
    account_id: int,
    contribution_id: int,
    body: SygniaContributionData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update a manual deposit/contribution."""
    _get_user_account(db, account_id, current_user.id)
    row = (
        db.query(models.SygniaContribution)
        .filter(
            models.SygniaContribution.id == contribution_id,
            models.SygniaContribution.account_id == account_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Contribution not found")
    try:
        contribution_date = _parse_month_to_date(body.month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    amount = body.amount if body.amount is not None else 0
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount must be non-negative")

    row.contribution_date = contribution_date
    row.amount = amount
    db.commit()
    return {"status": "success"}


@router.delete("/sygnia/accounts/{account_id}/contributions/{contribution_id}")
async def delete_sygnia_contribution(
    account_id: int,
    contribution_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete a manual deposit/contribution."""
    _get_user_account(db, account_id, current_user.id)
    row = (
        db.query(models.SygniaContribution)
        .filter(
            models.SygniaContribution.id == contribution_id,
            models.SygniaContribution.account_id == account_id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Contribution not found")
    db.delete(row)
    db.commit()
    return {"status": "success"}
