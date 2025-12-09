## 💰 Financial Dashboard

A personal finance dashboard for South African users, built with **React** and **FastAPI**, focused (for now) on two core areas: a monthly **Budget Dashboard** and a **TFSA Portfolio** view.

### Core Features

- **Authentication**
  - Email/username + password with JWT-based auth.
  - Per-user storage of budget and TFSA portfolio in the database.

- **💰 Budget Dashboard**
  - **Income & Tax**: Capture monthly gross salary and age and get automatic SARS 2025/2026 PAYE and UIF calculations.
  - **50/30/20 Style Categories**: Organise spending into **Needs**, **Wants**, and **Savings** with fully editable sub‑categories.
  - **Auto-Save**: All edits to salary, age, and categories are saved automatically to your account.
  - **Visualisations**:
    - Overall pie chart showing Needs/Wants/Savings/Unallocated net income.
    - Per‑tab pie chart showing the breakdown within the currently selected category.
  - **Summary Stats**: Net income, total Needs/Wants/Savings, and remaining amount.

- **📈 TFSA Portfolio**
  - **Multi-Asset Support**: 
    - Track **ETFs** with JSE tickers and live price updates from Google Sheets
    - Manage **Government Bonds** with manual value tracking (no ticker needed)
  - **Live Price Integration**: 
    - Automatic price sync from Google Sheets every 5 minutes
    - Manual refresh button with "last updated" timestamp
    - GOOGLEFINANCE formula integration for real-time ETF pricing
  - **Transaction Management**:
    - Full buy/sell transaction history for both ETFs and bonds
    - Automatic share count updates for ETFs
    - Value tracking for bond transactions
  - **Portfolio Analytics**:
    - Real-time profit/loss calculation vs. total contributions
    - Target vs. actual allocation comparison
    - Sortable holdings table (by name, ticker, region, shares, price, value, target %)
    - Click-to-edit target percentages
  - **Smart Rebalancing Engine**:
    - Set deviation threshold (e.g., 5%)
    - Get step-by-step "sell X / buy Y" instructions
    - Includes both ETFs and bonds in calculations
  - **Bulk Operations**: CSV import for multiple ETF holdings at once
  - **TFSA Contribution Tracking**: Monitor annual and lifetime limits with visual progress bars
  - **Visualizations**:
    - Pie chart of current allocation by value
    - Target vs. actual bar charts
    - "What-if" calculator for investment scenarios
  - **Auto-Save**: All changes automatically persisted per user

### Architecture

- **Frontend**: React + Vite + TailwindCSS + Recharts
- **Backend**: FastAPI + SQLAlchemy + Pandas
- **Auth**: JWT bearer tokens with secure password hashing
- **Database**: PostgreSQL with Alembic migrations for schema management
- **External Integrations**: Google Sheets API for live ETF price data
- **Background Jobs**: APScheduler for periodic price synchronization
- **Containerization**: Docker + Docker Compose with automated CI/CD deployments

## Running with Docker

### Prerequisites
- Docker and Docker Compose
- Make (optional, but recommended for easier commands)
- `.env` file in project root (see Environment Setup below)

### Docker Compose Files

This project uses separate configs for development and production:

| File | Purpose | Usage |
|------|---------|-------|
| `docker-compose.yml` | Production (default) | VPS deployment via CI/CD |
| `docker-compose.dev.yml` | Development | Local coding with hot reload |

### Environment Setup

Create a `.env` file in the project root:

```bash
# Database
POSTGRES_USER=budget_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=budget_db
POSTGRES_PORT=5432

# Application Ports
BACKEND_PORT=8000
FRONTEND_PORT=3000

# Database URL (must match POSTGRES_* variables)
DATABASE_URL=postgresql://budget_user:your_secure_password@postgres:5432/budget_db

# Google Sheets (get from Google Cloud Console)
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEET_NAME=ETF Holdings
```

### Start the stack

**For Development (Recommended):**
```bash
# Using Makefile (easiest)
make dev-up

# Or manually
docker-compose -f docker-compose.dev.yml up -d
```

**Features in dev mode:**
- ✅ Hot reload for backend and frontend code changes
- ✅ Migration files appear on local filesystem
- ✅ Direct database access (localhost:5432)
- ✅ Automatic code sync between host and container

**For Production (testing locally):**
```bash
docker-compose up -d
# or: make prod-up
# (VPS runs this via CI/CD automatically)
```

### Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Database:** localhost:5432 (dev mode only)

### Development Commands

