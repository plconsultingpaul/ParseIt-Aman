import { getValueByPath, replaceVariables } from "../utils/objectPaths.ts";
import type { FlowNode, FlowEdge } from "../types/index.ts";

interface ForEachResult {
  stepOutput: any;
  loopChildNodeIds: Set<string>;
}

export function resolveSourceArray(sourceArrayPath: string, contextData: any): any[] {
  console.log(`[FOR_EACH_DEBUG] resolveSourceArray called with path: "${sourceArrayPath}"`);
  console.log(`[FOR_EACH_DEBUG] contextData top-level keys: ${Object.keys(contextData || {}).join(', ')}`);
  console.log(`[FOR_EACH_DEBUG] contextData.execute keys: ${Object.keys(contextData?.execute || {}).join(', ')}`);
  console.log(`[FOR_EACH_DEBUG] contextData.response keys: ${Object.keys(contextData?.response || {}).join(', ')}`);
  console.log(`[FOR_EACH_DEBUG] contextData.response snapshot: ${JSON.stringify(contextData?.response)?.substring(0, 1500)}`);

  let value = getValueByPath(contextData, sourceArrayPath);
  console.log(`[FOR_EACH_DEBUG] Lookup via contextData root: type=${typeof value}, isArray=${Array.isArray(value)}, length=${Array.isArray(value) ? value.length : 'n/a'}, value=${JSON.stringify(value)?.substring(0, 500)}`);

  if (value === null || value === undefined) {
    value = getValueByPath(contextData.execute, sourceArrayPath);
    console.log(`[FOR_EACH_DEBUG] Lookup via contextData.execute: type=${typeof value}, isArray=${Array.isArray(value)}, length=${Array.isArray(value) ? value.length : 'n/a'}, value=${JSON.stringify(value)?.substring(0, 500)}`);
  }
  if (value === null || value === undefined) {
    value = getValueByPath(contextData.response, sourceArrayPath);
    console.log(`[FOR_EACH_DEBUG] Lookup via contextData.response: type=${typeof value}, isArray=${Array.isArray(value)}, length=${Array.isArray(value) ? value.length : 'n/a'}, value=${JSON.stringify(value)?.substring(0, 500)}`);
  }

  if (typeof value === 'string') {
    console.log(`[FOR_EACH_DEBUG] Value is a string, attempting to parse/split`);
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        value = parsed;
        console.log(`[FOR_EACH_DEBUG] Parsed string into array of length ${parsed.length}`);
      }
    } catch {
      if (value.includes(',')) {
        value = value.split(',').map((s: string) => s.trim());
        console.log(`[FOR_EACH_DEBUG] Split CSV string into array of length ${(value as string[]).length}`);
      } else {
        value = [value];
        console.log(`[FOR_EACH_DEBUG] Wrapped single string into array`);
      }
    }
  }

  if (!Array.isArray(value)) {
    console.log(`[FOR_EACH_DEBUG] RESOLUTION FAILED - value is not an array. type=${typeof value}`);
    throw new Error(
      `For Each: source "${sourceArrayPath}" did not resolve to an array. Got: ${typeof value}, value: ${JSON.stringify(value)}`
    );
  }

  console.log(`[FOR_EACH_DEBUG] RESOLVED array with ${value.length} item(s). First item: ${JSON.stringify(value[0])?.substring(0, 300)}`);
  return value;
}

export interface ForEachState {
  items: any[];
  itemVariable: string;
  itemIndex: number;
  total: number;
  userDriven?: boolean;
  consumedIndices?: number[];
}

export interface ForEachStepDecision {
  action: 'enter_body' | 'done' | 'empty';
  loopBodyStartIdx: number;
  doneTargetIdx: number;
  state: ForEachState;
  isFirstEntry: boolean;
}

/**
 * Initializes a for_each loop on first entry, or advances its item index on
 * re-entry. State is persisted on contextData._forEachLoops[nodeId] so it
 * round-trips with the existing contextData pause/resume mechanism used by
 * group nodes. No separate DB table is required — iteration state is
 * inherently scoped to the in-flight execution.
 */
