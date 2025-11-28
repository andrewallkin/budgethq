from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List
from . import models, database, auth
from .logic import calculate_monthly_tax_with_age, calculate_uif, calculate_rebalancing
from pydantic import BaseModel

# Initialize DB
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models
class CategoryBase(BaseModel):
    name: str
    amount: float

class BudgetData(BaseModel):
    salary: float
    age: int
    needs: List[CategoryBase]
    wants: List[CategoryBase]
    savings: List[CategoryBase]

class ETFBase(BaseModel):
    ETF: str
    Region: str
    Target_Percentage: float
    Current_Value: float

class TaxRequest(BaseModel):
    salary: float
    age: int

class RebalanceRequest(BaseModel):
    etfs: List[ETFBase]
    threshold: float

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# Auth Endpoints
@app.post("/api/auth/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = auth.create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Verify current password
    if not auth.verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Validate new password length
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters"
        )
    
    # Update password
    current_user.hashed_password = auth.get_password_hash(request.new_password)
    db.commit()
    
    return {"status": "success", "message": "Password changed successfully"}


# Protected Endpoints
@app.get("/api/budget/default_user") # Keep URL for compatibility, but ignore username param
async def get_budget(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()
    
    if not budget:
        return {}
        
    needs = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'needs').all()
    wants = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'wants').all()
    savings = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'savings').all()
    
    return {
        "salary": budget.salary,
        "age": budget.age,
        "needs": [{"name": c.name, "amount": c.amount} for c in needs],
        "wants": [{"name": c.name, "amount": c.amount} for c in wants],
        "savings": [{"name": c.name, "amount": c.amount} for c in savings]
    }

@app.post("/api/budget/default_user")
async def save_budget(data: BudgetData, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()
    
    if not budget:
        budget = models.Budget(user_id=current_user.id)
        db.add(budget)
        db.commit()
        db.refresh(budget)
    
    budget.salary = data.salary
    budget.age = data.age
    
    # Clear existing categories
    db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id).delete()
    
    # Add new categories
    for item in data.needs:
        db.add(models.BudgetCategory(budget_id=budget.id, type='needs', name=item.name, amount=item.amount))
    for item in data.wants:
        db.add(models.BudgetCategory(budget_id=budget.id, type='wants', name=item.name, amount=item.amount))
    for item in data.savings:
        db.add(models.BudgetCategory(budget_id=budget.id, type='savings', name=item.name, amount=item.amount))
        
    db.commit()
    return {"status": "success"}

@app.get("/api/portfolio")
async def get_portfolio(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    etfs = db.query(models.ETF).filter(models.ETF.user_id == current_user.id).all()
    return [{"ETF": e.ticker, "Region": e.region, "Target_Percentage": e.target_percentage, "Current_Value": e.current_value} for e in etfs]

@app.post("/api/portfolio")
async def save_portfolio(etfs: List[ETFBase], current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # Clear existing
    db.query(models.ETF).filter(models.ETF.user_id == current_user.id).delete()
    
    # Add new
    for etf in etfs:
        db.add(models.ETF(
            user_id=current_user.id,
            ticker=etf.ETF,
            region=etf.Region,
            target_percentage=etf.Target_Percentage,
            current_value=etf.Current_Value
        ))
    
    db.commit()
    return {"status": "success"}

# Public Calculation Endpoints
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

@app.post("/api/calculate/rebalance")
async def calculate_rebalance_endpoint(req: RebalanceRequest):
    etfs_dicts = [etf.dict() for etf in req.etfs]
    actions, over, under = calculate_rebalancing(etfs_dicts, req.threshold)
    return {
        "actions": actions,
        "over_allocated": over,
        "under_allocated": under
    }
