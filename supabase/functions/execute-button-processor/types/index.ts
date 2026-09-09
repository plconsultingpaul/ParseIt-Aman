export interface FlowNode {
  id: string;
  node_type: 'group' | 'workflow';
  label: string;
  group_id?: string;
  step_type?: string;
  config_json?: any;
}

export interface FlowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string;
}
