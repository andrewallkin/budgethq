import streamlit as st
import pandas as pd
import plotly.express as px
import json
from pathlib import Path

st.set_page_config(page_title="💰 Budget Dashboard", layout="wide")

# Create data directories
DATA_DIR = Path("data")
USERS_DIR = DATA_DIR / "users"
BUDGET_DIR = DATA_DIR / "budgets"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
USERS_DIR.mkdir(exist_ok=True)
BUDGET_DIR.mkdir(exist_ok=True)

DATA_FILE = DATA_DIR / "budget_data.json"  # Legacy file location


def get_user_data_file(username):
    """Get user-specific data file path"""
    return BUDGET_DIR / f"budget_data_{username}.json"


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

def calculate_monthly_tax(monthly_salary):
    """Calculate monthly tax from gross monthly salary."""
    annual_salary = monthly_salary * 12
    annual_tax = calculate_annual_tax(annual_salary)
    return annual_tax / 12

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


# ------------------------
# Helper Functions
# ------------------------
def save_data(data, username=None):
    """Save data to user-specific file"""
    if username:
        data_file = get_user_data_file(username)
    else:
        data_file = DATA_FILE
    
    with open(data_file, "w") as f:
        json.dump(data, f, indent=2)

def load_data(username=None):
    """Load data from user-specific file"""
    if username:
        data_file = get_user_data_file(username)
    else:
        data_file = DATA_FILE
    
    if data_file.exists():
        try:
            with open(data_file, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}


# ------------------------
# Initialize Session State
# ------------------------
if "needs" not in st.session_state:
    st.session_state.needs = []
if "wants" not in st.session_state:
    st.session_state.wants = []
if "savings" not in st.session_state:
    st.session_state.savings = []
if "load_data" not in st.session_state:
    st.session_state.load_data = False


# ------------------------
# Load User Data (if available)
# ------------------------
# Default username when auth is disabled
username = "default_user"
# username = st.session_state.username  # Uncomment when re-enabling auth
if not st.session_state.load_data:
    saved = load_data(username)
    if saved:
        st.session_state.salary = saved.get("salary", 0)
        st.session_state.age = saved.get("age", 30)
        st.session_state.needs = saved.get("needs", [])
        st.session_state.wants = saved.get("wants", [])
        st.session_state.savings = saved.get("savings", [])
        st.session_state.load_data = True


# ------------------------
# Header
# ------------------------
st.title("💰 Dynamic 50/30/20 Budget Dashboard")
st.caption("Your data is saved securely and automatically.")

st.divider()

# ------------------------
# Budget Dashboard Page
# ------------------------
st.header("💰 Dynamic 50/30/20 Budget Dashboard")

# ------------------------
# Income Section
# ------------------------
st.sidebar.header("💼 Income Details")
salary = st.sidebar.number_input("Monthly Gross Salary (R)", min_value=0.0, step=1000.0, value=st.session_state.get("salary", 0.0))

st.sidebar.subheader("Personal Information")
age = st.sidebar.number_input("Your Age", min_value=18, max_value=100, step=1, value=st.session_state.get("age", 30))

# Determine age group based on age for tax rebates
if age < 65:
    age_group = "under_65"
    age_group_display = "Under 65"
elif age < 75:
    age_group = "65_to_74"
    age_group_display = "65-74 years"
else:
    age_group = "75_and_over"
    age_group_display = "75+ years"

st.sidebar.caption(f"📋 Tax category: {age_group_display}")

# UIF is always included
include_uif = True

# Calculate tax and UIF automatically
if salary > 0:
    monthly_tax = calculate_monthly_tax_with_age(salary, age_group)
    monthly_uif = calculate_uif(salary) if include_uif else 0
    effective_tax_rate = (monthly_tax / salary) * 100 if salary > 0 else 0
    
    st.sidebar.divider()
    st.sidebar.subheader("📊 Automatic Calculations (SARS 2025/2026)")
    st.sidebar.metric("Monthly Tax (PAYE)", f"R {monthly_tax:,.2f}")
    st.sidebar.metric("Monthly UIF", f"R {monthly_uif:,.2f}")
    st.sidebar.caption("💡 Tax calculated using official SARS rates")
else:
    monthly_tax = 0
    monthly_uif = 0

# ------------------------
# Dynamic Category Management
# ------------------------
st.header("🏠 Expense & Savings Categories")

tab1, tab2, tab3 = st.tabs(["💸 Needs (50%)", "🎉 Wants (30%)", "💰 Savings/Investments (20%)"])

def add_category(cat_list, label):
    # Create a unique key for the text input that changes after each addition
    input_key = f"add_{label}_{len(cat_list)}"
    
    new_cat = st.text_input(f"Add new {label} category", placeholder=f"Enter {label} category name...", key=input_key)
    
    if st.button(f"➕ Add {label}", key=f"btn_{label}_{len(cat_list)}"):
        if new_cat and new_cat.strip() and new_cat not in [cat["name"] for cat in cat_list]:
            cat_list.append({"name": new_cat.strip(), "amount": 0.0})
            # Force rerun to clear the input
            st.rerun()
        elif not new_cat or not new_cat.strip():
            st.error("Please enter a category name.")
        else:
            st.error(f"'{new_cat}' already exists in {label} categories.")

