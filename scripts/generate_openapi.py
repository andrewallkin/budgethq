"""Generate the BudgetHQ OpenAPI snapshot.

Writes ../openapi-budgethq.json (relative to this script) from the live FastAPI
app. CI re-runs this and fails on drift, so the snapshot is never hand-edited.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Importing app.main builds the SQLAlchemy engine at import time from
# POSTGRES_* env vars. Schema generation never touches the database, so safe
# placeholders keep this script runnable anywhere (CI, fresh checkouts) even
# when no database environment is configured.
for key, value in {
    "POSTGRES_USER": "openapi",
    "POSTGRES_PASSWORD": "openapi",
    "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "openapi",
}.items():
    os.environ.setdefault(key, value)

from app.main import app  # noqa: E402


def main() -> None:
    spec = app.openapi()
    out = ROOT / "openapi-budgethq.json"
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out} ({len(spec.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()