import streamlit as st
import pandas as pd
import plotly.express as px
import json
import hashlib
import time
from pathlib import Path

st.set_page_config(page_title="💰 Financial Dashboard", layout="wide")

# Create data directories
DATA_DIR = Path("data")
USERS_DIR = DATA_DIR / "users"
BUDGET_DIR = DATA_DIR / "budgets"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
USERS_DIR.mkdir(exist_ok=True)
BUDGET_DIR.mkdir(exist_ok=True)

DATA_FILE = DATA_DIR / "budget_data.json"  # Legacy file location
USERS_FILE = USERS_DIR / "users.json"
TFSA_PORTFOLIO_FILE = DATA_DIR / "tfsa_portfolio.csv"


# ------------------------
# Authentication Functions (COMMENTED OUT FOR NOW)
# ------------------------
# def hash_password(password):
#     """Hash a password using SHA-256"""
#     return hashlib.sha256(password.encode()).hexdigest()

# def load_users():
#     """Load users from file"""
#     if USERS_FILE.exists():
#         try:
#             with open(USERS_FILE, "r") as f:
#                 return json.load(f)
#         except json.JSONDecodeError:
#             return {}
#     return {}

# def save_users(users):
#     """Save users to file"""
#     with open(USERS_FILE, "w") as f:
#         json.dump(users, f, indent=2)

# def create_user(username, password):
#     """Create a new user"""
#     users = load_users()
#     
#     # Check if username already exists
#     if username in users:
#         return False, "Username already exists"
#     
#     # Check if password is already used by another user
#     password_hash = hash_password(password)
#     for existing_user, user_data in users.items():
#         if user_data["password_hash"] == password_hash:
#             return False, "Password is already in use by another user"
#     
#     users[username] = {
#         "password_hash": password_hash,
#         "created_at": time.time()
#     }
#     save_users(users)
#     return True, "User created successfully"

# def authenticate_user(username, password):
#     """Authenticate a user"""
#     users = load_users()
#     if username not in users:
#         return False, "Invalid username or password"
#     
#     if users[username]["password_hash"] != hash_password(password):
#         return False, "Invalid username or password"
#     
#     return True, "Login successful"

# def login_user(username):
#     """Set up user session"""
#     st.session_state.logged_in = True
#     st.session_state.username = username

# def logout_user():
#     """Clear user session"""
#     for key in ["logged_in", "username"]:
#         if key in st.session_state:
#             del st.session_state[key]

def get_user_data_file(username):
    """Get user-specific data file path"""
    return BUDGET_DIR / f"budget_data_{username}.json"

# ------------------------
# TFSA Portfolio Functions
# ------------------------
def save_portfolio_to_csv(portfolio_list):
    """Save portfolio data to CSV"""
    if portfolio_list:
        df = pd.DataFrame(portfolio_list)
        df.to_csv(TFSA_PORTFOLIO_FILE, index=False)

def load_portfolio_from_csv():
    """Load portfolio data from CSV"""
    if TFSA_PORTFOLIO_FILE.exists():
        try:
            df = pd.read_csv(TFSA_PORTFOLIO_FILE)
            return df.to_dict('records')
        except Exception:
            return []
    return []


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
if "portfolio_etfs" not in st.session_state:
    st.session_state.portfolio_etfs = []
if "portfolio_loaded" not in st.session_state:
    st.session_state.portfolio_loaded = False
# if "logged_in" not in st.session_state:
#     st.session_state.logged_in = False

# ------------------------
# Authentication Check (COMMENTED OUT FOR NOW)
# ------------------------
# # Show login form if not logged in
# if not st.session_state.logged_in:
#     st.title("🔐 Budget Dashboard Login")
#     
#     # Create tabs for login and register
#     tab1, tab2 = st.tabs(["Login", "Register"])
#     
#     with tab1:
#         st.subheader("Login to Your Budget Dashboard")
#         with st.form("login_form"):
#             username = st.text_input("Username", placeholder="Enter your username")
#             password = st.text_input("Password", type="password", placeholder="Enter your password")
#             login_submitted = st.form_submit_button("Login")
#             
#             if login_submitted:
#                 if username and password:
#                     success, message = authenticate_user(username, password)
#                     if success:
#                         login_user(username)
#                         st.success(message)
#                         st.rerun()
#                     else:
#                         st.error(message)
#                 else:
#                     st.error("Please enter both username and password")
#     
#     with tab2:
#         st.subheader("Create New Account")
#         with st.form("register_form"):
#             new_username = st.text_input("Username", placeholder="Choose a username", key="reg_username")
#             new_password = st.text_input("Password", type="password", placeholder="Choose a password", key="reg_password")
#             confirm_password = st.text_input("Confirm Password", type="password", placeholder="Confirm your password", key="reg_confirm")
#             register_submitted = st.form_submit_button("Register")
#             
#             if register_submitted:
#                 if new_username and new_password and confirm_password:
#                     if new_password == confirm_password:
#                         success, message = create_user(new_username, new_password)
#                         if success:
#                             # Automatically log in the new user
#                             login_user(new_username)
#                             st.success(f"{message} You are now logged in!")
#                             st.rerun()
#                         else:
#                             st.error(message)
#                     else:
#                         st.error("Passwords do not match")
#                 else:
#                     st.error("Please fill in all fields")
#     
#     st.stop()  # Stop execution here if not logged in

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
# col1, col2 = st.columns([4, 1])
# with col1:
st.title("💰 Financial Dashboard")
st.caption("Your data is saved securely and automatically.")
# with col2:
#     if st.button("🚪 Logout", help="Logout and return to login screen"):
#         logout_user()
#         st.rerun()

