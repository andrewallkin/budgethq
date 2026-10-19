"""Generate the BudgetHQ OpenAPI snapshot.

Writes ../openapi-budgethq.json (relative to this script) from the live FastAPI
app. CI re-runs this and fails on drift, so the snapshot is never hand-edited.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402


def main() -> None:
    spec = app.openapi()
    out = ROOT / "openapi-budgethq.json"
    out.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {out} ({len(spec.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()