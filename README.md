# 💰 Dynamic Budget Dashboard

A comprehensive budget planning application built with Streamlit that automatically calculates South African tax (PAYE) and UIF contributions based on official SARS rates.

## Features

### 🔐 User Authentication
- ✅ **Secure login system** with username/password authentication
- ✅ **User registration** with password confirmation and automatic login
- ✅ **Duplicate prevention** - checks for existing usernames and passwords
- ✅ **User-specific data storage** - each user has their own budget data
- ✅ **Manual logout** functionality for security

### Automatic Tax Calculations (SARS 2025/2026)
- ✅ **Accurate PAYE calculations** using official SARS progressive tax brackets
- ✅ **Age-based tax rebates** (Under 65, 65-74, 75+)
- ✅ **Automatic UIF calculation** (1% of salary, capped at R177.12/month)
- ✅ **Real-time effective tax rate** display

### Budget Management
- 📊 **50/30/20 Budget Rule** framework
- 💸 Dynamic expense categories (Needs, Wants, Savings)
- 📈 Visual breakdown with interactive charts
- 💾 User-specific data persistence (JSON)

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
- **Optional**: Can be toggled on/off

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
streamlit run main.py
```

## Usage

1. **Login or Register**
   - Create a new account with username/password (automatically logged in)
   - Login with existing credentials
   - Stay logged in until manual logout

2. **Enter Your Details**
   - Monthly gross salary (before deductions)
   - Your age (for accurate tax rebate calculation)
   - UIF is automatically included

3. **View Automatic Calculations**
   - Monthly tax (PAYE) with effective rate
   - UIF contribution (capped at R177.12)
   - Net income after deductions

4. **Manage Budget Categories**
   - Add/remove expense items
   - Set amounts for each category
   - View visual breakdown

5. **Data Management**
   - Data auto-saves to user-specific files in organized directories
   - Manual save option available
   - Logout anytime to secure your session

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
├── main.py                 # Main application
├── requirements.txt        # Python dependencies
├── README.md              # Documentation
├── .gitignore             # Git ignore rules
└── data/                  # Application data (auto-created)
    ├── users/             # User authentication data
    │   └── users.json     # User accounts and hashed passwords
    └── budgets/           # User budget data
        ├── budget_data_username1.json
        ├── budget_data_username2.json
        └── ...
```

## Data Source

Tax calculations based on official SARS rates:  
https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/

## Requirements

- Python 3.7+
- streamlit
- pandas
- plotly

## License

MIT License