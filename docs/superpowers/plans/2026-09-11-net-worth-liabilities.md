# Home Net Worth and Visible Liabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hiding loan accounts behind “Excludes N loans”; keep Cash liquid-only; show Liabilities; show Net worth on Home as Cash + Invested − Liabilities.

**Architecture:** Keep cash/loan in localStorage via `getAccountKind`. Add `summarizeAccountBalances(investecAccounts, manualAccounts, getKind)` in `frontend/src/utils/accountBalances.js`. Home, Banking Overview, and Accounts consume that helper only for totals. No backend changes.

**Tech Stack:** React 18, Vite, existing paper UI tokens, Node `node:test` for frontend unit tests.

## Global Constraints

- Cash never includes loan balances.
- No backend, schema, or API changes.
- Home is the only net-worth surface. Do not change Investments landing.
- Liability amount owed is `Math.abs(balance)` per loan.
- `investedForSum` is `0` when invested total is missing; Invested row still shows “Not set”.
- Paper tokens only: `--paper-brick` for liabilities and negative net worth.
- Do not run Docker, npm, pytest, or local servers unless the user asks (repository rule). Tests are written; execution is skipped unless asked.
- Follow `docs/ui.md`. Headings stay sequential (`h1` Home, `h2` Net worth).

## File structure

| File | Role |
|------|------|
| `frontend/src/utils/accountBalances.js` | Split cash vs loans; totals |
| `frontend/src/utils/accountBalances.test.js` | Unit tests with stub `getKind` |
| `frontend/src/pages/HomeOverview.jsx` | Net worth stack |
| `frontend/src/pages/InvestecLanding.jsx` | Total cash + Liabilities when loans exist |
| `frontend/src/pages/AccountsDashboard.jsx` | Total cash + Liabilities cards; drop footnotes |

---

### Task 1: Shared helper

**Files:**
- Create: `frontend/src/utils/accountBalances.js`
- Create: `frontend/src/utils/accountBalances.test.js`

**Interfaces:**
- Consumes: `getAccountKind(source, account)` from `frontend/src/utils/accountLocalMeta.js` as the default third argument
- Produces: `summarizeAccountBalances(investecAccounts = [], manualAccounts = [], getKind = getAccountKind)` returning `{ cashAccounts, loanAccounts, cashTotal, liabilityTotal, loanCount }`

Each account in `cashAccounts` / `loanAccounts`:

```js
{ id: string, source: 'investec' | 'manual', name: string, value: number }
```

- Investec included when `account.is_active !== false`. Manual: all rows.
- Investec name: `reference_name || account_name || product_name || 'Investec'`
- Manual name: `name || 'Account'`
- Cash `value`: stored balance (`current_balance` / `balance`), missing → `0`
- Loan `value`: `Math.abs(stored)`
- Order: Investec (value desc) then manual (value desc) within each list
- `cashTotal` / `liabilityTotal`: sums of those `value`s
- `loanCount`: `loanAccounts.length`
- Empty / non-array inputs → empty lists and `0` totals; do not throw

- [ ] **Step 1: Write tests** in `frontend/src/utils/accountBalances.test.js` covering mix, negative loan, inactive Investec excluded, all cash, all loans, empty, stub `getKind` override vs name that would infer loan.

- [ ] **Step 2: Implement** `summarizeAccountBalances` in `frontend/src/utils/accountBalances.js`.

- [ ] **Step 3: Commit** helper + tests.

---

### Task 2: Home net worth stack

**Files:**
- Modify: `frontend/src/pages/HomeOverview.jsx`

**Interfaces:**
- Consumes: `summarizeAccountBalances`
- Produces: `netWorth = cashTotal + (typeof invested === 'number' ? invested : 0) - liabilityTotal`

- [ ] **Step 1:** Replace local `getAccountKind` filtering with `summarizeAccountBalances(investecAccounts, manualAccounts)`. Store `cashTotal`, `liabilityTotal`, `loanCount`, cash `items`, `loanItems`. Drop “Excludes N loans”.

- [ ] **Step 2:** Rename Holdings → **Net worth**. Headline `text-3xl` + `paperMoney` + `paperMoneyTone(netWorth)` inside `BlurredValue`. Then Cash (hint `N accounts` when cash count > 0), Invested (unchanged, “Not set” when missing), Liabilities always (brick total, hint `N loans` when `loanCount > 0`, nested brick lines; R0 and no nested lines when none). Leave the top “Cash and investments” tile as assets (cash + invested); do not restyle Investments.

- [ ] **Step 3: Commit** Home changes.

---

### Task 3: Banking Overview

**Files:**
- Modify: `frontend/src/pages/InvestecLanding.jsx`

- [ ] **Step 1:** Use `summarizeAccountBalances`. `totalCash` = `cashTotal`. Keep account count as active Investec + all manual (includes loans). Remove exclude copy. When `loanCount > 0`, show **Liabilities** next to Total cash in brick with `formatCurrency(liabilityTotal)`. When zero loans, omit that line.

- [ ] **Step 2: Commit**

---

### Task 4: Accounts

**Files:**
- Modify: `frontend/src/pages/AccountsDashboard.jsx`

- [ ] **Step 1:** `summarizeAccountBalances(accounts, manualAccounts)` for summary cards (helper filters inactive Investec). Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`: **Total cash**, **Liabilities** (always, brick, including R0), **Accounts**, **Last synced**. Remove “Excludes N loans” and “Not in total balance”. Keep mixed lists, Loan badge, brick balances (`formatCurrency(Math.abs(balance))` for loans), Cash/Loan toggle + `bumpMeta`.

- [ ] **Step 2: Commit**

---

## Spec coverage

| Spec | Task |
|------|------|
| Shared helper + tests | 1 |
| Home wealth stack | 2 |
| Banking strip | 3 |
| Accounts cards + copy | 4 |
| No backend / no Investments | all (out of scope) |
| Net worth formula / abs loans | 1–2 |
