"""Seed safe default env values so the suite runs hermetically.

Real values (CI env block or a repo-root .env) always win: setdefault only
fills gaps, so tests that monkeypatch env vars behave identically either way.
"""
import os

_DEFAULTS = {
    "POSTGRES_USER": "budget_user",
    "POSTGRES_PASSWORD": "budget_user",
    "POSTGRES_DB": "budget_db",
    "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432",
    "JWT_SECRET_KEY": "test-jwt-secret-not-real",
    "ENCRYPTION_KEY": "test-encryption-key-not-real",
}

for _key, _value in _DEFAULTS.items():
    os.environ.setdefault(_key, _value)
