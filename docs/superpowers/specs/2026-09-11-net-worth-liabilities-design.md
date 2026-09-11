# Home net worth and visible liabilities

**Date:** 2026-09-11  
**Status:** Draft — awaiting user review

## Goal

Stop hiding loan accounts behind “Excludes N loan(s)”. Cash stays liquid-only. Loans are first-class **liabilities**. Home shows a **net worth** headline that is Cash + Invested − Liabilities.

## Decisions (locked)

- Cash never includes loan balances.
- Loan vs cash remains the existing localStorage toggle. No backend, schema, or API changes.
- Home is the only net-worth surface. Investments landing stays invested-only.
- Banking Overview and Accounts drop the exclude footnote, keep cash totals cash-only, and surface a liabilities total.
- Home uses a wealth stack: card titled **Net worth**, headline figure, then Cash / Invested / Liabilities.
- Accounts keeps one combined list (Investec + manual as today). Add a Liabilities summary card. Drop “Not in total balance”.
- One shared frontend helper owns cash vs loan splitting so the three pages cannot drift.

## Scope

### In scope

- Shared summing helper used by Home, Banking Overview (`InvestecLanding`), and Accounts
- Home Holdings card → Net worth stack
- Banking Overview status strip: Total cash + Liabilities when there is at least one loan
- Accounts summary: rename the cash card, add Liabilities, remove exclude copy and per-loan “Not in total balance”
- Frontend unit tests for the helper
- Paper UI tokens only (`--paper-brick` for debt / negative net worth)

### Out of scope

- Backend routes, models, migrations, or persisting cash/loan server-side
- Investments landing or portfolio pages
- Emergency fund logic (still cash / marked emergency accounts only)
- Budget `loan_repayment` category
- Splitting Accounts into separate cash vs loan lists
- Cross-device sync of the loan toggle

## Architecture

Loan kind stays in `frontend/src/utils/accountLocalMeta.js` (`getAccountKind` / `setAccountKind`, key `budgethq.accountLocalMeta.v1`).

Add a sibling helper (e.g. `frontend/src/utils/accountBalances.js`) that takes active Investec accounts and manual accounts and returns a single shape:

| Field | Meaning |
|-------|---------|
| `cashAccounts` | Kind is not `loan`. Display name + balance for Home lines. |
| `loanAccounts` | Kind is `loan`. Same shape. |
| `cashTotal` | Sum of cash balances (signed as stored). |
| `liabilityTotal` | Sum of **amount owed**: `Math.abs(balance)` per loan. |
| `loanCount` | `loanAccounts.length` |

**Active Investec only:** `is_active !== false`, matching today’s filter. Manual accounts: all rows returned by the existing list endpoint.

Home, `InvestecLanding`, and `AccountsDashboard` **must** call this helper. They must not re-filter by `getAccountKind` for totals.

Net worth is computed only on Home and is not stored:

```
netWorth = cashTotal + investedForSum − liabilityTotal
```

`investedForSum` is `0` when the investments overview total is missing or not a number. The Invested **row** still shows “Not set” in that case.

## Home

Replace the Holdings card title with **Net worth**. Keep the Accounts and Investments links.

1. **Headline** — large tabular figure (`text-3xl` or similar, `paperMoney`, `paperMoneyTone(netWorth)`). Blurred like other money.
2. **Cash** — `cashTotal`. Hint: `N accounts` when there is at least one cash account; otherwise no exclude copy. Nested lines: cash accounts only, largest first per source as today (Investec block then manual, each sorted by value desc). Empty: “No bank accounts yet.”
3. **Invested** — unchanged source and nested portfolios. Missing total: label “Not set”, contribute `0` to net worth.
4. **Liabilities** — always shown. Total uses brick (`text-[var(--paper-brick)]`). Hint: `N loans` when `loanCount > 0`. Nested lines: each loan, brick amounts. When `loanCount === 0`, show **R0.00** and no nested lines (no extra empty-state sentence).

Do not render “Excludes N loans”.

## Banking Overview

Status strip keeps Connected, account **count** (cash + loans), last synced, **Total cash** (`cashTotal`).

When `loanCount > 0`, add **Liabilities** next to Total cash (brick, same currency format). When `loanCount === 0`, do not add a liabilities line (strip stays tight).

Never show “Excludes N loans”. Account count continues to include loans.

## Accounts

Summary cards (paper, same type scale):

| Card | Value |
|------|--------|
| Total cash | `cashTotal` (rename from “Total balance”) |
| Liabilities | `liabilityTotal`, brick. Always shown, including R0. |
| Accounts | Count of visible Investec + manual (includes loans) |
| Last synced | Unchanged |

Grid: four cards. On `sm` use two columns; on a wide breakpoint four across is fine. Do not squeeze four unreadable columns on a phone.

Lists stay mixed. Loan badge and brick balance stay. Remove “Not in total balance”. Cash/Loan toggle unchanged; after a toggle, re-read via the shared helper so summary cards update.

## Data rules

- **Cash total:** sum stored balances on cash accounts. Do not abs cash.
- **Liability total:** `Math.abs` each loan balance so a negative Investec figure still counts as owed. Display the formatted abs amount in brick (no extra minus if the stored value is already negative).
- **Net worth:** cash + invested-or-zero − liabilities. Can be negative.
- **Currency:** ZAR / existing `formatCurrency` / compact rules on Home. Invested row may still use `baseCurrency` from the investments payload; net worth headline uses the same base as Cash (ZAR in this product).
- **Blur:** all money figures stay behind `BlurredValue`.

## Error handling

- Helper is pure: empty arrays → zeros and empty lists. No throw on missing `current_balance` / `balance` (treat as 0).
- Page fetch failures stay as today (partial overview / error banners). Do not invent a new error path for kind metadata; corrupt localStorage already falls back in `readAccountLocalMeta`.

## Testing

Add `frontend/src/utils/accountBalances.test.js` (same `node:test` style as `payslipBudget.test.js`):

- Mix of Investec + manual cash and loans → correct cash total, liability total, counts
- Loan with negative stored balance → positive contribution to `liabilityTotal`
- Inactive Investec excluded
- All cash / all loans / empty
- Kind override vs inferred name, via an optional `getKind` argument that defaults to `getAccountKind` (tests pass a stub; no jsdom required)

No backend tests. Do not run the app locally unless asked.

## UI constraints

Follow `docs/ui.md`. No new colour tokens. No neon. Liabilities and negative net worth use `--paper-brick`. Do not restyle Investments.

## Non-goals recap

Investments page is **not** a net-worth page. The user-facing “exclude loans” copy lived on Home, Banking Overview, and Accounts — those three are the fix.
