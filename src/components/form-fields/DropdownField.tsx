import React from 'react';
import type { OrderEntryField } from '../../types';
import FieldSelect from '../common/FieldSelect';

interface DropdownFieldProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
  formData?: Record<string, unknown>;
  disabledOptions?: string[];
}

export default function DropdownField({ field, value, error, onChange, onBlur, showIcon = true, formData, disabledOptions }: DropdownFieldProps) {
  return (
    <FieldSelect
      field={field}
      value={value}
      error={error}
      onChange={onChange}
      onBlur={onBlur}
      showIcon={showIcon}
      formData={formData}
      disabledOptions={disabledOptions}
    />
  );
}
