import { getValueByPath, createV2StepLog } from "../utils.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1";
import { createClient } from "npm:@supabase/supabase-js@2";

export async function executeAiDecision(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  executionLogId?: string | null,
  workflowId?: string
): Promise<{ stepOutput: any; responseData: any }> {
  console.log('=== EXECUTING AI DECISION STEP ===');
  const config = step.config_json || {};

  const sourceFields: { label: string; value: string }[] = config.sourceFields || [];
  const resultArrayPath = config.resultArrayPath || '';
  const aiInstruction = config.aiInstruction || '';
  const returnFieldPath = config.returnFieldPath || '';
  const outputVariableName = config.outputVariableName || '';
  const skipAiIfSingleResult = config.skipAiIfSingleResult !== false;
  const failOnNoMatch = config.failOnNoMatch || false;

  // --- Sub-step 1: Source Field Resolution ---
  const sub1Start = new Date().toISOString();
  const sub1StartMs = Date.now();

  const resolvedSourceFields: Record<string, any> = {};
  for (const field of sourceFields) {
    if (!field.label || !field.value) continue;
    const varRegex = /\{\{([^}]+)\}\}/g;
    let resolvedValue = field.value;
    let match;
    while ((match = varRegex.exec(field.value)) !== null) {
      const varName = match[1];
      const val = getValueByPath(contextData, varName);
      if (val !== undefined && val !== null) {
        resolvedValue = resolvedValue.replace(match[0], String(val));
      }
    }
    resolvedSourceFields[field.label] = resolvedValue;
    console.log(`Source field "${field.label}":`, resolvedValue);
  }

  const sub1End = new Date().toISOString();
  const sub1Duration = Date.now() - sub1StartMs;

  if (executionLogId && workflowId) {
    await createV2StepLog(
      supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
      { id: step.id, label: `${step.label} - Source Field Resolution`, step_type: 'ai_decision', config_json: {} },
      'completed', sub1Start, sub1End, sub1Duration, null,
      { sourceFields },
      { resolvedSourceFields }
    );
  }

  // --- Sub-step 2: API Lookup ---
  const sub2Start = new Date().toISOString();
  const sub2StartMs = Date.now();

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
  const httpMethod = config.httpMethod || 'GET';

  const pathVarRegex = /\{([^}]+)\}|\$\{([^}]+)\}/g;
  let pathMatch;
  while ((pathMatch = pathVarRegex.exec(apiPath)) !== null) {
    const variableName = pathMatch[1] || pathMatch[2];
    const value = getValueByPath(contextData, variableName);
    if (value !== undefined && value !== null) {
      apiPath = apiPath.replace(pathMatch[0], String(value));
    }
  }

  const queryParams = new URLSearchParams();
  const queryParameterConfig = config.queryParameterConfig || {};
  for (const [paramName, paramConfig] of Object.entries(queryParameterConfig) as any) {
    if (paramConfig.enabled && paramConfig.value) {
      let paramValue = paramConfig.value;
      const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
      paramValue = paramConfig.value.replace(valueVarRegex, (_match: string, doubleBrace: string, dollarBrace: string) => {
        const variableName = doubleBrace || dollarBrace;
        const value = getValueByPath(contextData, variableName);
        if (value !== undefined && value !== null) {
          let rawValue = String(value);
          const isODataFilterParam = paramName.toLowerCase() === '$filter';
          if (isODataFilterParam && rawValue.includes("'")) {
            rawValue = rawValue.replace(/'/g, "''");
          }
          return rawValue;
        }
        return _match;
      });
      queryParams.append(paramName, paramValue);
    }
  }

  const queryString = queryParams.toString();
  const fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`;
  console.log('AI Decision API URL:', fullUrl);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  const apiResponse = await fetch(fullUrl, { method: httpMethod, headers });
  console.log('API response status:', apiResponse.status);

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();

    const sub2End = new Date().toISOString();
    const sub2Duration = Date.now() - sub2StartMs;
    if (executionLogId && workflowId) {
      await createV2StepLog(
        supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
        { id: step.id, label: `${step.label} - API Lookup`, step_type: 'ai_decision', config_json: {} },
        'failed', sub2Start, sub2End, sub2Duration, `API call failed: ${apiResponse.status}`,
        { url: fullUrl, method: httpMethod, apiSourceType },
        { responseStatus: apiResponse.status, error: errorText }
      );
    }

    const error: any = new Error(`AI Decision API call failed with status ${apiResponse.status}: ${errorText}`);
    error.outputData = { url: fullUrl, responseStatus: apiResponse.status, error: errorText };
    throw error;
  }

  const responseData = await apiResponse.json();

  let candidates: any[] = [];
  if (resultArrayPath && resultArrayPath.trim() !== '') {
    const extracted = getValueByPath(responseData, resultArrayPath);
    if (Array.isArray(extracted)) {
      candidates = extracted;
    } else if (extracted !== null && extracted !== undefined) {
      candidates = [extracted];
    }
  } else if (Array.isArray(responseData)) {
    candidates = responseData;
  } else {
    candidates = [responseData];
  }

  console.log(`Found ${candidates.length} candidate(s) from API response`);

  const sub2End = new Date().toISOString();
  const sub2Duration = Date.now() - sub2StartMs;

  if (executionLogId && workflowId) {
    await createV2StepLog(
      supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
      { id: step.id, label: `${step.label} - API Lookup`, step_type: 'ai_decision', config_json: {} },
      'completed', sub2Start, sub2End, sub2Duration, null,
      { url: fullUrl, method: httpMethod, apiSourceType, resultArrayPath },
      { responseStatus: apiResponse.status, candidateCount: candidates.length, candidates: candidates.length <= 20 ? candidates : `${candidates.length} records (truncated)` }
    );
  }

  if (candidates.length === 0) {
    const msg = 'AI Decision: API returned zero candidates. Cannot match.';
    console.error(msg);
    if (failOnNoMatch) {
      throw new Error(msg);
    }
    const stepOutput = {
      url: fullUrl,
      method: httpMethod,
      candidateCount: 0,
      matchedRecord: null,
      matchedValue: null,
      aiSkipped: true,
      reason: 'No candidates returned from API'
    };
    return { stepOutput, responseData };
  }

  // --- Sub-step 3: AI Matching ---
  const sub3Start = new Date().toISOString();
  const sub3StartMs = Date.now();

  if (candidates.length === 1 && skipAiIfSingleResult) {
    console.log('Single candidate found, skipping AI and using it directly');
    const matched = candidates[0];
    const matchedValue = returnFieldPath ? getValueByPath(matched, returnFieldPath) : matched;

    if (outputVariableName) {
      contextData[outputVariableName] = matchedValue;
      if (contextData.extractedData && typeof contextData.extractedData === 'object') {
        contextData.extractedData[outputVariableName] = matchedValue;
      }
    }

    if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
      for (const mapping of config.responseDataMappings) {
        if (!mapping.responsePath || !mapping.updatePath) continue;
        try {
          const extractedValue = getValueByPath(matched, mapping.responsePath);
          if (extractedValue !== undefined && extractedValue !== null && extractedValue !== '') {
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
          } else {
            console.log(`[AI-MAPPING] SKIPPED "${mapping.responsePath}" -> "${mapping.updatePath}": API value is null/empty, preserving PDF-extracted value`);
          }
        } catch (extractError) {
          console.error(`Failed to process response mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError);
        }
      }
    }

    const sub3End = new Date().toISOString();
    const sub3Duration = Date.now() - sub3StartMs;
    if (executionLogId && workflowId) {
      await createV2StepLog(
        supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
        { id: step.id, label: `${step.label} - AI Matching`, step_type: 'ai_decision', config_json: {} },
        'completed', sub3Start, sub3End, sub3Duration, null,
        { candidateCount: 1, skipAiIfSingleResult: true, resolvedSourceFields },
        { aiSkipped: true, reason: 'Single candidate - AI skipped', matchedRecord: matched, matchedValue, outputVariable: outputVariableName }
      );
    }

    const stepOutput = {
      url: fullUrl,
      method: httpMethod,
      candidateCount: 1,
      aiSkipped: true,
      reason: 'Single candidate - AI skipped',
      matchedRecord: matched,
      matchedValue,
      outputVariable: outputVariableName
    };
    return { stepOutput, responseData };
  }

  console.log('Calling Gemini to match source record against', candidates.length, 'candidates');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: activeKeyData } = await supabase
    .from('gemini_api_keys')
    .select('id, api_key')
    .eq('is_active', true)
    .maybeSingle();

  if (!activeKeyData?.api_key) {
    throw new Error('No active Gemini API key configured. Add your Gemini API key in Settings.');
  }

  let modelName = 'gemini-2.5-pro';
  const { data: activeModelData } = await supabase
    .from('gemini_models')
    .select('model_name')
    .eq('api_key_id', activeKeyData.id)
    .eq('is_active', true)
    .maybeSingle();

  if (activeModelData?.model_name) {
    modelName = activeModelData.model_name;
  }

  const genAI = new GoogleGenerativeAI(activeKeyData.api_key);
  const model = genAI.getGenerativeModel({ model: modelName });

  const sampleCandidate = candidates[0];
  const candidateKeys = Object.keys(sampleCandidate);
  const sourceLabels = Object.keys(resolvedSourceFields);
  const identifierKeys = candidateKeys.filter(k =>
    typeof sampleCandidate[k] === 'string' && sampleCandidate[k].length > 0 &&
    sourceLabels.some(label => label.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  if (identifierKeys.length === 0) {
    const fallbackKeys = candidateKeys
      .filter(k => typeof sampleCandidate[k] === 'string' && sampleCandidate[k].length > 0)
      .slice(0, 5);
    identifierKeys.push(...fallbackKeys);
  }
  console.log('Identifier keys for verification:', identifierKeys);

  const numberedCandidates = candidates.map((c: any, i: number) => ({ _index: i, ...c }));
  const candidatesJson = JSON.stringify(numberedCandidates, null, 2);
  const sourceJson = JSON.stringify(resolvedSourceFields, null, 2);

  const matchedFieldsInstruction = identifierKeys.length > 0
    ? `   - "matchedFields": an object with the EXACT values of these fields copied from the chosen candidate: ${identifierKeys.map(k => `"${k}"`).join(', ')}\n`
    : '';

  const prompt = `You are a data matching assistant. You MUST return exactly ONE match from the candidate list.

Each candidate has an "_index" field showing its position. Use this to determine the matchIndex.

SOURCE RECORD (the record we want to match):
${sourceJson}

CANDIDATE RECORDS (${candidates.length} total):
${candidatesJson}

${aiInstruction ? `MATCHING INSTRUCTIONS:\n${aiInstruction}\n` : ''}
RULES:
- You MUST select exactly ONE candidate. Never return multiple matches.
- If multiple candidates match equally well, select the FIRST one (lowest index).
- The "matchIndex" MUST equal the "_index" value of the chosen candidate.
- Return ONLY a valid JSON object with exactly these fields:
   - "matchIndex": the "_index" value of the single best matching candidate (integer)
   - "confidence": a number from 0 to 100 indicating match confidence
   - "reason": a brief explanation of why this candidate was chosen
${matchedFieldsInstruction}
If no candidate is a reasonable match, return:
   {"matchIndex": -1, "confidence": 0, "reason": "No suitable match found"}

Return ONLY the JSON object, no markdown formatting, no code blocks, no extra text.`;

  const result = await model.generateContent([{ text: prompt }]);
  const aiResponseText = result.response.text().trim();
  console.log('Gemini AI response:', aiResponseText);

  let aiResult: { matchIndex: number; confidence: number; reason: string };
  try {
    let cleaned = aiResponseText;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    aiResult = JSON.parse(cleaned.trim());
  } catch (parseError) {
    throw new Error(`AI Decision: Failed to parse Gemini response as JSON: ${aiResponseText}`);
  }

  if (typeof aiResult.matchIndex !== 'number' || !Number.isInteger(aiResult.matchIndex)) {
    console.warn(`AI returned non-integer matchIndex (${aiResult.matchIndex}), falling back to first candidate`);
    aiResult.matchIndex = 0;
    aiResult.reason = (aiResult.reason || '') + ' [Forced to first candidate - invalid matchIndex]';
  }

  console.log('AI match result:', JSON.stringify(aiResult));

  if (aiResult.matchIndex >= 0 && aiResult.matchIndex < candidates.length && identifierKeys.length > 0) {
    const recordAtIndex = candidates[aiResult.matchIndex];
    const matchedFields = (aiResult as any).matchedFields;
    if (matchedFields && typeof matchedFields === 'object') {
      const indexMatchesFields = identifierKeys.every(k =>
        String(recordAtIndex[k] || '').toLowerCase().trim() === String(matchedFields[k] || '').toLowerCase().trim()
      );
      if (!indexMatchesFields) {
        const originalIndex = aiResult.matchIndex;
        console.warn(`Index verification failed: record at index ${originalIndex} does not match matchedFields. Searching for correct record...`);
        const correctedIndex = candidates.findIndex((c: any) =>
          identifierKeys.every(k =>
            String(c[k] || '').toLowerCase().trim() === String(matchedFields[k] || '').toLowerCase().trim()
          )
        );
        if (correctedIndex !== -1) {
          console.log(`Index corrected from ${originalIndex} to ${correctedIndex}`);
          aiResult.matchIndex = correctedIndex;
          aiResult.reason = (aiResult.reason || '') + ` [Index corrected from ${originalIndex} to ${correctedIndex}]`;
        } else {
          console.warn('Could not find matching record by fields, trusting original AI index');
        }
      }
    }
  }

  if (aiResult.matchIndex === -1 || aiResult.matchIndex >= candidates.length) {
    const msg = `AI Decision: No confident match found. Reason: ${aiResult.reason}`;
    console.warn(msg);

    const sub3End = new Date().toISOString();
    const sub3Duration = Date.now() - sub3StartMs;
    if (executionLogId && workflowId) {
      await createV2StepLog(
        supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
        { id: step.id, label: `${step.label} - AI Matching`, step_type: 'ai_decision', config_json: {} },
        failOnNoMatch ? 'failed' : 'completed', sub3Start, sub3End, sub3Duration,
        failOnNoMatch ? msg : null,
        { candidateCount: candidates.length, resolvedSourceFields, aiInstruction, model: modelName },
        { aiResult, matchedRecord: null, matchedValue: null, outputVariable: outputVariableName }
      );
    }

    if (failOnNoMatch) {
      throw new Error(msg);
    }

    if (outputVariableName) {
      contextData[outputVariableName] = null;
      if (contextData.extractedData && typeof contextData.extractedData === 'object') {
        contextData.extractedData[outputVariableName] = null;
      }
    }

    const stepOutput = {
      url: fullUrl,
      method: httpMethod,
      candidateCount: candidates.length,
      aiResult,
      matchedRecord: null,
      matchedValue: null,
      outputVariable: outputVariableName
    };
    return { stepOutput, responseData };
  }

  const matchedRecord = candidates[aiResult.matchIndex];
  const matchedValue = returnFieldPath ? getValueByPath(matchedRecord, returnFieldPath) : matchedRecord;
  console.log('Matched record index:', aiResult.matchIndex);
  console.log('Matched value:', matchedValue);

  if (outputVariableName) {
    contextData[outputVariableName] = matchedValue;
    if (contextData.extractedData && typeof contextData.extractedData === 'object') {
      contextData.extractedData[outputVariableName] = matchedValue;
    }
    console.log(`Stored matched value in context as "${outputVariableName}":`, matchedValue);
  }

  if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
    for (const mapping of config.responseDataMappings) {
      if (!mapping.responsePath || !mapping.updatePath) continue;
      try {
        const extractedValue = getValueByPath(matchedRecord, mapping.responsePath);
        if (extractedValue !== undefined && extractedValue !== null && extractedValue !== '') {
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
        } else {
          console.log(`[AI-MAPPING] SKIPPED "${mapping.responsePath}" -> "${mapping.updatePath}": API value is null/empty, preserving PDF-extracted value`);
        }
      } catch (extractError) {
        console.error(`Failed to process response mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError);
      }
    }
  }

  const sub3End = new Date().toISOString();
  const sub3Duration = Date.now() - sub3StartMs;
  if (executionLogId && workflowId) {
    await createV2StepLog(
      supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
      { id: step.id, label: `${step.label} - AI Matching`, step_type: 'ai_decision', config_json: {} },
      'completed', sub3Start, sub3End, sub3Duration, null,
      { candidateCount: candidates.length, resolvedSourceFields, aiInstruction, model: modelName },
      { aiResult, matchedRecord, matchedValue, outputVariable: outputVariableName }
    );
  }

  const stepOutput = {
    url: fullUrl,
    method: httpMethod,
    candidateCount: candidates.length,
    aiResult,
    matchedRecord,
    matchedValue,
    outputVariable: outputVariableName,
    model: modelName
  };

  console.log('=== AI DECISION STEP COMPLETED ===');
  return { stepOutput, responseData };
}
