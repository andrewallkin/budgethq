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
  - **ETF Management**: Maintain a list of ETFs with ticker, region, target allocation %, and current value.
  - **Automatic Rebalancing Plan**:
    - Set a deviation **threshold** (e.g. 5%).
    - Backend calculates a step‑by‑step plan of “sell X / buy Y” actions to move back toward targets.
  - **Validation**: Warning if target percentages do not sum to 100%.
  - **Visualisations**:
    - Pie chart of current ETF allocation by value.
  - **Auto-Save**: Portfolio changes are automatically persisted per user.

### Architecture

- **Frontend**: React + Vite + TailwindCSS + Recharts
- **Backend**: FastAPI + SQLAlchemy + Pandas
- **Auth**: JWT bearer tokens with secure password hashing
- **Persistence**: Relational database (via SQLAlchemy models) behind the API
- **Containerisation**: Docker + Docker Compose

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
- `/api/budget/default_user` – read/write the authenticated user’s budget
- `/api/portfolio` – read/write the authenticated user’s TFSA ETF portfolio
- `/api/calculate/tax` – SARS PAYE + UIF calculation endpoint
- `/api/calculate/rebalance` – TFSA rebalancing engine
- `/api/auth/*` – auth endpoints (register, login, change password)

### Frontend
Frontend code lives in `frontend/`.

To run it locally:
```bash
cd frontend
npm install
npm run dev
```

By default the Vite dev server runs on `http://localhost:3000` and expects the FastAPI backend to be accessible (usually on `http://localhost:8000`, proxied in Docker).