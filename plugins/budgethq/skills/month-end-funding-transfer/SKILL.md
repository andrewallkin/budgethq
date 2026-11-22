---
name: month-end-funding-transfer
description: Calculate and prepare the month-end transfer from Normal Savings to Daily to fund next month's debit orders and scheduled payments. Use at month end or when explicitly asked to prepare this funding transfer.
---

# Month-End Funding Transfer

## Required references
Read:
- `references/core-rules.md`
- `references/accounts-and-identifiers.md`
- `references/error-handling.md`
- `references/month-end-funding.md`

Use transfer and verification skills.

## Workflow
1. Open the Monthly Money page for the month immediately after this month-end. Do not use a previous month's page or a prior month's total.
2. List every debit order and scheduled payment meant to clear on the 1st. Do not include manual recurring costs, or items that are not meant to clear on the 1st, unless that page's funding plan explicitly includes them.
3. Sum the individual amounts and compare the sum with the total stated on the page. If the list is missing, an amount is missing, or the sums differ, stop. Do not change the Notion total or fill gaps.
4. The transfer amount is that reconciled total. Do not reduce it because Daily already has a balance, and do not estimate it.
5. Source is Investec Normal Savings. Destination is Investec Daily. Resolve both with `list_investec_accounts`.
6. Show each amount, the calculated total, the stated total, and the exact transfer.
7. Align with the user on the movement details. Chat alignment is not Telegram approval.
8. Use uppercase reference `<MONTH> DEBIT ORDERS TRANSFER` for both references, with `<MONTH>` the upcoming month. Both must end in `TRANSFER`.
9. Execute with the banking-transfers skill: `create_investec_transfer` from Normal Savings to Daily queues Telegram approval. Do not bypass approval because this is scheduled or recurring.
10. Verify with the banking-verification skill.
11. Update tracking only when authorized and evidence supports completion.

## Stop conditions
Stop if the monthly page is missing, amounts are ambiguous, funds are insufficient, the list contains unclear items, or the movement is duplicated.

## Never
- assume a recurring item still exists or has the same amount;
- transfer a guessed amount;
- treat a scheduled task as approval;
- blindly retry.
