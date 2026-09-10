import { getActiveModelName, getSupabaseUrl, getSupabaseServiceKey } from '../../config.ts';
import { EmailProvider, getPostProcessAction } from '../services/email-base.ts';
import { GeminiService, parseFieldMappings, parseArraySplitConfigs, parseArrayEntryConfigs } from '../services/gemini.ts';
import { LoggingService } from '../services/logging.ts';
import { executeWorkflowForEmail, uploadToSftp, sendToDirectApi, getParseitId } from '../services/workflow.ts';
import { splitPdfIntoPages } from '../pdf.ts';
import { injectParseitId } from '../utils.ts';
import { evaluateFunction, evaluateAddressLookupAsync, type FunctionLogic } from '../functionEvaluator.ts';
import type {
  PdfAttachment,
  ExtractionType,
  SftpConfig,
  ApiConfig,
  ProcessingRule,
  EmailMonitoringConfig,
  ProcessEmailResult,
  AttachmentProcessResult,
} from '../../types.ts';

export async function handleExtractionMode(
  emailId: string,
  provider: EmailProvider,
  matchingRule: ProcessingRule,
  fromEmail: string,
  subject: string,
  receivedDate: string,
  sftpConfig: SftpConfig | null,
  apiConfig: ApiConfig | null,
  geminiApiKey: string,
  supabase: any,
  logger: LoggingService,
  config: EmailMonitoringConfig
): Promise<ProcessEmailResult> {
  let attachments: PdfAttachment[] = [];
  let parseitId: number | null = null;
  let processedSuccessfully = false;
  let errorMessage: string | null = null;
  let extractionLogId: string | null = null;

  try {
    attachments = await provider.findPdfAttachments(emailId);
    console.log('PDF attachment detection result:', {
      attachmentCount: attachments.length,
      filenames: attachments.map(att => att.filename)
    });

    if (attachments.length === 0) {
      console.log('No PDF attachments found, applying post-process action to clear from queue');
      const { action, folderPath } = getPostProcessAction(config, 'failure');
      await provider.applyPostProcessAction(emailId, action, folderPath);
      return buildResult(emailId, fromEmail, subject, receivedDate, false, 'No PDF attachments found', null, [], matchingRule, null);
    }

    console.log('Found', attachments.length, 'PDF attachments');

    const extractionType = matchingRule.extraction_types as ExtractionType | null;
    console.log('Extraction type check:', {
      extractionTypeFound: !!extractionType,
      extractionTypeName: extractionType?.name || 'None',
      extractionTypeId: extractionType?.id || 'None'
    });

    if (!extractionType) {
      console.error('Extraction type not found for rule:', matchingRule.rule_name);
      return buildResult(emailId, fromEmail, subject, receivedDate, false, `Extraction type not found for rule: ${matchingRule.rule_name}`, null, attachments, matchingRule, null);
    }

    const loopStart = Date.now();
    console.log(`[EXTRACTION] Starting attachment loop: ${attachments.length} attachment(s) for emailId=${emailId}`);
    let attIdx = 0;
    for (const attachment of attachments) {
      attIdx++;
      const attStart = Date.now();
      console.log(`[EXTRACTION] Attachment ${attIdx}/${attachments.length} START filename="${attachment.filename}" emailId=${emailId}`);
      let pageResult: AttachmentProcessResult;
      try {
        pageResult = await processAttachment(
          attachment,
          extractionType,
          geminiApiKey,
          sftpConfig,
          apiConfig,
          supabase,
          logger,
          fromEmail,
          provider,
          emailId,
          config
        );
      } catch (attErr) {
        console.error(`[EXTRACTION] Attachment ${attIdx}/${attachments.length} THREW after ${Date.now() - attStart}ms:`, (attErr as Error).message);
        pageResult = { success: false, extractionLogId: null, parseitId: null, error: (attErr as Error).message };
      }
      console.log(`[EXTRACTION] Attachment ${attIdx}/${attachments.length} END filename="${attachment.filename}" success=${pageResult.success} elapsedMs=${Date.now() - attStart}`);

      if (pageResult.success) {
        processedSuccessfully = true;
        extractionLogId = pageResult.extractionLogId;
        parseitId = pageResult.parseitId;
      } else {
        errorMessage = pageResult.error || 'Unknown processing error';
      }
    }
    console.log(`[EXTRACTION] Attachment loop DONE totalElapsedMs=${Date.now() - loopStart} processedSuccessfully=${processedSuccessfully} errorMessage=${errorMessage}`);

  } catch (emailError) {
    console.error('Error in extraction handler:', emailError);
    errorMessage = (emailError as Error).message || 'Unknown extraction error';
  }

  const postProcessStatus = processedSuccessfully ? 'success' : 'failure';
  const { action: ppAction, folderPath: ppFolder } = getPostProcessAction(config, postProcessStatus);
  console.log(`[POST_PROCESS] PRE-CALL status=${postProcessStatus} action=${ppAction} folder=${ppFolder} emailId=${emailId}`);
  const ppStart = Date.now();
  try {
    await provider.applyPostProcessAction(emailId, ppAction, ppFolder);
    console.log(`[POST_PROCESS] POST-CALL returned normally elapsedMs=${Date.now() - ppStart} emailId=${emailId}`);
  } catch (ppErr) {
    console.error(`[POST_PROCESS] POST-CALL THREW elapsedMs=${Date.now() - ppStart} emailId=${emailId}:`, (ppErr as Error).message);
  }

  return buildResult(
    emailId,
    fromEmail,
    subject,
    receivedDate,
    processedSuccessfully,
    errorMessage,
    extractionLogId,
    attachments,
    matchingRule,
    parseitId
  );
}