export function initOrAdvanceForEach(
  node: FlowNode,
  contextData: any,
  flowEdges: FlowEdge[],
  executionOrder: FlowNode[]
): ForEachStepDecision {
  const config = node.config_json || {};
  const sourceArrayPath = config.sourceArray || '';
  const itemVariable = config.itemVariable || 'item';

  if (!sourceArrayPath) {
    throw new Error('For Each step requires a sourceArray configuration');
  }

  const loopEdge = flowEdges.find(
    e => e.source_node_id === node.id && e.source_handle === 'loop'
  );
  const doneEdge = flowEdges.find(
    e => e.source_node_id === node.id && e.source_handle === 'done'
  );
  const loopBodyStartIdx = loopEdge
    ? executionOrder.findIndex(n => n.id === loopEdge.target_node_id)
    : -1;
  const doneTargetIdx = doneEdge
    ? executionOrder.findIndex(n => n.id === doneEdge.target_node_id)
    : -1;

  // Detect whether the body contains a user_selection child - if so, the
  // loop is driven by explicit user picks, not sequential index advancement.
  const bodyNodeIds = loopEdge ? collectLoopBodyNodeIds(node.id, flowEdges, executionOrder) : new Set<string>();
  const hasUserSelectionChild = executionOrder.some(
    n => bodyNodeIds.has(n.id) && n.step_type === 'user_selection'
  );

  console.log('[FOR_EACH_DRIVER] loopEdge=', loopEdge ? `target=${loopEdge.target_node_id}` : 'MISSING');
  console.log('[FOR_EACH_DRIVER] bodyNodeIds count=', bodyNodeIds.size, 'ids=', JSON.stringify([...bodyNodeIds]));
  console.log('[FOR_EACH_DRIVER] body step_types=', JSON.stringify(
    executionOrder
      .filter(n => bodyNodeIds.has(n.id))
      .map(n => ({ id: n.id, node_type: n.node_type, step_type: n.step_type, label: n.label }))
  ));
  console.log('[FOR_EACH_DRIVER] hasUserSelectionChild=', hasUserSelectionChild);

  contextData._forEachLoops = contextData._forEachLoops || {};
  const existing: ForEachState | undefined = contextData._forEachLoops[node.id];

  if (!existing) {
    console.log(`[FOR_EACH_DRIVER] First entry for node "${node.label}" (${node.id})`);
    const items = resolveSourceArray(sourceArrayPath, contextData);
    const state: ForEachState = {
      items,
      itemVariable,
      itemIndex: 0,
      total: items.length,
      userDriven: hasUserSelectionChild,
      consumedIndices: [],
    };

    if (items.length === 0) {
      console.log(`[FOR_EACH_DRIVER] Source array is empty — skipping to done edge`);
      return { action: 'empty', loopBodyStartIdx, doneTargetIdx, state, isFirstEntry: true };
    }

    contextData._forEachLoops[node.id] = state;
    if (hasUserSelectionChild) {
      // Don't seed forEach.item - the user_selection step will set it from the picked option.
      contextData.forEach = { _index: -1, _total: items.length };
      console.log(`[FOR_EACH_DRIVER] User-driven mode enabled (user_selection child detected). Entering body without seeding forEach.item.`);
    } else {
      contextData.forEach = {
        [itemVariable]: items[0],
        _index: 0,
        _total: items.length,
      };
      console.log(`[FOR_EACH_DRIVER] Initialized state with ${items.length} item(s). Entering body with item[0]=${JSON.stringify(items[0])?.substring(0, 100)}`);
    }
    return { action: 'enter_body', loopBodyStartIdx, doneTargetIdx, state, isFirstEntry: true };
  }

  if (existing.userDriven) {
    // Re-entry in user-driven mode: check whether every index has been consumed
    const consumed = Array.isArray(existing.consumedIndices) ? existing.consumedIndices : [];
    console.log(`[FOR_EACH_DRIVER] User-driven re-entry for "${node.label}" — consumed=${JSON.stringify(consumed)} of ${existing.total}`);
    if (consumed.length >= existing.total) {
      console.log(`[FOR_EACH_DRIVER] All ${existing.total} item(s) picked — following done edge`);
      delete contextData._forEachLoops[node.id];
      delete contextData.forEach;
      return { action: 'done', loopBodyStartIdx, doneTargetIdx, state: existing, isFirstEntry: false };
    }
    contextData.forEach = { _index: -1, _total: existing.total };
    return { action: 'enter_body', loopBodyStartIdx, doneTargetIdx, state: existing, isFirstEntry: false };
  }

  // Re-entry — advance to next item
  existing.itemIndex++;
  console.log(`[FOR_EACH_DRIVER] Re-entry for "${node.label}" — advancing to itemIndex=${existing.itemIndex}/${existing.total}`);

  if (existing.itemIndex >= existing.total) {
    console.log(`[FOR_EACH_DRIVER] All ${existing.total} iteration(s) complete — following done edge`);
    delete contextData._forEachLoops[node.id];
    delete contextData.forEach;
    return { action: 'done', loopBodyStartIdx, doneTargetIdx, state: existing, isFirstEntry: false };
  }

  contextData.forEach = {
    [existing.itemVariable]: existing.items[existing.itemIndex],
    _index: existing.itemIndex,
    _total: existing.total,
  };
  console.log(`[FOR_EACH_DRIVER] Entering body for iteration ${existing.itemIndex + 1}/${existing.total} with item=${JSON.stringify(existing.items[existing.itemIndex])?.substring(0, 100)}`);
  return { action: 'enter_body', loopBodyStartIdx, doneTargetIdx, state: existing, isFirstEntry: false };
}

