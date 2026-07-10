import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./types.js";
import { TRACE_ID_RE, SPAN_ID_RE } from "./config.js";
import { OpenObserveClient } from "./openobserve-client.js";
import { resolveSpan } from "./span-resolver.js";
import { filterSpans, resolveTrace } from "./trace-resolver.js";

function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "openobserve-traces-mcp",
    version: "1.0.0",
  });

  const client = new OpenObserveClient(config);

  server.registerTool(
    "get_trace_summary",
    {
      description:
        "Start here when you have a trace_id. Returns error path, HTTP status, actor, and counts without loading every span.",
      inputSchema: z.object({
        trace_id: z
          .string()
          .regex(TRACE_ID_RE, "trace_id must be 32 hex characters"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ trace_id }) => {
      const bundle = await resolveTrace(client, config, trace_id, {
        includeRumLogs: false,
        redactMode: "summary",
      });
      return jsonContent({
        trace_id: bundle.trace_id,
        time: bundle.time,
        summary: bundle.summary,
        warnings: bundle.warnings,
      });
    },
  );

  server.registerTool(
    "get_span",
    {
      description:
        "Use when you only have a span_id. Resolves trace_id, returns the span and ancestor path to the root error.",
      inputSchema: z.object({
        span_id: z
          .string()
          .regex(SPAN_ID_RE, "span_id must be 16 hex characters"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ span_id }) => {
      const bundle = await resolveSpan(client, config, span_id);
      return jsonContent(bundle);
    },
  );

  server.registerTool(
    "get_trace_spans",
    {
      description:
        "Drill down after summary: filter = errors, http, db, or slow.",
      inputSchema: z.object({
        trace_id: z
          .string()
          .regex(TRACE_ID_RE, "trace_id must be 32 hex characters"),
        filter: z.enum(["errors", "http", "db", "slow"]).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ trace_id, filter }) => {
      const bundle = await resolveTrace(client, config, trace_id, {
        includeRumLogs: false,
        redactMode: filter === "db" ? "full" : "summary",
      });
      const spans = filterSpans(bundle.spans, filter, config.attrs);
      return jsonContent({
        trace_id: bundle.trace_id,
        filter: filter ?? null,
        span_count: spans.length,
        spans,
        warnings: bundle.warnings,
      });
    },
  );

  server.registerTool(
    "get_trace",
    {
      description:
        "Full bundle (tree + all spans + RUM). Use only when summary and filtered spans are not enough.",
      inputSchema: z.object({
        trace_id: z
          .string()
          .regex(TRACE_ID_RE, "trace_id must be 32 hex characters"),
        focus_span_id: z
          .string()
          .regex(SPAN_ID_RE, "focus_span_id must be 16 hex characters")
          .optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ trace_id, focus_span_id }) => {
      const bundle = await resolveTrace(client, config, trace_id, {
        focusSpanId: focus_span_id,
        includeRumLogs: true,
        redactMode: "summary",
      });
      return jsonContent(bundle);
    },
  );

  return server;
}
