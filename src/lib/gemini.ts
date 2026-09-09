import { PDFDocument } from 'pdf-lib';
import { callGeminiProxy } from './geminiProxy';
import { evaluateFunction, evaluateAddressLookup } from './functionEvaluator';
import type { FieldMappingFunction, AddressLookupFunctionLogic } from '../types';
import { extractPositionedText, parseCoordinateString, resolveRectValue, type PdfPositionedText } from './pdfAnchorResolver';

async function resolveMappedArrayEntryCoords(
  pdfFile: File | Blob,
  arrayEntryConfigs: any[],
  pdfFilesForMulti?: Array<File | Blob>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const enabled = (arrayEntryConfigs || []).filter(e => e?.isEnabled);
  if (enabled.length === 0) return resolved;

  const targets: Array<{ key: string; coords: ReturnType<typeof parseCoordinateString> }> = [];
  enabled.forEach(entry => {
    if (entry.isRepeating) return;
    (entry.fields || []).forEach((f: any) => {
      if (f.fieldType !== 'mapped' || !f.extractionInstruction) return;
      const coords = parseCoordinateString(String(f.extractionInstruction));
      if (!coords) return;
      const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
      targets.push({ key, coords });
    });
  });
  if (targets.length === 0) return resolved;

  let pages: PdfPositionedText;
  try {
    if (pdfFilesForMulti && pdfFilesForMulti.length > 0) {
      pages = [];
      for (const f of pdfFilesForMulti) {
        const p = await extractPositionedText(f);
        pages.push(...p);
      }
    } else {
      pages = await extractPositionedText(pdfFile);
    }
  } catch (err) {
    console.warn('[gemini] Failed to extract positioned text:', err);
    return resolved;
  }

  targets.forEach(({ key, coords }) => {
    if (!coords) return;
    const result = resolveRectValue(pages, coords);
    resolved[key] = result.matched && result.value ? result.value : '';
  });
  return resolved;
}

