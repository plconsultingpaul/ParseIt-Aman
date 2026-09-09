import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, FileText, AlertCircle, Info, List, Braces, Repeat, Layers, ExternalLink, Filter, Code, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Select from '../../common/Select';
import CustomDropdown from '../../common/CustomDropdown';
import VariableDropdown from '../workflow/VariableDropdown';
import SpecFieldDropdown, { type SpecFieldDropdownHandle } from '../workflow/SpecFieldDropdown';
import { FieldMappingFunctionsManager } from '../FieldMappingFunctionsManager';
import type { ApiSpecEndpoint, FieldMappingFunction } from '../../../types';

interface QueryParameter {
  id: string;
  field_name: string;
  field_type: string;
  is_required: boolean;
  description: string;
  example?: string;
  test_default?: string;
}

interface RequestBodyFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'variable' | 'function';
  value: string;
  dataType?: 'string' | 'number' | 'integer' | 'date' | 'datetime' | 'boolean';
  functionId?: string;
}

interface ConditionalArrayMapping {
  id: string;
  variable: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
  expectedValue: string;
  fieldMappings: RequestBodyFieldMapping[];
}

interface SpecField {
  field_name: string;
  field_path: string;
  field_type: string;
  description?: string;
}

interface SourceRecordField {
  label: string;
  value: string;
}

interface WorkflowInputVariable {
  name: string;
  stepName: string;
  source: 'workflow_input';
  dataType?: string;
}

interface V2ApiEndpointConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  setConfig: (fn: (prev: any) => any) => void;
  allNodes?: any[];
  currentNodeId?: string;
  sourceRecordFields?: SourceRecordField[];
  hideArrayAndMappingSections?: boolean;
  workflowInputVariables?: WorkflowInputVariable[];
}

