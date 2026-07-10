#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function shutdown(
  server: McpServer,
  transport: StdioServerTransport,
  signal: string,
): Promise<void> {
  console.error(`openobserve-traces-mcp shutting down (${signal})`);
  try {
    await server.close();
  } catch (err) {
    console.error(
      "Server close error:",
      err instanceof Error ? err.message : String(err),
    );
  }
  try {
    await transport.close();
  } catch (err) {
    console.error(
      "Transport close error:",
      err instanceof Error ? err.message : String(err),
    );
  }
  process.exit(0);
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(
      err instanceof Error ? err.message : "Failed to load configuration",
    );
    process.exit(1);
  }

  const server = createServer(config);
  const transport = new StdioServerTransport();
  let shuttingDown = false;

  const handleSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void shutdown(server, transport, signal).catch((err) => {
      console.error("Shutdown error:", err);
      process.exit(1);
    });
  };

  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));

  await server.connect(transport);
  console.error("openobserve-traces-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
