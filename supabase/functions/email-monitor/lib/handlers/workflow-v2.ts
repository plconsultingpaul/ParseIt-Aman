import { getSupabaseUrl, getSupabaseServiceKey } from '../../config.ts';
import { EmailProvider, getPostProcessAction } from '../services/email-base.ts';
import { LoggingService } from '../services/logging.ts';
import type {
  ProcessingRule,
  EmailMonitoringConfig,
  ProcessEmailResult,
} from '../../types.ts';

export async function handleWorkflowV2Mode(
  emailId: string,
  provider: EmailProvider,
  matchingRule: ProcessingRule,
  fromEmail: string,
  subject: string,
  receivedDate: string,
  supabase: any,
  logger: LoggingService,
  config: EmailMonitoringConfig
): Promise<ProcessEmailResult> {
  let processedSuccessfully = false;
  let errorMessage: string | null = null;
  let extractionLogId: string | null = null;

  try {
    console.log('Processing via Workflow V2:', matchingRule.workflow_v2_id);

    const emailBody = await provider.getEmailBody(emailId);
    console.log('Email body retrieved, length:', emailBody.length);

    const attachments = await provider.findPdfAttachments(emailId);
    console.log('PDF attachments found:', attachments.length);

    const supabaseUrl = getSupabaseUrl();
    const supabaseServiceKey = getSupabaseServiceKey();

    let workflowType = 'extraction';
    try {
      const wtResp = await fetch(`${supabaseUrl}/rest/v1/workflows_v2?id=eq.${matchingRule.workflow_v2_id}&select=workflow_type`, {
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', 'apikey': supabaseServiceKey }
      });
      if (wtResp.ok) {
        const wtData = await wtResp.json();
        if (wtData && wtData.length > 0 && wtData[0].workflow_type) {
          workflowType = wtData[0].workflow_type;
        }
      }
    } catch (wtError) {
      console.error('Failed to fetch workflow type, defaulting to extraction:', wtError);
    }
    console.log('Workflow V2 type resolved:', workflowType);

    let processorEndpoint = 'json-workflow-processor-v2';
    let processingMode = 'extraction';
    if (workflowType === 'transformation') {
      processorEndpoint = 'transform-workflow-processor-v2';
      processingMode = 'transformation';
    } else if (workflowType === 'imaging') {
      processingMode = 'imaging';
    }

    const firstAttachment = attachments.length > 0 ? attachments[0] : null;

    const v2Payload = {
      workflowId: matchingRule.workflow_v2_id,
      userId: null,
      pdfFilename: firstAttachment?.filename || null,
      originalPdfFilename: firstAttachment?.filename || null,
      pdfBase64: firstAttachment?.base64 || null,
      extractedData: {},
      processingMode: processingMode,
      triggerSource: 'email_monitoring',
      senderEmail: fromEmail,
      contextData: {
        emailSubject: subject,
        emailBody: emailBody,
        emailFrom: fromEmail,
        emailDate: receivedDate,
        pdfBase64: firstAttachment?.base64 || null,
        pdfFilename: firstAttachment?.filename || null,
        originalPdfFilename: firstAttachment?.filename || null,
        extractedData: {}
      }
    };

    console.log('Routing to processor:', processorEndpoint, 'with mode:', processingMode);
    const v2Resp = await fetch(`${supabaseUrl}/functions/v1/${processorEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(v2Payload)
    });

    const v2Result = await v2Resp.json();
    console.log('Workflow V2 result:', { success: v2Result.success, error: v2Result.error });

    if (v2Result.success) {
      processedSuccessfully = true;
      extractionLogId = v2Result.extractionLogId || null;
    } else {
      errorMessage = v2Result.error || v2Result.details || 'Workflow V2 execution failed';
    }

  } catch (error) {
    console.error('Error in workflow v2 handler:', error);
    errorMessage = (error as Error).message || 'Unknown workflow v2 error';
  }

  const postProcessResult = processedSuccessfully ? 'success' : 'failure';
  const { action, folderPath } = getPostProcessAction(config, postProcessResult as 'success' | 'failure');
  await provider.applyPostProcessAction(emailId, action, folderPath);

  return {
    emailResult: {
      id: emailId,
      from: fromEmail,
      subject,
      receivedDate,
      processedSuccessfully,
      errorMessage,
      extractionLogId,
      rule: matchingRule.rule_name || matchingRule.id || 'Matched (unnamed rule)'
    },
    attachments: [],
    matchingRule,
    parseitId: null
  };
}
