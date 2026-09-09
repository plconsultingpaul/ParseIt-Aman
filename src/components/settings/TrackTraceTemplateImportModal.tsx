import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, AlertCircle, CheckCircle2, FileJson, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TrackTraceTemplateImportModalProps {
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
    apiSourceType: string;
    secondaryApiId?: string;
    apiSpecId?: string;
    apiSpecEndpointId?: string;
    apiPath: string;
    httpMethod: string;
    limitOptions: number[];
    orderByOptions: any[];
    defaultLimit?: number;
    defaultOrderBy?: string;
    defaultOrderDirection?: string;
    isActive: boolean;
    showUrl?: boolean;
    orderIdFieldName?: string;
  };
  fields: Array<{
    id: string;
    fieldType: string;
    fieldName: string;
    displayLabel: string;
    dataType: string;
    filterOperator?: string;
    parameterType: string;
    apiFieldPath?: string;
    isRequired: boolean;
    fieldOrder: number;
    isEnabled: boolean;
    valueMappings?: any[];
  }>;
  defaultFields: Array<{
    id: string;
    fieldName: string;
    parameterType: string;
    apiFieldPath?: string;
    valueType: string;
    staticValue?: string;
    dynamicValue?: string;
    operator?: string;
  }>;
  filterPresets: Array<{
    id: string;
    name: string;
    displayOrder: number;
    filterValues: any[];
    isActive: boolean;
    defaultFields?: Array<{
      id: string;
      fieldName: string;
      parameterType: string;
      apiFieldPath?: string;
      valueType: string;
      staticValue?: string;
      dynamicValue?: string;
    }>;
  }>;
  templateSections: Array<{
    id: string;
    sectionType: string;
    displayOrder: number;
    isEnabled: boolean;
    config: any;
  }>;
  documentConfigs?: Array<{
    id: string;
    name: string;
    searchApiUrl?: string;
    getDocumentApiUrl?: string;
    docIdField?: string;
    docNameField?: string;
    docTypeField?: string;
    docSizeField?: string;
    authConfigId?: string;
    sortOrder: number;
    isEnabled: boolean;
    emailEnabled?: boolean;
    emailSubject?: string;
    emailTemplate?: string;
    filters?: Array<{
      id: string;
      fieldName: string;
      valueType: string;
      variableName?: string;
      staticValue?: string;
      sortOrder: number;
    }>;
  }>;
  timelineStatuses?: Array<{
    id: string;
    name: string;
    displayOrder: number;
    locationField?: string;
    dateField?: string;
    childStatuses?: Array<{
      id: string;
      statusValue: string;
      displayOrder: number;
    }>;
  }>;
}

