from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime, UniqueConstraint, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from .utils import get_sast_now

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    openai_api_key = Column(String, nullable=True)  # Encrypted OpenAI API key

    # Encrypted Investec credentials
    investec_client_id = Column(String, nullable=True)
    investec_client_secret = Column(String, nullable=True)
    investec_api_key = Column(String, nullable=True)
    has_investec_account = Column(Boolean, default=False, server_default='false')

    # Emergency fund designation
    emergency_fund_account_id = Column(Integer, ForeignKey("investec_accounts.id"), nullable=True)

    budget = relationship("Budget", back_populates="owner", uselist=False)
    emergency_savings = relationship("EmergencySavings", back_populates="owner", uselist=False)
    retirement_annuity = relationship("RetirementAnnuity", back_populates="owner", uselist=False)
    ra_value_history = relationship("RAValueHistory", back_populates="owner")
    ra_contributions = relationship("RAContribution", back_populates="owner")
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
    user_sheet = relationship("UserSheet", back_populates="owner", uselist=False)
    monthly_payslips = relationship("MonthlyPayslip", back_populates="owner", cascade="all, delete-orphan")

    # Investec integration relationships
    investec_accounts = relationship("InvestecAccount", back_populates="owner", foreign_keys="InvestecAccount.user_id", cascade="all, delete-orphan")
    manual_bank_accounts = relationship("ManualBankAccount", back_populates="owner", cascade="all, delete-orphan")
    bank_transactions = relationship("BankTransaction", back_populates="owner", cascade="all, delete-orphan")
    categorization_rules = relationship("CategorizationRule", back_populates="owner", cascade="all, delete-orphan")
    emergency_fund_account = relationship("InvestecAccount", foreign_keys=[emergency_fund_account_id], post_update=True)


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


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    salary = Column(Float, default=0)
    budget_period_start_day = Column(Integer, nullable=True, default=1)  # 1-31, 1 = calendar month

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
    fund_source = Column(String, nullable=True, default='manual')  # 'manual' or 'bank_sync'

    owner = relationship("User", back_populates="emergency_savings")


class RetirementAnnuity(Base):
    __tablename__ = "retirement_annuities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    monthly_contribution = Column(Float, default=0)

    owner = relationship("User", back_populates="retirement_annuity")


