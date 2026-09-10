import { getValueByPath } from "../utils.ts";

type FunctionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty';

interface FunctionConditionClause {
  field: string;
  operator: FunctionOperator;
  value: any;
}

interface FunctionCondition {
  if: FunctionConditionClause;
  additionalConditions?: FunctionConditionClause[];
  then: any;
}

interface ConditionalFunctionLogic {
  conditions: FunctionCondition[];
  default?: any;
}

interface DateFunctionLogic {
  type: 'date';
  source: 'field' | 'current_date';
  fieldName?: string;
  operation: 'add' | 'subtract';
  days: number;
  outputFormat?: string;
}

interface DateTimeMergeFunctionLogic {
  type: 'datetime_merge';
  dateFieldName: string;
  timeFieldName: string;
  outputFormat: string;
  inputDateFormat?: string;
  emptyTimeDefault?: string;
}

type FunctionLogic = ConditionalFunctionLogic | DateFunctionLogic | DateTimeMergeFunctionLogic | { type: 'address_lookup' };

function getFieldValue(fieldPath: string, data: Record<string, any>): any {
  if (!fieldPath || !data) return undefined;
  const parts = fieldPath.split('.');
  let value: any = data;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  switch (format) {
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'MM-DD-YYYY': return `${month}-${day}-${year}`;
    case 'YYYY-MM-DDTHH:mm:ss': return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    default: return `${year}-${month}-${day}`;
  }
}

function evaluateCondition(condition: FunctionConditionClause, data: Record<string, any>): boolean {
  const { field, operator, value: expectedValue } = condition;
  const actualValue = getFieldValue(field, data);
  switch (operator) {
    case 'equals': return actualValue === expectedValue;
    case 'not_equals': return actualValue !== expectedValue;
    case 'in': return Array.isArray(expectedValue) ? expectedValue.includes(actualValue) : false;
    case 'not_in': return Array.isArray(expectedValue) ? !expectedValue.includes(actualValue) : true;
    case 'greater_than': return Number(actualValue) > Number(expectedValue);
    case 'less_than': return Number(actualValue) < Number(expectedValue);
    case 'contains': return typeof actualValue === 'string' ? actualValue.includes(String(expectedValue)) : false;
    case 'starts_with': return typeof actualValue === 'string' ? actualValue.startsWith(String(expectedValue)) : false;
    case 'ends_with': return typeof actualValue === 'string' ? actualValue.endsWith(String(expectedValue)) : false;
    case 'is_empty': return actualValue === null || actualValue === undefined || actualValue === '' || (Array.isArray(actualValue) && actualValue.length === 0);
    case 'is_not_empty': return actualValue !== null && actualValue !== undefined && actualValue !== '' && (!Array.isArray(actualValue) || actualValue.length > 0);
    default: return false;
  }
}

