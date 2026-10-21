# External Manual Accounts API

HTTP API for external tools (for example a Grok "Private Banker" bot) to view and maintain your BudgetHQ **manual bank accounts** — the balance-only accounts you track without transaction sync — without using the web UI session.

All endpoints return JSON and use the same authentication as the other external APIs. They expose **your** data only — scoped to the user who owns the API key.

One design rule to know up front:

- **No delete.** The external API cannot delete manual accounts. Create and balance updates are supported; removing an account is a deliberate action reserved for the web UI.

---

## Authentication

Manual accounts endpoints use the same two key scopes as the [External Budget & Transactions API](external-budget-transactions-api.md). If you already have a key from that API, it works here too — no separate setup needed.

| Key | Scope | Use it for |
|-----|-------|------------|
| **Read-only** | `GET` endpoints only. Any write returns `403 Forbidden` | Scheduled snapshots that only read balances |
| **Full-access** | Everything, including `POST` and `PATCH` | Bots that create accounts or push balance updates |

Send the key on every request:

```http
Authorization: Bearer bhq_YOUR_KEY_HERE
```

- Only keys starting with `bhq_` are accepted.
- JWT login tokens are **not** accepted on these routes.

### Errors

| Status | Meaning |
|--------|---------|
| `401 Unauthorized` | Missing header, invalid key, or revoked key |
| `403 Forbidden` | Write endpoint called with the read-only key (`This endpoint requires the full-access API key`) |
| `404 Not Found` | No manual account with that id belonging to you |
| `422 Unprocessable Entity` | Invalid body — missing `name` on create, missing `balance` on update |

---

## Base URL

Production:

```
https://<your-domain>/api/external/manual-accounts
```

**In-app documentation:** open [`/api/external/manual-accounts/docs`](/api/external/manual-accounts/docs) (markdown, no auth required), or from **Settings → Full-access API key** in the web UI.

---

## Endpoints

### List accounts

```
GET /api/external/manual-accounts
```

Returns every manual bank account you own, newest-created included. Works with the read-only key.

```json
{
  "count": 2,
  "accounts": [
    {
      "id": 1,
      "name": "Savings",
      "balance": 500.5,
      "is_emergency_savings": true,
      "created_at": "2026-10-21T08:00:00Z",
      "updated_at": "2026-10-21T09:00:00Z"
    },
    {
      "id": 2,
      "name": "Stash",
      "balance": 0,
      "is_emergency_savings": false,
      "created_at": "2026-10-20T08:00:00Z",
      "updated_at": "2026-10-20T08:00:00Z"
    }
  ]
}
```

### Get one account

```
GET /api/external/manual-accounts/{account_id}
```

Returns the same shape as a single list item. Returns `404` if the id does not exist or belongs to another user.

### Create an account

```
POST /api/external/manual-accounts
```

Requires the **full-access** key.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Display name, e.g. `"Holiday Jar"` |
| `balance` | number | no | Defaults to `0` |
| `is_emergency_savings` | boolean | no | Defaults to `false` |

```json
{
  "name": "Holiday Jar",
  "balance": 1250.75
}
```

Returns the created account (same shape as a list item, including its new `id`).

### Update an account's balance

```
PATCH /api/external/manual-accounts/{account_id}
```

Requires the **full-access** key.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `balance` | number | yes | The new balance — replaces the stored value |

```json
{
  "balance": 1234.56
}
```

Returns the updated account.

Notes:

- **Balance only.** The account's `name` and `is_emergency_savings` flag are not editable through this API — extra fields in the body are ignored. Manage those in the web UI.
- **Replace, not increment.** Send the full new balance; there is no delta/adjustment endpoint.

### No delete endpoint

There is deliberately no `DELETE /api/external/manual-accounts/{account_id}`. External tools can create accounts and keep balances current, but removing an account stays a manual action in the web UI so a buggy bot cannot wipe your tracked accounts.

---

## Related

- [External Budget & Transactions API](external-budget-transactions-api.md) — budget, transactions, classification, and refunds.
- [External Investments API](external-investments-api.md) — investment sleeve balances.
