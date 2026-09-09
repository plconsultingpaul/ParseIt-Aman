import React, { useState, useRef, useEffect } from 'react';
import { Upload, AlertCircle, Loader2, ArrowRight, FileJson, Check, X, ChevronRight } from 'lucide-react';
import {
  ExportedButton,
  ApiSourceReference,
  ApiOption,
  validateExportFile,
  extractApiSources,
  loadAvailableApis,
  importButton,
} from '../../services/executeButtonExportService';
import Select from '../common/Select';

interface ExecuteButtonImportModalProps {
  onClose: () => void;
  onImported: (buttonId: string) => void;
  buttonCount: number;
}

type ImportStep = 'upload' | 'remap' | 'importing' | 'done';

export default function ExecuteButtonImportModal({ onClose, onImported, buttonCount }: ExecuteButtonImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [exportData, setExportData] = useState<ExportedButton | null>(null);
  const [apiSources, setApiSources] = useState<ApiSourceReference[]>([]);
  const [availableApis, setAvailableApis] = useState<ApiOption[]>([]);
  const [apiMappings, setApiMappings] = useState<Record<string, ApiOption>>({});
  const [error, setError] = useState<string | null>(null);
  const [importedButtonId, setImportedButtonId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    loadAvailableApis().then(setAvailableApis).catch(() => {});
  }, []);

  const processFile = (file: File) => {
    setError(null);
    if (!file.name.endsWith('.json')) {
      setError('Please select a .json file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const validation = validateExportFile(parsed);
        if (!validation.valid) {
          setError(validation.error || 'Invalid file');
          return;
        }

        setExportData(parsed as ExportedButton);
        const sources = extractApiSources(parsed as ExportedButton);
        setApiSources(sources);

        if (sources.length > 0) {
          const defaultMappings: Record<string, ApiOption> = {};
          for (const src of sources) {
            if (src.apiSource === 'base_api') {
              const baseOpt = availableApis.find(a => a.type === 'base_api');
              if (baseOpt) defaultMappings[src.key] = baseOpt;
            }
          }
          setApiMappings(defaultMappings);
          setStep('remap');
        } else {
          setStep('remap');
        }
      } catch {
        setError('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = async () => {
    if (!exportData) return;

    setStep('importing');
    setError(null);

    try {
      const newButtonId = await importButton(exportData, apiMappings, buttonCount);
      setImportedButtonId(newButtonId);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('remap');
    }
  };

  const allApisMapped = apiSources.every(src => apiMappings[src.key]);
  const hasApiSources = apiSources.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Import Button</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {step === 'upload' && 'Upload an exported button configuration file'}
              {step === 'remap' && (hasApiSources ? 'Map API endpoints to your local configuration' : 'Review and confirm import')}
              {step === 'importing' && 'Importing configuration...'}
              {step === 'done' && 'Import complete'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {step === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileJson className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-medium">
                Drop a .json export file here
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {step === 'remap' && exportData && (
            <div className="space-y-5">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {exportData.button.name}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{exportData.groups.length} group{exportData.groups.length !== 1 ? 's' : ''}</span>
                  <span>{exportData.fields.length} field{exportData.fields.length !== 1 ? 's' : ''}</span>
                  <span>{exportData.flowNodes.length} flow node{exportData.flowNodes.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {hasApiSources ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      API Endpoint Mapping
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Select which API configuration each source should use in this environment.
                      The endpoint path from the spec will remain unchanged.
                    </p>
                  </div>

                  {apiSources.map((src) => (
                    <div key={src.key} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {src.apiName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {src.apiSource === 'base_api' ? 'Base API' : 'Secondary API'} from export
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1">
                          {availableApis.length > 0 ? (
                            <Select
                              value={apiMappings[src.key]?.id || ''}
                              onValueChange={(val) => {
                                const selected = availableApis.find(a => a.id === val);
                                if (selected) {
                                  setApiMappings(prev => ({ ...prev, [src.key]: selected }));
                                }
                              }}
                              options={availableApis.map(a => ({
                                value: a.id,
                                label: a.name,
                              }))}
                              placeholder="Select API..."
                              searchable
                            />
                          ) : (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              No APIs configured in this environment
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    No API endpoint steps to remap. Ready to import.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-10">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-medium">
                Importing button configuration...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Creating groups, fields, flow nodes, and edges
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-gray-900 dark:text-gray-100 font-semibold text-lg">
                Import Successful
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                "{exportData?.button.name}" has been imported.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          {step === 'upload' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {step === 'remap' && (
            <>
              <button
                onClick={() => { setStep('upload'); setExportData(null); setApiSources([]); setApiMappings({}); setError(null); }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={hasApiSources && !allApisMapped}
                className="flex items-center px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={() => {
                if (importedButtonId) onImported(importedButtonId);
                onClose();
              }}
              className="flex items-center px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
