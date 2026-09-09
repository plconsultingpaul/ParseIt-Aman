// steps/api.ts - API call and endpoint execution logic

import { getValueByPath, escapeSingleQuotesForOData } from "../utils.ts";

export async function executeApiCall(step: any, contextData: any): Promise<{ responseData: any; resolvedRequestBody: string }> {
  console.log('🌐 === EXECUTING API CALL STEP ===');
  const config = step.config_json || {};
  console.log('🔧 API call config:', JSON.stringify(config, null, 2));

  let url = config.url || '';
  console.log('🔗 Original URL:', url);

  // URL placeholder replacement
  const urlPlaceholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  const replacements = [];

  while ((match = urlPlaceholderRegex.exec(url)) !== null) {
    const placeholder = match[0];
    const path = match[1];
    console.log(`🔍 Found URL placeholder: ${placeholder} with path: ${path}`);
    const value = getValueByPath(contextData, path);
    replacements.push({ placeholder, path, value });
    console.log(`🔍 Path "${path}" resolved to:`, value);
  }

  for (const replacement of replacements) {
    let rawValue = String(replacement.value || '');

    // Apply OData escaping if enabled
    if (config.escapeSingleQuotesInBody && (rawValue.includes("'") || rawValue.includes("(") || rawValue.includes(")"))) {
      const beforeEscape = rawValue;
      rawValue = escapeSingleQuotesForOData(rawValue);
      console.log(`🔄 Escaped for OData in URL: "${beforeEscape}" → "${rawValue}"`);
    }

    const encodedValue = encodeURIComponent(rawValue);
    const placeholderEscaped = replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    url = url.replace(new RegExp(placeholderEscaped, 'g'), encodedValue);
    console.log(`🔄 Replaced ${replacement.placeholder} with: ${rawValue}`);
  }

  console.log('🔗 Final URL:', url);

  // Request body placeholder replacement
  let requestBody = config.requestBody || '';
  console.log('📄 Original request body template:', requestBody);

  const bodyPlaceholderRegex = /\{\{([^}]+)\}\}/g;
  let bodyMatch;
  const bodyReplacements = [];

  while ((bodyMatch = bodyPlaceholderRegex.exec(requestBody)) !== null) {
    const placeholder = bodyMatch[0];
    const path = bodyMatch[1];
    console.log(`🔍 Found request body placeholder: ${placeholder} with path: ${path}`);

    if (path === 'extractedData' || path === 'orders') {
      console.log(`⏭️ Skipping special placeholder: ${placeholder}`);
      continue;
    }

    const value = getValueByPath(contextData, path);
    bodyReplacements.push({ placeholder, path, value });
    console.log(`🔍 Path "${path}" resolved to:`, value);
  }

  for (const replacement of bodyReplacements) {
    let rawValue = String(replacement.value || '');

    // Apply OData escaping if enabled
    if (config.escapeSingleQuotesInBody && (rawValue.includes("'") || rawValue.includes("(") || rawValue.includes(")"))) {
      const beforeEscape = rawValue;
      rawValue = escapeSingleQuotesForOData(rawValue);
      console.log(`🔄 Escaped for OData: "${beforeEscape}" → "${rawValue}"`);
    }

    const escapedValue = rawValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    requestBody = requestBody.replace(new RegExp(replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), escapedValue);
    console.log(`🔄 Replaced ${replacement.placeholder} with: ${rawValue}`);
  }

  // Handle {{extractedData}} placeholder
  if (requestBody.includes('{{extractedData}}')) {
    console.log('🔧 Found {{extractedData}} placeholder - handling as JSON object');
    if (contextData.extractedData && typeof contextData.extractedData === 'object') {
      const stringifiedData = JSON.stringify(contextData.extractedData);
      requestBody = requestBody.replace(/\{\{extractedData\}\}/g, stringifiedData);
      console.log('✅ Replaced {{extractedData}} with enriched extracted data object');
    } else if (contextData.originalExtractedData && typeof contextData.originalExtractedData === 'string') {
      requestBody = requestBody.replace(/\{\{extractedData\}\}/g, contextData.originalExtractedData);
      console.log('⚠️ Fallback: Replaced {{extractedData}} with original extracted data string');
    }
  }

  // Handle {{orders}} placeholder
  if (requestBody.includes('{{orders}}')) {
    console.log('🔧 Found {{orders}} placeholder - handling as JSON array');
    if (contextData.orders && Array.isArray(contextData.orders)) {
      requestBody = requestBody.replace(/\{\{orders\}\}/g, JSON.stringify(contextData.orders));
      console.log('✅ Replaced {{orders}} with stringified orders array');
    }
  }

  console.log('📄 Final request body:', requestBody);

  // Make API call
  const method = (config.method || 'POST').toUpperCase();
  console.log('🚀 Making API call...', method, url);
  const fetchOptions: any = {
    method,
    headers: config.headers || {}
  };

  if (method !== 'GET' && requestBody && requestBody.trim() !== '') {
    fetchOptions.body = requestBody;
    console.log('📄 Including request body for', method, 'request');
  } else if (method === 'GET') {
    console.log('🔍 GET request - no body included');
  }

  const apiResponse = await fetch(url, fetchOptions);
  console.log('📊 API response status:', apiResponse.status);
  console.log('📊 API response ok:', apiResponse.ok);

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    console.error('❌ API call failed:', errorText);
    throw new Error(`API call failed with status ${apiResponse.status}: ${errorText}`);
  }

  const responseText = await apiResponse.text();
  console.log('📏 API response length:', responseText.length);
  console.log('📄 API response preview:', responseText.substring(0, 200));

  if (!responseText || responseText.trim() === '') {
    console.error('❌ API returned empty response');
    throw new Error('API returned empty response body');
  }

  let responseData;
  try {
    responseData = JSON.parse(responseText);
    console.log('✅ API response parsed successfully');
  } catch (responseParseError) {
    console.error('❌ Failed to parse API response:', responseParseError);
    console.error('📄 Problematic response:', responseText);
    throw new Error(`API response is not valid JSON: ${responseParseError instanceof Error ? responseParseError.message : 'Unknown error'}`);
  }

  // Process response data mappings
  let mappingsToProcess = [];
  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    mappingsToProcess = config.responseDataMappings;
    console.log('📋 Using new format: processing', mappingsToProcess.length, 'mapping(s)');
  } else if (config.responseDataPath && config.updateJsonPath) {
    mappingsToProcess = [{
      responsePath: config.responseDataPath,
      updatePath: config.updateJsonPath
    }];
    console.log('📋 Using old format: converted to single mapping');
  }

  if (mappingsToProcess.length > 0) {
    console.log('🔄 === EXTRACTING DATA FROM API RESPONSE ===');
    for (const mapping of mappingsToProcess) {
      const responsePath = mapping.responsePath;
      const updatePath = mapping.updatePath || mapping.fieldName;

      if (!responsePath || !updatePath) {
        console.warn('⚠️ Skipping invalid mapping:', mapping);
        continue;
      }

      console.log(`🔍 Extracting from response path: ${responsePath}`);
      const extractedValue = getValueByPath(responseData, responsePath, false);

      if (extractedValue !== undefined && extractedValue !== null) {
        console.log(`✅ Extracted value: ${JSON.stringify(extractedValue)}`);
        console.log(`🔄 Updating contextData.${updatePath} with extracted value`);

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
        console.log(`✅ Updated contextData.${updatePath} = ${JSON.stringify(extractedValue)}`);
      } else {
        console.warn(`⚠️ Path "${responsePath}" not found in API response`);
      }
    }
  } else {
    console.log('ℹ️ No response data mappings configured for this API call');
  }

  return { responseData, resolvedRequestBody: requestBody };
}