# ------------------------
# Page Navigation
# ------------------------
st.sidebar.header("📍 Navigation")
page = st.sidebar.radio("Select Page", ["Budget Dashboard", "TFSA Portfolio"], label_visibility="collapsed")

st.divider()

# ------------------------
# TFSA Portfolio Page
# ------------------------
if page == "TFSA Portfolio":
    st.header("📊 TFSA Portfolio Rebalancing")
    
    # Load portfolio data from CSV on first run
    if not st.session_state.portfolio_loaded:
        st.session_state.portfolio_etfs = load_portfolio_from_csv()
        st.session_state.portfolio_loaded = True
    
    # Manage ETFs Section
    with st.expander("⚙️ Manage ETFs", expanded=len(st.session_state.portfolio_etfs) == 0):
        st.subheader("Add New ETF")
        
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            new_etf_name = st.text_input("ETF Name", placeholder="e.g., Satrix S&P 500", key="new_etf_name")
        with col2:
            new_etf_region = st.text_input("Region", placeholder="e.g., US", key="new_etf_region")
        with col3:
            new_target_pct = st.number_input("Target %", min_value=0.0, max_value=100.0, step=0.5, value=0.0, format="%.2f", key="new_target_pct")
        with col4:
            new_current_value = st.number_input("Current Value (R)", min_value=0.0, step=1000.0, value=0.0, format="%.2f", key="new_current_value")
        
        if st.button("➕ Add ETF"):
            if new_etf_name and new_etf_region:
                # Check if ETF already exists
                if any(etf["ETF"] == new_etf_name for etf in st.session_state.portfolio_etfs):
                    st.error(f"ETF '{new_etf_name}' already exists!")
                else:
                    st.session_state.portfolio_etfs.append({
                        "ETF": new_etf_name,
                        "Region": new_etf_region,
                        "Target_Percentage": new_target_pct,
                        "Current_Value": new_current_value
                    })
                    save_portfolio_to_csv(st.session_state.portfolio_etfs)
                    st.success(f"✅ Added {new_etf_name}")
                    st.rerun()
            else:
                st.error("Please enter both ETF name and region")
        
        if len(st.session_state.portfolio_etfs) > 0:
            st.divider()
            st.subheader("Current ETFs")
            
            # Check target percentage total
            total_target = sum(etf["Target_Percentage"] for etf in st.session_state.portfolio_etfs)
            if abs(total_target - 100.0) > 0.1:
                st.warning(f"⚠️ Target percentages sum to {total_target:.2f}% (should be 100%)")
            else:
                st.success(f"✅ Target percentages sum to {total_target:.2f}%")
            
            # Display and edit existing ETFs
            # Column headers
            col1, col2, col3, col4, col5 = st.columns([3, 2, 1.5, 2, 0.8])
            with col1:
                st.markdown("**ETF Name**")
            with col2:
                st.markdown("**Region**")
            with col3:
                st.markdown("**Target %**")
            with col4:
                st.markdown("**Value (R)**")
            with col5:
                st.markdown("**Del**")
            
            remove_index = None
            for i, etf in enumerate(st.session_state.portfolio_etfs):
                col1, col2, col3, col4, col5 = st.columns([3, 2, 1.5, 2, 0.8])
                with col1:
                    etf["ETF"] = st.text_input(f"ETF {i}", value=etf["ETF"], key=f"etf_name_{i}", label_visibility="collapsed")
                with col2:
                    etf["Region"] = st.text_input(f"Region {i}", value=etf["Region"], key=f"etf_region_{i}", label_visibility="collapsed")
                with col3:
                    etf["Target_Percentage"] = st.number_input(f"Target % {i}", min_value=0.0, max_value=100.0, step=0.5, value=float(etf["Target_Percentage"]), format="%.2f", key=f"etf_target_{i}", label_visibility="collapsed")
                with col4:
                    etf["Current_Value"] = st.number_input(f"Value {i}", min_value=0.0, step=1000.0, value=float(etf["Current_Value"]), format="%.2f", key=f"etf_value_{i}", label_visibility="collapsed")
                with col5:
                    if st.button("🗑️", key=f"remove_etf_{i}"):
                        remove_index = i
            
            if remove_index is not None:
                removed_etf = st.session_state.portfolio_etfs.pop(remove_index)
                save_portfolio_to_csv(st.session_state.portfolio_etfs)
                st.success(f"✅ Removed {removed_etf['ETF']}")
                st.rerun()
            
            if st.button("💾 Save All Changes"):
                save_portfolio_to_csv(st.session_state.portfolio_etfs)
                st.success("✅ Portfolio saved successfully!")
                st.rerun()
    
    # Check if we have ETFs to display
    if len(st.session_state.portfolio_etfs) == 0:
        st.info("👆 Please add ETFs using the 'Manage ETFs' section above to get started.")
        st.stop()
    
    # Convert to DataFrame for analysis
    portfolio_df = pd.DataFrame(st.session_state.portfolio_etfs)
    
    # Settings
    st.sidebar.header("⚙️ Rebalancing Settings")
    threshold = st.sidebar.slider(
        "Rebalancing Threshold (%)",
        min_value=1.0,
        max_value=10.0,
        value=5.0,
        step=0.5,
        help="If an ETF's allocation is above/below target by this percentage, it will be flagged for rebalancing"
    )
    
    # Calculate portfolio metrics
    total_value = portfolio_df["Current_Value"].sum()
    portfolio_df["Current_Percentage"] = (portfolio_df["Current_Value"] / total_value * 100).round(2)
    portfolio_df["Difference"] = (portfolio_df["Current_Percentage"] - portfolio_df["Target_Percentage"]).round(2)
    portfolio_df["Target_Value"] = (portfolio_df["Target_Percentage"] / 100 * total_value).round(2)
    portfolio_df["Rebalance_Amount"] = (portfolio_df["Current_Value"] - portfolio_df["Target_Value"]).round(2)
    
    # Display summary metrics
    st.subheader("💼 Portfolio Overview")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Portfolio Value", f"R {total_value:,.2f}")
    with col2:
        num_etfs = len(portfolio_df)
        st.metric("Number of ETFs", num_etfs)
    with col3:
        needs_rebalancing = len(portfolio_df[abs(portfolio_df["Difference"]) > threshold])
        st.metric("ETFs Needing Rebalancing", needs_rebalancing)
    
    st.divider()
    
    # Current Allocation Table
    st.subheader("📋 Current Portfolio Allocation")
    
    # Create display dataframe
    display_df = portfolio_df[["ETF", "Region", "Current_Value", "Current_Percentage", "Target_Percentage", "Difference"]].copy()
    display_df["Current Value"] = display_df["Current_Value"].apply(lambda x: f"R {x:,.2f}")
    display_df["Current %"] = display_df["Current_Percentage"].apply(lambda x: f"{x:.2f}%")
    display_df["Target %"] = display_df["Target_Percentage"].apply(lambda x: f"{x:.2f}%")
    display_df["Difference"] = display_df["Difference"].apply(lambda x: f"{x:+.2f}%")
    
    # Color code the difference
    def highlight_difference(row):
        diff = float(row["Difference"])
        if abs(diff) > threshold:
            return ['background-color: #ffcccc'] * len(row) if diff > 0 else ['background-color: #ffffcc'] * len(row)
        return [''] * len(row)
    
    st.dataframe(
        display_df[["ETF", "Region", "Current Value", "Current %", "Target %", "Difference"]],
        hide_index=True,
        use_container_width=True
    )
    
    st.divider()
    
    # Rebalancing Recommendations
    st.subheader("🎯 Rebalancing Recommendations")
    
    over_allocated = portfolio_df[portfolio_df["Difference"] > threshold].copy()
    under_allocated = portfolio_df[portfolio_df["Difference"] < -threshold].copy()
    
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
        
        # Generate specific rebalancing actions
        rebalancing_actions = []
        action_num = 1
        
        # Match sells with buys
        for sell_item in sell_list:
            if sell_item["Remaining"] <= 0.01:  # Skip if already allocated
                continue
                
            for buy_item in buy_list:
                if buy_item["Remaining"] <= 0.01:  # Skip if already allocated
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
        
        # Display rebalancing actions
        if rebalancing_actions:
            # Create actionable rebalancing plan header
            st.markdown("### 💡 Actionable Rebalancing Plan")
            st.info("Follow these steps to rebalance your portfolio:")
            
            for action in rebalancing_actions:
                st.markdown(f"""
                **Step {action['action_num']}:** 🔄  
                - **Sell** R {action['amount']:,.2f} of **{action['sell_etf']}**  
                - **Buy** R {action['amount']:,.2f} of **{action['buy_etf']}**
                """)
        else:
            st.warning("⚠️ No specific rebalancing actions could be generated. The imbalances may be too small or the portfolio structure requires manual review.")
        
        st.divider()
        
        # Summary tables
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("### 📉 Over-allocated ETFs")
            if len(over_allocated) > 0:
                summary_over = []
                for _, row in over_allocated.iterrows():
                    summary_over.append({
                        "ETF": row["ETF"],
                        "Current %": f"{row['Current_Percentage']:.2f}%",
                        "Target %": f"{row['Target_Percentage']:.2f}%",
                        "Excess": f"R {row['Rebalance_Amount']:,.2f}"
                    })
                st.dataframe(pd.DataFrame(summary_over), hide_index=True, use_container_width=True)
            else:
                st.success("✅ No ETFs are over-allocated")
        
        with col2:
            st.markdown("### 📈 Under-allocated ETFs")
            if len(under_allocated) > 0:
                summary_under = []
                for _, row in under_allocated.iterrows():
                    summary_under.append({
                        "ETF": row["ETF"],
                        "Current %": f"{row['Current_Percentage']:.2f}%",
                        "Target %": f"{row['Target_Percentage']:.2f}%",
                        "Shortage": f"R {abs(row['Rebalance_Amount']):,.2f}"
                    })
                st.dataframe(pd.DataFrame(summary_under), hide_index=True, use_container_width=True)
            else:
                st.success("✅ No ETFs are under-allocated")
    else:
        st.success(f"✅ Portfolio is well balanced! All ETFs are within {threshold}% of target allocation.")
    
    st.divider()
    
    # Visualizations
    st.subheader("📊 Portfolio Visualizations")
    
    col1, col2 = st.columns(2)
    
    with col1:
        # Current vs Target Allocation Pie Charts
        fig_current = px.pie(
            portfolio_df,
            values="Current_Value",
            names="ETF",
            title="Current Allocation",
            hole=0.3
        )
        fig_current.update_traces(
            textposition='inside',
            textinfo='percent',
            hovertemplate='<b>%{label}</b><br>Value: R %{value:,.2f}<br>Percentage: %{percent}<extra></extra>'
        )
        st.plotly_chart(fig_current, use_container_width=True)
    
    with col2:
        # Target allocation
        fig_target = px.pie(
            portfolio_df,
            values="Target_Value",
            names="ETF",
            title="Target Allocation",
            hole=0.3
        )
        fig_target.update_traces(
            textposition='inside',
            textinfo='percent',
            hovertemplate='<b>%{label}</b><br>Value: R %{value:,.2f}<br>Percentage: %{percent}<extra></extra>'
        )
        st.plotly_chart(fig_target, use_container_width=True)
    
    # Bar chart comparing current vs target
    compare_df = portfolio_df[["ETF", "Current_Percentage", "Target_Percentage"]].copy()
    compare_df = compare_df.rename(columns={
        "Current_Percentage": "Current %",
        "Target_Percentage": "Target %"
    })
    fig_compare = px.bar(
        compare_df,
        x="ETF",
        y=["Current %", "Target %"],
        title="Current vs Target Allocation (%)",
        labels={"value": "Percentage (%)", "variable": "Type"},
        barmode="group"
    )
    st.plotly_chart(fig_compare, use_container_width=True)
    
    # Region allocation
    region_allocation = portfolio_df.groupby("Region")["Current_Value"].sum().reset_index()
    region_allocation = region_allocation.rename(columns={"Current_Value": "Value"})
    fig_region = px.pie(
        region_allocation,
        values="Value",
        names="Region",
        title="Allocation by Region",
        hole=0.3
    )
    fig_region.update_traces(
        textposition='inside',
        textinfo='percent',
        hovertemplate='<b>%{label}</b><br>Value: R %{value:,.2f}<br>Percentage: %{percent}<extra></extra>'
    )
    st.plotly_chart(fig_region, use_container_width=True)
    
    st.stop()  # Stop here if on TFSA Portfolio page

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
