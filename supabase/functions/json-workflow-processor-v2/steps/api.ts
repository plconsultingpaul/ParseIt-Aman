// steps/api.ts - API call and endpoint execution logic

import { getValueByPath, escapeSingleQuotesForOData } from "../utils.ts";

export async function executeApiCall(step: any, contextData: any): Promise<{ responseData: any; resolvedRequestBody: string }> {
  console.log('=== EXECUTING API CALL STEP ===');
  const config = step.config_json || {};

  let url = config.url || '';

  // URL placeholder replacement
  const urlPlaceholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  const replacements = [];

  while ((match = urlPlaceholderRegex.exec(url)) !== null) {
    const placeholder = match[0];
    const path = match[1];
    const value = getValueByPath(contextData, path);
    replacements.push({ placeholder, path, value });
  }

  for (const replacement of replacements) {
    let rawValue = String(replacement.value || '');

    if (config.escapeSingleQuotesInBody && (rawValue.includes("'") || rawValue.includes("(") || rawValue.includes(")"))) {
      rawValue = escapeSingleQuotesForOData(rawValue);
    }

    const encodedValue = encodeURIComponent(rawValue);
    const placeholderEscaped = replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    url = url.replace(new RegExp(placeholderEscaped, 'g'), encodedValue);
  }

  // Request body placeholder replacement
  let requestBody = config.requestBody || '';

  const bodyPlaceholderRegex = /\{\{([^}]+)\}\}/g;
  let bodyMatch;
  const bodyReplacements = [];

  while ((bodyMatch = bodyPlaceholderRegex.exec(requestBody)) !== null) {
    const placeholder = bodyMatch[0];
    const path = bodyMatch[1];

    if (path === 'extractedData' || path === 'orders') {
      continue;
    }

    const value = getValueByPath(contextData, path);
    bodyReplacements.push({ placeholder, path, value });
  }

  for (const replacement of bodyReplacements) {
    let rawValue = String(replacement.value || '');

    if (config.escapeSingleQuotesInBody && (rawValue.includes("'") || rawValue.includes("(") || rawValue.includes(")"))) {
      rawValue = escapeSingleQuotesForOData(rawValue);
    }

    const escapedValue = rawValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    requestBody = requestBody.replace(new RegExp(replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), escapedValue);
  }

  // Handle {{extractedData}} placeholder
  if (requestBody.includes('{{extractedData}}')) {
    if (contextData.extractedData && typeof contextData.extractedData === 'object') {
      const stringifiedData = JSON.stringify(contextData.extractedData);
      requestBody = requestBody.replace(/\{\{extractedData\}\}/g, stringifiedData);
    } else if (contextData.originalExtractedData && typeof contextData.originalExtractedData === 'string') {
      requestBody = requestBody.replace(/\{\{extractedData\}\}/g, contextData.originalExtractedData);
    }
  }

  // Handle {{orders}} placeholder
  if (requestBody.includes('{{orders}}')) {
    if (contextData.orders && Array.isArray(contextData.orders)) {
      requestBody = requestBody.replace(/\{\{orders\}\}/g, JSON.stringify(contextData.orders));
    }
  }

  // Make API call
  const method = (config.method || 'POST').toUpperCase();
  console.log('Making API call:', method, url);
  const rawHeaders = config.headers || {};
  const resolvedHeaders: Record<string, string> = {};
  for (const [hKey, hVal] of Object.entries(rawHeaders)) {
    let resolvedVal = String(hVal);
    const hVarRegex = /\{\{([^}]+)\}\}/g;
    let hMatch;
    while ((hMatch = hVarRegex.exec(String(hVal))) !== null) {
      const varValue = getValueByPath(contextData, hMatch[1]);
      if (varValue !== undefined && varValue !== null) {
        resolvedVal = resolvedVal.replace(hMatch[0], String(varValue));
      }
    }
    resolvedHeaders[hKey] = resolvedVal;
  }

  const fetchOptions: any = {
    method,
    headers: resolvedHeaders
  };

  if (method !== 'GET' && requestBody && requestBody.trim() !== '') {
    fetchOptions.body = requestBody;
  }

  const apiResponse = await fetch(url, fetchOptions);

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error('API call failed:', apiResponse.status, errorText);
    throw new Error(`API call failed with status ${apiResponse.status}: ${errorText}`);
  }

  const responseText = await apiResponse.text();

  if (!responseText || responseText.trim() === '') {
    console.error('API returned empty response');
    throw new Error('API returned empty response body');
  }

  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (responseParseError) {
    console.error('Failed to parse API response:', responseParseError);
    throw new Error(`API response is not valid JSON: ${responseParseError instanceof Error ? responseParseError.message : 'Unknown error'}`);
  }

  // Process response data mappings
  let mappingsToProcess = [];
  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    mappingsToProcess = config.responseDataMappings;
  } else if (config.responseDataPath && config.updateJsonPath) {
    mappingsToProcess = [{
      responsePath: config.responseDataPath,
      updatePath: config.updateJsonPath
    }];
  }

  if (mappingsToProcess.length > 0) {
    for (const mapping of mappingsToProcess) {
      const responsePath = mapping.responsePath;
      const updatePath = mapping.updatePath || mapping.fieldName;

      if (!responsePath || !updatePath) {
        console.warn('Skipping invalid mapping:', mapping);
        continue;
      }

      const extractedValue = getValueByPath(responseData, responsePath, false);

      if (extractedValue !== undefined && extractedValue !== null) {
        const pathParts = updatePath.split('.');
        let current = contextData;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        current[pathParts[pathParts.length - 1]] = extractedValue;
        console.log(`Mapped ${responsePath} -> contextData.${updatePath}`);
      } else {
        console.warn(`Path "${responsePath}" not found in API response`);
      }
    }
  }

  return { responseData, resolvedRequestBody: requestBody };
}

