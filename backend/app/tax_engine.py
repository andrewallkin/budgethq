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
    "uif_cap": 17712 # Monthly cap (1% of this) = 177.12
}

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

def calculate_salary_breakdown(salary_orm, age: int = 30, save_to_db: bool = True):
    """
    Takes a Salary ORM object (with items) and returns a detailed breakdown.
    If save_to_db is True, updates the salary record with the calculated net_pay.
    """
    # If age is in the Salary model (new), we rely on that. If it's passed as arg (old), we ignore or fallback? 
    # Let's use the explicit Salary model age if available
    tax_age = salary_orm.age if hasattr(salary_orm, 'age') and salary_orm.age else age

    # 1. Aggregation - Updated for new model
    # Gross Cash = Basic Salary + Earnings + (Company Contributions if they are paid out? No usually fringe is not cash)
    # Actually, fringe is taxable income but not cash.
    # The user says "Separate Pre and Post Tax" and "Select if Fringe".
    # Logic:
    # - basic_salary: Cash (Verified)
    # - item_type='earning': Cash (Verified)
    # - item_type='deduction_pre' / 'deduction_post' with is_fringe=1: 
    #     - This implies it's a benefit the company pays FOR you (e.g. Med Aid).
    #     - It adds to Taxable Income.
    #     - Does it add to Gross Cash? No, company pays it to provider.
    #     - Does it reduce Net Pay? No, if company pays it.
    #     Wait, if I select "Medical Aid" and "Fringe", it means Company pays.
    #     So I don't see -2000 on my bank account.
    #     But I see +2000 on my Taxable Income.
    #     AND I get the Tax Credit (if it's medical aid).
    
    # Let's assume:
    # Earnings: Always Cash.
    # Deductions (Post) + Fringe=True: Company Contribution. (Adds to Taxable, not Cash, not Deducted from Cash).
    # Deductions (Post) + Fringe=False: Employee Deduction. (Deducted from Cash).
    
    # Deductions (Post) + Fringe=False: Employee Deduction. (Deducted from Cash).
    
    # Basic salary is the core cash salary
    basic_salary = getattr(salary_orm, 'basic_salary', 0.0) or 0.0
    
    # Calculate Gross Income: Basic Salary + All Earnings
    earnings_total = 0.0
    deductions_pre = 0.0
    deductions_post = 0.0
    total_fringe_benefits = 0.0

    breakdown_deductions = {
        "paye": 0.0,
        "uif": 0.0,
        "pre_tax": 0.0,
        "post_tax": 0.0,
        "fringe_benefits_deducted": 0.0,
        "total": 0.0
    }

    for item in salary_orm.items:
        if item.item_type == 'earning':
            earnings_total += (item.amount or 0.0)
        elif item.item_type == 'deduction_pre':
            # Pension / RA - reduces taxable income
            amount = item.amount or 0.0
            deductions_pre += amount
            breakdown_deductions["pre_tax"] += amount
        elif item.item_type == 'deduction_post':
            amount = item.amount or 0.0
            if getattr(item, 'is_fringe', 0):
                # Company Contribution (Fringe Benefit)
                total_fringe_benefits += amount
                breakdown_deductions["fringe_benefits_deducted"] += amount
            else:
                # Employee Deduction
                deductions_post += amount
                breakdown_deductions["post_tax"] += amount

    # Gross Income is Basic Salary + Additional Earnings
    gross_income = basic_salary + earnings_total
    
    # Taxable Income = Gross Income - Pre-tax Deductions
    # (Fringe benefits are non-cash benefits ALREADY part of the taxable income)
    taxable_income = gross_income - deductions_pre
    
    # Gross Cash for Net Pay calculation starts at Gross Income MINUS non-cash benefits
    gross_cash = gross_income - total_fringe_benefits
    
    # 3. Calculate Tax (PAYE)
    # PAYE is calculated on (Gross Income + Fringe - Pre-tax Deductions)
    paye = calculate_paye(taxable_income * 12, tax_age) / 12
    
    # 4. Medical Aid Credits
    # Deduct from PAYE
    # Medical Tax Credits apply if you are paying, OR if company affects it. It's per member.
    credits = 0.0
    members = salary_orm.medical_aid_members
    if members > 0:
        # 2025 Rates
        # Main: R364, First Dep: R364, Additional: R246
        # If members = 1: 364
        # If members = 2: 364+364=728
        # If members > 2: 728 + (members-2)*246
        
        if members == 1:
            credits = 364.0
        elif members == 2:
            credits = 728.0
        else:
            credits = 728.0 + (members - 2) * 246.0
            
    final_paye = max(0.0, paye - credits)
    breakdown_deductions["paye"] = final_paye

    # 5. UIF
    # 1% of Remuneration (total gross income), capped
    uif_remuneration = gross_income
    uif_cap = 17712 # Monthly cap (Income)
    uif_deduction = min(uif_remuneration, uif_cap) * 0.01
    breakdown_deductions["uif"] = uif_deduction

    # 6. Net Pay
    # Gross Cash - PAYE - UIF - Post Tax Deductions (User paid)
    # Note: We do NOT deduct Pre-Tax (Pension) again if it was "salary sacrifice" structure?
    # Usually: Gross Cash is AFTER pre-tax deduction if it's Structuring?
    # Or Gross Cash is BEFORE?
    # Standard: Gross Salary (R50k) -> Subtract Pension (R3k) -> Taxable (47k).
    # Payslip: Gross 50k. Deductions: Tax, UIF, Pension, MedAid.
    # Net = 50k - Tax - UIF - Pension - MedAid.
    # So yes, we subtract Pre-Tax deductions validly from the Cash.
    
    # Wait, allowed_deduction vs actual deduction.
    # We subtract the ACTUAL deduction amount from cash, even if tax benefit was capped.
    
    total_deductions = final_paye + uif_deduction + deductions_pre + deductions_post
    net_pay = gross_cash - total_deductions
    breakdown_deductions["total"] = total_deductions

    # Fringe Benefits total for display
    fringe_total = gross_income - gross_cash

    # Save net salary to database if requested
    if save_to_db and hasattr(salary_orm, 'net_salary'):
        salary_orm.net_salary = net_pay

    return {
        "gross_income": gross_income,
        "gross_cash": gross_cash,
        "fringe_benefits": fringe_total,
        "taxable_income": taxable_income,
        "deductions": breakdown_deductions,
        "net_pay": net_pay
    }
