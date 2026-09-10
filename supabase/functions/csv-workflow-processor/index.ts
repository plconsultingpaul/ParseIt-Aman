import { Buffer } from "node:buffer"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

interface WorkflowExecutionRequest {
  extractedData?: string | null
  extractedDataStoragePath?: string
  workflowId: string
  userId?: string
  extractionTypeId?: string
  transformationTypeId?: string
  pdfFilename: string
  pdfPages: number
  pdfStoragePath?: string
  originalPdfFilename: string
  pdfBase64?: string
}

interface WorkflowStep {
  id: string
  workflow_id: string
  step_order: number
  step_type: string
  step_name: string
  config_json: any
  next_step_on_success_id?: string
  next_step_on_failure_id?: string
}

function filterCsvWorkflowOnlyFields(csvContent: string, fieldMappings: any[]): string {
  if (!csvContent || !fieldMappings || fieldMappings.length === 0) {
    return csvContent;
  }

  try {
    const lines = csvContent.split('\n');
    if (lines.length === 0) return csvContent;

    // Get indices of fields that are NOT workflow-only
    const outputFields = fieldMappings.filter(m => !m.isWorkflowOnly);
    const outputFieldNames = outputFields.map(m => m.fieldName);

    // Parse header row to find column indices
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Get indices of columns to keep
    const columnsToKeep = headers
      .map((header, index) => ({ header, index }))
      .filter(col => outputFieldNames.includes(col.header))
      .map(col => col.index);

    const workflowOnlyCount = headers.length - columnsToKeep.length;
    console.log(`📊 CSV Filtering: Keeping ${columnsToKeep.length} columns, excluding ${workflowOnlyCount} workflow-only columns`);

    if (columnsToKeep.length === headers.length) {
      // No workflow-only fields, return original
      console.log('📊 No workflow-only fields to filter, using original CSV');
      return csvContent;
    }

    // Filter each line to keep only non-workflow-only columns
    const filteredLines = lines.map(line => {
      const values = line.split(',');
      const filteredValues = columnsToKeep.map(index => values[index] || '');
      return filteredValues.join(',');
    });

    const filteredCsv = filteredLines.join('\n');
    console.log(`✅ CSV filtered successfully: ${lines.length} rows, ${columnsToKeep.length} columns`);
    return filteredCsv;

  } catch (error) {
    console.error('❌ Error filtering CSV workflow-only fields:', error);
    console.log('⚠️ Returning original CSV content');
    return csvContent;
  }
}

