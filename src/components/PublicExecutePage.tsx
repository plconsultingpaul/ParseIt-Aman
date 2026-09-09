import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import FlowExecutionModal, { ExecuteButtonGroup, ExecuteButtonField, FlowNodeMapping } from './common/FlowExecutionModal';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const noCacheSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
  global: {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  }
});

interface ExecuteButton {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

function sortGroupsByFlow(nodes: any[], edges: any[], groups: any[]): any[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  nodes.forEach(n => adjacency.set(n.id, []));
  edges.forEach(e => {
    if (adjacency.has(e.source_node_id)) {
      adjacency.get(e.source_node_id)!.push(e.target_node_id);
    }
  });

  const connectedNodeIds = new Set<string>();
  edges.forEach(e => {
    connectedNodeIds.add(e.source_node_id);
    connectedNodeIds.add(e.target_node_id);
  });

  const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id));

  const inDegree = new Map<string, number>();
  connectedNodes.forEach(n => inDegree.set(n.id, 0));
  edges.forEach(e => {
    if (inDegree.has(e.target_node_id)) {
      inDegree.set(e.target_node_id, (inDegree.get(e.target_node_id) || 0) + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  const orderedNodeIds: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    orderedNodeIds.push(nodeId);
    (adjacency.get(nodeId) || []).forEach(targetId => {
      inDegree.set(targetId, (inDegree.get(targetId) || 1) - 1);
      if (inDegree.get(targetId) === 0) {
        queue.push(targetId);
      }
    });
  }

  const orderedGroups: any[] = [];
  orderedNodeIds.forEach(nodeId => {
    const node = nodeMap.get(nodeId);
    if (node && node.group_id) {
      const group = groups.find(g => g.id === node.group_id);
      if (group && !orderedGroups.includes(group)) {
        orderedGroups.push(group);
      }
    }
  });

  groups.forEach(g => {
    if (!orderedGroups.includes(g)) {
      orderedGroups.push(g);
    }
  });

  return orderedGroups;
}

export default function PublicExecutePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [button, setButton] = useState<ExecuteButton | null>(null);
  const [groups, setGroups] = useState<ExecuteButtonGroup[]>([]);
  const [fields, setFields] = useState<ExecuteButtonField[]>([]);
  const [flowNodeMappings, setFlowNodeMappings] = useState<FlowNodeMapping[]>([]);
  const [hasWorkflowNodes, setHasWorkflowNodes] = useState(false);
  const [showExecution, setShowExecution] = useState(false);

  useEffect(() => {
    if (slug) {
      loadButtonData();
    }
  }, [slug]);

  const loadButtonData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: buttonData, error: buttonError } = await noCacheSupabase
        .from('execute_buttons')
        .select('id, name, description, is_active, qr_code_enabled, visible_in_mobile')
        .eq('qr_code_slug', slug)
        .maybeSingle();

      if (buttonError) throw buttonError;

      if (!buttonData || (!buttonData.qr_code_enabled && !buttonData.visible_in_mobile)) {
        setError('This link is not valid or has been disabled.');
        return;
      }

      if (!buttonData.is_active) {
        setError('This flow is currently inactive.');
        return;
      }

      setButton({
        id: buttonData.id,
        name: buttonData.name,
        description: buttonData.description,
        isActive: buttonData.is_active
      });

      const [groupsRes, fieldsRes, flowRes, edgesRes] = await Promise.all([
        noCacheSupabase
          .from('execute_button_groups')
          .select('*')
          .eq('button_id', buttonData.id)
          .order('sort_order', { ascending: true }),
        noCacheSupabase
          .from('execute_button_fields')
          .select('*')
          .order('sort_order', { ascending: true }),
        noCacheSupabase
          .from('execute_button_flow_nodes')
          .select('*')
          .eq('button_id', buttonData.id),
        noCacheSupabase
          .from('execute_button_flow_edges')
          .select('*')
          .eq('button_id', buttonData.id)
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;

      const allFlowNodes = flowRes.data || [];
      const flowEdges = edgesRes.data || [];
      const formGroupNodes = allFlowNodes.filter((n: any) => n.node_type === 'group');
      const flowGroupIds = formGroupNodes.filter((n: any) => n.group_id).map((n: any) => n.group_id);

      const allGroups = (groupsRes.data || []);
      const relevantGroups = flowGroupIds.length > 0
        ? allGroups.filter(g => flowGroupIds.includes(g.id))
        : allGroups;

      const orderedGroups = flowGroupIds.length > 0
        ? sortGroupsByFlow(allFlowNodes, flowEdges, relevantGroups)
        : relevantGroups;

      const groupIds = orderedGroups.map(g => g.id);
      const buttonFields = (fieldsRes.data || []).filter(f => groupIds.includes(f.group_id));

      const mappedGroups: ExecuteButtonGroup[] = orderedGroups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        sortOrder: g.sort_order,
        isArrayGroup: g.is_array_group || false,
        arrayMinRows: g.array_min_rows || 1,
        arrayMaxRows: g.array_max_rows || 10,
        arrayFieldName: g.array_field_name || '',
        translations: g.translations || undefined,
      }));

      const mappedFields: ExecuteButtonField[] = buttonFields.map(f => ({
        id: f.id,
        groupId: f.group_id,
        name: f.name,
        fieldKey: f.field_key,
        fieldType: f.field_type,
        isRequired: f.is_required,
        defaultValue: f.default_value,
        options: f.options,
        dropdownDisplayMode: f.dropdown_display_mode,
        sortOrder: f.sort_order,
        placeholder: f.placeholder,
        helpText: f.help_text,
        maxLength: f.max_length,
        timeInputOnly: f.time_input_only || false,
        conditionalRequiredFieldId: f.conditional_required_field_id || null,
        conditionalRequiredOperator: f.conditional_required_operator || null,
        conditionalRequiredValue: f.conditional_required_value || null,
        translations: f.translations || undefined,
        apiLookupEndpoint: f.api_lookup_endpoint || null,
        apiLookupSecondaryApiId: f.api_lookup_secondary_api_id || null,
        apiLookupHttpMethod: f.api_lookup_http_method || 'GET',
        apiLookupSearchParam: f.api_lookup_search_param || null,
        apiLookupValueField: f.api_lookup_value_field || null,
        apiLookupDisplayColumns: f.api_lookup_display_columns || null,
        apiLookupFieldMappings: f.api_lookup_field_mappings || null,
        apiLookupRequestBody: f.api_lookup_request_body || null,
        apiLookupRequestBodyMappings: f.api_lookup_request_body_mappings || null,
        apiLookupWrapBodyInArray: f.api_lookup_wrap_body_in_array || false,
      }));

      const mappings: FlowNodeMapping[] = formGroupNodes
        .map((n: any) => ({
          nodeId: n.id,
          groupId: n.group_id,
          fieldMappings: n.field_mappings || {},
          headerContent: n.header_content,
          displayWithPrevious: n.display_with_previous || false
        }));

      const workflowNodesExist = allFlowNodes.some((n: any) => n.node_type !== 'group');

      setGroups(mappedGroups);
      setFields(mappedFields);
      setFlowNodeMappings(mappings);
      setHasWorkflowNodes(workflowNodesExist);
      setShowExecution(true);
    } catch (err: any) {
      console.error('Error loading button data:', err);
      setError('Failed to load this flow. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowExecution(false);
    setButton(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Unable to Load Flow
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error}
          </p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (showExecution && button) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <FlowExecutionModal
          buttonId={button.id}
          buttonName={button.name}
          groups={groups}
          fields={fields}
          flowNodeMappings={flowNodeMappings}
          onClose={handleClose}
          title={button.name}
          hasWorkflowNodes={hasWorkflowNodes}
        />
      </div>
    );
  }

  return null;
}