/**
 * Finds the active for_each driver whose loop body contains the given node id.
 * Returns null when the node is not inside any active for_each.
 */
export function findActiveForEachContaining(
  nodeId: string,
  contextData: any,
  flowEdges: FlowEdge[],
  executionOrder: FlowNode[]
): { forEachNodeId: string; forEachIdx: number } | null {
  const loops = contextData?._forEachLoops;
  if (!loops || typeof loops !== 'object') return null;

  for (const forEachNodeId of Object.keys(loops)) {
    const bodyIds = collectLoopBodyNodeIds(forEachNodeId, flowEdges, executionOrder);
    if (bodyIds.has(nodeId)) {
      const forEachIdx = executionOrder.findIndex(n => n.id === forEachNodeId);
      return { forEachNodeId, forEachIdx };
    }
  }
  return null;
}

export function collectLoopBodyNodeIds(
  forEachNodeId: string,
  flowEdges: FlowEdge[],
  allNodes: FlowNode[]
): Set<string> {
  const loopEdges = flowEdges.filter(
    e => e.source_node_id === forEachNodeId && e.source_handle === 'loop'
  );

  if (loopEdges.length === 0) return new Set();

  const loopChildIds = new Set<string>();
  const queue = loopEdges.map(e => e.target_node_id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (loopChildIds.has(nodeId) || nodeId === forEachNodeId) continue;
    loopChildIds.add(nodeId);

    const outgoingEdges = flowEdges.filter(e => e.source_node_id === nodeId);
    for (const edge of outgoingEdges) {
      if (edge.target_node_id !== forEachNodeId && !loopChildIds.has(edge.target_node_id)) {
        queue.push(edge.target_node_id);
      }
    }
  }

  return loopChildIds;
}

