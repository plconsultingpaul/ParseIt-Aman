import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  helpText?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  searchable?: boolean;
  searchThreshold?: number;
  maxHeight?: string;
}

export default function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option...',
  label,
  error,
  helpText,
  disabled = false,
  className = '',
  required = false,
  searchable = true,
  searchThreshold = 10,
  maxHeight = '300px',
}: SelectProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const showSearch = searchable && options.length >= searchThreshold;

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;

    const query = searchQuery.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(query) ||
      option.value.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  useEffect(() => {
    if (open && showSearch && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }

    if (!open) {
      setSearchQuery('');
    }
  }, [open, showSearch]);

  const groupedOptions = useMemo(() => {
    const grouped: Record<string, SelectOption[]> = {};

    filteredOptions.forEach((option) => {
      const groupName = option.group || '__ungrouped__';
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(option);
    });

    return grouped;
  }, [filteredOptions]);

  const hasGroups = Object.keys(groupedOptions).some(key => key !== '__ungrouped__');

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
          {required && <span className="text-red-600 dark:text-red-400 ml-1">*</span>}
        </label>
      )}

      <SelectPrimitive value={value} onValueChange={onValueChange} disabled={disabled} open={open} onOpenChange={setOpen}>
        <SelectTrigger
          className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 transition-all ${
            error
              ? 'border-red-500 dark:border-red-400 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500'
          }`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent
          className="border border-gray-200 dark:border-gray-700"
          style={{ maxHeight }}
        >
          {showSearch && (
            <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all hover:border-blue-400 dark:hover:border-blue-500"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: showSearch ? `calc(${maxHeight} - 60px)` : maxHeight }}>
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found
              </div>
            ) : hasGroups ? (
              Object.entries(groupedOptions).map(([groupName, groupOptions]) => (
                groupName === '__ungrouped__' ? (
                  groupOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <SelectGroup key={groupName}>
                    <SelectLabel className="text-gray-700 dark:text-gray-300 font-semibold sticky top-0 bg-popover">
                      {groupName}
                    </SelectLabel>
                    {groupOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )
              ))
            ) : (
              filteredOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {option.label}
                </SelectItem>
              ))
            )}
          </div>
        </SelectContent>
      </SelectPrimitive>

      {helpText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helpText}</p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
