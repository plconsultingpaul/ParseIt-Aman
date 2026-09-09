import { supabase } from '../lib/supabase';

export interface ExportedButton {
  version: '1.0';
  exportedAt: string;
  button: {
    name: string;
    description: string | null;
    isActive: boolean;
    hasFlow: boolean;
    qrCodeEnabled: boolean;
  };
  groups: ExportedGroup[];
  fields: ExportedField[];
  flowNodes: ExportedFlowNode[];
  flowEdges: ExportedFlowEdge[];
  steps: ExportedStep[];
  fieldMappingFunctions: ExportedFieldMappingFunction[];
}

interface ExportedGroup {
  _exportId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isArrayGroup: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  arrayFieldName: string | null;
}

interface ExportedField {
  _exportId: string;
  _groupExportId: string;
  _conditionalRequiredFieldExportId: string | null;
  name: string;
  fieldKey: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue: string | null;
  options: any;
  dropdownDisplayMode: string;
  sortOrder: number;
  placeholder: string | null;
  helpText: string | null;
  maxLength: number | null;
  conditionalRequiredOperator: string | null;
  conditionalRequiredValue: string | null;
}

interface ExportedFlowNode {
  _exportId: string;
  _groupExportId: string | null;
  nodeType: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  label: string;
  stepType: string | null;
  configJson: any;
  fieldMappings: any;
  headerContent: string | null;
  displayWithPrevious: boolean;
}

interface ExportedFlowEdge {
  _sourceNodeExportId: string;
  _targetNodeExportId: string;
  sourceHandle: string;
  targetHandle: string;
  label: string | null;
  edgeType: string;
  animated: boolean;
}

interface ExportedStep {
  _exportId: string;
  _nextStepOnSuccessExportId: string | null;
  _nextStepOnFailureExportId: string | null;
  stepOrder: number;
  stepType: string;
  stepName: string;
  configJson: any;
  escapeSingleQuotesInBody: boolean;
  isEnabled: boolean;
}

interface ExportedFieldMappingFunction {
  _flowNodeExportId: string;
  functionName: string;
  description: string | null;
  functionType: string;
  functionLogic: any;
}

export interface ApiSourceReference {
  key: string;
  apiSource: string;
  apiName: string;
  apiId?: string;
}

export interface ApiOption {
  id: string;
  name: string;
  type: 'base_api' | 'secondary_api';
}

