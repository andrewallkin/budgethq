# BudgetHQ

BudgetHQ is a personal finance dashboard for **South African** users: budgeting against take-home pay, tax-oriented salary tooling, emergency savings targets, retirement annuity (RA) planning, optional **Investec banking** connectivity, and **investment portfolios** (including an automated TFSA view with ETFs, government bonds, Google Sheets pricing, FX-aware holdings, contribution limits, rebalancing helpers, and history).

Primary stack: **React + Vite + TailwindCSS + Recharts** (`frontend/`), **FastAPI + SQLAlchemy + Pandas + APScheduler** (`backend/`), **PostgreSQL** with **Alembic** migrations (`backend/alembic/`), **Docker Compose** for dev and VPS-style production, **GitHub Actions** (`.github/workflows/deploy.yml`). A checked-in [openapi.json](openapi.json) reflects the REST API snapshot; interactive docs are at `/docs` when the backend is running.

---

## Highlights

| Area | What you get |
|------|----------------|
| **Auth** | JWT-based login and registration; optional allowlist via `AUTHORIZED_USERS` when `RESTRICT_AUTHORIZED_USERS=true` (default); per-user data isolation. |
| **Tax & payslip** | SARS-aligned PAYE/UIF/medical rebate logic driven by FY-specific tables in the backend (`tax_engine`). Detailed payslip model, fringe benefits; optional payslip PDF storage in Google Cloud Storage (GCS). |
| **Budget** | Needs / wants / savings structure, charts, autosave against the authenticated user—not a single demo user. |
| **Emergency savings** | Goals tied to budget “Needs” (e.g. 3/6/12 months), progress and time-to-goal views. |
| **RA** | Performance and RA tax-benefit scenarios using the same tax engine as the budget flow. |
| **Investments** | Multiple portfolios (e.g. default TFSA at `/portfolio` redirecting to `/investments/tfsa`), target allocation, transactions, Sheets-backed ETF prices where configured, FX worksheet integration, rebalancing calculator, snapshots and summaries (scheduled). |
| **Investec** (optional) | Account sync, transactions, categorization rules, budget analysis (`/investec/*`). Stored API credentials require `ENCRYPTION_KEY`. The sidebar entry is a **Settings** preference (persisted locally) regardless of connectivity. |
| **Ops** | Docker Compose (`docker-compose.dev.yml` vs `docker-compose.yml`), Makefile helpers, VPS deploy with migrations (`run_migrations.sh` inside the backend container). |

---

## Repository layout

| Path | Role |
|------|------|
| `frontend/src/pages/` | Route-level screens |
| `frontend/src/components/` | Shared and feature UI |
| `frontend/src/utils/` | Formatting and helpers |
| `backend/app/routers/` | FastAPI routers by feature |
| `backend/app/models.py` | SQLAlchemy models |
| `backend/alembic/versions/` | Migration scripts |
| `tests/` | Python tests |
| `openapi.json` | API schema snapshot |

---

