import json
import pandas as pd
from pathlib import Path
from app import models, database, auth
from sqlalchemy.orm import Session

DATA_DIR = Path("data")
BUDGET_DIR = DATA_DIR / "budgets"
TFSA_PORTFOLIO_FILE = DATA_DIR / "tfsa_portfolio.csv"

def migrate():
    db = database.SessionLocal()
    
    # Create default user
    default_username = "default_user"
    default_password = "password123" # Temporary password
    
    user = db.query(models.User).filter(models.User.username == default_username).first()
    if not user:
        print(f"Creating default user: {default_username}")
        hashed_password = auth.get_password_hash(default_password)
        user = models.User(username=default_username, hashed_password=hashed_password)
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # Migrate Budget Data
    budget_file = BUDGET_DIR / f"budget_data_{default_username}.json"
    if budget_file.exists():
        print(f"Migrating budget data from {budget_file}")
        with open(budget_file, "r") as f:
            data = json.load(f)
            
        budget = db.query(models.Budget).filter(models.Budget.user_id == user.id).first()
        if not budget:
            budget = models.Budget(user_id=user.id)
            db.add(budget)
            db.commit()
            db.refresh(budget)
            
        budget.salary = data.get("salary", 0)
        budget.age = data.get("age", 30)
        
        # Clear existing categories
        db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id).delete()
        
        for item in data.get("needs", []):
            db.add(models.BudgetCategory(budget_id=budget.id, type='needs', name=item["name"], amount=item["amount"]))
        for item in data.get("wants", []):
            db.add(models.BudgetCategory(budget_id=budget.id, type='wants', name=item["name"], amount=item["amount"]))
        for item in data.get("savings", []):
            db.add(models.BudgetCategory(budget_id=budget.id, type='savings', name=item["name"], amount=item["amount"]))
            
        db.commit()
        print("Budget data migrated.")

    # Migrate TFSA Portfolio
    if TFSA_PORTFOLIO_FILE.exists():
        print(f"Migrating portfolio data from {TFSA_PORTFOLIO_FILE}")
        try:
            df = pd.read_csv(TFSA_PORTFOLIO_FILE)
            
            # Clear existing
            db.query(models.ETF).filter(models.ETF.user_id == user.id).delete()
            
            for _, row in df.iterrows():
                db.add(models.ETF(
                    user_id=user.id,
                    ticker=row["ETF"],
                    region=row["Region"],
                    target_percentage=row["Target_Percentage"],
                    current_value=row["Current_Value"]
                ))
            db.commit()
            print("Portfolio data migrated.")
        except Exception as e:
            print(f"Failed to migrate portfolio: {e}")

    db.close()

if __name__ == "__main__":
    # Ensure tables exist
    models.Base.metadata.create_all(bind=database.engine)
    migrate()
