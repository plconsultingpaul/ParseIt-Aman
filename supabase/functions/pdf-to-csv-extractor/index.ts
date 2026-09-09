import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type FunctionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty';

interface FunctionCondition {
  if: {
    field: string;
    operator: FunctionOperator;
    value: any;
  };
  then: any;
}

interface FunctionLogic {
  conditions: FunctionCondition[];
  default?: any;
}

function getFieldValue(fieldPath: string, data: Record<string, any>): any {
  if (!fieldPath || !data) return undefined;

  const parts = fieldPath.split('.');
  let value: any = data;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[part];
  }

  return value;
}

function evaluateCondition(condition: FunctionCondition['if'], data: Record<string, any>): boolean {
  const { field, operator, value: expectedValue } = condition;
  const actualValue = getFieldValue(field, data);

  switch (operator) {
    case 'equals':
      return actualValue === expectedValue;

    case 'not_equals':
      return actualValue !== expectedValue;

    case 'in':
      if (!Array.isArray(expectedValue)) return false;
      return expectedValue.includes(actualValue);

    case 'not_in':
      if (!Array.isArray(expectedValue)) return true;
      return !expectedValue.includes(actualValue);

    case 'greater_than':
      return Number(actualValue) > Number(expectedValue);

    case 'less_than':
      return Number(actualValue) < Number(expectedValue);

    case 'contains':
      if (typeof actualValue !== 'string') return false;
      return actualValue.includes(String(expectedValue));

    case 'starts_with':
      if (typeof actualValue !== 'string') return false;
      return actualValue.startsWith(String(expectedValue));

    case 'ends_with':
      if (typeof actualValue !== 'string') return false;
      return actualValue.endsWith(String(expectedValue));

    case 'is_empty':
      return actualValue === null || actualValue === undefined || actualValue === '' ||
             (Array.isArray(actualValue) && actualValue.length === 0);

    case 'is_not_empty':
      return actualValue !== null && actualValue !== undefined && actualValue !== '' &&
             (!Array.isArray(actualValue) || actualValue.length > 0);

    default:
      return false;
  }
}

function evaluateFunction(functionLogic: FunctionLogic, data: Record<string, any>): any {
  if (!functionLogic || !functionLogic.conditions) {
    console.log('[evaluateFunction] No function logic or conditions, returning default:', functionLogic?.default);
    return functionLogic?.default;
  }

  console.log(`[evaluateFunction] Evaluating ${functionLogic.conditions.length} conditions`);

  for (let i = 0; i < functionLogic.conditions.length; i++) {
    const condition = functionLogic.conditions[i];
    const fieldValue = getFieldValue(condition.if.field, data);

    console.log(`[evaluateFunction] Condition ${i + 1}:`);
    console.log(`[evaluateFunction]   - Field: "${condition.if.field}"`);
    console.log(`[evaluateFunction]   - Field value: "${fieldValue}"`);
    console.log(`[evaluateFunction]   - Operator: "${condition.if.operator}"`);
    console.log(`[evaluateFunction]   - Expected value: "${condition.if.value}"`);

    const conditionResult = evaluateCondition(condition.if, data);
    console.log(`[evaluateFunction]   - Condition result: ${conditionResult}`);

    if (conditionResult) {
      console.log(`[evaluateFunction]   - ✓ Condition matched! Returning: "${condition.then}"`);
      return condition.then;
    }
  }

  console.log(`[evaluateFunction] No conditions matched, returning default: "${functionLogic.default}"`);
  return functionLogic.default;
}

interface FieldMapping {
  fieldName: string;
  type: "ai" | "mapped" | "hardcoded" | "function";
  value: string;
  dataType?: "string" | "number" | "integer" | "datetime" | "phone" | "boolean";
  maxLength?: number;
  dateOnly?: boolean;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  isWorkflowOnly?: boolean;
  functionId?: string;
}

interface ExtractionRequest {
  pdfBase64?: string;
  pdfBase64Array?: string[];
  fieldMappings: FieldMapping[];
  instructions: string;
  rowDetectionInstructions: string;
  delimiter?: string;
  includeHeaders?: boolean;
}

