import React from 'react';
import { Check } from 'lucide-react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface BooleanFieldProps {
  field: OrderEntryField;
  value: boolean;
  error?: string;
  onChange: (value: boolean) => void;
  onBlur?: () => void;
  showIcon?: boolean;
}

export default function BooleanField({ field, value, error, onChange, onBlur, showIcon = true }: BooleanFieldProps) {
  return (
    <div>
      <div className="flex items-start space-x-3">
        <div className="relative">
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
            className="sr-only peer"
            id={`checkbox-${field.id}`}
          />
          <label
            htmlFor={`checkbox-${field.id}`}
            className={`flex items-center justify-center w-5 h-5 border-2 rounded cursor-pointer transition-colors ${
              error
                ? 'border-red-500 dark:border-red-400'
                : value
                ? 'border-purple-600 dark:border-purple-400 bg-purple-600 dark:bg-purple-600'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
            }`}
          >
            {value && <Check className="h-3 w-3 text-white" />}
          </label>
        </div>
        {field.fieldLabel && (
          <div className="flex-1">
            <label
              htmlFor={`checkbox-${field.id}`}
              className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              {showIcon && <FieldTypeIcon fieldType={field.fieldType} size="sm" />}
              <span>{field.fieldLabel}</span>
              {field.isRequired && <span className="text-red-600 dark:text-red-400">*</span>}
            </label>
            {field.helpText && !error && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{field.helpText}</p>
            )}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
