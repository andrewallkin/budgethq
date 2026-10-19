import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import transaction_categories as tc


def test_every_valid_category_has_label_description_and_example():
    for slug in tc.VALID_TRANSACTION_CATEGORIES + ["uncategorized"]:
        assert slug in tc.CATEGORY_LABELS, slug
        assert slug in tc.CATEGORY_DESCRIPTIONS, slug


def test_budget_linkable_set_matches_budget_rule():
    assert "groceries" in tc.BUDGET_LINKABLE_CATEGORIES
    assert "transfers" in tc.BUDGET_LINKABLE_CATEGORIES
    assert "uncategorized" in tc.BUDGET_LINKABLE_CATEGORIES
    assert "salary" not in tc.BUDGET_LINKABLE_CATEGORIES


def test_categorizer_uses_canonical_descriptions():
    from app import transaction_categorizer

    assert transaction_categorizer.CATEGORY_DESCRIPTIONS is tc.CATEGORY_DESCRIPTIONS
