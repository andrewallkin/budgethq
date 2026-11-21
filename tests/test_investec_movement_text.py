import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.investec_movement_text import (
    format_balance,
    format_rand,
    normalize_amount,
    render_bubble,
)

TRANSFER_SNAPSHOT = {
    "from_name": "Daily Account",
    "from_product": "Private Bank Account",
    "to_name": "Vehicle Finance",
    "to_product": "Instalment Sale Loan Account",
    "amount": "1500.00",
    "my_reference": "Vehicle finance",
    "their_reference": "From daily",
    "to_account_number": "1234567890123",
}

PAYMENT_SNAPSHOT = {
    "from_name": "Daily Account",
    "from_product": "Private Bank Account",
    "to_name": "Unused",
    "to_product": "Unused",
    "to_beneficiary_name": "Municipality",
    "to_bank": "Standard Bank",
    "to_account_number": "051001234567890",
    "amount": "1500.00",
    "my_reference": "Rates",
    "their_reference": "Account 42",
}


class TestNormalizeAmount:
    def test_two_decimals_unchanged(self):
        assert normalize_amount("1500.00") == "1500.00"

    def test_single_decimal_padded(self):
        assert normalize_amount("1500.5") == "1500.50"

    @pytest.mark.parametrize(
        "value",
        ["", "   ", "0", "0.00", "-1", "-0.01", "abc", "12..3"],
    )
    def test_rejects_invalid(self, value):
        with pytest.raises(ValueError):
            normalize_amount(value)


class TestFormatRand:
    def test_thousands_separator(self):
        assert format_rand("1500.00") == "R1 500.00"


class TestFormatBalance:
    def test_positive(self):
        assert format_balance(1130) == "R1 130.00"

    def test_negative(self):
        assert format_balance(-60771.67) == "-R60 771.67"


class TestRenderBubble:
    def test_pending_transfer_has_no_account_number(self):
        text = render_bubble("transfer", "pending", TRANSFER_SNAPSHOT)
        assert text.startswith("💸 Pending transfer")
        assert "1234567890123" not in text
        assert "*From*" in text
        assert "R1 500\\.00" in text
        assert "R1 500.00" not in text

    def test_pending_payment_includes_full_account_number(self):
        text = render_bubble("payment", "pending", PAYMENT_SNAPSHOT)
        assert text.startswith("💸 Pending payment")
        assert "051001234567890" in text
        assert "Standard Bank" in text
        assert "Municipality" in text

    def test_rejected_last_line(self):
        text = render_bubble("transfer", "rejected", TRANSFER_SNAPSHOT)
        assert text.startswith("❌ Transfer rejected")
        assert text.rstrip().endswith("Nothing was sent\\.")

    def test_sent_transfer_balances(self):
        balances = {
            "from_current": 1130.0,
            "from_available": 1000.0,
            "to_current": 50000.0,
            "to_available": 48000.0,
        }
        text = render_bubble(
            "transfer",
            "sent",
            TRANSFER_SNAPSHOT,
            balances=balances,
            investec_reference="INV-99",
        )
        assert text.startswith("✅ Transfer sent")
        assert "R1 130\\.00" in text
        assert "R1 000\\.00" in text
        assert "R50 000\\.00" in text
        assert "R48 000\\.00" in text
        assert "INV\\-99" in text

    def test_sent_payment_balances_source_only(self):
        balances = {
            "from_current": 1130.0,
            "from_available": 1000.0,
            "to_current": 999.0,
            "to_available": 888.0,
        }
        text = render_bubble(
            "payment",
            "sent",
            PAYMENT_SNAPSHOT,
            balances=balances,
            investec_reference="PAY-1",
        )
        assert text.startswith("✅ Payment sent")
        assert "R1 130\\.00" in text
        assert "R1 000\\.00" in text
        assert "R999.00" not in text
        assert "R888.00" not in text

    def test_sent_balance_unavailable(self):
        text = render_bubble(
            "transfer",
            "sent",
            TRANSFER_SNAPSHOT,
            balances=None,
            investec_reference="INV-REF",
        )
        assert "Balance unavailable\\." in text
        assert "INV\\-REF" in text

    @pytest.mark.parametrize(
        ("kind", "state", "prefix"),
        [
            ("transfer", "approved", "✅ Transfer approved"),
            ("payment", "approved", "✅ Payment approved"),
            ("transfer", "needs_authorisation", "⏳ Transfer waiting on Investec"),
            (
                "payment",
                "needs_authorisation",
                "⏳ Payment waiting on Investec",
            ),
            ("transfer", "failed", "❌ Transfer failed"),
            ("transfer", "failed_unconfirmed", "❌ Transfer failed"),
            ("transfer", "expired", "⏱ Transfer expired"),
        ],
    )
    def test_state_headers(self, kind, state, prefix):
        snapshot = TRANSFER_SNAPSHOT if kind == "transfer" else PAYMENT_SNAPSHOT
        text = render_bubble(kind, state, snapshot)
        assert text.startswith(prefix)

    def test_needs_authorisation_extra_sentence(self):
        text = render_bubble("transfer", "needs_authorisation", TRANSFER_SNAPSHOT)
        assert (
            "Investec accepted the request and still requires its own authorisation\\."
            in text
        )

    def test_failed_last_line(self):
        text = render_bubble("transfer", "failed", TRANSFER_SNAPSHOT)
        assert "Investec did not accept this\\. Nothing was sent\\." in text

    def test_failed_unconfirmed_last_line(self):
        text = render_bubble("transfer", "failed_unconfirmed", TRANSFER_SNAPSHOT)
        assert (
            "Investec did not confirm this\\. Nothing further will be sent\\." in text
        )