import { getValueByPath, createV2StepLog } from "../utils.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1";
import { createClient } from "npm:@supabase/supabase-js@2";

interface EmailFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'ai' | 'function';
  value: string;
  location: 'subject' | 'body';
  dataType: string;
}

function castValue(raw: any, dataType: string): any {
  if (raw === null || raw === undefined) return raw;
  const str = String(raw).trim();
  switch (dataType) {
    case 'number':
      return str === '' ? null : Number(str);
    case 'integer':
      return str === '' ? null : parseInt(str, 10);
    case 'boolean':
      return str === 'true' || str === '1' || str === 'yes';
    case 'date_only': {
      if (str === '') return null;
      const d = new Date(str);
      return isNaN(d.getTime()) ? str : d.toISOString().split('T')[0];
    }
    case 'datetime': {
      if (str === '') return null;
      const dt = new Date(str);
      return isNaN(dt.getTime()) ? str : dt.toISOString();
    }
    case 'rin':
      return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    default:
      return str;
  }
}

function resolveTemplate(template: string, contextData: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
    const val = getValueByPath(contextData, varName.trim());
    if (val !== undefined && val !== null) return String(val);
    return _match;
  });
}

export async function executeReadEmail(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  executionLogId?: string | null,
  workflowId?: string
): Promise<{ stepOutput: any }> {
  console.log('=== EXECUTING READ EMAIL STEP ===');
  const config = step.config_json || {};
  const mappings: EmailFieldMapping[] = config.emailFieldMappings || [];

  if (mappings.length === 0) {
    console.log('No email field mappings configured, skipping');
    return { stepOutput: { skipped: true, reason: 'No email field mappings configured' } };
  }

  const results: Record<string, any> = {};
  const subStepStart = new Date().toISOString();
  const subStepStartMs = Date.now();

  const hardcodedMappings = mappings.filter(m => m.type === 'hardcoded');
  const functionMappings = mappings.filter(m => m.type === 'function');
  const aiMappings = mappings.filter(m => m.type === 'ai');

  for (const mapping of hardcodedMappings) {
    if (!mapping.fieldName) continue;
    const casted = castValue(mapping.value, mapping.dataType || 'string');
    results[mapping.fieldName] = casted;
    console.log(`Hardcoded: ${mapping.fieldName} = ${JSON.stringify(casted)}`);
  }

  for (const mapping of functionMappings) {
    if (!mapping.fieldName) continue;
    const resolved = resolveTemplate(mapping.value || '', contextData);
    const casted = castValue(resolved, mapping.dataType || 'string');
    results[mapping.fieldName] = casted;
    console.log(`Function: ${mapping.fieldName} = ${JSON.stringify(casted)}`);
  }

  if (executionLogId && workflowId) {
    const subStepEnd = new Date().toISOString();
    const subStepDuration = Date.now() - subStepStartMs;
    await createV2StepLog(
      supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
      { id: step.id, label: `${step.label} - Hardcoded & Function Fields`, step_type: 'read_email', config_json: {} },
      'completed', subStepStart, subStepEnd, subStepDuration, null,
      { hardcodedCount: hardcodedMappings.length, functionCount: functionMappings.length },
      { results: { ...results } }
    );
  }

  if (aiMappings.length > 0) {
    const aiStart = new Date().toISOString();
    const aiStartMs = Date.now();

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

    const emailSubject = contextData.emailSubject || '';
    const emailBody = contextData.emailBody || '';

    const fieldDescriptions = aiMappings.map(m => {
      const loc = m.location === 'subject' ? 'EMAIL SUBJECT' : 'EMAIL BODY';
      const dt = m.dataType || 'string';
      return `- "${m.fieldName}" (${dt}): ${m.value} [Source: ${loc}]`;
    }).join('\n');

    const prompt = `You are a data extraction assistant. Extract the following fields from the provided email content.

EMAIL SUBJECT:
${emailSubject}

EMAIL BODY:
${emailBody}

FIELDS TO EXTRACT:
${fieldDescriptions}

RULES:
- Return ONLY a valid JSON object with the field names as keys and extracted values.
- For each field, use the instruction and source location to find the correct value.
- If a field cannot be found, use null as the value.
- For number/integer types, return numeric values (not strings).
- For boolean types, return true or false.
- For date_only types, return in YYYY-MM-DD format.
- For datetime types, return in ISO 8601 format.
- For rin types, return alphanumeric characters only in uppercase.

Return ONLY the JSON object, no markdown formatting, no code blocks, no extra text.`;

    console.log(`Calling Gemini (${modelName}) for ${aiMappings.length} AI field(s)`);
    const result = await model.generateContent([{ text: prompt }]);
    const aiResponseText = result.response.text().trim();
    console.log('Gemini AI response:', aiResponseText);

    let aiResult: Record<string, any>;
    try {
      let cleaned = aiResponseText;
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      aiResult = JSON.parse(cleaned.trim());
    } catch (parseError) {
      throw new Error(`Read Email: Failed to parse Gemini response as JSON: ${aiResponseText}`);
    }

    for (const mapping of aiMappings) {
      if (!mapping.fieldName) continue;
      const rawValue = aiResult[mapping.fieldName];
      const casted = castValue(rawValue, mapping.dataType || 'string');
      results[mapping.fieldName] = casted;
      console.log(`AI: ${mapping.fieldName} = ${JSON.stringify(casted)}`);
    }

    if (executionLogId && workflowId) {
      const aiEnd = new Date().toISOString();
      const aiDuration = Date.now() - aiStartMs;
      await createV2StepLog(
        supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
        { id: step.id, label: `${step.label} - AI Extraction`, step_type: 'read_email', config_json: {} },
        'completed', aiStart, aiEnd, aiDuration, null,
        { aiMappingCount: aiMappings.length, model: modelName, emailSubjectLength: emailSubject.length, emailBodyLength: emailBody.length },
        { aiResponse: aiResult, extractedFields: Object.fromEntries(aiMappings.map(m => [m.fieldName, results[m.fieldName]])) }
      );
    }
  }

  if (!contextData.extractedData || typeof contextData.extractedData !== 'object') {
    contextData.extractedData = {};
  }
  for (const [fieldName, value] of Object.entries(results)) {
    contextData[fieldName] = value;
    contextData.extractedData[fieldName] = value;
  }

  console.log(`Read Email: Set ${Object.keys(results).length} field(s) in contextData`);
  console.log('=== READ EMAIL STEP COMPLETED ===');

  return {
    stepOutput: {
      fieldsExtracted: Object.keys(results).length,
      fields: results,
      aiFieldCount: aiMappings.length,
      hardcodedFieldCount: hardcodedMappings.length,
      functionFieldCount: functionMappings.length
    }
  };
}
