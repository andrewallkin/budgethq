from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import date, datetime, timedelta
import csv
import io
from . import models, database, auth, history
from .logic import calculate_monthly_tax_with_age, calculate_uif, calculate_rebalancing
from .sheets_service import get_sheets_service
from .scheduler import start_scheduler, stop_scheduler, sync_all_prices, get_last_sync_time, set_last_sync_time, record_hourly_snapshot
from .utils import get_sast_now
from .logging_config import configure_logging
from pydantic import BaseModel

# Configure logging on startup
configure_logging()

# Initialize DB
# Note: Database tables are now managed by Alembic migrations
# Run: docker-compose exec backend alembic upgrade head
# models.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - start/stop background tasks."""
    # Startup: Start the price sync scheduler
    start_scheduler()
    # Run initial sync on startup
    await sync_all_prices()
    # Run initial snapshot on startup so we have data immediately
    await record_hourly_snapshot()
    yield
    # Shutdown: Stop the scheduler
    stop_scheduler()


app = FastAPI(lifespan=lifespan)

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
    group: Optional[str] = None

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

# TFSA Contribution Models
class TFSADepositBase(BaseModel):
    id: Optional[int] = None
    amount: float
    date: str  # ISO format date string

class TFSAHistoricalContributionBase(BaseModel):
    id: Optional[int] = None
    financial_year: str  # e.g., "2018/19"
    amount: float

class TFSAContributionData(BaseModel):
    historical_contributions: List[TFSAHistoricalContributionBase]
    deposits: List[TFSADepositBase]
    financial_year_start: int

# ETF Holdings Models (New System)
class ETFHoldingCreate(BaseModel):
    jse_ticker: str
    etf_name: str
    region: str
    shares: float
    target_percentage: float

class ETFHoldingUpdate(BaseModel):
    shares: Optional[float] = None
    target_percentage: Optional[float] = None
    region: Optional[str] = None

class ETFHoldingResponse(BaseModel):
    id: int
    jse_ticker: str
    etf_name: str
    region: str
    shares: float
    target_percentage: float
    current_price: Optional[float]
    total_value: Optional[float]
    price_updated_at: Optional[datetime]

class ETFTransactionCreate(BaseModel):
    holding_id: int
    transaction_type: str  # "BUY" or "SELL"
    shares: float
    price_per_share: float
    transaction_date: Optional[str] = None  # ISO format, defaults to now

class ETFTransactionResponse(BaseModel):
    id: int
    holding_id: int
    jse_ticker: str
    etf_name: str
    transaction_type: str
    shares: float
    price_per_share: float
    total_value: float
    transaction_date: datetime

class AddETFToSheetRequest(BaseModel):
    jse_ticker: str
    etf_name: str

class BulkImportResult(BaseModel):
    success: int
    failed: int
    errors: List[str]

# Bond Holdings Models
class BondHoldingCreate(BaseModel):
    bond_name: str
    region: str
    current_value: float
    target_percentage: float

class BondHoldingUpdate(BaseModel):
    current_value: Optional[float] = None
    target_percentage: Optional[float] = None
    region: Optional[str] = None

class BondHoldingResponse(BaseModel):
    id: int
    bond_name: str
    region: str
    current_value: float
    target_percentage: float
    updated_at: Optional[datetime]

class BondTransactionCreate(BaseModel):
    holding_id: int
    transaction_type: str  # "BUY" or "SELL"
    amount: float
    transaction_date: Optional[str] = None  # ISO format, defaults to now

class BondTransactionResponse(BaseModel):
    id: int
    holding_id: int
    bond_name: str
    transaction_type: str
    amount: float
    transaction_date: datetime

