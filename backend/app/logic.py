import pandas as pd

# ------------------------
# SARS Tax Calculation Functions
# ------------------------
def calculate_annual_tax(annual_income):
    """
    Calculate annual tax based on SARS tax rates for 2025/2026 tax year.
    Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
    """
    # Tax brackets for 2025/2026 (using 2024 rates as 2025 had no changes)
    if annual_income <= 237100:
        tax = annual_income * 0.18
    elif annual_income <= 370500:
        tax = 42678 + 0.26 * (annual_income - 237100)
    elif annual_income <= 512800:
        tax = 77362 + 0.31 * (annual_income - 370500)
    elif annual_income <= 673000:
        tax = 121475 + 0.36 * (annual_income - 512800)
    elif annual_income <= 857900:
        tax = 179147 + 0.39 * (annual_income - 673000)
    elif annual_income <= 1817000:
        tax = 251258 + 0.41 * (annual_income - 857900)
    else:
        tax = 644489 + 0.45 * (annual_income - 1817000)
    
    # Apply tax rebates (primary rebate for under 65)
    primary_rebate = 17235
    tax = max(0, tax - primary_rebate)
    
    return tax

def calculate_monthly_tax_with_age(monthly_salary, age_group="under_65"):
    """
    Calculate monthly tax with age-based rebates.
    Age groups: 'under_65', '65_to_74', '75_and_over'
    """
    annual_salary = monthly_salary * 12
    
    # Calculate tax before rebates
    if annual_salary <= 237100:
        tax = annual_salary * 0.18
    elif annual_salary <= 370500:
        tax = 42678 + 0.26 * (annual_salary - 237100)
    elif annual_salary <= 512800:
        tax = 77362 + 0.31 * (annual_salary - 370500)
    elif annual_salary <= 673000:
        tax = 121475 + 0.36 * (annual_salary - 512800)
    elif annual_salary <= 857900:
        tax = 179147 + 0.39 * (annual_salary - 673000)
    elif annual_salary <= 1817000:
        tax = 251258 + 0.41 * (annual_salary - 857900)
    else:
        tax = 644489 + 0.45 * (annual_salary - 1817000)
    
    # Apply age-based rebates (2025/2026 tax year)
    primary_rebate = 17235
    secondary_rebate = 9444  # Additional rebate for 65 and older
    tertiary_rebate = 3145   # Additional rebate for 75 and older
    
    if age_group == "under_65":
        total_rebate = primary_rebate
    elif age_group == "65_to_74":
        total_rebate = primary_rebate + secondary_rebate
    else:  # 75_and_over
        total_rebate = primary_rebate + secondary_rebate + tertiary_rebate
    
    annual_tax = max(0, tax - total_rebate)
    return annual_tax / 12

def calculate_uif(monthly_salary):
    """
    Calculate UIF contribution (1% of salary, capped at R177.12 per month).
    Maximum UIF contribution: R177.12
    """
    uif_rate = 0.01
    max_uif_contribution = 177.12
    uif_contribution = monthly_salary * uif_rate
    return min(uif_contribution, max_uif_contribution)

def calculate_annual_tax_with_age(annual_income, age_group="under_65"):
    """
    Calculate annual tax with age-based rebates.
    Age groups: 'under_65', '65_to_74', '75_and_over'
    """
    # Calculate tax before rebates
    if annual_income <= 237100:
        tax = annual_income * 0.18
    elif annual_income <= 370500:
        tax = 42678 + 0.26 * (annual_income - 237100)
    elif annual_income <= 512800:
        tax = 77362 + 0.31 * (annual_income - 370500)
    elif annual_income <= 673000:
        tax = 121475 + 0.36 * (annual_income - 512800)
    elif annual_income <= 857900:
        tax = 179147 + 0.39 * (annual_income - 673000)
    elif annual_income <= 1817000:
        tax = 251258 + 0.41 * (annual_income - 857900)
    else:
        tax = 644489 + 0.45 * (annual_income - 1817000)
    
    # Apply age-based rebates (2025/2026 tax year)
    primary_rebate = 17235
    secondary_rebate = 9444  # Additional rebate for 65 and older
    tertiary_rebate = 3145   # Additional rebate for 75 and older
    
    if age_group == "under_65":
        total_rebate = primary_rebate
    elif age_group == "65_to_74":
        total_rebate = primary_rebate + secondary_rebate
    else:  # 75_and_over
        total_rebate = primary_rebate + secondary_rebate + tertiary_rebate
    
    annual_tax = max(0, tax - total_rebate)
    return annual_tax

