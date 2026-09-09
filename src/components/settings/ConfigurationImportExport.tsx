import React, { useState, useRef } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2, FileJson } from 'lucide-react';

interface ConfigurationImportExportProps {
  config: any;
  fields: any[];
  fieldGroups: any[];
  layouts: any[];
  onImport: (data: any) => Promise<void>;
}

export default function ConfigurationImportExport({
  config,
  fields,
  fieldGroups,
  layouts,
  onImport
}: ConfigurationImportExportProps) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: 'admin',
      config: config || {},
      fields: fields || [],
      fieldGroups: fieldGroups || [],
      layouts: layouts || []
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-entry-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const validateImportData = (data: any): { valid: boolean; error?: string } => {
    if (!data.version) {
      return { valid: false, error: 'Invalid configuration file: missing version' };
    }

    if (!data.config) {
      return { valid: false, error: 'Invalid configuration file: missing config' };
    }

    if (!Array.isArray(data.fields)) {
      return { valid: false, error: 'Invalid configuration file: fields must be an array' };
    }

    if (!Array.isArray(data.fieldGroups)) {
      return { valid: false, error: 'Invalid configuration file: fieldGroups must be an array' };
    }

    if (!data.config.formName) {
      return { valid: false, error: 'Invalid configuration: form name is required' };
    }

    if (!data.config.apiEndpoint) {
      return { valid: false, error: 'Invalid configuration: API endpoint is required' };
    }

    return { valid: true };
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const validation = validateImportData(data);
      if (!validation.valid) {
        setImportError(validation.error || 'Invalid configuration file');
        return;
      }

      await onImport(data);

      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 5000);
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        setImportError('Invalid JSON file');
      } else {
        setImportError(error.message || 'Failed to import configuration');
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Configuration Backup & Restore
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Export your current configuration as a JSON file for backup, or import a previously exported configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-start space-x-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Download className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Export Configuration
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Download a JSON backup of your current configuration
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg transition-colors font-medium"
          >
            Export Configuration
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-start space-x-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Import Configuration
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Restore configuration from a JSON backup file
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            className="hidden"
            id="config-import-input"
          />
          <label
            htmlFor="config-import-input"
            className="block w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg transition-colors font-medium text-center cursor-pointer"
          >
            {importing ? 'Importing...' : 'Import Configuration'}
          </label>
        </div>
      </div>

      {importError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                Import Failed
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                {importError}
              </p>
            </div>
          </div>
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">
                Import Successful
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                Configuration has been imported successfully. Please review and save the changes.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
              Important Notes
            </h4>
            <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
              <li>Importing will replace your current configuration</li>
              <li>Always create a backup before importing</li>
              <li>Review the imported configuration before saving</li>
              <li>Invalid configurations will be rejected</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
