import React, { useState, useEffect, useRef } from 'react';
import { X, Monitor, Smartphone, AlertCircle, Info, Eye } from 'lucide-react';
import type { OrderEntryField, OrderEntryFieldGroup, OrderEntryFieldLayout } from '../../types';
import { TextField, NumberField, DateField, DateTimeField, PhoneField, DropdownField, FileField, BooleanField } from '../form-fields';
import ArrayFieldSection from '../form-fields/ArrayFieldSection';
import GroupedArrayTable from '../form-fields/GroupedArrayTable';

interface FormPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: OrderEntryField[];
  fieldGroups: OrderEntryFieldGroup[];
  layouts: OrderEntryFieldLayout[];
}

export default function FormPreviewModal({
  isOpen,
  onClose,
  fields,
  fieldGroups,
  layouts
}: FormPreviewModalProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    if (isOpen) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.body.style.overflow = 'hidden';

      const initialData: Record<string, any> = {};

      fieldGroups.forEach(group => {
        if (group.isArrayGroup) {
          const groupFields = fields.filter(f => f.fieldGroupId === group.id);
          const minRows = group.arrayMinRows || 1;
          const rowData = Array.from({ length: minRows }, () => {
            const row: Record<string, any> = {};
            groupFields.forEach(field => {
              if (field.defaultValue) {
                row[field.fieldName] = field.defaultValue;
              } else if (field.fieldType === 'boolean') {
                row[field.fieldName] = false;
              } else if (field.fieldType === 'file') {
                row[field.fieldName] = [];
              } else {
                row[field.fieldName] = '';
              }
            });
            return row;
          });
          initialData[group.id] = rowData;
        }
      });

      fields.forEach(field => {
        const group = fieldGroups.find(g => g.id === field.fieldGroupId);
        if (group?.isArrayGroup) {
          return;
        }

        if (field.defaultValue) {
          initialData[field.fieldName] = field.defaultValue;
        } else if (field.isArrayField) {
          initialData[field.fieldName] = Array.from({ length: field.arrayMinRows || 1 }, () => ({}));
        } else if (field.fieldType === 'boolean') {
          initialData[field.fieldName] = false;
        } else if (field.fieldType === 'file') {
          initialData[field.fieldName] = [];
        } else {
          initialData[field.fieldName] = '';
        }
      });
      setFormData(initialData);
    } else {
      setFormData({});
      setScrollPosition(0);
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, fields, fieldGroups]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleViewModeChange = (mode: 'desktop' | 'mobile') => {
    if (scrollContainerRef.current) {
      setScrollPosition(scrollContainerRef.current.scrollTop);
    }
    setViewMode(mode);
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollPosition;
      }
    }, 50);
  };

  const handleClose = () => {
    setFormData({});
    setScrollPosition(0);
    setViewMode('desktop');
    onClose();
  };

  if (!isOpen) return null;

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const renderField = (field: OrderEntryField) => {
    const value = formData[field.fieldName] || (field.fieldType === 'boolean' ? false : field.fieldType === 'file' ? [] : field.isArrayField ? [] : '');

    const commonProps = {
      field,
      error: undefined,
      onBlur: () => {}
    };

    if (field.isArrayField) {
      const arrayFields = fields.filter(f => f.fieldGroupId === field.fieldGroupId && !f.isArrayField);
      return (
        <ArrayFieldSection
          {...commonProps}
          arrayFields={arrayFields}
          values={value || []}
          errors={[]}
          onChange={(v) => handleFieldChange(field.fieldName, v)}
        />
      );
    }

    switch (field.fieldType) {
      case 'text':
        return <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'number':
        return <NumberField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'date':
        return <DateField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'datetime':
        return <DateTimeField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'phone':
        return <PhoneField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'dropdown':
        return <DropdownField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'file':
        return <FileField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      case 'boolean':
        return <BooleanField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
      default:
        return <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
    }
  };

  const getFieldLayout = (fieldId: string) => {
    return layouts.find(l => l.fieldId === fieldId);
  };

  const groupFieldsByRow = (groupFields: OrderEntryField[]) => {
    const fieldsByRow = new Map<number, Array<{ field: OrderEntryField; layout: any }>>();

    groupFields.forEach(field => {
      const layout = getFieldLayout(field.id);
      const row = layout?.rowIndex ?? 999;

      if (!fieldsByRow.has(row)) {
        fieldsByRow.set(row, []);
      }

      fieldsByRow.get(row)!.push({ field, layout });
    });

    Array.from(fieldsByRow.keys()).forEach(row => {
      fieldsByRow.get(row)!.sort((a, b) => {
        const colA = a.layout?.columnIndex ?? 0;
        const colB = b.layout?.columnIndex ?? 0;
        return colA - colB;
      });
    });

    return fieldsByRow;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-12 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-preview-title"
      aria-describedby="form-preview-description"
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col my-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 id="form-preview-title" className="text-2xl font-bold text-white">
                Form Preview
              </h2>
              <span className="text-sm text-purple-100 px-3 py-1 bg-white/20 rounded-full" role="status">
                Configuration Mode
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => handleViewModeChange('desktop')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center space-x-1 ${
                    viewMode === 'desktop'
                      ? 'bg-white text-purple-700 shadow-sm scale-105'
                      : 'text-white hover:bg-white/20'
                  }`}
                  title="View in desktop mode (full width)"
                  aria-label="Switch to desktop view"
                  aria-pressed={viewMode === 'desktop'}
                >
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  <span>Desktop</span>
                </button>
                <button
                  onClick={() => handleViewModeChange('mobile')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center space-x-1 ${
                    viewMode === 'mobile'
                      ? 'bg-white text-purple-700 shadow-sm scale-105'
                      : 'text-white hover:bg-white/20'
                  }`}
                  title="View in mobile mode (375px width)"
                  aria-label="Switch to mobile view"
                  aria-pressed={viewMode === 'mobile'}
                >
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  <span>Mobile</span>
                </button>
              </div>
              <button
                onClick={handleClose}
                className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                title="Close preview (Esc)"
                aria-label="Close preview modal"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div
          id="form-preview-description"
          className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-b-2 border-yellow-200 dark:border-yellow-800 px-6 py-4"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-yellow-900 dark:text-yellow-200 font-bold">
                Preview Mode - Changes Are Not Saved
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                You can interact with fields to test UX, but form submission is disabled and no data will be persisted
              </p>
            </div>
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className={`mx-auto py-8 px-4 transition-all duration-300 ${
            viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-6xl'
          }`}>
            {viewMode === 'mobile' && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-blue-800 dark:text-blue-300 font-medium">
                    Mobile View (375px) - Viewing how this form appears on mobile devices
                  </span>
                </div>
              </div>
            )}
            {fieldGroups.length === 0 || fields.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  No Fields Configured
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Add field groups and fields to see the form preview
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {fieldGroups.map(group => {
                  if ((group as any).isHidden) return null;
                  const groupFields = fields.filter(f => f.fieldGroupId === group.id);
                  if (groupFields.length === 0) return null;

                  if (group.isArrayGroup) {
                    return (
                      <div
                        key={group.id}
                        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 transition-all"
                        style={{
                          borderColor: group.borderColor || '#d1d5db',
                          backgroundColor: group.backgroundColor ? `${group.backgroundColor}08` : undefined
                        }}
                      >
                        <GroupedArrayTable
                          group={group}
                          fields={groupFields}
                          values={formData[group.id] || []}
                          errors={[]}
                          onChange={(values) => handleFieldChange(group.id, values)}
                        />
                      </div>
                    );
                  }

                  const fieldsByRow = groupFieldsByRow(groupFields);
                  const sortedRows = Array.from(fieldsByRow.keys()).sort((a, b) => a - b);

                  return (
                    <div
                      key={group.id}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 transition-all"
                      style={{
                        borderColor: group.borderColor || '#d1d5db',
                        backgroundColor: group.backgroundColor ? `${group.backgroundColor}08` : undefined
                      }}
                    >
                      <div className="mb-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                          {group.groupName}
                        </h2>
                        {group.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {group.description}
                          </p>
                        )}
                      </div>

                      <div className="space-y-6">
                        {sortedRows.map(rowIndex => {
                          const rowFields = fieldsByRow.get(rowIndex)!;

                          return (
                            <div key={rowIndex} className="grid grid-cols-12 gap-4">
                              {rowFields.map(({ field, layout }) => {
                                const widthCols = viewMode === 'desktop'
                                  ? (layout?.widthColumns || 12)
                                  : (layout?.mobileWidthColumns || 12);
                                const colSpanClass = `col-span-${widthCols}`;

                                return (
                                  <div key={field.id} className={`${colSpanClass} relative`}>
                                    <div className="opacity-90 pointer-events-auto">
                                      {renderField(field)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{fields.length}</span> field{fields.length !== 1 ? 's' : ''} across <span className="font-semibold text-gray-900 dark:text-gray-100">{fieldGroups.length}</span> group{fieldGroups.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
              <div className="flex items-center space-x-2">
                {viewMode === 'desktop' ? (
                  <Monitor className="h-4 w-4 text-gray-500" />
                ) : (
                  <Smartphone className="h-4 w-4 text-gray-500" />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {viewMode} View
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center space-x-2"
              >
                <span>Close Preview</span>
                <span className="text-xs opacity-75">(Esc)</span>
              </button>
            </div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <span className="font-semibold">Preview Tip:</span> This shows your current unsaved configuration. Toggle between Desktop and Mobile views to test responsive behavior. Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded text-xs">Esc</kbd> to close.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
