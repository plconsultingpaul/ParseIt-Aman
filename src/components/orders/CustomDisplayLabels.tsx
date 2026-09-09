import React from 'react';
import { Eye, Plus, Trash2 } from 'lucide-react';
import type { OrderDisplayMapping } from '../../types';

interface CustomDisplayLabelsProps {
  customOrderDisplayFields: OrderDisplayMapping[];
  onUpdateCustomOrderDisplayFields: (fields: OrderDisplayMapping[]) => void;
}

export default function CustomDisplayLabels({
  customOrderDisplayFields,
  onUpdateCustomOrderDisplayFields
}: CustomDisplayLabelsProps) {
  const handleAddCustomLabel = () => {
    onUpdateCustomOrderDisplayFields([
      ...customOrderDisplayFields,
      { fieldName: '', displayLabel: '' }
    ]);
  };

  const handleUpdateCustomLabel = (index: number, field: 'fieldName' | 'displayLabel', value: string) => {
    const updated = customOrderDisplayFields.map((mapping, i) =>
      i === index ? { ...mapping, [field]: value } : mapping
    );
    onUpdateCustomOrderDisplayFields(updated);
  };

  const handleRemoveCustomLabel = (index: number) => {
    const updated = customOrderDisplayFields.filter((_, i) => i !== index);
    onUpdateCustomOrderDisplayFields(updated);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg">
            <Eye className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Custom Display Labels</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">Customize how field names appear in the Orders grid</p>
          </div>
        </div>
        <button
          onClick={handleAddCustomLabel}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Custom Label</span>
        </button>
      </div>

      <div className="space-y-3">
        {customOrderDisplayFields.map((mapping, index) => (
          <div key={index} className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Original Field Name
                </label>
                <input
                  type="text"
                  value={mapping.fieldName}
                  onChange={(e) => handleUpdateCustomLabel(index, 'fieldName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  placeholder="e.g., consignee.address1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Display Label
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={mapping.displayLabel}
                    onChange={(e) => handleUpdateCustomLabel(index, 'displayLabel', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="e.g., CONS_ADDRESS"
                  />
                  <button
                    onClick={() => handleRemoveCustomLabel(index)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {customOrderDisplayFields.length === 0 && (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <Eye className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Custom Labels</h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Add custom display labels to rename field headers in the Orders grid</p>
            <button
              onClick={handleAddCustomLabel}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Custom Label</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3">
        <h5 className="font-medium text-indigo-800 dark:text-indigo-300 mb-2">How Custom Labels Work</h5>
        <ul className="text-sm text-indigo-700 dark:text-indigo-400 space-y-1">
          <li>• Enter the exact field name from your Order Display Fields (e.g., <code className="bg-indigo-100 dark:bg-indigo-800 px-1 rounded">consignee.address1</code>)</li>
          <li>• Provide a custom label that will appear as the column header (e.g., <code className="bg-indigo-100 dark:bg-indigo-800 px-1 rounded">CONS_ADDRESS</code>)</li>
          <li>• Custom labels override the default field names in the Orders grid</li>
          <li>• Fields without custom labels will use the default display names</li>
        </ul>
      </div>
    </div>
  );
}
