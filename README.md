# BudgetHQ

Personal finance dashboard for **South African** users: budgeting against take-home pay, tax-oriented salary and payslip tooling, emergency savings targets, retirement annuity planning, optional **Investec** banking connectivity, and investment portfolios (TFSA view, ETFs via Google Sheets pricing, government bonds, FX-aware holdings, rebalancing helpers).

[![CI](https://github.com/andrewallkin/budgethq/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewallkin/budgethq/actions/workflows/ci.yml)

## Features

- **Budget** — Needs / wants / savings structure with charts, autosaved per authenticated user
- **Tax & payslip** — SARS-aligned PAYE/UIF/medical rebate logic driven by FY-specific tables; payslip model with fringe benefits; optional PDF storage in Google Cloud Storage
- **Emergency savings** — goals tied to budget "Needs" (3/6/12 months) with progress and time-to-goal views
- **RA** — performance and tax-benefit scenarios using the same tax engine as the budget flow
- **Investments** — account hub at `/investments` (Sheets and Sygnia), target allocation, transactions, Sheets-backed ETF prices, FX worksheet integration, snapshots and scheduled summaries
- **Investec** (optional) — account sync, transactions, categorization rules, budget analysis; per-user credentials stored encrypted (`ENCRYPTION_KEY`)
- **External API** — per-user `bhq_` API keys (full-access and read-only) for bot integrations
- **Auth** — JWT login with optional username allowlist; per-user data isolation

Product docs live in [docs/](docs/): [monthly budget income](docs/monthly-budget-income.md), [budget analysis after pots](docs/future-budget-analysis-pots.md), [paper UI conventions](docs/ui.md), [external investments API](docs/external-investments-api.md), [external budget/transactions API](docs/external-budget-transactions-api.md).

## Quick start

```bash
cp .env.example .env   # fill in values (see .env.example for every variable)
make dev-up            # docker-compose -f docker-compose.dev.yml up -d
```

- **Frontend:** http://localhost:3000 (Vite HMR; rebuild with `make dev-build` after `package.json` changes)
- **Backend / API docs:** http://localhost:8000 and http://localhost:8000/docs
- **Postgres (host):** `localhost:${POSTGRES_PORT:-5432}`

## How it works

```
browser ── Cloudflare TLS ──▶ VPS nginx (subdomain vhost)
                                 │
                                 ▼  127.0.0.1:${FRONTEND_PORT}
                          frontend (nginx, static SPA)
                                 │  /api proxy
                                 ▼  backend:8000 (compose network)
                          backend (FastAPI) ──▶ postgres ──▶ GCS / Google Sheets / Investec / OpenRouter
```

- `frontend/` — React + Vite + TailwindCSS + Recharts SPA; the bundled nginx container serves static assets and proxies `/api/` to the backend, so the browser sees a single origin in production.
- `backend/app/` — FastAPI app: `routers/` by feature, SQLAlchemy models in `models.py`, settings in `config.py` (pydantic-settings), auth in `auth.py`, Alembic migrations in `backend/alembic/`.
- `docker-compose.yml` — production-style stack; host ports loopback-bound (`127.0.0.1:`), the control panel fronts them with nginx + TLS. `docker-compose.dev.yml` — local dev with `--reload`, bind-mounted frontend source, exposed Postgres.
- `backend/app/scheduler.py` — APScheduler jobs for periodic ETF/FX price sync.

## Environment

**Single source of truth: [.env.example](.env.example)** — copy it to `.env` and fill in values. Every variable the backend reads is documented there with its default. Notes:

- The backend **builds** the database URL from `POSTGRES_USER/PASSWORD/DB/HOST/PORT`; it does not read a separate `DATABASE_URL`.
- `JWT_SECRET_KEY` is required — generate with `openssl rand -hex 32`.
- `AUTHORIZED_USERS`: empty/unset = open access; populated = only those usernames may register, login, or change username.
- `CORS_ORIGINS`: only mounted when non-empty. Leave unset when UI and API share an origin (the VPS setup).
- `GCP_SERVICE_ACCOUNT_CREDENTIALS` must be the service account JSON **Base64-encoded** (not a file path).

## Deployment (VPS control panel)

The panel deploys budgethq in **image mode**: it manages `.env` on the VPS, pulls images from Docker Hub by tag, runs migrations, and health-checks `/api/health`.

- CI builds and pushes `backend`/`frontend` images to Docker Hub on every push to `main` ([deploy.yml](.github/workflows/deploy.yml)).
- The panel's `.env` overrides `POSTGRES_*`, `BACKEND_PORT`/`FRONTEND_PORT` (allocated in the 10000–19999 range), and image tags.
- Migrations run via `run_migrations.sh` inside the backend container (`docker compose run --rm --no-deps backend ...`).
- Schema changes are Alembic migrations in `backend/alembic/versions/`; never edit tables by hand.

## External API (bots)

Machine clients (Grok bots etc.) authenticate with per-user API keys generated in Settings — full-access (`bhq_...`) or read-only — passed as `Authorization: Bearer` tokens and verified against bcrypt hashes stored per user. Endpoints:

| Area | Docs |
|------|------|
| Investments summary / composition | [docs/external-investments-api.md](docs/external-investments-api.md) |
| Budget & transactions (read + write) | [docs/external-budget-transactions-api.md](docs/external-budget-transactions-api.md) |
| Manual accounts | [docs/](docs/) (`external_manual_accounts` router) |

## Development

```bash
# backend tests (from repo root)
uv sync --frozen --extra backend --extra dev
uv run pytest

# frontend checks
cd frontend && npm test

# migrations loop
make migrate-create MSG='short_description'   # review the generated script
make migrate                                  # against a disposable dev DB first
```

Interactive API docs are at `/docs` when the backend is running. Makefile helpers: `make dev-up / dev-build / dev-down / dev-logs / dev-shell`, `make prod-up / prod-down`, `make migrate*`, `make clean`.
