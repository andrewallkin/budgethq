# 💰 Financial Dashboard

A comprehensive personal finance management application built with Streamlit, featuring budget planning with automatic South African tax (PAYE) calculations and TFSA portfolio rebalancing tools.

## Features

### 💰 Budget Dashboard
The Budget Dashboard helps you track and manage your monthly expenses using the **50/30/20 budgeting rule**:
- **50% Needs**: Essential expenses like rent, utilities, groceries
- **30% Wants**: Discretionary spending like entertainment, dining out
- **20% Savings**: Long-term savings and investments

**Key Features:**
- ✅ **Accurate PAYE calculations** using official SARS 2025/2026 progressive tax brackets
- ✅ **Age-based tax rebates** (Under 65, 65-74, 75+)
- ✅ **Automatic UIF calculation** (1% of salary, capped at R177.12/month)
- ✅ **Real-time effective tax rate** display
- 📊 Dynamic expense categories with custom items
- 📈 Interactive visual breakdown with pie charts
- 💾 Automatic data persistence (JSON)

### 📈 TFSA Portfolio Manager
The TFSA Portfolio page helps you manage and rebalance your Tax-Free Savings Account investments:

**Key Features:**
- ✅ **Track multiple ETFs** across different regions
- ✅ **Set target allocation percentages** for each ETF
- ✅ **Automated rebalancing recommendations** with actionable steps
- ✅ **Visualize portfolio distribution** with interactive charts
- ✅ **Monitor regional diversification**
- ✅ **Configurable rebalancing threshold**
- 💾 CSV-based data persistence

## Tax Calculation Details

### SARS Tax Brackets (2025/2026)
| Taxable Income (Annual) | Tax Rate |
|------------------------|----------|
| R0 - R237,100 | 18% |
| R237,101 - R370,500 | 26% |
| R370,501 - R512,800 | 31% |
| R512,801 - R673,000 | 36% |
| R673,001 - R857,900 | 39% |
| R857,901 - R1,817,000 | 41% |
| R1,817,001+ | 45% |

### Tax Rebates
- **Under 65**: R17,235
- **65-74 years**: R26,679 (Primary + Secondary)
- **75+ years**: R29,824 (Primary + Secondary + Tertiary)

### UIF Contribution
- **Rate**: 1% of monthly salary
- **Maximum**: R177.12 per month
- **Automatically calculated** for all salary inputs

## Installation

This project uses [uv](https://github.com/astral-sh/uv) for dependency management.

### Option 1: Using uv (Recommended)

```bash
# Install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Run the application
uv run streamlit run Home.py
```

### Option 2: Using pip

```bash
# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install streamlit pandas plotly

# Run the application
streamlit run Home.py
```

## Usage

### Budget Dashboard

1. **Navigate to Budget Dashboard** from the sidebar
2. **Enter Your Income Details**
   - Monthly gross salary (before deductions)
   - Your age (for accurate tax rebate calculation)
   - UIF is automatically included (1%, capped at R177.12)

3. **View Automatic Calculations**
   - Monthly tax (PAYE) with effective rate based on SARS 2025/2026 rates
   - UIF contribution
   - Net income after deductions

4. **Manage Budget Categories**
   - Add/remove expense items in Needs, Wants, and Savings tabs
   - Set amounts for each category
   - View visual breakdown of your spending

5. **Data Management**
   - Data auto-saves to `data/budgets/budget_data_default_user.json`
   - Manual save option available in sidebar

### TFSA Portfolio Manager

1. **Navigate to TFSA Portfolio** from the sidebar
2. **Add Your ETFs**
   - Enter ETF name (e.g., "Satrix S&P 500")
   - Specify region (e.g., "US", "SA", "Europe")
   - Set target allocation percentage
   - Enter current value in Rands

3. **Configure Rebalancing**
   - Set rebalancing threshold in sidebar (default: 5%)
   - ETFs that deviate from target by more than the threshold will be flagged

4. **View Recommendations**
   - See which ETFs are over/under-allocated
   - Get step-by-step rebalancing instructions
   - View interactive charts comparing current vs target allocation

5. **Data Management**
   - Portfolio data auto-saves to `data/tfsa_portfolio.csv`
   - Edit ETF details directly in the interface

## Example Calculation

**Salary**: R30,000/month (R360,000/year)  
**Age**: 35 (Under 65)

- **Annual Tax**: R57,397
- **Monthly Tax**: R4,783.08 (15.9%)
- **UIF**: R177.12 (capped)
- **Net Income**: R25,039.80

## File Structure

```
budget-dashboard/
├── Home.py                           # Landing page / main entry point
├── pages/                            # Streamlit pages
│   ├── 1_Budget_Dashboard.py         # Budget management with tax calculations
│   └── 2_TFSA_Portfolio.py           # TFSA portfolio rebalancing
├── utils/                            # Utility modules
│   └── auth.py                       # Authentication utilities (future use)
├── data/                             # Application data (auto-created)
│   ├── budgets/                      # Budget data files
│   │   ├── budget_data_default_user.json
│   │   └── budget_data_*.json        # User-specific budget data
│   ├── tfsa_portfolio.csv            # TFSA portfolio data
│   └── users/                        # User data (future use)
│       └── users.json
├── pyproject.toml                    # Project configuration & dependencies
├── uv.lock                           # Dependency lock file
└── README.md                         # Documentation
```

## Data Source

Tax calculations based on official SARS rates:  
https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/

## Requirements

### Core Dependencies
- Python 3.8+
- streamlit - Web framework for the application
- pandas - Data manipulation and analysis
- plotly - Interactive visualizations

### Optional Dependencies
- **OCR features** (future): pytesseract, pillow, pdf2image, pdfplumber
- **Development**: pytest, black, flake8, mypy

## Screenshots

### Budget Dashboard
- View real-time tax calculations based on SARS rates
- Manage expenses using the 50/30/20 rule
- Visual breakdown of your budget

### TFSA Portfolio Manager
- Track multiple ETFs across regions
- Get actionable rebalancing recommendations
- Compare current vs target allocation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License