---
name: banking-transfers
description: Safely execute transfers between the user's own accounts in BudgetHQ/Investec. Use when planning, preparing, submitting, or verifying an own-account transfer.
---

# Banking Transfers

## Use this skill when
The user requests a transfer between accounts they own, including funding, savings allocation, or a transfer as part of a broader workflow.

## Required references
Read:
- `../shared/references/core-rules.md`
- `../shared/references/accounts-and-identifiers.md`
- `../shared/references/error-handling.md`
- `../shared/references/workflow-registry.md`

Use the verification skill for the final status.

## Workflow
1. Establish the user's exact intent. Confirm amount, source account, destination account, and references.
2. Call `list_investec_accounts` and resolve both Investec `accountId` values from that response. Never guess identifiers. The destination must be a different account the user owns. `create_investec_transfer` cannot pay an external beneficiary or a non-Investec account.
3. Validate that both accounts are the intended accounts and the movement is supported.
4. Check available balances and pending movements where relevant. Do not subtract pending movements twice if they are already reflected in the available balance.
5. Scan for an existing or recently submitted equivalent movement to avoid duplication.
6. Prepare the transfer. Both `my_reference` and `their_reference` must be uppercase and end in `TRANSFER`.
7. Present the exact movement for user alignment: amount, source, destination, both references, and any relevant fees or limitations known. Chat alignment is not Telegram approval.
8. Call `create_investec_transfer` with `account_id` (source Investec accountId), `beneficiary_account_id` (destination Investec accountId), `amount` as a two-decimal string, and both references. This queues the movement. It does not complete it. Pass `idempotency_key` only when replaying this same logical transfer after an ambiguous result has been reconciled.
9. Capture the returned movement ID. Tell the user to Approve or Reject that exact movement in Telegram. The approval window is 15 minutes. Do not call create again while it is pending.
10. Verify with `get_investec_movement`. If the result is ambiguous, reconcile before taking further action. Follow `banking-verification`.
11. Report status and evidence accurately.

## Stop conditions
Stop and ask if:
- account identity is ambiguous;
- balance/identifier validation fails;
- the movement appears duplicated;
- a queued approval is expired, rejected, or for a different movement;
- execution or verification returns an ambiguous result.

## Never
- blindly retry;
- change amount, source, destination, or reference after approval;
- treat user agreement in chat as Telegram approval;
- claim receipt or settlement without evidence.
