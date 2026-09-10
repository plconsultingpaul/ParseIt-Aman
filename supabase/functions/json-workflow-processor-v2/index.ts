import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getValueByPath, resolveUserResponseTemplate, createV2StepLog, updateV2ExecutionLog, buildEdgeMap, getNextNodeId } from "./utils.ts";
import { executeApiCall } from "./steps/api.ts";
import { executeApiEndpoint } from "./steps/apiEndpoint.ts";
import { executeRename } from "./steps/rename.ts";
import { executeSftpUpload } from "./steps/upload.ts";
import { executeEmailAction } from "./steps/email.ts";
import { executeConditionalCheck } from "./steps/logic.ts";
import { executeMultipartFormUpload } from "./steps/multipart.ts";
import { executeAiDecision } from "./steps/aiDecision.ts";
import { executeImaging } from "./steps/imaging.ts";
import { executeUpdateImagingDocument } from "./steps/updateImagingDocument.ts";
import { executeReadEmail } from "./steps/readEmail.ts";
import { executeReadBarcode } from "./steps/readBarcode.ts";
import { executeDataTransform } from "./steps/dataTransform.ts";
import { sendFailureNotificationIfEnabled, sendSuccessNotificationIfEnabled } from "./steps/notifications.ts";
import { evaluateFunction, evaluateAddressLookupAsync, getFieldValue, type FunctionLogic } from "./functionEvaluator.ts";

