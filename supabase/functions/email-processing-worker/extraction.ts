import { getActiveModelName, getActiveGeminiApiKey } from './config.ts';
import {
  GeminiService,
  parseFieldMappings,
  parseArraySplitConfigs,
  parseArrayEntryConfigs,
} from './lib/services/gemini.ts';
import { LoggingService } from './lib/services/logging.ts';
import { executeWorkflowForEmail } from './lib/services/workflow.ts';
import { splitPdfIntoPages } from './lib/pdf.ts';
import {
  evaluateFunction,
  evaluateAddressLookupAsync,
  type FunctionLogic,
} from './lib/functionEvaluator.ts';
import type { ExtractionType } from './types.ts';

interface QueueRowLike {
  id: string;
  extraction_type_id: string | null;
  original_filename: string | null;
  email_from: string | null;
  page_count: number | null;
}

export interface ExtractionRunResult {
  success: boolean;
  error?: string | null;
  extractionLogId?: string | null;
  pagesProcessed: number;
  pagesFailed: number;
}

export async function runExtraction(
  supabase: any,
  row: QueueRowLike,
  pdfBase64: string
): Promise<ExtractionRunResult> {
  if (!row.extraction_type_id) {
    throw new Error('extraction mode row missing extraction_type_id');
  }

  const { data: extractionType, error: etErr } = await supabase
    .from('extraction_types')
    .select(`
      *,
      extraction_type_array_splits(*),
      extraction_type_array_entries(*, extraction_type_array_entry_fields(*))
    `)
    .eq('id', row.extraction_type_id)
    .maybeSingle();

  if (etErr) throw new Error(`Failed to load extraction_type: ${etErr.message}`);
  if (!extractionType) throw new Error(`Extraction type ${row.extraction_type_id} not found`);

  const typedExtractionType = extractionType as ExtractionType;
  const filename = row.original_filename || 'attachment.pdf';
  const senderEmail = row.email_from || '';

  const geminiApiKey = await getActiveGeminiApiKey(supabase);
  if (!geminiApiKey) {
    throw new Error('No active Gemini API key configured. Set one in Settings -> Gemini Configuration.');
  }

  const modelName = await getActiveModelName(supabase);
  const gemini = new GeminiService(geminiApiKey, modelName);
  const logger = new LoggingService(supabase);

  const splitPages = await splitPdfIntoPages({ filename, base64: pdfBase64 }, typedExtractionType);

  let lastExtractionLogId: string | null = null;
  let pagesProcessed = 0;
  let pagesFailed = 0;
  let lastError: string | null = null;

  for (const pageData of splitPages) {
    const pageResult = await processPage(
      supabase,
      logger,
      gemini,
      geminiApiKey,
      typedExtractionType,
      pageData,
      senderEmail
    );

    if (pageResult.success) {
      pagesProcessed++;
      lastExtractionLogId = pageResult.extractionLogId;
    } else {
      pagesFailed++;
      lastError = pageResult.error || 'Unknown extraction error';
      lastExtractionLogId = pageResult.extractionLogId || lastExtractionLogId;
    }
  }

  return {
    success: pagesProcessed > 0 && pagesFailed === 0,
    error: pagesFailed > 0 ? lastError : null,
    extractionLogId: lastExtractionLogId,
    pagesProcessed,
    pagesFailed,
  };
}