async function processAttachment(
  attachment: PdfAttachment,
  extractionType: ExtractionType,
  geminiApiKey: string,
  sftpConfig: SftpConfig | null,
  apiConfig: ApiConfig | null,
  supabase: any,
  logger: LoggingService,
  fromEmail: string,
  provider: EmailProvider,
  emailId: string,
  config: EmailMonitoringConfig
): Promise<AttachmentProcessResult> {
  console.log('Starting to process PDF attachment:', {
    filename: attachment.filename,
    sizeKB: Math.round(attachment.base64.length * 0.75 / 1024),
    extractionType: extractionType.name
  });

  const splitPages = await splitPdfIntoPages(attachment, extractionType);
  console.log(`PDF split into ${splitPages.length} page(s) for processing`);

  let lastExtractedLogId: string | null = null;
  let lastParseitId: number | null = null;
  let overallSuccess = false;
  let lastError: string | undefined;

  for (const pageData of splitPages) {
    const pageResult = await processPage(
      pageData,
      extractionType,
      geminiApiKey,
      sftpConfig,
      apiConfig,
      supabase,
      logger,
      fromEmail,
      provider,
      emailId,
      config
    );

    if (pageResult.success) {
      overallSuccess = true;
      lastExtractedLogId = pageResult.extractionLogId;
      lastParseitId = pageResult.parseitId;
    } else {
      lastError = pageResult.error;
    }
  }

  return {
    success: overallSuccess,
    extractionLogId: lastExtractedLogId,
    parseitId: lastParseitId,
    error: lastError
  };
}

