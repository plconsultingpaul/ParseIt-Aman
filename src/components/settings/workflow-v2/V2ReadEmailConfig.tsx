import React from 'react';
import { Plus, Trash2, BookOpen } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';

interface V2ReadEmailConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  setConfig: (fn: (prev: any) => any) => void;
}

interface EmailFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'ai' | 'function';
  value: string;
  location: 'subject' | 'body';
  dataType: string;
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
                    placeholder="e.g., poNumber"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Type</label>
                  <CustomDropdown
                    value={mapping.type || 'hardcoded'}
                    onChange={(val) => updateMapping(index, 'type', val)}
                    options={[
                      { value: 'hardcoded', label: 'Hardcoded' },
                      { value: 'ai', label: 'AI' },
                      { value: 'function', label: 'Function' },
                    ]}
                    size="sm"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {mapping.type === 'ai' ? 'AI Instruction' : mapping.type === 'function' ? 'Template' : 'Value'}
                  </label>
                  <input
                    type="text"
                    value={mapping.value || ''}
                    onChange={(e) => updateMapping(index, 'value', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={
                      mapping.type === 'ai' ? 'Extract the PO number'
                      : mapping.type === 'function' ? '{{emailFrom}}'
                      : 'literal value'
                    }
                  />
                </div>
                {mapping.type === 'ai' && (
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
                <div className={mapping.type === 'ai' ? 'col-span-2' : 'col-span-4'}>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Data Type</label>
                  <CustomDropdown
                    value={mapping.dataType || 'string'}
                    onChange={(val) => updateMapping(index, 'dataType', val)}
                    options={DATA_TYPES.map(dt => ({ value: dt.value, label: dt.label }))}
                    size="sm"
                  />
                </div>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
