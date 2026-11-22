# Accounts and Identifiers

Take every ID from an authoritative BudgetHQ MCP tool response in this conversation. Never infer, construct, or guess an ID. Never substitute one ID type for another, even when the values look similar. If the entity is ambiguous, stop and ask.

Do not expose secrets, tokens, credentials, or private authentication material in reports.

| Name | Type | Source tools | Use for | Never substitute |
| --- | --- | --- | --- | --- |
| `investec_account_id` | string | `list_investec_accounts`, `list_investec_profile_accounts` | Source `account_id` on balances, transactions, transfers, payments | Account number, account name, `referenceName`, `profileId`, BudgetHQ manual account ID |
| `beneficiary_account_id` | string | Same account lists | Destination on `create_investec_transfer` only | `beneficiaryId`, account number, account name |
| `beneficiary_id` | string | `list_investec_beneficiaries`, `list_investec_profile_beneficiaries` | `create_investec_payment` only | Account number, accountId, categoryId, display name |
| `profile_id` | string | `list_investec_profiles` or profile fields on account responses | Profile-scoped reads | `accountId`, `beneficiaryId` |
| `movement_id` | integer | `create_investec_transfer` or `create_investec_payment` response | `get_investec_movement` | Investec transaction ID, ledger transaction ID |
| `budgethq_transaction_id` | integer | `list_transactions`, `get_transaction` | Ledger category, hide, and link tools | `movement_id` |
| `amount` | string | User instruction or the active workflow | Transfer and payment amount | Currency symbols, thousands separators, floats |
| `idempotency_key` | string, optional | One key per logical movement | Replay of that same logical movement | A new key invented to bypass an uncertain earlier call |

Amounts are positive decimal strings with two places, such as `"1500.00"`.

## Tool parameters

- `get_investec_account_balance`, `list_investec_transactions`, `list_investec_pending_transactions`: `account_id` is `investec_account_id`.
- `list_investec_profile_accounts`: `profile_id`.
- `get_investec_authorisation_setup`, `list_investec_profile_beneficiaries`: `profile_id` and `account_id`.
- `list_investec_beneficiary_categories`: `profile_id`.
- `create_investec_transfer`: `account_id`, `beneficiary_account_id`, `amount`, `my_reference`, `their_reference`, optional `idempotency_key`.
- `create_investec_payment`: `account_id`, `beneficiary_id`, `amount`, `my_reference`, `their_reference`, optional `idempotency_key`.
- `get_investec_movement`: integer `movement_id`.

Use account metadata (`accountName`, `referenceName`, `productName`) to decide which account the user means, then pass that row's `accountId`. Metadata is not the ID.

A transfer between the user's own Investec accounts and a payment to an existing beneficiary are not interchangeable. If several beneficiaries share a name, use the rest of the returned metadata. If you still cannot tell them apart, stop.

Skip a fresh list only when the ID was just returned by a trusted tool in this conversation and still matches the intended entity.
