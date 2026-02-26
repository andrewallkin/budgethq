from datetime import datetime

# 2025 Tax Year (1 March 2024 - 28 Feb 2025)
TAX_YEAR_2025 = {
    "brackets": [
        {"limit": 237100, "rate": 0.18, "base": 0},
        {"limit": 370500, "rate": 0.26, "base": 42678},
        {"limit": 512800, "rate": 0.31, "base": 77362},
        {"limit": 673000, "rate": 0.36, "base": 121475},
        {"limit": 857900, "rate": 0.39, "base": 179147},
        {"limit": 1817000, "rate": 0.41, "base": 251258},
        {"limit": float('inf'), "rate": 0.45, "base": 644489}
    ],
    "rebates": {
        "primary": 17235,
        "secondary": 9444, # 65+
        "tertiary": 3145   # 75+
    },
    "thresholds": {
        "under_65": 95750,
        "65_to_74": 148217,
        "75_plus": 165689
    },
    "medical_credits": {
        "main_member": 364,
        "first_dependent": 364,
        "additional_dependent": 246
    },
    "uif_cap": 17712, # Monthly cap (1% of this) = 177.12
    "tfsa_annual_limit": 36000,
    "ra_max_deduction": 350000
}

# 2026 Tax Year (1 March 2026 - 28 Feb 2027)
TAX_YEAR_2026 = {
    "brackets": [
        {"limit": 245100, "rate": 0.18, "base": 0},
        {"limit": 383100, "rate": 0.26, "base": 44118},
        {"limit": 530200, "rate": 0.31, "base": 79998},
        {"limit": 695800, "rate": 0.36, "base": 125599},
        {"limit": 887000, "rate": 0.39, "base": 185215},
        {"limit": 1878600, "rate": 0.41, "base": 259783},
        {"limit": float('inf'), "rate": 0.45, "base": 666339}
    ],
    "rebates": {
        "primary": 17820,
        "secondary": 9765, # 65+
        "tertiary": 3249   # 75+
    },
    "thresholds": {
        "under_65": 99000,
        "65_to_74": 153250,
        "75_plus": 171300
    },
    "medical_credits": {
        "main_member": 376,
        "first_dependent": 376,
        "additional_dependent": 254
    },
    "uif_cap": 17712, # Monthly cap (1% of this) = 177.12 (unchanged)
    "tfsa_annual_limit": 46000,
    "ra_max_deduction": 430000
}

_TAX_CONFIGS = {2025: TAX_YEAR_2025, 2026: TAX_YEAR_2026}

def get_tax_config(financial_year_start: int) -> dict:
    """Return tax config for the given FY start year, defaulting to earliest known year."""
    return _TAX_CONFIGS.get(financial_year_start, TAX_YEAR_2025)

def calculate_paye(taxable_income_annual: float, age: int, tax_year_data=TAX_YEAR_2025) -> float:
    """Calculate annual PAYE based on taxable income and age."""
    # 1. Determine Tax Bracket
    bracket = None
    for b in tax_year_data["brackets"]:
        if taxable_income_annual <= b["limit"]:
            bracket = b
            break
    
    # Logic for top bracket (limit is inf)
    if not bracket: 
        bracket = tax_year_data["brackets"][-1] 
        # Although loop should catch it if last limit is inf.
        # But if logic above fails, fallback to top.

    # If income is exactly one of the limits, loop might break early or late depending on <=
    # Standard: <= limit.
    # But wait, brackets are usually "0 - 237100".
    # And "237101 - 370500".
    # We need to calculate the amount ABOVE the previous bracket limit to apply the rate.
    # The 'base' usually accounts for tax of all previous brackets.
    # So we need the 'lower_bound' of the current bracket.
    
    # Re-evaluating standard SA tax table format:
    # 0 – 237 100	18% of taxable income
    # 237 101 – 370 500	42 678 + 26% of taxable income above 237 100
    
    # My struct has 'limit' (upper bound).
    # I need to find the 'previous limit' to subtract.
    
    previous_limit = 0
    # Find checking loop again
    selected_bracket = tax_year_data["brackets"][0]
    for b in tax_year_data["brackets"]:
        if taxable_income_annual <= b["limit"]:
            selected_bracket = b
            break
        previous_limit = b["limit"]
        selected_bracket = b # Will end up being the last one (inf) if none match

    tax_on_base = selected_bracket["base"]
    surplus = taxable_income_annual - previous_limit
    variable_tax = surplus * selected_bracket["rate"]
    
    gross_tax = tax_on_base + variable_tax

    # 2. Apply Rebates
    rebate = tax_year_data["rebates"]["primary"]
    if age >= 65:
        rebate += tax_year_data["rebates"]["secondary"]
    if age >= 75:
        rebate += tax_year_data["rebates"]["tertiary"]

    net_tax = max(0, gross_tax - rebate)
    return net_tax

def calculate_medical_credits(members: int, tax_year_data=TAX_YEAR_2025) -> float:
    """Calculate MONTHLY medical tax credits."""
    if members <= 0:
        return 0.0
    
    credits = tax_year_data["medical_credits"]["main_member"]
    if members > 1:
        credits += tax_year_data["medical_credits"]["first_dependent"]
    if members > 2:
        credits += (members - 2) * tax_year_data["medical_credits"]["additional_dependent"]
        
    return credits

def calculate_uif(gross_cash_salary_monthly: float, tax_year_data=TAX_YEAR_2025) -> float:
    """Calculate MONTHLY UIF contribution (1% capped)."""
    uif_income = min(gross_cash_salary_monthly, tax_year_data["uif_cap"])
    return uif_income * 0.01