# Auth Endpoints
@app.post("/api/auth/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(database.get_db)):
    # Restrict registration to authorized email only
    if user.username != "andrewallkin@gmail.com":
        raise HTTPException(
            status_code=403, 
            detail="Registration is currently restricted. Only authorized users can create accounts."
        )
    
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
    
    # Restrict login to authorized email only
    if user.username != "andrewallkin@gmail.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted. This account is not authorized to login.",
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
        "needs": [{"name": c.name, "amount": c.amount, "group": c.group} for c in needs],
        "wants": [{"name": c.name, "amount": c.amount, "group": c.group} for c in wants],
        "savings": [{"name": c.name, "amount": c.amount, "group": c.group} for c in savings]
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
        db.add(models.BudgetCategory(budget_id=budget.id, type='needs', name=item.name, amount=item.amount, group=item.group))
    for item in data.wants:
        db.add(models.BudgetCategory(budget_id=budget.id, type='wants', name=item.name, amount=item.amount, group=item.group))
    for item in data.savings:
        db.add(models.BudgetCategory(budget_id=budget.id, type='savings', name=item.name, amount=item.amount, group=item.group))
        
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

# TFSA Contribution Endpoints
@app.get("/api/tfsa/contributions")
async def get_tfsa_contributions(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Get SA financial year (March to February)
    now = datetime.now()
    if now.month < 3:  # Jan or Feb
        financial_year_start = now.year - 1
    else:
        financial_year_start = now.year
    
    # Get historical contributions by year
    historical_contributions = db.query(models.TFSAHistoricalContribution).filter(
        models.TFSAHistoricalContribution.user_id == current_user.id
    ).all()
    
    # Get deposits for current financial year
    deposits = db.query(models.TFSADeposit).filter(
        models.TFSADeposit.user_id == current_user.id,
        models.TFSADeposit.financial_year_start == financial_year_start
    ).all()
    
    return {
        "historical_contributions": [
            {
                "id": h.id,
                "financial_year": h.financial_year,
                "amount": h.amount
            }
            for h in historical_contributions
        ],
        "financial_year_start": financial_year_start,
        "deposits": [
            {
                "id": d.id,
                "amount": d.amount,
                "date": (d.deposit_date.isoformat() + "Z") if d.deposit_date else None
            }
            for d in deposits
        ]
    }

@app.post("/api/tfsa/contributions")
async def save_tfsa_contributions(
    data: TFSAContributionData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Clear and update historical contributions
    db.query(models.TFSAHistoricalContribution).filter(
        models.TFSAHistoricalContribution.user_id == current_user.id
    ).delete()
    
    for hist in data.historical_contributions:
        db.add(models.TFSAHistoricalContribution(
            user_id=current_user.id,
            financial_year=hist.financial_year,
            amount=hist.amount
        ))
    
    # Clear existing deposits for this financial year and add new ones
    db.query(models.TFSADeposit).filter(
        models.TFSADeposit.user_id == current_user.id,
        models.TFSADeposit.financial_year_start == data.financial_year_start
    ).delete()
    
    for deposit in data.deposits:
        # Handle date strings with 'Z' suffix (e.g., '2025-09-16Z' -> '2025-09-16')
        deposit_date_str = deposit.date.replace('Z', '').split('T')[0] if deposit.date else None
        db.add(models.TFSADeposit(
            user_id=current_user.id,
            amount=deposit.amount,
            deposit_date=date.fromisoformat(deposit_date_str) if deposit_date_str else None,
            financial_year_start=data.financial_year_start
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


# =====================================================
# ETF Holdings Endpoints (New System)
# =====================================================

@app.get("/api/etf/holdings")
async def get_etf_holdings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get all ETF holdings for the current user with computed total values."""
    holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id,
        # Include holdings with shares > 0 OR target_percentage > 0
        or_(models.ETFHolding.shares > 0, models.ETFHolding.target_percentage > 0)
    ).all()
    
    result = []
    for h in holdings:
        total_value = (h.shares * h.current_price) if h.current_price else None
        result.append({
            "id": h.id,
            "jse_ticker": h.jse_ticker,
            "etf_name": h.etf_name,
            "region": h.region,
            "shares": h.shares,
            "target_percentage": h.target_percentage,
            "current_price": h.current_price,
            "total_value": total_value,
            "price_updated_at": (h.price_updated_at.isoformat() + "Z") if h.price_updated_at else None
        })
    
    return result


@app.post("/api/etf/holdings")
async def create_etf_holding(
    holding: ETFHoldingCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Create a new ETF holding."""
    # Check if holding already exists for this ticker
    existing = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id,
        models.ETFHolding.jse_ticker == holding.jse_ticker
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Holding for {holding.jse_ticker} already exists. Use PUT to update."
        )
    
    # Get current price from Google Sheets
    sheets_service = get_sheets_service()
    current_price = None
    price_updated_at = None
    
    if sheets_service.is_available():
        current_price = sheets_service.get_price_for_ticker(holding.jse_ticker)
        if current_price:
            price_updated_at = get_sast_now()
    
    new_holding = models.ETFHolding(
        user_id=current_user.id,
        jse_ticker=holding.jse_ticker,
        etf_name=holding.etf_name,
        region=holding.region,
        shares=holding.shares,
        target_percentage=holding.target_percentage,
        current_price=current_price,
        price_updated_at=price_updated_at
    )
    
    db.add(new_holding)
    db.commit()
    db.refresh(new_holding)
    
    total_value = (new_holding.shares * new_holding.current_price) if new_holding.current_price else None
    
    return {
        "id": new_holding.id,
        "jse_ticker": new_holding.jse_ticker,
        "etf_name": new_holding.etf_name,
        "region": new_holding.region,
        "shares": new_holding.shares,
        "target_percentage": new_holding.target_percentage,
        "current_price": new_holding.current_price,
        "total_value": total_value,
        "price_updated_at": (new_holding.price_updated_at.isoformat() + "Z") if new_holding.price_updated_at else None
    }


@app.put("/api/etf/holdings/{holding_id}")
async def update_etf_holding(
    holding_id: int,
    update: ETFHoldingUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update an existing ETF holding."""
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()
    
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    if update.shares is not None:
        holding.shares = update.shares
    if update.target_percentage is not None:
        holding.target_percentage = update.target_percentage
    if update.region is not None:
        holding.region = update.region
    
    db.commit()
    db.refresh(holding)
    
    total_value = (holding.shares * holding.current_price) if holding.current_price else None
    
    return {
        "id": holding.id,
        "jse_ticker": holding.jse_ticker,
        "etf_name": holding.etf_name,
        "region": holding.region,
        "shares": holding.shares,
        "target_percentage": holding.target_percentage,
        "current_price": holding.current_price,
        "total_value": total_value,
        "price_updated_at": (holding.price_updated_at.isoformat() + "Z") if holding.price_updated_at else None
    }


@app.delete("/api/etf/holdings/{holding_id}")
async def delete_etf_holding(
    holding_id: int,
    delete_from_sheet: bool = True,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Delete an ETF holding. Optionally also removes from Google Sheet."""
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()
    
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    
    jse_ticker = holding.jse_ticker
    
    # Delete associated transactions first
    db.query(models.ETFTransaction).filter(
        models.ETFTransaction.holding_id == holding_id
    ).delete()
    
    db.delete(holding)
    db.commit()
    
    # Also delete from Google Sheet if requested
    sheet_deleted = False
    if delete_from_sheet:
        sheets_service = get_sheets_service()
        if sheets_service.is_available():
            sheet_deleted = sheets_service.delete_etf_from_sheet(jse_ticker)
    
    return {
        "status": "success", 
        "message": f"Holding {holding_id} deleted",
        "sheet_deleted": sheet_deleted
    }


@app.post("/api/etf/bulk-import")
async def bulk_import_holdings(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Bulk import ETF holdings from a CSV file (UPSERT mode).
    
    - If holding exists: Updates shares, target_percentage, and region
    - If holding doesn't exist: Creates new holding
    - Google Sheets: Adds ticker if not present, skips if exists
    
    Required columns: jse_ticker, etf_name, region, shares, target_percentage
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    required_columns = {'jse_ticker', 'etf_name', 'region', 'shares', 'target_percentage'}
    
    # Validate headers
    if not required_columns.issubset(set(reader.fieldnames or [])):
        missing = required_columns - set(reader.fieldnames or [])
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}"
        )
    
    # Get prices from Google Sheets
    sheets_service = get_sheets_service()
    prices_map = {}
    sheets_available = sheets_service.is_available()
    
    if sheets_available:
        all_prices = sheets_service.get_all_etf_prices()
        prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}
    
    created_count = 0
    updated_count = 0
    failed_count = 0
    errors = []
    added_to_sheet = 0
    
    for row_num, row in enumerate(reader, start=2):
        try:
            jse_ticker = row['jse_ticker'].strip()
            etf_name = row['etf_name'].strip()
            
            # Check if already exists in database
            existing = db.query(models.ETFHolding).filter(
                models.ETFHolding.user_id == current_user.id,
                models.ETFHolding.jse_ticker == jse_ticker
            ).first()
            
            # Add to Google Sheet if not already there
            if sheets_available:
                if not sheets_service.check_ticker_exists(jse_ticker):
                    try:
                        if sheets_service.add_etf_to_sheet(jse_ticker, etf_name):
                            added_to_sheet += 1
                            # Refresh prices after adding
                            all_prices = sheets_service.get_all_etf_prices()
                            prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}
                    except Exception as sheet_err:
                        errors.append(f"Row {row_num}: Added to DB but failed to add to sheet - {str(sheet_err)}")
            
            # Handle empty shares (for ETFs you plan to buy)
            shares_str = row['shares'].strip()
            shares = float(shares_str) if shares_str else 0.0
            target_pct = float(row['target_percentage'])
            region = row['region'].strip()
            

            if shares < 0:
                errors.append(f"Row {row_num}: Shares cannot be negative")
                failed_count += 1
                continue

            current_price = prices_map.get(jse_ticker)
            price_updated_at = get_sast_now() if current_price else None

            # Calculate cost_basis as shares × current_price (initialize at current value)
            cost_basis = (shares * current_price) if (shares and current_price) else 0

            if existing:
                # UPDATE existing holding
                existing.shares = shares
                existing.target_percentage = target_pct
                existing.region = region
                existing.etf_name = etf_name  # Update name in case it changed
                if current_price:
                    existing.current_price = current_price
                    existing.price_updated_at = price_updated_at
                # Update cost_basis to match new share count (reset to current value)
                existing.cost_basis = cost_basis
                updated_count += 1
            else:
                # CREATE new holding
                new_holding = models.ETFHolding(
                    user_id=current_user.id,
                    jse_ticker=jse_ticker,
                    etf_name=etf_name,
                    region=region,
                    shares=shares,
                    target_percentage=target_pct,
                    current_price=current_price,
                    price_updated_at=price_updated_at,
                    cost_basis=cost_basis  # Initialize cost_basis
                )
                db.add(new_holding)
                created_count += 1

        except ValueError as e:
            errors.append(f"Row {row_num}: Invalid number format - {str(e)}")
            failed_count += 1
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            failed_count += 1

    db.commit()

    return {
        "created": created_count,
        "updated": updated_count,
        "failed": failed_count,
        "errors": errors,
        "added_to_sheet": added_to_sheet
    }


# =====================================================
# ETF Transaction Endpoints
# =====================================================

@app.get("/api/etf/transactions")
async def get_etf_transactions(
    holding_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get transaction history, optionally filtered by holding."""
    query = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.user_id == current_user.id
    )

    if holding_id:
        query = query.filter(models.ETFTransaction.holding_id == holding_id)

    transactions = query.order_by(models.ETFTransaction.transaction_date.desc()).all()

    result = []
    for t in transactions:
        holding = db.query(models.ETFHolding).filter(
            models.ETFHolding.id == t.holding_id
        ).first()

        result.append({
            "id": t.id,
            "holding_id": t.holding_id,
            "jse_ticker": holding.jse_ticker if holding else "Unknown",
            "etf_name": holding.etf_name if holding else "Unknown",
            "transaction_type": t.transaction_type,
            "shares": t.shares,
            "price_per_share": t.price_per_share,
            "total_value": t.total_value,
            "transaction_date": (t.transaction_date.isoformat() + "Z") if t.transaction_date else None
        })

    return result


@app.post("/api/etf/transactions")
async def create_etf_transaction(
    transaction: ETFTransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Record a buy or sell transaction.
    This also updates the holding's share count.
    """
    # Verify holding exists and belongs to user
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == transaction.holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    if transaction.transaction_type not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Transaction type must be 'BUY' or 'SELL'")

    if transaction.shares <= 0:
        raise HTTPException(status_code=400, detail="Shares must be positive")

    if transaction.price_per_share <= 0:
        raise HTTPException(status_code=400, detail="Price per share must be positive")

    # For SELL, ensure user has enough shares
    if transaction.transaction_type == "SELL" and holding.shares < transaction.shares:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient shares. You have {holding.shares}, trying to sell {transaction.shares}"
        )

    # Parse transaction date
    trans_date = get_sast_now()
    if transaction.transaction_date:
        try:
            trans_date = datetime.fromisoformat(transaction.transaction_date.replace('Z', '+00:00'))
        except ValueError:
            trans_date = get_sast_now()

    total_value = transaction.shares * transaction.price_per_share

    # Create transaction record
    new_transaction = models.ETFTransaction(
        user_id=current_user.id,
        holding_id=transaction.holding_id,
        transaction_type=transaction.transaction_type,
        shares=transaction.shares,
        price_per_share=transaction.price_per_share,
        total_value=total_value,
        transaction_date=trans_date
    )

    db.add(new_transaction)

    # Update holding share count
    if transaction.transaction_type == "BUY":
        holding.shares += transaction.shares
    else:  # SELL
        holding.shares -= transaction.shares

    db.commit()
    db.refresh(new_transaction)

    # Record transaction snapshot for historical tracking
    # This captures portfolio state at the moment of the transaction
    try:
        snapshot_result = history.record_transaction_snapshot(db, current_user.id, new_transaction.id)
    except Exception as e:
        # Don't fail the transaction if snapshot fails
        print(f"Warning: Failed to record transaction snapshot: {e}")
        snapshot_result = None

    return {
        "id": new_transaction.id,
        "holding_id": new_transaction.holding_id,
        "jse_ticker": holding.jse_ticker,
        "etf_name": holding.etf_name,
        "transaction_type": new_transaction.transaction_type,
        "shares": new_transaction.shares,
        "price_per_share": new_transaction.price_per_share,
        "total_value": new_transaction.total_value,
        "transaction_date": new_transaction.transaction_date.isoformat() + "Z",
        "updated_share_count": holding.shares,
        "cost_basis": holding.cost_basis
    }


@app.delete("/api/etf/transactions/{transaction_id}")
async def delete_etf_transaction(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Delete an ETF transaction and reverse its effects on the holding.
    """
    # Verify transaction exists and belongs to user
    transaction = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.id == transaction_id,
        models.ETFTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the holding
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == transaction.holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    # Reverse the transaction effects
    if transaction.transaction_type == "BUY":
        # Reverse BUY: subtract shares
        if holding.shares < transaction.shares:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete transaction: would result in negative shares"
            )
        holding.shares -= transaction.shares
        # Reverse cost basis: subtract the transaction value
        holding.cost_basis = max(0, (holding.cost_basis or 0) - (transaction.total_value or 0))
    else:  # SELL
        # Reverse SELL: add shares back
        holding.shares += transaction.shares
        # For SELL, we need to recalculate cost_basis from remaining transactions
        # since the original calculation was proportional
        history.update_holding_cost_basis(db, holding.id)

    # Delete transaction snapshots created when this transaction was made
    # Snapshots are created at the same time as the transaction, so we match by timestamp
    transaction_time = transaction.transaction_date
    if transaction_time:
        # Delete portfolio value history snapshots for this transaction (within 1 second window)
        time_window_start = transaction_time - timedelta(seconds=1)
        time_window_end = transaction_time + timedelta(seconds=1)
        
        db.query(models.PortfolioValueHistory).filter(
            models.PortfolioValueHistory.user_id == current_user.id,
            models.PortfolioValueHistory.snapshot_type == "transaction",
            models.PortfolioValueHistory.recorded_at >= time_window_start,
            models.PortfolioValueHistory.recorded_at <= time_window_end
        ).delete(synchronize_session=False)
        
        # Delete holding value history snapshots for this holding (within 1 second window)
        db.query(models.HoldingValueHistory).filter(
            models.HoldingValueHistory.user_id == current_user.id,
            models.HoldingValueHistory.holding_id == transaction.holding_id,
            models.HoldingValueHistory.snapshot_type == "transaction",
            models.HoldingValueHistory.recorded_at >= time_window_start,
            models.HoldingValueHistory.recorded_at <= time_window_end
        ).delete(synchronize_session=False)

    # Delete the transaction
    db.delete(transaction)
    db.commit()

    return {"message": "Transaction deleted successfully", "updated_share_count": holding.shares}


# =====================================================
# Google Sheets Integration Endpoints
# =====================================================

@app.post("/api/etf/sync-prices")
async def sync_etf_prices(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Manually trigger a price sync from Google Sheets."""
    sheets_service = get_sheets_service()

    if not sheets_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets service is not available. Check credentials."
        )

    # Get all prices from sheets
    all_prices = sheets_service.get_all_etf_prices()
    prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}

    # Update all user holdings
    holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id
    ).all()

    updated_count = 0
    now = get_sast_now()

    for holding in holdings:
        if holding.jse_ticker in prices_map:
            new_price = prices_map[holding.jse_ticker]
            if new_price is not None:
                holding.current_price = new_price
                holding.price_updated_at = now
                updated_count += 1

    db.commit()

    # Update the global last sync time so the UI shows the correct time
    set_last_sync_time(now)

    return {
        "status": "success",
        "updated_count": updated_count,
        "total_holdings": len(holdings),
        "sync_time": now.isoformat() + "Z"
    }


