import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus, ChevronDown, ChevronRight, Braces, FileText, AlertCircle } from 'lucide-react';
import type { WorkflowV2StepType } from '../../../types';
import V2ApiEndpointConfig from './V2ApiEndpointConfig';
import V2AiDecisionConfig from './V2AiDecisionConfig';
import V2ImagingConfig from './V2ImagingConfig';
import V2UpdateImagingDocumentConfig from './V2UpdateImagingDocumentConfig';
import V2ReadEmailConfig from './V2ReadEmailConfig';
import V2ReadBarcodeConfig from './V2ReadBarcodeConfig';
import VariableDropdown from '../workflow/VariableDropdown';
import Select from '../../common/Select';
import CustomDropdown from '../../common/CustomDropdown';
import { supabase } from '../../../lib/supabase';

interface WorkflowV2StepConfigPanelProps {
  nodeId: string;
  label: string;
  stepType: string;
  configJson: any;
  escapeSingleQuotesInBody: boolean;
  userResponseTemplate: string;
  onUpdate: (updates: Record<string, any>) => void;
  onClose: () => void;
  onDelete: () => void;
  allNodes?: any[];
  onSaveNode?: (nodeId: string, updates: Record<string, any>) => Promise<void>;
  workflowType?: string;
}

const STEP_TYPES: { value: WorkflowV2StepType; label: string }[] = [
  { value: 'api_call', label: 'API Call' },
  { value: 'api_endpoint', label: 'API Endpoint' },
  { value: 'conditional_check', label: 'Conditional Check' },
  { value: 'data_transform', label: 'Data Transform' },
  { value: 'sftp_upload', label: 'SFTP Upload' },
  { value: 'email_action', label: 'Email Action' },
  { value: 'rename_file', label: 'Rename File' },
  { value: 'multipart_form_upload', label: 'Multipart Form Upload' },
  { value: 'ai_decision', label: 'AI Decision' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'read_email', label: 'Read Email' },
  { value: 'read_barcode', label: 'Read Barcode' },
  { value: 'user_message', label: 'User Message' },
  { value: 'inbox', label: 'Inbox Review' },
  { value: 'update_imaging_document', label: 'Update Imaging Document' },
];