def calculate_ra_tax_scenarios(monthly_salary, age, monthly_ra_contribution):
    """
    Calculate RA tax scenarios for current, 10%, and 15% contribution rates.
    
    Returns a dictionary with:
    - base_tax: Annual tax without RA contributions
    - net_income_monthly: Net income after tax and UIF (same for all scenarios)
    - scenarios: List of three scenarios (current, 10%, 15%)
    """
    annual_salary = monthly_salary * 12
    
    # Determine age group
    if age < 65:
        age_group = "under_65"
    elif age < 75:
        age_group = "65_to_74"
    else:
        age_group = "75_and_over"
    
    # Calculate base tax (no RA contributions)
    base_tax_annual = calculate_annual_tax_with_age(annual_salary, age_group)
    
    # Calculate UIF (same for all scenarios)
    monthly_uif = calculate_uif(monthly_salary)
    annual_uif = monthly_uif * 12
    
    # Net income is the same for all scenarios (salary - tax - UIF)
    # But tax changes, so we calculate net income after base tax
    net_income_monthly = monthly_salary - (base_tax_annual / 12) - monthly_uif
    
    # RA contribution limits: 27.5% of earnings or R350,000 per year (whichever is lower)
    max_ra_deduction = min(annual_salary * 0.275, 350000)
    
    # Calculate scenarios
    scenarios = []
    
    # Scenario 1: Current contribution
    annual_ra_current = monthly_ra_contribution * 12
    deductible_ra_current = min(annual_ra_current, max_ra_deduction)
    adjusted_taxable_income_current = annual_salary - deductible_ra_current
    tax_current_annual = calculate_annual_tax_with_age(adjusted_taxable_income_current, age_group)
    tax_saved_current = base_tax_annual - tax_current_annual
    contribution_pct_current = (annual_ra_current / annual_salary * 100) if annual_salary > 0 else 0
    # Adjusted income monthly = salary - tax (on adjusted income) - UIF
    adjusted_income_monthly_current = monthly_salary - (tax_current_annual / 12) - monthly_uif
    
    scenarios.append({
        "label": f"{contribution_pct_current:.1f}% Contribution (current)",
        "contribution_percentage": round(contribution_pct_current, 1),
        "ra_contribution_annual": round(annual_ra_current, 2),
        "ra_contribution_monthly": round(monthly_ra_contribution, 2),
        "adjusted_income_monthly": round(adjusted_income_monthly_current, 2),
        "income_tax_annual": round(tax_current_annual, 2),
        "tax_saved_annual": round(tax_saved_current, 2),
        "tax_saved_monthly": round(tax_saved_current / 12, 2)
    })
    
    # Scenario 2: 10% contribution
    annual_ra_10pct = annual_salary * 0.10
    deductible_ra_10pct = min(annual_ra_10pct, max_ra_deduction)
    adjusted_taxable_income_10pct = annual_salary - deductible_ra_10pct
    tax_10pct_annual = calculate_annual_tax_with_age(adjusted_taxable_income_10pct, age_group)
    tax_saved_10pct = base_tax_annual - tax_10pct_annual
    # Adjusted income monthly = salary - tax (on adjusted income) - UIF
    adjusted_income_monthly_10pct = monthly_salary - (tax_10pct_annual / 12) - monthly_uif
    
    scenarios.append({
        "label": "10% Contribution",
        "contribution_percentage": 10.0,
        "ra_contribution_annual": round(annual_ra_10pct, 2),
        "ra_contribution_monthly": round(annual_ra_10pct / 12, 2),
        "adjusted_income_monthly": round(adjusted_income_monthly_10pct, 2),
        "income_tax_annual": round(tax_10pct_annual, 2),
        "tax_saved_annual": round(tax_saved_10pct, 2),
        "tax_saved_monthly": round(tax_saved_10pct / 12, 2)
    })
    
    # Scenario 3: 15% contribution
    annual_ra_15pct = annual_salary * 0.15
    deductible_ra_15pct = min(annual_ra_15pct, max_ra_deduction)
    adjusted_taxable_income_15pct = annual_salary - deductible_ra_15pct
    tax_15pct_annual = calculate_annual_tax_with_age(adjusted_taxable_income_15pct, age_group)
    tax_saved_15pct = base_tax_annual - tax_15pct_annual
    # Adjusted income monthly = salary - tax (on adjusted income) - UIF
    adjusted_income_monthly_15pct = monthly_salary - (tax_15pct_annual / 12) - monthly_uif
    
    scenarios.append({
        "label": "15% Contribution",
        "contribution_percentage": 15.0,
        "ra_contribution_annual": round(annual_ra_15pct, 2),
        "ra_contribution_monthly": round(annual_ra_15pct / 12, 2),
        "adjusted_income_monthly": round(adjusted_income_monthly_15pct, 2),
        "income_tax_annual": round(tax_15pct_annual, 2),
        "tax_saved_annual": round(tax_saved_15pct, 2),
        "tax_saved_monthly": round(tax_saved_15pct / 12, 2)
    })
    
    return {
        "monthly_salary": round(monthly_salary, 2),
        "annual_salary": round(annual_salary, 2),
        "base_tax_annual": round(base_tax_annual, 2),
        "net_income_monthly": round(net_income_monthly, 2),
        "scenarios": scenarios
    }

