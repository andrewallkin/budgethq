---
name: monthly-financial-setup
description: Set up a new monthly BudgetHQ financial period, reconcile allocations, fund accounts, and track recurring items. Use for monthly money setup and period initialization.
---

# Monthly Financial Period Setup

## Required references
Read:
- `../shared/references/core-rules.md`
- `../shared/references/accounts-and-identifiers.md`
- `../shared/references/error-handling.md`
- `../shared/references/workflow-registry.md`
- `../shared/references/month-end-funding.md`
- `../shared/references/monthly-setup-checklist.md`

Use transfer, payment, recurring-cost and verification skills as appropriate.

## Period setup sequence

### 1. Create the monthly tracking page
Around the 20th, create the new Monthly Money page using the established format.
- Do not carry forward stale amounts, status, or completion flags.
- Unknown values remain blank rather than guessed.
- Include the `Complete` column.
- Mark an item Yes only when evidence supports completion.
- Exclude work travel unless the user's plan explicitly includes it.

### 2. GoTyme salary allocation
Calculate salary allocation according to the established monthly plan, including GoalSaves contributions and the amount retained in the GoTyme account.
- Confirm the actual salary received and the extra amount the user wants to keep in GoTyme. Do not assume that extra amount is zero, and do not reuse last month's salary.
- GoTyme to Investec Daily = actual salary received − GoalSaves allocations due around the 21st − extra amount retained in GoTyme. What remains in GoTyme must still cover those GoalSaves.
- `create_investec_transfer` only moves money between Investec accounts from `list_investec_accounts`. If GoTyme is not one of those accounts, stop and ask how that leg should be done. Do not invent an account ID.

### 3. Daily account target
Target the Daily account's available balance at R31,000.
- Read current balance and relevant transactions/pending movements.
- Reconcile pending items.
- Avoid subtracting pending movements twice when already reflected in available balance.
- If below target, do not assume which account should fund the shortfall; resolve this with the user or the explicit plan.
- If above target, calculate the excess carefully.

### 4. Consolidated Daily-to-Normal Savings transfer
Prepare the consolidated transfer allocation, including card debt, scheduled payments/debit orders, recurring costs, and surplus as applicable.
- Calculate surplus exactly once and include it in the consolidated total.
- Reconcile components to the total.
- Use uppercase reference `<MONTH> MONTHLY COSTS TRANSFER` ending in `TRANSFER`.
- Present details and align with the user, then execute and verify using the banking-transfers skill. `create_investec_transfer` queues a separate Telegram approval. Chat alignment is not that approval.
- Record only evidence-supported completion.

### 5. Recurring costs
Process the recurring-cost plan using the recurring-cost skill.
- Track items on Monthly Money.
- Include the Complete column.
- Each movement is separately approved and verified.

### 6. Surplus transfer to Emergency Savings
- Use the surplus amount calculated in Step 4; do not recalculate or double-count it.
- Reconcile balances and pending movements.
- Present exact source, destination, amount, and uppercase `<MONTH> SURPLUS TRANSFER` reference.
- Execute and verify with the banking-transfers skill. That queues a separate Telegram approval.

### 7. Month-end funding for next month
Determine next month's debit orders and scheduled payments requiring funding from Normal Savings to Daily.
- Use the month-end funding skill.
- A scheduled task may remind or prepare, but cannot bypass alignment or Telegram approval.

### 8. Tracking and reconciliation
Update Monthly Money only within the user's authorized scope.
- Reconcile the consolidated transfer and surplus allocation.
- Mark completion only when supported by verification.
- Report exceptions, outstanding movements, and any tool failures.

## Safety
- Follow core rules for all movements.
- No automatic retry.
- Do not assume month-specific amounts, account states, or payment lists.
- User alignment and Telegram approval are distinct.
- Disclose ambiguity and failures.
