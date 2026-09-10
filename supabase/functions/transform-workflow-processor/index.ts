import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getValueByPath, createStepLog, updateWorkflowExecutionLog } from "./utils.ts";
import { executeApiCall } from "./steps/api.ts";
import { executeApiEndpoint } from "./steps/apiEndpoint.ts";
import { executeRename } from "./steps/rename.ts";
import { executeSftpUpload } from "./steps/upload.ts";
import { executeEmailAction } from "./steps/email.ts";
import { executeConditionalCheck } from "./steps/logic.ts";
import { executeMultipartFormUpload } from "./steps/multipart.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  console.log('🚀 === JSON WORKFLOW PROCESSOR START ===');
  let workflowExecutionLogId: string | null = null;
  let extractionLogId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Supabase configuration missing');
      return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    console.log('✅ Supabase configuration loaded');

    let requestData: any;
    try {
      console.log('📥 Reading request body...');
      const requestText = await req.text();
      console.log('📏 Request body size:', requestText.length, 'characters');
      if (!requestText || requestText.trim() === '') {
        throw new Error('Request body is empty');
      }
      console.log('🔧 Parsing request JSON...');
      requestData = JSON.parse(requestText);
      console.log('✅ Request parsed successfully');
      console.log('🔑 Request keys:', Object.keys(requestData));
    } catch (parseError: any) {
      console.error('❌ Failed to parse request:', parseError);
      return new Response(JSON.stringify({
        error: "Invalid request format",
        details: parseError instanceof Error ? parseError.message : "Unknown parse error"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log('📊 Workflow ID:', requestData.workflowId);
    console.log('👤 User ID:', requestData.userId || 'none');
    console.log('📄 PDF filename:', requestData.pdfFilename);
    console.log('🔗 Session ID:', requestData.sessionId || 'none');
    console.log('🔢 Group Order:', requestData.groupOrder || 'none');

    console.log('🔍 === FETCHING TYPE DETAILS ===');
    let typeDetails: any = null;
    let formatType = 'JSON';
    try {
      if (requestData.extractionTypeId) {
        console.log('📋 Fetching extraction type details for ID:', requestData.extractionTypeId);
        const extractionTypeResponse = await fetch(`${supabaseUrl}/rest/v1/extraction_types?id=eq.${requestData.extractionTypeId}`, {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        });
        if (extractionTypeResponse.ok) {
          const extractionTypes = await extractionTypeResponse.json();
          if (extractionTypes && extractionTypes.length > 0) {
            typeDetails = extractionTypes[0];
            formatType = typeDetails.format_type || 'JSON';
            console.log('✅ Extraction type details loaded, formatType:', formatType);
          }
        }
      } else if (requestData.transformationTypeId) {
        console.log('📋 Fetching transformation type details for ID:', requestData.transformationTypeId);
        const transformationTypeResponse = await fetch(`${supabaseUrl}/rest/v1/transformation_types?id=eq.${requestData.transformationTypeId}`, {
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        });
        if (transformationTypeResponse.ok) {
          const transformationTypes = await transformationTypeResponse.json();
          if (transformationTypes && transformationTypes.length > 0) {
            typeDetails = transformationTypes[0];
            formatType = typeDetails.format_type || 'JSON';
            console.log('✅ Transformation type details loaded');
          }
        }
      }
      console.log('📊 Type details loaded:', !!typeDetails);
      console.log('📊 Format type determined:', formatType);
    } catch (typeError) {
      console.error('❌ Failed to fetch type details:', typeError);
      console.log('⚠️ Continuing with default formatType: JSON');
    }

    console.log('📝 Creating extraction log entry...');
    try {
      const extractionLogResponse = await fetch(`${supabaseUrl}/rest/v1/extraction_logs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          user_id: requestData.userId || null,
          extraction_type_id: requestData.extractionTypeId || null,
          transformation_type_id: requestData.transformationTypeId || null,
          pdf_filename: requestData.originalPdfFilename,
          pdf_pages: requestData.pdfPages,
          extraction_status: 'success',
          extracted_data: requestData.extractedData || null,
          processing_mode: requestData.transformationTypeId ? 'transformation' : 'extraction',
          session_id: requestData.sessionId || null,
          group_order: requestData.groupOrder || null,
          created_at: new Date().toISOString()
        })
      });
      if (extractionLogResponse.ok) {
        const extractionLogData = await extractionLogResponse.json();
        extractionLogId = extractionLogData[0]?.id;
        console.log('✅ Extraction log created with ID:', extractionLogId);
      } else {
        console.error('❌ Failed to create extraction log:', extractionLogResponse.status);
      }
    } catch (logError) {
      console.error('❌ Error creating extraction log:', logError);
    }

    console.log('📝 Creating workflow execution log...');
    try {
      const workflowLogPayload = {
        extraction_log_id: extractionLogId,
        workflow_id: requestData.workflowId,
        status: 'running',
        context_data: {},
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      console.log('📝 Workflow log payload:', JSON.stringify(workflowLogPayload, null, 2));
      const workflowLogResponse = await fetch(`${supabaseUrl}/rest/v1/workflow_execution_logs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(workflowLogPayload)
      });
      console.log('📝 Workflow log response status:', workflowLogResponse.status);
      console.log('📝 Workflow log response ok:', workflowLogResponse.ok);
      if (workflowLogResponse.ok) {
        const responseText = await workflowLogResponse.text();
        console.log('📝 Workflow log response text:', responseText);
        if (responseText && responseText.trim() !== '') {
          try {
            const workflowLogData = JSON.parse(responseText);
            console.log('📝 Parsed workflow log data:', workflowLogData);
            workflowExecutionLogId = workflowLogData[0]?.id;
            console.log('✅ Workflow execution log created with ID:', workflowExecutionLogId);
          } catch (parseError) {
            console.error('❌ Failed to parse workflow log response:', parseError);
            console.error('📝 Raw response that failed to parse:', responseText);
            console.log('⚠️ Continuing without workflow execution log ID');
          }
        } else {
          console.log('⚠️ Empty response from workflow log creation - continuing without log ID');
        }
      } else {
        const errorText = await workflowLogResponse.text();
        console.error('❌ Failed to create workflow execution log:', workflowLogResponse.status, errorText);
        console.log('⚠️ Continuing without workflow execution log');
      }
    } catch (logError: any) {
      console.error('❌ Error creating workflow execution log:', logError);
      console.error('❌ Log error type:', logError.constructor.name);
      console.error('❌ Log error message:', logError.message);
      console.log('⚠️ Continuing without workflow execution log');
    }

    let extractedData: any = {};
    console.log('📁 === LOADING EXTRACTED DATA ===');
    if (requestData.extractedDataStoragePath) {
      console.log('📁 Loading from storage path:', requestData.extractedDataStoragePath);
      try {
        const storageUrl = `${supabaseUrl}/storage/v1/object/pdfs/${requestData.extractedDataStoragePath}`;
        console.log('📁 Storage URL:', storageUrl);
        const storageResponse = await fetch(storageUrl, {
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}` }
        });
        console.log('📁 Storage response status:', storageResponse.status);
        console.log('📁 Storage response ok:', storageResponse.ok);
        if (!storageResponse.ok) {
          const errorText = await storageResponse.text();
          console.error('📁 Storage fetch failed:', errorText);
          throw new Error(`Storage fetch failed: ${storageResponse.status} - ${errorText}`);
        }
        const storageText = await storageResponse.text();
        console.log('📁 Storage response length:', storageText.length);
        console.log('📁 Storage response preview (first 200):', storageText.substring(0, 200));
        console.log('📁 Storage response preview (last 100):', storageText.substring(Math.max(0, storageText.length - 100)));
        if (!storageText || storageText.trim() === '') {
          console.warn('⚠️ Storage file is empty, using empty object');
          extractedData = {};
        } else {
          console.log('📁 Attempting to parse storage content as JSON...');
          try {
            extractedData = JSON.parse(storageText);
            console.log('✅ Successfully parsed extracted data from storage');
            console.log('📊 Extracted data keys:', Object.keys(extractedData));
          } catch (storageParseError) {
            console.error('❌ Failed to parse storage JSON:', storageParseError);
            console.error('📁 Problematic content:', storageText);
            console.log('📁 Using empty object as fallback');
            extractedData = {};
          }
        }
      } catch (storageError) {
        console.error('❌ Storage loading error:', storageError);
        console.log('📁 Using empty object as fallback');
        extractedData = {};
      }
    } else if (requestData.extractedData) {
      console.log('📊 Processing extracted data from request...');
      console.log('📊 Format type:', formatType);
      try {
        if (typeof requestData.extractedData === 'string') {
          if (requestData.extractedData.trim() === '') {
            console.log('📊 Extracted data is empty string');
            extractedData = {};
          } else if (formatType === 'CSV') {
            console.log('📊 CSV format detected - keeping data as string');
            extractedData = requestData.extractedData;
            console.log('✅ CSV data preserved as string');
          } else {
            console.log('📊 Parsing extracted data string as JSON...');
            extractedData = JSON.parse(requestData.extractedData);
            console.log('✅ Parsed extracted data from request');
          }
        } else {
          console.log('📊 Using extracted data object directly');
          extractedData = requestData.extractedData || {};
        }
      } catch (parseError) {
        console.error('❌ Failed to parse extracted data:', parseError);
        if (formatType === 'CSV' && typeof requestData.extractedData === 'string') {
          console.log('📊 Parse failed but formatType is CSV - using raw string');
          extractedData = requestData.extractedData;
        } else {
          extractedData = {};
        }
      }
    } else {
      console.log('📊 No extracted data provided, using empty object');
      extractedData = {};
    }

    if (typeof extractedData === 'string') {
      console.log('📊 Final extracted data: CSV string with length', extractedData.length);
    } else {
      console.log('📊 Final extracted data keys:', Object.keys(extractedData));
    }

    console.log('📋 Fetching workflow steps...');
    const stepsResponse = await fetch(`${supabaseUrl}/rest/v1/workflow_steps?workflow_id=eq.${requestData.workflowId}&order=step_order.asc`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey
      }
    });
    if (!stepsResponse.ok) {
      throw new Error('Failed to fetch workflow steps');
    }
    const steps = await stepsResponse.json();
    console.log('📊 Found', steps.length, 'workflow steps');
    console.log('📊 DEBUG - All steps loaded:');
    steps.forEach((step: any, index: number) => {
      console.log(`  [${index}] Step ${step.step_order}: ${step.step_name} (type: ${step.step_type}, id: ${step.id})`);
    });
    if (steps.length === 0) {
      throw new Error('No steps found in workflow');
    }

    let contextData: any = {
      extractedData: extractedData,
      originalExtractedData: requestData.extractedData,
      formatType: formatType,
      pdfFilename: requestData.extractionTypeFilename || requestData.pdfFilename,
      originalPdfFilename: requestData.originalPdfFilename,
      extractionTypeFilename: requestData.pageGroupFilenameTemplate || typeDetails?.filename_template || requestData.extractionTypeFilename,
      pageGroupFilenameTemplate: requestData.pageGroupFilenameTemplate,
      pdfStoragePath: requestData.pdfStoragePath,
      pdfBase64: requestData.pdfBase64,
      userId: requestData.userId || null
    };

    if (formatType !== 'CSV' && typeof extractedData === 'object' && extractedData !== null) {
      contextData = { ...contextData, ...extractedData };
      console.log('📊 Context data merged with extracted data object');
    } else {
      console.log('📊 Context data created without spreading (CSV format or non-object data)');
    }

    if (requestData.sessionId && requestData.groupOrder && requestData.groupOrder > 1) {
      try {
        const currentPageIndex = requestData.pageIndex;
        let prevGroupQuery: string;
        if (currentPageIndex !== undefined && currentPageIndex !== null && currentPageIndex > 0) {
          prevGroupQuery = `${supabaseUrl}/rest/v1/extraction_group_data?session_id=eq.${requestData.sessionId}&page_index=eq.${currentPageIndex - 1}`;
          console.log(`🔗 Retrieving paired group data for session: ${requestData.sessionId}, page_index=${currentPageIndex - 1}`);
        } else {
          prevGroupQuery = `${supabaseUrl}/rest/v1/extraction_group_data?session_id=eq.${requestData.sessionId}&group_order=lt.${requestData.groupOrder}&order=group_order.asc`;
          console.log('🔗 Retrieving previous group data by group_order (legacy fallback) for session:', requestData.sessionId);
        }
        const prevGroupsResponse = await fetch(prevGroupQuery,
          {
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey
            }
          }
        );
        if (prevGroupsResponse.ok) {
          const prevGroups = await prevGroupsResponse.json();
          console.log(`✅ Found ${prevGroups.length} previous group record(s)`);
          for (const prevGroup of prevGroups) {
            const groupPrefix = `group${prevGroup.group_order}_`;
            const prevFields = prevGroup.extracted_fields || {};
            for (const [fieldName, fieldValue] of Object.entries(prevFields)) {
              const prefixedFieldName = `${groupPrefix}${fieldName}`;
              contextData[prefixedFieldName] = fieldValue;
              console.log(`  ✓ Added ${prefixedFieldName} = ${fieldValue}`);
            }
          }
          console.log(`✅ Context data now has ${Object.keys(contextData).length} total fields including previous groups`);
        } else {
          console.log('⚠️ No previous group data found or error fetching:', prevGroupsResponse.status);
        }
      } catch (prevGroupError) {
        console.error('❌ Failed to retrieve previous group data:', prevGroupError);
        console.log('⚠️ Continuing without previous group data');
      }
    }

    // === DIAGNOSTIC START: Context Initialization ===
    try {
      console.log('DIAGNOSTIC: CONTEXT INITIALIZATION');
      console.log('DIAGNOSTIC: contextData.extractedData exists:', !!contextData.extractedData);
      console.log('DIAGNOSTIC: contextData.orders exists:', !!contextData.orders);
      if (contextData.extractedData && contextData.orders) {
        const refCheck = contextData.extractedData.orders === contextData.orders;
        console.log('DIAGNOSTIC: Reference Check:', refCheck ? 'SAME' : 'DIFFERENT');
      }
      const clientIdFromOrders = getValueByPath(contextData, 'orders[0].consignee.clientId');
      const clientIdFromExtracted = getValueByPath(contextData, 'extractedData.orders[0].consignee.clientId');
      console.log('DIAGNOSTIC: Initial contextData.orders[0]?.consignee?.clientId:', clientIdFromOrders);
      console.log('DIAGNOSTIC: Initial contextData.extractedData?.orders?.[0]?.consignee?.clientId:', clientIdFromExtracted);
    } catch (e) {
      console.error('DIAGNOSTIC ERROR: Context Initialization', e);
    }
    // === DIAGNOSTIC END: Context Initialization ===

    console.log('🔄 Starting workflow execution with', steps.length, 'steps...');
    console.log('🔄 DEBUG - About to enter for loop from i=0 to i=' + (steps.length - 1));
    let lastApiResponse: any = null;

    for (let i = 0; i < steps.length; i++) {
      console.log(`\n🔄 DEBUG - Loop iteration i=${i}, processing step at index ${i}`);
      const step = steps[i];
      console.log(`🔄 DEBUG - Retrieved step object: order=${step.step_order}, name=${step.step_name}, type=${step.step_type}`);

      const stepStartTime = new Date().toISOString();
      const stepStartMs = Date.now();
      console.log(`🔄 === EXECUTING STEP ${step.step_order}: ${step.step_name} ===`);
      console.log('🔧 Step type:', step.step_type);
      console.log('🔧 Step ID:', step.id);

      try {
        await updateWorkflowExecutionLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId!, {
          current_step_id: step.id,
          current_step_name: step.step_name,
          context_data: contextData,
          updated_at: new Date().toISOString()
        });
      } catch (updateError) {
        console.warn('⚠️ Failed to update workflow log:', updateError);
      }

      let stepOutputData: any = null;

      try {
        const config = step.config_json || {};

        let shouldSkipStep = false;
        let skipReason = '';
        if (config.skipIf) {
          console.log('🔍 Checking skipIf condition:', config.skipIf);
          const conditionResult = getValueByPath(contextData, config.skipIf);
          console.log('🔍 skipIf condition result:', conditionResult);
          if (conditionResult === true) {
            shouldSkipStep = true;
            skipReason = `skipIf condition met: ${config.skipIf} = true`;
            console.log(`⏭️ Skipping step ${step.step_order} (${step.step_name}): ${skipReason}`);
          }
        }
        if (!shouldSkipStep && config.runIf) {
          console.log('🔍 Checking runIf condition:', config.runIf);
          const conditionResult = getValueByPath(contextData, config.runIf);
          console.log('🔍 runIf condition result:', conditionResult);
          if (conditionResult !== true) {
            shouldSkipStep = true;
            skipReason = `runIf condition not met: ${config.runIf} = ${conditionResult}`;
            console.log(`⏭️ Skipping step ${step.step_order} (${step.step_name}): ${skipReason}`);
          }
        }

        if (shouldSkipStep) {
          stepOutputData = { skipped: true, reason: skipReason, conditionalSkip: true };
          const stepEndTime = new Date().toISOString();
          const stepDurationMs = Date.now() - stepStartMs;
          console.log(`⏭️ Step ${step.step_order} skipped due to conditional logic in ${stepDurationMs}ms`);
          if (workflowExecutionLogId) {
            await createStepLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId, requestData.workflowId, step, 'skipped', stepStartTime, stepEndTime, stepDurationMs, skipReason, { config: step.config_json }, stepOutputData);
          }
          console.log(`✅ DEBUG - Completed iteration i=${i} for step ${step.step_order}. Moving to next iteration.`);
          continue;
        }

        if (step.step_type === 'api_call') {
          const result = await executeApiCall(step, contextData);
          lastApiResponse = result.responseData;
          stepOutputData = result.stepOutput;

        } else if (step.step_type === 'api_endpoint') {
          const result = await executeApiEndpoint(step, contextData, supabaseUrl, supabaseServiceKey);
          lastApiResponse = result.responseData;
          stepOutputData = result.stepOutput;

        } else if (step.step_type === 'rename_file' || step.step_type === 'rename_pdf') {
          stepOutputData = executeRename(step, contextData, lastApiResponse, formatType);

        } else if (step.step_type === 'sftp_upload') {
          stepOutputData = await executeSftpUpload(step, contextData, supabaseUrl, supabaseServiceKey, formatType);

        } else if (step.step_type === 'email_action') {
          stepOutputData = await executeEmailAction(step, contextData, supabaseUrl, supabaseServiceKey);

        } else if (step.step_type === 'conditional_check') {
          stepOutputData = executeConditionalCheck(step, contextData, steps);
          if (stepOutputData.selectedNextStepOrder && stepOutputData.selectedNextStepOrder !== step.step_order + 1) {
            console.log(`🔀 CONDITIONAL ROUTING: Jumping from Step ${step.step_order} to Step ${stepOutputData.selectedNextStepOrder}`);
            const targetStepIndex = steps.findIndex((s: any) => s.step_order === stepOutputData.selectedNextStepOrder);
            if (targetStepIndex !== -1) {
              console.log(`✅ Target step found at index ${targetStepIndex}, adjusting loop counter`);
              i = targetStepIndex - 1;
            } else {
              console.log(`❌ Target step ${stepOutputData.selectedNextStepOrder} not found, continuing sequentially`);
            }
          }

        } else if (step.step_type === 'multipart_form_upload') {
          stepOutputData = await executeMultipartFormUpload(step, contextData, supabaseUrl, supabaseServiceKey);

        } else {
          console.log(`⚠️ Unknown step type: ${step.step_type}`);
          stepOutputData = { skipped: true, reason: 'Step type not implemented' };
        }

        const stepEndTime = new Date().toISOString();
        const stepDurationMs = Date.now() - stepStartMs;
        console.log(`✅ === STEP ${step.step_order} COMPLETED SUCCESSFULLY IN ${stepDurationMs}ms ===`);

        console.log('📊 === FINAL CONTEXT DATA SNAPSHOT ===');
        console.log('📊 contextData keys:', Object.keys(contextData));
        console.log('📊 Full contextData:', JSON.stringify(contextData, null, 2));
        if (step.step_type === 'api_call') {
          console.log('📊 Last API response:', JSON.stringify(lastApiResponse, null, 2));
        }
        if (step.step_type === 'api_endpoint') {
          console.log('📊 Last API Endpoint response:', JSON.stringify(lastApiResponse, null, 2));
        }
        console.log('📊 === END CONTEXT DATA SNAPSHOT ===');

        if (workflowExecutionLogId) {
          await createStepLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId, requestData.workflowId, step, 'completed', stepStartTime, stepEndTime, stepDurationMs, undefined, { config: step.config_json }, stepOutputData);
        }

      } catch (stepError: any) {
        const stepEndTime = new Date().toISOString();
        const stepDurationMs = Date.now() - stepStartMs;
        console.error(`❌ Step ${step.step_order} failed:`, stepError);

        if (workflowExecutionLogId) {
          const errorOutputData = (step.step_type === 'api_endpoint' && stepError.outputData) ? stepError.outputData : stepOutputData;
          await createStepLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId, requestData.workflowId, step, 'failed', stepStartTime, stepEndTime, stepDurationMs, stepError.message, { config: step.config_json }, errorOutputData);

          await updateWorkflowExecutionLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId, {
            status: 'failed',
            error_message: stepError.message,
            context_data: contextData,
            updated_at: new Date().toISOString()
          });
        }

        const error: any = new Error(stepError.message);
        error.workflowExecutionLogId = workflowExecutionLogId;
        error.extractionLogId = extractionLogId;
        console.log(`🚫 DEBUG - Step ${step.step_order} failed, throwing error and stopping workflow`);
        throw error;
      }

      console.log(`✅ DEBUG - Completed iteration i=${i} for step ${step.step_order}. Moving to next iteration.`);
    }

    console.log(`✅ DEBUG - Exited for loop. Total iterations should have been: ${steps.length}`);
    console.log('✅ === WORKFLOW EXECUTION COMPLETED ===');

    if (workflowExecutionLogId) {
      await updateWorkflowExecutionLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId, {
        status: 'completed',
        context_data: contextData,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    console.log('🎉 Workflow execution completed successfully');
    return new Response(JSON.stringify({
      success: true,
      message: 'Workflow executed successfully',
      workflowExecutionLogId: workflowExecutionLogId,
      extractionLogId: extractionLogId,
      finalData: contextData,
      lastApiResponse: lastApiResponse,
      actualFilename: contextData.actualFilename || contextData.renamedFilename
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("❌ === WORKFLOW EXECUTION ERROR ===");
    console.error("❌ Error type:", error.constructor.name);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);

    if (workflowExecutionLogId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        await updateWorkflowExecutionLog(supabaseUrl, supabaseServiceKey, workflowExecutionLogId, {
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString()
        });
      } catch (updateError) {
        console.error('❌ Failed to update workflow log with error:', updateError);
      }
    }

    return new Response(JSON.stringify({
      error: "Workflow execution failed",
      details: error instanceof Error ? error.message : "Unknown error",
      workflowExecutionLogId: workflowExecutionLogId,
      extractionLogId: extractionLogId
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
