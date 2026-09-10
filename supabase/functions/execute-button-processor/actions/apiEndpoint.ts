import { getValueByPath, setValueByPath, replaceVariables } from "../utils/objectPaths.ts";
import { evaluateFunctionLogic } from "../utils/logic.ts";
import { applyResponseTransformation } from "../utils/responseTransformation.ts";

export async function executeApiEndpointSingle(
  config: any,
  contextData: any,
  baseUrl: string,
  authToken: string,
  rowData?: any,
  supabaseUrl?: string,
  supabaseServiceKey?: string
): Promise<any> {
  const effectiveContext = rowData ? { ...contextData, execute: { ...contextData.execute, ...rowData } } : contextData;

  let apiPath = replaceVariables(config.apiPath || '', effectiveContext);

  const pathVariableConfig = config.pathVariableConfig || {};
  for (const [varName, varConfig] of Object.entries(pathVariableConfig)) {
    const isEnabled = typeof varConfig === 'string' ? true : ((varConfig as any).enabled ?? true);
    const valueTemplate = typeof varConfig === 'string' ? varConfig : ((varConfig as any).value || '');

    if (isEnabled && valueTemplate) {
      const resolvedValue = replaceVariables(valueTemplate, effectiveContext);
      apiPath = apiPath.replace(`{${varName}}`, resolvedValue);
      apiPath = apiPath.replace(`\${${varName}}`, resolvedValue);
    }
  }

  const queryParameterConfig = config.queryParameterConfig || {};
  const queryParts: string[] = [];

  for (const [paramName, paramConfig] of Object.entries(queryParameterConfig)) {
    const cfg = paramConfig as any;
    if (cfg.enabled && cfg.value) {
      const paramValue = replaceVariables(cfg.value, effectiveContext);
      const odataParams = ['$filter', '$select', '$orderby', '$expand', '$top', '$skip', '$count'];
      const isOData = odataParams.some(p => p.toLowerCase() === paramName.toLowerCase());

      if (isOData) {
        queryParts.push(`${paramName}=${paramValue.replace(/ /g, '%20')}`);
      } else {
        queryParts.push(`${encodeURIComponent(paramName)}=${encodeURIComponent(paramValue)}`);
      }
    }
  }

  const queryString = queryParts.join('&');
  const fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`;

  const fieldMappings = config.requestBodyFieldMappings || [];
  let requestBodyContent = '';

  if (fieldMappings.length > 0) {
    try {
      let requestBodyData: any = {};
      if (config.requestBodyTemplate) {
        try {
          requestBodyData = JSON.parse(config.requestBodyTemplate);
        } catch {
          requestBodyData = {};
        }
      }

      const functionMappings = fieldMappings.filter((m: any) => m.type === 'function' && m.functionId);
      let functionsById: Record<string, any> = {};
      if (functionMappings.length > 0 && supabaseUrl && supabaseServiceKey) {
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

      for (const mapping of fieldMappings) {
        let finalValue;
        if (mapping.type === 'hardcoded') {
          finalValue = mapping.value;
        } else if (mapping.type === 'variable') {
          const variableName = mapping.value.replace(/^\{\{|\}\}$/g, '');
          finalValue = getValueByPath(effectiveContext.execute, variableName) ?? getValueByPath(effectiveContext, variableName);
        } else if (mapping.type === 'function' && mapping.functionId) {
          const func = functionsById[mapping.functionId];
          if (func && func.function_logic) {
            try {
              finalValue = evaluateFunctionLogic(func.function_logic, effectiveContext.execute || effectiveContext);
            } catch (funcErr) {
              console.error(`Error evaluating function for field "${mapping.fieldName}":`, funcErr);
              continue;
            }
          } else {
            console.warn(`Function not found for mapping "${mapping.fieldName}" with ID: ${mapping.functionId}`);
            continue;
          }
        }

        if (finalValue !== undefined && finalValue !== null) {
          if (mapping.dataType === 'integer') finalValue = parseInt(String(finalValue));
          else if (mapping.dataType === 'number' || mapping.dataType === 'decimal') finalValue = parseFloat(String(finalValue));
          else if (mapping.dataType === 'boolean') finalValue = String(finalValue).toLowerCase() === 'true' ? 'True' : 'False';
          else if (mapping.dataType === 'datetime') {
            const dateValue = String(finalValue).trim();
            if (dateValue === '') {
              finalValue = null;
            } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}:00`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              finalValue = `${dateValue}T00:00:00`;
            } else {
              finalValue = dateValue.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
            }
          }
          else if (typeof finalValue !== 'object') finalValue = String(finalValue);

          setValueByPath(requestBodyData, mapping.fieldName, finalValue);
        }
      }

      requestBodyContent = JSON.stringify(requestBodyData);
    } catch (e) {
      console.error('Error processing field mappings:', e);
    }
  } else if (config.requestBodyTemplate) {
    requestBodyContent = replaceVariables(config.requestBodyTemplate, effectiveContext);
  }

  const bodyBeforeWrap = requestBodyContent || null;
  const wrapFlag = config.wrapBodyInArray;

  if (config.wrapBodyInArray && requestBodyContent?.trim()) {
    try {
      const parsedBody = JSON.parse(requestBodyContent);
      if (!Array.isArray(parsedBody)) {
        requestBodyContent = JSON.stringify([parsedBody]);
      }
    } catch (e) {
      console.warn('[API_ENDPOINT_DEBUG] Could not wrap body in array - invalid JSON:', e);
    }
  }

  const bodyAfterWrap = requestBodyContent || null;

  const httpMethod = config.httpMethod || 'GET';
  const fetchOptions: RequestInit = {
    method: httpMethod,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    }
  };

  if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent?.trim()) {
    fetchOptions.body = requestBodyContent;
  }

  const debugInfo = {
    wrapBodyInArray: wrapFlag,
    arrayProcessingMode: config.arrayProcessingMode || 'none',
    bodyBeforeWrap,
    bodyAfterWrap,
    finalBodySent: fetchOptions.body || null,
    httpMethod,
    url: fullUrl,
    hasFieldMappings: (config.requestBodyFieldMappings || []).length > 0,
    hasRequestBodyTemplate: !!config.requestBodyTemplate
  };

  const response = await fetch(fullUrl, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`API endpoint call failed with status ${response.status}: ${errorText}`);
    (error as any).requestUrl = fullUrl;
    (error as any).requestBody = requestBodyContent || null;
    (error as any).httpMethod = httpMethod;
    (error as any).debugInfo = debugInfo;
    throw error;
  }

  const responseText = await response.text();
  let responseData = null;

  try {
    if (responseText?.trim()) {
      responseData = JSON.parse(responseText);
    } else {
      responseData = { success: true };
    }
  } catch {
    responseData = { rawResponse: responseText };
  }

  return { ...responseData, _apiEndpointDebug: debugInfo };
}

