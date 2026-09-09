import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { InboxReviewTemplate } from '../../types';
import { reviewSetupService } from '../../services/reviewSetupService';
import CustomDropdown from '../common/CustomDropdown';

interface ReviewTemplateImportModalProps {
  existingTemplates: InboxReviewTemplate[];
  onClose: () => void;
  onImported: (template: InboxReviewTemplate) => void;
}

type Step = 'upload' | 'review' | 'importing' | 'done';

export default function ReviewTemplateImportModal({
  existingTemplates,
  onClose,
  onImported
}: ReviewTemplateImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [importData, setImportData] = useState<any>(null);
  const [templateName, setTemplateName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (data: any): { valid: boolean; error?: string } => {
    if (!data.version || !data.type) {
      return { valid: false, error: 'Invalid file: missing version or type identifier.' };
    }
    if (data.type !== 'inbox_review_template') {
      return { valid: false, error: `Invalid file type: expected "inbox_review_template", got "${data.type}".` };
    }
    if (!data.fieldGroups || !Array.isArray(data.fieldGroups)) {
      return { valid: false, error: 'Invalid file: missing fieldGroups array.' };
    }
    if (!data.fields || !Array.isArray(data.fields)) {
      return { valid: false, error: 'Invalid file: missing fields array.' };
    }
    return { valid: true };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      setTemplateName(data.template?.name ? `${data.template.name} (imported)` : 'Imported Template');
      setStep('review');
    } catch {
      setError('Failed to parse file. Ensure it is valid JSON.');
    }
  };

  const handleImport = async () => {
    if (!importData || !templateName.trim()) return;
    setStep('importing');
    setError(null);
    try {
      const template = await reviewSetupService.importTemplate(importData, templateName.trim());
      setStep('done');
      onImported(template);
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('review');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Import Review Template
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <div className="text-center py-8">
              <Upload className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a review template JSON file to import.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Choose File
              </button>
            </div>
          )}

          {step === 'review' && importData && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <FileText className="h-4 w-4 text-purple-500" />
                  <span className="font-medium">Template Contents</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="bg-white dark:bg-gray-800 rounded px-2 py-1.5 text-center">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{importData.fieldGroups?.length || 0}</div>
                    Groups
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded px-2 py-1.5 text-center">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{importData.fields?.length || 0}</div>
                    Fields
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded px-2 py-1.5 text-center">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{importData.layouts?.length || 0}</div>
                    Layouts
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 text-purple-500 animate-spin mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Importing template...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Template imported successfully!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {step === 'review' && (
            <>
              <button
                onClick={() => { setStep('upload'); setImportData(null); setError(null); }}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!templateName.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Import
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
            >
              Done
            </button>
          )}
          {step === 'upload' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
