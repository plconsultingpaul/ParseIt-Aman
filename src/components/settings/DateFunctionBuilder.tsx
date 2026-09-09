import React from 'react';
import { Calendar, Plus, Minus } from 'lucide-react';
import { DateFunctionLogic } from '../../types';
import CustomDropdown from '../common/CustomDropdown';

interface AvailableField {
  fieldName: string;
  dataType?: string;
}

interface DateFunctionBuilderProps {
  dateLogic: DateFunctionLogic;
  availableFields: AvailableField[];
  onChange: (logic: DateFunctionLogic) => void;
}

const OUTPUT_FORMATS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2025-12-18)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/18/2025)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (18/12/2025)' },
  { value: 'YYYY-MM-DDTHH:mm:ss', label: 'ISO DateTime (2025-12-18T00:00:00)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (12-18-2025)' },
];

export const DateFunctionBuilder: React.FC<DateFunctionBuilderProps> = ({
  dateLogic,
  availableFields,
  onChange,
}) => {
  const handleSourceChange = (source: 'field' | 'current_date') => {
    onChange({
      ...dateLogic,
      source,
      fieldName: source === 'current_date' ? undefined : dateLogic.fieldName,
    });
  };

  const handleFieldNameChange = (fieldName: string) => {
    onChange({ ...dateLogic, fieldName });
  };

  const handleOperationChange = (operation: 'add' | 'subtract') => {
    onChange({ ...dateLogic, operation });
  };

  const handleDaysChange = (days: number) => {
    onChange({ ...dateLogic, days: Math.max(0, days) });
  };

  const handleOutputFormatChange = (outputFormat: string) => {
    onChange({ ...dateLogic, outputFormat: outputFormat || undefined });
  };

  const dateFields = availableFields.filter(field => field.dataType === 'datetime');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <Calendar className="w-4 h-4" />
        Date Calculation
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Date Source
          </label>
          <CustomDropdown
            value={dateLogic.source}
            onChange={(value) => handleSourceChange(value as 'field' | 'current_date')}
            options={[
              { value: 'current_date', label: 'Current Date' },
              { value: 'field', label: 'Field from Data' },
            ]}
          />
        </div>

        {dateLogic.source === 'field' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Source Field
            </label>
            <CustomDropdown
              value={dateLogic.fieldName || ''}
              onChange={(value) => handleFieldNameChange(value)}
              options={dateFields.map((field) => ({ value: field.fieldName, label: field.fieldName }))}
              placeholder="Select a date field..."
            />
            {dateFields.length === 0 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                No fields with datetime data type found. Set a field's data type to "datetime" in the field mappings.
              </p>
            )}
            {dateFields.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only fields with datetime data type are shown
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Operation
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleOperationChange('add')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  dateLogic.operation === 'add'
                    ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:border-green-600 dark:text-green-400'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
              <button
                type="button"
                onClick={() => handleOperationChange('subtract')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  dateLogic.operation === 'subtract'
                    ? 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Minus className="w-4 h-4" />
                Subtract
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Days
            </label>
            <input
              type="number"
              min="0"
              value={dateLogic.days}
              onChange={(e) => handleDaysChange(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Output Format
          </label>
          <CustomDropdown
            value={dateLogic.outputFormat || 'YYYY-MM-DD'}
            onChange={(value) => handleOutputFormatChange(value)}
            options={OUTPUT_FORMATS}
          />
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Result:</strong>{' '}
            {dateLogic.source === 'current_date' ? 'Current Date' : `{${dateLogic.fieldName || 'field'}}`}
            {' '}
            {dateLogic.operation === 'add' ? '+' : '-'}
            {' '}
            {dateLogic.days} day{dateLogic.days !== 1 ? 's' : ''}
            {' '}
            <span className="text-blue-600 dark:text-blue-400">
              (format: {dateLogic.outputFormat || 'YYYY-MM-DD'})
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
