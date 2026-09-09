import React, { useState, useRef } from 'react';
import { Upload, AlertTriangle, Loader2, X, Check, FileJson } from 'lucide-react';
import {
  WorkflowV2ExportFile,
  validateWorkflowV2ExportFile,
  hasApiSteps,
  importWorkflowsV2,
} from '../../../services/workflowV2ExportService';

interface WorkflowV2ImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

type ImportStep = 'upload' | 'review' | 'importing' | 'done';

export default function WorkflowV2ImportModal({ onClose, onImported }: WorkflowV2ImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [exportData, setExportData] = useState<WorkflowV2ExportFile | null>(null);
  const [containsApiSteps, setContainsApiSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const validation = validateWorkflowV2ExportFile(parsed);
        if (!validation.valid) {
          setError(validation.error || 'Invalid file');
          return;
        }

        const data = parsed as WorkflowV2ExportFile;
        setExportData(data);
        setContainsApiSteps(hasApiSteps(data));
        setStep('review');
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
      const ids = await importWorkflowsV2(exportData);
      setImportedCount(ids.length);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('review');
    }
  };

  const typeBadge = (type: string) => {
    const cls = type === 'extraction'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
      : type === 'transformation'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
    const label = type === 'extraction' ? 'Extract' : type === 'transformation' ? 'Transform' : 'Imaging';
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${cls}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Import Workflows</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {step === 'upload' && 'Upload an exported workflow configuration file'}
              {step === 'review' && 'Review workflows before importing'}
              {step === 'importing' && 'Importing workflows...'}
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
              <X className="h-4 w-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
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

          {step === 'review' && exportData && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {exportData.workflows.length} workflow{exportData.workflows.length !== 1 ? 's' : ''} found
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Exported {new Date(exportData.exportedAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {exportData.workflows.map((wf, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-900 dark:text-gray-100">{wf.name}</span>
                      {typeBadge(wf.workflowType)}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {wf.nodes.length} node{wf.nodes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>

              {containsApiSteps && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      API Steps Detected
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      One or more workflows contain API endpoint steps. After import, please review and update the API configurations to match this environment.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <strong>What will be imported:</strong> All workflow steps, configurations, connections, and field mapping functions.
                </p>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-10">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-medium">
                Importing workflows...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Creating nodes, edges, and field mapping functions
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
                {importedCount} workflow{importedCount !== 1 ? 's' : ''} imported successfully.
              </p>
              {containsApiSteps && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                  Remember to review and update any API endpoint configurations.
                </p>
              )}
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

          {step === 'review' && (
            <>
              <button
                onClick={() => { setStep('upload'); setExportData(null); setError(null); }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                className="flex items-center px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={() => { onImported(); onClose(); }}
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
