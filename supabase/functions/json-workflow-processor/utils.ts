// utils.ts - Shared helper functions and utilities

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

export function getValueByPath(obj: any, path: string, debugMode = false): any {
  try {
    if (debugMode) {
      console.log(`🔍 [getValueByPath] Starting path resolution for: "${path}"`);
      console.log(`🔍 [getValueByPath] Input object keys:`, Object.keys(obj || {}));
    }

    // Strip 'extractedData.' prefix if present since extractedData is spread at contextData root
    let actualPath = path;
    if (path.startsWith('extractedData.')) {
      actualPath = path.substring('extractedData.'.length);
      if (debugMode) {
        console.log(`🔍 [getValueByPath] Stripped 'extractedData.' prefix. New path: "${actualPath}"`);
      }
    }

    const parts = actualPath.split('.');
    let current = obj;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (debugMode) {
        console.log(`🔍 [getValueByPath] Step ${i + 1}/${parts.length}: Processing part "${part}"`);
        console.log(`🔍 [getValueByPath] Current object type:`, typeof current);
        if (typeof current === 'object' && current !== null) {
          console.log(`🔍 [getValueByPath] Current object keys:`, Object.keys(current));
        }
      }

      if (part.includes('[') && part.includes(']')) {
        const arrayName = part.substring(0, part.indexOf('['));
        const arrayIndex = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')));
        if (debugMode) {
          console.log(`🔍 [getValueByPath] Array access: ${arrayName}[${arrayIndex}]`);
          console.log(`🔍 [getValueByPath] Array exists:`, current?.[arrayName] !== undefined);
          console.log(`🔍 [getValueByPath] Array length:`, current?.[arrayName]?.length);
        }
        current = current[arrayName]?.[arrayIndex];
        if (debugMode) {
          console.log(`🔍 [getValueByPath] After array access, current:`, current);
        }
      } else if (!isNaN(Number(part))) {
        const arrayIndex = parseInt(part);
        if (debugMode) {
          console.log(`🔍 [getValueByPath] Numeric index access: [${arrayIndex}]`);
        }
        current = current?.[arrayIndex];
        if (debugMode) {
          console.log(`🔍 [getValueByPath] After numeric access, current:`, current);
        }
      } else {
        if (debugMode) {
          console.log(`🔍 [getValueByPath] Property access: .${part}`);
          console.log(`🔍 [getValueByPath] Property exists:`, current?.[part] !== undefined);
        }
        current = current?.[part];
        if (debugMode) {
          console.log(`🔍 [getValueByPath] After property access, current:`, current);
        }
      }

      if (current === undefined || current === null) {
        if (debugMode) {
          console.log(`🔍 [getValueByPath] Path resolution stopped at part "${part}" - value is ${current === undefined ? 'undefined' : 'null'}`);
        }
        return null;
      }
    }

    if (debugMode) {
      console.log(`🔍 [getValueByPath] ✅ Path resolution complete. Final value:`, current);
      console.log(`🔍 [getValueByPath] Final value type:`, typeof current);
    }
    return current;
  } catch (error) {
    console.error(`❌ [getValueByPath] Error getting value by path "${path}":`, error);
    return null;
  }
}

export function escapeSingleQuotesForOData(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }
  // Replace single quote with double single quote for OData filter compatibility
  // Remove all parentheses to avoid WAF pattern detection
  return value.replace(/'/g, "''").replace(/[()]/g, '');
}

export function filterJsonWorkflowOnlyFields(data: any, fieldMappings: any[]): any {
  if (!data || !fieldMappings || fieldMappings.length === 0) {
    return data;
  }

  try {
    const outputFields = fieldMappings.filter((m: any) => !m.isWorkflowOnly);
    const outputFieldNames = outputFields.map((m: any) => m.fieldName);
    const workflowOnlyCount = fieldMappings.length - outputFields.length;

    console.log(`📊 JSON Filtering: Keeping ${outputFields.length} fields, excluding ${workflowOnlyCount} workflow-only fields`);

    if (workflowOnlyCount === 0) {
      console.log('📊 No workflow-only fields to filter, using original data');
      return data;
    }

    const filterObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map((item: any) => filterObject(item));
      }

      const filtered: any = {};
      for (const key of Object.keys(obj)) {
        if (outputFieldNames.includes(key)) {
          filtered[key] = obj[key];
        }
      }
      return filtered;
    };

    const filteredData = filterObject(data);
    console.log(`✅ JSON filtered successfully: ${outputFields.length} fields kept`);
    return filteredData;
  } catch (error) {
    console.error('❌ Error filtering JSON workflow-only fields:', error);
    console.log('⚠️ Returning original data');
    return data;
  }
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

export async function createStepLog(
  supabaseUrl: string,
  supabaseServiceKey: string,
  workflowExecutionLogId: string,
  workflowId: string,
  step: any,
  status: string,
  startedAt: string,
  completedAt: string | null,
  durationMs: number | null,
  errorMessage: string | null,
  inputData: any,
  outputData: any,
  contextData?: any
): Promise<string | null> {
  try {
    const userResponse = resolveUserResponseTemplate(step.user_response_template, contextData || {});

    const stepLogPayload = {
      workflow_execution_log_id: workflowExecutionLogId,
      workflow_id: workflowId,
      step_id: step.id,
      step_name: step.step_name,
      step_type: step.step_type,
      step_order: step.step_order,
      status,
      started_at: startedAt,
      completed_at: completedAt || null,
      duration_ms: durationMs || null,
      error_message: errorMessage || null,
      input_data: inputData || null,
      output_data: outputData || null,
      user_response: userResponse,
      created_at: new Date().toISOString()
    };

    const stepLogResponse = await fetch(`${supabaseUrl}/rest/v1/workflow_step_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(stepLogPayload)
    });

    if (stepLogResponse.ok) {
      const stepLogData = await stepLogResponse.json();
      console.log(`✅ Step log created for step ${step.step_order}:`, stepLogData[0]?.id);
      return stepLogData[0]?.id;
    } else {
      console.error('❌ Failed to create step log:', stepLogResponse.status);
    }
  } catch (error) {
    console.error('❌ Error creating step log:', error);
  }
  return null;
}