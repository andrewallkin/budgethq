from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime
import csv
import io
from . import models, database, auth
from .logic import calculate_monthly_tax_with_age, calculate_uif, calculate_rebalancing
from .sheets_service import get_sheets_service
from .scheduler import start_scheduler, stop_scheduler, sync_all_prices, get_last_sync_time
from pydantic import BaseModel

# Initialize DB
models.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - start/stop background tasks."""
    # Startup: Start the price sync scheduler
    start_scheduler()
    # Run initial sync on startup
    await sync_all_prices()
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
        db.add(models.TFSADeposit(
            user_id=current_user.id,
            amount=deposit.amount,
            deposit_date=date.fromisoformat(deposit.date) if deposit.date else None,
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
        models.ETFHolding.user_id == current_user.id
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
            price_updated_at = datetime.utcnow()
    
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
    Bulk import ETF holdings from a CSV file.
    
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
    
    success_count = 0
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
            
            if existing:
                errors.append(f"Row {row_num}: {jse_ticker} already exists, skipped")
                failed_count += 1
                continue
            
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
            
            if shares < 0:
                errors.append(f"Row {row_num}: Shares cannot be negative")
                failed_count += 1
                continue
            
            current_price = prices_map.get(jse_ticker)
            price_updated_at = datetime.utcnow() if current_price else None
            
            new_holding = models.ETFHolding(
                user_id=current_user.id,
                jse_ticker=jse_ticker,
                etf_name=etf_name,
                region=row['region'].strip(),
                shares=shares,
                target_percentage=target_pct,
                current_price=current_price,
                price_updated_at=price_updated_at
            )
            
            db.add(new_holding)
            success_count += 1
            
        except ValueError as e:
            errors.append(f"Row {row_num}: Invalid number format - {str(e)}")
            failed_count += 1
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            failed_count += 1
    
    db.commit()
    
    return {
        "success": success_count,
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
    trans_date = datetime.utcnow()
    if transaction.transaction_date:
        try:
            trans_date = datetime.fromisoformat(transaction.transaction_date.replace('Z', '+00:00'))
        except ValueError:
            trans_date = datetime.utcnow()
    
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
        "updated_share_count": holding.shares
    }


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
    now = datetime.utcnow()
    
    for holding in holdings:
        if holding.jse_ticker in prices_map:
            new_price = prices_map[holding.jse_ticker]
            if new_price is not None:
                holding.current_price = new_price
                holding.price_updated_at = now
                updated_count += 1
    
    db.commit()
    
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
