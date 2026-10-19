"""Shared categorization-rule matching, honoring an optional transaction-type filter."""
import re


def matches_rule_pattern(description, pattern: str) -> bool:
    """Case-insensitive regex match with substring fallback (moved from investec sync/router)."""
    if not description or not pattern:
        return False
    try:
        return bool(re.search(pattern, description, re.IGNORECASE))
    except re.error:
        return pattern.lower() in description.lower()


def rule_applies_to_type(rule, transaction_type) -> bool:
    if not getattr(rule, "transaction_type", None):
        return True
    return bool(transaction_type) and rule.transaction_type == transaction_type


def get_matching_rule(description, transaction_type, rules):
    for rule in rules:
        if not rule_applies_to_type(rule, transaction_type):
            continue
        if matches_rule_pattern(description, rule.pattern):
            return rule
    return None
