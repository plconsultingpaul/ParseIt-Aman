import { getValueByPath } from "../utils.ts";

export async function executeApiEndpoint(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ stepOutput: any; responseData: any }> {
  console.log('🌐 === EXECUTING API ENDPOINT STEP ===');
  const config = step.config_json || {};
  console.log('🔧 API endpoint config:', JSON.stringify(config, null, 2));

  let baseUrl = '';
  let authToken = '';

  if (config.apiSourceType === 'main') {
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
        console.log('✅ Loaded main API config');
        console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
      }
    }
  } else if (config.apiSourceType === 'secondary' && config.secondaryApiId) {
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
        console.log('✅ Loaded secondary API config');
        console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
      }
    }
  }

  let apiPath = config.apiPath || '';
  const httpMethod = config.httpMethod || 'GET';

  const pathVarRegex = /\{([^}]+)\}|\$\{([^}]+)\}/g;
  let pathMatch;
  while ((pathMatch = pathVarRegex.exec(apiPath)) !== null) {
    const variableName = pathMatch[1] || pathMatch[2];
    const value = getValueByPath(contextData, variableName);
    if (value !== undefined && value !== null) {
      apiPath = apiPath.replace(pathMatch[0], String(value));
      console.log(`🔄 Replaced path variable ${pathMatch[0]} with: ${value}`);
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

  console.log(`📤 Making ${httpMethod} request to API endpoint`);
  console.log('📋 Request Details:');
  console.log('  - URL:', fullUrl);
  console.log('  - Method:', httpMethod);
  console.log('  - Headers:', JSON.stringify(headers, null, 2));
  console.log('  - Base URL:', baseUrl);
  console.log('  - API Path:', apiPath);
  console.log('  - Query String:', queryString);

  const apiResponse = await fetch(fullUrl, { method: httpMethod, headers });
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
    throw error;
  }

  const responseData = await apiResponse.json();
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

  const extractedValues: any[] = [];
  if (mappingsToProcess.length > 0) {
    console.log('🔄 Extracting data from API response...');
    for (const mapping of mappingsToProcess) {
      if (!mapping.responsePath || !mapping.updatePath) {
        console.warn('⚠️ Skipping mapping with missing responsePath or updatePath:', mapping);
        continue;
      }
      try {
        const extractedValue = getValueByPath(responseData, mapping.responsePath);
        console.log(`🔍 Extracted value from path "${mapping.responsePath}":`, extractedValue);
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
          extractedValues.push({ path: mapping.responsePath, updatePath: mapping.updatePath, value: extractedValue });
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
  return { stepOutput, responseData };
}