function TrackTraceTemplateImportModal({ onClose, onImportComplete }: TrackTraceTemplateImportModalProps) {
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
    if (data.type !== 'track_trace_template') {
      return { valid: false, error: `Invalid file type: expected "track_trace_template", got "${data.type}".` };
    }
    if (!data.template || !data.template.name) {
      return { valid: false, error: 'Invalid file: missing template metadata.' };
    }
    if (!Array.isArray(data.fields)) {
      return { valid: false, error: 'Invalid file: fields must be an array.' };
    }
    if (!Array.isArray(data.templateSections)) {
      return { valid: false, error: 'Invalid file: templateSections must be an array.' };
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
        .from('track_trace_templates')
        .insert([{
          name: templateName.trim(),
          description: importData.template.description || null,
          api_source_type: importData.template.apiSourceType || 'main',
          secondary_api_id: importData.template.secondaryApiId || null,
          api_spec_id: importData.template.apiSpecId || null,
          api_spec_endpoint_id: importData.template.apiSpecEndpointId || null,
          api_path: importData.template.apiPath || '',
          http_method: importData.template.httpMethod || 'GET',
          limit_options: importData.template.limitOptions || [10, 25, 50, 100],
          order_by_options: importData.template.orderByOptions || [],
          default_limit: importData.template.defaultLimit || 25,
          default_order_by: importData.template.defaultOrderBy || null,
          default_order_direction: importData.template.defaultOrderDirection || 'asc',
          is_active: false,
          show_url: importData.template.showUrl || false,
          order_id_field_name: importData.template.orderIdFieldName || null
        }])
        .select()
        .single();

      if (templateError) throw templateError;

      if (importData.fields.length > 0) {
        const fieldsToInsert = importData.fields.map(f => ({
          template_id: templateRecord.id,
          field_type: f.fieldType,
          field_name: f.fieldName,
          display_label: f.displayLabel,
          data_type: f.dataType,
          filter_operator: f.filterOperator || null,
          parameter_type: f.parameterType || 'query',
          api_field_path: f.apiFieldPath || null,
          is_required: f.isRequired || false,
          field_order: f.fieldOrder,
          is_enabled: f.isEnabled ?? true,
          value_mappings: f.valueMappings || []
        }));

        const { error: fieldsError } = await supabase
          .from('track_trace_template_fields')
          .insert(fieldsToInsert);
        if (fieldsError) throw fieldsError;
      }

      if (importData.defaultFields && importData.defaultFields.length > 0) {
        const defaultFieldsToInsert = importData.defaultFields.map(f => ({
          template_id: templateRecord.id,
          field_name: f.fieldName,
          parameter_type: f.parameterType,
          api_field_path: f.apiFieldPath || null,
          value_type: f.valueType,
          static_value: f.staticValue || null,
          dynamic_value: f.dynamicValue || null,
          operator: f.operator || 'eq'
        }));

        const { error: dfError } = await supabase
          .from('track_trace_template_default_fields')
          .insert(defaultFieldsToInsert);
        if (dfError) throw dfError;
      }

      if (importData.filterPresets && importData.filterPresets.length > 0) {
        for (const preset of importData.filterPresets) {
          const { data: presetRecord, error: presetError } = await supabase
            .from('track_trace_filter_presets')
            .insert([{
              template_id: templateRecord.id,
              name: preset.name,
              display_order: preset.displayOrder,
              filter_values: preset.filterValues || [],
              is_active: preset.isActive ?? true
            }])
            .select()
            .single();

          if (presetError) throw presetError;

          if (preset.defaultFields && preset.defaultFields.length > 0) {
            const presetDefaultFieldsToInsert = preset.defaultFields.map(f => ({
              preset_id: presetRecord.id,
              field_name: f.fieldName,
              parameter_type: f.parameterType,
              api_field_path: f.apiFieldPath || null,
              value_type: f.valueType,
              static_value: f.staticValue || null,
              dynamic_value: f.dynamicValue || null
            }));

            const { error: pdfError } = await supabase
              .from('track_trace_filter_preset_default_fields')
              .insert(presetDefaultFieldsToInsert);
            if (pdfError) throw pdfError;
          }
        }
      }

      if (importData.templateSections && importData.templateSections.length > 0) {
        const seenTypes = new Set<string>();
        const dedupedSections = importData.templateSections.filter(s => {
          if (seenTypes.has(s.sectionType)) return false;
          seenTypes.add(s.sectionType);
          return true;
        });

        for (const s of dedupedSections) {
          const { error: sectionError } = await supabase
            .from('track_trace_template_sections')
            .update({
              display_order: s.displayOrder,
              is_enabled: s.isEnabled ?? true,
              config: s.config || {}
            })
            .eq('template_id', templateRecord.id)
            .eq('section_type', s.sectionType);
          if (sectionError) throw sectionError;
        }
      }

      if (importData.documentConfigs && importData.documentConfigs.length > 0) {
        for (const doc of importData.documentConfigs) {
          const { data: docRecord, error: docError } = await supabase
            .from('track_trace_document_configs')
            .insert([{
              template_id: templateRecord.id,
              name: doc.name,
              search_api_url: doc.searchApiUrl || null,
              get_document_api_url: doc.getDocumentApiUrl || null,
              doc_id_field: doc.docIdField || null,
              doc_name_field: doc.docNameField || null,
              doc_type_field: doc.docTypeField || null,
              doc_size_field: doc.docSizeField || null,
              auth_config_id: null,
              sort_order: doc.sortOrder,
              is_enabled: doc.isEnabled ?? true,
              email_enabled: doc.emailEnabled || false,
              email_subject: doc.emailSubject || null,
              email_template: doc.emailTemplate || null
            }])
            .select()
            .single();

          if (docError) throw docError;

          if (doc.filters && doc.filters.length > 0) {
            const filtersToInsert = doc.filters.map(f => ({
              document_config_id: docRecord.id,
              field_name: f.fieldName,
              value_type: f.valueType,
              variable_name: f.variableName || null,
              static_value: f.staticValue || null,
              sort_order: f.sortOrder
            }));

            const { error: filterError } = await supabase
              .from('track_trace_document_filters')
              .insert(filtersToInsert);
            if (filterError) throw filterError;
          }
        }
      }

      if (importData.timelineStatuses && importData.timelineStatuses.length > 0) {
        for (const status of importData.timelineStatuses) {
          const { data: statusRecord, error: statusError } = await supabase
            .from('track_trace_timeline_statuses')
            .insert([{
              template_id: templateRecord.id,
              name: status.name,
              display_order: status.displayOrder,
              location_field: status.locationField || null,
              date_field: status.dateField || null
            }])
            .select()
            .single();

          if (statusError) throw statusError;

          if (status.childStatuses && status.childStatuses.length > 0) {
            const childrenToInsert = status.childStatuses.map(c => ({
              timeline_status_id: statusRecord.id,
              status_value: c.statusValue,
              display_order: c.displayOrder
            }));

            const { error: childError } = await supabase
              .from('track_trace_timeline_child_statuses')
              .insert(childrenToInsert);
            if (childError) throw childError;
          }
        }
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
            Import Track & Trace Template
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
                  <span className="text-gray-600 dark:text-gray-400">Fields:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.fields.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Default Fields:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.defaultFields?.length || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Filter Presets:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.filterPresets?.length || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Page Sections:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{importData.templateSections?.length || 0}</span>
                </div>
                {importData.documentConfigs && importData.documentConfigs.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Document Configs:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{importData.documentConfigs.length}</span>
                  </div>
                )}
                {importData.timelineStatuses && importData.timelineStatuses.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Timeline Statuses:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{importData.timelineStatuses.length}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Exported:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(importData.exportedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  API references (secondary API, spec endpoints) are imported as-is. You may need to reconfigure them if they differ between applications.
                </p>
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
                  You can rename the template before importing. It will be imported as inactive.
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
                Template "{templateName}" has been imported with all fields, presets, and sections.
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

export default TrackTraceTemplateImportModal