import React from 'react';
import type { OrderEntryField } from '../../types';
import FieldTypeIcon from '../common/FieldTypeIcon';
import DatePicker from '../common/DatePicker';

interface DateFieldProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
  disabledDates?: string[];
}

export default function DateField({ field, value, error, onChange, onBlur, showIcon = true, disabledDates }: DateFieldProps) {
  const getMinDate = (): string | undefined => {
    if (!field.futureDatesOnly) return undefined;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
      <DatePicker
        value={value || ''}
        onChange={(val) => {
          onChange(val);
          onBlur?.();
        }}
        placeholder={field.placeholder}
        error={!!error}
        minDate={getMinDate()}
        disableWeekends={field.allowWeekends === false}
        disabledDates={field.allowHolidays === false ? disabledDates : undefined}
      />
      {field.helpText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{field.helpText}</p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
