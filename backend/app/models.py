from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from .utils import get_sast_now

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    budget = relationship("Budget", back_populates="owner", uselist=False)
    emergency_savings = relationship("EmergencySavings", back_populates="owner", uselist=False)
    retirement_annuity = relationship("RetirementAnnuity", back_populates="owner", uselist=False)
    etfs = relationship("ETF", back_populates="owner")
    etf_holdings = relationship("ETFHolding", back_populates="owner")
    etf_transactions = relationship("ETFTransaction", back_populates="owner")
    bond_holdings = relationship("BondHolding", back_populates="owner")
    bond_transactions = relationship("BondTransaction", back_populates="owner")
    tfsa_historical_contributions = relationship("TFSAHistoricalContribution", back_populates="owner")
    tfsa_deposits = relationship("TFSADeposit", back_populates="owner")
    portfolio_value_history = relationship("PortfolioValueHistory", back_populates="owner")
    holding_value_history = relationship("HoldingValueHistory", back_populates="owner")
    daily_portfolio_summaries = relationship("DailyPortfolioSummary", back_populates="owner")
    monthly_portfolio_summaries = relationship("MonthlyPortfolioSummary", back_populates="owner")
    salary = relationship("Salary", back_populates="owner", uselist=False)
    user_sheet = relationship("UserSheet", back_populates="owner", uselist=False)


class UserSheet(Base):
    """User-specific Google Sheets tab mapping"""
    __tablename__ = "user_sheets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    sheet_name = Column(String, unique=True)  # User ID-based sheet name (e.g., "user_123")
    created_at = Column(DateTime, default=get_sast_now)

    owner = relationship("User", back_populates="user_sheet")

    @staticmethod
    def generate_sheet_name(user_id: int) -> str:
        """Generate a sheet name based on user ID"""
        return f"user_{user_id}"


class Salary(Base):
    __tablename__ = "salaries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    medical_aid_members = Column(Integer, default=0) # Main member + dependents

    # New Fields
    basic_salary = Column(Float, default=0.0)
    age = Column(Integer, default=30)
    net_salary = Column(Float, default=0.0)  # Calculated net take-home pay

    owner = relationship("User", back_populates="salary")
    items = relationship("SalaryItem", back_populates="salary", cascade="all, delete-orphan")

class SalaryItem(Base):
    __tablename__ = "salary_items"

    id = Column(Integer, primary_key=True, index=True)
    salary_id = Column(Integer, ForeignKey("salaries.id"))

    name = Column(String)
    amount = Column(Float)
    # Types: "earning", "deduction_pre", "deduction_post" (Fringe is now a property of post-tax/earning usually, let's keep types simple)
    # Actually user wants "Separate Pre and Post Tax". 
    # And "Select whether it is a fringe benefit or not".
    item_type = Column(String) 
    is_fringe = Column(Integer, default=0) # 0=False, 1=True (Boolean)

    salary = relationship("Salary", back_populates="items")

class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    salary = Column(Float, default=0)

    owner = relationship("User", back_populates="budget")
    categories = relationship("BudgetCategory", back_populates="budget")


class EmergencySavings(Base):
    __tablename__ = "emergency_savings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    current_fund = Column(Float, default=0)
    monthly_deposit = Column(Float, default=0)
    target_type = Column(String, nullable=True)  # 'months' or 'target_value'
    target_months = Column(Integer, nullable=True)  # 3, 6, or 12
    target_value = Column(Float, nullable=True)  # Direct target value

    owner = relationship("User", back_populates="emergency_savings")


class RetirementAnnuity(Base):
    __tablename__ = "retirement_annuities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    current_value = Column(Float, default=0)
    monthly_contribution = Column(Float, default=0)

    owner = relationship("User", back_populates="retirement_annuity")


class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"))
    type = Column(String)  # 'needs', 'wants', 'savings'
    name = Column(String)
    amount = Column(Float)
    group = Column(String, nullable=True)  # Optional group for sub-categorization

    budget = relationship("Budget", back_populates="categories")

class ETF(Base):
    __tablename__ = "etfs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    ticker = Column(String)
    region = Column(String)
    target_percentage = Column(Float)
    current_value = Column(Float)

    owner = relationship("User", back_populates="etfs")


class TFSAHistoricalContribution(Base):
    __tablename__ = "tfsa_historical_contributions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    financial_year = Column(String)  # e.g., "2018/19", "2019/20"
    amount = Column(Float)

    owner = relationship("User", back_populates="tfsa_historical_contributions")

class TFSADeposit(Base):
    __tablename__ = "tfsa_deposits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Float)
    deposit_date = Column(Date)
    financial_year_start = Column(Integer)  # e.g., 2024 for FY 2024/2025

    owner = relationship("User", back_populates="tfsa_deposits")


class ETFHolding(Base):
    """User's ETF holdings - links to Google Sheets ticker for prices"""
    __tablename__ = "etf_holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    jse_ticker = Column(String)          # e.g., "JSE:STX40"
    etf_name = Column(String)            # e.g., "Satrix Top 40"
    region = Column(String)              # e.g., "South Africa"
    shares = Column(Float, default=0)    # Fractional shares allowed
    target_percentage = Column(Float, default=0)
    current_price = Column(Float, nullable=True)  # Cached from Google Sheets
    price_updated_at = Column(DateTime, nullable=True)
    cost_basis = Column(Float, default=0)  # Total cost of shares purchased
    created_at = Column(DateTime, default=get_sast_now)

    owner = relationship("User", back_populates="etf_holdings")
    transactions = relationship("ETFTransaction", back_populates="holding")
    value_history = relationship("HoldingValueHistory", back_populates="holding")


