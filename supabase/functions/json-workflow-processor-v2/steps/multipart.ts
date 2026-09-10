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
  console.log('=== EXECUTING MULTIPART FORM UPLOAD STEP ===');
  const config = step.config_json || {};

  let baseUrl = '';
  let authToken = '';
  let authLoginData: any = null;
  let authType = config.authType || 'bearer';

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

  if ((apiSourceType === 'main' || apiSourceType === 'secondary') && config.authConfigId) {
    try {
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

          if (authConfig.login_endpoint && authConfig.username && authConfig.password) {
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
            authLoginData = loginData;
            const tokenFieldName = authConfig.token_field_name || 'access_token';
            authToken = getValueByPath(loginData, tokenFieldName) ?? loginData[tokenFieldName];

            if (!authToken) {
              throw new Error(`Login response missing '${tokenFieldName}' field`);
            }
            console.log(`[multipart auth] override login OK. tokenField="${tokenFieldName}" tokenLen=${String(authToken).length}`);
          } else {
            console.warn('Auth config missing required fields (login_endpoint, username, password)');
          }
        }
      }
    } catch (authConfigError) {
      console.error('Failed to authenticate with override config:', authConfigError);
      throw authConfigError;
    }
  } else if (apiSourceType === 'auth_config' && config.authConfigId) {
    try {
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

          if (authConfig.login_endpoint && authConfig.username && authConfig.password) {
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
            authLoginData = loginData;
            const tokenFieldName = authConfig.token_field_name || 'access_token';
            authToken = getValueByPath(loginData, tokenFieldName) ?? loginData[tokenFieldName];

            if (!authToken) {
              throw new Error(`Login response missing '${tokenFieldName}' field`);
            }
            console.log(`[multipart auth] auth_config login OK. tokenField="${tokenFieldName}" tokenLen=${String(authToken).length}`);
          } else {
            console.warn('Auth config missing required fields (login_endpoint, username, password)');
          }
        }
      }
    } catch (authConfigError) {
      console.error('Failed to authenticate:', authConfigError);
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

  console.log('Multipart URL:', url);

  if (!url) {
    throw new Error('Multipart form upload URL is required');
  }

  const formParts: any[] = config.formParts || [];
  const processedParts: MultipartFormPart[] = [];

  for (const part of formParts) {
    if (part.type === 'file') {
      processedParts.push({
        name: part.name,
        type: 'file'
      });
    } else {
      let processedValue = part.value || '';

      if (part.fieldMappings && Array.isArray(part.fieldMappings) && part.fieldMappings.length > 0) {
        let jsonObject: Record<string, any> | null = null;
        let isValidJson = false;

        try {
          jsonObject = JSON.parse(processedValue);
          isValidJson = typeof jsonObject === 'object' && jsonObject !== null;
        } catch {
          // not JSON, will use placeholder replacement
        }

        for (let i = 0; i < part.fieldMappings.length; i++) {
          const mapping = part.fieldMappings[i];

          const fieldName = mapping.fieldName;
          const mappingType = mapping.type;
          const mappingValue = mapping.value;
          const dataType = mapping.dataType || 'string';

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
              if (varValue !== undefined && varValue !== null) {
                resolvedValue = resolvedValue.replace(varMatch[0], String(varValue));
              } else {
                console.warn(`Variable "${varPath}" not found in contextData`);
              }
            }
          } else {
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
                const pathParts = fieldName.split('.');
                let current: any = jsonObject;
                let parentRef: any = null;
                let lastKey: string = '';

                for (let j = 0; j < pathParts.length; j++) {
                  const part = pathParts[j];

                  if (current === undefined || current === null) {
                    break;
                  }

                  if (j === pathParts.length - 1) {
                    parentRef = current;
                    lastKey = part;
                  } else {
                    const index = parseInt(part);
                    if (!isNaN(index) && Array.isArray(current)) {
                      current = current[index];
                    } else {
                      current = current[part];
                    }
                  }
                }

                if (parentRef && lastKey) {
                  parentRef[lastKey] = resolvedValue;
                  nestedUpdatePerformed = true;
                }
              }

              if (!nestedUpdatePerformed) {
                jsonObject[fieldName] = resolvedValue;
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
        }
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

  if (contextData.pdfBase64) {
    fileData = base64ToUint8Array(contextData.pdfBase64);
  } else {
    console.warn('No PDF data available in context');
  }

  const boundary = generateBoundary();
  const body = buildMultipartBody(processedParts, boundary, fileData, filename);

  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  };

  const customHeaderKeys = config.additionalHeaders
    ? Object.keys(config.additionalHeaders).map(k => k.toLowerCase())
    : [];
  const hasCustomAuthHeader = customHeaderKeys.some(k =>
    k === 'authorization' || k === 'access-token' || k === 'x-access-token' || k === 'x-auth-token' || k === 'token'
  );

  if (authToken && !hasCustomAuthHeader) {
    if (authType === 'basic') {
      headers['Authorization'] = `Basic ${authToken}`;
    } else {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
  } else if (authToken && hasCustomAuthHeader) {
    console.log(`[multipart headers] Custom auth-style header present; suppressing built-in Authorization header. Custom keys: ${customHeaderKeys.join(', ')}`);
  }

  if (config.additionalHeaders) {
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

    const describeValue = (v: string): string => {
      const len = v.length;
      const segCount = v.split('.').length;
      const looksJwt = segCount === 3 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
      const head = v.slice(0, 6);
      const tail = len > 12 ? v.slice(-6) : '';
      const preview = tail ? `${head}...${tail}` : head;
      return `len=${len} segments=${segCount} jwtShape=${looksJwt} preview="${preview}"`;
    };

    for (const [key, value] of Object.entries(config.additionalHeaders)) {
      if (key.toLowerCase() !== 'content-type') {
        const rawValue = String(value);
        let resolvedHeaderValue = rawValue;
        const headerVarRegex = /\{\{([^}]+)\}\}/g;
        let headerMatch;
        const unresolved: string[] = [];
        while ((headerMatch = headerVarRegex.exec(rawValue)) !== null) {
          const varPath = headerMatch[1];
          const varValue = getValueByPath(headerContext, varPath);
          if (varValue !== undefined && varValue !== null) {
            const stringified = (typeof varValue === 'object')
              ? JSON.stringify(varValue)
              : String(varValue);
            if (typeof varValue === 'object') {
              console.warn(`[multipart headers] Placeholder "${varPath}" in header "${key}" resolved to an OBJECT (not a string). Type=${Array.isArray(varValue) ? 'array' : 'object'}, keys=${Object.keys(varValue as any).join(',')}. This is almost certainly the wrong path.`);
            }
            resolvedHeaderValue = resolvedHeaderValue.replace(headerMatch[0], stringified);
          } else {
            unresolved.push(varPath);
          }
        }
        if (unresolved.length > 0) {
          console.warn(`[multipart headers] Header "${key}" has unresolved placeholders: ${unresolved.join(', ')}. Available top-level keys: ${Object.keys(headerContext).join(', ')}. response keys: ${headerContext.response && typeof headerContext.response === 'object' ? Object.keys(headerContext.response).join(',') : '(none)'}`);
        } else {
          console.log(`[multipart headers] Header "${key}" resolved: ${describeValue(resolvedHeaderValue)}`);
        }
        headers[key] = resolvedHeaderValue;
      }
    }
  }

  console.log(`[multipart request] Outgoing headers: ${Object.keys(headers).join(', ')}`);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  });

  console.log('Multipart response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Multipart upload failed:', errorText);

    const errorOutputData = {
      request: {
        url: url,
        filename: filename,
        formParts: processedParts.map(part => ({
          name: part.name,
          type: part.type,
          value: part.type === 'text' ? part.value : '[FILE DATA]',
          contentType: part.contentType || null
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

  let responseData: any = { success: true };

  if (responseText && responseText.trim() !== '') {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { success: true, rawResponse: responseText };
    }
  }

  const responseDataMappings = config.responseDataMappings || [];
  if (responseDataMappings.length > 0 && responseData) {
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
        console.log(`Mapped ${responsePath} -> contextData.${updatePath}`);
      }
    }
  }

  console.log('Multipart form upload completed');

  return {
    request: {
      url: url,
      filename: filename,
      formParts: processedParts.map(part => ({
        name: part.name,
        type: part.type,
        value: part.type === 'text' ? part.value : '[FILE DATA]',
        contentType: part.contentType || null
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
