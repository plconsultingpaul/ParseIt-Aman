import { getValueByPath } from "../utils.ts";
import { evaluateFunction, type FunctionLogic } from "../functionEvaluator.ts";

export async function executeApiEndpoint(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ stepOutput: any; responseData: any; resolvedRequestDetails: any; resolvedRequestBody: string }> {
  const config = step.config_json || {};

  let baseUrl = '';
  let authToken = '';
  const apiSourceType = config.apiSourceType || 'main';

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
      }
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
      }
    }
  }

  let apiPath = config.apiPath || '';
  const httpMethod = config.httpMethod || 'POST';

  const resolvedPathVariables: Record<string, any> = {};
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
      } else {
        value = configTemplate;
      }
    }
    if (value === undefined || value === null) {
      value = getValueByPath(contextData, variableName);
    }
    if (value !== undefined && value !== null) {
      resolvedPathVariables[variableName] = { template: pathMatch[0], resolvedValue: String(value) };
      apiPath = apiPath.replace(pathMatch[0], String(value));
    } else {
      resolvedPathVariables[variableName] = { template: pathMatch[0], resolvedValue: null, error: 'Could not resolve' };
    }
  }

  const queryParams = new URLSearchParams();
  const queryParameterConfig = config.queryParameterConfig || {};
  const resolvedQueryParams: Record<string, any> = {};

  for (const [paramName, paramConfig] of Object.entries(queryParameterConfig) as any) {
    if (paramConfig.enabled && paramConfig.value) {
      const originalTemplate = paramConfig.value;
      let paramValue = paramConfig.value;
      const variableResolutions: Record<string, any> = {};
      const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
      paramValue = paramConfig.value.replace(valueVarRegex, (match: string, doubleBrace: string, dollarBrace: string) => {
        const variableName = doubleBrace || dollarBrace;
        const value = getValueByPath(contextData, variableName);
        if (value !== undefined && value !== null) {
          let rawValue = String(value);
          const isODataFilterParam = paramName.toLowerCase() === '$filter';
          if (isODataFilterParam && rawValue.includes(')(')) {
            rawValue = rawValue.replace(/\)\(/g, ')-(');
          }
          if (isODataFilterParam && rawValue.includes("'")) {
            rawValue = rawValue.replace(/'/g, "''");
          }
          variableResolutions[match] = rawValue;
          return rawValue;
        }
        variableResolutions[match] = null;
        return match;
      });
      resolvedQueryParams[paramName] = { template: originalTemplate, resolvedValue: paramValue, variables: variableResolutions };
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
      resolvedQueryParams[customParam.key] = { template: customParam.value, resolvedValue: paramValue, variables: {} };
      queryParams.append(customParam.key, paramValue);
    }
  }

  const queryString = queryParams.toString();
  const fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  const decodedQueryString = decodeURIComponent(queryString);
  const apiRequestDetails = {
    url: fullUrl,
    urlDecoded: `${baseUrl}${apiPath}${decodedQueryString ? '?' + decodedQueryString : ''}`,
    method: httpMethod,
    baseUrl: baseUrl,
    apiPath: apiPath,
    queryString: queryString,
    queryStringDecoded: decodedQueryString,
    resolvedPathVariables: Object.keys(resolvedPathVariables).length > 0 ? resolvedPathVariables : undefined,
    resolvedQueryParams: Object.keys(resolvedQueryParams).length > 0 ? resolvedQueryParams : undefined,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authToken ? `Bearer ${authToken.substring(0, 10)}...` : 'MISSING'
    }
  };

  let requestBodyContent = config.requestBodyTemplate || '';
  const requestBodyFieldMappings = config.requestBodyFieldMappings || [];

  if (requestBodyFieldMappings.length > 0) {
    try {
      let requestBodyData = requestBodyContent ? JSON.parse(requestBodyContent) : {};

      const functionMappings = requestBodyFieldMappings.filter((m: any) => m.type === 'function' && m.functionId);
      let functionsById: Record<string, any> = {};
      if (functionMappings.length > 0) {
        const functionIds = [...new Set(functionMappings.map((m: any) => m.functionId))];
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
          console.log(`[FieldMapping] field=${fieldPath} type=variable var=${variableName} resolved=${JSON.stringify(finalValue)}`);
        } else if (mappingType === 'function' && mapping.functionId) {
          const func = functionsById[mapping.functionId];
          if (func?.function_logic) {
            try {
              const evalData = contextData.extractedData || contextData;
              console.log(`[FieldMapping] field=${fieldPath} type=function funcName="${func.function_name}" funcType=${func.function_logic?.type}`);
              finalValue = evaluateFunction(func.function_logic as FunctionLogic, evalData);
              console.log(`[FieldMapping] field=${fieldPath} function result=${JSON.stringify(finalValue)}`);
            } catch (funcErr) {
              console.error(`Error evaluating function for field "${fieldPath}":`, funcErr);
              continue;
            }
          } else {
            continue;
          }
        } else {
          continue;
        }

        if (finalValue !== undefined && finalValue !== null) {
          const beforeCoerce = finalValue;
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
          const previous = current[lastPart];
          if (previous !== undefined && previous !== null && previous !== '' && JSON.stringify(previous) !== JSON.stringify(finalValue)) {
            console.log(`[FieldMapping] OVERWRITE field=${fieldPath} previous=${JSON.stringify(previous)} -> new=${JSON.stringify(finalValue)} (dataType=${dataType}, raw=${JSON.stringify(beforeCoerce)})`);
          } else {
            console.log(`[FieldMapping] SET field=${fieldPath} value=${JSON.stringify(finalValue)} (dataType=${dataType}, raw=${JSON.stringify(beforeCoerce)})`);
          }
          current[lastPart] = finalValue;
        } else {
          console.log(`[FieldMapping] SKIP field=${fieldPath} finalValue=${JSON.stringify(finalValue)} (null/undefined)`);
        }
      }

      requestBodyContent = JSON.stringify(requestBodyData);
    } catch (mappingError) {
      console.error('Error processing field mappings:', mappingError);
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
      }
    } catch (e) {
      console.warn('Could not wrap body in array - invalid JSON:', e);
    }
  }

  const fetchOptions: any = { method: httpMethod, headers };
  if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent && requestBodyContent.trim() !== '') {
    fetchOptions.body = requestBodyContent;
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(fullUrl, fetchOptions);
  } catch (fetchError: any) {
    const error: any = new Error(`${fetchError.message}`);
    error.outputData = { requestAttempted: apiRequestDetails };
    error.resolvedRequestDetails = apiRequestDetails;
    error.resolvedRequestBody = requestBodyContent;
    throw error;
  }

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
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

  let mappingsToProcess: any[] = [];
  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    mappingsToProcess = config.responseDataMappings;
  } else if (config.responsePath && config.updateJsonPath) {
    mappingsToProcess = [{ responsePath: config.responsePath, updatePath: config.updateJsonPath }];
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
        }
      }
    }
  }

  const extractedValues: any[] = [];
  if (mappingsToProcess.length > 0) {
    for (const mapping of mappingsToProcess) {
      if (!mapping.responsePath || !mapping.updatePath) continue;
      try {
        let extractedValue = getValueByPath(unwrappedResponseData, mapping.responsePath);

        if (extractedValue === null && unwrappedResponseData !== responseData) {
          extractedValue = getValueByPath(responseData, mapping.responsePath);
        }

        if (extractedValue === null || extractedValue === undefined) {
          for (const key of Object.keys(responseData || {})) {
            const val = responseData[key];
            if (Array.isArray(val) && val.length > 0) {
              const nestedValue = getValueByPath(val[0], mapping.responsePath);
              if (nestedValue !== null && nestedValue !== undefined) {
                extractedValue = nestedValue;
                break;
              }
            }
          }
        }

        const hasDefault = mapping.defaultValue !== undefined && mapping.defaultValue !== null && mapping.defaultValue !== '';
        if ((extractedValue === undefined || extractedValue === null || extractedValue === '') && hasDefault) {
          extractedValue = mapping.defaultValue;
        }

        if (extractedValue !== undefined && extractedValue !== null) {
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
          contextData[lastPart] = extractedValue;

          if (!contextData.response) contextData.response = {};
          let respCurrent = contextData.response;
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!respCurrent[part]) respCurrent[part] = {};
            respCurrent = respCurrent[part];
          }
          respCurrent[pathParts[pathParts.length - 1]] = extractedValue;

          extractedValues.push({ path: mapping.responsePath, updatePath: mapping.updatePath, value: extractedValue, usedDefault: hasDefault && (getValueByPath(unwrappedResponseData, mapping.responsePath) === null || getValueByPath(unwrappedResponseData, mapping.responsePath) === undefined || getValueByPath(unwrappedResponseData, mapping.responsePath) === '') });
        }
      } catch (extractError) {
        console.error(`[ApiEndpoint] Failed to process mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError);
      }
    }
  }

  const stepOutput = {
    url: fullUrl,
    urlDecoded: `${baseUrl}${apiPath}${decodedQueryString ? '?' + decodedQueryString : ''}`,
    method: httpMethod,
    resolvedPathVariables: Object.keys(resolvedPathVariables).length > 0 ? resolvedPathVariables : undefined,
    resolvedQueryParams: Object.keys(resolvedQueryParams).length > 0 ? resolvedQueryParams : undefined,
    responseStatus: apiResponse.status,
    extractedValues,
    updatedPaths: mappingsToProcess.map((m: any) => m.updatePath)
  };

  return { stepOutput, responseData, resolvedRequestDetails: apiRequestDetails, resolvedRequestBody: requestBodyContent };
}
