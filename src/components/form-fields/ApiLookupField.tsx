import React from 'react';
import { Search } from 'lucide-react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface ApiLookupFieldProps {
  field: OrderEntryField;
  value?: string;
  error?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onOpenLookup: () => void;
  showIcon?: boolean;
  compact?: boolean;
}

export default function ApiLookupField({ field, error, onOpenLookup, showIcon = true, compact = false }: ApiLookupFieldProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpenLookup}
        className="w-full px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs font-medium"
      >
        <Search className="w-3.5 h-3.5" />
        Search
      </button>
    );
  }

  return (
    <div>
      {field.fieldLabel && (
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {showIcon && <FieldTypeIcon fieldType={field.fieldType} size="sm" />}
            <span>{field.fieldLabel}</span>
            {field.isRequired && <span className="text-red-600 dark:text-red-400">*</span>}
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={onOpenLookup}
        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
      >
        <Search className="w-4 h-4" />
        Search
      </button>
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
