import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2 } from 'lucide-react';
import type { OrderEntryField, OrderEntryFieldGroup, OrderEntryFieldLayout } from '../../types';
import TextField from '../form-fields/TextField';
import NumberField from '../form-fields/NumberField';
import DateField from '../form-fields/DateField';
import DateTimeField from '../form-fields/DateTimeField';
import PhoneField from '../form-fields/PhoneField';
import ZipField from '../form-fields/ZipField';
import PostalCodeField from '../form-fields/PostalCodeField';
import ProvinceField from '../form-fields/ProvinceField';
import StateField from '../form-fields/StateField';
import DropdownField from '../form-fields/DropdownField';
import BooleanField from '../form-fields/BooleanField';
import FileField from '../form-fields/FileField';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface ChildGroupModalProps {
  group: OrderEntryFieldGroup;
  fields: OrderEntryField[];
  layouts?: OrderEntryFieldLayout[];
  values: Record<string, any>[];
  parentRowIndex: number;
  onSave: (values: Record<string, any>[]) => void;
  onClose: () => void;
}

export default function ChildGroupModal({
  group,
  fields,
  layouts = [],
  values,
  parentRowIndex,
  onSave,
  onClose
}: ChildGroupModalProps) {
  const [rows, setRows] = useState<Record<string, any>[]>(values.length > 0 ? values : []);

  const minRows = group.arrayMinRows || 0;
  const maxRows = group.arrayMaxRows || 10;
  const canAddRow = rows.length < maxRows;
  const canRemoveRow = rows.length > minRows;

  const sortedFields = [...fields].sort((a, b) => {
    const layoutA = layouts.find(l => l.fieldId === a.id);
    const layoutB = layouts.find(l => l.fieldId === b.id);
    const colA = layoutA?.columnIndex ?? a.fieldOrder;
    const colB = layoutB?.columnIndex ?? b.fieldOrder;
    return colA - colB;
  });

  const handleAddRow = () => {
    if (!canAddRow) return;
    const newRow: Record<string, any> = {};
    sortedFields.forEach(field => {
      if (field.defaultValue) {
        newRow[field.fieldName] = field.fieldType === 'boolean'
          ? field.defaultValue.toLowerCase() === 'true'
          : field.defaultValue;
      } else if (field.fieldType === 'boolean') {
        newRow[field.fieldName] = false;
      } else if (field.fieldType === 'file') {
        newRow[field.fieldName] = [];
      } else {
        newRow[field.fieldName] = '';
      }
    });
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (index: number) => {
    if (!canRemoveRow) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleFieldChange = (rowIndex: number, fieldName: string, value: any) => {
    const newRows = [...rows];
    newRows[rowIndex] = { ...newRows[rowIndex], [fieldName]: value };
    setRows(newRows);
  };

  const handleSave = () => {
    onSave(rows);
    onClose();
  };

  const renderFieldCell = (field: OrderEntryField, rowIndex: number, rowData: Record<string, any>) => {
    const value = rowData[field.fieldName];
    const commonProps = {
      field: { ...field, fieldLabel: '' },
      error: undefined,
      onBlur: () => {},
      showIcon: false
    };

    switch (field.fieldType) {
      case 'text':
        return <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'number':
      case 'decimal':
        return <NumberField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'date':
        return <DateField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'datetime':
        return <DateTimeField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'phone':
        return <PhoneField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'zip':
        return <ZipField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'postal_code':
        return <PostalCodeField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'province':
        return <ProvinceField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'state':
        return <StateField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'dropdown':
        return <DropdownField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'boolean':
        return <BooleanField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      case 'file':
        return <FileField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
      default:
        return <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, field.fieldName, v)} />;
    }
  };

  const getMaxWidthClass = () => {
    const fieldCount = sortedFields.length;
    if (fieldCount <= 1) return 'max-w-md';
    if (fieldCount <= 2) return 'max-w-xl';
    if (fieldCount <= 3) return 'max-w-2xl';
    if (fieldCount <= 4) return 'max-w-3xl';
    if (fieldCount <= 5) return 'max-w-4xl';
    if (fieldCount <= 6) return 'max-w-5xl';
    return 'max-w-[90vw]';
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl ${getMaxWidthClass()} w-full max-h-[85vh] flex flex-col`}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {group.childButtonLabel || group.groupName}
            </h3>
            {group.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 italic">
                {group.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No entries yet. Click "Add Row" to begin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {sortedFields.map(field => (
                      <th
                        key={field.id}
                        className="px-3 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      >
                        <div className="flex items-center space-x-1.5">
                          <FieldTypeIcon fieldType={field.fieldType} size="sm" />
                          <span>
                            {field.fieldLabel}
                            {field.isRequired && <span className="text-red-600 ml-0.5">*</span>}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="w-12 px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((rowData, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      {sortedFields.map(field => (
                        <td key={field.id} className="px-3 py-2 align-top">
                          {renderFieldCell(field, rowIndex, rowData)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(rowIndex)}
                          disabled={!canRemoveRow}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleAddRow}
              disabled={!canAddRow}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Add Row</span>
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {rows.length} / {maxRows} rows
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
