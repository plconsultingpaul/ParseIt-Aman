import { getValueByPath, escapeSingleQuotesForOData } from "../utils.ts";

export async function executeApiCall(step: any, contextData: any): Promise<{ stepOutput: any; responseData: any }> {
  console.log('🌐 === EXECUTING API CALL STEP ===');
  const config = step.config_json || {};
  console.log('🔧 API call config:', JSON.stringify(config, null, 2));

  let url = config.url || '';
  console.log('🔗 Original URL:', url);

  const urlPlaceholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  const replacements: any[] = [];
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
    if (config.escapeSingleQuotesInBody && rawValue.includes("'")) {
      const beforeEscape = rawValue;
      rawValue = escapeSingleQuotesForOData(rawValue);
      console.log(`🔄 Escaped single quotes in URL: "${beforeEscape}" → "${rawValue}"`);
    }
    const encodedValue = encodeURIComponent(rawValue);
    const placeholderEscaped = replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    url = url.replace(new RegExp(placeholderEscaped, 'g'), encodedValue);
    console.log(`🔄 Replaced ${replacement.placeholder} with: ${rawValue}`);
  }
  for (const [key, value] of Object.entries(contextData)) {
    const placeholder = `{{${key}}}`;
    if (url.includes(placeholder) && !key.includes('.')) {
      const replacementValue = String(value || '');
      const encodedValue = encodeURIComponent(replacementValue);
      url = url.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), encodedValue);
      console.log(`🔄 Replaced simple ${placeholder} with: ${replacementValue}`);
    }
  }
  console.log('🔗 Final URL:', url);

  // === DIAGNOSTIC START: Before Step 400 Execution ===
  try {
    if (step.step_order === 400 || step.step_name.includes('Send Updated JSON')) {
      console.log('DIAGNOSTIC: BEFORE STEP 400 EXECUTION');
      console.log('DIAGNOSTIC: Step Order:', step.step_order);
      console.log('DIAGNOSTIC: Step Name:', step.step_name);
      const clientIdFromOrders = getValueByPath(contextData, 'orders[0].consignee.clientId');
      const clientIdFromExtracted = getValueByPath(contextData, 'extractedData.orders[0].consignee.clientId');
      console.log('DIAGNOSTIC: contextData.orders[0]?.consignee?.clientId:', clientIdFromOrders);
      console.log('DIAGNOSTIC: contextData.extractedData?.orders?.[0]?.consignee?.clientId:', clientIdFromExtracted);
      if (contextData.extractedData && contextData.orders) {
        const refCheck = contextData.extractedData.orders === contextData.orders;
        console.log('DIAGNOSTIC: Reference Check:', refCheck ? 'SAME' : 'DIFFERENT');
      }
      const requestBodyTemplate = config.requestBody || '';
      console.log('DIAGNOSTIC: Request body contains {{extractedData}}:', requestBodyTemplate.includes('{{extractedData}}'));
    }
  } catch (e) {
    console.error('DIAGNOSTIC ERROR: Before Step 400', e);
  }
  // === DIAGNOSTIC END ===

  let requestBody = config.requestBody || '';
  console.log('📄 Original request body template:', requestBody);
  const bodyPlaceholderRegex = /\{\{([^}]+)\}\}/g;
  let bodyMatch;
  const bodyReplacements: any[] = [];
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
    if (config.escapeSingleQuotesInBody && rawValue.includes("'")) {
      const beforeEscape = rawValue;
      rawValue = escapeSingleQuotesForOData(rawValue);
      console.log(`🔄 Escaped single quotes: "${beforeEscape}" → "${rawValue}"`);
    }
    const escapedValue = rawValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    requestBody = requestBody.replace(new RegExp(replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), escapedValue);
    console.log(`🔄 Replaced ${replacement.placeholder} with: ${rawValue}`);
  }

  if (requestBody.includes('{{extractedData}}')) {
    console.log('🔧 Found {{extractedData}} placeholder - handling as JSON object');
    console.log('🔍 PRE-REPLACEMENT DIAGNOSTIC:');
    if (contextData.extractedData && typeof contextData.extractedData === 'object') {
      const clientIdCheck = getValueByPath(contextData.extractedData, 'orders[0].consignee.clientId');
      console.log('  - contextData.extractedData.orders[0]?.consignee?.clientId:', clientIdCheck);
      console.log('  - extractedData type:', typeof contextData.extractedData);
      console.log('  - extractedData.orders exists:', !!contextData.extractedData.orders);
      if (contextData.extractedData.orders && Array.isArray(contextData.extractedData.orders)) {
        console.log('  - extractedData.orders length:', contextData.extractedData.orders.length);
        if (contextData.extractedData.orders[0]) {
          console.log('  - extractedData.orders[0].consignee:', JSON.stringify(contextData.extractedData.orders[0].consignee));
        }
      }
    }
    if (contextData.extractedData && typeof contextData.extractedData === 'object') {
      const stringifiedData = JSON.stringify(contextData.extractedData);
      requestBody = requestBody.replace(/\{\{extractedData\}\}/g, stringifiedData);
      console.log('✅ Replaced {{extractedData}} with enriched extracted data object');
      console.log('🔍 Stringified data length:', stringifiedData.length);
      console.log('🔍 Stringified data contains "clientId":"10921":', stringifiedData.includes('"clientId":"10921"'));
      console.log('🔍 Stringified data preview (first 500 chars):', stringifiedData.substring(0, 500));
    } else if (contextData.originalExtractedData && typeof contextData.originalExtractedData === 'string') {
      requestBody = requestBody.replace(/\{\{extractedData\}\}/g, contextData.originalExtractedData);
      console.log('⚠️ Fallback: Replaced {{extractedData}} with original extracted data string');
    }
  }
  if (requestBody.includes('{{orders}}')) {
    console.log('🔧 Found {{orders}} placeholder - handling as JSON array');
    if (contextData.orders && Array.isArray(contextData.orders)) {
      requestBody = requestBody.replace(/\{\{orders\}\}/g, JSON.stringify(contextData.orders));
      console.log('✅ Replaced {{orders}} with stringified orders array');
    }
  }
  console.log('📄 Final request body:', requestBody);

  // === DIAGNOSTIC START: After Placeholder Replacement ===
  try {
    if (step.step_order === 400 || step.step_name.includes('Send Updated JSON')) {
      console.log('DIAGNOSTIC: AFTER PLACEHOLDER REPLACEMENT');
      console.log('DIAGNOSTIC: Request body (first 1000 chars):', requestBody.substring(0, 1000));
      try {
        const parsedBody = JSON.parse(requestBody);
        const clientIdInBody = parsedBody?.orders?.[0]?.consignee?.clientId;
        if (clientIdInBody) {
          console.log('DIAGNOSTIC: SUCCESS - clientId in request body:', clientIdInBody);
        } else {
          console.log('DIAGNOSTIC: FAILURE - clientId NOT in request body');
          console.log('DIAGNOSTIC: parsedBody.orders?.[0]?.consignee:', parsedBody?.orders?.[0]?.consignee);
        }
      } catch (parseError) {
        console.log('DIAGNOSTIC: Could not parse request body as JSON (might be XML or other format)');
      }
    }
  } catch (e) {
    console.error('DIAGNOSTIC ERROR: After Placeholder Replacement', e);
  }
  // === DIAGNOSTIC END ===

  console.log('🚀 Making API call...');
  const fetchOptions: any = {
    method: config.method || 'POST',
    headers: config.headers || {}
  };
  if (config.method && config.method.toUpperCase() !== 'GET' && requestBody && requestBody.trim() !== '') {
    fetchOptions.body = requestBody;
    console.log('📄 Including request body for', config.method, 'request');
  } else {
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
  } catch (responseParseError: any) {
    console.error('❌ Failed to parse API response:', responseParseError);
    console.error('📄 Problematic response:', responseText);
    throw new Error(`API response is not valid JSON: ${responseParseError.message}`);
  }

  let mappingsToProcess: any[] = [];
  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    mappingsToProcess = config.responseDataMappings;
    console.log('📋 Using new format: processing', mappingsToProcess.length, 'mapping(s)');
  } else if (config.responseDataPath && config.updateJsonPath) {
    mappingsToProcess = [{ responsePath: config.responseDataPath, updatePath: config.updateJsonPath }];
    console.log('📋 Using old format: converted to single mapping');
  }

  if (mappingsToProcess.length > 0) {
    console.log('🔄 === EXTRACTING DATA FROM API RESPONSE ===');
    console.log('🔍 DEBUG - Full API responseData:', JSON.stringify(responseData, null, 2));
    console.log('🔍 DEBUG - contextData BEFORE update:', JSON.stringify(contextData, null, 2));

    for (const mapping of mappingsToProcess) {
      if (!mapping.responsePath || !mapping.updatePath) {
        console.warn('⚠️ Skipping mapping with missing responsePath or updatePath:', mapping);
        continue;
      }
      try {
        console.log('🔍 === PROCESSING MAPPING ===');
        console.log('🔍 DEBUG - responsePath:', JSON.stringify(mapping.responsePath));
        console.log('🔍 DEBUG - updatePath:', JSON.stringify(mapping.updatePath));

        console.log('🔍 === STEP 1: EXTRACTING VALUE FROM API RESPONSE ===');
        const responseValue = getValueByPath(responseData, mapping.responsePath, true);
        console.log('✅ Extracted value from API response:', responseValue);
        console.log('📊 DEBUG - Extracted value type:', typeof responseValue);
        console.log('📊 DEBUG - Extracted value stringified:', JSON.stringify(responseValue));

        console.log('🔍 === STEP 2: STORING VALUE IN CONTEXT DATA ===');
        let actualUpdatePath = mapping.updatePath;
        if (mapping.updatePath.startsWith('extractedData.')) {
          actualUpdatePath = mapping.updatePath.substring('extractedData.'.length);
          console.log('🔍 DEBUG - Stripped "extractedData." prefix from updatePath');
          console.log('🔍 DEBUG - Original path:', mapping.updatePath);
          console.log('🔍 DEBUG - New path:', actualUpdatePath);
        }

        const updatePathParts = actualUpdatePath.split('.');
        console.log('🔍 DEBUG - updatePathParts:', JSON.stringify(updatePathParts));
        console.log('🔍 DEBUG - Will navigate through', updatePathParts.length - 1, 'intermediate parts');
        let current = contextData;

        for (let j = 0; j < updatePathParts.length - 1; j++) {
          const part = updatePathParts[j];
          console.log(`🔍 DEBUG - Processing intermediate part ${j + 1}/${updatePathParts.length - 1}: "${part}"`);
          if (part.includes('[') && part.includes(']')) {
            const arrayName = part.substring(0, part.indexOf('['));
            const arrayIndex = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')));
            console.log(`🔍 DEBUG - Array navigation: ${arrayName}[${arrayIndex}]`);
            if (!current[arrayName]) {
              console.log(`🔍 DEBUG - Creating array: ${arrayName}`);
              current[arrayName] = [];
            }
            console.log(`🔍 DEBUG - Current array length: ${current[arrayName].length}, need index: ${arrayIndex}`);
            while (current[arrayName].length <= arrayIndex) {
              console.log(`🔍 DEBUG - Expanding array, adding object at index ${current[arrayName].length}`);
              current[arrayName].push({});
            }
            current = current[arrayName][arrayIndex];
            console.log(`🔍 DEBUG - Navigated to ${arrayName}[${arrayIndex}]:`, JSON.stringify(current));
          } else {
            console.log(`🔍 DEBUG - Object navigation: .${part}`);
            if (!current[part]) {
              console.log(`🔍 DEBUG - Creating object property: ${part}`);
              current[part] = {};
            }
            current = current[part];
            console.log(`🔍 DEBUG - Navigated to .${part}:`, JSON.stringify(current));
          }
        }

        const finalPart = updatePathParts[updatePathParts.length - 1];
        console.log('🔍 === STEP 3: STORING VALUE AT FINAL LOCATION ===');
        console.log('🔍 DEBUG - Final part to store at:', finalPart);
        console.log('🔍 DEBUG - Current object before storage:', JSON.stringify(current));
        if (finalPart.includes('[') && finalPart.includes(']')) {
          const arrayName = finalPart.substring(0, finalPart.indexOf('['));
          const arrayIndex = parseInt(finalPart.substring(finalPart.indexOf('[') + 1, finalPart.indexOf(']')));
          console.log(`🔍 DEBUG - Storing in array: ${arrayName}[${arrayIndex}]`);
          if (!current[arrayName]) {
            console.log(`🔍 DEBUG - Creating final array: ${arrayName}`);
            current[arrayName] = [];
          }
          while (current[arrayName].length <= arrayIndex) {
            console.log(`🔍 DEBUG - Expanding final array, adding object at index ${current[arrayName].length}`);
            current[arrayName].push({});
          }
          current[arrayName][arrayIndex] = responseValue;
          console.log(`✅ Stored value at ${arrayName}[${arrayIndex}]:`, current[arrayName][arrayIndex]);
        } else {
          current[finalPart] = responseValue;
          console.log('✅ Stored value at final property "' + finalPart + '":', current[finalPart]);
        }

        console.log('🔍 === STEP 4: VERIFICATION ===');
        console.log(`✅ Updated context data at path "${mapping.updatePath}"`);
        console.log('🔍 DEBUG - Verifying stored value by re-reading path:', mapping.updatePath);
        const verificationValue = getValueByPath(contextData, mapping.updatePath, true);
        console.log('🔍 DEBUG - Verification read result:', verificationValue);
        if (verificationValue === responseValue) {
          console.log('✅✅✅ VERIFICATION PASSED: Value successfully stored and retrieved!');
        } else {
          console.log('❌❌❌ VERIFICATION FAILED: Retrieved value does not match stored value!');
          console.log('Expected:', responseValue);
          console.log('Got:', verificationValue);
        }
      } catch (extractError) {
        console.error(`❌ Failed to process mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError);
        console.error('❌ DEBUG - Full error:', extractError);
      }
    }

    console.log('🔍 DEBUG - Full contextData after all updates:', JSON.stringify(contextData, null, 2));
    console.log('🔍 DEBUG - contextData keys after update:', Object.keys(contextData));
  } else {
    console.log('⚠️ DEBUG - Skipping data extraction: no mappings configured');
  }

  // === SYNC FIX: Ensure extractedData stays synchronized with top-level properties ===
  console.log('🔄 === SYNCHRONIZING CONTEXT DATA ===');
  if (contextData.extractedData && typeof contextData.extractedData === 'object') {
    console.log('🔄 Syncing top-level properties back to extractedData...');
    const keysToSync = Object.keys(contextData).filter((key) =>
      key !== 'extractedData' && key !== 'originalExtractedData' &&
      key !== 'formatType' && key !== 'pdfFilename' &&
      key !== 'originalPdfFilename' && key !== 'pdfStoragePath' && key !== 'pdfBase64'
    );
    console.log('🔄 Keys to sync:', keysToSync);
    for (const key of keysToSync) {
      if (contextData.hasOwnProperty(key)) {
        contextData.extractedData[key] = contextData[key];
        console.log(`🔄 Synced ${key} to extractedData`);
      }
    }
    const clientIdFromOrders = getValueByPath(contextData, 'orders[0].consignee.clientId');
    const clientIdFromExtracted = getValueByPath(contextData, 'extractedData.orders[0].consignee.clientId');
    console.log('🔍 SYNC VERIFICATION:');
    console.log('  - contextData.orders[0]?.consignee?.clientId:', clientIdFromOrders);
    console.log('  - contextData.extractedData.orders[0]?.consignee?.clientId:', clientIdFromExtracted);
    console.log('  - Values match:', clientIdFromOrders === clientIdFromExtracted);
  }
  console.log('✅ === CONTEXT DATA SYNCHRONIZED ===');

  return { stepOutput: responseData, responseData };
}
