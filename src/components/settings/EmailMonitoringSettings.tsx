import React, { useState, useEffect, useCallback } from 'react';
import { Save, Mail, Zap, Play, Pause, Cloud, Globe, Send, Filter, Clock, Calendar, CheckCircle, XCircle, AlertCircle, Settings, RefreshCw, Bell, Pencil } from 'lucide-react';
import CustomDropdown from '../common/CustomDropdown';
import type { EmailMonitoringConfig, EmailProcessingRule, ExtractionType, TransformationType, CronStatus, CronSettings, PostProcessAction } from '../../types';
import EmailRulesSettings from './EmailRulesSettings';
import { supabase, getAuthHeaders } from '../../lib/supabase';

interface EmailMonitoringSettingsProps {
  emailConfig: EmailMonitoringConfig;
  emailRules: EmailProcessingRule[];
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  onUpdateEmailConfig: (config: EmailMonitoringConfig) => Promise<void>;
  onUpdateEmailRules: (rules: EmailProcessingRule[]) => Promise<void>;
  isAdmin?: boolean;
}

type EmailTab = 'config' | 'rules';

export default function EmailMonitoringSettings({
  emailConfig,
  emailRules,
  extractionTypes,
  transformationTypes,
  onUpdateEmailConfig,
  onUpdateEmailRules,
  isAdmin = true
}: EmailMonitoringSettingsProps) {
  const [activeTab, setActiveTab] = useState<EmailTab>('config');
  const [localConfig, setLocalConfig] = useState<EmailMonitoringConfig>(emailConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; emailCount?: number } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [sendCredResult, setSendCredResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingSend, setIsTestingSend] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState<{ success: boolean; message: string; emailCount?: number } | null>(null);
  const [isTestingGmail, setIsTestingGmail] = useState(false);
  const [runMonitoringResult, setRunMonitoringResult] = useState<{ success: boolean; message: string; emailsChecked?: number; emailsProcessed?: number } | null>(null);
  const [isRunningMonitoring, setIsRunningMonitoring] = useState(false);
  const [showSendTestModal, setShowSendTestModal] = useState(false);
  const [testEmailData, setTestEmailData] = useState({
    testToEmail: '',
    testSubject: 'Test Email from Parse-It',
    testBody: 'This is a test email to verify your email sending configuration is working correctly.'
  });
  const [sendTestResult, setSendTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [cronSettings, setCronSettings] = useState<CronSettings | null>(null);
  const [isLoadingCron, setIsLoadingCron] = useState(false);
  const [cronActionResult, setCronActionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showCronConfig, setShowCronConfig] = useState(false);
  const [cronConfigData, setCronConfigData] = useState({ supabaseUrl: '', supabaseAnonKey: '' });
  const [failureTemplates, setFailureTemplates] = useState<Array<{ id: string; template_name: string; is_global_default: boolean }>>([]);
  const [isTestingFailureNotif, setIsTestingFailureNotif] = useState(false);
  const [failureNotifTestResult, setFailureNotifTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('id, template_name, is_global_default')
        .eq('template_type', 'failure')
        .order('template_name');
      if (!error && data) setFailureTemplates(data);
    })();
  }, []);

  const fetchCronStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_email_cron_status');
      if (error) throw error;
      setCronStatus({
        configured: data.configured,
        cronSettingsConfigured: data.cron_settings_configured,
        supabaseUrlSet: data.supabase_url_set,
        supabaseAnonKeySet: data.supabase_anon_key_set,
        enabled: data.enabled,
        jobExists: data.job_exists,
        jobId: data.job_id,
        schedule: data.schedule,
        pollingInterval: data.polling_interval,
        lastCronRun: data.last_cron_run,
        nextCronRun: data.next_cron_run,
        lastRunStatus: data.last_run_status,
        lastRunTime: data.last_run_time,
        lastRunEnd: data.last_run_end,
        lastRunReturnMessage: data.last_run_return_message,
        error: data.error
      });
    } catch (error) {
      console.error('Failed to fetch cron status:', error);
    }
  }, []);

  const fetchCronSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_cron_settings');
      if (error) throw error;
      setCronSettings({
        configured: data.configured,
        supabaseUrl: data.supabase_url || '',
        supabaseAnonKeyMasked: data.supabase_anon_key_masked || ''
      });
      if (data.supabase_url) {
        setCronConfigData(prev => ({ ...prev, supabaseUrl: data.supabase_url }));
      }
    } catch (error) {
      console.error('Failed to fetch cron settings:', error);
    }
  }, []);

  useEffect(() => {
    fetchCronStatus();
    fetchCronSettings();
  }, [fetchCronStatus, fetchCronSettings]);

  const handleSaveCronSettings = async () => {
    setIsLoadingCron(true);
    setCronActionResult(null);
    try {
      const { error } = await supabase.rpc('save_cron_settings', {
        p_supabase_url: cronConfigData.supabaseUrl,
        p_supabase_anon_key: cronConfigData.supabaseAnonKey
      });
      if (error) throw error;
      setCronActionResult({ success: true, message: 'Cron settings saved successfully!' });
      setShowCronConfig(false);
      await fetchCronSettings();
      await fetchCronStatus();
    } catch (error: any) {
      setCronActionResult({ success: false, message: error.message || 'Failed to save cron settings' });
    } finally {
      setIsLoadingCron(false);
    }
  };

  const handleScheduleCron = async () => {
    setIsLoadingCron(true);
    setCronActionResult(null);
    try {
      const { data, error } = await supabase.rpc('schedule_email_monitoring');
      if (error) throw error;
      if (data.success) {
        setCronActionResult({ success: true, message: `Scheduled! Job ID: ${data.job_id}, Schedule: ${data.schedule}` });
      } else {
        setCronActionResult({ success: false, message: data.error });
      }
      await fetchCronStatus();
    } catch (error: any) {
      setCronActionResult({ success: false, message: error.message || 'Failed to schedule cron job' });
    } finally {
      setIsLoadingCron(false);
    }
  };

  const handleUnscheduleCron = async () => {
    setIsLoadingCron(true);
    setCronActionResult(null);
    try {
      const { data, error } = await supabase.rpc('unschedule_email_monitoring');
      if (error) throw error;
      if (data.success) {
        setCronActionResult({ success: true, message: 'Scheduled monitoring disabled successfully!' });
      } else {
        setCronActionResult({ success: false, message: data.error });
      }
      await fetchCronStatus();
    } catch (error: any) {
      setCronActionResult({ success: false, message: error.message || 'Failed to unschedule cron job' });
    } finally {
      setIsLoadingCron(false);
    }
  };

  // Sync local state when emailConfig prop updates (e.g., when loaded from database)
  useEffect(() => {
    console.log('[EmailMonitoringSettings] useEffect triggered');
    console.log('[EmailMonitoringSettings] emailConfig prop received:', {
      ...emailConfig,
      clientSecret: emailConfig.clientSecret ? '***HIDDEN***' : '(empty)',
      gmailClientSecret: emailConfig.gmailClientSecret ? '***HIDDEN***' : '(empty)',
      gmailRefreshToken: emailConfig.gmailRefreshToken ? '***HIDDEN***' : '(empty)'
    });
    setLocalConfig(emailConfig);
    console.log('[EmailMonitoringSettings] localConfig state updated');
  }, [emailConfig]);

  // Monitor localConfig changes
  useEffect(() => {
    console.log('[EmailMonitoringSettings] localConfig changed to:', {
      ...localConfig,
      clientSecret: localConfig.clientSecret ? '***HIDDEN***' : '(empty)',
      gmailClientSecret: localConfig.gmailClientSecret ? '***HIDDEN***' : '(empty)',
      gmailRefreshToken: localConfig.gmailRefreshToken ? '***HIDDEN***' : '(empty)'
    });
  }, [localConfig]);

  const updateConfig = (field: keyof EmailMonitoringConfig, value: string | number | boolean) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateEmailConfig(localConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save email config:', error);
      alert('Failed to save email configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestFailureNotification = async () => {
    setIsTestingFailureNotif(true);
    setFailureNotifTestResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${supabaseUrl}/functions/v1/email-processing-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'test-failure-notification' })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setFailureNotifTestResult({ success: true, message: result.skipped ? `Skipped: ${result.skipped}` : 'Test failure notification sent successfully.' });
      } else {
        setFailureNotifTestResult({ success: false, message: result.error || result.skipped || `Test failed (${response.status})` });
      }
    } catch (err) {
      setFailureNotifTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setIsTestingFailureNotif(false);
    }
  };

  const handleTestSendCredentials = async () => {
    setIsTestingSend(true);
    setSendCredResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/functions/v1/test-office365`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mode: 'send',
          provider: localConfig.provider,
          tenantId: localConfig.tenantId,
          clientId: localConfig.clientId,
          clientSecret: localConfig.clientSecret,
          defaultSendFromEmail: localConfig.defaultSendFromEmail,
          gmailClientId: localConfig.gmailClientId,
          gmailClientSecret: localConfig.gmailClientSecret,
          gmailRefreshToken: localConfig.gmailRefreshToken
        })
      });

      const result = await response.json();

      if (response.ok) {
        setSendCredResult({
          success: true,
          message: result.message || 'Send credentials verified successfully'
        });
      } else {
        setSendCredResult({
          success: false,
          message: result.details || result.error || 'Send credential test failed'
        });
      }
    } catch (error) {
      setSendCredResult({
        success: false,
        message: 'Send credential test failed. Please check your settings.'
      });
    } finally {
      setIsTestingSend(false);
    }
  };

  const handleTestOffice365 = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const monitoringTenantId = localConfig.monitoringTenantId || localConfig.tenantId;
      const monitoringClientId = localConfig.monitoringClientId || localConfig.clientId;
      const monitoringClientSecret = localConfig.monitoringClientSecret || localConfig.clientSecret;

      const response = await fetch(`${supabaseUrl}/functions/v1/test-office365`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mode: 'monitoring',
          provider: 'office365',
          tenantId: monitoringTenantId,
          clientId: monitoringClientId,
          clientSecret: monitoringClientSecret,
          monitoredEmail: localConfig.monitoredEmail
        })
      });

      const result = await response.json();

      if (response.ok) {
        setTestResult({
          success: true,
          message: result.message,
          emailCount: result.emailCount
        });
      } else {
        setTestResult({
          success: false,
          message: result.details || result.error || 'Connection test failed'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Monitoring connection test failed. Please check your settings.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestGmail = async () => {
    setIsTestingGmail(true);
    setGmailTestResult(null);
    
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/functions/v1/test-email-connection`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          provider: 'gmail',
          gmailClientId: localConfig.gmailClientId,
          gmailClientSecret: localConfig.gmailClientSecret,
          gmailRefreshToken: localConfig.gmailRefreshToken,
          gmailMonitoredLabel: localConfig.gmailMonitoredLabel
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setGmailTestResult({
          success: true,
          message: result.message,
          emailCount: result.emailCount
        });
      } else {
        setGmailTestResult({
          success: false,
          message: result.details || result.error || 'Gmail connection test failed'
        });
      }
    } catch (error) {
      setGmailTestResult({
        success: false,
        message: 'Gmail connection test failed. Please check your settings.'
      });
    } finally {
      setIsTestingGmail(false);
    }
  };

  const handleRunMonitoring = async () => {
    setIsRunningMonitoring(true);
    setRunMonitoringResult(null);

    const startedAt = Date.now();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/functions/v1/email-monitor`;
    console.log('[RunNow] invoking email-monitor', { url, startedAt: new Date(startedAt).toISOString() });

    try {
      let authHeaders: Record<string, string>;
      try {
        authHeaders = await getAuthHeaders();
      } catch (authErr: any) {
        console.error('[RunNow] getAuthHeaders threw', { name: authErr?.name, message: authErr?.message, stack: authErr?.stack });
        setRunMonitoringResult({
          success: false,
          message: `Authentication error: ${authErr?.message || 'unable to get auth headers'}`
        });
        return;
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: authHeaders,
        });
      } catch (fetchErr: any) {
        console.error('[RunNow] fetch threw', {
          name: fetchErr?.name,
          message: fetchErr?.message,
          stack: fetchErr?.stack,
          elapsedMs: Date.now() - startedAt,
        });
        setRunMonitoringResult({
          success: false,
          message: `Network error calling email-monitor: ${fetchErr?.message || 'fetch failed'}`
        });
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      console.log('[RunNow] response received', {
        status: response.status,
        statusText: response.statusText,
        contentType,
        elapsedMs: Date.now() - startedAt,
      });

      const rawBody = await response.text();
      let result: any = null;
      try {
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseErr: any) {
        console.error('[RunNow] response body is not JSON', {
          status: response.status,
          contentType,
          bodySnippet: rawBody.slice(0, 500),
          parseError: parseErr?.message,
        });
        setRunMonitoringResult({
          success: false,
          message: `email-monitor returned non-JSON (status ${response.status}): ${rawBody.slice(0, 200) || response.statusText || 'empty body'}`
        });
        return;
      }

      if (response.ok) {
        console.log('[RunNow] success', { elapsedMs: Date.now() - startedAt, result });
        setRunMonitoringResult({
          success: true,
          message: 'Email monitoring completed successfully',
          emailsChecked: result.emailsChecked || 0,
          emailsProcessed: result.emailsProcessed || 0
        });
      } else {
        console.warn('[RunNow] non-OK response', { status: response.status, result });
        setRunMonitoringResult({
          success: false,
          message: result.details || result.error || `Email monitoring failed (status ${response.status})`
        });
      }
    } catch (error: any) {
      console.error('[RunNow] unexpected error', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        elapsedMs: Date.now() - startedAt,
      });
      setRunMonitoringResult({
        success: false,
        message: `Failed to run email monitoring: ${error?.message || 'unknown error'}`
      });
    } finally {
      setIsRunningMonitoring(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailData.testToEmail) {
      alert('Please enter a recipient email address');
      return;
    }

    if (!localConfig.defaultSendFromEmail) {
      alert('Please configure the "Default Send From Email" field before sending a test email');
      return;
    }

    setIsSendingTest(true);
    setSendTestResult(null);

    try {
      const { data: result, error } = await supabase.functions.invoke('test-email-send', {
        body: {
          testToEmail: testEmailData.testToEmail,
          testSubject: testEmailData.testSubject,
          testBody: testEmailData.testBody,
        },
      });

      if (error) throw error;

      if (result?.success) {
        setSendTestResult({
          success: true,
          message: result.message || 'Test email sent successfully!',
        });
      } else {
        setSendTestResult({
          success: false,
          message: result?.details || result?.error || 'Failed to send test email',
        });
      }
    } catch (error: any) {
      setSendTestResult({
        success: false,
        message: error.message || 'Failed to send test email. Please save your email settings first, then test.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation for Email Monitoring sections */}
      <div className="flex space-x-1 bg-gray-50 dark:bg-gray-700/50 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-md transition-all duration-200 ${
            activeTab === 'config'
              ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          <Mail className={`h-4 w-4 ${
            activeTab === 'config' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
          }`} />
          <span className="text-sm font-medium">Email Provider Configuration</span>
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-md transition-all duration-200 ${
            activeTab === 'rules'
              ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          <Filter className={`h-4 w-4 ${
            activeTab === 'rules' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
          }`} />
          <span className="text-sm font-medium">Email Processing Rules</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'config' ? (
        <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Email Monitoring</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Configure email monitoring for automatic PDF processing</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleTestSendCredentials}
            disabled={isTestingSend}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Zap className="h-4 w-4" />
            <span>{isTestingSend ? 'Testing...' : 'Test Send'}</span>
          </button>
          {localConfig.provider === 'office365' && (
            <button
              onClick={handleTestOffice365}
              disabled={isTesting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Zap className="h-4 w-4" />
              <span>{isTesting ? 'Testing...' : 'Test Monitoring'}</span>
            </button>
          )}
          {localConfig.provider === 'gmail' && (
            <button
              onClick={handleTestGmail}
              disabled={isTestingGmail}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Zap className="h-4 w-4" />
              <span>{isTestingGmail ? 'Testing...' : 'Test Monitoring'}</span>
            </button>
          )}
          <button
            onClick={() => setShowSendTestModal(true)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Send className="h-4 w-4" />
            <span>Send Test Email</span>
          </button>
          <button
            onClick={handleRunMonitoring}
            disabled={isRunningMonitoring}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Play className={`h-4 w-4 ${isRunningMonitoring ? 'animate-pulse' : ''}`} />
            <span>{isRunningMonitoring ? 'Running...' : 'Run Now'}</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">Email monitoring configuration saved successfully!</p>
        </div>
      )}

      {sendCredResult && (
        <div className={`border rounded-lg p-4 ${
          sendCredResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-4 h-4 rounded-full ${
              sendCredResult.success ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-semibold ${
              sendCredResult.success ? 'text-green-800' : 'text-red-800'
            } dark:${sendCredResult.success ? 'text-green-300' : 'text-red-300'}`}>
              {sendCredResult.success ? 'Send Credentials Test Passed' : 'Send Credentials Test Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            sendCredResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {sendCredResult.message}
          </p>
        </div>
      )}

      {testResult && (
        <div className={`border rounded-lg p-4 ${
          testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-4 h-4 rounded-full ${
              testResult.success ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-semibold ${
              testResult.success ? 'text-green-800' : 'text-red-800'
            } dark:${testResult.success ? 'text-green-300' : 'text-red-300'}`}>
              {testResult.success ? 'Monitoring Test Passed' : 'Monitoring Test Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {testResult.message}
            {testResult.emailCount !== undefined && (
              <span className="block mt-1">Recent emails found: {testResult.emailCount}</span>
            )}
          </p>
        </div>
      )}

      {gmailTestResult && (
        <div className={`border rounded-lg p-4 ${
          gmailTestResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-4 h-4 rounded-full ${
              gmailTestResult.success ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-semibold ${
              gmailTestResult.success ? 'text-green-800' : 'text-red-800'
            } dark:${gmailTestResult.success ? 'text-green-300' : 'text-red-300'}`}>
              {gmailTestResult.success ? 'Gmail Test Passed' : 'Gmail Test Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            gmailTestResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {gmailTestResult.message}
            {gmailTestResult.emailCount !== undefined && (
              <span className="block mt-1">Recent emails found: {gmailTestResult.emailCount}</span>
            )}
          </p>
        </div>
      )}

      {runMonitoringResult && (
        <div className={`border rounded-lg p-4 ${
          runMonitoringResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {runMonitoringResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              <span className={`font-semibold ${
                runMonitoringResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
              }`}>
                {runMonitoringResult.success ? 'Monitoring Run Complete' : 'Monitoring Run Failed'}
              </span>
            </div>
            <button
              onClick={() => setRunMonitoringResult(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <span className="text-xl">&times;</span>
            </button>
          </div>
          <p className={`text-sm mt-2 ${
            runMonitoringResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {runMonitoringResult.message}
          </p>
          {runMonitoringResult.success && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-200 dark:border-green-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Emails Checked</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{runMonitoringResult.emailsChecked}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-200 dark:border-green-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Emails Processed</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{runMonitoringResult.emailsProcessed}</p>
              </div>
            </div>
          )}
          {runMonitoringResult.success && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Check the "Polling Logs" tab to see detailed activity.
            </p>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg">
              <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Email Provider Configuration</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure your email provider settings</p>
            </div>
          </div>
        </div>

        {/* AI Auto-Detect Toggle */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-gray-900 dark:text-gray-100">AI Auto-Detection</h5>
              <p className="text-sm text-gray-500 dark:text-gray-400">Use AI to automatically detect extraction type before applying email rules</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => updateConfig('enableAutoDetect', !localConfig.enableAutoDetect)}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  localConfig.enableAutoDetect 
                    ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {localConfig.enableAutoDetect ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <span className={`text-sm font-medium ${
                localConfig.enableAutoDetect ? 'text-purple-600' : 'text-gray-600'
              }`}>
                {localConfig.enableAutoDetect ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Email Provider
            </label>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                type="button"
                onClick={() => updateConfig('provider', 'office365')}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
                  localConfig.provider === 'office365'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Cloud className="h-4 w-4" />
                <span>Office 365</span>
              </button>
              <button
                type="button"
                onClick={() => updateConfig('provider', 'gmail')}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
                  localConfig.provider === 'gmail'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Globe className="h-4 w-4" />
                <span>Gmail</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {localConfig.provider === 'office365' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tenant ID
                </label>
                <input
                  type="text"
                  value={localConfig.tenantId}
                  onChange={(e) => updateConfig('tenantId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Client ID
                </label>
                <input
                  type="text"
                  value={localConfig.clientId}
                  onChange={(e) => updateConfig('clientId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Gmail Client ID
                </label>
                <input
                  type="text"
                  value={localConfig.gmailClientId || ''}
                  onChange={(e) => updateConfig('gmailClientId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="xxxxxxxxxx.apps.googleusercontent.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Gmail Client Secret
                </label>
                <input
                  type="password"
                  value={localConfig.gmailClientSecret || ''}
                  onChange={(e) => updateConfig('gmailClientSecret', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="Gmail OAuth client secret"
                />
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {localConfig.provider === 'office365' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={localConfig.clientSecret}
                  onChange={(e) => updateConfig('clientSecret', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="Client secret value"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Default Send From Email
                </label>
                <input
                  type="email"
                  value={localConfig.defaultSendFromEmail || ''}
                  onChange={(e) => updateConfig('defaultSendFromEmail', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="sender@company.com"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Email address to use when sending outbound emails
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Gmail Refresh Token
                </label>
                <input
                  type="password"
                  value={localConfig.gmailRefreshToken || ''}
                  onChange={(e) => updateConfig('gmailRefreshToken', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="OAuth refresh token"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Default Send From Email
                </label>
                <input
                  type="email"
                  value={localConfig.defaultSendFromEmail || ''}
                  onChange={(e) => updateConfig('defaultSendFromEmail', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="sender@company.com"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Email address to use when sending outbound emails
                </p>
              </div>
            </>
          )}
        </div>

        {/* Separate Monitoring Credentials Section */}
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 mb-4 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h5 className="font-medium text-gray-900 dark:text-gray-100">Separate Monitoring Credentials (Optional)</h5>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Use different credentials for reading emails. If left empty, the send credentials above will be used.
              </p>
            </div>
            <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
              <button
                onClick={() => updateConfig('isEnabled', !localConfig.isEnabled)}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  localConfig.isEnabled
                    ? 'bg-green-100 text-green-600 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {localConfig.isEnabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <span className={`text-sm font-medium ${
                localConfig.isEnabled ? 'text-green-600' : 'text-gray-600'
              }`}>
                {localConfig.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {localConfig.provider === 'office365' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitoring Tenant ID
                  </label>
                  <input
                    type="text"
                    value={localConfig.monitoringTenantId || ''}
                    onChange={(e) => updateConfig('monitoringTenantId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Leave empty to use send credentials"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitoring Client ID
                  </label>
                  <input
                    type="text"
                    value={localConfig.monitoringClientId || ''}
                    onChange={(e) => updateConfig('monitoringClientId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Leave empty to use send credentials"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitoring Client Secret
                  </label>
                  <input
                    type="password"
                    value={localConfig.monitoringClientSecret || ''}
                    onChange={(e) => updateConfig('monitoringClientSecret', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Leave empty to use send credentials"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitored Email
                  </label>
                  <input
                    type="email"
                    value={localConfig.monitoredEmail}
                    onChange={(e) => updateConfig('monitoredEmail', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Polling Interval (minutes)
                  </label>
                  <input
                    type="number"
                    value={localConfig.pollingInterval}
                    onChange={(e) => updateConfig('pollingInterval', parseInt(e.target.value) || 5)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    min="1"
                    max="60"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-600 rounded-lg">
                <div>
                  <h6 className="text-sm font-medium text-gray-900 dark:text-gray-100">Check All Messages</h6>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ignore last check time and check all unread messages. Duplicates are automatically skipped.</p>
                </div>
                <button
                  onClick={() => updateConfig('checkAllMessages', !localConfig.checkAllMessages)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    localConfig.checkAllMessages ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-500'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      localConfig.checkAllMessages ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitoring Client ID
                  </label>
                  <input
                    type="text"
                    value={localConfig.gmailMonitoringClientId || ''}
                    onChange={(e) => updateConfig('gmailMonitoringClientId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Leave empty to use send credentials"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitoring Client Secret
                  </label>
                  <input
                    type="password"
                    value={localConfig.gmailMonitoringClientSecret || ''}
                    onChange={(e) => updateConfig('gmailMonitoringClientSecret', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Leave empty to use send credentials"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitoring Refresh Token
                  </label>
                  <input
                    type="password"
                    value={localConfig.gmailMonitoringRefreshToken || ''}
                    onChange={(e) => updateConfig('gmailMonitoringRefreshToken', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Leave empty to use send credentials"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monitored Label/Folder
                  </label>
                  <input
                    type="text"
                    value={localConfig.gmailMonitoredLabel || 'INBOX'}
                    onChange={(e) => updateConfig('gmailMonitoredLabel', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="INBOX or custom label name"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Gmail label to monitor (e.g., "INBOX", "Parse-It", "Invoices")
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Polling Interval (minutes)
                  </label>
                  <input
                    type="number"
                    value={localConfig.pollingInterval}
                    onChange={(e) => updateConfig('pollingInterval', parseInt(e.target.value) || 5)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    min="1"
                    max="60"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-600 rounded-lg">
                <div>
                  <h6 className="text-sm font-medium text-gray-900 dark:text-gray-100">Check All Messages</h6>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ignore last check time and check all unread messages. Duplicates are automatically skipped.</p>
                </div>
                <button
                  onClick={() => updateConfig('checkAllMessages', !localConfig.checkAllMessages)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    localConfig.checkAllMessages ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-500'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      localConfig.checkAllMessages ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Post-Processing Settings Section - Success */}
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 mb-4 bg-gray-50 dark:bg-gray-700/50">
          <div className="mb-4">
            <h5 className="font-medium text-gray-900 dark:text-gray-100">After Processing Action (Success)</h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure what happens to emails after they are successfully processed. Only unread emails are monitored.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Post-Processing Action
              </label>
              <CustomDropdown
                value={localConfig.postProcessAction || 'mark_read'}
                onChange={(val) => updateConfig('postProcessAction', val as PostProcessAction)}
                options={[
                  { value: 'mark_read', label: 'Mark as Read (default)' },
                  { value: 'move', label: 'Move to Folder' },
                  { value: 'archive', label: 'Archive' },
                  { value: 'delete', label: 'Delete (move to trash)' },
                  { value: 'none', label: 'Do Nothing' },
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {localConfig.postProcessAction === 'mark_read' || !localConfig.postProcessAction
                  ? 'Marks the email as read to prevent reprocessing'
                  : localConfig.postProcessAction === 'move'
                  ? 'Moves the email to the specified folder and marks as read'
                  : localConfig.postProcessAction === 'archive'
                  ? 'Archives the email (removes from inbox) and marks as read'
                  : localConfig.postProcessAction === 'delete'
                  ? 'Moves the email to trash'
                  : 'No action taken - email remains unread (not recommended)'}
              </p>
            </div>

            {localConfig.postProcessAction === 'move' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Folder
                </label>
                <input
                  type="text"
                  value={localConfig.processedFolderPath || 'Processed'}
                  onChange={(e) => updateConfig('processedFolderPath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="Processed"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Folder name to move processed emails to. Will be created if it doesn't exist.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Post-Processing Settings Section - Failure */}
        <div className="border border-red-200 dark:border-red-600 rounded-lg p-4 mb-4 bg-red-50 dark:bg-red-900/10">
          <div className="mb-4">
            <h5 className="font-medium text-gray-900 dark:text-gray-100">After Processing Action (Failure)</h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure what happens to emails when processing fails. Helps manage failed emails for troubleshooting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Post-Processing Action on Failure
              </label>
              <CustomDropdown
                value={localConfig.postProcessActionOnFailure || 'none'}
                onChange={(val) => updateConfig('postProcessActionOnFailure', val as PostProcessAction)}
                options={[
                  { value: 'none', label: 'Do Nothing (default)' },
                  { value: 'mark_read', label: 'Mark as Read' },
                  { value: 'move', label: 'Move to Folder' },
                  { value: 'archive', label: 'Archive' },
                  { value: 'delete', label: 'Delete (move to trash)' },
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {localConfig.postProcessActionOnFailure === 'none' || !localConfig.postProcessActionOnFailure
                  ? 'Failed emails remain unread in inbox for manual review'
                  : localConfig.postProcessActionOnFailure === 'mark_read'
                  ? 'Marks the email as read to prevent cluttering inbox'
                  : localConfig.postProcessActionOnFailure === 'move'
                  ? 'Moves the email to a failure folder for review'
                  : localConfig.postProcessActionOnFailure === 'archive'
                  ? 'Archives the email (removes from inbox)'
                  : 'Moves the email to trash'}
              </p>
            </div>

            {localConfig.postProcessActionOnFailure === 'move' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Failure Folder
                </label>
                <input
                  type="text"
                  value={localConfig.failureFolderPath || 'Failed'}
                  onChange={(e) => updateConfig('failureFolderPath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="Failed"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Folder name to move failed emails to. Will be created if it doesn't exist.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Post-Processing Settings Section - No Rule Matched */}
        <div className="border border-amber-200 dark:border-amber-600 rounded-lg p-4 mb-4 bg-amber-50 dark:bg-amber-900/10">
          <div className="mb-4">
            <h5 className="font-medium text-gray-900 dark:text-gray-100">After Processing Action (No Rule Matched)</h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure what happens to emails when no processing rule matches. Prevents unmatched emails from blocking the monitoring queue.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Post-Processing Action on No Rule Match
              </label>
              <CustomDropdown
                value={localConfig.postProcessActionNoRuleMatch || 'mark_read'}
                onChange={(val) => updateConfig('postProcessActionNoRuleMatch', val as PostProcessAction)}
                options={[
                  { value: 'mark_read', label: 'Mark as Read (default)' },
                  { value: 'move', label: 'Move to Folder' },
                  { value: 'archive', label: 'Archive' },
                  { value: 'delete', label: 'Delete (move to trash)' },
                  { value: 'none', label: 'Do Nothing (email will be retried)' },
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {localConfig.postProcessActionNoRuleMatch === 'mark_read' || !localConfig.postProcessActionNoRuleMatch
                  ? 'Marks the email as read so it is no longer monitored'
                  : localConfig.postProcessActionNoRuleMatch === 'move'
                  ? 'Moves the email to a folder for review'
                  : localConfig.postProcessActionNoRuleMatch === 'archive'
                  ? 'Archives the email (removes from inbox)'
                  : localConfig.postProcessActionNoRuleMatch === 'delete'
                  ? 'Moves the email to trash'
                  : 'Warning: email stays unread and will block the queue on every check'}
              </p>
            </div>

            {localConfig.postProcessActionNoRuleMatch === 'move' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  No Rule Matched Folder
                </label>
                <input
                  type="text"
                  value={localConfig.noRuleMatchFolderPath || 'No Rule Matched'}
                  onChange={(e) => updateConfig('noRuleMatchFolderPath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  placeholder="No Rule Matched"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Folder name to move unmatched emails to. Will be created if it doesn't exist.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Failure Notifications Section */}
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h5 className="font-medium text-gray-900 dark:text-gray-100">Failure Notifications</h5>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Send an email to admins when a queued email fails processing in the Inbox &rarr; Email Processing queue.
          </p>

          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={!!localConfig.enableFailureNotifications}
              onChange={(e) => updateConfig('enableFailureNotifications' as keyof EmailMonitoringConfig, e.target.checked as never)}
              className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable failure notifications</span>
          </label>

          {localConfig.enableFailureNotifications && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notification Template
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <CustomDropdown
                      value={localConfig.failureNotificationTemplateId || ''}
                      onChange={(val) => updateConfig('failureNotificationTemplateId' as keyof EmailMonitoringConfig, (val || null) as never)}
                      options={[
                        { value: '', label: failureTemplates.some(t => t.is_global_default) ? 'Use global default' : 'Select a template...' },
                        ...failureTemplates.map(t => ({ value: t.id, label: t.is_global_default ? `${t.template_name} (default)` : t.template_name }))
                      ]}
                      placeholder="Select a template..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate-settings-tab', { detail: 'notifications' }))}
                    title="Edit notification templates"
                    className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Choose a failure template. Leave blank to use the global default template.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Recipient Override (optional)
                </label>
                <input
                  type="email"
                  value={localConfig.failureRecipientEmailOverride || ''}
                  onChange={(e) => updateConfig('failureRecipientEmailOverride' as keyof EmailMonitoringConfig, e.target.value as never)}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Overrides the recipient defined on the template. Comma-separated for multiple addresses.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestFailureNotification}
                  disabled={isTestingFailureNotif}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isTestingFailureNotif ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {isTestingFailureNotif ? 'Sending test...' : 'Send test notification'}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400">Save settings first, then run the test.</p>
              </div>

              {failureNotifTestResult && (
                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${failureNotifTestResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'}`}>
                  {failureNotifTestResult.success ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                  <span>{failureNotifTestResult.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 mb-4">
          <div className="flex items-end">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {localConfig.lastCheck && (
                <p>Last check: {new Date(localConfig.lastCheck).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled Monitoring Section */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Scheduled Monitoring</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically poll emails on a timer using pg_cron</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchCronStatus}
              disabled={isLoadingCron}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingCron ? 'animate-spin' : ''}`} />
            </button>
            {cronStatus?.enabled ? (
              <span className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Active</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Inactive</span>
              </span>
            )}
          </div>
        </div>

        {cronActionResult && (
          <div className={`mb-4 border rounded-lg p-3 ${
            cronActionResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
          }`}>
            <div className="flex items-center space-x-2">
              {cronActionResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-sm ${cronActionResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {cronActionResult.message}
              </span>
            </div>
          </div>
        )}

        {/* Cron Settings Configuration */}
        {!cronSettings?.configured && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Configuration Required</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  To enable scheduled monitoring, you need to configure the Supabase connection settings.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Cron Settings */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium text-gray-900 dark:text-gray-100">Connection Settings</h5>
              <button
                onClick={() => setShowCronConfig(!showCronConfig)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
              >
                <Settings className="h-4 w-4" />
                <span>{showCronConfig ? 'Hide' : 'Configure'}</span>
              </button>
            </div>

            {!showCronConfig && cronSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Supabase URL:</span>
                  <span className="ml-2 text-gray-900 dark:text-gray-100">
                    {cronSettings.supabaseUrl || '(not set)'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Anon Key:</span>
                  <span className="ml-2 text-gray-900 dark:text-gray-100">
                    {cronSettings.supabaseAnonKeyMasked || '(not set)'}
                  </span>
                </div>
              </div>
            )}

            {showCronConfig && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Supabase URL
                  </label>
                  <input
                    type="text"
                    value={cronConfigData.supabaseUrl}
                    onChange={(e) => setCronConfigData(prev => ({ ...prev, supabaseUrl: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://your-project.supabase.co"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Your Supabase project URL (found in project settings)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Supabase Anon Key
                  </label>
                  <input
                    type="password"
                    value={cronConfigData.supabaseAnonKey}
                    onChange={(e) => setCronConfigData(prev => ({ ...prev, supabaseAnonKey: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="eyJ..."
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Your Supabase anon/public key (found in project API settings)
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveCronSettings}
                    disabled={isLoadingCron || !cronConfigData.supabaseUrl || !cronConfigData.supabaseAnonKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                  >
                    {isLoadingCron ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Status */}
          {cronStatus && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50">
              <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Schedule Status</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Schedule:</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono">
                    {cronStatus.schedule || `Every ${localConfig.pollingInterval} min`}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Last Run:</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {cronStatus.lastCronRun ? new Date(cronStatus.lastCronRun).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Next Run:</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {cronStatus.nextCronRun ? new Date(cronStatus.nextCronRun).toLocaleString() : 'Not scheduled'}
                  </span>
                </div>
                {cronStatus.lastRunStatus && (
                  <div className="flex items-center space-x-2">
                    {cronStatus.lastRunStatus === 'succeeded' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-gray-500 dark:text-gray-400">Last Status:</span>
                    <span className={`font-medium ${cronStatus.lastRunStatus === 'succeeded' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {cronStatus.lastRunStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Polling interval is set to <strong>{localConfig.pollingInterval} minutes</strong>.
              Change it above and save before enabling.
            </p>
            <div className="flex items-center space-x-3">
              {cronStatus?.enabled ? (
                <button
                  onClick={handleUnscheduleCron}
                  disabled={isLoadingCron}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <Pause className="h-4 w-4" />
                  <span>{isLoadingCron ? 'Stopping...' : 'Stop Scheduled Monitoring'}</span>
                </button>
              ) : (
                <button
                  onClick={handleScheduleCron}
                  disabled={isLoadingCron || !cronSettings?.configured}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <Play className="h-4 w-4" />
                  <span>{isLoadingCron ? 'Starting...' : 'Start Scheduled Monitoring'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Send Test Email Modal */}
      {showSendTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg">
                    <Send className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Send Test Email</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Test your email sending configuration</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowSendTestModal(false);
                    setSendTestResult(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              {sendTestResult && (
                <div className={`mb-6 border rounded-lg p-4 ${
                  sendTestResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                }`}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-4 h-4 rounded-full ${
                      sendTestResult.success ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className={`font-semibold ${
                      sendTestResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
                    }`}>
                      {sendTestResult.success ? 'Email Sent Successfully' : 'Send Failed'}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${
                    sendTestResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                  }`}>
                    {sendTestResult.message}
                  </p>
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Sender:</strong> {localConfig.defaultSendFromEmail || 'Not configured'}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Configure the "Default Send From Email" field above to change the sender address
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Recipient Email *
                  </label>
                  <input
                    type="email"
                    value={testEmailData.testToEmail}
                    onChange={(e) => setTestEmailData({ ...testEmailData, testToEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="recipient@example.com"
                    disabled={isSendingTest}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={testEmailData.testSubject}
                    onChange={(e) => setTestEmailData({ ...testEmailData, testSubject: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="Test Email Subject"
                    disabled={isSendingTest}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message Body
                  </label>
                  <textarea
                    value={testEmailData.testBody}
                    onChange={(e) => setTestEmailData({ ...testEmailData, testBody: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    rows={6}
                    placeholder="Enter your test email message..."
                    disabled={isSendingTest}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowSendTestModal(false);
                    setSendTestResult(null);
                  }}
                  disabled={isSendingTest}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition-colors duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest || !testEmailData.testToEmail}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <Send className="h-4 w-4" />
                  <span>{isSendingTest ? 'Sending...' : 'Send Test Email'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      ) : (
        <EmailRulesSettings
          emailRules={emailRules}
          extractionTypes={extractionTypes}
          transformationTypes={transformationTypes}
          onUpdateEmailRules={onUpdateEmailRules}
        />
      )}
    </div>
  );
}