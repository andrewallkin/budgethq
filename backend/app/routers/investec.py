"""
Investec API Router

Handles all Investec integration endpoints:
- Credential management
- Account management
- Transaction management
- Categorization rules
"""

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from .. import models, auth
from ..database import get_db
from ..utils import encrypt_api_key, decrypt_api_key, get_sast_now
from ..investec_service import InvestecService
from ..transaction_categorizer import TransactionCategorizer
from ..investec_sync import _sync_user_accounts, _sync_account_transactions
from ..logging_utils import redact_description
from ..transaction_budget_summary import build_budget_comparison
from ..transaction_pdf import ExportTransactionRow, build_transactions_pdf
from ..transaction_query import (
    account_display_name,
    build_transactions_query,
    get_user_accounts_for_export,
    parse_date_param,
)

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/investec", tags=["investec"])


# =====================================================
# Request/Response Models
# =====================================================

class InvestecCredentials(BaseModel):
    client_id: str
    client_secret: str
    api_key: str


class CredentialsStatus(BaseModel):
    is_connected: bool
    last_synced: Optional[datetime] = None


class HistoricalSyncRequest(BaseModel):
    months: int = Field(..., ge=1, le=12, description="Number of months to sync (1-12)")


class AccountResponse(BaseModel):
    id: int
    investec_account_id: str
    account_number: str
    account_name: str
    reference_name: Optional[str]
    product_name: str
    current_balance: Optional[float]
    available_balance: Optional[float]
    currency: str
    is_primary: bool
    is_active: bool
    is_emergency_fund_account: bool
    last_synced: Optional[datetime]
    balance_updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class AccountUpdate(BaseModel):
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None
    reference_name: Optional[str] = None


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    transaction_type: str
    transaction_category: Optional[str]
    status: str
    description: str
    amount: float
    transaction_date: datetime
    category: Optional[str]
    ai_category_confidence: Optional[float]
    user_corrected: bool

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    category: Optional[str] = Field(None, description="One of: salary, side_income, investment_income, refund, other_income, groceries_household, bills, subscriptions, transport, lifestyle_misc, savings, loan_repayment, transfers, or empty string for uncategorized")


class CategorizationRuleCreate(BaseModel):
    pattern: str
    category: str = Field(..., description="One of: salary, side_income, investment_income, refund, other_income, groceries_household, bills, subscriptions, transport, lifestyle_misc, savings, loan_repayment, transfers")
    priority: int = Field(default=10, ge=0, le=100)


class CategorizationRuleUpdate(BaseModel):
    pattern: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[int] = Field(None, ge=0, le=100)
    is_active: Optional[bool] = None


class CategorizationRuleResponse(BaseModel):
    id: int
    pattern: str
    category: str
    priority: int
    is_active: bool
    usage_count: int
    created_from_correction: bool

    class Config:
        from_attributes = True


class ApplyRulesRequest(BaseModel):
    """Optional body for apply-to-existing to accept conflict resolutions."""
    accepted_conflict_ids: Optional[List[int]] = None


class ConflictPreviewItem(BaseModel):
    """A transaction that would receive a different category from a rule."""
    id: int
    description: str
    amount: float
    transaction_date: datetime
    current_category: Optional[str]
    proposed_category: str
    rule_id: int
    rule_pattern: str


# =====================================================
# Credential Management
# =====================================================

