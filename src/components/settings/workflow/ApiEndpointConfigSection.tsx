import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info, Braces, ExternalLink, AlertCircle, Plus, Trash2, FileText, Save, Repeat, Layers, List, Code, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Select from '../../common/Select';
import VariableDropdown from './VariableDropdown';
import SpecFieldDropdown from './SpecFieldDropdown';
import { FieldMappingFunctionsManager } from '../FieldMappingFunctionsManager';
import type { FieldMappingFunction } from '../../../types';

interface ExecuteButtonField {
  fieldKey: string;
  name: string;
}

interface ArrayGroup {
  id: string;
  name: string;
  arrayFieldName: string;
}

interface ApiEndpointConfigSectionProps {
  config: any;
  onChange: (config: any) => void;
  allSteps?: any[];
  currentStepOrder?: number;
  extractionType?: any;
  executeButtonFields?: ExecuteButtonField[];
  arrayGroups?: ArrayGroup[];
  flowNodeId?: string;
}

interface SecondaryApi {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
}

interface ApiSpec {
  id: string;
  name: string;
  api_endpoint_id?: string;
  secondary_api_id?: string;
}

interface ApiSpecEndpoint {
  id: string;
  path: string;
  method: string;
  summary: string;
}

interface QueryParameter {
  id: string;
  field_name: string;
  field_type: string;
  is_required: boolean;
  description: string;
  example?: string;
  test_default?: string;
}

interface CustomQueryParameter {
  id: string;
  name: string;
  enabled: boolean;
  value: string;
}

interface RequestBodyFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'variable' | 'function';
  value: string;
  dataType?: 'string' | 'number' | 'integer' | 'decimal' | 'datetime' | 'boolean';
  functionId?: string;
}

interface ConditionalArrayMapping {
  id: string;
  variable: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
  expectedValue: string;
  fieldMappings: RequestBodyFieldMapping[];
}