// Helper function to truncate a string based on its JSON-escaped length
function truncateJsonEscaped(str: string, maxLength: number): string {
  if (!str || maxLength <= 0) {
    return '';
  }
  
  // Helper to calculate JSON-escaped length (excluding surrounding quotes)
  const getJsonEscapedLength = (s: string): number => {
    return JSON.stringify(s).length - 2;
  };
  
  // If the string is already within the limit, return as-is
  if (getJsonEscapedLength(str) <= maxLength) {
    return str;
  }
  
  // Use binary search to find the longest prefix that fits within maxLength
  let left = 0;
  let right = str.length;
  let result = '';
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const prefix = str.substring(0, mid);
    const escapedLength = getJsonEscapedLength(prefix);
    
    if (escapedLength <= maxLength) {
      result = prefix;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return result;
}

// Helper function to format phone numbers
function formatPhoneNumber(phone: string): string | null {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Only format if we have exactly 10 digits or 11 digits starting with '1'
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // Remove leading '1' and format the remaining 10 digits
    const tenDigits = digits.slice(1);
    return `${tenDigits.slice(0, 3)}-${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
  }
  
  // Return empty string for invalid phone numbers to prevent API validation errors
  return "";
}

// Helper function to normalize boolean values
function normalizeBooleanValue(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'False';
  }

  const strValue = String(value).trim().toLowerCase();

  if (strValue === 'true' || strValue === 'yes' || strValue === '1') {
    return 'True';
  }

  if (strValue === 'false' || strValue === 'no' || strValue === '0') {
    return 'False';
  }

  return 'False';
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

// WFO fields come back from Gemini as a flat object whose keys may contain
// dots (e.g. `"stop1.Shipment"`). The function evaluator walks nested paths,
// so flat dotted keys must be expanded into a nested object before merging
// into the evaluation context.
function expandDottedKeys(flat: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(flat || {})) {
    if (!key.includes('.')) {
      out[key] = value;
      continue;
    }
    const parts = key.split('.');
    let cur: any = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] == null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
        cur[p] = {};
      }
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return out;
}

// Deep-merge two plain objects. Values from `override` win on collisions.
function deepMergePlain(
  base: Record<string, any>,
  override: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    const existing = result[key];
    if (
      existing && typeof existing === 'object' && !Array.isArray(existing) &&
      value && typeof value === 'object' && !Array.isArray(value)
    ) {
      result[key] = deepMergePlain(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function evaluateArrayEntryConditions(
  conditions: ArrayEntryConditions | undefined,
  orderData: Record<string, any>,
  wfoData: Record<string, any>
): boolean {
  if (!conditions || !conditions.enabled || conditions.rules.length === 0) {
    return true;
  }

  const results = conditions.rules.map(rule => {
    let value = getNestedValue(orderData, rule.fieldPath);
    if (value === undefined) {
      value = getNestedValue(wfoData, rule.fieldPath);
    }

    const strValue = value !== undefined && value !== null ? String(value) : '';
    const compareValue = rule.value || '';

    switch (rule.operator) {
      case 'equals':
        return strValue.toLowerCase() === compareValue.toLowerCase();
      case 'notEquals':
        return strValue.toLowerCase() !== compareValue.toLowerCase();
      case 'contains':
        return strValue.toLowerCase().includes(compareValue.toLowerCase());
      case 'notContains':
        return !strValue.toLowerCase().includes(compareValue.toLowerCase());
      case 'greaterThan': {
        const numValue = parseFloat(strValue);
        const numCompare = parseFloat(compareValue);
        return !isNaN(numValue) && !isNaN(numCompare) && numValue > numCompare;
      }
      case 'lessThan': {
        const numValue = parseFloat(strValue);
        const numCompare = parseFloat(compareValue);
        return !isNaN(numValue) && !isNaN(numCompare) && numValue < numCompare;
      }
      case 'greaterThanOrEqual': {
        const numValue = parseFloat(strValue);
        const numCompare = parseFloat(compareValue);
        return !isNaN(numValue) && !isNaN(numCompare) && numValue >= numCompare;
      }
      case 'lessThanOrEqual': {
        const numValue = parseFloat(strValue);
        const numCompare = parseFloat(compareValue);
        return !isNaN(numValue) && !isNaN(numCompare) && numValue <= numCompare;
      }
      case 'isEmpty':
        return strValue === '' || strValue === 'null' || strValue === 'undefined';
      case 'isNotEmpty':
        return strValue !== '' && strValue !== 'null' && strValue !== 'undefined';
      default:
        return true;
    }
  });

  return conditions.logic === 'AND'
    ? results.every(r => r)
    : results.some(r => r);
}

export interface ArraySplitConfig {
  id?: string;
  targetArrayField: string;
  splitBasedOnField: string;
  splitStrategy: 'one_per_entry' | 'divide_evenly';
  defaultToOneIfMissing?: boolean;
}

export interface ArrayEntryField {
  fieldName: string;
  fieldType: 'hardcoded' | 'extracted' | 'mapped';
  hardcodedValue?: string;
  extractionInstruction?: string;
  dataType?: 'string' | 'number' | 'integer' | 'datetime' | 'date' | 'time' | 'boolean';
  dateOnly?: boolean;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  removeIfNull?: boolean;
}

export interface ArrayEntryConditionRule {
  fieldPath: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'isEmpty' | 'isNotEmpty';
  value: string;
}

export interface ArrayEntryConditions {
  enabled: boolean;
  logic: 'AND' | 'OR';
  rules: ArrayEntryConditionRule[];
}

export interface ArrayEntryConfig {
  id?: string;
  targetArrayField: string;
  entryOrder: number;
  isEnabled: boolean;
  fields: ArrayEntryField[];
  conditions?: ArrayEntryConditions;
  isRepeating?: boolean;
  repeatInstruction?: string;
}

export interface ExtractionRequest {
  pdfFile: File;
  defaultInstructions: string;
  additionalInstructions?: string;
  formatTemplate: string;
  formatType?: string;
  fieldMappings?: any[];
  parseitIdMapping?: string;
  traceTypeMapping?: string;
  traceTypeValue?: string;
  arraySplitConfigs?: ArraySplitConfig[];
  arrayEntryConfigs?: ArrayEntryConfig[];
  functions?: FieldMappingFunction[];
  enableConfidenceScoring?: boolean;
}

export interface JsonMultiPageExtractionRequest {
  pdfFiles: File[];
  defaultInstructions: string;
  additionalInstructions?: string;
  formatTemplate: string;
  fieldMappings?: any[];
  parseitIdMapping?: string;
  traceTypeMapping?: string;
  traceTypeValue?: string;
  arraySplitConfigs?: ArraySplitConfig[];
  arrayEntryConfigs?: ArrayEntryConfig[];
  functions?: FieldMappingFunction[];
}

export interface ExtractionResult {
  templateData: string;
  workflowOnlyData: string;
  confidenceScores?: Record<string, number>;
}

const getDateTimeNote = (m: any) => {
  const outputFmt = m.dateOnly
    ? ' (as date string in yyyy-MM-dd format)'
    : ' (as datetime string in yyyy-MM-ddThh:mm:ss format)';
  if (m.inputDateFormat) {
    return `${outputFmt}. IMPORTANT: Dates in the source document are written in ${m.inputDateFormat} format, so interpret them accordingly before converting to the output format`;
  }
  return outputFmt;
};

const getDateNote = (m: any) => {
  const outputFmt = ' (as date-only string in yyyy-MM-dd format. Do not include any time component)';
  if (m.inputDateFormat) {
    return `${outputFmt}. IMPORTANT: Dates in the source document are written in ${m.inputDateFormat} format, so interpret them accordingly before converting to the output format`;
  }
  return outputFmt;
};

const getTimeNote = (_m: any) => {
  return ' (as time-only string in HH:mm 24-hour format. Do not include seconds or any date component)';
};

export async function extractDataFromPDF({
  pdfFile,
  defaultInstructions,
  additionalInstructions,
  formatTemplate,
  formatType = 'XML',
  fieldMappings = [],
  parseitIdMapping,
  traceTypeMapping,
  traceTypeValue,
  arraySplitConfigs = [],
  arrayEntryConfigs = [],
  functions = [],
  enableConfidenceScoring = false
}: ExtractionRequest): Promise<ExtractionResult> {
  try {
    // Convert PDF to base64
    const pdfBase64 = await fileToBase64(pdfFile);

    // Pre-resolve mapped array-entry coordinates locally from pdfjs text (deterministic, no AI).
    const resolvedMappedCoords = await resolveMappedArrayEntryCoords(pdfFile, arrayEntryConfigs);

    // Combine instructions
    const fullInstructions = additionalInstructions
      ? `${defaultInstructions}\n\nAdditional Instructions: ${additionalInstructions}`
      : defaultInstructions;

    const isJsonFormat = formatType === 'JSON';
    const outputFormat = isJsonFormat ? 'JSON' : 'XML';
    const templateLabel = isJsonFormat ? 'JSON structure' : 'XML template structure';

    // Separate regular fields from workflow-only fields
    const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
    const wfoMappings = fieldMappings.filter(m => m.isWorkflowOnly);

    // Add postal code formatting rules
    const postalCodeRules = `

POSTAL CODE FORMATTING RULES:
- Canadian Postal Codes: Always format as "AAA AAA" (3 letters, space, 3 letters/numbers) - Example: "H1W 1S3" not "H1W1S3"
- US Zip Codes: Always format as "11111" (5 digits, no spaces or dashes) - Example: "90210" not "90210-1234"
- If you detect a Canadian postal code pattern (letter-number-letter number-letter-number), add the space: "H1W1S3" becomes "H1W 1S3"
- If you detect a US zip code pattern, use only the first 5 digits: "90210-1234" becomes "90210"

PROVINCE AND STATE FORMATTING RULES:
- Canadian Provinces: Always format as 2-letter code only - Example: "BC" not "British Columbia", "ON" not "Ontario"
- US States: Always format as 2-letter code only - Example: "WA" not "Washington", "CA" not "California"
- If you detect a full province or state name, convert it to the 2-letter code
- Valid Canadian province codes: AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT
- Valid US state codes: AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY`;

    // Build field mapping instructions for JSON (regular fields only)
    let fieldMappingInstructions = '';
    if (isJsonFormat && regularMappings.length > 0) {
      fieldMappingInstructions = '\n\nFIELD MAPPING INSTRUCTIONS:\n';
      regularMappings.forEach(mapping => {
        if (mapping.type === 'hardcoded') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (as formatted phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          fieldMappingInstructions += `- "${mapping.fieldName}": Always use the EXACT hardcoded value "${mapping.value}"${dataTypeNote}\n`;
        } else if (mapping.type === 'mapped') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          fieldMappingInstructions += `- "${mapping.fieldName}": Extract data from PDF coordinates ${mapping.value}${dataTypeNote}\n`;
        } else {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          fieldMappingInstructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`;
        }
      });
    }

    // Add Parse-It ID mapping instructions for JSON
    let parseitIdInstructions = '';
    if (isJsonFormat && parseitIdMapping) {
      parseitIdInstructions = `\n\nPARSE-IT ID MAPPING:\n- "${parseitIdMapping}": This field will be automatically populated with a unique Parse-It ID number. For now, use the placeholder value "{{PARSE_IT_ID_PLACEHOLDER}}" (this will be replaced automatically).\n`;
    }

    // Add trace type mapping instructions for JSON
    let traceTypeInstructions = '';
    if (isJsonFormat && traceTypeMapping && traceTypeValue) {
      traceTypeInstructions = `\n\nTRACE TYPE MAPPING:\n- "${traceTypeMapping}": Always set this field to the exact value "${traceTypeValue}".\n`;
    }

    // Add Parse-It ID mapping instructions for XML
    let xmlParseitIdInstructions = '';
    if (!isJsonFormat && parseitIdMapping) {
      xmlParseitIdInstructions = `\n\nPARSE-IT ID MAPPING FOR XML:\n- At the XML path "${parseitIdMapping}": Insert the placeholder value "{{PARSE_IT_ID_PLACEHOLDER}}" (this will be replaced automatically with a unique Parse-It ID).\n`;
    }

    // Add trace type mapping instructions for XML
    let xmlTraceTypeInstructions = '';
    if (!isJsonFormat && traceTypeMapping && traceTypeValue) {
      xmlTraceTypeInstructions = `\n\nTRACE TYPE MAPPING FOR XML:\n- At the XML path "${traceTypeMapping}": Always set this attribute/element to the exact value "${traceTypeValue}".\n`;
    }

    // Add array split instructions for JSON
    let arraySplitInstructions = '';
    if (isJsonFormat && arraySplitConfigs && arraySplitConfigs.length > 0) {
      arraySplitInstructions = '\n\nARRAY SPLIT INSTRUCTIONS:\n';
      arraySplitConfigs.forEach(config => {
        if (config.splitStrategy === 'one_per_entry') {
          const fallbackInstruction = config.defaultToOneIfMissing
            ? ` If the "${config.splitBasedOnField}" field is not found, empty, or has a value of 0, create 1 entry in the "${config.targetArrayField}" array with "${config.splitBasedOnField}" set to 1.`
            : '';
          arraySplitInstructions += `- For the "${config.targetArrayField}" array: Look at the value of the "${config.splitBasedOnField}" field in the document. If this field has a value of N (for example, if "${config.splitBasedOnField}" = 3), create N separate entries in the "${config.targetArrayField}" array. Each entry should have "${config.splitBasedOnField}" set to 1, and all other fields should contain the same data from the document. For example, if pieces = 3, create 3 barcode entries each with pieces = 1.${fallbackInstruction}\n`;
        } else {
          const fallbackInstruction = config.defaultToOneIfMissing
            ? ` If the "${config.splitBasedOnField}" field is not found, empty, or has a value of 0, create 1 entry in the "${config.targetArrayField}" array.`
            : '';
          arraySplitInstructions += `- For the "${config.targetArrayField}" array: Look at the value of the "${config.splitBasedOnField}" field and create multiple entries distributing the value evenly across them based on the data in the document.${fallbackInstruction}\n`;
        }
      });
    }

    // Build array entry extraction instructions for JSON
    // This extracts values for array entry fields that need AI extraction
    let arrayEntryExtractionInstructions = '';
    const enabledArrayEntries = arrayEntryConfigs.filter(e => e.isEnabled);

    if (isJsonFormat && enabledArrayEntries.length > 0) {
      const repeatingEntries = enabledArrayEntries.filter(e => e.isRepeating);
      const staticEntries = enabledArrayEntries.filter(e => !e.isRepeating);

      const conditionalEntries = staticEntries.filter(e => e.aiConditionInstruction);
      const unconditionalEntries = staticEntries.filter(e => !e.aiConditionInstruction);

      const staticExtractedFields = unconditionalEntries.flatMap(entry =>
        entry.fields
          .filter(f => {
            const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
            if (f.fieldType === 'mapped' && resolvedMappedCoords[key] !== undefined) return false;
            return (f.fieldType === 'extracted' && f.extractionInstruction) || (f.fieldType === 'mapped' && f.extractionInstruction);
          })
          .map(f => ({
            key: `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`,
            instruction: f.fieldType === 'mapped'
              ? `Extract data from PDF coordinates ${f.extractionInstruction}`
              : f.extractionInstruction,
            dataType: f.dataType || 'string',
            dateOnly: f.dateOnly,
            inputDateFormat: f.inputDateFormat
          }))
      );
      if (staticExtractedFields.length > 0) {
        arrayEntryExtractionInstructions = '\n\nARRAY ENTRY FIELD EXTRACTIONS:\n';
        arrayEntryExtractionInstructions += 'Extract these additional values as standalone fields in the workflow-only data section:\n';
        arrayEntryExtractionInstructions += 'IMPORTANT: Each instruction below describes what to look for on the PDF. If the instruction contains a label (e.g., "#Facture/Invoice:" or "PO Number:"), extract the VALUE found next to or near that label on the document, NOT the label text itself.\n';
        staticExtractedFields.forEach((field) => {
          const dataTypeNote = field.dataType === 'string' ? ' (as UPPER CASE string)' :
                              field.dataType === 'number' ? ' (format as number)' :
                              field.dataType === 'integer' ? ' (format as integer)' :
                              field.dataType === 'datetime' ? getDateTimeNote(field) :
                              field.dataType === 'date' ? getDateNote(field) :
                              field.dataType === 'time' ? getTimeNote(field) : '';
          arrayEntryExtractionInstructions += `- "${field.key}": ${field.instruction}${dataTypeNote}\n`;
        });
      }

      if (conditionalEntries.length > 0) {
        arrayEntryExtractionInstructions += '\n\nCONDITIONAL ARRAY ENTRY EXTRACTIONS:\n';
        arrayEntryExtractionInstructions += 'For each group below, first check the AI condition on the PDF. If the condition is NOT met, return null for ALL fields in that group.\n';
        arrayEntryExtractionInstructions += 'If the condition IS met, extract the values as described.\n';
        arrayEntryExtractionInstructions += 'IMPORTANT: If the instruction contains a label (e.g., "#Facture/Invoice:" or "PO Number:"), extract the VALUE found next to or near that label on the document, NOT the label text itself.\n\n';

        conditionalEntries.forEach(entry => {
          const conditionKey = `__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`;
          arrayEntryExtractionInstructions += `Condition check for ${entry.targetArrayField}[${entry.entryOrder}]: ${entry.aiConditionInstruction}\n`;
          arrayEntryExtractionInstructions += `- "${conditionKey}": Set to "true" if the condition is met, "false" if not\n`;

          entry.fields
            .filter(f => {
              const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
              if (f.fieldType === 'mapped' && resolvedMappedCoords[key] !== undefined) return false;
              return (
                (f.fieldType === 'extracted' && f.extractionInstruction) ||
                (f.fieldType === 'mapped' && f.extractionInstruction)
              );
            })
            .forEach(f => {
              const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
              const dataTypeNote = (f.dataType || 'string') === 'string' ? ' (as UPPER CASE string)' :
                                  f.dataType === 'number' ? ' (format as number)' :
                                  f.dataType === 'integer' ? ' (format as integer)' :
                                  f.dataType === 'datetime' ? getDateTimeNote(f) :
                                  f.dataType === 'date' ? getDateNote(f) :
                                  f.dataType === 'time' ? getTimeNote(f) : '';
              const promptInstruction = f.fieldType === 'mapped'
                ? `Extract data from PDF coordinates ${f.extractionInstruction}`
                : f.extractionInstruction;
              arrayEntryExtractionInstructions += `- "${key}": ${promptInstruction}${dataTypeNote} (only if condition is met, otherwise null)\n`;
            });
          arrayEntryExtractionInstructions += '\n';
        });
      }

      // Handle repeating entries - extract as arrays
      if (repeatingEntries.length > 0) {
        arrayEntryExtractionInstructions += '\n\nREPEATING ARRAY EXTRACTIONS:\n';
        arrayEntryExtractionInstructions += 'For each of the following, find ALL matching rows in the PDF and return an ARRAY of objects:\n\n';

        repeatingEntries.forEach(entry => {
          const arrayKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
          arrayEntryExtractionInstructions += `- "${arrayKey}": ${entry.repeatInstruction || 'Find all matching rows'}\n`;
          arrayEntryExtractionInstructions += `  Return as an array of objects, where each object has these fields:\n`;

          entry.fields.forEach(field => {
            const dataTypeNote = field.dataType === 'string' ? ' (UPPER CASE string)' :
                                field.dataType === 'number' ? ' (number)' :
                                field.dataType === 'integer' ? ' (integer)' :
                                field.dataType === 'datetime' ? getDateTimeNote(field) :
                                field.dataType === 'date' ? getDateNote(field) :
                                field.dataType === 'time' ? getTimeNote(field) :
                                field.dataType === 'boolean' ? ' (boolean: use "True" or "False" as string)' : '';
            if (field.fieldType === 'hardcoded') {
              arrayEntryExtractionInstructions += `    - "${field.fieldName}": Always "${field.hardcodedValue}"${dataTypeNote}\n`;
            } else {
              arrayEntryExtractionInstructions += `    - "${field.fieldName}": ${field.extractionInstruction}${dataTypeNote}\n`;
            }
          });
          arrayEntryExtractionInstructions += '\n';
        });
      }
    }

    // Build workflow-only field instructions
    let wfoInstructions = '';
    if (wfoMappings.length > 0) {
      wfoInstructions = '\n\nWORKFLOW-ONLY FIELDS (SEPARATE EXTRACTION):\n';
      wfoInstructions += 'Extract these additional fields as standalone variables for workflow use (NOT part of the main template structure):\n';
      wfoMappings.forEach(mapping => {
        if (mapping.type === 'hardcoded') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (as formatted phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          wfoInstructions += `- "${mapping.fieldName}": Always use the EXACT hardcoded value "${mapping.value}"${dataTypeNote}\n`;
        } else if (mapping.type === 'mapped') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          wfoInstructions += `- "${mapping.fieldName}": Extract data from PDF coordinates ${mapping.value}${dataTypeNote}\n`;
        } else {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          wfoInstructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`;
        }
      });
    }

    const hasArrayEntryExtractions = arrayEntryExtractionInstructions.length > 0;
    const hasWFOFields = wfoMappings.length > 0 || hasArrayEntryExtractions;

    // Build explicit list of ALL expected workflowOnlyData keys for the prompt
    const allExpectedWfoKeys: string[] = [];
    wfoMappings.forEach(m => allExpectedWfoKeys.push(m.fieldName));
    if (isJsonFormat && hasArrayEntryExtractions) {
      const enabledForKeys = arrayEntryConfigs.filter(e => e.isEnabled);
      const staticForKeys = enabledForKeys.filter(e => !e.isRepeating);
      const repeatingForKeys = enabledForKeys.filter(e => e.isRepeating);
      staticForKeys.forEach(entry => {
        if ((entry as any).aiConditionInstruction) {
          allExpectedWfoKeys.push(`__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`);
        }
        entry.fields.forEach(f => {
          if ((f.fieldType === 'extracted' && f.extractionInstruction) || (f.fieldType === 'mapped' && f.extractionInstruction)) {
            allExpectedWfoKeys.push(`__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`);
          }
        });
      });
      repeatingForKeys.forEach(entry => {
        allExpectedWfoKeys.push(`__REPEATING_ARRAY_${entry.targetArrayField}__`);
      });
    }

    let wfoKeysListInstruction = '';
    if (allExpectedWfoKeys.length > 0) {
      wfoKeysListInstruction = `\n\nCRITICAL - The workflowOnlyData object MUST contain ALL of the following keys:\n${allExpectedWfoKeys.map(k => `  "${k}"`).join('\n')}\n\nDo NOT omit any of these keys. Every key listed above must appear in the workflowOnlyData object with its extracted value.`;
    }

    const prompt = `
You are a data extraction AI. Please analyze the provided PDF document and extract the requested information according to the following instructions:

EXTRACTION INSTRUCTIONS:
${fullInstructions}${fieldMappingInstructions}${parseitIdInstructions}${traceTypeInstructions}${xmlParseitIdInstructions}${xmlTraceTypeInstructions}${arraySplitInstructions}${arrayEntryExtractionInstructions}${wfoInstructions}${postalCodeRules}

OUTPUT FORMAT:
${hasWFOFields ? 'You need to extract TWO separate data structures from the PDF:\n\n1. MAIN TEMPLATE DATA:\n' : ''}Please format the extracted data as ${outputFormat} following this EXACT ${templateLabel} structure:
${formatTemplate}${hasWFOFields ? `\n\n2. WORKFLOW-ONLY DATA:\nProvide the workflow-only fields as a separate JSON object with the field names as keys and their extracted values.\n\nIMPORTANT: Return BOTH structures in a wrapper object like this:\n{\n  "templateData": <your extracted template data here>,\n  "workflowOnlyData": {\n    <workflow field name>: <extracted value>,\n    ...\n  }\n}\n\nIf there are no workflow-only fields, set workflowOnlyData to an empty object {}.${wfoKeysListInstruction}` : ''}

IMPORTANT GUIDELINES:
1. Only extract information that is clearly visible in the document
2. CRITICAL: Follow the EXACT structure provided in the template. Do not add extra fields at the root level or change the nesting structure
3. If a field is not found in JSON format, use empty string ("") for text fields, 0 for numbers, null for fields that should be null, or [] for arrays. For datetime fields that are empty, use today's date in yyyy-MM-ddThh:mm:ss format. For XML format, use "N/A" or leave it empty
4. Maintain the exact ${outputFormat} structure provided and preserve exact case for all hardcoded values
5. Do NOT duplicate fields outside of their proper nested structure
6. ${isJsonFormat ? 'Ensure valid JSON syntax with proper quotes and brackets' : 'Ensure all XML tags are properly closed'}
7. Use appropriate data types (dates, numbers, text). For JSON, ensure empty values are represented as empty strings (""), not "N/A". CRITICAL: For hardcoded values, use the EXACT case as specified (e.g., "True" not "true", "False" not "false"). For datetime fields, use the format yyyy-MM-ddThh:mm:ss (e.g., "2024-03-15T14:30:00"). If a datetime field is empty or not found, use today's date and current time in the same format. CRITICAL: For all string data type fields (dataType="string"), convert the extracted value to UPPER CASE before including it in the output
8. Be precise and accurate with the extracted data
9. ${isJsonFormat ? 'CRITICAL: For JSON output, the ONLY top-level key allowed is "orders". Do NOT include any other top-level keys or duplicate fields at the root level. Return ONLY the JSON structure from the template - no additional fields outside the "orders" array.' : 'CRITICAL FOR XML: Your response MUST start with the opening tag of the root element from the template and end with its closing tag. Do NOT include any XML content outside of this structure. Do NOT duplicate any elements or add extra XML blocks after the main structure. Return ONLY the complete XML structure from the template with no additional content before or after it.'}

Please provide only the ${outputFormat} output without any additional explanation or formatting.
`;

    let extractedContent = await callGeminiProxy([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64
        }
      },
      prompt
    ], 'PDF extraction');

    // Declare variables at function scope for return
    let templateData: string;
    let workflowOnlyData: string = '{}';

    // Clean up the response - remove any markdown formatting
    if (isJsonFormat) {
      extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Handle dual-structure response when WFO fields exist
      if (hasWFOFields) {
        try {
          const wrapper = JSON.parse(extractedContent);
          if (wrapper.templateData && wrapper.workflowOnlyData !== undefined) {
            templateData = typeof wrapper.templateData === 'string'
              ? wrapper.templateData
              : JSON.stringify(wrapper.templateData);
            workflowOnlyData = typeof wrapper.workflowOnlyData === 'string'
              ? wrapper.workflowOnlyData
              : JSON.stringify(wrapper.workflowOnlyData);
          } else {
            console.warn('[gemini] Wrapper missing expected fields, using full response as template');
            templateData = extractedContent;
            workflowOnlyData = '{}';
          }
        } catch (wrapperError) {
          console.warn('[gemini] Failed to parse wrapper, using full response as template:', wrapperError);
          templateData = extractedContent;
          workflowOnlyData = '{}';
        }
      } else {
        templateData = extractedContent;
      }

      // Post-process JSON to enforce structure and handle field mappings (for template data)
      try {
        let jsonData = JSON.parse(templateData);
        
        // STEP 1: Remove any unwanted top-level keys (only "orders" should exist at root)
        const allowedTopLevelKeys = ['orders'];
        const keysToRemove = Object.keys(jsonData).filter(key => !allowedTopLevelKeys.includes(key));
        keysToRemove.forEach(key => {
          delete jsonData[key];
        });
        
        // STEP 2: Ensure "orders" exists and is an array
        if (!jsonData.orders || !Array.isArray(jsonData.orders)) {
          jsonData.orders = [];
        }

        // STEP 3: Process field mappings and data types for each order (using regular mappings only)
        if (regularMappings.length > 0) {
          const currentDateTime = new Date().toISOString().slice(0, 19); // yyyy-MM-ddThh:mm:ss format

          const processObject = (obj: any, mappings: any[]) => {
            mappings.forEach(mapping => {
              if (mapping.dataType === 'datetime') {
                const fieldPath = mapping.fieldName.split('.');
                let current = obj;

                // Navigate to the field location, handling arrays
                for (let i = 0; i < fieldPath.length - 1; i++) {
                  if (current[fieldPath[i]] === undefined) {
                    current[fieldPath[i]] = {};
                  }

                  // If we encounter an array, process each item recursively
                  if (Array.isArray(current[fieldPath[i]])) {
                    const remainingPath = fieldPath.slice(i + 1).join('.');
                    const nestedMapping = { ...mapping, fieldName: remainingPath };
                    current[fieldPath[i]].forEach((item: any) => {
                      processObject(item, [nestedMapping]);
                    });
                    return;
                  }

                  current = current[fieldPath[i]];
                }

                const finalField = fieldPath[fieldPath.length - 1];

                // Set default datetime if field is empty or doesn't exist
                if (!current[finalField] || current[finalField] === "" || current[finalField] === "N/A") {
                  if (mapping.type === 'hardcoded' && mapping.value) {
                    current[finalField] = mapping.value;
                  } else {
                    current[finalField] = currentDateTime;
                  }
                }

                if (mapping.inputDateFormat && current[finalField] && typeof current[finalField] === 'string') {
                  const dateMatch = String(current[finalField]).match(/^(\d{4})-(\d{2})-(\d{2})/);
                  if (dateMatch) {
                    const mo = parseInt(dateMatch[2], 10);
                    const da = parseInt(dateMatch[3], 10);
                    if (mo > 12 && da <= 12) {
                      current[finalField] = String(current[finalField]).replace(/^(\d{4})-(\d{2})-(\d{2})/, `${dateMatch[1]}-${dateMatch[3]}-${dateMatch[2]}`);
                      console.log(`[DateFix] Swapped month/day for ${mapping.fieldName}: inputDateFormat=${mapping.inputDateFormat}`);
                    }
                  }
                }

                if (mapping.dateOnly && current[finalField]) {
                  const dateValue = String(current[finalField]);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                    current[finalField] = `${dateValue}T00:00:00`;
                  } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateValue)) {
                    current[finalField] = `${dateValue.slice(0, 10)}T00:00:00`;
                  }
                }
              } else if (mapping.dataType === 'phone') {
                const fieldPath = mapping.fieldName.split('.');
                let current = obj;

                // Navigate to the field location, handling arrays
                for (let i = 0; i < fieldPath.length - 1; i++) {
                  if (current[fieldPath[i]] === undefined) {
                    current[fieldPath[i]] = {};
                  }

                  // If we encounter an array, process each item recursively
                  if (Array.isArray(current[fieldPath[i]])) {
                    const remainingPath = fieldPath.slice(i + 1).join('.');
                    const nestedMapping = { ...mapping, fieldName: remainingPath };
                    current[fieldPath[i]].forEach((item: any) => {
                      processObject(item, [nestedMapping]);
                    });
                    return;
                  }

                  current = current[fieldPath[i]];
                }

                const finalField = fieldPath[fieldPath.length - 1];

                // Format phone number if field has a value
                if (current[finalField] && typeof current[finalField] === 'string') {
                  const formattedPhone = formatPhoneNumber(current[finalField]);
                  current[finalField] = formattedPhone || "";
                }
              } else if (mapping.dataType === 'string' || !mapping.dataType) {
                const fieldPath = mapping.fieldName.split('.');
                let current = obj;

                // Navigate to the field location, handling arrays
                for (let i = 0; i < fieldPath.length - 1; i++) {
                  if (current[fieldPath[i]] === undefined) {
                    current[fieldPath[i]] = {};
                  }

                  // If we encounter an array, process each item recursively
                  if (Array.isArray(current[fieldPath[i]])) {
                    const remainingPath = fieldPath.slice(i + 1).join('.');
                    const nestedMapping = { ...mapping, fieldName: remainingPath };
                    current[fieldPath[i]].forEach((item: any) => {
                      processObject(item, [nestedMapping]);
                    });
                    return;
                  }

                  current = current[fieldPath[i]];
                }

                const finalField = fieldPath[fieldPath.length - 1];

                // Convert null string fields to empty strings, but preserve other falsy values like ""
                if (current[finalField] === null || current[finalField] === "null") {
                  current[finalField] = "";
                }

                // Convert string values to UPPER CASE
                if (typeof current[finalField] === 'string' && current[finalField] !== "") {
                  current[finalField] = current[finalField].toUpperCase();
                }

                // Apply max length truncation for string fields (after uppercase conversion)
                if (mapping.maxLength && typeof mapping.maxLength === 'number' && mapping.maxLength > 0) {
                  if (typeof current[finalField] === 'string') {
                    // Check if the JSON-escaped length exceeds the max length
                    const jsonEscapedLength = JSON.stringify(current[finalField]).length - 2;
                    if (jsonEscapedLength > mapping.maxLength) {
                      current[finalField] = truncateJsonEscaped(current[finalField], mapping.maxLength);
                    }
                  }
                }
              } else if (mapping.dataType === 'boolean') {
                const fieldPath = mapping.fieldName.split('.');
                let current = obj;

                // Navigate to the field location, handling arrays
                for (let i = 0; i < fieldPath.length - 1; i++) {
                  if (current[fieldPath[i]] === undefined) {
                    current[fieldPath[i]] = {};
                  }

                  // If we encounter an array, process each item recursively
                  if (Array.isArray(current[fieldPath[i]])) {
                    const remainingPath = fieldPath.slice(i + 1).join('.');
                    const nestedMapping = { ...mapping, fieldName: remainingPath };
                    current[fieldPath[i]].forEach((item: any) => {
                      processObject(item, [nestedMapping]);
                    });
                    return;
                  }

                  current = current[fieldPath[i]];
                }

                const finalField = fieldPath[fieldPath.length - 1];

                // Normalize boolean value if field exists
                if (current[finalField] !== undefined) {
                  current[finalField] = normalizeBooleanValue(current[finalField]);
                }
              }
            });
          };
          
          // Helper function to format postal codes based on province/state
          const formatPostalCode = (postalCode: string, province: string): string => {
            if (!postalCode || !province) return postalCode;
            
            // Clean the postal code (remove spaces, hyphens, etc.)
            const cleaned = postalCode.replace(/[\s\-]/g, '').toUpperCase();
            
            // Canadian provinces
            const canadianProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
            
            if (canadianProvinces.includes(province.toUpperCase())) {
              // Canadian postal code: A1A 1A1 format
              if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
                return `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
              }
            } else {
              // US zip code: 12345 format (remove extended zip)
              if (/^\d{5}(\d{4})?$/.test(cleaned)) {
                return cleaned.substring(0, 5);
              }
            }
            
            // Return original if no formatting rules apply
            return postalCode;
          };
          
          // Helper function to format zone postal codes (startZone/endZone)
          const formatZonePostalCode = (postalCode: string): string => {
            if (!postalCode) return postalCode;
            
            // Clean the postal code (remove spaces, hyphens, etc.)
            const cleaned = postalCode.replace(/[\s\-]/g, '').toUpperCase();
            
            // Check if it matches Canadian postal code pattern
            if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
              return `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
            }
            
            // Check if it matches US zip code pattern
            if (/^\d{5}(\d{4})?$/.test(cleaned)) {
              return cleaned.substring(0, 5);
            }
            
            // Return original if no formatting rules apply
            return postalCode;
          };
          
          // Helper function to recursively format postal codes in an object
          const formatPostalCodes = (obj: any) => {
            if (Array.isArray(obj)) {
              obj.forEach(item => formatPostalCodes(item));
            } else if (obj && typeof obj === 'object') {
              // Check if this object has both postalCode and province fields
              if (obj.postalCode && obj.province) {
                obj.postalCode = formatPostalCode(obj.postalCode, obj.province);
              }
              
              // Format startZone and endZone fields (these are standalone postal codes)
              if (obj.startZone) {
                obj.startZone = formatZonePostalCode(obj.startZone);
              }
              if (obj.endZone) {
                obj.endZone = formatZonePostalCode(obj.endZone);
              }
              
              // Recursively process nested objects
              for (const value of Object.values(obj)) {
                if (typeof value === 'object') {
                  formatPostalCodes(value);
                }
              }
            }
          };
          
          // Additional cleanup: recursively find and fix all null string values
          const cleanupNullStrings = (obj: any) => {
            if (Array.isArray(obj)) {
              obj.forEach(item => cleanupNullStrings(item));
            } else if (obj && typeof obj === 'object') {
              for (const [key, value] of Object.entries(obj)) {
                if (value === null || value === "null") {
                  // Check if this should be a string field based on field mappings
                  const mapping = regularMappings.find(m => m.fieldName.endsWith(key) || m.fieldName === key);
                  if (!mapping || mapping.dataType === 'string' || !mapping.dataType) {
                    obj[key] = "";
                  }
                } else if (typeof value === 'object') {
                  cleanupNullStrings(value);
                }
              }
            }
          };
          
          // Process each order in the orders array
          jsonData.orders.forEach((order: any) => {
            processObject(order, regularMappings);
            cleanupNullStrings(order);
            formatPostalCodes(order);

            if (order.traceNumbers && Array.isArray(order.traceNumbers)) {
              order.traceNumbers = order.traceNumbers.filter((trace: any) => {
                return trace.traceNumber &&
                       trace.traceNumber !== "" &&
                       trace.traceNumber !== null &&
                       trace.traceNumber !== "null";
              });
            }
          });
        } else {
          // Even without field mappings, format postal codes
          const formatPostalCodes = (obj: any) => {
            if (Array.isArray(obj)) {
              obj.forEach(item => formatPostalCodes(item));
            } else if (obj && typeof obj === 'object') {
              // Check if this object has both postalCode and province fields
              if (obj.postalCode && obj.province) {
                const cleaned = obj.postalCode.replace(/[\s\-]/g, '').toUpperCase();
                const canadianProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
                
                if (canadianProvinces.includes(obj.province.toUpperCase())) {
                  // Canadian postal code: A1A 1A1 format
                  if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
                    obj.postalCode = `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
                  }
                } else {
                  // US zip code: 12345 format (remove extended zip)
                  if (/^\d{5}(\d{4})?$/.test(cleaned)) {
                    obj.postalCode = cleaned.substring(0, 5);
                  }
                }
              }
              
               // Format startZone and endZone fields (these are standalone postal codes)
               if (obj.startZone) {
                 const cleaned = obj.startZone.replace(/[\s\-]/g, '').toUpperCase();
                 // Check if it matches Canadian postal code pattern
                 if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
                   obj.startZone = `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
                 } else if (/^\d{5}(\d{4})?$/.test(cleaned)) {
                   // US zip code format
                   obj.startZone = cleaned.substring(0, 5);
                 }
               }
               if (obj.endZone) {
                 const cleaned = obj.endZone.replace(/[\s\-]/g, '').toUpperCase();
                 // Check if it matches Canadian postal code pattern
                 if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
                   obj.endZone = `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
                 } else if (/^\d{5}(\d{4})?$/.test(cleaned)) {
                   // US zip code format
                   obj.endZone = cleaned.substring(0, 5);
                 }
               }
               
              // Recursively process nested objects
              for (const value of Object.values(obj)) {
                if (typeof value === 'object') {
                  formatPostalCodes(value);
                }
              }
            }
          };
          
          // Format postal codes even without field mappings
          jsonData.orders.forEach((order: any) => {
            formatPostalCodes(order);
          });
        }

        // STEP 4: Remove fields marked with removeIfNull when they contain null/empty values
        if (regularMappings.length > 0) {
          const removeNullFields = (obj: any, mappings: any[]) => {
            mappings.forEach(mapping => {
              if (mapping.removeIfNull) {
                const fieldPath = mapping.fieldName.split('.');
                let current = obj;

                // Navigate to the parent of the field
                for (let i = 0; i < fieldPath.length - 1; i++) {
                  if (!current[fieldPath[i]]) {
                    return; // Path doesn't exist, nothing to remove
                  }

                  // If we encounter an array, process each item recursively
                  if (Array.isArray(current[fieldPath[i]])) {
                    const remainingPath = fieldPath.slice(i + 1).join('.');
                    const nestedMapping = { ...mapping, fieldName: remainingPath };
                    current[fieldPath[i]].forEach((item: any) => {
                      removeNullFields(item, [nestedMapping]);
                    });
                    return;
                  }

                  current = current[fieldPath[i]];
                }

                const finalField = fieldPath[fieldPath.length - 1];
                const fieldValue = current[finalField];

                // Remove field if value is null, empty string, undefined, or string "null"
                if (
                  fieldValue === null ||
                  fieldValue === "" ||
                  fieldValue === undefined ||
                  fieldValue === "null"
                ) {
                  delete current[finalField];
                }
              }
            });
          };

          // Process each order to remove null fields
          jsonData.orders.forEach((order: any) => {
            removeNullFields(order, regularMappings);
          });
        }

        // STEP 5: Evaluate function-type field mappings (including async address lookups)
        const functionMappings = fieldMappings.filter(m => m.type === 'function' && m.functionId);
        if (functionMappings.length > 0 && functions.length > 0) {
          const setFieldValue = (obj: any, fieldPath: string, value: any) => {
            const parts = fieldPath.split('.');
            let current = obj;
            for (let i = 0; i < parts.length - 1; i++) {
              if (current[parts[i]] === undefined) {
                current[parts[i]] = {};
              }
              if (Array.isArray(current[parts[i]])) {
                const remainingPath = parts.slice(i + 1).join('.');
                current[parts[i]].forEach((item: any) => {
                  setFieldValue(item, remainingPath, value);
                });
                return;
              }
              current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = value;
          };

          const isAddressLookupLogic = (logic: any): logic is AddressLookupFunctionLogic => {
            return logic && logic.type === 'address_lookup';
          };

          let wfoContextForFunctions: Record<string, any> = {};
          try {
            const parsedWfo = JSON.parse(workflowOnlyData) || {};
            wfoContextForFunctions = expandDottedKeys(parsedWfo);
          } catch {
            wfoContextForFunctions = {};
          }

          for (const order of jsonData.orders) {
            const evalContext = deepMergePlain(wfoContextForFunctions, order);
            for (const mapping of functionMappings) {
              const func = functions.find(f => f.id === mapping.functionId);
              if (func && func.function_logic) {
                let result: any;
                if (isAddressLookupLogic(func.function_logic)) {
                  result = await evaluateAddressLookup(func.function_logic, evalContext);
                } else {
                  result = evaluateFunction(func.function_logic, evalContext);
                }
                if (result !== undefined && result !== '' && result !== null && result !== 'null') {
                  setFieldValue(order, mapping.fieldName, result);
                }
              }
            }
          }
        }

        // STEP 5b: Resolve variable-type field mappings (copy from already-resolved fields)
        const variableMappings = fieldMappings.filter(m => m.type === 'variable' && m.value);
        if (variableMappings.length > 0) {
          const getFieldVal = (obj: any, path: string): any => {
            const parts = path.split('.');
            let current = obj;
            for (const part of parts) {
              if (current === null || current === undefined) return undefined;
              current = current[part];
            }
            return current;
          };
          const setFieldVal = (obj: any, fieldPath: string, value: any) => {
            const parts = fieldPath.split('.');
            let current = obj;
            for (let i = 0; i < parts.length - 1; i++) {
              if (current[parts[i]] === undefined) current[parts[i]] = {};
              if (Array.isArray(current[parts[i]])) {
                const remainingPath = parts.slice(i + 1).join('.');
                current[parts[i]].forEach((item: any) => setFieldVal(item, remainingPath, value));
                return;
              }
              current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = value;
          };
          for (const order of jsonData.orders) {
            for (const mapping of variableMappings) {
              const sourceValue = getFieldVal(order, mapping.value);
              if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
                setFieldVal(order, mapping.fieldName, sourceValue);
              }
            }
          }
        }

        // STEP 6: Construct arrays from array entry configs
        if (enabledArrayEntries.length > 0) {
          let wfoData: Record<string, any> = {};
          try {
            wfoData = JSON.parse(workflowOnlyData);
          } catch (parseErr) {
            console.warn('Failed to parse workflowOnlyData for array entries:', parseErr);
          }

          // Fallback: if expected __ARRAY_ENTRY_* keys are missing from wfoData,
          // check if the AI placed them in the templateData orders as extra fields
          const expectedArrayKeys = allExpectedWfoKeys.filter(k => k.startsWith('__ARRAY_ENTRY_') || k.startsWith('__REPEATING_ARRAY_'));
          const missingArrayKeys = expectedArrayKeys.filter(k => wfoData[k] === undefined);
          if (missingArrayKeys.length > 0 && jsonData.orders && Array.isArray(jsonData.orders)) {
            jsonData.orders.forEach((order: any) => {
              missingArrayKeys.forEach(key => {
                if (order[key] !== undefined) {
                  wfoData[key] = order[key];
                  delete order[key];
                }
              });
            });
            missingArrayKeys.forEach(key => {
              if (wfoData[key] === undefined && (jsonData as any)[key] !== undefined) {
                wfoData[key] = (jsonData as any)[key];
                delete (jsonData as any)[key];
              }
            });
          }

          Object.entries(resolvedMappedCoords).forEach(([key, value]) => {
            wfoData[key] = value;
          });

          const arrayEntryKeys = Object.keys(wfoData).filter(k => k.startsWith('__ARRAY_ENTRY_'));

          // Separate repeating and static entries
          const repeatingEntries = enabledArrayEntries.filter(e => e.isRepeating);
          const staticEntries = enabledArrayEntries.filter(e => !e.isRepeating);

          // Group static entries by target array field
          const staticEntriesByArray = new Map<string, ArrayEntryConfig[]>();
          staticEntries.forEach(entry => {
            if (!staticEntriesByArray.has(entry.targetArrayField)) {
              staticEntriesByArray.set(entry.targetArrayField, []);
            }
            staticEntriesByArray.get(entry.targetArrayField)!.push(entry);
          });

          // Process each order
          jsonData.orders.forEach((order: any, orderIdx: number) => {
            // Track which arrays were populated by our repeating entry processing
            const populatedByRepeatingEntry = new Set<string>();

            // Process repeating entries first - they come from AI as arrays
            repeatingEntries.forEach(entry => {
              const repeatingKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
              const extractedArray = wfoData[repeatingKey];

              if (Array.isArray(extractedArray) && extractedArray.length > 0) {
                const processedArray = extractedArray.map((row: Record<string, any>, rowIdx: number) => {
                  const processedRow: Record<string, any> = {};
                  let rinFieldWasNull = false;

                  entry.fields.forEach(field => {
                    let value: any;
                    if (field.fieldType === 'hardcoded') {
                      value = field.hardcodedValue || '';
                    } else {
                      value = row[field.fieldName];
                      if (value === undefined || value === null) {
                        value = '';
                      }
                    }

                    if (field.removeIfNull) {
                      const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                      if (rinCheck) {
                        rinFieldWasNull = true;
                        return;
                      }
                    }

                    if (field.dataType === 'number') {
                      value = parseFloat(String(value)) || 0;
                    } else if (field.dataType === 'integer') {
                      value = parseInt(String(value)) || 0;
                    } else if (field.dataType === 'boolean') {
                      value = normalizeBooleanValue(value);
                    } else if (field.dataType === 'string' && value) {
                      value = String(value).toUpperCase();
                    }

                    processedRow[field.fieldName] = value;
                  });

                  if (entry.removeEntryIfRinNull && rinFieldWasNull) {
                    return null;
                  }

                  return processedRow;
                }).filter((row: Record<string, any> | null) =>
                  row !== null && Object.values(row).some(v => v !== '' && v !== null && v !== undefined && v !== 0)
                );

                if (processedArray.length > 0) {
                  order[entry.targetArrayField] = processedArray;
                  populatedByRepeatingEntry.add(entry.targetArrayField);
                } else {
                  delete order[entry.targetArrayField];
                }

                delete wfoData[repeatingKey];
              } else {
                const existingArray = order[entry.targetArrayField];
                if (Array.isArray(existingArray) && existingArray.length > 0) {
                  const processedArray = existingArray.map((row: Record<string, any>, rowIdx: number) => {
                    let rinFieldWasNull = false;
                    const processedRow: Record<string, any> = { ...row };

                    entry.fields.forEach(field => {
                      if (field.removeIfNull) {
                        const value = processedRow[field.fieldName];
                        const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                        if (rinCheck) {
                          delete processedRow[field.fieldName];
                          rinFieldWasNull = true;
                        }
                      }
                    });

                    if (entry.removeEntryIfRinNull && rinFieldWasNull) {
                      return null;
                    }

                    return processedRow;
                  }).filter((row: Record<string, any> | null) => row !== null);

                  if (processedArray.length > 0) {
                    order[entry.targetArrayField] = processedArray;
                    populatedByRepeatingEntry.add(entry.targetArrayField);
                  } else {
                    delete order[entry.targetArrayField];
                  }
                }
              }
            });


            // Process static entries
            staticEntriesByArray.forEach((entries, arrayField) => {
              if (populatedByRepeatingEntry.has(arrayField)) {
                return;
              }


              const sortedEntries = [...entries].sort((a, b) => a.entryOrder - b.entryOrder);
              const constructedArray: any[] = [];

              sortedEntries.forEach(entry => {
                if (entry.aiConditionInstruction) {
                  const conditionKey = `__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`;
                  const conditionResult = String(wfoData[conditionKey] || '').toLowerCase();
                  delete wfoData[conditionKey];

                  if (conditionResult !== 'true') {
                    entry.fields.forEach(f => {
                      const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
                      delete wfoData[key];
                    });
                    return;
                  }
                }

                if (!evaluateArrayEntryConditions(entry.conditions, order, wfoData)) {
                  return;
                }

                const entryObj: Record<string, any> = {};
                let rinFieldWasNull = false;

                entry.fields.forEach(field => {
                  if (field.fieldType === 'hardcoded') {
                    let value: any = field.hardcodedValue || '';
                    if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                      rinFieldWasNull = true;
                      return;
                    }
                    if (field.dataType === 'number') {
                      value = parseFloat(value) || 0;
                    } else if (field.dataType === 'integer') {
                      value = parseInt(value) || 0;
                    } else if (field.dataType === 'boolean') {
                      value = normalizeBooleanValue(value);
                    } else if (field.dataType === 'string') {
                      value = String(value).toUpperCase();
                    }
                    entryObj[field.fieldName] = value;
                  } else if (field.fieldType === 'extracted' || field.fieldType === 'mapped') {
                    const extractionKey = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${field.fieldName}__`;
                    let value: any = wfoData[extractionKey] ?? '';
                    if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                      rinFieldWasNull = true;
                      delete wfoData[extractionKey];
                      return;
                    }
                    if (field.dataType === 'number') {
                      value = parseFloat(value) || 0;
                    } else if (field.dataType === 'integer') {
                      value = parseInt(value) || 0;
                    } else if (field.dataType === 'boolean') {
                      value = normalizeBooleanValue(value);
                    } else if (field.dataType === 'string' && value) {
                      value = String(value).toUpperCase();
                    }
                    entryObj[field.fieldName] = value;
                    delete wfoData[extractionKey];
                  }
                });

                if (entry.removeEntryIfRinNull && rinFieldWasNull) {
                  return;
                }

                const hasNonEmptyValue = Object.values(entryObj).some(v => v !== '' && v !== null && v !== undefined);
                if (hasNonEmptyValue) {
                  constructedArray.push(entryObj);
                }
              });

              const hadArrayEntryKeysInWfo = arrayEntryKeys.some(k => k.startsWith(`__ARRAY_ENTRY_${arrayField}_`));
              if (constructedArray.length > 0) {
                order[arrayField] = constructedArray;
              } else if (!hadArrayEntryKeysInWfo && Array.isArray(order[arrayField]) && order[arrayField].length > 0) {
                sortedEntries.forEach(entry => {
                  const templateIdx = entry.entryOrder - 1;
                  if (templateIdx >= 0 && templateIdx < order[arrayField].length) {
                    entry.fields.forEach(field => {
                      if (field.fieldType === 'hardcoded') {
                        let value: any = field.hardcodedValue || '';
                        if (field.dataType === 'number') {
                          value = parseFloat(value) || 0;
                        } else if (field.dataType === 'integer') {
                          value = parseInt(value) || 0;
                        } else if (field.dataType === 'boolean') {
                          value = normalizeBooleanValue(value);
                        } else if (field.dataType === 'string') {
                          value = String(value).toUpperCase();
                        }
                        order[arrayField][templateIdx][field.fieldName] = value;
                      }
                    });
                  }
                });
              } else {
                delete order[arrayField];
              }
            });
          });

          // Update workflowOnlyData to remove used extraction keys
          workflowOnlyData = JSON.stringify(wfoData);
        }

        templateData = JSON.stringify(jsonData);
      } catch (parseError) {
        console.warn('Could not parse JSON for post-processing:', parseError);
        // If parsing fails, we'll continue with the original content
      }

    } else {
      // XML format - no WFO support for XML currently
      extractedContent = extractedContent.replace(/```xml\n?/g, '').replace(/```\n?/g, '').trim();

      templateData = extractedContent;
      workflowOnlyData = '{}';

      // Post-process XML with precise trimming to remove any extraneous content
      try {
        // Find the root element from the template
        const templateMatch = formatTemplate.match(/<(\w+)[^>]*>/);
        if (templateMatch) {
          const rootElement = templateMatch[1];

          // Find the first occurrence of the opening tag and last occurrence of the closing tag
          const openingTag = `<${rootElement}`;
          const closingTag = `</${rootElement}>`;

          const startIndex = templateData.indexOf(openingTag);
          const endIndex = templateData.lastIndexOf(closingTag);

          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            // Calculate the end position (include the closing tag)
            const endPosition = endIndex + closingTag.length;

            // Extract only the content between the first opening tag and last closing tag
            templateData = templateData.substring(startIndex, endPosition).trim();

            console.log(`XML trimmed: found ${rootElement} from position ${startIndex} to ${endPosition}`);
          } else {
            console.warn(`Could not find complete ${rootElement} structure in XML response`);
            // Try to find any XML-like content as fallback
            if (templateData.includes('<') && templateData.includes('>')) {
              console.warn('Using original XML content as fallback');
            } else {
              throw new Error(`No valid ${rootElement} XML structure found in AI response`);
            }
          }
        }
      } catch (parseError) {
        console.warn('XML post-processing failed:', parseError);
        // If post-processing fails completely, ensure we at least have some XML content
        if (!templateData.includes('<') || !templateData.includes('>')) {
          throw new Error('No valid XML content found in AI response');
        }
      }
    }

    // Validate the response format
    if (isJsonFormat) {
      // Validate JSON
      try {
        JSON.parse(templateData);
      } catch (error) {
        throw new Error('Invalid JSON response from AI. Please try again.');
      }
    } else {
      // Validate XML
      if (!templateData.includes('<?xml') && !templateData.includes('<')) {
        throw new Error('Invalid XML response from AI. Please try again.');
      }

      // Additional validation: ensure the XML contains the expected root element
      try {
        const templateMatch = formatTemplate.match(/<(\w+)[^>]*>/);
        if (templateMatch) {
          const rootElement = templateMatch[1];
          if (!templateData.includes(`<${rootElement}`)) {
            throw new Error(`XML response missing expected root element: ${rootElement}`);
          }
        }
      } catch (validationError) {
        console.warn('XML structure validation warning:', validationError);
        // Don't throw here, just log the warning
      }
    }

    let confidenceScores: Record<string, number> | undefined;
    if (enableConfidenceScoring && formatType === 'JSON') {
      try {
        const aiMappings = fieldMappings.filter(m => m.type === 'ai');
        if (aiMappings.length > 0) {
          const fieldList = aiMappings.map(m => m.fieldName).join(', ');
          const confidencePrompt = `You are analyzing a PDF document alongside AI-extracted JSON data. For each of the following fields, provide a confidence score from 0 to 100 indicating how confident you are that the extracted value is correct based on the document content.

Fields to evaluate: ${fieldList}

Extracted data:
${templateData}

Return ONLY a JSON object mapping field names to confidence scores (integer 0-100). Example: {"fieldA": 95, "fieldB": 72}
No explanation, no extra text.`;

          const confidenceResponse = await callGeminiProxy([
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            confidencePrompt
          ], 'Confidence scoring');

          const cleaned = confidenceResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          confidenceScores = JSON.parse(cleaned);
        }
      } catch (confError) {
        console.warn('Confidence scoring failed, continuing without scores:', confError);
      }
    }

    try {
      const functionMappingsFinal = fieldMappings.filter(m => m.type === 'function' && m.functionId);
      if (functionMappingsFinal.length > 0) {
        const parsedTemplate = JSON.parse(templateData);
        console.log('[extractDataFromPDF:return] Function mapping values in final templateData:');
        for (const mapping of functionMappingsFinal) {
          const parts = mapping.fieldName.split('.');
          const ordersToCheck = Array.isArray(parsedTemplate?.orders) ? parsedTemplate.orders : [parsedTemplate];
          ordersToCheck.forEach((order: any, idx: number) => {
            let val: any = order;
            for (const p of parts) { val = val?.[p]; }
            console.log(`[extractDataFromPDF:return]   order[${idx}].${mapping.fieldName} = ${JSON.stringify(val)}`);
          });
        }
      }
    } catch (logErr) {
      console.warn('[extractDataFromPDF:return] Failed to log function mapping values:', logErr);
    }

    return {
      templateData,
      workflowOnlyData,
      confidenceScores
    };
  } catch (error) {
    console.error('Error extracting data from page:', error);
    throw new Error(`Failed to extract data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function extractJsonFromMultiPagePDF({
  pdfFiles,
  defaultInstructions,
  additionalInstructions,
  formatTemplate,
  fieldMappings = [],
  parseitIdMapping,
  traceTypeMapping,
  traceTypeValue,
  arraySplitConfigs = [],
  arrayEntryConfigs = [],
  functions = []
}: JsonMultiPageExtractionRequest): Promise<ExtractionResult> {
  if (!pdfFiles || pdfFiles.length === 0) {
    throw new Error('At least one PDF file is required');
  }

  try {
    const pdfBase64Array = await Promise.all(
      pdfFiles.map(file => fileToBase64(file))
    );

    const resolvedMappedCoords = await resolveMappedArrayEntryCoords(pdfFiles[0], arrayEntryConfigs, pdfFiles);

    const fullInstructions = additionalInstructions
      ? `${defaultInstructions}\n\nAdditional Instructions: ${additionalInstructions}`
      : defaultInstructions;

    const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
    const wfoMappings = fieldMappings.filter(m => m.isWorkflowOnly);

    const postalCodeRules = `

POSTAL CODE FORMATTING RULES:
- Canadian Postal Codes: Always format as "AAA AAA" (3 letters, space, 3 letters/numbers) - Example: "H1W 1S3" not "H1W1S3"
- US Zip Codes: Always format as "11111" (5 digits, no spaces or dashes) - Example: "90210" not "90210-1234"
- If you detect a Canadian postal code pattern (letter-number-letter number-letter-number), add the space: "H1W1S3" becomes "H1W 1S3"
- If you detect a US zip code pattern, use only the first 5 digits: "90210-1234" becomes "90210"

PROVINCE AND STATE FORMATTING RULES:
- Canadian Provinces: Always format as 2-letter code only - Example: "BC" not "British Columbia", "ON" not "Ontario"
- US States: Always format as 2-letter code only - Example: "WA" not "Washington", "CA" not "California"
- If you detect a full province or state name, convert it to the 2-letter code
- Valid Canadian province codes: AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT
- Valid US state codes: AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY`;

    let fieldMappingInstructions = '';
    if (regularMappings.length > 0) {
      fieldMappingInstructions = '\n\nFIELD MAPPING INSTRUCTIONS:\n';
      regularMappings.forEach(mapping => {
        if (mapping.type === 'hardcoded') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (as formatted phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          fieldMappingInstructions += `- "${mapping.fieldName}": Always use the EXACT hardcoded value "${mapping.value}"${dataTypeNote}\n`;
        } else if (mapping.type === 'mapped') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          fieldMappingInstructions += `- "${mapping.fieldName}": Extract data from PDF coordinates ${mapping.value}${dataTypeNote}\n`;
        } else {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          fieldMappingInstructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`;
        }
      });
    }

    let parseitIdInstructions = '';
    if (parseitIdMapping) {
      parseitIdInstructions = `\n\nPARSE-IT ID MAPPING:\n- "${parseitIdMapping}": This field will be automatically populated with a unique Parse-It ID number. For now, use the placeholder value "{{PARSE_IT_ID_PLACEHOLDER}}" (this will be replaced automatically).\n`;
    }

    let traceTypeInstructions = '';
    if (traceTypeMapping && traceTypeValue) {
      traceTypeInstructions = `\n\nTRACE TYPE MAPPING:\n- "${traceTypeMapping}": Always set this field to the exact value "${traceTypeValue}".\n`;
    }

    let arraySplitInstructions = '';
    if (arraySplitConfigs && arraySplitConfigs.length > 0) {
      arraySplitInstructions = '\n\nARRAY SPLIT INSTRUCTIONS:\n';
      arraySplitConfigs.forEach(config => {
        if (config.splitStrategy === 'one_per_entry') {
          const fallbackInstruction = config.defaultToOneIfMissing
            ? ` If the "${config.splitBasedOnField}" field is not found, empty, or has a value of 0, create 1 entry in the "${config.targetArrayField}" array with "${config.splitBasedOnField}" set to 1.`
            : '';
          arraySplitInstructions += `- For the "${config.targetArrayField}" array: Look at the value of the "${config.splitBasedOnField}" field in the document. If this field has a value of N (for example, if "${config.splitBasedOnField}" = 3), create N separate entries in the "${config.targetArrayField}" array. Each entry should have "${config.splitBasedOnField}" set to 1, and all other fields should contain the same data from the document. For example, if pieces = 3, create 3 barcode entries each with pieces = 1.${fallbackInstruction}\n`;
        } else {
          const fallbackInstruction = config.defaultToOneIfMissing
            ? ` If the "${config.splitBasedOnField}" field is not found, empty, or has a value of 0, create 1 entry in the "${config.targetArrayField}" array.`
            : '';
          arraySplitInstructions += `- For the "${config.targetArrayField}" array: Look at the value of the "${config.splitBasedOnField}" field and create multiple entries distributing the value evenly across them based on the data in the document.${fallbackInstruction}\n`;
        }
      });
    }

    let arrayEntryExtractionInstructions = '';
    const enabledArrayEntries = arrayEntryConfigs.filter(e => e.isEnabled);

    if (enabledArrayEntries.length > 0) {
      const repeatingEntries = enabledArrayEntries.filter(e => e.isRepeating);
      const staticEntries = enabledArrayEntries.filter(e => !e.isRepeating);

      const conditionalEntries = staticEntries.filter((e: any) => e.aiConditionInstruction);
      const unconditionalEntries = staticEntries.filter((e: any) => !e.aiConditionInstruction);

      const staticExtractedFields = unconditionalEntries.flatMap(entry =>
        entry.fields
          .filter(f => {
            const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
            if (f.fieldType === 'mapped' && resolvedMappedCoords[key] !== undefined) return false;
            return (
              (f.fieldType === 'extracted' && f.extractionInstruction) ||
              (f.fieldType === 'mapped' && f.extractionInstruction)
            );
          })
          .map(f => ({
            key: `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`,
            instruction: f.fieldType === 'mapped'
              ? `Extract data from PDF coordinates ${f.extractionInstruction}`
              : f.extractionInstruction,
            dataType: f.dataType || 'string',
            dateOnly: f.dateOnly,
            inputDateFormat: f.inputDateFormat
          }))
      );
      if (staticExtractedFields.length > 0) {
        arrayEntryExtractionInstructions = '\n\nARRAY ENTRY FIELD EXTRACTIONS:\n';
        arrayEntryExtractionInstructions += 'Extract these additional values as standalone fields in the workflow-only data section:\n';
        arrayEntryExtractionInstructions += 'IMPORTANT: Each instruction below describes what to look for on the PDF. If the instruction contains a label (e.g., "#Facture/Invoice:" or "PO Number:"), extract the VALUE found next to or near that label on the document, NOT the label text itself.\n';
        staticExtractedFields.forEach((field) => {
          const dataTypeNote = field.dataType === 'string' ? ' (as UPPER CASE string)' :
                              field.dataType === 'number' ? ' (format as number)' :
                              field.dataType === 'integer' ? ' (format as integer)' :
                              field.dataType === 'datetime' ? getDateTimeNote(field) :
                              field.dataType === 'date' ? getDateNote(field) :
                              field.dataType === 'time' ? getTimeNote(field) : '';
          arrayEntryExtractionInstructions += `- "${field.key}": ${field.instruction}${dataTypeNote}\n`;
        });
      }

      if (conditionalEntries.length > 0) {
        arrayEntryExtractionInstructions += '\n\nCONDITIONAL ARRAY ENTRY EXTRACTIONS:\n';
        arrayEntryExtractionInstructions += 'For each group below, first check the AI condition on the PDF. If the condition is NOT met, return null for ALL fields in that group.\n';
        arrayEntryExtractionInstructions += 'If the condition IS met, extract the values as described.\n';
        arrayEntryExtractionInstructions += 'IMPORTANT: If the instruction contains a label (e.g., "#Facture/Invoice:" or "PO Number:"), extract the VALUE found next to or near that label on the document, NOT the label text itself.\n\n';

        conditionalEntries.forEach((entry: any) => {
          const conditionKey = `__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`;
          arrayEntryExtractionInstructions += `Condition check for ${entry.targetArrayField}[${entry.entryOrder}]: ${entry.aiConditionInstruction}\n`;
          arrayEntryExtractionInstructions += `- "${conditionKey}": Set to "true" if the condition is met, "false" if not\n`;

          entry.fields
            .filter((f: ArrayEntryField) => {
              const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
              if (f.fieldType === 'mapped' && resolvedMappedCoords[key] !== undefined) return false;
              return (
                (f.fieldType === 'extracted' && f.extractionInstruction) ||
                (f.fieldType === 'mapped' && f.extractionInstruction)
              );
            })
            .forEach((f: ArrayEntryField) => {
              const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
              const dataTypeNote = (f.dataType || 'string') === 'string' ? ' (as UPPER CASE string)' :
                                  f.dataType === 'number' ? ' (format as number)' :
                                  f.dataType === 'integer' ? ' (format as integer)' :
                                  f.dataType === 'datetime' ? getDateTimeNote(f) :
                                  f.dataType === 'date' ? getDateNote(f) :
                                  f.dataType === 'time' ? getTimeNote(f) : '';
              const promptInstruction = f.fieldType === 'mapped'
                ? `Extract data from PDF coordinates ${f.extractionInstruction}`
                : f.extractionInstruction;
              arrayEntryExtractionInstructions += `- "${key}": ${promptInstruction}${dataTypeNote} (only if condition is met, otherwise null)\n`;
            });
          arrayEntryExtractionInstructions += '\n';
        });
      }

      if (repeatingEntries.length > 0) {
        arrayEntryExtractionInstructions += '\n\nREPEATING ARRAY EXTRACTIONS:\n';
        arrayEntryExtractionInstructions += 'For each of the following, find ALL matching rows in the PDF and return an ARRAY of objects:\n\n';

        repeatingEntries.forEach(entry => {
          const arrayKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
          arrayEntryExtractionInstructions += `- "${arrayKey}": ${entry.repeatInstruction || 'Find all matching rows'}\n`;
          arrayEntryExtractionInstructions += `  Return as an array of objects, where each object has these fields:\n`;

          entry.fields.forEach(field => {
            const dataTypeNote = field.dataType === 'string' ? ' (UPPER CASE string)' :
                                field.dataType === 'number' ? ' (number)' :
                                field.dataType === 'integer' ? ' (integer)' :
                                field.dataType === 'datetime' ? getDateTimeNote(field) :
                                field.dataType === 'date' ? getDateNote(field) :
                                field.dataType === 'time' ? getTimeNote(field) :
                                field.dataType === 'boolean' ? ' (boolean: use "True" or "False" as string)' : '';
            if (field.fieldType === 'hardcoded') {
              arrayEntryExtractionInstructions += `    - "${field.fieldName}": Always "${field.hardcodedValue}"${dataTypeNote}\n`;
            } else {
              arrayEntryExtractionInstructions += `    - "${field.fieldName}": ${field.extractionInstruction}${dataTypeNote}\n`;
            }
          });
          arrayEntryExtractionInstructions += '\n';
        });
      }
    }

    const hasArrayEntryExtractions = arrayEntryExtractionInstructions.length > 0;

    let wfoInstructions = '';
    if (wfoMappings.length > 0) {
      wfoInstructions = '\n\nWORKFLOW-ONLY FIELDS (SEPARATE EXTRACTION):\n';
      wfoInstructions += 'Extract these additional fields as standalone variables for workflow use (NOT part of the main template structure):\n';
      wfoMappings.forEach(mapping => {
        if (mapping.type === 'hardcoded') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (as formatted phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          wfoInstructions += `- "${mapping.fieldName}": Always use the EXACT hardcoded value "${mapping.value}"${dataTypeNote}\n`;
        } else if (mapping.type === 'mapped') {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          wfoInstructions += `- "${mapping.fieldName}": Extract data from PDF coordinates ${mapping.value}${dataTypeNote}\n`;
        } else {
          const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                              mapping.dataType === 'number' ? ' (format as number)' :
                              mapping.dataType === 'integer' ? ' (format as integer)' :
                              mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                              mapping.dataType === 'date' ? getDateNote(mapping) :
                              mapping.dataType === 'time' ? getTimeNote(mapping) :
                              mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                              mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code A1A 1A1 - Canadian codes follow strict Letter-Digit-Letter Digit-Letter-Digit pattern, carefully distinguish letter O from digit 0)' : '';
          wfoInstructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`;
        }
      });
    }

    const hasWFOFields = wfoMappings.length > 0 || hasArrayEntryExtractions;

    // Build explicit list of ALL expected workflowOnlyData keys for the prompt
    const allExpectedWfoKeys: string[] = [];
    wfoMappings.forEach(m => allExpectedWfoKeys.push(m.fieldName));
    if (hasArrayEntryExtractions) {
      const enabledForKeys = arrayEntryConfigs.filter(e => e.isEnabled);
      const staticForKeys = enabledForKeys.filter(e => !e.isRepeating);
      const repeatingForKeys = enabledForKeys.filter(e => e.isRepeating);
      staticForKeys.forEach(entry => {
        if ((entry as any).aiConditionInstruction) {
          allExpectedWfoKeys.push(`__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`);
        }
        entry.fields.forEach(f => {
          if ((f.fieldType === 'extracted' && f.extractionInstruction) || (f.fieldType === 'mapped' && f.extractionInstruction)) {
            allExpectedWfoKeys.push(`__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`);
          }
        });
      });
      repeatingForKeys.forEach(entry => {
        allExpectedWfoKeys.push(`__REPEATING_ARRAY_${entry.targetArrayField}__`);
      });
    }

    let wfoKeysListInstruction = '';
    if (allExpectedWfoKeys.length > 0) {
      wfoKeysListInstruction = `\n\nCRITICAL - The workflowOnlyData object MUST contain ALL of the following keys:\n${allExpectedWfoKeys.map(k => `  "${k}"`).join('\n')}\n\nDo NOT omit any of these keys. Every key listed above must appear in the workflowOnlyData object with its extracted value.`;
    }

    const prompt = `
You are a data extraction AI analyzing ${pdfFiles.length} PDF pages that belong to the SAME document and must be processed together as ONE complete document.

⚠️ CRITICAL: These ${pdfFiles.length} pages are from the SAME PDF document. You must analyze ALL pages together and extract the complete information across all pages to produce a SINGLE JSON output.

⚠️ ABSOLUTE REQUIREMENT: The "orders" array in your output MUST contain exactly 1 entry. All ${pdfFiles.length} pages belong to ONE single order. Combine and merge all information from every page into that single order entry. Do NOT create separate order entries for different pages. Even if different pages contain different line items, reference numbers, or sections, they are all part of the SAME single order and must be merged into ONE order object.

EXTRACTION INSTRUCTIONS:
${fullInstructions}${fieldMappingInstructions}${parseitIdInstructions}${traceTypeInstructions}${arraySplitInstructions}${arrayEntryExtractionInstructions}${wfoInstructions}${postalCodeRules}

OUTPUT FORMAT:
${hasWFOFields ? 'You need to extract TWO separate data structures from the PDF:\n\n1. MAIN TEMPLATE DATA:\n' : ''}Please format the extracted data as JSON following this EXACT JSON structure:
${formatTemplate}${hasWFOFields ? `\n\n2. WORKFLOW-ONLY DATA:\nProvide the workflow-only fields as a separate JSON object with the field names as keys and their extracted values.\n\nIMPORTANT: Return BOTH structures in a wrapper object like this:\n{\n  "templateData": <your extracted template data here>,\n  "workflowOnlyData": {\n    <workflow field name>: <extracted value>,\n    ...\n  }\n}\n\nIf there are no workflow-only fields, set workflowOnlyData to an empty object {}.${wfoKeysListInstruction}` : ''}

IMPORTANT GUIDELINES:
1. Process ALL ${pdfFiles.length} pages together - they are part of the same document
2. Extract information from across all pages to create one complete JSON output
3. Only extract information that is clearly visible in the document
4. CRITICAL: Follow the EXACT structure provided in the template. Do not add extra fields at the root level or change the nesting structure
5. If a field is not found, use empty string ("") for text fields, 0 for numbers, null for fields that should be null, or [] for arrays. For datetime fields that are empty, use today's date in yyyy-MM-ddThh:mm:ss format
6. Maintain the exact JSON structure provided and preserve exact case for all hardcoded values
7. Do NOT duplicate fields outside of their proper nested structure
8. Ensure valid JSON syntax with proper quotes and brackets
9. Use appropriate data types (dates, numbers, text). For JSON, ensure empty values are represented as empty strings (""), not "N/A". CRITICAL: For hardcoded values, use the EXACT case as specified (e.g., "True" not "true", "False" not "false"). For datetime fields, use the format yyyy-MM-ddThh:mm:ss (e.g., "2024-03-15T14:30:00"). If a datetime field is empty or not found, use today's date and current time in the same format. CRITICAL: For all string data type fields (dataType="string"), convert the extracted value to UPPER CASE before including it in the output
10. Be precise and accurate with the extracted data
11. CRITICAL: For JSON output, the ONLY top-level key allowed is "orders". Do NOT include any other top-level keys or duplicate fields at the root level. Return ONLY the JSON structure from the template - no additional fields outside the "orders" array. The "orders" array MUST have exactly 1 entry since all pages are ONE order.

Please provide only the JSON output without any additional explanation or formatting.
`;

    const parts = [
      ...pdfBase64Array.map(base64 => ({
        inlineData: {
          mimeType: 'application/pdf',
          data: base64
        }
      })),
      prompt
    ];

    let extractedContent = await callGeminiProxy(parts, 'JSON multi-page extraction');

    let templateData: string;
    let workflowOnlyData: string = '{}';

    extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    if (hasWFOFields) {
      try {
        const wrapper = JSON.parse(extractedContent);
        if (wrapper.templateData && wrapper.workflowOnlyData !== undefined) {
          templateData = typeof wrapper.templateData === 'string'
            ? wrapper.templateData
            : JSON.stringify(wrapper.templateData);
          workflowOnlyData = typeof wrapper.workflowOnlyData === 'string'
            ? wrapper.workflowOnlyData
            : JSON.stringify(wrapper.workflowOnlyData);
        } else {
          templateData = extractedContent;
          workflowOnlyData = '{}';
        }
      } catch (wrapperError) {
        templateData = extractedContent;
        workflowOnlyData = '{}';
      }
    } else {
      templateData = extractedContent;
    }

    try {
      let jsonData = JSON.parse(templateData);

      const allowedTopLevelKeys = ['orders'];
      const keysToRemove = Object.keys(jsonData).filter(key => !allowedTopLevelKeys.includes(key));
      keysToRemove.forEach(key => {
        delete jsonData[key];
      });

      if (!jsonData.orders || !Array.isArray(jsonData.orders)) {
        jsonData.orders = [];
      }

      if (regularMappings.length > 0) {
        const currentDateTime = new Date().toISOString().slice(0, 19);

        const processObject = (obj: any, mappings: any[]) => {
          mappings.forEach(mapping => {
            if (mapping.dataType === 'datetime') {
              const fieldPath = mapping.fieldName.split('.');
              let current = obj;

              for (let i = 0; i < fieldPath.length - 1; i++) {
                if (current[fieldPath[i]] === undefined) {
                  current[fieldPath[i]] = {};
                }

                if (Array.isArray(current[fieldPath[i]])) {
                  const remainingPath = fieldPath.slice(i + 1).join('.');
                  const nestedMapping = { ...mapping, fieldName: remainingPath };
                  current[fieldPath[i]].forEach((item: any) => {
                    processObject(item, [nestedMapping]);
                  });
                  return;
                }

                current = current[fieldPath[i]];
              }

              const finalField = fieldPath[fieldPath.length - 1];

              if (!current[finalField] || current[finalField] === "" || current[finalField] === "N/A") {
                if (mapping.type === 'hardcoded' && mapping.value) {
                  current[finalField] = mapping.value;
                } else {
                  current[finalField] = currentDateTime;
                }
              }

              if (mapping.inputDateFormat && current[finalField] && typeof current[finalField] === 'string') {
                const dateMatch = String(current[finalField]).match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                  const mo = parseInt(dateMatch[2], 10);
                  const da = parseInt(dateMatch[3], 10);
                  if (mo > 12 && da <= 12) {
                    current[finalField] = String(current[finalField]).replace(/^(\d{4})-(\d{2})-(\d{2})/, `${dateMatch[1]}-${dateMatch[3]}-${dateMatch[2]}`);
                    console.log(`[DateFix] Swapped month/day for ${mapping.fieldName}: inputDateFormat=${mapping.inputDateFormat}`);
                  }
                }
              }

              if (mapping.dateOnly && current[finalField]) {
                const dateValue = String(current[finalField]);
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                  current[finalField] = `${dateValue}T00:00:00`;
                } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateValue)) {
                  current[finalField] = `${dateValue.slice(0, 10)}T00:00:00`;
                }
              }
            } else if (mapping.dataType === 'phone') {
              const fieldPath = mapping.fieldName.split('.');
              let current = obj;

              for (let i = 0; i < fieldPath.length - 1; i++) {
                if (current[fieldPath[i]] === undefined) {
                  current[fieldPath[i]] = {};
                }

                if (Array.isArray(current[fieldPath[i]])) {
                  const remainingPath = fieldPath.slice(i + 1).join('.');
                  const nestedMapping = { ...mapping, fieldName: remainingPath };
                  current[fieldPath[i]].forEach((item: any) => {
                    processObject(item, [nestedMapping]);
                  });
                  return;
                }

                current = current[fieldPath[i]];
              }

              const finalField = fieldPath[fieldPath.length - 1];

              if (current[finalField]) {
                const formatted = formatPhoneNumber(String(current[finalField]));
                if (formatted) {
                  current[finalField] = formatted;
                }
              }
            }
          });
        };

        jsonData.orders.forEach((order: any) => {
          processObject(order, regularMappings);
        });
      }

      // Evaluate function-type field mappings (including async address lookups)
      const functionMappings = fieldMappings.filter(m => m.type === 'function' && m.functionId);
      if (functionMappings.length > 0 && functions.length > 0) {
        const setFieldValue = (obj: any, fieldPath: string, value: any) => {
          const parts = fieldPath.split('.');
          let current = obj;
          for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) {
              current[parts[i]] = {};
            }
            if (Array.isArray(current[parts[i]])) {
              const remainingPath = parts.slice(i + 1).join('.');
              current[parts[i]].forEach((item: any) => {
                setFieldValue(item, remainingPath, value);
              });
              return;
            }
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
        };

        const isAddressLookupLogic = (logic: any): logic is AddressLookupFunctionLogic => {
          return logic && logic.type === 'address_lookup';
        };

        let wfoContextForFunctionsMP: Record<string, any> = {};
        try {
          const parsedWfo = JSON.parse(workflowOnlyData) || {};
          wfoContextForFunctionsMP = expandDottedKeys(parsedWfo);
        } catch {
          wfoContextForFunctionsMP = {};
        }

        for (const order of jsonData.orders) {
          const evalContext = deepMergePlain(wfoContextForFunctionsMP, order);
          for (const mapping of functionMappings) {
            const func = functions.find(f => f.id === mapping.functionId);
            if (func && func.function_logic) {
              let result: any;
              if (isAddressLookupLogic(func.function_logic)) {
                result = await evaluateAddressLookup(func.function_logic, evalContext);
              } else {
                result = evaluateFunction(func.function_logic, evalContext);
              }
              if (result !== undefined && result !== '' && result !== null && result !== 'null') {
                setFieldValue(order, mapping.fieldName, result);
              }
            }
          }
        }
      }

      // Resolve variable-type field mappings (copy from already-resolved fields)
      const variableMappings = fieldMappings.filter(m => m.type === 'variable' && m.value);
      if (variableMappings.length > 0) {
        const getFieldVal = (obj: any, path: string): any => {
          const parts = path.split('.');
          let current = obj;
          for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
          }
          return current;
        };
        const setFieldVal = (obj: any, fieldPath: string, value: any) => {
          const parts = fieldPath.split('.');
          let current = obj;
          for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) current[parts[i]] = {};
            if (Array.isArray(current[parts[i]])) {
              const remainingPath = parts.slice(i + 1).join('.');
              current[parts[i]].forEach((item: any) => setFieldVal(item, remainingPath, value));
              return;
            }
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
        };
        for (const order of jsonData.orders) {
          for (const mapping of variableMappings) {
            const sourceValue = getFieldVal(order, mapping.value);
            if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
              setFieldVal(order, mapping.fieldName, sourceValue);
            }
          }
        }
      }

      if (enabledArrayEntries.length > 0) {
        let wfoData: Record<string, any> = {};
        try {
          wfoData = JSON.parse(workflowOnlyData);
        } catch (parseErr) {
          console.warn('[extractJsonFromMultiPagePDF] Failed to parse workflowOnlyData for array entries:', parseErr);
        }

        // Fallback: if expected __ARRAY_ENTRY_* keys are missing from wfoData,
        // check if the AI placed them in the templateData orders as extra fields
        const expectedArrayKeys = allExpectedWfoKeys.filter(k => k.startsWith('__ARRAY_ENTRY_') || k.startsWith('__REPEATING_ARRAY_'));
        const missingArrayKeys = expectedArrayKeys.filter(k => wfoData[k] === undefined);
        if (missingArrayKeys.length > 0 && jsonData.orders && Array.isArray(jsonData.orders)) {
          jsonData.orders.forEach((order: any) => {
            missingArrayKeys.forEach(key => {
              if (order[key] !== undefined) {
                wfoData[key] = order[key];
                delete order[key];
              }
            });
          });
          missingArrayKeys.forEach(key => {
            if (wfoData[key] === undefined && (jsonData as any)[key] !== undefined) {
              wfoData[key] = (jsonData as any)[key];
              delete (jsonData as any)[key];
            }
          });
        }

        Object.entries(resolvedMappedCoords).forEach(([key, value]) => {
          wfoData[key] = value;
        });

        const repeatingEntries = enabledArrayEntries.filter(e => e.isRepeating);
        const staticEntries = enabledArrayEntries.filter(e => !e.isRepeating);

        const staticEntriesByArray = new Map<string, ArrayEntryConfig[]>();
        staticEntries.forEach(entry => {
          if (!staticEntriesByArray.has(entry.targetArrayField)) {
            staticEntriesByArray.set(entry.targetArrayField, []);
          }
          staticEntriesByArray.get(entry.targetArrayField)!.push(entry);
        });

        jsonData.orders.forEach((order: any, orderIdx: number) => {
          const populatedByRepeatingEntry = new Set<string>();

          repeatingEntries.forEach(entry => {
            const repeatingKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
            const extractedArray = wfoData[repeatingKey];

            if (Array.isArray(extractedArray) && extractedArray.length > 0) {
              const processedArray = extractedArray.map((row: Record<string, any>) => {
                const processedRow: Record<string, any> = {};
                let rinFieldWasNull = false;

                entry.fields.forEach(field => {
                  let value: any;
                  if (field.fieldType === 'hardcoded') {
                    value = field.hardcodedValue || '';
                  } else {
                    value = row[field.fieldName];
                    if (value === undefined || value === null) {
                      value = '';
                    }
                  }

                  if (field.removeIfNull) {
                    const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                    if (rinCheck) {
                      rinFieldWasNull = true;
                      return;
                    }
                  }

                  if (field.dataType === 'number') {
                    value = parseFloat(String(value)) || 0;
                  } else if (field.dataType === 'integer') {
                    value = parseInt(String(value)) || 0;
                  } else if (field.dataType === 'boolean') {
                    value = normalizeBooleanValue(value);
                  } else if (field.dataType === 'string' && value) {
                    value = String(value).toUpperCase();
                  }

                  processedRow[field.fieldName] = value;
                });

                if ((entry as any).removeEntryIfRinNull && rinFieldWasNull) {
                  return null;
                }

                return processedRow;
              }).filter((row: Record<string, any> | null) =>
                row !== null && Object.values(row).some(v => v !== '' && v !== null && v !== undefined && v !== 0)
              );

              if (processedArray.length > 0) {
                order[entry.targetArrayField] = processedArray;
                populatedByRepeatingEntry.add(entry.targetArrayField);
              } else {
                delete order[entry.targetArrayField];
              }

              delete wfoData[repeatingKey];
            } else {
              const existingArray = order[entry.targetArrayField];
              if (Array.isArray(existingArray) && existingArray.length > 0) {
                const processedArray = existingArray.map((row: Record<string, any>) => {
                  let rinFieldWasNull = false;
                  const processedRow: Record<string, any> = { ...row };

                  entry.fields.forEach(field => {
                    if (field.removeIfNull) {
                      const value = processedRow[field.fieldName];
                      const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                      if (rinCheck) {
                        delete processedRow[field.fieldName];
                        rinFieldWasNull = true;
                      }
                    }
                  });

                  if ((entry as any).removeEntryIfRinNull && rinFieldWasNull) {
                    return null;
                  }

                  return processedRow;
                }).filter((row: Record<string, any> | null) => row !== null);

                if (processedArray.length > 0) {
                  order[entry.targetArrayField] = processedArray;
                  populatedByRepeatingEntry.add(entry.targetArrayField);
                } else {
                  delete order[entry.targetArrayField];
                }
              }
            }
          });

          staticEntriesByArray.forEach((entries, arrayField) => {
            if (populatedByRepeatingEntry.has(arrayField)) {
              return;
            }

            const sortedEntries = [...entries].sort((a, b) => a.entryOrder - b.entryOrder);
            const constructedArray: any[] = [];

            sortedEntries.forEach(entry => {

              if ((entry as any).aiConditionInstruction) {
                const conditionKey = `__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`;
                const conditionResult = String(wfoData[conditionKey] || '').toLowerCase();
                delete wfoData[conditionKey];

                if (conditionResult !== 'true') {
                  entry.fields.forEach(f => {
                    const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
                    delete wfoData[key];
                  });
                  return;
                }
              }

              if (!evaluateArrayEntryConditions(entry.conditions, order, wfoData)) {
                return;
              }

              const entryObj: Record<string, any> = {};
              let rinFieldWasNull = false;

              entry.fields.forEach(field => {
                if (field.fieldType === 'hardcoded') {
                  let value: any = field.hardcodedValue || '';
                  if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                    rinFieldWasNull = true;
                    return;
                  }
                  if (field.dataType === 'number') {
                    value = parseFloat(value) || 0;
                  } else if (field.dataType === 'integer') {
                    value = parseInt(value) || 0;
                  } else if (field.dataType === 'boolean') {
                    value = normalizeBooleanValue(value);
                  } else if (field.dataType === 'string') {
                    value = String(value).toUpperCase();
                  }
                  entryObj[field.fieldName] = value;
                } else if (field.fieldType === 'extracted' || field.fieldType === 'mapped') {
                  const extractionKey = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${field.fieldName}__`;
                  let value: any = wfoData[extractionKey] ?? '';
                  if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                    rinFieldWasNull = true;
                    delete wfoData[extractionKey];
                    return;
                  }
                  if (field.dataType === 'number') {
                    value = parseFloat(value) || 0;
                  } else if (field.dataType === 'integer') {
                    value = parseInt(value) || 0;
                  } else if (field.dataType === 'boolean') {
                    value = normalizeBooleanValue(value);
                  } else if (field.dataType === 'string' && value) {
                    value = String(value).toUpperCase();
                  }
                  entryObj[field.fieldName] = value;
                  delete wfoData[extractionKey];
                }
              });

              if ((entry as any).removeEntryIfRinNull && rinFieldWasNull) {
                return;
              }

              const hasNonEmptyValue = Object.values(entryObj).some(v => v !== '' && v !== null && v !== undefined);
              if (hasNonEmptyValue) {
                constructedArray.push(entryObj);
              }
            });

            if (constructedArray.length > 0) {
              order[arrayField] = constructedArray;
            } else {
              delete order[arrayField];
            }
          });
        });

        workflowOnlyData = JSON.stringify(wfoData);
      }

      templateData = JSON.stringify(jsonData);
    } catch (jsonError) {
      console.warn('[extractJsonFromMultiPagePDF] JSON post-processing failed, using raw data:', jsonError);
    }

    return {
      templateData,
      workflowOnlyData
    };
  } catch (error) {
    console.error('[extractJsonFromMultiPagePDF] Error during extraction:', error);
    throw error;
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}