const MAX_NODE_VISITS = 100;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let executionLogId: string | null = null;
  let extractionLogId: string | null = null;
  let outerExtractionTypeId: string | null = null;
  let outerContextData: any = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let requestData: any;
    try {
      const requestText = await req.text();
      if (!requestText || requestText.trim() === '') {
        throw new Error('Request body is empty');
      }
      requestData = JSON.parse(requestText);
    } catch (parseError: any) {
      return new Response(JSON.stringify({
        error: "Invalid request format",
        details: parseError instanceof Error ? parseError.message : "Unknown parse error"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    outerExtractionTypeId = requestData.extractionTypeId || null;

    const isResumeFromInbox = !!(requestData.resumeFromNodeId && requestData.resumeContextData);
    let extractedData: any = {};

    let typeDetails: any = null;
    let formatType = 'JSON';
    try {
      if (requestData.extractionTypeId) {
        const resp = await fetch(`${supabaseUrl}/rest/v1/extraction_types?id=eq.${requestData.extractionTypeId}`, {
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
        });
        if (resp.ok) {
          const types = await resp.json();
          if (types && types.length > 0) {
            typeDetails = types[0];
            formatType = typeDetails.format_type || 'JSON';
          }
        }
      } else if (requestData.transformationTypeId) {
        const resp = await fetch(`${supabaseUrl}/rest/v1/transformation_types?id=eq.${requestData.transformationTypeId}`, {
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
        });
        if (resp.ok) {
          const types = await resp.json();
          if (types && types.length > 0) {
            typeDetails = types[0];
            formatType = typeDetails.format_type || 'JSON';
          }
        }
      }
    } catch (typeError) {
      console.error('Failed to fetch type details:', typeError);
    }

    if (isResumeFromInbox) {
      extractionLogId = requestData.extractionLogId || null;
      executionLogId = requestData.executionLogId || null;
      if (executionLogId) {
        await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
          status: 'running',
          updated_at: new Date().toISOString()
        });
      }
    } else {

    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id: requestData.userId || null,
          extraction_type_id: requestData.extractionTypeId || null,
          transformation_type_id: requestData.transformationTypeId || null,
          pdf_filename: requestData.originalPdfFilename,
          pdf_pages: requestData.pdfPages,
          extraction_status: 'success',
          extracted_data: requestData.extractedData || null,
          processing_mode: requestData.processingMode || (requestData.transformationTypeId ? 'transformation' : 'extraction'),
          session_id: requestData.sessionId || null,
          group_order: requestData.groupOrder || null,
          created_at: new Date().toISOString()
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        extractionLogId = data[0]?.id;
      }
    } catch (logError) {
      console.error('Error creating extraction log:', logError);
    }

    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/workflow_v2_execution_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          workflow_id: requestData.workflowId,
          extraction_log_id: extractionLogId,
          status: 'running',
          context_data: {},
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: requestData.userId || null,
          processing_mode: requestData.processingMode || (requestData.transformationTypeId ? 'transformation' : 'extraction'),
          extraction_type_id: requestData.extractionTypeId || null,
          transformation_type_id: requestData.transformationTypeId || null
        })
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.trim()) {
          const data = JSON.parse(text);
          executionLogId = data[0]?.id;
        }
      }
    } catch (logError) {
      console.error('Error creating V2 execution log:', logError);
    }

    if (requestData.extractedDataStoragePath) {
      try {
        const storageUrl = `${supabaseUrl}/storage/v1/object/pdfs/${requestData.extractedDataStoragePath}`;
        const resp = await fetch(storageUrl, { headers: { 'Authorization': `Bearer ${supabaseServiceKey}` } });
        if (resp.ok) {
          const text = await resp.text();
          if (text && text.trim()) {
            extractedData = JSON.parse(text);
          }
        }
      } catch (storageError) {
        console.error('Storage loading error:', storageError);
      }
    } else if (requestData.extractedData) {
      try {
        if (typeof requestData.extractedData === 'string') {
          if (requestData.extractedData.trim() === '') {
            extractedData = {};
          } else if (formatType === 'CSV') {
            extractedData = requestData.extractedData;
          } else {
            extractedData = JSON.parse(requestData.extractedData);
          }
        } else {
          extractedData = requestData.extractedData || {};
        }
      } catch (parseError) {
        if (formatType === 'CSV' && typeof requestData.extractedData === 'string') {
          extractedData = requestData.extractedData;
        } else {
          extractedData = {};
        }
      }
    }

    // Expand flat dotted WFO keys (e.g. "stop1.Shipment") into a nested object
    // so condition functions that reference WFO fields resolve correctly.
    const expandDottedKeys = (flat: Record<string, any>): Record<string, any> => {
      const out: Record<string, any> = {};
      for (const [key, value] of Object.entries(flat || {})) {
        if (!key.includes('.')) {
          out[key] = value;
          continue;
        }
        const parts = key.split('.');
        let cur: any = out;
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i];
          if (cur[p] == null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
            cur[p] = {};
          }
          cur = cur[p];
        }
        cur[parts[parts.length - 1]] = value;
      }
      return out;
    };
    const deepMergePlain = (
      base: Record<string, any>,
      override: Record<string, any>
    ): Record<string, any> => {
      const result: Record<string, any> = { ...base };
      for (const [key, value] of Object.entries(override || {})) {
        const existing = result[key];
        if (
          existing && typeof existing === 'object' && !Array.isArray(existing) &&
          value && typeof value === 'object' && !Array.isArray(value)
        ) {
          result[key] = deepMergePlain(existing, value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    let wfoNestedForFunctions: Record<string, any> = {};
    if (requestData.workflowOnlyData) {
      try {
        const wfoRaw = typeof requestData.workflowOnlyData === 'string'
          ? JSON.parse(requestData.workflowOnlyData)
          : requestData.workflowOnlyData;
        if (wfoRaw && typeof wfoRaw === 'object') {
          wfoNestedForFunctions = expandDottedKeys(wfoRaw);
        }
      } catch (_e) {
        wfoNestedForFunctions = {};
      }
    }

    if (!isResumeFromInbox && formatType !== 'CSV' && typeof extractedData === 'object' && extractedData !== null && typeDetails?.field_mappings) {
      try {
        const fieldMappings = typeof typeDetails.field_mappings === 'string'
          ? JSON.parse(typeDetails.field_mappings)
          : typeDetails.field_mappings;

        const functionMappings = (fieldMappings || []).filter((m: any) => m.type === 'function' && m.functionId);

        if (functionMappings.length > 0) {
          const functionIds = [...new Set(functionMappings.map((m: any) => m.functionId))];
          const idsParam = functionIds.map((id: string) => `"${id}"`).join(',');
          const fnResp = await fetch(
            `${supabaseUrl}/rest/v1/field_mapping_functions?id=in.(${idsParam})`,
            { headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey } }
          );

          if (fnResp.ok) {
            const functions: any[] = await fnResp.json();

            let geminiApiKey = '';
            const hasAddressLookup = functions.some((f: any) => f.function_logic?.type === 'address_lookup');
            if (hasAddressLookup) {
              try {
                const keyResp = await fetch(
                  `${supabaseUrl}/rest/v1/gemini_api_keys?is_active=eq.true&select=api_key&limit=1`,
                  { headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey } }
                );
                if (keyResp.ok) {
                  const keys = await keyResp.json();
                  if (keys.length > 0) geminiApiKey = keys[0].api_key;
                }
              } catch (_e) {
                console.error('Error fetching Gemini API key:', _e);
              }
            }

            const setFieldValue = (obj: any, fieldPath: string, value: any) => {
              const parts = fieldPath.split('.');
              let current = obj;
              for (let i = 0; i < parts.length - 1; i++) {
                if (current[parts[i]] === undefined) current[parts[i]] = {};
                if (Array.isArray(current[parts[i]])) {
                  const remainingPath = parts.slice(i + 1).join('.');
                  current[parts[i]].forEach((item: any) => setFieldValue(item, remainingPath, value));
                  return;
                }
                current = current[parts[i]];
              }
              current[parts[parts.length - 1]] = value;
            };

            const orders = Array.isArray(extractedData.orders) ? extractedData.orders : [extractedData];
            for (const order of orders) {
              const evalContext = deepMergePlain(wfoNestedForFunctions, order);
              for (const mapping of functionMappings) {
                const func = functions.find((f: any) => f.id === mapping.functionId);
                if (func?.function_logic) {
                  let result: any;
                  if (func.function_logic.type === 'address_lookup' && geminiApiKey) {
                    result = await evaluateAddressLookupAsync(func.function_logic, evalContext, geminiApiKey);
                  } else if (func.function_logic.type === 'address_lookup' && !geminiApiKey) {
                    result = func.function_logic.defaultValue || '';
                  } else {
                    result = evaluateFunction(func.function_logic as FunctionLogic, evalContext);
                  }
                  if (result !== undefined && result !== '' && result !== null && result !== 'null') {
                    setFieldValue(order, mapping.fieldName, result);
                  }
                }
              }
            }
          }
        }
        const variableMappings = (fieldMappings || []).filter((m: any) => m.type === 'variable' && m.value);
        if (variableMappings.length > 0) {
          const orders = Array.isArray(extractedData.orders) ? extractedData.orders : [extractedData];
          for (const order of orders) {
            for (const mapping of variableMappings) {
              const sourceValue = getFieldValue(mapping.value, order);
              if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
                const parts = mapping.fieldName.split('.');
                let current = order;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (current[parts[i]] === undefined) current[parts[i]] = {};
                  current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = sourceValue;
              }
            }
          }
        }
      } catch (fnError) {
        console.error('Function evaluation error (non-fatal):', fnError);
      }
    }

    if (formatType !== 'CSV' && typeof extractedData === 'object' && extractedData !== null && typeDetails?.field_mappings) {
      try {
        const fieldMappings = typeof typeDetails.field_mappings === 'string'
          ? JSON.parse(typeDetails.field_mappings)
          : typeDetails.field_mappings;

        const mappingsWithMaxLength = (fieldMappings || []).filter(
          (m: any) => m.maxLength && typeof m.maxLength === 'number' && m.maxLength > 0 && !m.isWorkflowOnly
        );

        if (mappingsWithMaxLength.length > 0) {

          const truncateToMaxLength = (str: string, maxLen: number): string => {
            if (str.length <= maxLen) return str;
            return str.substring(0, maxLen);
          };

          const enforceMaxLength = (obj: any, fieldPath: string, maxLen: number) => {
            const parts = fieldPath.split('.');
            let current = obj;
            for (let i = 0; i < parts.length - 1; i++) {
              if (current[parts[i]] === undefined || current[parts[i]] === null) return;
              if (Array.isArray(current[parts[i]])) {
                const remaining = parts.slice(i + 1).join('.');
                current[parts[i]].forEach((item: any) => enforceMaxLength(item, remaining, maxLen));
                return;
              }
              current = current[parts[i]];
            }
            const finalField = parts[parts.length - 1];
            if (typeof current[finalField] === 'string' && current[finalField].length > maxLen) {
              current[finalField] = truncateToMaxLength(current[finalField], maxLen);
            }
          };

          const orders = Array.isArray(extractedData.orders) ? extractedData.orders : [extractedData];
          for (const order of orders) {
            for (const mapping of mappingsWithMaxLength) {
              enforceMaxLength(order, mapping.fieldName, mapping.maxLength);
            }
          }
        }
      } catch (mlError) {
        console.error('MaxLength enforcement error (non-fatal):', mlError);
      }
    }

    } // end if (!isResumeFromInbox) block for extraction/execution log creation + function evaluation

    const nodesResp = await fetch(`${supabaseUrl}/rest/v1/workflow_v2_nodes?workflow_id=eq.${requestData.workflowId}&order=created_at.asc`, {
      headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
    });
    if (!nodesResp.ok) {
      throw new Error('Failed to fetch workflow V2 nodes');
    }
    const nodes: any[] = await nodesResp.json();

    const edgesResp = await fetch(`${supabaseUrl}/rest/v1/workflow_v2_edges?workflow_id=eq.${requestData.workflowId}`, {
      headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
    });
    if (!edgesResp.ok) {
      throw new Error('Failed to fetch workflow V2 edges');
    }
    const edges: any[] = await edgesResp.json();

    const startNode = nodes.find((n: any) => n.node_type === 'start');
    if (!startNode) {
      throw new Error('No start node found in workflow V2');
    }

    const nodeMap = new Map<string, any>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    const edgeMap = buildEdgeMap(edges);

    let workflowOnlyFields: any = {};
    if (requestData.workflowOnlyData) {
      try {
        workflowOnlyFields = typeof requestData.workflowOnlyData === 'string'
          ? JSON.parse(requestData.workflowOnlyData)
          : requestData.workflowOnlyData;
      } catch (_e) {
        workflowOnlyFields = {};
      }
    }

    const formattedTimestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let contextData: any;
    if (isResumeFromInbox) {
      contextData = requestData.resumeContextData;
      if (requestData.editedData && typeof requestData.editedData === 'object') {
        contextData.extractedData = requestData.editedData;
        if (typeof requestData.editedData === 'object' && requestData.editedData !== null && !Array.isArray(requestData.editedData)) {
          contextData = { ...contextData, ...requestData.editedData };
          if (Array.isArray(requestData.editedData.orders) && requestData.editedData.orders.length > 0) {
            const firstOrder = requestData.editedData.orders[0];
            if (typeof firstOrder === 'object' && firstOrder !== null) {
              contextData = { ...contextData, ...firstOrder };
            }
          }
        }
      }
    } else {
      contextData = {
        extractedData: extractedData,
        originalExtractedData: requestData.extractedData,
        formatType: formatType,
        pdfFilename: requestData.extractionTypeFilename || requestData.pdfFilename,
        originalPdfFilename: requestData.originalPdfFilename,
        extractionTypeFilename: requestData.pageGroupFilenameTemplate || typeDetails?.filename_template || requestData.extractionTypeFilename,
        pageGroupFilenameTemplate: requestData.pageGroupFilenameTemplate,
        pdfStoragePath: requestData.pdfStoragePath,
        pdfBase64: requestData.pdfBase64,
        userId: requestData.userId || null,
        senderEmail: requestData.senderEmail || requestData.submitterEmail || null,
        submitterEmail: requestData.submitterEmail || null,
        extractionTypeName: typeDetails?.name || 'Unknown',
        timestamp: formattedTimestamp,
        triggerSource: requestData.triggerSource || null,
        ...workflowOnlyFields
      };

      if (requestData.contextData && typeof requestData.contextData === 'object') {
        contextData = { ...contextData, ...requestData.contextData };
      }

      if (formatType !== 'CSV' && typeof extractedData === 'object' && extractedData !== null) {
        contextData = { ...contextData, ...extractedData };

        if (Array.isArray(extractedData.orders) && extractedData.orders.length > 0) {
          const firstOrder = extractedData.orders[0];
          if (typeof firstOrder === 'object' && firstOrder !== null) {
            contextData = { ...contextData, ...firstOrder };
          }
        }
      }

      if (requestData.sessionId && requestData.groupOrder && requestData.groupOrder > 1) {
        try {
          const prevResp = await fetch(
            `${supabaseUrl}/rest/v1/extraction_group_data?session_id=eq.${requestData.sessionId}&group_order=lt.${requestData.groupOrder}&order=group_order.asc`,
            { headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey } }
          );
          if (prevResp.ok) {
            const prevGroups = await prevResp.json();
            for (const prevGroup of prevGroups) {
              const groupPrefix = `group${prevGroup.group_order}_`;
              const prevFields = prevGroup.extracted_fields || {};
              for (const [fieldName, fieldValue] of Object.entries(prevFields)) {
                contextData[`${groupPrefix}${fieldName}`] = fieldValue;
              }
            }
          }
        } catch (prevGroupError) {
          console.error('Failed to retrieve previous group data:', prevGroupError);
        }
      }
    }

    outerContextData = contextData;

    let currentNodeId: string | null;
    if (isResumeFromInbox) {
      currentNodeId = requestData.resumeFromNodeId;
    } else {
      currentNodeId = getNextNodeId(edgeMap, startNode.id, 'default');
    }
    let lastApiResponse: any = null;
    let visitCount = 0;

    while (currentNodeId) {
      visitCount++;
      if (visitCount > MAX_NODE_VISITS) {
        throw new Error(`Graph traversal exceeded maximum of ${MAX_NODE_VISITS} node visits. Possible cycle detected.`);
      }

      const node = nodeMap.get(currentNodeId);
      if (!node) {
        break;
      }

      if (node.node_type === 'start') {
        currentNodeId = getNextNodeId(edgeMap, node.id, 'default');
        continue;
      }

      const stepStartTime = new Date().toISOString();
      const stepStartMs = Date.now();

      if (executionLogId) {
        try {
          await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
            current_node_id: node.id,
            current_node_label: node.label,
            context_data: contextData,
            updated_at: new Date().toISOString()
          });
        } catch (_e) { /* continue */ }
      }

      let stepOutputData: any = null;
      let nextHandle = 'default';
      let apiCallResolvedBody: string | undefined;
      let apiEndpointResolvedDetails: any = undefined;
      let apiEndpointResolvedBody: string | undefined;

      try {
        const config = node.config_json || {};

        let shouldSkipNode = false;
        let skipReason = '';
        if (config.skipIf) {
          const conditionResult = getValueByPath(contextData, config.skipIf);
          if (conditionResult === true) {
            shouldSkipNode = true;
            skipReason = `skipIf condition met: ${config.skipIf} = true`;
          }
        }
        if (!shouldSkipNode && config.runIf) {
          const conditionResult = getValueByPath(contextData, config.runIf);
          if (conditionResult !== true) {
            shouldSkipNode = true;
            skipReason = `runIf condition not met: ${config.runIf} = ${conditionResult}`;
          }
        }

        if (shouldSkipNode) {
          stepOutputData = { skipped: true, reason: skipReason, conditionalSkip: true };
          const stepEndTime = new Date().toISOString();
          const stepDurationMs = Date.now() - stepStartMs;
          if (executionLogId) {
            await createV2StepLog(supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId, node, 'skipped', stepStartTime, stepEndTime, stepDurationMs, skipReason, { config: node.config_json }, stepOutputData, contextData);
          }
          currentNodeId = getNextNodeId(edgeMap, node.id, 'default');
          continue;
        }

        if (node.step_type === 'api_call') {
          const apiResult = await executeApiCall(node, contextData);
          stepOutputData = apiResult.responseData;
          lastApiResponse = stepOutputData;
          apiCallResolvedBody = apiResult.resolvedRequestBody;

        } else if (node.step_type === 'api_endpoint') {
          const result = await executeApiEndpoint(node, contextData, supabaseUrl, supabaseServiceKey);
          lastApiResponse = result.responseData;
          stepOutputData = result.stepOutput;
          apiEndpointResolvedDetails = result.resolvedRequestDetails;
          apiEndpointResolvedBody = result.resolvedRequestBody;

        } else if (node.step_type === 'rename_file' || node.step_type === 'rename_pdf') {
          stepOutputData = executeRename(node, contextData, lastApiResponse, formatType);

        } else if (node.step_type === 'sftp_upload') {
          stepOutputData = await executeSftpUpload(node, contextData, supabaseUrl, supabaseServiceKey, formatType);

        } else if (node.step_type === 'email_action') {
          stepOutputData = await executeEmailAction(node, contextData, supabaseUrl, supabaseServiceKey);

        } else if (node.step_type === 'conditional_check') {
          stepOutputData = executeConditionalCheck(node, contextData);
          nextHandle = stepOutputData.conditionMet ? 'success' : 'failure';

        } else if (node.step_type === 'multipart_form_upload') {
          stepOutputData = await executeMultipartFormUpload(node, contextData, supabaseUrl, supabaseServiceKey);

        } else if (node.step_type === 'ai_decision') {
          const result = await executeAiDecision(node, contextData, supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId);
          lastApiResponse = result.responseData;
          stepOutputData = result.stepOutput;

        } else if (node.step_type === 'imaging') {
          stepOutputData = await executeImaging(node, contextData, supabaseUrl, supabaseServiceKey);

        } else if (node.step_type === 'update_imaging_document') {
          stepOutputData = await executeUpdateImagingDocument(node, contextData, supabaseUrl, supabaseServiceKey);

        } else if (node.step_type === 'read_email') {
          const result = await executeReadEmail(node, contextData, supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId);
          stepOutputData = result.stepOutput;

        } else if (node.step_type === 'read_barcode') {
          const result = await executeReadBarcode(node, contextData, supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId);
          stepOutputData = result.stepOutput;

        } else if (node.step_type === 'data_transform') {
          stepOutputData = executeDataTransform(node, contextData);

        } else if (node.step_type === 'inbox') {
          const inboxConfig = node.config_json || {};
          const inboxLabel = inboxConfig.label || contextData.extractionTypeName || 'Inbox Review';

          let pdfStoragePath: string | null = contextData.pdfStoragePath || null;

          if (!pdfStoragePath && contextData.pdfBase64) {
            try {
              const pdfBytes = Uint8Array.from(atob(contextData.pdfBase64), c => c.charCodeAt(0));
              const storagePath = `inbox/${requestData.workflowId}/${executionLogId || crypto.randomUUID()}.pdf`;
              const uploadResp = await fetch(
                `${supabaseUrl}/storage/v1/object/pdfs/${storagePath}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/pdf',
                    'x-upsert': 'true'
                  },
                  body: pdfBytes
                }
              );
              if (uploadResp.ok) {
                pdfStoragePath = storagePath;
              }
            } catch (uploadErr) {
              console.error('Inbox PDF upload error (non-fatal):', uploadErr);
            }
          }

          const inboxItemPayload = {
            workflow_id: requestData.workflowId,
            workflow_execution_log_id: executionLogId,
            extraction_log_id: extractionLogId,
            extraction_type_id: requestData.extractionTypeId || null,
            inbox_node_id: node.id,
            status: 'pending',
            context_data: contextData,
            extracted_data: contextData.extractedData || {},
            original_extracted_data: contextData.extractedData || {},
            pdf_storage_path: pdfStoragePath,
            pdf_filename: contextData.pdfFilename || null,
            original_pdf_filename: contextData.originalPdfFilename || null,
            trigger_source: requestData.triggerSource || null,
            sender_email: contextData.senderEmail || null,
            extraction_type_name: contextData.extractionTypeName || inboxLabel,
            format_type: contextData.formatType || 'JSON',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          let inboxItemId: string | null = null;
          try {
            const inboxResp = await fetch(`${supabaseUrl}/rest/v1/inbox_items`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey,
                'Prefer': 'return=representation'
              },
              body: JSON.stringify(inboxItemPayload)
            });
            if (inboxResp.ok) {
              const inboxData = await inboxResp.json();
              inboxItemId = inboxData[0]?.id || null;

              // Send optional inbox arrival notification (fire-and-forget)
              if (inboxConfig.notifyEmails && inboxItemId) {
                try {
                  const notifyEmails = (inboxConfig.notifyEmails as string).split(',').map((e: string) => e.trim()).filter(Boolean);
                  if (notifyEmails.length > 0) {
                    const notifySubject = `New Inbox Item: ${inboxLabel}`;
                    const notifyBody = [
                      `A new item is waiting for review in your Inbox.`,
                      ``,
                      `Type: ${contextData.extractionTypeName || 'Unknown'}`,
                      `File: ${contextData.pdfFilename || 'N/A'}`,
                      `Source: ${requestData.triggerSource || 'Manual'}`,
                      contextData.senderEmail ? `Sender: ${contextData.senderEmail}` : '',
                      ``,
                      `Please log in to review and accept or reject this item.`
                    ].filter(Boolean).join('\n');

                    // Fetch notification template config (email credentials)
                    const ntResp = await fetch(
                      `${supabaseUrl}/rest/v1/notification_templates?select=*&limit=1`,
                      { headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey } }
                    );
                    if (ntResp.ok) {
                      const templates = await ntResp.json();
                      const nt = templates[0];
                      if (nt?.provider === 'office365' && nt?.smtp_username && nt?.smtp_password) {
                        const { sendOffice365Email } = await import("./steps/emailProviders.ts");
                        for (const email of notifyEmails) {
                          sendOffice365Email(nt.smtp_username, nt.smtp_password, nt.from_email || nt.smtp_username, email, notifySubject, notifyBody, nt.tenant_id).catch((e: any) => console.error('Inbox notification email failed:', e.message));
                        }
                      } else if (nt?.provider === 'gmail' && nt?.smtp_username && nt?.smtp_password) {
                        const { sendGmailEmail } = await import("./steps/emailProviders.ts");
                        for (const email of notifyEmails) {
                          sendGmailEmail(nt.smtp_username, nt.smtp_password, nt.from_email || nt.smtp_username, email, notifySubject, notifyBody).catch((e: any) => console.error('Inbox notification email failed:', e.message));
                        }
                      }
                    }
                  }
                } catch (notifyErr) {
                  console.error('Inbox arrival notification error (non-fatal):', notifyErr);
                }
              }
            } else {
              const errText = await inboxResp.text();
              throw new Error(`Failed to create inbox item: ${errText}`);
            }
          } catch (inboxErr: any) {
            throw new Error(`Inbox step failed: ${inboxErr.message}`);
          }

          stepOutputData = { paused: true, inboxItemId, pdfStoragePath };

          const stepEndTime = new Date().toISOString();
          const stepDurationMs = Date.now() - stepStartMs;
          if (executionLogId) {
            await createV2StepLog(supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId, node, 'paused', stepStartTime, stepEndTime, stepDurationMs, undefined, { config: node.config_json }, stepOutputData, contextData);
            await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
              status: 'paused_at_inbox',
              context_data: contextData,
              updated_at: new Date().toISOString()
            });
          }

          return new Response(JSON.stringify({
            success: true,
            message: `Workflow paused at inbox step: ${inboxLabel}`,
            workflowExecutionLogId: executionLogId,
            extractionLogId: extractionLogId,
            inboxItemId: inboxItemId,
            pausedAtInbox: true,
            finalData: contextData
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        } else if (node.step_type === 'user_message') {
          const messageTemplate = node.config_json?.messageTemplate || '';
          const resolvedMessage = resolveUserResponseTemplate(messageTemplate, contextData) || '';
          contextData.userMessage = resolvedMessage;
          stepOutputData = { userMessage: resolvedMessage };

          if (requestData.triggerSource === 'email_monitoring') {
            console.log(`[USER_MESSAGE] Halting workflow - user_message reached during email_monitoring. Message: "${resolvedMessage}"`);
            const stepEndTime = new Date().toISOString();
            const stepDurationMs = Date.now() - stepStartMs;
            if (executionLogId) {
              await createV2StepLog(supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId, node, 'completed', stepStartTime, stepEndTime, stepDurationMs, undefined, { config: node.config_json }, stepOutputData, contextData);
              await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
                status: 'completed',
                context_data: contextData,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
            return new Response(JSON.stringify({
              success: true,
              message: `Workflow halted at user_message step: ${resolvedMessage}`,
              workflowExecutionLogId: executionLogId,
              extractionLogId: extractionLogId,
              finalData: contextData,
              haltedAtUserMessage: true,
              userMessage: resolvedMessage
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

        } else {
          stepOutputData = { skipped: true, reason: 'Step type not implemented' };
        }

        const stepEndTime = new Date().toISOString();
        const stepDurationMs = Date.now() - stepStartMs;

        if (executionLogId && node.step_type !== 'ai_decision' && node.step_type !== 'read_email' && node.step_type !== 'read_barcode') {
          let stepInputData: any;
          if (node.step_type === 'api_call') {
            stepInputData = { config: node.config_json, extractedData: contextData.extractedData, resolvedRequestBody: apiCallResolvedBody };
          } else if (node.step_type === 'api_endpoint') {
            stepInputData = { config: node.config_json, resolvedRequestDetails: apiEndpointResolvedDetails, resolvedRequestBody: apiEndpointResolvedBody };
          } else {
            stepInputData = { config: node.config_json };
          }
          await createV2StepLog(supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId, node, 'completed', stepStartTime, stepEndTime, stepDurationMs, undefined, stepInputData, stepOutputData, contextData);
        }

      } catch (stepError: any) {
        const stepEndTime = new Date().toISOString();
        const stepDurationMs = Date.now() - stepStartMs;
        console.error(`Node ${node.label} failed:`, stepError.message);

        if (executionLogId) {
          const errorOutputData = (node.step_type === 'api_endpoint' && stepError.outputData) ? stepError.outputData : stepOutputData;
          let errorInputData: any;
          if (node.step_type === 'api_call') {
            errorInputData = { config: node.config_json, extractedData: contextData.extractedData };
          } else if (node.step_type === 'api_endpoint') {
            const resolvedDetails = apiEndpointResolvedDetails || stepError.resolvedRequestDetails;
            const resolvedBody = apiEndpointResolvedBody || stepError.resolvedRequestBody;
            errorInputData = { config: node.config_json, resolvedRequestDetails: resolvedDetails, resolvedRequestBody: resolvedBody };
          } else {
            errorInputData = { config: node.config_json };
          }
          await createV2StepLog(supabaseUrl, supabaseServiceKey, executionLogId, requestData.workflowId, node, 'failed', stepStartTime, stepEndTime, stepDurationMs, stepError.message, errorInputData, errorOutputData, contextData);

          await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
            status: 'failed',
            error_message: stepError.message,
            context_data: contextData,
            updated_at: new Date().toISOString()
          });
        }

        const error: any = new Error(stepError.message);
        error.workflowExecutionLogId = executionLogId;
        error.extractionLogId = extractionLogId;
        throw error;
      }

      currentNodeId = getNextNodeId(edgeMap, node.id, nextHandle);
    }

    if (executionLogId) {
      await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
        status: 'completed',
        context_data: contextData,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (requestData.extractionTypeId) {
      try {
        await sendSuccessNotificationIfEnabled(supabaseUrl, supabaseServiceKey, requestData.extractionTypeId, contextData, executionLogId);
      } catch (notifError: any) {
        console.error('Success notification error (non-fatal):', notifError.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'V2 workflow executed successfully',
      workflowExecutionLogId: executionLogId,
      extractionLogId: extractionLogId,
      finalData: contextData,
      lastApiResponse: lastApiResponse,
      actualFilename: contextData.actualFilename || contextData.renamedFilename
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("V2 workflow execution error:", error.message);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (executionLogId) {
      try {
        await updateV2ExecutionLog(supabaseUrl, supabaseServiceKey, executionLogId, {
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString()
        });
      } catch (_updateError) { /* best effort */ }
    }

    if (outerExtractionTypeId) {
      try {
        await sendFailureNotificationIfEnabled(supabaseUrl, supabaseServiceKey, outerExtractionTypeId, error.message, outerContextData || {}, executionLogId);
      } catch (notifError: any) {
        console.error('Failure notification error (non-fatal):', notifError.message);
      }
    }

    return new Response(JSON.stringify({
      error: "V2 workflow execution failed",
      details: error instanceof Error ? error.message : "Unknown error",
      workflowExecutionLogId: executionLogId,
      extractionLogId: extractionLogId
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
