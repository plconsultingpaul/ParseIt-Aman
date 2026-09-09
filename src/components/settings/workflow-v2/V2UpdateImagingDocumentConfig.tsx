import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Braces } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';
import VariableDropdown from '../workflow/VariableDropdown';
import { supabase } from '../../../lib/supabase';
import { fetchDocumentTypes } from '../../../services/imagingService';
import type { ImagingDocumentType } from '../../../types';

interface FieldMapping {
  fieldId: string;
  value: string;
  skipIfEmpty?: boolean;
  column?: string;
}

interface MetadataFieldOption {
  id: string;
  field_name: string;
  display_label: string;
}

interface V2UpdateImagingDocumentConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  allNodes?: any[];
  currentNodeId?: string;
  workflowInputVariables?: Array<{ name: string; stepName: string; source: 'workflow_input'; dataType?: string }>;
}

const LEGACY_COLUMN_TO_FIELD_NAME: Record<string, string> = {
  detail_line_id: 'detailLineId',
  bill_number: 'billNumber',
};

export default function V2UpdateImagingDocumentConfig({
  config,
  updateConfig,
  allNodes = [],
  currentNodeId = '',
  workflowInputVariables = [],
}: V2UpdateImagingDocumentConfigProps) {
  const [openVariableDropdown, setOpenVariableDropdown] = useState<string | null>(null);
  const [metadataFields, setMetadataFields] = useState<MetadataFieldOption[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const buttonRefs = useRef<Record<string, React.RefObject<HTMLButtonElement>>>({});

  const getButtonRef = (key: string): React.RefObject<HTMLButtonElement> => {
    if (!buttonRefs.current[key]) {
      buttonRefs.current[key] = React.createRef<HTMLButtonElement>();
    }
    return buttonRefs.current[key];
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('imaging_metadata_fields')
        .select('id, field_name, display_label')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('display_label', { ascending: true });
      if (!mounted) return;
      setMetadataFields((data as MetadataFieldOption[]) || []);
      try {
        const types = await fetchDocumentTypes();
        if (mounted) setDocTypes(types.filter(t => t.isActive));
      } catch (err) {
        console.error('Failed to load imaging document types:', err);
      }
      setLoadingFields(false);
    })();
    return () => { mounted = false; };
  }, []);

  const rawMappings: FieldMapping[] = Array.isArray(config.fieldMappings)
    ? config.fieldMappings
    : Array.isArray(config.columnMappings)
      ? config.columnMappings.map((m: any) => {
          const legacyFieldName = LEGACY_COLUMN_TO_FIELD_NAME[m.column];
          const legacyMatch = legacyFieldName
            ? metadataFields.find(f => f.field_name === legacyFieldName)
            : null;
          return {
            fieldId: legacyMatch?.id || '',
            value: m.value || '',
            skipIfEmpty: m.skipIfEmpty !== false,
          };
        })
      : [];

  const fieldMappings: FieldMapping[] = rawMappings;

  const availableVariables: { name: string; stepName: string; source: 'extraction' | 'workflow' | 'source_record' | 'workflow_input'; dataType?: string }[] = [
    ...workflowInputVariables,
  ];
  allNodes.forEach((node) => {
    if (node.id === currentNodeId || node.type === 'start') return;
    const nodeConfig = node.data?.configJson || {};
    const nodeName = node.data?.label || 'Step';
    if (Array.isArray(nodeConfig.responseDataMappings)) {
      nodeConfig.responseDataMappings.forEach((m: any) => {
        if (m.updatePath) {
          availableVariables.push({ name: `response.${m.updatePath}`, stepName: nodeName, source: 'workflow' });
        }
      });
    }
    if (node.data?.stepType === 'read_email' && Array.isArray(nodeConfig.emailFieldMappings)) {
      nodeConfig.emailFieldMappings.forEach((m: any) => {
        if (m.fieldName) availableVariables.push({ name: m.fieldName, stepName: nodeName, source: 'workflow' });
      });
    }
    if (node.data?.stepType === 'data_transform' && Array.isArray(nodeConfig.transformations)) {
      nodeConfig.transformations.forEach((t: any) => {
        if (t.outputVariable) availableVariables.push({ name: `transform.${t.outputVariable}`, stepName: nodeName, source: 'workflow' });
      });
    }
    if (node.data?.stepType === 'read_barcode' && Array.isArray(nodeConfig.barcodeFieldMappings)) {
      nodeConfig.barcodeFieldMappings.forEach((m: any) => {
        if (m.fieldName) availableVariables.push({ name: m.fieldName, stepName: nodeName, source: 'workflow' });
      });
    }
  });

  const persistMappings = (next: FieldMapping[]) => {
    updateConfig('fieldMappings', next);
    if (config.columnMappings !== undefined) {
      updateConfig('columnMappings', undefined);
    }
  };

  const addMapping = () => {
    persistMappings([...fieldMappings, { fieldId: '', value: '', skipIfEmpty: true }]);
  };

  const updateMapping = (index: number, key: keyof FieldMapping, value: any) => {
    persistMappings(fieldMappings.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  };

  const removeMapping = (index: number) => {
    persistMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const insertVariableIntoValue = (index: number, varName: string) => {
    const current = fieldMappings[index]?.value || '';
    updateMapping(index, 'value', `${current}{{${varName}}}`);
    setOpenVariableDropdown(null);
  };

  const usedFieldIds = new Set(fieldMappings.map(m => m.fieldId).filter(Boolean));

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
        <p className="text-sm text-orange-700 dark:text-orange-300">
          Updates metadata on imaging documents. Use <span className="font-semibold">Find record by</span> to say which field the step should search by (for example Bill Number) and the value to look up. The step then applies the Metadata Field Updates to every matching document.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Document Type
          <span className="ml-1 text-gray-400 font-normal">(optional filter)</span>
        </label>
        <CustomDropdown
          value={config.documentTypeId || ''}
          onChange={(val) => updateConfig('documentTypeId', val)}
          options={[
            { value: '', label: 'Any (use trigger document)' },
            ...docTypes.map(t => ({ value: t.id, label: t.name })),
          ]}
          size="sm"
        />
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          Restricts the search to a specific document type (for example, only look up POD records).
        </p>
      </div>

      <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          Find record by
          <span className="ml-1 text-gray-400 font-normal">(field the step searches on)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Match Field</label>
            <CustomDropdown
              value={config.matchFieldId || ''}
              onChange={(val) => updateConfig('matchFieldId', val)}
              options={[
                { value: '', label: 'Use workflow context (detailLineId / billNumber)' },
                ...metadataFields.map(f => ({ value: f.id, label: f.display_label || f.field_name })),
              ]}
              size="sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Match Value</label>
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={config.matchValue || ''}
                onChange={(e) => updateConfig('matchValue', e.target.value)}
                placeholder="Value or {{variable}}"
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={!config.matchFieldId}
              />
              <button
                type="button"
                ref={getButtonRef('matchValue')}
                onClick={() => setOpenVariableDropdown(openVariableDropdown === 'matchValue' ? null : 'matchValue')}
                disabled={!config.matchFieldId}
                className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0 disabled:opacity-40"
                title="Insert variable"
              >
                <Braces className="w-3.5 h-3.5" />
              </button>
              <VariableDropdown
                isOpen={openVariableDropdown === 'matchValue'}
                onClose={() => setOpenVariableDropdown(null)}
                triggerRef={getButtonRef('matchValue')}
                variables={availableVariables}
                onSelect={(varName) => {
                  updateConfig('matchValue', `${config.matchValue || ''}{{${varName}}}`);
                  setOpenVariableDropdown(null);
                }}
              />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Example: to update the Detail Line ID on a document, set Match Field to <span className="font-mono">Bill Number</span> and Match Value to <span className="font-mono">{'{{billNumber}}'}</span>, then add a Metadata Field Update for Detail Line ID with the new value.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            Metadata Field Updates
            <span className="ml-1 text-gray-400 font-normal">(values support {'{{variable}}'})</span>
          </label>
          <button
            type="button"
            onClick={addMapping}
            disabled={loadingFields}
            className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            <span>Add field</span>
          </button>
        </div>

        {loadingFields && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Loading metadata fields...</p>
        )}

        {!loadingFields && metadataFields.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No active imaging metadata fields exist. Create one under Imaging Settings first.
          </p>
        )}

        {!loadingFields && fieldMappings.length === 0 && metadataFields.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">No fields configured. Add one to write a value back to the imaging document.</p>
        )}

        <div className="space-y-2">
          {fieldMappings.map((mapping, idx) => {
            const availableOptions = metadataFields.filter(
              f => f.id === mapping.fieldId || !usedFieldIds.has(f.id)
            );
            const valueFieldKey = `value_${idx}`;
            return (
              <div key={idx} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2 bg-gray-50 dark:bg-gray-800/50">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Metadata Field</label>
                    <CustomDropdown
                      value={mapping.fieldId}
                      onChange={(val) => updateMapping(idx, 'fieldId', val)}
                      options={availableOptions.map(f => ({ value: f.id, label: f.display_label || f.field_name }))}
                      placeholder="Select a field..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Value</label>
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={mapping.value}
                        onChange={(e) => updateMapping(idx, 'value', e.target.value)}
                        placeholder="Value or {{variable}}"
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        ref={getButtonRef(valueFieldKey)}
                        onClick={() => setOpenVariableDropdown(openVariableDropdown === valueFieldKey ? null : valueFieldKey)}
                        className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
                        title="Insert variable"
                      >
                        <Braces className="w-3.5 h-3.5" />
                      </button>
                      <VariableDropdown
                        isOpen={openVariableDropdown === valueFieldKey}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef(valueFieldKey)}
                        variables={availableVariables}
                        onSelect={(varName) => insertVariableIntoValue(idx, varName)}
                      />
                      <button
                        type="button"
                        onClick={() => removeMapping(idx)}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        title="Remove field"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                <label className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={mapping.skipIfEmpty !== false}
                    onChange={(e) => updateMapping(idx, 'skipIfEmpty', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span>Skip this field if the resolved value is empty</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
