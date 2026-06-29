#!/usr/bin/env python3
"""Generate a bcrypt hash for updating users.hashed_password in PostgreSQL."""

import argparse
import sys

import bcrypt


def get_password_hash(password: str) -> str:
    """Same logic as backend/app/auth.py get_password_hash."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Hash a password for manual users.hashed_password updates."
    )
    parser.add_argument(
        "password",
        help="Plain-text password to hash",
    )
    args = parser.parse_args()

    if len(args.password) < 6:
        print(
            "Warning: password is shorter than the app's 6-character minimum.",
            file=sys.stderr,
        )

    print(get_password_hash(args.password))


if __name__ == "__main__":
    main()
