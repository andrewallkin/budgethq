from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
from pathlib import Path
from .logic import calculate_monthly_tax_with_age, calculate_uif, calculate_rebalancing

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simplicity in this demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Directories
DATA_DIR = Path("data")
USERS_DIR = DATA_DIR / "users"
BUDGET_DIR = DATA_DIR / "budgets"
TFSA_PORTFOLIO_FILE = DATA_DIR / "tfsa_portfolio.csv"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
USERS_DIR.mkdir(exist_ok=True)
BUDGET_DIR.mkdir(exist_ok=True)

# Models
class Category(BaseModel):
    name: str
    amount: float

class BudgetData(BaseModel):
    salary: float
    age: int
    needs: List[Category]
    wants: List[Category]
    savings: List[Category]

class ETF(BaseModel):
    ETF: str
    Region: str
    Target_Percentage: float
    Current_Value: float

class TaxRequest(BaseModel):
    salary: float
    age: int

class RebalanceRequest(BaseModel):
    etfs: List[ETF]
    threshold: float

# Helper Functions
def get_user_budget_file(username: str):
    return BUDGET_DIR / f"budget_data_{username}.json"

# Endpoints

@app.get("/api/budget/{username}")
async def get_budget(username: str):
    data_file = get_user_budget_file(username)
    if data_file.exists():
        try:
            with open(data_file, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}

@app.post("/api/budget/{username}")
async def save_budget(username: str, data: BudgetData):
    data_file = get_user_budget_file(username)
    with open(data_file, "w") as f:
        json.dump(data.dict(), f, indent=2)
    return {"status": "success"}

@app.post("/api/calculate/tax")
async def calculate_tax_endpoint(req: TaxRequest):
    if req.age < 65:
        age_group = "under_65"
    elif req.age < 75:
        age_group = "65_to_74"
    else:
        age_group = "75_and_over"
        
    monthly_tax = calculate_monthly_tax_with_age(req.salary, age_group)
    monthly_uif = calculate_uif(req.salary)
    
    return {
        "monthly_tax": monthly_tax,
        "monthly_uif": monthly_uif
    }

@app.get("/api/portfolio")
async def get_portfolio():
    if TFSA_PORTFOLIO_FILE.exists():
        import pandas as pd
        try:
            df = pd.read_csv(TFSA_PORTFOLIO_FILE)
            return df.to_dict('records')
        except Exception:
            return []
    return []

@app.post("/api/portfolio")
async def save_portfolio(etfs: List[ETF]):
    import pandas as pd
    df = pd.DataFrame([etf.dict() for etf in etfs])
    df.to_csv(TFSA_PORTFOLIO_FILE, index=False)
    return {"status": "success"}

@app.post("/api/calculate/rebalance")
async def calculate_rebalance_endpoint(req: RebalanceRequest):
    etfs_dicts = [etf.dict() for etf in req.etfs]
    actions, over, under = calculate_rebalancing(etfs_dicts, req.threshold)
    return {
        "actions": actions,
        "over_allocated": over,
        "under_allocated": under
    }
