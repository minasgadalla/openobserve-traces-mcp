export interface ErrorPathStep {
  span_id: string;
  operation_name: string;
  span_status: string;
  message?: string;
  http_status_code?: string;
}

export interface SpanRecord {
  span_id: string;
  trace_id: string;
  reference_parent_span_id?: string | null;
  service_name?: string;
  operation_name?: string;
  span_status?: string;
  duration?: number | string;
  start_time?: number | string;
  end_time?: number | string;
  http_method?: string;
  http_route?: string;
  http_status_code?: string;
  http_target?: string;
  http_url?: string;
  db_statement?: string;
  email?: string;
  user_id?: string;
  [key: string]: unknown;
}

export interface SpanNode {
  span_id: string;
  operation_name?: string;
  span_status?: string;
  children: SpanNode[];
}

export interface TraceSummary {
  span_count: number;
  truncated: boolean;
  error_span_count: number;
  primary_error_span_id: string | null;
  root_error: string | null;
  error_path: ErrorPathStep[];
  slow_spans: Array<{
    span_id: string;
    operation_name: string;
    duration_us: number;
  }>;
  http: { method?: string; route?: string; status?: string } | null;
  actor: {
    email?: string;
    user_id?: string;
    organization_ids?: string;
  } | null;
  correlation_id: string | null;
  rum_session_id: string | null;
  view_url: string | null;
  duration_us: number | null;
  db_query_count: number;
}

export interface RumRecord {
  _oo_trace_id?: string;
  _oo_span_id?: string;
  type?: string;
  service?: string;
  resource_url?: string;
  resource_method?: string;
  resource_status_code?: string | number;
  view_url?: string;
  view_referrer?: string;
  usr_email?: string;
  usr_id?: string;
  session_id?: string;
  _timestamp?: number | string;
  [key: string]: unknown;
}

export interface RumLogRecord {
  _timestamp?: number | string;
  status?: string;
  message?: string;
  http_method?: string;
  http_url?: string;
  http_status_code?: string | number;
  email?: string;
  [key: string]: unknown;
}

export interface TraceBundle {
  trace_id: string;
  focus_span_id?: string;
  time: { iso: string; start_us: number; end_us: number };
  summary: TraceSummary;
  span_tree: {
    roots: SpanNode[];
    edges: Array<{ from: string; to: string }>;
    orphan_count: number;
  };
  spans: SpanRecord[];
  rum: RumRecord[];
  rum_logs?: RumLogRecord[];
  warnings: string[];
}

export interface SpanBundle {
  span_id: string;
  trace_id: string;
  span: SpanRecord;
  ancestor_path: ErrorPathStep[];
  trace_summary: TraceSummary;
}

export interface TraceTimeRange {
  start_us: number;
  end_us: number;
}

export interface AppAttrNames {
  correlationId: string;
  errorMessage: string;
  failed: string;
  organizationIds: string;
}

export interface Config {
  url: string;
  org: string;
  authHeader: string;
  streamTraces: string;
  streamRum: string;
  streamRumLogs: string;
  traceLookupWindowMinutes: number;
  spanLookupWindowHours: number;
  maxSpansPerTrace: number;
  attrs: AppAttrNames;
}

export type SpanFilter = "errors" | "http" | "db" | "slow";

export interface OpenObserveSearchResponse {
  hits?: Array<Record<string, unknown>>;
  total?: number;
  took?: number;
  from?: number;
  size?: number;
}
