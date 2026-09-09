import { getValueByPath, createV2StepLog } from "../utils.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjs from "npm:pdfjs-dist@3.11.174";

interface BarcodeFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'pattern' | 'function';
  value: string;
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

function matchesPattern(text: string, pattern: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  if (lowerPattern.endsWith('*')) {
    return lowerText.startsWith(lowerPattern.slice(0, -1));
  }
  if (lowerPattern.startsWith('*')) {
    return lowerText.endsWith(lowerPattern.slice(1));
  }
  if (lowerPattern.includes('*')) {
    const parts = lowerPattern.split('*');
    return lowerText.startsWith(parts[0]) && lowerText.endsWith(parts[1]);
  }
  return lowerText.includes(lowerPattern);
}

async function extractTextFromPdf(pdfBase64: string): Promise<string> {
  try {
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const textParts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: { str?: string }) => item.str || "")
        .join(" ");
      textParts.push(pageText);
    }
    return textParts.join("\n\n");
  } catch (error) {
    console.warn("PDF text extraction failed:", error);
    return "";
  }
}

function extractBarcodesFromText(text: string): string[] {
  const barcodes: string[] = [];
  const code39Regex = /\*([A-Za-z0-9][A-Za-z0-9\-_.$/+% ]{1,})\*/g;
  let match;
  while ((match = code39Regex.exec(text)) !== null) {
    const value = match[1].trim();
    if (value.length >= 2 && !/^\*+$/.test(value)) {
      barcodes.push(value);
    }
  }
  return [...new Set(barcodes)];
}

export async function executeReadBarcode(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  executionLogId?: string | null,
  workflowId?: string
): Promise<{ stepOutput: any }> {
  console.log('=== EXECUTING READ BARCODE STEP ===');
  const config = step.config_json || {};
  const mappings: BarcodeFieldMapping[] = config.barcodeFieldMappings || [];
  const pdfSource: string = config.pdfSource || 'context';

  let pdfBase64: string | null = null;

  if (pdfSource === 'storage') {
    const storagePath = resolveTemplate(config.storagePath || '', contextData);
    if (!storagePath) {
      throw new Error('Read Barcode: Storage path is empty after template resolution');
    }
    console.log(`Fetching PDF from storage path: ${storagePath}`);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const pathParts = storagePath.split('/');
    const bucketName = pathParts[0];
    const filePath = pathParts.slice(1).join('/');

    const { data: fileData, error: dlError } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (dlError || !fileData) {
      throw new Error(`Read Barcode: Failed to download PDF from storage: ${dlError?.message || 'No data returned'}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    pdfBase64 = btoa(binary);
  } else {
    pdfBase64 = contextData.pdfBase64 || null;
  }

  if (!pdfBase64) {
    console.log('No PDF data available for barcode scanning');
    return {
      stepOutput: {
        skipped: true,
        reason: 'No PDF data available (contextData.pdfBase64 is empty and no storage path configured)',
      },
    };
  }

  console.log('Extracting text from PDF for barcode detection');
  const scanStart = Date.now();
  const pdfText = await extractTextFromPdf(pdfBase64);
  console.log(`Extracted ${pdfText.length} chars of text from PDF`);
  const detectedBarcodes = extractBarcodesFromText(pdfText);
  const scanDurationMs = Date.now() - scanStart;
  console.log(`Detected ${detectedBarcodes.length} barcodes in ${scanDurationMs}ms:`, detectedBarcodes);

  contextData.detectedBarcodes = detectedBarcodes;

  if (executionLogId && workflowId) {
    await createV2StepLog(
      supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
      { id: step.id, label: `${step.label} - Barcode Scan`, step_type: 'read_barcode', config_json: {} },
      'completed', new Date(Date.now() - scanDurationMs).toISOString(), new Date().toISOString(), scanDurationMs, null,
      { method: 'text_extraction', pdfSource, barcodesDetected: detectedBarcodes.length },
      { allBarcodes: detectedBarcodes }
    );
  }

  const results: Record<string, any> = {};
  const hardcodedMappings = mappings.filter(m => m.type === 'hardcoded');
  const patternMappings = mappings.filter(m => m.type === 'pattern');
  const functionMappings = mappings.filter(m => m.type === 'function');

  for (const mapping of hardcodedMappings) {
    if (!mapping.fieldName) continue;
    const casted = castValue(mapping.value, mapping.dataType || 'string');
    results[mapping.fieldName] = casted;
    console.log(`Hardcoded: ${mapping.fieldName} = ${JSON.stringify(casted)}`);
  }

  for (const mapping of patternMappings) {
    if (!mapping.fieldName || !mapping.value) continue;
    const matched = detectedBarcodes.find(bc => matchesPattern(bc, mapping.value));
    const casted = castValue(matched || null, mapping.dataType || 'string');
    results[mapping.fieldName] = casted;
    console.log(`Pattern "${mapping.value}": ${mapping.fieldName} = ${JSON.stringify(casted)}`);
  }

  for (const mapping of functionMappings) {
    if (!mapping.fieldName) continue;
    const resolved = resolveTemplate(mapping.value || '', contextData);
    const casted = castValue(resolved, mapping.dataType || 'string');
    results[mapping.fieldName] = casted;
    console.log(`Function: ${mapping.fieldName} = ${JSON.stringify(casted)}`);
  }

  if (!contextData.extractedData || typeof contextData.extractedData !== 'object') {
    contextData.extractedData = {};
  }
  for (const [fieldName, value] of Object.entries(results)) {
    contextData[fieldName] = value;
    contextData.extractedData[fieldName] = value;
  }

  if (executionLogId && workflowId && mappings.length > 0) {
    await createV2StepLog(
      supabaseUrl, supabaseServiceKey, executionLogId, workflowId,
      { id: step.id, label: `${step.label} - Field Mappings`, step_type: 'read_barcode', config_json: {} },
      'completed', new Date().toISOString(), new Date().toISOString(), 0, null,
      { patternCount: patternMappings.length, hardcodedCount: hardcodedMappings.length, functionCount: functionMappings.length },
      { fields: results }
    );
  }

  console.log(`Read Barcode: Set ${Object.keys(results).length} field(s) in contextData`);
  console.log('=== READ BARCODE STEP COMPLETED ===');

  return {
    stepOutput: {
      barcodesDetected: detectedBarcodes.length,
      allBarcodes: detectedBarcodes,
      fieldsExtracted: Object.keys(results).length,
      fields: results,
      patternFieldCount: patternMappings.length,
      hardcodedFieldCount: hardcodedMappings.length,
      functionFieldCount: functionMappings.length,
    },
  };
}
