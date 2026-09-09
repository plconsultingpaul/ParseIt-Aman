import React from 'react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface NumberFieldProps {
  field: OrderEntryField;
  value: number | string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
}

export default function NumberField({ field, value, error, onChange, onBlur, showIcon = true }: NumberFieldProps) {
  return (
    <div>
      {field.fieldLabel && (
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {showIcon && <FieldTypeIcon fieldType={field.fieldType} size="sm" />}
          <span>{field.fieldLabel}</span>
          {field.isRequired && <span className="text-red-600 dark:text-red-400">*</span>}
        </label>
      )}
      <input
        type="number"
        inputMode={field.fieldType === 'decimal' ? 'decimal' : 'numeric'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={field.placeholder}
        min={field.minValue}
        max={field.maxValue}
        step="any"
        className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:hover:bg-black text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors ${
          error
            ? 'border-red-500 dark:border-red-400 focus:ring-red-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      {field.fieldLabel && (
        <div className="flex items-center justify-between mt-1">
          <div>
            {field.helpText && !error && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
            )}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
          {(field.minValue !== undefined && field.minValue !== null || field.maxValue !== undefined && field.maxValue !== null) && !error && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {field.minValue !== undefined && field.minValue !== null && field.maxValue !== undefined && field.maxValue !== null
                ? `${field.minValue} - ${field.maxValue}`
                : field.minValue !== undefined && field.minValue !== null
                ? `Min: ${field.minValue}`
                : `Max: ${field.maxValue}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
