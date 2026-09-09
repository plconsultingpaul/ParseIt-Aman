import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Loader2, Save, Play, Pause, Zap, ToggleLeft, ToggleRight, AlertCircle, X, CheckCircle, XCircle, Clock, Calendar, RefreshCw, Settings, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { ImagingEmailMonitoringConfig, ImagingBucket, PostProcessAction, CronStatus, CronSettings } from '../../types';
import { fetchImagingEmailConfigs, createImagingEmailConfig, updateImagingEmailConfig, deleteImagingEmailConfig, fetchBuckets } from '../../services/imagingService';
import { supabase } from '../../lib/supabase';
import CustomDropdown from '../common/CustomDropdown';

interface ImagingEmailMonitoringSectionProps {
  isAdmin: boolean;
}

const POST_PROCESS_OPTIONS: { value: PostProcessAction; label: string }[] = [
  { value: 'mark_read', label: 'Mark as Read' },
  { value: 'move', label: 'Move to Folder' },
  { value: 'archive', label: 'Archive' },
  { value: 'delete', label: 'Delete' },
  { value: 'none', label: 'Do Nothing' },
];

function newBlankConfig(): ImagingEmailMonitoringConfig {
  return {
    configName: '',
    provider: 'office365',
    tenantId: '',
    clientId: '',
    clientSecret: '',
    gmailClientId: '',
    gmailClientSecret: '',
    gmailRefreshToken: '',
    monitoredEmail: '',
    gmailMonitoredLabel: 'INBOX',
    imagingBucketId: null,
    pollingInterval: 5,
    isEnabled: false,
    checkAllMessages: false,
    forceToUnindexedQueue: false,
    postProcessAction: 'mark_read',
    processedFolderPath: 'Processed',
    postProcessActionOnFailure: 'none',
    failureFolderPath: 'Failed',
  };
}

