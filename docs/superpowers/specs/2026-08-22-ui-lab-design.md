# UI Lab mockups — modern fintech look

Date: 2026-08-22

## Goal

Judge a more modern, techy, finance look for BudgetHQ without changing any live page behavior. Ship three static mockup pages that restyle type and chrome (sidebar, cards, buttons, lists/tables) while keeping the same page structure as the real screens.

This is a visual experiment only. Production pages, APIs, and providers stay as they are.

## Locked decisions

- Visual direction: modern fintech (Mercury / Linear / Stripe) — whitespace, clear hierarchy, numbers as the hero.
- Scope of restyle: type plus chrome. Same layouts, not new information architecture.
- Screens: Home overview, Budget dashboard, Investments 2.0 landing.
- Typefaces: Geist (UI) and Geist Mono (amounts and compact codes).
- Themes: light and dark equally, using the existing app theme toggle.
- Access: a “UI Lab” item at the bottom of the main sidebar.
- Implementation: isolated page copies (approach 1), plus a thin CSS wrapper so fonts apply only in the lab.

## Non-goals

- Do not restyle live routes (`/`, `/budget`, `/investments-v2`, login, settings, Investec, RA, etc.).
- Do not wire mockups to APIs, auth-specific data, or Investments 2.0 providers.
- Do not add Storybook, a second Vite app, or a shared production design-token system.
- Do not add empty-state, error, or loading variants beyond what the three happy-path screens need to look complete.
- Do not change budgeting, sync, or portfolio behavior.

## Architecture

The existing `App` shell stays the router and layout owner.

When `location.pathname` starts with `/ui-lab`, the shell root (`flex h-screen` wrapper, including desktop sidebar and mobile header) gets a `ui-lab` class. Live routes do not get that class, so Geist and lab chrome rules never apply to production pages.

New files live under `frontend/src/pages/ui-lab/`:

| File | Role |
| --- | --- |
| `UiLabHome.jsx` | Static clone of Home overview structure |
| `UiLabBudget.jsx` | Static clone of Budget dashboard structure |
| `UiLabInvestments.jsx` | Static clone of Investments 2.0 landing |
| `uiLabData.js` | Hard-coded dummy figures and list rows |

Routes in `App.jsx`:

- `/ui-lab` → redirect to `/ui-lab/home`
- `/ui-lab/home`
- `/ui-lab/budget`
- `/ui-lab/investments`

Nav: after Settings, add `{ path: '/ui-lab/home', label: 'UI Lab', icon: Sparkles }`. Active state is `pathname.startsWith('/ui-lab')`.

Fonts load via CDN `<link>` tags in `frontend/index.html` (Geist and Geist Mono). Application of those families is scoped:

```css
.ui-lab {
  font-family: "Geist", ui-sans-serif, system-ui, sans-serif;
}
.ui-lab .tabular-nums,
.ui-lab .font-mono {
  font-family: "Geist Mono", ui-monospace, monospace;
}
```

Live pages keep the current system stack.

## Visual system

Keep the existing color story. Do not introduce a new brand palette.

**Surfaces**

- Canvas: `gray-50` / `gray-900`
- Cards: `white` / `gray-800`
- Borders: `gray-200` / `gray-700` (hairline, not heavy shadows)
- Cards: `rounded-xl`, `shadow-sm` or no shadow, not large gradient marketing tiles

**Accents (unchanged meanings)**

- Nav / primary actions: blue-600
- Budget: blue tiles; pie Needs `#B91C1C`, Wants `#1D4ED8`, Savings `#15803D`, Unallocated `#B45309`
- Investments 2.0: teal-600 buttons and hover rings
- Emergency: amber
- Accounts: teal

**Type scale (lab only)**

