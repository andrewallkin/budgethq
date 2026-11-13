"""
Extract structured payslip data through OpenRouter.

The PDF is sent as a base64 file part. Gemini 2.5 Flash returns a strict
JSON schema, and payslip_reconcile checks the line items against net pay.
"""

import base64
import logging

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

from .openrouter import OPENROUTER_MODEL, openrouter_client

logger = logging.getLogger(__name__)

_SCHEMA_REPAIR = (
    "\n\nYour previous response was not valid against the required schema. "
    "Validation errors:\n{errors}\n"
    "Return ONLY corrected JSON matching the schema exactly. No prose."
)


class FinancialEntry(BaseModel):
    """A single line item with description and amount."""
    description: str = Field(..., description="The name of the line item")
    amount: float = Field(..., description="The monetary value of the line item")


class PayslipExtraction(BaseModel):
    """Structured payslip data extracted from PDF."""
    title: str | None = Field(
        None,
        description=(
            "The employee's job title or position (e.g., 'Software Engineer', 'Manager', 'Consultant'). "
            "Extract the actual job title from the payslip if present. Return null if not found. "
            "Never use generic terms like 'PayslipExtraction' or 'Employee'."
        ),
    )
    company_name: str = Field(..., description="The name of the employer company")
    gross_salary: float = Field(
        ...,
        description=(
            "EXACTLY the printed Gross Salary or Salary line for this period (regular salary only). "
            "Do not include bonuses, backpay, allowances, reimbursements, or claims."
        ),
    )
    total_earnings: float = Field(
        0,
        description=(
            "The printed Total Earnings figure. It equals gross_salary plus every other earnings-column "
            "line (bonus, backpay, allowances, and an expense claim printed in the earnings column). "
            "Do not include company contributions or deductions."
        ),
    )
    company_contributions: list[FinancialEntry] = Field(
        ...,
        description=(
            "Beneficial contributions made by the company on behalf of the employee "
            "(e.g., Medical Aid, Group Life). Excludes SDL and employer UIF."
        ),
    )
    paye: float = Field(..., description="Pay As You Earn income tax")
    uif_employee_portion: float = Field(..., description="The employee's specific UIF deduction")
    other_deductions: list[FinancialEntry] = Field(
        ...,
        description="Personal deductions that reduce net pay, such as employee medical aid or an Expense Claims recovery.",
    )
    additional_income: list[FinancialEntry] = Field(
        default_factory=list,
        description=(
            "Bonuses, backpay, and allowances printed in the income or earnings column. "
            "Do not put an Expense Claims row here when that row only appears in the deductions column."
        ),
    )
    net_pay: float = Field(..., description="The final take-home pay")


EXTRACTION_QUESTION = (
    "Extract the following from the payslip: "
    "1. Employee's job title/position (the actual role, not the document type), "
    "2. Company name, "
    "3. Gross salary (the salary line only, not total earnings), "
    "3b. Total earnings (the printed Total Earnings figure), "
    "4. Beneficial company contributions (list them individually but exclude SDL and employer UIF), "
    "5. PAYE, "
    "6. Employee portion of UIF, "
    "7. Other personal deductions, "
    "8. Final net pay. "
    "If present, also extract any additional income such as bonuses, backpay or allowances as separate 'additional_income' items — never add them into 'gross_salary'. "
    "Important: For the job title, extract the employee's actual position/role from the payslip, not generic terms."
)

SYSTEM_PROMPT = (
    "You are a professional financial data extractor. Your goal is to extract "
    "a mathematically accurate representation of this payslip."
    "\n\n### GROSS SALARY DEFINITION (CRITICAL) ###"
    "\n- 'gross_salary' is EXACTLY the printed Gross Salary line (regular salary for this period)."
    "\n- Do NOT sum other income into it. Bonuses, backpay, allowances, reimbursements and claims"
    " are separate line items that belong in 'additional_income' — they must NOT be added to 'gross_salary'."
    "\n- Total earnings for the period = 'gross_salary' + the sum of 'additional_income'. Keep them separate."
    "\n- 'total_earnings' is the printed Total Earnings line. Do not add that total row again as a line item."
    "\n\n### CLAIMS / REIMBURSEMENTS PLACEMENT (CRITICAL) ###"
    "\n- Look at which COLUMN the claim/reimbursement row is printed in:"
    "\n  - Deductions column (reduces net pay, e.g. an amount recovered from the employee)"
    " → 'other_deductions'. This is the usual case for 'Expense Claims' on payslips."
    "\n  - Income/earnings column (adds to net pay) → 'additional_income'."
    "\n- If the row is in doubt, prefer 'other_deductions'. An Expense Claims row that reduces"
    " net pay must NEVER appear in 'additional_income'."
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


def _response_format() -> dict:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": PayslipExtraction.__name__,
            "strict": True,
            "schema": PayslipExtraction.model_json_schema(),
        },
    }


def _messages(file_bytes: bytes) -> list[dict]:
    encoded = base64.standard_b64encode(file_bytes).decode()
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": EXTRACTION_QUESTION},
                {
                    "type": "file",
                    "file": {
                        "filename": "payslip.pdf",
                        "file_data": f"data:application/pdf;base64,{encoded}",
                    },
                },
            ],
        },
    ]


def _parse_completion(client: OpenAI, messages: list[dict]) -> PayslipExtraction:
    from .payslip_reconcile import reconcile_payslip

    attempt_messages = list(messages)
    last_error: ValidationError | None = None
    for attempt in range(2):
        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=attempt_messages,
            temperature=0,
            response_format=_response_format(),
            extra_body={"provider": {"require_parameters": True}},
        )
        content = response.choices[0].message.content or ""
        try:
            parsed = PayslipExtraction.model_validate_json(content)
            logger.info("Payslip extraction completed")
            return reconcile_payslip(parsed)
        except ValidationError as exc:
            last_error = exc
            if attempt == 0:
                logger.info("Payslip schema retry")
                attempt_messages = [
                    *messages,
                    {"role": "assistant", "content": content},
                    {
                        "role": "user",
                        "content": _SCHEMA_REPAIR.format(
                            errors="\n".join(str(err) for err in exc.errors()[:10])
                        ),
                    },
                ]
                continue
    assert last_error is not None
    raise last_error


def extract_payslip_data(file_bytes: bytes, api_key: str) -> PayslipExtraction:
    """
    Extract structured data from a payslip PDF.

    Args:
        file_bytes: PDF file content as bytes
        api_key: User's OpenRouter API key

    Returns:
        PayslipExtraction with line items reconciled to net pay where the totals allow it.
    """
    if not api_key:
        raise ValueError("OpenRouter API key is required")

    client = openrouter_client(api_key)
    try:
        return _parse_completion(client, _messages(file_bytes))
    except Exception as exc:
        logger.exception("Payslip extraction failed: %s: %s", type(exc).__name__, exc)
        raise