async function createStepLog(
  supabaseUrl: string,
  supabaseServiceKey: string,
  workflowExecutionLogId: string,
  workflowId: string,
  step: WorkflowStep,
  status: string,
  startedAt: string,
  completedAt?: string,
  durationMs?: number,
  errorMessage?: string,
  inputData?: any,
  outputData?: any
) {
  try {
    const stepLogPayload = {
      workflow_execution_log_id: workflowExecutionLogId,
      workflow_id: workflowId,
      step_id: step.id,
      step_name: step.step_name,
      step_type: step.step_type,
      step_order: step.step_order,
      status,
      started_at: startedAt,
      completed_at: completedAt || null,
      duration_ms: durationMs || null,
      error_message: errorMessage || null,
      input_data: inputData || null,
      output_data: outputData || null,
      created_at: new Date().toISOString()
    }

    const stepLogResponse = await fetch(`${supabaseUrl}/rest/v1/workflow_step_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(stepLogPayload)
    })

    if (stepLogResponse.ok) {
      const stepLogData = await stepLogResponse.json()
      console.log(`✅ Step log created for step ${step.step_order}:`, stepLogData[0]?.id)
      return stepLogData[0]?.id
    } else {
      console.error('❌ Failed to create step log:', stepLogResponse.status)
    }
  } catch (error) {
    console.error('❌ Error creating step log:', error)
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  console.log('🚀 === CSV WORKFLOW PROCESSOR START ===')

  let workflowExecutionLogId: string | null = null
  let extractionLogId: string | null = null

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Supabase configuration missing')
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log('✅ Supabase configuration loaded')

    let requestData: WorkflowExecutionRequest
    try {
      console.log('📥 Reading request body...')
      const requestText = await req.text()
      console.log('📏 Request body size:', requestText.length, 'characters')

      if (!requestText || requestText.trim() === '') {
        throw new Error('Request body is empty')
      }

      console.log('🔧 Parsing request JSON...')
      requestData = JSON.parse(requestText)
      console.log('✅ Request parsed successfully')
      console.log('🔑 Request keys:', Object.keys(requestData))

    } catch (parseError) {
      console.error('❌ Failed to parse request:', parseError)
      return new Response(
        JSON.stringify({
          error: "Invalid request format",
          details: parseError instanceof Error ? parseError.message : "Unknown parse error"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log('📊 Workflow ID:', requestData.workflowId)
    console.log('👤 User ID:', requestData.userId || 'none')
    console.log('📄 PDF filename:', requestData.pdfFilename)

    console.log('🔍 === FETCHING TYPE DETAILS ===')
    let typeDetails: any = null
    let formatType = 'CSV'

    try {
      if (requestData.extractionTypeId) {
        console.log('📋 Fetching extraction type details for ID:', requestData.extractionTypeId)
        const extractionTypeResponse = await fetch(`${supabaseUrl}/rest/v1/extraction_types?id=eq.${requestData.extractionTypeId}`, {
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
        })

        if (extractionTypeResponse.ok) {
          const extractionTypes = await extractionTypeResponse.json()
          if (extractionTypes && extractionTypes.length > 0) {
            typeDetails = extractionTypes[0]
            formatType = typeDetails.format_type || 'CSV'
            console.log('✅ Extraction type details loaded, formatType:', formatType)
          }
        }
      } else if (requestData.transformationTypeId) {
        console.log('📋 Fetching transformation type details for ID:', requestData.transformationTypeId)
        const transformationTypeResponse = await fetch(`${supabaseUrl}/rest/v1/transformation_types?id=eq.${requestData.transformationTypeId}`, {
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
        })

        if (transformationTypeResponse.ok) {
          const transformationTypes = await transformationTypeResponse.json()
          if (transformationTypes && transformationTypes.length > 0) {
            typeDetails = transformationTypes[0]
            formatType = typeDetails.format_type || 'CSV'
            console.log('✅ Transformation type details loaded')
          }
        }
      }

      console.log('📊 Type details loaded:', !!typeDetails)
      console.log('📊 Format type determined:', formatType)

    } catch (typeError) {
      console.error('❌ Failed to fetch type details:', typeError)
      console.log('⚠️ Continuing with default formatType: CSV')
    }

    console.log('📝 Creating extraction log entry...')
    try {
      const extractionLogResponse = await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id: requestData.userId || null,
          extraction_type_id: requestData.extractionTypeId || null,
          transformation_type_id: requestData.transformationTypeId || null,
          pdf_filename: requestData.originalPdfFilename,
          pdf_pages: requestData.pdfPages,
          extraction_status: 'success',
          extracted_data: requestData.extractedData || null,
          processing_mode: requestData.transformationTypeId ? 'transformation' : 'extraction',
          created_at: new Date().toISOString()
        })
      })

      if (extractionLogResponse.ok) {
        const extractionLogData = await extractionLogResponse.json()
        extractionLogId = extractionLogData[0]?.id
        console.log('✅ Extraction log created with ID:', extractionLogId)
      } else {
        console.error('❌ Failed to create extraction log:', extractionLogResponse.status)
      }
    } catch (logError) {
      console.error('❌ Error creating extraction log:', logError)
    }

    console.log('📝 Creating workflow execution log...')
    try {
      const workflowLogPayload = {
        extraction_log_id: extractionLogId,
        workflow_id: requestData.workflowId,
        status: 'running',
        context_data: {},
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      console.log('📝 Workflow log payload:', JSON.stringify(workflowLogPayload, null, 2))

      const workflowLogResponse = await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey, 'Prefer': 'return=representation' },
        body: JSON.stringify(workflowLogPayload)
      })

      console.log('📝 Workflow log response status:', workflowLogResponse.status)
      console.log('📝 Workflow log response ok:', workflowLogResponse.ok)

      if (workflowLogResponse.ok) {
        const responseText = await workflowLogResponse.text()
        console.log('📝 Workflow log response text:', responseText)

        if (responseText && responseText.trim() !== '') {
          try {
            const workflowLogData = JSON.parse(responseText)
            console.log('📝 Parsed workflow log data:', workflowLogData)
            workflowExecutionLogId = workflowLogData[0]?.id
            console.log('✅ Workflow execution log created with ID:', workflowExecutionLogId)
          } catch (parseError) {
            console.error('❌ Failed to parse workflow log response:', parseError)
            console.error('📝 Raw response that failed to parse:', responseText)
            console.log('⚠️ Continuing without workflow execution log ID')
          }
        } else {
          console.log('⚠️ Empty response from workflow log creation - continuing without log ID')
        }
      } else {
        const errorText = await workflowLogResponse.text()
        console.error('❌ Failed to create workflow execution log:', workflowLogResponse.status, errorText)
        console.log('⚠️ Continuing without workflow execution log')
      }
    } catch (logError) {
      console.error('❌ Error creating workflow execution log:', logError)
      console.error('❌ Log error type:', logError.constructor.name)
      console.error('❌ Log error message:', logError.message)
      console.log('⚠️ Continuing without workflow execution log')
    }

    let extractedData: any = {}
    console.log('📁 === LOADING EXTRACTED DATA ===')

    if (requestData.extractedDataStoragePath) {
      console.log('📁 Loading from storage path:', requestData.extractedDataStoragePath)

      try {
        const storageUrl = `${supabaseUrl}/storage/v1/object/pdfs/${requestData.extractedDataStoragePath}`
        console.log('📁 Storage URL:', storageUrl)

        const storageResponse = await fetch(storageUrl, {
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}` }
        })

        console.log('📁 Storage response status:', storageResponse.status)
        console.log('📁 Storage response ok:', storageResponse.ok)

        if (!storageResponse.ok) {
          const errorText = await storageResponse.text()
          console.error('📁 Storage fetch failed:', errorText)
          throw new Error(`Storage fetch failed: ${storageResponse.status} - ${errorText}`)
        }

        const storageText = await storageResponse.text()
        console.log('📁 Storage response length:', storageText.length)
        console.log('📁 Storage response preview (first 200):', storageText.substring(0, 200))
        console.log('📁 Storage response preview (last 100):', storageText.substring(Math.max(0, storageText.length - 100)))

        if (!storageText || storageText.trim() === '') {
          console.warn('⚠️ Storage file is empty, using empty object')
          extractedData = {}
        } else {
          console.log('📁 Attempting to parse storage content as JSON...')
          try {
            extractedData = JSON.parse(storageText)
            console.log('✅ Successfully parsed extracted data from storage')
            console.log('📊 Extracted data keys:', Object.keys(extractedData))
          } catch (storageParseError) {
            console.error('❌ Failed to parse storage JSON:', storageParseError)
            console.error('📁 Problematic content:', storageText)
            console.log('📁 Using empty object as fallback')
            extractedData = {}
          }
        }
      } catch (storageError) {
        console.error('❌ Storage loading error:', storageError)
        console.log('📁 Using empty object as fallback')
        extractedData = {}
      }
    } else if (requestData.extractedData) {
      console.log('📊 Processing extracted data from request...')
      console.log('📊 Format type:', formatType)
      try {
        if (typeof requestData.extractedData === 'string') {
          if (requestData.extractedData.trim() === '') {
            console.log('📊 Extracted data is empty string')
            extractedData = {}
          } else if (formatType === 'CSV') {
            console.log('📊 CSV format detected - keeping data as string')
            extractedData = requestData.extractedData
            console.log('✅ CSV data preserved as string')
          } else {
            console.log('📊 Parsing extracted data string as JSON...')
            extractedData = JSON.parse(requestData.extractedData)
            console.log('✅ Parsed extracted data from request')
          }
        } else {
          console.log('📊 Using extracted data object directly')
          extractedData = requestData.extractedData || {}
        }
      } catch (parseError) {
        console.error('❌ Failed to parse extracted data:', parseError)
        if (formatType === 'CSV' && typeof requestData.extractedData === 'string') {
          console.log('📊 Parse failed but formatType is CSV - using raw string')
          extractedData = requestData.extractedData
        } else {
          extractedData = {}
        }
      }
    } else {
      console.log('📊 No extracted data provided, using empty object')
      extractedData = {}
    }

    if (typeof extractedData === 'string') {
      console.log('📊 Final extracted data: CSV string with length', extractedData.length)
    } else {
      console.log('📊 Final extracted data keys:', Object.keys(extractedData))
    }

    console.log('📋 Fetching workflow steps...')
    const stepsResponse = await fetch(`${supabaseUrl}/rest/v1/workflow_steps?workflow_id=eq.${requestData.workflowId}&order=step_order.asc`, {
      headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
    })

    if (!stepsResponse.ok) {
      throw new Error('Failed to fetch workflow steps')
    }

    const steps: WorkflowStep[] = await stepsResponse.json()
    console.log('📊 Found', steps.length, 'workflow steps')

    if (steps.length === 0) {
      throw new Error('No steps found in workflow')
    }

    let contextData: any = {
      extractedData: extractedData,
      originalExtractedData: requestData.extractedData,
      formatType: formatType,
      pdfFilename: requestData.pdfFilename,
      originalPdfFilename: requestData.originalPdfFilename,
      pdfStoragePath: requestData.pdfStoragePath,
      pdfBase64: requestData.pdfBase64
    }

    if (formatType !== 'CSV' && typeof extractedData === 'object' && extractedData !== null) {
      contextData = {
        ...contextData,
        ...extractedData
      }
      console.log('📊 Context data merged with extracted data object')
    } else {
      console.log('📊 Context data created without spreading (CSV format or non-object data)')
    }

    console.log('🔄 Starting workflow execution with', steps.length, 'steps...')
    let lastApiResponse: any = null

    // === Helper Function: Escape Single Quotes for OData ===
    const escapeSingleQuotesForOData = (value: any): any => {
      if (typeof value !== 'string') {
        return value
      }
      // Replace single quote with double single quote for OData filter compatibility
      return value.replace(/'/g, "''")
    }
    // === END: Helper Function ===

    const getValueByPath = (obj: any, path: string): any => {
      try {
        const parts = path.split('.')
        let current = obj

        for (const part of parts) {
          if (part.includes('[') && part.includes(']')) {
            const arrayName = part.substring(0, part.indexOf('['))
            const arrayIndex = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')))
            current = current[arrayName]?.[arrayIndex]
          } else if (!isNaN(Number(part))) {
            const arrayIndex = parseInt(part)
            current = current?.[arrayIndex]
          } else {
            current = current?.[part]
          }

          if (current === undefined || current === null) {
            return null
          }
        }

        return current
      } catch (error) {
        console.error(`Error getting value by path "${path}":`, error)
        return null
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const stepStartTime = new Date().toISOString()
      const stepStartMs = Date.now()

      console.log(`🔄 === EXECUTING STEP ${step.step_order}: ${step.step_name} ===`)
      console.log('🔧 Step type:', step.step_type)

      try {
        await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${workflowExecutionLogId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey },
          body: JSON.stringify({
            current_step_id: step.id,
            current_step_name: step.step_name,
            context_data: contextData,
            updated_at: new Date().toISOString()
          })
        })
      } catch (updateError) {
        console.warn('⚠️ Failed to update workflow log:', updateError)
      }

      let stepOutputData: any = null

      try {
        const config = step.config_json || {}
        let shouldSkipStep = false
        let skipReason = ''

        if (config.skipIf) {
          console.log('🔍 Checking skipIf condition:', config.skipIf)
          const conditionResult = getValueByPath(contextData, config.skipIf)
          console.log('🔍 skipIf condition result:', conditionResult)

          if (conditionResult === true) {
            shouldSkipStep = true
            skipReason = `skipIf condition met: ${config.skipIf} = true`
            console.log(`⏭️ Skipping step ${step.step_order} (${step.step_name}): ${skipReason}`)
          }
        }

        if (!shouldSkipStep && config.runIf) {
          console.log('🔍 Checking runIf condition:', config.runIf)
          const conditionResult = getValueByPath(contextData, config.runIf)
          console.log('🔍 runIf condition result:', conditionResult)

          if (conditionResult !== true) {
            shouldSkipStep = true
            skipReason = `runIf condition not met: ${config.runIf} = ${conditionResult}`
            console.log(`⏭️ Skipping step ${step.step_order} (${step.step_name}): ${skipReason}`)
          }
        }

        if (shouldSkipStep) {
          stepOutputData = {
            skipped: true,
            reason: skipReason,
            conditionalSkip: true
          }

          const stepEndTime = new Date().toISOString()
          const stepDurationMs = Date.now() - stepStartMs

          console.log(`⏭️ Step ${step.step_order} skipped due to conditional logic in ${stepDurationMs}ms`)

          if (workflowExecutionLogId) {
            await createStepLog(
              supabaseUrl,
              supabaseServiceKey,
              workflowExecutionLogId,
              requestData.workflowId,
              step,
              'skipped',
              stepStartTime,
              stepEndTime,
              stepDurationMs,
              skipReason,
              { config: step.config_json },
              stepOutputData
            )
          }

          console.log(`✅ DEBUG - Completed iteration i=${i} for step ${step.step_order}. Moving to next iteration.`)
          continue
        }

        if (step.step_type === 'api_call') {
          console.log('🌐 === EXECUTING API CALL STEP ===')
          const config = step.config_json || {}
          console.log('🔧 API call config:', JSON.stringify(config, null, 2))

          let url = config.url || ''
          console.log('🔗 Original URL:', url)

          const urlPlaceholderRegex = /\{\{([^}]+)\}\}/g
          let match
          const replacements: { placeholder: string, path: string, value: any }[] = []

          while ((match = urlPlaceholderRegex.exec(url)) !== null) {
            const placeholder = match[0]
            const path = match[1]

            console.log(`🔍 Found URL placeholder: ${placeholder} with path: ${path}`)

            const value = getValueByPath(contextData, path)
            replacements.push({ placeholder, path, value })

            console.log(`🔍 Path "${path}" resolved to:`, value)
          }

          for (const replacement of replacements) {
            let rawValue = String(replacement.value || '')

            // Apply single quote escaping for OData if enabled
            if (config.escapeSingleQuotesInBody && rawValue.includes("'")) {
              const beforeEscape = rawValue
              rawValue = escapeSingleQuotesForOData(rawValue)
              console.log(`🔄 Escaped single quotes in URL: "${beforeEscape}" → "${rawValue}"`)
            }

            const encodedValue = encodeURIComponent(rawValue)
            const placeholderEscaped = replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            url = url.replace(new RegExp(placeholderEscaped, 'g'), encodedValue)
            console.log(`🔄 Replaced ${replacement.placeholder} with: ${rawValue}`)
          }

          for (const [key, value] of Object.entries(contextData)) {
            const placeholder = `{{${key}}}`
            if (url.includes(placeholder) && !key.includes('.')) {
              const replacementValue = String(value || '')
              const encodedValue = encodeURIComponent(replacementValue)
              url = url.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), encodedValue)
              console.log(`🔄 Replaced simple ${placeholder} with: ${replacementValue}`)
            }
          }

          console.log('🔗 Final URL:', url)

          let requestBody = config.requestBody || ''
          console.log('📄 Original request body template:', requestBody)

          const bodyPlaceholderRegex = /\{\{([^}]+)\}\}/g
          let bodyMatch
          const bodyReplacements: { placeholder: string, path: string, value: any }[] = []

          while ((bodyMatch = bodyPlaceholderRegex.exec(requestBody)) !== null) {
            const placeholder = bodyMatch[0]
            const path = bodyMatch[1]

            console.log(`🔍 Found request body placeholder: ${placeholder} with path: ${path}`)

            if (path === 'extractedData' || path === 'orders') {
              console.log(`⏭️ Skipping special placeholder: ${placeholder}`)
              continue
            }

            const value = getValueByPath(contextData, path)
            bodyReplacements.push({ placeholder, path, value })

            console.log(`🔍 Path "${path}" resolved to:`, value)
          }

          for (const replacement of bodyReplacements) {
            let rawValue = String(replacement.value || '')
            // Apply single quote escaping for OData if enabled
            if (config.escapeSingleQuotesInBody && rawValue.includes("'")) {
              const beforeEscape = rawValue
              rawValue = escapeSingleQuotesForOData(rawValue)
              console.log(`🔄 Escaped single quotes: "${beforeEscape}" → "${rawValue}"`)
            }
            const escapedValue = rawValue
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t')
            requestBody = requestBody.replace(new RegExp(replacement.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), escapedValue)
            console.log(`🔄 Replaced ${replacement.placeholder} with: ${rawValue}`)
          }

          if (requestBody.includes('{{extractedData}}')) {
            console.log('🔧 Found {{extractedData}} placeholder - handling as JSON object')
            if (contextData.originalExtractedData && typeof contextData.originalExtractedData === 'string') {
              requestBody = requestBody.replace(/\{\{extractedData\}\}/g, contextData.originalExtractedData)
              console.log('✅ Replaced {{extractedData}} with original extracted data string')
            } else if (contextData.extractedData && typeof contextData.extractedData === 'object') {
              requestBody = requestBody.replace(/\{\{extractedData\}\}/g, JSON.stringify(contextData.extractedData))
              console.log('✅ Replaced {{extractedData}} with stringified extracted data object')
            }
          }

          if (requestBody.includes('{{orders}}')) {
            console.log('🔧 Found {{orders}} placeholder - handling as JSON array')
            if (contextData.orders && Array.isArray(contextData.orders)) {
              requestBody = requestBody.replace(/\{\{orders\}\}/g, JSON.stringify(contextData.orders))
              console.log('✅ Replaced {{orders}} with stringified orders array')
            }
          }

          console.log('📄 Final request body:', requestBody)

          console.log('🚀 Making API call...')

          const fetchOptions: any = {
            method: config.method || 'POST',
            headers: config.headers || {}
          }

          if (config.method && config.method.toUpperCase() !== 'GET' && requestBody && requestBody.trim() !== '') {
            fetchOptions.body = requestBody
            console.log('📄 Including request body for', config.method, 'request')
          } else {
            console.log('🔍 GET request - no body included')
          }

          const apiResponse = await fetch(url, fetchOptions)

          console.log('📊 API response status:', apiResponse.status)
          console.log('📊 API response ok:', apiResponse.ok)

          if (!apiResponse.ok) {
            const errorText = await apiResponse.text()
            console.error('❌ API call failed:', errorText)
            throw new Error(`API call failed with status ${apiResponse.status}: ${errorText}`)
          }

          const responseText = await apiResponse.text()
          console.log('📏 API response length:', responseText.length)
          console.log('📄 API response preview:', responseText.substring(0, 200))

          if (!responseText || responseText.trim() === '') {
            console.error('❌ API returned empty response')
            throw new Error('API returned empty response body')
          }

          let responseData: any
          try {
            responseData = JSON.parse(responseText)
            console.log('✅ API response parsed successfully')
            lastApiResponse = responseData
            stepOutputData = responseData
          } catch (responseParseError) {
            console.error('❌ Failed to parse API response:', responseParseError)
            console.error('📄 Problematic response:', responseText)
            throw new Error(`API response is not valid JSON: ${responseParseError.message}`)
          }

          // Support both old format (responseDataPath/updateJsonPath) and new format (responseDataMappings)
          let mappingsToProcess = []
          if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
            mappingsToProcess = config.responseDataMappings
            console.log('📋 Using new format: processing', mappingsToProcess.length, 'mapping(s)')
          } else if (config.responseDataPath && config.updateJsonPath) {
            mappingsToProcess = [{
              responsePath: config.responseDataPath,
              updatePath: config.updateJsonPath
            }]
            console.log('📋 Using old format: converted to single mapping')
          }

          if (mappingsToProcess.length > 0) {
            console.log('🔄 Extracting data from API response...')
            for (const mapping of mappingsToProcess) {
              if (!mapping.responsePath || !mapping.updatePath) {
                console.warn('⚠️ Skipping mapping with missing responsePath or updatePath:', mapping)
                continue
              }

              try {
                let responseValue = getValueByPath(responseData, mapping.responsePath)
                console.log(`📊 Extracted value from "${mapping.responsePath}":`, responseValue)

                const updatePathParts = mapping.updatePath.split('.')
                let current = contextData

                for (let j = 0; j < updatePathParts.length - 1; j++) {
                  const part = updatePathParts[j]

                  if (part.includes('[') && part.includes(']')) {
                    const arrayName = part.substring(0, part.indexOf('['))
                    const arrayIndex = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')))

                    if (!current[arrayName]) {
                      current[arrayName] = []
                    }

                    while (current[arrayName].length <= arrayIndex) {
                      current[arrayName].push({})
                    }

                    current = current[arrayName][arrayIndex]
                  } else {
                    if (!current[part]) current[part] = {}
                    current = current[part]
                  }
                }

                const finalPart = updatePathParts[updatePathParts.length - 1]

                if (finalPart.includes('[') && finalPart.includes(']')) {
                  const arrayName = finalPart.substring(0, finalPart.indexOf('['))
                  const arrayIndex = parseInt(finalPart.substring(finalPart.indexOf('[') + 1, finalPart.indexOf(']')))

                  if (!current[arrayName]) {
                    current[arrayName] = []
                  }

                  while (current[arrayName].length <= arrayIndex) {
                    current[arrayName].push({})
                  }

                  current[arrayName][arrayIndex] = responseValue
                } else {
                  current[finalPart] = responseValue
                }

                console.log(`✅ Updated context data at path "${mapping.updatePath}"`)
              } catch (extractError) {
                console.error(`❌ Failed to process mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError)
              }
            }
          }

        } else if (step.step_type === 'api_endpoint') {
          console.log('🌐 === EXECUTING API ENDPOINT STEP ===');
          const config = step.config_json || {};
          console.log('🔧 API endpoint config:', JSON.stringify(config, null, 2));

          // Determine which API configuration to use
          let baseUrl = '';
          let authToken = '';

          if (config.apiSourceType === 'main') {
            // Load main API config
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
                console.log('✅ Loaded main API config');
                console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
              }
            }
          } else if (config.apiSourceType === 'secondary' && config.secondaryApiId) {
            // Load secondary API config
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
                console.log('✅ Loaded secondary API config');
                console.log('🔑 Auth token loaded:', authToken ? `${authToken.substring(0, 10)}...` : 'EMPTY');
              }
            }
          }

          // Build URL with path and query parameters
          let apiPath = config.apiPath || '';
          const httpMethod = config.httpMethod || 'GET';

          // Replace path variables (e.g., {id} or ${id})
          const pathVarRegex = /\{([^}]+)\}|\$\{([^}]+)\}/g;
          let pathMatch;
          while ((pathMatch = pathVarRegex.exec(apiPath)) !== null) {
            const variableName = pathMatch[1] || pathMatch[2];
            const value = getValueByPath(contextData, variableName);
            if (value !== undefined && value !== null) {
              apiPath = apiPath.replace(pathMatch[0], String(value));
              console.log(`🔄 Replaced path variable ${pathMatch[0]} with: ${value}`);
            }
          }

          // Build query string from enabled parameters
          const queryParams = new URLSearchParams();
          const queryParameterConfig = config.queryParameterConfig || {};

          for (const [paramName, paramConfig] of Object.entries(queryParameterConfig)) {
            if (paramConfig.enabled && paramConfig.value) {
              let paramValue = paramConfig.value;

              // Replace variables in parameter values using replaceAll approach
              const valueVarRegex = /\{\{([^}]+)\}\}|\$\{([^}]+)\}/g;
              paramValue = paramConfig.value.replace(valueVarRegex, (match, doubleBrace, dollarBrace) => {
                const variableName = doubleBrace || dollarBrace;
                const value = getValueByPath(contextData, variableName);
                if (value !== undefined && value !== null) {
                  let rawValue = String(value);
                  const isODataFilterParam = paramName.toLowerCase() === '$filter';
                  if (isODataFilterParam && rawValue.includes(')(')) {
                    rawValue = rawValue.replace(/\)\(/g, ')-(');
                    console.log(`🔧 Escaped )( to )-( in $filter param value:`, rawValue);
                  }
                  if (isODataFilterParam && rawValue.includes("'")) {
                    rawValue = rawValue.replace(/'/g, "''");
                    console.log(`🔧 Escaped single quotes in $filter param value:`, rawValue);
                  }
                  console.log(`🔄 Replaced query param variable ${match} with:`, rawValue);
                  return rawValue;
                }
                console.warn(`⚠️ Variable ${match} not found in context, leaving unchanged`);
                return match;
              });
              console.log(`📋 Final param value for "${paramName}":`, paramValue);

              queryParams.append(paramName, paramValue);
            }
          }

          const queryString = queryParams.toString();
          const fullUrl = `${baseUrl}${apiPath}${queryString ? '?' + queryString : ''}`;
          console.log('🔗 Full API Endpoint URL:', fullUrl);

          // Validate auth token
          if (!authToken) {
            console.warn('⚠️ WARNING: No auth token found! API call may fail due to authentication.');
          }

          // Prepare headers
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          };

          // Store request details for error logging (before the fetch call)
          const apiRequestDetails = {
            url: fullUrl,
            method: httpMethod,
            baseUrl: baseUrl,
            apiPath: apiPath,
            queryString: queryString,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authToken ? `Bearer ${authToken.substring(0, 10)}...` : 'MISSING'
            }
          };

          // Make the API call
          console.log(`📤 Making ${httpMethod} request to API endpoint`);
          console.log('📋 Request Details:');
          console.log('  - URL:', fullUrl);
          console.log('  - Method:', httpMethod);
          console.log('  - Headers:', JSON.stringify(headers, null, 2));
          console.log('  - Base URL:', baseUrl);
          console.log('  - API Path:', apiPath);
          console.log('  - Query String:', queryString);
          const apiResponse = await fetch(fullUrl, {
            method: httpMethod,
            headers: headers
          });

          console.log('📥 API endpoint response status:', apiResponse.status);

          if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('❌ API endpoint call failed:', errorText);
            // Store request details in stepOutputData before throwing error
            stepOutputData = {
              requestAttempted: apiRequestDetails,
              responseStatus: apiResponse.status,
              error: errorText
            };
            throw new Error(`API endpoint call failed with status ${apiResponse.status}: ${errorText}`);
          }

          const responseData = await apiResponse.json();
          console.log('✅ API endpoint call successful');
          console.log('📄 Response data (first 500 chars):', JSON.stringify(responseData).substring(0, 500));
          console.log('📄 Full Response data:', JSON.stringify(responseData, null, 2));

          lastApiResponse = responseData;

          // Support both old format (responsePath/updateJsonPath) and new format (responseDataMappings)
          let mappingsToProcess = []
          if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
            mappingsToProcess = config.responseDataMappings
            console.log('📋 Using new format: processing', mappingsToProcess.length, 'mapping(s)')
          } else if (config.responsePath && config.updateJsonPath) {
            mappingsToProcess = [{
              responsePath: config.responsePath,
              updatePath: config.updateJsonPath
            }]
            console.log('📋 Using old format: converted to single mapping')
          }

          const extractedValues = []
          if (mappingsToProcess.length > 0) {
            console.log('🔄 Extracting data from API response...')
            for (const mapping of mappingsToProcess) {
              if (!mapping.responsePath || !mapping.updatePath) {
                console.warn('⚠️ Skipping mapping with missing responsePath or updatePath:', mapping)
                continue
              }

              try {
                const extractedValue = getValueByPath(responseData, mapping.responsePath)
                console.log(`🔍 Extracted value from path "${mapping.responsePath}":`, extractedValue)

                if (extractedValue !== undefined) {
                  const pathParts = mapping.updatePath.split(/[.\[\]]/).filter(Boolean)
                  let current = contextData.extractedData || contextData

                  for (let i = 0; i < pathParts.length - 1; i++) {
                    const part = pathParts[i]
                    if (!(part in current)) {
                      current[part] = {}
                    }
                    current = current[part]
                  }

                  const lastPart = pathParts[pathParts.length - 1]
                  current[lastPart] = extractedValue
                  console.log(`✅ Updated context data at path "${mapping.updatePath}"`)

                  // Also update root contextData for easy access
                  contextData[lastPart] = extractedValue

                  extractedValues.push({
                    path: mapping.responsePath,
                    updatePath: mapping.updatePath,
                    value: extractedValue
                  })
                }
              } catch (extractError) {
                console.error(`❌ Failed to process mapping "${mapping.responsePath}" -> "${mapping.updatePath}":`, extractError)
              }
            }
          }

          stepOutputData = {
            url: fullUrl,
            method: httpMethod,
            responseStatus: apiResponse.status,
            extractedValues,
            updatedPaths: mappingsToProcess.map(m => m.updatePath)
          };

          console.log('✅ === API ENDPOINT STEP COMPLETED ===');

        } else if (step.step_type === 'rename_file' || step.step_type === 'rename_pdf') {
          console.log('📝 === EXECUTING RENAME FILE STEP ===')
          const config = step.config_json || {}
          console.log('🔧 Rename config:', JSON.stringify(config, null, 2))

          let template = config.filenameTemplate || config.template || 'Remit_{{pdfFilename}}'
          console.log('📄 Original template:', template)

          const placeholderRegex = /\{\{([^}]+)\}\}/g
          let match

          while ((match = placeholderRegex.exec(template)) !== null) {
            const placeholder = match[0]
            const path = match[1]
            const value = getValueByPath(contextData, path)

            console.log(`🔍 Replacing ${placeholder} with value:`, value)

            if (value !== null && value !== undefined) {
              template = template.replace(placeholder, String(value))
            }
          }

          let baseFilename = template.replace(/\.(pdf|csv|json|xml)$/i, '')
          console.log('📄 Base filename (without extension):', baseFilename)

          const appendTimestamp = config.appendTimestamp === true
          const timestampFormat = config.timestampFormat || 'YYYYMMDD'

          console.log('⏰ Append timestamp:', appendTimestamp)
          if (appendTimestamp) {
            console.log('⏰ Timestamp format:', timestampFormat)
          }

          let timestamp = ''
          if (appendTimestamp) {
            const now = new Date()
            const year = now.getFullYear()
            const month = String(now.getMonth() + 1).padStart(2, '0')
            const day = String(now.getDate()).padStart(2, '0')
            const hours = String(now.getHours()).padStart(2, '0')
            const minutes = String(now.getMinutes()).padStart(2, '0')
            const seconds = String(now.getSeconds()).padStart(2, '0')

            switch (timestampFormat) {
              case 'YYYYMMDD':
                timestamp = `${year}${month}${day}`
                break
              case 'YYYY-MM-DD':
                timestamp = `${year}-${month}-${day}`
                break
              case 'YYYYMMDD_HHMMSS':
                timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`
                break
              case 'YYYY-MM-DD_HH-MM-SS':
                timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
                break
              default:
                timestamp = `${year}${month}${day}`
            }

            console.log('⏰ Generated timestamp:', timestamp)
            baseFilename = `${baseFilename}_${timestamp}`
            console.log('📄 Base filename with timestamp:', baseFilename)
          }

          const renamePdf = config.renamePdf === true
          const renameCsv = config.renameCsv === true
          const renameJson = config.renameJson === true
          const renameXml = config.renameXml === true

          console.log('📋 File types to rename:', { renamePdf, renameCsv, renameJson, renameXml })

          const renamedFilenames: any = {}

          if (renamePdf) {
            contextData.renamedPdfFilename = `${baseFilename}.pdf`
            renamedFilenames.pdf = contextData.renamedPdfFilename
            console.log('✅ Renamed PDF filename:', contextData.renamedPdfFilename)
          }

          if (renameCsv) {
            contextData.renamedCsvFilename = `${baseFilename}.csv`
            renamedFilenames.csv = contextData.renamedCsvFilename
            console.log('✅ Renamed CSV filename:', contextData.renamedCsvFilename)
          }

          if (renameJson) {
            contextData.renamedJsonFilename = `${baseFilename}.json`
            renamedFilenames.json = contextData.renamedJsonFilename
            console.log('✅ Renamed JSON filename:', contextData.renamedJsonFilename)
          }

          if (renameXml) {
            contextData.renamedXmlFilename = `${baseFilename}.xml`
            renamedFilenames.xml = contextData.renamedXmlFilename
            console.log('✅ Renamed XML filename:', contextData.renamedXmlFilename)
          }

          let primaryFilename = baseFilename
          if (formatType === 'CSV' && renameCsv) {
            primaryFilename = contextData.renamedCsvFilename
          } else if (formatType === 'JSON' && renameJson) {
            primaryFilename = contextData.renamedJsonFilename
          } else if (formatType === 'XML' && renameXml) {
            primaryFilename = contextData.renamedXmlFilename
          } else if (renamePdf) {
            primaryFilename = contextData.renamedPdfFilename
          } else if (renameCsv) {
            primaryFilename = contextData.renamedCsvFilename
          } else if (renameJson) {
            primaryFilename = contextData.renamedJsonFilename
          } else if (renameXml) {
            primaryFilename = contextData.renamedXmlFilename
          }

          contextData.renamedFilename = primaryFilename
          contextData.actualFilename = primaryFilename

          console.log('✅ Primary renamed filename:', primaryFilename)
          stepOutputData = {
            renamedFilenames,
            primaryFilename,
            baseFilename
          }

        } else if (step.step_type === 'sftp_upload') {
          console.log('📤 === EXECUTING SFTP UPLOAD STEP ===')
          const config = step.config_json || {}
          console.log('🔧 SFTP upload config:', JSON.stringify(config, null, 2))

          console.log('📋 Fetching default SFTP configuration...')
          const sftpConfigResponse = await fetch(`${supabaseUrl}/rest/v1/sftp_config?limit=1`, {
            headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
          })

          if (!sftpConfigResponse.ok) {
            throw new Error(`Failed to fetch SFTP configuration: ${sftpConfigResponse.status} ${sftpConfigResponse.statusText}`)
          }

          const sftpConfigs = await sftpConfigResponse.json()
          if (!sftpConfigs || sftpConfigs.length === 0) {
            throw new Error('No SFTP configuration found. Please configure SFTP settings in Settings.')
          }

          const sftpConfig = sftpConfigs[0]
          console.log('✅ SFTP configuration loaded:', sftpConfig.name || sftpConfig.host)

          let fileContent = ''
          let filename = contextData.renamedFilename || contextData.actualFilename || contextData.pdfFilename || 'document'

          if (config.uploadType === 'pdf') {
            console.log('📄 Uploading PDF file')

            if (contextData.renamedPdfFilename) {
              filename = contextData.renamedPdfFilename
              console.log('✅ Using renamed PDF filename:', filename)
            } else if (!filename.toLowerCase().endsWith('.pdf')) {
              filename = `${filename}.pdf`
            }

            if (!contextData.pdfBase64) {
              throw new Error('PDF base64 data not available')
            }

            fileContent = contextData.pdfBase64

          } else if (config.uploadType === 'json') {
            console.log('📄 Uploading JSON file')

            if (contextData.renamedJsonFilename) {
              filename = contextData.renamedJsonFilename
              console.log('✅ Using renamed JSON filename:', filename)
            } else if (!filename.toLowerCase().endsWith('.json')) {
              filename = filename.replace(/\.(pdf|json|xml|csv)$/i, '') + '.json'
            }

            const dataToUpload = contextData.extractedData || contextData
            fileContent = Buffer.from(JSON.stringify(dataToUpload, null, 2)).toString('base64')

          } else if (config.uploadType === 'xml') {
            console.log('📄 Uploading XML file')

            if (contextData.renamedXmlFilename) {
              filename = contextData.renamedXmlFilename
              console.log('✅ Using renamed XML filename:', filename)
            } else if (!filename.toLowerCase().endsWith('.xml')) {
              filename = filename.replace(/\.(pdf|json|xml|csv)$/i, '') + '.xml'
            }

            const dataToUpload = contextData.extractedData || contextData
            fileContent = Buffer.from(JSON.stringify(dataToUpload, null, 2)).toString('base64')

          } else if (config.uploadType === 'csv') {
            console.log('📄 === UPLOADING CSV FILE ===')

            if (contextData.renamedCsvFilename) {
              filename = contextData.renamedCsvFilename
              console.log('✅ Using renamed CSV filename:', filename)
            } else if (!filename.toLowerCase().endsWith('.csv')) {
              filename = filename.replace(/\.(pdf|json|xml|csv)$/i, '') + '.csv'
            }

            console.log('📊 Searching for CSV data in contextData...')
            console.log('📊 contextData.extractedData type:', typeof contextData.extractedData)
            console.log('📊 contextData.originalExtractedData type:', typeof contextData.originalExtractedData)

            let csvData: string | null = null

            if (contextData.extractedData && typeof contextData.extractedData === 'string') {
              console.log('✅ Found CSV data in extractedData (string)')
              csvData = contextData.extractedData
              console.log('📊 CSV data length:', csvData.length)
              console.log('📊 CSV data preview (first 200 chars):', csvData.substring(0, 200))
              console.log('📊 CSV data preview (last 100 chars):', csvData.substring(Math.max(0, csvData.length - 100)))
            } else if (contextData.originalExtractedData && typeof contextData.originalExtractedData === 'string') {
              console.log('✅ Found CSV data in originalExtractedData (string)')
              csvData = contextData.originalExtractedData
              console.log('📊 CSV data length:', csvData.length)
              console.log('📊 CSV data preview (first 200 chars):', csvData.substring(0, 200))
              console.log('📊 CSV data preview (last 100 chars):', csvData.substring(Math.max(0, csvData.length - 100)))
            } else {
              console.error('❌ CSV data not found')
              console.error('- extractedData type:', typeof contextData.extractedData)
              console.error('- originalExtractedData type:', typeof contextData.originalExtractedData)
              console.error('- extractedData value:', contextData.extractedData)
              console.error('- originalExtractedData value:', contextData.originalExtractedData)
              throw new Error('CSV data not available or not in string format')
            }

            fileContent = csvData

            // Filter out workflow-only fields if field mappings are available
            if (typeDetails && typeDetails.fieldMappings && Array.isArray(typeDetails.fieldMappings)) {
              console.log('🔍 Filtering workflow-only fields from CSV...')
              console.log('📊 Field mappings available:', typeDetails.fieldMappings.length)
              fileContent = filterCsvWorkflowOnlyFields(fileContent, typeDetails.fieldMappings)
            } else {
              console.log('⚠️ No field mappings available, skipping workflow-only field filtering')
            }

            console.log('✅ CSV data prepared for upload, length:', fileContent.length)
            console.log('✅ CSV fileContent preview (first 200 chars):', fileContent.substring(0, 200))
          }

          console.log('📤 Calling SFTP upload function...')
          console.log('📄 Filename:', filename)
          console.log('📏 File content length:', fileContent.length)

          const uploadFileTypes: any = {}
          if (config.uploadType === 'pdf') {
            uploadFileTypes.pdf = true
          } else if (config.uploadType === 'json') {
            uploadFileTypes.json = true
          } else if (config.uploadType === 'xml') {
            uploadFileTypes.xml = true
          } else if (config.uploadType === 'csv') {
            uploadFileTypes.csv = true
          }

          let exactFilenameToPass: string | undefined = undefined

          if (config.uploadType === 'pdf' && contextData.renamedPdfFilename) {
            exactFilenameToPass = contextData.renamedPdfFilename.replace(/\.(pdf|csv|json|xml)$/i, '')
            console.log('📤 Passing exact filename for PDF:', exactFilenameToPass)
          } else if (config.uploadType === 'csv' && contextData.renamedCsvFilename) {
            exactFilenameToPass = contextData.renamedCsvFilename.replace(/\.(pdf|csv|json|xml)$/i, '')
            console.log('📤 Passing exact filename for CSV:', exactFilenameToPass)
          } else if (config.uploadType === 'json' && contextData.renamedJsonFilename) {
            exactFilenameToPass = contextData.renamedJsonFilename.replace(/\.(pdf|csv|json|xml)$/i, '')
            console.log('📤 Passing exact filename for JSON:', exactFilenameToPass)
          } else if (config.uploadType === 'xml' && contextData.renamedXmlFilename) {
            exactFilenameToPass = contextData.renamedXmlFilename.replace(/\.(pdf|csv|json|xml)$/i, '')
            console.log('📤 Passing exact filename for XML:', exactFilenameToPass)
          } else if (contextData.renamedFilename) {
            exactFilenameToPass = contextData.renamedFilename.replace(/\.(pdf|csv|json|xml)$/i, '')
            console.log('📤 Passing exact filename (generic):', exactFilenameToPass)
          }

          console.log('🔍 === PREPARING CONTENT FOR SFTP ===')
          console.log('🔍 config.uploadType:', config.uploadType)
          console.log('🔍 fileContent type:', typeof fileContent)
          console.log('🔍 fileContent length:', fileContent ? fileContent.length : 0)
          console.log('🔍 formatType:', formatType)

          let contentForSftp: string
          if (config.uploadType === 'csv') {
            console.log('✅ Detected CSV upload type')
            contentForSftp = fileContent
            console.log('📤 === PREPARING CSV FOR SFTP ===')
            console.log('📤 contentForSftp type:', typeof contentForSftp)
            console.log('📤 contentForSftp length:', contentForSftp.length)
            console.log('📤 contentForSftp preview (first 300 chars):', contentForSftp.substring(0, 300))
            console.log('📤 contentForSftp preview (last 200 chars):', contentForSftp.substring(Math.max(0, contentForSftp.length - 200)))

            if (!contentForSftp || contentForSftp.trim() === '') {
              console.error('❌ CRITICAL: contentForSftp is empty!')
              console.error('❌ fileContent was:', fileContent)
              throw new Error('CSV content is empty before SFTP upload')
            }
          } else if (contextData.extractedData && typeof contextData.extractedData === 'object') {
            console.log('✅ Detected object type, converting to JSON')
            contentForSftp = JSON.stringify(contextData.extractedData)
          } else {
            console.log('⚠️ No valid content found, using empty object')
            contentForSftp = '{}'
          }

          console.log('🔍 === FINAL contentForSftp CHECK ===')
          console.log('🔍 contentForSftp type:', typeof contentForSftp)
          console.log('🔍 contentForSftp length:', contentForSftp ? contentForSftp.length : 0)
          console.log('🔍 contentForSftp is empty?:', !contentForSftp || contentForSftp.trim() === '')

          const sftpUploadPayload: any = {
            sftpConfig: {
              host: sftpConfig.host,
              port: sftpConfig.port,
              username: sftpConfig.username,
              password: sftpConfig.password,
              xmlPath: sftpConfig.remote_path || '/ParseIt_XML',
              pdfPath: sftpConfig.pdf_path || '/ParseIt_PDF',
              jsonPath: sftpConfig.json_path || '/ParseIt_JSON',
              csvPath: sftpConfig.csv_path || '/ParseIt_CSV'
            },
            xmlContent: contentForSftp,
            pdfBase64: contextData.pdfBase64 || '',
            baseFilename: filename,
            originalFilename: contextData.originalPdfFilename || filename,
            formatType: formatType,
            uploadFileTypes: uploadFileTypes
          }

          if (exactFilenameToPass) {
            sftpUploadPayload.exactFilename = exactFilenameToPass
            console.log('📤 Adding exactFilename to payload:', exactFilenameToPass)
          }

          console.log('📤 === SFTP UPLOAD PAYLOAD DEBUG ===')
          console.log('📤 Payload xmlContent type:', typeof sftpUploadPayload.xmlContent)
          console.log('📤 Payload xmlContent length:', sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.length : 0)
          console.log('📤 Payload xmlContent preview (first 300):', sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.substring(0, 300) : 'EMPTY')
          console.log('📤 Payload xmlContent preview (last 200):', sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.substring(Math.max(0, sftpUploadPayload.xmlContent.length - 200)) : 'EMPTY')
          console.log('📤 SFTP upload payload structure:', JSON.stringify({
            ...sftpUploadPayload,
            pdfBase64: `[${sftpUploadPayload.pdfBase64.length} chars]`,
            xmlContent: `[${sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.length : 0} chars]`
          }, null, 2))

          const sftpUploadResponse = await fetch(`${supabaseUrl}/functions/v1/sftp-upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(sftpUploadPayload)
          })

          console.log('📤 SFTP upload response status:', sftpUploadResponse.status)

          if (!sftpUploadResponse.ok) {
            const errorText = await sftpUploadResponse.text()
            console.error('❌ SFTP upload failed:', errorText)
            throw new Error(`SFTP upload failed: ${errorText}`)
          }

          const uploadResult = await sftpUploadResponse.json()
          console.log('✅ SFTP upload successful:', uploadResult)

          stepOutputData = { uploadResult, filename }

        } else if (step.step_type === 'email_action') {
          console.log('📧 === EXECUTING EMAIL ACTION STEP ===')
          const config = step.config_json || {}
          console.log('🔧 Email config:', JSON.stringify(config, null, 2))

          const processTemplateWithMapping = (template: string, contextData: any, templateName = 'template') => {
            const mappings: Record<string, any> = {}

            if (!template || !template.includes('{{')) {
              return { processed: template, mappings }
            }

            const templatePattern = /\{\{([^}]+)\}\}/g
            const processed = template.replace(templatePattern, (match, path) => {
              const trimmedPath = path.trim()
              const value = getValueByPath(contextData, trimmedPath)
              mappings[trimmedPath] = value !== undefined ? value : null

              if (typeof value === 'object' && value !== null) {
                return JSON.stringify(value)
              }
              return value !== undefined ? String(value) : match
            })

            console.log(`\n📝 === TEMPLATE SUBSTITUTION: ${templateName} ===`)
            console.log('📋 Template:', template)
            console.log('🔍 Field Mappings:')
            Object.entries(mappings).forEach(([field, value]) => {
              const displayValue = typeof value === 'object' ? JSON.stringify(value) : value
              console.log(`   ${field} → ${displayValue}`)
            })
            console.log('✅ Final Result:', processed)
            console.log('='.repeat(50))

            return { processed, mappings }
          }

          const allFieldMappings: Record<string, any> = {}
          const processedConfig: any = {}

          const toResult = processTemplateWithMapping(config.to, contextData, 'Email To')
          processedConfig.to = toResult.processed
          Object.assign(allFieldMappings, toResult.mappings)

          const subjectResult = processTemplateWithMapping(config.subject, contextData, 'Email Subject')
          processedConfig.subject = subjectResult.processed
          Object.assign(allFieldMappings, subjectResult.mappings)

          const bodyResult = processTemplateWithMapping(config.body, contextData, 'Email Body')
          processedConfig.body = bodyResult.processed
          Object.assign(allFieldMappings, bodyResult.mappings)

          if (config.from) {
            const fromResult = processTemplateWithMapping(config.from, contextData, 'Email From')
            processedConfig.from = fromResult.processed
            Object.assign(allFieldMappings, fromResult.mappings)
          }

          let pdfAttachment = null
          if (config.includeAttachment && contextData.pdfBase64) {
            let attachmentFilename
            const attachmentSource = config.attachmentSource || 'transform_setup_pdf'

            console.log('📧 Attachment source selected:', attachmentSource)
            console.log('📧 Available filenames in context:')
            console.log('  - renamedFilename (from rename step):', contextData.renamedFilename)
            console.log('  - transformSetupFilename (from transform setup):', contextData.transformSetupFilename)
            console.log('  - pdfFilename (current):', contextData.pdfFilename)
            console.log('  - originalPdfFilename:', contextData.originalPdfFilename)

            if (attachmentSource === 'renamed_pdf_step') {
              if (contextData.renamedFilename) {
                attachmentFilename = contextData.renamedFilename
                console.log('📧 ✅ Using renamedFilename from rename step:', attachmentFilename)
              } else {
                attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf'
                console.log('📧 ⚠️  No renamedFilename from step, falling back to originalPdfFilename:', attachmentFilename)
              }
            } else if (attachmentSource === 'transform_setup_pdf') {
              if (contextData.transformSetupFilename) {
                attachmentFilename = contextData.transformSetupFilename
                console.log('📧 ✅ Using transformSetupFilename from transform setup:', attachmentFilename)
              } else if (contextData.pdfFilename) {
                attachmentFilename = contextData.pdfFilename
                console.log('📧 ✅ Using pdfFilename from transform setup:', attachmentFilename)
              } else {
                attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf'
                console.log('📧 ⚠️  No transform setup filename, falling back to originalPdfFilename:', attachmentFilename)
              }
            } else if (attachmentSource === 'original_pdf') {
              attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf'
              console.log('Using originalPdfFilename:', attachmentFilename)
            } else if (attachmentSource === 'extraction_type_filename') {
              if (contextData.extractionTypeFilename) {
                const filenameResult = processTemplateWithMapping(contextData.extractionTypeFilename, contextData, 'Extraction Type Filename')
                attachmentFilename = filenameResult.processed
                Object.assign(allFieldMappings, filenameResult.mappings)
                console.log('Using extractionTypeFilename from extraction type:', attachmentFilename)
              } else {
                attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf'
                console.log('No extractionTypeFilename available, falling back to originalPdfFilename:', attachmentFilename)
              }
            } else {
              if (contextData.renamedFilename) {
                attachmentFilename = contextData.renamedFilename
                console.log('📧 ✅ Using renamedFilename (legacy mode):', attachmentFilename)
              } else if (contextData.extractionTypeFilename) {
                const filenameResult = processTemplateWithMapping(contextData.extractionTypeFilename, contextData, 'Extraction Type Filename')
                attachmentFilename = filenameResult.processed
                Object.assign(allFieldMappings, filenameResult.mappings)
                console.log('Using extractionTypeFilename from extraction type:', attachmentFilename)
              } else {
                attachmentFilename = contextData.originalPdfFilename || 'attachment.pdf'
                console.log('📧 ⚠️  Using fallback to originalPdfFilename (legacy mode):', attachmentFilename)
              }
            }

            let pdfContent = contextData.pdfBase64
            const pdfEmailStrategy = config.pdfEmailStrategy || 'all_pages_in_group'

            if (pdfEmailStrategy === 'specific_page_in_group' && config.specificPageToEmail) {
              const pageToEmail = config.specificPageToEmail
              console.log(`📧 Extracting page ${pageToEmail} from PDF for email attachment`)

              try {
                pdfContent = await extractSpecificPageFromPdf(contextData.pdfBase64, pageToEmail)
                console.log(`📧 ✅ Successfully extracted page ${pageToEmail} from PDF`)
              } catch (extractError) {
                console.error(`📧 ❌ Failed to extract page ${pageToEmail}:`, extractError)
                throw new Error(`Failed to extract page ${pageToEmail} from PDF: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`)
              }
            } else {
              console.log('📧 Using full PDF (all pages in group) for email attachment')
            }

            pdfAttachment = {
              filename: attachmentFilename,
              content: pdfContent
            }

            console.log('📧 PDF attachment prepared with filename:', attachmentFilename)
          }

          let ccEmail = null
          if (config.ccUser && contextData.userId) {
            console.log('📧 CC User enabled, fetching user email for userId:', contextData.userId)
            try {
              const userResponse = await fetch(
                `${supabaseUrl}/rest/v1/users?id=eq.${contextData.userId}&select=email`,
                {
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json',
                    'apikey': supabaseServiceKey
                  }
                }
              )
              if (userResponse.ok) {
                const users = await userResponse.json()
                if (users && users.length > 0 && users[0].email) {
                  ccEmail = users[0].email
                  console.log('📧 ✅ User email retrieved for CC:', ccEmail)
                } else {
                  console.log('📧 ⚠️ User email not found in database for userId:', contextData.userId)
                }
              } else {
                console.log('📧 ⚠️ Failed to fetch user email:', userResponse.status)
              }
            } catch (userError) {
              console.error('📧 ❌ Error fetching user email:', userError)
            }
          }

          console.log('\n📧 === FINAL EMAIL DETAILS ===')
          console.log('To:', processedConfig.to)
          console.log('CC:', ccEmail || 'none')
          console.log('Subject:', processedConfig.subject)
          console.log('From:', processedConfig.from || '(default)')
          console.log('Attachment:', pdfAttachment ? pdfAttachment.filename : 'none')
          console.log('='.repeat(50))

          const emailConfigResponse = await fetch(`${supabaseUrl}/rest/v1/email_monitoring_config?limit=1`, {
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey
            }
          })

          if (!emailConfigResponse.ok) {
            throw new Error('Email configuration not found')
          }

          const emailConfigData = await emailConfigResponse.json()
          if (!emailConfigData || emailConfigData.length === 0) {
            throw new Error('Email configuration not found')
          }

          const emailConfigRecord = emailConfigData[0]
          const emailConfig = {
            provider: emailConfigRecord.provider || 'office365',
            office365: emailConfigRecord.provider === 'office365' ? {
              tenant_id: emailConfigRecord.tenant_id,
              client_id: emailConfigRecord.client_id,
              client_secret: emailConfigRecord.client_secret,
              default_send_from_email: emailConfigRecord.monitored_email
            } : undefined,
            gmail: emailConfigRecord.provider === 'gmail' ? {
              client_id: emailConfigRecord.gmail_client_id,
              client_secret: emailConfigRecord.gmail_client_secret,
              refresh_token: emailConfigRecord.gmail_refresh_token,
              default_send_from_email: emailConfigRecord.monitored_email
            } : undefined
          }

          let emailResult
          if (emailConfig.provider === 'office365') {
            emailResult = await sendOffice365Email(emailConfig.office365!, {
              to: processedConfig.to,
              subject: processedConfig.subject,
              body: processedConfig.body,
              from: processedConfig.from || emailConfig.office365!.default_send_from_email,
              cc: ccEmail
            }, pdfAttachment)
          } else {
            emailResult = await sendGmailEmail(emailConfig.gmail!, {
              to: processedConfig.to,
              subject: processedConfig.subject,
              body: processedConfig.body,
              from: processedConfig.from || emailConfig.gmail!.default_send_from_email,
              cc: ccEmail
            }, pdfAttachment)
          }

          if (!emailResult.success) {
            throw new Error(`Email sending failed: ${emailResult.error}`)
          }

          stepOutputData = {
            success: true,
            message: 'Email sent successfully',
            emailResult,
            processedConfig: {
              ...processedConfig,
              cc: ccEmail
            },
            fieldMappings: allFieldMappings,
            attachmentIncluded: !!pdfAttachment,
            attachmentFilename: pdfAttachment?.filename
          }

        } else if (step.step_type === 'conditional_check') {
          console.log('🔍 === EXECUTING CONDITIONAL CHECK STEP ===')
          const config = step.config_json || {}
          console.log('🔧 Conditional check config:', JSON.stringify(config, null, 2))

          const rawFieldPath = config.fieldPath || config.checkField || ''
          const fieldPath = rawFieldPath.replace(/^\{\{|\}\}$/g, '')
          const operator = config.operator || 'exists'
          const expectedValue = config.expectedValue
          const storeResultAs = config.storeResultAs || `condition_${step.step_order}_result`

          console.log('🔍 Checking field:', fieldPath)
          console.log('🔍 Operator:', operator)
          console.log('🔍 Expected value:', expectedValue)

          const actualValue = getValueByPath(contextData, fieldPath)
          console.log('🔍 Actual value from context:', actualValue)
          console.log('🔍 Actual value type:', typeof actualValue)

          let conditionMet = false

          switch (operator) {
            case 'exists':
              conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== ''
              console.log(`🔍 Condition (exists): ${conditionMet}`)
              break

            case 'is_null':
            case 'isNull':
              conditionMet = actualValue === null || actualValue === undefined
              console.log(`🔍 Condition (is_null): ${conditionMet}`)
              break

            case 'is_not_null':
            case 'isNotNull':
              conditionMet = actualValue !== null && actualValue !== undefined
              console.log(`🔍 Condition (is_not_null): ${conditionMet}`)
              break

            case 'not_exists':
            case 'notExists':
              conditionMet = actualValue === null || actualValue === undefined || actualValue === ''
              console.log(`🔍 Condition (not_exists): ${conditionMet}`)
              break

            case 'equals':
            case 'eq':
              conditionMet = String(actualValue) === String(expectedValue)
              console.log(`🔍 Condition (equals): "${actualValue}" === "${expectedValue}" = ${conditionMet}`)
              break

            case 'not_equals':
            case 'notEquals':
            case 'ne':
              conditionMet = String(actualValue) !== String(expectedValue)
              console.log(`🔍 Condition (not_equals): "${actualValue}" !== "${expectedValue}" = ${conditionMet}`)
              break

            case 'contains':
              conditionMet = String(actualValue).includes(String(expectedValue))
              console.log(`🔍 Condition (contains): "${actualValue}".includes("${expectedValue}") = ${conditionMet}`)
              break

            case 'not_contains':
            case 'notContains':
              conditionMet = !String(actualValue).includes(String(expectedValue))
              console.log(`🔍 Condition (not_contains): !("${actualValue}".includes("${expectedValue}")) = ${conditionMet}`)
              break

            case 'greater_than':
            case 'gt':
              const gtActual = parseFloat(actualValue)
              const gtExpected = parseFloat(expectedValue)
              conditionMet = !isNaN(gtActual) && !isNaN(gtExpected) && gtActual > gtExpected
              console.log(`🔍 Condition (greater_than): ${gtActual} > ${gtExpected} = ${conditionMet}`)
              break

            case 'less_than':
            case 'lt':
              const ltActual = parseFloat(actualValue)
              const ltExpected = parseFloat(expectedValue)
              conditionMet = !isNaN(ltActual) && !isNaN(ltExpected) && ltActual < ltExpected
              console.log(`🔍 Condition (less_than): ${ltActual} < ${ltExpected} = ${conditionMet}`)
              break

            case 'greater_than_or_equal':
            case 'gte':
              const gteActual = parseFloat(actualValue)
              const gteExpected = parseFloat(expectedValue)
              conditionMet = !isNaN(gteActual) && !isNaN(gteExpected) && gteActual >= gteExpected
              console.log(`🔍 Condition (greater_than_or_equal): ${gteActual} >= ${gteExpected} = ${conditionMet}`)
              break

            case 'less_than_or_equal':
            case 'lte':
              const lteActual = parseFloat(actualValue)
              const lteExpected = parseFloat(expectedValue)
              conditionMet = !isNaN(lteActual) && !isNaN(lteExpected) && lteActual <= lteExpected
              console.log(`🔍 Condition (less_than_or_equal): ${lteActual} <= ${lteExpected} = ${conditionMet}`)
              break

            default:
              console.warn(`⚠️ Unknown operator: ${operator}, defaulting to 'exists'`)
              conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== ''
          }

          contextData[storeResultAs] = conditionMet
          console.log(`✅ Conditional check result stored as "${storeResultAs}": ${conditionMet}`)

          stepOutputData = {
            conditionMet,
            fieldPath,
            operator,
            actualValue,
            expectedValue,
            storeResultAs
          }

        } else {
          console.log(`⚠️ Unknown step type: ${step.step_type}`)
          stepOutputData = { skipped: true, reason: 'Step type not implemented' }
        }

        const stepEndTime = new Date().toISOString()
        const stepDurationMs = Date.now() - stepStartMs

        console.log(`✅ Step ${step.step_order} completed successfully in ${stepDurationMs}ms`)

        if (step.step_type === 'api_call') {
          console.log('📊 Last API response:', JSON.stringify(lastApiResponse, null, 2));
        }
        if (step.step_type === 'api_endpoint') {
          console.log('📊 Last API Endpoint response:', JSON.stringify(lastApiResponse, null, 2));
        }

        if (workflowExecutionLogId) {
          await createStepLog(
            supabaseUrl,
            supabaseServiceKey,
            workflowExecutionLogId,
            requestData.workflowId,
            step,
            'completed',
            stepStartTime,
            stepEndTime,
            stepDurationMs,
            undefined,
            { config: step.config_json },
            stepOutputData
          )
        }

        if (step.step_type === 'conditional_check') {
          const conditionResult = stepOutputData?.conditionMet
          const nextStepId = conditionResult
            ? step.next_step_on_success_id
            : step.next_step_on_failure_id

          if (nextStepId) {
            const targetIndex = steps.findIndex(s => s.id === nextStepId)
            if (targetIndex !== -1) {
              console.log(`🔀 Conditional branching: jumping to step index ${targetIndex}`)
              i = targetIndex - 1
            }
          }
        }

      } catch (stepError) {
        const stepEndTime = new Date().toISOString()
        const stepDurationMs = Date.now() - stepStartMs

        console.error(`❌ Step ${step.step_order} failed:`, stepError)

        if (workflowExecutionLogId) {
          // For API endpoint steps, include request details in output data if available
          const errorOutputData = (step.step_type === 'api_endpoint' && stepOutputData) ? stepOutputData : null;
          await createStepLog(
            supabaseUrl,
            supabaseServiceKey,
            workflowExecutionLogId,
            requestData.workflowId,
            step,
            'failed',
            stepStartTime,
            stepEndTime,
            stepDurationMs,
            stepError.message,
            { config: step.config_json },
            errorOutputData
          )

          try {
            await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${workflowExecutionLogId}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey },
              body: JSON.stringify({ status: 'failed', error_message: stepError.message, context_data: contextData, updated_at: new Date().toISOString() })
            })
          } catch (updateError) {
            console.error('❌ Failed to update workflow log:', updateError)
          }
        }

        const error: any = new Error(stepError.message)
        error.workflowExecutionLogId = workflowExecutionLogId
        error.extractionLogId = extractionLogId
        throw error
      }
    }

    console.log('✅ === WORKFLOW EXECUTION COMPLETED ===')
    if (workflowExecutionLogId) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${workflowExecutionLogId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey },
          body: JSON.stringify({ status: 'completed', context_data: contextData, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        })
      } catch (updateError) {
        console.error('❌ Failed to update workflow completion:', updateError)
      }
    }

    console.log('🎉 Workflow execution completed successfully')

    return new Response(
      JSON.stringify({ success: true, message: 'Workflow executed successfully', workflowExecutionLogId: workflowExecutionLogId, extractionLogId: extractionLogId, finalData: contextData, lastApiResponse: lastApiResponse, actualFilename: contextData.actualFilename || contextData.renamedFilename }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error("❌ === WORKFLOW EXECUTION ERROR ===")
    console.error("❌ Error type:", error.constructor.name)
    console.error("❌ Error message:", error.message)
    console.error("❌ Error stack:", error.stack)

    if (workflowExecutionLogId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs?id=eq.${workflowExecutionLogId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey },
          body: JSON.stringify({ status: 'failed', error_message: error.message, updated_at: new Date().toISOString() })
        })
      } catch (updateError) {
        console.error('❌ Failed to update workflow log with error:', updateError)
      }
    }

    return new Response(
      JSON.stringify({ error: "Workflow execution failed", details: error instanceof Error ? error.message : "Unknown error", workflowExecutionLogId: workflowExecutionLogId, extractionLogId: extractionLogId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

async function extractSpecificPageFromPdf(pdfBase64: string, pageNumber: number): Promise<string> {
  console.log(`📄 === EXTRACTING PAGE ${pageNumber} FROM PDF ===`)

  try {
    const { PDFDocument } = await import('npm:pdf-lib@1.17.1')

    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
    console.log(`📄 Decoded PDF, size: ${pdfBytes.length} bytes`)

    const pdfDoc = await PDFDocument.load(pdfBytes)
    const totalPages = pdfDoc.getPageCount()
    console.log(`📄 PDF has ${totalPages} page(s)`)

    if (pageNumber < 1 || pageNumber > totalPages) {
      throw new Error(
        `Invalid page number ${pageNumber}. PDF has ${totalPages} page(s). Page number must be between 1 and ${totalPages}.`
      )
    }

    const newPdf = await PDFDocument.create()
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNumber - 1])
    newPdf.addPage(copiedPage)

    const newPdfBytes = await newPdf.save()
    console.log(`📄 Created new PDF with single page, size: ${newPdfBytes.length} bytes`)

    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < newPdfBytes.length; i += chunkSize) {
      const chunk = newPdfBytes.subarray(i, Math.min(i + chunkSize, newPdfBytes.length))
      binary += String.fromCharCode.apply(null, Array.from(chunk))
    }

    const newPdfBase64 = btoa(binary)
    console.log(`📄 ✅ Successfully extracted page ${pageNumber}/${totalPages}`)

    return newPdfBase64
  } catch (error) {
    console.error('📄 ❌ PDF extraction failed:', error)
    throw error
  }
}

async function getOffice365AccessToken(config: { tenant_id: string; client_id: string; client_secret: string }): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/token`

  const params = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get Office365 access token: ${errorText}`)
  }

  const data = await response.json()
  return data.access_token
}

async function sendOffice365Email(
  config: { tenant_id: string; client_id: string; client_secret: string; default_send_from_email: string },
  email: { to: string; subject: string; body: string; from: string; cc?: string | null },
  attachment: { filename: string; content: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getOffice365AccessToken(config)

    const message: any = {
      message: {
        subject: email.subject,
        body: {
          contentType: 'HTML',
          content: email.body
        },
        toRecipients: [
          {
            emailAddress: {
              address: email.to
            }
          }
        ],
        from: {
          emailAddress: {
            address: email.from
          }
        },
        ...(email.cc ? {
          ccRecipients: [
            {
              emailAddress: {
                address: email.cc
              }
            }
          ]
        } : {})
      },
      saveToSentItems: 'true'
    }

    if (attachment) {
      message.message.attachments = [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.filename,
          contentType: 'application/pdf',
          contentBytes: attachment.content
        }
      ]
    }

    const sendUrl = `https://graph.microsoft.com/v1.0/users/${email.from}/sendMail`

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: errorText }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function getGmailAccessToken(config: { client_id: string; client_secret: string; refresh_token: string }): Promise<string> {
  const tokenUrl = 'https://oauth2.googleapis.com/token'

  const params = new URLSearchParams({
    client_id: config.client_id,
    client_secret: config.client_secret,
    refresh_token: config.refresh_token,
    grant_type: 'refresh_token'
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get Gmail access token: ${errorText}`)
  }

  const data = await response.json()
  return data.access_token
}

async function sendGmailEmail(
  config: { client_id: string; client_secret: string; refresh_token: string; default_send_from_email: string },
  email: { to: string; subject: string; body: string; from: string; cc?: string | null },
  attachment: { filename: string; content: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getGmailAccessToken(config)

    let emailContent

    if (attachment) {
      const boundary = '----=_Part_' + Date.now()
      const emailLines = [
        `To: ${email.to}`,
        ...(email.cc ? [`Cc: ${email.cc}`] : []),
        `From: ${email.from}`,
        `Subject: ${email.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        '',
        email.body,
        '',
        `--${boundary}`,
        `Content-Type: application/pdf; name="${attachment.filename}"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        attachment.content,
        '',
        `--${boundary}--`
      ]
      emailContent = emailLines.join('\r\n')
    } else {
      emailContent = [
        `From: ${email.from}`,
        `To: ${email.to}`,
        ...(email.cc ? [`Cc: ${email.cc}`] : []),
        `Subject: ${email.subject}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        email.body
      ].join('\r\n')
    }

    const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const sendUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedEmail })
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: errorText }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}