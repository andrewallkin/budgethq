"""Tests for PostgreSQL connection check."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


class TestCheckPostgresConnection:
    def test_success_does_not_raise(self):
        from app import database

        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_ctx = MagicMock()
        mock_ctx.__enter__.return_value = mock_conn
        mock_ctx.__exit__.return_value = None
        mock_engine.connect.return_value = mock_ctx

        with patch.object(database, "engine", mock_engine):
            database.check_postgres_connection()

        mock_conn.execute.assert_called_once()

    def test_failure_raises(self):
        from app import database

        mock_engine = MagicMock()
        mock_engine.connect.side_effect = RuntimeError("connection refused")

        with patch.object(database, "engine", mock_engine):
            with pytest.raises(RuntimeError, match="connection refused"):
                database.check_postgres_connection()