function escapeCsvValue(value: any, delimiter: string = ','): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  const needsQuoting =
    stringValue.includes(delimiter) ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsQuoting) {
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

function generateCsvHeader(fieldMappings: FieldMapping[], delimiter: string): string {
  const headers = fieldMappings.map(mapping => mapping.fieldName);
  return headers.map(header => escapeCsvValue(header, delimiter)).join(delimiter);
}

function generateCsvRow(rowData: any, fieldMappings: FieldMapping[], delimiter: string): string {
  const values = fieldMappings.map(mapping => {
    const value = rowData[mapping.fieldName];

    if (value === null || value === undefined) {
      return '';
    }

    const dataType = mapping.dataType || 'string';

    switch (dataType) {
      case 'number':
      case 'integer':
        if (typeof value === 'number') {
          return String(value);
        }
        const numValue = parseFloat(String(value));
        return isNaN(numValue) ? '' : String(numValue);

      case 'boolean':
        return value ? 'true' : 'false';

      case 'datetime':
        return escapeCsvValue(value, delimiter);

      case 'phone':
        const cleanPhone = String(value).replace(/[^0-9+\-() ]/g, '');
        return escapeCsvValue(cleanPhone, delimiter);

      case 'string':
      default:
        let stringValue = String(value);
        if (mapping.maxLength && stringValue.length > mapping.maxLength) {
          stringValue = stringValue.substring(0, mapping.maxLength);
        }
        return escapeCsvValue(stringValue, delimiter);
    }
  });

  return values.join(delimiter);
}

Deno.serve(async (req: Request) => {
  const requestStartTime = performance.now();

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  console.log('\n[EdgeFunction] ============================================');
  console.log('[EdgeFunction] 🚀 === PDF TO CSV EXTRACTOR START ===');
  console.log('[EdgeFunction] Timestamp:', new Date().toISOString());
  console.log('[EdgeFunction] Request method:', req.method);
  console.log('[EdgeFunction] Request URL:', req.url);

  try {
    console.log('[EdgeFunction] Parsing request body...');
    const parseStartTime = performance.now();
    const requestData: ExtractionRequest = await req.json();
    const parseEndTime = performance.now();
    console.log(`[EdgeFunction] Request parsed in ${((parseEndTime - parseStartTime) / 1000).toFixed(3)}s`);

    console.log('[EdgeFunction] 📥 Request details:');
    console.log('[EdgeFunction] - Field mappings count:', requestData.fieldMappings?.length || 0);
    console.log('[EdgeFunction] - Single PDF mode:', !!requestData.pdfBase64);
    console.log('[EdgeFunction] - Multi-page PDF mode:', !!requestData.pdfBase64Array);
    console.log('[EdgeFunction] - PDF count:', requestData.pdfBase64Array?.length || 1);
    console.log('[EdgeFunction] - Row detection instructions length:', requestData.rowDetectionInstructions?.length || 0);
    console.log('[EdgeFunction] - Delimiter:', JSON.stringify(requestData.delimiter || ','));
    console.log('[EdgeFunction] - Include headers:', requestData.includeHeaders !== false);

    // Validate that we have either single PDF or array of PDFs
    if ((!requestData.pdfBase64 && !requestData.pdfBase64Array) || !requestData.fieldMappings || requestData.fieldMappings.length === 0) {
      console.error('[EdgeFunction] ❌ Validation failed: Missing required fields');
      console.error('[EdgeFunction] - Has pdfBase64:', !!requestData.pdfBase64);
      console.error('[EdgeFunction] - Has pdfBase64Array:', !!requestData.pdfBase64Array);
      console.error('[EdgeFunction] - Field mappings count:', requestData.fieldMappings?.length || 0);
      return new Response(
        JSON.stringify({ error: "Missing required fields: (pdfBase64 or pdfBase64Array) and fieldMappings are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const delimiter = requestData.delimiter || ',';
    const includeHeaders = requestData.includeHeaders !== false;

    // Filter out workflow-only fields for final output
    const outputFieldMappings = requestData.fieldMappings.filter(mapping => !mapping.isWorkflowOnly);
    const workflowOnlyCount = requestData.fieldMappings.length - outputFieldMappings.length;

    console.log('[EdgeFunction] Field mappings filtered:');
    console.log('[EdgeFunction] - Total field mappings:', requestData.fieldMappings.length);
    console.log('[EdgeFunction] - Output field mappings:', outputFieldMappings.length);
    console.log('[EdgeFunction] - Workflow-only fields (excluded):', workflowOnlyCount);

    console.log('[EdgeFunction] Fetching active Gemini model configuration...');
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: activeKeyData } = await supabase
      .from("gemini_api_keys")
      .select("id, api_key")
      .eq("is_active", true)
      .maybeSingle();

    if (!activeKeyData?.api_key) {
      throw new Error('No active Gemini API key found. Please configure one in Settings → Gemini Configuration.');
    }

    let modelName = "gemini-2.5-pro";
    const { data: activeModelData } = await supabase
      .from("gemini_models")
      .select("model_name")
      .eq("api_key_id", activeKeyData.id)
      .eq("is_active", true)
      .maybeSingle();

    if (activeModelData?.model_name) {
      modelName = activeModelData.model_name;
      console.log('[EdgeFunction] Using active Gemini model:', modelName);
    } else {
      console.log('[EdgeFunction] No active model configuration found, using default:', modelName);
    }

    console.log('[EdgeFunction] Initializing Gemini AI...');
    const initStartTime = performance.now();
    const genAI = new GoogleGenerativeAI(activeKeyData.api_key);
    const model = genAI.getGenerativeModel({ model: modelName });
    const initEndTime = performance.now();
    console.log(`[EdgeFunction] Gemini initialized with model ${modelName} in ${((initEndTime - initStartTime) / 1000).toFixed(3)}s`);

    const aiFieldDescriptions = requestData.fieldMappings
      .filter(m => m.type === 'ai')
      .map(m => `- ${m.fieldName}: ${m.value || 'extract this field'}`)
      .join('\n');

    const mappedFieldDescriptions = requestData.fieldMappings
      .filter(m => m.type === 'mapped')
      .map(m => `- ${m.fieldName}: Look in the region at coordinates ${m.value} (use these coordinates as a hint to locate the field)`)
      .join('\n');

    const fieldDescriptions = [aiFieldDescriptions, mappedFieldDescriptions].filter(Boolean).join('\n');

    const hardcodedFields = requestData.fieldMappings
      .filter(m => m.type === 'hardcoded')
      .map(m => `- ${m.fieldName}: always set to "${m.value}"`)
      .join('\n');

    const isMultiPage = requestData.pdfBase64Array && requestData.pdfBase64Array.length > 1;
    const pageInfo = isMultiPage
      ? `You are analyzing ${requestData.pdfBase64Array.length} PDF pages that should be processed together as a single document.`
      : 'You are analyzing a PDF document to extract data into CSV format.';

    const prompt = `${pageInfo}

ROW DETECTION INSTRUCTIONS:
${requestData.rowDetectionInstructions || 'Extract each logical record as a separate row'}
${isMultiPage ? '\n⚠️ IMPORTANT: Process ALL pages together. Extract rows from ALL pages in the order they appear. Do not stop after processing just one page.' : ''}

EXTRACTION INSTRUCTIONS:
${requestData.instructions}

FIELDS TO EXTRACT (for each row):
${fieldDescriptions}

${hardcodedFields ? `HARDCODED FIELDS (always include these with the specified values):\n${hardcodedFields}\n` : ''}

IMPORTANT RULES:
1. Identify all rows in the document based on the row detection instructions
2. Extract data for EVERY field listed above for EACH row
3. Return your response as a JSON array where each element represents one row
4. Each row should be a JSON object with keys matching the field names exactly
5. If a field value is not found in the PDF, use null
6. For hardcoded fields, always use the exact value specified
7. Extract ALL rows from the document - do not skip any
8. Maintain data accuracy - extract exactly what you see in the PDF

Example response format:
[
  {
    "fieldName1": "value1",
    "fieldName2": "value2",
    "fieldName3": "value3"
  },
  {
    "fieldName1": "value4",
    "fieldName2": "value5",
    "fieldName3": "value6"
  }
]

Please analyze the PDF and return the extracted data as a JSON array.`;

    // Build the content array for Gemini - support both single and multi-page PDFs
    const contentParts: any[] = [];

    if (requestData.pdfBase64Array && requestData.pdfBase64Array.length > 0) {
      // Multi-page mode: add all PDFs
      console.log('[EdgeFunction] Processing multiple PDFs:', requestData.pdfBase64Array.length);
      for (let i = 0; i < requestData.pdfBase64Array.length; i++) {
        const pdfData = requestData.pdfBase64Array[i].replace(/^data:application\/pdf;base64,/, '');
        contentParts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: pdfData
          }
        });
      }
    } else if (requestData.pdfBase64) {
      // Single page mode: add single PDF
      console.log('[EdgeFunction] Processing single PDF');
      const pdfData = requestData.pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      contentParts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: pdfData
        }
      });
    }

    // Add the prompt
    contentParts.push(prompt);

    console.log('[EdgeFunction] 📤 Preparing to send request to Gemini AI');
    console.log('[EdgeFunction] Prompt length:', prompt.length, 'characters');
    console.log('[EdgeFunction] Content parts:', contentParts.length);
    console.log('[EdgeFunction] ⏱️  Calling Gemini API (this typically takes 20-90 seconds)...');

    const geminiStartTime = performance.now();
    console.log('[EdgeFunction] Gemini API call starting at:', new Date().toISOString());
    const result = await model.generateContent(contentParts);
    const geminiEndTime = performance.now();
    const geminiDuration = ((geminiEndTime - geminiStartTime) / 1000).toFixed(2);
    console.log(`[EdgeFunction] ✅ Gemini API responded in ${geminiDuration}s`);

    const response = await result.response;
    const text = response.text();

    console.log('[EdgeFunction] 📥 Gemini response details:');
    console.log('[EdgeFunction] Response length:', text.length, 'characters');
    console.log('[EdgeFunction] Response preview (first 200 chars):', text.substring(0, 200));

    console.log('[EdgeFunction] Parsing JSON from AI response...');
    const parseJsonStartTime = performance.now();
    let jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('[EdgeFunction] Array pattern not found, trying object pattern...');
      jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('[EdgeFunction] Found object, converting to array...');
        const parsedObj = JSON.parse(jsonMatch[0]);
        jsonMatch = [`[${JSON.stringify(parsedObj)}]`];
      }
    }

    if (!jsonMatch) {
      console.error('[EdgeFunction] ❌ Could not find valid JSON in AI response');
      console.error('[EdgeFunction] Response text:', text);
      throw new Error('Could not find valid JSON array in AI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    const parseJsonEndTime = performance.now();
    console.log(`[EdgeFunction] JSON parsed in ${((parseJsonEndTime - parseJsonStartTime) / 1000).toFixed(3)}s`);
    console.log('[EdgeFunction] ✅ Extracted data details:');
    console.log('[EdgeFunction] - Rows extracted:', extractedData.length);
    console.log('[EdgeFunction] - First row keys:', extractedData.length > 0 ? Object.keys(extractedData[0]).join(', ') : 'N/A');

    if (!Array.isArray(extractedData) || extractedData.length === 0) {
      console.error('[EdgeFunction] ❌ Extracted data is invalid');
      console.error('[EdgeFunction] - Is array:', Array.isArray(extractedData));
      console.error('[EdgeFunction] - Length:', extractedData?.length || 0);
      throw new Error('Extracted data is not a valid array or is empty');
    }

    console.log('[EdgeFunction] Applying hardcoded fields...');
    const hardcodedFieldsList = requestData.fieldMappings.filter(m => m.type === 'hardcoded');
    console.log('[EdgeFunction] - Hardcoded fields count:', hardcodedFieldsList.length);
    for (const mapping of hardcodedFieldsList) {
      for (const row of extractedData) {
        row[mapping.fieldName] = mapping.value;
      }
    }

    console.log('[EdgeFunction] Applying function-based fields...');
    const functionFieldsList = requestData.fieldMappings.filter(m => m.type === 'function' && m.functionId);
    console.log('[EdgeFunction] - Function fields count:', functionFieldsList.length);

    if (functionFieldsList.length > 0) {
      const functionIds = [...new Set(functionFieldsList.map(m => m.functionId))];
      const { data: functions, error: funcError } = await supabase
        .from('field_mapping_functions')
        .select('*')
        .in('id', functionIds);

      if (funcError) {
        console.error('[EdgeFunction] Error loading functions:', funcError);
      } else if (functions && functions.length > 0) {
        console.log('[EdgeFunction] - Loaded functions:', functions.length);
        const functionsById = new Map(functions.map(f => [f.id, f]));

        for (const mapping of functionFieldsList) {
          const func = functionsById.get(mapping.functionId!);
          if (func) {
            console.log(`[EdgeFunction] - Evaluating function "${func.function_name}" for field "${mapping.fieldName}"`);
            console.log(`[EdgeFunction]   - Function logic:`, JSON.stringify(func.function_logic, null, 2));

            for (let i = 0; i < extractedData.length; i++) {
              const row = extractedData[i];

              if (i === 0) {
                console.log(`[EdgeFunction]   - Row ${i + 1} available fields:`, Object.keys(row).join(', '));
                console.log(`[EdgeFunction]   - Row ${i + 1} data sample:`, JSON.stringify(row, null, 2));
              }

              try {
                const result = evaluateFunction(func.function_logic, row);
                row[mapping.fieldName] = result;

                if (i === 0) {
                  console.log(`[EdgeFunction]   - Row ${i + 1} evaluated result: "${result}"`);
                  console.log(`[EdgeFunction]   - Result type: ${typeof result}, is null: ${result === null}, is undefined: ${result === undefined}`);
                }
              } catch (err) {
                console.error(`[EdgeFunction] Error evaluating function for field "${mapping.fieldName}" on row ${i + 1}:`, err);
                console.error(`[EdgeFunction] - Error details:`, err instanceof Error ? err.message : String(err));
                const defaultValue = func.function_logic?.default || null;
                row[mapping.fieldName] = defaultValue;

                if (i === 0) {
                  console.log(`[EdgeFunction]   - Using default value: "${defaultValue}"`);
                }
              }
            }

            console.log(`[EdgeFunction]   - Completed function evaluation for all ${extractedData.length} rows`);
          } else {
            console.warn(`[EdgeFunction] Function not found for mapping "${mapping.fieldName}" with ID: ${mapping.functionId}`);
          }
        }
      }
    }

    console.log('[EdgeFunction] Generating CSV...');
    const csvStartTime = performance.now();
    const csvLines: string[] = [];

    if (includeHeaders) {
      csvLines.push(generateCsvHeader(outputFieldMappings, delimiter));
    }

    for (const row of extractedData) {
      csvLines.push(generateCsvRow(row, outputFieldMappings, delimiter));
    }

    const csvContent = csvLines.join('\n');
    const csvEndTime = performance.now();
    console.log(`[EdgeFunction] CSV generated in ${((csvEndTime - csvStartTime) / 1000).toFixed(3)}s`);

    console.log('[EdgeFunction] ✅ CSV generation successful:');
    console.log('[EdgeFunction] - Total lines:', csvLines.length);
    console.log('[EdgeFunction] - CSV content length:', csvContent.length, 'characters');
    console.log('[EdgeFunction] - CSV size:', (csvContent.length / 1024).toFixed(2), 'KB');
    console.log('[EdgeFunction] - Fields included in output:', outputFieldMappings.length);
    console.log('[EdgeFunction] - Workflow-only fields excluded:', workflowOnlyCount);

    const requestEndTime = performance.now();
    const totalDuration = ((requestEndTime - requestStartTime) / 1000).toFixed(2);

    console.log('[EdgeFunction] 🎉 === REQUEST COMPLETED SUCCESSFULLY ===');
    console.log(`[EdgeFunction] Total processing time: ${totalDuration}s`);
    console.log('[EdgeFunction] Time breakdown:');
    console.log(`[EdgeFunction]   - Request parsing: ${((parseEndTime - parseStartTime) / 1000).toFixed(3)}s`);
    console.log(`[EdgeFunction]   - Gemini initialization: ${((initEndTime - initStartTime) / 1000).toFixed(3)}s`);
    console.log(`[EdgeFunction]   - Gemini API call: ${geminiDuration}s`);
    console.log(`[EdgeFunction]   - JSON parsing: ${((parseJsonEndTime - parseJsonStartTime) / 1000).toFixed(3)}s`);
    console.log(`[EdgeFunction]   - CSV generation: ${((csvEndTime - csvStartTime) / 1000).toFixed(3)}s`);
    console.log('[EdgeFunction] ============================================\n');

    return new Response(
      JSON.stringify({
        success: true,
        csvContent,
        rowCount: extractedData.length,
        fieldCount: outputFieldMappings.length,
        totalFieldCount: requestData.fieldMappings.length,
        workflowOnlyFieldCount: workflowOnlyCount
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    const errorTime = performance.now();
    const errorDuration = ((errorTime - requestStartTime) / 1000).toFixed(2);
    console.error('[EdgeFunction] ❌ === PDF TO CSV EXTRACTION FAILED ===');
    console.error('[EdgeFunction] Error occurred after:', errorDuration, 's');
    console.error('[EdgeFunction] Error type:', error?.constructor?.name || 'Unknown');
    console.error('[EdgeFunction] Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[EdgeFunction] Error stack:', error instanceof Error ? error.stack : 'N/A');
    console.error('[EdgeFunction] Full error object:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        error: "PDF to CSV extraction failed",
        details: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});