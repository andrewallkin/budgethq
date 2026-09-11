# External Investments API

Read-only HTTP API for external tools (for example Grok routines) to fetch your BudgetHQ investment sleeves without using the web UI session.

Both endpoints return JSON and use the same authentication. They expose **your** data only — scoped to the user who owns the API key.

---

## Authentication

### Create an API key

1. Log in to BudgetHQ.
2. Open **Settings**.
3. Under **External API key**, click **Generate Key**.
4. Copy the key immediately. It is shown once and cannot be retrieved later.

Keys look like `bhq_…` (long random string). Store them in your integration’s secrets — not in source control.

To rotate a key, use **Regenerate Key** in Settings. The old key stops working immediately.

### Send the key on every request

```http
Authorization: Bearer bhq_YOUR_KEY_HERE
```

- Only keys starting with `bhq_` are accepted.
- JWT login tokens are **not** accepted on these routes.

### Errors

| Status | Meaning |
|--------|---------|
| `401 Unauthorized` | Missing header, invalid key, or revoked key |
| `200 OK` | Success |

---

## Base URL

Replace `<your-domain>` with your deployment host:

```
https://<your-domain>/api/external/investments
```

**In-app documentation:** Settings → Investment API Key → **View API docs**, or open [`/api/external/investments/docs`](/api/external/investments/docs) (markdown, no auth required).

Local development (if the backend is exposed on port 8000):

```
http://localhost:8000/api/external/investments
```

---

## Endpoints overview

| Endpoint | Purpose |
|----------|---------|
| `GET /summary` | Sleeve-level totals — which bucket moved |
| `GET /composition` | Holdings, cashflows, and FX — why it moved |

Use **summary** for a quick portfolio snapshot. Use **composition** when you need tickers, weights, contribution vs market context, or FX rates.

---

## `GET /summary`

Account-level totals across all investment sleeves.

### Request

