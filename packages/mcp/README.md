# @gastos-gub/mcp

An [MCP](https://modelcontextprotocol.io) server for the **gastos.gub.uy** Uruguay
government-procurement API. It exposes tenders (llamados), contracts, suppliers,
buyers, analytics, anomalies and your account alerts as tools any MCP client
(Claude Desktop, etc.) can call.

## Setup

1. Get an API key at <https://gastos.gub.uy/app/api-keys>. A **read** key is
   enough for the data tools; the account tools (`list_my_watches`,
   `create_watch`, `list_saved_calls`, `get_calendar`) need a **write** key.
2. Build (or install once published):

   ```bash
   npm install
   npm run build
   ```

## Claude Desktop

Add to `claude_desktop_config.json` (macOS:
`~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "gastos-gub": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "GASTOS_GUB_API_KEY": "gk_live_your_key_here"
      }
    }
  }
}
```

Once published to npm you can instead use `npx -y @gastos-gub/mcp`.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `GASTOS_GUB_API_KEY` | — | Optional for reads (raises the rate limit); required with the `write` scope for account tools. |
| `GASTOS_GUB_BASE_URL` | `https://gastos.gub.uy` | Override for a self-hosted instance. |

## Tools

Read (any key or none): `search_tenders`, `get_tender`, `get_tender_summary`,
`get_tender_benchmarks`, `list_contracts`, `get_contract`, `get_supplier`,
`get_buyer`, `list_anomalies`, `get_provider_anomalies`,
`get_category_distribution`.

Account (write-scoped key): `list_my_watches`, `create_watch`,
`list_saved_calls`, `get_calendar`.

Every tool is a thin call to the documented REST API — see the full reference at
<https://gastos.gub.uy/docs>.
