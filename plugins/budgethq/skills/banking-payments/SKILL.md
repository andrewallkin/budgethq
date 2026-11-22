---
name: banking-payments
description: Safely prepare, submit, and verify payments to existing beneficiaries. Use when the user asks to pay a beneficiary or make a bank payment.
---

# Banking Payments

## Required references
Read:
- `references/core-rules.md`
- `references/accounts-and-identifiers.md`
- `references/error-handling.md`

Use the banking-verification skill for final verification.

## Scope
- Payments to existing beneficiaries only.
- Do not create, edit, or delete beneficiaries in this workflow.

## Workflow
1. Confirm user's intent and exact payment amount.
2. Call `list_investec_beneficiaries`. If the match is ambiguous, use `list_investec_profiles` and `list_investec_profile_beneficiaries`. Match identity and returned bank details. Stop if more than one candidate fits. Never invent a `beneficiary_id`.
3. Call `list_investec_accounts` and confirm the source `accountId`.
4. Check available balance and pending movements where relevant; avoid double-counting pending items.
5. Scan for a duplicate or recent equivalent payment.
6. Both `my_reference` and `their_reference` must be uppercase. Do not add a `TRANSFER` suffix unless it is part of the intended payment reference.
7. Present exact details: beneficiary identity, returned bank details, amount, source account, both references, and any relevant fee or timing information. Chat alignment is not Telegram approval.
8. Call `create_investec_payment` with `account_id`, `beneficiary_id`, `amount` as a two-decimal string, and both references. This queues the payment. It does not complete it. Pass `idempotency_key` only when replaying this same logical payment after an ambiguous result has been reconciled.
9. Capture the returned movement ID. Tell the user to Approve or Reject that exact payment in Telegram. The approval window is 15 minutes. Do not call create again while it is pending.
10. Verify with `get_investec_movement` and reconcile if needed. Follow `banking-verification`.
11. Report the evidence-backed status.

## Stop conditions
Stop if beneficiary identity, source account, amount, reference, or duplicate status is uncertain. After queueing, stop if approval is expired, rejected, or for a different payment.

## Never
- create or modify a beneficiary;
- retry blindly;
- infer approval from chat consent;
- treat an expired/rejected/failed movement as permission to resubmit;
- claim settlement or recipient receipt without evidence.
