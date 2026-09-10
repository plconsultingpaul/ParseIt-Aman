import { FieldMapping, ArraySplitConfig, ArrayEntryConfig, ExtractionType } from '../types.ts';

const getDateTimeNote = (m: { dateOnly?: boolean; inputDateFormat?: string }): string => {
  const outputFmt = m.dateOnly
    ? ' (as date string in yyyy-MM-dd format)'
    : ' (as datetime string in yyyy-MM-ddThh:mm:ss format)';
  if (m.inputDateFormat) {
    return `${outputFmt}. IMPORTANT: Dates in the source document are written in ${m.inputDateFormat} format, so interpret them accordingly before converting to the output format`;
  }
  return outputFmt;
};

export const postalCodeRules = `

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

export function buildFieldMappingInstructions(fieldMappings: FieldMapping[]): string {
  const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
  if (regularMappings.length === 0) return '';

  let instructions = '\n\nFIELD MAPPING INSTRUCTIONS:\n';
  regularMappings.forEach(mapping => {
    const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                        mapping.dataType === 'number' ? ' (format as number)' :
                        mapping.dataType === 'integer' ? ' (format as integer)' :
                        mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                        mapping.dataType === 'phone' ? ' (format as phone number XXX-XXX-XXXX)' :
                        mapping.dataType === 'boolean' ? ' (format as True or False)' :
                        mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code X1X 1X1)' : '';

    if (mapping.type === 'hardcoded') {
      instructions += `- "${mapping.fieldName}": Always use the EXACT hardcoded value "${mapping.value}"${dataTypeNote}\n`;
    } else if (mapping.type === 'mapped') {
      instructions += `- "${mapping.fieldName}": Extract data from PDF coordinates ${mapping.value}${dataTypeNote}\n`;
    } else {
      instructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`;
    }
  });
  return instructions;
}

