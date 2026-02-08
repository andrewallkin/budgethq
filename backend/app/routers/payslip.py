"""
Payslip router for handling monthly payslip uploads, extraction, and management.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import logging

from ..database import get_db
from ..models import User, MonthlyPayslip, PayslipItem, PayslipAdditionalIncome
from ..auth import get_current_user
from ..gcs_service import PayslipGCSService
from ..payslip_extraction import extract_payslip_data, FinancialEntry, PayslipExtraction
from ..utils import decrypt_api_key, get_sast_now

router = APIRouter()
logger = logging.getLogger(__name__)

# =====================================================
# Pydantic Models for API
# =====================================================

class PayslipItemResponse(BaseModel):
    id: int
    description: str
    amount: float
    item_type: str

    class Config:
        from_attributes = True


class PayslipAdditionalIncomeResponse(BaseModel):
    id: int
    description: str
    amount: float

    class Config:
        from_attributes = True


class PayslipResponse(BaseModel):
    id: int
    year: int
    month: int
    title: Optional[str]
    company_name: Optional[str]
    gross_salary: float
    paye: float
    uif_employee_portion: float
    net_pay: float
    gcs_file_path: Optional[str]
    uploaded_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    items: List[PayslipItemResponse]
    additional_income: List[PayslipAdditionalIncomeResponse]

    class Config:
        from_attributes = True


class PayslipUpdateRequest(BaseModel):
    title: Optional[str] = None
    company_name: Optional[str] = None
    gross_salary: Optional[float] = None
    paye: Optional[float] = None
    uif_employee_portion: Optional[float] = None
    net_pay: Optional[float] = None


class PayslipItemCreate(BaseModel):
    description: str
    amount: float
    item_type: str  # 'company_contribution' or 'personal_deduction'


class PayslipItemUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    item_type: Optional[str] = None


class PayslipAdditionalIncomeCreate(BaseModel):
    description: str
    amount: float


class PayslipExtractionPreview(BaseModel):
    """Preview of extracted payslip data before saving."""
    title: Optional[str]
    company_name: Optional[str]
    gross_salary: float
    paye: float
    uif_employee_portion: float
    net_pay: float
    company_contributions: List[dict]  # [{"description": str, "amount": float}]
    other_deductions: List[dict]
    additional_income: List[dict]
    temp_file_id: str  # Temporary identifier to link extraction to confirmation


class PayslipConfirmRequest(BaseModel):
    """Confirmed payslip data after user review."""
    year: int
    month: int
    title: Optional[str]
    company_name: Optional[str]
    gross_salary: float
    paye: float
    uif_employee_portion: float
    net_pay: float
    company_contributions: List[dict]
    other_deductions: List[dict]
    additional_income: List[dict]
    temp_file_id: str


class FinancialYearSummary(BaseModel):
    financial_year: str  # e.g., "2025/26"
    start_year: int
    total_gross_income: float
    total_paye: float
    total_uif: float
    total_net_pay: float
    total_company_contributions: float
    total_personal_deductions: float
    total_additional_income: float
    months: List[dict]  # Monthly breakdown


# =====================================================
# Helper Functions
# =====================================================

def recalculate_net_pay(payslip: MonthlyPayslip, db: Session) -> None:
    """
    Recalculate and update the net pay for a payslip based on all components.
    
    Net Pay = Gross Salary + Additional Income - PAYE - UIF - Company Contributions - Personal Deductions
    """
    total_additional_income = sum(item.amount for item in payslip.additional_income)
    total_income = payslip.gross_salary + total_additional_income
    total_company_contrib = sum(item.amount for item in payslip.items if item.item_type == 'company_contribution')
    total_personal_deduct = sum(item.amount for item in payslip.items if item.item_type == 'personal_deduction')
    
    payslip.net_pay = total_income - payslip.paye - payslip.uif_employee_portion - total_company_contrib - total_personal_deduct


def get_payslip_or_404(
    db: Session, user_id: int, year: int, month: int
) -> MonthlyPayslip:
    """Get payslip or raise 404."""
    payslip = (
        db.query(MonthlyPayslip)
        .filter(
            MonthlyPayslip.user_id == user_id,
            MonthlyPayslip.year == year,
            MonthlyPayslip.month == month,
        )
        .first()
    )
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return payslip


def calculate_financial_year_range(fy_start_year: int) -> tuple:
    """
    Calculate the start and end dates for a SA financial year.
    FY starts March 1st and ends Feb 28/29 of next year.
    
    Args:
        fy_start_year: The starting year (e.g., 2025 for FY 2025/26)
    
    Returns:
        Tuple of (start_month_year_pairs, fy_label)
    """
    from ..utils import format_sa_financial_year_label
    
    # March of start year to February of next year
    months = []
    for month in range(3, 13):  # March to December
        months.append((fy_start_year, month))
    for month in range(1, 3):  # January to February of next year
        months.append((fy_start_year + 1, month))
    
    fy_label = format_sa_financial_year_label(fy_start_year)
    return months, fy_label


# =====================================================
# Upload & Extract Endpoints
# =====================================================

@router.post("/extract-preview", response_model=PayslipExtractionPreview)
async def extract_payslip_preview(
    file: UploadFile = File(...),
    year: int = Form(...),
    month: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Extract data from payslip PDF and return preview without saving to database.
    This allows users to review and edit before confirming.
    """
    # Validate month
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    # Validate file type
    if not file.content_type == "application/pdf":
        raise HTTPException(
            status_code=400, detail="Only PDF files are supported"
        )

    # Check user has OpenAI API key
    if not current_user.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key not configured. Please add it in Settings.",
        )

    # Read file content
    file_content = await file.read()
    
    # Validate file size (10MB max)
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    try:
        # Initialize GCS service
        gcs_service = PayslipGCSService()
        if not gcs_service.is_available():
            raise HTTPException(
                status_code=500, detail="Cloud storage service unavailable"
            )

        # Upload to temporary location in GCS
        temp_file_id = f"temp_{current_user.id}_{year}_{month}_{get_sast_now().timestamp()}"
        gcs_path = f"payslips/temp/{temp_file_id}.pdf"
        
        from io import BytesIO
        bucket = gcs_service.client.bucket(gcs_service.bucket_name)
        blob = bucket.blob(gcs_path)
        blob.upload_from_file(BytesIO(file_content), content_type="application/pdf")

        # Extract data using OpenAI
        api_key = decrypt_api_key(current_user.openai_api_key)
        try:
            extracted_data = extract_payslip_data(file_content, api_key)
        except Exception as e:
            # If extraction fails, delete the temp file
            blob.delete()
            logger.error(f"Extraction failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract payslip data: {str(e)}",
            )

        # Return preview data
        return PayslipExtractionPreview(
            title=extracted_data.title,
            company_name=extracted_data.company_name,
            gross_salary=extracted_data.gross_salary,
            paye=extracted_data.paye,
            uif_employee_portion=extracted_data.uif_employee_portion,
            net_pay=extracted_data.net_pay,
            company_contributions=[
                {"description": item.description, "amount": item.amount}
                for item in extracted_data.company_contributions
            ],
            other_deductions=[
                {"description": item.description, "amount": item.amount}
                for item in extracted_data.other_deductions
            ],
            additional_income=[
                {"description": item.description, "amount": item.amount}
                for item in extracted_data.additional_income
            ],
            temp_file_id=temp_file_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting payslip: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/confirm-upload", response_model=PayslipResponse)
async def confirm_payslip_upload(
    data: PayslipConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Confirm and save the reviewed payslip data to database.
    Moves the temp file to permanent location.
    """
    try:
        # Initialize GCS service
        gcs_service = PayslipGCSService()
        if not gcs_service.is_available():
            raise HTTPException(
                status_code=500, detail="Cloud storage service unavailable"
            )

        # Move temp file to permanent location
        temp_path = f"payslips/temp/{data.temp_file_id}.pdf"
        permanent_path = f"payslips/{current_user.id}/{data.year}-{data.month:02d}.pdf"
        
        bucket = gcs_service.client.bucket(gcs_service.bucket_name)
        temp_blob = bucket.blob(temp_path)
        
        if not temp_blob.exists():
            raise HTTPException(status_code=404, detail="Temporary file not found. Please upload again.")
        
        # Check if payslip already exists (replace if it does)
        existing_payslip = (
            db.query(MonthlyPayslip)
            .filter(
                MonthlyPayslip.user_id == current_user.id,
                MonthlyPayslip.year == data.year,
                MonthlyPayslip.month == data.month,
            )
            .first()
        )

        if existing_payslip:
            # Delete old file from GCS if different
            if existing_payslip.gcs_file_path and existing_payslip.gcs_file_path != permanent_path:
                old_blob = bucket.blob(existing_payslip.gcs_file_path)
                if old_blob.exists():
                    old_blob.delete()
            
            # Update existing payslip
            existing_payslip.title = data.title
            existing_payslip.company_name = data.company_name
            existing_payslip.gross_salary = data.gross_salary
            existing_payslip.paye = data.paye
            existing_payslip.uif_employee_portion = data.uif_employee_portion
            existing_payslip.net_pay = data.net_pay
            existing_payslip.gcs_file_path = permanent_path
            existing_payslip.uploaded_at = get_sast_now()
            existing_payslip.updated_at = get_sast_now()
            
            # Delete existing items and additional income
            db.query(PayslipItem).filter(PayslipItem.payslip_id == existing_payslip.id).delete()
            db.query(PayslipAdditionalIncome).filter(
                PayslipAdditionalIncome.payslip_id == existing_payslip.id
            ).delete()
            
            payslip = existing_payslip
        else:
            # Create new payslip
            payslip = MonthlyPayslip(
                user_id=current_user.id,
                year=data.year,
                month=data.month,
                title=data.title,
                company_name=data.company_name,
                gross_salary=data.gross_salary,
                paye=data.paye,
                uif_employee_portion=data.uif_employee_portion,
                net_pay=data.net_pay,
                gcs_file_path=permanent_path,
                uploaded_at=get_sast_now(),
            )
            db.add(payslip)
            db.flush()  # Get the ID

        # Copy temp file to permanent location
        bucket.copy_blob(temp_blob, bucket, permanent_path)
        temp_blob.delete()  # Delete temp file

        # Add company contributions
        for item in data.company_contributions:
            payslip_item = PayslipItem(
                payslip_id=payslip.id,
                description=item["description"],
                amount=item["amount"],
                item_type="company_contribution",
            )
            db.add(payslip_item)

        # Add personal deductions
        for item in data.other_deductions:
            payslip_item = PayslipItem(
                payslip_id=payslip.id,
                description=item["description"],
                amount=item["amount"],
                item_type="personal_deduction",
            )
            db.add(payslip_item)

        # Add additional income
        for item in data.additional_income:
            additional_income = PayslipAdditionalIncome(
                payslip_id=payslip.id,
                description=item["description"],
                amount=item["amount"],
            )
            db.add(additional_income)

        db.commit()
        db.refresh(payslip)

        logger.info(
            f"Successfully confirmed and saved payslip for user {current_user.id}, {data.year}-{data.month:02d}"
        )
        return payslip

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming payslip: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=PayslipResponse)
async def upload_payslip(
    file: UploadFile = File(...),
    year: int = Form(...),
    month: int = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a payslip PDF and extract data using OpenAI.
    If a payslip already exists for this month/year, it will be replaced.
    """
    # Validate month
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

    # Validate file type
    if not file.content_type == "application/pdf":
        raise HTTPException(
            status_code=400, detail="Only PDF files are supported"
        )

    # Check user has OpenAI API key
    if not current_user.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key not configured. Please add it in Settings.",
        )

    # Read file content
    file_content = await file.read()
    
    # Validate file size (10MB max)
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    try:
        # Initialize GCS service
        gcs_service = PayslipGCSService()
        if not gcs_service.is_available():
            raise HTTPException(
                status_code=500, detail="Cloud storage service unavailable"
            )

        # Upload to GCS
        gcs_path = gcs_service.upload_payslip(
            current_user.id, year, month, file_content
        )
        if not gcs_path:
            raise HTTPException(status_code=500, detail="Failed to upload file")

        # Extract data using OpenAI
        api_key = decrypt_api_key(current_user.openai_api_key)
        try:
            extracted_data = extract_payslip_data(file_content, api_key)
        except Exception as e:
            # If extraction fails, delete the uploaded file
            gcs_service.delete_payslip(gcs_path)
            logger.error(f"Extraction failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract payslip data: {str(e)}",
            )

        # Check if payslip already exists (replace if it does)
        existing_payslip = (
            db.query(MonthlyPayslip)
            .filter(
                MonthlyPayslip.user_id == current_user.id,
                MonthlyPayslip.year == year,
                MonthlyPayslip.month == month,
            )
            .first()
        )

        if existing_payslip:
            # Delete old file from GCS if different
            if existing_payslip.gcs_file_path and existing_payslip.gcs_file_path != gcs_path:
                gcs_service.delete_payslip(existing_payslip.gcs_file_path)
            
            # Update existing payslip
            existing_payslip.title = extracted_data.title
            existing_payslip.company_name = extracted_data.company_name
            existing_payslip.gross_salary = extracted_data.gross_salary
            existing_payslip.paye = extracted_data.paye
            existing_payslip.uif_employee_portion = extracted_data.uif_employee_portion
            existing_payslip.net_pay = extracted_data.net_pay
            existing_payslip.gcs_file_path = gcs_path
            existing_payslip.uploaded_at = get_sast_now()
            existing_payslip.updated_at = get_sast_now()
            
            # Delete existing items and additional income
            db.query(PayslipItem).filter(PayslipItem.payslip_id == existing_payslip.id).delete()
            db.query(PayslipAdditionalIncome).filter(
                PayslipAdditionalIncome.payslip_id == existing_payslip.id
            ).delete()
            
            payslip = existing_payslip
        else:
            # Create new payslip
            payslip = MonthlyPayslip(
                user_id=current_user.id,
                year=year,
                month=month,
                title=extracted_data.title,
                company_name=extracted_data.company_name,
                gross_salary=extracted_data.gross_salary,
                paye=extracted_data.paye,
                uif_employee_portion=extracted_data.uif_employee_portion,
                net_pay=extracted_data.net_pay,
                gcs_file_path=gcs_path,
                uploaded_at=get_sast_now(),
            )
            db.add(payslip)
            db.flush()  # Get the ID

        # Add company contributions
        for item in extracted_data.company_contributions:
            payslip_item = PayslipItem(
                payslip_id=payslip.id,
                description=item.description,
                amount=item.amount,
                item_type="company_contribution",
            )
            db.add(payslip_item)

        # Add personal deductions
        for item in extracted_data.other_deductions:
            payslip_item = PayslipItem(
                payslip_id=payslip.id,
                description=item.description,
                amount=item.amount,
                item_type="personal_deduction",
            )
            db.add(payslip_item)

        # Add additional income
        for item in extracted_data.additional_income:
            additional_income = PayslipAdditionalIncome(
                payslip_id=payslip.id,
                description=item.description,
                amount=item.amount,
            )
            db.add(additional_income)

        db.commit()
        db.refresh(payslip)

        logger.info(
            f"Successfully uploaded and extracted payslip for user {current_user.id}, {year}-{month:02d}"
        )
        return payslip

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading payslip: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# CRUD Operations
# =====================================================

@router.get("/latest", response_model=PayslipResponse)
def get_latest_payslip(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the most recent payslip for the current user."""
    payslip = (
        db.query(MonthlyPayslip)
        .filter(MonthlyPayslip.user_id == current_user.id)
        .order_by(MonthlyPayslip.year.desc(), MonthlyPayslip.month.desc())
        .first()
    )
    
    if not payslip:
        raise HTTPException(status_code=404, detail="No payslips found")
    
    return payslip


@router.get("/{year}/{month}", response_model=PayslipResponse)
def get_payslip(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific month's payslip."""
    payslip = get_payslip_or_404(db, current_user.id, year, month)
    return payslip


@router.get("/history", response_model=List[PayslipResponse])
def get_payslip_history(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all payslips for the current user."""
    payslips = (
        db.query(MonthlyPayslip)
        .filter(MonthlyPayslip.user_id == current_user.id)
        .order_by(MonthlyPayslip.year.desc(), MonthlyPayslip.month.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return payslips


@router.put("/{year}/{month}", response_model=PayslipResponse)
def update_payslip(
    year: int,
    month: int,
    update_data: PayslipUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually update payslip data and recalculate net pay."""
    payslip = get_payslip_or_404(db, current_user.id, year, month)

    # Update fields
    if update_data.title is not None:
        payslip.title = update_data.title
    if update_data.company_name is not None:
        payslip.company_name = update_data.company_name
    if update_data.gross_salary is not None:
        payslip.gross_salary = update_data.gross_salary
    if update_data.paye is not None:
        payslip.paye = update_data.paye
    if update_data.uif_employee_portion is not None:
        payslip.uif_employee_portion = update_data.uif_employee_portion
    if update_data.net_pay is not None:
        payslip.net_pay = update_data.net_pay

    # Recalculate net pay based on all components
    recalculate_net_pay(payslip, db)
    payslip.updated_at = get_sast_now()

    db.commit()
    db.refresh(payslip)
    return payslip


@router.delete("/{year}/{month}")
def delete_payslip(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a payslip and its associated file."""
    payslip = get_payslip_or_404(db, current_user.id, year, month)

    # Delete file from GCS
    if payslip.gcs_file_path:
        gcs_service = PayslipGCSService()
        gcs_service.delete_payslip(payslip.gcs_file_path)

    db.delete(payslip)
    db.commit()

    return {"message": "Payslip deleted successfully"}


@router.get("/{year}/{month}/pdf")
def download_payslip_pdf(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download the original payslip PDF."""
    payslip = get_payslip_or_404(db, current_user.id, year, month)

    if not payslip.gcs_file_path:
        raise HTTPException(status_code=404, detail="No PDF file available")

    # Download from GCS
    gcs_service = PayslipGCSService()
    file_content = gcs_service.download_payslip(payslip.gcs_file_path)

    if not file_content:
        raise HTTPException(status_code=500, detail="Failed to download PDF")

    filename = f"payslip_{year}_{month:02d}.pdf"
    return Response(
        content=file_content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# =====================================================
# Line Item Operations
# =====================================================

@router.post("/{year}/{month}/items", response_model=PayslipItemResponse)
def add_payslip_item(
    year: int,
    month: int,
    item_data: PayslipItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a line item to a payslip and recalculate net pay."""
    payslip = get_payslip_or_404(db, current_user.id, year, month)

    item = PayslipItem(
        payslip_id=payslip.id,
        description=item_data.description,
        amount=item_data.amount,
        item_type=item_data.item_type,
    )
    db.add(item)
    db.flush()  # Flush to get the item in the session for recalculation
    
    # Recalculate net pay
    recalculate_net_pay(payslip, db)
    payslip.updated_at = get_sast_now()
    
    db.commit()
    db.refresh(item)
    return item


@router.put("/items/{item_id}", response_model=PayslipItemResponse)
def update_payslip_item(
    item_id: int,
    item_data: PayslipItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a payslip line item and recalculate net pay."""
    item = db.query(PayslipItem).filter(PayslipItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Verify ownership
    payslip = db.query(MonthlyPayslip).filter(MonthlyPayslip.id == item.payslip_id).first()
    if payslip.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Update fields
    if item_data.description is not None:
        item.description = item_data.description
    if item_data.amount is not None:
        item.amount = item_data.amount
    if item_data.item_type is not None:
        item.item_type = item_data.item_type

    # Recalculate net pay
    recalculate_net_pay(payslip, db)
    payslip.updated_at = get_sast_now()
    
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_payslip_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a payslip line item and recalculate net pay."""
    item = db.query(PayslipItem).filter(PayslipItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Verify ownership
    payslip = db.query(MonthlyPayslip).filter(MonthlyPayslip.id == item.payslip_id).first()
    if payslip.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(item)
    db.flush()  # Flush the deletion before recalculating
    
    # Recalculate net pay
    recalculate_net_pay(payslip, db)
    payslip.updated_at = get_sast_now()
    
    db.commit()

    return {"message": "Item deleted successfully"}


# =====================================================
# Additional Income Operations
# =====================================================

@router.post("/{year}/{month}/additional-income", response_model=PayslipAdditionalIncomeResponse)
def add_additional_income(
    year: int,
    month: int,
    income_data: PayslipAdditionalIncomeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add additional income to a payslip and recalculate net pay."""
    payslip = get_payslip_or_404(db, current_user.id, year, month)

    income = PayslipAdditionalIncome(
        payslip_id=payslip.id,
        description=income_data.description,
        amount=income_data.amount,
    )
    db.add(income)
    db.flush()  # Flush to get the item in the session for recalculation
    
    # Recalculate net pay
    recalculate_net_pay(payslip, db)
    payslip.updated_at = get_sast_now()
    
    db.commit()
    db.refresh(income)
    return income


# =====================================================
# Financial Year Aggregations
# =====================================================

@router.get("/financial-year/{fy_start_year}", response_model=FinancialYearSummary)
def get_financial_year_summary(
    fy_start_year: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get financial year summary with totals and monthly breakdown.
    FY starts in March and ends in February of the next year.
    
    Example: fy_start_year=2025 returns FY 2025/26 (March 2025 - Feb 2026)
    """
    months, fy_label = calculate_financial_year_range(fy_start_year)

    # Initialize totals
    total_gross = 0.0
    total_paye = 0.0
    total_uif = 0.0
    total_net = 0.0
    total_company_contrib = 0.0
    total_personal_deduct = 0.0
    total_additional = 0.0
    monthly_data = []

    # Fetch payslips for each month in the FY
    for year, month in months:
        payslip = (
            db.query(MonthlyPayslip)
            .filter(
                MonthlyPayslip.user_id == current_user.id,
                MonthlyPayslip.year == year,
                MonthlyPayslip.month == month,
            )
            .first()
        )

        if payslip:
            # Calculate sums for this month
            company_contrib_sum = sum(
                item.amount
                for item in payslip.items
                if item.item_type == "company_contribution"
            )
            personal_deduct_sum = sum(
                item.amount
                for item in payslip.items
                if item.item_type == "personal_deduction"
            )
            additional_sum = sum(inc.amount for inc in payslip.additional_income)

            # Update totals
            total_gross += payslip.gross_salary
            total_paye += payslip.paye
            total_uif += payslip.uif_employee_portion
            total_net += payslip.net_pay
            total_company_contrib += company_contrib_sum
            total_personal_deduct += personal_deduct_sum
            total_additional += additional_sum

            monthly_data.append(
                {
                    "year": year,
                    "month": month,
                    "month_name": datetime(year, month, 1).strftime("%B"),
                    "gross_salary": payslip.gross_salary,
                    "paye": payslip.paye,
                    "uif": payslip.uif_employee_portion,
                    "net_pay": payslip.net_pay,
                    "company_contributions": company_contrib_sum,
                    "personal_deductions": personal_deduct_sum,
                    "additional_income": additional_sum,
                    "has_data": True,
                }
            )
        else:
            monthly_data.append(
                {
                    "year": year,
                    "month": month,
                    "month_name": datetime(year, month, 1).strftime("%B"),
                    "gross_salary": 0.0,
                    "paye": 0.0,
                    "uif": 0.0,
                    "net_pay": 0.0,
                    "company_contributions": 0.0,
                    "personal_deductions": 0.0,
                    "additional_income": 0.0,
                    "has_data": False,
                }
            )

    return FinancialYearSummary(
        financial_year=fy_label,
        start_year=fy_start_year,
        total_gross_income=total_gross,
        total_paye=total_paye,
        total_uif=total_uif,
        total_net_pay=total_net,
        total_company_contributions=total_company_contrib,
        total_personal_deductions=total_personal_deduct,
        total_additional_income=total_additional,
        months=monthly_data,
    )
