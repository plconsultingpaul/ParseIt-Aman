import React, { useState } from 'react';
import { Save, Lock } from 'lucide-react';
import type { SettingsConfig } from '../../types';

interface GeneralSettingsProps {
  settingsConfig: SettingsConfig;
  onUpdateSettingsConfig: (config: SettingsConfig) => Promise<void>;
}

export default function GeneralSettings({ 
  settingsConfig, 
  onUpdateSettingsConfig 
}: GeneralSettingsProps) {
  const [localConfig, setLocalConfig] = useState<SettingsConfig>(settingsConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const updateConfig = (field: keyof SettingsConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateSettingsConfig(localConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings config:', error);
      alert('Failed to save general settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">General Settings</h3>
          <p className="text-gray-600 mt-1">Configure general application settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Save className="h-4 w-4" />
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800">Success!</span>
          </div>
          <p className="text-green-700 text-sm mt-1">General settings saved successfully!</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-gray-100 p-2 rounded-lg">
            <Lock className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">Security</h4>
            <p className="text-sm text-gray-500">Settings access control</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Settings Password
          </label>
          <input
            type="password"
            value={localConfig.password}
            onChange={(e) => updateConfig('password', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            placeholder="Enter settings password"
          />
          <p className="text-xs text-gray-500 mt-1">
            This password is required to access the settings page
          </p>
        </div>
      </div>

      {/* Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-2">About Parse-It</h4>
        <p className="text-sm text-blue-700">
          Parse-It is a PDF data extraction application that uses AI to extract structured data from PDF documents.
          Configure your extraction types, SFTP settings, and email monitoring to automate your document processing workflow.
        </p>
      </div>
    </div>
  );
}