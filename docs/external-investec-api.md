# External Investec API

HTTP API for external tools to read the connected Investec profile and to queue a transfer or payment. Reads return Investec's JSON. A transfer or payment is queued here and stays pending until it is approved in Telegram.

All endpoints use the same two `bhq_` keys as the other external APIs. They act for the user who owns the key, using that user's stored Investec credentials.

One rule to know up front:

- **Queue, then Telegram.** `POST` transfers and payments do not move money. They return a pending movement. Money moves only after the Telegram approval on that movement. A pending response is not a completed payment.

---

## Authentication

| Key | Scope | Use it for |
|-----|-------|------------|
| **Read-only** | `GET` endpoints only. A transfer or payment returns `403 Forbidden` | Account, balance, transaction, profile, and beneficiary reads, and checking a movement |
| **Full-access** | Everything, including `POST` | Queueing a transfer or payment |

1. Log in to BudgetHQ.
2. Open **Settings**.
3. Under **Full-access API key** or **Read-only API key**, click **Generate key**.
4. Copy the key immediately. It is shown once and cannot be retrieved later.

Send the key on every request:

```http
Authorization: Bearer bhq_YOUR_KEY_HERE
```

- Only keys starting with `bhq_` are accepted.
- JWT login tokens are **not** accepted on these routes.
- The ChatGPT MCP server does not use this key. It signs in with OAuth and calls these same route functions for the signed-in user.

### Errors

| Status | Meaning |
|--------|---------|
| `401 Unauthorized` | Missing header, invalid key, or revoked key |
| `403 Forbidden` | Transfer or payment called with the read-only key |
| `400 Bad Request` | Investec credentials are not stored, Telegram is not connected, or the transfer/payment body is invalid |
| `404 Not Found` | Movement id does not belong to this user |
| `502 Bad Gateway` | The movement was stored, then the Telegram approval message could not be sent. The movement status is `failed` |

---

## Base URL

Production:

```
https://<your-domain>/api/external/investec
```

**In-app documentation:** open [`/api/external/investec/docs`](/api/external/investec/docs) (markdown, no auth required).

Investec credentials are saved in **Settings**, separate from the `bhq_` key. Reads and movements fail with `400` until a client id, client secret, and Investec API key are stored.

---

## Reads

Each GET forwards its query string to the matching Investec Private Bank call and returns Investec's status code and JSON body. These work with the read-only key.

| Method | Path | Investec call |
|--------|------|----------------|
| `GET` | `/accounts` | `/za/pb/v1/accounts` |
| `GET` | `/accounts/{account_id}/balance` | `/za/pb/v1/accounts/{account_id}/balance` |
| `GET` | `/accounts/{account_id}/transactions` | `/za/pb/v1/accounts/{account_id}/transactions` |
| `GET` | `/accounts/{account_id}/pending-transactions` | `/za/pb/v1/accounts/{account_id}/pending-transactions` |
| `GET` | `/profiles` | `/za/pb/v1/profiles` |
| `GET` | `/profiles/{profile_id}/accounts` | `/za/pb/v1/profiles/{profile_id}/accounts` |
| `GET` | `/profiles/{profile_id}/accounts/{account_id}/authorisation-setup` | authorisation setup for that account |
| `GET` | `/profiles/{profile_id}/accounts/{account_id}/beneficiaries` | beneficiaries for that account |
| `GET` | `/beneficiaries` | `/za/pb/v1/accounts/beneficiaries` |
| `GET` | `/beneficiary-categories` | `/za/pb/v1/accounts/beneficiarycategories` |

`GET /beneficiary-categories` accepts `profileId`. When it is omitted, BudgetHQ uses the default Investec profile, or the first profile when none is marked default.

---

## Movements

Transfers and payments require the full-access key, stored Investec credentials, and a connected Telegram bot (**Settings**). Each request queues exactly one movement. The row expires 15 minutes after it is created.

A successful queue returns `202 Accepted`:

```json
{
  "id": 15,
  "status": "pending",
  "kind": "transfer",
  "expires_at": "2026-11-23T10:15:00+00:00"
}
```

`investec_response` is included only after Investec has answered. Check the same object with the read-only or full-access key:

```
GET /api/external/investec/movements/{movement_id}
```

`status` moves through `pending`, then `approved` or `rejected` from Telegram. Later values are `sent`, `needs_authorisation`, `expired`, and `failed`. `pending` means the money has not moved.

Send `Idempotency-Key` when retrying. The same key for the same user returns the existing movement with `200 OK` instead of queueing another one.

### Transfer between your own accounts

```
POST /api/external/investec/accounts/{account_id}/transfers
```

`transferList` must contain exactly one item. `beneficiaryAccountId` must be another of your own Investec accounts. `amount` is required.

```json
{
  "transferList": [
    {
      "beneficiaryAccountId": "destination-account-id",
      "amount": "100.00",
      "myReference": "From Daily",
      "theirReference": "To Savings"
    }
  ]
}
```

### Pay an existing beneficiary

```
POST /api/external/investec/accounts/{account_id}/payments
```

`paymentList` must contain exactly one item. `beneficiaryId` must already exist on the Investec profile. `amount` is required.

```json
{
  "paymentList": [
    {
      "beneficiaryId": "beneficiary-id",
      "amount": "100.00",
      "myReference": "Rates",
      "theirReference": "November"
    }
  ]
}
```

---

## Related

- [External Budget & Transactions API](external-budget-transactions-api.md) — stored transactions, categories, and refund links. That API does not call Investec live and cannot queue a payment.
- [External Investments API](external-investments-api.md) — investment sleeve balances.
- [External Manual Accounts API](external-manual-accounts-api.md) — balance-only accounts that are not Investec accounts.