export default function ImagingEmailMonitoringSection({ isAdmin }: ImagingEmailMonitoringSectionProps) {
  const [configs, setConfigs] = useState<ImagingEmailMonitoringConfig[]>([]);
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cronStatuses, setCronStatuses] = useState<Record<string, CronStatus>>({});
  const [cronSettings, setCronSettings] = useState<CronSettings | null>(null);
  const [isLoadingCron, setIsLoadingCron] = useState<string | null>(null);
  const [cronActionResult, setCronActionResult] = useState<{ configId: string; success: boolean; message: string } | null>(null);
  const [showCronConfig, setShowCronConfig] = useState(false);
  const [cronConfigData, setCronConfigData] = useState({ supabaseUrl: '', supabaseAnonKey: '' });

  const loadData = useCallback(async () => {
    try {
      const [cfgs, bkts] = await Promise.all([fetchImagingEmailConfigs(), fetchBuckets()]);
      setConfigs(cfgs);
      setBuckets(bkts);
      if (cfgs.length > 0 && !expandedId) {
        setExpandedId(cfgs[0].id || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load imaging email config');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCronStatusForConfig = useCallback(async (configId: string) => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_imaging_email_cron_status', { p_config_id: configId });
      if (rpcErr) throw rpcErr;
      setCronStatuses(prev => ({
        ...prev,
        [configId]: {
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
          error: data.error,
        },
      }));
    } catch (err) {
      console.error('Failed to fetch imaging cron status:', err);
    }
  }, []);

  const fetchAllCronStatuses = useCallback(async (cfgs: ImagingEmailMonitoringConfig[]) => {
    for (const cfg of cfgs) {
      if (cfg.id) await fetchCronStatusForConfig(cfg.id);
    }
  }, [fetchCronStatusForConfig]);

  const fetchCronSettingsData = useCallback(async () => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_cron_settings');
      if (rpcErr) throw rpcErr;
      setCronSettings({
        configured: data.configured,
        supabaseUrl: data.supabase_url || '',
        supabaseAnonKeyMasked: data.supabase_anon_key_masked || '',
      });
      if (data.supabase_url) {
        setCronConfigData(prev => ({ ...prev, supabaseUrl: data.supabase_url }));
      }
    } catch (err) {
      console.error('Failed to fetch cron settings:', err);
    }
  }, []);

  useEffect(() => {
    loadData().then(() => {});
    fetchCronSettingsData();
  }, [loadData, fetchCronSettingsData]);

  useEffect(() => {
    if (configs.length > 0) {
      fetchAllCronStatuses(configs);
    }
  }, [configs.length]);

  const updateConfig = (configId: string | undefined, partial: Partial<ImagingEmailMonitoringConfig>) => {
    setConfigs(prev => prev.map(c => (c.id === configId ? { ...c, ...partial } : c)));
  };

  const handleAddConfig = async () => {
    setError('');
    setSuccess('');
    try {
      const blank = newBlankConfig();
      blank.configName = `Email Account ${configs.length + 1}`;
      const created = await createImagingEmailConfig(blank);
      setConfigs(prev => [...prev, created]);
      setExpandedId(created.id || null);
      setSuccess('New email account added. Configure and save below.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create email config');
    }
  };

  const handleSave = async (config: ImagingEmailMonitoringConfig) => {
    if (!config.id) return;
    setSavingId(config.id);
    setError('');
    setSuccess('');
    try {
      await updateImagingEmailConfig(config);
      setSuccess(`"${config.configName || 'Email Account'}" saved.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (config: ImagingEmailMonitoringConfig) => {
    if (!config.id) return;
    if (!window.confirm(`Delete "${config.configName || 'this email account'}" and all its processing rules? This cannot be undone.`)) return;
    setDeletingId(config.id);
    setError('');
    try {
      if (config.cronEnabled) {
        await supabase.rpc('unschedule_imaging_email_monitoring', { p_config_id: config.id });
      }
      await deleteImagingEmailConfig(config.id);
      setConfigs(prev => prev.filter(c => c.id !== config.id));
      if (expandedId === config.id) {
        setExpandedId(configs.find(c => c.id !== config.id)?.id || null);
      }
      setSuccess('Email account deleted.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete configuration');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async (config: ImagingEmailMonitoringConfig) => {
    if (!config.id) return;
    setTestingId(config.id);
    setError('');
    setSuccess('');
    try {
      if (config.provider === 'office365') {
        const { data, error: fnErr } = await supabase.functions.invoke('test-office365', {
          body: {
            mode: 'monitor',
            tenantId: config.tenantId,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            monitoredEmail: config.monitoredEmail,
          },
        });
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        setSuccess(`"${config.configName}" - Office 365 connection test successful.`);
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke('test-email-connection', {
          body: {
            provider: 'gmail',
            gmailClientId: config.gmailClientId,
            gmailClientSecret: config.gmailClientSecret,
            gmailRefreshToken: config.gmailRefreshToken,
          },
        });
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        setSuccess(`"${config.configName}" - Gmail connection test successful.`);
      }
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleRunNow = async (config: ImagingEmailMonitoringConfig) => {
    if (!config.id) return;
    setRunningId(config.id);
    setError('');
    setSuccess('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('imaging-email-monitor', {
        body: { configId: config.id },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      const msg = data?.emailsFound !== undefined
        ? `"${config.configName}" - ${data.emailsFound} email(s) found, ${data.pdfsProcessed || 0} PDF(s) processed, ${data.indexed || 0} indexed, ${data.unindexed || 0} unindexed.`
        : `"${config.configName}" - monitor completed successfully.`;
      setSuccess(msg);
      setTimeout(() => setSuccess(''), 6000);
    } catch (err: any) {
      setError(err.message || 'Failed to run imaging email monitor');
    } finally {
      setRunningId(null);
    }
  };

  const handleSaveCronSettings = async () => {
    setIsLoadingCron('cron-settings');
    setCronActionResult(null);
    try {
      const { error: rpcErr } = await supabase.rpc('save_cron_settings', {
        p_supabase_url: cronConfigData.supabaseUrl,
        p_supabase_anon_key: cronConfigData.supabaseAnonKey,
      });
      if (rpcErr) throw rpcErr;
      setCronActionResult({ configId: '', success: true, message: 'Cron settings saved successfully!' });
      setShowCronConfig(false);
      await fetchCronSettingsData();
    } catch (err: any) {
      setCronActionResult({ configId: '', success: false, message: err.message || 'Failed to save cron settings' });
    } finally {
      setIsLoadingCron(null);
    }
  };

  const handleScheduleCron = async (config: ImagingEmailMonitoringConfig) => {
    if (!config.id) return;
    setIsLoadingCron(config.id);
    setCronActionResult(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('schedule_imaging_email_monitoring', { p_config_id: config.id });
      if (rpcErr) throw rpcErr;
      if (data.success) {
        setCronActionResult({ configId: config.id, success: true, message: `Scheduled! Job ID: ${data.job_id}, Schedule: ${data.schedule}` });
      } else {
        setCronActionResult({ configId: config.id, success: false, message: data.error });
      }
      await fetchCronStatusForConfig(config.id);
    } catch (err: any) {
      setCronActionResult({ configId: config.id, success: false, message: err.message || 'Failed to schedule cron job' });
    } finally {
      setIsLoadingCron(null);
    }
  };

  const handleUnscheduleCron = async (config: ImagingEmailMonitoringConfig) => {
    if (!config.id) return;
    setIsLoadingCron(config.id);
    setCronActionResult(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('unschedule_imaging_email_monitoring', { p_config_id: config.id });
      if (rpcErr) throw rpcErr;
      if (data.success) {
        setCronActionResult({ configId: config.id, success: true, message: 'Scheduled monitoring disabled.' });
      } else {
        setCronActionResult({ configId: config.id, success: false, message: data.error });
      }
      await fetchCronStatusForConfig(config.id);
    } catch (err: any) {
      setCronActionResult({ configId: config.id, success: false, message: err.message || 'Failed to unschedule cron job' });
    } finally {
      setIsLoadingCron(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Mail className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Provider Configuration</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            {configs.length} account{configs.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={handleAddConfig}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Email Account</span>
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {configs.length === 0 && (
        <div className="text-center py-12">
          <Mail className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No email accounts configured.</p>
          {isAdmin && (
            <button onClick={handleAddConfig}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="h-4 w-4" />
              <span>Add Email Account</span>
            </button>
          )}
        </div>
      )}

      {configs.map((config) => {
        const isExpanded = expandedId === config.id;
        const cronStatus = config.id ? cronStatuses[config.id] : null;
        const isSaving = savingId === config.id;
        const isTesting = testingId === config.id;
        const isRunning = runningId === config.id;
        const isDeleting = deletingId === config.id;

        return (
          <div key={config.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : (config.id || null))}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center space-x-3">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <Mail className="h-4 w-4 text-blue-500" />
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {config.configName || 'Unnamed Account'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {config.provider === 'office365' ? 'Office 365' : 'Gmail'} -- {config.monitoredEmail || '(no email set)'}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {cronStatus?.enabled && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    Scheduled
                  </span>
                )}
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${config.isEnabled ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'}`}>
                  {config.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Account Name</label>
                    <input type="text" className={inputCls} value={config.configName}
                      onChange={(e) => updateConfig(config.id, { configName: e.target.value })}
                      placeholder="e.g., AR - Receivables" disabled={!isAdmin} />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Monitoring</span>
                      <button onClick={() => updateConfig(config.id, { isEnabled: !config.isEnabled })} disabled={!isAdmin}>
                        {config.isEnabled ? <ToggleRight className="h-6 w-6 text-green-500" /> : <ToggleLeft className="h-6 w-6 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Email Provider</label>
                  <div className="flex space-x-2">
                    {(['office365', 'gmail'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => updateConfig(config.id, { provider: p })}
                        disabled={!isAdmin}
                        className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                          config.provider === p
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {p === 'office365' ? 'Office 365' : 'Gmail'}
                      </button>
                    ))}
                  </div>
                </div>

                {config.provider === 'office365' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Tenant ID</label>
                        <input type="text" className={inputCls} value={config.tenantId} onChange={(e) => updateConfig(config.id, { tenantId: e.target.value })} disabled={!isAdmin} />
                      </div>
                      <div>
                        <label className={labelCls}>Client ID</label>
                        <input type="text" className={inputCls} value={config.clientId} onChange={(e) => updateConfig(config.id, { clientId: e.target.value })} disabled={!isAdmin} />
                      </div>
                      <div>
                        <label className={labelCls}>Client Secret</label>
                        <input type="password" className={inputCls} value={config.clientSecret} onChange={(e) => updateConfig(config.id, { clientSecret: e.target.value })} disabled={!isAdmin} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Monitored Email Address</label>
                      <input type="email" className={inputCls} value={config.monitoredEmail} onChange={(e) => updateConfig(config.id, { monitoredEmail: e.target.value })} placeholder="imaging@example.com" disabled={!isAdmin} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Gmail Client ID</label>
                        <input type="text" className={inputCls} value={config.gmailClientId} onChange={(e) => updateConfig(config.id, { gmailClientId: e.target.value })} disabled={!isAdmin} />
                      </div>
                      <div>
                        <label className={labelCls}>Gmail Client Secret</label>
                        <input type="password" className={inputCls} value={config.gmailClientSecret} onChange={(e) => updateConfig(config.id, { gmailClientSecret: e.target.value })} disabled={!isAdmin} />
                      </div>
                      <div>
                        <label className={labelCls}>Gmail Refresh Token</label>
                        <input type="password" className={inputCls} value={config.gmailRefreshToken} onChange={(e) => updateConfig(config.id, { gmailRefreshToken: e.target.value })} disabled={!isAdmin} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Monitored Label</label>
                      <input type="text" className={inputCls} value={config.gmailMonitoredLabel} onChange={(e) => updateConfig(config.id, { gmailMonitoredLabel: e.target.value })} placeholder="INBOX" disabled={!isAdmin} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Target Imaging Bucket</label>
                    <CustomDropdown
                      value={config.imagingBucketId || ''}
                      onChange={(val) => updateConfig(config.id, { imagingBucketId: val || null })}
                      placeholder="Select bucket..."
                      options={buckets.filter(b => b.isActive).map(b => ({ value: b.id, label: b.name }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Polling Interval (minutes)</label>
                    <input type="number" className={inputCls} value={config.pollingInterval} onChange={(e) => updateConfig(config.id, { pollingInterval: parseInt(e.target.value) || 5 })} min={1} disabled={!isAdmin} />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Check All Messages (ignore last check timestamp)</span>
                  <button onClick={() => updateConfig(config.id, { checkAllMessages: !config.checkAllMessages })} disabled={!isAdmin}>
                    {config.checkAllMessages ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Send All Email PDFs to Unindexed Queue</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      When on, every PDF from this email account is routed to the Unindexed Queue. Multi-page PDFs are added as a Batch; single-page PDFs are added as a single item. Subject and barcode rules are ignored while this is on.
                    </p>
                  </div>
                  <button
                    onClick={() => updateConfig(config.id, { forceToUnindexedQueue: !config.forceToUnindexedQueue })}
                    disabled={!isAdmin}
                    className="flex-shrink-0 mt-0.5"
                    aria-label="Toggle force to unindexed queue"
                  >
                    {config.forceToUnindexedQueue ? <ToggleRight className="h-6 w-6 text-green-500" /> : <ToggleLeft className="h-6 w-6 text-gray-400" />}
                  </button>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">After Processing Actions</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={labelCls}>On Success</label>
                      <CustomDropdown
                        value={config.postProcessAction}
                        onChange={(val) => updateConfig(config.id, { postProcessAction: val as PostProcessAction })}
                        options={POST_PROCESS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                      />
                      {config.postProcessAction === 'move' && (
                        <input type="text" className={inputCls} value={config.processedFolderPath} onChange={(e) => updateConfig(config.id, { processedFolderPath: e.target.value })} placeholder="Folder name" disabled={!isAdmin} />
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls}>On Failure</label>
                      <CustomDropdown
                        value={config.postProcessActionOnFailure}
                        onChange={(val) => updateConfig(config.id, { postProcessActionOnFailure: val as PostProcessAction })}
                        options={POST_PROCESS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                      />
                      {config.postProcessActionOnFailure === 'move' && (
                        <input type="text" className={inputCls} value={config.failureFolderPath} onChange={(e) => updateConfig(config.id, { failureFolderPath: e.target.value })} placeholder="Folder name" disabled={!isAdmin} />
                      )}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button onClick={() => handleSave(config)} disabled={isSaving}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span>Save</span>
                    </button>
                    <button onClick={() => handleTest(config)} disabled={isTesting}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      <span>Test Connection</span>
                    </button>
                    <button onClick={() => handleRunNow(config)} disabled={isRunning}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      <span>Run Now</span>
                    </button>
                    <button onClick={() => handleDelete(config)} disabled={isDeleting}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto">
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      <span>Delete</span>
                    </button>
                  </div>
                )}

                {config.lastCheck && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last check: {new Date(config.lastCheck).toLocaleString()}
                  </p>
                )}

                {/* Scheduled Monitoring */}
                <div className="bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                        <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Scheduled Monitoring</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Auto-poll on a timer using pg_cron</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => config.id && fetchCronStatusForConfig(config.id)} disabled={isLoadingCron === config.id}
                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors" title="Refresh">
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoadingCron === config.id ? 'animate-spin' : ''}`} />
                      </button>
                      {cronStatus?.enabled ? (
                        <span className="flex items-center space-x-1 text-green-600 dark:text-green-400 text-xs font-medium">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-gray-500 dark:text-gray-400 text-xs font-medium">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Inactive</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {cronActionResult && cronActionResult.configId === config.id && (
                    <div className={`mb-3 border rounded-lg p-2.5 text-sm ${
                      cronActionResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
                    }`}>
                      {cronActionResult.message}
                    </div>
                  )}

                  {!cronSettings?.configured && (
                    <div className="mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Configuration Required</p>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                            Configure Supabase connection settings below to enable scheduled monitoring.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-gray-900 dark:text-gray-100 text-sm">Connection Settings</h5>
                        <button onClick={() => setShowCronConfig(!showCronConfig)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1">
                          <Settings className="h-3.5 w-3.5" />
                          <span>{showCronConfig ? 'Hide' : 'Configure'}</span>
                        </button>
                      </div>

                      {!showCronConfig && cronSettings && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Supabase URL:</span>
                            <span className="ml-1 text-gray-900 dark:text-gray-100">{cronSettings.supabaseUrl || '(not set)'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Anon Key:</span>
                            <span className="ml-1 text-gray-900 dark:text-gray-100">{cronSettings.supabaseAnonKeyMasked || '(not set)'}</span>
                          </div>
                        </div>
                      )}

                      {showCronConfig && (
                        <div className="space-y-3 mt-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Supabase URL</label>
                            <input type="text" value={cronConfigData.supabaseUrl} onChange={(e) => setCronConfigData(prev => ({ ...prev, supabaseUrl: e.target.value }))} className={inputCls} placeholder="https://your-project.supabase.co" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Supabase Anon Key</label>
                            <input type="password" value={cronConfigData.supabaseAnonKey} onChange={(e) => setCronConfigData(prev => ({ ...prev, supabaseAnonKey: e.target.value }))} className={inputCls} placeholder="eyJ..." />
                          </div>
                          <div className="flex justify-end">
                            <button onClick={handleSaveCronSettings} disabled={isLoadingCron === 'cron-settings' || !cronConfigData.supabaseUrl || !cronConfigData.supabaseAnonKey}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors">
                              {isLoadingCron === 'cron-settings' ? 'Saving...' : 'Save Settings'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {cronStatus && (
                      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-700/50">
                        <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2 text-sm">Schedule Status</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                          <div className="flex items-center space-x-1.5">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-gray-500 dark:text-gray-400">Schedule:</span>
                            <span className="text-gray-900 dark:text-gray-100 font-mono">
                              {cronStatus.schedule || `Every ${config.pollingInterval} min`}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-gray-500 dark:text-gray-400">Last Run:</span>
                            <span className="text-gray-900 dark:text-gray-100">
                              {cronStatus.lastCronRun ? new Date(cronStatus.lastCronRun).toLocaleString() : 'Never'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-gray-500 dark:text-gray-400">Next Run:</span>
                            <span className="text-gray-900 dark:text-gray-100">
                              {cronStatus.nextCronRun ? new Date(cronStatus.nextCronRun).toLocaleString() : 'Not scheduled'}
                            </span>
                          </div>
                          {cronStatus.lastRunStatus && (
                            <div className="flex items-center space-x-1.5">
                              {cronStatus.lastRunStatus === 'succeeded' ? (
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              )}
                              <span className="text-gray-500 dark:text-gray-400">Status:</span>
                              <span className={`font-medium ${cronStatus.lastRunStatus === 'succeeded' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {cronStatus.lastRunStatus}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Interval: <strong>{config.pollingInterval} min</strong>. Save above before enabling.
                        </p>
                        <div className="flex items-center space-x-2">
                          {cronStatus?.enabled ? (
                            <button onClick={() => handleUnscheduleCron(config)} disabled={isLoadingCron === config.id}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center space-x-1.5">
                              <Pause className="h-3.5 w-3.5" />
                              <span>{isLoadingCron === config.id ? 'Stopping...' : 'Stop'}</span>
                            </button>
                          ) : (
                            <button onClick={() => handleScheduleCron(config)} disabled={isLoadingCron === config.id || !cronSettings?.configured}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center space-x-1.5">
                              <Play className="h-3.5 w-3.5" />
                              <span>{isLoadingCron === config.id ? 'Starting...' : 'Start'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