@app.post("/api/etf/add-to-sheet")
async def add_etf_to_sheet(
    request: AddETFToSheetRequest,
    current_user: models.User = Depends(auth.get_current_user)
):
    """Add a new ETF to the Google Sheet (creates row with GOOGLEFINANCE formula)."""
    sheets_service = get_sheets_service()

    if not sheets_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets service is not available. Check credentials."
        )

    # Check if ticker already exists
    if sheets_service.check_ticker_exists(request.jse_ticker):
        raise HTTPException(
            status_code=400,
            detail=f"Ticker {request.jse_ticker} already exists in the sheet"
        )

    success = sheets_service.add_etf_to_sheet(
        request.jse_ticker,
        request.etf_name
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to add ETF to Google Sheet"
        )

    return {
        "status": "success",
        "message": f"Added {request.jse_ticker} to Google Sheet"
    }


@app.get("/api/etf/sheet-prices")
async def get_sheet_prices(
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get all ETF prices directly from Google Sheets (for debugging/reference)."""
    sheets_service = get_sheets_service()

    if not sheets_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets service is not available. Check credentials."
        )

    return sheets_service.get_all_etf_prices()


@app.get("/api/etf/last-sync")
async def get_last_price_sync(
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get the timestamp of the last price sync."""
    last_sync = get_last_sync_time()
    return {
        "last_sync": last_sync.isoformat() + "Z" if last_sync else None,
        "sync_interval_minutes": 5
    }


# =====================================================
# Bond Holdings Endpoints
# =====================================================

@app.get("/api/bond/holdings")
async def get_bond_holdings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get all bond holdings for the current user."""
    holdings = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == current_user.id,
        # Include holdings with current_value > 0 OR target_percentage > 0
        or_(models.BondHolding.current_value > 0, models.BondHolding.target_percentage > 0)
    ).all()

    result = []
    for h in holdings:
        result.append({
            "id": h.id,
            "bond_name": h.bond_name,
            "region": h.region,
            "current_value": h.current_value,
            "target_percentage": h.target_percentage,
            "updated_at": (h.updated_at.isoformat() + "Z") if h.updated_at else None
        })

    return result


@app.post("/api/bond/holdings")
async def create_bond_holding(
    holding: BondHoldingCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Create a new bond holding."""
    # Check if holding with same name already exists
    existing = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == current_user.id,
        models.BondHolding.bond_name == holding.bond_name
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Bond holding '{holding.bond_name}' already exists. Use PUT to update."
        )

    new_holding = models.BondHolding(
        user_id=current_user.id,
        bond_name=holding.bond_name,
        region=holding.region,
        current_value=holding.current_value,
        target_percentage=holding.target_percentage
    )

    db.add(new_holding)
    db.commit()
    db.refresh(new_holding)

    return {
        "id": new_holding.id,
        "bond_name": new_holding.bond_name,
        "region": new_holding.region,
        "current_value": new_holding.current_value,
        "target_percentage": new_holding.target_percentage,
        "updated_at": (new_holding.updated_at.isoformat() + "Z") if new_holding.updated_at else None
    }


