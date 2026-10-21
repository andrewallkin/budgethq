"""External (Grok bot) manual bank account endpoints.

Read-only GETs work with read-only keys; create/update require the
full-access key. Router pattern mirrors routers/external_budget.py.

Deliberately excludes DELETE — external consumers must not be able to
remove the user's manual accounts.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, database, models

router = APIRouter(prefix="/external/manual-accounts", tags=["external"])


def _serialize(account: models.ManualBankAccount) -> dict:
    return {
        "id": account.id,
        "name": account.name,
        "balance": account.balance or 0,
        "is_emergency_savings": account.is_emergency_savings or False,
        "created_at": account.created_at.isoformat() + "Z" if account.created_at else None,
        "updated_at": account.updated_at.isoformat() + "Z" if account.updated_at else None,
    }


class ExternalManualAccountCreate(BaseModel):
    name: str
    balance: float = 0
    is_emergency_savings: bool = False


class ExternalManualAccountUpdate(BaseModel):
    balance: float


@router.get("")
async def list_external_manual_accounts(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    """List all manual bank accounts for the key's owner."""
    accounts = (
        db.query(models.ManualBankAccount)
        .filter(models.ManualBankAccount.user_id == current_user.id)
        .all()
    )
    return {"count": len(accounts), "accounts": [_serialize(a) for a in accounts]}


@router.get("/{account_id}")
async def get_external_manual_account(
    account_id: int,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    """Get a single manual bank account by id."""
    account = (
        db.query(models.ManualBankAccount)
        .filter(
            models.ManualBankAccount.id == account_id,
            models.ManualBankAccount.user_id == current_user.id,
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return _serialize(account)


@router.post("")
async def create_external_manual_account(
    data: ExternalManualAccountCreate,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    """Create a new manual bank account."""
    account = models.ManualBankAccount(
        user_id=current_user.id,
        name=data.name,
        balance=data.balance,
        is_emergency_savings=data.is_emergency_savings,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _serialize(account)


@router.patch("/{account_id}")
async def update_external_manual_account(
    account_id: int,
    data: ExternalManualAccountUpdate,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    """Update a manual bank account's balance."""
    account = (
        db.query(models.ManualBankAccount)
        .filter(
            models.ManualBankAccount.id == account_id,
            models.ManualBankAccount.user_id == current_user.id,
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    account.balance = data.balance

    db.commit()
    db.refresh(account)
    return _serialize(account)