export async function exportButton(buttonId: string): Promise<ExportedButton> {
  const [buttonRes, groupsRes, fieldsRes, nodesRes, edgesRes, stepsRes] = await Promise.all([
    supabase.from('execute_buttons').select('*').eq('id', buttonId).single(),
    supabase.from('execute_button_groups').select('*').eq('button_id', buttonId).order('sort_order'),
    supabase.from('execute_button_fields').select('*').order('sort_order'),
    supabase.from('execute_button_flow_nodes').select('*').eq('button_id', buttonId),
    supabase.from('execute_button_flow_edges').select('*').eq('button_id', buttonId),
    supabase.from('execute_button_steps').select('*').eq('button_id', buttonId).order('step_order'),
  ]);

  if (buttonRes.error) throw new Error(`Failed to load button: ${buttonRes.error.message}`);
  if (groupsRes.error) throw new Error(`Failed to load groups: ${groupsRes.error.message}`);
  if (fieldsRes.error) throw new Error(`Failed to load fields: ${fieldsRes.error.message}`);
  if (nodesRes.error) throw new Error(`Failed to load flow nodes: ${nodesRes.error.message}`);
  if (edgesRes.error) throw new Error(`Failed to load flow edges: ${edgesRes.error.message}`);
  if (stepsRes.error) throw new Error(`Failed to load steps: ${stepsRes.error.message}`);

  const btn = buttonRes.data;
  const groups = groupsRes.data || [];
  const allFields = fieldsRes.data || [];
  const nodes = nodesRes.data || [];
  const edges = edgesRes.data || [];
  const steps = stepsRes.data || [];

  const groupIds = new Set(groups.map((g: any) => g.id));
  const fields = allFields.filter((f: any) => groupIds.has(f.group_id));

  const groupIdMap: Record<string, string> = {};
  groups.forEach((g: any, i: number) => { groupIdMap[g.id] = `group_${i}`; });

  const fieldIdMap: Record<string, string> = {};
  fields.forEach((f: any, i: number) => { fieldIdMap[f.id] = `field_${i}`; });

  const nodeIdMap: Record<string, string> = {};
  nodes.forEach((n: any, i: number) => { nodeIdMap[n.id] = `node_${i}`; });

  const stepIdMap: Record<string, string> = {};
  steps.forEach((s: any, i: number) => { stepIdMap[s.id] = `step_${i}`; });

  const flowNodeIds = nodes.map((n: any) => n.id);
  let fieldMappingFunctions: any[] = [];
  if (flowNodeIds.length > 0) {
    const { data: fmfs } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .in('flow_node_id', flowNodeIds);
    fieldMappingFunctions = fmfs || [];
  }

  let secondaryApiNames: Record<string, string> = {};
  const secondaryApiIds = new Set<string>();
  for (const node of nodes) {
    const cfg = node.config_json || {};
    if (cfg.apiSource === 'secondary_api' && cfg.apiId) {
      secondaryApiIds.add(cfg.apiId);
    }
  }
  for (const step of steps) {
    const cfg = step.config_json || {};
    if (cfg.apiSource === 'secondary_api' && cfg.apiId) {
      secondaryApiIds.add(cfg.apiId);
    }
  }
  if (secondaryApiIds.size > 0) {
    const { data: apis } = await supabase
      .from('secondary_api_configs')
      .select('id, name')
      .in('id', Array.from(secondaryApiIds));
    if (apis) {
      apis.forEach((a: any) => { secondaryApiNames[a.id] = a.name; });
    }
  }

  const enrichConfigJson = (cfg: any) => {
    if (!cfg) return cfg;
    const enriched = { ...cfg };
    if (enriched.apiSource === 'secondary_api' && enriched.apiId) {
      enriched._exportApiName = secondaryApiNames[enriched.apiId] || 'Unknown Secondary API';
    }
    return enriched;
  };

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    button: {
      name: btn.name,
      description: btn.description,
      isActive: btn.is_active,
      hasFlow: btn.has_flow || false,
      qrCodeEnabled: btn.qr_code_enabled || false,
    },
    groups: groups.map((g: any) => ({
      _exportId: groupIdMap[g.id],
      name: g.name,
      description: g.description,
      sortOrder: g.sort_order,
      isArrayGroup: g.is_array_group || false,
      arrayMinRows: g.array_min_rows || 1,
      arrayMaxRows: g.array_max_rows || 10,
      arrayFieldName: g.array_field_name || null,
    })),
    fields: fields.map((f: any) => ({
      _exportId: fieldIdMap[f.id],
      _groupExportId: groupIdMap[f.group_id],
      _conditionalRequiredFieldExportId: f.conditional_required_field_id ? fieldIdMap[f.conditional_required_field_id] || null : null,
      name: f.name,
      fieldKey: f.field_key,
      fieldType: f.field_type,
      isRequired: f.is_required,
      defaultValue: f.default_value,
      options: f.options,
      dropdownDisplayMode: f.dropdown_display_mode || 'description_only',
      sortOrder: f.sort_order,
      placeholder: f.placeholder,
      helpText: f.help_text,
      maxLength: f.max_length,
      timeInputOnly: f.time_input_only || false,
      conditionalRequiredOperator: f.conditional_required_operator,
      conditionalRequiredValue: f.conditional_required_value,
    })),
    flowNodes: nodes.map((n: any) => ({
      _exportId: nodeIdMap[n.id],
      _groupExportId: n.group_id ? groupIdMap[n.group_id] || null : null,
      nodeType: n.node_type,
      positionX: n.position_x,
      positionY: n.position_y,
      width: n.width,
      height: n.height,
      label: n.label,
      stepType: n.step_type,
      configJson: enrichConfigJson(n.config_json),
      fieldMappings: n.field_mappings,
      headerContent: n.header_content,
      displayWithPrevious: n.display_with_previous || false,
    })),
    flowEdges: edges.map((e: any) => ({
      _sourceNodeExportId: nodeIdMap[e.source_node_id],
      _targetNodeExportId: nodeIdMap[e.target_node_id],
      sourceHandle: e.source_handle,
      targetHandle: e.target_handle,
      label: e.label,
      edgeType: e.edge_type,
      animated: e.animated,
    })),
    steps: steps.map((s: any) => ({
      _exportId: stepIdMap[s.id],
      _nextStepOnSuccessExportId: s.next_step_on_success_id ? stepIdMap[s.next_step_on_success_id] || null : null,
      _nextStepOnFailureExportId: s.next_step_on_failure_id ? stepIdMap[s.next_step_on_failure_id] || null : null,
      stepOrder: s.step_order,
      stepType: s.step_type,
      stepName: s.step_name,
      configJson: enrichConfigJson(s.config_json),
      escapeSingleQuotesInBody: s.escape_single_quotes_in_body || false,
      isEnabled: s.is_enabled ?? true,
    })),
    fieldMappingFunctions: fieldMappingFunctions.map((fmf: any) => ({
      _flowNodeExportId: nodeIdMap[fmf.flow_node_id],
      functionName: fmf.function_name,
      description: fmf.description,
      functionType: fmf.function_type,
      functionLogic: fmf.function_logic,
    })),
  };
}

