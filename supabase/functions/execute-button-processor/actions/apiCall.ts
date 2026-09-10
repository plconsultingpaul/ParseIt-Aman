import { getValueByPath, replaceVariables } from "../utils/objectPaths.ts";

export async function executeApiCall(step: any, contextData: any): Promise<any> {
  console.log('\uD83C\uDF10 Executing API Call step:', step.step_name);
  const config = step.config_json || {};

  let url = replaceVariables(config.url || '', contextData);
  console.log('\uD83D\uDD17 URL:', url);

  let requestBody = replaceVariables(config.requestBody || '', contextData);
  console.log('\uD83D\uDCC4 Request body:', requestBody);

  const fetchOptions: RequestInit = {
    method: config.method || 'POST',
    headers: config.headers || { 'Content-Type': 'application/json' }
  };

  if (config.method?.toUpperCase() !== 'GET' && requestBody?.trim()) {
    fetchOptions.body = requestBody;
  }

  const response = await fetch(url, fetchOptions);
  console.log('\uD83D\uDCCA Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed with status ${response.status}: ${errorText}`);
  }

  const responseText = await response.text();
  let responseData = null;

  try {
    if (responseText?.trim()) {
      responseData = JSON.parse(responseText);
    }
  } catch {
    responseData = { rawResponse: responseText };
  }

  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    if (!contextData.response) {
      contextData.response = {};
    }
    for (const mapping of config.responseDataMappings) {
      if (mapping.responsePath && mapping.updatePath) {
        const extractedValue = getValueByPath(responseData, mapping.responsePath);
        if (extractedValue !== null && extractedValue !== undefined) {
          const pathParts = mapping.updatePath.split('.');
          let current = contextData.response;
          for (let i = 0; i < pathParts.length - 1; i++) {
            if (!current[pathParts[i]]) current[pathParts[i]] = {};
            current = current[pathParts[i]];
          }
          current[pathParts[pathParts.length - 1]] = extractedValue;
          console.log(`\uD83D\uDCDD Stored response.${mapping.updatePath} =`, extractedValue);
        }
      }
    }
  }

  return responseData;
}
