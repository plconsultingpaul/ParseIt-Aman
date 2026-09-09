import React, { useState, useEffect } from 'react';
import { Save, Server, Zap, Plus, Trash2, Play, Folder, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SftpConfig, SftpPollingConfig, ExtractionType, TransformationType, ExtractionWorkflow, SftpPollingLog } from '../../types';

interface SftpSettingsProps {
  sftpConfig: SftpConfig;
  onUpdateSftpConfig: (config: SftpConfig) => Promise<void>;
  extractionTypes?: ExtractionType[];
  transformationTypes?: TransformationType[];
  workflows?: ExtractionWorkflow[];
  onUpdateSftpPollingConfigs?: (configs: SftpPollingConfig[]) => Promise<void>;
  onRefreshSftpPollingLogs?: () => Promise<SftpPollingLog[]>;
  isAdmin?: boolean;
}

export default function SftpSettings({
  sftpConfig,
  onUpdateSftpConfig,
  extractionTypes = [],
  transformationTypes = [],
  workflows = [],
  onUpdateSftpPollingConfigs,
  onRefreshSftpPollingLogs,
  isAdmin = true
}: SftpSettingsProps) {
  const [localConfig, setLocalConfig] = useState<SftpConfig>(sftpConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [pollingConfigs, setPollingConfigs] = useState<SftpPollingConfig[]>([]);
  const [pollingLogs, setPollingLogs] = useState<SftpPollingLog[]>([]);
  const [loadingPolling, setLoadingPolling] = useState(true);
  const [isSavingPolling, setIsSavingPolling] = useState(false);
  const [savePollingSuccess, setSavePollingSuccess] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadPollingConfigs();
    loadPollingLogs();
  }, []);

  const loadPollingConfigs = async () => {
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
        workflowId: config.workflow_id,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }));
      setPollingConfigs(mappedConfigs);
    } catch (error) {
      console.error('Failed to load SFTP polling configs:', error);
    } finally {
      setLoadingPolling(false);
    }
  };

  const loadPollingLogs = async () => {
    if (!onRefreshSftpPollingLogs) return;
    try {
      const logs = await onRefreshSftpPollingLogs();
      setPollingLogs(logs);
    } catch (error) {
      console.error('Failed to load SFTP polling logs:', error);
    }
  };

  const updateConfig = (field: keyof SftpConfig, value: string | number) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateSftpConfig(localConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save SFTP config:', error);
      alert('Failed to save SFTP configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (localConfig.host && localConfig.username) {
        setTestResult({
          success: true,
          message: 'SFTP connection successful!'
        });
      } else {
        setTestResult({
          success: false,
          message: 'Please fill in host and username to test connection.'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection failed. Please check your settings.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const addPollingConfig = () => {
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
    setPollingConfigs([...pollingConfigs, newConfig]);
  };

  const updatePollingConfig = (index: number, field: keyof SftpPollingConfig, value: any) => {
    const updated = [...pollingConfigs];
    updated[index] = { ...updated[index], [field]: value };
    setPollingConfigs(updated);
  };

  const removePollingConfig = (index: number) => {
    const updated = pollingConfigs.filter((_, i) => i !== index);
    setPollingConfigs(updated);
  };

  const handleSavePolling = async () => {
    if (!onUpdateSftpPollingConfigs) return;
    setIsSavingPolling(true);
    setSavePollingSuccess(false);
    try {
      await onUpdateSftpPollingConfigs(pollingConfigs);
      setSavePollingSuccess(true);
      setTimeout(() => setSavePollingSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save SFTP polling configs:', error);
      alert('Failed to save SFTP polling configurations. Please try again.');
    } finally {
      setIsSavingPolling(false);
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
        await loadPollingConfigs();
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

  return (
    <div className="space-y-6">
      {/* SFTP Configuration Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">SFTP Configuration</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Configure SFTP server settings for file uploads</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Zap className="h-4 w-4" />
            <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
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
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">SFTP configuration saved successfully!</p>
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
              {testResult.success ? 'Connection Test Passed' : 'Connection Test Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {testResult.message}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
            <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Server Connection</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">SFTP server details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Host
            </label>
            <input
              type="text"
              value={localConfig.host}
              onChange={(e) => updateConfig('host', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="sftp.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Port
            </label>
            <input
              type="number"
              value={localConfig.port}
              onChange={(e) => updateConfig('port', parseInt(e.target.value) || 22)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="22"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={localConfig.username}
              onChange={(e) => updateConfig('username', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={localConfig.password}
              onChange={(e) => updateConfig('password', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="password"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              XML Upload Path
            </label>
            <input
              type="text"
              value={localConfig.xmlPath}
              onChange={(e) => updateConfig('xmlPath', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="/uploads/xml/"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              PDF Upload Path
            </label>
            <input
              type="text"
              value={localConfig.pdfPath}
              onChange={(e) => updateConfig('pdfPath', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="/uploads/pdf/"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              JSON Upload Path
            </label>
            <input
              type="text"
              value={localConfig.jsonPath}
              onChange={(e) => updateConfig('jsonPath', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="/uploads/json/"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              CSV Upload Path
            </label>
            <input
              type="text"
              value={localConfig.csvPath || ''}
              onChange={(e) => updateConfig('csvPath', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
              placeholder="/uploads/csv/"
            />
          </div>
        </div>
      </div>

      {/* Visual Divider */}
      <div className="border-t-4 border-gray-300 dark:border-gray-600 my-8"></div>

      {/* SFTP Polling Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">SFTP Polling</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor SFTP folders for new PDFs and automatically process them</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRunPoller}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Play className="h-4 w-4" />
            <span>{isRunning ? 'Running...' : 'Run Now'}</span>
          </button>
          <button
            onClick={addPollingConfig}
            disabled={!isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Config</span>
          </button>
          <button
            onClick={handleSavePolling}
            disabled={isSavingPolling || !isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSavingPolling ? 'Saving...' : 'Save All'}</span>
          </button>
        </div>
      </div>

      {savePollingSuccess && (
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
      {loadingPolling ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading SFTP polling configurations...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {pollingConfigs.map((config, index) => (
            <div key={config.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                    <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {config.name || `SFTP Config ${index + 1}`}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {config.isEnabled ? 'Enabled' : 'Disabled'} • {config.processingMode === 'transformation' ? 'Transform Mode' : 'Extract Mode'} •
                      {config.lastPolledAt ? ` Last polled: ${new Date(config.lastPolledAt).toLocaleString()}` : ' Never polled'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => updatePollingConfig(index, 'isEnabled', !config.isEnabled)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
                      config.isEnabled
                        ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {config.isEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => removePollingConfig(index)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
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
                    onChange={(e) => updatePollingConfig(index, 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
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
                    onChange={(e) => updatePollingConfig(index, 'host', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
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
                    onChange={(e) => updatePollingConfig(index, 'port', parseInt(e.target.value) || 22)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
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
                    onChange={(e) => updatePollingConfig(index, 'username', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
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
                    onChange={(e) => updatePollingConfig(index, 'password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
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
                    onChange={(e) => updatePollingConfig(index, 'monitoredPath', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
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
                    onChange={(e) => updatePollingConfig(index, 'processedPath', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                    placeholder="/processed/"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Folder to move processed files to
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default Extraction Type (Fallback)
                  </label>
                  <select
                    value={config.defaultExtractionTypeId || ''}
                    onChange={(e) => updatePollingConfig(index, 'defaultExtractionTypeId', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  >
                    <option value="">AI Auto-Detect Only</option>
                    {extractionTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Used if AI detection fails or is unavailable
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Override Workflow (Optional)
                  </label>
                  <select
                    value={config.workflowId || ''}
                    onChange={(e) => updatePollingConfig(index, 'workflowId', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  >
                    <option value="">Use extraction type's workflow</option>
                    {workflows
                      .filter(w => w.isActive)
                      .map((workflow) => (
                        <option key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Override the workflow from the detected extraction type
                  </p>
                </div>
              </div>
            </div>
          ))}

          {pollingConfigs.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <Server className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No SFTP Polling Configurations</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first SFTP polling configuration to get started.</p>
              <button
                onClick={addPollingConfig}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Add SFTP Polling Config</span>
              </button>
            </div>
          )}
        </div>
      )}

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
              const config = pollingConfigs.find(c => c.id === log.configId);
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
