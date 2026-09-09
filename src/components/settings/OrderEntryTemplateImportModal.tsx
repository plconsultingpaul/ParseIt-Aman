import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, AlertCircle, CheckCircle2, FileJson, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface OrderEntryTemplateImportModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportData {
  version: string;
  type: string;
  exportedAt: string;
  template: {
    name: string;
    description?: string;
    extractionTypeId?: string;
    isActive: boolean;
  };
  fieldGroups: Array<{
    id: string;
    groupName: string;
    groupOrder: number;
    description?: string;
    isCollapsible: boolean;
    isExpandedByDefault: boolean;
    backgroundColor?: string;
    borderColor?: string;
    isArrayGroup: boolean;
    arrayMinRows: number;
    arrayMaxRows: number;
    arrayJsonPath?: string;
    hideAddRow?: boolean;
  }>;
  fields: Array<{
    id: string;
    fieldGroupId: string;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    placeholder?: string;
    helpText?: string;
    isRequired: boolean;
    maxLength?: number;
    minValue?: number;
    maxValue?: number;
    defaultValue?: string;
    dropdownOptions?: any;
    dropdownDisplayMode?: string;
    jsonPath?: string;
    isArrayField: boolean;
    arrayMinRows?: number;
    arrayMaxRows?: number;
    aiExtractionInstructions?: string;
    validationRegex?: string;
    validationErrorMessage?: string;
    fieldOrder: number;
    copyFromField?: string;
  }>;
  layouts: Array<{
    fieldId: string;
    rowIndex: number;
    columnIndex: number;
    widthColumns: number;
    mobileWidthColumns?: number;
  }>;
}