```bash
curl -s "https://<your-domain>/api/external/investments/summary" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

No query parameters.

### Response

```json
{
  "as_of": "2026-09-02T12:00:00+00:00",
  "base_currency": "ZAR",
  "total_value_base": 1250000.0,
  "accounts": [
    {
      "name": "TFSA",
      "slug": "tfsa",
      "currency": "ZAR",
      "value": 450000.0,
      "value_base": 450000.0,
      "is_retirement_annuity": false,
      "source": "sheets",
      "source_id": "google_sheets"
    },
    {
      "name": "US Account",
      "slug": "usd-account",
      "currency": "USD",
      "value": 12000.0,
      "value_base": 216000.0,
      "is_retirement_annuity": false,
      "source": "sheets",
      "source_id": "google_sheets"
    },
    {
      "name": "Sygnia RA",
      "slug": "sygnia_playwright-123456",
      "currency": "ZAR",
      "value": 584000.0,
      "value_base": 584000.0,
      "is_retirement_annuity": true,
      "source": "playwright",
      "source_id": "sygnia_playwright",
      "product_type": "ra"
    }
  ],
  "fx": {
    "configured": true,
    "aggregate_error": null
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `as_of` | Timestamp for the FX snapshot used for conversion (ISO 8601) |
| `base_currency` | Reporting currency for rolled-up totals (default `ZAR`) |
| `total_value_base` | Sum of all sleeves in `base_currency` |
| `accounts` | One entry per sleeve |
| `accounts[].name` | Display name |
| `accounts[].slug` | Stable identifier (`tfsa`, `usd-account`, `sygnia_playwright-{account_code}`, etc.) |
| `accounts[].currency` | Native currency of the sleeve |
| `accounts[].value` | Total value in native currency |
| `accounts[].value_base` | Total value converted to `base_currency` |
| `accounts[].is_retirement_annuity` | `true` when `product_type` is `ra` |
| `accounts[].source` | `"sheets"` or `"playwright"` |
| `accounts[].source_id` | Adapter id (`google_sheets`, `sygnia_playwright`, …) |
| `accounts[].product_type` | Playwright only: `ra`, `tfsa`, or `offshore` |
| `fx.configured` | Whether FX rates are set up in Google Sheets |
| `fx.aggregate_error` | `null` if all conversions succeeded; otherwise a short error string |

### Notes

- **Playwright inclusion:** Every connected Playwright account is listed, for every adapter (Sygnia today; other brokers use the same `source: "playwright"` with a different `source_id`).
- **FX on summary:** This endpoint reports whether FX is configured and if aggregation failed. It does **not** include individual FX rates. Use `/composition` for rates.
- **Sheets sleeves:** Values are live holdings (shares × latest synced Google Sheets prices).
- **Playwright:** Value is the same figure as the Investments hub card (latest scrape / history).

---

## `GET /composition`

Per-sleeve holdings, cashflows, and FX rates. Designed for attribution: separating price moves, FX, and new money.

### Request

```bash
curl -s "https://<your-domain>/api/external/investments/composition" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

With an explicit anchor for cashflow deltas (recommended for daily routines):

```bash
curl -s "https://<your-domain>/api/external/investments/composition?since=2026-09-01T08:00:00+02:00" \
  -H "Authorization: Bearer bhq_YOUR_KEY"
```

### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `since` | No | ISO 8601 datetime for cashflow deltas (for example your last 08:00 note). If omitted, deltas use the **previous daily end-of-day** snapshot (23:59:59 SAST on the latest `DailyPortfolioSummary` date before today). |

Accepted `since` formats:

- `2026-09-01T08:00:00+02:00` (timezone-aware)
- `2026-09-01T06:00:00Z` (UTC `Z` suffix)
- `2026-09-01T08:00:00` (naive — treated as SAST)

### Response (structure)

```json
{
  "as_of": "2026-09-02T14:00:00",
  "base_currency": "ZAR",
  "since": "2026-09-01T08:00:00",
  "since_source": "parameter",
  "fx": {
    "base_currency": "ZAR",
    "rates": {
      "USD": 18.0,
      "EUR": 19.5,
      "GBP": 22.1
    },
    "as_of": "2026-09-02T12:00:00+00:00",
    "configured": true
  },
  "accounts": [ ... ]
}
```

### Top-level fields

| Field | Description |
|-------|-------------|
| `as_of` | Latest freshness timestamp across accounts (typically latest holding price sync) |
| `base_currency` | ZAR rollup currency |
| `since` | Resolved anchor datetime used for all `*_since` cashflow fields |
| `since_source` | `"parameter"` if you passed `since=`, otherwise `"previous_daily_eod"` |
| `fx.rates` | FX multipliers to convert foreign sleeve values into `base_currency` |
| `fx.as_of` | When FX rates were last read from Google Sheets |

---

## Accounts in `/composition`

Every account includes these fields:

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `slug` | Stable identifier |
| `currency` | Native currency |
| `source` | `"sheets"` or `"playwright"` |
| `source_id` | Adapter id (`google_sheets`, `sygnia_playwright`, …) |
| `composition_available` | `true` if holdings are exposed |
| `value` | Total in native currency |
| `value_base` | Total in `base_currency` |
| `as_of` | Freshness for this sleeve |
| `is_retirement_annuity` | `true` when the account is an RA |
| `product_type` | Playwright only |
| `cashflows` | Sleeve-specific — see below |

---

### Sheets sleeves (`source: "sheets"`)

Google Sheets–backed portfolios: TFSA (default) and any user-created sleeves (USD, EUR, GBP, etc.).

`composition_available` is always `true`. Each account includes a `holdings` array.

#### Holdings fields

| Field | Description |
|-------|-------------|
| `ticker` | Sheet ticker (e.g. `JSE:STX40`, `NASDAQ:VTI`, `NASDAQ:NVDA`) |
| `name` | Instrument name |
| `instrument_type` | `"etf"` or `"stock"` |
| `region` | Region label from BudgetHQ |
| `shares` | Position size (fractional allowed) |
| `price` | Latest synced price in sleeve currency |
| `price_updated_at` | When that price was last updated (ISO 8601) |
| `value` | `shares × price` in native currency |
| `value_base` | `value` converted to ZAR via `fx.rates` |
| `weight_actual` | Holding weight as % of sleeve total |
| `cost_basis` | Total amount paid for current shares |
| `unrealized_gain` | `value − cost_basis` (null if cost basis is zero) |

**TFSA only** — each holding also includes:

| Field | Description |
|-------|-------------|
| `weight_target` | Target allocation % |
| `weight_drift` | `weight_actual − weight_target` |

Non-TFSA sheets sleeves do not include `weight_target` or `weight_drift`.

#### Cashflows — TFSA (`slug: "tfsa"`)

| Field | Description |
|-------|-------------|
| `deposits_this_fy` | TFSA deposits in the current SA financial year |
| `remaining_fy_allowance` | Annual cap minus `deposits_this_fy` |
| `deposits_since` | Deposits on or after `since` date |

#### Cashflows — foreign sleeves (non-TFSA sheets)

| Field | Description |
|-------|-------------|
| `buys_since` | Sum of BUY transaction values after `since` |
| `sells_since` | Sum of SELL transaction values after `since` |
| `net_invested_since` | `buys_since − sells_since` |

Foreign sleeves use recorded ETF buy/sell transactions, not TFSA-style deposit tracking.

---

### Playwright sleeves (`source: "playwright"`)

Connected broker accounts synced by Playwright. `source_id` names the adapter (`sygnia_playwright` today). **Every connected Playwright account is included**, not only Sygnia and not only RA.

`composition_available` is `true`. Holdings are fund/instrument rows from that adapter.

#### Holdings fields (Playwright)

| Field | Description |
|-------|-------------|
| `ticker` | Provider instrument code |
| `name` | Instrument name |
| `shares` | Units |
| `price` | Unit price in sleeve currency |
| `value` | Market value in native currency |
| `value_base` | Same as `value` for ZAR sleeves |
| `weight_actual` | Holding weight as % of sleeve total |

#### Cashflows — Playwright

| Field | Description |
|-------|-------------|
| `contributions_this_fy` | Logged contributions in the current SA financial year |
| `contributions_since` | Contributions on or after `since` date |
| `cumulative_contributions` | All-time sum of logged contributions |

Subtract `contributions_since` from the value change before treating a move as market growth.

---

## How `since` affects cashflows

| Sleeve | Field | Comparison rule |
|--------|-------|-----------------|
| TFSA (sheets) | `deposits_since` | Deposit date `>= since.date()` |
| Playwright | `contributions_since` | Contribution date `>= since.date()` |
| Foreign sheets | `buys_since`, `sells_since` | Transaction datetime `> since` |

When `since` is omitted, the anchor is end of the previous daily EOD day (from portfolio history), and `since_source` is `"previous_daily_eod"`.

---

## Recommended routine (e.g. 08:00 note)

1. **Call `/summary`** — see which sleeves moved and the ZAR total.
2. **Call `/composition?since=<last_note_time>`** — pass the datetime of your previous note so cashflow deltas align.
3. **Rank movers yourself** using `holdings[].value_base`, `weight_actual`, and price changes between notes (store the prior composition response if you need a baseline).
4. **Split FX vs price** on USD sleeves using `fx.rates.USD` and native vs ZAR values.
5. **Subtract cashflows** before calling a move “the market”:
   - Sheets TFSA: check `deposits_since`
   - Playwright: check `contributions_since`
   - Foreign sheets: check `net_invested_since`
6. **News lookup** — for tickers where `composition_available` is `true` (Sheets and Playwright).

Example Grok prompt context:

```
At 08:00 SAST, call summary then composition with since= yesterday's 08:00 ISO time.
Report sleeve moves in ZAR. For each foreign Sheets sleeve, state whether the move was
FX, new buys, or holding price. For Playwright sleeves, use holdings and contributions_since.
```

---

## What is not included

These endpoints are intentionally read-only and scoped:

- No write operations
- No full transaction history export
- No hourly/daily history series
- No pre-computed attribution or “top movers” ranking
- No ISIN fields
- No cash balance line items
- No withdrawal tracking
- No legacy manual RA sleeve (`RAValueHistory`). Connected Playwright RA accounts are included instead.

---

## Sleeve reference

| Sleeve | `slug` | `source` | `source_id` | Holdings | Cashflow model |
|--------|--------|----------|-------------|----------|----------------|
| TFSA | `tfsa` | `sheets` | `google_sheets` | Yes + targets | FY deposits |
| USD / EUR / GBP | user-defined | `sheets` | `google_sheets` | Yes | Buy/sell since anchor |
| Playwright (any broker) | `{source_id}-{account_code}` | `playwright` | adapter id | Yes | FY + cumulative contributions |

---

## Example: full morning workflow

```bash
KEY="bhq_YOUR_KEY"
BASE="https://<your-domain>/api/external/investments"
SINCE="2026-09-01T08:00:00+02:00"

# Step 1 — totals
curl -s "$BASE/summary" -H "Authorization: Bearer $KEY" | jq .

# Step 2 — composition with note anchor
curl -s "$BASE/composition?since=$SINCE" -H "Authorization: Bearer $KEY" | jq .
```

Persist `since` from each successful note call and pass it on the next run.

---

## Related Settings

| Setting | Effect on API |
|---------|----------------|
| External API key | Required for both endpoints |
| Google Sheets + FX tab | Required for live prices and `fx.rates` on foreign sleeves |
| Connected Playwright accounts | Each connected adapter account appears with `source: "playwright"` |

Key management UI: **Settings → External API key**.
