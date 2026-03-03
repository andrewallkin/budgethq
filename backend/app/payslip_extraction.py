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
    "You are a professional financial data extractor. Your goal is to extract "
    "a mathematically accurate representation of this payslip."
    "\n\n### CRITICAL DEDUPLICATION RULES ###"
    "\n1. IDENTIFY SUBTOTALS: If a row label is a generic category (e.g., 'Allowance', 'Deduction', 'Reimbursement') "
    "and the row immediately following it has the EXACT same value, the first row is a header. "
    "DO NOT extract the header; only extract the specific line item."
    "\n2. EXAMPLES: If you see 'Allowance: 1320.30' followed by 'Travel Allowance: 1320.30', "
    "extract ONLY 'Travel Allowance'."
    "\n3. MATHEMATICAL ANCHOR: The sum of all extracted Income + Allowances - Deductions + Reimbursements "
    "MUST equal the 'Nett Pay' (e.g., R30,142.18). If your total is higher, you have double-counted a category header."
    "\n\n### EXCLUSIONS ###"
    "\n- Ignore employer-side costs (SDL, Employer-UIF) and employer contributions not paid to the user."
    "\n- Ignore rows labeled only as 'Income', 'Deduction', or 'Allowance' if they are subtotals."
    "\n\n### JOB TITLE EXTRACTION ###"
    "\n- Extract the employee's actual job title/position from the payslip (e.g., 'Senior Developer', 'Accountant', 'Manager')."
    "\n- Do NOT use generic terms like 'PayslipExtraction' or 'Employee'."
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

        logger.info("File uploaded to OpenAI", extra={"file_id": file_id})

        # Extract structured data using OpenAI
        response = client.responses.parse(
            model="gpt-5",
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
        logger.info("Payslip extraction completed")
        
        return payslip_data

    except Exception as e:
        logger.exception("Payslip extraction failed: %s: %s", type(e).__name__, e)
        raise

    finally:
        # Cleanup: Delete uploaded file from OpenAI
        if file_id:
            try:
                client.files.delete(file_id)
                logger.info("OpenAI file deleted", extra={"file_id": file_id})
            except Exception as e:
                logger.warning(
                    "Failed to delete OpenAI file: %s: %s",
                    type(e).__name__,
                    e,
                    extra={"file_id": file_id},
                )
        
        # Cleanup: Delete temporary file
        if temp_file_path:
            try:
                Path(temp_file_path).unlink()
            except Exception as e:
                logger.warning(
                    "Failed to delete temp file: %s: %s",
                    type(e).__name__,
                    e,
                )
