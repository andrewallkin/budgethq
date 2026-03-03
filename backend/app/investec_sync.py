"""
Investec Background Sync Jobs

Handles periodic syncing of accounts and transactions.
"""

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from . import models
from .database import SessionLocal
from .investec_service import InvestecService
from .transaction_categorizer import TransactionCategorizer
from .utils import decrypt_api_key, get_sast_now
from .logging_utils import redact_description
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


def sync_investec_accounts():
    """
    Sync account list and balances for all users with Investec credentials.

    Runs hourly to update account balances and discover new accounts.
    """
    db = SessionLocal()
    try:
        # Get all users with Investec credentials
        users = db.query(models.User).filter(
            models.User.investec_client_id.isnot(None),
            models.User.investec_client_secret.isnot(None),
            models.User.investec_api_key.isnot(None)
        ).all()

        logger.info(
            "Account sync started",
            extra={"user_count": len(users), "job": "sync_investec_accounts"},
        )

        for user in users:
            try:
                _sync_user_accounts(db, user)
            except Exception as e:
                logger.exception(
                    "Account sync for user failed: %s: %s",
                    type(e).__name__,
                    e,
                    extra={"user_id": user.id, "job": "sync_investec_accounts"},
                )
                continue

        logger.info("Account sync completed", extra={"job": "sync_investec_accounts"})

    except Exception as e:
        logger.exception(
            "Account sync job failed: %s: %s",
            type(e).__name__,
            e,
            extra={"job": "sync_investec_accounts"},
        )
    finally:
        db.close()


def _sync_user_accounts(db: Session, user: models.User):
    """Sync accounts for a single user"""
    # Decrypt credentials
    client_id = decrypt_api_key(user.investec_client_id)
    client_secret = decrypt_api_key(user.investec_client_secret)
    api_key = decrypt_api_key(user.investec_api_key)

    # Initialize Investec service
    investec = InvestecService(client_id, client_secret, api_key)

    # Fetch accounts from API
    api_accounts = investec.list_accounts()

    for api_account in api_accounts:
        account_id = api_account.get("accountId")

        # Check if account already exists
        existing = db.query(models.InvestecAccount).filter(
            models.InvestecAccount.investec_account_id == account_id
        ).first()

        if existing:
            # Update existing account details
            existing.account_number = api_account.get("accountNumber")
            existing.account_name = api_account.get("accountName")
            existing.reference_name = api_account.get("referenceName")
            existing.product_name = api_account.get("productName")
            existing.last_synced = get_sast_now()
        else:
            # Create new account
            new_account = models.InvestecAccount(
                user_id=user.id,
                investec_account_id=account_id,
                account_number=api_account.get("accountNumber"),
                account_name=api_account.get("accountName"),
                reference_name=api_account.get("referenceName"),
                product_name=api_account.get("productName"),
                last_synced=get_sast_now()
            )
            db.add(new_account)

        # Fetch and update balance
        try:
            balance_data = investec.get_account_balance(account_id)
            account = existing or new_account

            account.current_balance = balance_data.get("currentBalance")
            account.available_balance = balance_data.get("availableBalance")
            account.currency = balance_data.get("currency", "ZAR")
            account.balance_updated_at = get_sast_now()

        except Exception as e:
            logger.warning(
                "Balance fetch failed: %s: %s",
                type(e).__name__,
                e,
                extra={"account_id": account_id, "user_id": user.id},
            )

    db.commit()
    logger.info(
        "Accounts synced",
        extra={"account_count": len(api_accounts), "user_id": user.id},
    )


def sync_investec_transactions(db: Session = None, user_id: int = None):
    """
    Sync transactions for all connected accounts.

    Runs every 15 minutes to fetch new transactions.

    Args:
        db: Optional database session (creates new if not provided)
        user_id: Optional user ID to sync only that user's accounts
    """
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        # Get all active Investec accounts (optionally filtered by user)
        query = db.query(models.InvestecAccount).filter(
            models.InvestecAccount.is_active == True
        )

        if user_id:
            query = query.filter(models.InvestecAccount.user_id == user_id)

        accounts = query.all()

        logger.info(
            "Transaction sync started",
            extra={"account_count": len(accounts), "job": "sync_investec_transactions"},
        )

        for account in accounts:
            try:
                _sync_account_transactions(db, account)
            except Exception as e:
                logger.exception(
                    "Transaction sync for account failed: %s: %s",
                    type(e).__name__,
                    e,
                    extra={"account_id": account.id, "job": "sync_investec_transactions"},
                )
                continue

        logger.info("Transaction sync completed", extra={"job": "sync_investec_transactions"})

    except Exception as e:
        logger.exception(
            "Transaction sync job failed: %s: %s",
            type(e).__name__,
            e,
            extra={"job": "sync_investec_transactions"},
        )
    finally:
        if should_close_db:
            db.close()


