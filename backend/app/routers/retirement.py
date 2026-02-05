from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from .. import models, database, auth
from ..utils import get_sast_now, get_sa_financial_year_start, format_sa_financial_year_label

# RetirementAnnuity Pydantic Models
class RetirementAnnuityData(BaseModel):
    monthly_contribution: Optional[float] = 0


class RASnapshotData(BaseModel):
    month: str  # YYYY-MM
    portfolio_value: float


class RAContributionData(BaseModel):
    month: str  # YYYY-MM
    amount: float


def _parse_month_to_date(month_str: str):
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


router = APIRouter(prefix="/ra", tags=["retirement-annuity"])

@router.get("/default_user")
async def get_retirement_annuity(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    ra = db.query(models.RetirementAnnuity).filter(
        models.RetirementAnnuity.user_id == current_user.id
    ).first()

    # Latest portfolio value from RAValueHistory (canonical RA \"current value\")
    latest_snapshot = (
        db.query(models.RAValueHistory)
        .filter(models.RAValueHistory.user_id == current_user.id)
        .order_by(models.RAValueHistory.record_date.desc())
        .first()
    )
    latest_portfolio_value = round(latest_snapshot.portfolio_value or 0, 2) if latest_snapshot else 0.0

    if not ra:
        return {
            # Kept for backwards compatibility; now sourced from RAValueHistory
            "current_value": latest_portfolio_value,
            "monthly_contribution": 0,
            "latest_portfolio_value": latest_portfolio_value,
        }

    monthly_contribution = ra.monthly_contribution or 0
    return {
        # Kept for backwards compatibility; now sourced from RAValueHistory
        "current_value": latest_portfolio_value,
        "monthly_contribution": monthly_contribution,
        "latest_portfolio_value": latest_portfolio_value,
    }

@router.post("/default_user")
async def save_retirement_annuity(
    data: RetirementAnnuityData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    ra = db.query(models.RetirementAnnuity).filter(
        models.RetirementAnnuity.user_id == current_user.id
    ).first()

    if not ra:
        ra = models.RetirementAnnuity(user_id=current_user.id)
        db.add(ra)

    # Only monthly contribution is persisted here; portfolio value comes from RAValueHistory
    ra.monthly_contribution = data.monthly_contribution or 0

    db.commit()
    return {"status": "success"}


def _ra_history_start_date(range_param: str):
    """Return start date for RA history filter based on range (SAST today as reference)."""
    today = get_sast_now().date()
    if range_param == "1m":
        return today - timedelta(days=30)
    if range_param == "3m":
        return today - timedelta(days=90)
    if range_param == "6m":
        return today - timedelta(days=180)
    if range_param == "1y":
        return today - timedelta(days=365)
    return None  # "all" = no start filter


@router.get("/history")
async def get_ra_history(
    range_param: str = Query("all", alias="range"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Get RA value snapshots and contributions for the current user.
    range: 1m, 3m, 6m, 1y, all (default all).
    Returns value_snapshots, contributions, chart_data, contributions_current_fy, financial_year_label.
    """
    range_param = range_param if range_param in ("1m", "3m", "6m", "1y", "all") else "all"
    start_date = _ra_history_start_date(range_param)

    q_snapshots = (
        db.query(models.RAValueHistory)
        .filter(models.RAValueHistory.user_id == current_user.id)
        .order_by(models.RAValueHistory.record_date)
    )
    if start_date is not None:
        q_snapshots = q_snapshots.filter(models.RAValueHistory.record_date >= start_date)
    snapshot_rows = q_snapshots.all()

    value_snapshots = [
        {"id": r.id, "date": r.record_date.isoformat(), "portfolio_value": round(r.portfolio_value or 0, 2)}
        for r in snapshot_rows
    ]

    q_contributions = (
        db.query(models.RAContribution)
        .filter(models.RAContribution.user_id == current_user.id)
        .order_by(models.RAContribution.contribution_date)
    )
    if start_date is not None:
        q_contributions = q_contributions.filter(models.RAContribution.contribution_date >= start_date)
    contribution_rows = q_contributions.all()

    contributions = [
        {"id": r.id, "date": r.contribution_date.isoformat(), "amount": round(r.amount or 0, 2)}
        for r in contribution_rows
    ]

    # Chart data: union of snapshot and contribution dates in range, sorted
    all_dates = set()
    for r in snapshot_rows:
        all_dates.add(r.record_date)
    for r in contribution_rows:
        all_dates.add(r.contribution_date)
    sorted_dates = sorted(all_dates)

    # For each date: portfolio_value = last snapshot with record_date <= date; cumulative_contributions = sum(amount where contribution_date <= date)
    snapshot_rows_sorted = sorted(snapshot_rows, key=lambda r: r.record_date)
    contributions_by_date = {}
    for r in contribution_rows:
        d = r.contribution_date
        contributions_by_date[d] = contributions_by_date.get(d, 0) + (r.amount or 0)

    last_value = None
    snapshot_idx = 0
    cumulative = 0.0
    chart_data = []
    for d in sorted_dates:
        while snapshot_idx < len(snapshot_rows_sorted) and snapshot_rows_sorted[snapshot_idx].record_date <= d:
            last_value = snapshot_rows_sorted[snapshot_idx].portfolio_value or 0
            snapshot_idx += 1
        cumulative += contributions_by_date.get(d, 0)
        chart_data.append({
            "date": d.isoformat(),
            "portfolio_value": round(last_value, 2) if last_value is not None else None,
            "cumulative_contributions": round(cumulative, 2),
        })

    # FY summary: sum of RAContribution.amount where contribution_date in current FY (Mar - end Feb)
    fy_start_year = get_sa_financial_year_start()
    fy_start_date = date(fy_start_year, 3, 1)
    fy_end_date = date(fy_start_year + 1, 2, 28)  # last day of Feb
    financial_year_label = format_sa_financial_year_label(fy_start_year)

    fy_contributions = (
        db.query(models.RAContribution)
        .filter(
            models.RAContribution.user_id == current_user.id,
            models.RAContribution.contribution_date >= fy_start_date,
            models.RAContribution.contribution_date <= fy_end_date,
        )
        .all()
    )
    contributions_current_fy = round(sum(c.amount or 0 for c in fy_contributions), 2)

    # Total contributions and latest portfolio value (all time, for overview) — unfiltered by range
    all_contributions = (
        db.query(models.RAContribution)
        .filter(models.RAContribution.user_id == current_user.id)
        .all()
    )
    total_contributions = round(sum(c.amount or 0 for c in all_contributions), 2)
    latest_snapshot = (
        db.query(models.RAValueHistory)
        .filter(models.RAValueHistory.user_id == current_user.id)
        .order_by(models.RAValueHistory.record_date.desc())
        .first()
    )
    latest_portfolio_value = round(latest_snapshot.portfolio_value or 0, 2) if latest_snapshot else 0.0

    return {
        "value_snapshots": value_snapshots,
        "contributions": contributions,
        "chart_data": chart_data,
        "contributions_current_fy": contributions_current_fy,
        "financial_year_label": financial_year_label,
        "total_contributions": total_contributions,
        "latest_portfolio_value": latest_portfolio_value,
    }


@router.post("/snapshot")
async def save_ra_snapshot(
    body: RASnapshotData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Upsert one RA value snapshot for the given month."""
    try:
        record_date = _parse_month_to_date(body.month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    portfolio_value = body.portfolio_value if body.portfolio_value is not None else 0
    if portfolio_value < 0:
        raise HTTPException(status_code=400, detail="portfolio_value must be non-negative")

    existing = (
        db.query(models.RAValueHistory)
        .filter(
            models.RAValueHistory.user_id == current_user.id,
            models.RAValueHistory.record_date == record_date,
        )
        .first()
    )
    if existing:
        existing.portfolio_value = portfolio_value
    else:
        row = models.RAValueHistory(
            user_id=current_user.id,
            record_date=record_date,
            portfolio_value=portfolio_value,
        )
        db.add(row)

    db.commit()
    return {"status": "success"}


@router.put("/snapshot/{snapshot_id}")
async def update_ra_snapshot(
    snapshot_id: int,
    body: RASnapshotData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update an existing RA value snapshot (user-scoped)."""
    row = (
        db.query(models.RAValueHistory)
        .filter(
            models.RAValueHistory.id == snapshot_id,
            models.RAValueHistory.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    try:
        record_date = _parse_month_to_date(body.month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    portfolio_value = body.portfolio_value if body.portfolio_value is not None else 0
    if portfolio_value < 0:
        raise HTTPException(status_code=400, detail="portfolio_value must be non-negative")
    row.record_date = record_date
    row.portfolio_value = portfolio_value
    db.commit()
    return {"status": "success"}


@router.delete("/snapshot/{snapshot_id}")
async def delete_ra_snapshot(
    snapshot_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete an RA value snapshot (user-scoped)."""
    row = (
        db.query(models.RAValueHistory)
        .filter(
            models.RAValueHistory.id == snapshot_id,
            models.RAValueHistory.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(row)
    db.commit()
    return {"status": "success"}


@router.post("/contributions")
async def create_ra_contribution(
    body: RAContributionData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Create a new RA contribution."""
    try:
        contribution_date = _parse_month_to_date(body.month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    amount = body.amount if body.amount is not None else 0
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount must be non-negative")
    row = models.RAContribution(
        user_id=current_user.id,
        contribution_date=contribution_date,
        amount=amount,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": row.id}


@router.put("/contributions/{contribution_id}")
async def update_ra_contribution(
    contribution_id: int,
    body: RAContributionData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update an RA contribution (user-scoped)."""
    row = (
        db.query(models.RAContribution)
        .filter(
            models.RAContribution.id == contribution_id,
            models.RAContribution.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Contribution not found")
    try:
        contribution_date = _parse_month_to_date(body.month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    amount = body.amount if body.amount is not None else 0
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount must be non-negative")
    row.contribution_date = contribution_date
    row.amount = amount
    db.commit()
    return {"status": "success"}


@router.delete("/contributions/{contribution_id}")
async def delete_ra_contribution(
    contribution_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete an RA contribution (user-scoped)."""
    row = (
        db.query(models.RAContribution)
        .filter(
            models.RAContribution.id == contribution_id,
            models.RAContribution.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Contribution not found")
    db.delete(row)
    db.commit()
    return {"status": "success"}
