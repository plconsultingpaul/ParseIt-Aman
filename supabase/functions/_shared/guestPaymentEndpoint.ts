import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.7";

export type KV = { key: string; value: string };
export type Mapping = { source_path: string; target_key: string };

export type BodyFieldMapping = {
  fieldName: string;
  type: "hardcoded" | "variable";
  value: string;
  dataType: "string" | "integer" | "number" | "boolean";
};

export type ApiEndpoint = {
  url: string;
  method: string;
  headers?: KV[];
  query_params?: KV[];
  body?: string;
  body_field_mappings?: BodyFieldMapping[];
  response_data_path?: string;
  response_mappings?: Mapping[];
  api_source_type?: "main" | "secondary" | "custom";
  secondary_api_id?: string | null;
  api_spec_id?: string | null;
  api_spec_endpoint_id?: string | null;
  api_path?: string;
  path_variables?: Record<string, string>;
  manual_api_entry?: boolean;
  response_binary?: boolean;
};

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isFinite(idx) ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

export function interpolate(template: string, scope: Record<string, unknown>): string {
  return (template ?? "").replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = getPath(scope, key.trim());
    return v == null ? "" : String(v);
  });
}

export function hasEndpointConfigured(ep: ApiEndpoint | null | undefined): boolean {
  if (!ep) return false;
  if (typeof ep.api_spec_endpoint_id === "string" && ep.api_spec_endpoint_id.trim().length > 0) {
    return true;
  }
  const sourceType = ep.api_source_type ?? (ep.url ? "custom" : "main");
  if (sourceType === "secondary") {
    return typeof ep.secondary_api_id === "string" && ep.secondary_api_id.trim().length > 0;
  }
  if (sourceType === "main") {
    return typeof ep.api_path === "string" && ep.api_path.trim().length > 0;
  }
  return typeof ep.url === "string" && ep.url.trim().length > 0;
}

export type ResolvedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export async function buildResolvedRequest(
  supabase: SupabaseClient,
  ep: ApiEndpoint,
  scope: Record<string, unknown>,
): Promise<ResolvedRequest> {
  const sourceType = ep.api_source_type ?? (ep.url ? "custom" : "main");
  const method = (ep.method || "GET").toUpperCase();
  const headers: Record<string, string> = {};

  let baseUrl = "";
  let endpointPath = "";

  if (sourceType === "main") {
    const { data } = await supabase.from("api_settings").select("path, password").maybeSingle();
    baseUrl = ((data as { path?: string } | null)?.path ?? "").replace(/\/+$/, "");
    const token = (data as { password?: string } | null)?.password;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    endpointPath = ep.api_path ?? "";
  } else if (sourceType === "secondary") {
    if (!ep.secondary_api_id) throw new Error("Secondary API is not selected");
    const { data } = await supabase
      .from("secondary_api_configs")
      .select("base_url, auth_token")
      .eq("id", ep.secondary_api_id)
      .maybeSingle();
    baseUrl = ((data as { base_url?: string } | null)?.base_url ?? "").replace(/\/+$/, "");
    const token = (data as { auth_token?: string } | null)?.auth_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    endpointPath = ep.api_path ?? "";
  }

  const pathVars = ep.path_variables ?? {};
  const resolvedPathVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(pathVars)) {
    resolvedPathVars[k] = interpolate(v ?? "", scope);
  }
  const combinedScope = { ...scope, ...resolvedPathVars };

  const resolvedPath = interpolate(endpointPath, combinedScope);
  const joinedPath = resolvedPath && !resolvedPath.startsWith("/") ? `/${resolvedPath}` : resolvedPath;
  const rawUrl = sourceType === "custom"
    ? interpolate(ep.url ?? "", combinedScope)
    : `${baseUrl}${joinedPath}`;

  const url = new URL(rawUrl);
  for (const q of ep.query_params ?? []) {
    if (!q.key) continue;
    url.searchParams.set(interpolate(q.key, combinedScope), interpolate(q.value ?? "", combinedScope));
  }
  for (const h of ep.headers ?? []) {
    if (!h.key) continue;
    headers[interpolate(h.key, combinedScope)] = interpolate(h.value ?? "", combinedScope);
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD" && (ep.body || (ep.body_field_mappings ?? []).length > 0)) {
    body = buildBodyFromMappings(ep, combinedScope);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  return { url: url.toString(), method, headers, body };
}

