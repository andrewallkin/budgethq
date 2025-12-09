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

### Start the stack

1. Build and start the containers:
   ```bash
   docker-compose up --build
   ```

2. Open your browser and navigate to:
   `http://localhost:3000`

3. Application data is persisted in the `data/` directory.

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

### Initial Setup (First Time)

If you have an existing database with data:
```bash
docker-compose exec backend bash
alembic revision --autogenerate -m "initial_migration"
alembic stamp head  # Mark as migrated without running
exit
```

### Creating New Migrations

When you modify models in `backend/app/models.py`:
```bash
docker-compose exec backend bash
alembic revision --autogenerate -m "describe_your_changes"
alembic upgrade head
exit
```

### Common Commands

```bash
# Check current version
docker-compose exec backend alembic current

# View migration history
docker-compose exec backend alembic history

# Upgrade to latest
docker-compose exec backend alembic upgrade head

# Rollback one version
docker-compose exec backend alembic downgrade -1
```

For detailed migration guides, see:
- `backend/MIGRATIONS.md` - Development workflow
- `DEPLOYMENT.md` - CI/CD and production deployments

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