export default function ApiEndpointConfigSection({ config, onChange, allSteps = [], currentStepOrder, extractionType, executeButtonFields, arrayGroups = [], flowNodeId }: ApiEndpointConfigSectionProps) {
  const [apiSourceType, setApiSourceType] = useState<'main' | 'secondary'>(config?.apiSourceType || 'main');
  const [secondaryApis, setSecondaryApis] = useState<SecondaryApi[]>([]);
  const [selectedSecondaryApiId, setSelectedSecondaryApiId] = useState(config?.secondaryApiId || '');
  const [httpMethod, setHttpMethod] = useState(config?.httpMethod || 'POST');
  const [apiSpecs, setApiSpecs] = useState<ApiSpec[]>([]);
  const [selectedApiSpecId, setSelectedApiSpecId] = useState('');
  const [availableEndpoints, setAvailableEndpoints] = useState<ApiSpecEndpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiSpecEndpoint | null>(null);
  const [queryParameters, setQueryParameters] = useState<QueryParameter[]>([]);
  const [queryParameterConfig, setQueryParameterConfig] = useState<Record<string, { enabled: boolean; value: string }>>(
    config?.queryParameterConfig || {}
  );
  const [customQueryParameters, setCustomQueryParameters] = useState<CustomQueryParameter[]>(
    config?.customQueryParameters || []
  );
  const [manualApiEntry, setManualApiEntry] = useState(config?.manualApiEntry || false);
  const [manualApiPath, setManualApiPath] = useState(config?.apiPath || '');
  const [responseDataMappings, setResponseDataMappings] = useState<Array<{ responsePath: string; updatePath: string }>>([
    { responsePath: '', updatePath: '' }
  ]);
  const [responseReturnsArray, setResponseReturnsArray] = useState(config?.responseReturnsArray || false);
  const [mainApiConfig, setMainApiConfig] = useState<any>(null);
  const [selectedSecondaryApi, setSelectedSecondaryApi] = useState<SecondaryApi | null>(null);
  const [escapeSingleQuotesInBody, setEscapeSingleQuotesInBody] = useState(config?.escapeSingleQuotesInBody !== false);
  const [openVariableDropdown, setOpenVariableDropdown] = useState<string | null>(null);
  const [openSpecFieldDropdown, setOpenSpecFieldDropdown] = useState<string | null>(null);
  const [responseSpecFields, setResponseSpecFields] = useState<Array<{ field_name: string; field_path: string; field_type: string; description?: string }>>([]);
  const [responseSpecFieldsLoading, setResponseSpecFieldsLoading] = useState(false);
  const [pathVariableConfig, setPathVariableConfig] = useState<Record<string, string>>(
    config?.pathVariableConfig || {}
  );
  const [requestBodyTemplate, setRequestBodyTemplate] = useState(config?.requestBodyTemplate || '');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [requestBodyFieldMappings, setRequestBodyFieldMappings] = useState<RequestBodyFieldMapping[]>(
    config?.requestBodyFieldMappings || []
  );
  const [arrayProcessingMode, setArrayProcessingMode] = useState<'none' | 'loop' | 'batch' | 'single_array' | 'conditional_hardcode'>(
    config?.arrayProcessingMode || 'none'
  );
  const [arraySourceGroupId, setArraySourceGroupId] = useState(config?.arraySourceGroupId || '');
  const [stopOnError, setStopOnError] = useState(config?.stopOnError !== false);
  const [wrapBodyInArray, setWrapBodyInArray] = useState(config?.wrapBodyInArray || false);
  const [conditionalArrayMappings, setConditionalArrayMappings] = useState<ConditionalArrayMapping[]>(
    config?.conditionalArrayMappings || []
  );
  const [availableFunctions, setAvailableFunctions] = useState<FieldMappingFunction[]>([]);
  const [showFunctionsModal, setShowFunctionsModal] = useState(false);

  const [responseTransformEnabled, setResponseTransformEnabled] = useState<boolean>(!!config?.responseTransformation?.enabled);
  const [responseTransformArrayPath, setResponseTransformArrayPath] = useState<string>(config?.responseTransformation?.arrayPath || '');
  const [responseTransformFilters, setResponseTransformFilters] = useState<Array<{ field: string; operator: string; value: string }>>(
    Array.isArray(config?.responseTransformation?.filters) ? config.responseTransformation.filters : []
  );
  const [responseTransformSelectFields, setResponseTransformSelectFields] = useState<string>(
    Array.isArray(config?.responseTransformation?.selectFields) ? config.responseTransformation.selectFields.join(', ') : ''
  );
  const [responseTransformSkipIfEmpty, setResponseTransformSkipIfEmpty] = useState<boolean>(!!config?.responseTransformation?.skipIfEmpty);
  const [showResponseTransform, setShowResponseTransform] = useState<boolean>(!!config?.responseTransformation?.enabled);

  const buttonRefs = useRef<Record<string, React.RefObject<HTMLButtonElement>>>({});
  const isRestoringRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const isEditingResponseMappingsRef = useRef(false);
  const editingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedApiSpecIdRef = useRef(selectedApiSpecId);
  const configApiSpecIdRef = useRef(config?.apiSpecId);
  const loadApiSpecsRequestRef = useRef(0);

  const endpointOptions = useMemo(() => {
    return availableEndpoints.map(endpoint => ({
      value: endpoint.id,
      label: `${endpoint.path}${endpoint.summary ? ` - ${endpoint.summary}` : ''}`
    }));
  }, [availableEndpoints]);

  useEffect(() => {
    selectedApiSpecIdRef.current = selectedApiSpecId;
  }, [selectedApiSpecId]);

  useEffect(() => {
    configApiSpecIdRef.current = config?.apiSpecId;
  }, [config?.apiSpecId]);

  const loadFunctions = useCallback(async () => {
    if (!flowNodeId) return;
    const { data: funcs } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('flow_node_id', flowNodeId)
      .order('function_name');
    setAvailableFunctions(funcs || []);
  }, [flowNodeId]);

  useEffect(() => {
    loadSecondaryApis();
    loadMainApiConfig();
    loadFunctions();
  }, []);

  useEffect(() => {
    restoreConfigFromProps();
  }, [config, secondaryApis]);

  useEffect(() => {
    console.log('[useEffect:loadApiSpecs] Triggered with apiSourceType:', apiSourceType, 'selectedSecondaryApiId:', selectedSecondaryApiId);
    loadApiSpecs();
  }, [apiSourceType, selectedSecondaryApiId]);

  useEffect(() => {
    if (selectedApiSpecId) {
      loadAvailableEndpoints();
    }
  }, [selectedApiSpecId, httpMethod]);

  useEffect(() => {
    if (selectedEndpoint) {
      loadQueryParameters();
      loadResponseSpecFields();
    } else {
      setResponseSpecFields([]);
    }
  }, [selectedEndpoint]);

  useEffect(() => {
    updateParentConfig();
  }, [apiSourceType, selectedSecondaryApiId, httpMethod, selectedEndpoint, queryParameterConfig, customQueryParameters, pathVariableConfig, manualApiEntry, manualApiPath, responseDataMappings, responseReturnsArray, escapeSingleQuotesInBody, requestBodyTemplate, requestBodyFieldMappings, arrayProcessingMode, arraySourceGroupId, stopOnError, wrapBodyInArray, conditionalArrayMappings, responseTransformEnabled, responseTransformArrayPath, responseTransformFilters, responseTransformSelectFields, responseTransformSkipIfEmpty]);

  const restoreConfigFromProps = async () => {
    if (!config) {
      isInitialMountRef.current = false;
      return;
    }

    if (Object.keys(config).length === 0) {
      isInitialMountRef.current = false;
      return;
    }

    isRestoringRef.current = true;

    try {
      // Restore API source type
      if (config.apiSourceType && config.apiSourceType !== apiSourceType) {
        setApiSourceType(config.apiSourceType);
      }

      // Restore secondary API ID and selection
      if (config.secondaryApiId && config.secondaryApiId !== selectedSecondaryApiId) {
        setSelectedSecondaryApiId(config.secondaryApiId);
        const api = secondaryApis.find(a => a.id === config.secondaryApiId);
        if (api) {
          setSelectedSecondaryApi(api);
        }
      }

      // Restore HTTP method from config first
      if (config.httpMethod && config.httpMethod !== httpMethod) {
        setHttpMethod(config.httpMethod);
      }

      // Restore manual API entry state
      if (config.manualApiEntry !== undefined && config.manualApiEntry !== manualApiEntry) {
        setManualApiEntry(config.manualApiEntry);
      }

      // Restore manual API path
      if (config.apiPath && config.apiPath !== manualApiPath) {
        setManualApiPath(config.apiPath);
      }

      // Restore API spec ID directly if available (avoids race condition with loadApiSpecs)
      // Use ref to prevent update loop when parent config reflects our own state change
      if (config.apiSpecId &&
          config.apiSpecId !== selectedApiSpecId &&
          config.apiSpecId !== selectedApiSpecIdRef.current) {
        setSelectedApiSpecId(config.apiSpecId);
      }

      // Restore response data mappings - support both old and new formats
      // Skip restoration if user is actively editing to prevent clearing their input
      if (!isEditingResponseMappingsRef.current) {
        if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
          setResponseDataMappings(config.responseDataMappings);
        } else if (config.responsePath || config.updateJsonPath) {
          setResponseDataMappings([{
            responsePath: config.responsePath || '',
            updatePath: config.updateJsonPath || ''
          }]);
        } else {
          setResponseDataMappings([{ responsePath: '', updatePath: '' }]);
        }
      }

      if (config.responseReturnsArray !== undefined) {
        setResponseReturnsArray(config.responseReturnsArray);
      }

      // Restore escape single quotes setting
      if (config.escapeSingleQuotesInBody !== undefined && config.escapeSingleQuotesInBody !== escapeSingleQuotesInBody) {
        setEscapeSingleQuotesInBody(config.escapeSingleQuotesInBody);
      }

      // Restore query parameter config
      if (config.queryParameterConfig) {
        setQueryParameterConfig(config.queryParameterConfig);
      }

      if (config.customQueryParameters && Array.isArray(config.customQueryParameters)) {
        setCustomQueryParameters(config.customQueryParameters);
      }

      // Restore path variable config
      if (config.pathVariableConfig) {
        setPathVariableConfig(config.pathVariableConfig);
      }

      // Restore request body template
      if (config.requestBodyTemplate !== undefined && config.requestBodyTemplate !== requestBodyTemplate) {
        setRequestBodyTemplate(config.requestBodyTemplate);
      }

      // Restore request body field mappings
      if (config.requestBodyFieldMappings && Array.isArray(config.requestBodyFieldMappings)) {
        setRequestBodyFieldMappings(config.requestBodyFieldMappings);
      }

      // Restore array processing settings
      if (config.arrayProcessingMode && config.arrayProcessingMode !== arrayProcessingMode) {
        setArrayProcessingMode(config.arrayProcessingMode);
      }
      if (config.arraySourceGroupId && config.arraySourceGroupId !== arraySourceGroupId) {
        setArraySourceGroupId(config.arraySourceGroupId);
      }
      if (config.stopOnError !== undefined && config.stopOnError !== stopOnError) {
        setStopOnError(config.stopOnError);
      }
      if (config.wrapBodyInArray !== undefined && config.wrapBodyInArray !== wrapBodyInArray) {
        setWrapBodyInArray(config.wrapBodyInArray);
      }
      if (config.conditionalArrayMappings && Array.isArray(config.conditionalArrayMappings)) {
        setConditionalArrayMappings(config.conditionalArrayMappings);
      }

      const rt = config.responseTransformation;
      if (rt && typeof rt === 'object') {
        setResponseTransformEnabled(!!rt.enabled);
        setShowResponseTransform(!!rt.enabled || showResponseTransform);
        setResponseTransformArrayPath(rt.arrayPath || '');
        setResponseTransformFilters(Array.isArray(rt.filters) ? rt.filters : []);
        setResponseTransformSelectFields(Array.isArray(rt.selectFields) ? rt.selectFields.join(', ') : '');
        setResponseTransformSkipIfEmpty(!!rt.skipIfEmpty);
      }

      // Load the API spec endpoint to get the spec ID (only if we have an endpoint ID)
      if (config.apiSpecEndpointId) {
        const { data: endpointData, error: endpointError } = await supabase
          .from('api_spec_endpoints')
          .select('*, api_specs!inner(id, name)')
          .eq('id', config.apiSpecEndpointId)
          .maybeSingle();

        if (!endpointError && endpointData) {
          console.log('Loaded endpoint data:', endpointData);

          // Set the API spec ID from the loaded endpoint
          const apiSpecId = endpointData.api_spec_id;
          if (apiSpecId && apiSpecId !== selectedApiSpecId) {
            setSelectedApiSpecId(apiSpecId);
          }

          // Set the selected endpoint
          const endpoint: ApiSpecEndpoint = {
            id: endpointData.id,
            path: endpointData.path,
            method: endpointData.method,
            summary: endpointData.summary || ''
          };

          if (!selectedEndpoint || selectedEndpoint.id !== endpoint.id) {
            setSelectedEndpoint(endpoint);
          }
        }
      }

      isInitialMountRef.current = false;
    } finally {
      isRestoringRef.current = false;
    }
  };

  const loadMainApiConfig = async () => {
    const { data, error } = await supabase
      .from('api_settings')
      .select('*')
      .maybeSingle();

    if (!error && data) {
      setMainApiConfig(data);
    }
  };

  const loadSecondaryApis = async () => {
    const { data, error } = await supabase
      .from('secondary_api_configs')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setSecondaryApis(data.map(api => ({
        id: api.id,
        name: api.name,
        baseUrl: api.base_url,
        isActive: api.is_active
      })));
    }
  };

  const loadApiSpecs = async () => {
    const requestId = ++loadApiSpecsRequestRef.current;
    console.log('[loadApiSpecs] Called with apiSourceType:', apiSourceType, 'selectedSecondaryApiId:', selectedSecondaryApiId, 'requestId:', requestId);
    console.log('[loadApiSpecs] Current selectedApiSpecId state:', selectedApiSpecId);
    console.log('[loadApiSpecs] isRestoringRef.current:', isRestoringRef.current);
    console.log('[loadApiSpecs] config?.apiSpecId:', config?.apiSpecId);

    let query = supabase.from('api_specs').select('*');

    if (apiSourceType === 'main') {
      console.log('[loadApiSpecs] Loading MAIN API specs');
      query = query.not('api_endpoint_id', 'is', null);
    } else if (apiSourceType === 'secondary' && selectedSecondaryApiId) {
      console.log('[loadApiSpecs] Loading SECONDARY API specs for:', selectedSecondaryApiId);
      query = query.eq('secondary_api_id', selectedSecondaryApiId);
    } else {
      console.log('[loadApiSpecs] No valid source, clearing specs');
      setApiSpecs([]);
      return;
    }

    const { data, error } = await query.order('uploaded_at', { ascending: false });

    if (requestId !== loadApiSpecsRequestRef.current) {
      console.log('[loadApiSpecs] Stale request ignored. requestId:', requestId, 'current:', loadApiSpecsRequestRef.current);
      return;
    }

    if (!error && data) {
      console.log('[loadApiSpecs] Loaded specs:', data.map(s => ({ id: s.id, name: s.name })));
      setApiSpecs(data);
      const currentSelectedApiSpecId = selectedApiSpecIdRef.current;
      const currentConfigApiSpecId = configApiSpecIdRef.current;
      const currentSpecExistsInNewData = currentSelectedApiSpecId && data.some(s => s.id === currentSelectedApiSpecId);
      const shouldAutoSelect = data.length > 0 && (!currentSelectedApiSpecId || !currentSpecExistsInNewData) && !isRestoringRef.current && !currentConfigApiSpecId;
      console.log('[loadApiSpecs] Auto-select check: data.length > 0:', data.length > 0, '!selectedApiSpecIdRef.current:', !currentSelectedApiSpecId, 'specExistsInData:', currentSpecExistsInNewData, '!isRestoringRef.current:', !isRestoringRef.current, '!configApiSpecIdRef.current:', !currentConfigApiSpecId);
      console.log('[loadApiSpecs] Will auto-select:', shouldAutoSelect);
      if (shouldAutoSelect) {
        console.log('[loadApiSpecs] AUTO-SELECTING first spec:', data[0].id, data[0].name);
        setSelectedApiSpecId(data[0].id);
      }
    } else if (error) {
      console.error('[loadApiSpecs] Error loading specs:', error);
    }
  };

  const loadAvailableEndpoints = async () => {
    if (!selectedApiSpecId) {
      setAvailableEndpoints([]);
      return;
    }

    const { data, error } = await supabase
      .from('api_spec_endpoints')
      .select('*')
      .eq('api_spec_id', selectedApiSpecId)
      .eq('method', httpMethod)
      .order('path');

    if (!error && data) {
      setAvailableEndpoints(data);
    }
  };

  const loadQueryParameters = async () => {
    if (!selectedEndpoint) {
      setQueryParameters([]);
      return;
    }

    const { data, error } = await supabase
      .from('api_endpoint_fields')
      .select('*')
      .eq('api_spec_endpoint_id', selectedEndpoint.id)
      .like('field_path', '[query]%')
      .order('field_name');

    if (!error && data) {
      const params = data.map(field => ({
        id: field.id,
        field_name: field.field_name,
        field_type: field.field_type,
        is_required: field.is_required,
        description: field.description || '',
        example: field.example,
        test_default: field.test_default
      }));
      setQueryParameters(params);

      const newConfig = { ...queryParameterConfig };
      params.forEach(param => {
        if (!(param.field_name in newConfig)) {
          newConfig[param.field_name] = {
            enabled: param.is_required,
            value: ''
          };
        }
      });
      setQueryParameterConfig(newConfig);
    }
  };

  const loadResponseSpecFields = async () => {
    if (!selectedEndpoint) {
      setResponseSpecFields([]);
      return;
    }

    setResponseSpecFieldsLoading(true);
    const { data, error } = await supabase
      .from('api_endpoint_fields')
      .select('field_name, field_path, field_type, description')
      .eq('api_spec_endpoint_id', selectedEndpoint.id)
      .like('field_path', '[response]%')
      .order('field_path');

    if (!error && data) {
      setResponseSpecFields(data);
    }
    setResponseSpecFieldsLoading(false);
  };

  const handleEndpointChange = (endpointId: string) => {
    const endpoint = availableEndpoints.find(e => e.id === endpointId);
    setSelectedEndpoint(endpoint || null);
    if (endpoint) {
      setManualApiPath(endpoint.path);
    }
  };

  const handleParameterToggle = (fieldName: string) => {
    setQueryParameterConfig(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        enabled: !prev[fieldName]?.enabled
      }
    }));
  };

  const handleParameterValueChange = (fieldName: string, value: string) => {
    setQueryParameterConfig(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        value
      }
    }));
  };

  const addResponseMapping = () => {
    setResponseDataMappings([...responseDataMappings, { responsePath: '', updatePath: '' }]);
  };

  const removeResponseMapping = (index: number) => {
    if (responseDataMappings.length > 1) {
      setResponseDataMappings(responseDataMappings.filter((_, i) => i !== index));
    }
  };

  const updateResponseMapping = (index: number, field: 'responsePath' | 'updatePath', value: string) => {
    const updated = [...responseDataMappings];
    updated[index][field] = value;
    setResponseDataMappings(updated);
  };

  const handleResponseMappingFocus = () => {
    isEditingResponseMappingsRef.current = true;
    if (editingTimeoutRef.current) {
      clearTimeout(editingTimeoutRef.current);
      editingTimeoutRef.current = null;
    }
  };

  const handleResponseMappingBlur = () => {
    if (editingTimeoutRef.current) {
      clearTimeout(editingTimeoutRef.current);
    }
    editingTimeoutRef.current = setTimeout(() => {
      isEditingResponseMappingsRef.current = false;
    }, 300);
  };

  const handleClearAll = () => {
    const newConfig = { ...queryParameterConfig };
    queryParameters.forEach(param => {
      if (!param.is_required) {
        newConfig[param.field_name] = {
          enabled: false,
          value: ''
        };
      }
    });
    setQueryParameterConfig(newConfig);
    setCustomQueryParameters(prev => prev.map(cp => ({ ...cp, enabled: false, value: '' })));
  };

  const addCustomQueryParameter = () => {
    setCustomQueryParameters(prev => [
      ...prev,
      { id: crypto.randomUUID(), name: '', enabled: true, value: '' }
    ]);
  };

  const removeCustomQueryParameter = (id: string) => {
    setCustomQueryParameters(prev => prev.filter(cp => cp.id !== id));
  };

  const updateCustomQueryParameter = (id: string, field: keyof CustomQueryParameter, val: string | boolean) => {
    setCustomQueryParameters(prev =>
      prev.map(cp => cp.id === id ? { ...cp, [field]: val } : cp)
    );
  };

  const getQueryString = (): string => {
    const params = new URLSearchParams();
    Object.entries(queryParameterConfig).forEach(([key, config]) => {
      if (config.enabled && config.value) {
        params.append(key, config.value);
      }
    });
    customQueryParameters.forEach(cp => {
      if (cp.enabled && cp.name && cp.value) {
        params.append(cp.name, cp.value);
      }
    });
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };

  const getCleanQueryString = (): string => {
    const params: string[] = [];
    Object.entries(queryParameterConfig).forEach(([key, config]) => {
      if (config.enabled && config.value) {
        params.push(`${key}=${config.value}`);
      }
    });
    customQueryParameters.forEach(cp => {
      if (cp.enabled && cp.name && cp.value) {
        params.push(`${cp.name}=${cp.value}`);
      }
    });
    return params.length > 0 ? `?${params.join('&')}` : '';
  };

  const getBaseUrl = (): string => {
    if (apiSourceType === 'main') {
      return mainApiConfig?.path || '';
    } else if (selectedSecondaryApi) {
      return selectedSecondaryApi.baseUrl || '';
    }
    return '';
  };

  const getFullUrlWithQuery = (): string => {
    const baseUrl = getBaseUrl();
    const path = manualApiEntry ? manualApiPath : (selectedEndpoint?.path || '');
    const queryString = getQueryString();
    return `${baseUrl}${path}${queryString}`;
  };

  const getCleanUrlPreview = (): string => {
    const baseUrl = getBaseUrl();
    const path = manualApiEntry ? manualApiPath : (selectedEndpoint?.path || '');
    const queryString = getCleanQueryString();
    return `${baseUrl}${path}${queryString}`;
  };

  const detectVariables = (text: string): string[] => {
    const regex = /\{([^}]+)\}|\$\{([^}]+)\}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1] || match[2]);
    }
    return matches;
  };

  const getPathVariables = (): string[] => {
    const path = manualApiEntry ? manualApiPath : (selectedEndpoint?.path || '');
    return detectVariables(path);
  };

  const getAllDetectedVariables = (): string[] => {
    const variables = new Set<string>();

    const pathVars = detectVariables(manualApiPath);
    pathVars.forEach(v => variables.add(v));

    Object.entries(queryParameterConfig).forEach(([key, config]) => {
      if (config.enabled && config.value) {
        const valueVars = detectVariables(config.value);
        valueVars.forEach(v => variables.add(v));
      }
    });

    customQueryParameters.forEach(cp => {
      if (cp.enabled && cp.value) {
        const valueVars = detectVariables(cp.value);
        valueVars.forEach(v => variables.add(v));
      }
    });

    return Array.from(variables);
  };

  const availableVariables = useMemo<Array<{ name: string; stepName: string; source: 'extraction' | 'workflow' | 'execute' | 'loop_item'; dataType?: string }>>(() => {
    const variables: Array<{ name: string; stepName: string; source: 'extraction' | 'workflow' | 'execute' | 'loop_item'; dataType?: string }> = [
      { name: 'user.username', stepName: 'Logged-In Username', source: 'execute' },
      { name: 'user.email', stepName: 'Logged-In User Email', source: 'execute' },
    ];

    if (executeButtonFields && executeButtonFields.length > 0) {
      executeButtonFields.forEach((field) => {
        variables.push({
          name: `execute.${field.fieldKey}`,
          stepName: field.name,
          source: 'execute'
        });
      });
    }

    if (extractionType && extractionType.fieldMappings) {
      extractionType.fieldMappings.forEach((mapping: any) => {
        if (mapping.fieldName) {
          variables.push({
            name: mapping.fieldName,
            stepName: 'PDF Extraction',
            source: 'extraction',
            dataType: mapping.dataType || 'string'
          });
        }
      });
    }

    if (allSteps && currentStepOrder !== undefined && currentStepOrder !== null) {
      const previousSteps = allSteps.filter(s => s.stepOrder < currentStepOrder);

      previousSteps.forEach(step => {
        const stepName = step.stepName || step.step_name || 'Unknown Step';
        const config = step.configJson || step.config_json;
        const stepType = step.stepType || step.step_type;

        if (config && config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
          config.responseDataMappings.forEach((mapping: any) => {
            if (mapping.updatePath) {
              variables.push({
                name: `response.${mapping.updatePath}`,
                stepName: stepName,
                source: 'workflow',
                dataType: undefined
              });
            }
          });
        }

        if (stepType === 'user_input' && config?.variableName) {
          if (config.inputType === 'signature_capture') {
            variables.push(
              { name: `input.${config.variableName}.signeeName`, stepName: `${stepName} - Signee Name`, source: 'execute' },
              { name: `input.${config.variableName}.signedTime`, stepName: `${stepName} - Date & Time`, source: 'execute' },
              { name: `input.${config.variableName}.imageData`, stepName: `${stepName} - Signature Image`, source: 'execute' }
            );
          } else {
            variables.push({
              name: `input.${config.variableName}`,
              stepName: stepName,
              source: 'execute'
            });
          }
        } else if (stepType === 'data_transform' && config?.transformations && Array.isArray(config.transformations)) {
          config.transformations.forEach((t: any) => {
            if (t.outputVariable) {
              variables.push({
                name: `transform.${t.outputVariable}`,
                stepName: stepName,
                source: 'workflow'
              });
            }
          });
        } else if (stepType === 'user_selection') {
          const itemVariable = config?.itemVariable || 'item';
          const basePath = `forEach.${itemVariable}`;
          variables.push({
            name: basePath,
            stepName: `Selected item from "${stepName}"`,
            source: 'workflow',
            dataType: 'selected item'
          });

          const seenFields = new Set<string>();
          const displayTemplate: string = typeof config?.displayTemplate === 'string' ? config.displayTemplate : '';
          const sourceArray: string = typeof config?.sourceArray === 'string' ? config.sourceArray : '';
          const tokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
          let match: RegExpExecArray | null;
          while ((match = tokenRegex.exec(displayTemplate)) !== null) {
            const raw = match[1].trim();
            if (!raw || raw.startsWith('@')) continue;
            const parts = raw.split('.');
            let fieldPath = raw;
            if (parts[0] === itemVariable || parts[0] === 'forEach') {
              fieldPath = parts.slice(parts[0] === 'forEach' ? 2 : 1).join('.');
            } else if (sourceArray && parts[0] === sourceArray) {
              fieldPath = parts.slice(1).join('.');
            }
            if (!fieldPath || fieldPath.startsWith('@') || seenFields.has(fieldPath)) continue;
            seenFields.add(fieldPath);
            variables.push({
              name: `${basePath}.${fieldPath}`,
              stepName: `Selected item from "${stepName}"`,
              source: 'workflow'
            });
          }
        }
      });

      allSteps.forEach(s => {
        const sStepType = s.stepType || s.step_type;
        if (sStepType !== 'for_each') return;
        if (typeof s.stepOrder === 'number' && s.stepOrder >= currentStepOrder) return;
        const config = s.configJson || s.config_json || {};
        const itemVariable = config.itemVariable || 'item';
        const loopName = s.stepName || s.step_name || 'For Each Loop';
        const sourceArray = config.sourceArray || '';
        variables.push({
          name: `forEach.${itemVariable}`,
          stepName: `Current iteration from "${loopName}"${sourceArray ? ` (over ${sourceArray})` : ''}`,
          source: 'loop_item',
          dataType: 'current loop item'
        });
      });
    }

    return variables;
  }, [allSteps, currentStepOrder, executeButtonFields, extractionType]);

  const getAvailableVariables = () => availableVariables;

  const getButtonRef = (key: string): React.RefObject<HTMLButtonElement> => {
    if (!buttonRefs.current[key]) {
      buttonRefs.current[key] = React.createRef<HTMLButtonElement>();
    }
    return buttonRefs.current[key];
  };

  const handleInsertVariable = (fieldName: string, variableName: string) => {
    const currentValue = queryParameterConfig[fieldName]?.value || '';
    const newValue = currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}`;
    handleParameterValueChange(fieldName, newValue);
    setOpenVariableDropdown(null);
  };

  const handleInsertSpecField = (fieldName: string, specFieldPath: string) => {
    const currentValue = queryParameterConfig[fieldName]?.value || '';
    const newValue = currentValue ? `${currentValue},${specFieldPath}` : specFieldPath;
    handleParameterValueChange(fieldName, newValue);
  };

  const handleInsertFilterExpression = (fieldName: string, expression: string) => {
    const currentValue = queryParameterConfig[fieldName]?.value || '';
    const newValue = currentValue ? `${currentValue} and ${expression}` : expression;
    handleParameterValueChange(fieldName, newValue);
  };

  const handlePathVariableChange = (variableName: string, value: string) => {
    setPathVariableConfig(prev => ({
      ...prev,
      [variableName]: value
    }));
  };

  const handleInsertPathVariable = (variableName: string, insertValue: string) => {
    const currentValue = pathVariableConfig[variableName] || '';
    const newValue = currentValue ? `${currentValue}{{${insertValue}}}` : `{{${insertValue}}}`;
    handlePathVariableChange(variableName, newValue);
    setOpenVariableDropdown(null);
  };

  const generateRequestBodyFieldMappings = () => {
    if (!requestBodyTemplate) {
      alert('Please add a JSON template first');
      return;
    }

    try {
      const template = JSON.parse(requestBodyTemplate);
      const fieldMappings: RequestBodyFieldMapping[] = [];

      const extractFields = (obj: any, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const fieldName = prefix ? `${prefix}.${key}` : key;

          if (Array.isArray(value) && value.length > 0) {
            const firstItem = value[0];
            if (firstItem && typeof firstItem === 'object') {
              extractFields(firstItem, `${fieldName}[0]`);
            }
          } else if (value && typeof value === 'object') {
            extractFields(value, fieldName);
          } else {
            let dataType: 'string' | 'number' | 'integer' | 'datetime' | 'boolean' = 'string';

            if (typeof value === 'number') {
              dataType = Number.isInteger(value) ? 'integer' : 'number';
            } else if (typeof value === 'boolean') {
              dataType = 'boolean';
            } else if (typeof value === 'string') {
              if (/^\d{4}-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12]\d)((T| )([01]\d|2[0-3]):([0-5]\d):([0-5]\d))?$/.test(value)) {
                dataType = 'datetime';
              }
            }

            fieldMappings.push({
              fieldName: fieldName,
              type: 'hardcoded',
              value: '',
              dataType
            });
          }
        }
      };

      extractFields(template);
      const existingFieldNames = new Set(requestBodyFieldMappings.map(m => m.fieldName));
      const newMappings = fieldMappings.filter(m => !existingFieldNames.has(m.fieldName));
      setRequestBodyFieldMappings([...requestBodyFieldMappings, ...newMappings]);
      setJsonParseError(null);
    } catch (error: any) {
      let errorMessage = 'Invalid JSON format. Please check the syntax.';
      if (error?.message) {
        const positionMatch = error.message.match(/position (\d+)/i);
        if (positionMatch) {
          const position = parseInt(positionMatch[1], 10);
          const lines = requestBodyTemplate.substring(0, position).split('\n');
          const lineNumber = lines.length;
          const columnNumber = lines[lines.length - 1].length + 1;
          errorMessage = `JSON parse error at line ${lineNumber}, column ${columnNumber}: ${error.message}`;
        } else {
          errorMessage = `JSON parse error: ${error.message}`;
        }
      }
      setJsonParseError(errorMessage);
    }
  };

  const addRequestBodyFieldMapping = () => {
    const newMapping: RequestBodyFieldMapping = {
      fieldName: '',
      type: 'hardcoded',
      value: '',
      dataType: 'string'
    };
    setRequestBodyFieldMappings([...requestBodyFieldMappings, newMapping]);
  };

  const updateRequestBodyFieldMapping = (index: number, field: keyof RequestBodyFieldMapping, value: any) => {
    const updated = [...requestBodyFieldMappings];
    updated[index] = { ...updated[index], [field]: value };
    setRequestBodyFieldMappings(updated);
  };

  const removeRequestBodyFieldMapping = (index: number) => {
    setRequestBodyFieldMappings(requestBodyFieldMappings.filter((_, i) => i !== index));
  };

  const handleInsertRequestBodyVariable = (index: number, variableName: string) => {
    const currentValue = requestBodyFieldMappings[index]?.value || '';
    const newValue = currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}`;
    updateRequestBodyFieldMapping(index, 'value', newValue);
    setOpenVariableDropdown(null);
  };

  const updateParentConfig = () => {
    if (isRestoringRef.current || isInitialMountRef.current) {
      return;
    }

    const mergedQueryParameterConfig = { ...queryParameterConfig };
    customQueryParameters.forEach(cp => {
      if (cp.name) {
        mergedQueryParameterConfig[cp.name] = { enabled: cp.enabled, value: cp.value };
      }
    });

    const newConfig = {
      apiSourceType,
      apiEndpointId: apiSourceType === 'main' ? 'main' : undefined,
      secondaryApiId: apiSourceType === 'secondary' ? selectedSecondaryApiId : undefined,
      httpMethod,
      apiSpecId: selectedApiSpecId,
      apiSpecEndpointId: selectedEndpoint?.id,
      apiPath: manualApiEntry ? manualApiPath : (selectedEndpoint?.path || ''),
      queryParameterConfig: mergedQueryParameterConfig,
      customQueryParameters: customQueryParameters.length > 0 ? customQueryParameters : undefined,
      pathVariableConfig: Object.keys(pathVariableConfig).length > 0 ? pathVariableConfig : undefined,
      responseDataMappings: responseDataMappings.length > 0
        ? responseDataMappings
        : undefined,
      responseReturnsArray: responseReturnsArray || undefined,
      manualApiEntry,
      escapeSingleQuotesInBody,
      requestBodyTemplate: requestBodyTemplate || undefined,
      requestBodyFieldMappings: requestBodyFieldMappings.length > 0 ? requestBodyFieldMappings : undefined,
      arrayProcessingMode: arrayProcessingMode !== 'none' ? arrayProcessingMode : undefined,
      arraySourceGroupId: (arrayProcessingMode !== 'none' && arrayProcessingMode !== 'single_array' && arrayProcessingMode !== 'conditional_hardcode') ? arraySourceGroupId : undefined,
      stopOnError: arrayProcessingMode === 'loop' ? stopOnError : undefined,
      wrapBodyInArray: wrapBodyInArray || arrayProcessingMode === 'single_array' ? true : undefined,
      conditionalArrayMappings: arrayProcessingMode === 'conditional_hardcode' && conditionalArrayMappings.length > 0 ? conditionalArrayMappings : undefined,
      responseTransformation: responseTransformEnabled ? {
        enabled: true,
        arrayPath: responseTransformArrayPath || undefined,
        filters: responseTransformFilters.length > 0 ? responseTransformFilters : undefined,
        selectFields: responseTransformSelectFields
          ? responseTransformSelectFields.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        skipIfEmpty: responseTransformSkipIfEmpty || undefined,
      } : undefined,
    };

    if (!newConfig.apiSourceType || !newConfig.httpMethod) {
      return;
    }

    onChange(newConfig);
  };

  const detectedVariables = getAllDetectedVariables();

  return (
    <>
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Source
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="main"
                checked={apiSourceType === 'main'}
                onChange={(e) => {
                  setApiSourceType(e.target.value as 'main' | 'secondary');
                  setSelectedSecondaryApiId('');
                  setSelectedApiSpecId('');
                  setSelectedEndpoint(null);
                }}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Main API</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="secondary"
                checked={apiSourceType === 'secondary'}
                onChange={(e) => {
                  setApiSourceType(e.target.value as 'main' | 'secondary');
                  setSelectedApiSpecId('');
                  setSelectedEndpoint(null);
                }}
                className="mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Secondary API</span>
            </label>
          </div>
        </div>

        {apiSourceType === 'secondary' && (
          <div>
            <Select
              label="Secondary API"
              value={selectedSecondaryApiId}
              onValueChange={(value) => {
                setSelectedSecondaryApiId(value);
                const api = secondaryApis.find(a => a.id === value);
                setSelectedSecondaryApi(api || null);
                setSelectedApiSpecId('');
                setSelectedEndpoint(null);
              }}
              options={secondaryApis.map(api => ({
                value: api.id,
                label: `${api.name} (${api.baseUrl})`
              }))}
              required
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Select
            label="HTTP Method"
            value={httpMethod}
            onValueChange={setHttpMethod}
            options={[
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'PATCH', label: 'PATCH' },
              { value: 'DELETE', label: 'DELETE' }
            ]}
            searchable={false}
          />
        </div>

        {apiSpecs.length > 0 && (
          <div>
            {console.log('[Render] API Specification dropdown - selectedApiSpecId:', selectedApiSpecId, 'apiSpecs:', apiSpecs.map(s => ({ id: s.id, name: s.name })))}
            <Select
              label="API Specification"
              value={selectedApiSpecId}
              onValueChange={(value) => {
                console.log('[Select:onValueChange] API Specification changed to:', value);
                setSelectedApiSpecId(value);
              }}
              options={apiSpecs.map(spec => ({
                value: spec.id,
                label: spec.name
              }))}
            />
          </div>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <input
          type="checkbox"
          id="manualApiEntry"
          checked={manualApiEntry}
          onChange={(e) => setManualApiEntry(e.target.checked)}
          className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
        />
        <label htmlFor="manualApiEntry" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Enter API path manually
        </label>
      </div>

      {manualApiEntry ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Path
          </label>
          <input
            type="text"
            value={manualApiPath}
            onChange={(e) => setManualApiPath(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder="/api/orders"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Enter the API endpoint path. Use {'{variable}'} for path variables.
          </p>
        </div>
      ) : availableEndpoints.length > 0 ? (
        <div>
          <Select
            label="API Endpoint"
            value={selectedEndpoint?.id || ''}
            onValueChange={handleEndpointChange}
            options={endpointOptions}
          />
        </div>
      ) : (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            No endpoints found for the selected API specification and HTTP method. Try selecting a different specification or enable manual entry.
          </p>
        </div>
      )}

      {getPathVariables().length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Path Variables
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Configure values for path variables in the URL
          </p>

          <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 w-64">Variable</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {getPathVariables().map(variable => (
                  <tr key={variable}>
                    <td className="px-3 py-2">
                      <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {'{' + variable + '}'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={pathVariableConfig[variable] || ''}
                          onChange={(e) => handlePathVariableChange(variable, e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                          placeholder="value or {{variableName}}"
                        />
                        <button
                          ref={getButtonRef(`path_${variable}`)}
                          type="button"
                          onClick={() => setOpenVariableDropdown(openVariableDropdown === `path_${variable}` ? null : `path_${variable}`)}
                          className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="Insert variable from previous step"
                        >
                          <Braces className="w-4 h-4" />
                        </button>
                        <VariableDropdown
                          isOpen={openVariableDropdown === `path_${variable}`}
                          onClose={() => setOpenVariableDropdown(null)}
                          triggerRef={getButtonRef(`path_${variable}`)}
                          variables={getAvailableVariables()}
                          onSelect={(varName) => handleInsertPathVariable(variable, varName)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(queryParameters.length > 0 || customQueryParameters.length > 0 || selectedEndpoint || manualApiEntry) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Query Parameters
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={addCustomQueryParameter}
                className="flex items-center px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Parameter
              </button>
              {(queryParameters.length > 0 || customQueryParameters.length > 0) && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {(queryParameters.length > 0 || customQueryParameters.length > 0) && (
            <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 w-24">Enabled</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 w-64">Parameter</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {queryParameters.map(param => (
                    <tr key={param.id}>
                      <td className="px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={queryParameterConfig[param.field_name]?.enabled || false}
                            onChange={() => handleParameterToggle(param.field_name)}
                            disabled={param.is_required}
                            className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                          />
                          {param.description && (
                            <button
                              type="button"
                              title={param.description}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                            {param.field_name}
                          </span>
                          {param.is_required && (
                            <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 rounded">
                              Required
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded">
                            {param.field_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={queryParameterConfig[param.field_name]?.value || ''}
                            onChange={(e) => handleParameterValueChange(param.field_name, e.target.value)}
                            disabled={!queryParameterConfig[param.field_name]?.enabled}
                            className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-400"
                            placeholder={param.example || param.test_default || 'value'}
                          />
                          {responseSpecFields.length > 0 && (
                            <>
                              <button
                                ref={getButtonRef(`spec_query_${param.field_name}`)}
                                type="button"
                                onClick={() => setOpenSpecFieldDropdown(openSpecFieldDropdown === `query_${param.field_name}` ? null : `query_${param.field_name}`)}
                                disabled={!queryParameterConfig[param.field_name]?.enabled}
                                className="p-1.5 text-gray-600 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Insert field from API spec"
                              >
                                <List className="w-4 h-4" />
                              </button>
                              <SpecFieldDropdown
                                isOpen={openSpecFieldDropdown === `query_${param.field_name}`}
                                onClose={() => setOpenSpecFieldDropdown(null)}
                                triggerRef={getButtonRef(`spec_query_${param.field_name}`)}
                                fields={responseSpecFields}
                                loading={responseSpecFieldsLoading}
                                onSelect={(path) => handleInsertSpecField(param.field_name, path)}
                                isFilterParam={param.field_name.toLowerCase() === '$filter'}
                                onSelectFilterExpression={(expr) => handleInsertFilterExpression(param.field_name, expr)}
                                availableVariables={getAvailableVariables()}
                              />
                            </>
                          )}
                          <button
                            ref={getButtonRef(`query_${param.field_name}`)}
                            type="button"
                            onClick={() => setOpenVariableDropdown(openVariableDropdown === param.field_name ? null : param.field_name)}
                            disabled={!queryParameterConfig[param.field_name]?.enabled}
                            className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Insert variable from previous step"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                          <VariableDropdown
                            isOpen={openVariableDropdown === param.field_name}
                            onClose={() => setOpenVariableDropdown(null)}
                            triggerRef={getButtonRef(`query_${param.field_name}`)}
                            variables={getAvailableVariables()}
                            onSelect={(varName) => handleInsertVariable(param.field_name, varName)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {customQueryParameters.map(cp => (
                    <tr key={cp.id} className="bg-blue-50/30 dark:bg-blue-900/10">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={cp.enabled}
                          onChange={() => updateCustomQueryParameter(cp.id, 'enabled', !cp.enabled)}
                          className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={cp.name}
                            onChange={(e) => updateCustomQueryParameter(cp.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                            placeholder="parameterName"
                          />
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded whitespace-nowrap">
                            custom
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={cp.value}
                            onChange={(e) => updateCustomQueryParameter(cp.id, 'value', e.target.value)}
                            disabled={!cp.enabled}
                            className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:text-gray-400"
                            placeholder="value or {{variableName}}"
                          />
                          <button
                            ref={getButtonRef(`custom_query_${cp.id}`)}
                            type="button"
                            onClick={() => setOpenVariableDropdown(openVariableDropdown === `custom_${cp.id}` ? null : `custom_${cp.id}`)}
                            disabled={!cp.enabled}
                            className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Insert variable from previous step"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                          <VariableDropdown
                            isOpen={openVariableDropdown === `custom_${cp.id}`}
                            onClose={() => setOpenVariableDropdown(null)}
                            triggerRef={getButtonRef(`custom_query_${cp.id}`)}
                            variables={getAvailableVariables()}
                            onSelect={(varName) => {
                              const currentValue = cp.value || '';
                              const newValue = currentValue ? `${currentValue}{{${varName}}}` : `{{${varName}}}`;
                              updateCustomQueryParameter(cp.id, 'value', newValue);
                              setOpenVariableDropdown(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomQueryParameter(cp.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Remove parameter"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Request Body
            </label>
            <button
              type="button"
              onClick={generateRequestBodyFieldMappings}
              className="flex items-center px-3 py-1 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              <FileText className="w-4 h-4 mr-1" />
              Map JSON
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enter the JSON structure for the request body
          </p>

          <textarea
            value={requestBodyTemplate}
            onChange={(e) => {
              setRequestBodyTemplate(e.target.value);
              if (jsonParseError) setJsonParseError(null);
            }}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100 ${
              jsonParseError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            rows={8}
            placeholder={`{\n  "customLabel": "AAAAAA",\n  "customDefId": 0,\n  "customValue": "string"\n}`}
          />

          {jsonParseError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Invalid JSON</p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1 font-mono">{jsonParseError}</p>
              </div>
              <button
                type="button"
                onClick={() => setJsonParseError(null)}
                className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
            <input
              type="checkbox"
              id="wrapBodyInArrayGlobal"
              checked={wrapBodyInArray}
              onChange={(e) => setWrapBodyInArray(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="wrapBodyInArrayGlobal" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                Wrap request body in array
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enable this when the API expects the request body to be a JSON array (e.g., [{'{'}"field": "value"{'}'}]).
              </p>
            </div>
          </div>

          {requestBodyFieldMappings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Field Mappings
                </label>
                <div className="flex items-center space-x-2">
                  {flowNodeId && (
                    <button
                      type="button"
                      onClick={() => setShowFunctionsModal(true)}
                      className="flex items-center px-3 py-1 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700"
                    >
                      <Code className="w-4 h-4 mr-1" />
                      Function
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addRequestBodyFieldMapping}
                    className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Field
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {requestBodyFieldMappings.map((mapping, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-2 ${
                      mapping.type === 'hardcoded'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : mapping.type === 'function'
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Field Name
                        </label>
                        <input
                          type="text"
                          value={mapping.fieldName}
                          onChange={(e) => updateRequestBodyFieldMapping(index, 'fieldName', e.target.value)}
                          className={`w-full px-2 py-1 border-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            mapping.type === 'hardcoded'
                              ? 'border-green-400 dark:border-green-500'
                              : mapping.type === 'function'
                              ? 'border-amber-400 dark:border-amber-500'
                              : 'border-blue-400 dark:border-blue-500'
                          }`}
                          placeholder="fieldName"
                        />
                      </div>
                      <div>
                        <Select
                          label="Type"
                          value={mapping.type}
                          onValueChange={(value) => {
                            const newType = value as 'hardcoded' | 'variable' | 'function';
                            const updated = [...requestBodyFieldMappings];
                            updated[index] = {
                              ...updated[index],
                              type: newType,
                              ...(newType !== 'function' ? { functionId: undefined } : {}),
                              ...(newType === 'function' ? { value: '' } : {}),
                            };
                            setRequestBodyFieldMappings(updated);
                          }}
                          options={[
                            { value: 'hardcoded', label: 'Hardcoded' },
                            { value: 'variable', label: 'Variable' },
                            ...(flowNodeId ? [{ value: 'function', label: 'Function' }] : [])
                          ]}
                          searchable={false}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          {mapping.type === 'function' ? 'Function' : mapping.type === 'hardcoded' ? 'Value' : 'Variable Value'}
                        </label>
                        <div className="flex items-center space-x-2">
                          {mapping.type === 'function' ? (
                            <Select
                              value={mapping.functionId || ''}
                              onValueChange={(value) => {
                                const updated = [...requestBodyFieldMappings];
                                const func = availableFunctions.find(f => f.id === value);
                                updated[index] = {
                                  ...updated[index],
                                  functionId: value || undefined,
                                  value: func ? func.function_name : '',
                                };
                                setRequestBodyFieldMappings(updated);
                              }}
                              placeholder="Select a function..."
                              options={availableFunctions.map((func) => ({
                                value: func.id,
                                label: func.function_name + (func.description ? ` - ${func.description}` : '')
                              }))}
                              searchable={availableFunctions.length > 5}
                              className="flex-1"
                            />
                          ) : (
                            <input
                              type="text"
                              value={mapping.value}
                              onChange={(e) => updateRequestBodyFieldMapping(index, 'value', e.target.value)}
                              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder={
                                mapping.type === 'hardcoded' ? 'Fixed value' : '{{variableName}}'
                              }
                            />
                          )}
                          {mapping.type === 'variable' && (
                            <>
                              <button
                                ref={getButtonRef(`reqbody_${index}`)}
                                type="button"
                                onClick={() => setOpenVariableDropdown(openVariableDropdown === `reqbody_${index}` ? null : `reqbody_${index}`)}
                                className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="Insert variable from previous step"
                              >
                                <Braces className="w-4 h-4" />
                              </button>
                              <VariableDropdown
                                isOpen={openVariableDropdown === `reqbody_${index}`}
                                onClose={() => setOpenVariableDropdown(null)}
                                triggerRef={getButtonRef(`reqbody_${index}`)}
                                variables={getAvailableVariables()}
                                onSelect={(varName) => handleInsertRequestBodyVariable(index, varName)}
                              />
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-end space-x-2">
                        <div className="flex-1">
                          <Select
                            label="Data Type"
                            value={mapping.dataType || 'string'}
                            onValueChange={(value) => updateRequestBodyFieldMapping(index, 'dataType', value as 'string' | 'number' | 'integer' | 'decimal' | 'datetime' | 'boolean')}
                            options={[
                              { value: 'string', label: 'String' },
                              { value: 'number', label: 'Number' },
                              { value: 'decimal', label: 'Decimal' },
                              { value: 'integer', label: 'Integer' },
                              { value: 'datetime', label: 'DateTime' },
                              { value: 'boolean', label: 'Boolean' }
                            ]}
                            searchable={false}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRequestBodyFieldMapping(index)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors duration-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-xs text-gray-700 dark:text-gray-400">
                  <strong>Field Mappings:</strong> Use "Hardcoded" for fixed values, "Variable" to insert data from previous steps{flowNodeId ? ', or "Function" to apply conditional logic' : ''}. Variables use the format {'{{'} variableName {'}}'}.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {arrayGroups.length > 0 && (
        <div className="space-y-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md">
          <div className="flex items-center space-x-2">
            <Repeat className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <h4 className="text-sm font-medium text-orange-900 dark:text-orange-100">
              Array Processing
            </h4>
          </div>
          <p className="text-xs text-orange-700 dark:text-orange-300">
            Configure how this API endpoint handles data from array groups (multiple rows of data).
          </p>

          <div>
            <Select
              label="Processing Mode"
              value={arrayProcessingMode}
              onValueChange={(value) => setArrayProcessingMode(value as 'none' | 'loop' | 'batch' | 'single_array' | 'conditional_hardcode')}
              options={[
                { value: 'none', label: 'None - Standard single request' },
                { value: 'loop', label: 'Loop - One API call per row' },
                { value: 'batch', label: 'Batch - Single API call with array' },
                { value: 'single_array', label: 'Single - Array body, no group' },
                { value: 'conditional_hardcode', label: 'Conditional - Based on variable' }
              ]}
              searchable={false}
            />
          </div>

          {arrayProcessingMode !== 'none' && arrayProcessingMode !== 'single_array' && arrayProcessingMode !== 'conditional_hardcode' && (
            <>
              <div>
                <Select
                  label="Source Array Group"
                  value={arraySourceGroupId}
                  onValueChange={setArraySourceGroupId}
                  options={arrayGroups.map(group => ({
                    value: group.id,
                    label: group.name
                  }))}
                  required
                />
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Select the array group containing the rows to process.
                </p>
              </div>

              {arrayProcessingMode === 'loop' && (
                <>
                  <div className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-orange-200 dark:border-orange-700">
                    <input
                      type="checkbox"
                      id="stopOnError"
                      checked={stopOnError}
                      onChange={(e) => setStopOnError(e.target.checked)}
                      className="w-4 h-4 text-orange-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-orange-500"
                    />
                    <div className="flex-1">
                      <label htmlFor="stopOnError" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        Stop on first error
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        If disabled, all rows will be processed even if some fail.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-orange-200 dark:border-orange-700">
                <div className="flex items-start space-x-2">
                  <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {arrayProcessingMode === 'loop' ? (
                      <p>
                        <strong>Loop Mode:</strong> The API will be called once for each row in the array.
                        Variables like <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{execute.fieldName}}'}</code> will
                        resolve to each row's values in sequence.
                      </p>
                    ) : (
                      <p>
                        <strong>Batch Mode:</strong> All rows will be sent in a single API call as an array.
                        Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{arrayData}}'}</code> in your request body
                        to include the array of rows.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {arrayProcessingMode === 'single_array' && (
            <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-orange-200 dark:border-orange-700">
              <div className="flex items-start space-x-2">
                <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <p>
                    <strong>Single Array Mode:</strong> Makes a single API call with the request body wrapped in an array.
                    Use hardcoded field mappings. The body will be sent as <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">[{'{'}"field": "value"{'}'}]</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {arrayProcessingMode === 'conditional_hardcode' && (
            <div className="space-y-4">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-orange-200 dark:border-orange-700">
                <div className="flex items-start space-x-2">
                  <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <p>
                      <strong>Conditional Mode:</strong> Define multiple conditions based on form field values.
                      For each condition that evaluates to true, an API call will be made with the associated field mappings wrapped in an array.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Conditional Field Mappings
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newMapping: ConditionalArrayMapping = {
                      id: crypto.randomUUID(),
                      variable: '',
                      operator: 'equals',
                      expectedValue: '',
                      fieldMappings: []
                    };
                    setConditionalArrayMappings([...conditionalArrayMappings, newMapping]);
                  }}
                  className="flex items-center px-3 py-1 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Condition
                </button>
              </div>

              {conditionalArrayMappings.length === 0 && (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                  <p className="text-sm">No conditions defined yet.</p>
                  <p className="text-xs mt-1">Click "Add Condition" to create a conditional field mapping.</p>
                </div>
              )}

              {conditionalArrayMappings.map((condition, conditionIndex) => (
                <div
                  key={condition.id}
                  className="p-4 bg-white dark:bg-gray-800 border-2 border-orange-300 dark:border-orange-600 rounded-lg space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                      Condition {conditionIndex + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConditionalArrayMappings(conditionalArrayMappings.filter((_, i) => i !== conditionIndex));
                      }}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Variable
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={condition.variable}
                          onChange={(e) => {
                            const updated = [...conditionalArrayMappings];
                            updated[conditionIndex].variable = e.target.value;
                            setConditionalArrayMappings(updated);
                          }}
                          className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono dark:bg-gray-700 dark:text-gray-100"
                          placeholder="execute.fieldName"
                        />
                        <button
                          ref={getButtonRef(`cond_var_${conditionIndex}`)}
                          type="button"
                          onClick={() => setOpenVariableDropdown(openVariableDropdown === `cond_var_${conditionIndex}` ? null : `cond_var_${conditionIndex}`)}
                          className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="Insert variable"
                        >
                          <Braces className="w-4 h-4" />
                        </button>
                        <VariableDropdown
                          isOpen={openVariableDropdown === `cond_var_${conditionIndex}`}
                          onClose={() => setOpenVariableDropdown(null)}
                          triggerRef={getButtonRef(`cond_var_${conditionIndex}`)}
                          variables={getAvailableVariables()}
                          onSelect={(varName) => {
                            const updated = [...conditionalArrayMappings];
                            updated[conditionIndex].variable = varName;
                            setConditionalArrayMappings(updated);
                            setOpenVariableDropdown(null);
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <Select
                        label="Operator"
                        value={condition.operator}
                        onValueChange={(value) => {
                          const updated = [...conditionalArrayMappings];
                          updated[conditionIndex].operator = value as 'equals' | 'not_equals' | 'contains' | 'not_contains';
                          setConditionalArrayMappings(updated);
                        }}
                        options={[
                          { value: 'equals', label: 'Equals (=)' },
                          { value: 'not_equals', label: 'Not Equals (!=)' },
                          { value: 'contains', label: 'Contains' },
                          { value: 'not_contains', label: 'Not Contains' }
                        ]}
                        searchable={false}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Expected Value
                      </label>
                      <input
                        type="text"
                        value={condition.expectedValue}
                        onChange={(e) => {
                          const updated = [...conditionalArrayMappings];
                          updated[conditionIndex].expectedValue = e.target.value;
                          setConditionalArrayMappings(updated);
                        }}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100"
                        placeholder="True, EMAIL, etc."
                      />
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Field Mappings (when condition is true)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...conditionalArrayMappings];
                          updated[conditionIndex].fieldMappings.push({
                            fieldName: '',
                            type: 'hardcoded',
                            value: '',
                            dataType: 'string'
                          });
                          setConditionalArrayMappings(updated);
                        }}
                        className="flex items-center px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Field
                      </button>
                    </div>

                    {condition.fieldMappings.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        No field mappings defined. Click "Add Field" to add mappings.
                      </p>
                    )}

                    <div className="space-y-2">
                      {condition.fieldMappings.map((mapping, mappingIndex) => (
                        <div
                          key={mappingIndex}
                          className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-700 rounded"
                        >
                          <input
                            type="text"
                            value={mapping.fieldName}
                            onChange={(e) => {
                              const updated = [...conditionalArrayMappings];
                              updated[conditionIndex].fieldMappings[mappingIndex].fieldName = e.target.value;
                              setConditionalArrayMappings(updated);
                            }}
                            className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono dark:bg-gray-600 dark:text-gray-100"
                            placeholder="fieldName"
                          />
                          <Select
                            value={mapping.type}
                            onValueChange={(value) => {
                              const updated = [...conditionalArrayMappings];
                              updated[conditionIndex].fieldMappings[mappingIndex].type = value as 'hardcoded' | 'variable';
                              setConditionalArrayMappings(updated);
                            }}
                            options={[
                              { value: 'hardcoded', label: 'Hardcoded' },
                              { value: 'variable', label: 'Variable' }
                            ]}
                            searchable={false}
                          />
                          <input
                            type="text"
                            value={mapping.value}
                            onChange={(e) => {
                              const updated = [...conditionalArrayMappings];
                              updated[conditionIndex].fieldMappings[mappingIndex].value = e.target.value;
                              setConditionalArrayMappings(updated);
                            }}
                            className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-600 dark:text-gray-100"
                            placeholder={mapping.type === 'hardcoded' ? 'value' : '{{variable}}'}
                          />
                          <Select
                            value={mapping.dataType || 'string'}
                            onValueChange={(value) => {
                              const updated = [...conditionalArrayMappings];
                              updated[conditionIndex].fieldMappings[mappingIndex].dataType = value as 'string' | 'number' | 'integer' | 'decimal' | 'datetime' | 'boolean';
                              setConditionalArrayMappings(updated);
                            }}
                            options={[
                              { value: 'string', label: 'String' },
                              { value: 'integer', label: 'Integer' },
                              { value: 'number', label: 'Number' },
                              { value: 'decimal', label: 'Decimal' },
                              { value: 'boolean', label: 'Boolean' }
                            ]}
                            searchable={false}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...conditionalArrayMappings];
                              updated[conditionIndex].fieldMappings = updated[conditionIndex].fieldMappings.filter((_, i) => i !== mappingIndex);
                              setConditionalArrayMappings(updated);
                            }}
                            className="p-1 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="escapeSingleQuotesInBody"
            checked={escapeSingleQuotesInBody}
            onChange={(e) => setEscapeSingleQuotesInBody(e.target.checked)}
            className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
          />
          <div className="flex-1">
            <label htmlFor="escapeSingleQuotesInBody" className="text-sm font-medium text-blue-900 dark:text-blue-100 cursor-pointer">
              Escape Single Quotes for OData Filters
            </label>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Enable this when using OData $filter syntax. Converts single quotes to double quotes (e.g., "O'Hare" becomes "O''Hare") in all placeholder values in the URL and request body.
            </p>
          </div>
        </div>
      </div>

      {detectedVariables.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <div className="flex items-start space-x-2">
            <Braces className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                Variables Detected
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                The following variables will be replaced with extracted data at runtime:
              </p>
              <div className="flex flex-wrap gap-2">
                {detectedVariables.map((variable, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 text-xs font-mono bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 rounded"
                  >
                    {'{' + variable + '}'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
        <div className="flex items-start space-x-2 mb-2">
          <ExternalLink className="w-4 h-4 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Full URL Preview:
          </label>
        </div>
        <div className="ml-6 p-2 bg-white dark:bg-gray-900 border border-slate-300 dark:border-slate-600 rounded font-mono text-xs text-slate-900 dark:text-slate-100 break-all">
          {getCleanUrlPreview() || 'Configure endpoint to see URL preview'}
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-md">
        <button
          type="button"
          onClick={() => setShowResponseTransform(!showResponseTransform)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <div className="flex items-center space-x-2">
            <Repeat className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Response Transformation (Optional)
            </span>
            {responseTransformEnabled && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 rounded">
                Enabled
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">{showResponseTransform ? 'Hide' : 'Show'}</span>
        </button>

        {showResponseTransform && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="responseTransformEnabled"
                checked={responseTransformEnabled}
                onChange={(e) => setResponseTransformEnabled(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <label htmlFor="responseTransformEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Enable response transformation
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Filter and reshape the API response before it is passed to the next steps.
                </p>
              </div>
            </div>

            {responseTransformEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Array Path
                  </label>
                  <input
                    type="text"
                    value={responseTransformArrayPath}
                    onChange={(e) => setResponseTransformArrayPath(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g. value or data.items (leave empty if response itself is an array)"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Dot-notation path to the array inside the response. If the path doesn't resolve to an array, the response passes through unchanged.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filter Conditions
                    </label>
                    <button
                      type="button"
                      onClick={() => setResponseTransformFilters([...responseTransformFilters, { field: '', operator: 'equals', value: '' }])}
                      className="flex items-center px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Filter
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Multiple filters use AND logic. Values support {'{{stepName.field}}'}, {'{{forEach.item.field}}'}, and {'@loopIndex'}.
                  </p>
                  <div className="space-y-2">
                    {responseTransformFilters.map((filter, idx) => {
                      const noValueOps = ['isNull', 'isNotNull'];
                      const showValue = !noValueOps.includes(filter.operator);
                      return (
                        <div key={idx} className="flex items-start space-x-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                          <input
                            type="text"
                            value={filter.field}
                            onChange={(e) => {
                              const next = [...responseTransformFilters];
                              next[idx] = { ...next[idx], field: e.target.value };
                              setResponseTransformFilters(next);
                            }}
                            className="w-1/3 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono dark:bg-gray-700 dark:text-gray-100"
                            placeholder="field path"
                          />
                          <Select
                            value={filter.operator}
                            onValueChange={(value) => {
                              const next = [...responseTransformFilters];
                              next[idx] = { ...next[idx], operator: value };
                              setResponseTransformFilters(next);
                            }}
                            options={[
                              { value: 'equals', label: 'equals' },
                              { value: 'notEquals', label: 'not equals' },
                              { value: 'contains', label: 'contains' },
                              { value: 'startsWith', label: 'starts with' },
                              { value: 'endsWith', label: 'ends with' },
                              { value: 'greaterThan', label: 'greater than' },
                              { value: 'lessThan', label: 'less than' },
                              { value: 'greaterThanOrEqual', label: 'greater than or equal' },
                              { value: 'lessThanOrEqual', label: 'less than or equal' },
                              { value: 'isNull', label: 'is null' },
                              { value: 'isNotNull', label: 'is not null' }
                            ]}
                            searchable={false}
                          />
                          {showValue && (
                            <div className="flex-1 flex items-center space-x-1">
                              <input
                                type="text"
                                value={filter.value}
                                onChange={(e) => {
                                  const next = [...responseTransformFilters];
                                  next[idx] = { ...next[idx], value: e.target.value };
                                  setResponseTransformFilters(next);
                                }}
                                className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono dark:bg-gray-700 dark:text-gray-100"
                                placeholder="value or {{variable}}"
                              />
                              <button
                                ref={getButtonRef(`rt_filter_${idx}`)}
                                type="button"
                                onClick={() => setOpenVariableDropdown(openVariableDropdown === `rt_filter_${idx}` ? null : `rt_filter_${idx}`)}
                                className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="Insert variable"
                              >
                                <Braces className="w-3.5 h-3.5" />
                              </button>
                              <VariableDropdown
                                isOpen={openVariableDropdown === `rt_filter_${idx}`}
                                onClose={() => setOpenVariableDropdown(null)}
                                triggerRef={getButtonRef(`rt_filter_${idx}`)}
                                variables={getAvailableVariables()}
                                onSelect={(varName) => {
                                  const next = [...responseTransformFilters];
                                  next[idx] = { ...next[idx], value: `${next[idx].value || ''}{{${varName}}}` };
                                  setResponseTransformFilters(next);
                                  setOpenVariableDropdown(null);
                                }}
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setResponseTransformFilters(responseTransformFilters.filter((_, i) => i !== idx))}
                            className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                            title="Remove filter"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {responseTransformFilters.length === 0 && (
                      <p className="text-xs italic text-gray-400 dark:text-gray-500">No filters configured.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Select Fields
                  </label>
                  <input
                    type="text"
                    value={responseTransformSelectFields}
                    onChange={(e) => setResponseTransformSelectFields(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
                    placeholder="orderId, status, customer.name (leave empty to keep all fields)"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Comma-separated list of fields to keep on each item after filtering. Supports dot-notation for nested fields.
                  </p>
                </div>

                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="responseTransformSkipIfEmpty"
                    checked={responseTransformSkipIfEmpty}
                    onChange={(e) => setResponseTransformSkipIfEmpty(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="responseTransformSkipIfEmpty" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                      Skip remaining loop steps if result is empty
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Inside a For Each loop, when the filtered array is empty the remaining child steps are skipped and the loop advances to the next item. No effect outside a For Each.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Response Data Mappings
          </label>
          <button
            type="button"
            onClick={addResponseMapping}
            className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Mapping
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Extract multiple values from API response and store them in different locations in your extracted JSON data
        </p>

        <div className="flex items-start space-x-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <input
            type="checkbox"
            id="responseReturnsArray"
            checked={responseReturnsArray}
            onChange={(e) => setResponseReturnsArray(e.target.checked)}
            className="w-4 h-4 text-amber-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-amber-500 mt-0.5"
          />
          <div className="flex-1">
            <label htmlFor="responseReturnsArray" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Response Returns Multiple Records
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Enable when the API returns an array of records. Each mapping will extract the value from every record and store them as an array, instead of only using the first record.
            </p>
          </div>
        </div>

        {responseDataMappings.map((mapping, index) => (
          <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <div className="flex-1 space-y-2">
              <div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={mapping.responsePath}
                    onChange={(e) => updateResponseMapping(index, 'responsePath', e.target.value)}
                    onFocus={handleResponseMappingFocus}
                    onBlur={handleResponseMappingBlur}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm dark:bg-gray-600 dark:text-gray-100"
                    placeholder="Response path (e.g., data.result or items[0].value)"
                  />
                  {responseSpecFields.length > 0 && (
                    <>
                      <button
                        ref={getButtonRef(`spec_resp_${index}`)}
                        type="button"
                        onClick={() => setOpenSpecFieldDropdown(openSpecFieldDropdown === `resp_${index}` ? null : `resp_${index}`)}
                        className="p-1.5 text-gray-600 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded flex-shrink-0"
                        title="Select field from API spec"
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <SpecFieldDropdown
                        isOpen={openSpecFieldDropdown === `resp_${index}`}
                        onClose={() => setOpenSpecFieldDropdown(null)}
                        triggerRef={getButtonRef(`spec_resp_${index}`)}
                        fields={responseSpecFields}
                        loading={responseSpecFieldsLoading}
                        onSelect={(path) => {
                          updateResponseMapping(index, 'responsePath', path);
                        }}
                      />
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  JSON path to extract from API response
                </p>
              </div>
              <div>
                <input
                  type="text"
                  value={mapping.updatePath}
                  onChange={(e) => updateResponseMapping(index, 'updatePath', e.target.value)}
                  onFocus={handleResponseMappingFocus}
                  onBlur={handleResponseMappingBlur}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm dark:bg-gray-600 dark:text-gray-100"
                  placeholder="Update path (e.g., orders.0.customerId)"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Where to store in extracted JSON
                </p>
              </div>
            </div>
            {responseDataMappings.length > 1 && (
              <button
                type="button"
                onClick={() => removeResponseMapping(index)}
                className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md flex-shrink-0 mt-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>

      {showFunctionsModal && flowNodeId && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Flow Functions
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
                flowNodeId={flowNodeId}
                availableFields={requestBodyFieldMappings.filter(m => m.fieldName).map(m => ({ fieldName: m.fieldName, dataType: m.dataType }))}
                extractionTypes={[]}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
