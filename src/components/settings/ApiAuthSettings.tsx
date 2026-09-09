import React, { useState, useEffect } from 'react';
import { Save, Zap, Lock, Globe, User, Key, CheckCircle, XCircle, Loader2, Plus, Trash2, Shield } from 'lucide-react';
import {
  fetchAllApiAuthConfigs,
  createApiAuthConfig,
  updateApiAuthConfig,
  deleteApiAuthConfig,
  testApiAuthConnection,
  type ApiAuthConfigDB
} from '../../services/configService';

interface ConfigFormData {
  name: string;
  loginEndpoint: string;
  pingEndpoint: string;
  tokenFieldName: string;
  username: string;
  password: string;
  isActive: boolean;
}

const emptyConfig: ConfigFormData = {
  name: '',
  loginEndpoint: '',
  pingEndpoint: '',
  tokenFieldName: 'access_token',
  username: '',
  password: '',
  isActive: true
};

export default function ApiAuthSettings() {
  const [configs, setConfigs] = useState<ApiAuthConfigDB[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ConfigFormData>(emptyConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setIsLoading(true);
      const data = await fetchAllApiAuthConfigs();
      setConfigs(data);

      if (data.length > 0 && !selectedConfigId) {
        selectConfig(data[0]);
      }
    } catch (error) {
      console.error('Failed to load API auth configs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectConfig = (config: ApiAuthConfigDB) => {
    setSelectedConfigId(config.id);
    setFormData({
      name: config.name,
      loginEndpoint: config.loginEndpoint,
      pingEndpoint: config.pingEndpoint,
      tokenFieldName: config.tokenFieldName || 'access_token',
      username: config.username,
      password: config.password,
      isActive: config.isActive
    });
    setIsCreatingNew(false);
    setTestResult(null);
    setSaveSuccess(false);
  };

  const handleNewConfig = () => {
    setSelectedConfigId(null);
    setFormData(emptyConfig);
    setIsCreatingNew(true);
    setTestResult(null);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a name for this authentication configuration.');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      let savedConfig: ApiAuthConfigDB;

      if (isCreatingNew) {
        if (!formData.password) {
          alert('Password is required for new configurations.');
          setIsSaving(false);
          return;
        }
        savedConfig = await createApiAuthConfig(formData);
        setConfigs(prev => [...prev, savedConfig]);
        setSelectedConfigId(savedConfig.id);
        setIsCreatingNew(false);
      } else if (selectedConfigId) {
        savedConfig = await updateApiAuthConfig(selectedConfigId, formData);
        setConfigs(prev => prev.map(c => c.id === selectedConfigId ? savedConfig : c));
      } else {
        return;
      }

      setFormData(prev => ({ ...prev, password: '' }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save API auth config:', error);
      alert('Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedConfigId) return;

    setIsDeleting(true);
    try {
      await deleteApiAuthConfig(selectedConfigId);

      const remainingConfigs = configs.filter(c => c.id !== selectedConfigId);
      setConfigs(remainingConfigs);

      if (remainingConfigs.length > 0) {
        selectConfig(remainingConfigs[0]);
      } else {
        setSelectedConfigId(null);
        setFormData(emptyConfig);
        setIsCreatingNew(false);
      }

      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete API auth config:', error);
      alert('Failed to delete configuration. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTest = async () => {
    if (selectedConfigId && !isCreatingNew) {
      setIsTesting(true);
      setTestResult(null);
      const result = await testApiAuthConnection({ configId: selectedConfigId });
      setTestResult(result);
      setIsTesting(false);
      return;
    }

    if (!formData.loginEndpoint || !formData.username) {
      setTestResult({
        success: false,
        message: 'Please fill in Login Endpoint and Username'
      });
      return;
    }

    if (!formData.password) {
      setTestResult({
        success: false,
        message: 'Please enter a password for new configurations'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const result = await testApiAuthConnection({
      loginEndpoint: formData.loginEndpoint,
      pingEndpoint: formData.pingEndpoint,
      username: formData.username,
      password: formData.password,
      tokenFieldName: formData.tokenFieldName,
    });

    setTestResult(result);
    setIsTesting(false);
  };

  const updateFormField = (field: keyof ConfigFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Token Authentication</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure multiple API authentication endpoints for different services
          </p>
        </div>
        <button
          onClick={handleNewConfig}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>New Authentication</span>
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <h5 className="font-semibold text-gray-900 dark:text-gray-100">Configurations</h5>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{configs.length} authentication{configs.length !== 1 ? 's' : ''} configured</p>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
              {configs.length === 0 && !isCreatingNew && (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No authentication configurations yet.</p>
                  <p className="text-xs mt-1">Click "New Authentication" to add one.</p>
                </div>
              )}
              {isCreatingNew && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-lg">
                      <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-blue-900 dark:text-blue-100 truncate">
                        New Configuration
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Unsaved</p>
                    </div>
                  </div>
                </div>
              )}
              {configs.map(config => (
                <button
                  key={config.id}
                  onClick={() => selectConfig(config)}
                  className={`w-full p-3 text-left transition-colors ${
                    selectedConfigId === config.id && !isCreatingNew
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      selectedConfigId === config.id && !isCreatingNew
                        ? 'bg-blue-100 dark:bg-blue-800'
                        : 'bg-gray-100 dark:bg-gray-700'
                    }`}>
                      <Lock className={`h-4 w-4 ${
                        selectedConfigId === config.id && !isCreatingNew
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${
                        selectedConfigId === config.id && !isCreatingNew
                          ? 'text-blue-900 dark:text-blue-100'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {config.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {config.loginEndpoint || 'No endpoint configured'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-8">
          {(selectedConfigId || isCreatingNew) ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {isCreatingNew ? 'New Authentication' : `Edit: ${formData.name}`}
                </h5>
                <div className="flex items-center space-x-3">
                  {!isCreatingNew && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  )}
                  <button
                    onClick={handleTest}
                    disabled={isTesting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    <span>{isTesting ? 'Testing...' : 'Test'}</span>
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              </div>

              {saveSuccess && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-green-800 dark:text-green-300">Configuration saved successfully</span>
                  </div>
                </div>
              )}

              {testResult && (
                <div className={`border rounded-lg p-4 ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                }`}>
                  <div className="flex items-center space-x-2">
                    {testResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className={`font-semibold ${
                      testResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
                    }`}>
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
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Configuration Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateFormField('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Synergize API, Cargo Spectre API"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    A unique name to identify this authentication configuration
                  </p>
                </div>

                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                    <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">API Endpoints</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure the login and ping endpoints</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Login Endpoint <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.loginEndpoint}
                      onChange={(e) => updateFormField('loginEndpoint', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://api.example.com/api/login"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      POST endpoint for authentication
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ping Endpoint
                    </label>
                    <input
                      type="text"
                      value={formData.pingEndpoint}
                      onChange={(e) => updateFormField('pingEndpoint', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://api.example.com/api/ping"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Token validation endpoint
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Token Field Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.tokenFieldName}
                      onChange={(e) => updateFormField('tokenFieldName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="access_token or token.access_token"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Token field in login response. Supports nested paths (e.g. token.access_token)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg">
                    <Lock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">Credentials</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Authentication credentials for automatic token retrieval</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => updateFormField('username', e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="api_user"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Password {isCreatingNew && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => updateFormField('password', e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={isCreatingNew ? 'Enter password' : 'Enter new password to change'}
                      />
                      {!isCreatingNew && !formData.password && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Password saved securely. Leave blank to keep current password.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
              <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Configuration Selected</h5>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Select a configuration from the list or create a new one to get started.
              </p>
              <button
                onClick={handleNewConfig}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 inline-flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Create New Authentication</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Configuration</h4>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "{formData.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center space-x-2"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