function evaluateFunction(functionLogic: FunctionLogic, data: Record<string, any>): any {
  if (!functionLogic) return undefined;
  if ((functionLogic as any).type === 'date') {
    const logic = functionLogic as DateFunctionLogic;
    let baseDate: Date;
    if (logic.source === 'current_date') {
      baseDate = new Date();
    } else {
      const fieldValue = logic.fieldName ? getFieldValue(logic.fieldName, data) : null;
      if (!fieldValue) return '';
      baseDate = new Date(fieldValue);
      if (isNaN(baseDate.getTime())) return '';
    }
    const days = logic.days || 0;
    if (logic.operation === 'subtract') {
      baseDate.setDate(baseDate.getDate() - days);
    } else {
      baseDate.setDate(baseDate.getDate() + days);
    }
    return formatDate(baseDate, logic.outputFormat);
  }
  if ((functionLogic as any).type === 'datetime_merge') {
    const logic = functionLogic as DateTimeMergeFunctionLogic;
    const dateVal = logic.dateFieldName ? getFieldValue(logic.dateFieldName, data) : null;
    const timeVal = logic.timeFieldName ? getFieldValue(logic.timeFieldName, data) : null;

    const parseDate = (v: any, fmt?: string) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] };
      const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (slash) {
        const a = +slash[1], b = +slash[2], y = +slash[3];
        if (fmt === 'DD/MM/YYYY') return { year: y, month: b, day: a };
        return { year: y, month: a, day: b };
      }
      const mmm = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (mmm) {
        const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const mi = months.indexOf(mmm[2].toLowerCase());
        if (mi >= 0) return { year: +mmm[3], month: mi + 1, day: +mmm[1] };
      }
      const p = new Date(s);
      if (!isNaN(p.getTime())) return { year: p.getFullYear(), month: p.getMonth() + 1, day: p.getDate() };
      return null;
    };
    const parseTime = (v: any) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      const ap = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
      if (ap) {
        let h = +ap[1]; const m = +ap[2]; const sec = ap[3] ? +ap[3] : 0;
        const pm = ap[4].toLowerCase() === 'pm';
        if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
        return { hours: h, minutes: m, seconds: sec };
      }
      const hms = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (hms) return { hours: +hms[1], minutes: +hms[2], seconds: hms[3] ? +hms[3] : 0 };
      const cm = s.match(/^(\d{2})(\d{2})(\d{2})?$/);
      if (cm) return { hours: +cm[1], minutes: +cm[2], seconds: cm[3] ? +cm[3] : 0 };
      return null;
    };
    const dp = parseDate(dateVal, logic.inputDateFormat);
    if (!dp) return '';
    const tp = parseTime(timeVal) || parseTime(logic.emptyTimeDefault) || { hours: 0, minutes: 0, seconds: 0 };
    const YYYY = String(dp.year).padStart(4, '0');
    const MM = String(dp.month).padStart(2, '0');
    const DD = String(dp.day).padStart(2, '0');
    const HH = String(tp.hours).padStart(2, '0');
    const mm = String(tp.minutes).padStart(2, '0');
    const ss = String(tp.seconds).padStart(2, '0');
    switch (logic.outputFormat) {
      case 'YYYY-MM-DDTHH:mm:ss': return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}`;
      case 'YYYY-MM-DD HH:mm:ss': return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
      case 'YYYY-MM-DDTHH:mm:ssZ': return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}Z`;
      case 'MM/DD/YYYY HH:mm:ss': return `${MM}/${DD}/${YYYY} ${HH}:${mm}:${ss}`;
      case 'MM/DD/YYYY HH:mm': return `${MM}/${DD}/${YYYY} ${HH}:${mm}`;
      case 'DD/MM/YYYY HH:mm:ss': return `${DD}/${MM}/${YYYY} ${HH}:${mm}:${ss}`;
      case 'DD/MM/YYYY HH:mm': return `${DD}/${MM}/${YYYY} ${HH}:${mm}`;
      default: return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}`;
    }
  }
  if ((functionLogic as any).type === 'address_lookup') return '';
  const conditionalLogic = functionLogic as ConditionalFunctionLogic;
  if (!conditionalLogic.conditions) return conditionalLogic.default;
  for (const condition of conditionalLogic.conditions) {
    if (!evaluateCondition(condition.if, data)) continue;
    if (condition.additionalConditions?.length) {
      const allPass = condition.additionalConditions.every(c => evaluateCondition(c, data));
      if (!allPass) continue;
    }
    return condition.then;
  }
  return conditionalLogic.default;
}

export async function executeApiEndpoint(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ stepOutput: any; responseData: any; resolvedRequestDetails: any; resolvedRequestBody: string }> {
  console.log('🌐 === EXECUTING API ENDPOINT STEP ===');
  const config = step.config_json || {};
  console.log('🔧 API endpoint config:', JSON.stringify(config, null, 2));

  let baseUrl = '';
  let authToken = '';
  const apiSourceType = config.apiSourceType || 'main';
  console.log('📡 API source type:', apiSourceType, '(raw config value:', config.apiSourceType, ')');

  if (apiSourceType === 'main') {
    const apiConfigResponse = await fetch(`${supabaseUrl}/rest/v1/api_settings?select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json'
      }
    });
    if (apiConfigResponse.ok) {
      const apiSettings = await apiConfigResponse.json();
      if (apiSettings && apiSettings.length > 0) {
        baseUrl = apiSettings[0].path || '';
        authToken = apiSettings[0].password || '';
        console.log('✅ Loaded main API config, baseUrl:', baseUrl ? `${baseUrl.substring(0, 30)}...` : 'EMPTY');
        console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
      } else {
        console.error('❌ api_settings query returned 0 rows');
      }
    } else {
      console.error('❌ api_settings fetch failed with status:', apiConfigResponse.status, await apiConfigResponse.text());
    }
  } else if (apiSourceType === 'secondary' && config.secondaryApiId) {
    const secondaryApiResponse = await fetch(`${supabaseUrl}/rest/v1/secondary_api_configs?id=eq.${config.secondaryApiId}&select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json'
      }
    });
    if (secondaryApiResponse.ok) {
      const secondaryApis = await secondaryApiResponse.json();
      if (secondaryApis && secondaryApis.length > 0) {
        baseUrl = secondaryApis[0].base_url || '';
        authToken = secondaryApis[0].auth_token || '';
        console.log('✅ Loaded secondary API config, baseUrl:', baseUrl ? `${baseUrl.substring(0, 30)}...` : 'EMPTY');
        console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
      } else {
        console.error('❌ secondary_api_configs query returned 0 rows for id:', config.secondaryApiId);
      }
    } else {
      console.error('❌ secondary_api_configs fetch failed with status:', secondaryApiResponse.status, await secondaryApiResponse.text());
    }
  }

  let apiPath = config.apiPath || '';
  const httpMethod = config.httpMethod || 'POST';

  const pathVariableConfig = config.pathVariableConfig || {};
  const pathVarRegex = /\{([^}]+)\}|\$\{([^}]+)\}/g;
  let pathMatch;
  while ((pathMatch = pathVarRegex.exec(apiPath)) !== null) {
    const variableName = pathMatch[1] || pathMatch[2];
    let value = null;
    const configTemplate = pathVariableConfig[variableName];
    if (configTemplate) {
      const templateVarMatch = configTemplate.match(/\{\{([^}]+)\}\}/);
      if (templateVarMatch) {
        value = getValueByPath(contextData, templateVarMatch[1]);
        console.log(`🔄 Resolved path variable "${variableName}" via pathVariableConfig: {{${templateVarMatch[1]}}} -> ${value}`);
      } else {
        value = configTemplate;
      }
    }
    if (value === undefined || value === null) {
      value = getValueByPath(contextData, variableName);
    }
    if (value !== undefined && value !== null) {
      apiPath = apiPath.replace(pathMatch[0], String(value));
      console.log(`🔄 Replaced path variable ${pathMatch[0]} with: ${value}`);
    } else {
      console.warn(`⚠️ Path variable ${pathMatch[0]} could not be resolved`);
    }
  }

  const queryParams = new URLSearchParams();
  const queryParameterConfig = config.queryParameterConfig || {};

  for (const [paramName, paramConfig] of Object.entries(queryParameterConfig) as any) {
    if (paramConfig.enabled && paramConfig.value) {
      let paramValue = paramConfig.value;
      const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
      paramValue = paramConfig.value.replace(valueVarRegex, (match: string, doubleBrace: string, dollarBrace: string) => {
        const variableName = doubleBrace || dollarBrace;
        const value = getValueByPath(contextData, variableName);
        if (value !== undefined && value !== null) {
          let rawValue = String(value);
          const isODataFilterParam = paramName.toLowerCase() === '$filter';
          if (isODataFilterParam && rawValue.includes(')(')) {
            rawValue = rawValue.replace(/\)\(/g, ')-(');
            console.log(`🔧 Escaped )( to )-( in $filter param value:`, rawValue);
          }
          if (isODataFilterParam && rawValue.includes("'")) {
            rawValue = rawValue.replace(/'/g, "''");
            console.log(`🔧 Escaped single quotes in $filter param value:`, rawValue);
          }
          console.log(`🔄 Replaced query param variable ${match} with:`, rawValue);
          return rawValue;
        }
        console.warn(`⚠️ Variable ${match} not found in context, leaving unchanged`);
        return match;
      });
      console.log(`📋 Final param value for "${paramName}":`, paramValue);
      queryParams.append(paramName, paramValue);
    }
  }

  const customQueryParameters = config.customQueryParameters || [];
  for (const customParam of customQueryParameters) {
    if (customParam.key && customParam.value) {
      let paramValue = customParam.value;
      const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
      paramValue = customParam.value.replace(valueVarRegex, (match: string, doubleBrace: string, dollarBrace: string) => {
        const variableName = doubleBrace || dollarBrace;
        const value = getValueByPath(contextData, variableName);
        if (value !== undefined && value !== null) {
          return String(value);
        }
        return match;
      });
      console.log(`📋 Custom param "${customParam.key}":`, paramValue);
      queryParams.append(customParam.key, paramValue);
    }
  }

  const queryString = queryParams.toString();
  const fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`;
  console.log('🔗 Full API Endpoint URL:', fullUrl);

  if (!authToken) {
    console.warn('⚠️ WARNING: No auth token found! API call may fail due to authentication.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  const apiRequestDetails = {
    url: fullUrl,
    method: httpMethod,
    baseUrl: baseUrl,
    apiPath: apiPath,
    queryString: queryString,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authToken ? `Bearer ${authToken.substring(0, 10)}...` : 'MISSING'
    }
  };

  let requestBodyContent = config.requestBodyTemplate || '';
  const requestBodyFieldMappings = config.requestBodyFieldMappings || [];

  if (requestBodyFieldMappings.length > 0) {
    console.log('🔧 Processing', requestBodyFieldMappings.length, 'field mappings');
    try {
      let requestBodyData = requestBodyContent ? JSON.parse(requestBodyContent) : {};

      const functionMappings = requestBodyFieldMappings.filter((m: any) => m.type === 'function' && m.functionId);
      let functionsById: Record<string, any> = {};
      if (functionMappings.length > 0) {
        const functionIds = [...new Set(functionMappings.map((m: any) => m.functionId))];
        console.log(`🔧 Loading ${functionIds.length} function definition(s) for field mappings`);
        const funcResponse = await fetch(
          `${supabaseUrl}/rest/v1/field_mapping_functions?id=in.(${functionIds.join(',')})&select=*`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json'
            }
          }
        );
        if (funcResponse.ok) {
          const funcs = await funcResponse.json();
          for (const f of funcs) {
            functionsById[f.id] = f;
          }
          console.log(`✅ Loaded ${funcs.length} function definition(s)`);
        }
      }

      for (const mapping of requestBodyFieldMappings) {
        const fieldPath = mapping.fieldName;
        const mappingType = mapping.type;
        const mappingValue = mapping.value;
        const dataType = mapping.dataType || 'string';

        let finalValue;
        if (mappingType === 'hardcoded') {
          finalValue = mappingValue;
        } else if (mappingType === 'variable') {
          const variableName = mappingValue.replace(/^\{\{|\}\}$/g, '');
          finalValue = getValueByPath(contextData, variableName);
        } else if (mappingType === 'function' && mapping.functionId) {
          const func = functionsById[mapping.functionId];
          if (func && func.function_logic) {
            try {
              finalValue = evaluateFunction(func.function_logic as FunctionLogic, contextData.extractedData || contextData);
              console.log(`🔧 Function "${func.function_name}" -> ${fieldPath} = ${JSON.stringify(finalValue)}`);
            } catch (funcErr) {
              console.error(`❌ Error evaluating function for field "${fieldPath}":`, funcErr);
              continue;
            }
          } else {
            console.warn(`⚠️ Function not found for mapping "${fieldPath}" with ID: ${mapping.functionId}`);
            continue;
          }
        } else {
          continue;
        }

        if (finalValue !== undefined && finalValue !== null) {
          if (dataType === 'integer') {
            finalValue = parseInt(String(finalValue));
          } else if (dataType === 'number') {
            finalValue = parseFloat(String(finalValue));
          } else if (dataType === 'boolean') {
            finalValue = String(finalValue).toLowerCase() === 'true';
          } else if (dataType === 'date') {
            const dateValue = String(finalValue);
            const dateMatch = dateValue.match(/^(\d{4}-\d{2}-\d{2})/);
            finalValue = dateMatch ? dateMatch[1] : dateValue;
          } else if (dataType === 'datetime') {
            const dateValue = String(finalValue);
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}:00`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}T00:00:00`;
            } else {
              finalValue = dateValue;
            }
          } else {
            finalValue = String(finalValue);
          }

          const pathParts = fieldPath.split('.');
          let current = requestBodyData;
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) {
              current[part] = {};
            }
            current = current[part];
          }
          const lastPart = pathParts[pathParts.length - 1];
          current[lastPart] = finalValue;
        }
      }

      requestBodyContent = JSON.stringify(requestBodyData);
      console.log('📄 Processed request body:', requestBodyContent.substring(0, 500));
    } catch (mappingError) {
      console.error('❌ Error processing field mappings:', mappingError);
    }
  } else if (requestBodyContent) {
    requestBodyContent = requestBodyContent.replace(/\{\{([^}]+)\}\}/g, (match: string, path: string) => {
      const value = getValueByPath(contextData, path.trim());
      if (value !== null && value !== undefined) {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return match;
    });
  }

  if (config.wrapBodyInArray && requestBodyContent?.trim()) {
    try {
      const parsedBody = JSON.parse(requestBodyContent);
      if (!Array.isArray(parsedBody)) {
        requestBodyContent = JSON.stringify([parsedBody]);
        console.log('📦 Wrapped request body in array');
      }
    } catch (e) {
      console.warn('⚠️ Could not wrap body in array - invalid JSON:', e);
    }
  }

  console.log(`📤 Making ${httpMethod} request to API endpoint`);
  console.log('📋 Request Details:');
  console.log('  - URL:', fullUrl);
  console.log('  - Method:', httpMethod);
  console.log('  - Headers:', JSON.stringify(headers, null, 2));
  console.log('  - Base URL:', baseUrl);
  console.log('  - API Path:', apiPath);
  console.log('  - Query String:', queryString);

  const fetchOptions: any = { method: httpMethod, headers };
  if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent && requestBodyContent.trim() !== '') {
    fetchOptions.body = requestBodyContent;
    console.log('📄 Including request body for', httpMethod, 'request');
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(fullUrl, fetchOptions);
  } catch (fetchError: any) {
    console.error('❌ fetch() threw an error:', fetchError.message);
    const error: any = new Error(`${fetchError.message}`);
    error.outputData = { requestAttempted: apiRequestDetails };
    error.resolvedRequestDetails = apiRequestDetails;
    error.resolvedRequestBody = requestBodyContent;
    throw error;
  }
  console.log('📥 API endpoint response status:', apiResponse.status);

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error('❌ API endpoint call failed:', errorText);
    const error: any = new Error(`API endpoint call failed with status ${apiResponse.status}: ${errorText}`);
    error.outputData = {
      requestAttempted: apiRequestDetails,
      responseStatus: apiResponse.status,
      error: errorText
    };
    error.resolvedRequestDetails = apiRequestDetails;
    error.resolvedRequestBody = requestBodyContent;
    throw error;
  }

  const contentType = apiResponse.headers.get('content-type') || '';
  const isJsonContentType = contentType.includes('application/json');
  const isBinaryResponse = contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('image/') ||
    config.treatResponseAsBinary === true;

  console.log(`[ApiEndpoint] Response Content-Type: "${contentType}"`);
  console.log(`[ApiEndpoint] isBinaryResponse: ${isBinaryResponse} (treatResponseAsBinary config: ${config.treatResponseAsBinary})`);
  console.log(`[ApiEndpoint] Response status: ${apiResponse.status}`);

  let responseData: any;
  if (isBinaryResponse && isJsonContentType) {
    const responseText = await apiResponse.text();
    let jsonData: any;
    try {
      jsonData = JSON.parse(responseText);
    } catch {
      jsonData = null;
    }

    let base64Content: string | null = null;
    const binaryField = config.binaryResponseField;

    if (jsonData && binaryField) {
      const fieldValue = binaryField.split('.').reduce((obj: any, key: string) => obj?.[key], jsonData);
      if (typeof fieldValue === 'string' && fieldValue.length > 100) {
        base64Content = fieldValue;
        console.log(`[ApiEndpoint] Extracted base64 from JSON field "${binaryField}", length: ${base64Content.length}`);
      }
    }

    if (!base64Content && jsonData && typeof jsonData === 'object') {
      const findBase64Field = (obj: any): string | null => {
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (typeof val === 'string' && val.length > 500 && /^[A-Za-z0-9+/=]+$/.test(val.substring(0, 100))) {
            console.log(`[ApiEndpoint] Auto-detected base64 in JSON field "${key}", length: ${val.length}`);
            return val;
          }
        }
        return null;
      };
      base64Content = findBase64Field(jsonData);
    }

    if (base64Content) {
      responseData = {
        _binaryBase64: base64Content,
        _contentType: 'application/pdf',
        _byteLength: Math.ceil(base64Content.length * 3 / 4)
      };
      contextData._lastBinaryResponseBase64 = base64Content;
      contextData._lastBinaryResponseContentType = 'application/pdf';
      console.log(`[ApiEndpoint] Binary content extracted from JSON response, base64 length: ${base64Content.length}`);
    } else {
      console.log(`[ApiEndpoint] WARNING: treatResponseAsBinary=true but JSON response has no extractable base64 field. Set "Binary Response Field" in config.`);
      responseData = jsonData || { _rawText: responseText };
    }
  } else if (isBinaryResponse) {
    const arrayBuffer = await apiResponse.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Content = btoa(binary);
    responseData = {
      _binaryBase64: base64Content,
      _contentType: contentType,
      _byteLength: arrayBuffer.byteLength
    };
    contextData._lastBinaryResponseBase64 = base64Content;
    contextData._lastBinaryResponseContentType = contentType;
    console.log(`[ApiEndpoint] Binary response captured: ${contentType}, ${arrayBuffer.byteLength} bytes, base64 length: ${base64Content.length}`);
  } else {
    const responseText = await apiResponse.text();
    console.log(`[ApiEndpoint] Non-binary response (first 200 chars): ${responseText.substring(0, 200)}`);
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { _rawText: responseText };
      console.log(`[ApiEndpoint] WARNING: Response is not JSON and not detected as binary. Content-Type was: "${contentType}"`);
    }
  }
  console.log('✅ API endpoint call successful');
  console.log('📄 Response data (first 500 chars):', JSON.stringify(responseData).substring(0, 500));
  console.log('📄 Full Response data:', JSON.stringify(responseData, null, 2));

  let mappingsToProcess: any[] = [];
  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    mappingsToProcess = config.responseDataMappings;
    console.log('📋 Using new format: processing', mappingsToProcess.length, 'mapping(s)');
  } else if (config.responsePath && config.updateJsonPath) {
    mappingsToProcess = [{ responsePath: config.responsePath, updatePath: config.updateJsonPath }];
    console.log('📋 Using old format: converted to single mapping');
  }

  let unwrappedResponseData = responseData;
  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
    const arrayKeys = Object.keys(responseData).filter(k => Array.isArray(responseData[k]));
    if (arrayKeys.length === 1 && responseData[arrayKeys[0]].length > 0) {
      const testPath = mappingsToProcess?.[0]?.responsePath;
      if (testPath && getValueByPath(responseData, testPath) === null) {
        const firstItem = responseData[arrayKeys[0]][0];
        if (firstItem && typeof firstItem === 'object' && testPath in firstItem) {
          unwrappedResponseData = firstItem;
          console.log(`📦 Auto-unwrapped response: using first item from "${arrayKeys[0]}" array`);
        }
      }
    }
  }

  const extractedValues: any[] = [];
  if (mappingsToProcess.length > 0) {
    console.log('🔄 Extracting data from API response...');
    for (const mapping of mappingsToProcess) {
      if (!mapping.responsePath || !mapping.updatePath) {
        console.warn('⚠️ Skipping mapping with missing responsePath or updatePath:', mapping);
        continue;
      }
      try {
        let extractedValue = getValueByPath(unwrappedResponseData, mapping.responsePath);
        if (extractedValue === null && unwrappedResponseData !== responseData) {
          extractedValue = getValueByPath(responseData, mapping.responsePath);
        }
        console.log(`🔍 Extracted value from path "${mapping.responsePath}":`, extractedValue);
        const hasDefault = mapping.defaultValue !== undefined && mapping.defaultValue !== null && mapping.defaultValue !== '';
        if ((extractedValue === undefined || extractedValue === null || extractedValue === '') && hasDefault) {
          extractedValue = mapping.defaultValue;
          console.log(`🔄 Using default value for "${mapping.responsePath}":`, extractedValue);
        }
        if (extractedValue !== undefined) {
          const pathParts = mapping.updatePath.split(/[.\[\]]/).filter(Boolean);
          let current = contextData.extractedData || contextData;
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!(part in current)) {
              current[part] = {};
            }
            current = current[part];
          }
          const lastPart = pathParts[pathParts.length - 1];
          current[lastPart] = extractedValue;
          console.log(`✅ Updated context data at path "${mapping.updatePath}"`);
          contextData[lastPart] = extractedValue;
          extractedValues.push({ path: mapping.responsePath, updatePath: mapping.updatePath, value: extractedValue, usedDefault: hasDefault && (getValueByPath(unwrappedResponseData, mapping.responsePath) === null || getValueByPath(unwrappedResponseData, mapping.responsePath) === undefined || getValueByPath(unwrappedResponseData, mapping.responsePath) === '') });
        }
      } catch (extractError) {
        console.error(`❌ Failed to process mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError);
      }
    }
  }

  const stepOutput = {
    url: fullUrl,
    method: httpMethod,
    responseStatus: apiResponse.status,
    extractedValues,
    updatedPaths: mappingsToProcess.map((m: any) => m.updatePath)
  };

  console.log('✅ === API ENDPOINT STEP COMPLETED ===');
  return { stepOutput, responseData, resolvedRequestDetails: apiRequestDetails, resolvedRequestBody: requestBodyContent };
}
