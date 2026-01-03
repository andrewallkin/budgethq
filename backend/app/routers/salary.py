from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from .. import models, database, auth
from ..tax_engine import calculate_salary_breakdown

class SalaryItemCreate(BaseModel):
    name: str
    amount: float
    item_type: str # earning, deduction_pre, deduction_post
    is_fringe: bool = False

class SalaryItemUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    item_type: Optional[str] = None
    is_fringe: Optional[bool] = None

class SalaryItemRead(SalaryItemCreate):
    id: int
    salary_id: int

    class Config:
        orm_mode = True

class SalaryUpdate(BaseModel):
    medical_aid_members: Optional[int] = None
    basic_salary: Optional[float] = None
    age: Optional[int] = None

class SalaryResponse(BaseModel):
    gross_income: float
    gross_cash: float
    fringe_benefits: float
    taxable_income: float
    net_pay: float
    deductions: dict
    items: List[SalaryItemRead]
    medical_aid_members: int
    basic_salary: float
    age: int

router = APIRouter(prefix="/salary", tags=["salary"])

@router.get("", response_model=SalaryResponse)
async def get_salary_structure(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get current salary structure and calculated tax breakdown."""
    salary = db.query(models.Salary).filter(models.Salary.user_id == current_user.id).first()

    if not salary:
        # Auto-create empty salary record
        salary = models.Salary(user_id=current_user.id)
        db.add(salary)
        db.commit()
        db.refresh(salary)

    # Use age from salary record (age is now only stored in Salary model)
    age = salary.age or 30

    # Calculate complete breakdown
    # Use internal age if set, else budget age or default
    calc_age = salary.age if salary.age else (age or 30)

    breakdown = calculate_salary_breakdown(salary, calc_age)

    # Commit the updated net_salary to database
    db.commit()

    return {
        "medical_aid_members": salary.medical_aid_members or 0,
        "items": [
            {
                "id": i.id,
                "salary_id": i.salary_id,
                "name": i.name,
                "amount": i.amount or 0.0,
                "item_type": i.item_type,
                "is_fringe": bool(i.is_fringe) if i.is_fringe is not None else False
            } for i in salary.items
        ],
        "gross_income": breakdown["gross_income"],
        "gross_cash": breakdown["gross_cash"],
        "fringe_benefits": breakdown["fringe_benefits"],
        "taxable_income": breakdown["taxable_income"],
        "net_pay": breakdown["net_pay"],
        "deductions": breakdown["deductions"],
        "basic_salary": salary.basic_salary or 0.0,
        "age": salary.age or 30
    }

@router.put("")
async def update_salary_settings(
    data: SalaryUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update global salary settings (e.g. medical aid members)."""
    salary = db.query(models.Salary).filter(models.Salary.user_id == current_user.id).first()
    if not salary:
        salary = models.Salary(user_id=current_user.id)
        db.add(salary)

    if data.medical_aid_members is not None:
        salary.medical_aid_members = data.medical_aid_members

    if data.basic_salary is not None:
        salary.basic_salary = data.basic_salary

    if data.age is not None:
        salary.age = data.age

    # Recalculate and save net salary after any changes
    calculate_salary_breakdown(salary, salary.age or 30)

    db.commit()

    return {"status": "success"}

@router.post("/item")
async def add_salary_item(
    item: SalaryItemCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Add a new earning or deduction."""
    salary = db.query(models.Salary).filter(models.Salary.user_id == current_user.id).first()
    if not salary:
        salary = models.Salary(user_id=current_user.id)
        db.add(salary)
        db.commit()
        db.refresh(salary)

    new_item = models.SalaryItem(
        salary_id=salary.id,
        name=item.name,
        amount=item.amount,
        item_type=item.item_type,
        is_fringe=int(item.is_fringe)
    )
    db.add(new_item)
    db.commit()

    # Recalculate and save net salary after adding item
    calculate_salary_breakdown(salary, salary.age or 30)
    db.commit()

    return {"status": "success", "id": new_item.id}

@router.delete("/item/{item_id}")
async def delete_salary_item(
    item_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Remove an earning or deduction."""
    salary = db.query(models.Salary).filter(models.Salary.user_id == current_user.id).first()
    if not salary:
        raise HTTPException(status_code=404, detail="Salary record not found")

    item = db.query(models.SalaryItem).filter(
        models.SalaryItem.id == item_id,
        models.SalaryItem.salary_id == salary.id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)

    # Recalculate and save net salary after deleting item
    calculate_salary_breakdown(salary, salary.age or 30)
    db.commit()

    return {"status": "success"}

@router.put("/item/{item_id}")
async def update_salary_item(
    item_id: int,
    data: SalaryItemUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update an earning or deduction."""
    salary = db.query(models.Salary).filter(models.Salary.user_id == current_user.id).first()
    if not salary:
        raise HTTPException(status_code=404, detail="Salary record not found")

    item = db.query(models.SalaryItem).filter(
        models.SalaryItem.id == item_id,
        models.SalaryItem.salary_id == salary.id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if data.name is not None:
        item.name = data.name
    if data.amount is not None:
        item.amount = data.amount
    if data.item_type is not None:
        item.item_type = data.item_type
    if data.is_fringe is not None:
        item.is_fringe = int(data.is_fringe)

    db.commit()

    # Recalculate and save net salary after updating item
    calculate_salary_breakdown(salary, salary.age or 30)
    db.commit()

    return {"status": "success"}
