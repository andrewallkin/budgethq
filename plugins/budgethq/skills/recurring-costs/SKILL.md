---
name: recurring-costs
description: Pay a manual recurring cost the user just requested, for cleaning, Watchprop levies, City of Cape Town rates, or an extra vehicle-finance repayment. Funds Daily from Normal Savings, then makes a separate second movement. Do not use for automatic or estimated recurring payments.
---

# Recurring Costs

## Required references
Read:
- `references/core-rules.md`
- `references/accounts-and-identifiers.md`
- `references/error-handling.md`

Use `banking-transfers` for the funding leg, `banking-payments` or `banking-transfers` for the second leg, and `banking-verification` after each movement.

Run this only when the user explicitly asks to pay one of these costs and gives the exact amount. Never infer the amount from history, a budget, or the Monthly Money page. Do not start it automatically. Do not combine separate requests unless the user says to. A row on the Monthly Money page is not a request and is not approval.

| Cost | Second movement | Destination |
| --- | --- | --- |
| Cleaning | Payment | Gallia |
| Watchprop | Payment | Gallia |
| Rates | Payment | Gallia |
| Extra vehicle finance | Own-account transfer | Investec Vehicle Finance |

Funding leg: Investec Normal Savings to Investec Daily, for the same amount. The second movement leaves Daily.

## References

Funding-transfer references are FULL CAPITALS and both end with `TRANSFER`. Payment references are FULL CAPITALS and do not get a `TRANSFER` suffix unless that is the established payment reference.

Use the established pattern. These are reference examples, not amounts:

- Cleaning payment: `LUNGI CLEANING <MONTH>`. Funding examples: `LUNGI CLEANING TRANSFER`, `CLEANING TRANSFER`.
- Watchprop payment: `WATCHPROP LEVIES <MONTH>`. Funding example: `WATCHPROP TRANSFER`.
- Rates payment: `COCT RATES <MONTH>`. Funding examples: `COCT RATES TRANSFER`, `RATES TRANSFER`, `TRANSFERS FOR RATES`.
- Vehicle finance second leg is a transfer, reference pattern `VF <MONTH> REPAYMENT EXTRA`, funding example `VF <MONTH> REPAYMENT EXTRA TRANSFER`. Do not send it to a third-party beneficiary.

`<MONTH>` is the uppercase month name. Confirm the reference against recent matching movements when you look them up. Do not assume a monthly maximum.

## Workflow

1. Confirm cost type and amount. Resolve Normal Savings, Daily, and either Gallia's `beneficiary_id` or the Vehicle Finance `accountId` from Investec tools. Stop if anything material is ambiguous.
2. Run the funding transfer with `banking-transfers`. Do not start the second movement while that leg is pending, ambiguous, failed, rejected, expired, or awaiting authorisation.
3. Only after the funding leg is `sent`, run the second movement as its own transfer or payment. It needs its own Telegram approval. Use the exact requested amount.
4. Verify the second movement on its own with `banking-verification`.
5. Update the Monthly Money Complete column only when the user has authorised that write and verification supports completion.

## Report

Report each leg separately: movement ID, amount, accounts or beneficiary, references, and status. If the funding transfer succeeded and the second movement did not, say that. Do not reverse or retry the funding transfer automatically.

## Never

- execute a movement merely because it appears on a recurring list;
- treat a recurring plan as standing approval;
- create or edit a beneficiary;
- auto-retry a failed or expired movement.
