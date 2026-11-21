import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


def test_user_telegram_columns_exist():
    from app.models import User

    table = User.__table__
    assert table.c.telegram_bot_token.nullable is True
    assert table.c.telegram_allowed_user_id.nullable is True
    assert table.c.telegram_webhook_secret.nullable is True
    assert table.c.telegram_webhook_secret.unique is True