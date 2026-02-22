"""
Investec API Router

Handles all Investec integration endpoints:
- Credential management
- Account management
- Transaction management
- Categorization rules
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
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

    db.commit()

    # Trigger immediate account sync
    try:
        _sync_user_accounts(db, current_user)
    except Exception as e:
        logger.error(f"Failed to sync accounts after credential storage: {e}")

    # Trigger immediate transaction sync for all newly created accounts
    try:
        from ..investec_sync import sync_investec_transactions
        sync_investec_transactions(db, user_id=current_user.id)
    except Exception as e:
        logger.error(f"Failed to sync transactions after credential storage: {e}")

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

    logger.info(f"Deleted all Investec data for user {current_user.id}")

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
        logger.error(f"Manual account sync failed: {e}")
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
    query = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id
    )

    if account_id:
        query = query.filter(models.BankTransaction.account_id == account_id)

    if category:
        # Support "uncategorized" as a special filter for transactions with category IS NULL
        if "uncategorized" in category:
            cat_values = [c for c in category if c != "uncategorized"]
            if cat_values:
                from sqlalchemy import or_
                query = query.filter(
                    or_(
                        models.BankTransaction.category.in_(cat_values),
                        models.BankTransaction.category.is_(None)
                    )
                )
            else:
                query = query.filter(models.BankTransaction.category.is_(None))
        else:
            query = query.filter(models.BankTransaction.category.in_(category))

    if from_date:
        query = query.filter(models.BankTransaction.transaction_date >= from_date)

    if to_date:
        query = query.filter(models.BankTransaction.transaction_date <= to_date)

    if search:
        query = query.filter(
            models.BankTransaction.description.ilike(f"%{search}%")
        )

    if transaction_type:
        query = query.filter(models.BankTransaction.transaction_type == transaction_type)

    transactions = query.order_by(
        models.BankTransaction.transaction_date.desc()
    ).limit(limit).offset(offset).all()

    return transactions


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
            logger.error(f"Failed to sync transactions for account {account.id}: {e}")

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
            import traceback
            logger.error(f"Failed to categorize transaction {txn.id}: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            failed_count += 1
            continue

    db.flush()  # Ensure all changes are written before commit
    db.commit()

    logger.info(f"Bulk categorization completed: {categorized_count}/{len(transactions)} successful")

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
        logger.info(f"Categorizing transaction {transaction_id}: {transaction.description[:50]}")

        openai_key = decrypt_api_key(current_user.openai_api_key)
        categorizer = TransactionCategorizer(openai_key, db)

        transaction_dict = {
            'description': transaction.description or '',
            'amount': float(transaction.amount) if transaction.amount else 0.0,
            'type': transaction.transaction_type or 'DEBIT'
        }

        logger.info(f"Transaction dict: {transaction_dict}")

        categorization = categorizer.categorize_transaction(transaction_dict, current_user.id)

        logger.info(f"Categorization result: {categorization}")

        # Update transaction (but don't mark as user_corrected since it's AI)
        transaction.category = categorization['category']
        transaction.ai_category_confidence = categorization['confidence']
        # Note: We intentionally DON'T set user_corrected=True here
        # This allows users to apply rules later if they want

        db.flush()  # Ensure changes are written before commit
        db.commit()
        db.refresh(transaction)

        logger.info(f"Successfully updated transaction {transaction_id} with category {categorization['category']}")

        # Verify the category was actually saved
        logger.info(f"Verified transaction category after refresh: {transaction.category}")

        return {
            "message": "Transaction categorized successfully",
            "id": transaction.id,
            "category": transaction.category,
            "confidence": transaction.ai_category_confidence,
            "user_corrected": transaction.user_corrected
        }
    except Exception as e:
        import traceback
        logger.error(f"Failed to categorize transaction {transaction_id}: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
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
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Re-categorize uncategorized transactions using current active rules.
    Only affects uncategorized transactions; AI and manually categorized are preserved.
    """
    # Get uncategorized transactions that can be re-categorized
    transactions = db.query(models.BankTransaction).filter(
        models.BankTransaction.user_id == current_user.id,
        models.BankTransaction.user_corrected == False,
        models.BankTransaction.category == None
    ).all()

    if not transactions:
        return {
            "message": "No transactions to categorize",
            "total": 0,
            "categorized": 0,
            "uncategorized": 0
        }

    # Load active rules (sorted by priority)
    rules = db.query(models.CategorizationRule).filter(
        models.CategorizationRule.user_id == current_user.id,
        models.CategorizationRule.is_active == True
    ).order_by(models.CategorizationRule.priority.desc()).all()

    categorized_count = 0

    for txn in transactions:
        # Try to match against rules
        matched = False
        for rule in rules:
            if _matches_rule_pattern(txn.description, rule.pattern):
                txn.category = rule.category
                txn.ai_category_confidence = 1.0
                rule.usage_count += 1
                categorized_count += 1
                matched = True
                break

    db.commit()

    return {
        "message": "Rules applied successfully",
        "total": len(transactions),
        "categorized": categorized_count,
        "uncategorized": len(transactions) - categorized_count
    }