export function buildWfoInstructions(fieldMappings: FieldMapping[]): string {
  const wfoMappings = fieldMappings.filter(m => m.isWorkflowOnly);
  if (wfoMappings.length === 0) return '';

  let instructions = '\n\nWORKFLOW-ONLY FIELDS (SEPARATE EXTRACTION):\n';
  instructions += 'Extract these additional fields as standalone variables for workflow use (NOT part of the main template structure):\n';
  wfoMappings.forEach(mapping => {
    const dataTypeNote = mapping.dataType === 'string' ? ' (as UPPER CASE string)' :
                        mapping.dataType === 'number' ? ' (format as number)' :
                        mapping.dataType === 'integer' ? ' (format as integer)' :
                        mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                        mapping.dataType === 'phone' ? ' (as formatted phone number XXX-XXX-XXXX)' :
                        mapping.dataType === 'boolean' ? ' (format as True or False)' :
                        mapping.dataType === 'zip_postal' ? ' (as US zip code XXXXX or Canadian postal code X1X 1X1)' : '';

    if (mapping.type === 'hardcoded') {
      instructions += `- "${mapping.fieldName}": Always use the EXACT hardcoded value "${mapping.value}"${dataTypeNote}\n`;
    } else if (mapping.type === 'mapped') {
      instructions += `- "${mapping.fieldName}": Extract data from PDF coordinates ${mapping.value}${dataTypeNote}\n`;
    } else {
      instructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`;
    }
  });
  return instructions;
}

export function buildArraySplitInstructions(arraySplitConfigs: ArraySplitConfig[]): string {
  if (!arraySplitConfigs || arraySplitConfigs.length === 0) return '';

  let instructions = '\n\nARRAY SPLIT INSTRUCTIONS:\n';
  arraySplitConfigs.forEach(config => {
    if (config.splitStrategy === 'one_per_entry') {
      const fallbackInstruction = config.defaultToOneIfMissing
        ? ` If the "${config.splitBasedOnField}" field is not found, empty, or has a value of 0, create 1 entry in the "${config.targetArrayField}" array with "${config.splitBasedOnField}" set to 1.`
        : '';
      instructions += `- For the "${config.targetArrayField}" array: Look at the value of the "${config.splitBasedOnField}" field in the document. If this field has a value of N (for example, if "${config.splitBasedOnField}" = 3), create N separate entries in the "${config.targetArrayField}" array. Each entry should have "${config.splitBasedOnField}" set to 1, and all other fields should contain the same data from the document.${fallbackInstruction}\n`;
    } else {
      const fallbackInstruction = config.defaultToOneIfMissing
        ? ` If the "${config.splitBasedOnField}" field is not found, empty, or has a value of 0, create 1 entry in the "${config.targetArrayField}" array.`
        : '';
      instructions += `- For the "${config.targetArrayField}" array: Look at the value of the "${config.splitBasedOnField}" field and create multiple entries distributing the value evenly across them based on the data in the document.${fallbackInstruction}\n`;
    }
  });
  return instructions;
}

export function buildArrayEntryExtractionInstructions(arrayEntryConfigs: ArrayEntryConfig[]): string {
  const enabledEntries = arrayEntryConfigs.filter(e => e.isEnabled);
  if (enabledEntries.length === 0) return '';

  // Separate repeating and static entries
  const repeatingEntries = enabledEntries.filter(e => e.isRepeating);
  const staticEntries = enabledEntries.filter(e => !e.isRepeating);

  let instructions = '';

  // Handle static (non-repeating) entries
  const conditionalEntries = staticEntries.filter(e => e.aiConditionInstruction);
  const unconditionalEntries = staticEntries.filter(e => !e.aiConditionInstruction);

  const unconditionalFields = unconditionalEntries.flatMap(entry =>
    entry.fields
      .filter(f => (f.fieldType === 'extracted' || f.fieldType === 'mapped') && f.extractionInstruction)
      .map(f => ({
        key: `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`,
        instruction: f.fieldType === 'mapped'
          ? `Extract the value from PDF coordinates: ${f.extractionInstruction}`
          : f.extractionInstruction,
        dataType: f.dataType || 'string',
        dateOnly: f.dateOnly,
        inputDateFormat: f.inputDateFormat
      }))
  );

  if (unconditionalFields.length > 0) {
    instructions += '\n\nARRAY ENTRY FIELD EXTRACTIONS:\n';
    instructions += 'Extract these additional values as standalone fields in the workflow-only data section:\n';
    instructions += 'IMPORTANT: Each instruction below describes what to look for on the PDF. If the instruction contains a label (e.g., "#Facture/Invoice:" or "PO Number:"), extract the VALUE found next to or near that label on the document, NOT the label text itself.\n';
    unconditionalFields.forEach((field) => {
      const dataTypeNote = field.dataType === 'string' ? ' (as UPPER CASE string)' :
                          field.dataType === 'number' ? ' (format as number)' :
                          field.dataType === 'integer' ? ' (format as integer)' :
                          field.dataType === 'datetime' ? getDateTimeNote(field) : '';
      instructions += `- "${field.key}": ${field.instruction}${dataTypeNote}\n`;
    });
  }

  if (conditionalEntries.length > 0) {
    instructions += '\n\nCONDITIONAL ARRAY ENTRY EXTRACTIONS:\n';
    instructions += 'For each group below, first check the AI condition on the PDF. If the condition is NOT met, return null for ALL fields in that group.\n';
    instructions += 'If the condition IS met, extract the values as described.\n';
    instructions += 'IMPORTANT: If the instruction contains a label (e.g., "#Facture/Invoice:" or "PO Number:"), extract the VALUE found next to or near that label on the document, NOT the label text itself.\n\n';

    conditionalEntries.forEach(entry => {
      const conditionKey = `__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`;
      instructions += `Condition check for ${entry.targetArrayField}[${entry.entryOrder}]: ${entry.aiConditionInstruction}\n`;
      instructions += `- "${conditionKey}": Set to "true" if the condition is met, "false" if not\n`;

      entry.fields
        .filter(f => (f.fieldType === 'extracted' || f.fieldType === 'mapped') && f.extractionInstruction)
        .forEach(f => {
          const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
          const instruction = f.fieldType === 'mapped'
            ? `Extract the value from PDF coordinates: ${f.extractionInstruction}`
            : f.extractionInstruction;
          const dataTypeNote = (f.dataType || 'string') === 'string' ? ' (as UPPER CASE string)' :
                              f.dataType === 'number' ? ' (format as number)' :
                              f.dataType === 'integer' ? ' (format as integer)' :
                              f.dataType === 'datetime' ? getDateTimeNote(f) : '';
          instructions += `- "${key}": ${instruction}${dataTypeNote} (only if condition is met, otherwise null)\n`;
        });
      instructions += '\n';
    });
  }

  // Handle repeating entries - extract as arrays
  if (repeatingEntries.length > 0) {
    instructions += '\n\nREPEATING ARRAY EXTRACTIONS:\n';
    instructions += 'For each of the following, find ALL matching rows in the PDF and return an ARRAY of objects:\n\n';

    repeatingEntries.forEach(entry => {
      const arrayKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
      const parentNote = entry.parentArrayField ? ` (will be nested inside each "${entry.parentArrayField}" row)` : '';
      instructions += `- "${arrayKey}": ${entry.repeatInstruction || 'Find all matching rows'}${parentNote}\n`;
      instructions += `  Return as an array of objects, where each object has these fields:\n`;

      entry.fields.forEach(field => {
        const dataTypeNote = field.dataType === 'string' ? ' (UPPER CASE string)' :
                            field.dataType === 'number' ? ' (number)' :
                            field.dataType === 'integer' ? ' (integer)' :
                            field.dataType === 'datetime' ? getDateTimeNote(field) : '';
        if (field.fieldType === 'hardcoded') {
          instructions += `    - "${field.fieldName}": Always "${field.hardcodedValue}"${dataTypeNote}\n`;
        } else {
          instructions += `    - "${field.fieldName}": ${field.extractionInstruction}${dataTypeNote}\n`;
        }
      });
      instructions += '\n';
    });
  }

  return instructions;
}

export interface PromptConfig {
  extractionType: ExtractionType;
  fieldMappings: FieldMapping[];
  arraySplitConfigs: ArraySplitConfig[];
  arrayEntryConfigs: ArrayEntryConfig[];
  hasWFOFields: boolean;
}

export function buildExtractionPrompt(config: PromptConfig): string {
  const { extractionType, fieldMappings, arraySplitConfigs, arrayEntryConfigs, hasWFOFields } = config;

  const fullInstructions = extractionType.default_instructions;
  const isJsonFormat = extractionType.format_type === 'JSON';
  const outputFormat = isJsonFormat ? 'JSON' : 'XML';
  const templateLabel = isJsonFormat ? 'JSON structure' : 'XML template structure';

  const fieldMappingInstructions = isJsonFormat ? buildFieldMappingInstructions(fieldMappings) : '';
  const arraySplitInstructions = isJsonFormat ? buildArraySplitInstructions(arraySplitConfigs) : '';
  const arrayEntryExtractionInstructions = isJsonFormat ? buildArrayEntryExtractionInstructions(arrayEntryConfigs) : '';
  const wfoInstructions = isJsonFormat ? buildWfoInstructions(fieldMappings) : '';

  let parseitIdInstructions = '';
  if (isJsonFormat && extractionType.parseit_id_mapping) {
    parseitIdInstructions = `\n\nPARSE-IT ID MAPPING:\n- "${extractionType.parseit_id_mapping}": This field will be automatically populated with a unique Parse-It ID number. For now, use the placeholder value "{{PARSE_IT_ID_PLACEHOLDER}}" (this will be replaced automatically).\n`;
  }

  let traceTypeInstructions = '';
  if (isJsonFormat && extractionType.trace_type_mapping && extractionType.trace_type_value) {
    traceTypeInstructions = `\n\nTRACE TYPE MAPPING:\n- "${extractionType.trace_type_mapping}": Always set this field to the exact value "${extractionType.trace_type_value}".\n`;
  }

  return `
You are a data extraction AI. Please analyze the provided PDF document and extract the requested information according to the following instructions:

EXTRACTION INSTRUCTIONS:
${fullInstructions}${fieldMappingInstructions}${parseitIdInstructions}${traceTypeInstructions}${arraySplitInstructions}${arrayEntryExtractionInstructions}${wfoInstructions}${isJsonFormat ? postalCodeRules : ''}

OUTPUT FORMAT:
${hasWFOFields ? 'You need to extract TWO separate data structures from the PDF:\n\n1. MAIN TEMPLATE DATA:\n' : ''}Please format the extracted data as ${outputFormat} following this EXACT ${templateLabel} structure:
${extractionType.xml_format}${hasWFOFields ? '\n\n2. WORKFLOW-ONLY DATA:\nProvide the workflow-only fields as a separate JSON object with the field names as keys and their extracted values.\n\nIMPORTANT: Return BOTH structures in a wrapper object like this:\n{\n  "templateData": <your extracted template data here>,\n  "workflowOnlyData": {\n    <workflow field name>: <extracted value>,\n    ...\n  }\n}\n\nIf there are no workflow-only fields, set workflowOnlyData to an empty object {}.' : ''}

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
}