def _sync_account_transactions(db: Session, account: models.InvestecAccount):
    """Sync transactions for a single account"""
    user = account.owner

    # Decrypt user's Investec credentials
    client_id = decrypt_api_key(user.investec_client_id)
    client_secret = decrypt_api_key(user.investec_client_secret)
    api_key = decrypt_api_key(user.investec_api_key)

    # Initialize services
    investec = InvestecService(client_id, client_secret, api_key)

    # Determine date range for sync
    if account.last_synced:
        # Fetch from last sync (with 1-day overlap to catch updates)
        from_date = (account.last_synced - timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        # Initial sync: fetch last 180 days (6 months)
        from_date = (datetime.utcnow() - timedelta(days=180)).strftime("%Y-%m-%d")

    to_date = datetime.utcnow().strftime("%Y-%m-%d")

    # Fetch transactions from API
    api_transactions = investec.get_transactions(
        account.investec_account_id,
        from_date=from_date,
        to_date=to_date
    )

    new_count = 0
    categorized_count = 0
    seen_uuids = set()  # Track UUIDs in this batch

    for api_txn in api_transactions:
        # Generate UUID from transaction data (Investec doesn't provide one directly)
        # Use accountId + transactionDate + amount + description as unique identifier
        txn_uuid = _generate_transaction_uuid(api_txn)

        # Skip if we've already processed this UUID in this batch
        if txn_uuid in seen_uuids:
            continue

        # Mark this UUID as seen before any DB operations to prevent in-batch duplication
        seen_uuids.add(txn_uuid)

        # Check if transaction already exists in database
        existing = db.query(models.BankTransaction).filter(
            models.BankTransaction.investec_uuid == txn_uuid
        ).first()

        if existing:
            # Update status if changed (PENDING → POSTED), and refresh all posted fields
            if existing.status != api_txn.get("status") and api_txn.get("status") == "POSTED":
                existing.status = "POSTED"
                existing.posting_date = _parse_date(api_txn.get("postingDate"))
                existing.value_date = _parse_date(api_txn.get("valueDate"))
                existing.transaction_category = api_txn.get("transactionType")
                existing.running_balance = api_txn.get("runningBalance") or existing.running_balance
                existing.description = api_txn.get("description", existing.description)
            continue

        # For POSTED transactions not found by UUID, check if a matching PENDING record
        # has since cleared (description may change on posting, causing a different hash)
        if api_txn.get("status") == "POSTED":
            pending_match = db.query(models.BankTransaction).filter(
                models.BankTransaction.account_id == account.id,
                models.BankTransaction.transaction_date == _parse_date(api_txn.get("transactionDate")),
                models.BankTransaction.amount == api_txn.get("amount"),
                models.BankTransaction.transaction_type == api_txn.get("type"),
                models.BankTransaction.status == "PENDING"
            ).first()

            if pending_match:
                pending_match.investec_uuid = txn_uuid
                pending_match.status = "POSTED"
                pending_match.posting_date = _parse_date(api_txn.get("postingDate"))
                pending_match.value_date = _parse_date(api_txn.get("valueDate"))
                pending_match.transaction_category = api_txn.get("transactionType")
                pending_match.running_balance = api_txn.get("runningBalance")
                pending_match.description = api_txn.get("description", pending_match.description)
                logger.info(
                    "Transaction transitioned pending→posted",
                    extra={"description_preview": redact_description(pending_match.description)},
                )
                continue

        # Create new transaction
        new_txn = models.BankTransaction(
            user_id=user.id,
            account_id=account.id,
            investec_uuid=txn_uuid,
            transaction_type=api_txn.get("type"),
            transaction_category=api_txn.get("transactionType"),
            status=api_txn.get("status"),
            description=api_txn.get("description", ""),
            amount=api_txn.get("amount", 0.0),
            transaction_date=_parse_date(api_txn.get("transactionDate")),
            posting_date=_parse_date(api_txn.get("postingDate")),
            value_date=_parse_date(api_txn.get("valueDate")),
            card_number=api_txn.get("cardNumber"),
            running_balance=api_txn.get("runningBalance"),
            synced_at=get_sast_now()
        )

        # Use a savepoint so an IntegrityError on this insert doesn't roll back
        # previously inserted transactions in this batch (handles concurrent syncs)
        sp = db.begin_nested()
        try:
            db.add(new_txn)
            db.flush()  # Triggers unique constraint immediately
            sp.commit()
        except IntegrityError:
            sp.rollback()
            logger.debug(f"Skipping duplicate transaction {txn_uuid} (concurrent insert)")
            continue

        new_count += 1

        # Apply rule-based categorization only (no AI during sync)
        # Load user's categorization rules
        rules = db.query(models.CategorizationRule).filter(
            models.CategorizationRule.user_id == user.id,
            models.CategorizationRule.is_active == True
        ).order_by(models.CategorizationRule.priority.desc()).all()

        # Try to match against rules
        matched = False
        for rule in rules:
            if _matches_rule_pattern(new_txn.description, rule.pattern):
                new_txn.category = rule.category
                new_txn.ai_category_confidence = 1.0
                rule.usage_count += 1
                categorized_count += 1
                matched = True
                break

        # If no rule matched, leave as uncategorized (category = None)

    # Update account last synced timestamp
    account.last_synced = get_sast_now()

    db.commit()
    logger.info(
        "Account transactions synced",
        extra={
            "new_count": new_count,
            "categorized_count": categorized_count,
            "account_id": account.id,
        },
    )


def sync_historical_transactions_for_user(
    db: Session,
    user: models.User,
    months: int
) -> dict:
    """
    Sync historical transactions for a user across all active accounts.

    Args:
        db: Database session
        user: User object
        months: Number of months to sync (1-12)

    Returns:
        dict with sync statistics
    """
    # Get credentials
    client_id = decrypt_api_key(user.investec_client_id)
    client_secret = decrypt_api_key(user.investec_client_secret)
    api_key = decrypt_api_key(user.investec_api_key)

    service = InvestecService(client_id, client_secret, api_key)

    # Calculate date range
    to_date = datetime.utcnow()
    from_date = to_date - timedelta(days=30 * months)

    accounts = db.query(models.InvestecAccount).filter(
        models.InvestecAccount.user_id == user.id,
        models.InvestecAccount.is_active == True
    ).all()

    total_new = 0
    total_categorized = 0

    for account in accounts:
        try:
            # Fetch from API
            api_transactions = service.get_transactions(
                account.investec_account_id,
                from_date=from_date.strftime("%Y-%m-%d"),
                to_date=to_date.strftime("%Y-%m-%d")
            )

            # Load user's categorization rules once per account
            rules = db.query(models.CategorizationRule).filter(
                models.CategorizationRule.user_id == user.id,
                models.CategorizationRule.is_active == True
            ).order_by(models.CategorizationRule.priority.desc()).all()

            # Track UUIDs we've seen in this batch to avoid duplicates from API
            seen_uuids = set()

            # Process each transaction
            for api_txn in api_transactions:
                # Generate UUID from transaction data
                txn_uuid = _generate_transaction_uuid(api_txn)

                # Skip if we've already processed this UUID in this batch
                if txn_uuid in seen_uuids:
                    continue

                # Mark this UUID as seen before any DB operations
                seen_uuids.add(txn_uuid)

                # Check if transaction already exists in database
                existing = db.query(models.BankTransaction).filter(
                    models.BankTransaction.investec_uuid == txn_uuid
                ).first()

                if existing:
                    # Update status if changed (PENDING → POSTED), and refresh all posted fields
                    if existing.status != api_txn.get("status") and api_txn.get("status") == "POSTED":
                        existing.status = "POSTED"
                        existing.posting_date = _parse_date(api_txn.get("postingDate"))
                        existing.value_date = _parse_date(api_txn.get("valueDate"))
                        existing.transaction_category = api_txn.get("transactionType")
                        existing.running_balance = api_txn.get("runningBalance") or existing.running_balance
                        existing.description = api_txn.get("description", existing.description)
                    continue

                # For POSTED transactions not found by UUID, check if a matching PENDING record
                # has since cleared (description may change on posting, causing a different hash)
                if api_txn.get("status") == "POSTED":
                    pending_match = db.query(models.BankTransaction).filter(
                        models.BankTransaction.account_id == account.id,
                        models.BankTransaction.transaction_date == _parse_date(api_txn.get("transactionDate")),
                        models.BankTransaction.amount == api_txn.get("amount"),
                        models.BankTransaction.transaction_type == api_txn.get("type"),
                        models.BankTransaction.status == "PENDING"
                    ).first()

                    if pending_match:
                        pending_match.investec_uuid = txn_uuid
                        pending_match.status = "POSTED"
                        pending_match.posting_date = _parse_date(api_txn.get("postingDate"))
                        pending_match.value_date = _parse_date(api_txn.get("valueDate"))
                        pending_match.transaction_category = api_txn.get("transactionType")
                        pending_match.running_balance = api_txn.get("runningBalance")
                        pending_match.description = api_txn.get("description", pending_match.description)
                        logger.info(
                    "Transaction transitioned pending→posted",
                    extra={"description_preview": redact_description(pending_match.description)},
                )
                        continue

                # Create new transaction
                new_txn = models.BankTransaction(
                    user_id=user.id,
                    account_id=account.id,
                    investec_uuid=txn_uuid,
                    transaction_type=api_txn.get("type"),
                    transaction_category=api_txn.get("transactionType"),
                    status=api_txn.get("status"),
                    description=api_txn.get("description", ""),
                    amount=api_txn.get("amount", 0.0),
                    transaction_date=_parse_date(api_txn.get("transactionDate")),
                    posting_date=_parse_date(api_txn.get("postingDate")),
                    value_date=_parse_date(api_txn.get("valueDate")),
                    card_number=api_txn.get("cardNumber"),
                    running_balance=api_txn.get("runningBalance"),
                    synced_at=get_sast_now()
                )

                sp = db.begin_nested()
                try:
                    db.add(new_txn)
                    db.flush()
                    sp.commit()
                except IntegrityError:
                    sp.rollback()
                    logger.debug(f"Skipping duplicate transaction {txn_uuid} (concurrent insert)")
                    continue

                total_new += 1

                # Apply rule-based categorization
                matched = False
                for rule in rules:
                    if _matches_rule_pattern(new_txn.description, rule.pattern):
                        new_txn.category = rule.category
                        new_txn.ai_category_confidence = 1.0
                        rule.usage_count += 1
                        total_categorized += 1
                        matched = True
                        break

            # Update account last synced timestamp
            account.last_synced = get_sast_now()

            # Commit after each account to avoid batch insert conflicts
            db.commit()

        except Exception as e:
            logger.exception(
                "Historical transaction sync for account failed: %s: %s",
                type(e).__name__,
                e,
                extra={"account_id": account.id, "user_id": user.id},
            )
            db.rollback()  # Rollback failed account
            continue

    logger.info(
        "Historical transaction sync completed",
        extra={
            "user_id": user.id,
            "new_count": total_new,
            "categorized_count": total_categorized,
        },
    )

    return {
        'accounts_processed': len(accounts),
        'new_transactions': total_new,
        'categorized': total_categorized
    }


def _matches_rule_pattern(description: str, pattern: str) -> bool:
    """Check if description matches rule pattern (regex or substring)."""
    import re
    try:
        return bool(re.search(pattern, description, re.IGNORECASE))
    except re.error:
        # Fallback to simple substring match if not valid regex
        return pattern.lower() in description.lower()


def _generate_transaction_uuid(api_txn: dict) -> str:
    """
    Generate a unique identifier for a transaction.

    Investec doesn't provide transaction UUIDs, so we create one from:
    accountId + transactionDate + amount + description (first 50 chars)
    """
    import hashlib

    # Format amount consistently to 2 decimal places to avoid float representation issues
    amount = api_txn.get('amount', 0.0)
    amount_str = f"{float(amount):.2f}" if amount is not None else "0.00"

    unique_string = (
        f"{api_txn.get('accountId', '')}"
        f"{api_txn.get('transactionDate', '')}"
        f"{amount_str}"
        f"{api_txn.get('description', '')[:50]}"
    )

    return hashlib.sha256(unique_string.encode()).hexdigest()


def _parse_date(date_str: str) -> datetime:
    """Parse date string from Investec API (YYYY-MM-DD format)"""
    if not date_str:
        return None

    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        logger.warning("Date parse failed: %s", date_str)
        return None


def _categorize_new_transaction(db: Session, user: models.User, api_txn: dict) -> dict:
    """Categorize a newly synced transaction"""
    openai_key = decrypt_api_key(user.openai_api_key)
    categorizer = TransactionCategorizer(openai_key, db)

    transaction_dict = {
        'description': api_txn.get('description', ''),
        'amount': api_txn.get('amount', 0.0),
        'type': api_txn.get('type', 'DEBIT')
    }

    return categorizer.categorize_transaction(transaction_dict, user.id)
