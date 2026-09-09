import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, AlertCircle, CheckCircle2, FileJson, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface NotificationTemplateImportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportTemplate {
  templateType: string;
  templateName: string;
  recipientEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  attachPdf: boolean;
  ccEmails: string;
  bccEmails: string;
  isGlobalDefault: boolean;
  customFields: Array<{ name: string; label: string; description?: string }>;
}

interface ImportData {
  version: string;
  type: string;
  exportedAt: string;
  templates: ImportTemplate[];
}

function NotificationTemplateImportModal({ onClose, onImportComplete }: NotificationTemplateImportModalProps) {
  const [step, setStep] = useState<'upload' | 'review' | 'importing' | 'done'>('upload');
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (data: any): { valid: boolean; error?: string } => {
    if (!data.version || !data.type) {
      return { valid: false, error: 'Invalid file: missing version or type identifier.' };
    }
    if (data.type !== 'notification_templates') {
      return { valid: false, error: `Invalid file type: expected "notification_templates", got "${data.type}".` };
    }
    if (!Array.isArray(data.templates) || data.templates.length === 0) {
      return { valid: false, error: 'Invalid file: no templates found.' };
    }
    for (const t of data.templates) {
      if (!t.templateName || !t.subjectTemplate || !t.bodyTemplate) {
        return { valid: false, error: `Invalid template data: "${t.templateName || 'unnamed'}" is missing required fields.` };
      }
    }
    return { valid: true };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const validation = validateFile(data);
      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        return;
      }
      setImportData(data);
      setSelectedTemplates(data.templates.map(() => true));
      setStep('review');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON file. Please select a valid notification template export file.');
      } else {
        setError('Failed to read file.');
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!importData) return;

    const templatesToImport = importData.templates.filter((_, i) => selectedTemplates[i]);
    if (templatesToImport.length === 0) {
      setError('Please select at least one template to import.');
      return;
    }

    setImporting(true);
    setStep('importing');
    setError(null);

    try {
      const records = templatesToImport.map(t => ({
        template_type: t.templateType || 'success',
        template_name: t.templateName,
        recipient_email: t.recipientEmail || '',
        subject_template: t.subjectTemplate,
        body_template: t.bodyTemplate,
        attach_pdf: t.attachPdf || false,
        cc_emails: t.ccEmails || '',
        bcc_emails: t.bccEmails || '',
        is_global_default: false,
        custom_fields: t.customFields || [],
      }));

      const { error: insertError } = await supabase
        .from('notification_templates')
        .insert(records);

      if (insertError) throw insertError;

      setImportedCount(records.length);
      setStep('done');
    } catch (err: any) {
      setError('Import failed: ' + err.message);
      setStep('review');
    } finally {
      setImporting(false);
    }
  };

  const toggleTemplate = (index: number) => {
    const updated = [...selectedTemplates];
    updated[index] = !updated[index];
    setSelectedTemplates(updated);
  };

  const toggleAll = () => {
    const allSelected = selectedTemplates.every(s => s);
    setSelectedTemplates(selectedTemplates.map(() => !allSelected));
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Import Notification Templates
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a JSON file exported from another Parse-It application.
              </p>
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileJson className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Click to select file
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  JSON files only (.json)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 'review' && importData && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Total Templates:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.templates.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Exported:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(importData.exportedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select Templates to Import
                  </label>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {selectedTemplates.every(s => s) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {importData.templates.map((t, index) => (
                    <label
                      key={index}
                      className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTemplates[index]}
                        onChange={() => toggleTemplate(index)}
                        className="rounded text-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {t.templateName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.templateType === 'failure'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          }`}>
                            {t.templateType}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {t.subjectTemplate}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Imported templates will not be set as global default. You can update this after import.
                </p>
              </div>

              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-8">
              <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Importing templates...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-4" />
              <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">Import Successful</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {importedCount} template{importedCount !== 1 ? 's' : ''} imported successfully.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
          {step === 'upload' && (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          )}
          {step === 'review' && (
            <>
              <button
                onClick={() => { setStep('upload'); setImportData(null); setError(null); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedTemplates.some(s => s) || importing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import ({selectedTemplates.filter(s => s).length})
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={onImportComplete}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default NotificationTemplateImportModal;