export async function executeApiEndpoint(step: any, contextData: any, supabaseUrl: string, supabaseServiceKey: string): Promise<any> {
  const config = step.config_json || {};

  let baseUrl = '';
  let authToken = '';
  const apiSourceType = config.apiSourceType || 'main';

  if (apiSourceType === 'main') {
    const response = await fetch(`${supabaseUrl}/rest/v1/api_settings?select=*`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    });
    if (response.ok) {
      const apis = await response.json();
      if (apis?.[0]) {
        baseUrl = apis[0].path || '';
        authToken = apis[0].password || '';
      }
    }
  } else if (apiSourceType === 'secondary' && config.secondaryApiId) {
    const response = await fetch(`${supabaseUrl}/rest/v1/secondary_api_configs?select=*&id=eq.${config.secondaryApiId}`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    });
    if (response.ok) {
      const apis = await response.json();
      if (apis?.[0]) {
        baseUrl = apis[0].base_url || '';
        authToken = apis[0].auth_token || '';
      }
    }
  }

  if (!baseUrl) {
    throw new Error('API base URL not configured');
  }

  const arrayProcessingMode = config.arrayProcessingMode || 'none';
  const arraySourceGroupId = config.arraySourceGroupId;
  const stopOnError = config.stopOnError !== false;

  if (arrayProcessingMode === 'single_array') {
    const adjustedFieldMappings = (config.requestBodyFieldMappings || []).map((mapping: any) => {
      const fieldName = mapping.fieldName || '';
      const strippedFieldName = fieldName.replace(/^\d+\./, '');
      return { ...mapping, fieldName: strippedFieldName };
    });

    const singleArrayConfig = {
      ...config,
      wrapBodyInArray: true,
      requestBodyFieldMappings: adjustedFieldMappings
    };

    const responseData = await executeApiEndpointSingle(singleArrayConfig, contextData, baseUrl, authToken, undefined, supabaseUrl, supabaseServiceKey);
    applyResponseMappings(config, responseData, contextData);
    return responseData;
  }

  if (arrayProcessingMode === 'conditional_hardcode') {
    const conditionalMappings = config.conditionalArrayMappings || [];
    const matchingMappings: any[] = [];
    for (let conditionIndex = 0; conditionIndex < conditionalMappings.length; conditionIndex++) {
      const condition = conditionalMappings[conditionIndex];
      const variablePath = condition.variable || '';
      let actualValue = getValueByPath(contextData.execute, variablePath);
      if (actualValue === null || actualValue === undefined) {
        actualValue = getValueByPath(contextData, variablePath);
      }

      const expectedValue = condition.expectedValue;
      const operator = condition.operator || 'equals';
      let conditionMet = false;

      const actualLower = String(actualValue).toLowerCase();
      const expectedLower = String(expectedValue).toLowerCase();
      switch (operator) {
        case 'equals':
          conditionMet = actualLower === expectedLower;
          break;
        case 'not_equals':
          conditionMet = actualLower !== expectedLower;
          break;
        case 'contains':
          conditionMet = String(actualValue).includes(String(expectedValue));
          break;
        case 'not_contains':
          conditionMet = !String(actualValue).includes(String(expectedValue));
          break;
        default:
          conditionMet = String(actualValue) === String(expectedValue);
      }
      if (conditionMet) {
        matchingMappings.push(condition.fieldMappings);
      }
    }
    if (matchingMappings.length === 0) {
      return {
        arrayProcessingMode: 'conditional_hardcode',
        totalConditions: conditionalMappings.length,
        matchedConditions: 0,
        skipped: true,
        message: 'No conditions matched'
      };
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < matchingMappings.length; i++) {
      const fieldMappings = matchingMappings[i];
      try {
        const conditionalConfig = {
          ...config,
          wrapBodyInArray: true,
          requestBodyFieldMappings: fieldMappings
        };

        const responseData = await executeApiEndpointSingle(conditionalConfig, contextData, baseUrl, authToken, undefined, supabaseUrl, supabaseServiceKey);
        results.push({ index: i, success: true, data: responseData });

        if (i === 0) {
          applyResponseMappings(config, responseData, contextData);
        }
      } catch (error) {
        console.error(`\u274C Conditional mapping ${i + 1} failed:`, error);
        errors.push({ index: i, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return {
      arrayProcessingMode: 'conditional_hardcode',
      totalConditions: conditionalMappings.length,
      matchedConditions: matchingMappings.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  if (arrayProcessingMode !== 'none' && arraySourceGroupId) {
    const groupResponse = await fetch(`${supabaseUrl}/rest/v1/execute_button_groups?id=eq.${arraySourceGroupId}`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    });

    let arrayFieldName = '';
    if (groupResponse.ok) {
      const groups = await groupResponse.json();
      if (groups?.[0]) {
        arrayFieldName = groups[0].array_field_name || groups[0].name;
      }
    }

    let arrayData = contextData.execute?.[arrayFieldName] || [];
    if (!Array.isArray(arrayData) || arrayData.length === 0) {
      let detectedFieldName = '';
      for (const [key, value] of Object.entries(contextData.execute || {})) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          arrayData = value;
          detectedFieldName = key;
          break;
        }
      }

      if (!Array.isArray(arrayData) || arrayData.length === 0) {
        const responseData = await executeApiEndpointSingle(config, contextData, baseUrl, authToken, undefined, supabaseUrl, supabaseServiceKey);
        applyResponseMappings(config, responseData, contextData);
        return responseData;
      }
    }

    if (arrayProcessingMode === 'loop') {
      const results: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < arrayData.length; i++) {
        const rowData = arrayData[i];
        try {
          const responseData = await executeApiEndpointSingle(config, contextData, baseUrl, authToken, rowData, supabaseUrl, supabaseServiceKey);
          results.push({ index: i, success: true, data: responseData });

          if (i === 0) {
            applyResponseMappings(config, responseData, contextData);
          }
        } catch (error) {
          console.error(`\u274C Row ${i + 1} failed:`, error);
          errors.push({ index: i, error: error instanceof Error ? error.message : 'Unknown error' });

          if (stopOnError) {
            throw new Error(`Array loop failed at row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      return {
        arrayProcessingMode: 'loop',
        totalRows: arrayData.length,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      };
    } else if (arrayProcessingMode === 'batch') {
      const fieldMappings = config.requestBodyFieldMappings || [];
      const arrayFieldMappings = fieldMappings.filter((m: any) => /^\d+\./.test(m.fieldName || ''));
      const topLevelMappings = fieldMappings.filter((m: any) => !/^\d+\./.test(m.fieldName || ''));
      if (arrayFieldMappings.length === 0 && topLevelMappings.length > 0) {
        const arrayRowFieldKeys = new Set<string>();
        if (arrayData.length > 0) {
          for (const key of Object.keys(arrayData[0])) {
            arrayRowFieldKeys.add(key);
          }
        }
        const rowLevelMappings = topLevelMappings.filter((m: any) => {
          if (m.type !== 'variable') return false;
          const variableName = (m.value || '').replace(/^\{\{|\}\}$/g, '').replace(/^execute\./, '');
          return arrayRowFieldKeys.has(variableName);
        });
        const nonRowMappings = topLevelMappings.filter((m: any) => {
          if (m.type !== 'variable') return true;
          const variableName = (m.value || '').replace(/^\{\{|\}\}$/g, '').replace(/^execute\./, '');
          return !arrayRowFieldKeys.has(variableName);
        });

        const arrayParentKey = rowLevelMappings.length > 0
          ? (rowLevelMappings[0].fieldName || '').split('.')[0]
          : '';

        const sharedRowMappings = arrayParentKey
          ? nonRowMappings.filter((m: any) => (m.fieldName || '').startsWith(arrayParentKey + '.'))
          : [];
        const outerOnlyMappings = arrayParentKey
          ? nonRowMappings.filter((m: any) => !(m.fieldName || '').startsWith(arrayParentKey + '.'))
          : nonRowMappings;
        const resolvedSharedFields: Record<string, any> = {};
        for (const mapping of sharedRowMappings) {
          let finalValue;
          if (mapping.type === 'hardcoded') {
            finalValue = mapping.value;
          } else if (mapping.type === 'variable') {
            const variableName = (mapping.value || '').replace(/^\{\{|\}\}$/g, '');
            finalValue = getValueByPath(contextData.execute, variableName) ?? getValueByPath(contextData, variableName);
          } else if (mapping.type === 'function' && mapping.functionId) {
            continue;
          }
          if (finalValue !== undefined && finalValue !== null) {
            if (mapping.dataType === 'integer') finalValue = parseInt(String(finalValue));
            else if (mapping.dataType === 'number' || mapping.dataType === 'decimal') finalValue = parseFloat(String(finalValue));
            else if (mapping.dataType === 'boolean') finalValue = String(finalValue).toLowerCase() === 'true' ? 'True' : 'False';
            else if (typeof finalValue !== 'object') finalValue = String(finalValue);
            const strippedFieldName = (mapping.fieldName || '').substring(arrayParentKey.length + 1);
            resolvedSharedFields[strippedFieldName] = finalValue;
          }
        }

        const rowResults: any[] = [];
        for (let i = 0; i < arrayData.length; i++) {
          const rowData = arrayData[i];
          const rowContext = { ...contextData, execute: { ...contextData.execute, ...rowData } };
          const rowObj: any = { ...resolvedSharedFields };
          for (const mapping of rowLevelMappings) {
            let finalValue;
            const variableName = (mapping.value || '').replace(/^\{\{|\}\}$/g, '');
            finalValue = getValueByPath(rowContext.execute, variableName) ?? getValueByPath(rowContext, variableName);

            let strippedFieldName = mapping.fieldName || '';
            if (arrayParentKey && strippedFieldName.startsWith(arrayParentKey + '.')) {
              strippedFieldName = strippedFieldName.substring(arrayParentKey.length + 1);
            }
            if (finalValue !== undefined && finalValue !== null) {
              if (mapping.dataType === 'integer') finalValue = parseInt(String(finalValue));
              else if (mapping.dataType === 'number' || mapping.dataType === 'decimal') finalValue = parseFloat(String(finalValue));
              else if (mapping.dataType === 'boolean') finalValue = String(finalValue).toLowerCase() === 'true' ? 'True' : 'False';
              else if (typeof finalValue !== 'object') finalValue = String(finalValue);
              setValueByPath(rowObj, strippedFieldName, finalValue);
            }
          }
          rowResults.push(rowObj);
        }
        const outerObj: any = {};
        for (const mapping of outerOnlyMappings) {
          let finalValue;
          if (mapping.type === 'hardcoded') {
            finalValue = mapping.value;
          } else if (mapping.type === 'variable') {
            const variableName = (mapping.value || '').replace(/^\{\{|\}\}$/g, '');
            finalValue = getValueByPath(contextData.execute, variableName) ?? getValueByPath(contextData, variableName);
          } else if (mapping.type === 'function' && mapping.functionId) {
            continue;
          }
          if (finalValue !== undefined && finalValue !== null) {
            if (mapping.dataType === 'integer') finalValue = parseInt(String(finalValue));
            else if (mapping.dataType === 'number' || mapping.dataType === 'decimal') finalValue = parseFloat(String(finalValue));
            else if (mapping.dataType === 'boolean') finalValue = String(finalValue).toLowerCase() === 'true' ? 'True' : 'False';
            else if (typeof finalValue !== 'object') finalValue = String(finalValue);
            setValueByPath(outerObj, mapping.fieldName, finalValue);
          }
        }
        if (arrayParentKey) {
          outerObj[arrayParentKey] = rowResults;
        }

        let requestBodyContent = JSON.stringify(outerObj);

        if (!arrayParentKey && config.requestBodyTemplate) {
          try {
            const templateResolved = replaceVariables(config.requestBodyTemplate, contextData);
            const templateObj = JSON.parse(templateResolved);

            let injectedIntoNested = false;
            for (const key of Object.keys(templateObj)) {
              if (typeof templateObj[key] === 'object' && templateObj[key] !== null && !Array.isArray(templateObj[key])) {
                const nestedKeys = Object.keys(templateObj[key]);
                const rowFieldNames = rowLevelMappings.map((m: any) => {
                  const parts = (m.fieldName || '').split('.');
                  return parts[parts.length - 1];
                });
                const overlap = nestedKeys.filter((nk: string) => rowFieldNames.some((rf: string) => rf === nk));
                if (overlap.length > 0) {
                  templateObj[key] = rowResults;
                  injectedIntoNested = true;
                  break;
                }
              }
            }
            if (injectedIntoNested) {
              requestBodyContent = JSON.stringify(templateObj);
            } else {
              requestBodyContent = JSON.stringify(rowResults);
            }
          } catch (e) {
            console.error(`[BATCH_DEBUG] Failed to parse template for batch injection:`, e);
            requestBodyContent = JSON.stringify(rowResults);
          }
        } else if (!arrayParentKey) {
          requestBodyContent = JSON.stringify(rowResults);
        }
        const httpMethod = config.httpMethod || 'GET';
        const fetchOptions: RequestInit = {
          method: httpMethod,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        };
        if (httpMethod.toUpperCase() !== 'GET' && requestBodyContent?.trim()) {
          fetchOptions.body = requestBodyContent;
        }

        const apiPath = replaceVariables(config.apiPath || '', contextData);
        const fullUrl = `${baseUrl}${apiPath}`;
        const response = await fetch(fullUrl, fetchOptions);
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`API endpoint call failed with status ${response.status}: ${errorText}`);
          (error as any).requestUrl = fullUrl;
          (error as any).requestBody = requestBodyContent;
          (error as any).httpMethod = httpMethod;
          throw error;
        }

        const responseText = await response.text();
        let responseData = null;
        try {
          if (responseText?.trim()) {
            responseData = JSON.parse(responseText);
          } else {
            responseData = { success: true };
          }
        } catch {
          responseData = { rawResponse: responseText };
        }

        applyResponseMappings(config, responseData, contextData);

        return {
          arrayProcessingMode: 'batch',
          totalRows: arrayData.length,
          builtRows: rowResults.length,
          response: responseData
        };
      }

      const strippedMappings = arrayFieldMappings.map((m: any) => ({
        ...m,
        fieldName: (m.fieldName || '').replace(/^\d+\./, '')
      }));

      const rawParentSegment = arrayFieldMappings.length > 0
        ? (arrayFieldMappings[0].fieldName || '').replace(/^\d+\./, '').split('.')[0]
        : '';
      const arrayParentPath = rawParentSegment.replace(/\[\d+\]$/, '');
      const perRowMappings = strippedMappings.map((m: any) => {
        const original = m.fieldName || '';
        const stripped = arrayParentPath
          ? original.replace(new RegExp(`^${arrayParentPath}\\[\\d+\\]\\.`), '').replace(new RegExp(`^${arrayParentPath}\\.`), '')
          : original;
        return { ...m, fieldName: stripped };
      });

      const rowResults: any[] = [];
      for (let i = 0; i < arrayData.length; i++) {
        const rowData = arrayData[i];
        const rowContext = { ...contextData, execute: { ...contextData.execute, ...rowData } };
        const rowObj: any = {};
        for (const mapping of perRowMappings) {
          let finalValue;
          if (mapping.type === 'hardcoded') {
            finalValue = mapping.value;
          } else if (mapping.type === 'variable') {
            const variableName = mapping.value.replace(/^\{\{|\}\}$/g, '');
            finalValue = getValueByPath(rowContext.execute, variableName) ?? getValueByPath(rowContext, variableName);
          } else if (mapping.type === 'function' && mapping.functionId) {
            continue;
          }

          if (finalValue !== undefined && finalValue !== null) {
            if (mapping.dataType === 'integer') finalValue = parseInt(String(finalValue));
            else if (mapping.dataType === 'number' || mapping.dataType === 'decimal') finalValue = parseFloat(String(finalValue));
            else if (mapping.dataType === 'boolean') finalValue = String(finalValue).toLowerCase() === 'true' ? 'True' : 'False';
            else finalValue = String(finalValue);

            setValueByPath(rowObj, mapping.fieldName, finalValue);
          }
        }
        rowResults.push(rowObj);
      }
      const batchTopLevelMappings = [...topLevelMappings];
      if (arrayParentPath) {
        batchTopLevelMappings.push({
          fieldName: arrayParentPath,
          type: 'variable',
          value: `{{execute.${arrayParentPath}}}`,
          dataType: 'array'
        });
      }

      const batchConfig = {
        ...config,
        requestBodyFieldMappings: batchTopLevelMappings
      };

      const batchContextData = {
        ...contextData,
        execute: { ...contextData.execute, [arrayParentPath]: rowResults },
        arrayData: rowResults
      };
      const responseData = await executeApiEndpointSingle(batchConfig, batchContextData, baseUrl, authToken, undefined, supabaseUrl, supabaseServiceKey);
      applyResponseMappings(config, responseData, contextData);

      return {
        arrayProcessingMode: 'batch',
        totalRows: arrayData.length,
        builtRows: rowResults.length,
        response: responseData
      };
    }
  }

  const flattenedExecute = { ...contextData.execute };
  let foundArrayGroupData = false;
  for (const [key, value] of Object.entries(flattenedExecute)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      for (const [fieldKey, fieldValue] of Object.entries(value[0])) {
        if (!(fieldKey in flattenedExecute)) {
          flattenedExecute[fieldKey] = fieldValue;
          foundArrayGroupData = true;
        }
      }
    }
  }
  if (foundArrayGroupData) {
  }

  const effectiveContextData = foundArrayGroupData
    ? { ...contextData, execute: flattenedExecute }
    : contextData;

  let responseData = await executeApiEndpointSingle(config, effectiveContextData, baseUrl, authToken, undefined, supabaseUrl, supabaseServiceKey);

  let skipRemainingLoopSteps = false;
  if (config.responseTransformation?.enabled) {
    const result = applyResponseTransformation(responseData, config.responseTransformation, contextData);
    responseData = result.data;
    skipRemainingLoopSteps = result.skipRemainingLoopSteps;
  }

  applyResponseMappings(config, responseData, contextData);

  if (skipRemainingLoopSteps) {
    return { ...responseData, skipRemainingLoopSteps: true };
  }
  return responseData;
}

export function applyResponseMappings(config: any, responseData: any, contextData: any): void {
  const responseDataMappings = config.responseDataMappings || [];
  const responseReturnsArray = config.responseReturnsArray || false;
  if (!contextData.response) {
    contextData.response = {};
  }
  for (const mapping of responseDataMappings) {
    if (mapping.responsePath && mapping.updatePath) {
      let extractedValue = getValueByPath(responseData, mapping.responsePath);
      if (extractedValue === null || extractedValue === undefined) {
        for (const key of Object.keys(responseData || {})) {
          const val = responseData[key];
          if (Array.isArray(val) && val.length > 0) {
            if (responseReturnsArray) {
              const allValues = val
                .map((item: any) => getValueByPath(item, mapping.responsePath))
                .filter((v: any) => v !== null && v !== undefined);
              if (allValues.length > 0) {
                extractedValue = allValues;
                break;
              }
            } else {
              const nestedValue = getValueByPath(val[0], mapping.responsePath);
              if (nestedValue !== null && nestedValue !== undefined) {
                extractedValue = nestedValue;
                break;
              }
            }
          }
        }
      } else if (responseReturnsArray && Array.isArray(extractedValue)) {
      }

      if (extractedValue !== null && extractedValue !== undefined) {
        const pathParts = mapping.updatePath.split('.');
        let current = contextData.response;
        for (let i = 0; i < pathParts.length - 1; i++) {
          if (!current[pathParts[i]]) current[pathParts[i]] = {};
          current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = extractedValue;
      } else {
      }
    }
  }
}
