import React, { useState } from 'react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface ZipPostalFieldProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
}

const US_ZIP_REGEX = /^\d{5}$/;
const CA_POSTAL_REGEX = /^[A-Za-z]\d[A-Za-z] \d[A-Za-z]\d$/;

export function validateZipPostal(value: string): { isValid: boolean; format: 'us' | 'ca' | null } {
  if (!value) return { isValid: true, format: null };

  const trimmed = value.trim();

  if (US_ZIP_REGEX.test(trimmed)) {
    return { isValid: true, format: 'us' };
  }

  if (CA_POSTAL_REGEX.test(trimmed)) {
    return { isValid: true, format: 'ca' };
  }

  return { isValid: false, format: null };
}

export default function ZipPostalField({ field, value, error, onChange, onBlur, showIcon = true }: ZipPostalFieldProps) {
  const [touched, setTouched] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;

    if (/^\d+$/.test(input.replace(/\s/g, ''))) {
      input = input.replace(/\D/g, '').slice(0, 5);
    } else if (/[a-zA-Z]/.test(input)) {
      input = input.toUpperCase().replace(/[^A-Z0-9 ]/g, '');

      const noSpace = input.replace(/\s/g, '');
      if (noSpace.length > 6) {
        input = noSpace.slice(0, 6);
      }

      const stripped = input.replace(/\s/g, '');
      if (stripped.length > 3) {
        input = stripped.slice(0, 3) + ' ' + stripped.slice(3);
      }
    }

    onChange(input);
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();
  };

  const validation = validateZipPostal(value);
  const showValidationHint = touched && value && !validation.isValid;

  const getCharCount = () => {
    if (!value) return '0';
    const stripped = value.replace(/\s/g, '');
    return stripped.length.toString();
  };

  const getFormatHint = () => {
    if (validation.format === 'us') return 'US Zip';
    if (validation.format === 'ca') return 'CA Postal';
    return null;
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
      <div className="relative">
        <input
          type="text"
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={field.placeholder || 'Enter Zip (12345) or Postal Code (A1A 1A1)'}
          maxLength={7}
          className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:hover:bg-black text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 transition-colors ${
            error || showValidationHint
              ? 'border-red-500 dark:border-red-400 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {validation.format && value && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
            {getFormatHint()}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="flex-1">
          {field.helpText && !error && !showValidationHint && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {showValidationHint && !error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Enter a valid US Zip (12345) or Canadian Postal Code (A1A 1A1)
            </p>
          )}
          {!error && !showValidationHint && !field.helpText && (
            <p className="text-xs text-gray-500 dark:text-gray-400">US: 12345 | CA: A1A 1A1</p>
          )}
        </div>
        <span className={`text-xs ml-2 ${
          value && !validation.isValid
            ? 'text-orange-600 dark:text-orange-400 font-medium'
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {getCharCount()}/{validation.format === 'ca' || (value && /[a-zA-Z]/.test(value)) ? '6' : '5'}
        </span>
      </div>
    </div>
  );
}
