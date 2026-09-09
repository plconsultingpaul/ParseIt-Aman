import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1"
import { PDFDocument } from "npm:pdf-lib@1.17.1"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

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
    return functionLogic?.default;
  }

  for (const condition of functionLogic.conditions) {
    if (evaluateCondition(condition.if, data)) {
      return condition.then;
    }
  }

  return functionLogic.default;
}

interface FieldMapping {
  fieldName: string
  type: 'ai' | 'mapped' | 'hardcoded' | 'function'
  value: string
  dataType?: 'string' | 'number' | 'integer' | 'datetime' | 'boolean'
  maxLength?: number
  dateOnly?: boolean
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY'
  pageNumberInGroup?: number
  functionId?: string
}

const getDateTimeNote = (m: { dateOnly?: boolean; inputDateFormat?: string }): string => {
  const outputFmt = m.dateOnly
    ? ' (as date string in yyyy-MM-dd format)'
    : ' (format as datetime in yyyy-MM-ddThh:mm:ss format)'
  if (m.inputDateFormat) {
    return `${outputFmt}. IMPORTANT: Dates in the source document are written in ${m.inputDateFormat} format, so interpret them accordingly before converting to the output format`
  }
  return outputFmt
}

interface TransformationRequest {
  pdfBase64: string
  transformationType: {
    id: string
    name: string
    defaultInstructions: string
    filenameTemplate: string
    fieldMappings?: Array<FieldMapping>
  }
  additionalInstructions?: string
  sessionId?: string
  groupOrder?: number
  pageIndex?: number
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function getObjectSize(obj: any): number {
  try {
    return JSON.stringify(obj).length
  } catch {
    return -1
  }
}

function hasCircularReference(obj: any, seen = new WeakSet()): boolean {
  try {
    if (obj === null || typeof obj !== 'object') {
      return false
    }
    if (seen.has(obj)) {
      return true
    }
    seen.add(obj)
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (hasCircularReference(obj[key], seen)) {
          return true
        }
      }
    }
    return false
  } catch (error) {
    console.error('ERROR: Failed to check circular reference:', error)
    return true
  }
}

function normalizeBooleanValue(value: any): string {
  console.log(`TRACE [normalizeBooleanValue]: Input value: ${JSON.stringify(value)}, type: ${typeof value}`)

  if (typeof value === 'boolean') {
    const result = value ? 'True' : 'False'
    console.log(`TRACE [normalizeBooleanValue]: Boolean conversion result: ${result}`)
    return result
  }

  if (typeof value === 'string') {
    const lowerValue = value.trim().toLowerCase()
    console.log(`TRACE [normalizeBooleanValue]: String value (lowercased): ${lowerValue}`)

    if (lowerValue === 'true' || lowerValue === 't' || lowerValue === 'yes' || lowerValue === 'y' || lowerValue === '1') {
      console.log(`TRACE [normalizeBooleanValue]: String matched TRUE pattern`)
      return 'True'
    }
    if (lowerValue === 'false' || lowerValue === 'f' || lowerValue === 'no' || lowerValue === 'n' || lowerValue === '0') {
      console.log(`TRACE [normalizeBooleanValue]: String matched FALSE pattern`)
      return 'False'
    }

    if (value === 'True' || value === 'False') {
      console.log(`TRACE [normalizeBooleanValue]: Already in proper case: ${value}`)
      return value
    }
  }

  console.warn(`WARNING [normalizeBooleanValue]: Invalid boolean value "${value}", defaulting to False`)
  return 'False'
}

const CHUNK_SIZE = 8192

function decodeBase64InChunks(base64String: string): Uint8Array {
  const binaryString = atob(base64String)
  const bytes = new Uint8Array(binaryString.length)

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes
}

function encodeBase64InChunks(bytes: Uint8Array): string {
  let result = ''

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length))
    result += String.fromCharCode(...chunk)
  }

  return btoa(result)
}

