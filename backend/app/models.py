from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    budget = relationship("Budget", back_populates="owner", uselist=False)
    etfs = relationship("ETF", back_populates="owner")
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
