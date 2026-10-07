import { getValueByPath, resolveAuthConfigLogin, persistAuthTokenToContext } from "./utils.ts";
import { evaluateFunction, type FunctionLogic } from "./functionEvaluator.ts";

async function fetchCompanyTimezone(supabaseUrl: string, supabaseServiceKey: string): Promise<string> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/company_branding?select=timezone&order=updated_at.desc&limit=1`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows?.[0]?.timezone) return rows[0].timezone;
    }
  } catch (err) {
    console.warn('[CompanyTimezone] Failed to fetch, defaulting to UTC:', err);
  }
  return 'UTC';
}

export async function executeApiEndpoint(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ stepOutput: any; responseData: any; resolvedRequestDetails: any; resolvedRequestBody: string }> {
  const config = step.config_json || {};
  const companyTimezone = await fetchCompanyTimezone(supabaseUrl, supabaseServiceKey);

  let baseUrl = '';
  let authToken = '';
  let authLoginData: any = null;
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

  if ((apiSourceType === 'main' || apiSourceType === 'secondary') && config.authConfigId) {
    const resolved = await resolveAuthConfigLogin(supabaseUrl, supabaseServiceKey, config.authConfigId);
    authToken = resolved.authToken;
    authLoginData = resolved.authLoginData;
    console.log(`[apiEndpoint auth] override login OK. tokenLen=${authToken.length}`);
  } else if (apiSourceType === 'auth_config' && config.authConfigId) {
    const resolved = await resolveAuthConfigLogin(supabaseUrl, supabaseServiceKey, config.authConfigId);
    authToken = resolved.authToken;
    authLoginData = resolved.authLoginData;
    console.log(`[apiEndpoint auth] auth_config login OK. tokenLen=${authToken.length}`);
  }

  if (authToken) {
    persistAuthTokenToContext(contextData, authToken, authLoginData);
  }

  if (apiSourceType === 'auth_config') {
    const responseData = authLoginData;
    const mappingsToProcess: any[] = Array.isArray(config.responseDataMappings) ? config.responseDataMappings : [];
    const extractedValues: any[] = [];
    for (const mapping of mappingsToProcess) {
      if (!mapping.responsePath || !mapping.updatePath) continue;
      try {
        let extractedValue = getValueByPath(responseData, mapping.responsePath);
        const hasDefault = mapping.defaultValue !== undefined && mapping.defaultValue !== null && mapping.defaultValue !== '';
        if ((extractedValue === undefined || extractedValue === null || extractedValue === '') && hasDefault) {
          extractedValue = mapping.defaultValue;
        }
        if (extractedValue !== undefined && extractedValue !== null) {
          const pathParts = mapping.updatePath.split(/[.\[\]]/).filter(Boolean);
          let current = contextData.extractedData || contextData;
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!(part in current)) current[part] = {};
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
          extractedValues.push({ path: mapping.responsePath, updatePath: mapping.updatePath, value: extractedValue, usedDefault: hasDefault && (getValueByPath(responseData, mapping.responsePath) === null || getValueByPath(responseData, mapping.responsePath) === undefined || getValueByPath(responseData, mapping.responsePath) === '') });
        }
      } catch (extractError) {
        console.error(`[ApiEndpoint] auth_config mapping failed "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError);
      }
    }

    const maskedToken = authToken ? `${authToken.substring(0, 4)}...${authToken.substring(authToken.length - 4)}` : '';
    const stepOutput = {
      mode: 'auth_config_login_only',
      authConfigId: config.authConfigId,
      tokenLength: authToken.length,
      tokenMasked: maskedToken,
      extractedValues,
      updatedPaths: mappingsToProcess.map((m: any) => m.updatePath)
    };
    const resolvedRequestDetails = {
      mode: 'auth_config_login_only',
      authConfigId: config.authConfigId,
      note: 'API Endpoint step short-circuited: performed Auth Config login only; no downstream HTTP request was made.'
    };
    return { stepOutput, responseData, resolvedRequestDetails, resolvedRequestBody: '' };
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

  const additionalHeadersConfig: Record<string, string> = config.additionalHeaders || {};
  const customHeaderKeys = Object.keys(additionalHeadersConfig).map((k) => k.toLowerCase());
  const hasCustomAuthHeader = customHeaderKeys.some(
    (k) => k === 'authorization' || k === 'access-token' || k === 'x-access-token' || k === 'x-auth-token' || k === 'token'
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (authToken && !hasCustomAuthHeader) {
    headers['Authorization'] = `Bearer ${authToken}`;
  } else if (authToken && hasCustomAuthHeader) {
    console.log(`[apiEndpoint headers] Custom auth-style header present; suppressing built-in Authorization header. Custom keys: ${customHeaderKeys.join(', ')}`);
  }

  const resolvedCustomHeaders: Record<string, { template: string; resolved: string }> = {};
  if (Object.keys(additionalHeadersConfig).length > 0) {
    const existingResponse = (contextData.response && typeof contextData.response === 'object') ? contextData.response : {};
    const loginDataObj = (authLoginData && typeof authLoginData === 'object') ? authLoginData : {};
    const headerContext: any = {
      ...contextData,
      ...loginDataObj,
      ...(authToken ? { access_token: authToken } : {}),
      authToken,
      authResponse: authLoginData,
      response: authToken
        ? { ...existingResponse, ...loginDataObj, access_token: authToken }
        : existingResponse,
    };
    for (const [key, value] of Object.entries(additionalHeadersConfig)) {
      if (key.toLowerCase() === 'content-type') continue;
      const rawValue = String(value ?? '');
      let resolvedHeaderValue = rawValue;
      const headerVarRegex = /\{\{([^}]+)\}\}/g;
      let hm: RegExpExecArray | null;
      const unresolved: string[] = [];
      while ((hm = headerVarRegex.exec(rawValue)) !== null) {
        const varPath = hm[1];
        const varValue = getValueByPath(headerContext, varPath);
        if (varValue !== undefined && varValue !== null) {
          const stringified = (typeof varValue === 'object') ? JSON.stringify(varValue) : String(varValue);
          resolvedHeaderValue = resolvedHeaderValue.replace(hm[0], stringified);
        } else {
          unresolved.push(varPath);
        }
      }
      if (unresolved.length > 0) {
        console.warn(`[apiEndpoint headers] Header "${key}" has unresolved placeholders: ${unresolved.join(', ')}`);
      }
      headers[key] = resolvedHeaderValue;
      resolvedCustomHeaders[key] = { template: rawValue, resolved: resolvedHeaderValue };
    }
  }

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
      'Authorization': authToken && !hasCustomAuthHeader ? `Bearer ${authToken.substring(0, 10)}...` : (authToken && hasCustomAuthHeader ? 'SUPPRESSED (custom auth header set)' : 'MISSING'),
      ...(Object.keys(resolvedCustomHeaders).length > 0 ? { _customHeaders: resolvedCustomHeaders } : {})
    }
  };

  let requestBodyContent = config.requestBodyTemplate || '';
  const requestBodyFieldMappings = config.requestBodyFieldMappings || [];

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

  if (requestBodyFieldMappings.length > 0) {
    try {
      let requestBodyData = requestBodyContent ? JSON.parse(requestBodyContent) : {};

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
              finalValue = evaluateFunction(func.function_logic as FunctionLogic, evalData, companyTimezone);
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
            } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateValue)) {
              finalValue = dateValue;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}T00:00:00`;
            } else {
              finalValue = dateValue;
            }
          } else if (typeof finalValue !== 'object') {
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

  const _collectField = String(config.collectRowsIntoField || '').trim();
  if (_collectField && requestBodyContent?.trim()) {
    const arraySourcePath = String(config.arraySourcePath || '').trim().replace(/^\{\{|\}\}$/g, '');
    let sourceArray: any[] | null = null;
    if (arraySourcePath) {
      const resolved = getValueByPath(contextData, arraySourcePath);
      if (Array.isArray(resolved)) sourceArray = resolved;
    }
    if (sourceArray) {
      let baseBody: any;
      try {
        baseBody = JSON.parse(requestBodyContent);
      } catch (e) {
        console.error('[collectRowsIntoField] base body did not parse as JSON:', e);
        baseBody = {};
      }
      const rowMappings = requestBodyFieldMappings.filter((m: any) =>
        typeof m.fieldName === 'string' && (m.fieldName === _collectField || m.fieldName.startsWith(_collectField + '.'))
      );
      const rowObjects: any[] = [];
      for (let rowIdx = 0; rowIdx < sourceArray.length; rowIdx++) {
        const row = sourceArray[rowIdx] || {};
        const rowLookup = (path: string) => {
          const trimmed = path.trim();
          if (row && typeof row === 'object' && trimmed in row) return (row as any)[trimmed];
          return getValueByPath(contextData, trimmed);
        };
        const rowObj: any = {};
        for (const mapping of rowMappings) {
          const fullPath = mapping.fieldName;
          const relPath = fullPath === _collectField ? '' : fullPath.slice(_collectField.length + 1);
          const mappingType = mapping.type;
          const mappingValue = mapping.value;
          const dataType = mapping.dataType || 'string';
          let finalValue;
          if (mappingType === 'hardcoded') {
            finalValue = mappingValue;
          } else if (mappingType === 'variable') {
            const variableName = String(mappingValue).replace(/^\{\{|\}\}$/g, '');
            finalValue = rowLookup(variableName);
            console.log(`[collectRowsIntoField] row=${rowIdx} field=${fullPath} var=${variableName} resolved=${JSON.stringify(finalValue)}`);
          } else if (mappingType === 'function' && mapping.functionId) {
            const func = functionsById[mapping.functionId];
            if (func?.function_logic) {
              try {
                const evalData = { ...(contextData.extractedData || {}), ...row };
                finalValue = evaluateFunction(func.function_logic as FunctionLogic, evalData, companyTimezone);
              } catch (funcErr) {
                console.error(`[collectRowsIntoField] function error row=${rowIdx} field=${fullPath}:`, funcErr);
                continue;
              }
            } else {
              continue;
            }
          } else {
            continue;
          }
          if (finalValue === undefined || finalValue === null) continue;
          if (dataType === 'integer') finalValue = parseInt(String(finalValue));
          else if (dataType === 'number') finalValue = parseFloat(String(finalValue));
          else if (dataType === 'boolean') finalValue = String(finalValue).toLowerCase() === 'true';
          else if (dataType === 'date') {
            const dv = String(finalValue);
            const m = dv.match(/^(\d{4}-\d{2}-\d{2})/);
            finalValue = m ? m[1] : dv;
          } else if (dataType === 'datetime') {
            const dv = String(finalValue);
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dv)) finalValue = `${dv}:00`;
            else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dv)) finalValue = dv;
            else if (/^\d{4}-\d{2}-\d{2}$/.test(dv)) finalValue = `${dv}T00:00:00`;
            else finalValue = dv;
          } else if (typeof finalValue !== 'object') {
            finalValue = String(finalValue);
          }
          if (!relPath) continue;
          const parts = relPath.split('.');
          let cur = rowObj;
          for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
            cur = cur[p];
          }
          cur[parts[parts.length - 1]] = finalValue;
        }
        rowObjects.push(rowObj);
      }
      const targetParts = _collectField.split('.');
      let target = baseBody;
      for (let i = 0; i < targetParts.length - 1; i++) {
        const p = targetParts[i];
        if (!target[p] || typeof target[p] !== 'object') target[p] = {};
        target = target[p];
      }
      target[targetParts[targetParts.length - 1]] = rowObjects;
      requestBodyContent = JSON.stringify(baseBody);
      console.log(`[collectRowsIntoField] built single body with ${rowObjects.length} row(s) into "${_collectField}"`);
    } else {
      console.warn(`[collectRowsIntoField] arraySourcePath="${arraySourcePath}" did not resolve to an array; skipping collect mode`);
    }
  } else if (config.wrapBodyInArray && requestBodyContent?.trim()) {
    const arraySourcePath = (config.arraySourcePath || '').trim();
    let sourceArray: any[] | null = null;
    if (arraySourcePath) {
      const resolved = getValueByPath(contextData, arraySourcePath);
      if (Array.isArray(resolved)) {
        sourceArray = resolved;
      } else {
        console.warn(`[wrapBodyInArray] arraySourcePath="${arraySourcePath}" did not resolve to an array (got ${typeof resolved}); falling back to single-body wrap`);
      }
    }

    if (sourceArray) {
      const baseTemplate = config.requestBodyTemplate || '';
      const perRowBodies: any[] = [];
      console.log(`[wrapBodyInArray] iterating ${sourceArray.length} rows from "${arraySourcePath}"`);

      for (let rowIdx = 0; rowIdx < sourceArray.length; rowIdx++) {
        const row = sourceArray[rowIdx] || {};
        const rowLookup = (path: string) => {
          const trimmed = path.trim();
          if (trimmed in row) return (row as any)[trimmed];
          return getValueByPath(contextData, trimmed);
        };

        let rowBodyStr = baseTemplate.replace(/\{\{([^}]+)\}\}/g, (match: string, path: string) => {
          const value = rowLookup(path);
          if (value !== null && value !== undefined) {
            return typeof value === 'object' ? JSON.stringify(value) : String(value);
          }
          return match;
        });

        let rowBodyData: any;
        try {
          rowBodyData = rowBodyStr ? JSON.parse(rowBodyStr) : {};
        } catch (e) {
          console.error(`[wrapBodyInArray] row ${rowIdx} template did not parse as JSON after substitution:`, e);
          continue;
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
            finalValue = rowLookup(variableName);
            console.log(`[FieldMapping] row=${rowIdx} field=${fieldPath} type=variable var=${variableName} resolved=${JSON.stringify(finalValue)}`);
          } else if (mappingType === 'function' && mapping.functionId) {
            const func = functionsById[mapping.functionId];
            if (func?.function_logic) {
              try {
                const evalData = { ...(contextData.extractedData || {}), ...row };
                console.log(`[FieldMapping] row=${rowIdx} field=${fieldPath} type=function funcName="${func.function_name}" funcType=${func.function_logic?.type}`);
                finalValue = evaluateFunction(func.function_logic as FunctionLogic, evalData, companyTimezone);
                console.log(`[FieldMapping] row=${rowIdx} field=${fieldPath} function result=${JSON.stringify(finalValue)}`);
              } catch (funcErr) {
                console.error(`Error evaluating function for field "${fieldPath}" row ${rowIdx}:`, funcErr);
                continue;
              }
            } else {
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
              } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateValue)) {
                finalValue = dateValue;
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                finalValue = `${dateValue}T00:00:00`;
              } else {
                finalValue = dateValue;
              }
            } else if (typeof finalValue !== 'object') {
              finalValue = String(finalValue);
            }

            const pathParts = fieldPath.split('.');
            let current = rowBodyData;
            for (let i = 0; i < pathParts.length - 1; i++) {
              const part = pathParts[i];
              if (!current[part]) current[part] = {};
              current = current[part];
            }
            current[pathParts[pathParts.length - 1]] = finalValue;
            console.log(`[FieldMapping] row=${rowIdx} SET field=${fieldPath} value=${JSON.stringify(finalValue)} (dataType=${dataType})`);
          } else {
            console.log(`[FieldMapping] row=${rowIdx} SKIP field=${fieldPath} (null/undefined)`);
          }
        }

        perRowBodies.push(rowBodyData);
      }

      requestBodyContent = JSON.stringify(perRowBodies);
    } else {
      try {
        const parsedBody = JSON.parse(requestBodyContent);
        if (!Array.isArray(parsedBody)) {
          let explodeKey: string | null = null;
          if (parsedBody && typeof parsedBody === 'object') {
            for (const k of Object.keys(parsedBody)) {
              const v = (parsedBody as any)[k];
              if (Array.isArray(v) && v.length > 0 && v.every((r: any) => r !== null && typeof r === 'object' && !Array.isArray(r))) {
                explodeKey = k;
                break;
              }
            }
          }
          if (explodeKey) {
            const rows = (parsedBody as any)[explodeKey] as any[];
            const exploded = rows.map((row) => ({ ...(parsedBody as any), [explodeKey!]: row }));
            requestBodyContent = JSON.stringify(exploded);
            console.log(`[wrapBodyInArray] exploded by "${explodeKey}" into ${exploded.length} row(s)`);
          } else {
            requestBodyContent = JSON.stringify([parsedBody]);
          }
        }
      } catch (e) {
        console.warn('Could not wrap body in array - invalid JSON:', e);
      }
    }
  }

  console.log('[ApiEndpoint] final requestBody (length ' + (requestBodyContent?.length || 0) + '):', requestBodyContent);

  const fetchOptions: any = { method: httpMethod, headers };
  if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent && requestBodyContent.trim() !== '') {
    fetchOptions.body = requestBodyContent;
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(fullUrl, fetchOptions);
  } catch (fetchError: any) {
    const error: any = new Error(`${fetchError.message}`);
    error.outputData = { requestAttempted: apiRequestDetails, requestBody: requestBodyContent };
    error.resolvedRequestDetails = apiRequestDetails;
    error.resolvedRequestBody = requestBodyContent;
    throw error;
  }

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    const error: any = new Error(`API endpoint call failed with status ${apiResponse.status}: ${errorText}`);
    error.outputData = {
      requestAttempted: apiRequestDetails,
      requestBody: requestBodyContent,
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