@app.put("/api/bond/holdings/{holding_id}")
async def update_bond_holding(
    holding_id: int,
    update: BondHoldingUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update an existing bond holding."""
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    if update.current_value is not None:
        holding.current_value = update.current_value
    if update.target_percentage is not None:
        holding.target_percentage = update.target_percentage
    if update.region is not None:
        holding.region = update.region

    holding.updated_at = get_sast_now()

    db.commit()
    db.refresh(holding)

    return {
        "id": holding.id,
        "bond_name": holding.bond_name,
        "region": holding.region,
        "current_value": holding.current_value,
        "target_percentage": holding.target_percentage,
        "updated_at": (holding.updated_at.isoformat() + "Z") if holding.updated_at else None
    }


@app.delete("/api/bond/holdings/{holding_id}")
async def delete_bond_holding(
    holding_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Delete a bond holding and all associated transactions."""
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    bond_name = holding.bond_name

    # Delete associated transactions first
    db.query(models.BondTransaction).filter(
        models.BondTransaction.holding_id == holding_id
    ).delete()

    db.delete(holding)
    db.commit()

    return {
        "status": "success",
        "message": f"Bond holding '{bond_name}' deleted"
    }


# =====================================================
# Bond Transaction Endpoints
# =====================================================

@app.get("/api/bond/transactions")
async def get_bond_transactions(
    holding_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get bond transaction history, optionally filtered by holding."""
    query = db.query(models.BondTransaction).filter(
        models.BondTransaction.user_id == current_user.id
    )

    if holding_id:
        query = query.filter(models.BondTransaction.holding_id == holding_id)

    transactions = query.order_by(models.BondTransaction.transaction_date.desc()).all()

    result = []
    for t in transactions:
        holding = db.query(models.BondHolding).filter(
            models.BondHolding.id == t.holding_id
        ).first()

        result.append({
            "id": t.id,
            "holding_id": t.holding_id,
            "bond_name": holding.bond_name if holding else "Unknown",
            "transaction_type": t.transaction_type,
            "amount": t.amount,
            "transaction_date": (t.transaction_date.isoformat() + "Z") if t.transaction_date else None
        })

    return result


@app.post("/api/bond/transactions")
async def create_bond_transaction(
    transaction: BondTransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Record a buy or sell transaction for a bond.
    This updates the holding's current value.
    """
    # Verify holding exists and belongs to user
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == transaction.holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    if transaction.transaction_type not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Transaction type must be 'BUY' or 'SELL'")

    if transaction.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # For SELL, ensure user has enough value
    if transaction.transaction_type == "SELL" and holding.current_value < transaction.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient value. Current value is R{holding.current_value}, trying to sell R{transaction.amount}"
        )

    # Parse transaction date
    trans_date = get_sast_now()
    if transaction.transaction_date:
        try:
            trans_date = datetime.fromisoformat(transaction.transaction_date.replace('Z', '+00:00'))
        except ValueError:
            trans_date = get_sast_now()

    # Create transaction record
    new_transaction = models.BondTransaction(
        user_id=current_user.id,
        holding_id=transaction.holding_id,
        transaction_type=transaction.transaction_type,
        amount=transaction.amount,
        transaction_date=trans_date
    )

    db.add(new_transaction)

    # Update holding value and cost_basis
    current_cost_basis = holding.cost_basis or 0

    if transaction.transaction_type == "BUY":
        holding.current_value += transaction.amount
        # Add to cost_basis
        holding.cost_basis = current_cost_basis + transaction.amount
    else:  # SELL
        # Reduce cost_basis proportionally
        if holding.current_value > 0:
            proportion_sold = transaction.amount / holding.current_value
            holding.cost_basis = current_cost_basis * (1 - proportion_sold)
        else:
            holding.cost_basis = 0
        holding.current_value -= transaction.amount

    holding.updated_at = get_sast_now()

    db.commit()
    db.refresh(new_transaction)

    # Calculate unrealized gain for the bond
    unrealized_gain = (holding.current_value or 0) - (holding.cost_basis or 0)

    return {
        "id": new_transaction.id,
        "holding_id": new_transaction.holding_id,
        "bond_name": holding.bond_name,
        "transaction_type": new_transaction.transaction_type,
        "amount": new_transaction.amount,
        "transaction_date": new_transaction.transaction_date.isoformat() + "Z",
        "updated_value": holding.current_value,
        "cost_basis": holding.cost_basis,
        "unrealized_gain": round(unrealized_gain, 2)
    }


@app.delete("/api/bond/transactions/{transaction_id}")
async def delete_bond_transaction(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Delete a bond transaction and reverse its effects on the holding.
    """
    # Verify transaction exists and belongs to user
    transaction = db.query(models.BondTransaction).filter(
        models.BondTransaction.id == transaction_id,
        models.BondTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the holding
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == transaction.holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    # Reverse the transaction effects
    current_cost_basis = holding.cost_basis or 0

    if transaction.transaction_type == "BUY":
        # Reverse BUY: subtract amount from value and cost_basis
        if holding.current_value < transaction.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete transaction: would result in negative value"
            )
        holding.current_value -= transaction.amount
        holding.cost_basis = max(0, current_cost_basis - transaction.amount)
    else:  # SELL
        # Reverse SELL: add amount back to value
        # For SELL, we need to recalculate cost_basis from remaining transactions
        # since the original calculation was proportional
        holding.current_value += transaction.amount
        # Recalculate cost_basis from all remaining transactions
        transactions = db.query(models.BondTransaction).filter(
            models.BondTransaction.holding_id == holding.id,
            models.BondTransaction.id != transaction_id
        ).all()
        total_buy_value = sum(t.amount for t in transactions if t.transaction_type == "BUY")
        total_sell_value = sum(t.amount for t in transactions if t.transaction_type == "SELL")
        holding.cost_basis = max(0, total_buy_value - total_sell_value)

    holding.updated_at = get_sast_now()

    # Delete transaction snapshots created when this transaction was made
    # Snapshots are created at the same time as the transaction, so we match by timestamp
    transaction_time = transaction.transaction_date
    if transaction_time:
        # Delete portfolio value history snapshots for this transaction (within 1 second window)
        time_window_start = transaction_time - timedelta(seconds=1)
        time_window_end = transaction_time + timedelta(seconds=1)
        
        db.query(models.PortfolioValueHistory).filter(
            models.PortfolioValueHistory.user_id == current_user.id,
            models.PortfolioValueHistory.snapshot_type == "transaction",
            models.PortfolioValueHistory.recorded_at >= time_window_start,
            models.PortfolioValueHistory.recorded_at <= time_window_end
        ).delete(synchronize_session=False)

    # Delete the transaction
    db.delete(transaction)
    db.commit()

    return {"message": "Transaction deleted successfully", "updated_value": holding.current_value}


# =====================================================
# Portfolio History & Analytics Endpoints
# =====================================================

@app.post("/api/portfolio/initialize-cost-basis")
async def initialize_cost_basis(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    One-time initialization: Set cost_basis = current_value for all holdings.
    Use this when you have existing holdings but don't know the original purchase price.
    This sets your starting point at 0% gain/loss.

    Works for both ETFs (cost_basis = shares × price) and Bonds (cost_basis = current_value).
    """
    # Initialize ETF holdings
    etf_holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id
    ).all()

    etf_updated = []
    for h in etf_holdings:
        if h.shares and h.current_price:
            h.cost_basis = h.shares * h.current_price
            etf_updated.append({
                'type': 'ETF',
                'holding_id': h.id,
                'name': h.etf_name,
                'jse_ticker': h.jse_ticker,
                'value': h.shares * h.current_price,
                'cost_basis': h.cost_basis
            })

    # Initialize Bond holdings
    bond_holdings = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == current_user.id
    ).all()

    bond_updated = []
    for b in bond_holdings:
        if b.current_value:
            b.cost_basis = b.current_value
            bond_updated.append({
                'type': 'BOND',
                'holding_id': b.id,
                'name': b.bond_name,
                'value': b.current_value,
                'cost_basis': b.cost_basis
            })

    db.commit()

    all_updated = etf_updated + bond_updated

    return {
        'status': 'success',
        'message': f'Initialized cost_basis for {len(etf_updated)} ETFs and {len(bond_updated)} Bonds',
        'etf_count': len(etf_updated),
        'bond_count': len(bond_updated),
        'holdings': all_updated
    }