def render_categories(cat_list, label):
    remove_index = None
    for i, cat in enumerate(cat_list):
        col1, col2, col3 = st.columns([3, 2, 1])
        with col1:
            cat["name"] = st.text_input(f"{label} name {i}", value=cat["name"], key=f"{label}_name_{i}", label_visibility="collapsed")
        with col2:
            cat["amount"] = st.number_input(f"{label} amount {i}", min_value=0.0, step=100.0, value=cat["amount"], key=f"{label}_amt_{i}", label_visibility="collapsed")
        with col3:
            if st.button("🗑️", key=f"remove_{label}_{i}"):
                remove_index = i
    if remove_index is not None:
        del cat_list[remove_index]

with tab1:
    add_category(st.session_state.needs, "needs")
    render_categories(st.session_state.needs, "needs")

with tab2:
    add_category(st.session_state.wants, "wants")
    render_categories(st.session_state.wants, "wants")

with tab3:
    add_category(st.session_state.savings, "savings")
    render_categories(st.session_state.savings, "savings")

# ------------------------
# Calculations
# ------------------------
# Use the automatically calculated tax and UIF
if salary > 0:
    tax = monthly_tax
    uif = monthly_uif
else:
    tax = 0
    uif = 0
    
net_income = salary - tax - uif

total_needs = sum(c["amount"] for c in st.session_state.needs)
total_wants = sum(c["amount"] for c in st.session_state.wants)
total_savings = sum(c["amount"] for c in st.session_state.savings)

total_spent = total_needs + total_wants + total_savings
remaining = net_income - total_spent

# ------------------------
# Summary Display
# ------------------------
st.header("📊 Budget Summary")

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("Gross Salary", f"R {salary:,.2f}")
with col2:
    st.metric("Tax (PAYE)", f"R {tax:,.2f}")
with col3:
    st.metric("UIF", f"R {uif:,.2f}")
with col4:
    st.metric("Net Income", f"R {net_income:,.2f}", delta_color="normal")

st.divider()

col1, col2, col3 = st.columns(3)
with col1:
    st.metric("💸 Total Needs", f"R {total_needs:,.2f}")
with col2:
    st.metric("🎉 Total Wants", f"R {total_wants:,.2f}")
with col3:
    st.metric("💰 Total Savings", f"R {total_savings:,.2f}")

st.divider()

col1, col2 = st.columns(2)
with col1:
    st.metric("Total Allocated", f"R {total_spent:,.2f}")
with col2:
    color = "normal" if remaining >= 0 else "inverse"
    st.metric("Remaining/Surplus", f"R {remaining:,.2f}", delta_color=color)

# ------------------------
# Visualization
# ------------------------
if salary > 0:
    st.header("📈 Budget Breakdown (Net Income)")
    
    # Create pie chart data for net income only
    chart_data = []
    
    # Add main budget categories
    if total_needs > 0:
        chart_data.append({"Category": "Needs", "Amount": total_needs, "Type": "Needs"})
    if total_wants > 0:
        chart_data.append({"Category": "Wants", "Amount": total_wants, "Type": "Wants"})
    if total_savings > 0:
        chart_data.append({"Category": "Savings", "Amount": total_savings, "Type": "Savings"})
    if remaining > 0:
        chart_data.append({"Category": "Unallocated", "Amount": remaining, "Type": "Unallocated"})
    
    if chart_data:
        df = pd.DataFrame(chart_data)
        fig = px.pie(df, values="Amount", names="Category", title="Net Income Allocation",
                     color="Type",
                     color_discrete_map={
                         "Needs": "#FF0000",      # Pure Red - Essential expenses
                         "Wants": "#0000FF",      # Pure Blue - Discretionary spending  
                         "Savings": "#00FF00",    # Pure Green - Financial goals
                         "Unallocated": "#FFA500" # Orange - Available funds
                     })
        st.plotly_chart(fig, use_container_width=True)

# ------------------------
# Auto-Save Data
# ------------------------
# Auto-save data whenever it changes
data_to_save = {
    "salary": salary,
    "age": age,
    "needs": st.session_state.needs,
    "wants": st.session_state.wants,
    "savings": st.session_state.savings
}
save_data(data_to_save, username)

# Manual save button (for confirmation/peace of mind)
if st.sidebar.button("💾 Save Budget Data"):
    save_data(data_to_save, username)

st.sidebar.divider()
st.sidebar.caption("💡 **Tax Information:**")
st.sidebar.caption("Rates based on SARS 2025/2026 tax year")
st.sidebar.caption("[Official SARS Rates](https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/)")