export async function executeApiEndpoint(step: any, contextData: any, supabaseUrl: string, supabaseServiceKey: string): Promise<any> {
  console.log('=== EXECUTING API ENDPOINT STEP ===');
  const config = step.config_json || {};

  let baseUrl = '';
  let authToken = '';

  const apiSourceType = config.apiSourceType || 'main';

  if (apiSourceType === 'main') {
    try {
      const mainApiResponse = await fetch(`${supabaseUrl}/rest/v1/api_settings?select=*`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      });

      if (mainApiResponse.ok) {
        const mainApis = await mainApiResponse.json();
        if (mainApis && mainApis.length > 0) {
          const mainApiConfig = mainApis[0];
          baseUrl = mainApiConfig.path || '';
          authToken = mainApiConfig.password || '';
        }
      }
    } catch (apiConfigError) {
      console.error('Failed to load main API config:', apiConfigError);
    }
  } else if (apiSourceType === 'secondary' && config.secondaryApiId) {
    try {
      const secondaryApiResponse = await fetch(`${supabaseUrl}/rest/v1/secondary_api_configs?select=*&id=eq.${config.secondaryApiId}`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      });

      if (secondaryApiResponse.ok) {
        const secondaryApis = await secondaryApiResponse.json();
        if (secondaryApis && secondaryApis.length > 0) {
          const secondaryApiConfig = secondaryApis[0];
          baseUrl = secondaryApiConfig.base_url || '';
          authToken = secondaryApiConfig.auth_token || '';
        }
      }
    } catch (apiConfigError) {
      console.error('Failed to load secondary API config:', apiConfigError);
    }
  }

  if (!baseUrl || baseUrl.trim() === '') {
    const errorMsg = `CRITICAL ERROR: Base URL is empty after loading ${apiSourceType} API config.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Build URL with path and query parameters
  let apiPath = config.apiPath || '';
  const httpMethod = config.httpMethod || 'GET';

  // Replace path variables
  const pathVariableConfig = config.pathVariableConfig || {};

  for (const [varName, varConfig] of Object.entries(pathVariableConfig)) {
    const isSimpleFormat = typeof varConfig === 'string';
    const isEnabled = isSimpleFormat ? true : ((varConfig as any).enabled ?? true);
    const valueTemplate = isSimpleFormat ? varConfig : ((varConfig as any).value || '');

    if (isEnabled && valueTemplate) {
      let resolvedValue = valueTemplate as string;
      const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
      resolvedValue = resolvedValue.replace(valueVarRegex, (match, doubleBrace, dollarBrace) => {
        const variableName = doubleBrace || dollarBrace;
        const value = getValueByPath(contextData, variableName);
        if (value !== undefined && value !== null) {
          return String(value);
        }
        return match;
      });

      const pathVarPattern1 = `{${varName}}`;
      const pathVarPattern2 = `\${${varName}}`;

      if (apiPath.includes(pathVarPattern1)) {
        apiPath = apiPath.replace(pathVarPattern1, resolvedValue);
      } else if (apiPath.includes(pathVarPattern2)) {
        apiPath = apiPath.replace(pathVarPattern2, resolvedValue);
      }
    }
  }

  // Build query string
  const queryParameterConfig = config.queryParameterConfig || {};
  const odataParams = ['$filter', '$select', '$orderby', '$orderBy', '$expand', '$top', '$skip', '$count', '$search'];
  const regularParams: string[] = [];
  const odataParamParts: string[] = [];

  for (const [paramName, paramConfig] of Object.entries(queryParameterConfig)) {
    const config = paramConfig as any;
    if (config.enabled && config.value) {
      let paramValue = config.value;

      const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
      paramValue = paramValue.replace(valueVarRegex, (match: string, doubleBrace: string, dollarBrace: string) => {
        const variableName = doubleBrace || dollarBrace;
        const value = getValueByPath(contextData, variableName);
        if (value !== undefined && value !== null) {
          let rawValue = String(value);
          const isODataFilterParam = paramName.toLowerCase() === '$filter';
          if (isODataFilterParam) {
            rawValue = rawValue.replace(/[()]/g, '');
          }
          if (isODataFilterParam && rawValue.includes("'")) {
            rawValue = rawValue.replace(/'/g, "''");
          }
          return rawValue;
        }
        return match;
      });

      const isODataParam = odataParams.some(p => p.toLowerCase() === paramName.toLowerCase());
      if (isODataParam) {
        const encodedValue = paramValue.replace(/ /g, '%20').replace(/#/g, '%23');
        odataParamParts.push(`${paramName}=${encodedValue}`);
      } else {
        regularParams.push(`${encodeURIComponent(paramName)}=${encodeURIComponent(paramValue)}`);
      }
    }
  }

  const allParams = [...regularParams, ...odataParamParts];
  const queryString = allParams.join('&');
  const fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`;
  console.log('API endpoint URL:', httpMethod, fullUrl);

  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  // Handle request body
  let requestBodyContent = config.requestBodyTemplate || '';
  const requestBodyFieldMappings = config.requestBodyFieldMappings || [];

  if (requestBodyFieldMappings.length > 0 && requestBodyContent) {
    try {
      let requestBodyData = JSON.parse(requestBodyContent);

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
          } else if (dataType === 'datetime') {
            const dateValue = String(finalValue);
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}:00`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}T00:00:00`;
            } else {
              finalValue = dateValue;
            }
          } else if (dataType === 'zip_postal') {
            if (finalValue && typeof finalValue === 'string') {
              const cleaned = String(finalValue).replace(/\s+/g, '').toUpperCase();
              if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
                finalValue = `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
              } else if (/^\d{5}(-\d{4})?$/.test(cleaned)) {
                finalValue = cleaned.slice(0, 5);
              } else {
                finalValue = cleaned;
              }
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
    } catch (mappingError) {
      console.error('Error processing field mappings:', mappingError);
    }
  }

  const fetchOptions: any = {
    method: httpMethod,
    headers
  };

  if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent && requestBodyContent.trim() !== '') {
    fetchOptions.body = requestBodyContent;
  }

  const apiEndpointResponse = await fetch(fullUrl, fetchOptions);
  console.log('API endpoint response status:', apiEndpointResponse.status);

  if (!apiEndpointResponse.ok) {
    const errorText = await apiEndpointResponse.text();
    console.error('API endpoint call failed:', errorText);
    throw new Error(`API endpoint call failed with status ${apiEndpointResponse.status}: ${errorText}`);
  }

  const apiEndpointResponseText = await apiEndpointResponse.text();
  let apiEndpointResponseData = null;

  try {
    if (apiEndpointResponseText && apiEndpointResponseText.trim() !== '') {
      apiEndpointResponseData = JSON.parse(apiEndpointResponseText);
    } else {
      apiEndpointResponseData = { success: true, emptyResponse: true };
    }
  } catch (responseParseError) {
    console.warn('Could not parse API endpoint response as JSON:', responseParseError);
    apiEndpointResponseData = { rawResponse: apiEndpointResponseText };
  }

  // Process response data mappings
  const responseDataMappings = config.responseDataMappings || [];
  if (responseDataMappings.length > 0 && apiEndpointResponseData) {
    for (const mapping of responseDataMappings) {
      const responsePath = mapping.responsePath;
      const updatePath = mapping.updatePath || mapping.fieldName;

      if (!responsePath || !updatePath) {
        continue;
      }

      const extractedValue = getValueByPath(apiEndpointResponseData, responsePath);
      if (extractedValue !== undefined && extractedValue !== null) {
        const pathParts = updatePath.split(/[.\[\]]/).filter(Boolean);
        let current = contextData;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (current[part] === undefined || current[part] === null) {
            current[part] = {};
          }
          current = current[part];
        }
        const lastPart = pathParts[pathParts.length - 1];
        current[lastPart] = extractedValue;
        console.log(`Mapped ${responsePath} -> contextData.${updatePath}`);
      }
    }
  }

  return apiEndpointResponseData;
}
