import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownColorConfig {
  triggerClass: string;
}

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  disabled?: boolean;
  disabledOptions?: string[];
  className?: string;
  dropdownMinWidth?: number;
  searchable?: boolean;
  error?: boolean;
  colorMap?: Record<string, DropdownColorConfig>;
}

export default function CustomDropdown({
  value,
  onChange,
  options,
  placeholder,
  size = 'md',
  icon,
  disabled,
  disabledOptions,
  className,
  dropdownMinWidth,
  searchable,
  error,
  colorMap,
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 300 });

  const showSearch = searchable ?? options.length >= 10;

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    setPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, spaceBelow),
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setHighlightIndex(-1);
      return;
    }
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open && showSearch) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open, showSearch]);

  const selected = options.find(o => o.value === value);

  const filteredOptions = showSearch && searchQuery.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  const computedWidth = dropdownMinWidth ? Math.max(pos.width, dropdownMinWidth) : pos.width;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        const currentIdx = filteredOptions.findIndex(o => o.value === value);
        setHighlightIndex(currentIdx >= 0 ? currentIdx : 0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => (prev + 1) % filteredOptions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case 'Enter':
      case ' ':
        if (!showSearch || e.key === 'Enter') {
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
            const opt = filteredOptions[highlightIndex];
            if (!disabledOptions?.includes(opt.value)) {
              onChange(opt.value);
              setOpen(false);
              triggerRef.current?.focus();
            }
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (open && highlightIndex >= 0) {
      const container = listRef.current?.querySelector('[data-options-list]');
      const highlighted = container?.children[highlightIndex] as HTMLElement | undefined;
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, open]);

  const activeColor = colorMap && value ? colorMap[value] : undefined;

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen(prev => !prev)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`flex items-center justify-between w-full rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
          disabled ? 'opacity-50 cursor-not-allowed ' : ''
        }${
          size === 'sm' ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3 py-2'
        } ${
          error
            ? 'border border-red-500 dark:border-red-400 bg-white dark:bg-slate-900/50 text-slate-700 dark:text-slate-200'
            : activeColor
              ? `border-transparent ${activeColor.triggerClass}`
              : 'bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/70'
        }`}
      >
        <span className={`flex items-center gap-1.5 truncate ${
          selected
            ? 'text-slate-900 dark:text-slate-100'
            : 'text-slate-400 dark:text-slate-500'
        }`}>
          {icon}{selected?.label || placeholder || 'Select...'}
        </span>
        <ChevronDown className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} flex-shrink-0 ml-2 transition-transform duration-200 text-slate-400 dark:text-slate-500 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: computedWidth, maxHeight: pos.maxHeight, zIndex: 9999 }}
          className="rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] overflow-hidden origin-top bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex flex-col"
        >
          {showSearch && (
            <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setHighlightIndex(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="py-1 min-h-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {searchQuery ? 'No results found' : 'No options available'}
              </div>
            ) : (
              <div data-options-list>
                {filteredOptions.map((option, idx) => {
                  const isSelected = option.value === value;
                  const isHighlighted = idx === highlightIndex;
                  const isOptionDisabled = disabledOptions?.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (isOptionDisabled) return;
                        onChange(option.value);
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`relative flex items-center w-full ${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} select-none transition-colors ${
                        isOptionDisabled
                          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-500'
                          : isHighlighted
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white cursor-pointer'
                            : isSelected
                              ? 'bg-blue-50/50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium cursor-pointer'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white cursor-pointer'
                      }`}
                    >
                      <span className="truncate flex-1 text-left">{option.label}</span>
                      {isSelected && !isOptionDisabled && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-2 text-blue-600 dark:text-blue-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
