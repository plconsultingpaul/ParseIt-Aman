import { supabase } from '../lib/supabase';
import type { WorkflowV2, WorkflowV2Type, WorkflowV2Node, WorkflowV2Edge } from '../types';

export async function fetchWorkflowsV2(): Promise<WorkflowV2[]> {
  const { data, error } = await supabase
    .from('workflows_v2')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(w => ({
    id: w.id,
    name: w.name,
    description: w.description || '',
    workflowType: w.workflow_type || 'extraction',
    isActive: w.is_active,
    scheduleEnabled: w.schedule_enabled || false,
    scheduleIntervalMinutes: w.schedule_interval_minutes ?? null,
    cronSchedule: w.cron_schedule ?? null,
    lastScheduledRun: w.last_scheduled_run ?? null,
    nextScheduledRun: w.next_scheduled_run ?? null,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }));
}

export async function scheduleWorkflowV2(workflowId: string, intervalMinutes: number): Promise<void> {
  const { data, error } = await supabase.rpc('schedule_workflow_v2', {
    p_workflow_id: workflowId,
    p_interval_minutes: intervalMinutes,
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || 'Failed to schedule workflow');
}

export async function unscheduleWorkflowV2(workflowId: string): Promise<void> {
  const { data, error } = await supabase.rpc('unschedule_workflow_v2', {
    p_workflow_id: workflowId,
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || 'Failed to unschedule workflow');
}

export async function createWorkflowV2(name: string, workflowType: WorkflowV2Type, description?: string): Promise<WorkflowV2> {
  const { data, error } = await supabase
    .from('workflows_v2')
    .insert({ name, workflow_type: workflowType, description: description || null })
    .select()
    .single();

  if (error) throw error;

  const startNode = {
    workflow_id: data.id,
    node_type: 'start',
    position_x: 250,
    position_y: 50,
    label: 'Start',
    config_json: {},
  };

  await supabase.from('workflow_v2_nodes').insert(startNode);

  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    workflowType: data.workflow_type || 'extraction',
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateWorkflowV2(id: string, updates: Partial<Pick<WorkflowV2, 'name' | 'description' | 'isActive' | 'workflowType'>>): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.workflowType !== undefined) dbUpdates.workflow_type = updates.workflowType;

  const { error } = await supabase
    .from('workflows_v2')
    .update(dbUpdates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteWorkflowV2(id: string): Promise<void> {
  const { error } = await supabase
    .from('workflows_v2')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchWorkflowV2Nodes(workflowId: string): Promise<WorkflowV2Node[]> {
  const { data, error } = await supabase
    .from('workflow_v2_nodes')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at');

  if (error) throw error;

  return (data || []).map(n => ({
    id: n.id,
    workflowId: n.workflow_id,
    nodeType: n.node_type,
    positionX: n.position_x,
    positionY: n.position_y,
    width: n.width,
    height: n.height,
    label: n.label,
    stepType: n.step_type,
    configJson: n.config_json || {},
    escapeSingleQuotesInBody: n.escape_single_quotes_in_body,
    userResponseTemplate: n.user_response_template,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }));
}

export async function fetchWorkflowV2Edges(workflowId: string): Promise<WorkflowV2Edge[]> {
  const { data, error } = await supabase
    .from('workflow_v2_edges')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at');

  if (error) throw error;

  return (data || []).map(e => ({
    id: e.id,
    workflowId: e.workflow_id,
    sourceNodeId: e.source_node_id,
    targetNodeId: e.target_node_id,
    sourceHandle: e.source_handle,
    targetHandle: e.target_handle,
    label: e.label,
    edgeType: e.edge_type,
    animated: e.animated,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  }));
}

export async function saveWorkflowV2Nodes(workflowId: string, nodes: WorkflowV2Node[]): Promise<Record<string, string>> {
  const idMap: Record<string, string> = {};

  const { data: existing } = await supabase
    .from('workflow_v2_nodes')
    .select('id')
    .eq('workflow_id', workflowId);

  const existingIds = new Set((existing || []).map(n => n.id));
  const incomingIds = new Set(nodes.filter(n => !n.id.startsWith('temp-')).map(n => n.id));

  const toDelete = [...existingIds].filter(id => !incomingIds.has(id));

  console.log('[WorkflowV2Service] saveNodes - existingIds:', [...existingIds]);
  console.log('[WorkflowV2Service] saveNodes - incomingIds:', [...incomingIds]);
  console.log('[WorkflowV2Service] saveNodes - toDelete:', toDelete);

  if (toDelete.length > 0) {
    const { error: edgeDelError } = await supabase
      .from('workflow_v2_edges')
      .delete()
      .eq('workflow_id', workflowId)
      .or(toDelete.map(id => `source_node_id.eq.${id},target_node_id.eq.${id}`).join(','));
    if (edgeDelError) {
      console.error('[WorkflowV2Service] Edge delete error:', edgeDelError);
      throw edgeDelError;
    }
    console.log('[WorkflowV2Service] Deleted edges for removed nodes');

    const { error } = await supabase
      .from('workflow_v2_nodes')
      .delete()
      .in('id', toDelete);
    if (error) {
      console.error('[WorkflowV2Service] Node delete error:', error);
      throw error;
    }
    console.log('[WorkflowV2Service] Deleted nodes:', toDelete);
  }

  for (const node of nodes) {
    const record = {
      workflow_id: workflowId,
      node_type: node.nodeType,
      position_x: node.positionX,
      position_y: node.positionY,
      width: node.width || null,
      height: node.height || null,
      label: node.label,
      step_type: node.stepType || null,
      config_json: node.configJson || {},
      escape_single_quotes_in_body: node.escapeSingleQuotesInBody || false,
      user_response_template: node.userResponseTemplate || null,
      updated_at: new Date().toISOString(),
    };

    if (node.id.startsWith('temp-')) {
      console.log('[WorkflowV2Service] Inserting new node:', { tempId: node.id, stepType: node.stepType, label: node.label });
      const { data, error } = await supabase
        .from('workflow_v2_nodes')
        .insert(record)
        .select('id')
        .single();
      if (error) {
        console.error('[WorkflowV2Service] Insert failed for node:', node.id, 'stepType:', node.stepType, 'error:', error);
        throw error;
      }
      console.log('[WorkflowV2Service] Inserted node:', node.id, '->', data.id);
      idMap[node.id] = data.id;
    } else if (existingIds.has(node.id)) {
      console.log('[WorkflowV2Service] Updating existing node:', { id: node.id, stepType: node.stepType, label: node.label });
      const { error } = await supabase
        .from('workflow_v2_nodes')
        .update(record)
        .eq('id', node.id);
      if (error) {
        console.error('[WorkflowV2Service] Update failed for node:', node.id, 'stepType:', node.stepType, 'error:', error);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('workflow_v2_nodes')
        .insert({ id: node.id, ...record });
      if (error) throw error;
    }
  }

  return idMap;
}

export async function saveWorkflowV2Edges(workflowId: string, edges: WorkflowV2Edge[]): Promise<void> {
  const { error: delError } = await supabase
    .from('workflow_v2_edges')
    .delete()
    .eq('workflow_id', workflowId);

  if (delError) throw delError;

  if (edges.length === 0) return;

  const records = edges.map(e => ({
    workflow_id: workflowId,
    source_node_id: e.sourceNodeId,
    target_node_id: e.targetNodeId,
    source_handle: e.sourceHandle || 'default',
    target_handle: e.targetHandle || 'default',
    label: e.label || null,
    edge_type: e.edgeType || 'default',
    animated: e.animated || false,
  }));

  const { error } = await supabase
    .from('workflow_v2_edges')
    .insert(records);

  if (error) throw error;
}

export async function deleteWorkflowV2Node(nodeId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_v2_nodes')
    .delete()
    .eq('id', nodeId);

  if (error) throw error;
}

export async function saveWorkflowV2SingleNode(
  nodeId: string,
  updates: {
    label: string;
    stepType: string | null;
    configJson: any;
    escapeSingleQuotesInBody: boolean;
    userResponseTemplate: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('workflow_v2_nodes')
    .update({
      label: updates.label,
      step_type: updates.stepType,
      config_json: updates.configJson || {},
      escape_single_quotes_in_body: updates.escapeSingleQuotesInBody,
      user_response_template: updates.userResponseTemplate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', nodeId);

  if (error) throw error;
}

export async function deleteWorkflowV2Edge(edgeId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_v2_edges')
    .delete()
    .eq('id', edgeId);

  if (error) throw error;
}

export async function copyWorkflowV2(originalWorkflowId: string, newName: string, targetWorkflowType?: WorkflowV2Type): Promise<WorkflowV2> {
  const { data: original, error: fetchErr } = await supabase
    .from('workflows_v2')
    .select('*')
    .eq('id', originalWorkflowId)
    .single();

  if (fetchErr || !original) throw fetchErr || new Error('Workflow not found');

  const { data: newWf, error: createErr } = await supabase
    .from('workflows_v2')
    .insert({
      name: newName,
      workflow_type: targetWorkflowType || original.workflow_type,
      description: original.description,
      is_active: original.is_active,
    })
    .select()
    .single();

  if (createErr || !newWf) throw createErr || new Error('Failed to create workflow copy');

  const nodes = await fetchWorkflowV2Nodes(originalWorkflowId);
  const edges = await fetchWorkflowV2Edges(originalWorkflowId);

  const nodeIdMap: Record<string, string> = {};

  for (const node of nodes) {
    const { data: newNode, error: nodeErr } = await supabase
      .from('workflow_v2_nodes')
      .insert({
        workflow_id: newWf.id,
        node_type: node.nodeType,
        position_x: node.positionX,
        position_y: node.positionY,
        width: node.width || null,
        height: node.height || null,
        label: node.label,
        step_type: node.stepType || null,
        config_json: node.configJson ? JSON.parse(JSON.stringify(node.configJson)) : {},
        escape_single_quotes_in_body: node.escapeSingleQuotesInBody || false,
        user_response_template: node.userResponseTemplate || null,
      })
      .select('id')
      .single();

    if (nodeErr || !newNode) throw nodeErr || new Error('Failed to copy node');
    nodeIdMap[node.id] = newNode.id;
  }

  if (edges.length > 0) {
    const edgeRecords = edges.map(e => ({
      workflow_id: newWf.id,
      source_node_id: nodeIdMap[e.sourceNodeId] || e.sourceNodeId,
      target_node_id: nodeIdMap[e.targetNodeId] || e.targetNodeId,
      source_handle: e.sourceHandle || 'default',
      target_handle: e.targetHandle || 'default',
      label: e.label || null,
      edge_type: e.edgeType || 'default',
      animated: e.animated || false,
    }));

    const { error: edgeErr } = await supabase
      .from('workflow_v2_edges')
      .insert(edgeRecords);

    if (edgeErr) throw edgeErr;
  }

  for (const [oldNodeId, newNodeId] of Object.entries(nodeIdMap)) {
    const { data: functions } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('workflow_v2_node_id', oldNodeId);

    if (functions && functions.length > 0) {
      for (const fn of functions) {
        await supabase
          .from('field_mapping_functions')
          .insert({
            workflow_v2_node_id: newNodeId,
            function_name: fn.function_name,
            description: fn.description,
            function_type: fn.function_type,
            function_logic: fn.function_logic,
          });
      }
    }
  }

  return {
    id: newWf.id,
    name: newWf.name,
    description: newWf.description || '',
    workflowType: newWf.workflow_type || 'extraction',
    isActive: newWf.is_active,
    createdAt: newWf.created_at,
    updatedAt: newWf.updated_at,
  };
}