export default function WorkflowV2StepConfigPanel({
  nodeId,
  label,
  stepType,
  configJson,
  escapeSingleQuotesInBody,
  userResponseTemplate,
  onUpdate,
  onClose,
  onDelete,
  allNodes = [],
  onSaveNode,
  workflowType,
}: WorkflowV2StepConfigPanelProps) {
  const [localLabel, setLocalLabel] = useState(label);
  const [localStepType, setLocalStepType] = useState(stepType);
  const [config, setConfig] = useState<any>(configJson || {});
  const [localEscapeQuotes, setLocalEscapeQuotes] = useState(escapeSingleQuotesInBody);
  const [localResponseTemplate, setLocalResponseTemplate] = useState(userResponseTemplate);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ basic: true, config: true });
  const [showResponseVarDropdown, setShowResponseVarDropdown] = useState(false);
  const responseVarBtnRef = useRef<HTMLButtonElement>(null);
  const [showMessageVarDropdown, setShowMessageVarDropdown] = useState(false);
  const messageVarBtnRef = useRef<HTMLButtonElement>(null);
  const [secondaryApis, setSecondaryApis] = useState<any[]>([]);
  const [authConfigs, setAuthConfigs] = useState<any[]>([]);
  const [userEmails, setUserEmails] = useState<Array<{ email: string; name: string }>>([]);
  const [multipartJsonParseError, setMultipartJsonParseError] = useState<{ [key: number]: string }>({});
  const [openVariableDropdown, setOpenVariableDropdown] = useState<string | null>(null);
  const multipartButtonRefs = useRef<Record<string, React.RefObject<HTMLButtonElement>>>({});
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const [emailBodyCursorPos, setEmailBodyCursorPos] = useState<number | null>(null);
  const [notificationTemplates, setNotificationTemplates] = useState<any[]>([]);
  const [selectedTemplateCustomFields, setSelectedTemplateCustomFields] = useState<Array<{name: string; label: string; description?: string}>>([]);

  const getMultipartButtonRef = (key: string): React.RefObject<HTMLButtonElement> => {
    if (!multipartButtonRefs.current[key]) {
      multipartButtonRefs.current[key] = React.createRef<HTMLButtonElement>();
    }
    return multipartButtonRefs.current[key];
  };

  useEffect(() => {
    const loadApiConfigs = async () => {
      try {
        const { data: secondaryData } = await supabase
          .from('secondary_api_configs')
          .select('id, name')
          .order('name');
        setSecondaryApis(secondaryData || []);

        const { data: authData } = await supabase
          .from('api_auth_config')
          .select('id, name')
          .order('name');
        setAuthConfigs(authData || []);

        const { data: usersData } = await supabase
          .from('users')
          .select('email, name')
          .not('email', 'is', null)
          .neq('email', '')
          .order('name');
        setUserEmails((usersData || []).filter((u: any) => u.email));
      } catch (err) {
        console.error('Error loading API configs:', err);
      }
    };
    loadApiConfigs();
  }, []);

  useEffect(() => {
    const loadNotificationTemplates = async () => {
      try {
        const { data } = await supabase
          .from('notification_templates')
          .select('*, custom_fields')
          .order('template_name');
        setNotificationTemplates(data || []);
      } catch (err) {
        console.error('Error loading notification templates:', err);
      }
    };
    loadNotificationTemplates();
  }, []);

  useEffect(() => {
    if (config.notificationTemplateId && notificationTemplates.length > 0) {
      const template = notificationTemplates.find((t: any) => t.id === config.notificationTemplateId);
      if (template && template.custom_fields) {
        setSelectedTemplateCustomFields(template.custom_fields);
      } else {
        setSelectedTemplateCustomFields([]);
      }
    } else {
      setSelectedTemplateCustomFields([]);
    }
  }, [config.notificationTemplateId, notificationTemplates]);

  useEffect(() => {
    setLocalLabel(label);
    setLocalStepType(stepType);
    const newConfig = configJson || {};
    setConfig(newConfig);
    setLocalEscapeQuotes(escapeSingleQuotesInBody);
    setLocalResponseTemplate(userResponseTemplate);
  }, [nodeId, label, stepType, configJson, escapeSingleQuotesInBody, userResponseTemplate]);

  const updateConfig = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    const updates = {
      label: localLabel,
      stepType: localStepType,
      configJson: config,
      escapeSingleQuotesInBody: localEscapeQuotes,
      userResponseTemplate: localResponseTemplate,
    };
    onUpdate(updates);
    if (onSaveNode && !nodeId.startsWith('temp-')) {
      onSaveNode(nodeId, updates).catch((err) => console.error('Failed to persist step:', err));
    }
    onClose();
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const SectionHeader = ({ id, title }: { id: string; title: string }) => (
    <button
      onClick={() => toggleSection(id)}
      className="flex items-center space-x-2 w-full text-left py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
    >
      {expandedSections[id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      <span>{title}</span>
    </button>
  );

  const renderApiCallConfig = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">HTTP Method</label>
        <CustomDropdown
          value={config.method || 'POST'}
          onChange={(val) => updateConfig('method', val)}
          options={[
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'PATCH', label: 'PATCH' },
          ]}
          size="sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">URL</label>
        <input
          type="text"
          value={config.url || ''}
          onChange={(e) => updateConfig('url', e.target.value)}
          placeholder="https://api.example.com/endpoint"
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Headers (JSON)</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Use {`{{variable}}`} in values to insert data from prior steps, e.g. {`"Access-Token": "{{response.token}}"`}
        </p>
        <textarea
          value={typeof config.headers === 'string' ? config.headers : JSON.stringify(config.headers || {}, null, 2)}
          onChange={(e) => {
            try {
              updateConfig('headers', JSON.parse(e.target.value));
            } catch {
              updateConfig('headers', e.target.value);
            }
          }}
          rows={4}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
        />
      </div>
      {config.method !== 'GET' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Request Body</label>
          <textarea
            value={config.requestBody || ''}
            onChange={(e) => updateConfig('requestBody', e.target.value)}
            rows={6}
            placeholder="Use {{variable}} for data references"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
          />
        </div>
      )}
      {renderResponseMappings()}
    </div>
  );

  const renderApiEndpointConfig = () => (
    <V2ApiEndpointConfig
      config={config}
      updateConfig={updateConfig}
      setConfig={setConfig}
      allNodes={allNodes}
      currentNodeId={nodeId}
      workflowInputVariables={getWorkflowInputVariables()}
    />
  );

  const renderConditionalConfig = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Field Path</label>
        <div className="flex items-center space-x-1.5">
          <input
            type="text"
            value={config.jsonPath || config.fieldPath || ''}
            onChange={(e) => { updateConfig('jsonPath', e.target.value); updateConfig('fieldPath', e.target.value); }}
            placeholder="e.g. response.status"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            ref={getMultipartButtonRef('cond-field-path')}
            type="button"
            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'cond-field-path' ? null : 'cond-field-path')}
            className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
            title="Insert variable"
          >
            <Braces className="w-4 h-4" />
          </button>
          <VariableDropdown
            isOpen={openVariableDropdown === 'cond-field-path'}
            onClose={() => setOpenVariableDropdown(null)}
            triggerRef={getMultipartButtonRef('cond-field-path')}
            variables={getDataTransformVariables()}
            onSelect={(varName) => {
              const current = config.jsonPath || config.fieldPath || '';
              const next = current ? `${current}{{${varName}}}` : `{{${varName}}}`;
              updateConfig('jsonPath', next);
              updateConfig('fieldPath', next);
              setOpenVariableDropdown(null);
            }}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Operator</label>
        <CustomDropdown
          value={config.operator || config.conditionType || 'equals'}
          onChange={(val) => { updateConfig('operator', val); updateConfig('conditionType', val); }}
          options={[
            { value: 'equals', label: 'Equals' },
            { value: 'not_equals', label: 'Not Equals' },
            { value: 'contains', label: 'Contains' },
            { value: 'not_contains', label: 'Not Contains' },
            { value: 'greater_than', label: 'Greater Than' },
            { value: 'less_than', label: 'Less Than' },
            { value: 'exists', label: 'Exists' },
            { value: 'not_exists', label: 'Not Exists' },
            { value: 'is_null', label: 'Is Null' },
            { value: 'is_not_null', label: 'Is Not Null' },
          ]}
          size="sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expected Value</label>
        <input
          type="text"
          value={config.expectedValue || ''}
          onChange={(e) => updateConfig('expectedValue', e.target.value)}
          placeholder="Value to compare against"
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      {renderAdditionalConditions()}
    </div>
  );

  const renderAdditionalConditions = () => {
    const conditions = config.additionalConditions || [];
    return (
      <div className="space-y-2">
        {conditions.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Logical Operator</label>
            <CustomDropdown
              value={config.logicalOperator || 'AND'}
              onChange={(val) => updateConfig('logicalOperator', val)}
              options={[
                { value: 'AND', label: 'AND' },
                { value: 'OR', label: 'OR' },
              ]}
              size="sm"
            />
          </div>
        )}
        {conditions.map((cond: any, idx: number) => (
          <div key={idx} className="flex items-center space-x-2">
            <input
              type="text"
              value={cond.jsonPath || ''}
              onChange={(e) => {
                const updated = [...conditions];
                updated[idx] = { ...updated[idx], jsonPath: e.target.value };
                updateConfig('additionalConditions', updated);
              }}
              placeholder="Field path"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <CustomDropdown
              value={cond.operator || 'equals'}
              onChange={(val) => {
                const updated = [...conditions];
                updated[idx] = { ...updated[idx], operator: val };
                updateConfig('additionalConditions', updated);
              }}
              options={[
                { value: 'equals', label: 'Equals' },
                { value: 'not_equals', label: 'Not Equals' },
                { value: 'contains', label: 'Contains' },
              ]}
              size="sm"
              className="w-28"
            />
            <input
              type="text"
              value={cond.expectedValue || ''}
              onChange={(e) => {
                const updated = [...conditions];
                updated[idx] = { ...updated[idx], expectedValue: e.target.value };
                updateConfig('additionalConditions', updated);
              }}
              placeholder="Value"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => {
                const updated = conditions.filter((_: any, i: number) => i !== idx);
                updateConfig('additionalConditions', updated);
              }}
              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => updateConfig('additionalConditions', [...conditions, { jsonPath: '', operator: 'equals', expectedValue: '' }])}
          className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" />
          <span>Add condition</span>
        </button>
      </div>
    );
  };

  const getWorkflowInputVariables = (): Array<{ name: string; stepName: string; source: 'workflow_input'; dataType?: string }> => {
    if (workflowType !== 'imaging') return [];
    return [
      { name: 'matchedBarcode', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'barcode (email/SFTP)' },
      { name: 'detectedBarcodes', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'all barcodes (array)' },
      { name: 'storagePath', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'file storage path' },
      { name: 'originalPdfFilename', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'original filename' },
      { name: 'pdfFilename', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'pdf filename' },
      { name: 'emailSubject', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'email trigger only' },
      { name: 'emailFrom', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'email trigger only' },
      { name: 'emailDate', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'email trigger only' },
      { name: 'sftpFolderPath', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'SFTP trigger only' },
      { name: 'billNumber', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'from calling Imaging document' },
      { name: 'detailLineId', stepName: 'Workflow Input', source: 'workflow_input', dataType: 'from calling Imaging document' },
    ];
  };

  const getDataTransformVariables = (): Array<{ name: string; stepName: string; source: 'workflow' | 'workflow_input'; dataType?: string }> => {
    const vars: Array<{ name: string; stepName: string; source: 'workflow' | 'workflow_input'; dataType?: string }> = [
      ...getWorkflowInputVariables(),
    ];
    for (const node of allNodes) {
      if (node.id === nodeId) continue;
      const nodeConfig = node.data?.configJson || node.config_json || {};
      const nodeLabel = node.data?.label || node.label || 'Step';
      const nodeStepType = node.data?.stepType || node.step_type || '';

      const nodeMappings = nodeConfig.responseDataMappings || [];
      for (const m of nodeMappings) {
        if (m.updatePath && m.updatePath.trim()) {
          vars.push({ name: m.updatePath, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: 'response mapping' });
        }
      }

      if (nodeStepType === 'data_transform') {
        const dtRules = nodeConfig.transformations || [];
        for (const rule of dtRules) {
          if (rule.outputVariable) {
            vars.push({ name: `transform.${rule.outputVariable}`, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: 'transform output' });
          }
        }
      }

      if (nodeStepType === 'read_email') {
        for (const m of (nodeConfig.emailFieldMappings || [])) {
          if (m.fieldName?.trim()) {
            vars.push({ name: m.fieldName, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: m.dataType || 'email field' });
          }
        }
      }

      if (nodeStepType === 'read_barcode') {
        for (const m of (nodeConfig.barcodeFieldMappings || [])) {
          if (m.fieldName?.trim()) {
            vars.push({ name: m.fieldName, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: m.dataType || 'barcode field' });
          }
        }
      }
    }
    return vars;
  };

  const renderDataTransformConfig = () => {
    const transformations = config.transformations || [{ sourceVariable: '', function: '', outputVariable: '' }];

    const TRANSFORM_FUNCTIONS = [
      { value: 'trim', label: 'Trim - Remove leading/trailing whitespace' },
      { value: 'uppercase', label: 'Uppercase - Convert to UPPER CASE' },
      { value: 'lowercase', label: 'Lowercase - Convert to lower case' },
      { value: 'trim_uppercase', label: 'Trim + Uppercase' },
      { value: 'trim_lowercase', label: 'Trim + Lowercase' },
      { value: 'remove_spaces', label: 'Remove Spaces - Strip all whitespace' },
      { value: 'remove_leading_zeros', label: 'Remove Leading Zeros' },
      { value: 'pad_left_10', label: 'Pad Left (10 chars with zeros)' },
      { value: 'left', label: 'Left - Keep first N characters' },
      { value: 'remove_left', label: 'Remove Left - Remove first N characters' },
      { value: 'substring_0_10', label: 'Substring (first 10 chars)' },
      { value: 'substring_0_20', label: 'Substring (first 20 chars)' },
      { value: 'multiply', label: 'Multiply - Multiply by a factor' },
      { value: 'divide', label: 'Divide - Divide by a factor' },
      { value: 'round', label: 'Round - Round to N decimal places' },
      { value: 'concat', label: 'Concatenate - Join multiple fields together' },
    ];

    return (
      <div className="space-y-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Transform values from context data. Results are stored as <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded">{'{{transform.<outputName>}}'}</code> for use in subsequent steps.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Transformation Rules</label>
          <button
            onClick={() => updateConfig('transformations', [...transformations, { sourceVariable: '', function: '', outputVariable: '' }])}
            className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Plus className="h-3 w-3" />
            <span>Add Rule</span>
          </button>
        </div>

        {transformations.map((t: any, idx: number) => (
          <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rule {idx + 1}</span>
              {transformations.length > 1 && (
                <button
                  onClick={() => {
                    const updated = transformations.filter((_: any, i: number) => i !== idx);
                    updateConfig('transformations', updated);
                  }}
                  className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {(t.function || t.transformation) !== 'concat' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Source Variable</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={t.sourceVariable || t.field_name || ''}
                  onChange={(e) => {
                    const updated = [...transformations];
                    updated[idx] = { ...updated[idx], sourceVariable: e.target.value, field_name: e.target.value };
                    updateConfig('transformations', updated);
                  }}
                  placeholder="e.g. orders[0].consignee.clientId"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                />
                <button
                  ref={getMultipartButtonRef(`dt-src-${idx}`) as any}
                  type="button"
                  onClick={() => setOpenVariableDropdown(openVariableDropdown === `dt-src-${idx}` ? null : `dt-src-${idx}`)}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                  title="Insert variable"
                >
                  <Braces className="w-4 h-4" />
                </button>
              </div>
              <VariableDropdown
                isOpen={openVariableDropdown === `dt-src-${idx}`}
                onClose={() => setOpenVariableDropdown(null)}
                triggerRef={getMultipartButtonRef(`dt-src-${idx}`)}
                variables={getDataTransformVariables()}
                onSelect={(variableName) => {
                  const updated = [...transformations];
                  updated[idx] = { ...updated[idx], sourceVariable: variableName, field_name: variableName };
                  updateConfig('transformations', updated);
                  setOpenVariableDropdown(null);
                }}
              />
            </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Function</label>
              <Select
                value={t.function || t.transformation || ''}
                onValueChange={(val) => {
                  const updated = [...transformations];
                  updated[idx] = { ...updated[idx], function: val, transformation: val };
                  updateConfig('transformations', updated);
                }}
                options={TRANSFORM_FUNCTIONS}
                placeholder="Select a function..."
                searchable={false}
              />
              {(t.function || t.transformation) === 'left' && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Number of Characters to Keep</label>
                  <input
                    type="number"
                    min={1}
                    value={t.leftCount || ''}
                    onChange={(e) => {
                      const updated = [...transformations];
                      updated[idx] = { ...updated[idx], leftCount: parseInt(e.target.value) || undefined };
                      updateConfig('transformations', updated);
                    }}
                    placeholder="e.g. 9"
                    className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}
              {(t.function || t.transformation) === 'remove_left' && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Number of Characters to Remove</label>
                  <input
                    type="number"
                    min={1}
                    value={t.removeLeftCount || ''}
                    onChange={(e) => {
                      const updated = [...transformations];
                      updated[idx] = { ...updated[idx], removeLeftCount: parseInt(e.target.value) || undefined };
                      updateConfig('transformations', updated);
                    }}
                    placeholder="e.g. 3"
                    className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Characters to strip from the beginning (e.g. 3 removes "DR-" from "DR-12345678")
                  </p>
                </div>
              )}
              {((t.function || t.transformation) === 'multiply' || (t.function || t.transformation) === 'divide') && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {(t.function || t.transformation) === 'multiply' ? 'Multiply By' : 'Divide By'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={t.mathFactor ?? ''}
                      onChange={(e) => {
                        const updated = [...transformations];
                        updated[idx] = { ...updated[idx], mathFactor: e.target.value };
                        updateConfig('transformations', updated);
                      }}
                      placeholder="e.g. 2.20462"
                      className="w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Decimal Places</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={t.mathDecimals ?? 2}
                      onChange={(e) => {
                        const updated = [...transformations];
                        updated[idx] = { ...updated[idx], mathDecimals: parseInt(e.target.value) || 0 };
                        updateConfig('transformations', updated);
                      }}
                      placeholder="2"
                      className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(t.function || t.transformation) === 'multiply'
                      ? 'e.g. kg to lbs: multiply by 2.20462'
                      : 'e.g. lbs to kg: divide by 2.20462'}
                  </p>
                </div>
              )}
              {(t.function || t.transformation) === 'round' && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Decimal Places</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={t.mathDecimals ?? 0}
                    onChange={(e) => {
                      const updated = [...transformations];
                      updated[idx] = { ...updated[idx], mathDecimals: parseInt(e.target.value) || 0 };
                      updateConfig('transformations', updated);
                    }}
                    placeholder="0"
                    className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Number of decimal places to round to (0 = whole number)
                  </p>
                </div>
              )}
              {(t.function || t.transformation) === 'concat' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Fields to Concatenate</label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...transformations];
                          const cur = Array.isArray(updated[idx].concatFields) ? updated[idx].concatFields : [];
                          updated[idx] = { ...updated[idx], concatFields: [...cur, ''] };
                          updateConfig('transformations', updated);
                        }}
                        className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Field</span>
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(Array.isArray(t.concatFields) ? t.concatFields : []).map((cf: string, fidx: number) => (
                        <div key={fidx} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={cf || ''}
                            onChange={(e) => {
                              const updated = [...transformations];
                              const cur = [...(Array.isArray(updated[idx].concatFields) ? updated[idx].concatFields : [])];
                              cur[fidx] = e.target.value;
                              updated[idx] = { ...updated[idx], concatFields: cur };
                              updateConfig('transformations', updated);
                            }}
                            placeholder="e.g. orders[0].consignee.city"
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-mono"
                          />
                          <button
                            ref={getMultipartButtonRef(`dt-concat-${idx}-${fidx}`) as any}
                            type="button"
                            onClick={() => setOpenVariableDropdown(openVariableDropdown === `dt-concat-${idx}-${fidx}` ? null : `dt-concat-${idx}-${fidx}`)}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex-shrink-0"
                            title="Insert variable"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...transformations];
                              const cur = (Array.isArray(updated[idx].concatFields) ? updated[idx].concatFields : []).filter((_: string, i: number) => i !== fidx);
                              updated[idx] = { ...updated[idx], concatFields: cur };
                              updateConfig('transformations', updated);
                            }}
                            className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md flex-shrink-0"
                            title="Remove field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <VariableDropdown
                            isOpen={openVariableDropdown === `dt-concat-${idx}-${fidx}`}
                            onClose={() => setOpenVariableDropdown(null)}
                            triggerRef={getMultipartButtonRef(`dt-concat-${idx}-${fidx}`)}
                            variables={getDataTransformVariables()}
                            onSelect={(variableName) => {
                              const updated = [...transformations];
                              const cur = [...(Array.isArray(updated[idx].concatFields) ? updated[idx].concatFields : [])];
                              cur[fidx] = variableName;
                              updated[idx] = { ...updated[idx], concatFields: cur };
                              updateConfig('transformations', updated);
                              setOpenVariableDropdown(null);
                            }}
                          />
                        </div>
                      ))}
                      {(!Array.isArray(t.concatFields) || t.concatFields.length === 0) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No fields added yet. Click "Add Field" to choose the fields to join.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Separator Between Fields</label>
                    <Select
                      value={t.separatorType || 'none'}
                      onValueChange={(val) => {
                        const updated = [...transformations];
                        updated[idx] = { ...updated[idx], separatorType: val };
                        updateConfig('transformations', updated);
                      }}
                      options={[
                        { value: 'none', label: 'No space' },
                        { value: 'space', label: 'Space' },
                        { value: 'custom', label: 'Custom - type your own' },
                      ]}
                      searchable={false}
                    />
                    {t.separatorType === 'custom' && (
                      <input
                        type="text"
                        value={t.separatorValue || ''}
                        onChange={(e) => {
                          const updated = [...transformations];
                          updated[idx] = { ...updated[idx], separatorValue: e.target.value };
                          updateConfig('transformations', updated);
                        }}
                        placeholder="e.g.  -  ,  /"
                        className="mt-2 w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Empty Fields</label>
                    <Select
                      value={t.emptyHandling || 'keep'}
                      onValueChange={(val) => {
                        const updated = [...transformations];
                        updated[idx] = { ...updated[idx], emptyHandling: val };
                        updateConfig('transformations', updated);
                      }}
                      options={[
                        { value: 'keep', label: 'Keep as blank (separator still added)' },
                        { value: 'skip', label: 'Skip empty fields (no extra separator)' },
                      ]}
                      searchable={false}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              {(t.function || t.transformation) !== 'concat' && (
              <label className="flex items-center space-x-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={t.overwriteSource || false}
                  onChange={(e) => {
                    const updated = [...transformations];
                    updated[idx] = { ...updated[idx], overwriteSource: e.target.checked };
                    updateConfig('transformations', updated);
                  }}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Overwrite source variable</span>
              </label>
              )}
              {t.overwriteSource && (t.function || t.transformation) !== 'concat' ? (
                <p className="text-xs text-green-600 dark:text-green-400">
                  The transformed value will be written back to <code className="px-1 py-0.5 bg-green-100 dark:bg-green-900/30 rounded">{`{{${t.sourceVariable || 'source'}}}`}</code> so downstream steps use it automatically.
                </p>
              ) : (
                <>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Output Variable Name</label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">transform.</span>
                    <input
                      type="text"
                      value={t.outputVariable || ''}
                      onChange={(e) => {
                        const sanitized = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                        const updated = [...transformations];
                        updated[idx] = { ...updated[idx], outputVariable: sanitized };
                        updateConfig('transformations', updated);
                      }}
                      placeholder="e.g. barcode_trimmed"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-mono"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Access this value in later steps as <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">{'{{transform.' + (t.outputVariable || 'name') + '}}'}</code>
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSftpUploadConfig = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Upload Type</label>
        <CustomDropdown
          value={config.uploadType || 'csv'}
          onChange={(val) => updateConfig('uploadType', val)}
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'json', label: 'JSON' },
            { value: 'xml', label: 'XML' },
            { value: 'pdf', label: 'PDF' },
          ]}
          size="sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SFTP Path Override</label>
        <input
          type="text"
          value={config.sftpPathOverride || ''}
          onChange={(e) => updateConfig('sftpPathOverride', e.target.value)}
          placeholder="/custom/path/"
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={config.useApiResponseForFilename || false}
          onChange={(e) => updateConfig('useApiResponseForFilename', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <label className="text-xs text-gray-600 dark:text-gray-400">Use API response for filename</label>
      </div>
      {config.useApiResponseForFilename && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Filename Source Path</label>
          <input
            type="text"
            value={config.filenameSourcePath || ''}
            onChange={(e) => updateConfig('filenameSourcePath', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fallback Filename</label>
        <input
          type="text"
          value={config.fallbackFilename || ''}
          onChange={(e) => updateConfig('fallbackFilename', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">PDF Upload Strategy</label>
        <CustomDropdown
          value={config.pdfUploadStrategy || 'all_pages_in_group'}
          onChange={(val) => updateConfig('pdfUploadStrategy', val)}
          options={[
            { value: 'all_pages_in_group', label: 'All pages in group' },
            { value: 'specific_page_in_group', label: 'Specific page' },
          ]}
          size="sm"
        />
      </div>
    </div>
  );

  const getEmailVariables = (): Array<{ name: string; stepName: string; source: 'workflow' | 'workflow_input' | 'context'; dataType?: string }> => {
    const vars: Array<{ name: string; stepName: string; source: 'workflow' | 'workflow_input' | 'context'; dataType?: string }> = [
      { name: 'submitterEmail', stepName: 'Context', source: 'context', dataType: 'order entry / extract submitter' },
      { name: 'senderEmail', stepName: 'Context', source: 'context', dataType: 'sender (email trigger or submitter)' },
      { name: 'extractionTypeName', stepName: 'Context', source: 'context', dataType: 'extraction type name' },
      { name: 'timestamp', stepName: 'Context', source: 'context', dataType: 'execution timestamp' },
      ...getWorkflowInputVariables(),
    ];
    for (const node of allNodes) {
      if (node.id === nodeId) continue;
      const nodeConfig = node.data?.configJson || node.config_json || {};
      const nodeStepType = node.data?.stepType || node.step_type || '';
      const nodeLabel = node.data?.label || node.label || 'Step';

      const nodeMappings = nodeConfig.responseDataMappings || [];
      for (const m of nodeMappings) {
        if (m.updatePath && m.updatePath.trim()) {
          vars.push({ name: m.updatePath, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: 'response mapping' });
        }
      }

      if (nodeStepType === 'read_email') {
        const emailMappings = nodeConfig.emailFieldMappings || [];
        for (const m of emailMappings) {
          if (m.fieldName && m.fieldName.trim()) {
            vars.push({ name: m.fieldName, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: m.dataType || 'email field' });
          }
        }
      }

      if (nodeStepType === 'read_barcode') {
        const barcodeMappings = nodeConfig.barcodeFieldMappings || [];
        for (const m of barcodeMappings) {
          if (m.fieldName && m.fieldName.trim()) {
            vars.push({ name: m.fieldName, stepName: `from ${nodeLabel}`, source: 'workflow', dataType: m.dataType || 'barcode field' });
          }
        }
      }
    }
    return vars;
  };

  const renderEmailConfig = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={config.to || ''}
            onChange={(e) => updateConfig('to', e.target.value)}
            placeholder="recipient@example.com or {{variable}}"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            ref={getMultipartButtonRef('email-to') as any}
            type="button"
            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-to' ? null : 'email-to')}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            title="Insert variable"
          >
            <Braces className="w-4 h-4" />
          </button>
          <VariableDropdown
            isOpen={openVariableDropdown === 'email-to'}
            onClose={() => setOpenVariableDropdown(null)}
            triggerRef={getMultipartButtonRef('email-to')}
            variables={[
              ...getEmailVariables(),
              ...userEmails.map(u => ({
                name: u.email,
                stepName: u.name || u.email,
                source: 'user_email' as const,
                dataType: 'email',
              })),
            ]}
            onSelect={(variableName) => {
              const isUserEmail = userEmails.some(u => u.email === variableName);
              const current = config.to || '';
              if (isUserEmail) {
                updateConfig('to', current ? `${current}${variableName}` : variableName);
              } else {
                updateConfig('to', current ? `${current}{{${variableName}}}` : `{{${variableName}}}`);
              }
              setOpenVariableDropdown(null);
            }}
          />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Separate multiple emails with a comma (,)</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">CC</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={config.cc || ''}
            onChange={(e) => updateConfig('cc', e.target.value)}
            placeholder="cc@example.com or {{variable}}"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            ref={getMultipartButtonRef('email-cc') as any}
            type="button"
            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-cc' ? null : 'email-cc')}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            title="Insert variable"
          >
            <Braces className="w-4 h-4" />
          </button>
          <VariableDropdown
            isOpen={openVariableDropdown === 'email-cc'}
            onClose={() => setOpenVariableDropdown(null)}
            triggerRef={getMultipartButtonRef('email-cc')}
            variables={[
              ...getEmailVariables(),
              ...userEmails.map(u => ({
                name: u.email,
                stepName: u.name || u.email,
                source: 'user_email' as const,
                dataType: 'email',
              })),
            ]}
            onSelect={(variableName) => {
              const isUserEmail = userEmails.some(u => u.email === variableName);
              const current = config.cc || '';
              if (isUserEmail) {
                updateConfig('cc', current ? `${current}, ${variableName}` : variableName);
              } else {
                updateConfig('cc', current ? `${current}, {{${variableName}}}` : `{{${variableName}}}`);
              }
              setOpenVariableDropdown(null);
            }}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">BCC</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={config.bcc || ''}
            onChange={(e) => updateConfig('bcc', e.target.value)}
            placeholder="bcc@example.com or {{variable}}"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            ref={getMultipartButtonRef('email-bcc') as any}
            type="button"
            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-bcc' ? null : 'email-bcc')}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            title="Insert variable"
          >
            <Braces className="w-4 h-4" />
          </button>
          <VariableDropdown
            isOpen={openVariableDropdown === 'email-bcc'}
            onClose={() => setOpenVariableDropdown(null)}
            triggerRef={getMultipartButtonRef('email-bcc')}
            variables={[
              ...getEmailVariables(),
              ...userEmails.map(u => ({
                name: u.email,
                stepName: u.name || u.email,
                source: 'user_email' as const,
                dataType: 'email',
              })),
            ]}
            onSelect={(variableName) => {
              const isUserEmail = userEmails.some(u => u.email === variableName);
              const current = config.bcc || '';
              if (isUserEmail) {
                updateConfig('bcc', current ? `${current}, ${variableName}` : variableName);
              } else {
                updateConfig('bcc', current ? `${current}, {{${variableName}}}` : `{{${variableName}}}`);
              }
              setOpenVariableDropdown(null);
            }}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subject</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={config.subject || ''}
            onChange={(e) => updateConfig('subject', e.target.value)}
            placeholder="Email subject"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            ref={getMultipartButtonRef('email-subject') as any}
            type="button"
            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-subject' ? null : 'email-subject')}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            title="Insert variable"
          >
            <Braces className="w-4 h-4" />
          </button>
          <VariableDropdown
            isOpen={openVariableDropdown === 'email-subject'}
            onClose={() => setOpenVariableDropdown(null)}
            triggerRef={getMultipartButtonRef('email-subject')}
            variables={getEmailVariables()}
            onSelect={(variableName) => {
              const current = config.subject || '';
              updateConfig('subject', current ? `${current}{{${variableName}}}` : `{{${variableName}}}`);
              setOpenVariableDropdown(null);
            }}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Body</label>
        <div className="flex space-x-2">
          <textarea
            ref={emailBodyRef}
            value={config.body || ''}
            onChange={(e) => updateConfig('body', e.target.value)}
            rows={5}
            placeholder="Email body text"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            ref={getMultipartButtonRef('email-body') as any}
            type="button"
            onClick={() => {
              if (emailBodyRef.current) {
                setEmailBodyCursorPos(emailBodyRef.current.selectionStart);
              }
              setOpenVariableDropdown(openVariableDropdown === 'email-body' ? null : 'email-body');
            }}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors h-fit"
            title="Insert variable"
          >
            <Braces className="w-4 h-4" />
          </button>
          <VariableDropdown
            isOpen={openVariableDropdown === 'email-body'}
            onClose={() => setOpenVariableDropdown(null)}
            triggerRef={getMultipartButtonRef('email-body')}
            variables={getEmailVariables()}
            onSelect={(variableName) => {
              const variable = `{{${variableName}}}`;
              const currentBody = config.body || '';
              const cursorPos = emailBodyCursorPos ?? currentBody.length;
              const newValue = currentBody.slice(0, cursorPos) + variable + currentBody.slice(cursorPos);
              updateConfig('body', newValue);
              setEmailBodyCursorPos(null);
              setOpenVariableDropdown(null);
            }}
          />
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={config.includeAttachment !== false}
          onChange={(e) => updateConfig('includeAttachment', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <label className="text-xs text-gray-600 dark:text-gray-400">Include attachment</label>
      </div>
      {config.includeAttachment !== false && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Attachment Source</label>
          <CustomDropdown
            value={config.attachmentSource || 'original_pdf'}
            onChange={(val) => updateConfig('attachmentSource', val)}
            options={[
              { value: 'original_pdf', label: 'Original PDF' },
              { value: 'extracted_data', label: 'Extracted Data' },
              { value: 'extraction_type_filename', label: 'Extraction Type Filename' },
              { value: 'renamed_pdf', label: 'Renamed PDF (from previous step)' },
              { value: 'imaging_document', label: 'Imaging Document (from previous Imaging step)' },
              { value: 'api_step_response', label: 'API Step Response (binary/PDF)' },
            ]}
            size="sm"
          />
        </div>
      )}
      {config.includeAttachment !== false && config.attachmentSource === 'imaging_document' && (
        <div className="space-y-2 p-2 bg-gray-50 dark:bg-gray-700/40 rounded border border-gray-200 dark:border-gray-600">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Multiple attachments</label>
            <CustomDropdown
              value={config.attachmentMode === 'merged' ? 'merged' : 'separate'}
              onChange={(val) => updateConfig('attachmentMode', val)}
              options={[
                { value: 'separate', label: 'Attach each as a separate file' },
                { value: 'merged', label: 'Merge into one PDF' },
              ]}
              size="sm"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">When the previous Imaging step returns more than one document, choose whether to send them separately or combine them into a single merged PDF.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Attachment Filename (optional)</label>
            <div className="flex space-x-2 relative">
              <input
                type="text"
                value={config.attachmentFilenameTemplate || ''}
                onChange={(e) => updateConfig('attachmentFilenameTemplate', e.target.value)}
                placeholder="e.g., Invoice-{{billNumber}}.pdf"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button
                ref={getMultipartButtonRef('email-attach-filename-img') as any}
                type="button"
                onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-attach-filename-img' ? null : 'email-attach-filename-img')}
                className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
                title="Insert variable"
              >
                <Braces className="w-4 h-4" />
              </button>
              <VariableDropdown
                isOpen={openVariableDropdown === 'email-attach-filename-img'}
                onClose={() => setOpenVariableDropdown(null)}
                triggerRef={getMultipartButtonRef('email-attach-filename-img')}
                variables={getDataTransformVariables()}
                onSelect={(varName) => {
                  const current = config.attachmentFilenameTemplate || '';
                  updateConfig('attachmentFilenameTemplate', `${current}{{${varName}}}`);
                  setOpenVariableDropdown(null);
                }}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Leave blank to use each document's stored filename. Supports variables like {"{{billNumber}}"} and, in separate mode, {"{{index}}"}.</p>
          </div>
        </div>
      )}
      {config.includeAttachment !== false && config.attachmentSource === 'api_step_response' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Attachment Filename Template</label>
          <div className="flex space-x-2 relative">
            <input
              type="text"
              value={config.attachmentFilenameTemplate || ''}
              onChange={(e) => updateConfig('attachmentFilenameTemplate', e.target.value)}
              placeholder="e.g., Report-{{billNumber}}.pdf"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              ref={getMultipartButtonRef('email-attach-filename-api') as any}
              type="button"
              onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-attach-filename-api' ? null : 'email-attach-filename-api')}
              className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
              title="Insert variable"
            >
              <Braces className="w-4 h-4" />
            </button>
            <VariableDropdown
              isOpen={openVariableDropdown === 'email-attach-filename-api'}
              onClose={() => setOpenVariableDropdown(null)}
              triggerRef={getMultipartButtonRef('email-attach-filename-api')}
              variables={getDataTransformVariables()}
              onSelect={(varName) => {
                const current = config.attachmentFilenameTemplate || '';
                updateConfig('attachmentFilenameTemplate', `${current}{{${varName}}}`);
                setOpenVariableDropdown(null);
              }}
            />
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">Supports variables like {"{{billNumber}}"}</p>
        </div>
      )}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={config.toCurrentUser || false}
          onChange={(e) => updateConfig('toCurrentUser', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <label className="text-xs text-gray-600 dark:text-gray-400">To current user</label>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={config.ccUser || false}
          onChange={(e) => updateConfig('ccUser', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <label className="text-xs text-gray-600 dark:text-gray-400">CC current user</label>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3">
        <div className="flex items-center space-x-2 mb-2">
          <input
            type="checkbox"
            checked={config.isNotificationEmail || false}
            onChange={(e) => {
              updateConfig('isNotificationEmail', e.target.checked);
              if (!e.target.checked) {
                updateConfig('notificationTemplateId', '');
                updateConfig('recipientEmailOverride', '');
                updateConfig('customFieldMappings', {});
              }
            }}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Use notification template</label>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Use a pre-configured notification template instead of direct email fields</p>
          </div>
        </div>

        {config.isNotificationEmail && (
          <div className="space-y-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notification Template</label>
              <CustomDropdown
                value={config.notificationTemplateId || ''}
                onChange={(val) => updateConfig('notificationTemplateId', val)}
                options={notificationTemplates.map((t: any) => ({
                  value: t.id,
                  label: `${t.template_name} (${t.template_type})`
                }))}
                size="sm"
              />
              {!config.notificationTemplateId && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Select a template for this email step to work
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Recipient Override (Optional)</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={config.recipientEmailOverride || ''}
                  onChange={(e) => updateConfig('recipientEmailOverride', e.target.value)}
                  placeholder="Leave empty to use template recipient"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <button
                  ref={getMultipartButtonRef('notif-recipient') as any}
                  type="button"
                  onClick={() => setOpenVariableDropdown(openVariableDropdown === 'notif-recipient' ? null : 'notif-recipient')}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  title="Insert variable"
                >
                  <Braces className="w-4 h-4" />
                </button>
                <VariableDropdown
                  isOpen={openVariableDropdown === 'notif-recipient'}
                  onClose={() => setOpenVariableDropdown(null)}
                  triggerRef={getMultipartButtonRef('notif-recipient')}
                  variables={[
                    ...getEmailVariables(),
                    ...userEmails.map(u => ({
                      name: u.email,
                      stepName: u.name || u.email,
                      source: 'user_email' as const,
                      dataType: 'email',
                    })),
                  ]}
                  onSelect={(variableName) => {
                    const isUserEmail = userEmails.some(u => u.email === variableName);
                    const current = config.recipientEmailOverride || '';
                    if (isUserEmail) {
                      updateConfig('recipientEmailOverride', current ? `${current}${variableName}` : variableName);
                    } else {
                      updateConfig('recipientEmailOverride', current ? `${current}{{${variableName}}}` : `{{${variableName}}}`);
                    }
                    setOpenVariableDropdown(null);
                  }}
                />
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                Override the template's default recipient. Supports {'{{variable}}'} syntax.
              </p>
            </div>

            {selectedTemplateCustomFields.length > 0 && (
              <div className="border-t border-blue-200 dark:border-blue-700 pt-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <Braces className="w-3 h-3" />
                  Custom Field Mappings
                </h5>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                  Map workflow data to the template's custom fields
                </p>
                <div className="space-y-2">
                  {selectedTemplateCustomFields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                        {field.label} <code className="text-[9px] bg-gray-100 dark:bg-gray-700 px-1 rounded">{`{{${field.name}}}`}</code>
                      </label>
                      {field.description && (
                        <p className="text-[9px] text-gray-400 dark:text-gray-500 mb-1">{field.description}</p>
                      )}
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={(config.customFieldMappings || {})[field.name] || ''}
                          onChange={(e) => updateConfig('customFieldMappings', {
                            ...(config.customFieldMappings || {}),
                            [field.name]: e.target.value
                          })}
                          placeholder={`{{response.data.${field.name}}}`}
                          className="flex-1 px-3 py-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        <button
                          ref={getMultipartButtonRef(`custom-field-${field.name}`) as any}
                          type="button"
                          onClick={() => setOpenVariableDropdown(openVariableDropdown === `custom-field-${field.name}` ? null : `custom-field-${field.name}`)}
                          className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          title="Insert variable"
                        >
                          <Braces className="w-3 h-3" />
                        </button>
                        <VariableDropdown
                          isOpen={openVariableDropdown === `custom-field-${field.name}`}
                          onClose={() => setOpenVariableDropdown(null)}
                          triggerRef={getMultipartButtonRef(`custom-field-${field.name}`)}
                          variables={getEmailVariables()}
                          onSelect={(variableName) => {
                            const currentValue = (config.customFieldMappings || {})[field.name] || '';
                            updateConfig('customFieldMappings', {
                              ...(config.customFieldMappings || {}),
                              [field.name]: currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}`
                            });
                            setOpenVariableDropdown(null);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                checked={config.includeAttachment !== false}
                onChange={(e) => updateConfig('includeAttachment', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <label className="text-xs text-gray-600 dark:text-gray-400">Override attachment (uncheck to use template setting)</label>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderRenameFileConfig = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Filename Template</label>
        <input
          type="text"
          value={config.filenameTemplate || ''}
          onChange={(e) => updateConfig('filenameTemplate', e.target.value)}
          placeholder="{{OrderNumber}}_{{Date}}"
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fallback Filename</label>
        <input
          type="text"
          value={config.fallbackFilename || ''}
          onChange={(e) => updateConfig('fallbackFilename', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={config.appendTimestamp || false}
          onChange={(e) => updateConfig('appendTimestamp', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <label className="text-xs text-gray-600 dark:text-gray-400">Append timestamp</label>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">File Types to Rename</label>
        <div className="flex flex-wrap gap-3">
          {['pdf', 'csv', 'json', 'xml'].map(ft => (
            <label key={ft} className="flex items-center space-x-1.5 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={ft === 'pdf' ? config.renamePdf !== false : config[`rename${ft.charAt(0).toUpperCase() + ft.slice(1)}`] || false}
                onChange={(e) => updateConfig(ft === 'pdf' ? 'renamePdf' : `rename${ft.charAt(0).toUpperCase() + ft.slice(1)}`, e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span>{ft.toUpperCase()}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const generateMultipartFieldMappings = (partIndex: number) => {
    const formParts = config.formParts || [];
    const part = formParts[partIndex];
    if (!part || part.type !== 'text' || !part.value?.trim()) return;

    try {
      const template = JSON.parse(part.value);
      const fieldMappings: Array<{ fieldName: string; type: 'hardcoded' | 'variable'; value: string; dataType: string }> = [];

      const extractFields = (obj: any, prefix: string = '') => {
        for (const key of Object.keys(obj)) {
          const fullPath = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];

          if (value === null || value === undefined) {
            fieldMappings.push({ fieldName: fullPath, type: 'hardcoded', value: '', dataType: 'string' });
          } else if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object') {
              extractFields(value[0], `${fullPath}[0]`);
            }
          } else if (typeof value === 'object') {
            extractFields(value, fullPath);
          } else {
            let dataType = 'string';
            if (typeof value === 'number') {
              dataType = Number.isInteger(value) ? 'integer' : 'number';
            } else if (typeof value === 'boolean') {
              dataType = 'boolean';
            }
            fieldMappings.push({ fieldName: fullPath, type: 'hardcoded', value: String(value), dataType });
          }
        }
      };

      extractFields(template);

      const existingFieldNames = new Set((part.fieldMappings || []).map((m: any) => m.fieldName));
      const newMappings = fieldMappings.filter(m => !existingFieldNames.has(m.fieldName));
      const updated = [...formParts];
      updated[partIndex] = { ...updated[partIndex], fieldMappings: [...(part.fieldMappings || []), ...newMappings] };
      updateConfig('formParts', updated);
      setMultipartJsonParseError(prev => ({ ...prev, [partIndex]: '' }));
    } catch (error: any) {
      setMultipartJsonParseError(prev => ({ ...prev, [partIndex]: error.message || 'Invalid JSON format' }));
    }
  };

  const updateMultipartFieldMapping = (partIndex: number, mappingIndex: number, field: string, value: any) => {
    const formParts = [...(config.formParts || [])];
    const mappings = [...(formParts[partIndex].fieldMappings || [])];
    mappings[mappingIndex] = { ...mappings[mappingIndex], [field]: value };
    formParts[partIndex] = { ...formParts[partIndex], fieldMappings: mappings };
    updateConfig('formParts', formParts);
  };

  const removeMultipartFieldMapping = (partIndex: number, mappingIndex: number) => {
    const formParts = [...(config.formParts || [])];
    const mappings = (formParts[partIndex].fieldMappings || []).filter((_: any, i: number) => i !== mappingIndex);
    formParts[partIndex] = { ...formParts[partIndex], fieldMappings: mappings };
    updateConfig('formParts', formParts);
  };

  const addMultipartFieldMapping = (partIndex: number) => {
    const formParts = [...(config.formParts || [])];
    const mappings = [...(formParts[partIndex].fieldMappings || []), { fieldName: '', type: 'hardcoded' as const, value: '', dataType: 'string' }];
    formParts[partIndex] = { ...formParts[partIndex], fieldMappings: mappings };
    updateConfig('formParts', formParts);
  };

  const getMultipartVariables = (): Array<{ name: string; stepName: string; source: 'workflow' | 'workflow_input'; dataType?: string }> => {
    const vars: Array<{ name: string; stepName: string; source: 'workflow' | 'workflow_input'; dataType?: string }> = [
      ...getWorkflowInputVariables(),
    ];
    for (const node of allNodes) {
      if (node.id === nodeId) continue;
      const nodeMappings = node.data?.configJson?.responseDataMappings || node.config_json?.responseDataMappings || [];
      for (const m of nodeMappings) {
        if (m.updatePath && m.updatePath.trim()) {
          vars.push({ name: m.updatePath, stepName: `from ${node.data?.label || node.label || 'Step'}`, source: 'workflow', dataType: 'response mapping' });
        }
      }
    }
    return vars;
  };

  const renderMultipartConfig = () => {
    const formParts = config.formParts || [{ name: 'file', type: 'file', value: '', contentType: '' }];
    const apiSourceType = config.apiSourceType || 'main';
    return (
      <div className="space-y-4">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-start space-x-3">
            <Braces className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <h5 className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Multipart Form Upload</h5>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                Upload PDF files via multipart/form-data with custom metadata fields.
              </p>
            </div>
          </div>
        </div>

        <div>
          <Select
            label="API Source"
            value={apiSourceType}
            onValueChange={(v) => updateConfig('apiSourceType', v)}
            options={[
              { value: 'main', label: 'Main API' },
              { value: 'secondary', label: 'Secondary API' },
              { value: 'auth_config', label: 'Auth Config Only' }
            ]}
          />
        </div>

        {apiSourceType === 'secondary' && (
          <div>
            <Select
              label="Secondary API"
              value={config.secondaryApiId || ''}
              onValueChange={(v) => updateConfig('secondaryApiId', v)}
              options={secondaryApis.map(api => ({ value: api.id, label: api.name }))}
              placeholder="Select secondary API..."
            />
          </div>
        )}

        {apiSourceType === 'auth_config' && (
          <div>
            <Select
              label="Authentication Config"
              value={config.authConfigId || ''}
              onValueChange={(v) => updateConfig('authConfigId', v)}
              options={authConfigs.map(c => ({ value: c.id, label: c.name }))}
              placeholder="Select auth config..."
            />
          </div>
        )}

        {(apiSourceType === 'main' || apiSourceType === 'secondary') && (
          <div>
            <Select
              label="Authentication (Optional)"
              value={config.authConfigId || '__none__'}
              onValueChange={(v) => updateConfig('authConfigId', v === '__none__' ? '' : v)}
              options={[
                { value: '__none__', label: 'Use API source default' },
                ...authConfigs.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Override authentication. Configure in Settings &gt; API Settings &gt; Authentication.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API URL</label>
          <input
            type="text"
            value={config.url || ''}
            onChange={(e) => updateConfig('url', e.target.value)}
            placeholder="https://api.example.com/upload or /api/Documents"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Full URL or path appended to base URL. Use {`{{variable}}`} for dynamic values.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Upload Filename Template</label>
          <input
            type="text"
            value={config.filenameTemplate || ''}
            onChange={(e) => updateConfig('filenameTemplate', e.target.value)}
            placeholder="e.g., {{response.orderNumber}}_document.pdf"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Leave empty to use original filename. Use {`{{variable}}`} for dynamic naming.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Custom Headers</label>
            <button
              type="button"
              onClick={() => {
                const headers = config.additionalHeaders || {};
                const newKey = `Header-${Object.keys(headers).length + 1}`;
                updateConfig('additionalHeaders', { ...headers, [newKey]: '' });
              }}
              className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              <Plus className="w-3 h-3" />
              <span>Add Header</span>
            </button>
          </div>
          {config.additionalHeaders && Object.keys(config.additionalHeaders).length > 0 && (
            <div className="space-y-2">
              {Object.entries(config.additionalHeaders || {}).map(([headerKey, headerValue]: [string, any], idx: number) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={headerKey}
                    onChange={(e) => {
                      const entries = Object.entries(config.additionalHeaders || {});
                      const updated: Record<string, string> = {};
                      entries.forEach(([k, v]: [string, any], i: number) => {
                        updated[i === idx ? e.target.value : k] = String(v);
                      });
                      updateConfig('additionalHeaders', updated);
                    }}
                    className="w-1/3 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Header name"
                  />
                  <input
                    type="text"
                    value={String(headerValue)}
                    onChange={(e) => {
                      updateConfig('additionalHeaders', { ...config.additionalHeaders, [headerKey]: e.target.value });
                    }}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Value or {{variable}}"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...config.additionalHeaders };
                      delete updated[headerKey];
                      updateConfig('additionalHeaders', updated);
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Add custom request headers. Use {`{{variable}}`} for dynamic values from prior steps.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Form Parts</label>
            <button
              type="button"
              onClick={() => updateConfig('formParts', [...formParts, { name: '', type: 'text', value: '', contentType: '' }])}
              className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              <Plus className="w-3 h-3" />
              <span>Add Part</span>
            </button>
          </div>

          <div className="space-y-3">
            {formParts.map((part: any, index: number) => (
              <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={part.name || ''}
                      onChange={(e) => {
                        const updated = [...formParts];
                        updated[index] = { ...updated[index], name: e.target.value };
                        updateConfig('formParts', updated);
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., properties"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
                    <CustomDropdown
                      value={part.type || 'text'}
                      onChange={(val) => {
                        const updated = [...formParts];
                        updated[index] = { ...updated[index], type: val };
                        updateConfig('formParts', updated);
                      }}
                      options={[
                        { value: 'text', label: 'Text' },
                        { value: 'file', label: 'File' },
                      ]}
                      size="sm"
                    />
                  </div>
                  {part.type === 'text' && (
                    <>
                      <div className="col-span-4">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Value</label>
                          {(part.contentType || '').toLowerCase().includes('json') && (
                            <button
                              type="button"
                              onClick={() => generateMultipartFieldMappings(index)}
                              className="flex items-center px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              Map JSON
                            </button>
                          )}
                        </div>
                        <textarea
                          value={part.value || ''}
                          onChange={(e) => {
                            const updated = [...formParts];
                            updated[index] = { ...updated[index], value: e.target.value };
                            updateConfig('formParts', updated);
                            if (multipartJsonParseError[index]) {
                              setMultipartJsonParseError(prev => ({ ...prev, [index]: '' }));
                            }
                          }}
                          rows={3}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100 font-mono"
                          placeholder='{"key": "value", "In_DocName": "{{variable}}"}'
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Content-Type</label>
                        <input
                          type="text"
                          value={part.contentType || ''}
                          onChange={(e) => {
                            const updated = [...formParts];
                            updated[index] = { ...updated[index], contentType: e.target.value };
                            updateConfig('formParts', updated);
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder="application/json"
                        />
                      </div>
                    </>
                  )}
                  {part.type === 'file' && (
                    <div className="col-span-6">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">File Source</label>
                      <div className="px-2 py-1.5 text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                        PDF from workflow context
                      </div>
                    </div>
                  )}
                  <div className="col-span-1 pt-5">
                    {formParts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = formParts.filter((_: any, i: number) => i !== index);
                          updateConfig('formParts', updated);
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {multipartJsonParseError[index] && (
                  <div className="mt-2 flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 dark:text-red-300 font-mono">{multipartJsonParseError[index]}</p>
                  </div>
                )}

                {part.type === 'text' && part.fieldMappings && part.fieldMappings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Field Mappings</label>
                      <button
                        type="button"
                        onClick={() => addMultipartFieldMapping(index)}
                        className="flex items-center px-2 py-0.5 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Field
                      </button>
                    </div>
                    <div className="space-y-2">
                      {part.fieldMappings.map((mapping: any, mappingIndex: number) => (
                        <div
                          key={mappingIndex}
                          className={`p-2 rounded border ${
                            mapping.type === 'hardcoded'
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          }`}
                        >
                          <div className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-3">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Field</label>
                              <input
                                type="text"
                                value={mapping.fieldName || ''}
                                onChange={(e) => updateMultipartFieldMapping(index, mappingIndex, 'fieldName', e.target.value)}
                                className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                placeholder="fieldName"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Type</label>
                              <CustomDropdown
                                value={mapping.type || 'hardcoded'}
                                onChange={(val) => updateMultipartFieldMapping(index, mappingIndex, 'type', val)}
                                options={[
                                  { value: 'hardcoded', label: 'Hardcoded' },
                                  { value: 'variable', label: 'Variable' },
                                ]}
                                size="sm"
                              />
                            </div>
                            <div className="col-span-4">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Value</label>
                              <div className="flex items-center space-x-1">
                                <input
                                  type="text"
                                  value={mapping.value || ''}
                                  onChange={(e) => updateMultipartFieldMapping(index, mappingIndex, 'value', e.target.value)}
                                  className="flex-1 px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                  placeholder={mapping.type === 'hardcoded' ? 'value' : '{{variable}}'}
                                />
                                {mapping.type === 'variable' && (
                                  <>
                                    <button
                                      ref={getMultipartButtonRef(`mp_${index}_${mappingIndex}`) as any}
                                      type="button"
                                      onClick={() => setOpenVariableDropdown(openVariableDropdown === `mp_${index}_${mappingIndex}` ? null : `mp_${index}_${mappingIndex}`)}
                                      className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                                    >
                                      <Braces className="w-3 h-3" />
                                    </button>
                                    <VariableDropdown
                                      isOpen={openVariableDropdown === `mp_${index}_${mappingIndex}`}
                                      onClose={() => setOpenVariableDropdown(null)}
                                      triggerRef={getMultipartButtonRef(`mp_${index}_${mappingIndex}`)}
                                      variables={getMultipartVariables()}
                                      onSelect={(varName) => {
                                        const current = mapping.value || '';
                                        updateMultipartFieldMapping(index, mappingIndex, 'value', current + `{{${varName}}}`);
                                        setOpenVariableDropdown(null);
                                      }}
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Data Type</label>
                              <CustomDropdown
                                value={mapping.dataType || 'string'}
                                onChange={(val) => updateMultipartFieldMapping(index, mappingIndex, 'dataType', val)}
                                options={[
                                  { value: 'string', label: 'String' },
                                  { value: 'integer', label: 'Integer' },
                                  { value: 'number', label: 'Number' },
                                  { value: 'boolean', label: 'Boolean' },
                                ]}
                                size="sm"
                              />
                            </div>
                            <div className="col-span-1">
                              <button
                                type="button"
                                onClick={() => removeMultipartFieldMapping(index, mappingIndex)}
                                className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Configure form-data parts. The "file" type part will include the PDF from the workflow.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Response Data Mappings</label>
            <button
              type="button"
              onClick={() => updateConfig('responseDataMappings', [...(config.responseDataMappings || []), { responsePath: '', updatePath: '' }])}
              className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              <Plus className="w-3 h-3" />
              <span>Add Mapping</span>
            </button>
          </div>

          {(config.responseDataMappings || []).length > 0 && (
            <div className="space-y-2">
              {(config.responseDataMappings || []).map((mapping: any, index: number) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={mapping.responsePath || ''}
                    onChange={(e) => {
                      const updated = [...(config.responseDataMappings || [])];
                      updated[index] = { ...updated[index], responsePath: e.target.value };
                      updateConfig('responseDataMappings', updated);
                    }}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Response path (e.g., data.id)"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="text"
                    value={mapping.updatePath || ''}
                    onChange={(e) => {
                      const updated = [...(config.responseDataMappings || [])];
                      updated[index] = { ...updated[index], updatePath: e.target.value };
                      updateConfig('responseDataMappings', updated);
                    }}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Context path (e.g., documentId)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (config.responseDataMappings || []).filter((_: any, i: number) => i !== index);
                      updateConfig('responseDataMappings', updated);
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Map values from the API response to context variables for use in subsequent steps.
          </p>
        </div>
      </div>
    );
  };

  const renderResponseMappings = () => {
    const mappings = config.responseDataMappings || [];
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Response Data Mappings</label>
        {mappings.map((m: any, idx: number) => (
          <div key={idx} className="flex items-center space-x-2">
            <input
              type="text"
              value={m.responsePath || ''}
              onChange={(e) => {
                const updated = [...mappings];
                updated[idx] = { ...updated[idx], responsePath: e.target.value };
                updateConfig('responseDataMappings', updated);
              }}
              placeholder="Response path"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-gray-400 text-xs">-&gt;</span>
            <input
              type="text"
              value={m.updatePath || ''}
              onChange={(e) => {
                const updated = [...mappings];
                updated[idx] = { ...updated[idx], updatePath: e.target.value };
                updateConfig('responseDataMappings', updated);
              }}
              placeholder="Update path"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => {
                const updated = mappings.filter((_: any, i: number) => i !== idx);
                updateConfig('responseDataMappings', updated);
              }}
              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => updateConfig('responseDataMappings', [...mappings, { responsePath: '', updatePath: '' }])}
          className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" />
          <span>Add mapping</span>
        </button>
      </div>
    );
  };

  const renderUserMessageConfig = () => {
    const allVariables = (allNodes || [])
      .filter(n => n.id !== nodeId && n.data?.configJson?.responseDataMappings)
      .flatMap(n => (n.data.configJson.responseDataMappings || [])
        .filter((m: any) => m.updatePath && m.updatePath.trim() !== '')
        .map((m: any) => ({
          name: m.updatePath,
          stepName: `from ${n.data?.label || 'Step'}`,
          source: 'workflow' as const,
          dataType: 'response mapping'
        }))
      );

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Message Template
          </label>
          <div className="relative">
            <textarea
              value={config.messageTemplate || ''}
              onChange={(e) => updateConfig('messageTemplate', e.target.value)}
              placeholder="e.g., Order {billNumber} has been submitted successfully for {consigneeName}."
              rows={4}
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-y"
            />
            <button
              type="button"
              ref={messageVarBtnRef}
              onClick={() => setShowMessageVarDropdown(!showMessageVarDropdown)}
              className="absolute right-2 top-2 p-1 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded"
              title="Insert variable"
            >
              <Braces className="w-4 h-4" />
            </button>
            <VariableDropdown
              isOpen={showMessageVarDropdown}
              onClose={() => setShowMessageVarDropdown(false)}
              onSelect={(variableName) => {
                updateConfig('messageTemplate', (config.messageTemplate || '') + `{${variableName}}`);
                setShowMessageVarDropdown(false);
              }}
              variables={allVariables}
              triggerRef={messageVarBtnRef}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This message will be shown to the user after the workflow completes. Use {'{variableName}'} to include dynamic values from previous steps.
          </p>
        </div>
      </div>
    );
  };

  const renderInboxConfig = () => {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This step pauses the workflow and creates a reviewable item in the Inbox. A user can review the extracted data alongside the original PDF, make edits, then Accept (to resume the workflow) or Reject.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Inbox Item Label
          </label>
          <input
            type="text"
            value={config.label || ''}
            onChange={(e) => setConfig({ ...config, label: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. Review: {{extractionTypeName}}"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Display name shown in the Inbox list. Supports {'{{variable}}'} placeholders.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Reviewer Instructions
          </label>
          <textarea
            value={config.instructions || ''}
            onChange={(e) => setConfig({ ...config, instructions: e.target.value })}
            rows={3}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="What should the reviewer check or verify?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notification Emails (optional)
          </label>
          <input
            type="text"
            value={config.notifyEmails || ''}
            onChange={(e) => setConfig({ ...config, notifyEmails: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="user@example.com, user2@example.com"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Comma-separated emails to notify when a new inbox item is created. Leave blank to disable.
          </p>
        </div>
      </div>
    );
  };

  const renderStepConfig = () => {
    switch (localStepType) {
      case 'api_call': return renderApiCallConfig();
      case 'api_endpoint': return renderApiEndpointConfig();
      case 'conditional_check': return renderConditionalConfig();
      case 'data_transform': return renderDataTransformConfig();
      case 'sftp_upload': return renderSftpUploadConfig();
      case 'email_action': return renderEmailConfig();
      case 'rename_file': return renderRenameFileConfig();
      case 'multipart_form_upload': return renderMultipartConfig();
      case 'ai_decision': return (
        <V2AiDecisionConfig
          config={config}
          updateConfig={updateConfig}
          setConfig={setConfig}
          allNodes={allNodes}
          currentNodeId={nodeId}
        />
      );
      case 'imaging': return (
        <V2ImagingConfig
          config={config}
          updateConfig={updateConfig}
          allNodes={allNodes}
          currentNodeId={nodeId}
          workflowInputVariables={getWorkflowInputVariables()}
        />
      );
      case 'read_email': return (
        <V2ReadEmailConfig
          config={config}
          updateConfig={updateConfig}
          setConfig={setConfig}
        />
      );
      case 'read_barcode': return (
        <V2ReadBarcodeConfig
          config={config}
          updateConfig={updateConfig}
          setConfig={setConfig}
        />
      );
      case 'user_message': return renderUserMessageConfig();
      case 'inbox': return renderInboxConfig();
      case 'update_imaging_document': return (
        <V2UpdateImagingDocumentConfig
          config={config}
          updateConfig={updateConfig}
          allNodes={allNodes}
          currentNodeId={nodeId}
          workflowInputVariables={getWorkflowInputVariables()}
        />
      );
      default: return <p className="text-sm text-gray-500">Select a step type to configure.</p>;
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Step Configuration</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure step behavior and parameters</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              title="Delete step"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <SectionHeader id="basic" title="Basic Settings" />
          {expandedSections.basic && (
            <div className="space-y-4 pl-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                  <input
                    type="text"
                    value={localLabel}
                    onChange={(e) => setLocalLabel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Step Type</label>
                  <CustomDropdown
                    value={localStepType}
                    onChange={(val) => {
                      setLocalStepType(val);
                      setConfig({});
                    }}
                    options={STEP_TYPES.map(st => ({ value: st.value, label: st.label }))}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localEscapeQuotes}
                  onChange={(e) => setLocalEscapeQuotes(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <label className="text-sm text-gray-600 dark:text-gray-400">Escape single quotes in body</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  User Response Message
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={localResponseTemplate}
                    onChange={(e) => setLocalResponseTemplate(e.target.value)}
                    placeholder="e.g., Found Client ID: {orders.0.consignee.clientId}"
                    className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    ref={responseVarBtnRef}
                    onClick={() => setShowResponseVarDropdown(!showResponseVarDropdown)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded"
                    title="Insert variable"
                  >
                    <Braces className="w-4 h-4" />
                  </button>
                  <VariableDropdown
                    isOpen={showResponseVarDropdown}
                    onClose={() => setShowResponseVarDropdown(false)}
                    onSelect={(variableName) => {
                      setLocalResponseTemplate(prev => prev + `{${variableName}}`);
                      setShowResponseVarDropdown(false);
                    }}
                    variables={[
                      ...(config.responseDataMappings || [])
                        .filter((m: any) => m.updatePath && m.updatePath.trim() !== '')
                        .map((m: any) => ({
                          name: m.updatePath,
                          stepName: `Stored at: ${m.updatePath}`,
                          source: 'workflow' as const,
                          dataType: 'response mapping'
                        })),
                      ...allNodes
                        .filter(n => n.id !== nodeId && n.data?.configJson?.responseDataMappings)
                        .flatMap(n => (n.data.configJson.responseDataMappings || [])
                          .filter((m: any) => m.updatePath && m.updatePath.trim() !== '')
                          .map((m: any) => ({
                            name: m.updatePath,
                            stepName: `from ${n.data?.label || 'Step'}`,
                            source: 'workflow' as const,
                            dataType: 'response mapping'
                          }))
                        )
                    ]}
                    triggerRef={responseVarBtnRef}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Message shown to users during workflow execution. Use {'{variableName}'} to include dynamic values.
                </p>
              </div>
            </div>
          )}

          <SectionHeader id="config" title="Step Configuration" />
          {expandedSections.config && (
            <div className="pl-2">
              {renderStepConfig()}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save Step
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
