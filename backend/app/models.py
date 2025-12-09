from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    budget = relationship("Budget", back_populates="owner", uselist=False)
    etfs = relationship("ETF", back_populates="owner")
    etf_holdings = relationship("ETFHolding", back_populates="owner")
    etf_transactions = relationship("ETFTransaction", back_populates="owner")
    bond_holdings = relationship("BondHolding", back_populates="owner")
    bond_transactions = relationship("BondTransaction", back_populates="owner")
    tfsa_historical_contributions = relationship("TFSAHistoricalContribution", back_populates="owner")
    tfsa_deposits = relationship("TFSADeposit", back_populates="owner")

class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    salary = Column(Float, default=0)
    age = Column(Integer, default=30)

    owner = relationship("User", back_populates="budget")
    categories = relationship("BudgetCategory", back_populates="budget")

class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"))
    type = Column(String)  # 'needs', 'wants', 'savings'
    name = Column(String)
    amount = Column(Float)

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
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="etf_holdings")
    transactions = relationship("ETFTransaction", back_populates="holding")


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
    created_at = Column(DateTime, default=datetime.utcnow)

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
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="bond_transactions")
    holding = relationship("BondHolding", back_populates="transactions")
