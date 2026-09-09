import React from 'react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface ZipFieldProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
}

export default function ZipField({ field, value, error, onChange, onBlur, showIcon = true }: ZipFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const digitsOnly = input.replace(/\D/g, '');
    const truncated = digitsOnly.slice(0, 5);
    onChange(truncated);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!/^\d$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      e.preventDefault();
    }
  };

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
        type="text"
        inputMode="numeric"
        value={value || ''}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        onBlur={onBlur}
        placeholder={field.placeholder || '12345'}
        maxLength={5}
        className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:hover:bg-black text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500 transition-colors ${
          error
            ? 'border-red-500 dark:border-red-400 focus:ring-red-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      <div className="flex items-center justify-between mt-1">
        <div>
          {field.helpText && !error && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
        <span className={`text-xs ${
          value && value.length !== 5
            ? 'text-orange-600 dark:text-orange-400 font-medium'
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {value?.length || 0}/5
        </span>
      </div>
    </div>
  );
}
