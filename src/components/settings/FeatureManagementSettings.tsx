import React, { useState, useEffect } from 'react';
import { Save, Sliders, FileText, RefreshCw, Server, Key, Mail, Filter, GitBranch, Users, Truck, Building, BarChart3 } from 'lucide-react';
import type { FeatureFlag } from '../../types';

interface FeatureManagementSettingsProps {
  featureFlags: FeatureFlag[];
  onUpdateFeatureFlags: (flags: FeatureFlag[]) => Promise<void>;
}

export default function FeatureManagementSettings({
  featureFlags: initialFeatureFlags,
  onUpdateFeatureFlags
}: FeatureManagementSettingsProps) {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>(initialFeatureFlags);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setFeatureFlags(initialFeatureFlags);
  }, [initialFeatureFlags]);

  const categoryIcons: Record<string, any> = {
    extraction: FileText,
    transformation: RefreshCw,
    integration: Server,
    email: Mail,
    automation: GitBranch,
    admin: Users,
    operations: Truck,
    customization: Building,
    monitoring: BarChart3,
    general: Sliders
  };

  const categoryNames: Record<string, string> = {
    extraction: 'Extraction Features',
    transformation: 'Transformation Features',
    integration: 'Integration Features',
    email: 'Email Features',
    automation: 'Automation Features',
    admin: 'Administration Features',
    operations: 'Operations Features',
    customization: 'Customization Features',
    monitoring: 'Monitoring Features',
    general: 'General Features'
  };

  const groupedFeatures = featureFlags.reduce((acc, flag) => {
    if (!acc[flag.category]) {
      acc[flag.category] = [];
    }
    acc[flag.category].push(flag);
    return acc;
  }, {} as Record<string, FeatureFlag[]>);

  const handleToggle = (featureKey: string) => {
    setFeatureFlags(prev => prev.map(flag =>
      flag.featureKey === featureKey
        ? { ...flag, isEnabled: !flag.isEnabled }
        : flag
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await onUpdateFeatureFlags(featureFlags);
      setSuccess('Feature flags updated successfully');
      setHasChanges(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update feature flags. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFeatureFlags(initialFeatureFlags);
    setHasChanges(false);
    setError('');
    setSuccess('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Feature Management</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Enable or disable system features</p>
        </div>
        <div className="flex space-x-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Feature Management Information</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• Feature flags control which features are available system-wide</li>
          <li>• Disabled features will be hidden from all users regardless of their permissions</li>
          <li>• User permissions still apply to enabled features</li>
          <li>• Changes take effect immediately after saving</li>
        </ul>
      </div>

      <div className="space-y-6">
        {Object.entries(groupedFeatures).map(([category, flags]) => {
          const Icon = categoryIcons[category] || Sliders;
          const categoryName = categoryNames[category] || category;

          return (
            <div key={category} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg">
                  <Icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{categoryName}</h4>
              </div>

              <div className="space-y-3">
                {flags.map(flag => (
                  <div
                    key={flag.id}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      flag.isEnabled
                        ? 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                    onClick={() => handleToggle(flag.featureKey)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h5 className={`font-semibold ${
                          flag.isEnabled ? 'text-purple-900 dark:text-purple-200' : 'text-gray-700 dark:text-gray-200'
                        }`}>
                          {flag.featureName}
                        </h5>
                        <p className={`text-sm mt-1 ${
                          flag.isEnabled ? 'text-purple-600 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {flag.description}
                        </p>
                      </div>
                      <div className="ml-4">
                        <div
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            flag.isEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              flag.isEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
