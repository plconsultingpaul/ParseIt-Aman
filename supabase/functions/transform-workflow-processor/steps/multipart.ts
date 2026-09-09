import { getValueByPath } from "../utils.ts";

interface MultipartFormPart {
  name: string;
  type: 'text' | 'file';
  value?: string;
  contentType?: string;
}

function generateBoundary(): string {
  return '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
}

function buildMultipartBody(
  parts: MultipartFormPart[],
  boundary: string,
  fileData: Uint8Array | null,
  filename: string
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const part of parts) {
    chunks.push(encoder.encode(`--${boundary}\r\n`));

    if (part.type === 'file') {
      chunks.push(encoder.encode(`Content-Disposition: form-data; name="${part.name}"; filename="${filename}"\r\n`));
      chunks.push(encoder.encode(`Content-Type: application/pdf\r\n\r\n`));
      if (fileData) {
        chunks.push(fileData);
      }
      chunks.push(encoder.encode('\r\n'));
    } else {
      chunks.push(encoder.encode(`Content-Disposition: form-data; name="${part.name}"\r\n`));
      if (part.contentType) {
        chunks.push(encoder.encode(`Content-Type: ${part.contentType}\r\n`));
      }
      chunks.push(encoder.encode('\r\n'));
      chunks.push(encoder.encode(part.value || ''));
      chunks.push(encoder.encode('\r\n'));
    }
  }

  chunks.push(encoder.encode(`--${boundary}--\r\n`));

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  return body;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function executeMultipartFormUpload(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<any> {
  console.log('📤 === EXECUTING MULTIPART FORM UPLOAD STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Multipart config:', JSON.stringify(config, null, 2));

  let baseUrl = '';
  let authToken = '';
  let authType = config.authType || 'bearer';

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
        }
      }
    } catch (apiConfigError) {
      console.error('❌ Failed to load main API config:', apiConfigError);
    }
  } else if (apiSourceType === 'secondary' && config.secondaryApiId) {
    try {
      console.log('🔍 Fetching secondary API config...');
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
        }
      }
    } catch (apiConfigError) {
      console.error('❌ Failed to load secondary API config:', apiConfigError);
    }
  }

  if ((apiSourceType === 'main' || apiSourceType === 'secondary') && config.authConfigId) {
    try {
      console.log('🔐 Fetching auth config for token authentication override...');
      const authConfigResponse = await fetch(`${supabaseUrl}/rest/v1/api_auth_config?select=*&id=eq.${config.authConfigId}`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      });

      if (authConfigResponse.ok) {
        const authConfigs = await authConfigResponse.json();
        if (authConfigs && authConfigs.length > 0) {
          const authConfig = authConfigs[0];
          console.log('✅ Loaded auth config for override:', authConfig.name);

          if (authConfig.login_endpoint && authConfig.username && authConfig.password) {
            console.log('🔐 Performing token authentication login...');
            const loginResponse = await fetch(authConfig.login_endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: authConfig.username,
                password: authConfig.password
              })
            });

            if (!loginResponse.ok) {
              const errorText = await loginResponse.text().catch(() => '');
              throw new Error(`Authentication login failed: ${loginResponse.status} ${errorText}`);
            }

            const loginData = await loginResponse.json();
            const tokenFieldName = authConfig.token_field_name || 'access_token';
            authToken = loginData[tokenFieldName];

            if (!authToken) {
              throw new Error(`Login response missing '${tokenFieldName}' field`);
            }

            console.log('✅ Token authentication override successful');
          } else {
            console.warn('⚠️ Auth config missing required fields (login_endpoint, username, password)');
          }
        }
      }
    } catch (authConfigError) {
      console.error('❌ Failed to authenticate with override config:', authConfigError);
      throw authConfigError;
    }
  } else if (apiSourceType === 'auth_config' && config.authConfigId) {
    try {
      console.log('🔍 Fetching auth config for token authentication...');
      const authConfigResponse = await fetch(`${supabaseUrl}/rest/v1/api_auth_config?select=*&id=eq.${config.authConfigId}`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey
        }
      });

      if (authConfigResponse.ok) {
        const authConfigs = await authConfigResponse.json();
        if (authConfigs && authConfigs.length > 0) {
          const authConfig = authConfigs[0];
          console.log('✅ Loaded auth config:', authConfig.name);

          if (authConfig.login_endpoint && authConfig.username && authConfig.password) {
            console.log('🔐 Performing token authentication login...');
            const loginResponse = await fetch(authConfig.login_endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: authConfig.username,
                password: authConfig.password
              })
            });

            if (!loginResponse.ok) {
              const errorText = await loginResponse.text().catch(() => '');
              throw new Error(`Authentication login failed: ${loginResponse.status} ${errorText}`);
            }

            const loginData = await loginResponse.json();
            const tokenFieldName = authConfig.token_field_name || 'access_token';
            authToken = loginData[tokenFieldName];

            if (!authToken) {
              throw new Error(`Login response missing '${tokenFieldName}' field`);
            }

            console.log('✅ Token authentication successful');
          } else {
            console.warn('⚠️ Auth config missing required fields (login_endpoint, username, password)');
          }
        }
      }
    } catch (authConfigError) {
      console.error('❌ Failed to authenticate:', authConfigError);
      throw authConfigError;
    }
  }

  let url = config.url || '';
  if (!url && baseUrl) {
    url = baseUrl + (config.apiPath || '');
  }

  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = placeholderRegex.exec(url)) !== null) {
    const placeholder = match[0];
    const path = match[1];
    const value = getValueByPath(contextData, path);
    if (value !== undefined && value !== null) {
      url = url.replace(placeholder, encodeURIComponent(String(value)));
    }
  }

  console.log('🔗 Final URL:', url);

  if (!url) {
    throw new Error('Multipart form upload URL is required');
  }

  const formParts: any[] = config.formParts || [];
  const processedParts: MultipartFormPart[] = [];

  for (const part of formParts) {
    console.log('=== PROCESSING FORM PART ===');
    console.log('Part name:', part.name);
    console.log('Part type:', part.type);
    console.log('Part has fieldMappings:', !!part.fieldMappings);
    console.log('fieldMappings count:', part.fieldMappings?.length || 0);
    console.log('Full part object:', JSON.stringify(part, null, 2));

    if (part.type === 'file') {
      processedParts.push({
        name: part.name,
        type: 'file'
      });
    } else {
      let processedValue = part.value || '';
      console.log('Initial processedValue:', processedValue);

      if (part.fieldMappings && Array.isArray(part.fieldMappings) && part.fieldMappings.length > 0) {
        console.log('>>> ENTERING FIELD MAPPINGS PROCESSING BLOCK');
        console.log('Number of field mappings to process:', part.fieldMappings.length);

        let jsonObject: Record<string, any> | null = null;
        let isValidJson = false;

        try {
          jsonObject = JSON.parse(processedValue);
          isValidJson = typeof jsonObject === 'object' && jsonObject !== null;
          console.log('Template is valid JSON, using property replacement strategy');
        } catch {
          console.log('Template is not valid JSON, using placeholder replacement strategy');
        }

        for (let i = 0; i < part.fieldMappings.length; i++) {
          const mapping = part.fieldMappings[i];
          console.log(`--- Processing mapping ${i + 1}/${part.fieldMappings.length} ---`);

          const fieldName = mapping.fieldName;
          const mappingType = mapping.type;
          const mappingValue = mapping.value;
          const dataType = mapping.dataType || 'string';

          console.log(`Field name: "${fieldName}", Type: "${mappingType}", Value: "${mappingValue}", DataType: "${dataType}"`);

          let resolvedValue: any;
          if (mappingType === 'hardcoded') {
            resolvedValue = mappingValue;
          } else if (mappingType === 'variable') {
            resolvedValue = mappingValue;

            const varRegex = /\{\{([^}]+)\}\}/g;
            let varMatch;
            while ((varMatch = varRegex.exec(mappingValue)) !== null) {
              const varPath = varMatch[1];
              const varValue = getValueByPath(contextData, varPath);
              console.log(`Variable "${varPath}" resolved to:`, varValue);
              if (varValue !== undefined && varValue !== null) {
                resolvedValue = resolvedValue.replace(varMatch[0], String(varValue));
              } else {
                console.log(`WARNING: Variable "${varPath}" not found in contextData`);
              }
            }
          } else {
            console.log(`Unknown mapping type "${mappingType}", skipping`);
            continue;
          }

          if (resolvedValue !== undefined && resolvedValue !== null) {
            if (dataType === 'integer') {
              resolvedValue = parseInt(String(resolvedValue));
            } else if (dataType === 'number') {
              resolvedValue = parseFloat(String(resolvedValue));
            } else if (dataType === 'boolean') {
              resolvedValue = String(resolvedValue).toLowerCase() === 'true';
            } else {
              resolvedValue = String(resolvedValue);
            }

            if (isValidJson && jsonObject) {
              let nestedUpdatePerformed = false;

              if (fieldName.includes('.')) {
                console.log(`🔍 Processing nested path: "${fieldName}"`);
                const pathParts = fieldName.split('.');
                let current: any = jsonObject;
                let parentRef: any = null;
                let lastKey: string = '';

                for (let j = 0; j < pathParts.length; j++) {
                  const pathPart = pathParts[j];

                  if (current === undefined || current === null) {
                    console.log(`⚠️ Path broken at part ${j}: "${pathPart}"`);
                    break;
                  }

                  if (j === pathParts.length - 1) {
                    parentRef = current;
                    lastKey = pathPart;
                  } else {
                    const index = parseInt(pathPart);
                    if (!isNaN(index) && Array.isArray(current)) {
                      current = current[index];
                    } else {
                      current = current[pathPart];
                    }
                  }
                }

                if (parentRef && lastKey) {
                  console.log(`✅ Updating nested property "${fieldName}": "${parentRef[lastKey]}" -> "${resolvedValue}"`);
                  parentRef[lastKey] = resolvedValue;
                  nestedUpdatePerformed = true;
                } else {
                  console.log(`⚠️ Could not resolve nested path "${fieldName}", falling back to root`);
                }
              }

              if (!nestedUpdatePerformed) {
                if (fieldName in jsonObject) {
                  console.log(`Updating JSON property "${fieldName}": "${jsonObject[fieldName]}" -> "${resolvedValue}"`);
                  jsonObject[fieldName] = resolvedValue;
                } else {
                  console.log(`Adding new JSON property "${fieldName}": "${resolvedValue}"`);
                  jsonObject[fieldName] = resolvedValue;
                }
              }
            } else {
              const placeholder = `{{${fieldName}}}`;
              const escapedValue = typeof resolvedValue === 'string'
                ? resolvedValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                : String(resolvedValue);
              processedValue = processedValue.split(placeholder).join(escapedValue);
            }
          }
        }

        if (isValidJson && jsonObject) {
          processedValue = JSON.stringify(jsonObject);
          console.log('Final JSON after field mappings:', processedValue);
        }

        console.log('>>> EXITING FIELD MAPPINGS PROCESSING BLOCK');
      } else {
        console.log('>>> SKIPPING FIELD MAPPINGS (none defined or empty array)');
      }

      if (!part.fieldMappings || part.fieldMappings.length === 0) {
        const valuePlaceholderRegex = /\{\{([^}]+)\}\}/g;
        let valueMatch;
        while ((valueMatch = valuePlaceholderRegex.exec(part.value || '')) !== null) {
          const placeholder = valueMatch[0];
          const path = valueMatch[1];
          const value = getValueByPath(contextData, path);
          if (value !== undefined && value !== null) {
            if (typeof value === 'object') {
              processedValue = processedValue.replace(placeholder, JSON.stringify(value));
            } else {
              const escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              processedValue = processedValue.replace(placeholder, escapedValue);
            }
          }
        }
      }

      processedParts.push({
        name: part.name,
        type: 'text',
        value: processedValue,
        contentType: part.contentType
      });
    }
  }

  console.log('📋 Processed form parts:', processedParts.length);

  let fileData: Uint8Array | null = null;
  let filename = contextData.pdfFilename || contextData.originalPdfFilename || 'document.pdf';

  if (config.filenameTemplate) {
    let templateFilename = config.filenameTemplate;
    const filenameRegex = /\{\{([^}]+)\}\}/g;
    let filenameMatch;
    while ((filenameMatch = filenameRegex.exec(config.filenameTemplate)) !== null) {
      const placeholder = filenameMatch[0];
      const path = filenameMatch[1];
      const value = getValueByPath(contextData, path);
      if (value !== undefined && value !== null) {
        templateFilename = templateFilename.replace(placeholder, String(value));
      }
    }
    filename = templateFilename;
  }

  if (!filename.toLowerCase().endsWith('.pdf')) {
    filename = filename + '.pdf';
  }

  console.log('📄 Upload filename:', filename);

  if (contextData.pdfBase64) {
    console.log('📎 Converting PDF base64 to binary...');
    fileData = base64ToUint8Array(contextData.pdfBase64);
    console.log('📎 PDF binary size:', fileData.length, 'bytes');
  } else {
    console.warn('⚠️ No PDF data available in context');
  }

  const boundary = generateBoundary();
  const body = buildMultipartBody(processedParts, boundary, fileData, filename);

  console.log('📦 Multipart body size:', body.length, 'bytes');

  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  };

  if (authToken) {
    if (authType === 'basic') {
      headers['Authorization'] = `Basic ${authToken}`;
    } else {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
  }

  if (config.additionalHeaders) {
    for (const [key, value] of Object.entries(config.additionalHeaders)) {
      if (key.toLowerCase() !== 'content-type') {
        headers[key] = String(value);
      }
    }
  }

  console.log('📤 Sending multipart form request...');
  console.log('📤 Headers:', Object.keys(headers).join(', '));

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  });

  console.log('📥 Response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Multipart upload failed:', errorText);

    const errorOutputData = {
      request: {
        url: url,
        filename: filename,
        formParts: processedParts.map(p => ({
          name: p.name,
          type: p.type,
          value: p.type === 'text' ? p.value : '[FILE DATA]',
          contentType: p.contentType || null
        })),
        fileSize: fileData ? fileData.length : 0,
        headers: Object.keys(headers)
      },
      response: {
        status: response.status,
        error: errorText
      }
    };

    const error = new Error(`Multipart form upload failed with status ${response.status}: ${errorText}`);
    (error as any).outputData = errorOutputData;
    throw error;
  }

  const responseText = await response.text();
  console.log('📥 Response length:', responseText.length);

  let responseData: any = { success: true };

  if (responseText && responseText.trim() !== '') {
    try {
      responseData = JSON.parse(responseText);
      console.log('✅ Response parsed as JSON');
    } catch {
      console.log('ℹ️ Response is not JSON, storing as raw text');
      responseData = { success: true, rawResponse: responseText };
    }
  }

  const responseDataMappings = config.responseDataMappings || [];
  if (responseDataMappings.length > 0 && responseData) {
    console.log('🔄 Processing response data mappings...');
    for (const mapping of responseDataMappings) {
      const responsePath = mapping.responsePath;
      const updatePath = mapping.updatePath;

      if (!responsePath || !updatePath) continue;

      const extractedValue = getValueByPath(responseData, responsePath);
      if (extractedValue !== undefined && extractedValue !== null) {
        const pathParts = updatePath.split('.');
        let current = contextData;
        for (let i = 0; i < pathParts.length - 1; i++) {
          if (!current[pathParts[i]]) {
            current[pathParts[i]] = {};
          }
          current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = extractedValue;
        console.log(`✅ Mapped ${responsePath} -> ${updatePath}`);
      }
    }
  }

  console.log('✅ Multipart form upload completed successfully');

  return {
    request: {
      url: url,
      filename: filename,
      formParts: processedParts.map(p => ({
        name: p.name,
        type: p.type,
        value: p.type === 'text' ? p.value : '[FILE DATA]',
        contentType: p.contentType || null
      })),
      fileSize: fileData ? fileData.length : 0,
      headers: Object.keys(headers)
    },
    response: {
      status: response.status,
      data: responseData
    }
  };
}