@app.post("/api/portfolio/trigger-snapshot")
async def trigger_snapshot(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Manually trigger a portfolio snapshot for debugging.
    Records current portfolio state to history tables.
    """
    now = get_sast_now()

    # Calculate portfolio value and contributions
    total_value, holdings_breakdown = history.calculate_portfolio_value(db, current_user.id)
    total_contributions = history.calculate_total_contributions(db, current_user.id)
    total_growth = total_value - total_contributions

    # Record portfolio value history
    portfolio_record = models.PortfolioValueHistory(
        user_id=current_user.id,
        total_value=total_value,
        total_contributions=total_contributions,
        total_growth=total_growth,
        recorded_at=now,
        snapshot_type="manual"
    )
    db.add(portfolio_record)
    
    # Record holding value history for each ETF (skip bonds - they have negative IDs)
    holdings_recorded = 0
    for holding_id, data in holdings_breakdown.items():
        # Skip bonds (negative IDs) - HoldingValueHistory only tracks ETFs
        if holding_id < 0 or data.get('type') == 'BOND':
            continue
        
        holding_record = models.HoldingValueHistory(
            user_id=current_user.id,
            holding_id=holding_id,
            jse_ticker=data['jse_ticker'],
            shares=data['shares'],
            price=data['price'],
            value=data['value'],
            cost_basis=data['cost_basis'],
            unrealized_gain=data['unrealized_gain'],
            recorded_at=now,
            snapshot_type="manual"
        )
        db.add(holding_record)
        holdings_recorded += 1
    
    # Record ETF prices
    prices_recorded = 0
    tickers_seen = set()
    for data in holdings_breakdown.values():
        if data.get('jse_ticker') and data['jse_ticker'] not in tickers_seen and data.get('price'):
            price_record = models.ETFPriceHistory(
                jse_ticker=data['jse_ticker'],
                price=data['price'],
                recorded_at=now,
                snapshot_type="manual"
            )
            db.add(price_record)
            tickers_seen.add(data['jse_ticker'])
            prices_recorded += 1
    
    db.commit()
    
    return {
        'status': 'success',
        'snapshot_time': now.isoformat() + 'Z',
        'total_value': round(total_value, 2),
        'total_contributions': round(total_contributions, 2),
        'total_growth': round(total_growth, 2),
        'holdings_recorded': holdings_recorded,
        'prices_recorded': prices_recorded
    }


@app.get("/api/portfolio/history")
async def get_portfolio_history(
    range: str = "1m",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get portfolio value history for charting.
    Returns data formatted for stacked area chart (contributions vs gains).
    
    Range options: "1d", "7d", "1m", "3m", "6m", "1y", "all"
    """
    if range not in ["1d", "7d", "1m", "3m", "6m", "1y", "all"]:
        raise HTTPException(status_code=400, detail="Invalid range. Use: 1d, 7d, 1m, 3m, 6m, 1y, all")
    
    data = history.get_portfolio_history(db, current_user.id, range)
    
    # Calculate summary statistics
    if data:
        period_start_value = data[0]['total']
        period_end_value = data[-1]['total']
        period_change = period_end_value - period_start_value
        period_change_percent = (period_change / period_start_value * 100) if period_start_value > 0 else 0
    else:
        period_start_value = period_end_value = period_change = period_change_percent = 0
    
    return {
        "range": range,
        "data": data,
        "summary": {
            "period_start_value": round(period_start_value, 2),
            "period_end_value": round(period_end_value, 2),
            "period_change": round(period_change, 2),
            "period_change_percent": round(period_change_percent, 2)
        }
    }


@app.get("/api/portfolio/attribution")
async def get_portfolio_attribution(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get per-holding gain/loss attribution.
    Shows which holdings are driving portfolio gains/losses.
    """
    return history.get_holding_attribution(db, current_user.id)


@app.get("/api/portfolio/growth-breakdown")
async def get_growth_breakdown(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get breakdown of contributions vs growth.
    Shows total deposited vs total investment returns.
    """
    return history.get_growth_breakdown(db, current_user.id)


@app.get("/api/portfolio/daily-summary")
async def get_daily_summaries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get daily EOD summaries for a date range.
    """
    query = db.query(models.DailyPortfolioSummary).filter(
        models.DailyPortfolioSummary.user_id == current_user.id
    )
    
    if start_date:
        try:
            start = date.fromisoformat(start_date)
            query = query.filter(models.DailyPortfolioSummary.date >= start)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
    
    if end_date:
        try:
            end = date.fromisoformat(end_date)
            query = query.filter(models.DailyPortfolioSummary.date <= end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
    
    summaries = query.order_by(models.DailyPortfolioSummary.date).all()
    
    return [
        {
            "date": str(s.date),
            "opening_value": s.opening_value,
            "closing_value": s.closing_value,
            "high_value": s.high_value,
            "low_value": s.low_value,
            "total_contributions": s.total_contributions,
            "contributions_today": s.contributions_today,
            "total_growth": s.total_growth,
            "daily_change": s.daily_change,
            "daily_change_percent": s.daily_change_percent
        }
        for s in summaries
    ]


@app.get("/api/portfolio/monthly-summary")
async def get_monthly_summaries(
    year: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get monthly summaries, optionally filtered by year.
    """
    query = db.query(models.MonthlyPortfolioSummary).filter(
        models.MonthlyPortfolioSummary.user_id == current_user.id
    )
    
    if year:
        query = query.filter(models.MonthlyPortfolioSummary.year == year)
    
    summaries = query.order_by(
        models.MonthlyPortfolioSummary.year,
        models.MonthlyPortfolioSummary.month
    ).all()
    
    return [
        {
            "year": s.year,
            "month": s.month,
            "opening_value": s.opening_value,
            "closing_value": s.closing_value,
            "high_value": s.high_value,
            "low_value": s.low_value,
            "average_value": s.average_value,
            "total_contributions": s.total_contributions,
            "contributions_this_month": s.contributions_this_month,
            "total_growth": s.total_growth,
            "monthly_change": s.monthly_change,
            "monthly_change_percent": s.monthly_change_percent
        }
        for s in summaries
    ]


@app.get("/api/etf/{ticker}/price-history")
async def get_etf_price_history(
    ticker: str,
    range: str = "1m",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get price history for a specific ETF ticker.
    
    Range options: "1m", "3m", "6m", "1y", "all"
    """
    if range not in ["1m", "3m", "6m", "1y", "all"]:
        raise HTTPException(status_code=400, detail="Invalid range. Use: 1m, 3m, 6m, 1y, all")
    
    data = history.get_etf_price_history(db, ticker, range)
    
    return {
        "ticker": ticker,
        "range": range,
        "data": data
    }


# =====================================================
# Admin & Debug Endpoints
# =====================================================

@app.post("/api/admin/trigger-sync")
async def trigger_manual_sync(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Manually trigger a price sync and portfolio snapshot.
    Useful for debugging or forcing an update.
    """
    try:
        # 1. Sync prices
        await sync_all_prices()
        
        # 2. Record snapshot
        await record_hourly_snapshot()
        
        return {"status": "success", "message": "Manual sync and snapshot completed"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during manual sync: {str(e)}")


@app.get("/api/admin/history/etf-prices")
async def get_admin_etf_price_history(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw ETF price history table data."""
    prices = db.query(models.ETFPriceHistory).order_by(
        models.ETFPriceHistory.recorded_at.desc()
    ).limit(limit).all()
    return prices


@app.get("/api/admin/history/portfolio-values")
async def get_admin_portfolio_history(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw portfolio value history table data."""
    values = db.query(models.PortfolioValueHistory).filter(
        models.PortfolioValueHistory.user_id == current_user.id
    ).order_by(
        models.PortfolioValueHistory.recorded_at.desc()
    ).limit(limit).all()
    return values


@app.get("/api/admin/history/holding-values")
async def get_admin_holding_history(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw holding value history table data."""
    values = db.query(models.HoldingValueHistory).filter(
        models.HoldingValueHistory.user_id == current_user.id
    ).order_by(
        models.HoldingValueHistory.recorded_at.desc()
    ).limit(limit).all()
    return values


@app.get("/api/admin/history/daily-summaries")
async def get_admin_daily_summaries(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw daily summary table data."""
    summaries = db.query(models.DailyPortfolioSummary).filter(
        models.DailyPortfolioSummary.user_id == current_user.id
    ).order_by(
        models.DailyPortfolioSummary.date.desc()
    ).limit(limit).all()
    return summaries