@router.post("/credentials", status_code=status.HTTP_201_CREATED)
async def store_credentials(
    credentials: InvestecCredentials,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Store encrypted Investec API credentials for user.

    Tests connection before storing.
    """
    # Test connection with provided credentials
    investec = InvestecService(
        credentials.client_id,
        credentials.client_secret,
        credentials.api_key
    )

    if not investec.test_connection():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Investec credentials - connection test failed"
        )

    # Encrypt and store credentials
    current_user.investec_client_id = encrypt_api_key(credentials.client_id)
    current_user.investec_client_secret = encrypt_api_key(credentials.client_secret)
    current_user.investec_api_key = encrypt_api_key(credentials.api_key)
    current_user.has_investec_account = True

    db.commit()

    # Trigger immediate account sync
    try:
        _sync_user_accounts(db, current_user)
    except Exception as e:
        logger.exception("Account sync after credential storage failed: %s: %s", type(e).__name__, e)

    # Trigger immediate transaction sync for all newly created accounts
    try:
        from ..investec_sync import sync_investec_transactions
        sync_investec_transactions(db, user_id=current_user.id)
    except Exception as e:
        logger.exception("Transaction sync after credential storage failed: %s: %s", type(e).__name__, e)

    return {"message": "Credentials stored successfully"}


@router.get("/credentials/status", response_model=CredentialsStatus)
async def get_credentials_status(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user has stored Investec credentials."""
    has_creds = all([
        current_user.investec_client_id,
        current_user.investec_client_secret,
        current_user.investec_api_key
    ])

    # Get last sync time from most recent account sync
    last_synced = None
    if has_creds:
        last_account = db.query(models.InvestecAccount).filter(
            models.InvestecAccount.user_id == current_user.id
        ).order_by(models.InvestecAccount.last_synced.desc()).first()

        if last_account and last_account.last_synced:
            last_synced = last_account.last_synced

    return CredentialsStatus(
        is_connected=has_creds,
        last_synced=last_synced
    )


@router.delete("/credentials", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credentials(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Remove Investec credentials and all associated data."""
    # Delete transactions first (they reference accounts via FK)
    db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id
    ).delete()

    # Clear the emergency fund account reference BEFORE deleting accounts,
    # to avoid FK violation on users.emergency_fund_account_id
    current_user.emergency_fund_account_id = None
    db.flush()

    # Now safe to delete accounts
    db.query(models.InvestecAccount).filter(
        models.InvestecAccount.user_id == current_user.id
    ).delete()

    # Delete categorization rules
    db.query(models.CategorizationRule).filter(
        models.CategorizationRule.user_id == current_user.id
    ).delete()

    # Clear credentials
    current_user.investec_client_id = None
    current_user.investec_client_secret = None
    current_user.investec_api_key = None

    db.commit()

    logger.info("Investec data deleted", extra={"user_id": current_user.id})

    return None


# =====================================================
# Account Management
# =====================================================

@router.get("/accounts", response_model=List[AccountResponse])
async def list_accounts(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get all connected Investec accounts for user."""
    accounts = db.query(models.InvestecAccount).filter(
        models.InvestecAccount.user_id == current_user.id
    ).all()

    return [
        {
            "id": account.id,
            "investec_account_id": account.investec_account_id,
            "account_number": account.account_number,
            "account_name": account.account_name,
            "reference_name": account.reference_name,
            "product_name": account.product_name,
            "current_balance": account.current_balance,
            "available_balance": account.available_balance,
            "currency": account.currency,
            "is_primary": account.is_primary,
            "is_active": account.is_active,
            "is_emergency_fund_account": account.id == current_user.emergency_fund_account_id,
            "last_synced": account.last_synced,
            "balance_updated_at": account.balance_updated_at,
        }
        for account in accounts
    ]


@router.post("/accounts/sync")
async def sync_accounts(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger manual account sync."""
    if not all([current_user.investec_client_id, current_user.investec_client_secret, current_user.investec_api_key]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec credentials not configured"
        )

    try:
        _sync_user_accounts(db, current_user)
        return {"message": "Account sync completed successfully"}
    except Exception as e:
        logger.exception("Manual account sync failed: %s: %s", type(e).__name__, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Account sync failed: {str(e)}"
        )


@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    update: AccountUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update account settings (is_primary, is_active, reference_name)."""
    account = db.query(models.InvestecAccount).filter(
        models.InvestecAccount.id == account_id,
        models.InvestecAccount.user_id == current_user.id
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # If setting as primary, unset other primary accounts
    if update.is_primary:
        db.query(models.InvestecAccount).filter(
            models.InvestecAccount.user_id == current_user.id,
            models.InvestecAccount.id != account_id
        ).update({"is_primary": False})

    if update.is_primary is not None:
        account.is_primary = update.is_primary
    if update.is_active is not None:
        account.is_active = update.is_active
    if update.reference_name is not None:
        account.reference_name = update.reference_name

    db.commit()
    db.refresh(account)

    return {
        "id": account.id,
        "investec_account_id": account.investec_account_id,
        "account_number": account.account_number,
        "account_name": account.account_name,
        "reference_name": account.reference_name,
        "product_name": account.product_name,
        "current_balance": account.current_balance,
        "available_balance": account.available_balance,
        "currency": account.currency,
        "is_primary": account.is_primary,
        "is_active": account.is_active,
        "is_emergency_fund_account": account.id == current_user.emergency_fund_account_id,
        "last_synced": account.last_synced,
        "balance_updated_at": account.balance_updated_at,
    }


@router.post("/accounts/{account_id}/set-emergency-fund")
async def set_emergency_fund_account(
    account_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Designate an account as the emergency fund account."""
    account = db.query(models.InvestecAccount).filter(
        models.InvestecAccount.id == account_id,
        models.InvestecAccount.user_id == current_user.id
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    current_user.emergency_fund_account_id = account_id
    db.commit()

    return {"message": "Emergency fund account set successfully"}


# =====================================================
# Transaction Management
# =====================================================

@router.get("/transactions", response_model=List[TransactionResponse])
async def list_transactions(
    account_id: Optional[int] = None,
    category: Optional[List[str]] = Query(None, description="Filter by category (can pass multiple)"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    transaction_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get transactions with optional filters.

    Query params:
    - account_id: Filter by account
    - category: Filter by category (income, groceries, etc.) - can pass multiple
    - from_date: Start date (YYYY-MM-DD)
    - to_date: End date (YYYY-MM-DD)
    - search: Search in transaction description (case-insensitive)
    - transaction_type: CREDIT or DEBIT
    - limit: Max results (default 50)
    - offset: Pagination offset
    """
    query = build_transactions_query(
        db,
        current_user.id,
        account_id=account_id,
        category=category,
        from_date=from_date,
        to_date=to_date,
        search=search,
        transaction_type=transaction_type,
    )

    transactions = query.limit(limit).offset(offset).all()

    return transactions


@router.get("/transactions/export/pdf")
async def export_transactions_pdf(
    from_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    account_ids: List[int] = Query(..., description="Account IDs to include (repeat param for multiple)"),
    include_transfers: bool = Query(False, description="Include transfers category in export"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Export filtered bank transactions as a PDF (database only, no Investec API calls)."""
    if not account_ids:
        raise HTTPException(status_code=400, detail="At least one account must be selected")

    try:
        from_dt = parse_date_param(from_date, "from_date")
        to_dt = parse_date_param(to_date, "to_date")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if from_dt > to_dt:
        raise HTTPException(status_code=400, detail="from_date must be on or before to_date")

    accounts = get_user_accounts_for_export(db, current_user.id, account_ids)
    if not accounts:
        raise HTTPException(status_code=404, detail="One or more selected accounts were not found")

    account_name_by_id = {account.id: account_display_name(account) for account in accounts}
    selected_account_ids = [account.id for account in accounts]

    transactions = (
        build_transactions_query(
            db,
            current_user.id,
            account_ids=selected_account_ids,
            from_date=from_date,
            to_date=to_date,
            include_transfers=include_transfers,
        )
        .all()
    )

    rows = [
        ExportTransactionRow(
            transaction_date=txn.transaction_date,
            description=txn.description,
            amount=txn.amount,
            transaction_type=txn.transaction_type,
            category=txn.category,
            account_name=account_name_by_id.get(txn.account_id),
        )
        for txn in transactions
    ]

    budget_summary = build_budget_comparison(db, current_user.id, transactions)

    pdf_bytes = build_transactions_pdf(
        from_date=from_date,
        to_date=to_date,
        account_names=[account_display_name(account) for account in accounts],
        include_transfers=include_transfers,
        transactions=rows,
        budget_summary=budget_summary,
    )

    filename = f"transactions_{from_date}_to_{to_date}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/transactions/sync")
async def sync_transactions(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger manual transaction sync for all accounts."""
    accounts = db.query(models.InvestecAccount).filter(
        models.InvestecAccount.user_id == current_user.id,
        models.InvestecAccount.is_active == True
    ).all()

    if not accounts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active accounts found"
        )

    synced_count = 0
    for account in accounts:
        try:
            _sync_account_transactions(db, account)
            synced_count += 1
        except Exception as e:
            logger.exception(
                "Transaction sync for account failed: %s: %s",
                type(e).__name__,
                e,
                extra={"account_id": account.id, "user_id": current_user.id},
            )

    return {
        "message": f"Transaction sync completed for {synced_count}/{len(accounts)} accounts"
    }


@router.post("/transactions/categorize-all-ai")
async def categorize_all_transactions_with_ai(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Categorize all uncategorized transactions using AI.
    Only processes transactions that haven't been manually corrected.
    """
    if not current_user.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenAI API key not configured. Please add your API key in Settings."
        )

    # Get all uncategorized transactions that haven't been manually corrected
    transactions = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id,
        models.BankTransaction.category == None,
        models.BankTransaction.user_corrected == False
    ).all()

    if not transactions:
        return {
            "message": "No uncategorized transactions found",
            "total": 0,
            "categorized": 0,
            "failed": 0
        }

    # Initialize categorizer
    openai_key = decrypt_api_key(current_user.openai_api_key)
    categorizer = TransactionCategorizer(openai_key, db)

    categorized_count = 0
    failed_count = 0

    for txn in transactions:
        try:
            transaction_dict = {
                'description': txn.description or '',
                'amount': float(txn.amount) if txn.amount else 0.0,
                'type': txn.transaction_type or 'DEBIT'
            }

            categorization = categorizer.categorize_transaction(transaction_dict, current_user.id)

            txn.category = categorization['category']
            txn.ai_category_confidence = categorization['confidence']
            categorized_count += 1

        except Exception as e:
            logger.exception(
                "Transaction categorization failed: %s: %s",
                type(e).__name__,
                e,
                extra={"transaction_id": txn.id, "user_id": current_user.id},
            )
            failed_count += 1
            continue

    db.flush()  # Ensure all changes are written before commit
    db.commit()

    logger.info(
        "Bulk categorization completed: %d/%d successful",
        categorized_count,
        len(transactions),
        extra={"user_id": current_user.id},
    )

    return {
        "message": "Bulk categorization completed",
        "total": len(transactions),
        "categorized": categorized_count,
        "failed": failed_count
    }


@router.post("/transactions/sync-historical")
async def sync_historical_transactions(
    request: HistoricalSyncRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sync historical transactions for specified time period.
    Fetches transactions from the last N months for all active accounts.
    """
    # Get active accounts
    accounts = db.query(models.InvestecAccount).filter(
        models.InvestecAccount.user_id == current_user.id,
        models.InvestecAccount.is_active == True
    ).all()

    if not accounts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active accounts found"
        )

    # Call sync function with custom date range
    from ..investec_sync import sync_historical_transactions_for_user

    result = sync_historical_transactions_for_user(
        db,
        current_user,
        months=request.months
    )

    return {
        "message": "Historical sync completed",
        "months": request.months,
        "accounts_processed": result['accounts_processed'],
        "new_transactions": result['new_transactions'],
        "categorized": result['categorized']
    }


@router.patch("/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction_category(
    transaction_id: int,
    update: TransactionUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update transaction category (user correction)."""
    transaction = db.query(models.BankTransaction).filter(
        models.BankTransaction.id == transaction_id,
        models.BankTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Validate category (allow None or empty string for uncategorized)
    valid_categories = ["salary", "side_income", "investment_income", "refund", "other_income", "groceries_household", "bills", "subscriptions", "transport", "lifestyle_misc", "savings", "loan_repayment", "transfers"]

    # Handle uncategorized (empty string or None)
    if update.category == "" or update.category is None:
        transaction.category = None
    elif update.category in valid_categories:
        transaction.category = update.category
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)} or empty for uncategorized"
        )

    transaction.user_corrected = True

    db.commit()
    db.refresh(transaction)

    return transaction


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a bank transaction."""
    transaction = db.query(models.BankTransaction).filter(
        models.BankTransaction.id == transaction_id,
        models.BankTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    db.delete(transaction)
    db.commit()

    return None


@router.post("/transactions/{transaction_id}/categorize-ai")
async def categorize_transaction_with_ai(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Categorize a single transaction using AI."""
    transaction = db.query(models.BankTransaction).filter(
        models.BankTransaction.id == transaction_id,
        models.BankTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if not current_user.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OpenAI API key not configured. Please add your API key in Settings."
        )

    # Categorize using AI
    try:
        openai_key = decrypt_api_key(current_user.openai_api_key)
        categorizer = TransactionCategorizer(openai_key, db)

        transaction_dict = {
            'description': transaction.description or '',
            'amount': float(transaction.amount) if transaction.amount else 0.0,
            'type': transaction.transaction_type or 'DEBIT'
        }

        categorization = categorizer.categorize_transaction(transaction_dict, current_user.id)

        # Update transaction (but don't mark as user_corrected since it's AI)
        transaction.category = categorization['category']
        transaction.ai_category_confidence = categorization['confidence']
        # Note: We intentionally DON'T set user_corrected=True here
        # This allows users to apply rules later if they want

        db.flush()  # Ensure changes are written before commit
        db.commit()
        db.refresh(transaction)

        logger.info(
            "Transaction categorized: %s",
            categorization['category'],
            extra={
                "transaction_id": transaction_id,
                "user_id": current_user.id,
                "description_preview": redact_description(transaction.description),
            },
        )

        return {
            "message": "Transaction categorized successfully",
            "id": transaction.id,
            "category": transaction.category,
            "confidence": transaction.ai_category_confidence,
            "user_corrected": transaction.user_corrected
        }
    except Exception as e:
        logger.exception(
            "Transaction categorization failed: %s: %s",
            type(e).__name__,
            e,
            extra={"transaction_id": transaction_id, "user_id": current_user.id},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI categorization failed: {str(e) or 'Unknown error'}"
        )


@router.post("/transactions/{transaction_id}/create-rule")
async def create_rule_from_transaction(
    transaction_id: int,
    pattern: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Create a categorization rule from a transaction."""
    transaction = db.query(models.BankTransaction).filter(
        models.BankTransaction.id == transaction_id,
        models.BankTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if not transaction.category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction must have a category before creating a rule"
        )

    # Use transaction categorizer to create rule
    if current_user.openai_api_key:
        openai_key = decrypt_api_key(current_user.openai_api_key)
        categorizer = TransactionCategorizer(openai_key, db)
        rule = categorizer.create_rule_from_transaction(transaction, pattern)
        return {"message": "Rule created successfully", "rule_id": rule.id}
    else:
        # Create rule manually without categorizer
        if not pattern:
            pattern = transaction.description[:50]

        rule = models.CategorizationRule(
            user_id=current_user.id,
            pattern=pattern,
            category=transaction.category,
            priority=10,
            created_from_correction=True
        )

        db.add(rule)
        db.commit()

        return {"message": "Rule created successfully", "rule_id": rule.id}


# =====================================================
# Categorization Rules
# =====================================================

@router.get("/rules", response_model=List[CategorizationRuleResponse])
async def list_rules(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get all categorization rules for user."""
    rules = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.user_id == current_user.id
    ).order_by(models.CategorizationRule.priority.desc()).all()

    return rules


@router.post("/rules", response_model=CategorizationRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    rule: CategorizationRuleCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new categorization rule."""
    # Validate category
    valid_categories = ["salary", "side_income", "investment_income", "refund", "other_income", "groceries_household", "bills", "subscriptions", "transport", "lifestyle_misc", "savings", "loan_repayment", "transfers"]
    if rule.category not in valid_categories:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
        )

    new_rule = models.CategorizationRule(
        user_id=current_user.id,
        pattern=rule.pattern,
        category=rule.category,
        priority=rule.priority
    )

    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)

    return new_rule


@router.patch("/rules/{rule_id}", response_model=CategorizationRuleResponse)
async def update_rule(
    rule_id: int,
    update: CategorizationRuleUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update a categorization rule."""
    rule = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.id == rule_id,
        models.CategorizationRule.user_id == current_user.id
    ).first()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if update.pattern is not None:
        rule.pattern = update.pattern
    if update.category is not None:
        rule.category = update.category
    if update.priority is not None:
        rule.priority = update.priority
    if update.is_active is not None:
        rule.is_active = update.is_active

    db.commit()
    db.refresh(rule)

    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a categorization rule."""
    rule = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.id == rule_id,
        models.CategorizationRule.user_id == current_user.id
    ).first()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    db.delete(rule)
    db.commit()

    return None


def _matches_rule_pattern(description: str, pattern: str) -> bool:
    """Check if description matches rule pattern (regex or substring)."""
    import re
    try:
        return bool(re.search(pattern, description, re.IGNORECASE))
    except re.error:
        # Fallback to simple substring match if not valid regex
        return pattern.lower() in description.lower()


def _get_matching_rule(description: str, rules: list) -> Optional[tuple]:
    """
    Return (rule, proposed_category) for the first matching rule, or None.
    Rules should be sorted by priority desc.
    """
    for rule in rules:
        if _matches_rule_pattern(description, rule.pattern):
            return (rule, rule.category)
    return None


@router.get("/rules/apply-to-existing/preview")
async def preview_apply_rules_to_all(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Preview what would happen when applying rules to all transactions.
    Returns uncategorized count and conflicts (already-categorized transactions
    that would receive a different category from a rule).
    Includes manually re-categorized transactions (user_corrected) in conflict detection.
    No database writes.
    """
    rules = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.user_id == current_user.id,
        models.CategorizationRule.is_active == True
    ).order_by(models.CategorizationRule.priority.desc()).all()

    # Uncategorized: only non-user-corrected (we won't overwrite explicit "leave uncategorized")
    uncategorized_txns = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id,
        models.BankTransaction.user_corrected == False,
        models.BankTransaction.category == None
    ).all()

    # All categorized transactions (including user_corrected) for conflict detection
    categorized_txns = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id,
        models.BankTransaction.category.isnot(None)
    ).all()

    uncategorized_count = 0
    for txn in uncategorized_txns:
        if _get_matching_rule(txn.description, rules):
            uncategorized_count += 1

    conflicts: List[ConflictPreviewItem] = []
    for txn in categorized_txns:
        match = _get_matching_rule(txn.description, rules)
        if not match:
            continue
        rule, proposed_category = match
        if txn.category != proposed_category:
            conflicts.append(ConflictPreviewItem(
                id=txn.id,
                description=txn.description,
                amount=txn.amount,
                transaction_date=txn.transaction_date,
                current_category=txn.category,
                proposed_category=proposed_category,
                rule_id=rule.id,
                rule_pattern=rule.pattern
            ))

    return {
        "uncategorized_count": uncategorized_count,
        "conflicts": [c.model_dump() for c in conflicts]
    }


@router.post("/rules/{rule_id}/apply-to-existing")
async def apply_single_rule_to_existing_transactions(
    rule_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Apply a single rule to existing transactions.
    Only affects transactions that haven't been manually corrected.
    """
    rule = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.id == rule_id,
        models.CategorizationRule.user_id == current_user.id
    ).first()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    transactions = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id,
        models.BankTransaction.user_corrected == False
    ).all()

    categorized_count = 0
    for txn in transactions:
        if _matches_rule_pattern(txn.description, rule.pattern):
            txn.category = rule.category
            txn.ai_category_confidence = 1.0
            rule.usage_count += 1
            categorized_count += 1

    db.commit()

    return {
        "message": "Rule applied successfully",
        "total": len(transactions),
        "categorized": categorized_count,
    }


@router.post("/rules/apply-to-existing")
async def apply_rules_to_existing_transactions(
    request: Optional[ApplyRulesRequest] = Body(default=None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Re-categorize uncategorized transactions using current active rules.
    Optionally apply accepted conflict resolutions (transactions that were
    already categorized but user accepted the rule's proposed category).
    """
    accepted_conflict_ids = (request.accepted_conflict_ids if request else None) or []

    # Load active rules (sorted by priority)
    rules = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.user_id == current_user.id,
        models.CategorizationRule.is_active == True
    ).order_by(models.CategorizationRule.priority.desc()).all()

    # 1. Apply to uncategorized transactions
    uncategorized_txns = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id,
        models.BankTransaction.user_corrected == False,
        models.BankTransaction.category == None
    ).all()

    categorized_count = 0
    for txn in uncategorized_txns:
        for rule in rules:
            if _matches_rule_pattern(txn.description, rule.pattern):
                txn.category = rule.category
                txn.ai_category_confidence = 1.0
                rule.usage_count += 1
                categorized_count += 1
                break

    # 2. Apply accepted conflict resolutions (include user_corrected - user explicitly accepted)
    conflicts_resolved = 0
    if accepted_conflict_ids:
        accepted_set = set(accepted_conflict_ids)
        conflict_txns = db.query(models.BankTransaction).filter(
            models.BankTransaction.user_id == current_user.id,
            models.BankTransaction.id.in_(accepted_set)
        ).all()

        for txn in conflict_txns:
            match = _get_matching_rule(txn.description, rules)
            if match:
                rule, proposed_category = match
                txn.category = proposed_category
                txn.ai_category_confidence = 1.0
                rule.usage_count += 1
                conflicts_resolved += 1

    db.commit()

    return {
        "message": "Rules applied successfully",
        "total": len(uncategorized_txns),
        "categorized": categorized_count,
        "uncategorized": len(uncategorized_txns) - categorized_count,
        "conflicts_resolved": conflicts_resolved
    }