async function extractSpecificPage(pdfBase64: string, pageNumber: number): Promise<string> {
  const funcName = 'extractSpecificPage'
  console.log(`INFO [${funcName}]: START - Extracting page ${pageNumber}`)
  console.log(`TRACE [${funcName}]: Input PDF base64 size: ${pdfBase64.length} chars`)

  try {
    console.log(`TRACE [${funcName}]: Decoding base64 to bytes using chunked approach...`)
    const startDecode = Date.now()

    const pdfBytes = decodeBase64InChunks(pdfBase64)
    console.log(`TRACE [${funcName}]: Base64 decode completed in ${Date.now() - startDecode}ms, resulting bytes: ${pdfBytes.length}`)

    console.log(`TRACE [${funcName}]: Loading PDF document...`)
    const startLoad = Date.now()
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const totalPages = pdfDoc.getPageCount()
    console.log(`TRACE [${funcName}]: PDF loaded in ${Date.now() - startLoad}ms, total pages: ${totalPages}`)

    if (pageNumber < 1 || pageNumber > totalPages) {
      console.warn(`WARNING [${funcName}]: Invalid page number ${pageNumber} (PDF has ${totalPages} pages), using page 1 as fallback`)
      pageNumber = 1
    }

    console.log(`TRACE [${funcName}]: Creating single-page PDF for page ${pageNumber}...`)
    const startCreate = Date.now()
    const singlePageDoc = await PDFDocument.create()
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNumber - 1])
    singlePageDoc.addPage(copiedPage)
    console.log(`TRACE [${funcName}]: Single-page PDF created in ${Date.now() - startCreate}ms`)

    console.log(`TRACE [${funcName}]: Saving and encoding single-page PDF using chunked approach...`)
    const startSave = Date.now()
    const singlePageBytes = await singlePageDoc.save()
    console.log(`TRACE [${funcName}]: PDF saved, size: ${singlePageBytes.length} bytes`)

    const singlePageBase64 = encodeBase64InChunks(singlePageBytes)
    console.log(`TRACE [${funcName}]: Single-page PDF encoded in ${Date.now() - startSave}ms, size: ${singlePageBase64.length} chars`)

    console.log(`INFO [${funcName}]: END - Successfully extracted page ${pageNumber}`)
    return singlePageBase64
  } catch (error) {
    console.error(`ERROR [${funcName}]: Failed to extract page ${pageNumber}`)
    console.error(`ERROR [${funcName}]: Error type: ${error instanceof Error ? error.constructor.name : typeof error}`)
    console.error(`ERROR [${funcName}]: Error message: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`ERROR [${funcName}]: Stack trace:`, error instanceof Error ? error.stack : 'No stack trace available')
    throw new Error(`Failed to extract page ${pageNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function groupFieldsByPage(fieldMappings: FieldMapping[]): Map<number, FieldMapping[]> {
  const pageGroups = new Map<number, FieldMapping[]>()

  for (const mapping of fieldMappings) {
    const pageNum = mapping.pageNumberInGroup || 1

    if (!pageGroups.has(pageNum)) {
      pageGroups.set(pageNum, [])
    }

    pageGroups.get(pageNum)!.push(mapping)
  }

  console.log(`Field mappings grouped by page:`)
  for (const [pageNum, fields] of pageGroups.entries()) {
    console.log(`   Page ${pageNum}: ${fields.length} fields - ${fields.map(f => f.fieldName).join(', ')}`)
  }

  return pageGroups
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId()
  const requestStartTime = Date.now()

  console.log('===============================================')
  console.log(`INFO [MAIN]: REQUEST START - ID: ${requestId}`)
  console.log(`INFO [MAIN]: Timestamp: ${new Date().toISOString()}`)
  console.log(`INFO [MAIN]: Method: ${req.method}`)
  console.log(`INFO [MAIN]: URL: ${req.url}`)
  console.log('===============================================')

  if (req.method === "OPTIONS") {
    console.log(`INFO [MAIN]: OPTIONS request, returning CORS headers - ${requestId}`)
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    console.log(`TRACE [MAIN]: Reading request body - ${requestId}`)
    let requestText: string;
    try {
      const readStartTime = Date.now()
      requestText = await req.text();
      console.log(`TRACE [MAIN]: Request body read in ${Date.now() - readStartTime}ms, size: ${requestText.length} chars - ${requestId}`)
    } catch (readError) {
      console.error(`ERROR [MAIN]: Failed to read request body - ${requestId}`)
      console.error(`ERROR [MAIN]: Error type: ${readError instanceof Error ? readError.constructor.name : typeof readError}`)
      console.error(`ERROR [MAIN]: Error message: ${readError instanceof Error ? readError.message : String(readError)}`)
      console.error(`ERROR [MAIN]: Stack trace:`, readError instanceof Error ? readError.stack : 'No stack trace available')
      return new Response(
        JSON.stringify({
          error: "Failed to read request body",
          details: readError instanceof Error ? readError.message : "Unknown error",
          requestId
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`INFO [MAIN]: Request body size: ${requestText.length} characters - ${requestId}`)
    console.log(`TRACE [MAIN]: Request body preview (first 200 chars): ${requestText.substring(0, 200)} - ${requestId}`)
    console.log(`TRACE [MAIN]: Request body preview (last 200 chars): ${requestText.substring(Math.max(0, requestText.length - 200))} - ${requestId}`)

    console.log(`TRACE [MAIN]: Parsing request JSON - ${requestId}`)
    let requestData: TransformationRequest;
    try {
      const parseStartTime = Date.now()
      requestData = JSON.parse(requestText);
      console.log(`TRACE [MAIN]: JSON parsed successfully in ${Date.now() - parseStartTime}ms - ${requestId}`)
      console.log(`TRACE [MAIN]: Request data keys: ${Object.keys(requestData).join(', ')} - ${requestId}`)
    } catch (parseError) {
      console.error(`ERROR [MAIN]: Failed to parse request JSON - ${requestId}`)
      console.error(`ERROR [MAIN]: Parse error type: ${parseError instanceof Error ? parseError.constructor.name : typeof parseError}`)
      console.error(`ERROR [MAIN]: Parse error message: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
      console.error(`ERROR [MAIN]: Invalid JSON content (first 500 chars): ${requestText.substring(0, 500)}`)
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          details: parseError instanceof Error ? parseError.message : "Unknown parse error",
          requestId
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { pdfBase64, transformationType, additionalInstructions, sessionId, groupOrder, pageIndex } = requestData;

    console.log(`INFO [MAIN]: PDF base64 length: ${pdfBase64?.length || 0} chars - ${requestId}`)
    console.log(`INFO [MAIN]: Transformation type: ${transformationType?.name} (ID: ${transformationType?.id}) - ${requestId}`)
    console.log(`INFO [MAIN]: Filename template: ${transformationType?.filenameTemplate} - ${requestId}`)
    console.log(`INFO [MAIN]: Field mappings count: ${transformationType?.fieldMappings?.length || 0} - ${requestId}`)
    console.log(`INFO [MAIN]: Additional instructions length: ${additionalInstructions?.length || 0} chars - ${requestId}`)
    console.log(`INFO [MAIN]: Session ID: ${sessionId || 'none'} - ${requestId}`);
    console.log(`INFO [MAIN]: Group Order: ${groupOrder || 'none'} - ${requestId}`);
    console.log(`INFO [MAIN]: Page Index: ${pageIndex !== undefined ? pageIndex : 'none'} - ${requestId}`);

    if (!transformationType) {
      throw new Error('Transformation type not provided')
    }

    console.log('Fetching active Gemini model configuration...');
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
      console.log('Using active Gemini model:', modelName);
    } else {
      console.log('No active model configuration found, using default:', modelName);
    }

    console.log('Initializing Gemini AI with model:', modelName);
    const genAI = new GoogleGenerativeAI(activeKeyData.api_key)
    const model = genAI.getGenerativeModel({ model: modelName })

    const fullInstructions = additionalInstructions
      ? `${transformationType.defaultInstructions}\n\nAdditional Instructions: ${additionalInstructions}`
      : transformationType.defaultInstructions

    console.log('Full instructions length:', fullInstructions.length);

    console.log('=== PAGE-AWARE FIELD EXTRACTION ===')

    let extractedData: any = {}

    if (transformationType.fieldMappings && transformationType.fieldMappings.length > 0) {
      console.log('Processing field mappings:', transformationType.fieldMappings.length);

      for (const mapping of transformationType.fieldMappings) {
        if (mapping.type === 'hardcoded') {
          console.log(`Hardcoded field "${mapping.fieldName}": ${mapping.value}`)
          if (mapping.dataType === 'boolean') {
            extractedData[mapping.fieldName] = normalizeBooleanValue(mapping.value)
          } else if (mapping.dataType === 'string' || !mapping.dataType) {
            extractedData[mapping.fieldName] = typeof mapping.value === 'string' && mapping.value !== ''
              ? mapping.value.toUpperCase()
              : mapping.value
          } else {
            extractedData[mapping.fieldName] = mapping.value
          }
        }
      }

      const aiFields = transformationType.fieldMappings.filter(m => m.type === 'ai' || m.type === 'mapped')

      if (aiFields.length > 0) {
        const pageGroups = groupFieldsByPage(aiFields)

        for (const [pageNum, pageFields] of pageGroups.entries()) {
          console.log(`\nProcessing Page ${pageNum} with ${pageFields.length} fields`)

          const pageSpecificPdfBase64 = await extractSpecificPage(pdfBase64, pageNum)

          let fieldMappingInstructions = '\n\nFIELD EXTRACTION INSTRUCTIONS:\n'
          fieldMappingInstructions += `IMPORTANT: You are analyzing a single page extracted from a larger document. Extract ONLY from the content visible on THIS page.\n\n`

          pageFields.forEach(mapping => {
            if (mapping.type === 'mapped') {
              const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                                  mapping.dataType === 'number' ? ' (format as number)' :
                                  mapping.dataType === 'integer' ? ' (format as integer)' :
                                  mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                                  mapping.dataType === 'boolean' ? ' (format as boolean: respond with ONLY "True" or "False" in proper case - capital T or F, lowercase remaining letters)' :
                                  mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code X1X 1X1)' : ''
              fieldMappingInstructions += `- "${mapping.fieldName}": Look in the region at coordinates ${mapping.value} (use these coordinates as a hint to locate the field)${dataTypeNote}\n`
            } else {
              const dataTypeNote = mapping.dataType === 'string' ? ' (format as UPPER CASE string)' :
                                  mapping.dataType === 'number' ? ' (format as number)' :
                                  mapping.dataType === 'integer' ? ' (format as integer)' :
                                  mapping.dataType === 'datetime' ? getDateTimeNote(mapping) :
                                  mapping.dataType === 'boolean' ? ' (format as boolean: respond with ONLY "True" or "False" in proper case - capital T or F, lowercase remaining letters)' :
                                  mapping.dataType === 'zip_postal' ? ' (format as US zip code XXXXX or Canadian postal code X1X 1X1)' : ''
              fieldMappingInstructions += `- "${mapping.fieldName}": ${mapping.value || 'Extract from PDF document'}${dataTypeNote}\n`
            }
          })

          const pagePrompt = `
You are a data extraction AI analyzing a single page from a PDF document. Please analyze the provided page and extract the requested information according to the following instructions:

EXTRACTION INSTRUCTIONS:
${fullInstructions}${fieldMappingInstructions}

OUTPUT FORMAT:
Please format the extracted data as JSON with the following structure:
{
  "extractedData": {
    // Include ONLY the fields requested above
  }
}

IMPORTANT GUIDELINES:
1. You are seeing ONLY page ${pageNum} of this document - extract information from THIS page only
2. Only extract information that is clearly visible on THIS page
3. If a field is not found on this page, use empty string ("") for text fields, 0 for numbers, null for optional fields
4. For datetime fields, use the format yyyy-MM-ddThh:mm:ss (e.g., "2024-03-15T14:30:00")
5. For boolean fields, respond with ONLY "True" or "False" (proper case: capital first letter, lowercase remaining)
6. CRITICAL: For all string data type fields, convert the extracted value to UPPER CASE before including it in the output
7. Be precise and accurate with the extracted data
8. Ensure all field names match exactly what's needed

Please provide only the JSON output without any additional explanation or formatting.
`

          console.log(`Calling Gemini AI for Page ${pageNum}...`)
          console.log(`   Fields to extract: ${pageFields.map(f => f.fieldName).join(', ')}`)

          const result = await model.generateContent([
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pageSpecificPdfBase64
              }
            },
            pagePrompt
          ])

          const response = await result.response
          let extractedContent = response.text()

          console.log(`Page ${pageNum} AI response received (length: ${extractedContent.length})`)

          extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

          try {
            const parsedResponse = JSON.parse(extractedContent)
            const pageData = parsedResponse.extractedData || parsedResponse || {}

            pageFields.forEach(field => {
              if (field.dataType === 'boolean' && pageData.hasOwnProperty(field.fieldName)) {
                pageData[field.fieldName] = normalizeBooleanValue(pageData[field.fieldName])
              } else if ((field.dataType === 'string' || !field.dataType) && pageData.hasOwnProperty(field.fieldName)) {
                if (typeof pageData[field.fieldName] === 'string' && pageData[field.fieldName] !== '') {
                  pageData[field.fieldName] = pageData[field.fieldName].toUpperCase()
                }
              }
            })

            Object.assign(extractedData, pageData)

            console.log(`Page ${pageNum} data extracted successfully:`, Object.keys(pageData).join(', '))
          } catch (parseError) {
            console.error(`Failed to parse Page ${pageNum} response:`, parseError)
            pageFields.forEach(field => {
              if (!extractedData.hasOwnProperty(field.fieldName)) {
                extractedData[field.fieldName] = ''
              }
            })
          }
        }
      }

      const functionFields = transformationType.fieldMappings.filter(m => m.type === 'function' && m.functionId)
      if (functionFields.length > 0) {
        console.log(`\nProcessing ${functionFields.length} function-based fields`)

        const functionIds = [...new Set(functionFields.map(m => m.functionId))]
        const { data: functions, error: funcError } = await supabase
          .from('field_mapping_functions')
          .select('*')
          .in('id', functionIds)

        if (funcError) {
          console.error('Error loading functions:', funcError)
        } else if (functions && functions.length > 0) {
          console.log(`Loaded ${functions.length} functions`)
          const functionsById = new Map(functions.map(f => [f.id, f]))

          for (const mapping of functionFields) {
            const func = functionsById.get(mapping.functionId!)
            if (func) {
              try {
                console.log(`Evaluating function "${func.function_name}" for field "${mapping.fieldName}"`)
                const result = evaluateFunction(func.function_logic, extractedData)
                extractedData[mapping.fieldName] = result
                console.log(`  Result: ${JSON.stringify(result)}`)
              } catch (err) {
                console.error(`Error evaluating function for field "${mapping.fieldName}":`, err)
                extractedData[mapping.fieldName] = func.function_logic?.default || null
              }
            }
          }
        }
      }
    } else {
      console.log('No field mappings defined, using legacy extraction mode')

      const prompt = `
You are a data extraction AI for PDF transformation and renaming. Please analyze the provided PDF document and extract the requested information according to the following instructions:

EXTRACTION INSTRUCTIONS:
${fullInstructions}

OUTPUT FORMAT:
Please format the extracted data as JSON with the following structure:
{
  "extractedData": {
    // Include all the fields needed for the filename template
  }
}

IMPORTANT GUIDELINES:
1. Only extract information that is clearly visible in the document
2. If a field is not found, use empty string ("") for text fields, 0 for numbers, null for optional fields
3. For datetime fields, use the format yyyy-MM-ddThh:mm:ss (e.g., "2024-03-15T14:30:00")
4. Be precise and accurate with the extracted data
5. The extracted data will be used to rename the PDF file using the template: ${transformationType.filenameTemplate}
6. Ensure all field names match exactly what's needed for the filename template

Please provide only the JSON output without any additional explanation or formatting.
`

      console.log('Prompt length:', prompt.length);
      console.log('Calling Gemini AI (legacy mode)...');

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        prompt
      ])

      const response = await result.response
      let extractedContent = response.text()

      console.log('=== AI RESPONSE ANALYSIS (Legacy) ===')
      console.log('Raw AI response length:', extractedContent.length)

      extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      try {
        const parsedResponse = JSON.parse(extractedContent)
        extractedData = parsedResponse.extractedData || parsedResponse || {}

        if (typeof extractedData !== 'object' || extractedData === null || Array.isArray(extractedData)) {
          console.warn('Invalid extracted data format, using fallback object')
          extractedData = {}
        }

        if (Object.keys(extractedData).length === 0) {
          console.warn('Extracted data is empty, creating fallback structure')
          extractedData = {
            documentType: 'unknown',
            extractionFailed: true,
            originalFilename: 'unknown',
            extractedAt: new Date().toISOString()
          }
        }

      } catch (parseError) {
        console.error('=== CRITICAL JSON PARSE ERROR (Legacy) ===')
        console.error('Parse error:', parseError)

        extractedData = {
          documentType: 'unknown',
          extractionFailed: true,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          originalFilename: 'unknown',
          extractedAt: new Date().toISOString()
        }
        console.log('Created fallback extracted data structure')
      }
    }

    console.log('===============================================')
    console.log(`INFO [VALIDATION]: FINAL EXTRACTED DATA VALIDATION - ${requestId}`)
    console.log('===============================================')
    console.log(`TRACE [VALIDATION]: Extracted data keys: ${Object.keys(extractedData).join(', ')} - ${requestId}`)
    console.log(`TRACE [VALIDATION]: Extracted data key count: ${Object.keys(extractedData).length} - ${requestId}`)
    console.log(`TRACE [VALIDATION]: Extracted data type: ${typeof extractedData} - ${requestId}`)
    console.log(`TRACE [VALIDATION]: Extracted data is array: ${Array.isArray(extractedData)} - ${requestId}`)

    console.log(`TRACE [VALIDATION]: Checking for circular references - ${requestId}`)
    const hasCircular = hasCircularReference(extractedData)
    console.log(`TRACE [VALIDATION]: Has circular reference: ${hasCircular} - ${requestId}`)
    if (hasCircular) {
      console.error(`ERROR [VALIDATION]: Circular reference detected in extractedData! - ${requestId}`)
    }

    try {
      const dataPreview = JSON.stringify(extractedData, null, 2)
      console.log(`TRACE [VALIDATION]: Full extracted data structure (first 1000 chars): ${dataPreview.substring(0, 1000)} - ${requestId}`)
    } catch (previewError) {
      console.error(`ERROR [VALIDATION]: Cannot preview extracted data: ${previewError} - ${requestId}`)
    }

    let finalJsonString: string
    try {
      console.log(`TRACE [VALIDATION]: Attempting JSON.stringify on extractedData - ${requestId}`)
      const serializeStartTime = Date.now()
      finalJsonString = JSON.stringify(extractedData)
      console.log(`INFO [VALIDATION]: JSON serialization successful in ${Date.now() - serializeStartTime}ms - ${requestId}`)
      console.log(`INFO [VALIDATION]: Serialized JSON length: ${finalJsonString.length} chars - ${requestId}`)
      console.log(`TRACE [VALIDATION]: Serialized JSON preview (first 200 chars): ${finalJsonString.substring(0, 200)} - ${requestId}`)
      console.log(`TRACE [VALIDATION]: Serialized JSON preview (last 200 chars): ${finalJsonString.substring(Math.max(0, finalJsonString.length - 200))} - ${requestId}`)

      if (sessionId && groupOrder !== undefined && pageIndex !== undefined) {
        try {
          console.log(`INFO [GROUP_DATA]: Saving extracted fields for session ${sessionId}, group ${groupOrder}, page ${pageIndex} - ${requestId}`)
          const supabaseUrl = Deno.env.get('SUPABASE_URL')
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

          if (supabaseUrl && supabaseServiceKey) {
            const saveResponse = await fetch(`${supabaseUrl}/rest/v1/extraction_group_data`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey,
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({
                session_id: sessionId,
                group_order: groupOrder,
                page_index: pageIndex,
                extracted_fields: extractedData
              })
            })

            if (saveResponse.ok) {
              console.log(`INFO [GROUP_DATA]: Successfully saved extracted fields for group ${groupOrder} - ${requestId}`)
            } else {
              console.error(`ERROR [GROUP_DATA]: Failed to save extracted fields: ${saveResponse.status} - ${requestId}`)
            }
          }
        } catch (saveError) {
          console.error(`ERROR [GROUP_DATA]: Exception saving extracted fields: ${saveError} - ${requestId}`)
        }
      }
    } catch (serializeError) {
      console.error(`ERROR [VALIDATION]: CRITICAL - Cannot serialize extracted data to JSON - ${requestId}`)
      console.error(`ERROR [VALIDATION]: Serialize error type: ${serializeError instanceof Error ? serializeError.constructor.name : typeof serializeError}`)
      console.error(`ERROR [VALIDATION]: Serialize error message: ${serializeError instanceof Error ? serializeError.message : String(serializeError)}`)
      console.error(`ERROR [VALIDATION]: Stack trace:`, serializeError instanceof Error ? serializeError.stack : 'No stack trace available')

      console.log(`TRACE [VALIDATION]: Creating minimal fallback structure - ${requestId}`)
      extractedData = {
        error: 'Serialization failed',
        message: serializeError instanceof Error ? serializeError.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
      finalJsonString = JSON.stringify(extractedData)
      console.log(`INFO [VALIDATION]: Fallback JSON created, length: ${finalJsonString.length} - ${requestId}`)
    }
    
    let mergedData = { ...extractedData }
    if (sessionId && groupOrder && groupOrder > 1 && pageIndex !== undefined && pageIndex > 0) {
      try {
        console.log(`INFO [PREV_GROUPS]: This is a "Follow Previous Group" - retrieving immediately preceding page (page ${pageIndex - 1}) - ${requestId}`)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (supabaseUrl && supabaseServiceKey) {
          const prevGroupsResponse = await fetch(
            `${supabaseUrl}/rest/v1/extraction_group_data?session_id=eq.${sessionId}&page_index=eq.${pageIndex - 1}`,
            {
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'apikey': supabaseServiceKey
              }
            }
          )

          if (prevGroupsResponse.ok) {
            const prevGroups = await prevGroupsResponse.json()
            console.log(`INFO [PREV_GROUPS]: Found ${prevGroups.length} record(s) for preceding page - ${requestId}`)

            if (prevGroups.length > 0) {
              const prevGroup = prevGroups[0]
              const groupPrefix = `group${prevGroup.group_order}_`
              const prevFields = prevGroup.extracted_fields || {}

              for (const [fieldName, fieldValue] of Object.entries(prevFields)) {
                const prefixedFieldName = `${groupPrefix}${fieldName}`
                mergedData[prefixedFieldName] = fieldValue
                console.log(`TRACE [PREV_GROUPS]: Added ${prefixedFieldName} = ${fieldValue} from page ${pageIndex - 1} - ${requestId}`)
              }

              console.log(`INFO [PREV_GROUPS]: Merged data now has ${Object.keys(mergedData).length} total fields - ${requestId}`)
            } else {
              console.warn(`WARNING [PREV_GROUPS]: No data found for preceding page ${pageIndex - 1} - ${requestId}`)
            }
          }
        }
      } catch (prevGroupError) {
        console.error(`ERROR [PREV_GROUPS]: Failed to retrieve previous group data: ${prevGroupError} - ${requestId}`)
      }
    }

    console.log('===============================================')
    console.log(`INFO [FILENAME]: FILENAME GENERATION - ${requestId}`)
    console.log('===============================================')
    let newFilename = transformationType.filenameTemplate
    console.log(`TRACE [FILENAME]: Original filename template: ${newFilename} - ${requestId}`)
    console.log(`TRACE [FILENAME]: Number of placeholders to replace: ${Object.keys(mergedData).length} - ${requestId}`)

    for (const [key, value] of Object.entries(mergedData)) {
      const placeholder = `{{${key}}}`
      if (newFilename.includes(placeholder)) {
        const cleanValue = String(value || '').replace(/[<>:"/\\|?*]/g, '_').trim()
        console.log(`TRACE [FILENAME]: Replacing ${placeholder} with "${cleanValue}" - ${requestId}`);
        newFilename = newFilename.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), cleanValue)
      }
    }

    if (!newFilename.toLowerCase().endsWith('.pdf')) {
      console.log(`TRACE [FILENAME]: Adding .pdf extension - ${requestId}`)
      newFilename += '.pdf'
    }

    const remainingPlaceholders = newFilename.match(/\{\{[^}]+\}\}/g)
    if (remainingPlaceholders) {
      console.log(`WARNING [FILENAME]: Found ${remainingPlaceholders.length} unreplaced placeholders: ${remainingPlaceholders.join(', ')} - ${requestId}`)
    }
    newFilename = newFilename.replace(/\{\{[^}]+\}\}/g, 'MISSING')

    console.log(`INFO [FILENAME]: Final generated filename: ${newFilename} - ${requestId}`)

    console.log('===============================================')
    console.log(`INFO [RESPONSE]: BUILDING RESPONSE - ${requestId}`)
    console.log('===============================================')
    console.log(`TRACE [RESPONSE]: Extracted data size: ${JSON.stringify(extractedData).length} characters - ${requestId}`)
    console.log(`TRACE [RESPONSE]: Building response object - ${requestId}`)

    const responseData = {
        success: true,
        extractedData: extractedData,
        mergedData: mergedData,
        newFilename: newFilename,
        message: 'PDF transformation completed successfully',
        requestId: requestId,
        sessionId: sessionId,
        groupOrder: groupOrder,
        pageIndex: pageIndex
    };

    console.log(`TRACE [RESPONSE]: Response object created - ${requestId}`)
    console.log(`TRACE [RESPONSE]: Response object keys: ${Object.keys(responseData).join(', ')} - ${requestId}`)
    console.log(`TRACE [RESPONSE]: Checking response for circular references - ${requestId}`)
    const responseHasCircular = hasCircularReference(responseData)
    console.log(`TRACE [RESPONSE]: Response has circular reference: ${responseHasCircular} - ${requestId}`)

    let responseJson: string;
    try {
      console.log(`TRACE [RESPONSE]: Attempting to serialize response to JSON - ${requestId}`)
      const responseSerializeStartTime = Date.now()
      responseJson = JSON.stringify(responseData);
      console.log(`INFO [RESPONSE]: Response JSON serialization successful in ${Date.now() - responseSerializeStartTime}ms - ${requestId}`)
      console.log(`INFO [RESPONSE]: Response JSON length: ${responseJson.length} chars - ${requestId}`)
      console.log(`TRACE [RESPONSE]: Response JSON preview (first 300 chars): ${responseJson.substring(0, 300)} - ${requestId}`)
    } catch (serializeError) {
      console.error(`ERROR [RESPONSE]: CRITICAL - Cannot serialize response to JSON - ${requestId}`)
      console.error(`ERROR [RESPONSE]: Serialize error type: ${serializeError instanceof Error ? serializeError.constructor.name : typeof serializeError}`)
      console.error(`ERROR [RESPONSE]: Serialize error message: ${serializeError instanceof Error ? serializeError.message : String(serializeError)}`)
      console.error(`ERROR [RESPONSE]: Stack trace:`, serializeError instanceof Error ? serializeError.stack : 'No stack trace available')
      return new Response(
        JSON.stringify({
          error: "Response serialization failed",
          details: serializeError instanceof Error ? serializeError.message : "Unknown serialization error",
          requestId
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const totalTime = Date.now() - requestStartTime
    console.log('===============================================')
    console.log(`INFO [MAIN]: REQUEST SUCCESS - ${requestId}`)
    console.log(`INFO [MAIN]: Total processing time: ${totalTime}ms`)
    console.log(`INFO [MAIN]: Sending response with status 200`)
    console.log('===============================================')

    return new Response(
      responseJson,
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    const totalTime = Date.now() - requestStartTime
    console.log('===============================================')
    console.error(`ERROR [MAIN]: REQUEST FAILED - ${requestId}`)
    console.error(`ERROR [MAIN]: Total time before failure: ${totalTime}ms`)
    console.log('===============================================')

    console.error(`ERROR [MAIN]: Error type: ${error instanceof Error ? error.constructor.name : typeof error}`)
    console.error(`ERROR [MAIN]: Error message: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`ERROR [MAIN]: Stack trace:`, error instanceof Error ? error.stack : 'No stack trace available')

    let errorDetails = "Unknown error";
    if (error instanceof Error) {
      errorDetails = error.message;

      if (error.message.includes("Unexpected end of JSON input")) {
        console.error(`ERROR [MAIN]: Detected JSON parsing error - AI returned incomplete JSON`)
        errorDetails = "The AI returned invalid or incomplete JSON data. This usually happens when the PDF content is unclear or the extraction instructions need to be more specific. Please try with a clearer PDF or adjust your transformation instructions.";
      } else if (error.message.includes("JSON.parse")) {
        console.error(`ERROR [MAIN]: Detected JSON parsing error - Invalid JSON format`)
        errorDetails = "The AI returned data that couldn't be processed as valid JSON. Please check your transformation instructions and try again with a clearer PDF document.";
      } else if (error.message.includes("API key")) {
        console.error(`ERROR [MAIN]: Detected API key error`)
        errorDetails = "Google Gemini API key is missing or invalid. Please check your API configuration in Settings.";
      } else if (error.message.includes("quota") || error.message.includes("rate limit")) {
        console.error(`ERROR [MAIN]: Detected rate limit error`)
        errorDetails = "API rate limit exceeded. Please wait a moment and try again.";
      } else if (error.message.includes("overloaded") || error.message.includes("503")) {
        console.error(`ERROR [MAIN]: Detected service overload error`)
        errorDetails = "The AI service is temporarily overloaded. Please wait a moment and try again.";
      } else if (error.message.includes("Maximum call stack")) {
        console.error(`ERROR [MAIN]: CRITICAL - Maximum call stack size exceeded!`)
        errorDetails = "Maximum call stack size exceeded. This indicates a recursive operation or circular reference in the data structure.";
      }
    }

    const errorResponse = {
      error: "PDF transformation failed",
      details: errorDetails,
      requestId: requestId,
      timestamp: new Date().toISOString()
    };

    console.log(`TRACE [MAIN]: Building error response - ${requestId}`)
    let errorResponseJson: string
    try {
      errorResponseJson = JSON.stringify(errorResponse)
      console.log(`TRACE [MAIN]: Error response JSON created, length: ${errorResponseJson.length} - ${requestId}`)
    } catch (jsonError) {
      console.error(`ERROR [MAIN]: CRITICAL - Cannot even serialize error response! - ${requestId}`)
      console.error(`ERROR [MAIN]: JSON error:`, jsonError)
      errorResponseJson = JSON.stringify({
        error: "Critical error - cannot serialize error response",
        requestId: requestId
      })
    }

    console.log('===============================================')
    console.log(`INFO [MAIN]: Sending error response with status 500 - ${requestId}`)
    console.log('===============================================')

    return new Response(
      errorResponseJson,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})