export async function executeForEachLoop(
  node: FlowNode,
  contextData: any,
  flowEdges: FlowEdge[],
  executionOrder: FlowNode[],
  executeChildStep: (
    childNode: FlowNode,
    contextData: any,
    stepResults: any[],
    executionLogId: string | null,
    buttonId: string,
    supabaseUrl: string,
    supabaseServiceKey: string
  ) => Promise<any>,
  stepResults: any[],
  executionLogId: string | null,
  buttonId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<ForEachResult> {
  const config = node.config_json || {};
  const sourceArrayPath = config.sourceArray || '';
  const itemVariable = config.itemVariable || 'item';

  console.log(`[FOR_EACH_DEBUG] ===== executeForEachLoop START =====`);
  console.log(`[FOR_EACH_DEBUG] node.id=${node.id}, label="${node.label}"`);
  console.log(`[FOR_EACH_DEBUG] sourceArrayPath="${sourceArrayPath}", itemVariable="${itemVariable}"`);

  if (!sourceArrayPath) {
    throw new Error('For Each step requires a sourceArray configuration');
  }

  const arrayData = resolveSourceArray(sourceArrayPath, contextData);
  console.log(`[FOR_EACH_DEBUG] arrayData length=${arrayData.length}`);

  const loopChildNodeIds = collectLoopBodyNodeIds(node.id, flowEdges, executionOrder);
  console.log(`[FOR_EACH_DEBUG] loopChildNodeIds (${loopChildNodeIds.size}): ${JSON.stringify([...loopChildNodeIds])}`);

  const loopChildNodeDetails = executionOrder
    .filter(n => loopChildNodeIds.has(n.id))
    .map(n => ({ id: n.id, label: n.label, node_type: n.node_type, step_type: n.step_type, group_id: n.group_id }));
  console.log(`[FOR_EACH_DEBUG] loop child nodes detail: ${JSON.stringify(loopChildNodeDetails, null, 2)}`);

  const skippedNonWorkflowNodes = loopChildNodeDetails.filter(n => n.node_type !== 'workflow' || !n.step_type);
  if (skippedNonWorkflowNodes.length > 0) {
    console.log(`[FOR_EACH_DEBUG] WARNING: ${skippedNonWorkflowNodes.length} child node(s) will be SKIPPED by the workflow-only filter: ${JSON.stringify(skippedNonWorkflowNodes)}`);
  }

  if (loopChildNodeIds.size === 0) {
    return {
      stepOutput: {
        loop_type: 'for_each',
        total_items: arrayData.length,
        successful: 0,
        failed: 0,
        message: 'No loop body steps connected to the Loop handle',
      },
      loopChildNodeIds,
    };
  }

  const loopBodyNodes = executionOrder.filter(n => loopChildNodeIds.has(n.id));

  const loopStartEdges = flowEdges.filter(
    e => e.source_node_id === node.id && e.source_handle === 'loop'
  );
  const firstLoopNodeId = loopStartEdges.length > 0 ? loopStartEdges[0].target_node_id : null;

  const iterationResults: any[] = [];

  console.log(`[FOR_EACH_DEBUG] orderedLoopNodes (initial): ${JSON.stringify(loopBodyNodes.map(n => ({ id: n.id, label: n.label, node_type: n.node_type, step_type: n.step_type })))}`);
  console.log(`[FOR_EACH_DEBUG] firstLoopNodeId=${firstLoopNodeId}`);
  console.log(`[FOR_EACH_DEBUG] Will iterate ${arrayData.length} time(s)`);

  for (let i = 0; i < arrayData.length; i++) {
    const currentItem = arrayData[i];
    console.log(`[FOR_EACH_DEBUG] ----- Iteration ${i + 1}/${arrayData.length} -----`);
    console.log(`[FOR_EACH_DEBUG] currentItem=${JSON.stringify(currentItem)?.substring(0, 300)}`);

    if (!contextData.forEach) contextData.forEach = {};
    contextData.forEach[itemVariable] = currentItem;
    contextData.forEach._index = i;
    contextData.forEach._total = arrayData.length;

    let iterationSuccess = true;
    let iterationError: string | null = null;

    const orderedLoopNodes = firstLoopNodeId
      ? getOrderedLoopNodes(firstLoopNodeId, loopChildNodeIds, flowEdges, executionOrder)
      : loopBodyNodes;

    console.log(`[FOR_EACH_DEBUG] orderedLoopNodes for iter ${i + 1}: ${JSON.stringify(orderedLoopNodes.map(n => ({ id: n.id, label: n.label, node_type: n.node_type, step_type: n.step_type })))}`);

    for (let ci = 0; ci < orderedLoopNodes.length; ci++) {
      const childNode = orderedLoopNodes[ci];
      console.log(`[FOR_EACH_DEBUG] Iter ${i + 1} visiting child ci=${ci} node="${childNode.label}" node_type=${childNode.node_type} step_type=${childNode.step_type}`);

      if (childNode.node_type !== 'workflow' || !childNode.step_type) {
        console.log(`[FOR_EACH_DEBUG] SKIPPING child "${childNode.label}" because node_type="${childNode.node_type}" or empty step_type="${childNode.step_type}"`);
        continue;
      }

      try {
        const childOutput = await executeChildStep(
          childNode,
          contextData,
          stepResults,
          executionLogId,
          buttonId,
          supabaseUrl,
          supabaseServiceKey
        );

        if (childOutput === null) {
          iterationSuccess = false;
          iterationError = 'Child step returned error response';
          break;
        }

        if (childNode.step_type === 'conditional_check' && childOutput) {
          const handle = childOutput.conditionMet ? 'success' : 'failure';
          const branchEdge = flowEdges.find(
            e => e.source_node_id === childNode.id && e.source_handle === handle
          );
          if (branchEdge) {
            const targetIdx = orderedLoopNodes.findIndex(n => n.id === branchEdge.target_node_id);
            if (targetIdx !== -1 && targetIdx > ci) {
              ci = targetIdx - 1;
            } else if (targetIdx === -1) {
              const isForEachNode = branchEdge.target_node_id === node.id;
              if (isForEachNode) {
                break;
              }
            }
          } else {
            break;
          }
        } else if (childNode.step_type !== 'conditional_check') {
          const allOutEdges = flowEdges.filter(e => e.source_node_id === childNode.id);
          const outEdge = allOutEdges[0];
          if (outEdge) {
            const targetIdx = orderedLoopNodes.findIndex(n => n.id === outEdge.target_node_id);
            const isForEachNode = outEdge.target_node_id === node.id;
            const isInLoopChildren = loopChildNodeIds.has(outEdge.target_node_id);
            if (targetIdx !== -1 && targetIdx > ci) {
              ci = targetIdx - 1;
            } else if (isForEachNode) {
              break;
            } else if (!isInLoopChildren) {
              break;
            }
          } else {
            break;
          }
        }
      } catch (err) {
        iterationSuccess = false;
        iterationError = err instanceof Error ? err.message : String(err);
        console.error(`[FOR_EACH] Error in step "${childNode.label}":`, iterationError);
        break;
      }
    }

    iterationResults.push({
      index: i,
      item: currentItem,
      success: iterationSuccess,
      error: iterationError,
    });
  }

  delete contextData.forEach;

  const successful = iterationResults.filter(r => r.success).length;
  const failed = iterationResults.filter(r => !r.success).length;

  return {
    stepOutput: {
      loop_type: 'for_each',
      total_items: arrayData.length,
      successful,
      failed,
      results: iterationResults,
    },
    loopChildNodeIds,
  };
}

function getOrderedLoopNodes(
  firstNodeId: string,
  loopChildNodeIds: Set<string>,
  flowEdges: FlowEdge[],
  allNodes: FlowNode[]
): FlowNode[] {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const ordered: FlowNode[] = [];
  const visited = new Set<string>();

  function traverse(nodeId: string) {
    if (visited.has(nodeId) || !loopChildNodeIds.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) ordered.push(node);

    const outEdges = flowEdges.filter(e => e.source_node_id === nodeId);
    for (const edge of outEdges) {
      if (loopChildNodeIds.has(edge.target_node_id)) {
        traverse(edge.target_node_id);
      }
    }
  }

  traverse(firstNodeId);
  return ordered;
}
