import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Server, Zap, Play, Folder, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SftpPollingConfig, ExtractionType, TransformationType, ExtractionWorkflow, SftpPollingLog, ImagingBucket } from '../../types';
import { fetchBuckets as fetchImagingBuckets } from '../../services/imagingService';
import CustomDropdown from '../common/CustomDropdown';

interface SftpPollingSettingsProps {
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  workflows: ExtractionWorkflow[];
  onUpdateSftpPollingConfigs: (configs: SftpPollingConfig[]) => Promise<void>;
  onRefreshSftpPollingLogs: () => Promise<SftpPollingLog[]>;
}

export default function SftpPollingSettings({
  extractionTypes,
  transformationTypes,
  workflows,
  onUpdateSftpPollingConfigs,
  onRefreshSftpPollingLogs
}: SftpPollingSettingsProps) {
  const [configs, setConfigs] = useState<SftpPollingConfig[]>([]);
  const [pollingLogs, setPollingLogs] = useState<SftpPollingLog[]>([]);
  const [imagingBuckets, setImagingBuckets] = useState<ImagingBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadPollingLogs();
    fetchImagingBuckets().then(setImagingBuckets).catch(console.error);
  }, []);

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('sftp_polling_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedConfigs: SftpPollingConfig[] = (data || []).map((config: any) => ({
        id: config.id,
        name: config.name,
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        monitoredPath: config.monitored_path,
        processedPath: config.processed_path,
        isEnabled: config.is_enabled,
        lastPolledAt: config.last_polled_at,
        defaultExtractionTypeId: config.default_extraction_type_id,
        defaultTransformationTypeId: config.default_transformation_type_id,
        processingMode: config.processing_mode || 'extraction',
        imagingBucketId: config.imaging_bucket_id,
        workflowId: config.workflow_id,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }));
      setConfigs(mappedConfigs);
    } catch (error) {
      console.error('Failed to load SFTP polling configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPollingLogs = async () => {
    try {
      const logs = await onRefreshSftpPollingLogs();
      setPollingLogs(logs);
    } catch (error) {
      console.error('Failed to load SFTP polling logs:', error);
    }
  };

  const addConfig = () => {
    const newConfig: SftpPollingConfig = {
      id: `temp-${Date.now()}`,
      name: '',
      host: '',
      port: 22,
      username: '',
      password: '',
      monitoredPath: '/inbox/pdfs/',
      processedPath: '/processed/',
      isEnabled: true,
      processingMode: 'extraction'
    };
    setConfigs([...configs, newConfig]);
  };

  const updateConfig = (index: number, field: keyof SftpPollingConfig, value: any) => {
    const updated = [...configs];
    updated[index] = { ...updated[index], [field]: value };
    setConfigs(updated);
  };

  const removeConfig = (index: number) => {
    const updated = configs.filter((_, i) => i !== index);
    setConfigs(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateSftpPollingConfigs(configs);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save SFTP polling configs:', error);
      alert('Failed to save SFTP polling configurations. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunPoller = async () => {
    setIsRunning(true);
    setRunResult(null);

    try {
      const { data: result, error } = await supabase.functions.invoke('sftp-poller', {
        method: 'POST',
      });

      if (error) {
        setRunResult({
          success: false,
          message: error.message || 'SFTP polling failed'
        });
      } else {
        setRunResult({
          success: true,
          message: result?.message || 'Polling completed'
        });
        await loadPollingLogs();
        await loadConfigs();
      }
    } catch (error) {
      setRunResult({
        success: false,
        message: 'Failed to run SFTP poller. Please try again.'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRefreshLogs = async () => {
    setIsRefreshing(true);
    try {
      await loadPollingLogs();
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getExtractionTypeName = (typeId?: string) => {
    if (!typeId) return 'AI Auto-Detect';
    const type = extractionTypes.find(t => t.id === typeId);
    return type?.name || 'Unknown Type';
  };

  const getTransformationTypeName = (typeId?: string) => {
    if (!typeId) return 'None Selected';
    const type = transformationTypes.find(t => t.id === typeId);
    return type?.name || 'Unknown Type';
  };
  const getWorkflowName = (workflowId?: string) => {
    if (!workflowId) return 'Default Processing';
    const workflow = workflows.find(w => w.id === workflowId);
    return workflow?.name || 'Unknown Workflow';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600">Loading SFTP polling configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">SFTP Polling</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor SFTP folders for new PDFs and automatically process them</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRunPoller}
            disabled={isRunning}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Play className="h-4 w-4" />
            <span>{isRunning ? 'Running...' : 'Run Now'}</span>
          </button>
          <button
            onClick={addConfig}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Config</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save All'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">SFTP polling configurations saved successfully!</p>
        </div>
      )}

      {runResult && (
        <div className={`border rounded-lg p-4 ${
          runResult.success 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' 
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-4 h-4 rounded-full ${
              runResult.success ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-semibold ${
              runResult.success ? 'text-green-800' : 'text-red-800'
            } dark:${runResult.success ? 'text-green-300' : 'text-red-300'}`}>
              {runResult.success ? 'Polling Completed' : 'Polling Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            runResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {runResult.message}
          </p>
        </div>
      )}

      {/* SFTP Polling Configurations */}
      <div className="space-y-4">
        {configs.map((config, index) => (
          <div key={config.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg">
                  <Server className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {config.name || `SFTP Config ${index + 1}`}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {config.isEnabled ? 'Enabled' : 'Disabled'} • {config.processingMode === 'imaging' ? 'Imaging Mode' : config.processingMode === 'transformation' ? 'Transform Mode' : 'Extract Mode'} •
                    {config.lastPolledAt ? ` Last polled: ${new Date(config.lastPolledAt).toLocaleString()}` : ' Never polled'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => updateConfig(index, 'isEnabled', !config.isEnabled)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
                    config.isEnabled
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {config.isEnabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => removeConfig(index)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Configuration Name
                </label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => updateConfig(index, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Supplier A Invoices"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SFTP Host
                </label>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => updateConfig(index, 'host', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="sftp.example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Port
                </label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => updateConfig(index, 'port', parseInt(e.target.value) || 22)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="22"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={config.username}
                  onChange={(e) => updateConfig(index, 'username', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={config.password}
                  onChange={(e) => updateConfig(index, 'password', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="password"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center space-x-2">
                    <Folder className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Monitored Path</span>
                  </div>
                </label>
                <input
                  type="text"
                  value={config.monitoredPath}
                  onChange={(e) => updateConfig(index, 'monitoredPath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="/inbox/pdfs/"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Folder to monitor for new PDF files
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center space-x-2">
                    <Folder className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span>Processed Path</span>
                  </div>
                </label>
                <input
                  type="text"
                  value={config.processedPath}
                  onChange={(e) => updateConfig(index, 'processedPath', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="/processed/"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Folder to move processed files to
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Processing Mode
                </label>
                <CustomDropdown
                  value={config.processingMode || 'extraction'}
                  onChange={(val) => updateConfig(index, 'processingMode', val)}
                  options={[
                    { value: 'extraction', label: 'Extract Mode' },
                    { value: 'transformation', label: 'Transform Mode' },
                    { value: 'imaging', label: 'Imaging Mode' },
                  ]}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {config.processingMode === 'imaging'
                    ? 'Scans PDFs for barcodes and indexes them into an imaging bucket'
                    : config.processingMode === 'transformation'
                    ? 'Analyzes PDFs to generate new filenames and renamed'
                    : 'Extracts data from PDFs and uploads to SFTP/API'}
                </p>
              </div>
              {config.processingMode === 'imaging' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Imaging Bucket
                  </label>
                  <CustomDropdown
                    value={config.imagingBucketId || ''}
                    onChange={(val) => updateConfig(index, 'imagingBucketId', val || undefined)}
                    placeholder="Select imaging bucket..."
                    options={imagingBuckets.filter(b => b.isActive).map(b => ({ value: b.id, label: b.name }))}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Documents will be indexed into this bucket based on barcode patterns
                  </p>
                </div>
              )}
            </div>

            {config.processingMode !== 'imaging' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Default Extraction Type (Fallback)
                </label>
                <CustomDropdown
                  value={config.defaultExtractionTypeId || ''}
                  onChange={(val) => updateConfig(index, 'defaultExtractionTypeId', val || undefined)}
                  placeholder="AI Auto-Detect Only"
                  options={extractionTypes.map(type => ({ value: type.id, label: type.name }))}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Used if AI detection fails or is unavailable
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Override Workflow (Optional)
                </label>
                <CustomDropdown
                  value={config.workflowId || ''}
                  onChange={(val) => updateConfig(index, 'workflowId', val || undefined)}
                  placeholder="Use extraction type's workflow"
                  options={workflows.filter(w => w.isActive).map(wf => ({ value: wf.id, label: wf.name }))}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Override the workflow from the detected extraction type
                </p>
              </div>
            </div>
            )}
          </div>
        ))}

        {configs.length === 0 && (
          <div className="text-center py-12">
            <Server className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No SFTP Polling Configurations</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first SFTP polling configuration to get started.</p>
            <button
              onClick={addConfig}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add SFTP Polling Config</span>
            </button>
          </div>
        )}
      </div>

      {/* Polling Logs */}
      {pollingLogs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Recent Polling Activity</h4>
              <button
                onClick={handleRefreshLogs}
                disabled={isRefreshing}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded transition-colors duration-200 flex items-center space-x-1"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {pollingLogs.slice(0, 10).map((log) => {
              const config = configs.find(c => c.id === log.configId);
              return (
                <div key={log.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        log.status === 'success' ? 'bg-green-500' : 
                        log.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                      }`}></div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {config?.name || 'Unknown Config'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {log.filesProcessed} / {log.filesFound} files processed
                      </p>
                      {log.executionTimeMs && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {log.executionTimeMs < 1000 ? `${log.executionTimeMs}ms` : `${(log.executionTimeMs / 1000).toFixed(1)}s`}
                        </p>
                      )}
                    </div>
                  </div>
                  {log.errorMessage && (
                    <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
                      <p className="text-red-700 dark:text-red-400 text-sm">{log.errorMessage}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">How SFTP Polling Works</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• The system periodically checks configured SFTP folders for new PDF files</li>
          <li>• Each PDF is analyzed using AI to automatically detect the best extraction or transformation type</li>
          <li>• If AI detection fails, the configured default type is used based on processing mode</li>
          <li>• <strong>Extract Mode:</strong> PDFs are processed for data extraction and uploaded to SFTP/API</li>
          <li>• <strong>Transform Mode:</strong> PDFs are analyzed to generate new filenames and renamed</li>
          <li>• <strong>Imaging Mode:</strong> PDFs are scanned for barcodes and indexed into an imaging bucket (unmatched go to the Unindexed Queue)</li>
          <li>• Successfully processed files are moved to the processed folder</li>
          <li>• You can set up multiple configurations to monitor different folders or servers</li>
          <li>• Use Supabase cron jobs to schedule automatic polling (e.g., every 5 minutes)</li>
        </ul>
      </div>

      {/* Setup Instructions */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Setting Up Automatic Polling</h4>
        <div className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
          <p>
            <strong>To enable automatic polling:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Save your SFTP polling configurations above</li>
            <li>Go to your Supabase project dashboard</li>
            <li>Navigate to "Database" → "Functions" → "Cron Jobs"</li>
            <li>Create a new cron job with your desired schedule (e.g., <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">*/5 * * * *</code> for every 5 minutes)</li>
            <li>Set the function to call: <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">sftp-poller</code></li>
            <li>Enable the cron job to start automatic polling</li>
          </ol>
          <p className="mt-2">
            <strong>Note:</strong> You can also use the "Run Now" button above to manually trigger polling for testing.
          </p>
        </div>
      </div>
    </div>
  );
}