export function downloadExport(data: ExportedButton, filename: string) {
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

export function validateExportFile(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid file format' };
  if (data.version !== '1.0') return { valid: false, error: `Unsupported version: ${data.version}` };
  if (!data.button?.name) return { valid: false, error: 'Missing button name' };
  if (!Array.isArray(data.groups)) return { valid: false, error: 'Missing groups array' };
  if (!Array.isArray(data.fields)) return { valid: false, error: 'Missing fields array' };
  if (!Array.isArray(data.flowNodes)) return { valid: false, error: 'Missing flowNodes array' };
  if (!Array.isArray(data.flowEdges)) return { valid: false, error: 'Missing flowEdges array' };
  if (!Array.isArray(data.steps)) return { valid: false, error: 'Missing steps array' };
  return { valid: true };
}

export function extractApiSources(data: ExportedButton): ApiSourceReference[] {
  const sources = new Map<string, ApiSourceReference>();

  const processConfig = (cfg: any, label: string) => {
    if (!cfg) return;
    const stepTypes = ['api_endpoint', 'api_call', 'multipart_form_upload'];
    if (!cfg.apiSource) return;

    const key = cfg.apiSource === 'base_api'
      ? 'base_api'
      : `secondary_api:${cfg._exportApiName || cfg.apiId || 'unknown'}`;

    if (!sources.has(key)) {
      sources.set(key, {
        key,
        apiSource: cfg.apiSource,
        apiName: cfg.apiSource === 'base_api' ? 'Base API' : (cfg._exportApiName || 'Secondary API'),
        apiId: cfg.apiSource === 'secondary_api' ? cfg.apiId : undefined,
      });
    }
  };

  for (const node of data.flowNodes) {
    if (node.stepType === 'api_endpoint' || node.stepType === 'api_call' || node.stepType === 'multipart_form_upload') {
      processConfig(node.configJson, node.label);
    }
  }
  for (const step of data.steps) {
    if (step.stepType === 'api_endpoint' || step.stepType === 'api_call' || step.stepType === 'multipart_form_upload') {
      processConfig(step.configJson, step.stepName);
    }
  }

  return Array.from(sources.values());
}

export async function loadAvailableApis(): Promise<ApiOption[]> {
  const options: ApiOption[] = [];

  const { data: apiSettings } = await supabase
    .from('api_settings')
    .select('id, path')
    .limit(1)
    .maybeSingle();

  if (apiSettings) {
    options.push({
      id: 'base_api',
      name: `Base API (${apiSettings.path || 'Not configured'})`,
      type: 'base_api',
    });
  }

  const { data: secondaryApis } = await supabase
    .from('secondary_api_configs')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (secondaryApis) {
    for (const api of secondaryApis) {
      options.push({
        id: api.id,
        name: api.name,
        type: 'secondary_api',
      });
    }
  }

  return options;
}

export async function importButton(
  data: ExportedButton,
  apiMappings: Record<string, ApiOption>,
  buttonCount: number
): Promise<string> {
  const { data: newButton, error: btnErr } = await supabase
    .from('execute_buttons')
    .insert([{
      name: data.button.name,
      description: data.button.description,
      is_active: data.button.isActive,
      has_flow: data.button.hasFlow,
      qr_code_enabled: false,
      qr_code_slug: null,
      sort_order: buttonCount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (btnErr) throw new Error(`Failed to create button: ${btnErr.message}`);
  const buttonId = newButton.id;

  const groupExportToId: Record<string, string> = {};
  for (const group of data.groups) {
    const { data: newGroup, error: gErr } = await supabase
      .from('execute_button_groups')
      .insert([{
        button_id: buttonId,
        name: group.name,
        description: group.description,
        sort_order: group.sortOrder,
        is_array_group: group.isArrayGroup,
        array_min_rows: group.arrayMinRows,
        array_max_rows: group.arrayMaxRows,
        array_field_name: group.arrayFieldName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (gErr) throw new Error(`Failed to create group "${group.name}": ${gErr.message}`);
    groupExportToId[group._exportId] = newGroup.id;
  }

  const fieldExportToId: Record<string, string> = {};
  const fieldsWithoutConditional = data.fields.filter(f => !f._conditionalRequiredFieldExportId);
  const fieldsWithConditional = data.fields.filter(f => f._conditionalRequiredFieldExportId);

  for (const field of fieldsWithoutConditional) {
    const groupId = groupExportToId[field._groupExportId];
    if (!groupId) continue;

    const { data: newField, error: fErr } = await supabase
      .from('execute_button_fields')
      .insert([{
        group_id: groupId,
        name: field.name,
        field_key: field.fieldKey,
        field_type: field.fieldType,
        is_required: field.isRequired,
        default_value: field.defaultValue,
        options: field.options,
        dropdown_display_mode: field.dropdownDisplayMode,
        sort_order: field.sortOrder,
        placeholder: field.placeholder,
        help_text: field.helpText,
        max_length: field.maxLength,
        time_input_only: field.timeInputOnly || false,
        conditional_required_field_id: null,
        conditional_required_operator: null,
        conditional_required_value: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (fErr) throw new Error(`Failed to create field "${field.name}": ${fErr.message}`);
    fieldExportToId[field._exportId] = newField.id;
  }

  for (const field of fieldsWithConditional) {
    const groupId = groupExportToId[field._groupExportId];
    if (!groupId) continue;

    const conditionalFieldId = field._conditionalRequiredFieldExportId
      ? fieldExportToId[field._conditionalRequiredFieldExportId] || null
      : null;

    const { data: newField, error: fErr } = await supabase
      .from('execute_button_fields')
      .insert([{
        group_id: groupId,
        name: field.name,
        field_key: field.fieldKey,
        field_type: field.fieldType,
        is_required: field.isRequired,
        default_value: field.defaultValue,
        options: field.options,
        dropdown_display_mode: field.dropdownDisplayMode,
        sort_order: field.sortOrder,
        placeholder: field.placeholder,
        help_text: field.helpText,
        max_length: field.maxLength,
        time_input_only: field.timeInputOnly || false,
        conditional_required_field_id: conditionalFieldId,
        conditional_required_operator: field.conditionalRequiredOperator,
        conditional_required_value: field.conditionalRequiredValue,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (fErr) throw new Error(`Failed to create field "${field.name}": ${fErr.message}`);
    fieldExportToId[field._exportId] = newField.id;
  }

  const remapConfigJson = (cfg: any, sourceKey: string): any => {
    if (!cfg || !cfg.apiSource) return cfg;

    const key = cfg.apiSource === 'base_api'
      ? 'base_api'
      : `secondary_api:${cfg._exportApiName || cfg.apiId || 'unknown'}`;

    const mapping = apiMappings[key];
    if (!mapping) {
      const cleaned = { ...cfg };
      delete cleaned._exportApiName;
      return cleaned;
    }

    const remapped = { ...cfg };
    delete remapped._exportApiName;

    if (mapping.type === 'base_api') {
      remapped.apiSource = 'base_api';
      delete remapped.apiId;
    } else {
      remapped.apiSource = 'secondary_api';
      remapped.apiId = mapping.id;
    }

    return remapped;
  };

  const nodeExportToId: Record<string, string> = {};
  for (const node of data.flowNodes) {
    const groupId = node._groupExportId ? groupExportToId[node._groupExportId] || null : null;

    const sourceKey = node.configJson?.apiSource === 'base_api'
      ? 'base_api'
      : `secondary_api:${node.configJson?._exportApiName || node.configJson?.apiId || 'unknown'}`;

    const { data: newNode, error: nErr } = await supabase
      .from('execute_button_flow_nodes')
      .insert([{
        button_id: buttonId,
        node_type: node.nodeType,
        position_x: node.positionX,
        position_y: node.positionY,
        width: node.width,
        height: node.height,
        label: node.label,
        group_id: groupId,
        step_type: node.stepType,
        config_json: remapConfigJson(node.configJson, sourceKey),
        field_mappings: node.fieldMappings,
        header_content: node.headerContent,
        display_with_previous: node.displayWithPrevious,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (nErr) throw new Error(`Failed to create flow node "${node.label}": ${nErr.message}`);
    nodeExportToId[node._exportId] = newNode.id;
  }

  if (data.flowEdges.length > 0) {
    const edgeInserts = data.flowEdges
      .filter(e => nodeExportToId[e._sourceNodeExportId] && nodeExportToId[e._targetNodeExportId])
      .map(e => ({
        button_id: buttonId,
        source_node_id: nodeExportToId[e._sourceNodeExportId],
        target_node_id: nodeExportToId[e._targetNodeExportId],
        source_handle: e.sourceHandle,
        target_handle: e.targetHandle,
        label: e.label,
        edge_type: e.edgeType,
        animated: e.animated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    if (edgeInserts.length > 0) {
      const { error: eErr } = await supabase
        .from('execute_button_flow_edges')
        .insert(edgeInserts);
      if (eErr) throw new Error(`Failed to create flow edges: ${eErr.message}`);
    }
  }

  const stepExportToId: Record<string, string> = {};
  for (const step of data.steps) {
    const sourceKey = step.configJson?.apiSource === 'base_api'
      ? 'base_api'
      : `secondary_api:${step.configJson?._exportApiName || step.configJson?.apiId || 'unknown'}`;

    const { data: newStep, error: sErr } = await supabase
      .from('execute_button_steps')
      .insert([{
        button_id: buttonId,
        step_order: step.stepOrder,
        step_type: step.stepType,
        step_name: step.stepName,
        config_json: remapConfigJson(step.configJson, sourceKey),
        escape_single_quotes_in_body: step.escapeSingleQuotesInBody,
        is_enabled: step.isEnabled,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (sErr) throw new Error(`Failed to create step "${step.stepName}": ${sErr.message}`);
    stepExportToId[step._exportId] = newStep.id;
  }

  for (const step of data.steps) {
    const stepId = stepExportToId[step._exportId];
    const successId = step._nextStepOnSuccessExportId ? stepExportToId[step._nextStepOnSuccessExportId] || null : null;
    const failureId = step._nextStepOnFailureExportId ? stepExportToId[step._nextStepOnFailureExportId] || null : null;

    if (successId || failureId) {
      await supabase
        .from('execute_button_steps')
        .update({
          next_step_on_success_id: successId,
          next_step_on_failure_id: failureId,
        })
        .eq('id', stepId);
    }
  }

  for (const fmf of data.fieldMappingFunctions) {
    const flowNodeId = nodeExportToId[fmf._flowNodeExportId];
    if (!flowNodeId) continue;

    await supabase
      .from('field_mapping_functions')
      .insert([{
        flow_node_id: flowNodeId,
        function_name: fmf.functionName,
        description: fmf.description,
        function_type: fmf.functionType,
        function_logic: fmf.functionLogic,
      }]);
  }

  return buttonId;
}
