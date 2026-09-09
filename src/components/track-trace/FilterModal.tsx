import React from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import type { TrackTraceField, TrackTraceConfig, TrackTraceOrderByOption } from '../../types';
import Select from '../common/Select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (filterValues: Record<string, any>, orderBy: string, orderDirection: 'asc' | 'desc') => void;
  filterFields: TrackTraceField[];
  filterValues: Record<string, any>;
  config: TrackTraceConfig;
  selectedOrderBy: string;
  orderDirection: 'asc' | 'desc';
}

export default function FilterModal({
  isOpen,
  onClose,
  onSave,
  filterFields,
  filterValues: initialFilterValues,
  config,
  selectedOrderBy: initialOrderBy,
  orderDirection: initialOrderDirection
}: FilterModalProps) {
  const [localFilterValues, setLocalFilterValues] = React.useState<Record<string, any>>(initialFilterValues);
  const [localOrderBy, setLocalOrderBy] = React.useState(initialOrderBy);
  const [localOrderDirection, setLocalOrderDirection] = React.useState<'asc' | 'desc'>(initialOrderDirection);

  React.useEffect(() => {
    if (isOpen) {
      setLocalFilterValues(initialFilterValues);
      setLocalOrderBy(initialOrderBy);
      setLocalOrderDirection(initialOrderDirection);
    }
  }, [isOpen, initialFilterValues, initialOrderBy, initialOrderDirection]);

  const handleFilterValueChange = (fieldId: string, value: any) => {
    setLocalFilterValues({ ...localFilterValues, [fieldId]: value });
  };

  const toggleOrderDirection = () => {
    setLocalOrderDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const handleSave = () => {
    onSave(localFilterValues, localOrderBy, localOrderDirection);
  };

  const handleClearAll = () => {
    setLocalFilterValues({});
    setLocalOrderBy('__none__');
    setLocalOrderDirection('desc');
  };

  const renderFilterInput = (field: TrackTraceField) => {
    const value = localFilterValues[field.id];

    switch (field.dataType) {
      case 'string':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleFilterValueChange(field.id, e.target.value)}
            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => handleFilterValueChange(field.id, e.target.value ? Number(e.target.value) : '')}
            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        );

      case 'date':
        return (
          <DatePicker
            selected={value ? new Date(value) : null}
            onChange={(date) => handleFilterValueChange(field.id, date)}
            dateFormat="yyyy-MM-dd"
            placeholderText={`Select ${field.displayLabel.toLowerCase()}`}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        );

      case 'boolean':
        return (
          <Select
            value={value === undefined ? '' : String(value)}
            onValueChange={(v) => handleFilterValueChange(field.id, v === '' ? undefined : v === 'true')}
            options={[
              { value: '', label: 'Any' },
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' }
            ]}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleFilterValueChange(field.id, e.target.value)}
            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        <div className="relative inline-block w-full max-w-lg p-6 my-8 text-left align-middle bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Filter & Sort Options
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
            {filterFields.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Filters
                </h4>
                {filterFields.map(field => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {field.displayLabel}
                      {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderFilterInput(field)}
                  </div>
                ))}
              </div>
            )}

            {config.orderByOptions.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Sort Options
                </h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Order By
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1">
                      <Select
                        value={localOrderBy || '__none__'}
                        onValueChange={setLocalOrderBy}
                        options={[
                          { value: '__none__', label: 'None' },
                          ...config.orderByOptions
                            .filter((o: TrackTraceOrderByOption) => o.field)
                            .map((o: TrackTraceOrderByOption) => ({
                              value: o.field,
                              label: o.label || o.field
                            }))
                        ]}
                      />
                    </div>
                    {localOrderBy && localOrderBy !== '__none__' && (
                      <button
                        onClick={toggleOrderDirection}
                        className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title={localOrderDirection === 'asc' ? 'Ascending' : 'Descending'}
                      >
                        {localOrderDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClearAll}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              Clear All
            </button>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
