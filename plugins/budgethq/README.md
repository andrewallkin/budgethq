# BudgetHQ Agent Plugin

Combined MCP execution server and procedural skills for safe personal banking workflows.

## Architecture
- MCP tools: data access and execution.
- Skills: procedural workflow guidance.
- Shared references: policies and account identifiers.

## Skills
- `banking-transfers/SKILL.md`
- `banking-payments/SKILL.md`
- `recurring-costs/SKILL.md`
- `monthly-financial-setup/SKILL.md`
- `month-end-funding-transfer/SKILL.md`
- `banking-verification/SKILL.md`

Shared reference material is in `skills/shared/references/`.

## Install
Install the BudgetHQ plugin once in ChatGPT. That install includes the skills and the connection to the remote MCP server at `https://budgethq.andrewallkin.com/mcp`. Nothing is uploaded at install time. Docker keeps serving the tools. ChatGPT keeps the skill text with the plugin. Connecting to the MCP URL on its own does not load these skills, because the server exposes tools, not the plugin package.

## Safety
No banking movement should be executed without user alignment on the exact movement and the separate required Telegram approval.
