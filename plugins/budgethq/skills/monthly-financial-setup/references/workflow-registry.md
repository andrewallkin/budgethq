# Workflow Registry

Route the request, then follow that skill. Do not run a money movement from this index alone.

| Request | Skill |
| --- | --- |
| Transfer between the user's own Investec accounts | `banking-transfers` |
| Pay an existing Investec beneficiary | `banking-payments` |
| Cleaning, Watchprop, rates, or extra vehicle finance | `recurring-costs` |
| Set up the monthly money period | `monthly-financial-setup` |
| Last-day funding of next month's debit orders | `month-end-funding-transfer` |
| Status of a queued or uncertain movement | `banking-verification` |

Every movement workflow also reads `core-rules.md`, `accounts-and-identifiers.md`, and `error-handling.md`, then verifies with `banking-verification`.

## MCP tools

Read-only Investec tools:

- `list_investec_accounts`
- `get_investec_account_balance`
- `list_investec_transactions`
- `list_investec_pending_transactions`
- `list_investec_profiles`
- `list_investec_profile_accounts`
- `get_investec_authorisation_setup`
- `list_investec_profile_beneficiaries`
- `list_investec_beneficiaries`
- `list_investec_beneficiary_categories`
- `get_investec_movement`

Write tools, both of which queue a movement for Telegram approval:

- `create_investec_transfer`
- `create_investec_payment`

`list_transactions` and `get_transaction` are BudgetHQ ledger tools. They are for budgeting and later reconciliation. They are not the primary check that a just-submitted Investec movement completed.
