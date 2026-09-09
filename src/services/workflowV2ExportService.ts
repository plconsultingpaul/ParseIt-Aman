import { supabase } from '../lib/supabase';
import type { WorkflowV2Type } from '../types';

export interface ExportedWorkflowV2 {
  _exportId: string;
  name: string;
  description: string | null;
  workflowType: WorkflowV2Type;
  isActive: boolean;
  nodes: ExportedNode[];
  edges: ExportedEdge[];
  fieldMappingFunctions: ExportedFieldMappingFunction[];
}

interface ExportedNode {
  _exportId: string;
  nodeType: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  label: string;
  stepType: string | null;
  configJson: any;
  escapeSingleQuotesInBody: boolean;
  userResponseTemplate: string | null;
}

interface ExportedEdge {
  _sourceNodeExportId: string;
  _targetNodeExportId: string;
  sourceHandle: string;
  targetHandle: string;
  label: string | null;
  edgeType: string;
  animated: boolean;
}

interface ExportedFieldMappingFunction {
  _nodeExportId: string;
  functionName: string;
  description: string | null;
  functionType: string;
  functionLogic: any;
}

export interface WorkflowV2ExportFile {
  version: '1.0';
  exportedAt: string;
  workflows: ExportedWorkflowV2[];
}

const API_STEP_TYPES = new Set([
  'api_call', 'api_endpoint', 'multipart_form_upload',
]);

export async function exportWorkflowsV2(workflowIds: string[]): Promise<WorkflowV2ExportFile> {
  const exportedWorkflows: ExportedWorkflowV2[] = [];

  for (let wi = 0; wi < workflowIds.length; wi++) {
    const wfId = workflowIds[wi];

    const [wfRes, nodesRes, edgesRes] = await Promise.all([
      supabase.from('workflows_v2').select('*').eq('id', wfId).single(),
      supabase.from('workflow_v2_nodes').select('*').eq('workflow_id', wfId).order('created_at'),
      supabase.from('workflow_v2_edges').select('*').eq('workflow_id', wfId).order('created_at'),
    ]);

    if (wfRes.error || !wfRes.data) throw new Error(`Failed to load workflow: ${wfRes.error?.message}`);
    if (nodesRes.error) throw new Error(`Failed to load nodes: ${nodesRes.error.message}`);
    if (edgesRes.error) throw new Error(`Failed to load edges: ${edgesRes.error.message}`);

    const wf = wfRes.data;
    const nodes = nodesRes.data || [];
    const edges = edgesRes.data || [];

    const nodeIdMap: Record<string, string> = {};
    nodes.forEach((n: any, i: number) => { nodeIdMap[n.id] = `node_${i}`; });

    const nodeIds = nodes.map((n: any) => n.id);
    let fieldMappingFunctions: any[] = [];
    if (nodeIds.length > 0) {
      const { data: fmfs } = await supabase
        .from('field_mapping_functions')
        .select('*')
        .in('workflow_v2_node_id', nodeIds);
      fieldMappingFunctions = fmfs || [];
    }

    exportedWorkflows.push({
      _exportId: `workflow_${wi}`,
      name: wf.name,
      description: wf.description || null,
      workflowType: wf.workflow_type || 'extraction',
      isActive: wf.is_active,
      nodes: nodes.map((n: any) => ({
        _exportId: nodeIdMap[n.id],
        nodeType: n.node_type,
        positionX: n.position_x,
        positionY: n.position_y,
        width: n.width,
        height: n.height,
        label: n.label,
        stepType: n.step_type,
        configJson: n.config_json || {},
        escapeSingleQuotesInBody: n.escape_single_quotes_in_body || false,
        userResponseTemplate: n.user_response_template || null,
      })),
      edges: edges.map((e: any) => ({
        _sourceNodeExportId: nodeIdMap[e.source_node_id],
        _targetNodeExportId: nodeIdMap[e.target_node_id],
        sourceHandle: e.source_handle || 'default',
        targetHandle: e.target_handle || 'default',
        label: e.label || null,
        edgeType: e.edge_type || 'default',
        animated: e.animated || false,
      })),
      fieldMappingFunctions: fieldMappingFunctions.map((fmf: any) => ({
        _nodeExportId: nodeIdMap[fmf.workflow_v2_node_id],
        functionName: fmf.function_name,
        description: fmf.description,
        functionType: fmf.function_type,
        functionLogic: fmf.function_logic,
      })),
    });
  }

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    workflows: exportedWorkflows,
  };
}