| Role | Size / weight |
| --- | --- |
| Page eyebrow | `text-xs font-medium uppercase tracking-wider` muted |
| Page title | `text-2xl sm:text-3xl font-semibold tracking-tight` (not `text-4xl font-bold`) |
| Section title | `text-lg font-semibold tracking-tight` |
| Body / meta | `text-sm` muted |
| Hero amount | `text-3xl font-semibold tabular-nums` + Geist Mono |
| Inline / table amount | `text-sm font-medium tabular-nums` + Geist Mono |
| Account code | `text-xs font-mono` muted |

No emoji in the lab wordmark. Sidebar title is `BudgetHQ` in Geist semibold.

**Chrome when `.ui-lab` is on the shell**

- Sidebar and mobile header use Geist, `text-sm` nav labels, quieter hover (`gray-100` / `gray-700/60`).
- Active item: `bg-blue-50 dark:bg-blue-900/20 text-blue-600` plus a 2px left bar instead of heavier filled blocks.
- Icon buttons: `rounded-lg`, no extra chrome.
- Primary buttons: `text-sm font-medium rounded-lg px-4 py-2`. Feature pages keep their current accent (teal on Investments).
- Lists that are tables today become a compact row grid: name, category/cadence, amount aligned right in mono. Display-only; no add/edit/delete persistence.

**Home tiles**

Keep the four-tile grid and charts. Drop the thick gradient top bar if it fights the quieter chrome; a 1px accent edge or small icon chip is enough. Tile “links” go to other lab routes only (`/ui-lab/budget`, `/ui-lab/investments`), never to live pages.

## Screen contents

Dummy data is fixed South African–looking figures in `uiLabData.js`. Values are for visual weight only.

**Home (`/ui-lab/home`)**

Same structure as `HomeOverview`: page header, four metric tiles (Budget, Investments, Emergency, Accounts), Budget Split donut + legend, a portfolios / accounts secondary panel as on the live home. Numbers from dummy data. Charts use Recharts with static arrays. No `axios`, no `BlurredValue` wiring to auth (show values plainly).

**Budget (`/ui-lab/budget`)**

Same structure as `BudgetDashboard`: salary / net summary, overall budget pie, Needs / Wants / Savings tabs, category list, category pie. Tabs may keep local React state so you can click between lists. Category rows are read-only. Add / calculator / save controls may be visible as styled no-ops (`type="button"` with no handler, or `disabled`) so chrome can be judged. No autosave, no payslip fetch.

**Investments 2.0 (`/ui-lab/investments`)**

Same structure as `InvestmentsV2Landing`: title + “Add account”, T−1 sync info banner, total-across-accounts figure, 2–3 dummy Sygnia account cards (name, account code, type, sync badge, value, as-of date). Cards are not links to `/investments-v2/:id`. Add account does not open `CreateAccountWizard`. Show the populated grid, not the empty state.

## Data flow

There is no data flow. Pages import `uiLabData.js` and render. No `InvestmentsV2Provider`, no budget/payslip/emergency endpoints.

Allowed local UI state: budget tab selection, existing shell sidebar collapse and dark mode. Nothing is written to `localStorage` except what the shell already stores for theme and sidebar.

## Error handling

No network. Do not invent error banners. If a Recharts series is empty in dummy data, include enough dummy rows that charts always have values.

## Testing

Visual review in light and dark is the acceptance test. No new backend tests. No requirement to add frontend unit tests for static markup.

Do not run `npm` build/dev/lint to “verify” unless explicitly asked (repo rule).

## Constraints for implementers

- Touch `App.jsx` only for routes, the UI Lab nav item, active-path matching, and the `ui-lab` class on the shell.
- Touch `index.html` / `index.css` only to load fonts and scope `.ui-lab` rules.
- Do not edit live page components to “share” markup.
- Do not commit secrets or real account numbers; dummy codes like `SG-00-1234` are fine.

## Success criteria

- Live Home, Budget, and Investments 2.0 behave and look as they do today.
- UI Lab is reachable from the last sidebar item and from the three URLs above.
- All three mockups render in light and dark via the existing toggle.
- Type uses Geist / Geist Mono only inside `.ui-lab`.
- A reviewer can compare lab vs live side by side and decide whether to adopt the look later.