export default function OrderEntryTemplateImportModal({ onClose, onImportComplete }: OrderEntryTemplateImportModalProps) {
  const [step, setStep] = useState<'upload' | 'review' | 'importing' | 'done'>('upload');
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (data: any): { valid: boolean; error?: string } => {
    if (!data.version || !data.type) {
      return { valid: false, error: 'Invalid file: missing version or type identifier.' };
    }
    if (data.type !== 'order_entry_template') {
      return { valid: false, error: `Invalid file type: expected "order_entry_template", got "${data.type}".` };
    }
    if (!data.template || !data.template.name) {
      return { valid: false, error: 'Invalid file: missing template metadata.' };
    }
    if (!Array.isArray(data.fieldGroups)) {
      return { valid: false, error: 'Invalid file: fieldGroups must be an array.' };
    }
    if (!Array.isArray(data.fields)) {
      return { valid: false, error: 'Invalid file: fields must be an array.' };
    }
    if (!Array.isArray(data.layouts)) {
      return { valid: false, error: 'Invalid file: layouts must be an array.' };
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
      setTemplateName(data.template.name);
      setStep('review');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON file. Please select a valid template export file.');
      } else {
        setError('Failed to read file.');
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!importData || !templateName.trim()) return;

    setImporting(true);
    setStep('importing');
    setError(null);

    try {
      const { data: templateRecord, error: templateError } = await supabase
        .from('order_entry_templates')
        .insert([{
          name: templateName.trim(),
          description: importData.template.description || null,
          extraction_type_id: null,
          confirmation_number_field: importData.template.confirmationNumberField || null,
          hide_pdf_autofill: importData.template.hidePdfAutofill ?? false,
          is_active: importData.template.isActive ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (templateError) throw templateError;

      const groupIdMap: Record<string, string> = {};
      const fieldIdMap: Record<string, string> = {};

      for (const group of importData.fieldGroups) {
        const { data: newGroup, error: groupError } = await supabase
          .from('order_entry_template_field_groups')
          .insert([{
            template_id: templateRecord.id,
            group_name: group.groupName,
            group_order: group.groupOrder,
            description: group.description || null,
            is_collapsible: group.isCollapsible || false,
            is_expanded_by_default: group.isExpandedByDefault ?? true,
            background_color: group.backgroundColor || '#ffffff',
            border_color: group.borderColor || '#14b8a6',
            is_array_group: group.isArrayGroup || false,
            array_min_rows: group.arrayMinRows || 1,
            array_max_rows: group.arrayMaxRows || 10,
            array_json_path: group.arrayJsonPath || null,
            hide_add_row: group.hideAddRow || false,
            remove_if_empty: group.removeIfEmpty || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (groupError) throw groupError;
        groupIdMap[group.id] = newGroup.id;
      }

      for (const field of importData.fields) {
        const newGroupId = groupIdMap[field.fieldGroupId];
        if (!newGroupId) continue;

        const { data: newField, error: fieldError } = await supabase
          .from('order_entry_template_fields')
          .insert([{
            template_id: templateRecord.id,
            field_group_id: newGroupId,
            field_name: field.fieldName,
            field_label: field.fieldLabel,
            field_type: field.fieldType,
            placeholder: field.placeholder || null,
            help_text: field.helpText || null,
            is_required: field.isRequired || false,
            max_length: field.maxLength || null,
            min_value: field.minValue || null,
            max_value: field.maxValue || null,
            default_value: field.defaultValue || null,
            dropdown_options: field.dropdownOptions || [],
            dropdown_display_mode: field.dropdownDisplayMode || 'description_only',
            json_path: field.jsonPath || null,
            is_array_field: field.isArrayField || false,
            array_min_rows: field.arrayMinRows || 1,
            array_max_rows: field.arrayMaxRows || 10,
            ai_extraction_instructions: field.aiExtractionInstructions || null,
            validation_regex: field.validationRegex || null,
            validation_error_message: field.validationErrorMessage || null,
            field_order: field.fieldOrder,
            copy_from_field: field.copyFromField || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (fieldError) throw fieldError;
        fieldIdMap[field.id] = newField.id;
      }

      if (importData.layouts.length > 0) {
        const layoutsToInsert = importData.layouts
          .filter(l => fieldIdMap[l.fieldId])
          .map(l => ({
            template_id: templateRecord.id,
            field_id: fieldIdMap[l.fieldId],
            row_index: l.rowIndex,
            column_index: l.columnIndex,
            width_columns: l.widthColumns,
            mobile_width_columns: l.mobileWidthColumns || 12,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        if (layoutsToInsert.length > 0) {
          const { error: layoutError } = await supabase
            .from('order_entry_template_field_layout')
            .insert(layoutsToInsert);
          if (layoutError) throw layoutError;
        }
      }

      if (importData.documentTypes && importData.documentTypes.length > 0) {
        const docTypesToInsert = importData.documentTypes.map((d: any) => ({
          template_id: templateRecord.id,
          name: d.name,
          sort_order: d.sortOrder ?? 0,
          is_required: d.isRequired ?? false,
          action_type: d.actionType || 'email',
          email_recipients: d.emailRecipients || null,
          email_subject_template: d.emailSubjectTemplate || null,
          imaging_bucket_id: d.imagingBucketId || null,
          imaging_document_type_id: d.imagingDocumentTypeId || null,
          rename_template: d.renameTemplate || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: docTypeError } = await supabase
          .from('order_entry_template_document_types')
          .insert(docTypesToInsert);
        if (docTypeError) throw docTypeError;
      }

      setStep('done');
    } catch (err: any) {
      setError('Import failed: ' + err.message);
      setStep('review');
    } finally {
      setImporting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Import Order Entry Template
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a JSON template file exported from another Parse-It application.
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
                  JSON files only
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
                  <span className="text-gray-600 dark:text-gray-400">Field Groups:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.fieldGroups.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Fields:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.fields.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Layouts:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.layouts.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Exported:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(importData.exportedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter template name"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  You can rename the template before importing.
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
              <p className="text-sm text-gray-600 dark:text-gray-400">Importing template...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-4" />
              <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">Import Successful</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Template "{templateName}" has been imported with all field groups, fields, and layouts.
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
                disabled={!templateName.trim() || importing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Template
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