export function downloadWorkflowV2Export(data: WorkflowV2ExportFile, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function validateWorkflowV2ExportFile(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid file format' };
  if (data.version !== '1.0') return { valid: false, error: `Unsupported version: ${data.version}` };
  if (!Array.isArray(data.workflows) || data.workflows.length === 0) {
    return { valid: false, error: 'No workflows found in file' };
  }
  for (let i = 0; i < data.workflows.length; i++) {
    const wf = data.workflows[i];
    if (!wf.name) return { valid: false, error: `Workflow ${i + 1} is missing a name` };
    if (!Array.isArray(wf.nodes)) return { valid: false, error: `Workflow "${wf.name}" is missing nodes` };
    if (!Array.isArray(wf.edges)) return { valid: false, error: `Workflow "${wf.name}" is missing edges` };
  }
  return { valid: true };
}

export function hasApiSteps(data: WorkflowV2ExportFile): boolean {
  for (const wf of data.workflows) {
    for (const node of wf.nodes) {
      if (node.stepType && API_STEP_TYPES.has(node.stepType)) return true;
    }
  }
  return false;
}

export async function importWorkflowsV2(data: WorkflowV2ExportFile): Promise<string[]> {
  const createdIds: string[] = [];

  for (const wf of data.workflows) {
    const { data: newWf, error: wfErr } = await supabase
      .from('workflows_v2')
      .insert({
        name: wf.name,
        workflow_type: wf.workflowType || 'extraction',
        description: wf.description,
        is_active: wf.isActive,
      })
      .select()
      .single();

    if (wfErr || !newWf) throw new Error(`Failed to create workflow "${wf.name}": ${wfErr?.message}`);
    createdIds.push(newWf.id);

    const nodeExportToId: Record<string, string> = {};

    for (const node of wf.nodes) {
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

      if (nodeErr || !newNode) throw new Error(`Failed to create node "${node.label}": ${nodeErr?.message}`);
      nodeExportToId[node._exportId] = newNode.id;
    }

    if (wf.edges.length > 0) {
      const edgeRecords = wf.edges
        .filter(e => nodeExportToId[e._sourceNodeExportId] && nodeExportToId[e._targetNodeExportId])
        .map(e => ({
          workflow_id: newWf.id,
          source_node_id: nodeExportToId[e._sourceNodeExportId],
          target_node_id: nodeExportToId[e._targetNodeExportId],
          source_handle: e.sourceHandle || 'default',
          target_handle: e.targetHandle || 'default',
          label: e.label || null,
          edge_type: e.edgeType || 'default',
          animated: e.animated || false,
        }));

      if (edgeRecords.length > 0) {
        const { error: edgeErr } = await supabase
          .from('workflow_v2_edges')
          .insert(edgeRecords);
        if (edgeErr) throw new Error(`Failed to create edges: ${edgeErr.message}`);
      }
    }

    const fmfs = wf.fieldMappingFunctions || [];
    for (const fmf of fmfs) {
      const nodeId = nodeExportToId[fmf._nodeExportId];
      if (!nodeId) continue;

      await supabase
        .from('field_mapping_functions')
        .insert({
          workflow_v2_node_id: nodeId,
          function_name: fmf.functionName,
          description: fmf.description,
          function_type: fmf.functionType,
          function_logic: fmf.functionLogic,
        });
    }
  }

  return createdIds;
}