export async function executeApiEndpoint(step: any, contextData: any, supabaseUrl: string, supabaseServiceKey: string): Promise<any> {
  console.log('🌐 === EXECUTING API ENDPOINT STEP ===');
  const config = step.config_json || {};
  console.log('🔧 API endpoint config:', JSON.stringify(config, null, 2));

  let baseUrl = '';
  let authToken = '';

  const apiSourceType = config.apiSourceType || 'main';
  console.log('📋 API Source Type:', apiSourceType);

  if (apiSourceType === 'main') {
    try {
      console.log('🔍 Fetching main API config from api_settings table...');
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
          console.log('✅ Loaded main API config');
          console.log('🔗 Base URL assigned:', baseUrl ? baseUrl : 'EMPTY');
          console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
        }
      }
    } catch (apiConfigError) {
      console.error('❌ Failed to load main API config:', apiConfigError);
    }
  } else if (apiSourceType === 'secondary' && config.secondaryApiId) {
    try {
      console.log('🔍 Fetching secondary API config from secondary_api_configs table...');
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
          console.log('✅ Loaded secondary API config:', secondaryApiConfig.name);
          console.log('🔗 Base URL assigned:', baseUrl ? baseUrl : 'EMPTY');
        }
      }
    } catch (apiConfigError) {
      console.error('❌ Failed to load secondary API config:', apiConfigError);
    }
  }

  if (!baseUrl || baseUrl.trim() === '') {
    const errorMsg = `❌ CRITICAL ERROR: Base URL is empty after loading ${apiSourceType} API config.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log('✅ Base URL validation passed:', baseUrl);

  // Build URL with path and query parameters
  let apiPath = config.apiPath || '';
  const httpMethod = config.httpMethod || 'GET';

  // Replace path variables
  const pathVariableConfig = config.pathVariableConfig || {};
  console.log('🔧 Path variable config:', JSON.stringify(pathVariableConfig));

  for (const [varName, varConfig] of Object.entries(pathVariableConfig)) {
    const isSimpleFormat = typeof varConfig === 'string';
    const isEnabled = isSimpleFormat ? true : ((varConfig as any).enabled ?? true);
    const valueTemplate = isSimpleFormat ? varConfig : ((varConfig as any).value || '');

    console.log(`🔍 Processing path variable: ${varName}`);

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

  console.log('🔗 API path after path variable replacement:', apiPath);

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
  console.log('🔗 Full API Endpoint URL:', fullUrl);

  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  // Handle request body
  let requestBodyContent = config.requestBodyTemplate || '';
  const requestBodyFieldMappings = config.requestBodyFieldMappings || [];

  if (requestBodyFieldMappings.length > 0 && requestBodyContent) {
    console.log('🔧 Processing', requestBodyFieldMappings.length, 'field mappings');
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
              console.log(`🕐 Appended seconds to datetime field ${fieldPath}: ${dateValue} -> ${finalValue}`);
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}T00:00:00`;
              console.log(`🕐 Converted date-only to datetime field ${fieldPath}: ${dateValue} -> ${finalValue}`);
            } else {
              finalValue = dateValue;
            }
          } else if (dataType === 'zip_postal') {
            if (finalValue && typeof finalValue === 'string') {
              const cleaned = String(finalValue).replace(/\s+/g, '').toUpperCase();
              if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
                finalValue = `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
                console.log(`📮 Formatted Canadian postal code ${fieldPath}: ${cleaned} -> ${finalValue}`);
              } else if (/^\d{5}(-\d{4})?$/.test(cleaned)) {
                finalValue = cleaned.slice(0, 5);
                console.log(`📮 US zip code ${fieldPath}: ${cleaned} -> ${finalValue}`);
              } else {
                finalValue = cleaned;
                console.log(`📮 Cleaned zip/postal ${fieldPath}: ${finalValue}`);
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
      console.error('❌ Error processing field mappings:', mappingError);
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
  console.log('📥 API endpoint response status:', apiEndpointResponse.status);

  if (!apiEndpointResponse.ok) {
    const errorText = await apiEndpointResponse.text();
    console.error('❌ API endpoint call failed:', errorText);
    throw new Error(`API endpoint call failed with status ${apiEndpointResponse.status}: ${errorText}`);
  }

  const apiEndpointResponseText = await apiEndpointResponse.text();
  let apiEndpointResponseData = null;

  try {
    if (apiEndpointResponseText && apiEndpointResponseText.trim() !== '') {
      apiEndpointResponseData = JSON.parse(apiEndpointResponseText);
      console.log('✅ API endpoint response parsed successfully');
    } else {
      console.log('ℹ️ API endpoint returned empty response');
      apiEndpointResponseData = { success: true, emptyResponse: true };
    }
  } catch (responseParseError) {
    console.warn('⚠️ Could not parse API endpoint response as JSON:', responseParseError);
    apiEndpointResponseData = { rawResponse: apiEndpointResponseText };
  }

  // Process response data mappings
  const responseDataMappings = config.responseDataMappings || [];
  if (responseDataMappings.length > 0 && apiEndpointResponseData) {
    console.log('🔄 === EXTRACTING DATA FROM API RESPONSE ===');
    for (const mapping of responseDataMappings) {
      const responsePath = mapping.responsePath;
      const updatePath = mapping.updatePath || mapping.fieldName;

      if (!responsePath || !updatePath) {
        continue;
      }

      const extractedValue = getValueByPath(apiEndpointResponseData, responsePath);
      if (extractedValue !== undefined && extractedValue !== null) {
        console.log(`✅ Extracted value: ${JSON.stringify(extractedValue)}`);
        console.log(`🔄 Updating contextData.${updatePath}`);

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
        console.log(`✅ Updated contextData.${updatePath}`);
      }
    }
  }

  return apiEndpointResponseData;
}
