# 💰 Financial Dashboard

A comprehensive personal finance management tool, rewritten in React and FastAPI.

## Features

### 💰 Budget Dashboard
- **50/30/20 Rule**: Track Needs, Wants, and Savings.
- **Tax Calculations**: Automatic SARS tax (2025/2026) and UIF calculations.
- **Visualizations**: Interactive charts for budget breakdown.
- **Persistence**: Data is automatically saved.

### 📈 TFSA Portfolio
- **Portfolio Management**: Track ETFs and their target allocations.
- **Rebalancing**: Get actionable recommendations to rebalance your portfolio.
- **Visualizations**: Allocation charts and region breakdown.

## Architecture

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: FastAPI + Pandas
- **Containerization**: Docker + Docker Compose

## Getting Started

### Prerequisites
- Docker and Docker Compose

### Running the App

1. Build and start the containers:
   ```bash
   docker-compose up --build
   ```

2. Open your browser and navigate to:
   http://localhost:3000

3. The data will be persisted in the `data/` directory.

## Development

### Backend
The backend code is in `backend/`.
To run locally:
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
The frontend code is in `frontend/`.
To run locally:
```bash
cd frontend
npm install
npm run dev
```
Note: You'll need to ensure the backend is running and accessible.