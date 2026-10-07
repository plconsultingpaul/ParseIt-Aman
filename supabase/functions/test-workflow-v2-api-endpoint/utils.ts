export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

export function getValueByPath(obj: any, path: string, debugMode = false): any {
  try {
    if (debugMode) {
      console.log(`[getValueByPath] Starting path resolution for: "${path}"`);
      console.log(`[getValueByPath] Input object keys:`, Object.keys(obj || {}));
    }
    let actualPath = path;
    if (path.startsWith('extractedData.')) {
      actualPath = path.substring('extractedData.'.length);
      if (debugMode) {
        console.log(`[getValueByPath] Stripped 'extractedData.' prefix. New path: "${actualPath}"`);
      }
    } else if (path.startsWith('response.')) {
      actualPath = path.substring('response.'.length);
      if (debugMode) {
        console.log(`[getValueByPath] Stripped 'response.' prefix. New path: "${actualPath}"`);
      }
    }
    if (actualPath in obj && typeof obj[actualPath] !== 'object') {
      if (debugMode) {
        console.log(`[getValueByPath] Found literal key "${actualPath}" on object`);
      }
      return obj[actualPath];
    }
    const parts = actualPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('[') && part.includes(']')) {
        const arrayName = part.substring(0, part.indexOf('['));
        const arrayIndex = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')));
        current = current[arrayName]?.[arrayIndex];
      } else if (!isNaN(Number(part))) {
        const arrayIndex = parseInt(part);
        current = current?.[arrayIndex];
      } else {
        current = current?.[part];
        if (Array.isArray(current) && i < parts.length - 1 && isNaN(Number(parts[i + 1]))) {
          if (debugMode) {
            console.log(`[getValueByPath] "${part}" resolved to array (length ${current.length}), auto-indexing to [0]`);
          }
          current = current[0];
        }
      }
      if (current === undefined || current === null) {
        return null;
      }
    }
    return current;
  } catch (error) {
    console.error(`[getValueByPath] Error getting value by path "${path}":`, error);
    return null;
  }
}

export function escapeSingleQuotesForOData(value: any): any {
  if (typeof value !== 'string') return value;
  return value.replace(/'/g, "''");
}

export function resolveUserResponseTemplate(template: string | null | undefined, contextData: any): string | null {
  if (!template) return null;
  try {
    return template.replace(/\{([^}]+)\}/g, (match, variablePath) => {
      const value = getValueByPath(contextData, variablePath.trim());
      if (value === null || value === undefined) {
        return match;
      }
      return String(value);
    });
  } catch (error) {
    console.error('Error resolving user response template:', error);
    return template;
  }
}

export async function createV2StepLog(
  supabaseUrl: string,
  supabaseServiceKey: string,
  executionLogId: string,
  workflowId: string,
  node: any,
  status: string,
  startedAt: string,
  completedAt: string | null,
  durationMs: number | null,
  errorMessage: string | null | undefined,
  inputData: any,
  outputData: any,
  contextData?: any
): Promise<string | null> {
  try {
    const userResponse = resolveUserResponseTemplate(node.user_response_template, contextData || {});

    const stepLogPayload = {
      execution_log_id: executionLogId,
      workflow_id: workflowId,
      node_id: node.id,
      node_label: node.label || '',
      step_type: node.step_type || null,
      status,
      started_at: startedAt,
      completed_at: completedAt || null,
      duration_ms: durationMs || null,
      error_message: errorMessage || null,
      input_data: inputData || {},
      output_data: outputData || {},
      config_json: node.config_json || {},
      processed_config: {},
      user_response: userResponse,
      created_at: new Date().toISOString()
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/workflow_v2_step_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(stepLogPayload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`Step log created for node ${node.label}:`, data[0]?.id);
      return data[0]?.id;
    } else {
      console.error('Failed to create V2 step log:', response.status);
    }
  } catch (error) {
    console.error('Error creating V2 step log:', error);
  }
  return null;
}

export async function updateV2ExecutionLog(
  supabaseUrl: string,
  supabaseServiceKey: string,
  executionLogId: string,
  data: Record<string, any>
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/workflow_v2_execution_logs?id=eq.${executionLogId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify(data)
    });
  } catch (error) {
    console.error('Failed to update V2 execution log:', error);
  }
}

export interface ResolvedAuthConfig {
  authToken: string;
  authLoginData: any;
}

export async function resolveAuthConfigLogin(
  supabaseUrl: string,
  supabaseServiceKey: string,
  authConfigId: string
): Promise<ResolvedAuthConfig> {
  const cfgResp = await fetch(
    `${supabaseUrl}/rest/v1/api_auth_config?select=*&id=eq.${authConfigId}`,
    {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    }
  );
  if (!cfgResp.ok) {
    throw new Error(`Failed to load auth config: ${cfgResp.status}`);
  }
  const rows = await cfgResp.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Auth config not found');
  }
  const cfg = rows[0];
  if (!cfg.login_endpoint || !cfg.username || !cfg.password) {
    throw new Error('Auth config missing required fields (login_endpoint, username, password)');
  }
  const loginResp = await fetch(cfg.login_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.username, password: cfg.password })
  });
  if (!loginResp.ok) {
    const errText = await loginResp.text().catch(() => '');
    throw new Error(`Authentication login failed: ${loginResp.status} ${errText}`);
  }
  const loginData = await loginResp.json();
  const tokenField = cfg.token_field_name || 'access_token';
  const token = getValueByPath(loginData, tokenField) ?? loginData[tokenField];
  if (!token) {
    throw new Error(`Login response missing '${tokenField}' field`);
  }
  return { authToken: String(token), authLoginData: loginData };
}

export function persistAuthTokenToContext(
  contextData: any,
  authToken: string,
  authLoginData: any
): void {
  if (!authToken) return;
  contextData.authToken = authToken;
  contextData.authResponse = authLoginData;
  const existing = (contextData.response && typeof contextData.response === 'object')
    ? contextData.response
    : {};
  const loginObj = (authLoginData && typeof authLoginData === 'object') ? authLoginData : {};
  contextData.response = { ...existing, ...loginObj, access_token: authToken };
}

export function buildEdgeMap(edges: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const edge of edges) {
    const key = `${edge.source_node_id}::${edge.source_handle || 'default'}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(edge);
  }
  return map;
}

export function getNextNodeId(edgeMap: Map<string, any[]>, sourceNodeId: string, handle: string): string | null {
  const key = `${sourceNodeId}::${handle}`;
  const edges = edgeMap.get(key);
  if (edges && edges.length > 0) {
    return edges[0].target_node_id;
  }
  if (handle !== 'default') {
    const defaultKey = `${sourceNodeId}::default`;
    const defaultEdges = edgeMap.get(defaultKey);
    if (defaultEdges && defaultEdges.length > 0) {
      return defaultEdges[0].target_node_id;
    }
  }
  return null;
}
