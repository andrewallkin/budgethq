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

Each skill keeps its rules in its own `references/` directory. Skill files are loaded from that skill directory.

## Install
Install the BudgetHQ plugin once in ChatGPT. That install includes the skills and the connection to the remote MCP server at `https://budgethq.andrewallkin.com/mcp`. Docker keeps serving the tools. ChatGPT keeps the skill text with the plugin. OAuth is discovered from the server. The portable MCP schema has no auth fields, and an extra `extensions` block can cause the server entry to be rejected.

## Safety
No banking movement should be executed without user alignment on the exact movement and the separate required Telegram approval.
