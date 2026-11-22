# BudgetHQ Banking Core Rules

## Approval and authorization
- Conversational agreement is not the required Telegram approval.
- `create_investec_transfer` and `create_investec_payment` queue a movement. Queueing is not approval and is not completion.
- After queueing, the owner must tap Approve or Reject on the Telegram message. Do not wait for Telegram approval before the create call, because the approval message is sent by that call.
- Every transfer and every payment requires its own Telegram approval for the exact movement.
- Approval is valid for 15 minutes. Never automatically resubmit an expired movement.
- Transfers and payments are separate movements and require separate approvals.
- Never infer approval for a changed amount, source, destination, beneficiary, or reference.
- Do not bypass Telegram approval in scheduled or automated workflows.

## Validation
- Confirm movement type, amount, source, destination/beneficiary, and reference.
- Check available balance when relevant and reconcile pending movements.
- Perform a duplicate scan before submission.
- Use existing beneficiaries only; do not create, edit, or delete beneficiaries through payment workflows.
- Use only validated account and beneficiary identifiers.

## References
- Transfer references: uppercase and end with `TRANSFER` for both `my_reference` and `their_reference`.
- Payment references: uppercase; no `TRANSFER` suffix requirement.
- Use the workflow-specific reference format.

## Execution and retries
- Never blindly retry a movement.
- If outcome is ambiguous, reconcile first using movement lookup and supporting evidence.
- Reuse an idempotency key only for the same logical movement, if the tool supports it. Do not generate a new key to overcome uncertainty about an earlier request.
- Expired, rejected, or failed movements require fresh user intent before a new attempt.

## Verification and reporting
- Use Investec movement lookup as primary verification.
- Transactions, pending movements, and balances are supplementary evidence.
- Do not claim recipient receipt or settlement without evidence.
- Do not claim completion unless the available evidence supports it.
- BudgetHQ general transaction feed may lag by roughly 5–10 minutes and is not primary live movement verification.
- Disclose failures, ambiguity, and tool limitations.
