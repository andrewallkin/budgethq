# BudgetHQ Skills

This folder is the ChatGPT plugin shown as BudgetHQ Skills. It holds the banking workflow instructions. It does not install the MCP server. The server runs on the VPS from `backend/app/mcp/` and is added in ChatGPT as its own plugin. ChatGPT does not read this Git repository. Installing or updating the skills means zipping this folder and uploading that archive.

## What is in the package

- `plugin.json` shows the plugin as BudgetHQ Skills and sets `requires_local_executor` to false so ChatGPT does not mark these skills Desktop only. The package id stays `budgethq`.
- `skills/` holds the workflow instructions ChatGPT follows. Each skill's `agents/openai.yaml` points at the separately installed MCP server named `budgethq`.

Skills:

- `budgethq-banking` routes a request to the right workflow.
- `banking-transfers` moves money between the user's own Investec accounts.
- `banking-payments` pays an existing Investec beneficiary.
- `banking-verification` checks movement status.
- `recurring-costs` pays cleaning, Watchprop, rates, or extra vehicle finance.
- `monthly-financial-setup` sets up the monthly period.
- `month-end-funding-transfer` funds Daily for the next month's debit orders.

Each skill keeps its rules in its own `references/` directory. ChatGPT loads those files from that skill directory.

## Install or update

1. From `plugins/budgethq`, zip the folder so `plugin.json` and `skills/` are at the top of the archive. Do not include an MCP manifest, and do not wrap the files in an extra `plugins/budgethq/` directory.
2. In ChatGPT, open Plugins and choose New Plugin.
3. Drop the `.zip` (`.tar.gz` and `.tgz` are also accepted) and choose Add plugin.
4. Install the MCP server separately with Add custom MCP server. Name it `budgethq`. The server URL is `https://budgethq.andrewallkin.com/mcp`. Choose OAuth. Be signed in to BudgetHQ in that browser, then choose Allow. The scope is `budget:write`.

The skills call that server by the name `budgethq`. Each `agents/openai.yaml` contains:

```yaml
dependencies:
  tools:
    - type: "mcp"
      value: "budgethq"
      transport: "streamable_http"
      url: "https://budgethq.andrewallkin.com/mcp"
```

Upload a new archive whenever a skill or `plugin.json` changes. Deploying the VPS updates the running tools and does not update the skill text ChatGPT already stored. Sign in to the MCP server again if that connection is removed or the token is cleared.

A skill tells ChatGPT which tool to call, such as `create_investec_transfer`. ChatGPT sends that call to the installed server. The server queues the movement and requires Telegram approval. Chat approval does not move the money.

This package is version `1.0.2`. Remove an older BudgetHQ plugin that still bundles the MCP server before adding this zip.

## Safety

No banking movement should be executed without user alignment on the exact movement and the separate required Telegram approval.
