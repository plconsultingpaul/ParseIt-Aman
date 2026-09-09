import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, ArrowLeft, Braces } from 'lucide-react';
import VariableDropdown from './VariableDropdown';

interface SpecField {
  field_name: string;
  field_path: string;
  field_type: string;
  description?: string;
}

interface AvailableVariable {
  name: string;
  stepName: string;
  source: 'extraction' | 'workflow' | 'execute' | 'source_record';
  dataType?: string;
}

interface SpecFieldDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  fields: SpecField[];
  loading?: boolean;
  onSelect: (fieldPath: string) => void;
  isFilterParam?: boolean;
  onSelectFilterExpression?: (expression: string) => void;
  availableVariables?: AvailableVariable[];
}

export interface SpecFieldDropdownHandle {
  isInFilterBuildMode: () => boolean;
  insertFilterVariable: (varName: string) => void;
}

const FILTER_OPERATORS = [
  { value: 'eq', label: 'Equals (eq)' },
  { value: 'ne', label: 'Not Equals (ne)' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not Contains' },
  { value: 'startswith', label: 'Starts With' },
  { value: 'endswith', label: 'Ends With' },
  { value: 'gt', label: 'Greater Than (gt)' },
  { value: 'ge', label: 'Greater Than or Equal (ge)' },
  { value: 'lt', label: 'Less Than (lt)' },
  { value: 'le', label: 'Less Than or Equal (le)' },
  { value: 'is_null', label: 'Is Null' },
  { value: 'is_not_null', label: 'Is Not Null' },
  { value: 'is_blank', label: 'Is Blank (null or empty)' },
  { value: 'is_not_blank', label: 'Is Not Blank' },
];

function buildODataExpression(fieldPath: string, operator: string, value: string): string {
  switch (operator) {
    case 'eq': return `${fieldPath} eq '${value}'`;
    case 'ne': return `${fieldPath} ne '${value}'`;
    case 'contains': return `contains(${fieldPath},'${value}')`;
    case 'not_contains': return `not contains(${fieldPath},'${value}')`;
    case 'startswith': return `startswith(${fieldPath},'${value}')`;
    case 'endswith': return `endswith(${fieldPath},'${value}')`;
    case 'gt': return `${fieldPath} gt '${value}'`;
    case 'ge': return `${fieldPath} ge '${value}'`;
    case 'lt': return `${fieldPath} lt '${value}'`;
    case 'le': return `${fieldPath} le '${value}'`;
    case 'is_null': return `${fieldPath} eq null`;
    case 'is_not_null': return `${fieldPath} ne null`;
    case 'is_blank': return `(${fieldPath} eq null or ${fieldPath} eq '')`;
    case 'is_not_blank': return `(${fieldPath} ne null and ${fieldPath} ne '')`;
    default: return `${fieldPath} eq '${value}'`;
  }
}

const NO_VALUE_OPERATORS = ['is_null', 'is_not_null', 'is_blank', 'is_not_blank'];

const SpecFieldDropdown = forwardRef<SpecFieldDropdownHandle, SpecFieldDropdownProps>(function SpecFieldDropdown({
  isOpen,
  onClose,
  triggerRef,
  fields,
  loading = false,
  onSelect,
  isFilterParam = false,
  onSelectFilterExpression,
  availableVariables = []
}, ref) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterVarButtonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState('');
  const [showFilterVarDropdown, setShowFilterVarDropdown] = useState(false);

  const [filterStep, setFilterStep] = useState<'pick' | 'build'>('pick');
  const [selectedField, setSelectedField] = useState<SpecField | null>(null);
  const [filterOperator, setFilterOperator] = useState('eq');
  const [filterValue, setFilterValue] = useState('');

  const filterStepRef = useRef(filterStep);
  filterStepRef.current = filterStep;
  const showFilterVarDropdownRef = useRef(showFilterVarDropdown);
  showFilterVarDropdownRef.current = showFilterVarDropdown;

  useImperativeHandle(ref, () => ({
    isInFilterBuildMode: () => filterStep === 'build',
    insertFilterVariable: (varName: string) => {
      const insertion = `{{${varName}}}`;
      setFilterValue(prev => prev ? `${prev}${insertion}` : insertion);
    }
  }), [filterStep]);

  const dropdownMaxHeight = 420;

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const triggerRect = triggerRef.current!.getBoundingClientRect();
        const dropdownWidth = 380;

        let left = triggerRect.right - dropdownWidth;
        let top = triggerRect.bottom + 4;

        if (left < 8) {
          left = 8;
        }

        const viewportHeight = window.innerHeight;
        if (top + dropdownMaxHeight > viewportHeight - 8) {
          top = triggerRect.top - dropdownMaxHeight - 4;
          if (top < 8) {
            top = 8;
          }
        }

        setPosition({ top, left });
      };

      updatePosition();
      setTimeout(() => searchRef.current?.focus(), 50);

      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setFilterStep('pick');
      setSelectedField(null);
      setFilterOperator('eq');
      setFilterValue('');
      setShowFilterVarDropdown(false);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showFilterVarDropdownRef.current) return;
      if (filterStepRef.current === 'build' && target.closest?.('[data-dropdown-portal]')) return;
      if (filterStepRef.current === 'build' && !document.contains(target)) return;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const cleanPath = (fieldPath: string): string => {
    return fieldPath.replace(/^\[response\]\s*/, '').replace(/^.*\[\]\.\s*/, '');
  };

  const filtered = fields.filter(f => {
    if (!search) return true;
    const term = search.toLowerCase();
    const path = cleanPath(f.field_path).toLowerCase();
    return path.includes(term) || f.field_name.toLowerCase().includes(term);
  });

  const typeColor = (type: string) => {
    switch (type) {
      case 'string': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'integer': case 'number': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'boolean': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 'array': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'object': return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  };

  const handleFieldClick = (field: SpecField) => {
    const path = cleanPath(field.field_path);
    if (isFilterParam && onSelectFilterExpression) {
      setSelectedField({ ...field, field_path: path });
      setFilterStep('build');
      setFilterOperator('eq');
      setFilterValue('');
    } else {
      onSelect(path);
      onClose();
    }
  };

  const handleAddFilter = () => {
    if (!selectedField || !onSelectFilterExpression) return;
    const path = selectedField.field_path;
    const expression = buildODataExpression(path, filterOperator, filterValue);
    onSelectFilterExpression(expression);
    onClose();
  };

  const handleBackToFields = () => {
    setFilterStep('pick');
    setSelectedField(null);
    setFilterOperator('eq');
    setFilterValue('');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const needsValue = !NO_VALUE_OPERATORS.includes(filterOperator);

  const renderFieldPicker = () => (
    <>
      <div className="px-3 py-2 bg-teal-50 dark:bg-teal-900/20 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
          {isFilterParam ? 'Build Filter Expression' : 'API Spec Response Fields'}
        </span>
      </div>

      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            placeholder="Search fields..."
          />
        </div>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: `${dropdownMaxHeight - 90}px` }}>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading fields...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            {search ? 'No matching fields' : 'No response fields available'}
          </div>
        ) : (
          filtered.map((field, idx) => {
            const path = cleanPath(field.field_path);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleFieldClick(field)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <span className="font-mono text-gray-900 dark:text-gray-100 truncate mr-2">
                  {path}
                </span>
                <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded ${typeColor(field.field_type)}`}>
                  {field.field_type}
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const renderFilterBuilder = () => (
    <>
      <div className="px-3 py-2 bg-teal-50 dark:bg-teal-900/20 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
          Build Filter Expression
        </span>
      </div>

      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleBackToFields}
          className="inline-flex items-center text-sm text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-200"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back
        </button>
        {selectedField && (
          <span className="ml-2 font-mono text-sm text-gray-900 dark:text-gray-100">
            {selectedField.field_path}
          </span>
        )}
        {selectedField && (
          <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${typeColor(selectedField.field_type)}`}>
            {selectedField.field_type}
          </span>
        )}
      </div>

      <div className="p-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Operator
          </label>
          <select
            value={filterOperator}
            onChange={(e) => setFilterOperator(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {FILTER_OPERATORS.map(op => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
        </div>

        {needsValue && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Value
            </label>
            <div className="flex items-center space-x-1.5">
              <input
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="Enter value..."
              />
              <button
                ref={filterVarButtonRef}
                type="button"
                onClick={() => setShowFilterVarDropdown(!showFilterVarDropdown)}
                className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
                title="Insert variable from previous step"
              >
                <Braces className="w-3.5 h-3.5" />
              </button>
              <VariableDropdown
                isOpen={showFilterVarDropdown}
                onClose={() => setShowFilterVarDropdown(false)}
                triggerRef={filterVarButtonRef}
                variables={availableVariables}
                onSelect={(varName) => {
                  const insertion = `{{${varName}}}`;
                  setFilterValue((prev) => prev ? `${prev}${insertion}` : insertion);
                  setShowFilterVarDropdown(false);
                }}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Use {'$'}{'{variableName}'} for dynamic values
            </p>
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAddFilter}
            disabled={needsValue && !filterValue.trim()}
            className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Filter
          </button>
        </div>
      </div>
    </>
  );

  const dropdown = (
    <div
      ref={dropdownRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: isFilterParam && filterStep === 'build' ? '380px' : '340px',
        maxHeight: `${dropdownMaxHeight}px`,
        zIndex: 9999
      }}
    >
      {filterStep === 'pick' ? renderFieldPicker() : renderFilterBuilder()}
    </div>
  );

  return createPortal(dropdown, document.body);
});

export default SpecFieldDropdown;