class RAValueHistory(Base):
    """User-entered RA portfolio value per date (one snapshot per date)."""
    __tablename__ = "ra_value_history"
    __table_args__ = (UniqueConstraint("user_id", "record_date", name="uq_ra_value_history_user_record_date"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    record_date = Column(Date, index=True)
    portfolio_value = Column(Float, default=0)

    owner = relationship("User", back_populates="ra_value_history")


class RAContribution(Base):
    """Individual RA contribution event; total contributions = sum of amounts."""
    __tablename__ = "ra_contributions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    contribution_date = Column(Date, index=True)
    amount = Column(Float, default=0)

    owner = relationship("User", back_populates="ra_contributions")


class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"))
    type = Column(String)  # 'needs', 'wants', 'savings'
    name = Column(String)
    amount = Column(Float)
    transaction_category = Column(String, nullable=True, default='uncategorized')  # Links to BankTransaction.category
    excluded = Column(Boolean, default=False)  # If true, entry is visible but not counted in totals

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


# =====================================================
# Monthly Payslip Tracking Models
# =====================================================

class MonthlyPayslip(Base):
    """Monthly payslip records with extracted data from uploaded PDFs"""
    __tablename__ = "monthly_payslips"
    __table_args__ = (UniqueConstraint("user_id", "year", "month", name="uq_monthly_payslip_user_year_month"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    year = Column(Integer, index=True)
    month = Column(Integer, index=True)  # 1-12
    
    # Extracted payslip data
    title = Column(String, nullable=True)  # Job title
    company_name = Column(String, nullable=True)
    gross_salary = Column(Float, default=0.0)
    paye = Column(Float, default=0.0)
    uif_employee_portion = Column(Float, default=0.0)
    net_pay = Column(Float, default=0.0)
    
    # File storage
    gcs_file_path = Column(String, nullable=True)  # Path to PDF in Google Cloud Storage
    
    # Timestamps
    uploaded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_sast_now)
    updated_at = Column(DateTime, default=get_sast_now, onupdate=get_sast_now)
    
    # Relationships
    owner = relationship("User", back_populates="monthly_payslips")
    items = relationship("PayslipItem", back_populates="payslip", cascade="all, delete-orphan")
    additional_income = relationship("PayslipAdditionalIncome", back_populates="payslip", cascade="all, delete-orphan")


class PayslipItem(Base):
    """Line items for payslips (company contributions, deductions)"""
    __tablename__ = "payslip_items"

    id = Column(Integer, primary_key=True, index=True)
    payslip_id = Column(Integer, ForeignKey("monthly_payslips.id"), index=True)
    
    description = Column(String)
    amount = Column(Float)
    item_type = Column(String)  # 'company_contribution' or 'personal_deduction'
    
    payslip = relationship("MonthlyPayslip", back_populates="items")


class PayslipAdditionalIncome(Base):
    """Additional income items (bonuses, reimbursements, claims)"""
    __tablename__ = "payslip_additional_income"

    id = Column(Integer, primary_key=True, index=True)
    payslip_id = Column(Integer, ForeignKey("monthly_payslips.id"), index=True)

    description = Column(String)
    amount = Column(Float)

    payslip = relationship("MonthlyPayslip", back_populates="additional_income")


# =====================================================
# Investec API Integration Models
# =====================================================

class InvestecAccount(Base):
    """User's connected Investec bank account"""
    __tablename__ = "investec_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    # From Investec API
    investec_account_id = Column(String, unique=True, index=True)  # API accountId
    account_number = Column(String)  # User-friendly account number
    account_name = Column(String)  # e.g., "Mr AJ Allkin"
    reference_name = Column(String, nullable=True)  # e.g., "Emergency Fund Account"
    product_name = Column(String)  # e.g., "Private Bank Account", "PrimeSaver"

    # Balance (cached, refreshed hourly)
    current_balance = Column(Float, nullable=True)
    available_balance = Column(Float, nullable=True)
    currency = Column(String, default="ZAR")
    balance_updated_at = Column(DateTime, nullable=True)

    # Metadata
    is_primary = Column(Boolean, default=False)  # Primary spending account
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_sast_now)
    last_synced = Column(DateTime, nullable=True)

    # Relationships
    owner = relationship("User", back_populates="investec_accounts", foreign_keys=[user_id])
    transactions = relationship("BankTransaction", back_populates="account", cascade="all, delete-orphan")


class BankTransaction(Base):
    """Transaction from Investec API"""
    __tablename__ = "bank_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    account_id = Column(Integer, ForeignKey("investec_accounts.id"))

    # From Investec API
    investec_uuid = Column(String, unique=True, index=True)  # Unique transaction ID
    transaction_type = Column(String)  # CREDIT or DEBIT
    transaction_category = Column(String, nullable=True)  # CardPurchases, Deposits, FeesAndInterest
    status = Column(String)  # POSTED or PENDING
    description = Column(String)
    amount = Column(Float)

    # Dates
    transaction_date = Column(DateTime)  # When transaction occurred
    posting_date = Column(DateTime, nullable=True)  # When posted to account
    value_date = Column(DateTime, nullable=True)  # When funds available

    # Additional details
    card_number = Column(String, nullable=True)
    running_balance = Column(Float, nullable=True)

    # AI Categorization (7 simplified categories)
    category = Column(String, nullable=True)  # One of: salary, side_income, investment_income, refund, other_income, groceries_household, bills, subscriptions, transport, lifestyle_misc, savings, loan_repayment, transfers
    ai_category_confidence = Column(Float, nullable=True)  # 0.0 to 1.0
    user_corrected = Column(Boolean, default=False)  # User manually changed category

    # Metadata
    synced_at = Column(DateTime, default=get_sast_now)
    created_at = Column(DateTime, default=get_sast_now)

    # Relationships
    owner = relationship("User", back_populates="bank_transactions")
    account = relationship("InvestecAccount", back_populates="transactions")


class ManualBankAccount(Base):
    """User-created manual bank account with balance-only updates (no transaction sync)"""
    __tablename__ = "manual_bank_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    name = Column(String)
    balance = Column(Float, default=0)
    is_emergency_savings = Column(Boolean, default=False)

    created_at = Column(DateTime, default=get_sast_now)
    updated_at = Column(DateTime, default=get_sast_now, onupdate=get_sast_now)

    owner = relationship("User", back_populates="manual_bank_accounts")


class CategorizationRule(Base):
    """User-defined transaction categorization rules"""
    __tablename__ = "categorization_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    # Rule definition
    pattern = Column(String)  # Regex or substring to match
    category = Column(String)  # Target category (income, groceries, etc.)
    priority = Column(Integer, default=0)  # Higher priority checked first

    # Metadata
    is_active = Column(Boolean, default=True)
    created_from_correction = Column(Boolean, default=False)  # Auto-generated from user correction
    usage_count = Column(Integer, default=0)  # How many times this rule has matched
    created_at = Column(DateTime, default=get_sast_now)

    # Relationships
    owner = relationship("User", back_populates="categorization_rules")
