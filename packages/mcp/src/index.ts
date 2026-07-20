#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { GastosClient } from './client.js'
import { tools } from './tools.js'

// Stdio MCP server that exposes the conlatuya.checkleaked.cc public API as tools. Configure
// with GASTOS_GUB_API_KEY (optional for reads, required with the `write` scope
// for account tools) and optional GASTOS_GUB_BASE_URL.
const client = new GastosClient()

const server = new Server(
  { name: 'gastos-gub', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find(t => t.name === req.params.name)
  if (!tool) {
    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] }
  }
  try {
    const result = await tool.run(client, (req.params.arguments ?? {}) as Record<string, any>)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
})

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout is the MCP channel — logs must go to stderr.
  console.error('gastos-gub MCP server running on stdio')
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
