import React from 'react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface PostalCodeFieldProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
}

export default function PostalCodeField({ field, value, error, onChange, onBlur, showIcon = true }: PostalCodeFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.toUpperCase();
    input = input.replace(/[^A-Z0-9]/g, '');

    if (input.length > 6) {
      input = input.slice(0, 6);
    }

    let formatted = input;
    if (input.length > 3) {
      formatted = input.slice(0, 3) + ' ' + input.slice(3);
    }

    onChange(formatted);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const char = e.key.toUpperCase();
    const currentValue = (value || '').replace(/\s/g, '');
    const position = currentValue.length;

    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      return;
    }

    if (position === 0 || position === 2 || position === 4) {
      if (!/^[A-Z]$/.test(char)) {
        e.preventDefault();
      }
    } else if (position === 1 || position === 3 || position === 5) {
      if (!/^\d$/.test(char)) {
        e.preventDefault();
      }
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
        value={value || ''}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        onBlur={onBlur}
        placeholder={field.placeholder || 'A1A 1A1'}
        maxLength={7}
        className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:hover:bg-black text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 transition-colors uppercase ${
          error
            ? 'border-red-500 dark:border-red-400 focus:ring-red-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      <div className="flex items-center justify-between mt-1">
        <div className="flex-1">
          {field.helpText && !error && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {!error && !field.helpText && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Format: A1A 1A1</p>
          )}
        </div>
        <span className={`text-xs ml-2 ${
          value && value.replace(/\s/g, '').length !== 6
            ? 'text-orange-600 dark:text-orange-400 font-medium'
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {value?.replace(/\s/g, '').length || 0}/6
        </span>
      </div>
    </div>
  );
}
