---
name: banking-verification
description: Reconcile and verify the status of banking transfers and payments. Use after movement submission, when checking a past movement, or when execution outcome is uncertain.
---

# Banking Verification and Reconciliation

## Required references
Read:
- `../shared/references/core-rules.md`
- `../shared/references/error-handling.md`

## Status interpretation
Use the tool's actual status, mapping carefully into:
- pending
- approved
- sent
- needs_authorisation
- rejected
- expired
- failed
- unknown/ambiguous

Do not collapse these statuses into 'completed'.

## Evidence order
1. Primary: Investec movement lookup for the movement ID or exact movement.
2. Supplementary: `list_investec_pending_transactions`, `list_investec_transactions`, and `get_investec_account_balance`. A balance change or a posted row does not by itself prove success.
3. BudgetHQ general transaction feed: bookkeeping/reconciliation only; it may lag approximately 5–10 minutes.

## Workflow
1. Identify the movement to verify. Use the integer movement ID returned by `create_investec_transfer` or `create_investec_payment`. Never guess it.
2. Call `get_investec_movement` with that ID.
3. Interpret the returned status and evidence.
4. If needed, reconcile using supplementary evidence. Account for feed lag and pending items.
5. If conflicting or incomplete, report unknown/ambiguous and stop.
6. Report what is evidenced, what remains unconfirmed, and the timestamp/context if available.

## Never
- blindly retry a movement during verification;
- claim recipient receipt or settlement without direct evidence;
- mark a movement complete solely from a lagging bookkeeping feed;
- invent status, movement ID, or evidence.
