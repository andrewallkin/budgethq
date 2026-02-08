## 💰 Financial Dashboard

A personal finance dashboard for South African users, built with **React** and **FastAPI**, focused (for now) on two core areas: a monthly **Budget Dashboard** and a **TFSA Portfolio** view.

**🌟 Key Highlights:**
- 🔄 **Live ETF Price Sync** via Google Sheets integration with background scheduler
- 🛡️ **Emergency Savings Tracking** with automated expense coverage calculation
- 👴 **RA Tax Calculator** to optimize retirement annuity contributions
- 🏦 **Multi-Asset Support** for ETFs and Government Bonds in TFSA tracking
- 📊 **Smart Rebalancing Engine** with automated buy/sell recommendations
- 🔐 **Secure Authentication** with JWT tokens and restricted registration
- 🗃️ **Automated Local DB Restore** from GCS production backups
- 🐳 **Full Docker Support** with separate dev and production environments
- �️ **Database Migrations** via Alembic for safe schema updates
- �🎨 **Modern UI** with dark mode, sortable tables, and interactive modals
- 📈 **TFSA Limit Tracking** for annual and lifetime contributions
- 🔄 **CI/CD Pipeline** with automated deployments and health checks

### Core Features

- **Authentication**
  - Email/username + password with JWT-based auth.
  - Per-user storage of budget and TFSA portfolio in the database.
  - **Restricted Registration**: Registration limited to authorized email addresses for security.

- **💸 Payslip & Tax**
  - **Detailed Salary Management**: Input your complete payslip with earnings, deductions, and fringe benefits.
  - **Fringe Benefit Tracking**: Account for non-cash benefits that affect your taxable income (Medical Aid, Group Life, etc.).
  - **Accurate Tax Calculations**: SARS-compliant PAYE calculations that include fringe benefits in taxable income.
  - **Net Income Focus**: All budgeting is based on your actual take-home pay after all deductions.
  - **Flexible Deduction Management**: Add any custom deductions or contributions without predefined placeholders.
  - **Real-time Updates**: Automatic recalculation of taxes and net income as you modify your salary structure.

- **💰 Budget Dashboard**
  - **Income & Tax**: Capture monthly gross salary and age and get automatic SARS 2025/2026 PAYE and UIF calculations.
  - **50/30/20 Style Categories**: Organise spending into **Needs**, **Wants**, and **Savings** with fully editable sub‑categories.
  - **Auto-Save**: All edits to salary, age, and categories are saved automatically to your account.
  - **Visualisations**:
    - Overall pie chart showing Needs/Wants/Savings/Unallocated net income.
    - Per‑tab pie chart showing the breakdown within the currently selected category.
  - **Summary Stats**: Net income, total Needs/Wants/Savings, and remaining amount.

- **🛡️ Emergency Savings**
  - **Expense-Linked Goals**: Set targets based on 3, 6, or 12 months of "Needs" from your budget.
  - **Flexible Targets**: Choose between "Months of Expenses" or a specific "Target Value".
  - **Progress Tracking**: Visual status indicators (Adequate, Good, Insufficient) with progress bars.
  - **Time-to-Goal Calculator**: Automatically estimates how many months of saving are required to reach your target.
  - **Auto-Save**: Seamless persistence of savings progress and goals.

- **👴 RA Tax Calculator**
  - **Tax Benefit Optimization**: See real-time PAYE savings based on different Retirement Annuity (RA) contribution levels.
  - **Scenario Comparison**: Compare your current contribution against 10% and 15% salary contribution scenarios.
  - **Unified Tracking**: Store your current RA valuation and monthly contributions.
  - **Smart Integration**: Uses the same SARS tax engine as the main budget dashboard.

