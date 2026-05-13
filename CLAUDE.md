# CLAUDE.md

Guidance for Claude Code and other AI agents working in this repository.

## Project Overview

BudgetHQ is a personal finance dashboard for South African users. It combines:

- A React/Vite frontend in `frontend/`
- A FastAPI/SQLAlchemy backend in `backend/`
- PostgreSQL schema management with Alembic migrations in `backend/alembic/`
- Docker Compose deployment for the VPS and development stack
- GitHub Actions deployment through `.github/workflows/deploy.yml`

Core product areas include budgeting, salary and tax calculations, emergency savings, TFSA and investment portfolio tracking, Investec integration, Google Sheets ETF price syncing, and authenticated per-user data.

## Critical Local Verification Rule

Do not build or run the frontend or backend locally to verify changes unless the user explicitly asks for it.

This includes, but is not limited to:

- Do not run Docker or Docker Compose commands such as `docker compose build`, `docker compose up`, `make dev-up`, `make dev-build`, or migration commands that execute inside containers.
- Do not run npm commands such as `npm install`, `npm run build`, `npm run lint`, `npm test`, or `npm run dev`.
- Do not run backend checks such as `uv run pytest`, `pytest`, `uvicorn`, or other local server/test/build commands.

Prefer static inspection, targeted code reading, and editor diagnostics. If verification would normally require one of the commands above, explain that it was not run because of this repository rule.

## Repository Layout

- `frontend/src/` contains React pages, components, context, and utility modules.
- `frontend/src/pages/` contains route-level screens such as dashboards, portfolio pages, and settings.
- `frontend/src/components/` contains shared UI and feature components.
- `frontend/src/utils/` contains formatting, categorization, and feature helpers.
- `backend/app/` contains the FastAPI app, routers, models, services, auth, config, and database code.
- `backend/app/routers/` contains API route modules grouped by feature.
- `backend/alembic/versions/` contains database migrations.
- `tests/` contains Python tests.
- `openapi.json` is the checked-in API schema snapshot.

## Frontend Conventions

- Follow the existing React component style in nearby files.
- Use existing utility functions from `frontend/src/utils/` before adding new formatting or calculation helpers.
- Keep UI changes scoped to the relevant page/component unless a shared component is clearly already used for that pattern.
- Preserve existing dark-mode Tailwind classes and responsive behavior when editing UI.
- Be careful with financial display logic: currency formatting, percentages, signs, and South African financial year behavior are product-sensitive.

## Backend Conventions

- FastAPI routes live under `backend/app/routers/`; keep feature-specific logic close to its existing router/service.
- SQLAlchemy models live in `backend/app/models.py`.
- Shared database/session/auth/config behavior lives in `backend/app/database.py`, `backend/app/auth.py`, and `backend/app/config.py`.
- Prefer adding service/helper logic near existing feature services rather than placing large business logic directly in routers.
- Keep API response shapes stable unless the user specifically requests a breaking change.

## Database And Migrations

- Use Alembic migrations for schema changes.
- Migration files belong in `backend/alembic/versions/`.
- Review generated or edited migrations carefully for data safety.
- Do not run local migration commands unless the user explicitly asks, because they rely on local Docker/container execution in this repo.

## Deployment Notes

- Deployment is handled by GitHub Actions in `.github/workflows/deploy.yml`.
- The VPS deployment builds Docker images, starts containers, and runs migrations remotely.
- Repository secrets provide production environment values; do not add real secrets to the repo.
- `.env.example` is the place for documenting environment variables without secret values.

## Working Tree Safety

- This repo may have user changes in progress. Do not revert unrelated edits.
- Before editing an already-modified file, read it and work with the existing changes.
- Keep changes narrowly scoped to the user's request.
- Do not commit unless the user explicitly asks.

