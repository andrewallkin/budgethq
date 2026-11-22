---
name: budgethq-banking
description: Routing guide for BudgetHQ banking workflows. Use to select the correct workflow skill.
---

# BudgetHQ Skill Routing

Use this index to route requests:
- Own-account transfer: `banking-transfers`
- Payment to an existing beneficiary: `banking-payments`
- Recurring costs: `recurring-costs`
- Monthly setup and allocation: `monthly-financial-setup`
- Month-end funding: `month-end-funding-transfer`
- Reconciliation/status lookup: `banking-verification`

For any movement, follow the selected skill, shared core rules, and separate Telegram approval requirements. Chat consent alone is not approval.
