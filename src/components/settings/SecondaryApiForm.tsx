import React, { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import type { SecondaryApiConfig } from '../../types';

interface SecondaryApiFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Omit<SecondaryApiConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  editingConfig?: SecondaryApiConfig | null;
}

export default function SecondaryApiForm({ isOpen, onClose, onSave, editingConfig }: SecondaryApiFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    authToken: '',
    description: '',
    isActive: true,
    testEndpoint: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingConfig) {
      setFormData({
        name: editingConfig.name,
        baseUrl: editingConfig.baseUrl,
        authToken: editingConfig.authToken,
        description: editingConfig.description,
        isActive: editingConfig.isActive,
        testEndpoint: editingConfig.testEndpoint || ''
      });
    } else {
      setFormData({
        name: '',
        baseUrl: '',
        authToken: '',
        description: '',
        isActive: true,
        testEndpoint: ''
      });
    }
    setErrors({});
    setTestResult(null);
  }, [editingConfig, isOpen]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'API name is required';
    }

    if (!formData.baseUrl.trim()) {
      newErrors.baseUrl = 'Base URL is required';
    } else if (!/^https?:\/\/.+/.test(formData.baseUrl.trim())) {
      newErrors.baseUrl = 'Base URL must start with http:// or https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getFriendlyErrorMessage = (statusCode: number, error?: Error): string => {
    if (statusCode === 404) {
      return 'API endpoint not found. Please verify the base URL is correct.';
    } else if (statusCode === 401 || statusCode === 403) {
      return 'Authentication failed. Please check your API token.';
    } else if (statusCode >= 500) {
      return 'API server error. Please contact your API provider or try again later.';
    } else if (statusCode >= 400) {
      return 'Invalid request. Please verify your configuration.';
    } else if (error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('cors') || errorMsg.includes('network') || errorMsg.includes('failed to fetch')) {
        return 'Unable to connect. Check that the URL is accessible and CORS is configured.';
      } else if (errorMsg.includes('timeout')) {
        return 'Connection timed out. The API server may be slow or unreachable.';
      }
    }
    return 'Connection failed. Please check your network connection and try again.';
  };

  const handleTestConnection = async () => {
    if (!formData.baseUrl.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter a Base URL first'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const testPath = formData.testEndpoint?.trim() || '/WHOAMI';
      const normalizedPath = testPath.startsWith('/') ? testPath : `/${testPath}`;
      const baseUrl = formData.baseUrl.endsWith('/') ? formData.baseUrl.slice(0, -1) : formData.baseUrl;
      const testUrl = `${baseUrl}${normalizedPath}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (formData.authToken) {
        headers['Authorization'] = `Bearer ${formData.authToken}`;
      }

      const response = await fetch(testUrl, {
        method: 'GET',
        headers
      });

      if (response.ok) {
        setTestResult({
          success: true,
          message: 'Connection test successful!'
        });
      } else {
        setTestResult({
          success: false,
          message: getFriendlyErrorMessage(response.status)
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: getFriendlyErrorMessage(0, error instanceof Error ? error : undefined)
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save secondary API config:', error);
      alert('Failed to save API configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {editingConfig ? 'Edit Secondary API' : 'Add Secondary API'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border ${
                errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
              placeholder="e.g., Warehouse System, Backup TMS"
            />
            {errors.name && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Base URL <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              className={`w-full px-3 py-2 border ${
                errors.baseUrl ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
              placeholder="https://api.example.com/v1"
            />
            {errors.baseUrl && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{errors.baseUrl}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Authentication Token
            </label>
            <input
              type="password"
              value={formData.authToken}
              onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Bearer token or API key (optional)"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Optional: Used as Authorization header
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Test Endpoint Override
            </label>
            <input
              type="text"
              value={formData.testEndpoint}
              onChange={(e) => setFormData({ ...formData, testEndpoint: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="/WHOAMI"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Optional: Override the default /WHOAMI test path
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Notes about this API configuration"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Enable this API configuration
            </label>
          </div>

          {testResult && (
            <div className={`border rounded-lg p-3 ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
            }`}>
              <p className={`text-sm ${
                testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
              }`}>
                {testResult.message}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Zap className="h-4 w-4" />
              <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