```bash
# Container Management
make dev-up          # Start development environment
make dev-down        # Stop development environment
make dev-build       # Rebuild containers
make dev-logs        # View live logs
make dev-shell       # Access backend shell

# Database Migrations (see section below)
make migrate                        # Run pending migrations
make migrate-create MSG="desc"      # Create new migration
make migrate-stamp                  # Mark DB as up-to-date
make migrate-history                # View migration history
make migrate-rollback               # Undo last migration

# Utilities
make clean           # Remove all containers and volumes
make help            # Show all available commands
```

For detailed Docker setup information, see [DOCKER_SETUP.md](DOCKER_SETUP.md).

## Local Development

### Backend
Backend code lives in `backend/`.

To run it locally:
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The FastAPI app exposes:

**Budget Management:**
- `/api/budget/default_user` – read/write the authenticated user's budget

**TFSA Portfolio:**
- `/api/etf/holdings` – manage ETF holdings with live price tracking
- `/api/etf/transactions` – record buy/sell transactions for ETFs
- `/api/etf/sync-prices` – manually sync prices from Google Sheets
- `/api/etf/bulk-import` – import multiple ETFs from CSV
- `/api/bond/holdings` – manage government bond holdings
- `/api/bond/transactions` – record buy/sell transactions for bonds
- `/api/tfsa/contributions` – track TFSA contribution limits

**Calculations:**
- `/api/calculate/tax` – SARS PAYE + UIF calculation endpoint
- `/api/calculate/rebalance` – portfolio rebalancing engine (ETFs + bonds)

**Authentication:**
- `/api/auth/*` – register, login, change password endpoints

### Frontend
Frontend code lives in `frontend/`.

To run it locally:
```bash
cd frontend
npm install
npm run dev
```

By default the Vite dev server runs on `http://localhost:3000` and expects the FastAPI backend to be accessible (usually on `http://localhost:8000`, proxied in Docker).

## Database Migrations

This project uses **Alembic** for database schema management. This allows you to modify database tables without losing data.

### 🚀 Initial Setup (First Time Only)

If you have an existing database with data, you **must** create an initial migration baseline:

```bash
# 1. Start dev environment
make dev-up

# 2. Create initial migration (captures current schema)
make migrate-create MSG="initial_schema"

# 3. ⚠️ CRITICAL: Mark database as up-to-date (prevents data loss!)
make migrate-stamp

# 4. Verify it worked
docker-compose -f docker-compose.dev.yml exec backend alembic current

# 5. Check migration file appeared locally
ls backend/alembic/versions/

# 6. Commit and push
git add backend/alembic/versions/*.py
git commit -m "Add initial Alembic migration"
git push origin main
```

**Why `migrate-stamp` is critical:** It tells Alembic your database already has these tables, preventing it from trying to recreate them and **losing all your data** on the next deployment.

### 📝 Creating New Migrations

When you modify models in `backend/app/models.py`:

```bash
# 1. Edit your models
vim backend/app/models.py

# 2. Create migration (file appears in backend/alembic/versions/)
make migrate-create MSG="add_notes_column"

# 3. Review the generated file
cat backend/alembic/versions/*_add_notes_column.py

# 4. Test it locally
make migrate

# 5. Commit and push (CI/CD will apply it to production)
git add backend/alembic/versions/*.py
git commit -m "Add notes column migration"
git push
```

### 🔧 Migration Commands (via Makefile)

```bash
make migrate                        # Run all pending migrations
make migrate-create MSG="desc"      # Create new migration
make migrate-stamp                  # Mark DB as current (no changes)
make migrate-history                # Show all migrations
make migrate-rollback               # Undo last migration
```

### 🔍 Manual Migration Commands

If you prefer not to use the Makefile:

```bash
# Run migrations
docker-compose -f docker-compose.dev.yml exec backend alembic upgrade head

# Create migration
docker-compose -f docker-compose.dev.yml exec backend alembic revision --autogenerate -m "description"

# Stamp database
docker-compose -f docker-compose.dev.yml exec backend alembic stamp head

# Check current version
docker-compose -f docker-compose.dev.yml exec backend alembic current

# View history
docker-compose -f docker-compose.dev.yml exec backend alembic history

# Rollback
docker-compose -f docker-compose.dev.yml exec backend alembic downgrade -1
```

### 📚 Additional Resources

For detailed migration workflows and troubleshooting, see [DOCKER_SETUP.md](DOCKER_SETUP.md).

## CI/CD

The project includes automated deployment via GitHub Actions:
- Automatic deployment on push to `main` branch
- Database migrations run automatically during deployment
- Clean, organized deployment logs with collapsible sections

Deployment workflow:
1. Pull latest code on VPS
2. Build Docker images
3. Start containers
4. **Run migrations automatically** ✨
5. Verify deployment health