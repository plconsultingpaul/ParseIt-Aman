import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Filter, RotateCcw } from 'lucide-react';
import type { ImagingMetadataField } from '../../types';
import CustomDropdown from '../common/CustomDropdown';

interface ImagingFilterModalProps {
  fields: ImagingMetadataField[];
  currentFilters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
  onClose: () => void;
}

export default function ImagingFilterModal({ fields, currentFilters, onApply, onClose }: ImagingFilterModalProps) {
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({ ...currentFilters });

  const activeFields = fields.filter(f => f.isActive);

  const handleChange = (fieldId: string, value: string) => {
    setLocalFilters(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleReset = () => {
    setLocalFilters({});
  };

  const handleApply = () => {
    const cleaned: Record<string, string> = {};
    Object.entries(localFilters).forEach(([k, v]) => {
      if (v.trim()) cleaned[k] = v.trim();
    });
    onApply(cleaned);
    onClose();
  };

  const activeFilterCount = Object.values(localFilters).filter(v => v.trim()).length;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filter by Metadata</h3>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                {activeFilterCount} active
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {activeFields.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
              No metadata fields configured. Add fields in Imaging Settings to enable filtering.
            </div>
          ) : (
            activeFields.map(field => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {field.displayLabel}
                </label>
                {field.fieldType === 'dropdown' ? (
                  <CustomDropdown
                    value={localFilters[field.id] || ''}
                    onChange={(val) => handleChange(field.id, val)}
                    placeholder="Any"
                    options={field.dropdownOptions.map(opt => ({ value: opt, label: opt }))}
                  />
                ) : field.fieldType === 'boolean' ? (
                  <CustomDropdown
                    value={localFilters[field.id] || ''}
                    onChange={(val) => handleChange(field.id, val)}
                    placeholder="Any"
                    options={[
                      { value: 'true', label: 'Yes' },
                      { value: 'false', label: 'No' },
                    ]}
                  />
                ) : field.fieldType === 'date' ? (
                  <input
                    type="date"
                    value={localFilters[field.id] || ''}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <input
                    type={field.fieldType === 'number' ? 'number' : 'text'}
                    value={localFilters[field.id] || ''}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    placeholder={`Search by ${field.displayLabel}...`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset All</span>
          </button>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Filter className="h-4 w-4" />
              <span>Apply Filters</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    globalThis.document.body
  );
}
