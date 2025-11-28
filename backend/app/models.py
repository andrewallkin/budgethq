from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    budget = relationship("Budget", back_populates="owner", uselist=False)
    etfs = relationship("ETF", back_populates="owner")

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
