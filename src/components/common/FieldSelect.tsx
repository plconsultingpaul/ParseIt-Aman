import React, { useMemo } from 'react';
import type { OrderEntryField, DropdownOption, DropdownDisplayMode, DropdownOptionVisibilityRule } from '../../types';
import FieldTypeIcon from './FieldTypeIcon';
import CustomDropdown from './CustomDropdown';

interface NormalizedOption {
  value: string;
  description: string;
  displayText: string;
  visibilityRules?: DropdownOptionVisibilityRule[];
}

interface FieldSelectProps {
  field: OrderEntryField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showIcon?: boolean;
  formData?: Record<string, unknown>;
  disabledOptions?: string[];
}

function checkVisibilityRules(
  rules: DropdownOptionVisibilityRule[] | undefined,
  formData: Record<string, unknown> | undefined
): boolean {
  if (!rules || rules.length === 0) return true;
  if (!formData) return true;

  return rules.every(rule => {
    if (!rule.dependsOnField || rule.showWhenValues.length === 0) return true;
    const fieldValue = String(formData[rule.dependsOnField] || '');
    return rule.showWhenValues.some(v => v.toLowerCase() === fieldValue.toLowerCase());
  });
}

export default function FieldSelect({ field, value, error, onChange, onBlur, showIcon = true, formData, disabledOptions }: FieldSelectProps) {
  const displayMode: DropdownDisplayMode = field.dropdownDisplayMode || 'description_only';

  const normalizedOptions: NormalizedOption[] = useMemo(() => {
    if (!Array.isArray(field.dropdownOptions)) return [];

    return field.dropdownOptions
      .filter(opt => opt && (typeof opt === 'string' ? opt.trim().length > 0 : opt.value?.trim().length > 0))
      .map(opt => {
        if (typeof opt === 'string') {
          return { value: opt, description: opt, displayText: opt };
        }
        const typedOpt = opt as DropdownOption;
        const displayText = displayMode === 'value_and_description'
          ? `${typedOpt.value} - ${typedOpt.description}`
          : typedOpt.description || typedOpt.value;
        return {
          value: typedOpt.value,
          description: typedOpt.description,
          displayText,
          visibilityRules: typedOpt.visibilityRules
        };
      });
  }, [field.dropdownOptions, displayMode]);

  const visibleOptions = useMemo(() => {
    return normalizedOptions.filter(opt =>
      checkVisibilityRules(opt.visibilityRules, formData)
    );
  }, [normalizedOptions, formData]);

  const dropdownOptions = useMemo(() => {
    return visibleOptions.map(opt => ({
      value: opt.value,
      label: opt.displayText,
    }));
  }, [visibleOptions]);

  return (
    <div>
      {field.fieldLabel && (
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {showIcon && <FieldTypeIcon fieldType={field.fieldType} size="sm" />}
          <span>{field.fieldLabel}</span>
          {field.isRequired && <span className="text-red-600 dark:text-red-400">*</span>}
        </label>
      )}

      <CustomDropdown
        value={value || ''}
        onChange={(val) => {
          onChange(val);
          onBlur?.();
        }}
        options={dropdownOptions}
        placeholder={field.placeholder || 'Select an option...'}
        error={!!error}
        disabledOptions={disabledOptions}
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
