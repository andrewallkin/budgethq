"""Apply active categorization rules to historical transactions (external bot + reusable)."""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models
from .rule_matching import get_matching_rule


def _parse_date(value: str, field: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field}: expected YYYY-MM-DD") from exc


def apply_rules_to_history(
    db: Session,
    user_id: int,
    *,
    rule_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    dry_run: bool = False,
) -> dict:
    if rule_id is None and from_date is None and to_date is None:
        raise HTTPException(status_code=400, detail="Provide rule_id or a from_date/to_date range")

    if rule_id is not None:
        rule = (
            db.query(models.CategorizationRule)
            .filter(
                models.CategorizationRule.id == rule_id,
                models.CategorizationRule.user_id == user_id,
            )
            .first()
        )
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        rules = [rule]
    else:
        rules = db.query(models.CategorizationRule).filter(
            models.CategorizationRule.user_id == user_id,
            models.CategorizationRule.is_active.is_(True),
        ).all()
        rules.sort(key=lambda r: getattr(r, "priority", 0) or 0, reverse=True)

    txn_filters = [
        models.BankTransaction.user_id == user_id,
        models.BankTransaction.hidden.isnot(True),
    ]
    if from_date:
        txn_filters.append(
            models.BankTransaction.transaction_date >= _parse_date(from_date, "from_date")
        )
    if to_date:
        txn_filters.append(
            models.BankTransaction.transaction_date < _parse_date(to_date, "to_date") + timedelta(days=1)
        )
    txns = db.query(models.BankTransaction).filter(*txn_filters).all()

    changes, skipped = [], []
    for txn in txns:
        if txn.user_corrected:
            skipped.append({"id": txn.id, "description": txn.description})
            continue
        rule = get_matching_rule(txn.description, txn.transaction_type, rules)
        # Already equal to the rule's target category: no-op (not changed, not reported).
        if not rule or rule.category == txn.category:
            continue
        changes.append(
            {
                "id": txn.id,
                "description": txn.description,
                "old_category": txn.category,
                "new_category": rule.category,
            }
        )
        if not dry_run:
            txn.category = rule.category
            txn.ai_category_confidence = 1.0
            rule.usage_count += 1

    if not dry_run:
        db.commit()

    return {
        "matched": len(changes),
        "changed": 0 if dry_run else len(changes),
        "skipped_user_corrected": skipped,
        "changes": changes if dry_run else [],
    }