async function processPage(
  supabase: any,
  logger: LoggingService,
  gemini: GeminiService,
  geminiApiKey: string,
  extractionType: ExtractionType,
  pageData: { filename: string; base64: string; pageNumber: number; originalFilename: string },
  senderEmail: string
): Promise<{ success: boolean; error?: string; extractionLogId: string | null }> {
  let extractionLogId: string | null = null;

  try {
    extractionLogId = await logger.createExtractionLog(extractionType.id, pageData.filename);

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

        const functionMappings = (parsedMappings || []).filter(
          (m: any) => m.type === 'function' && m.functionId
        );

        if (functionMappings.length > 0) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          const functionIds = [...new Set(functionMappings.map((m: any) => m.functionId))];
          const idsParam = functionIds.map((id: string) => `"${id}"`).join(',');
          const fnResp = await fetch(
            `${supabaseUrl}/rest/v1/field_mapping_functions?id=in.(${idsParam})`,
            {
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                apikey: supabaseServiceKey,
              },
            }
          );

          if (fnResp.ok) {
            const functions: any[] = await fnResp.json();
            const hasAddressLookup = functions.some(
              (f: any) => f.function_logic?.type === 'address_lookup'
            );

            const setFieldValue = (obj: any, fieldPath: string, value: any) => {
              const parts = fieldPath.split('.');
              let current = obj;
              for (let i = 0; i < parts.length - 1; i++) {
                if (current[parts[i]] === undefined) current[parts[i]] = {};
                if (Array.isArray(current[parts[i]])) {
                  const remainingPath = parts.slice(i + 1).join('.');
                  current[parts[i]].forEach((item: any) =>
                    setFieldValue(item, remainingPath, value)
                  );
                  return;
                }
                current = current[parts[i]];
              }
              current[parts[parts.length - 1]] = value;
            };

            const extractedData = JSON.parse(extractionResult.extractedContent);
            const orders = Array.isArray(extractedData.orders)
              ? extractedData.orders
              : [extractedData];
            for (const order of orders) {
              for (const mapping of functionMappings) {
                const func = functions.find((f: any) => f.id === mapping.functionId);
                if (func?.function_logic) {
                  let result: any;
                  if (
                    func.function_logic.type === 'address_lookup' &&
                    hasAddressLookup &&
                    geminiApiKey
                  ) {
                    result = await evaluateAddressLookupAsync(
                      func.function_logic,
                      order,
                      geminiApiKey
                    );
                  } else {
                    result = evaluateFunction(func.function_logic as FunctionLogic, order);
                  }
                  if (result !== undefined && result !== '') {
                    setFieldValue(order, mapping.fieldName, result);
                  }
                }
              }
            }
            extractionResult.extractedContent = JSON.stringify(extractedData, null, 2);
          }
        }
      } catch (fnError) {
        console.warn('[WORKER-EXTRACT] Function evaluation (non-fatal):', (fnError as Error).message);
      }
    }

    const useV2Workflow =
      extractionType.workflow_version === 'v2' && extractionType.workflow_v2_id;
    const activeWorkflowId = useV2Workflow
      ? extractionType.workflow_v2_id!
      : extractionType.workflow_id;

    if (!activeWorkflowId) {
      throw new Error(
        'Extraction type has no workflow assigned. Direct SFTP/API delivery from the queue worker is not supported yet — assign a workflow to this extraction type.'
      );
    }

    const workflowResult = await executeWorkflowForEmail(
      activeWorkflowId,
      extractionResult.extractedContent,
      extractionType,
      { filename: pageData.filename, base64: pageData.base64 },
      1,
      supabase,
      senderEmail,
      extractionLogId,
      extractionResult.workflowOnlyData,
      useV2Workflow ? 'v2' : 'v1'
    );

    await logger.updateExtractionLog(extractionLogId, {
      extracted_data: extractionResult.extractedContent,
      api_response: workflowResult.lastApiResponse
        ? JSON.stringify(workflowResult.lastApiResponse)
        : null,
      extraction_status: workflowResult.success ? 'success' : 'failed',
      error_message: workflowResult.error || null,
    });

    if (!workflowResult.success) {
      throw new Error(workflowResult.error || 'Workflow execution failed');
    }

    return { success: true, extractionLogId };
  } catch (processError) {
    const msg = (processError as Error).message || 'Unknown extraction error';
    console.error('[WORKER-EXTRACT] Page failed:', msg);

    if (extractionLogId) {
      try {
        await logger.updateExtractionLog(extractionLogId, {
          extraction_status: 'failed',
          error_message: msg,
        });
      } catch (updErr) {
        console.warn('[WORKER-EXTRACT] Failed to update extraction log:', (updErr as Error).message);
      }
    }

    return { success: false, error: msg, extractionLogId };
  }
}
