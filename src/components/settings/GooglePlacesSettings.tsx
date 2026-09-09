import React, { useState } from 'react';
import { MapPin, Save, Zap, ExternalLink, Eye, EyeOff } from 'lucide-react';
import type { ApiConfig } from '../../types';
import { getAuthHeaders } from '../../lib/supabase';

interface GooglePlacesSettingsProps {
  apiConfig: ApiConfig;
  onUpdateApiConfig: (config: ApiConfig) => Promise<void>;
}

export default function GooglePlacesSettings({ apiConfig, onUpdateApiConfig }: GooglePlacesSettingsProps) {
  const [localApiKey, setLocalApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSave = async () => {
    if (!localApiKey.trim()) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateApiConfig({
        ...apiConfig,
        googlePlacesApiKey: localApiKey.trim()
      });
      setLocalApiKey('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save Google Places API key:', error);
      alert('Failed to save API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!localApiKey) {
      setTestResult({
        success: false,
        message: 'Please enter an API key first'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-google-places`;

      const authHeaders = await getAuthHeaders();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ apiKey: localApiKey })
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
            <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Google Places API</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure API key for location lookup functionality</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleTest}
            disabled={isTesting || !localApiKey}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Zap className="h-4 w-4" />
            <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !localApiKey.trim()}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
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
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">Google Places API key saved successfully!</p>
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
              testResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
            }`}>
              {testResult.success ? 'API Test Passed' : 'API Test Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {testResult.message}
          </p>
          {testResult.data && (
            <div className="mt-3 bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Test Response:</p>
              <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Google Places API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono text-sm"
                placeholder="Enter your Google Places API key"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              For security, saved keys are not displayed. Enter a new key to update.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Setup Instructions</h4>
        <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-2 list-decimal list-inside">
          <li>Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600 dark:hover:text-blue-300 inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="h-3 w-3" /></a></li>
          <li>Create a new project or select an existing one</li>
          <li>Enable the "Places API" from the API Library</li>
          <li>Create an API key under Credentials</li>
          <li>Optionally, restrict the API key to only allow Places API requests</li>
          <li>Copy the API key and paste it above</li>
        </ol>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">How It Works</h4>
        <ul className="text-sm text-gray-700 dark:text-gray-400 space-y-1">
          <li>The Google Places API enables location lookup in Execute Button workflows</li>
          <li>Use it to search for business addresses, phone numbers, and other details</li>
          <li>Results can be mapped to form fields for auto-population</li>
        </ul>
      </div>
    </div>
  );
}