## Running with Docker (recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose plugin
- [Make](https://www.gnu.org/software/make/) (optional; mirrors the commands below)

### Compose files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production-style stack (matches typical VPS deployment) |
| `docker-compose.dev.yml` | Local development: backend `--reload`, bind-mounted frontend `src`, exposed Postgres |

### Environment

Copy [.env.example](.env.example) to `.env` and fill values. Important details:

- **Database URL**: The backend **builds** the connection string from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, and `POSTGRES_DB`—it does not read a separate `DATABASE_URL` variable.
- **Auth**: `RESTRICT_AUTHORIZED_USERS` (default `true`) gates registration/login against `AUTHORIZED_USERS`, a comma-separated list of allowed registrant emails. Set `RESTRICT_AUTHORIZED_USERS=false` for open auth.
- **`ENCRYPTION_KEY`**: Required **Fernet** key (see `.env.example`) if users store encrypted secrets (for example Investec credentials or OpenAI keys in-app).
- **Google**: `GCP_SERVICE_ACCOUNT_CREDENTIALS` must be the service account JSON **encoded as Base64** (not a filesystem path).
- **`GOOGLE_SPREADSHEET_ID`**: Used for ETF tab sync and FX rates (FX worksheet/tab is created/seeding when missing; see `.env.example` for optional overrides).

Production-style deploy also needs matching secrets from the same conceptual set (below).

### Start development

```bash
make dev-up
# Equivalent:
# docker-compose -f docker-compose.dev.yml up -d
```

- **Frontend:** http://localhost:3000  
- **Backend / OpenAPI:** http://localhost:8000 and http://localhost:8000/docs  
- **Postgres (host):** `localhost:${POSTGRES_PORT:-5432}`

### Makefile reference

```bash
make help              # All targets
make dev-up            # Start dev stack
make dev-build         # Rebuild images and start
make dev-down          # Stop dev stack
make dev-logs          # Follow logs
make dev-shell         # Shell in backend container

make migrate                      # alembic upgrade head
make migrate-create MSG='...'      # alembic revision --autogenerate
make migrate-stamp                # Stamp DB (see migrations section)
make migrate-history
make migrate-rollback

make prod-up / make prod-down     # Production compose locally
make clean                        # Dev compose down WITH volumes + docker system prune -af (destructive—removes unrelated unused images too)
```

---

## Frontend routes (conceptual map)

Protected app routes include home, budget, salary/payslip, emergency savings, investments landing and `/investments/:portfolioSlug`, RA calculator and RA performance (`/investments/ra`), category guide, settings, and (when Investec nav is enabled) Investec dashboard, accounts, transactions, rules, and budget analysis. Login and register stay public.

Legacy paths `/portfolio`, `/ra`, and `/ra-calculator` redirect to the investments URL structure above.

---

## Google Sheets integration

Designed for ETF tickers wired with `GOOGLEFINANCE` plus optional **portfolio FX**: the spreadsheet is shared **Editor** with the Sheets service account. User-specific holdings tabs isolate data per user ID.

Steps (summary):

1. Create a Google Cloud project and enable **Sheets API**.
2. Create a service account JSON key **Base64-encode** the entire JSON string for `GCP_SERVICE_ACCOUNT_CREDENTIALS`.
3. Create/spreadsheet → share with the service account email → set `GOOGLE_SPREADSHEET_ID`.

The scheduler runs periodic price sync (`backend/app/scheduler.py`); holdings changes from the UI can push back into the workbook when credentials are configured. If Sheets is unavailable, the app degrades gracefully to cached values where possible.

---

## Local backend / frontend without full Docker Compose

You normally only need Postgres available (for example Docker’s `postgres` service alone) matching `.env`.

From the **repository root** (`pyproject.toml` lives here):

```bash
uv sync --extra backend
export POSTGRES_HOST=localhost   # … plus other POSTGRES_* from .env
PYTHONPATH=backend uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

For the SPA only:

```bash
cd frontend
npm install
npm run dev
```

The bundled Vite config proxies `/api` to `http://backend:8000` for the **Docker Compose** frontend container. Running Vite entirely on your host with a localhost backend typically means adjusting [frontend/vite.config.js](frontend/vite.config.js) proxy `target` to `http://127.0.0.1:8000` while you iterate.

---

## API surface

Prefer **Swagger UI** at `/docs` or the **`openapi.json`** snapshot for an accurate list of paths. Groups include auth, budget, salary, payslip uploads, emergency savings, RA, portfolio/TFSA contributions, ETFs and bonds (`/api/etf`, `/api/bond`), Sheets sync helpers, unified investments CRUD (`/api/investments`), manual accounts (`/api/manual-accounts`), Investec (`/api/investec`), analytics/portfolio-history endpoints (`/api/...`), tax and rebalancing calculators (`/api/calculate`), and optional admin endpoints.

---

## Database migrations

Migrations live under `backend/alembic/versions/`. Typical loop when models change:

1. Edit SQLAlchemy models (`backend/app/models.py`).
2. `make migrate-create MSG="short_description"`.
3. Review the generated script for safety.
4. `make migrate` against a disposable dev database first.
5. Commit the migration file; CI deploy runs `upgrade` remotely.

### Stamp when legacy DB already matches ORM snapshot

If the database tables already existed before Alembic was introduced on that environment:

```bash
make dev-up
make migrate-create MSG="initial_schema"   # or your baseline revision
make migrate-stamp                       # Marks current revision without DDL—avoids accidental duplicate DDL
make migrate-history                     # Sanity check
```

**Never stamp production** casually; only when you are certain the schema already matches that revision.

---

## CI/CD deployment

[`deploy.yml`](.github/workflows/deploy.yml) runs on **push to `main`** or **manual workflow dispatch** from the Actions tab for the GitHub repo (choose branch when triggering).

Remote flow (simplified):

1. SSH to your VPS → sync repo under `/srv/apps/…`.
2. Write `.env` from secrets.
3. `docker compose build` / `docker compose up -d --force-recreate`.
4. `docker compose exec backend … ./run_migrations.sh`.

Representative secrets: `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY`; `GH_USERNAME`, `GH_PAT`; Postgres (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_HOST`); `BACKEND_PORT`, `FRONTEND_PORT`; `RESTRICT_AUTHORIZED_USERS`, `AUTHORIZED_USERS`, `ENCRYPTION_KEY`; `GCP_SERVICE_ACCOUNT_CREDENTIALS`, `GOOGLE_SPREADSHEET_ID`; `GCS_PAYSLIPS_BUCKET_NAME`.

---

## TFSA contribution numbers (FY-aware)

Annual TFSA caps are sourced from backend tax tables per SA financial year (for example logic in [`backend/app/tax_engine.py`](backend/app/tax_engine.py)—values differ across FY such as FY 2026 vs FY 2025). The Lifetime total shown in UI is currently modeled (see `frontend` TFSA/portfolio tooling) separately from statutory annual caps—treat totals as budgeting aids and verify amounts against official SARS limits for your scenario.

---

## Troubleshooting

| Symptom | Things to verify |
|---------|-------------------|
| **Prices / FX stale** | Service account Editor on sheet; Base64 credential valid; `GOOGLE_SPREADSHEET_ID`; backend logs (`make dev-logs`). |
| **Registration refused** | `RESTRICT_AUTHORIZED_USERS=true` and email exactly present in `AUTHORIZED_USERS`; backend logs if needed. Set `RESTRICT_AUTHORIZED_USERS=false` for open registration. |
| **Migrations fail** | Connectivity; `POSTGRES_*` matches running Postgres; Alembic current vs filesystem (`make migrate-history`). |
| **Investec unavailable** | `ENCRYPTION_KEY` set before saving credentials; OAuth/API fields in Settings. |
