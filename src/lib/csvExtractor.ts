import type { FieldMapping } from '../types';
import { callGeminiProxy } from './geminiProxy';

export interface ExtractionResult {
  templateData: string;
  workflowOnlyData: string;
}

interface CsvExtractionRequest {
  pdfFile: File;
  defaultInstructions: string;
  additionalInstructions?: string;
  fieldMappings?: FieldMapping[];
  rowDetectionInstructions?: string;
  delimiter?: string;
  includeHeaders?: boolean;
}

interface CsvMultiPageExtractionRequest {
  pdfFiles: File[];
  defaultInstructions: string;
  additionalInstructions?: string;
  fieldMappings?: FieldMapping[];
  rowDetectionInstructions?: string;
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
  const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
  const headers = regularMappings.map(mapping => mapping.fieldName);
  return headers.map(header => escapeCsvValue(header, delimiter)).join(delimiter);
}

function generateCsvRow(rowData: any, fieldMappings: FieldMapping[], delimiter: string): string {
  const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
  const values = regularMappings.map(mapping => {
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
      case 'date':
      case 'time':
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

export async function extractCsvFromPDF(request: CsvExtractionRequest): Promise<ExtractionResult> {
  const overallStartTime = performance.now();
  const {
    pdfFile,
    defaultInstructions,
    additionalInstructions,
    fieldMappings = [],
    rowDetectionInstructions = 'Extract each logical record as a separate row',
    delimiter = ',',
    includeHeaders = true
  } = request;

  const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
  const wfoMappings = fieldMappings.filter(m => m.isWorkflowOnly);

  console.log('\n[csvExtractor] ============================================');
  console.log('[csvExtractor] === CSV EXTRACTION START ===');
  console.log('[csvExtractor] Timestamp:', new Date().toISOString());
  console.log('[csvExtractor] PDF file:', pdfFile.name);
  console.log('[csvExtractor] File size:', (pdfFile.size / 1024).toFixed(2), 'KB');
  console.log('[csvExtractor] Total field mappings:', fieldMappings.length);
  console.log('[csvExtractor] Regular field mappings:', regularMappings.length);
  console.log('[csvExtractor] WFO field mappings:', wfoMappings.length);
  console.log('[csvExtractor] Row detection instructions:', rowDetectionInstructions.substring(0, 100));
  console.log('[csvExtractor] Delimiter:', JSON.stringify(delimiter));
  console.log('[csvExtractor] Include headers:', includeHeaders);

  if (!fieldMappings || fieldMappings.length === 0) {
    console.error('[csvExtractor] ❌ ERROR: No field mappings provided');
    throw new Error('Field mappings are required for CSV extraction');
  }

  console.log('[csvExtractor] Starting file to base64 conversion...');
  const base64StartTime = performance.now();
  const pdfBase64 = await fileToBase64(pdfFile);
  const base64EndTime = performance.now();
  console.log(`[csvExtractor] Base64 conversion completed in ${((base64EndTime - base64StartTime) / 1000).toFixed(2)}s`);
  console.log(`[csvExtractor] Base64 size: ${(pdfBase64.length / 1024).toFixed(2)} KB`);

  const combinedInstructions = additionalInstructions
    ? `${defaultInstructions}\n\nAdditional context: ${additionalInstructions}`
    : defaultInstructions;

  const fieldDescriptions = fieldMappings
    .filter(m => m.type === 'ai')
    .map(m => `- ${m.fieldName}: ${m.value || 'extract this field'}`)
    .join('\n');

  const hardcodedFields = fieldMappings
    .filter(m => m.type === 'hardcoded')
    .map(m => `- ${m.fieldName}: always set to "${m.value}"`)
    .join('\n');

  const prompt = `You are analyzing a PDF document to extract data into CSV format.

ROW DETECTION INSTRUCTIONS:
${rowDetectionInstructions || 'Extract each logical record as a separate row'}

EXTRACTION INSTRUCTIONS:
${combinedInstructions}

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

  console.log('[csvExtractor] 📤 Preparing to send request to Gemini AI');
  console.log('[csvExtractor] Prompt length:', prompt.length, 'characters');
  console.log('[csvExtractor] ⏱️  Calling Gemini API (this typically takes 20-60 seconds)...');

  const geminiStartTime = performance.now();

  const contentParts = [
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64
      }
    },
    prompt
  ];

  const text = await callGeminiProxy(contentParts, 'CSV extraction (single page)');
  const geminiEndTime = performance.now();
  const fetchDuration = ((geminiEndTime - geminiStartTime) / 1000).toFixed(2);
  console.log(`[csvExtractor] ✅ Gemini API responded in ${fetchDuration}s`);

  console.log('[csvExtractor] 📥 Gemini response details:');
  console.log('[csvExtractor] Response length:', text.length, 'characters');
  console.log('[csvExtractor] Response preview (first 200 chars):', text.substring(0, 200));

  console.log('[csvExtractor] Parsing JSON from AI response...');
  let jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('[csvExtractor] Array pattern not found, trying object pattern...');
    jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('[csvExtractor] Found object, converting to array...');
      const parsedObj = JSON.parse(jsonMatch[0]);
      jsonMatch = [`[${JSON.stringify(parsedObj)}]`];
    }
  }

  if (!jsonMatch) {
    console.error('[csvExtractor] ❌ Could not find valid JSON in AI response');
    console.error('[csvExtractor] Response text:', text);
    throw new Error('Could not find valid JSON array in AI response');
  }

  const extractedData = JSON.parse(jsonMatch[0]);

  console.log('[csvExtractor] ✅ Extracted data details:');
  console.log('[csvExtractor] - Rows extracted:', extractedData.length);
  console.log('[csvExtractor] - First row keys:', extractedData.length > 0 ? Object.keys(extractedData[0]).join(', ') : 'N/A');

  if (!Array.isArray(extractedData) || extractedData.length === 0) {
    console.error('[csvExtractor] ❌ Extracted data is invalid');
    console.error('[csvExtractor] - Is array:', Array.isArray(extractedData));
    console.error('[csvExtractor] - Length:', extractedData?.length || 0);
    throw new Error('Extracted data is not a valid array or is empty');
  }

  console.log('[csvExtractor] Applying hardcoded fields...');
  const hardcodedFieldsList = fieldMappings.filter(m => m.type === 'hardcoded');
  console.log('[csvExtractor] - Hardcoded fields count:', hardcodedFieldsList.length);
  for (const mapping of hardcodedFieldsList) {
    for (const row of extractedData) {
      row[mapping.fieldName] = mapping.value;
    }
  }

  console.log('[csvExtractor] Generating CSV...');
  const csvStartTime = performance.now();
  const csvLines: string[] = [];

  if (includeHeaders) {
    csvLines.push(generateCsvHeader(fieldMappings, delimiter));
  }

  for (const row of extractedData) {
    csvLines.push(generateCsvRow(row, fieldMappings, delimiter));
  }

  const csvContent = csvLines.join('\n');
  const csvEndTime = performance.now();
  console.log(`[csvExtractor] CSV generated in ${((csvEndTime - csvStartTime) / 1000).toFixed(3)}s`);

  console.log('[csvExtractor] ✅ CSV generation successful:');
  console.log('[csvExtractor] - Total lines:', csvLines.length);
  console.log('[csvExtractor] - CSV content length:', csvContent.length, 'characters');
  console.log('[csvExtractor] - CSV size:', (csvContent.length / 1024).toFixed(2), 'KB');

  const overallEndTime = performance.now();
  const totalDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(2);

  // Extract WFO data if there are WFO mappings
  let workflowOnlyData = '{}';
  if (wfoMappings.length > 0 && extractedData.length > 0) {
    const wfoData: any = {};
    // For each WFO field, extract the value from the first row (or aggregate if needed)
    for (const wfoMapping of wfoMappings) {
      const fieldName = wfoMapping.fieldName;
      // Get value from first row by default
      wfoData[fieldName] = extractedData[0][fieldName] || null;
    }
    workflowOnlyData = JSON.stringify(wfoData);
    console.log('[csvExtractor] WFO data extracted:', workflowOnlyData);
  }

  console.log('[csvExtractor] ✅ === CSV EXTRACTION SUCCESS ===');
  console.log('[csvExtractor] Rows extracted:', extractedData.length);
  console.log('[csvExtractor] Regular field count:', regularMappings.length);
  console.log('[csvExtractor] WFO field count:', wfoMappings.length);
  console.log('[csvExtractor] CSV content length:', csvContent.length, 'characters');
  console.log(`[csvExtractor] Total extraction time: ${totalDuration}s`);
  console.log('[csvExtractor] Time breakdown:');
  console.log(`[csvExtractor]   - Base64 conversion: ${((base64EndTime - base64StartTime) / 1000).toFixed(2)}s`);
  console.log(`[csvExtractor]   - Gemini API call: ${fetchDuration}s`);
  console.log(`[csvExtractor]   - CSV generation: ${((csvEndTime - csvStartTime) / 1000).toFixed(3)}s`);
  console.log('[csvExtractor] ============================================\n');

  return {
    templateData: csvContent,
    workflowOnlyData
  };
}

export async function extractCsvFromMultiPagePDF(request: CsvMultiPageExtractionRequest): Promise<ExtractionResult> {
  const overallStartTime = performance.now();
  const {
    pdfFiles,
    defaultInstructions,
    additionalInstructions,
    fieldMappings = [],
    rowDetectionInstructions = 'Extract each logical record as a separate row',
    delimiter = ',',
    includeHeaders = true
  } = request;

  const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
  const wfoMappings = fieldMappings.filter(m => m.isWorkflowOnly);

  console.log('\n[csvExtractor] ============================================');
  console.log('[csvExtractor] === MULTI-PAGE CSV EXTRACTION START ===');
  console.log('[csvExtractor] Timestamp:', new Date().toISOString());
  console.log('[csvExtractor] PDF files:', pdfFiles.length);
  console.log('[csvExtractor] Total size:', (pdfFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(2), 'KB');
  console.log('[csvExtractor] Total field mappings:', fieldMappings.length);
  console.log('[csvExtractor] Regular field mappings:', regularMappings.length);
  console.log('[csvExtractor] WFO field mappings:', wfoMappings.length);
  console.log('[csvExtractor] Row detection instructions:', rowDetectionInstructions.substring(0, 100));
  console.log('[csvExtractor] Delimiter:', JSON.stringify(delimiter));
  console.log('[csvExtractor] Include headers:', includeHeaders);

  if (!fieldMappings || fieldMappings.length === 0) {
    console.error('[csvExtractor] ❌ ERROR: No field mappings provided');
    throw new Error('Field mappings are required for CSV extraction');
  }

  if (!pdfFiles || pdfFiles.length === 0) {
    console.error('[csvExtractor] ❌ ERROR: No PDF files provided');
    throw new Error('At least one PDF file is required');
  }

  console.log('[csvExtractor] Starting multi-file base64 conversion...');
  const base64StartTime = performance.now();
  const pdfBase64Array = await Promise.all(
    pdfFiles.map(file => fileToBase64(file))
  );
  const base64EndTime = performance.now();
  console.log(`[csvExtractor] Base64 conversion completed in ${((base64EndTime - base64StartTime) / 1000).toFixed(2)}s`);
  console.log(`[csvExtractor] Total base64 size: ${(pdfBase64Array.reduce((sum, b64) => sum + b64.length, 0) / 1024).toFixed(2)} KB`);

  const combinedInstructions = additionalInstructions
    ? `${defaultInstructions}\n\nAdditional context: ${additionalInstructions}`
    : defaultInstructions;

  const fieldDescriptions = fieldMappings
    .filter(m => m.type === 'ai')
    .map(m => `- ${m.fieldName}: ${m.value || 'extract this field'}`)
    .join('\n');

  const hardcodedFields = fieldMappings
    .filter(m => m.type === 'hardcoded')
    .map(m => `- ${m.fieldName}: always set to "${m.value}"`)
    .join('\n');

  const prompt = `You are analyzing ${pdfFiles.length} PDF pages that should be processed together as a single document.

ROW DETECTION INSTRUCTIONS:
${rowDetectionInstructions || 'Extract each logical record as a separate row'}

⚠️ IMPORTANT: Process ALL pages together. Extract rows from ALL pages in the order they appear. Do not stop after processing just one page.

EXTRACTION INSTRUCTIONS:
${combinedInstructions}

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
7. Extract ALL rows from ALL pages - do not skip any
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

Please analyze ALL PDF pages and return the extracted data as a JSON array.`;

  console.log('[csvExtractor] 📤 Preparing to send request to Gemini AI');
  console.log('[csvExtractor] Prompt length:', prompt.length, 'characters');
  console.log('[csvExtractor] Number of PDF pages:', pdfBase64Array.length);
  console.log('[csvExtractor] ⏱️  Calling Gemini API (this typically takes 30-90 seconds for multiple pages)...');

  const geminiStartTime = performance.now();

  const contentParts: any[] = [];

  for (const pdfData of pdfBase64Array) {
    contentParts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfData
      }
    });
  }

  contentParts.push(prompt);

  const text = await callGeminiProxy(contentParts, 'CSV extraction (multi-page)');
  const geminiEndTime = performance.now();
  const fetchDuration = ((geminiEndTime - geminiStartTime) / 1000).toFixed(2);
  console.log(`[csvExtractor] ✅ Gemini API responded in ${fetchDuration}s`);

  console.log('[csvExtractor] 📥 Gemini response details:');
  console.log('[csvExtractor] Response length:', text.length, 'characters');
  console.log('[csvExtractor] Response preview (first 200 chars):', text.substring(0, 200));

  console.log('[csvExtractor] Parsing JSON from AI response...');
  let jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('[csvExtractor] Array pattern not found, trying object pattern...');
    jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('[csvExtractor] Found object, converting to array...');
      const parsedObj = JSON.parse(jsonMatch[0]);
      jsonMatch = [`[${JSON.stringify(parsedObj)}]`];
    }
  }

  if (!jsonMatch) {
    console.error('[csvExtractor] ❌ Could not find valid JSON in AI response');
    console.error('[csvExtractor] Response text:', text);
    throw new Error('Could not find valid JSON array in AI response');
  }

  const extractedData = JSON.parse(jsonMatch[0]);

  console.log('[csvExtractor] ✅ Extracted data details:');
  console.log('[csvExtractor] - Rows extracted:', extractedData.length);
  console.log('[csvExtractor] - First row keys:', extractedData.length > 0 ? Object.keys(extractedData[0]).join(', ') : 'N/A');

  if (!Array.isArray(extractedData) || extractedData.length === 0) {
    console.error('[csvExtractor] ❌ Extracted data is invalid');
    console.error('[csvExtractor] - Is array:', Array.isArray(extractedData));
    console.error('[csvExtractor] - Length:', extractedData?.length || 0);
    throw new Error('Extracted data is not a valid array or is empty');
  }

  console.log('[csvExtractor] Applying hardcoded fields...');
  const hardcodedFieldsList = fieldMappings.filter(m => m.type === 'hardcoded');
  console.log('[csvExtractor] - Hardcoded fields count:', hardcodedFieldsList.length);
  for (const mapping of hardcodedFieldsList) {
    for (const row of extractedData) {
      row[mapping.fieldName] = mapping.value;
    }
  }

  console.log('[csvExtractor] Generating CSV...');
  const csvStartTime = performance.now();
  const csvLines: string[] = [];

  if (includeHeaders) {
    csvLines.push(generateCsvHeader(fieldMappings, delimiter));
  }

  for (const row of extractedData) {
    csvLines.push(generateCsvRow(row, fieldMappings, delimiter));
  }

  const csvContent = csvLines.join('\n');
  const csvEndTime = performance.now();
  console.log(`[csvExtractor] CSV generated in ${((csvEndTime - csvStartTime) / 1000).toFixed(3)}s`);

  console.log('[csvExtractor] ✅ CSV generation successful:');
  console.log('[csvExtractor] - Total lines:', csvLines.length);
  console.log('[csvExtractor] - CSV content length:', csvContent.length, 'characters');
  console.log('[csvExtractor] - CSV size:', (csvContent.length / 1024).toFixed(2), 'KB');

  const overallEndTime = performance.now();
  const totalDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(2);

  // Extract WFO data if there are WFO mappings
  let workflowOnlyData = '{}';
  if (wfoMappings.length > 0 && extractedData.length > 0) {
    const wfoData: any = {};
    // For each WFO field, extract the value from the first row (or aggregate if needed)
    for (const wfoMapping of wfoMappings) {
      const fieldName = wfoMapping.fieldName;
      // Get value from first row by default
      wfoData[fieldName] = extractedData[0][fieldName] || null;
    }
    workflowOnlyData = JSON.stringify(wfoData);
    console.log('[csvExtractor] WFO data extracted:', workflowOnlyData);
  }

  console.log('[csvExtractor] ✅ === MULTI-PAGE CSV EXTRACTION SUCCESS ===');
  console.log('[csvExtractor] Total rows extracted:', extractedData.length);
  console.log('[csvExtractor] Regular field count:', regularMappings.length);
  console.log('[csvExtractor] WFO field count:', wfoMappings.length);
  console.log('[csvExtractor] Pages processed:', pdfFiles.length);
  console.log('[csvExtractor] CSV content length:', csvContent.length, 'characters');
  console.log(`[csvExtractor] Total extraction time: ${totalDuration}s`);
  console.log('[csvExtractor] Time breakdown:');
  console.log(`[csvExtractor]   - Base64 conversion: ${((base64EndTime - base64StartTime) / 1000).toFixed(2)}s`);
  console.log(`[csvExtractor]   - Gemini API call: ${fetchDuration}s`);
  console.log(`[csvExtractor]   - CSV generation: ${((csvEndTime - csvStartTime) / 1000).toFixed(3)}s`);
  console.log('[csvExtractor] ============================================\n');

  return {
    templateData: csvContent,
    workflowOnlyData
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to read file as base64'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