def calculate_rebalancing(portfolio_etfs, threshold=5.0):
    if not portfolio_etfs:
        return [], [], []

    portfolio_df = pd.DataFrame(portfolio_etfs)
    
    # Calculate portfolio metrics
    total_value = portfolio_df["Current_Value"].sum()
    if total_value == 0:
        return [], [], []

    portfolio_df["Current_Percentage"] = (portfolio_df["Current_Value"] / total_value * 100).round(2)
    portfolio_df["Difference"] = (portfolio_df["Current_Percentage"] - portfolio_df["Target_Percentage"]).round(2)
    portfolio_df["Target_Value"] = (portfolio_df["Target_Percentage"] / 100 * total_value).round(2)
    portfolio_df["Rebalance_Amount"] = (portfolio_df["Current_Value"] - portfolio_df["Target_Value"]).round(2)

    over_allocated = portfolio_df[portfolio_df["Difference"] > threshold].copy()
    under_allocated = portfolio_df[portfolio_df["Difference"] < -threshold].copy()

    rebalancing_actions = []
    
    if len(over_allocated) > 0 or len(under_allocated) > 0:
        # Sort by magnitude of imbalance
        over_allocated = over_allocated.sort_values("Rebalance_Amount", ascending=False)
        under_allocated = under_allocated.sort_values("Rebalance_Amount", ascending=True)
        
        # Create lists for remaining amounts to rebalance
        sell_list = []
        for _, row in over_allocated.iterrows():
            sell_list.append({
                "ETF": row["ETF"],
                "Amount": row["Rebalance_Amount"],
                "Remaining": row["Rebalance_Amount"]
            })
        
        buy_list = []
        for _, row in under_allocated.iterrows():
            buy_list.append({
                "ETF": row["ETF"],
                "Amount": abs(row["Rebalance_Amount"]),
                "Remaining": abs(row["Rebalance_Amount"])
            })
        
        action_num = 1
        
        # Match sells with buys
        for sell_item in sell_list:
            if sell_item["Remaining"] <= 0.01:
                continue
                
            for buy_item in buy_list:
                if buy_item["Remaining"] <= 0.01:
                    continue
                
                # Determine how much to transfer
                transfer_amount = min(sell_item["Remaining"], buy_item["Remaining"])
                
                rebalancing_actions.append({
                    "action_num": action_num,
                    "sell_etf": sell_item["ETF"],
                    "buy_etf": buy_item["ETF"],
                    "amount": transfer_amount
                })
                
                sell_item["Remaining"] -= transfer_amount
                buy_item["Remaining"] -= transfer_amount
                action_num += 1
                
                if sell_item["Remaining"] <= 0.01:
                    break
                    
    return rebalancing_actions, over_allocated.to_dict('records'), under_allocated.to_dict('records')
