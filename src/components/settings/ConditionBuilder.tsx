import React, { useMemo } from 'react';
import { Trash2, Plus, GripVertical, X, Save } from 'lucide-react';
import { FunctionCondition, FunctionOperator, FunctionConditionClause } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ConditionBuilderProps {
  conditions: FunctionCondition[];
  availableFields: string[];
  onChange: (conditions: FunctionCondition[]) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

const OPERATORS: { value: FunctionOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'in', label: 'In (List)' },
  { value: 'not_in', label: 'Not In (List)' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

interface SortableConditionCardProps {
  id: string;
  index: number;
  condition: FunctionCondition;
  children: React.ReactNode;
}

const SortableConditionCard: React.FC<SortableConditionCardProps> = ({
  id,
  index,
  children,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className="absolute left-2 top-3 text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
        #{index + 1}
      </div>
      <div className="p-4 pl-12 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-3">
          <div
            className="flex items-center pt-2 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  conditions,
  availableFields,
  onChange,
  onSave,
  isSaving,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const conditionIds = conditions.map((_, index) => `condition-${index}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = conditionIds.indexOf(active.id as string);
      const newIndex = conditionIds.indexOf(over.id as string);
      onChange(arrayMove(conditions, oldIndex, newIndex));
    }
  };

  const addCondition = () => {
    const newCondition: FunctionCondition = {
      if: {
        field: availableFields[0] || '',
        operator: 'equals',
        value: '',
      },
      then: '',
    };
    onChange([newCondition, ...conditions]);
  };

  const removeCondition = (index: number) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    onChange(newConditions);
  };

  const updateCondition = (index: number, updates: Partial<FunctionCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    onChange(newConditions);
  };

  const addAdditionalCondition = (index: number) => {
    const newConditions = [...conditions];
    const additionalConditions = newConditions[index].additionalConditions || [];
    newConditions[index] = {
      ...newConditions[index],
      additionalConditions: [
        ...additionalConditions,
        { field: availableFields[0] || '', operator: 'equals', value: '' }
      ]
    };
    onChange(newConditions);
  };

  const removeAdditionalCondition = (conditionIndex: number, additionalIndex: number) => {
    const newConditions = [...conditions];
    const additionalConditions = [...(newConditions[conditionIndex].additionalConditions || [])];
    additionalConditions.splice(additionalIndex, 1);
    newConditions[conditionIndex] = {
      ...newConditions[conditionIndex],
      additionalConditions: additionalConditions.length > 0 ? additionalConditions : undefined
    };
    onChange(newConditions);
  };

  const updateAdditionalCondition = (
    conditionIndex: number,
    additionalIndex: number,
    updates: Partial<FunctionConditionClause>
  ) => {
    const newConditions = [...conditions];
    const additionalConditions = [...(newConditions[conditionIndex].additionalConditions || [])];
    additionalConditions[additionalIndex] = { ...additionalConditions[additionalIndex], ...updates };
    newConditions[conditionIndex] = {
      ...newConditions[conditionIndex],
      additionalConditions
    };
    onChange(newConditions);
  };

  const renderConditionClause = (
    clause: FunctionConditionClause,
    onUpdate: (updates: Partial<FunctionConditionClause>) => void,
    onRemove?: () => void,
    isAdditional: boolean = false
  ) => (
    <div className={`grid grid-cols-1 md:grid-cols-${needsValueInput(clause.operator) ? '4' : '3'} gap-3 items-end ${isAdditional ? 'pl-4 border-l-2 border-blue-300 dark:border-blue-600' : ''}`}>
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {isAdditional ? 'AND Field' : 'If Field'}
        </label>
        <CustomDropdown
          value={clause.field}
          onChange={(value) => onUpdate({ field: value })}
          options={availableFields.map((field) => ({ value: field, label: field }))}
          placeholder="Select field"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Operator
        </label>
        <CustomDropdown
          value={clause.operator}
          onChange={(value) => onUpdate({ operator: value as FunctionOperator })}
          options={OPERATORS.map((op) => ({ value: op.value, label: op.label }))}
        />
      </div>

      {needsValueInput(clause.operator) && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {isListOperator(clause.operator) ? 'Values (comma-separated)' : 'Value'}
          </label>
          <input
            type="text"
            value={
              isListOperator(clause.operator) && Array.isArray(clause.value)
                ? clause.value.join(', ')
                : clause.value
            }
            onChange={(e) => {
              const value = isListOperator(clause.operator)
                ? e.target.value.split(',').map(v => v.trim())
                : e.target.value;
              onUpdate({ value });
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder={isListOperator(clause.operator) ? 'value1, value2, value3' : 'Enter value'}
          />
        </div>
      )}

      {isAdditional && onRemove && (
        <div className="flex items-end">
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Remove AND condition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  const needsValueInput = (operator: FunctionOperator) => {
    return !['is_empty', 'is_not_empty'].includes(operator);
  };

  const isListOperator = (operator: FunctionOperator) => {
    return ['in', 'not_in'].includes(operator);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditions</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Condition
          </button>
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {conditions.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          No conditions defined. Add a condition to get started.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={conditionIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {conditions.map((condition, index) => (
                <SortableConditionCard
                  key={conditionIds[index]}
                  id={conditionIds[index]}
                  index={index}
                  condition={condition}
                >
                  <div className="flex-1 space-y-4">
                    {renderConditionClause(
                      condition.if,
                      (updates) => updateCondition(index, { if: { ...condition.if, ...updates } })
                    )}

                    {condition.additionalConditions?.map((addCond, addIndex) => (
                      <div key={addIndex} className="mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">AND</span>
                          <div className="flex-1 h-px bg-blue-200 dark:bg-blue-700" />
                        </div>
                        {renderConditionClause(
                          addCond,
                          (updates) => updateAdditionalCondition(index, addIndex, updates),
                          () => removeAdditionalCondition(index, addIndex),
                          true
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addAdditionalCondition(index)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors mt-2"
                    >
                      <Plus className="w-3 h-3" />
                      Add AND Condition
                    </button>

                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Then Return
                        </label>
                        <input
                          type="text"
                          value={condition.then}
                          onChange={(e) => updateCondition(index, { then: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          placeholder="Return value"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-6"
                    title="Remove condition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </SortableConditionCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};
