import streamlit as st
from pathlib import Path

st.set_page_config(page_title="💰 Financial Dashboard - Home", layout="wide")

# Create data directories
DATA_DIR = Path("data")
USERS_DIR = DATA_DIR / "users"
BUDGET_DIR = DATA_DIR / "budgets"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
USERS_DIR.mkdir(exist_ok=True)
BUDGET_DIR.mkdir(exist_ok=True)

# ------------------------
# Landing Page
# ------------------------
st.title("💰 Financial Dashboard")
st.caption("Your comprehensive personal finance management tool")

st.divider()

st.header("Welcome! 👋")

st.markdown("""
This Financial Dashboard helps you manage both your budget and investment portfolio in one place.

### 📊 Available Tools

#### 💰 Budget Dashboard
The Budget Dashboard helps you track and manage your monthly expenses using the 50/30/20 budgeting rule:
- **50% Needs**: Essential expenses like rent, utilities, groceries
- **30% Wants**: Discretionary spending like entertainment, dining out
- **20% Savings**: Long-term savings and investments

**Features:**
- Automatic SARS tax calculations (2025/2026 rates)
- UIF contributions calculation
- Age-based tax rebates
- Dynamic category management
- Visual budget breakdown
- Automatic data saving

#### 📈 TFSA Portfolio
The TFSA Portfolio page helps you manage and rebalance your Tax-Free Savings Account investments:
- Track multiple ETFs across different regions
- Set target allocation percentages
- Get automated rebalancing recommendations
- Visualize your portfolio distribution
- Monitor regional diversification

**Features:**
- Portfolio rebalancing calculator
- Current vs target allocation comparison
- Actionable step-by-step rebalancing plan
- Interactive visualizations
- CSV-based data persistence

### 🚀 Getting Started

Use the sidebar navigation to access either the **Budget Dashboard** or **TFSA Portfolio** page.

Your data is automatically saved and will be loaded when you return.
""")

st.divider()

st.info("💡 **Tip:** Navigate between pages using the sidebar on the left. Each page is independent and maintains its own data.")

st.sidebar.success("👆 Select a page above to get started")