- **📈 TFSA Portfolio**
  - **Multi-Asset Support**: 
    - Track **ETFs** with JSE tickers and live price updates from Google Sheets
    - Manage **Government Bonds** with manual value tracking (no ticker needed)
    - Unified holdings view with type badges to distinguish between ETFs and bonds
  - **Live Price Integration**: 
    - Automatic price sync from Google Sheets every 5 minutes via background scheduler
    - Manual refresh button with real-time sync status indicator
    - "Last updated" timestamp with color-coded freshness (green/yellow/gray)
    - GOOGLEFINANCE formula integration for real-time ETF pricing
  - **Transaction Management**:
    - Dedicated **Buy/Sell Modal** with automatic share calculation for ETFs
    - **Transaction History Component** showing all ETF and bond transactions
    - Transaction type badges (BUY/SELL) with visual indicators
    - Automatic share count updates for ETFs based on transactions
    - Value tracking for bond transactions
    - Expandable transaction list (shows recent 5, expand for all)
  - **Portfolio Analytics**:
    - Real-time profit/loss calculation vs. total contributions
    - Target vs. actual allocation comparison with color-coded deviations
    - **Advanced Sortable Holdings Table**:
      - Sort by: name, ticker, region, shares, price, value, target %, actual %
      - Visual sort direction indicators (ascending/descending)
      - Responsive design with hover effects
    - **Click-to-edit target percentages** via dedicated edit modal
    - Color-coded allocation status (green = balanced, yellow/red = needs rebalancing)
  - **Modern UI Components**:
    - **AddETFModal**: Create new ETF holdings with Google Sheets sync
    - **AddBondModal**: Create government bond holdings with region selection
    - **BuySellModal**: Record transactions with automatic calculations
    - **EditHoldingModal**: Update target allocation percentages
    - **CSVUploadModal**: Bulk import ETFs with validation and preview
    - **ConfirmModal**: Reusable confirmation dialogs with customizable variants
    - **PriceRefreshIndicator**: Live sync status with manual refresh capability
    - **TransactionHistory**: Comprehensive transaction log with filtering
  - **Smart Rebalancing Engine**:
    - Set deviation threshold (e.g., 5%)
    - Get step-by-step "sell X / buy Y" instructions
    - Includes both ETFs and bonds in rebalancing calculations
    - Visual deviation indicators per holding
  - **Bulk Operations**: 
    - CSV import for multiple ETF holdings at once
    - Automatic Google Sheets sync on import
    - Validation and error handling for bulk uploads
  - **TFSA Contribution Tracking**: 
    - Monitor annual limit (R36,000) and lifetime limit (R500,000)
    - Visual progress bars with color-coded warnings
    - SA Financial Year aware (March - February)
    - Historical contribution management by financial year
    - Automatic validation to prevent exceeding limits
    - Deposit tracking with date stamps
  - **Visualizations**:
    - Pie chart of current allocation by value
    - Target vs. actual bar charts (responsive height based on holdings count)
    - "What-if" calculator for investment scenarios based on target allocations
    - Deviation indicators showing over/under-allocated positions
  - **Dark Mode Support**: Complete dark mode theming across all components and modals
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
GCP_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id

# Authentication & Security
AUTHORIZED_USERS=user1@example.com,user2@example.com  # Comma-separated list of authorized usernames

# Local Development DB Restore (GCS)
LOCAL_USERNAME=your_authorized_email@example.com
LOCAL_PASSWORD=your_local_dev_login_password
RESTORE_TARGET_USERNAME=andrewallkin@gmail.com  # Optional: Only restore data for this user (defaults to andrewallkin@gmail.com)
```

### Local Database Initialization (`db-init`)

When running in development mode (`make dev-up`), the stack includes a `db-init` container that automatically:
1. **Connects to Google Cloud Storage** using your service account credentials.
2. **Downloads the latest production backup**.
3. **Restores the full backup** to your local PostgreSQL instance (including all user data).
4. **Cleans up unwanted data**: Automatically discovers all tables with user data and removes all records not belonging to `andrewallkin@gmail.com`.
5. **Updates your local password**: Uses `LOCAL_USERNAME` and `LOCAL_PASSWORD` to update the restored user's password so you can log in locally with your preferred development credentials.

This approach works with any backup format (INSERT, COPY, etc.) and automatically adapts to schema changes. When you add new tables with `user_id` columns, the cleanup process will automatically discover and clean them up without requiring code changes.

### Database Persistence Control

The development environment now supports two database modes:

- **Persistent Mode** (`make dev-up`): Database state persists between container restarts. Schema changes and test data are maintained, making iterative development seamless.

- **Restore Mode** (`make dev-up-restore`): Downloads and restores the latest production backup fresh each time, ensuring you always have current production data for testing. **Security: Full backup is restored, then all non-`andrewallkin@gmail.com` data is automatically removed - the database will NEVER contain other users' data.**

**Usage Examples:**

```bash
# Start with persistent database (default - preserves your work)
make dev-up

