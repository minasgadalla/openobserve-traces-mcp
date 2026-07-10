# openobserve-traces-mcp

stdio [Model Context Protocol](https://modelcontextprotocol.io/) server for investigating OpenTelemetry traces stored in [OpenObserve](https://openobserve.ai/).

Give an AI assistant a `trace_id` or `span_id` and get a structured summary: HTTP status, error path, actor, span tree, and optional RUM context.

Works with **any** OpenObserve deployment — self-hosted or cloud — as long as you configure the connection env vars.

## Tools

| Tool                | Use when                                                  |
| ------------------- | --------------------------------------------------------- |
| `get_trace_summary` | You have a `trace_id` — start here                        |
| `get_trace_spans`   | Drill down with filter: `errors`, `http`, `db`, or `slow` |
| `get_span`          | You only have a `span_id`                                 |
| `get_trace`         | Full bundle (all spans, tree, RUM logs)                   |

## Requirements

- Node.js **20+**
- OpenObserve with OTLP traces ingested into a traces stream
- An API auth header (Basic or Bearer) with search permission

## Install

### Option A — npm (recommended after publish)

```bash
npm install -g openobserve-traces-mcp
```

Or use via `npx` without a global install (see Cursor config below).

### Option B — clone and build

```bash
git clone https://github.com/minas/openobserve-traces-mcp.git
cd openobserve-traces-mcp
npm ci
npm run build
```

## Cursor configuration

Add to `~/.cursor/mcp.json` (or your project MCP config).

**Published package (npx):**

```json
{
  "mcpServers": {
    "openobserve-traces": {
      "command": "npx",
      "args": ["-y", "openobserve-traces-mcp"],
      "env": {
        "OPENOBSERVE_URL": "http://localhost:5080",
        "OPENOBSERVE_ORG": "default",
        "OPENOBSERVE_AUTH_HEADER": "Basic <base64>",
        "OPENOBSERVE_STREAM_TRACES": "default"
      }
    }
  }
}
```

**Local clone:**

```json
{
  "mcpServers": {
    "openobserve-traces": {
      "command": "node",
      "args": ["/absolute/path/to/openobserve-traces-mcp/dist/cli.js"],
      "env": {
        "OPENOBSERVE_URL": "http://localhost:5080",
        "OPENOBSERVE_ORG": "default",
        "OPENOBSERVE_AUTH_HEADER": "Basic <base64>",
        "OPENOBSERVE_STREAM_TRACES": "default"
      }
    }
  }
}
```

See `[examples/](examples/)` for copy-paste templates.

Reload MCP servers in Cursor after changes.

### Auth header

Copy from OpenObserve UI: **Data → Data sources → Traces (OpenTelemetry) → Authorization header**.

## Environment variables

| Variable                            | Required | Default    | Description                                                  |
| ----------------------------------- | -------- | ---------- | ------------------------------------------------------------ |
| `OPENOBSERVE_URL`                   | yes      | —          | OpenObserve base URL (e.g. `http://localhost:5080`)          |
| `OPENOBSERVE_AUTH_HEADER`           | yes      | —          | `Basic …` or `Bearer …` for API search                       |
| `OPENOBSERVE_ORG`                   | no       | `default`  | Organization name                                            |
| `OPENOBSERVE_STREAM_TRACES`         | no       | `default`  | Traces stream name (quote not needed; SQL handles it)        |
| `OPENOBSERVE_STREAM_RUM`            | no       | `_rumdata` | RUM events stream (logs type)                                |
| `OPENOBSERVE_STREAM_RUM_LOGS`       | no       | `_rumlog`  | RUM log stream (logs type)                                   |
| `SPAN_LOOKUP_WINDOW_HOURS`          | no       | `24`       | How far back to search when resolving `trace_id` / `span_id` |
| `TRACE_LOOKUP_WINDOW_MINUTES`       | no       | `30`       | Narrow window tried first (UUIDv7-style trace IDs only)      |
| `MAX_SPANS_PER_TRACE`               | no       | `500`      | Cap spans returned per trace                                 |
| `OPENOBSERVE_ATTR_CORRELATION_ID`   | no       | _(empty)_  | Extra span field for correlation id                          |
| `OPENOBSERVE_ATTR_ERROR_MESSAGE`    | no       | _(empty)_  | Extra span field for app error message                       |
| `OPENOBSERVE_ATTR_FAILED`           | no       | _(empty)_  | Extra span field for app failure flag                        |
| `OPENOBSERVE_ATTR_ORGANIZATION_IDS` | no       | _(empty)_  | Extra span field for organization ids                        |

Set optional `OPENOBSERVE_ATTR_*` only if your OTLP pipeline adds custom span attributes. Standard OTEL fields (`span_status`, `http_*`, `exception.message`, etc.) work without them.

### Finding your stream names

```bash
curl -s -H "Authorization: $OPENOBSERVE_AUTH_HEADER" \
  "http://localhost:5080/api/default/streams?type=traces"
```

Use the exact stream name returned (hyphens and underscores are fine).

## Trace age limits

OpenObserve searches require a time range. This server:

1. Tries a **±30 minute** window derived from the trace ID prefix (works for UUIDv7-style IDs).
2. If nothing is found, falls back to the **last N hours** (`SPAN_LOOKUP_WINDOW_HOURS`, default **24**).

Traces older than that window will not be found unless you increase `SPAN_LOOKUP_WINDOW_HOURS` (e.g. `168` for 7 days). Data must still exist in OpenObserve retention.

## Development

```bash
npm ci
npm run build
npm test
npm run lint
```

Git hooks (commitlint, lint-staged) install automatically when cloning the repo (`scripts/prepare.mjs`).

## License

MIT
