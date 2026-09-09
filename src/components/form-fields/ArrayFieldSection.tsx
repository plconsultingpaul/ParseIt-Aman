import React from 'react';
import { Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { OrderEntryField } from '../../types';
import TextField from './TextField';
import NumberField from './NumberField';
import DateField from './DateField';
import DateTimeField from './DateTimeField';
import PhoneField from './PhoneField';
import DropdownField from './DropdownField';
import BooleanField from './BooleanField';
import ApiLookupField from './ApiLookupField';
import FieldTypeIcon from '../common/FieldTypeIcon';

interface ArrayFieldSectionProps {
  field: OrderEntryField;
  arrayFields: OrderEntryField[];
  values: Record<string, any>[];
  errors?: Record<string, string>[];
  onChange: (values: Record<string, any>[]) => void;
  onBlur?: (rowIndex: number, fieldName: string) => void;
  onOpenLookup?: (field: OrderEntryField, rowIndex: number) => void;
}

export default function ArrayFieldSection({
  field,
  arrayFields,
  values,
  errors = [],
  onChange,
  onBlur,
  onOpenLookup
}: ArrayFieldSectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const minRows = field.arrayMinRows || 1;
  const maxRows = field.arrayMaxRows || 10;
  const currentRows = values.length;

  const canAddRow = currentRows < maxRows;
  const canRemoveRow = currentRows > minRows;

  const handleAddRow = () => {
    if (!canAddRow) return;

    const newRow: Record<string, any> = {};
    arrayFields.forEach(f => {
      if (f.defaultValue) {
        newRow[f.fieldName] = f.defaultValue;
      } else if (f.fieldType === 'boolean') {
        newRow[f.fieldName] = false;
      } else {
        newRow[f.fieldName] = '';
      }
    });

    onChange([...values, newRow]);
  };

  const handleRemoveRow = (index: number) => {
    if (!canRemoveRow) return;

    const confirmed = window.confirm('Are you sure you want to remove this row?');
    if (confirmed) {
      const newValues = values.filter((_, i) => i !== index);
      onChange(newValues);
    }
  };

  const handleFieldChange = (rowIndex: number, fieldName: string, value: any) => {
    const newValues = [...values];
    newValues[rowIndex] = {
      ...newValues[rowIndex],
      [fieldName]: value
    };
    onChange(newValues);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parseInt(active.id as string);
    const newIndex = parseInt(over.id as string);

    const newValues = [...values];
    const [movedItem] = newValues.splice(oldIndex, 1);
    newValues.splice(newIndex, 0, movedItem);

    onChange(newValues);
  };

  const renderField = (rowField: OrderEntryField, rowIndex: number, rowData: Record<string, any>, rowErrors?: Record<string, string>) => {
    const value = rowData[rowField.fieldName];
    const error = rowErrors?.[rowField.fieldName];

    const commonProps = {
      field: rowField,
      error,
      onBlur: () => onBlur?.(rowIndex, rowField.fieldName)
    };

    switch (rowField.fieldType) {
      case 'text':
        return <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'number':
        return <NumberField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'date':
        return <DateField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'datetime':
        return <DateTimeField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'phone':
        return <PhoneField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'dropdown':
        return <DropdownField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'boolean':
        return <BooleanField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
      case 'api_lookup':
        return <ApiLookupField {...commonProps} compact onOpenLookup={() => onOpenLookup?.(rowField, rowIndex)} />;
      default:
        return <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(rowIndex, rowField.fieldName, v)} />;
    }
  };

  const totalErrors = errors.reduce((count, rowErrors) => count + Object.keys(rowErrors || {}).length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <FieldTypeIcon fieldType="array" size="md" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {field.fieldLabel}
              {field.isRequired && <span className="text-red-600 dark:text-red-400 ml-1">*</span>}
            </h3>
          </div>
          {field.helpText && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{field.helpText}</p>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {currentRows} / {maxRows} rows
          </span>
          <button
            type="button"
            onClick={handleAddRow}
            disabled={!canAddRow}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Row</span>
          </button>
        </div>
      </div>

      {totalErrors > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">
            {totalErrors} validation error{totalErrors !== 1 ? 's' : ''} in this section
          </p>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={values.map((_, i) => i.toString())} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {values.map((rowData, rowIndex) => (
              <ArrayRow
                key={rowIndex}
                id={rowIndex.toString()}
                rowIndex={rowIndex}
                rowData={rowData}
                arrayFields={arrayFields}
                rowErrors={errors[rowIndex]}
                canRemove={canRemoveRow}
                onRemove={() => handleRemoveRow(rowIndex)}
                renderField={(rowField) => renderField(rowField, rowIndex, rowData, errors[rowIndex])}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {currentRows < minRows && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Minimum {minRows} row{minRows !== 1 ? 's' : ''} required
        </p>
      )}
    </div>
  );
}

interface ArrayRowProps {
  id: string;
  rowIndex: number;
  rowData: Record<string, any>;
  arrayFields: OrderEntryField[];
  rowErrors?: Record<string, string>;
  canRemove: boolean;
  onRemove: () => void;
  renderField: (field: OrderEntryField) => React.ReactNode;
}

function ArrayRow({ id, rowIndex, arrayFields, rowErrors, canRemove, onRemove, renderField }: ArrayRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasErrors = rowErrors && Object.keys(rowErrors).length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-white dark:bg-gray-800 border-2 rounded-lg p-4 ${
        hasErrors
          ? 'border-red-300 dark:border-red-700'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="absolute left-2 top-4 cursor-move" {...attributes} {...listeners}>
        <GripVertical className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
      </div>

      <div className="absolute right-2 top-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Remove row"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="ml-8 mr-8">
        <div className="flex items-center mb-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Row {rowIndex + 1}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {arrayFields.map(arrayField => (
            <div key={arrayField.id}>
              {renderField(arrayField)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
