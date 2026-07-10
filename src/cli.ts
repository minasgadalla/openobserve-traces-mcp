#!/usr/bin/env node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const SHUTDOWN_TIMEOUT_MS = 3_000;

async function closeWithTimeout(
  label: string,
  close: () => Promise<void>,
): Promise<void> {
  try {
    await Promise.race([
      close(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(`${label} timed out after ${SHUTDOWN_TIMEOUT_MS}ms`),
            ),
          SHUTDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    console.error(
      `${label} failed:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function shutdown(server: McpServer, signal: string): Promise<void> {
  console.error(`openobserve-traces-mcp shutting down (${signal})`);
  await closeWithTimeout("server.close()", () => server.close());
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
    void shutdown(server, signal).catch((err) => {
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