async function processPage(
  pageData: { filename: string; base64: string; pageNumber: number; originalFilename: string },
  extractionType: ExtractionType,
  geminiApiKey: string,
  sftpConfig: SftpConfig | null,
  apiConfig: ApiConfig | null,
  supabase: any,
  logger: LoggingService,
  fromEmail: string,
  provider: EmailProvider,
  emailId: string,
  config: EmailMonitoringConfig
): Promise<AttachmentProcessResult> {
  let extractionLogId: string | null = null;
  let parseitId: number | null = null;

  try {
    extractionLogId = await logger.createExtractionLog(extractionType.id, pageData.filename);

    const modelName = await getActiveModelName(supabase);
    const gemini = new GeminiService(geminiApiKey, modelName);

    const fieldMappings = parseFieldMappings(extractionType);
    const arraySplitConfigs = parseArraySplitConfigs(extractionType);
    const arrayEntryConfigs = parseArrayEntryConfigs(extractionType);

    const extractionResult = await gemini.extractDataFromPdf(
      pageData.base64,
      extractionType,
      fieldMappings,
      arraySplitConfigs,
      arrayEntryConfigs
    );

    if (!extractionResult.isValid) {
      throw new Error(extractionResult.error || 'Extraction failed');
    }

    const isJsonFormat = extractionType.format_type === 'JSON';

    if (isJsonFormat && extractionType.field_mappings) {
      try {
        const parsedMappings = typeof extractionType.field_mappings === 'string'
          ? JSON.parse(extractionType.field_mappings)
          : extractionType.field_mappings;

        const functionMappings = (parsedMappings || []).filter((m: any) => m.type === 'function' && m.functionId);

        if (functionMappings.length > 0) {
          console.log(`[FunctionEval] Found ${functionMappings.length} function-type field mappings to evaluate`);

          const supabaseUrl = getSupabaseUrl();
          const supabaseServiceKey = getSupabaseServiceKey();
          const functionIds = [...new Set(functionMappings.map((m: any) => m.functionId))];
          const idsParam = functionIds.map((id: string) => `"${id}"`).join(',');
          const fnResp = await fetch(
            `${supabaseUrl}/rest/v1/field_mapping_functions?id=in.(${idsParam})`,
            { headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey } }
          );

          if (fnResp.ok) {
            const functions: any[] = await fnResp.json();
            console.log(`[FunctionEval] Loaded ${functions.length} function definitions`);

            const hasAddressLookup = functions.some((f: any) => f.function_logic?.type === 'address_lookup');

            const setFieldValue = (obj: any, fieldPath: string, value: any) => {
              const parts = fieldPath.split('.');
              let current = obj;
              for (let i = 0; i < parts.length - 1; i++) {
                if (current[parts[i]] === undefined) current[parts[i]] = {};
                if (Array.isArray(current[parts[i]])) {
                  const remainingPath = parts.slice(i + 1).join('.');
                  current[parts[i]].forEach((item: any) => setFieldValue(item, remainingPath, value));
                  return;
                }
                current = current[parts[i]];
              }
              current[parts[parts.length - 1]] = value;
            };

            let extractedData = JSON.parse(extractionResult.extractedContent);
            const orders = Array.isArray(extractedData.orders) ? extractedData.orders : [extractedData];
            for (const order of orders) {
              for (const mapping of functionMappings) {
                const func = functions.find((f: any) => f.id === mapping.functionId);
                if (func?.function_logic) {
                  let result: any;
                  if (func.function_logic.type === 'address_lookup' && hasAddressLookup && geminiApiKey) {
                    result = await evaluateAddressLookupAsync(func.function_logic, order, geminiApiKey);
                  } else {
                    result = evaluateFunction(func.function_logic as FunctionLogic, order);
                  }
                  if (result !== undefined && result !== '') {
                    setFieldValue(order, mapping.fieldName, result);
                    console.log(`[FunctionEval] "${func.function_name}" -> ${mapping.fieldName} = ${JSON.stringify(result)}`);
                  }
                }
              }
            }
            extractionResult.extractedContent = JSON.stringify(extractedData, null, 2);
            console.log('[FunctionEval] Function evaluation complete');
          }
        }
      } catch (fnError) {
        console.error('[FunctionEval] Function evaluation error (non-fatal):', fnError);
      }
    }

    let finalDataToSend = extractionResult.extractedContent;

    const useV2Workflow = extractionType.workflow_version === 'v2' && extractionType.workflow_v2_id;
    const activeWorkflowId = useV2Workflow ? extractionType.workflow_v2_id! : extractionType.workflow_id;

    if (activeWorkflowId) {
      console.log(`Workflow assigned to extraction type (${useV2Workflow ? 'v2' : 'v1'}), executing workflow:`, activeWorkflowId);

      const pageAttachment = { filename: pageData.filename, base64: pageData.base64 };
      const workflowResult = await executeWorkflowForEmail(
        activeWorkflowId,
        extractionResult.extractedContent,
        extractionType,
        pageAttachment,
        1,
        supabase,
        fromEmail,
        extractionLogId,
        extractionResult.workflowOnlyData,
        useV2Workflow ? 'v2' : 'v1'
      );

      await logger.updateExtractionLog(extractionLogId, {
        extracted_data: extractionResult.extractedContent,
        api_response: workflowResult.lastApiResponse ? JSON.stringify(workflowResult.lastApiResponse) : null,
        extraction_status: workflowResult.success ? 'success' : 'failed',
        error_message: workflowResult.error || null
      });

      if (!workflowResult.success) {
        throw new Error(workflowResult.error || 'Workflow execution failed');
      }

      console.log('Email attachment processed successfully via workflow');
    } else if (isJsonFormat) {
      console.log('No workflow assigned, using direct API/SFTP processing');

      parseitId = await getParseitId(supabase);

      if (extractionType.parseit_id_mapping && parseitId) {
        finalDataToSend = JSON.stringify(
          injectParseitId(JSON.parse(extractionResult.extractedContent), extractionType.parseit_id_mapping, parseitId),
          null,
          2
        );
      }

      if (!apiConfig || !apiConfig.path || !extractionType.json_path) {
        throw new Error('API configuration incomplete for JSON extraction');
      }

      const apiResult = await sendToDirectApi(extractionResult.extractedContent, extractionType, apiConfig, supabase);

      await logger.updateExtractionLog(extractionLogId, {
        api_response: JSON.stringify(apiResult.response),
        api_status_code: apiResult.statusCode,
        extracted_data: finalDataToSend,
        extraction_status: 'success'
      });

      if (sftpConfig) {
        await uploadToSftp(sftpConfig, pageData.base64, pageData.filename, extractionType.filename, extractionType.id, null, parseitId, supabase);
        console.log('PDF uploaded to SFTP for JSON type');
      } else {
        console.warn('SFTP config missing, skipping PDF upload for JSON type');
      }

      console.log('Email attachment processed successfully via direct API');
    } else {
      console.log('No workflow assigned, using direct SFTP processing for XML');

      if (!sftpConfig) {
        throw new Error('SFTP configuration incomplete for XML extraction');
      }

      finalDataToSend = extractionResult.extractedContent.replace(/{{PARSEIT_ID_PLACEHOLDER}}/g, (parseitId || '').toString());

      await uploadToSftp(sftpConfig, pageData.base64, pageData.filename, extractionType.filename, extractionType.id, finalDataToSend, null, supabase);
      console.log('XML and PDF uploaded to SFTP');

      await logger.updateExtractionLog(extractionLogId, {
        extracted_data: finalDataToSend,
        extraction_status: 'success'
      });

      console.log('Email attachment processed successfully via direct SFTP');
    }

    return {
      success: true,
      extractionLogId,
      parseitId
    };

  } catch (processError) {
    console.error('Error processing page:', processError);

    if (extractionLogId) {
      await logger.updateExtractionLog(extractionLogId, {
        extraction_status: 'failed',
        error_message: (processError as Error).message
      });
    }

    return {
      success: false,
      extractionLogId,
      parseitId: null,
      error: (processError as Error).message
    };
  }
}

function buildResult(
  id: string,
  from: string,
  subject: string,
  receivedDate: string,
  processedSuccessfully: boolean,
  errorMessage: string | null,
  extractionLogId: string | null,
  attachments: PdfAttachment[],
  matchingRule: ProcessingRule | null,
  parseitId: number | null
): ProcessEmailResult {
  return {
    emailResult: {
      id,
      from,
      subject,
      receivedDate,
      processedSuccessfully,
      errorMessage,
      extractionLogId,
      rule: matchingRule ? (matchingRule.rule_name || matchingRule.id || 'Matched (unnamed rule)') : 'No rule matched'
    },
    attachments,
    matchingRule,
    parseitId
  };
}
