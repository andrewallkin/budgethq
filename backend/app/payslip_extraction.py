"""
OpenAI service for extracting structured data from payslip PDFs.
Uses OpenAI's structured output with Pydantic models.
"""

import logging
from typing import List, Tuple, Optional
from pydantic import BaseModel, Field
from openai import OpenAI
from pathlib import Path
import tempfile

logger = logging.getLogger(__name__)


class FinancialEntry(BaseModel):
    """A single line item with description and amount."""
    description: str = Field(..., description="The name of the line item")
    amount: float = Field(..., description="The monetary value of the line item")


class PayslipExtraction(BaseModel):
    """Structured payslip data extracted from PDF."""
    title: Optional[str] = Field(None, description="The employee's job title or position (e.g., 'Software Engineer', 'Manager', 'Consultant'). Extract the actual job title from the payslip if present. Return None if not found. Never use generic terms like 'PayslipExtraction' or 'Employee'.")
    company_name: str = Field(..., description="The name of the employer company")
    gross_salary: float = Field(..., description="Total earnings before deductions")
    company_contributions: List[FinancialEntry] = Field(
        ..., 
        description="Beneficial contributions made by the company on behalf of the employee (e.g., Medical Aid, Group Life). Excludes SDL and employer UIF."
    )
    paye: float = Field(..., description="Pay As You Earn income tax")
    uif_employee_portion: float = Field(..., description="The employee's specific UIF deduction")
    other_deductions: List[FinancialEntry] = Field(
        ..., 
        description="Any additional personal deductions like Medical Aid"
    )
    additional_income: List[FinancialEntry] = Field(
        default_factory=list,
        description="Any additional income such as bonuses or reimbursements from claims."
    )
    net_pay: float = Field(..., description="The final take-home pay")


EXTRACTION_QUESTION = (
    "Extract the following from the payslip: "
    "1. Employee's job title/position (the actual role, not the document type), "
    "2. Company name, "
    "3. Gross salary, "
    "4. Beneficial company contributions (list them individually but exclude SDL and employer UIF), "
    "5. PAYE, "
    "6. Employee portion of UIF, "
    "7. Other personal deductions, "
    "8. Final net pay. "
    "If present, also extract any additional income such as bonuses or reimbursements from claims. "
    "Important: For the job title, extract the employee's actual position/role from the payslip, not generic terms."
)

SYSTEM_PROMPT = (
    "You are a professional financial data extractor specialized in South African payslips. "
    "Analyze the payslip and return strictly structured JSON with accurate data. "
    "When extracting the job title, find the employee's actual position/role (e.g., 'Senior Developer', 'Accountant', 'Manager'). "
    "Do NOT use generic terms like 'PayslipExtraction' or 'Employee'. "
    "Ignore employer-side statutory costs like SDL and employer-UIF."
)


def extract_payslip_data(file_bytes: bytes, api_key: str) -> PayslipExtraction:
    """
    Extract structured data from a payslip PDF using OpenAI.

    Args:
        file_bytes: PDF file content as bytes
        api_key: User's OpenAI API key

    Returns:
        PayslipExtraction object with structured data

    Raises:
        Exception: If extraction fails
    """
    if not api_key:
        raise ValueError("OpenAI API key is required")

    client = OpenAI(api_key=api_key)
    file_id = None
    temp_file_path = None

    try:
        # Create a temporary file to upload to OpenAI
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".pdf", delete=False) as temp_file:
            temp_file.write(file_bytes)
            temp_file_path = temp_file.name

        # Upload file to OpenAI
        with open(temp_file_path, "rb") as f:
            uploaded_file = client.files.create(
                file=f,
                purpose="assistants"
            )
            file_id = uploaded_file.id

        logger.info(f"Uploaded file to OpenAI: {file_id}")

        # Extract structured data using OpenAI
        response = client.responses.parse(
            model="gpt-4o-mini",
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": SYSTEM_PROMPT
                        }
                    ]
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": EXTRACTION_QUESTION},
                        {"type": "input_file", "file_id": file_id}
                    ]
                }
            ],
            text_format=PayslipExtraction
        )

        # Extract structured output
        payslip_data: PayslipExtraction = response.output_parsed
        logger.info(f"Successfully extracted payslip data for {payslip_data.company_name}")
        
        return payslip_data

    except Exception as e:
        logger.error(f"Error extracting payslip data: {e}")
        raise

    finally:
        # Cleanup: Delete uploaded file from OpenAI
        if file_id:
            try:
                client.files.delete(file_id)
                logger.info(f"Deleted file from OpenAI: {file_id}")
            except Exception as e:
                logger.warning(f"Failed to delete file from OpenAI: {e}")
        
        # Cleanup: Delete temporary file
        if temp_file_path:
            try:
                Path(temp_file_path).unlink()
            except Exception as e:
                logger.warning(f"Failed to delete temp file: {e}")