function parsePathSegments(fieldName: string): Array<{ key: string; arrayIndex?: number }> {
  const parts = fieldName.split(".").filter(Boolean);
  const segments: Array<{ key: string; arrayIndex?: number }> = [];
  for (const part of parts) {
    const match = part.match(/^([^\[]+)((?:\[\d+\])*)$/);
    if (!match) {
      segments.push({ key: part });
      continue;
    }
    const key = match[1];
    const arrays = match[2];
    if (!arrays) {
      segments.push({ key });
      continue;
    }
    const idxRegex = /\[(\d+)\]/g;
    const indices: number[] = [];
    let im: RegExpExecArray | null;
    while ((im = idxRegex.exec(arrays)) !== null) indices.push(Number(im[1]));
    if (indices.length === 0) {
      segments.push({ key });
    } else {
      segments.push({ key, arrayIndex: indices[0] });
      for (let i = 1; i < indices.length; i++) segments.push({ key: "", arrayIndex: indices[i] });
    }
  }
  return segments;
}

function setValueAtPath(root: Record<string, unknown>, fieldName: string, value: unknown): void {
  const segments = parsePathSegments(fieldName);
  if (segments.length === 0) return;
  let cursor: any = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    if (seg.key) {
      if (seg.arrayIndex !== undefined) {
        if (!Array.isArray(cursor[seg.key])) cursor[seg.key] = [];
        if (isLast) {
          cursor[seg.key][seg.arrayIndex] = value;
        } else {
          if (cursor[seg.key][seg.arrayIndex] == null || typeof cursor[seg.key][seg.arrayIndex] !== "object") {
            cursor[seg.key][seg.arrayIndex] = {};
          }
          cursor = cursor[seg.key][seg.arrayIndex];
        }
      } else {
        if (isLast) {
          cursor[seg.key] = value;
        } else {
          if (cursor[seg.key] == null || typeof cursor[seg.key] !== "object") cursor[seg.key] = {};
          cursor = cursor[seg.key];
        }
      }
    } else if (seg.arrayIndex !== undefined) {
      if (!Array.isArray(cursor)) return;
      if (isLast) {
        cursor[seg.arrayIndex] = value;
      } else {
        if (cursor[seg.arrayIndex] == null || typeof cursor[seg.arrayIndex] !== "object") cursor[seg.arrayIndex] = {};
        cursor = cursor[seg.arrayIndex];
      }
    }
  }
}

function coerceMappingValue(raw: unknown, dataType: BodyFieldMapping["dataType"]): unknown {
  if (raw == null || raw === "") return raw ?? null;
  switch (dataType) {
    case "integer": {
      const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw));
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).trim().toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }
    case "string":
    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

function buildBodyFromMappings(ep: ApiEndpoint, scope: Record<string, unknown>): string {
  const mappings = ep.body_field_mappings ?? [];
  const template = ep.body ?? "";
  if (mappings.length === 0) {
    return interpolate(template, scope);
  }
  let root: Record<string, unknown> = {};
  if (template.trim().length > 0) {
    try {
      const parsed = JSON.parse(template);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        root = parsed as Record<string, unknown>;
      }
    } catch {
      root = {};
    }
  }
  for (const m of mappings) {
    if (!m.fieldName) continue;
    const resolved =
      m.type === "variable"
        ? getPath(scope, m.value ?? "")
        : interpolate(m.value ?? "", scope);
    setValueAtPath(root, m.fieldName, coerceMappingValue(resolved, m.dataType));
  }
  return JSON.stringify(root);
}
