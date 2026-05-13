"""Manual bank accounts - balance-only tracking, no transaction sync."""

import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from .. import models, database, auth

logger = logging.getLogger(__name__)


class ManualAccountCreate(BaseModel):
    name: str
    balance: float = 0
    is_emergency_savings: bool = False


class ManualAccountUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[float] = None
    is_emergency_savings: Optional[bool] = None


router = APIRouter(prefix="/manual-accounts", tags=["manual-accounts"])


@router.get("")
async def list_manual_accounts(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List all manual bank accounts for the current user."""
    accounts = (
        db.query(models.ManualBankAccount)
        .filter(models.ManualBankAccount.user_id == current_user.id)
        .all()
    )
    return [
        {
            "id": a.id,
            "name": a.name,
            "balance": a.balance or 0,
            "is_emergency_savings": a.is_emergency_savings or False,
            "created_at": a.created_at.isoformat() + "Z" if a.created_at else None,
            "updated_at": a.updated_at.isoformat() + "Z" if a.updated_at else None,
        }
        for a in accounts
    ]


@router.post("")
async def create_manual_account(
    data: ManualAccountCreate,
    current_user: models.User = Depends(auth.get_current_user),
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
    logger.info(
        "Manual account created",
        extra={
            "user_id": current_user.id,
            "account_id": account.id,
            "account_name": data.name,
        },
    )
    return {
        "id": account.id,
        "name": account.name,
        "balance": account.balance or 0,
        "is_emergency_savings": account.is_emergency_savings or False,
        "created_at": account.created_at.isoformat() + "Z" if account.created_at else None,
        "updated_at": account.updated_at.isoformat() + "Z" if account.updated_at else None,
    }


@router.patch("/{account_id}")
async def update_manual_account(
    account_id: int,
    data: ManualAccountUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update a manual bank account (balance, name, or emergency savings flag)."""
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

    if data.name is not None:
        account.name = data.name
    if data.balance is not None:
        account.balance = data.balance
    if data.is_emergency_savings is not None:
        account.is_emergency_savings = data.is_emergency_savings

    db.commit()
    db.refresh(account)
    logger.info(
        "Manual account updated",
        extra={"user_id": current_user.id, "account_id": account_id},
    )
    return {
        "id": account.id,
        "name": account.name,
        "balance": account.balance or 0,
        "is_emergency_savings": account.is_emergency_savings or False,
        "created_at": account.created_at.isoformat() + "Z" if account.created_at else None,
        "updated_at": account.updated_at.isoformat() + "Z" if account.updated_at else None,
    }


@router.delete("/{account_id}")
async def delete_manual_account(
    account_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete a manual bank account."""
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

    db.delete(account)
    db.commit()
    logger.info(
        "Manual account deleted",
        extra={"user_id": current_user.id, "account_id": account_id},
    )
    return {"status": "success"}
