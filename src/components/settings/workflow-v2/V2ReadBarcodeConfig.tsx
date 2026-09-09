import React from 'react';
import { Plus, Trash2, ScanBarcode } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';

interface V2ReadBarcodeConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  setConfig: (fn: (prev: any) => any) => void;
}

interface BarcodeFieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'pattern' | 'function';
  value: string;
  dataType: string;
}

const DATA_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
];

export default function V2ReadBarcodeConfig({ config, updateConfig }: V2ReadBarcodeConfigProps) {
  const mappings: BarcodeFieldMapping[] = config.barcodeFieldMappings || [];
  const pdfSource: string = config.pdfSource || 'context';

  const updateMapping = (index: number, field: string, value: any) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: value };
    updateConfig('barcodeFieldMappings', updated);
  };

  const addMapping = () => {
    updateConfig('barcodeFieldMappings', [
      ...mappings,
      { fieldName: '', type: 'pattern', value: '', dataType: 'string' },
    ]);
  };

  const removeMapping = (index: number) => {
    updateConfig('barcodeFieldMappings', mappings.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start space-x-3">
          <ScanBarcode className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <h5 className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Read Barcode</h5>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              Scans a PDF for all barcodes (1D, 2D, QR, Code 128, Code 39, etc.) using AI detection.
              All detected barcodes are stored in <code className="px-1 py-0.5 bg-emerald-100 dark:bg-emerald-800 rounded text-xs">{'contextData.detectedBarcodes'}</code> as an array.
              Use pattern mappings to extract specific barcodes into named variables (e.g., pattern <code className="px-1 py-0.5 bg-emerald-100 dark:bg-emerald-800 rounded text-xs">DR*</code> matches the first barcode starting with "DR").
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">PDF Source</label>
        <CustomDropdown
          value={pdfSource}
          onChange={(val) => updateConfig('pdfSource', val)}
          options={[
            { value: 'context', label: 'Context (use contextData.pdfBase64)' },
            { value: 'storage', label: 'Storage (fetch from storage path)' },
          ]}
          size="sm"
        />
      </div>

      {pdfSource === 'storage' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Storage Path</label>
          <input
            type="text"
            value={config.storagePath || ''}
            onChange={(e) => updateConfig('storagePath', e.target.value)}
            placeholder="bucket-name/path/to/file.pdf or {{contextData.storagePath}}"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Use {'{{contextData.storagePath}}'} to reference the storage path from the trigger context.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Barcode Field Mappings</label>
          <button
            type="button"
            onClick={addMapping}
            className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <Plus className="w-3 h-3" />
            <span>Add Field</span>
          </button>
        </div>

        {mappings.length === 0 && (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            No field mappings configured. All detected barcodes will still be available in <code className="text-xs">contextData.detectedBarcodes</code>.
          </div>
        )}

        <div className="space-y-2">
          {mappings.map((mapping, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${
                mapping.type === 'pattern'
                  ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700'
                  : mapping.type === 'function'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
              }`}
            >
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Field Name</label>
                  <input
                    type="text"
                    value={mapping.fieldName || ''}
                    onChange={(e) => updateMapping(index, 'fieldName', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="e.g., drNumber"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Type</label>
                  <CustomDropdown
                    value={mapping.type || 'pattern'}
                    onChange={(val) => updateMapping(index, 'type', val)}
                    options={[
                      { value: 'pattern', label: 'Pattern' },
                      { value: 'hardcoded', label: 'Hardcoded' },
                      { value: 'function', label: 'Function' },
                    ]}
                    size="sm"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {mapping.type === 'pattern' ? 'Pattern' : mapping.type === 'function' ? 'Template' : 'Value'}
                  </label>
                  <input
                    type="text"
                    value={mapping.value || ''}
                    onChange={(e) => updateMapping(index, 'value', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={
                      mapping.type === 'pattern' ? 'DR* or *INV or BOL*123'
                      : mapping.type === 'function' ? '{{contextData.detectedBarcodes[0]}}'
                      : 'literal value'
                    }
                  />
                </div>
                <div className="col-span-2">
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
