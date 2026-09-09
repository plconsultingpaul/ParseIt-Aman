import { supabase } from '../lib/supabase';
import type { EmailMonitoringConfig, EmailProcessingRule } from '../types';

// Email Monitoring Configuration
export async function fetchEmailConfig(): Promise<EmailMonitoringConfig> {
  try {
    const { data, error } = await supabase
      .from('email_monitoring_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    console.log('[emailService] Raw data from database:', data);

    if (data && data.length > 0) {
      const config = data[0];
      const returnConfig = {
        provider: config.provider || 'office365',
        tenantId: config.tenant_id || '',
        clientId: config.client_id || '',
        clientSecret: config.client_secret || '',
        monitoredEmail: config.monitored_email || '',
        defaultSendFromEmail: config.default_send_from_email || '',
        gmailClientId: config.gmail_client_id || '',
        gmailClientSecret: config.gmail_client_secret || '',
        gmailRefreshToken: config.gmail_refresh_token || '',
        gmailMonitoredLabel: config.gmail_monitored_label || 'INBOX',
        pollingInterval: config.polling_interval || 5,
        isEnabled: config.is_enabled || false,
        enableAutoDetect: config.enable_auto_detect || false,
        lastCheck: config.last_check,
        monitoringTenantId: config.monitoring_tenant_id || '',
        monitoringClientId: config.monitoring_client_id || '',
        monitoringClientSecret: config.monitoring_client_secret || '',
        gmailMonitoringClientId: config.gmail_monitoring_client_id || '',
        gmailMonitoringClientSecret: config.gmail_monitoring_client_secret || '',
        gmailMonitoringRefreshToken: config.gmail_monitoring_refresh_token || '',
        checkAllMessages: config.check_all_messages || false,
        postProcessAction: config.post_process_action || 'mark_read',
        processedFolderPath: config.processed_folder_path || 'Processed',
        postProcessActionOnFailure: config.post_process_action_on_failure || 'none',
        failureFolderPath: config.failure_folder_path || 'Failed',
        postProcessActionNoRuleMatch: config.post_process_action_no_rule_match || 'mark_read',
        noRuleMatchFolderPath: config.no_rule_match_folder_path || 'No Rule Matched',
        enableFailureNotifications: !!config.enable_failure_notifications,
        failureNotificationTemplateId: config.failure_notification_template_id || null,
        failureRecipientEmailOverride: config.failure_recipient_email_override || ''
      };
      console.log('[emailService] Returning config:', {
        ...returnConfig,
        clientSecret: returnConfig.clientSecret ? '***HIDDEN***' : '(empty)',
        gmailClientSecret: returnConfig.gmailClientSecret ? '***HIDDEN***' : '(empty)',
        gmailRefreshToken: returnConfig.gmailRefreshToken ? '***HIDDEN***' : '(empty)',
        monitoringClientSecret: returnConfig.monitoringClientSecret ? '***HIDDEN***' : '(empty)',
        gmailMonitoringClientSecret: returnConfig.gmailMonitoringClientSecret ? '***HIDDEN***' : '(empty)',
        gmailMonitoringRefreshToken: returnConfig.gmailMonitoringRefreshToken ? '***HIDDEN***' : '(empty)'
      });
      return returnConfig;
    }

    return {
      provider: 'office365',
      tenantId: '',
      clientId: '',
      clientSecret: '',
      monitoredEmail: '',
      defaultSendFromEmail: '',
      gmailClientId: '',
      gmailClientSecret: '',
      gmailRefreshToken: '',
      gmailMonitoredLabel: 'INBOX',
      pollingInterval: 5,
      isEnabled: false,
      enableAutoDetect: false,
      monitoringTenantId: '',
      monitoringClientId: '',
      monitoringClientSecret: '',
      gmailMonitoringClientId: '',
      gmailMonitoringClientSecret: '',
      gmailMonitoringRefreshToken: '',
      checkAllMessages: false,
      postProcessAction: 'mark_read',
      processedFolderPath: 'Processed',
      postProcessActionOnFailure: 'none',
      failureFolderPath: 'Failed',
      postProcessActionNoRuleMatch: 'mark_read',
      noRuleMatchFolderPath: 'No Rule Matched',
      enableFailureNotifications: false,
      failureNotificationTemplateId: null,
      failureRecipientEmailOverride: ''
    };
  } catch (error) {
    console.error('Error fetching email config:', error);
    throw error;
  }
}

export async function updateEmailConfig(config: EmailMonitoringConfig): Promise<void> {
  try {
    const { data: existingData } = await supabase
      .from('email_monitoring_config')
      .select('id')
      .limit(1);

    const configData = {
      provider: config.provider,
      tenant_id: config.tenantId,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      monitored_email: config.monitoredEmail,
      default_send_from_email: config.defaultSendFromEmail,
      gmail_client_id: config.gmailClientId,
      gmail_client_secret: config.gmailClientSecret,
      gmail_refresh_token: config.gmailRefreshToken,
      gmail_monitored_label: config.gmailMonitoredLabel,
      polling_interval: config.pollingInterval,
      is_enabled: config.isEnabled,
      enable_auto_detect: config.enableAutoDetect,
      monitoring_tenant_id: config.monitoringTenantId || '',
      monitoring_client_id: config.monitoringClientId || '',
      monitoring_client_secret: config.monitoringClientSecret || '',
      gmail_monitoring_client_id: config.gmailMonitoringClientId || '',
      gmail_monitoring_client_secret: config.gmailMonitoringClientSecret || '',
      gmail_monitoring_refresh_token: config.gmailMonitoringRefreshToken || '',
      check_all_messages: config.checkAllMessages || false,
      post_process_action: config.postProcessAction || 'mark_read',
      processed_folder_path: config.processedFolderPath || 'Processed',
      post_process_action_on_failure: config.postProcessActionOnFailure || 'none',
      failure_folder_path: config.failureFolderPath || 'Failed',
      post_process_action_no_rule_match: config.postProcessActionNoRuleMatch || 'mark_read',
      no_rule_match_folder_path: config.noRuleMatchFolderPath || 'No Rule Matched',
      enable_failure_notifications: !!config.enableFailureNotifications,
      failure_notification_template_id: config.failureNotificationTemplateId || null,
      failure_recipient_email_override: config.failureRecipientEmailOverride || null,
      updated_at: new Date().toISOString()
    };

    if (existingData && existingData.length > 0) {
      const { error } = await supabase
        .from('email_monitoring_config')
        .update(configData)
        .eq('id', existingData[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('email_monitoring_config')
        .insert([configData]);
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error updating email config:', error);
    throw error;
  }
}

// Email Processing Rules
export async function fetchEmailRules(): Promise<EmailProcessingRule[]> {
  try {
    const { data, error } = await supabase
      .from('email_processing_rules')
      .select('*')
      .order('priority', { ascending: true });

    if (error) throw error;

    return (data || []).map(rule => ({
      id: rule.id,
      ruleName: rule.rule_name,
      senderPattern: rule.sender_pattern,
      subjectPattern: rule.subject_pattern,
      extractionTypeId: rule.extraction_type_id,
      transformationTypeId: rule.transformation_type_id,
      workflowV2Id: rule.workflow_v2_id,
      processingMode: rule.processing_mode,
      isEnabled: rule.is_enabled,
      priority: rule.priority
    }));
  } catch (error) {
    console.error('Error fetching email rules:', error);
    throw error;
  }
}

export async function updateEmailRules(rules: EmailProcessingRule[]): Promise<void> {
  try {
    // Delete all existing rules
    const { error: deleteError } = await supabase
      .from('email_processing_rules')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) throw deleteError;

    // Insert new rules
    if (rules.length > 0) {
      const { error: insertError } = await supabase
        .from('email_processing_rules')
        .insert(
          rules.map(rule => ({
            rule_name: rule.ruleName,
            sender_pattern: rule.senderPattern,
            subject_pattern: rule.subjectPattern,
            extraction_type_id: rule.extractionTypeId,
            transformation_type_id: rule.transformationTypeId,
            workflow_v2_id: rule.workflowV2Id || null,
            processing_mode: rule.processingMode,
            is_enabled: rule.isEnabled,
            priority: rule.priority
          }))
        );

      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error('Error updating email rules:', error);
    throw error;
  }
}