import React from 'react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface TextFieldProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
}

export default function TextField({ field, value, error, onChange, onBlur, showIcon = true }: TextFieldProps) {
  const currentLength = value?.length || 0;
  const showCounter = field.maxLength && field.maxLength > 0;

  return (
    <div>
      {field.fieldLabel && (
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {showIcon && <FieldTypeIcon fieldType={field.fieldType} size="sm" />}
            <span>{field.fieldLabel}</span>
            {field.isRequired && <span className="text-red-600 dark:text-red-400">*</span>}
          </label>
          {showCounter && (
            <span className={`text-xs ${
              currentLength > field.maxLength!
                ? 'text-red-600 dark:text-red-400 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {currentLength}/{field.maxLength}
            </span>
          )}
        </div>
      )}
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={field.placeholder}
        maxLength={field.maxLength || undefined}
        className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:hover:bg-black text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors ${
          error
            ? 'border-red-500 dark:border-red-400 focus:ring-red-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      {(field.helpText || error) && (
        <div className="mt-1">
          {field.helpText && !error && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
