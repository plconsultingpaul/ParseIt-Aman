import { EmailMessage, PdfAttachment, EmailMonitoringConfig, ProcessingRule } from '../../types.ts';

export interface EmailProvider {
  readonly providerName: string;

  authenticate(): Promise<string>;

  fetchUnreadEmails(): Promise<EmailMessage[]>;

  findPdfAttachments(emailId: string): Promise<PdfAttachment[]>;

  getEmailDetails(emailId: string): Promise<{
    subject: string;
    from: string;
    receivedDate: string;
  }>;

  getEmailBody(emailId: string): Promise<string>;

  applyPostProcessAction(
    emailId: string,
    action: string,
    folderPath: string
  ): Promise<void>;
}

export function findMatchingRule(
  fromEmail: string,
  subject: string,
  rules: ProcessingRule[]
): ProcessingRule | null {
  console.log(`[RULE_MATCH] Evaluating ${rules.length} rules for sender="${fromEmail}", subject="${subject}"`);
  for (const rule of rules) {
    const senderMatches = !rule.sender_pattern ||
      fromEmail.toLowerCase().includes(rule.sender_pattern.toLowerCase());

    const subjectMatches = !rule.subject_pattern ||
      subject.toLowerCase().includes(rule.subject_pattern.toLowerCase());

    console.log(`[RULE_MATCH]   Rule "${rule.rule_name || rule.id}": sender_pattern="${rule.sender_pattern || '(any)'}" => ${senderMatches ? 'MATCH' : 'NO MATCH'} | subject_pattern="${rule.subject_pattern || '(any)'}" => ${subjectMatches ? 'MATCH' : 'NO MATCH'}`);

    if (senderMatches && subjectMatches) {
      console.log(`[RULE_MATCH]   => MATCHED rule "${rule.rule_name || rule.id}"`);
      return rule;
    }
  }
  console.log(`[RULE_MATCH]   => NO RULES MATCHED for sender="${fromEmail}"`);
  return null;
}

export function getPostProcessAction(
  config: EmailMonitoringConfig,
  processResult: 'success' | 'failure' | 'no_rule_match'
): { action: string; folderPath: string } {
  if (processResult === 'no_rule_match') {
    return {
      action: config.post_process_action_no_rule_match || 'mark_read',
      folderPath: config.no_rule_match_folder_path || 'No Rule Matched',
    };
  }

  const action = processResult === 'success'
    ? (config.post_process_action || 'mark_read')
    : (config.post_process_action_on_failure || 'none');

  const folderPath = processResult === 'success'
    ? (config.processed_folder_path || 'Processed')
    : (config.failure_folder_path || 'Failed');

  return { action, folderPath };
}
