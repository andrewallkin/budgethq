# BudgetHQ ChatGPT plugin

This folder is the ChatGPT plugin. It holds the banking skills and the address of the MCP server. The server itself runs on the VPS from `backend/app/mcp/`. ChatGPT does not read this Git repository. Installing or updating the plugin means zipping this folder and uploading that archive.

## What is in the package

- `plugin.json` names the plugin. `logo` and `composerIcon` both point at `assets/icon.png`. That file is the browser favicon, cropped to the tile, with the letter filled in so it stays visible on a light background.
- `skills/` holds the workflow instructions ChatGPT follows.
- `mcp.json` tells ChatGPT where the live tools are. It does not contain the server.

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

1. From `plugins/budgethq`, zip the folder so `plugin.json`, `mcp.json`, and `skills/` are at the top of the archive. Do not wrap them in an extra `plugins/budgethq/` directory.
2. In ChatGPT, open Plugins and choose New Plugin.
3. Drop the `.zip` (`.tar.gz` and `.tgz` are also accepted) and choose Add plugin.
4. Leave Add custom MCP server alone. That button connects tools only and does not install these skills.

`plugin.json` sets `requires_local_executor` to false. That tells ChatGPT this plugin runs on the web against the remote MCP server, instead of showing Desktop only. After changing that flag or the icon, upload the new archive as a new version of the existing plugin.

Upload a new archive whenever a skill, `plugin.json`, or `mcp.json` changes. Deploying the VPS updates the running tools and does not update the skill text ChatGPT already stored.

## How `mcp.json` connects to the server

`mcp.json` declares one remote server named `budgethq`:

```json
{
  "mcpServers": {
    "budgethq": {
      "type": "streamable-http",
      "url": "https://budgethq.andrewallkin.com/mcp",
      "extensions": {
        "com.openai": {
          "auth": {
            "type": "oauth",
            "client": { "mode": "dcr" },
            "baseScopes": ["budget:write"]
          }
        }
      }
    }
  }
}
```

`streamable-http` is the transport. The URL is the public MCP endpoint on the VPS. Docker serves that endpoint. The zip only records the URL. The `auth` block tells ChatGPT to start OAuth instead of treating the server's `401` as a failed connection. `dcr` means ChatGPT registers itself at the server's registration endpoint. The scope is `budget:write`.

After the archive is uploaded, open the Budgethq row on the plugin's MCP page and sign in once. Be signed in to BudgetHQ in that browser first, then choose Allow. ChatGPT keeps the token. Later chats reuse it. Sign in again if the connection is removed or the token is cleared.

A skill then tells ChatGPT which tool to call, such as `create_investec_transfer`. ChatGPT sends that call to the URL above. The server queues the movement and requires Telegram approval. Chat approval does not move the money.

## Package versions

- `1.0.3` fills and crops the site icon, and sets `brandColor` to `#1BA693`.
- `1.0.2` tells ChatGPT to sign in to the MCP server with OAuth. The scope is `budget:write`.
- `1.0.1` sets `requires_local_executor` to false so ChatGPT does not mark the plugin Desktop only.

Upload each version as a new zip. ChatGPT can keep the previous icon and the previous MCP sign-in settings when a new version is uploaded over an existing plugin. If the icon is still a blank page, or the MCP row still does not offer sign-in, remove the plugin and add it again from the new zip.

## Safety

No banking movement should be executed without user alignment on the exact movement and the separate required Telegram approval.