class ETFTransaction(Base):
    """Audit trail of all buy/sell transactions"""
    __tablename__ = "etf_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    holding_id = Column(Integer, ForeignKey("etf_holdings.id"))
    transaction_type = Column(String)    # "BUY" or "SELL"
    shares = Column(Float)
    price_per_share = Column(Float)
    total_value = Column(Float)
    transaction_date = Column(DateTime)
    created_at = Column(DateTime, default=get_sast_now)

    owner = relationship("User", back_populates="etf_transactions")
    holding = relationship("ETFHolding", back_populates="transactions")


class BondHolding(Base):
    """User's government bond holdings - manual tracking only, no ticker"""
    __tablename__ = "bond_holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    bond_name = Column(String)           # e.g., "SA Government Bond 2030"
    region = Column(String)              # e.g., "South Africa"
    current_value = Column(Float, default=0)  # Total value (no shares/price tracking)
    target_percentage = Column(Float, default=0)
    cost_basis = Column(Float, default=0)  # Total cost of bond purchases
    updated_at = Column(DateTime, default=get_sast_now, onupdate=get_sast_now)
    created_at = Column(DateTime, default=get_sast_now)

    owner = relationship("User", back_populates="bond_holdings")
    transactions = relationship("BondTransaction", back_populates="holding")


class BondTransaction(Base):
    """Audit trail of all bond buy/sell transactions"""
    __tablename__ = "bond_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    holding_id = Column(Integer, ForeignKey("bond_holdings.id"))
    transaction_type = Column(String)    # "BUY" or "SELL"
    amount = Column(Float)               # Transaction amount (value, not shares)
    transaction_date = Column(DateTime)
    created_at = Column(DateTime, default=get_sast_now)

    owner = relationship("User", back_populates="bond_transactions")
    holding = relationship("BondHolding", back_populates="transactions")


# =====================================================
# Historical Price & Portfolio Tracking Models
# =====================================================

class ETFPriceHistory(Base):
    """Hourly price snapshots for ETFs - raw granular data"""
    __tablename__ = "etf_price_history"

    id = Column(Integer, primary_key=True, index=True)
    jse_ticker = Column(String, index=True)
    price = Column(Float)
    recorded_at = Column(DateTime, index=True, default=get_sast_now)
    snapshot_type = Column(String, default="hourly")  # "hourly", "transaction", "eod"


class PortfolioValueHistory(Base):
    """Historical total portfolio value per user"""
    __tablename__ = "portfolio_value_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    total_value = Column(Float)
    total_contributions = Column(Float)  # Total TFSA deposits up to this point
    total_growth = Column(Float)         # total_value - total_contributions
    recorded_at = Column(DateTime, index=True, default=get_sast_now)
    snapshot_type = Column(String, default="hourly")  # "hourly", "transaction", "eod", "monthly"

    owner = relationship("User", back_populates="portfolio_value_history")


class HoldingValueHistory(Base):
    """Per-holding value snapshots for gain/loss attribution"""
    __tablename__ = "holding_value_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    holding_id = Column(Integer, ForeignKey("etf_holdings.id"), index=True)
    jse_ticker = Column(String, index=True)
    shares = Column(Float)
    price = Column(Float)
    value = Column(Float)              # shares * price
    cost_basis = Column(Float)         # What user paid for these shares
    unrealized_gain = Column(Float)    # value - cost_basis
    recorded_at = Column(DateTime, index=True, default=get_sast_now)
    snapshot_type = Column(String, default="hourly")

    owner = relationship("User", back_populates="holding_value_history")
    holding = relationship("ETFHolding", back_populates="value_history")


class DailyPortfolioSummary(Base):
    """End-of-day aggregated portfolio summary for long-term storage"""
    __tablename__ = "daily_portfolio_summary"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    date = Column(Date, index=True)

    # Portfolio totals
    opening_value = Column(Float)
    closing_value = Column(Float)
    high_value = Column(Float)         # Highest value during the day
    low_value = Column(Float)          # Lowest value during the day

    # Contributions tracking
    total_contributions = Column(Float)
    contributions_today = Column(Float, default=0)

    # Growth metrics
    total_growth = Column(Float)       # closing_value - total_contributions
    daily_change = Column(Float)       # closing_value - opening_value
    daily_change_percent = Column(Float)

    owner = relationship("User", back_populates="daily_portfolio_summaries")


class MonthlyPortfolioSummary(Base):
    """Monthly aggregated portfolio summary for multi-year views"""
    __tablename__ = "monthly_portfolio_summary"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    year = Column(Integer, index=True)
    month = Column(Integer, index=True)

    # Portfolio totals
    opening_value = Column(Float)      # First day of month
    closing_value = Column(Float)      # Last day of month
    high_value = Column(Float)         # Highest value during month
    low_value = Column(Float)          # Lowest value during month
    average_value = Column(Float)      # Average daily closing value

    # Contributions tracking
    total_contributions = Column(Float)
    contributions_this_month = Column(Float, default=0)

    # Growth metrics
    total_growth = Column(Float)
    monthly_change = Column(Float)
    monthly_change_percent = Column(Float)

    owner = relationship("User", back_populates="monthly_portfolio_summaries")
