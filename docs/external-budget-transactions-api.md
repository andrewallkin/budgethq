# External Budget & Transactions API

HTTP API for external tools (for example a Grok "Private Banker" bot) to read your BudgetHQ budget and Investec bank transactions, classify them, hide noise, and link refunds back to the expenses they offset — without using the web UI session.

All endpoints return JSON and use the same authentication. They expose **your** data only — scoped to the user who owns the API key.

Two design rules to know up front:

- **Hide, not delete.** The external API cannot delete transactions. Rows you hide survive every Investec sync and can be unhidden at any time — see [Hide, not delete](#hide-not-delete).
- **Dry-run before bulk edits.** `POST /transactions/apply-rules` supports `dry_run: true`; inspect the would-be changes before committing them.

---

## Authentication

### Create a key

1. Log in to BudgetHQ.
2. Open **Settings**.
3. Under the API key card, click **Generate Key**.
4. Copy the key immediately. It is shown once and cannot be retrieved later.

Keys look like `bhq_…` (long random string). Store them in your integration's secrets — not in source control.

To rotate a key, use **Regenerate Key** in Settings — the old key stops working immediately. **Revoke Key** disables a key without a replacement.

### Two key scopes

There are two key types, managed separately in Settings:

| Key | Scope | Use it for |
|-----|-------|------------|
| **Read-only** | GET endpoints only. Any write returns `403 Forbidden` | Scheduled routines that only read — the **morning snapshot** and the **refund watcher** |
| **Full-access** | Everything, including PATCH / POST / DELETE | Interactive sessions: classify, hide, link refunds, apply rules |

Send the key on every request:

```http
Authorization: Bearer bhq_YOUR_KEY_HERE
```

- Only keys starting with `bhq_` are accepted.
- JWT login tokens are **not** accepted on these routes.
- Convention: scheduled routines should hold the **read-only** key even if they never write — a leaked routine key then cannot mutate your data. Promote to the full-access key only for interactive classify/link/hide sessions.

### Errors

| Status | Meaning |
|--------|---------|
| `401 Unauthorized` | Missing header, invalid key, or revoked key |
| `403 Forbidden` | Write endpoint called with the read-only key (`This endpoint requires the full-access API key`) |
| `400 Bad Request` | Invalid parameter — bad date, unknown category slug, missing rule target, … |
| `404 Not Found` | Unknown transaction, link, or rule id |
| `409 Conflict` | Duplicate link — this credit is already linked to this debit (see `POST /transaction-links`) |

---

## Base URL

Production:

```
https://budgethq.andrewallkin.com/api/external
```

**In-app documentation:** open [`/api/external/budget-transactions/docs`](/api/external/budget-transactions/docs) (this document, served as markdown, no auth required).

Local development (if the backend is exposed on port 8000):

```
http://localhost:8000/api/external
```

---

## Endpoints overview

| Endpoint | Method | Purpose | Key |
|----------|--------|---------|-----|
| `/categories` | GET | Full taxonomy with descriptions | read-only |
| `/budget/summary` | GET | Income, period, expected totals, included/excluded items | read-only |
| `/budget/comparison` | GET | Budget vs actual per category for a period | read-only |
| `/transactions` | GET | Filterable transaction list | read-only |
| `/transactions/{id}` | GET | Single transaction | read-only |
| `/transactions/link-candidates?credit_id=` | GET | Debit candidates for a refund credit | read-only |
| `/transactions/{id}/category` | PATCH | Classify / unclassify | full-access |
| `/transactions/categories` | PATCH | Batch classify (≤100) | full-access |
| `/transactions/{id}/hidden` | PATCH | Hide / unhide | full-access |
| `/transaction-links` | POST | Link refund → expense (409 + `existing_link_id` on duplicate) | full-access |
| `/transaction-links/{id}` | DELETE | Unlink | full-access |
| `/transactions/apply-rules` | POST | Run rules over history (dry-run first) | full-access |

---

## `GET /categories`

The full classification taxonomy — the bot's reference for every category slug used across this API.

### Request

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/categories" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Response

```json
{
  "categories": [
    {
      "slug": "groceries",
      "label": "Groceries",
      "group": "expense",
      "description": "Food and drink purchased for home — supermarkets, butchers, delis, and fresh produce stores",
      "examples": "Woolworths, Pick n Pay, Checkers, Shoprite",
      "budget_linkable": true
    },
    {
      "slug": "salary",
      "label": "Salary",
      "group": "income",
      "description": "Regular salary, wages, employer payments",
      "examples": "Payroll, employer deposits",
      "budget_linkable": false
    }
  ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `categories[].slug` | Stable identifier used by every other endpoint |
| `categories[].label` | Display label |
| `categories[].group` | `"income"`, `"expense"`, or `"neutral"` |
| `categories[].description` | What belongs in this category |
| `categories[].examples` | Example merchants / descriptions |
| `categories[].budget_linkable` | `true` when a budget line item can be tagged with this category |

### Notes

- `uncategorized` is included as a neutral pseudo-category (`slug: "uncategorized"`) — it is how the API refers to rows with no category yet.
- `refund` and `transfers` are neutral: they are not income and not spending. `refund` credits are the ones you can link against debits (see `POST /transaction-links`).
- Only expense categories are meaningful as budget line-item tags; `budget_linkable` tells you which.
- **This endpoint is authoritative** — do not hardcode category lists in your integration. The [category reference](#category-reference) at the bottom of this page is a convenience snapshot.

---

## `GET /budget/summary`

Your monthly budget context: income for the current budget period, the period's date range, expected spending totals, and every budget line item split into included vs excluded.

### Request

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/budget/summary" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Response

```json
{
  "income": 45000.0,
  "income_payslip_year": 2026,
  "income_payslip_month": 9,
  "income_skipped_additional": true,
  "budget_period_start_day": 22,
  "current_period": {
    "from_date": "2026-09-22",
    "to_date": "2026-10-21"
  },
  "expected_totals": {
    "needs": 18000.0,
    "wants": 6500.0,
    "savings": 12000.0
  },
  "included_items": [
    {
      "type": "needs",
      "name": "Groceries",
      "amount": 7000.0,
      "transaction_category": "groceries",
      "excluded": false
    }
  ],
  "excluded_items": [
    {
      "type": "savings",
      "name": "Emergency pot",
      "amount": 2000.0,
      "transaction_category": "savings",
      "excluded": true
    }
  ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `income` | Monthly budget income derived from your payslips (ZAR). `null` if no payslip data yet |
| `income_payslip_year` / `income_payslip_month` | Payslip year/month the income figure derives from |
| `income_skipped_additional` | `true` when the payslip had bonus/additional income that was deliberately **not** counted as monthly budget money |
| `budget_period_start_day` | Day of month the budget period starts (1–31; 1 = calendar month) |
| `current_period.from_date` / `to_date` | Date range of the period containing today (inclusive) |
| `expected_totals` | Sum of **included** line items per type: `needs`, `wants`, `savings` |
| `included_items` | Line items counted against Investec transactions |
| `excluded_items` | Line items deliberately outside Investec tracking |
| `items[].type` | `"needs"`, `"wants"`, or `"savings"` |
| `items[].name` | Line item name |
| `items[].amount` | Budgeted amount |
| `items[].transaction_category` | Category slug the line item is tagged with (`"uncategorized"` when untagged) |
| `items[].excluded` | Always `false` in `included_items`, `true` in `excluded_items` |

### Notes

- **Use `current_period` dates as the default date window** for transaction queries — the budget month is usually not the calendar month (see `budget_period_start_day`).
- **Excluded items are deliberate.** They represent money that never flows through the Investec accounts (for example savings pot contributions made elsewhere). They contribute nothing to `expected_totals` and never appear in transaction actuals.
- **Income is payslip-derived, not transaction-derived.** Bonus months do not inflate the monthly budget; when additional payslip income was skipped, `income_skipped_additional` is `true`.

---

## `GET /budget/comparison`

Budget vs actual spending per category for a budget period — the same numbers as the Budget Analysis comparison table.

### Request

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/budget/comparison" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

With an explicit period (end-month `YYYY-MM`):

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/budget/comparison?period=2026-10" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `period` | No | End-month `YYYY-MM`. `"2026-10"` means the period **ending** in October 2026 (with start day 22 that is 2026-09-22 → 2026-10-21). Defaults to the current period. Malformed or out-of-range values (`2026-13`, `1900-01`, `junk`) return `400 period must be YYYY-MM` |

### Response

```json
{
  "period": {
    "year": 2026,
    "month": 10,
    "from_date": "2026-09-22",
    "to_date": "2026-10-21"
  },
  "rows": [
    {
      "category_key": "dining_takeaways",
      "label": "Dining & Takeaways",
      "budgeted": 1500.0,
      "actual": 1745.5,
      "remaining": -245.5
    }
  ],
  "totals": {
    "budgeted": 34200.0,
    "spent": 36100.0,
    "remaining": -1900.0
  },
  "refunds": {
    "unlinked_refund_total": 500.0,
    "unlinked_reimbursement_total": 0.0,
    "linked_offset_total": 320.0
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `period.year` / `period.month` | The end month you asked for (or the current one) |
| `period.from_date` / `to_date` | Resolved date range for the period |
| `rows[].category_key` | Category slug |
| `rows[].label` | Display label |
| `rows[].budgeted` | Budgeted amount for the category |
| `rows[].actual` | Actual debit spending, **net of linked refund/reimbursement offsets** |
| `rows[].remaining` | `budgeted − actual` (negative = over budget) |
| `totals.budgeted` | Total budgeted, **boosted by still-unlinked refund/reimbursement credits** |
| `totals.spent` | Total actual spending |
| `totals.remaining` | `budgeted − spent` |
| `refunds.unlinked_refund_total` | Refund credits with no (or partial) links — still available as budget headroom |
| `refunds.unlinked_reimbursement_total` | Same for `reimbursements` credits |
| `refunds.linked_offset_total` | Total already linked back to expenses |

### Notes

- Rows appear only for categories with a budget or actual spending in the period; a zero-everything category is omitted.
- Hidden transactions never count toward `actual`.
- `totals.budgeted` includes unlinked refund/reimbursement credits as extra headroom — that is how the UI behaves, so comparisons stay consistent.
- No budget configured → empty `rows` and zeroed `totals`/`refunds` (not an error).

---

## `GET /transactions`

Filterable, paginated transaction list. Newest first.

### Request

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/transactions?from_date=2026-09-22&to_date=2026-10-21&limit=50" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

Repeatable category filter:

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/transactions?category=refund&category=reimbursements" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `from_date` | No | `YYYY-MM-DD`, inclusive |
| `to_date` | No | `YYYY-MM-DD` — the whole day is included |
| `category` | No | Category slug; repeatable to match any of them. The special value `uncategorized` matches rows with no category |
| `transaction_type` | No | `DEBIT` or `CREDIT` |
| `status` | No | `POSTED` or `PENDING` |
| `search` | No | Case-insensitive substring match on description |
| `account_id` | No | Restrict to one Investec account id |
| `include_transfers` | No | Default `false` — transfers between your own accounts are excluded |
| `include_hidden` | No | Default `false` — hidden rows are excluded |
| `limit` | No | 1–500, default `100` |
| `offset` | No | Default `0` |

### Response

```json
{
  "transactions": [
    {
      "id": 1234,
      "investec_uuid": "a1b2c3d4-…",
      "account_id": 7,
      "account_name": "Private Client Account",
      "transaction_type": "DEBIT",
      "amount": -492.9,
      "effective_amount": 492.9,
      "transaction_category": "CardPurchases",
      "status": "POSTED",
      "category": "health_wellness",
      "ai_category_confidence": 0.92,
      "user_corrected": false,
      "hidden": false,
      "description": "DISCOVERY HEALTH",
      "transaction_date": "2026-10-14",
      "has_links": false,
      "linked_credits": [],
      "linked_debits": []
    }
  ],
  "count": 214
}
```

### Transaction fields

| Field | Description |
|-------|-------------|
| `id` | BudgetHQ transaction id (use this in PATCH / link endpoints) |
| `investec_uuid` | Investec's stable transaction id |
| `account_id` | Investec account id |
| `account_name` | Display name of the account |
| `transaction_type` | `"DEBIT"` or `"CREDIT"` |
| `amount` | Signed amount — debits are negative, credits positive |
| `effective_amount` | Always positive. For debits: absolute amount minus linked refund offsets; for credits: absolute amount |
| `transaction_category` | Investec's own type label (`CardPurchases`, `Deposits`, `FeesAndInterest`, …) — not the BudgetHQ category |
| `status` | `"POSTED"` or `"PENDING"` |
| `category` | BudgetHQ category slug; `null` = uncategorized |
| `ai_category_confidence` | 0.0–1.0 confidence for the AI-classified category |
| `user_corrected` | `true` when you/user set the category manually — protects the row from `apply-rules` |
| `hidden` | `true` when hidden via the API or the UI |
| `description` | Raw bank description |
| `transaction_date` | `YYYY-MM-DD` |
| `has_links` | `true` when any refund/reimbursement link touches this row |
| `linked_credits` | On a debit: credits linked to it — `[{transaction_id, description, amount}]` (`amount` is the link amount) |
| `linked_debits` | On a credit: debits it offsets — same shape |

### Notes

- `count` is the total number of matching rows **before** pagination; paginate with `limit`/`offset`.
- Results are ordered by `transaction_date` descending (newest first).
- Transfers and hidden rows are excluded by default — pass `include_transfers=true` / `include_hidden=true` to see them.
- `category` and `transaction_category` are different things: filter on `category` (BudgetHQ slug), display `transaction_category` only as bank context.

---

## `GET /transactions/{id}`

Single transaction with the same fields as the list.

### Request

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/transactions/1234" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Response

One transaction object (same shape as a list row). `404` if the id is not yours or does not exist.

---

## `GET /transactions/link-candidates`

Given a refund/reimbursement **credit**, find the debits it could offset. Powers the refund watcher: fetch credits, then ask for candidates.

### Request

```bash
curl -s "https://budgethq.andrewallkin.com/api/external/transactions/link-candidates?credit_id=456" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Response

```json
{
  "candidates": [
    {
      "id": 1234,
      "transaction_type": "DEBIT",
      "amount": -655.0,
      "effective_amount": 655.0,
      "description": "DISCOVERY HEALTH",
      "transaction_date": "2026-10-14",
      "match_score": 0.95,
      "match_reasons": ["partial_amount", "within_14_days"],
      "debit_remaining": 655.0
    }
  ]
}
```

Each candidate is a full transaction payload plus `match_score`, `match_reasons`, and `debit_remaining`. Sorted by `match_score` descending.

### Scoring

| Tier | Condition | Base score |
|------|-----------|------------|
| `amount_exact` | Debit remaining within 1% of credit remaining | 0.8 |
| `amount_near` | Within 10% | 0.6 |
| `partial_amount` | Debit remaining is **larger** than credit remaining (e.g. R492.90 Discovery credit vs R655 debit) — a partial refund of a bigger expense | 0.3 |

Final `match_score` = base + `0.2 ×` description similarity (0–1), rounded to 3 decimals. `match_reasons` also includes a date reason: `within_14_days` (credit ≤ 14 days after the debit) or `within_90_days`.

### Notes

- The credit must be a `CREDIT` categorised `refund` or `reimbursements`; otherwise `400`.
- Candidates are debits dated within 90 days **back** from the credit date (and on or before it).
- Debts already fully offset, fully used credits, and hidden debits are excluded.
- A credit larger than a debit's remaining amount cannot match that debit (it would over-refund).
- High `match_score` is a suggestion, not a decision — surface the candidates to the user before linking.

---

## `PATCH /transactions/{id}/category`

Classify or unclassify one transaction (full-access key).

### Request

```bash
curl -s -X PATCH "https://budgethq.andrewallkin.com/api/external/transactions/1234/category" \
  -H "Authorization: Bearer bhq_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"category": "health_wellness"}'
```

### Body

| Field | Description |
|-------|-------------|
| `category` | Valid slug from `/categories`. `""` or `null` unclassifies (row becomes Uncategorized). Unknown slugs → `400` |

### Response

The updated transaction payload (same shape as `GET /transactions/{id}`).

### Notes

- Sets `user_corrected: true`. These corrections feed BudgetHQ's self-learning rules, and `apply-rules` will never overwrite them.
- `404` if the transaction is not yours.

---

## `PATCH /transactions/categories`

Batch classification — up to 100 updates per call (full-access key).

### Request

```bash
curl -s -X PATCH "https://budgethq.andrewallkin.com/api/external/transactions/categories" \
  -H "Authorization: Bearer bhq_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"updates": [
    {"id": 1234, "category": "health_wellness"},
    {"id": 1235, "category": ""},
    {"id": 9999, "category": "groceries"}
  ]}'
```

### Body

| Field | Description |
|-------|-------------|
| `updates` | 1–100 items of `{id, category}`. Same category semantics as the single PATCH. `0` or `>100` items → `400` |

### Response

```json
{
  "results": [
    {"id": 1234, "status": "ok", "transaction": { "…": "…" }},
    {"id": 1235, "status": "ok", "transaction": { "…": "…" }},
    {"id": 9999, "status": "error", "detail": "Transaction not found"}
  ]
}
```

### Notes

- Per-item results: `status: "ok"` rows carry the updated `transaction`; `status: "error"` rows carry a `detail` message. One bad id does not fail the batch.
- Check the per-item `error` results before reporting success — partial failure is normal for stale ids.

---

## `PATCH /transactions/{id}/hidden`

Hide or unhide a transaction (full-access key). This is the API's only "remove from view" — see [Hide, not delete](#hide-not-delete).

### Request

```bash
curl -s -X PATCH "https://budgethq.andrewallkin.com/api/external/transactions/1234/hidden" \
  -H "Authorization: Bearer bhq_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hidden": true}'
```

### Body

| Field | Description |
|-------|-------------|
| `hidden` | `true` to hide, `false` to unhide. Anything else → `400` |

### Response

The updated transaction payload.

### Notes

- Hidden rows disappear from listings, Budget Analysis, and budget actuals (unless `include_hidden=true`), and stay hidden across every Investec sync.
- Unhide with `hidden: false` or the **Show hidden** toggle in the Banking transactions list.

---

## `POST /transaction-links`

Link a refund/reimbursement credit to the debit expense it offsets (full-access key). Partial and split links are allowed: one credit can offset several debits, and a debit can absorb several credits.

### Request

```bash
curl -s -X POST "https://budgethq.andrewallkin.com/api/external/transaction-links" \
  -H "Authorization: Bearer bhq_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"debit_transaction_id": 1234, "credit_transaction_id": 456, "amount": 300.0}'
```

### Body

| Field | Required | Description |
|-------|----------|-------------|
| `debit_transaction_id` | Yes | The expense being offset (must be a `DEBIT`) |
| `credit_transaction_id` | Yes | The refund/reimbursement (must be a `CREDIT` categorised `refund` or `reimbursements`) |
| `amount` | No | Link amount. Defaults to whatever still fits on both sides: `min(credit remaining, debit remaining)` |

### Response

```json
{
  "link_id": 789,
  "debit_transaction_id": 1234,
  "credit_transaction_id": 456,
  "amount": 300.0
}
```

### Notes

- **Duplicate pair → `409` with `existing_link_id`.** If the same credit→debit pair is already linked you get:

  ```json
  {
    "detail": {
      "detail": "This credit is already linked to this debit",
      "existing_link_id": 789
    }
  }
  ```

  This is **safe to retry**: if a create request times out, do not assume failure — retry it. A second attempt either creates the link or returns `409` + `existing_link_id`, never a duplicate. Inspect the pair afterwards via `GET /transactions/{id}` (`has_links` / `linked_credits` / `linked_debits`).
- Requesting more than the unallocated credit or debit remaining → `400`.
- Linking reduces the debit's `effective_amount` and its category's actual spending in `/budget/comparison`.

---

## `DELETE /transaction-links/{link_id}`

Unlink a refund link (full-access key).

### Request

```bash
curl -s -X DELETE "https://budgethq.andrewallkin.com/api/external/transaction-links/789" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Response

`204 No Content` on success; `404` if the link id is not yours.

### Notes

- Unlinking restores the debit's full `effective_amount` and returns the amount to unlinked refund/reimbursement totals.
- The transactions themselves are untouched — only the link is removed.

---

## `POST /transactions/apply-rules`

Run your saved categorization rules over historical transactions (full-access key). **Always dry-run first.**

### Request

Dry run over a date window:

```bash
curl -s -X POST "https://budgethq.andrewallkin.com/api/external/transactions/apply-rules" \
  -H "Authorization: Bearer bhq_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from_date": "2026-10-14", "to_date": "2026-10-17", "dry_run": true}'
```

Then commit, scoped to one rule:

```bash
curl -s -X POST "https://budgethq.andrewallkin.com/api/external/transactions/apply-rules" \
  -H "Authorization: Bearer bhq_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rule_id": 12, "from_date": "2026-10-14", "to_date": "2026-10-17", "dry_run": false}'
```

### Body

| Field | Required | Description |
|-------|----------|-------------|
| `rule_id` | One of `rule_id` **or** a date range | Run only this rule (`404` if it is not yours) |
| `from_date` / `to_date` | One of `rule_id` **or** a date range | `YYYY-MM-DD`; `to_date` is inclusive. Omitting both and giving no `rule_id` → `400` |
| `dry_run` | No | Default `false`. `true` reports would-be changes without writing anything |

Without `rule_id`, **all active rules** run (highest priority first). Hidden rows are never touched.

### Response (dry run)

```json
{
  "matched": 3,
  "changed": 0,
  "skipped_user_corrected": [
    {"id": 1101, "description": "WOOLWORTHS SANDTON"}
  ],
  "changes": [
    {
      "id": 1207,
      "description": "REFUND 49290 DISCOVERY",
      "old_category": "uncategorized",
      "new_category": "refund"
    }
  ]
}
```

### Response (real run)

Same shape, with `changed` equal to the number of rows actually updated and `changes` emptied (the work is done). Each applied row gets `ai_category_confidence: 1.0`.

### Fields

| Field | Description |
|-------|-------------|
| `matched` | Transactions a rule would change |
| `changed` | Actually written (always `0` on a dry run) |
| `skipped_user_corrected` | `[{id, description}]` — rows you corrected by hand. **Never modified by rules** |
| `changes` | `[{id, description, old_category, new_category}]` — populated only on a dry run |

### Notes

- **Dry-run first, every time.** Review `changes` and `skipped_user_corrected`, then re-send with `dry_run: false`.
- Rules themselves are managed in the Banking UI — this endpoint only executes them; there is no rule CRUD over the API.
- Example: a CREDIT-only rule matching description `REFUND` applied to credits dated 14–17 Oct 2026 will catch `REFUND 49290 …` style credits — but not Discovery medical-aid refunds (see the DISC MEMB note below).

---

## Worked Grok examples

### "How much did I spend on eating out this month?"

1. `GET /budget/summary` — read `current_period.from_date`/`to_date` (the budget month is usually not the calendar month) and `income`.
2. `GET /budget/comparison` — find the `dining_takeaways` row and report `actual` against `budgeted` and `remaining` (negative = over).

```bash
KEY="bhq_YOUR_KEY"
BASE="https://budgethq.andrewallkin.com/api/external"

curl -s "$BASE/budget/summary" -H "Authorization: Bearer $KEY" | jq .
curl -s "$BASE/budget/comparison" -H "Authorization: Bearer $KEY" | jq '.rows[] | select(.category_key == "dining_takeaways")'
```

### "What's unclassified?"

Use the period dates from `/budget/summary` as the window:

```bash
curl -s "$BASE/transactions?category=uncategorized&from_date=2026-09-22&to_date=2026-10-21" \
  -H "Authorization: Bearer $KEY" | jq .
```

Offer to classify each row via `PATCH /transactions/{id}/category` (or batch via `PATCH /transactions/categories`).

### Refund workflow (the refund watcher)

```bash
# 1. Fetch unlinked refund credits (read-only key is enough to watch)
curl -s "$BASE/transactions?category=refund&from_date=2026-09-22" -H "Authorization: Bearer $KEY" | jq .

# 2. Pick a credit (e.g. R492.90 Discovery refund, id 456) and get candidates
curl -s "$BASE/transactions/link-candidates?credit_id=456" -H "Authorization: Bearer $KEY" | jq .

# 3. Link the best candidate to the R655 original debit (full-access key)
curl -s -X POST "$BASE/transaction-links" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"debit_transaction_id": 1234, "credit_transaction_id": 456, "amount": 492.90}' | jq .
```

- On a timeout, **retry step 3** — a duplicate pair returns `409` with `existing_link_id` instead of creating a second link.
- Do the same for `?category=reimbursements` credits (expense claims, friends paying you back).

### Bulk classification

```bash
curl -s -X PATCH "$BASE/transactions/categories" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"updates": [
        {"id": 1234, "category": "health_wellness"},
        {"id": 1235, "category": "transport"},
        {"id": 9999, "category": "groceries"}
      ]}' | jq .