export default function V2ApiEndpointConfig({
  config,
  updateConfig,
  setConfig,
  allNodes = [],
  currentNodeId,
  sourceRecordFields = [],
  hideArrayAndMappingSections = false,
  workflowInputVariables = [],
}: V2ApiEndpointConfigProps) {
  const [secondaryApis, setSecondaryApis] = useState<any[]>([]);
  const [authConfigs, setAuthConfigs] = useState<any[]>([]);
  const [apiSpecs, setApiSpecs] = useState<any[]>([]);
  const [selectedApiSpecId, setSelectedApiSpecId] = useState(config.apiSpecId || '');
  const [availableEndpoints, setAvailableEndpoints] = useState<ApiSpecEndpoint[]>([]);
  const [manualApiEntry, setManualApiEntry] = useState(config.manualApiEntry || false);
  const [queryParameters, setQueryParameters] = useState<QueryParameter[]>([]);
  const [responseSpecFields, setResponseSpecFields] = useState<SpecField[]>([]);
  const [allEndpointFields, setAllEndpointFields] = useState<SpecField[]>([]);
  const [responseSpecFieldsLoading, setResponseSpecFieldsLoading] = useState(false);
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [mainApiConfig, setMainApiConfig] = useState<any>(null);
  const [availableFunctions, setAvailableFunctions] = useState<FieldMappingFunction[]>([]);
  const [showFunctionsModal, setShowFunctionsModal] = useState(false);
  const [openVariableDropdown, setOpenVariableDropdown] = useState<string | null>(null);
  const [openSpecFieldDropdown, setOpenSpecFieldDropdown] = useState<string | null>(null);
  const buttonRefs = useRef<Record<string, React.RefObject<HTMLButtonElement>>>({});
  const specFieldRefs = useRef<Record<string, SpecFieldDropdownHandle | null>>({});
  const isRestoringRef = useRef(true);

  const sourceType = config.apiSourceType || 'main';
  const httpMethod = config.httpMethod || 'POST';
  const queryParameterConfig = config.queryParameterConfig || {};
  const pathVariableConfig = config.pathVariableConfig || {};
  const requestBodyTemplate = config.requestBodyTemplate || '';
  const requestBodyFieldMappings: RequestBodyFieldMapping[] = config.requestBodyFieldMappings || [];
  const arrayProcessingMode = config.arrayProcessingMode || 'none';
  const responseDataMappings = config.responseDataMappings || [];
  const conditionalArrayMappings: ConditionalArrayMapping[] = config.conditionalArrayMappings || [];

  const loadFunctions = useCallback(async () => {
    if (!currentNodeId) return;
    const { data: funcs } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('workflow_v2_node_id', currentNodeId)
      .order('function_name');
    setAvailableFunctions(funcs || []);
  }, [currentNodeId]);

  useEffect(() => {
    const load = async () => {
      const [{ data: sApis }, { data: aConfigs }, { data: mainApi }] = await Promise.all([
        supabase.from('secondary_api_configs').select('id, name, base_url, is_active').eq('is_active', true).order('name'),
        supabase.from('api_auth_config').select('id, name').order('name'),
        supabase.from('api_settings').select('*').maybeSingle(),
      ]);
      setSecondaryApis(sApis || []);
      setAuthConfigs(aConfigs || []);
      if (mainApi) setMainApiConfig(mainApi);
      await loadFunctions();
    };
    load();
  }, [loadFunctions]);

  useEffect(() => {
    if (config.apiSpecId && config.apiSpecId !== selectedApiSpecId) {
      isRestoringRef.current = true;
      setSelectedApiSpecId(config.apiSpecId);
    }
    setManualApiEntry(config.manualApiEntry || false);
  }, [config.apiSpecId, config.manualApiEntry]);

  useEffect(() => {
    const loadSpecs = async () => {
      let query = supabase.from('api_specs').select('*');
      if (sourceType === 'main') {
        query = query.not('api_endpoint_id', 'is', null);
      } else if (sourceType === 'secondary' && config.secondaryApiId) {
        query = query.eq('secondary_api_id', config.secondaryApiId);
      } else if (sourceType === 'auth_config') {
        setApiSpecs([]);
        return;
      } else {
        setApiSpecs([]);
        return;
      }
      const { data } = await query.order('uploaded_at', { ascending: false });
      if (data) {
        setApiSpecs(data);
        if (isRestoringRef.current && config.apiSpecId && data.some((s: any) => s.id === config.apiSpecId)) {
          setSelectedApiSpecId(config.apiSpecId);
          isRestoringRef.current = false;
        } else if (!isRestoringRef.current && data.length > 0 && !data.some((s: any) => s.id === selectedApiSpecId)) {
          setSelectedApiSpecId(data[0].id);
        }
      }
    };
    loadSpecs();
  }, [sourceType, config.secondaryApiId]);

  useEffect(() => {
    if (!selectedApiSpecId) {
      setAvailableEndpoints([]);
      return;
    }
    const loadEndpoints = async () => {
      const { data } = await supabase
        .from('api_spec_endpoints')
        .select('*')
        .eq('api_spec_id', selectedApiSpecId)
        .eq('method', httpMethod)
        .order('path');
      if (data) setAvailableEndpoints(data);
    };
    loadEndpoints();
  }, [selectedApiSpecId, httpMethod]);

  useEffect(() => {
    if (!config.apiSpecEndpointId) {
      setQueryParameters([]);
      setResponseSpecFields([]);
      setAllEndpointFields([]);
      return;
    }
    const loadEndpointFields = async () => {
      const [{ data: queryFields }, { data: respFields }, { data: nonQueryFields }] = await Promise.all([
        supabase
          .from('api_endpoint_fields')
          .select('*')
          .eq('api_spec_endpoint_id', config.apiSpecEndpointId)
          .like('field_path', '[query]%')
          .order('field_name'),
        supabase
          .from('api_endpoint_fields')
          .select('field_name, field_path, field_type, description')
          .eq('api_spec_endpoint_id', config.apiSpecEndpointId)
          .like('field_path', '[response]%')
          .order('field_path'),
        supabase
          .from('api_endpoint_fields')
          .select('field_name, field_path, field_type, description')
          .eq('api_spec_endpoint_id', config.apiSpecEndpointId)
          .not('field_path', 'like', '[query]%')
          .order('field_path'),
      ]);
      if (queryFields) {
        const params = queryFields.map((f: any) => ({
          id: f.id,
          field_name: f.field_name,
          field_type: f.field_type,
          is_required: f.is_required,
          description: f.description || '',
          example: f.example,
          test_default: f.test_default,
        }));
        setQueryParameters(params);
        const existingConfig = config.queryParameterConfig || {};
        const newConfig = { ...existingConfig };
        let changed = false;
        params.forEach((p: QueryParameter) => {
          if (!(p.field_name in newConfig)) {
            newConfig[p.field_name] = { enabled: p.is_required, value: '' };
            changed = true;
          }
        });
        if (changed) updateConfig('queryParameterConfig', newConfig);
      }
      if (respFields) setResponseSpecFields(respFields);
      if (nonQueryFields) setAllEndpointFields(nonQueryFields);
    };
    setResponseSpecFieldsLoading(true);
    loadEndpointFields().finally(() => setResponseSpecFieldsLoading(false));
  }, [config.apiSpecEndpointId]);

  const endpointOptions = useMemo(() => {
    return availableEndpoints.map(endpoint => ({
      value: endpoint.id,
      label: `${endpoint.path}${endpoint.summary ? ` - ${endpoint.summary}` : ''}`
    }));
  }, [availableEndpoints]);

  const handleEndpointSelect = (endpointId: string) => {
    const ep = availableEndpoints.find((e) => e.id === endpointId);
    if (ep) {
      setConfig((prev: any) => ({
        ...prev,
        apiPath: ep.path,
        apiSpecId: selectedApiSpecId,
        apiSpecEndpointId: ep.id,
      }));
    }
  };

  const getPathVariables = (): string[] => {
    const path = config.apiPath || '';
    const regex = /\{([^}]+)\}/g;
    const vars: string[] = [];
    let match;
    while ((match = regex.exec(path)) !== null) vars.push(match[1]);
    return vars;
  };

  const getBaseUrl = (): string => {
    if (sourceType === 'main') return mainApiConfig?.path || '';
    if (sourceType === 'secondary') {
      const api = secondaryApis.find((a) => a.id === config.secondaryApiId);
      return api?.base_url || '';
    }
    return '';
  };

  const getUrlPreview = (): string => {
    const base = getBaseUrl();
    const path = config.apiPath || '';
    const params: string[] = [];
    Object.entries(queryParameterConfig).forEach(([key, cfg]: [string, any]) => {
      if (cfg.enabled && cfg.value) params.push(`${key}=${cfg.value}`);
    });
    (config.customQueryParameters || []).forEach((p: { key: string; value: string }) => {
      if (p.key && p.value) params.push(`${p.key}=${p.value}`);
    });
    const qs = params.length > 0 ? `?${params.join('&')}` : '';
    return `${base}${path}${qs}`;
  };

  const getAvailableVariables = () => {
    const variables: { name: string; stepName: string; source: 'extraction' | 'workflow' | 'workflow_input' | 'execute' | 'source_record'; dataType?: string }[] = [];
    workflowInputVariables.forEach((v) => {
      variables.push({ name: v.name, stepName: v.stepName, source: 'workflow_input', dataType: v.dataType });
    });
    sourceRecordFields.forEach((field) => {
      if (!field.value) return;
      const varName = field.value.replace(/^\{\{/, '').replace(/\}\}$/, '').trim();
      if (varName) {
        variables.push({ name: varName, stepName: field.label || 'Source Record', source: 'source_record' });
      }
    });
    allNodes.forEach((node) => {
      if (node.id === currentNodeId) return;
      if (node.type === 'start') return;
      const nodeConfig = node.data?.configJson || {};
      const nodeName = node.data?.label || 'Step';
      if (nodeConfig.responseDataMappings && Array.isArray(nodeConfig.responseDataMappings)) {
        nodeConfig.responseDataMappings.forEach((m: any) => {
          if (m.updatePath) {
            variables.push({ name: `response.${m.updatePath}`, stepName: nodeName, source: 'workflow' });
          }
        });
      }
      if (node.data?.stepType === 'read_email' && Array.isArray(nodeConfig.emailFieldMappings)) {
        nodeConfig.emailFieldMappings.forEach((m: any) => {
          if (m.fieldName) {
            variables.push({ name: m.fieldName, stepName: nodeName, source: 'workflow', dataType: m.dataType || 'string' });
          }
        });
      }
      if (node.data?.stepType === 'data_transform' && Array.isArray(nodeConfig.transformations)) {
        nodeConfig.transformations.forEach((rule: any) => {
          if (rule.outputVariable) {
            variables.push({ name: `transform.${rule.outputVariable}`, stepName: nodeName, source: 'workflow', dataType: 'transform output' });
          }
        });
      }
      if (node.data?.stepType === 'read_barcode' && Array.isArray(nodeConfig.barcodeFieldMappings)) {
        nodeConfig.barcodeFieldMappings.forEach((m: any) => {
          if (m.fieldName) {
            variables.push({ name: m.fieldName, stepName: nodeName, source: 'workflow', dataType: m.dataType || 'string' });
          }
        });
      }
    });
    return variables;
  };

  const getButtonRef = (key: string): React.RefObject<HTMLButtonElement> => {
    if (!buttonRefs.current[key]) {
      buttonRefs.current[key] = React.createRef<HTMLButtonElement>();
    }
    return buttonRefs.current[key];
  };

  const handleParameterToggle = (fieldName: string) => {
    const newCfg = {
      ...queryParameterConfig,
      [fieldName]: { ...queryParameterConfig[fieldName], enabled: !queryParameterConfig[fieldName]?.enabled },
    };
    updateConfig('queryParameterConfig', newCfg);
  };

  const handleParameterValueChange = (fieldName: string, value: string) => {
    const newCfg = {
      ...queryParameterConfig,
      [fieldName]: { ...queryParameterConfig[fieldName], value },
    };
    updateConfig('queryParameterConfig', newCfg);
  };

  const handleInsertVariable = (fieldName: string, variableName: string) => {
    for (const key of Object.keys(specFieldRefs.current)) {
      const handle = specFieldRefs.current[key];
      if (handle?.isInFilterBuildMode()) {
        handle.insertFilterVariable(variableName);
        setOpenVariableDropdown(null);
        return;
      }
    }
    const current = queryParameterConfig[fieldName]?.value || '';
    handleParameterValueChange(fieldName, current ? `${current}{{${variableName}}}` : `{{${variableName}}}`);
    setOpenVariableDropdown(null);
  };

  const handleInsertFilterExpression = (fieldName: string, expression: string) => {
    const current = queryParameterConfig[fieldName]?.value || '';
    handleParameterValueChange(fieldName, current ? `${current} and ${expression}` : expression);
  };

  const handleInsertSpecField = (fieldName: string, specFieldPath: string) => {
    const current = queryParameterConfig[fieldName]?.value || '';
    handleParameterValueChange(fieldName, current ? `${current},${specFieldPath}` : specFieldPath);
  };

  const handlePathVariableChange = (variableName: string, value: string) => {
    updateConfig('pathVariableConfig', { ...pathVariableConfig, [variableName]: value });
  };

  const handleInsertPathVariable = (variableName: string, insertValue: string) => {
    const current = pathVariableConfig[variableName] || '';
    handlePathVariableChange(variableName, current ? `${current}{{${insertValue}}}` : `{{${insertValue}}}`);
    setOpenVariableDropdown(null);
  };

  const generateFieldMappings = () => {
    if (!requestBodyTemplate) return;
    try {
      const template = JSON.parse(requestBodyTemplate);
      const mappings: RequestBodyFieldMapping[] = [];
      const extractFields = (obj: any, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const fieldName = prefix ? `${prefix}.${key}` : key;
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            extractFields(value[0], `${fieldName}[0]`);
          } else if (value && typeof value === 'object') {
            extractFields(value, fieldName);
          } else {
            let dataType: RequestBodyFieldMapping['dataType'] = 'string';
            if (typeof value === 'number') dataType = Number.isInteger(value) ? 'integer' : 'number';
            else if (typeof value === 'boolean') dataType = 'boolean';
            mappings.push({ fieldName, type: 'hardcoded', value: '', dataType });
          }
        }
      };
      extractFields(template);
      const existing = new Set(requestBodyFieldMappings.map((m) => m.fieldName));
      const newMappings = mappings.filter((m) => !existing.has(m.fieldName));
      updateConfig('requestBodyFieldMappings', [...requestBodyFieldMappings, ...newMappings]);
      setJsonParseError(null);
    } catch (err: any) {
      setJsonParseError(err?.message ? `JSON parse error: ${err.message}` : 'Invalid JSON format.');
    }
  };

  const handleInsertRequestBodyVariable = (index: number, variableName: string) => {
    const updated = [...requestBodyFieldMappings];
    const current = updated[index]?.value || '';
    updated[index] = { ...updated[index], value: current ? `${current}{{${variableName}}}` : `{{${variableName}}}` };
    updateConfig('requestBodyFieldMappings', updated);
    setOpenVariableDropdown(null);
  };

  const showSpecDropdown = sourceType !== 'auth_config';
  const pathVars = getPathVariables();

  return (
    <div className="space-y-3">
      {/* API Source */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Source</label>
        <CustomDropdown
          value={sourceType}
          onChange={(val) => {
            setConfig((prev: any) => ({
              ...prev,
              apiSourceType: val,
              apiPath: '',
              apiSpecId: undefined,
              apiSpecEndpointId: undefined,
              queryParameterConfig: {},
              pathVariableConfig: {},
            }));
            setSelectedApiSpecId('');
            setAvailableEndpoints([]);
            setQueryParameters([]);
            setResponseSpecFields([]);
          }}
          options={[
            { value: 'main', label: 'Main API' },
            { value: 'secondary', label: 'Secondary API' },
            { value: 'auth_config', label: 'Auth Config' },
          ]}
          size="sm"
        />
      </div>

      {sourceType === 'secondary' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Secondary API</label>
          <CustomDropdown
            value={config.secondaryApiId || ''}
            onChange={(val) => {
              setConfig((prev: any) => ({
                ...prev,
                secondaryApiId: val,
                apiPath: '',
                apiSpecId: undefined,
                apiSpecEndpointId: undefined,
                queryParameterConfig: {},
                pathVariableConfig: {},
              }));
              setSelectedApiSpecId('');
              setAvailableEndpoints([]);
              setQueryParameters([]);
            }}
            options={[
              { value: '', label: 'Select...' },
              ...secondaryApis.map((api) => ({ value: api.id, label: api.name })),
            ]}
            size="sm"
          />
        </div>
      )}

      {sourceType === 'auth_config' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Auth Config</label>
          <CustomDropdown
            value={config.authConfigId || ''}
            onChange={(val) => updateConfig('authConfigId', val)}
            options={[
              { value: '', label: 'Select...' },
              ...authConfigs.map((ac) => ({ value: ac.id, label: ac.name })),
            ]}
            size="sm"
          />
        </div>
      )}

      {/* HTTP Method */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">HTTP Method</label>
        <CustomDropdown
          value={httpMethod}
          onChange={(val) => updateConfig('httpMethod', val)}
          options={[
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'PATCH', label: 'PATCH' },
            { value: 'DELETE', label: 'DELETE' },
          ]}
          size="sm"
        />
      </div>

      {/* API Specification */}
      {showSpecDropdown && apiSpecs.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Specification</label>
          <CustomDropdown
            value={selectedApiSpecId}
            onChange={(val) => {
              setSelectedApiSpecId(val);
              isRestoringRef.current = false;
              setConfig((prev: any) => ({
                ...prev,
                apiSpecId: val,
                apiSpecEndpointId: undefined,
              }));
            }}
            options={[
              { value: '', label: 'Select specification...' },
              ...apiSpecs.map((spec: any) => ({ value: spec.id, label: `${spec.name} (v${spec.version})` })),
            ]}
            size="sm"
          />
        </div>
      )}

      {/* Manual entry toggle + Endpoint selection */}
      <div>
        {showSpecDropdown && apiSpecs.length > 0 && (
          <div className="flex items-center space-x-2 mb-1">
            <input
              type="checkbox"
              checked={manualApiEntry}
              onChange={(e) => {
                setManualApiEntry(e.target.checked);
                updateConfig('manualApiEntry', e.target.checked);
              }}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <label className="text-xs text-gray-600 dark:text-gray-400">Enter path manually</label>
          </div>
        )}

        {!showSpecDropdown || apiSpecs.length === 0 || manualApiEntry ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Path</label>
            <input
              type="text"
              value={config.apiPath || ''}
              onChange={(e) => updateConfig('apiPath', e.target.value)}
              placeholder="/api/v1/resource or /api/{orderId}/items"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Use {'{variable}'} for path variables
            </p>
          </div>
        ) : (
          <div>
            <Select
              label="API Endpoint"
              value={config.apiSpecEndpointId || ''}
              onValueChange={(endpointId) => handleEndpointSelect(endpointId)}
              options={endpointOptions}
              placeholder={availableEndpoints.length === 0
                ? `No ${httpMethod} endpoints found in this spec`
                : 'Select endpoint...'}
            />
          </div>
        )}
      </div>

      {/* Path Variables */}
      {pathVars.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Path Variables</label>
          <div className="space-y-1.5">
            {pathVars.map((variable) => (
              <div key={variable} className="flex items-center space-x-2">
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-20 truncate flex-shrink-0" title={`{${variable}}`}>
                  {'{' + variable + '}'}
                </span>
                <input
                  type="text"
                  value={pathVariableConfig[variable] || ''}
                  onChange={(e) => handlePathVariableChange(variable, e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                  placeholder="value or {{variable}}"
                />
                <button
                  ref={getButtonRef(`path_${variable}`)}
                  type="button"
                  onClick={() => setOpenVariableDropdown(openVariableDropdown === `path_${variable}` ? null : `path_${variable}`)}
                  className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
                  title="Insert variable"
                >
                  <Braces className="w-3.5 h-3.5" />
                </button>
                <VariableDropdown
                  isOpen={openVariableDropdown === `path_${variable}`}
                  onClose={() => setOpenVariableDropdown(null)}
                  triggerRef={getButtonRef(`path_${variable}`)}
                  variables={getAvailableVariables()}
                  onSelect={(varName) => handleInsertPathVariable(variable, varName)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      {queryParameters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Query Parameters</label>
            <div className="flex items-center space-x-2">
              {config.apiSpecEndpointId && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  ({responseSpecFields.length} response, {allEndpointFields.length} total fields)
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  const newCfg = { ...queryParameterConfig };
                  queryParameters.forEach((p) => {
                    if (!p.is_required) newCfg[p.field_name] = { enabled: false, value: '' };
                  });
                  updateConfig('queryParameterConfig', newCfg);
                }}
                className="px-2 py-0.5 text-[10px] bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {queryParameters.map((param) => (
              <div key={param.id} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-2 mb-1.5">
                  <input
                    type="checkbox"
                    checked={queryParameterConfig[param.field_name]?.enabled || false}
                    onChange={() => handleParameterToggle(param.field_name)}
                    disabled={param.is_required}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-xs font-mono text-gray-900 dark:text-gray-100 flex-1">{param.field_name}</span>
                  {param.is_required && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded">
                      Required
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded">
                    {param.field_type}
                  </span>
                  {param.description && (
                    <button type="button" title={param.description} className="text-blue-500">
                      <Info className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    value={queryParameterConfig[param.field_name]?.value || ''}
                    onChange={(e) => handleParameterValueChange(param.field_name, e.target.value)}
                    disabled={!queryParameterConfig[param.field_name]?.enabled}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-400"
                    placeholder={param.example || param.test_default || 'value'}
                  />
                  {responseSpecFields.length > 0 && (
                    <>
                      <button
                        ref={getButtonRef(`spec_q_${param.field_name}`)}
                        type="button"
                        onClick={() =>
                          setOpenSpecFieldDropdown(openSpecFieldDropdown === `q_${param.field_name}` ? null : `q_${param.field_name}`)
                        }
                        disabled={!queryParameterConfig[param.field_name]?.enabled}
                        className="p-1 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 rounded disabled:opacity-50"
                        title="Insert field from API spec"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <SpecFieldDropdown
                        ref={(el) => { specFieldRefs.current[`q_${param.field_name}`] = el; }}
                        isOpen={openSpecFieldDropdown === `q_${param.field_name}`}
                        onClose={() => setOpenSpecFieldDropdown(null)}
                        triggerRef={getButtonRef(`spec_q_${param.field_name}`)}
                        fields={responseSpecFields}
                        loading={responseSpecFieldsLoading}
                        onSelect={(path) => handleInsertSpecField(param.field_name, path)}
                        isFilterParam={param.field_name.toLowerCase() === '$filter'}
                        onSelectFilterExpression={(expr) => handleInsertFilterExpression(param.field_name, expr)}
                        availableVariables={getAvailableVariables()}
                      />
                    </>
                  )}
                  {allEndpointFields.length > 0 && (
                    <>
                      <button
                        ref={getButtonRef(`spec_filter_q_${param.field_name}`)}
                        type="button"
                        onClick={() =>
                          setOpenSpecFieldDropdown(openSpecFieldDropdown === `filter_q_${param.field_name}` ? null : `filter_q_${param.field_name}`)
                        }
                        disabled={!queryParameterConfig[param.field_name]?.enabled}
                        className="p-1 text-gray-500 hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400 rounded disabled:opacity-50"
                        title="Build filter expression from API spec"
                      >
                        <Filter className="w-3.5 h-3.5" />
                      </button>
                      <SpecFieldDropdown
                        ref={(el) => { specFieldRefs.current[`filter_q_${param.field_name}`] = el; }}
                        isOpen={openSpecFieldDropdown === `filter_q_${param.field_name}`}
                        onClose={() => setOpenSpecFieldDropdown(null)}
                        triggerRef={getButtonRef(`spec_filter_q_${param.field_name}`)}
                        fields={allEndpointFields}
                        loading={responseSpecFieldsLoading}
                        onSelect={(path) => handleInsertSpecField(param.field_name, path)}
                        isFilterParam={true}
                        onSelectFilterExpression={(expr) => handleInsertFilterExpression(param.field_name, expr)}
                        availableVariables={getAvailableVariables()}
                      />
                    </>
                  )}
                  <button
                    ref={getButtonRef(`qvar_${param.field_name}`)}
                    type="button"
                    onClick={() =>
                      setOpenVariableDropdown(openVariableDropdown === `qvar_${param.field_name}` ? null : `qvar_${param.field_name}`)
                    }
                    disabled={!queryParameterConfig[param.field_name]?.enabled}
                    className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded disabled:opacity-50"
                    title="Insert variable"
                  >
                    <Braces className="w-3.5 h-3.5" />
                  </button>
                  <VariableDropdown
                    isOpen={openVariableDropdown === `qvar_${param.field_name}`}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef(`qvar_${param.field_name}`)}
                    variables={getAvailableVariables()}
                    onSelect={(varName) => handleInsertVariable(param.field_name, varName)}
                  />
                </div>
              </div>
            ))}
          </div>
          {config.apiSpecEndpointId && responseSpecFields.length === 0 && allEndpointFields.length === 0 && (
            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
              <div className="flex items-start space-x-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">No API fields defined</p>
                  <p className="text-[10px] mt-0.5">
                    This endpoint has no response or request fields defined in the API Spec. The List and Filter buttons will appear once you add fields to the specification.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Query Parameters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Custom Query Parameters</label>
          <button
            type="button"
            onClick={() => {
              const current = config.customQueryParameters || [];
              updateConfig('customQueryParameters', [...current, { key: '', value: '' }]);
            }}
            className="flex items-center px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add Parameter
          </button>
        </div>
        {(config.customQueryParameters || []).length > 0 && (
          <div className="space-y-2">
            {(config.customQueryParameters || []).map((param: { key: string; value: string }, idx: number) => (
              <div key={idx} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={param.key}
                  onChange={(e) => {
                    const updated = [...(config.customQueryParameters || [])];
                    updated[idx] = { ...updated[idx], key: e.target.value };
                    updateConfig('customQueryParameters', updated);
                  }}
                  placeholder="Parameter name"
                  className="w-1/3 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <input
                  type="text"
                  value={param.value}
                  onChange={(e) => {
                    const updated = [...(config.customQueryParameters || [])];
                    updated[idx] = { ...updated[idx], value: e.target.value };
                    updateConfig('customQueryParameters', updated);
                  }}
                  placeholder="Value or {{variable}}"
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <button
                  ref={getButtonRef(`custom-qp-${idx}`) as any}
                  type="button"
                  onClick={() => setOpenVariableDropdown(openVariableDropdown === `custom-qp-${idx}` ? null : `custom-qp-${idx}`)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  title="Insert variable"
                >
                  <Braces className="w-3.5 h-3.5" />
                </button>
                <VariableDropdown
                  isOpen={openVariableDropdown === `custom-qp-${idx}`}
                  onClose={() => setOpenVariableDropdown(null)}
                  triggerRef={getButtonRef(`custom-qp-${idx}`)}
                  variables={getAvailableVariables()}
                  onSelect={(varName) => {
                    const updated = [...(config.customQueryParameters || [])];
                    const current = updated[idx].value || '';
                    updated[idx] = { ...updated[idx], value: current ? `${current}{{${varName}}}` : `{{${varName}}}` };
                    updateConfig('customQueryParameters', updated);
                    setOpenVariableDropdown(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(config.customQueryParameters || [])];
                    updated.splice(idx, 1);
                    updateConfig('customQueryParameters', updated);
                  }}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Body Template */}
      {(httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Request Body</label>
            <button
              type="button"
              onClick={generateFieldMappings}
              className="flex items-center px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <FileText className="w-3 h-3 mr-1" />
              Map JSON
            </button>
          </div>
          <textarea
            value={requestBodyTemplate}
            onChange={(e) => {
              updateConfig('requestBodyTemplate', e.target.value);
              if (jsonParseError) setJsonParseError(null);
            }}
            rows={6}
            placeholder={`{\n  "field": "value",\n  "id": 0\n}`}
            className={`w-full px-3 py-2 text-sm border rounded-lg font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
              jsonParseError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          {jsonParseError && (
            <div className="flex items-start gap-1.5 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 dark:text-red-300 font-mono">{jsonParseError}</span>
            </div>
          )}

          {/* Field Mappings */}
          {requestBodyFieldMappings.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Field Mappings</label>
                <div className="flex items-center space-x-1">
                  {currentNodeId && (
                    <button
                      type="button"
                      onClick={() => setShowFunctionsModal(true)}
                      className="flex items-center px-2 py-0.5 text-[10px] bg-amber-600 text-white rounded hover:bg-amber-700"
                    >
                      <Code className="w-3 h-3 mr-0.5" />
                      Function
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig('requestBodyFieldMappings', [
                        ...requestBodyFieldMappings,
                        { fieldName: '', type: 'hardcoded', value: '', dataType: 'string' },
                      ])
                    }
                    className="flex items-center px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    Add
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {requestBodyFieldMappings.map((mapping, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded border ${
                      mapping.type === 'hardcoded'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : mapping.type === 'function'
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 mb-1.5">
                      <input
                        type="text"
                        value={mapping.fieldName}
                        onChange={(e) => {
                          const updated = [...requestBodyFieldMappings];
                          updated[index] = { ...updated[index], fieldName: e.target.value };
                          updateConfig('requestBodyFieldMappings', updated);
                        }}
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                        placeholder="fieldName"
                      />
                      <CustomDropdown
                        value={mapping.type}
                        onChange={(val) => {
                          const updated = [...requestBodyFieldMappings];
                          const newType = val as 'hardcoded' | 'variable' | 'function';
                          updated[index] = {
                            ...updated[index],
                            type: newType,
                            ...(newType !== 'function' ? { functionId: undefined } : {}),
                            ...(newType === 'function' ? { value: '' } : {}),
                          };
                          updateConfig('requestBodyFieldMappings', updated);
                        }}
                        options={[
                          { value: 'hardcoded', label: 'Hardcoded' },
                          { value: 'variable', label: 'Variable' },
                          { value: 'function', label: 'Function' },
                        ]}
                        size="sm"
                        className="w-28"
                        dropdownMinWidth={120}
                      />
                      <CustomDropdown
                        value={mapping.dataType || 'string'}
                        onChange={(val) => {
                          const updated = [...requestBodyFieldMappings];
                          updated[index] = { ...updated[index], dataType: val as RequestBodyFieldMapping['dataType'] };
                          updateConfig('requestBodyFieldMappings', updated);
                        }}
                        options={[
                          { value: 'string', label: 'String' },
                          { value: 'number', label: 'Number' },
                          { value: 'integer', label: 'Integer' },
                          { value: 'date', label: 'Date' },
                          { value: 'datetime', label: 'DateTime' },
                          { value: 'boolean', label: 'Boolean' },
                        ]}
                        size="sm"
                        className="w-28"
                        dropdownMinWidth={120}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateConfig(
                            'requestBodyFieldMappings',
                            requestBodyFieldMappings.filter((_, i) => i !== index)
                          );
                        }}
                        className="p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {mapping.type === 'function' ? (
                        <CustomDropdown
                          value={mapping.functionId || ''}
                          onChange={(val) => {
                            const updated = [...requestBodyFieldMappings];
                            const func = availableFunctions.find(f => f.id === val);
                            updated[index] = {
                              ...updated[index],
                              functionId: val || undefined,
                              value: func ? func.function_name : '',
                            };
                            updateConfig('requestBodyFieldMappings', updated);
                          }}
                          options={[
                            { value: '', label: 'Select a function...' },
                            ...availableFunctions.map((func) => ({
                              value: func.id,
                              label: `${func.function_name}${func.description ? ` - ${func.description}` : ''}`,
                            })),
                          ]}
                          size="sm"
                          className="flex-1"
                        />
                      ) : (
                        <input
                          type="text"
                          value={mapping.value}
                          onChange={(e) => {
                            const updated = [...requestBodyFieldMappings];
                            updated[index] = { ...updated[index], value: e.target.value };
                            updateConfig('requestBodyFieldMappings', updated);
                          }}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                          placeholder={mapping.type === 'hardcoded' ? 'Fixed value' : '{{variableName}}'}
                        />
                      )}
                      {mapping.type === 'variable' && (
                        <>
                          <button
                            ref={getButtonRef(`rbvar_${index}`)}
                            type="button"
                            onClick={() =>
                              setOpenVariableDropdown(openVariableDropdown === `rbvar_${index}` ? null : `rbvar_${index}`)
                            }
                            className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded"
                            title="Insert variable"
                          >
                            <Braces className="w-3.5 h-3.5" />
                          </button>
                          <VariableDropdown
                            isOpen={openVariableDropdown === `rbvar_${index}`}
                            onClose={() => setOpenVariableDropdown(null)}
                            triggerRef={getButtonRef(`rbvar_${index}`)}
                            variables={getAvailableVariables()}
                            onSelect={(varName) => handleInsertRequestBodyVariable(index, varName)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Array Processing */}
      {!hideArrayAndMappingSections && <div className="space-y-2 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
        <div className="flex items-center space-x-1.5">
          <Repeat className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          <span className="text-xs font-medium text-orange-900 dark:text-orange-100">Array Processing</span>
        </div>
        <CustomDropdown
          value={arrayProcessingMode}
          onChange={(val) => updateConfig('arrayProcessingMode', val)}
          options={[
            { value: 'none', label: 'None - Standard single request' },
            { value: 'loop', label: 'Loop - One API call per row' },
            { value: 'batch', label: 'Batch - Single API call with array' },
            { value: 'single_array', label: 'Single - Array body, no group' },
            { value: 'conditional_hardcode', label: 'Conditional - Based on variable' },
          ]}
          size="sm"
        />

        {arrayProcessingMode !== 'none' && arrayProcessingMode !== 'single_array' && arrayProcessingMode !== 'conditional_hardcode' && (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] text-orange-700 dark:text-orange-300 mb-0.5">Source Array Group ID</label>
              <input
                type="text"
                value={config.arraySourceGroupId || ''}
                onChange={(e) => updateConfig('arraySourceGroupId', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-orange-300 dark:border-orange-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Array group ID"
              />
            </div>
            {arrayProcessingMode === 'loop' && (
              <>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={config.stopOnError !== false}
                    onChange={(e) => updateConfig('stopOnError', e.target.checked)}
                    className="rounded border-orange-300 dark:border-orange-600"
                  />
                  <label className="text-xs text-orange-800 dark:text-orange-200">Stop on first error</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={config.wrapBodyInArray || false}
                    onChange={(e) => updateConfig('wrapBodyInArray', e.target.checked)}
                    className="rounded border-orange-300 dark:border-orange-600"
                  />
                  <label className="text-xs text-orange-800 dark:text-orange-200">Wrap request body in array</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={config.treatResponseAsBinary || false}
                    onChange={(e) => updateConfig('treatResponseAsBinary', e.target.checked)}
                    className="rounded border-orange-300 dark:border-orange-600"
                  />
                  <label className="text-xs text-orange-800 dark:text-orange-200">Treat response as binary (PDF/file download)</label>
                </div>
              </>
            )}
            <div className="p-1.5 bg-white dark:bg-gray-800 rounded text-[10px] text-gray-600 dark:text-gray-400 flex items-start space-x-1">
              <Layers className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />
              <span>
                {arrayProcessingMode === 'loop'
                  ? 'Loop: API called once per row. Variables resolve to each row.'
                  : 'Batch: All rows sent as a single array in one call.'}
              </span>
            </div>
          </div>
        )}

        {arrayProcessingMode === 'single_array' && (
          <div className="p-1.5 bg-white dark:bg-gray-800 rounded text-[10px] text-gray-600 dark:text-gray-400 flex items-start space-x-1">
            <Layers className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />
            <span>Single Array: Request body wrapped in an array. Use hardcoded field mappings.</span>
          </div>
        )}

        {arrayProcessingMode === 'conditional_hardcode' && (
          <div className="space-y-2">
            <div className="p-1.5 bg-white dark:bg-gray-800 rounded text-[10px] text-gray-600 dark:text-gray-400 flex items-start space-x-1">
              <Layers className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />
              <span>Conditional: Define conditions based on field values. Each true condition triggers an API call.</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-orange-800 dark:text-orange-200">Conditions</span>
              <button
                type="button"
                onClick={() =>
                  updateConfig('conditionalArrayMappings', [
                    ...conditionalArrayMappings,
                    { id: crypto.randomUUID(), variable: '', operator: 'equals', expectedValue: '', fieldMappings: [] },
                  ])
                }
                className="flex items-center px-2 py-0.5 text-[10px] bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                <Plus className="w-3 h-3 mr-0.5" />
                Add
              </button>
            </div>
            {conditionalArrayMappings.map((cond, ci) => (
              <div key={cond.id} className="p-2 bg-white dark:bg-gray-800 border border-orange-300 dark:border-orange-600 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Condition {ci + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig(
                        'conditionalArrayMappings',
                        conditionalArrayMappings.filter((_, i) => i !== ci)
                      )
                    }
                    className="p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={cond.variable}
                      onChange={(e) => {
                        const updated = [...conditionalArrayMappings];
                        updated[ci] = { ...updated[ci], variable: e.target.value };
                        updateConfig('conditionalArrayMappings', updated);
                      }}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                      placeholder="execute.fieldName"
                    />
                    <button
                      ref={getButtonRef(`cvar_${ci}`)}
                      type="button"
                      onClick={() =>
                        setOpenVariableDropdown(openVariableDropdown === `cvar_${ci}` ? null : `cvar_${ci}`)
                      }
                      className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                    >
                      <Braces className="w-3.5 h-3.5" />
                    </button>
                    <VariableDropdown
                      isOpen={openVariableDropdown === `cvar_${ci}`}
                      onClose={() => setOpenVariableDropdown(null)}
                      triggerRef={getButtonRef(`cvar_${ci}`)}
                      variables={getAvailableVariables()}
                      onSelect={(varName) => {
                        const updated = [...conditionalArrayMappings];
                        updated[ci] = { ...updated[ci], variable: varName };
                        updateConfig('conditionalArrayMappings', updated);
                        setOpenVariableDropdown(null);
                      }}
                    />
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <CustomDropdown
                      value={cond.operator}
                      onChange={(val) => {
                        const updated = [...conditionalArrayMappings];
                        updated[ci] = { ...updated[ci], operator: val as ConditionalArrayMapping['operator'] };
                        updateConfig('conditionalArrayMappings', updated);
                      }}
                      options={[
                        { value: 'equals', label: 'Equals' },
                        { value: 'not_equals', label: 'Not Equals' },
                        { value: 'contains', label: 'Contains' },
                        { value: 'not_contains', label: 'Not Contains' },
                      ]}
                      size="sm"
                      className="w-32"
                    />
                    <input
                      type="text"
                      value={cond.expectedValue}
                      onChange={(e) => {
                        const updated = [...conditionalArrayMappings];
                        updated[ci] = { ...updated[ci], expectedValue: e.target.value };
                        updateConfig('conditionalArrayMappings', updated);
                      }}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Expected value"
                    />
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-600 dark:text-gray-400">Field Mappings</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...conditionalArrayMappings];
                        updated[ci] = {
                          ...updated[ci],
                          fieldMappings: [...updated[ci].fieldMappings, { fieldName: '', type: 'hardcoded', value: '', dataType: 'string' }],
                        };
                        updateConfig('conditionalArrayMappings', updated);
                      }}
                      className="flex items-center px-1.5 py-0.5 text-[10px] bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      <Plus className="w-2.5 h-2.5 mr-0.5" />
                      Add
                    </button>
                  </div>
                  {cond.fieldMappings.length === 0 && (
                    <p className="text-[10px] text-gray-400 italic">No field mappings defined.</p>
                  )}
                  {cond.fieldMappings.map((fm, fi) => (
                    <div key={fi} className="flex items-center space-x-1 mt-1 p-1 bg-gray-50 dark:bg-gray-700 rounded">
                      <input
                        type="text"
                        value={fm.fieldName}
                        onChange={(e) => {
                          const updated = [...conditionalArrayMappings];
                          updated[ci].fieldMappings[fi] = { ...updated[ci].fieldMappings[fi], fieldName: e.target.value };
                          updateConfig('conditionalArrayMappings', updated);
                        }}
                        className="w-20 px-1.5 py-0.5 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 font-mono"
                        placeholder="field"
                      />
                      <CustomDropdown
                        value={fm.type}
                        onChange={(val) => {
                          const updated = [...conditionalArrayMappings];
                          updated[ci].fieldMappings[fi] = { ...updated[ci].fieldMappings[fi], type: val as 'hardcoded' | 'variable' };
                          updateConfig('conditionalArrayMappings', updated);
                        }}
                        options={[
                          { value: 'hardcoded', label: 'H' },
                          { value: 'variable', label: 'V' },
                        ]}
                        size="sm"
                        className="w-14"
                      />
                      <input
                        type="text"
                        value={fm.value}
                        onChange={(e) => {
                          const updated = [...conditionalArrayMappings];
                          updated[ci].fieldMappings[fi] = { ...updated[ci].fieldMappings[fi], value: e.target.value };
                          updateConfig('conditionalArrayMappings', updated);
                        }}
                        className="flex-1 px-1.5 py-0.5 text-[10px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                        placeholder={fm.type === 'hardcoded' ? 'value' : '{{var}}'}
                      />
                      <CustomDropdown
                        value={fm.dataType || 'string'}
                        onChange={(val) => {
                          const updated = [...conditionalArrayMappings];
                          updated[ci].fieldMappings[fi] = {
                            ...updated[ci].fieldMappings[fi],
                            dataType: val as RequestBodyFieldMapping['dataType'],
                          };
                          updateConfig('conditionalArrayMappings', updated);
                        }}
                        options={[
                          { value: 'string', label: 'Str' },
                          { value: 'integer', label: 'Int' },
                          { value: 'number', label: 'Num' },
                          { value: 'date', label: 'Date' },
                          { value: 'datetime', label: 'DtTm' },
                          { value: 'boolean', label: 'Bool' },
                        ]}
                        size="sm"
                        className="w-16"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...conditionalArrayMappings];
                          updated[ci] = {
                            ...updated[ci],
                            fieldMappings: updated[ci].fieldMappings.filter((_, i) => i !== fi),
                          };
                          updateConfig('conditionalArrayMappings', updated);
                        }}
                        className="p-0.5 text-red-500"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Treat response as binary */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          checked={config.treatResponseAsBinary || false}
          onChange={(e) => updateConfig('treatResponseAsBinary', e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        <label className="text-xs text-gray-600 dark:text-gray-400">Treat response as binary (PDF/file download)</label>
      </div>

      {config.treatResponseAsBinary && (
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Binary Response Field (for JSON responses)
          </label>
          <input
            type="text"
            value={config.binaryResponseField || ''}
            onChange={(e) => updateConfig('binaryResponseField', e.target.value)}
            placeholder="e.g. content, data, reportOutput"
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            JSON field containing base64 PDF data. Leave blank for auto-detection.
          </p>
        </div>
      )}

      {/* Stop on Error (for non-array mode) */}
      {!hideArrayAndMappingSections && arrayProcessingMode === 'none' && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={config.stopOnError || false}
            onChange={(e) => updateConfig('stopOnError', e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <label className="text-xs text-gray-600 dark:text-gray-400">Stop workflow on error</label>
        </div>
      )}

      {/* URL Preview */}
      {(config.apiPath || getBaseUrl()) && (
        <div className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
          <div className="flex items-center space-x-1 mb-1">
            <ExternalLink className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">URL Preview</span>
          </div>
          <div className="p-1.5 bg-white dark:bg-gray-900 border border-slate-300 dark:border-slate-600 rounded font-mono text-[10px] text-slate-900 dark:text-slate-100 break-all">
            {getUrlPreview() || 'Configure endpoint to see preview'}
          </div>
        </div>
      )}

      {/* Response Data Mappings */}
      {!hideArrayAndMappingSections && <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Response Data Mappings</label>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
          Each mapping reads a value <strong>FROM</strong> the API response and writes it <strong>TO</strong> a path in workflow context. Use <strong>DEFAULT</strong> only for a static fallback value.
        </p>
        {responseDataMappings.map((m: any, idx: number) => {
          const responsePathEmpty = !m.responsePath || !String(m.responsePath).trim();
          const defaultLooksLikePath = !!m.defaultValue && /\./.test(String(m.defaultValue)) && !/\s/.test(String(m.defaultValue));
          const showSwapWarning = responsePathEmpty && defaultLooksLikePath;
          return (
          <div key={idx} className="space-y-1.5 p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 flex-shrink-0 w-12 tracking-wider" title="Path within the API response to read FROM">FROM</span>
              <input
                type="text"
                value={m.responsePath || ''}
                onChange={(e) => {
                  const updated = [...responseDataMappings];
                  updated[idx] = { ...updated[idx], responsePath: e.target.value };
                  updateConfig('responseDataMappings', updated);
                }}
                placeholder="Response path (e.g. outParams.OCLIENT_ID)"
                className={`flex-1 px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono ${showSwapWarning ? 'border-amber-500 dark:border-amber-500 ring-1 ring-amber-400' : 'border-gray-300 dark:border-gray-600'}`}
              />
              {responseSpecFields.length > 0 && (
                <>
                  <button
                    ref={getButtonRef(`spec_resp_${idx}`)}
                    type="button"
                    onClick={() =>
                      setOpenSpecFieldDropdown(openSpecFieldDropdown === `resp_${idx}` ? null : `resp_${idx}`)
                    }
                    className="p-1 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 rounded flex-shrink-0"
                    title="Select from API spec"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <SpecFieldDropdown
                    isOpen={openSpecFieldDropdown === `resp_${idx}`}
                    onClose={() => setOpenSpecFieldDropdown(null)}
                    triggerRef={getButtonRef(`spec_resp_${idx}`)}
                    fields={responseSpecFields}
                    loading={responseSpecFieldsLoading}
                    onSelect={(path) => {
                      const updated = [...responseDataMappings];
                      updated[idx] = { ...updated[idx], responsePath: path };
                      updateConfig('responseDataMappings', updated);
                    }}
                  />
                </>
              )}
              <button
                onClick={() => {
                  updateConfig(
                    'responseDataMappings',
                    responseDataMappings.filter((_: any, i: number) => i !== idx)
                  );
                }}
                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex-shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 flex-shrink-0 w-12 tracking-wider" title="Path within workflow context to write the value TO">TO</span>
              <input
                type="text"
                value={m.updatePath || ''}
                onChange={(e) => {
                  const updated = [...responseDataMappings];
                  updated[idx] = { ...updated[idx], updatePath: e.target.value };
                  updateConfig('responseDataMappings', updated);
                }}
                placeholder="Context path (e.g. orders.0.consignee.clientId)"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
              />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0 w-12 tracking-wider" title="Static fallback value used when the response path returns null/empty">DEFAULT</span>
              <input
                type="text"
                value={m.defaultValue || ''}
                onChange={(e) => {
                  const updated = [...responseDataMappings];
                  updated[idx] = { ...updated[idx], defaultValue: e.target.value };
                  updateConfig('responseDataMappings', updated);
                }}
                placeholder="Static fallback value (optional)"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono italic"
              />
            </div>
            {showSwapWarning && (
              <div className="flex items-start space-x-1.5 px-1 pt-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>FROM</strong> is empty but <strong>DEFAULT</strong> looks like a path. Did you mean to put <code className="font-mono">{String(m.defaultValue)}</code> in the <strong>FROM</strong> field?
                </span>
              </div>
            )}
          </div>
        );
        })}
        <button
          onClick={() => updateConfig('responseDataMappings', [...responseDataMappings, { responsePath: '', updatePath: '' }])}
          className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="h-3 w-3" />
          <span>Add mapping</span>
        </button>
      </div>}

      {showFunctionsModal && currentNodeId && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Workflow Functions
              </h2>
              <button
                onClick={() => {
                  setShowFunctionsModal(false);
                  loadFunctions();
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
            <FieldMappingFunctionsManager
              workflowNodeId={currentNodeId}
              availableFields={requestBodyFieldMappings.filter(m => m.fieldName).map(m => ({ fieldName: m.fieldName, dataType: m.dataType }))}
              extractionTypes={[]}
            />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
