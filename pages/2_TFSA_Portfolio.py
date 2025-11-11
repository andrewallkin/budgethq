import streamlit as st
import pandas as pd
import plotly.express as px
from pathlib import Path

st.set_page_config(page_title="📊 TFSA Portfolio", layout="wide")

# Create data directories
DATA_DIR = Path("data")
TFSA_PORTFOLIO_FILE = DATA_DIR / "tfsa_portfolio.csv"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)


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
# Initialize Session State
# ------------------------
if "portfolio_etfs" not in st.session_state:
    st.session_state.portfolio_etfs = []
if "portfolio_loaded" not in st.session_state:
    st.session_state.portfolio_loaded = False


# ------------------------
# Header
# ------------------------
st.title("📊 TFSA Portfolio Rebalancing")
st.caption("Manage and rebalance your TFSA investment portfolio.")

st.divider()

# ------------------------
# TFSA Portfolio Page
# ------------------------
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