```

Check `results[]`: `status: "ok"` rows are done; `status: "error"` rows failed (e.g. `Transaction not found`) — report them individually, do not assume the whole batch failed or succeeded.

### Rules: dry-run first, and the DISC MEMB gotcha

- A typical user rule is **CREDIT-only, description contains `REFUND`** → `refund`. It matches descriptions like `REFUND 49290 DISCOVERY`.
- **`DISC MEMB` descriptions (Discovery medical aid) do not contain the word `REFUND`** — that rule will never match them. A separate `reimbursements` rule for `DISC MEMB` credits is the user's to create in the Banking UI (rules are not creatable over this API). Say so when you spot unlinked `DISC MEMB` credits.
- Bot convention: always `POST /transactions/apply-rules` with `dry_run: true`, show the user the `changes` and `skipped_user_corrected` lists, then apply with `dry_run: false` on confirmation.

Example Grok prompt context:

```
You are my Private Banker. Use the BudgetHQ external API at
https://budgethq.andrewallkin.com/api/external with my read-only key for
reading (summary, comparison, transactions, link-candidates) and my
full-access key only when I explicitly ask to classify, hide, link, or
apply rules. Never delete anything — hide instead. Dry-run apply-rules
before applying. Remember DISC MEMB credits need a reimbursements rule;
the REFUND rule will not catch them.
```

---

## Hide, not delete

The external API has **no delete endpoint for transactions** — a bot cannot remove your transaction history, by design.

- Hiding (`PATCH /transactions/{id}/hidden` with `hidden: true`) marks the row hidden.
- **Hidden rows survive every Investec sync.** The sync only inserts newly-seen transactions and never re-creates or cleans up existing rows, so a hidden row stays hidden until you unhide it.
- Hidden rows are excluded from listings, Budget Analysis, and `/budget/comparison` actuals unless `include_hidden=true` is passed.
- Unhide via `PATCH /transactions/{id}/hidden` with `hidden: false`, or the **Show hidden** toggle in the Banking transactions list.

---

## Category reference

`GET /categories` is **authoritative** — the table below is a convenience snapshot (slug, label, one-line description).

| Slug | Label | Description |
|------|-------|-------------|
| `salary` | Salary | Regular salary, wages, employer payments |
| `side_income` | Side Income | Freelance income, consulting fees, side jobs |
| `investment_income` | Investment Income | Dividends, interest received, rental income |
| `reimbursements` | Reimbursements | Travel per diems, expense claims, friends paying you back for costs you fronted |
| `other_income` | Other Income | Gifts received, bonuses, miscellaneous windfall credits |
| `groceries` | Groceries | Food and drink purchased for home — supermarkets, butchers, delis, fresh produce stores |
| `household_home` | Household & Home | Recurring home costs — electricity, cleaning services, garden supplies, homeware (infrequent repairs → `irregular`) |
| `dining_takeaways` | Dining & Takeaways | Food or drink consumed out of home — restaurants, coffee shops, takeaways, Uber Eats, bar tabs |
| `shopping_clothing` | Shopping & Clothing | Retail purchases for personal use — clothing, accessories, homeware décor, online shopping (Takealot, Temu) |
| `travel_accommodation` | Travel & Accommodation | Trip-related costs — Airbnb, hotels, travel bookings outside daily commuting |
| `entertainment` | Entertainment | Events and leisure — concert tickets, Webtickets, sports events, social outings (gifts → `irregular`) |
| `health_wellness` | Health & Wellness | Physical health and body maintenance — physio, pharmacy, doctor visits, personal care products |
| `bills` | Bills | Fixed essential obligations — levies, rates, insurance premiums, medical aid, bank charges |
| `subscriptions` | Subscriptions | Monthly digital and membership services — streaming, phone contracts, gym, software (yearly renewals → `irregular`) |
| `transport` | Transport | Getting around — fuel, Uber, parking, tolls (servicing, tyres, licence discs → `irregular`) |
| `savings` | Savings | Money put to work — TFSA, retirement annuity, unit trusts, investment contributions |
| `loan_repayment` | Loan Repayment | Debt servicing — bond repayments, personal loans, vehicle finance instalments |
| `irregular` | Irregular | Necessary costs without a monthly pattern — vehicle maintenance, yearly renewals, gifts (assign these yourself; new transactions stay uncategorized until you do) |
| `refund` | Refund | Merchant refunds, cashbacks, money back from retailers |
| `transfers` | Transfers | Money movements between your own accounts |
| `uncategorized` | Uncategorized | Not yet categorized |

---

## What is not included

The API is deliberately scoped:

- **No external delete** — the API cannot delete transactions (hide, not delete) or links to transactions. `DELETE` exists only for refund links.
- **No budget writes** — budget income and line items are read-only here; edit them in the UI.
- **No rule CRUD** — `apply-rules` only executes existing rules; create/edit rules in the Banking UI.
- **No pending ingestion** — the API reads what the scheduled Investec sync has already stored; it cannot trigger a sync or ingest new transactions.
- **Manual bank accounts have no transactions** — they are balance-only, so only Investec-linked accounts produce rows here.
- **No pagination guarantees beyond `limit`/`offset`** — no cursors or next-page links; paginate over `from_date`/`to_date` windows.
- No CSV/PDF export, no account management (connect/disconnect), no multi-user access — data is scoped to the key's owner.

---

## Related Settings

| Setting | Effect on API |
|---------|----------------|
| Full-access API key (shown under **Full-access API key** in Settings) | Required for all write endpoints; also works on every GET |
| Read-only API key | GET endpoints only; writes return `403` |
| Categorization rules (Banking) | What `apply-rules` executes — including the CREDIT-only `REFUND` rule and the separate `reimbursements` rule for `DISC MEMB` credits |
| Show hidden toggle (Banking transactions list) | Unhide rows hidden via the API |

Key management UI: **Settings → API key cards** (generate / regenerate / revoke; each key value is shown once). The same two keys also work on the [External Investments API](external-investments-api.md).
