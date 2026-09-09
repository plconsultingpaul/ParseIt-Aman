import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Zap, Power, Link, CheckCircle, XCircle, X, AlertCircle } from 'lucide-react';
import type { SecondaryApiConfig } from '../../types';
import {
  fetchSecondaryApiConfigs,
  createSecondaryApiConfig,
  updateSecondaryApiConfig,
  deleteSecondaryApiConfig,
  toggleSecondaryApiConfig
} from '../../services/configService';
import SecondaryApiForm from './SecondaryApiForm';

interface TestResult {
  success: boolean;
  message: string;
  details?: string;
}

export default function SecondaryApiSettings() {
  const [configs, setConfigs] = useState<SecondaryApiConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SecondaryApiConfig | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setIsLoading(true);
      const data = await fetchSecondaryApiConfigs();
      setConfigs(data);
    } catch (error) {
      console.error('Failed to load secondary API configs:', error);
      setError('Failed to load secondary API configurations. Please refresh the page and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingConfig(null);
    setIsFormOpen(true);
  };

  const handleEdit = (config: SecondaryApiConfig) => {
    setEditingConfig(config);
    setIsFormOpen(true);
  };

  const handleSave = async (formData: Omit<SecondaryApiConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editingConfig?.id) {
        await updateSecondaryApiConfig(editingConfig.id, formData);
      } else {
        await createSecondaryApiConfig(formData);
      }
      await loadConfigs();
      setIsFormOpen(false);
      setEditingConfig(null);
    } catch (error) {
      console.error('Failed to save secondary API config:', error);
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API configuration?')) {
      return;
    }

    try {
      setDeletingId(id);
      await deleteSecondaryApiConfig(id);
      await loadConfigs();
    } catch (error) {
      console.error('Failed to delete secondary API config:', error);
      setError('Failed to delete API configuration. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await toggleSecondaryApiConfig(id, !currentStatus);
      await loadConfigs();
    } catch (error) {
      console.error('Failed to toggle secondary API config:', error);
      setError('Failed to toggle API configuration. Please try again.');
    }
  };

  const getFriendlyErrorMessage = (statusCode: number, error?: Error): { message: string; details?: string } => {
    if (statusCode === 404) {
      return {
        message: 'API endpoint not found',
        details: 'Please verify the base URL is correct and the API service is running.'
      };
    } else if (statusCode === 401 || statusCode === 403) {
      return {
        message: 'Authentication failed',
        details: 'Please check that your API token is correct and has not expired.'
      };
    } else if (statusCode >= 500) {
      return {
        message: 'API server error',
        details: 'The API server encountered an error. Please contact your API provider or try again later.'
      };
    } else if (statusCode >= 400) {
      return {
        message: 'Invalid request',
        details: 'The API request was not accepted. Please verify your configuration.'
      };
    } else if (error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('cors') || errorMsg.includes('network') || errorMsg.includes('failed to fetch')) {
        return {
          message: 'Unable to connect to API',
          details: 'Check that the URL is accessible and CORS is properly configured on the API server.'
        };
      } else if (errorMsg.includes('timeout')) {
        return {
          message: 'Connection timed out',
          details: 'The API server is not responding. It may be slow or unreachable.'
        };
      }
    }
    return {
      message: 'Connection failed',
      details: 'Unable to connect to the API. Please check your network connection and try again.'
    };
  };

  const handleTest = async (config: SecondaryApiConfig) => {
    if (!config.id) return;

    setTestingIds(prev => new Set(prev).add(config.id!));
    setTestResults(prev => {
      const newResults = { ...prev };
      delete newResults[config.id!];
      return newResults;
    });

    try {
      const testPath = config.testEndpoint?.trim() || '/WHOAMI';
      const normalizedPath = testPath.startsWith('/') ? testPath : `/${testPath}`;
      const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
      const testUrl = `${baseUrl}${normalizedPath}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.authToken) {
        headers['Authorization'] = `Bearer ${config.authToken}`;
      }

      const response = await fetch(testUrl, {
        method: 'GET',
        headers
      });

      if (response.ok) {
        setTestResults(prev => ({
          ...prev,
          [config.id!]: {
            success: true,
            message: 'Connection test successful!'
          }
        }));
        setTimeout(() => {
          setTestResults(prev => {
            const newResults = { ...prev };
            delete newResults[config.id!];
            return newResults;
          });
        }, 5000);
      } else {
        const errorInfo = getFriendlyErrorMessage(response.status);
        setTestResults(prev => ({
          ...prev,
          [config.id!]: {
            success: false,
            message: errorInfo.message,
            details: errorInfo.details
          }
        }));
      }
    } catch (error) {
      const errorInfo = getFriendlyErrorMessage(0, error instanceof Error ? error : undefined);
      setTestResults(prev => ({
        ...prev,
        [config.id!]: {
          success: false,
          message: errorInfo.message,
          details: errorInfo.details
        }
      }));
    } finally {
      setTestingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(config.id!);
        return newSet;
      });
    }
  };

  const dismissTestResult = (configId: string) => {
    setTestResults(prev => {
      const newResults = { ...prev };
      delete newResults[configId];
      return newResults;
    });
  };

  const maskUrl = (url: string) => {
    if (url.length <= 30) return url;
    return url.substring(0, 20) + '...' + url.substring(url.length - 10);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600 dark:text-gray-400">Loading secondary API configurations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">Error</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Secondary API Configurations</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Additional API endpoints for specific workflows or backup systems
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Secondary API</span>
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <Link className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-2">No secondary APIs configured</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            Add additional API endpoints for specific workflows or backup systems
          </p>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 inline-flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Your First Secondary API</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {configs.map((config) => (
            <div
              key={config.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h5 className="font-semibold text-gray-900 dark:text-gray-100">{config.name}</h5>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        config.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {config.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 break-all">
                    {config.baseUrl}
                  </p>
                  {config.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-500">{config.description}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleToggle(config.id!, config.isActive)}
                    className={`p-2 rounded-lg transition-colors ${
                      config.isActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={config.isActive ? 'Disable API' : 'Enable API'}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleTest(config)}
                    disabled={testingIds.has(config.id!)}
                    className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                    title="Test API Connection"
                  >
                    <Zap className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(config)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title="Edit API"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(config.id!)}
                    disabled={deletingId === config.id}
                    className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                    title="Delete API"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {testResults[config.id!] && (
                <div className={`mt-3 border rounded-lg p-3 ${
                  testResults[config.id!].success
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2 flex-1">
                      {testResults[config.id!].success ? (
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${
                          testResults[config.id!].success
                            ? 'text-green-800 dark:text-green-300'
                            : 'text-red-800 dark:text-red-300'
                        }`}>
                          {testResults[config.id!].message}
                        </p>
                        {testResults[config.id!].details && (
                          <p className={`text-xs mt-1 ${
                            testResults[config.id!].success
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}>
                            {testResults[config.id!].details}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => dismissTestResult(config.id!)}
                      className={`${
                        testResults[config.id!].success
                          ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300'
                          : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300'
                      } transition-colors`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <SecondaryApiForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingConfig(null);
        }}
        onSave={handleSave}
        editingConfig={editingConfig}
      />
    </div>
  );
}
