import React from 'react';
import { Plus, Trash2, BookOpen, Table2 } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';

interface V2ReadEmailConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  setConfig: (fn: (prev: any) => any) => void;
}

interface ArraySubField {
  fieldName: string;
  dataType: string;
  instruction: string;
}

interface EmailFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'ai' | 'function' | 'array';
  value: string;
  location: 'subject' | 'body';
  dataType: string;
  subFields?: ArraySubField[];
}

const DATA_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'datetime', label: 'DateTime' },
  { value: 'date_only', label: 'Date Only' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'rin', label: 'RIN' },
];

export default function V2ReadEmailConfig({ config, updateConfig }: V2ReadEmailConfigProps) {
  const mappings: EmailFieldMapping[] = config.emailFieldMappings || [];

  const updateMapping = (index: number, field: string, value: any) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: value };
    updateConfig('emailFieldMappings', updated);
  };

  const addMapping = () => {
    updateConfig('emailFieldMappings', [
      ...mappings,
      { fieldName: '', type: 'hardcoded', value: '', location: 'body', dataType: 'string' },
    ]);
  };

  const removeMapping = (index: number) => {
    updateConfig('emailFieldMappings', mappings.filter((_, i) => i !== index));
  };

  const updateSubField = (mappingIndex: number, subIndex: number, key: keyof ArraySubField, value: string) => {
    const updated = [...mappings];
    const subFields = [...(updated[mappingIndex].subFields || [])];
    subFields[subIndex] = { ...subFields[subIndex], [key]: value };
    updated[mappingIndex] = { ...updated[mappingIndex], subFields };
    updateConfig('emailFieldMappings', updated);
  };

  const addSubField = (mappingIndex: number) => {
    const updated = [...mappings];
    const subFields = [...(updated[mappingIndex].subFields || [])];
    subFields.push({ fieldName: '', dataType: 'string', instruction: '' });
    updated[mappingIndex] = { ...updated[mappingIndex], subFields };
    updateConfig('emailFieldMappings', updated);
  };

  const removeSubField = (mappingIndex: number, subIndex: number) => {
    const updated = [...mappings];
    const subFields = (updated[mappingIndex].subFields || []).filter((_, i) => i !== subIndex);
    updated[mappingIndex] = { ...updated[mappingIndex], subFields };
    updateConfig('emailFieldMappings', updated);
  };

  const handleTypeChange = (index: number, newType: string) => {
    const updated = [...mappings];
    const current = updated[index];
    updated[index] = {
      ...current,
      type: newType as EmailFieldMapping['type'],
      subFields: newType === 'array' ? (current.subFields && current.subFields.length > 0 ? current.subFields : [{ fieldName: '', dataType: 'string', instruction: '' }]) : current.subFields,
    };
    updateConfig('emailFieldMappings', updated);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
        <div className="flex items-start space-x-3">
          <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
          <div>
            <h5 className="text-sm font-medium text-sky-800 dark:text-sky-200">Read Email</h5>
            <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
              Extract fields from the email subject and body. Each field becomes available as {'{{fieldName}}'} in subsequent steps.
              Available context variables: {'{{emailSubject}}'}, {'{{emailBody}}'}, {'{{emailFrom}}'}, {'{{emailDate}}'}.
              Use the <strong>Array</strong> type to pull a table with multiple rows out of the email body; the result is an array you can reference as {'{{fieldName}}'} in an API step (with "Wrap body in array" if needed) or iterate with a For Each step.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Email Field Mappings</label>
          <button
            type="button"
            onClick={addMapping}
            className="flex items-center space-x-1 px-2 py-1 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            <Plus className="w-3 h-3" />
            <span>Add Field</span>
          </button>
        </div>

        {mappings.length === 0 && (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            No field mappings configured. Click "Add Field" to get started.
          </div>
        )}

        <div className="space-y-2">
          {mappings.map((mapping, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                mapping.type === 'ai'
                  ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700'
                  : mapping.type === 'function'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                  : mapping.type === 'array'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
              }`}
            >
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Field Name</label>
                  <input
                    type="text"
                    value={mapping.fieldName || ''}
                    onChange={(e) => updateMapping(index, 'fieldName', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={mapping.type === 'array' ? 'e.g., routes' : 'e.g., poNumber'}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Type</label>
                  <CustomDropdown
                    value={mapping.type || 'hardcoded'}
                    onChange={(val) => handleTypeChange(index, val)}
                    options={[
                      { value: 'hardcoded', label: 'Hardcoded' },
                      { value: 'ai', label: 'AI' },
                      { value: 'function', label: 'Function' },
                      { value: 'array', label: 'Array (Table)' },
                    ]}
                    size="sm"
                  />
                </div>
                <div className={mapping.type === 'array' ? 'col-span-6' : 'col-span-3'}>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {mapping.type === 'ai' ? 'AI Instruction'
                      : mapping.type === 'function' ? 'Template'
                      : mapping.type === 'array' ? 'Table Description (AI Instruction)'
                      : 'Value'}
                  </label>
                  <input
                    type="text"
                    value={mapping.value || ''}
                    onChange={(e) => updateMapping(index, 'value', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={
                      mapping.type === 'ai' ? 'Extract the PO number'
                      : mapping.type === 'function' ? '{{emailFrom}}'
                      : mapping.type === 'array' ? 'Find every row of the routes table in the email body'
                      : 'literal value'
                    }
                  />
                </div>
                {(mapping.type === 'ai' || mapping.type === 'array') && (
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Location</label>
                    <CustomDropdown
                      value={mapping.location || 'body'}
                      onChange={(val) => updateMapping(index, 'location', val)}
                      options={[
                        { value: 'subject', label: 'Subject' },
                        { value: 'body', label: 'Body' },
                      ]}
                      size="sm"
                    />
                  </div>
                )}
                {mapping.type !== 'array' && (
                  <div className={mapping.type === 'ai' ? 'col-span-2' : 'col-span-4'}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Data Type</label>
                    <CustomDropdown
                      value={mapping.dataType || 'string'}
                      onChange={(val) => updateMapping(index, 'dataType', val)}
                      options={DATA_TYPES.map(dt => ({ value: dt.value, label: dt.label }))}
                      size="sm"
                    />
                  </div>
                )}
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={() => removeMapping(index)}
                    className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {mapping.type === 'array' && (
                <div className="mt-3 pl-3 border-l-2 border-blue-300 dark:border-blue-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5 text-xs font-medium text-blue-800 dark:text-blue-200">
                      <Table2 className="w-3.5 h-3.5" />
                      <span>Row Columns</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => addSubField(index)}
                      className="flex items-center space-x-1 px-2 py-0.5 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Column</span>
                    </button>
                  </div>
                  {(mapping.subFields || []).length === 0 && (
                    <div className="text-center py-3 text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded">
                      Add at least one column so the AI knows what to extract from each row.
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {(mapping.subFields || []).map((sub, subIndex) => (
                      <div key={subIndex} className="grid grid-cols-12 gap-2 items-end bg-white/60 dark:bg-gray-800/40 p-2 rounded">
                        <div className="col-span-3">
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Column Name</label>
                          <input
                            type="text"
                            value={sub.fieldName || ''}
                            onChange={(e) => updateSubField(index, subIndex, 'fieldName', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            placeholder="e.g., orderNo"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Data Type</label>
                          <CustomDropdown
                            value={sub.dataType || 'string'}
                            onChange={(val) => updateSubField(index, subIndex, 'dataType', val)}
                            options={DATA_TYPES.map(dt => ({ value: dt.value, label: dt.label }))}
                            size="sm"
                          />
                        </div>
                        <div className="col-span-6">
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Instruction</label>
                          <input
                            type="text"
                            value={sub.instruction || ''}
                            onChange={(e) => updateSubField(index, subIndex, 'instruction', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            placeholder="e.g., The Order Number column"
                          />
                        </div>
                        <div className="col-span-1">
                          <button
                            type="button"
                            onClick={() => removeSubField(index, subIndex)}
                            className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