# Make schema changes and run migrations
make migrate-create MSG="add_feature"
make migrate

# Continue development (database persists)
make dev-up

# Need fresh data again? Use restore mode
make dev-up-restore
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
make dev-up          # Start with persistent database (default)
make dev-build       # Rebuild and start with persistent database
make dev-up-restore  # Start with fresh database from backup
make dev-build-restore # Rebuild and start with fresh database from backup
make dev-down        # Stop development environment
make dev-logs        # View all development logs
make dev-logs-restore# View restore-specific logs
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

## Google Sheets Integration

The application uses Google Sheets as a data source for ETF prices and as a sync target for holdings:

### Setup Steps

1. **Create a Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google Sheets API

2. **Create a Service Account**:
   - Navigate to "IAM & Admin" → "Service Accounts"
   - Create a new service account
   - Generate a JSON key file
   - Copy the entire JSON content for your `.env` file

3. **Create Your Google Sheet**:
   - Create a new Google Sheet (this will contain per-user tabs)
   - The application will automatically create user-specific tabs (e.g., "user_1", "user_2")
   - Each user's tab will have columns: `Ticker`, `ETF Name`, `Price`
   - Price formulas will be auto-generated: `=GOOGLEFINANCE(A2,"price")/100`

4. **Share the Sheet**:
   - Copy the service account email (from the JSON key)
   - Share your Google Sheet with this email address (Editor access)
   - Copy the spreadsheet ID from the URL for your `.env` file

5. **Configure Environment**:
   - Add `GCP_SERVICE_ACCOUNT_CREDENTIALS` (entire JSON as string)
   - Add `GOOGLE_SPREADSHEET_ID` (from sheet URL)

### How It Works

- **Price Sync**: Background job runs every 5 minutes fetching latest prices from each user's sheet
- **Holdings Sync**: When you add/update ETFs via the UI, changes sync to your user-specific sheet tab
- **Manual Refresh**: Click the refresh button to trigger an immediate price update from your sheet
- **Offline Mode**: If Google Sheets is unavailable, the app continues using last known prices
- **Per-User Sheets**: Each user gets their own sheet tab (e.g., "user_123") for complete data isolation

## Local Development

