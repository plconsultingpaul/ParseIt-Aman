import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "./config/cors.ts";
import type { FlowNode, FlowEdge } from "./types/index.ts";
import { getValueByPath, replaceVariables } from "./utils/objectPaths.ts";
import { createExecutionLog, finalizeExecutionLog, logStepExecution } from "./db/logs.ts";
import { buildExecutionOrder } from "./engine/flowBuilder.ts";
import { executeApiCall } from "./actions/apiCall.ts";
import { executeApiEndpoint } from "./actions/apiEndpoint.ts";
import { executeConditionalCheck } from "./actions/conditionalCheck.ts";
import { executeAiLookup } from "./actions/aiLookup.ts";
import { executeGooglePlacesLookup } from "./actions/googlePlaces.ts";
import { executeEmailAction } from "./actions/emailAction.ts";
import { executeDataTransform } from "./actions/dataTransform.ts";
import { executeRoute } from "./actions/route.ts";
import { executeForEachLoop, collectLoopBodyNodeIds, initOrAdvanceForEach, findActiveForEachContaining } from "./actions/forEachLoop.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const requestData = await req.json();
    const { buttonId, executeParameters, userId, flowNodeId, continueFromNode, userConfirmationResponse, userConfirmationOptionIndex, userInputResponse, userInformationAcknowledged, userSelectionChoice, pendingContextData, currentGroupNodeId, existingContextData, flowLanguage } = requestData;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const callerToken = authHeader.replace("Bearer ", "");

    let isQrEnabledButton = false;
    if (buttonId) {
      const qrCheckRes = await fetch(`${supabaseUrl}/rest/v1/execute_buttons?id=eq.${buttonId}&select=qr_code_enabled`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      });
      if (qrCheckRes.ok) {
        const qrButtons = await qrCheckRes.json();
        isQrEnabledButton = qrButtons?.[0]?.qr_code_enabled === true;
      }
    }

    let callerEmail: string | null = null;
    let callerUsername: string | null = null;
    let authCallerId: string | null = null;

    if (!isQrEnabledButton) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${callerToken}` } } }
      );
      const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
      if (callerError || !caller) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerEmail = caller.email ?? null;
      authCallerId = caller.id;
    }

    const lookupId = userId || authCallerId;
    if (lookupId) {
      try {
        const userLookupUrl = `${supabaseUrl}/rest/v1/users?id=eq.${lookupId}&select=id,username,email`;
        const userRes = await fetch(userLookupUrl, {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData?.[0]) {
            callerUsername = userData[0].username || null;
            if (!callerEmail) callerEmail = userData[0].email || null;
          }
        }
      } catch (lookupErr) {
      }
    }

    if (!buttonId) {
      throw new Error('Button ID is required');
    }

    const buttonResponse = await fetch(`${supabaseUrl}/rest/v1/execute_buttons?id=eq.${buttonId}`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    });

    if (!buttonResponse.ok) {
      throw new Error('Failed to fetch button details');
    }

    const buttons = await buttonResponse.json();
    if (!buttons?.length) {
      throw new Error('Button not found');
    }

    const button = buttons[0];

    let extractionLogId: string | null = pendingContextData?._extractionLogId || existingContextData?._extractionLogId || null;
    let executionLogId: string | null = pendingContextData?._executionLogId || existingContextData?._executionLogId || null;
    const isContinuation = !!(executionLogId || pendingContextData || existingContextData);

    if (!isContinuation) {
      const logIds = await createExecutionLog(supabaseUrl, supabaseServiceKey, buttonId, button.name, userId, button.has_flow);
      extractionLogId = logIds.extractionLogId;
      executionLogId = logIds.executionLogId;
    }

    if (button.has_flow) {
      const [nodesRes, edgesRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/execute_button_flow_nodes?button_id=eq.${buttonId}`, {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        }),
        fetch(`${supabaseUrl}/rest/v1/execute_button_flow_edges?button_id=eq.${buttonId}`, {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        })
      ]);

      if (!nodesRes.ok || !edgesRes.ok) {
        throw new Error('Failed to fetch flow data');
      }

      const flowNodes: FlowNode[] = await nodesRes.json();
      const flowEdges: FlowEdge[] = await edgesRes.json();

      const executionOrder = buildExecutionOrder(flowNodes, flowEdges);


      let startIndex = 0;
      let skipCurrentGroup = false;
      let processedAtLeastOneStep = false;
      let contextData: any;

      if (currentGroupNodeId) {
        const groupIndex = executionOrder.findIndex(n => n.id === currentGroupNodeId);
        if (groupIndex !== -1) {
          const groupNode = executionOrder[groupIndex];
          const groupLogStartedAt = new Date().toISOString();
          await logStepExecution(supabaseUrl, supabaseServiceKey, executionLogId, buttonId, groupNode.id, groupNode.label, 'form_group', 'completed', groupLogStartedAt, null, null, { formData: executeParameters || {} });

          const nextEdge = flowEdges.find(e => e.source_node_id === currentGroupNodeId);
          if (nextEdge) {
            const targetIdx = executionOrder.findIndex(n => n.id === nextEdge.target_node_id);
            if (targetIdx !== -1) {
              startIndex = targetIdx;
            } else {
              startIndex = groupIndex + 1;
            }
          } else {
            startIndex = groupIndex + 1;
          }

          skipCurrentGroup = true;
          processedAtLeastOneStep = true;
        }
      } else if (continueFromNode) {
        startIndex = executionOrder.findIndex(n => n.id === continueFromNode);
        if (startIndex === -1) startIndex = 0;
      }

      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      if (pendingContextData?.contextData) {
        contextData = pendingContextData.contextData;
        if (executeParameters) {
          contextData.execute = { ...contextData.execute, ...executeParameters };
        }
      } else if (existingContextData) {
        contextData = { ...existingContextData };
        if (executeParameters) {
          contextData.execute = { ...contextData.execute, ...executeParameters };
        }
        if (currentGroupNodeId) {
          // Preserve contextData.response across group pauses (see md/2026-04-30)
        }
      } else {
        contextData = {
          execute: executeParameters || {},
          userId,
          user: { username: callerUsername || null, email: callerEmail },
          buttonId,
          buttonName: button.name,
          timestamp,
          ...executeParameters
        };
      }

      if (userConfirmationResponse !== undefined && pendingContextData) {
        const confirmationNodeId = pendingContextData.confirmationNodeId;
        const confirmationNodeIndex = executionOrder.findIndex(n => n.id === confirmationNodeId);
        const confirmationNode = executionOrder[confirmationNodeIndex];

        if (confirmationNode) {
          const optionIdx = userConfirmationOptionIndex !== undefined ? userConfirmationOptionIndex : (userConfirmationResponse === true ? 0 : 1);
          const handleId = `option_${optionIdx}`;

          let matchedEdge = flowEdges.find(e => e.source_node_id === confirmationNodeId && e.source_handle === handleId);

          if (!matchedEdge) {
            if (optionIdx === 0) {
              matchedEdge = flowEdges.find(e => e.source_node_id === confirmationNodeId && e.source_handle === 'success');
            } else if (optionIdx === 1) {
              matchedEdge = flowEdges.find(e => e.source_node_id === confirmationNodeId && e.source_handle === 'failure');
            }
          }

          if (matchedEdge) {
            contextData.lastEdgeHandle = matchedEdge.source_handle;
            const targetIdx = executionOrder.findIndex(n => n.id === matchedEdge!.target_node_id);
            if (targetIdx !== -1) {
              startIndex = targetIdx;

              // When looping back to an earlier node, clear stale contextData.response keys
              // that were set by API endpoint nodes at or after the target index.
              // This prevents response data from iteration N from bleeding into iteration N+1.
              if (targetIdx < confirmationNodeIndex && contextData.response) {
                const keysToPreserve = new Set<string>();
                for (let k = 0; k < targetIdx; k++) {
                  const prevNode = executionOrder[k];
                  if (prevNode.node_type === 'workflow' && prevNode.step_type === 'api_endpoint') {
                    const mappings = (prevNode.config_json || {}).responseDataMappings || [];
                    for (const m of mappings) {
                      if (m.updatePath) keysToPreserve.add(m.updatePath);
                    }
                  }
                }
                const responseKeys = Object.keys(contextData.response);
                for (const key of responseKeys) {
                  if (!keysToPreserve.has(key)) {
                    delete contextData.response[key];
                  }
                }
              }
            }
          } else {
            return new Response(JSON.stringify({
              success: true,
              buttonName: button.name,
              isFlowBased: true,
              stepsExecuted: 0,
              results: [],
              flowComplete: true,
              message: 'User responded - no next step defined for this option'
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        processedAtLeastOneStep = true;
      }

      if (userInputResponse && pendingContextData) {
        const inputNodeId = pendingContextData.inputNodeId;
        if (!contextData.execute) contextData.execute = {};
        if (!contextData.execute.input) contextData.execute.input = {};
        let parsedValue = userInputResponse.value;
        if (typeof parsedValue === 'string') {
          try {
            const parsed = JSON.parse(parsedValue);
            if (typeof parsed === 'object' && parsed !== null) {
              parsedValue = parsed;
            }
          } catch {}
        }
        contextData.execute.input[userInputResponse.variableName] = parsedValue;

        const nextEdge = flowEdges.find(e => e.source_node_id === inputNodeId);
        if (nextEdge) {
          const targetIdx = executionOrder.findIndex(n => n.id === nextEdge.target_node_id);
          if (targetIdx !== -1) {
            startIndex = targetIdx;
          }
        }
        processedAtLeastOneStep = true;
      }

      if (userInformationAcknowledged && pendingContextData) {
        const infoNodeId = pendingContextData.informationNodeId;

        const nextEdge = flowEdges.find(e => e.source_node_id === infoNodeId);
        if (nextEdge) {
          const targetIdx = executionOrder.findIndex(n => n.id === nextEdge.target_node_id);
          if (targetIdx !== -1) {
            startIndex = targetIdx;
          }
        }
        processedAtLeastOneStep = true;
      }

      if (userSelectionChoice && pendingContextData) {
        const selectionNodeId = pendingContextData.userSelectionNodeId;
        const selectionNode = executionOrder.find(n => n.id === selectionNodeId);
        const selConfig = selectionNode?.config_json || {};
        const itemVar = selConfig.itemVariable || 'item';


        contextData._userSelections = contextData._userSelections || {};
        const prior = contextData._userSelections[selectionNodeId] || { consumedIndices: [] };
        const consumedIndices = Array.isArray(prior.consumedIndices) ? [...prior.consumedIndices] : [];
        if (typeof userSelectionChoice.idx === 'number' && !consumedIndices.includes(userSelectionChoice.idx)) {
          consumedIndices.push(userSelectionChoice.idx);
        }
        contextData._userSelections[selectionNodeId] = { consumedIndices };

        contextData.forEach = contextData.forEach || {};
        contextData.forEach[itemVar] = userSelectionChoice.item;
        contextData.forEach._index = userSelectionChoice.idx;

        // Narrow all array-typed response mappings to the selected index
        const selectedIdx = userSelectionChoice.idx;
        if (typeof selectedIdx === 'number' && contextData.response) {
          for (const [key, value] of Object.entries(contextData.response)) {
            if (Array.isArray(value) && selectedIdx < value.length) {
              (contextData.response as Record<string, any>)[key] = value[selectedIdx];
            }
          }
        }

        if (contextData._forEachLoops) {
          for (const loopNodeId of Object.keys(contextData._forEachLoops)) {
            const st = contextData._forEachLoops[loopNodeId];
            if (st && st.itemVariable === itemVar) {
              st.consumedIndices = consumedIndices;
            }
          }
        }

        const nextEdge = flowEdges.find(e => e.source_node_id === selectionNodeId);
        if (nextEdge) {
          const targetIdx = executionOrder.findIndex(n => n.id === nextEdge.target_node_id);
          if (targetIdx !== -1) {
            startIndex = targetIdx;
          }
        }
        processedAtLeastOneStep = true;
      }

      const stepResults: any[] = [];
      let nextGroupNode: FlowNode | null = null;

      for (let i = startIndex; i < executionOrder.length; i++) {
        const node = executionOrder[i];

        if (node.node_type === 'group') {
          if (!processedAtLeastOneStep && stepResults.length === 0 && currentGroupNodeId) {
            const initialGroupLogStartedAt = new Date().toISOString();
            await logStepExecution(supabaseUrl, supabaseServiceKey, executionLogId, buttonId, node.id, node.label, 'form_group', 'completed', initialGroupLogStartedAt, null, null, { formData: executeParameters || {} });
            continue;
          }
          nextGroupNode = node;
          break;
        }

        if (node.node_type === 'workflow' && node.step_type) {
          const stepStartedAt = new Date().toISOString();

          const step = {
            step_name: node.label,
            step_type: node.step_type,
            config_json: node.config_json || {},
            step_order: i
          };

          try {
            let stepOutput: any = null;

            switch (node.step_type) {
              case 'api_call':
                stepOutput = await executeApiCall(step, contextData);
                break;

              case 'api_endpoint': {
                const responseBefore = contextData.response ? JSON.parse(JSON.stringify(contextData.response)) : {};
                stepOutput = await executeApiEndpoint(step, contextData, supabaseUrl, supabaseServiceKey);
                const responseAfter = contextData.response || {};
                const mappingsConfig = (step.config_json || {}).responseDataMappings || [];
                if (mappingsConfig.length > 0) {
                  const newMappings: Record<string, any> = {};
                  for (const [key, val] of Object.entries(responseAfter)) {
                    if (!(key in responseBefore) || JSON.stringify(responseBefore[key]) !== JSON.stringify(val)) {
                      newMappings[key] = val;
                    }
                  }
                  if (Object.keys(newMappings).length > 0) {
                    stepOutput = { ...stepOutput, _responseDataMappings: newMappings };
                  } else {
                    const computedMappings: Record<string, any> = {};
                    for (const mapping of mappingsConfig) {
                      if (mapping.responsePath && mapping.updatePath) {
                        const val = getValueByPath(stepOutput, mapping.responsePath);
                        computedMappings[mapping.updatePath] = val !== undefined ? val : null;
                      }
                    }
                    stepOutput = { ...stepOutput, _responseDataMappings: computedMappings };
                  }
                }
                if (stepOutput?.skipRemainingLoopSteps) {
                  const active = findActiveForEachContaining(node.id, contextData, flowEdges, executionOrder);
                  if (active) {
                    console.log('[RESPONSE_TRANSFORM] skipIfEmpty: jumping back to for_each driver to advance iteration');
                    i = active.forEachIdx - 1;
                    stepResults.push({ node: node.label, status: 'completed', output: stepOutput });
                    await logStepExecution(supabaseUrl, supabaseServiceKey, executionLogId, buttonId, node.id, node.label, node.step_type || '', 'completed', stepStartedAt, null, { config: step.config_json }, stepOutput);
                    continue;
                  } else {
                    console.log('[RESPONSE_TRANSFORM] skipIfEmpty: no active for_each — flag ignored');
                  }
                }
                break;
              }

              case 'conditional_check':
                stepOutput = await executeConditionalCheck(step, contextData);
                console.log(`[DECISION_BRANCH] conditionMet=${stepOutput.conditionMet}, fieldPath="${stepOutput.fieldPath}", operator="${stepOutput.operator}", actualValue="${stepOutput.actualValue}", expectedValue="${stepOutput.expectedValue}"`);
                console.log(`[DECISION_BRANCH] Current node: "${node.label}" (id=${node.id}), current index i=${i}`);
                console.log(`[DECISION_BRANCH] All flowEdges from this node:`, JSON.stringify(flowEdges.filter(e => e.source_node_id === node.id)));
                console.log(`[DECISION_BRANCH] executionOrder:`, executionOrder.map((n, idx) => `[${idx}] ${n.label} (${n.id})`));
                if (stepOutput.conditionMet) {
                  const successEdge = flowEdges.find(e => e.source_node_id === node.id && e.source_handle === 'success');
                  const failureEdge = flowEdges.find(e => e.source_node_id === node.id && e.source_handle === 'failure');
                  console.log(`[DECISION_BRANCH] Condition TRUE -> looking for SUCCESS edge. Found:`, successEdge ? `target=${successEdge.target_node_id}` : 'NONE');
                  if (successEdge) {
                    contextData.lastEdgeHandle = 'success';
                    const targetIdx = executionOrder.findIndex(n => n.id === successEdge.target_node_id);
                    const targetNode = targetIdx !== -1 ? executionOrder[targetIdx] : null;
                    console.log(`[DECISION_BRANCH] SUCCESS target index=${targetIdx}, targetNode="${targetNode?.label}", current i=${i}, will jump=${targetIdx !== -1 && targetIdx > i}`);
                    if (targetIdx !== -1 && targetIdx > i) {
                      i = targetIdx - 1;
                      console.log(`[DECISION_BRANCH] Jumping i to ${i} (will process index ${i + 1} next)`);
                    } else if (targetIdx !== -1 && targetNode?.step_type === 'user_confirmation') {
                      i = targetIdx - 1;
                      console.log(`[DECISION_BRANCH] Target is behind current position but is user_confirmation — jumping back to index ${targetIdx} ("${targetNode?.label}")`);
                    } else if (targetIdx !== -1 && targetNode?.node_type === 'group') {
                      i = targetIdx - 1;
                      console.log(`[DECISION_BRANCH] Target is behind current position but is group node — jumping back to index ${targetIdx} ("${targetNode?.label}")`);
                    } else {
                      // Target is behind current position — skip past the other branch's nodes
                      const otherTargetIdx = failureEdge ? executionOrder.findIndex(n => n.id === failureEdge.target_node_id) : -1;
                      let skipToIdx = -1;
                      if (otherTargetIdx !== -1 && otherTargetIdx > i) {
                        for (let j = otherTargetIdx; j < executionOrder.length; j++) {
                          if (executionOrder[j].step_type === 'exit') {
                            skipToIdx = j;
                            break;
                          }
                        }
                      }
                      if (skipToIdx !== -1) {
                        i = skipToIdx;
                        console.log(`[DECISION_BRANCH] Target is behind current position — skipping past exit node at index ${skipToIdx} ("${executionOrder[skipToIdx]?.label}"), will process index ${i + 1} next`);
                      } else {
                        console.log(`[DECISION_BRANCH] Target is behind current position, no exit node found — ending flow`);
                        i = executionOrder.length;
                      }
                    }
                  } else {
                    console.log(`[DECISION_BRANCH] No success edge found — ending flow`);
                    i = executionOrder.length;
                  }
                } else {
                  const failureEdge = flowEdges.find(e => e.source_node_id === node.id && e.source_handle === 'failure');
                  const successEdge = flowEdges.find(e => e.source_node_id === node.id && e.source_handle === 'success');
                  console.log(`[DECISION_BRANCH] Condition FALSE -> looking for FAILURE edge. Found:`, failureEdge ? `target=${failureEdge.target_node_id}` : 'NONE');
                  if (failureEdge) {
                    contextData.lastEdgeHandle = 'failure';
                    const targetIdx = executionOrder.findIndex(n => n.id === failureEdge.target_node_id);
                    const targetNode = targetIdx !== -1 ? executionOrder[targetIdx] : null;
                    console.log(`[DECISION_BRANCH] FAILURE target index=${targetIdx}, targetNode="${targetNode?.label}", current i=${i}, will jump=${targetIdx !== -1 && targetIdx > i}`);
                    if (targetIdx !== -1 && targetIdx > i) {
                      i = targetIdx - 1;
                      console.log(`[DECISION_BRANCH] Jumping i to ${i} (will process index ${i + 1} next)`);
                    } else if (targetIdx !== -1 && targetNode?.step_type === 'user_confirmation') {
                      i = targetIdx - 1;
                      console.log(`[DECISION_BRANCH] Target is behind current position but is user_confirmation — jumping back to index ${targetIdx} ("${targetNode?.label}")`);
                    } else if (targetIdx !== -1 && targetNode?.node_type === 'group') {
                      i = targetIdx - 1;
                      console.log(`[DECISION_BRANCH] Target is behind current position but is group node — jumping back to index ${targetIdx} ("${targetNode?.label}")`);
                    } else {
                      // Target is behind current position — skip past the other branch's nodes
                      const otherTargetIdx = successEdge ? executionOrder.findIndex(n => n.id === successEdge.target_node_id) : -1;
                      let skipToIdx = -1;
                      if (otherTargetIdx !== -1 && otherTargetIdx > i) {
                        for (let j = otherTargetIdx; j < executionOrder.length; j++) {
                          if (executionOrder[j].step_type === 'exit') {
                            skipToIdx = j;
                            break;
                          }
                        }
                      }
                      if (skipToIdx !== -1) {
                        i = skipToIdx;
                        console.log(`[DECISION_BRANCH] Target is behind current position — skipping past exit node at index ${skipToIdx} ("${executionOrder[skipToIdx]?.label}"), will process index ${i + 1} next`);
                      } else {
                        console.log(`[DECISION_BRANCH] Target is behind current position, no exit node found — ending flow`);
                        i = executionOrder.length;
                      }
                    }
                  } else {
                    console.log(`[DECISION_BRANCH] No failure edge found — ending flow`);
                    i = executionOrder.length;
                  }
                }
                break;

              case 'email_action':
                stepOutput = await executeEmailAction(step, contextData, supabaseUrl, supabaseServiceKey);
                break;

              case 'ai_lookup':
                stepOutput = await executeAiLookup(step, contextData, supabaseUrl, supabaseServiceKey);
                break;

              case 'google_places_lookup':
                stepOutput = await executeGooglePlacesLookup(step, contextData, supabaseUrl, supabaseServiceKey);
                break;

              case 'data_transform':
                stepOutput = executeDataTransform(step, contextData);
                break;

              case 'for_each': {
                const decision = initOrAdvanceForEach(node, contextData, flowEdges, executionOrder);
                stepOutput = {
                  loop_type: 'for_each',
                  action: decision.action,
                  itemIndex: decision.state.itemIndex,
                  total: decision.state.total,
                };

                if (decision.action === 'enter_body') {
                  if (decision.loopBodyStartIdx !== -1) {
                    i = decision.loopBodyStartIdx - 1;
                  } else {
                    i = executionOrder.length;
                  }
                } else {
                  // 'done' or 'empty' — follow the done edge
                  if (decision.doneTargetIdx !== -1) {
                    i = decision.doneTargetIdx - 1;
                  } else {
                    i = executionOrder.length;
                  }
                }
                break;
              }

              case 'route': {
                const routeResult = executeRoute(step, contextData);
                stepOutput = routeResult.stepOutput;

                if (routeResult.matchedRouteIndex >= 0 && routeResult.handleId) {
                  const matchedEdge = flowEdges.find(e => e.source_node_id === node.id && e.source_handle === routeResult.handleId);
                  if (matchedEdge) {
                    contextData.lastEdgeHandle = routeResult.handleId;
                    const targetIdx = executionOrder.findIndex(n => n.id === matchedEdge.target_node_id);
                    if (targetIdx !== -1 && targetIdx > i) {
                      i = targetIdx - 1;
                    }
                  } else {
                    i = executionOrder.length;
                  }
                } else {
                  i = executionOrder.length;
                }
                break;
              }

              case 'user_input': {
                const config = step.config_json || {};

                let renderContext = contextData;
                const loopIdx = contextData?.forEach?._index;
                const templatesCombined = String(config.userResponseTemplate || '') + String(config.inputLabel || '');
                const usesLoopIndex = /@loopIndex/.test(templatesCombined);
                if (config.currentLoopItemOnly === true && typeof loopIdx === 'number' && !usesLoopIndex) {
                  const indexedResponse: Record<string, any> = {};
                  const src = contextData.response || {};
                  for (const k of Object.keys(src)) {
                    const v = src[k];
                    indexedResponse[k] = Array.isArray(v) && loopIdx >= 0 && loopIdx < v.length ? v[loopIdx] : v;
                  }
                  renderContext = { ...contextData, response: indexedResponse };
                }

                const inputLabel = replaceVariables(config.inputLabel || 'Provide Input', renderContext);
                const userResponseMessage = config.userResponseTemplate
                  ? replaceVariables(String(config.userResponseTemplate), renderContext)
                  : '';
                const inputTranslations = config.translations ? {
                  fr: { inputLabel: replaceVariables(config.translations.fr?.inputLabel || '', contextData) },
                  es: { inputLabel: replaceVariables(config.translations.es?.inputLabel || '', contextData) },
                } : undefined;

                return new Response(JSON.stringify({
                  success: true,
                  requiresInput: true,
                  inputData: {
                    nodeId: node.id,
                    nodeLabel: node.label,
                    inputType: config.inputType || 'barcode_scanner',
                    inputLabel,
                    userResponseMessage,
                    variableName: config.variableName || 'userInputValue',
                    translations: inputTranslations,
                    ...(config.allowMultipleScans && {
                      allowMultipleScans: true,
                    }),
                    ...(config.signaturePopupEnabled && {
                      signaturePopupEnabled: true,
                      signaturePopupText: replaceVariables(config.signaturePopupText || '', contextData),
                    }),
                  },
                  buttonName: button.name,
                  isFlowBased: true,
                  stepsExecuted: stepResults.length,
                  results: stepResults,
                  pendingContextData: {
                    inputNodeId: node.id,
                    contextData,
                    pendingNodeIndex: i,
                    _extractionLogId: extractionLogId,
                    _executionLogId: executionLogId
                  },
                  executionOrderLength: executionOrder.length
                }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              case 'user_confirmation': {
                const config = step.config_json || {};
                let processedMessage = config.promptMessage || '';

                processedMessage = replaceVariables(processedMessage, contextData);
                processedMessage = processedMessage.replace(/\{\{[^}]+\}\}/g, '');

                let latitude: number | null = null;
                let longitude: number | null = null;
                if (config.showLocationMap && config.latitudeVariable && config.longitudeVariable) {
                  latitude = getValueByPath(contextData.execute, config.latitudeVariable)
                    ?? getValueByPath(contextData.response, config.latitudeVariable)
                    ?? getValueByPath(contextData, config.latitudeVariable);
                  longitude = getValueByPath(contextData.execute, config.longitudeVariable)
                    ?? getValueByPath(contextData.response, config.longitudeVariable)
                    ?? getValueByPath(contextData, config.longitudeVariable);
                }

                const options = config.options && Array.isArray(config.options) && config.options.length >= 2
                  ? config.options
                  : [{ label: config.yesButtonLabel || 'Yes' }, { label: config.noButtonLabel || 'No' }];

                return new Response(JSON.stringify({
                  success: true,
                  requiresConfirmation: true,
                  confirmationData: {
                    nodeId: node.id,
                    nodeLabel: node.label,
                    promptMessage: processedMessage,
                    options: options,
                    yesButtonLabel: options[0]?.label || 'Yes',
                    noButtonLabel: options[1]?.label || 'No',
                    showLocationMap: config.showLocationMap || false,
                    latitude: latitude,
                    longitude: longitude,
                    confirmationImageSource: config.confirmationImageSource || 'none',
                    confirmationCustomImageUrl: config.confirmationCustomImageUrl || '',
                    confirmationImageMaxHeight: config.confirmationImageMaxHeight || 80,
                  },
                  buttonName: button.name,
                  isFlowBased: true,
                  stepsExecuted: stepResults.length,
                  results: stepResults,
                  pendingContextData: {
                    confirmationNodeId: node.id,
                    contextData,
                    pendingNodeIndex: i,
                    _extractionLogId: extractionLogId,
                    _executionLogId: executionLogId
                  },
                  executionOrderLength: executionOrder.length
                }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              case 'user_information': {
                const config = step.config_json || {};

                const processedContent = replaceVariables(config.contentMarkdown || '', contextData);

                let processedTranslations: any = undefined;
                if ((config.enableLanguageSelection || (flowLanguage && flowLanguage !== 'en')) && config.translations) {
                  processedTranslations = {};
                  for (const lang of ['fr', 'es'] as const) {
                    const langData = config.translations[lang];
                    if (langData) {
                      processedTranslations[lang] = {
                        contentMarkdown: replaceVariables(langData.contentMarkdown || '', contextData),
                        continueButtonLabel: langData.continueButtonLabel || '',
                      };
                    }
                  }
                }

                return new Response(JSON.stringify({
                  success: true,
                  buttonName: button.name,
                  isFlowBased: true,
                  stepsExecuted: stepResults.length,
                  results: stepResults,
                  requiresUserInformation: true,
                  userInformationData: {
                    contentMarkdown: processedContent,
                    continueButtonLabel: config.continueButtonLabel || 'Continue',
                    imageSource: config.imageSource || 'none',
                    customImageUrl: config.customImageUrl || '',
                    imageMaxHeight: config.imageMaxHeight || 80,
                    contentAlignment: config.contentAlignment || 'left',
                    enableLanguageSelection: config.enableLanguageSelection || false,
                    enabledLanguages: config.enabledLanguages || ['fr', 'es'],
                    translations: processedTranslations,
                  },
                  pendingContextData: {
                    informationNodeId: node.id,
                    contextData,
                    pendingNodeIndex: i,
                    _extractionLogId: extractionLogId,
                    _executionLogId: executionLogId
                  },
                  contextData,
                  executionOrderLength: executionOrder.length
                }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              case 'user_selection': {
                const config = step.config_json || {};
                const sourceArrayPath = config.sourceArray || '';
                const itemVariable = config.itemVariable || 'item';

                const sourceArray = sourceArrayPath
                  ? (getValueByPath(contextData, sourceArrayPath)
                      ?? getValueByPath(contextData?.response, sourceArrayPath)
                      ?? getValueByPath(contextData?.execute, sourceArrayPath)
                      ?? [])
                  : [];
                const arr = Array.isArray(sourceArray) ? sourceArray : [];

                contextData._userSelections = contextData._userSelections || {};
                const selState = contextData._userSelections[node.id] || { consumedIndices: [], sourceSnapshot: null };
                let consumed: number[] = Array.isArray(selState.consumedIndices) ? selState.consumedIndices : [];

                // Reset consumed indices when the source array has changed (e.g., new API response from a loop-back)
                const currentSourceJson = JSON.stringify(arr);
                if (selState.sourceSnapshot && selState.sourceSnapshot !== currentSourceJson) {
                  console.log(`[USER_SELECTION] Source array changed for node "${node.label}", resetting consumed indices`);
                  consumed = [];
                  selState.consumedIndices = [];
                }
                selState.sourceSnapshot = currentSourceJson;
                contextData._userSelections[node.id] = selState;

                const remaining = arr
                  .map((item, idx) => ({ item, idx }))
                  .filter(x => !consumed.includes(x.idx));

                if (remaining.length === 0) {
                  // Nothing left to pick — follow next edge so the enclosing For Each can terminate
                  const nextEdge = flowEdges.find(e => e.source_node_id === node.id);
                  if (nextEdge) {
                    const targetIdx = executionOrder.findIndex(n => n.id === nextEdge.target_node_id);
                    if (targetIdx !== -1 && targetIdx > i) {
                      i = targetIdx - 1;
                    } else {
                      i = executionOrder.length;
                    }
                  } else {
                    i = executionOrder.length;
                  }
                  stepOutput = { userSelection: { skipped: true, reason: 'no_remaining_items' } };
                  break;
                }

                const promptText = replaceVariables(config.promptText || 'Select which record to process', contextData);
                const displayTemplate: string = config.displayTemplate || '';
                const options = remaining.map(({ item, idx }) => {
                  let label: string;
                  if (displayTemplate) {
                    const scope = {
                      ...contextData,
                      item,
                      [itemVariable]: item,
                      _index: idx,
                      index: idx,
                      forEach: {
                        ...(contextData.forEach || {}),
                        [itemVariable]: item,
                        _index: idx,
                        index: idx,
                      },
                    };
                    label = replaceVariables(displayTemplate, scope);
                  } else {
                    label = typeof item === 'object' ? JSON.stringify(item) : String(item);
                  }
                  return { idx, item, label };
                });

                return new Response(JSON.stringify({
                  success: true,
                  requiresUserSelection: true,
                  userSelectionData: {
                    nodeId: node.id,
                    nodeLabel: node.label,
                    promptText,
                    itemVariable,
                    options,
                  },
                  buttonName: button.name,
                  isFlowBased: true,
                  stepsExecuted: stepResults.length,
                  results: stepResults,
                  pendingContextData: {
                    userSelectionNodeId: node.id,
                    contextData,
                    pendingNodeIndex: i,
                    _extractionLogId: extractionLogId,
                    _executionLogId: executionLogId
                  },
                  executionOrderLength: executionOrder.length
                }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              case 'exit': {
                const config = step.config_json || {};
                let processedMessage = config.exitMessage || 'Flow completed.';

                processedMessage = replaceVariables(processedMessage, contextData);

                const exitTranslations = config.translations ? {
                  fr: { exitMessage: replaceVariables(config.translations.fr?.exitMessage || '', contextData) },
                  es: { exitMessage: replaceVariables(config.translations.es?.exitMessage || '', contextData) },
                } : undefined;

                await logStepExecution(supabaseUrl, supabaseServiceKey, executionLogId, buttonId, node.id, node.label, 'exit', 'completed', stepStartedAt, null, null, { exitMessage: processedMessage });
                await finalizeExecutionLog(supabaseUrl, supabaseServiceKey, extractionLogId, executionLogId, true, null, stepResults, contextData);

                return new Response(JSON.stringify({
                  success: true,
                  buttonName: button.name,
                  isFlowBased: true,
                  stepsExecuted: stepResults.length,
                  results: stepResults,
                  flowComplete: true,
                  exitData: {
                    exitMessage: processedMessage,
                    showRestartButton: config.showRestartButton || false,
                    imageSource: config.imageSource || 'none',
                    customImageUrl: config.customImageUrl || '',
                    imageMaxHeight: config.imageMaxHeight || 80,
                    translations: exitTranslations,
                  }
                }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }

              default:
                stepOutput = { warning: `Unknown step type: ${node.step_type}` };
            }

            stepResults.push({ node: node.label, status: 'completed', output: stepOutput });
            await logStepExecution(supabaseUrl, supabaseServiceKey, executionLogId, buttonId, node.id, node.label, node.step_type || '', 'completed', stepStartedAt, null, { config: step.config_json }, stepOutput);

            const nonBranchingSteps = ['api_call', 'api_endpoint', 'email_action', 'ai_lookup', 'google_places_lookup', 'data_transform'];
            if (nonBranchingSteps.includes(node.step_type || '')) {
              const outgoingEdge = flowEdges.find(e => e.source_node_id === node.id);
              if (outgoingEdge) {
                const targetIdx = executionOrder.findIndex(n => n.id === outgoingEdge.target_node_id);
                if (targetIdx !== -1) {
                  i = targetIdx - 1;
                }
              } else {
                i = executionOrder.length;
              }
            }

          } catch (stepError) {
            console.error(`Node ${node.label} failed:`, stepError);
            const stepErrMsg = stepError instanceof Error ? stepError.message : 'Unknown error';
            const errorResult: any = {
              node: node.label,
              status: 'failed',
              error: stepErrMsg
            };
            if (stepError && typeof stepError === 'object') {
              if ((stepError as any).requestUrl) {
                errorResult.requestUrl = (stepError as any).requestUrl;
              }
              if ((stepError as any).requestBody) {
                errorResult.requestBody = (stepError as any).requestBody;
              }
              if ((stepError as any).httpMethod) {
                errorResult.httpMethod = (stepError as any).httpMethod;
              }
              if ((stepError as any).debugInfo) {
                errorResult.debugInfo = (stepError as any).debugInfo;
              }
            }
            stepResults.push(errorResult);
            const flowErrorOutputData = (stepError && typeof stepError === 'object' && (stepError as any).debugInfo) ? { _apiEndpointDebug: (stepError as any).debugInfo } : null;
            await logStepExecution(supabaseUrl, supabaseServiceKey, executionLogId, buttonId, node.id, node.label, node.step_type || '', 'failed', stepStartedAt, stepErrMsg, { config: step.config_json }, flowErrorOutputData);
            await finalizeExecutionLog(supabaseUrl, supabaseServiceKey, extractionLogId, executionLogId, false, stepErrMsg, stepResults, contextData);
            return new Response(JSON.stringify({
              success: false,
              buttonName: button.name,
              isFlowBased: true,
              error: stepErrMsg,
              results: stepResults
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
      }


      if (!nextGroupNode) {
        await finalizeExecutionLog(supabaseUrl, supabaseServiceKey, extractionLogId, executionLogId, true, null, stepResults, contextData);
      }

      contextData._extractionLogId = extractionLogId;
      contextData._executionLogId = executionLogId;

      return new Response(JSON.stringify({
        success: true,
        buttonName: button.name,
        isFlowBased: true,
        stepsExecuted: stepResults.length,
        results: stepResults,
        nextGroupNode: nextGroupNode ? {
          id: nextGroupNode.id,
          label: nextGroupNode.label,
          groupId: nextGroupNode.group_id
        } : null,
        flowComplete: !nextGroupNode,
        contextData
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const stepsResponse = await fetch(`${supabaseUrl}/rest/v1/execute_button_steps?button_id=eq.${buttonId}&is_enabled=eq.true&order=step_order.asc`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    });

    if (!stepsResponse.ok) {
      throw new Error('Failed to fetch button steps');
    }

    const steps = await stepsResponse.json();

    if (steps.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No steps configured for this button',
        stepsExecuted: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const contextData: any = {
      execute: executeParameters || {},
      userId,
      user: { username: callerUsername || null, email: callerEmail },
      buttonId,
      buttonName: button.name,
      timestamp,
      ...executeParameters
    };

    let lastApiResponse: any = null;
    const stepResults: any[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const simpleStepStartedAt = new Date().toISOString();

      const config = step.config_json || {};
      let shouldSkip = false;

      if (config.skipIf) {
        const skipValue = getValueByPath(contextData.execute, config.skipIf) ?? getValueByPath(contextData, config.skipIf);
        if (skipValue === true) {
          shouldSkip = true;
        }
      }

      if (!shouldSkip && config.runIf) {
        const runValue = getValueByPath(contextData.execute, config.runIf) ?? getValueByPath(contextData, config.runIf);
        if (runValue !== true) {
          shouldSkip = true;
        }
      }

      if (shouldSkip) {
        stepResults.push({ step: step.step_name, status: 'skipped' });
        await logStepExecution(supabaseUrl!, supabaseServiceKey!, executionLogId, buttonId, step.id, step.step_name, step.step_type, 'skipped', simpleStepStartedAt, null, null, null);
        continue;
      }

      try {
        let stepOutput: any = null;

        switch (step.step_type) {
          case 'api_call':
            stepOutput = await executeApiCall(step, contextData);
            lastApiResponse = stepOutput;
            break;

          case 'api_endpoint': {
            const responseBefore2 = contextData.response ? JSON.parse(JSON.stringify(contextData.response)) : {};
            stepOutput = await executeApiEndpoint(step, contextData, supabaseUrl, supabaseServiceKey);
            const responseAfter2 = contextData.response || {};
            const mappingsConfig2 = (step.config_json || {}).responseDataMappings || [];
            if (mappingsConfig2.length > 0) {
              const newMappings2: Record<string, any> = {};
              for (const [key, val] of Object.entries(responseAfter2)) {
                if (!(key in responseBefore2) || JSON.stringify(responseBefore2[key]) !== JSON.stringify(val)) {
                  newMappings2[key] = val;
                }
              }
              if (Object.keys(newMappings2).length > 0) {
                stepOutput = { ...stepOutput, _responseDataMappings: newMappings2 };
              } else {
                const computedMappings2: Record<string, any> = {};
                for (const mapping of mappingsConfig2) {
                  if (mapping.responsePath && mapping.updatePath) {
                    const val = getValueByPath(stepOutput, mapping.responsePath);
                    computedMappings2[mapping.updatePath] = val !== undefined ? val : null;
                  }
                }
                stepOutput = { ...stepOutput, _responseDataMappings: computedMappings2 };
              }
            }
            lastApiResponse = stepOutput;
            break;
          }

          case 'conditional_check':
            stepOutput = await executeConditionalCheck(step, contextData);
            if (stepOutput.conditionMet && step.next_step_on_success_id) {
              const targetIdx = steps.findIndex((s: any) => s.id === step.next_step_on_success_id);
              if (targetIdx !== -1) i = targetIdx - 1;
            } else if (!stepOutput.conditionMet && step.next_step_on_failure_id) {
              const targetIdx = steps.findIndex((s: any) => s.id === step.next_step_on_failure_id);
              if (targetIdx !== -1) i = targetIdx - 1;
            }
            break;

          case 'email_action':
            stepOutput = await executeEmailAction(step, contextData, supabaseUrl, supabaseServiceKey);
            break;

          case 'ai_lookup':
            stepOutput = await executeAiLookup(step, contextData, supabaseUrl, supabaseServiceKey);
            break;

          case 'google_places_lookup':
            stepOutput = await executeGooglePlacesLookup(step, contextData, supabaseUrl, supabaseServiceKey);
            break;

          case 'data_transform':
            stepOutput = executeDataTransform(step, contextData);
            break;

          default:
            stepOutput = { warning: `Unknown step type: ${step.step_type}` };
        }

        stepResults.push({ step: step.step_name, status: 'completed', output: stepOutput });
        await logStepExecution(supabaseUrl!, supabaseServiceKey!, executionLogId, buttonId, step.id, step.step_name, step.step_type, 'completed', simpleStepStartedAt, null, { config: step.config_json }, stepOutput);

      } catch (stepError) {
        console.error(`Step ${step.step_order} failed:`, stepError);
        const simpleStepErrMsg = stepError instanceof Error ? stepError.message : 'Unknown error';
        const errorResult: any = {
          step: step.step_name,
          status: 'failed',
          error: simpleStepErrMsg
        };
        if (stepError && typeof stepError === 'object') {
          if ((stepError as any).requestUrl) {
            errorResult.requestUrl = (stepError as any).requestUrl;
          }
          if ((stepError as any).requestBody) {
            errorResult.requestBody = (stepError as any).requestBody;
          }
          if ((stepError as any).httpMethod) {
            errorResult.httpMethod = (stepError as any).httpMethod;
          }
          if ((stepError as any).debugInfo) {
            errorResult.debugInfo = (stepError as any).debugInfo;
          }
        }
        stepResults.push(errorResult);
        const simpleErrorOutputData = (stepError && typeof stepError === 'object' && (stepError as any).debugInfo) ? { _apiEndpointDebug: (stepError as any).debugInfo } : null;
        await logStepExecution(supabaseUrl!, supabaseServiceKey!, executionLogId, buttonId, step.id, step.step_name, step.step_type, 'failed', simpleStepStartedAt, simpleStepErrMsg, { config: step.config_json }, simpleErrorOutputData);
        await finalizeExecutionLog(supabaseUrl!, supabaseServiceKey!, extractionLogId, executionLogId, false, simpleStepErrMsg, stepResults, contextData);
        return new Response(JSON.stringify({
          success: false,
          buttonName: button.name,
          error: simpleStepErrMsg,
          results: stepResults
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    await finalizeExecutionLog(supabaseUrl!, supabaseServiceKey!, extractionLogId, executionLogId, true, null, stepResults, contextData);

    return new Response(JSON.stringify({
      success: true,
      buttonName: button.name,
      stepsExecuted: stepResults.length,
      results: stepResults
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Execute button processor error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