### Prerequisites
- [uv](https://github.com/astral-sh/uv) - Fast Python package installer and resolver
- Node.js 18+ (for frontend)
- Docker and Docker Compose (for containerized development)

### Backend
Backend code lives in `backend/`.

To run it locally:
```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies and run
uv sync
uv run uvicorn app.main:app --reload
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
- `/api/calculate/ra-tax` - RA tax benefit scenario calculator
- `/api/calculate/rebalance` – portfolio rebalancing engine (ETFs + bonds)

**Emergency Savings:**
- `/api/emergency-savings/default_user` - manage emergency fund goals and progress

**Retirement Annuity:**
- `/api/ra/default_user` - manage RA valuation and contributions

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
docker-compose -f docker-compose.dev.yml exec backend uv run alembic current

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
docker-compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head

# Create migration
docker-compose -f docker-compose.dev.yml exec backend uv run alembic revision --autogenerate -m "description"

# Stamp database
docker-compose -f docker-compose.dev.yml exec backend uv run alembic stamp head

# Check current version
docker-compose -f docker-compose.dev.yml exec backend uv run alembic current

# View history
docker-compose -f docker-compose.dev.yml exec backend uv run alembic history

# Rollback
docker-compose -f docker-compose.dev.yml exec backend uv run alembic downgrade -1
```

### 📚 Additional Resources

For detailed migration workflows and troubleshooting, see [DOCKER_SETUP.md](DOCKER_SETUP.md).

## CI/CD

The project includes automated deployment via GitHub Actions:
- Automatic deployment on push to `main` branch
- **Manual deployment with branch selection** via GitHub Actions UI
- Database migrations run automatically during deployment
- Clean, organized deployment logs with collapsible sections
- Zero-downtime deployments with health checks

Deployment workflow:
1. Pull latest code on VPS (from specified branch)
2. Build Docker images
3. Start containers with proper environment variables
4. **Run migrations automatically** ✨
5. Verify deployment health
6. Cleanup old containers and images

**Manual Deployment:**
Navigate to Actions → Deploy to VPS → Run workflow → Select branch to deploy

### Required GitHub Actions Secrets

The following secrets must be configured in your GitHub repository settings for deployment:

**Database & Infrastructure:**
- `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY` - VPS connection details
- `GH_USERNAME`, `GH_PAT` - GitHub credentials for code sync
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `DATABASE_URL` - Database configuration

**Application Secrets:**
- `AUTHORIZED_USERS` - Comma-separated list of authorized usernames for registration/login
- `BACKEND_PORT`, `FRONTEND_PORT` - Application ports
- `GCP_SERVICE_ACCOUNT_CREDENTIALS` - Google Cloud service account JSON
- `GCS_DB_BACKUP_BUCKET_NAME` - Google Cloud Storage bucket name
- `GOOGLE_SPREADSHEET_ID` - Google Sheets integration (per-user tabs)
- `BACKUP_RETENTION_DAYS`, `BACKUP_SCHEDULE_HOUR`, `BACKUP_SCHEDULE_MINUTE` - Backup configuration

## Troubleshooting

### Google Sheets Issues

**Problem**: Prices not updating
- **Solution**: Check that service account email has Editor access to the sheet
- Verify `GCP_SERVICE_ACCOUNT_CREDENTIALS` is valid JSON
- Check logs: `make dev-logs` or `docker-compose logs backend`
- Manually trigger sync via the UI refresh button

**Problem**: ETFs not appearing in sheet
- **Solution**: Check that spreadsheet ID is correct
- User-specific tabs are created automatically (e.g., "user_123")
- Ensure spreadsheet is shared with service account email
- Check logs for tab creation errors

### Database Migration Issues

**Problem**: Migration fails on startup
- **Solution**: Check if migration files exist in `backend/alembic/versions/`
- Verify database connection: `make dev-shell` → `uv run alembic current`
- If needed, stamp database: `make migrate-stamp`

**Problem**: "Target database is not up to date" error
- **Solution**: Run pending migrations: `make migrate`
- Check migration history: `make migrate-history`

### Registration Issues

**Problem**: Cannot register new account
- **Solution**: Ensure username is included in `AUTHORIZED_USERS` environment variable
- Check backend logs for validation errors
- Verify username is entered correctly and matches one of the authorized users (case-sensitive)

### General Issues

**Problem**: Container won't start
- **Solution**: Check logs: `make dev-logs`
- Verify all required environment variables are set
- Try rebuilding: `make dev-build`
- Clean start: `make clean && make dev-up`

**Problem**: Hot reload not working
- **Solution**: Ensure using `docker-compose.dev.yml` (not production compose file)
- Check volume mounts are correct in compose file
- Restart containers: `make dev-down && make dev-up`

For more detailed troubleshooting, see [DOCKER_SETUP.md](DOCKER_SETUP.md).