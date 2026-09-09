import React, { useState, useEffect, useRef } from 'react';
import { DndContext, DragEndEvent, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, Edit3, Plus, Trash2, Monitor, Smartphone, Settings, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ChevronDown, ChevronRight, ChevronsDown, ChevronsRight, Layers } from 'lucide-react';
import type { OrderEntryField, OrderEntryFieldGroup, OrderEntryFieldLayout } from '../../types';
import FieldTypeIcon, { FieldTypeBadge } from '../common/FieldTypeIcon';
import Tooltip, { HelpTooltip } from '../common/Tooltip';
import { useDarkMode } from '../../hooks/useDarkMode';
import { getContrastTextColor, adaptBackgroundForDarkMode } from '../../lib/utils';

interface LayoutDesignerProps {
  fields: OrderEntryField[];
  fieldGroups: OrderEntryFieldGroup[];
  layouts: OrderEntryFieldLayout[];
  onLayoutChange: (layouts: OrderEntryFieldLayout[]) => void;
  onGroupOrderChange?: (groups: OrderEntryFieldGroup[]) => void;
}

interface LayoutField {
  fieldId: string;
  field: OrderEntryField;
  layout: OrderEntryFieldLayout | null;
}

interface GroupLayoutState {
  groupId: string;
  isCollapsed: boolean;
}

export default function LayoutDesigner({ fields, fieldGroups, layouts, onLayoutChange, onGroupOrderChange }: LayoutDesignerProps) {
  const { isDarkMode } = useDarkMode();
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewMode, setPreviewMode] = useState(false);
  const [editingLayout, setEditingLayout] = useState<OrderEntryFieldLayout | null>(null);
  const [localLayouts, setLocalLayouts] = useState<OrderEntryFieldLayout[]>(layouts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const isInternalUpdate = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const groupSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    const layoutsChanged = layouts.length !== localLayouts.length ||
      layouts.some((layout, idx) => {
        const local = localLayouts[idx];
        return !local ||
          layout.fieldId !== local.fieldId ||
          layout.rowIndex !== local.rowIndex ||
          layout.columnIndex !== local.columnIndex ||
          layout.widthColumns !== local.widthColumns ||
          layout.mobileWidthColumns !== local.mobileWidthColumns;
      });

    if (layoutsChanged) {
      const normalized = normalizeColumnIndices(layouts);
      setLocalLayouts(normalized);

      const hasChanges = normalized.some((n, idx) => {
        const orig = layouts[idx];
        return orig && (n.columnIndex !== orig.columnIndex);
      });

      if (hasChanges) {
        console.log('🔧 Normalized columnIndex values on load');
        onLayoutChange(normalized);
      }
    }
  }, [layouts]);

  // Initialize all groups as collapsed by default
  useEffect(() => {
    if (fieldGroups.length > 0 && collapsedGroups.size === 0) {
      setCollapsedGroups(new Set(fieldGroups.map(g => g.id)));
    }
  }, [fieldGroups]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const collapseAllGroups = () => {
    setCollapsedGroups(new Set(fieldGroups.map(g => g.id)));
  };

  const expandAllGroups = () => {
    setCollapsedGroups(new Set());
  };

  const getFieldsForGroup = (groupId: string): OrderEntryField[] => {
    return fields.filter(f => f.fieldGroupId === groupId).sort((a, b) => a.fieldOrder - b.fieldOrder);
  };

  const getLayoutsForGroup = (groupId: string): OrderEntryFieldLayout[] => {
    const groupFields = getFieldsForGroup(groupId);
    const groupFieldIds = new Set(groupFields.map(f => f.id));
    return localLayouts.filter(l => groupFieldIds.has(l.fieldId));
  };

  const getFieldsWithLayoutsForGroup = (groupId: string): LayoutField[] => {
    const groupFields = getFieldsForGroup(groupId);
    const groupLayouts = getLayoutsForGroup(groupId);

    return groupFields.map(field => ({
      fieldId: field.id,
      field,
      layout: groupLayouts.find(l => l.fieldId === field.id) || null
    }));
  };

  const normalizeRowIndices = (layouts: OrderEntryFieldLayout[]): OrderEntryFieldLayout[] => {
    const uniqueRows = [...new Set(layouts.map(l => l.rowIndex))].sort((a, b) => a - b);
    const rowMapping = new Map<number, number>();
    uniqueRows.forEach((oldRow, newIndex) => {
      rowMapping.set(oldRow, newIndex);
    });

    return layouts.map(l => ({
      ...l,
      rowIndex: rowMapping.get(l.rowIndex) ?? l.rowIndex
    }));
  };

  const normalizeColumnIndices = (layouts: OrderEntryFieldLayout[]): OrderEntryFieldLayout[] => {
    const byRow = new Map<number, OrderEntryFieldLayout[]>();
    layouts.forEach(l => {
      if (!byRow.has(l.rowIndex)) {
        byRow.set(l.rowIndex, []);
      }
      byRow.get(l.rowIndex)!.push(l);
    });

    const normalized: OrderEntryFieldLayout[] = [];
    byRow.forEach((rowLayouts) => {
      const sorted = [...rowLayouts].sort((a, b) => a.columnIndex - b.columnIndex);
      sorted.forEach((layout, index) => {
        normalized.push({ ...layout, columnIndex: index });
      });
    });

    return normalized;
  };

  const normalizeGroupLayouts = (groupId: string, groupLayouts: OrderEntryFieldLayout[]): OrderEntryFieldLayout[] => {
    let normalized = normalizeRowIndices(groupLayouts);
    normalized = normalizeColumnIndices(normalized);
    return normalized;
  };

  const getFieldsByRowForGroup = (groupId: string): Map<number, LayoutField[]> => {
    const fieldsByRow = new Map<number, LayoutField[]>();
    const fieldsWithLayouts = getFieldsWithLayoutsForGroup(groupId);

    fieldsWithLayouts.forEach(item => {
      if (item.layout === null) {
        return;
      }
      const row = item.layout.rowIndex;
      if (!fieldsByRow.has(row)) {
        fieldsByRow.set(row, []);
      }
      fieldsByRow.get(row)!.push(item);
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

  const handleAddField = (fieldId: string, groupId: string) => {
    const groupLayouts = getLayoutsForGroup(groupId);
    const maxRow = groupLayouts.length > 0
      ? Math.max(...groupLayouts.map(l => l.rowIndex))
      : -1;

    // Check if this is an array group
    const group = fieldGroups.find(g => g.id === groupId);
    const isArrayGroup = group?.isArrayGroup || false;

    let newLayout: OrderEntryFieldLayout;

    if (isArrayGroup) {
      // For array groups, try to add fields to the same row
      const arrayGroupFieldIds = fields
        .filter(f => f.fieldGroupId === groupId)
        .map(f => f.id);

      const existingArrayFieldLayouts = groupLayouts.filter(l =>
        arrayGroupFieldIds.includes(l.fieldId)
      );

      if (existingArrayFieldLayouts.length > 0) {
        // Add to the same row as existing array fields
        const targetRow = existingArrayFieldLayouts[0].rowIndex;
        const fieldsOnRow = existingArrayFieldLayouts.filter(l => l.rowIndex === targetRow);
        const totalFieldsOnRow = fieldsOnRow.length + 1; // Including the new field

        // Calculate even distribution of width
        const evenWidth = Math.max(2, Math.floor(12 / totalFieldsOnRow));
        const evenMobileWidth = Math.max(4, Math.floor(12 / Math.min(totalFieldsOnRow, 3)));

        // Find the next column index
        const maxCol = fieldsOnRow.length > 0
          ? Math.max(...fieldsOnRow.map(l => l.columnIndex))
          : -1;

        newLayout = {
          id: `temp-${Date.now()}`,
          fieldId,
          rowIndex: targetRow,
          columnIndex: maxCol + 1,
          widthColumns: evenWidth,
          mobileWidthColumns: evenMobileWidth,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Update existing fields on this row to have even widths
        const updatedExistingLayouts = localLayouts.map(l => {
          if (fieldsOnRow.some(f => f.fieldId === l.fieldId)) {
            return {
              ...l,
              widthColumns: evenWidth,
              mobileWidthColumns: evenMobileWidth
            };
          }
          return l;
        });

        const finalLayouts = [...updatedExistingLayouts, newLayout];
        setLocalLayouts(finalLayouts);
        isInternalUpdate.current = true;
        onLayoutChange(finalLayouts);
        return;
      } else {
        // First field from array group - use half width expecting more
        newLayout = {
          id: `temp-${Date.now()}`,
          fieldId,
          rowIndex: maxRow + 1,
          columnIndex: 0,
          widthColumns: 6,
          mobileWidthColumns: 12,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      // Regular field - use full width on new row
      newLayout = {
        id: `temp-${Date.now()}`,
        fieldId,
        rowIndex: maxRow + 1,
        columnIndex: 0,
        widthColumns: 12,
        mobileWidthColumns: 12,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    const updatedLayouts = [...localLayouts, newLayout];
    setLocalLayouts(updatedLayouts);
    isInternalUpdate.current = true;
    onLayoutChange(updatedLayouts);
  };

  const handleRemoveField = (fieldId: string, groupId: string) => {
    const filteredLayouts = localLayouts.filter(l => l.fieldId !== fieldId);

    const otherGroupLayouts = filteredLayouts.filter(l => {
      const field = fields.find(f => f.id === l.fieldId);
      return field && field.fieldGroupId !== groupId;
    });

    const currentGroupLayouts = filteredLayouts.filter(l => {
      const field = fields.find(f => f.id === l.fieldId);
      return field && field.fieldGroupId === groupId;
    });

    const normalizedGroupLayouts = normalizeGroupLayouts(groupId, currentGroupLayouts);
    const normalizedLayouts = [...otherGroupLayouts, ...normalizedGroupLayouts];

    setLocalLayouts(normalizedLayouts);
    isInternalUpdate.current = true;
    onLayoutChange(normalizedLayouts);
  };

  const handleEditLayout = (layout: OrderEntryFieldLayout) => {
    setEditingLayout(layout);
  };

  const handleUpdateLayout = (fieldId: string, updates: Partial<OrderEntryFieldLayout>) => {
    const updatedLayouts = localLayouts.map(l =>
      l.fieldId === fieldId ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
    );
    setLocalLayouts(updatedLayouts);
    isInternalUpdate.current = true;
    onLayoutChange(updatedLayouts);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeFieldId = active.id as string;
    const overFieldId = over.id as string;

    const activeField = fields.find(f => f.id === activeFieldId);
    const overField = fields.find(f => f.id === overFieldId);

    if (!activeField || !overField || activeField.fieldGroupId !== overField.fieldGroupId) {
      return;
    }

    const groupId = activeField.fieldGroupId;
    const activeLayout = localLayouts.find(l => l.fieldId === activeFieldId);
    const overLayout = localLayouts.find(l => l.fieldId === overFieldId);

    if (activeLayout && overLayout) {
      const otherGroupLayouts = localLayouts.filter(l => {
        const field = fields.find(f => f.id === l.fieldId);
        return field && field.fieldGroupId !== groupId;
      });

      const currentGroupLayouts = localLayouts.filter(l => {
        const field = fields.find(f => f.id === l.fieldId);
        return field && field.fieldGroupId === groupId;
      });

      // Check if moving to a different row and calculate auto-sizing
      const isMovingToDifferentRow = activeLayout.rowIndex !== overLayout.rowIndex;
      let autoSizedDimensions: { widthColumns: number; mobileWidthColumns: number } | null = null;

      if (isMovingToDifferentRow) {
        autoSizedDimensions = calculateAutoSizeForField(
          overLayout.rowIndex,
          currentGroupLayouts,
          activeLayout
        );
      }

      const updatedGroupLayouts = currentGroupLayouts.map(l => {
        if (l.fieldId === activeFieldId) {
          const baseUpdate = { ...l, rowIndex: overLayout.rowIndex, columnIndex: overLayout.columnIndex };
          // Apply auto-sizing if moving to a different row
          if (autoSizedDimensions) {
            return {
              ...baseUpdate,
              widthColumns: autoSizedDimensions.widthColumns,
              mobileWidthColumns: autoSizedDimensions.mobileWidthColumns
            };
          }
          return baseUpdate;
        }
        if (l.rowIndex === overLayout.rowIndex && l.columnIndex >= overLayout.columnIndex && l.fieldId !== activeFieldId) {
          return { ...l, columnIndex: l.columnIndex + 1 };
        }
        return l;
      });

      const normalizedGroupLayouts = normalizeGroupLayouts(groupId, updatedGroupLayouts);
      const normalizedLayouts = [...otherGroupLayouts, ...normalizedGroupLayouts];

      setLocalLayouts(normalizedLayouts);
      isInternalUpdate.current = true;
      onLayoutChange(normalizedLayouts);
    }
  };

  const moveFieldHorizontally = (fieldId: string, direction: 'left' | 'right', groupId: string) => {
    const layout = localLayouts.find(l => l.fieldId === fieldId);
    if (!layout) return;

    const groupLayouts = getLayoutsForGroup(groupId);
    const rowFields = groupLayouts
      .filter(l => l.rowIndex === layout.rowIndex)
      .sort((a, b) => a.columnIndex - b.columnIndex);

    const currentIndex = rowFields.findIndex(l => l.fieldId === fieldId);
    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= rowFields.length) {
      return;
    }

    const reorderedRowFields = [...rowFields];
    [reorderedRowFields[currentIndex], reorderedRowFields[targetIndex]] =
      [reorderedRowFields[targetIndex], reorderedRowFields[currentIndex]];

    const otherGroupLayouts = localLayouts.filter(l => {
      const field = fields.find(f => f.id === l.fieldId);
      return field && field.fieldGroupId !== groupId;
    });

    const updatedGroupLayouts = groupLayouts.map(l => {
      const positionInRow = reorderedRowFields.findIndex(rf => rf.fieldId === l.fieldId);
      if (positionInRow !== -1) {
        return { ...l, columnIndex: positionInRow };
      }
      return l;
    });

    const normalizedLayouts = [...otherGroupLayouts, ...updatedGroupLayouts];
    setLocalLayouts(normalizedLayouts);
    isInternalUpdate.current = true;
    onLayoutChange(normalizedLayouts);
  };

  const moveFieldVertically = (fieldId: string, direction: 'up' | 'down', groupId: string) => {
    const layout = localLayouts.find(l => l.fieldId === fieldId);
    if (!layout) return;

    const groupLayouts = getLayoutsForGroup(groupId);
    const currentRowFields = groupLayouts.filter(f => f.rowIndex === layout.rowIndex);
    const isMultiFieldRow = currentRowFields.length > 1;

    const allRows = [...new Set(groupLayouts.map(l => l.rowIndex))].sort((a, b) => a - b);
    const currentRowIndex = allRows.indexOf(layout.rowIndex);

    if (direction === 'up' && currentRowIndex === 0) {
      return;
    }

    const otherGroupLayouts = localLayouts.filter(l => {
      const field = fields.find(f => f.id === l.fieldId);
      return field && field.fieldGroupId !== groupId;
    });

    let movedGroupLayouts: OrderEntryFieldLayout[];

    if (isMultiFieldRow) {
      if (direction === 'up') {
        movedGroupLayouts = groupLayouts.map(l => {
          if (l.fieldId === fieldId) {
            return { ...l, rowIndex: layout.rowIndex, columnIndex: 0, widthColumns: 12, mobileWidthColumns: 12 };
          }
          if (l.rowIndex >= layout.rowIndex && l.fieldId !== fieldId) {
            return { ...l, rowIndex: l.rowIndex + 1 };
          }
          return l;
        });
      } else {
        movedGroupLayouts = groupLayouts.map(l => {
          if (l.fieldId === fieldId) {
            return { ...l, rowIndex: layout.rowIndex + 1, columnIndex: 0, widthColumns: 12, mobileWidthColumns: 12 };
          }
          if (l.rowIndex > layout.rowIndex) {
            return { ...l, rowIndex: l.rowIndex + 1 };
          }
          return l;
        });
      }
    } else {
      let targetRowIndex: number;
      if (direction === 'up') {
        targetRowIndex = allRows[currentRowIndex - 1];
      } else {
        if (currentRowIndex === allRows.length - 1) {
          return;
        }
        targetRowIndex = allRows[currentRowIndex + 1];
      }

      const targetRow = targetRowIndex;
      const targetRowFields = groupLayouts.filter(f => f.rowIndex === targetRow);
      const maxColumnIndex = targetRowFields.length > 0
        ? Math.max(...targetRowFields.map(f => f.columnIndex))
        : -1;

      // Calculate auto-sizing for the target row
      const autoSizedDimensions = calculateAutoSizeForField(
        targetRow,
        groupLayouts,
        layout
      );

      movedGroupLayouts = groupLayouts.map(l => {
        if (l.fieldId === fieldId) {
          return {
            ...l,
            rowIndex: targetRow,
            columnIndex: maxColumnIndex + 1,
            widthColumns: autoSizedDimensions.widthColumns,
            mobileWidthColumns: autoSizedDimensions.mobileWidthColumns
          };
        }
        return l;
      });
    }

    const normalizedGroupLayouts = normalizeGroupLayouts(groupId, movedGroupLayouts);
    const normalizedLayouts = [...otherGroupLayouts, ...normalizedGroupLayouts];

    setLocalLayouts(normalizedLayouts);
    isInternalUpdate.current = true;
    onLayoutChange(normalizedLayouts);
  };

  const getUnlayoutedFieldsForGroup = (groupId: string): OrderEntryField[] => {
    const layoutedFieldIds = new Set(localLayouts.map(l => l.fieldId));
    return getFieldsForGroup(groupId).filter(f => !layoutedFieldIds.has(f.id));
  };

  const calculateAvailableColumns = (
    rowIndex: number,
    groupLayouts: OrderEntryFieldLayout[],
    viewMode: 'desktop' | 'mobile',
    excludeFieldId?: string
  ): number => {
    const fieldsInRow = groupLayouts.filter(
      l => l.rowIndex === rowIndex && l.fieldId !== excludeFieldId
    );
    const totalUsed = fieldsInRow.reduce((sum, layout) => {
      const cols = viewMode === 'desktop' ? layout.widthColumns : layout.mobileWidthColumns;
      return sum + cols;
    }, 0);
    return Math.max(0, 12 - totalUsed);
  };

  const calculateAutoSizeForField = (
    targetRow: number,
    groupLayouts: OrderEntryFieldLayout[],
    originalLayout: OrderEntryFieldLayout
  ): { widthColumns: number; mobileWidthColumns: number } => {
    const desktopAvailable = calculateAvailableColumns(targetRow, groupLayouts, 'desktop', originalLayout.fieldId);
    const mobileAvailable = calculateAvailableColumns(targetRow, groupLayouts, 'mobile', originalLayout.fieldId);

    return {
      widthColumns: desktopAvailable > 0 ? desktopAvailable : originalLayout.widthColumns,
      mobileWidthColumns: mobileAvailable > 0 ? mobileAvailable : originalLayout.mobileWidthColumns
    };
  };

  const handleGroupDragStart = (event: DragStartEvent) => {
    setActiveGroupId(event.active.id as string);
  };

  const handleGroupDragEnd = (event: DragEndEvent) => {
    setActiveGroupId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedGroups.findIndex(g => g.id === active.id);
    const newIndex = sortedGroups.findIndex(g => g.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedGroups = arrayMove(sortedGroups, oldIndex, newIndex);
      const updatedGroups = reorderedGroups.map((group, index) => ({
        ...group,
        groupOrder: index
      }));
      onGroupOrderChange?.(updatedGroups);
    }
  };

  const sortedGroups = [...fieldGroups].sort((a, b) => a.groupOrder - b.groupOrder);
  const groupIds = sortedGroups.map(g => g.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Form Layout Designer</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Design the layout for each field group
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={collapseAllGroups}
            className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Collapse all groups"
          >
            <ChevronsRight className="h-4 w-4 mr-2" />
            Collapse All
          </button>
          <button
            onClick={expandAllGroups}
            className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Expand all groups"
          >
            <ChevronsDown className="h-4 w-4 mr-2" />
            Expand All
          </button>
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('desktop')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'desktop'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Monitor className="h-4 w-4 inline mr-1" />
              Desktop
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'mobile'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Smartphone className="h-4 w-4 inline mr-1" />
              Mobile
            </button>
          </div>
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              previewMode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {previewMode ? <Edit3 className="h-4 w-4 inline mr-2" /> : <Eye className="h-4 w-4 inline mr-2" />}
            {previewMode ? 'Edit Mode' : 'Preview Mode'}
          </button>
        </div>
      </div>

      {sortedGroups.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">No field groups created yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Create field groups and fields first</p>
        </div>
      ) : (
        <DndContext
          sensors={groupSensors}
          collisionDetection={closestCenter}
          onDragStart={handleGroupDragStart}
          onDragEnd={handleGroupDragEnd}
        >
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {sortedGroups.map((group, groupIndex) => {
                const isCollapsed = collapsedGroups.has(group.id);
                const groupFields = getFieldsForGroup(group.id);
                const unlayoutedFields = getUnlayoutedFieldsForGroup(group.id);
                const fieldsByRow = getFieldsByRowForGroup(group.id);
                const sortedRows = Array.from(fieldsByRow.keys()).sort((a, b) => a - b);
                const layoutedFieldCount = groupFields.length - unlayoutedFields.length;

                return (
                  <SortableGroupCard
                    key={group.id}
                    group={group}
                    groupIndex={groupIndex}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => toggleGroupCollapse(group.id)}
                    groupFields={groupFields}
                    layoutedFieldCount={layoutedFieldCount}
                    isDarkMode={isDarkMode}
                  >
                    {!isCollapsed && (
                  <div className="mt-4 space-y-4">
                    {unlayoutedFields.length > 0 && !previewMode && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">
                          Fields Not Yet Added to Layout ({unlayoutedFields.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {unlayoutedFields.map(field => (
                            <button
                              key={field.id}
                              onClick={() => handleAddField(field.id, group.id)}
                              className="flex items-center space-x-2 px-3 py-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              <FieldTypeIcon fieldType={field.fieldType} size="sm" />
                              <div className="text-left">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{field.fieldName}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={`bg-gray-50 dark:bg-black rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-4 ${
                      viewMode === 'mobile' ? 'max-w-md mx-auto' : ''
                    }`}>
                      {sortedRows.length === 0 ? (
                        <div className="text-center py-8">
                          <Settings className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600 dark:text-gray-400 text-sm">No fields in layout yet</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Add fields from above to get started</p>
                        </div>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="space-y-3">
                            {sortedRows.map((rowIndex, displayIndex) => {
                              const rowFields = fieldsByRow.get(rowIndex)!;
                              const fieldIds = rowFields.map(f => f.fieldId);
                              const totalColumns = rowFields.reduce((sum, f) => {
                                const cols = viewMode === 'desktop' ? (f.layout?.widthColumns ?? 6) : (f.layout?.mobileWidthColumns ?? 12);
                                return sum + cols;
                              }, 0);

                              return (
                                <div key={rowIndex} className="relative">
                                  {!previewMode && (
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                        Row {displayIndex + 1}
                                      </span>
                                      <span className={`text-xs font-medium ${
                                        totalColumns > 12
                                          ? 'text-red-600 dark:text-red-400'
                                          : totalColumns === 12
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-blue-600 dark:text-blue-400'
                                      }`}>
                                        {totalColumns}/12 columns
                                      </span>
                                    </div>
                                  )}
                                  <SortableContext items={fieldIds} strategy={rectSortingStrategy}>
                                    <div className={`grid grid-cols-12 gap-3 p-2 rounded-lg ${
                                      !previewMode ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700' : ''
                                    }`}>
                                      {rowFields.map(({ fieldId, field, layout }) => {
                                        const fieldIndexInRow = rowFields.findIndex(f => f.fieldId === fieldId);
                                        const canMoveLeft = fieldIndexInRow > 0;
                                        const canMoveRight = fieldIndexInRow < rowFields.length - 1;

                                        return (
                                          <LayoutFieldCard
                                            key={fieldId}
                                            fieldId={fieldId}
                                            field={field}
                                            layout={layout}
                                            viewMode={viewMode}
                                            previewMode={previewMode}
                                            onEdit={() => layout && handleEditLayout(layout)}
                                            onRemove={() => handleRemoveField(fieldId, group.id)}
                                            onUpdateLayout={(updates) => handleUpdateLayout(fieldId, updates)}
                                            onMoveLeft={() => moveFieldHorizontally(fieldId, 'left', group.id)}
                                            onMoveRight={() => moveFieldHorizontally(fieldId, 'right', group.id)}
                                            onMoveUp={() => moveFieldVertically(fieldId, 'up', group.id)}
                                            onMoveDown={() => moveFieldVertically(fieldId, 'down', group.id)}
                                            canMoveLeft={canMoveLeft}
                                            canMoveRight={canMoveRight}
                                          />
                                        );
                                      })}
                                    </div>
                                  </SortableContext>
                                </div>
                              );
                            })}
                          </div>
                          <DragOverlay>
                            {activeId ? (
                              <div className="p-4 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-xl opacity-90">
                                <div className="flex items-center space-x-2">
                                  <GripVertical className="h-5 w-5 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {fields.find(f => f.id === activeId)?.fieldName}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      )}
                      </div>
                    </div>
                  )}
                  </SortableGroupCard>
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeGroupId ? (
              <div className="p-4 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-xl opacity-90">
                <div className="flex items-center space-x-2">
                  <GripVertical className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {fieldGroups.find(g => g.id === activeGroupId)?.groupName}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {editingLayout && (
        <LayoutEditModal
          layout={editingLayout}
          field={fields.find(f => f.id === editingLayout.fieldId)!}
          onSave={(updates) => {
            handleUpdateLayout(editingLayout.fieldId, updates);
            setEditingLayout(null);
          }}
          onClose={() => setEditingLayout(null)}
        />
      )}
    </div>
  );
}

interface LayoutFieldCardProps {
  fieldId: string;
  field: OrderEntryField;
  layout: OrderEntryFieldLayout | null;
  viewMode: 'desktop' | 'mobile';
  previewMode: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUpdateLayout: (updates: Partial<OrderEntryFieldLayout>) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

function LayoutFieldCard({ fieldId, field, layout, viewMode, previewMode, onEdit, onRemove, onUpdateLayout, onMoveLeft, onMoveRight, onMoveUp, onMoveDown, canMoveLeft, canMoveRight }: LayoutFieldCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fieldId });
  const [showTooltip, setShowTooltip] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const widthCols = viewMode === 'desktop' ? (layout?.widthColumns ?? 6) : (layout?.mobileWidthColumns ?? 12);

  const getColSpanClass = (cols: number) => {
    const colSpanMap: Record<number, string> = {
      1: 'col-span-1',
      2: 'col-span-2',
      3: 'col-span-3',
      4: 'col-span-4',
      5: 'col-span-5',
      6: 'col-span-6',
      7: 'col-span-7',
      8: 'col-span-8',
      9: 'col-span-9',
      10: 'col-span-10',
      11: 'col-span-11',
      12: 'col-span-12'
    };
    return colSpanMap[cols] || 'col-span-12';
  };

  const getFieldTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      text: 'Text Field',
      number: 'Number Field',
      date: 'Date Field',
      phone: 'Phone Field',
      zip: 'Zip Code',
      postal_code: 'Postal Code',
      state: 'State',
      province: 'Province',
      dropdown: 'Dropdown',
      file: 'File Upload',
      boolean: 'Checkbox',
      array: 'Array Field'
    };
    return labels[type] || type;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${getColSpanClass(widthCols)} ${previewMode ? '' : 'relative group'}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`h-full min-h-[56px] p-3 rounded-lg border-2 transition-all ${
        previewMode
          ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md'
      }`}>
        {!previewMode && (
          <div className="absolute top-2 left-2 cursor-move z-10" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </div>
        )}

        <div className={`${previewMode ? '' : 'pl-6 pr-1'}`}>
          <div className="flex items-center space-x-2">
            <div className="flex-shrink-0">
              <FieldTypeIcon fieldType={field.fieldType} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                <div className="flex items-start space-x-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{field.fieldName}</span>
                  {field.isRequired && (
                    <span className="text-sm text-red-600 dark:text-red-400 flex-shrink-0">*</span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Width: <span className="font-medium">{widthCols}/12</span></span>
              </div>
            </div>
          </div>
        </div>

        {!previewMode && (
          <>
            <div className="absolute top-1.5 right-1.5 flex flex-col space-y-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center space-x-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-md p-0.5">
                <Tooltip content="Edit layout settings">
                  <button
                    onClick={onEdit}
                    className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </Tooltip>
                <Tooltip content="Remove from layout">
                  <button
                    onClick={onRemove}
                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Tooltip>
              </div>
            </div>
            <div className="absolute bottom-1.5 right-1.5 flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-lg shadow-md p-0.5">
              <Tooltip content="Move up">
                <button
                  onClick={onMoveUp}
                  className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
              </Tooltip>
              <Tooltip content="Move down">
                <button
                  onClick={onMoveDown}
                  className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </Tooltip>
              {canMoveLeft && (
                <Tooltip content="Move left">
                  <button
                    onClick={onMoveLeft}
                    className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                </Tooltip>
              )}
              {canMoveRight && (
                <Tooltip content="Move right">
                  <button
                    onClick={onMoveRight}
                    className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </Tooltip>
              )}
            </div>
          </>
        )}

        {showTooltip && !previewMode && (
          <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full bg-gray-900 dark:bg-gray-700 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-lg z-10">
            <div className="flex items-center space-x-2">
              <FieldTypeIcon fieldType={field.fieldType} size="sm" className="flex-shrink-0" />
              <div>
                <div className="font-semibold">{field.fieldName}</div>
                <div className="text-gray-300 dark:text-gray-400">{getFieldTypeLabel(field.fieldType)}</div>
              </div>
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SortableGroupCardProps {
  group: OrderEntryFieldGroup;
  groupIndex: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  children: React.ReactNode;
  groupFields: OrderEntryField[];
  layoutedFieldCount: number;
  isDarkMode: boolean;
}

function SortableGroupCard({
  group,
  groupIndex,
  isCollapsed,
  onToggleCollapse,
  children,
  groupFields,
  layoutedFieldCount,
  isDarkMode
}: SortableGroupCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const adaptedBgColor = adaptBackgroundForDarkMode(group.backgroundColor, isDarkMode);
  const textColor = getContrastTextColor(group.backgroundColor, isDarkMode);
  const hasCustomBg = Boolean(group.backgroundColor);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: group.borderColor }}
      className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 dark:bg-black ${isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''}`}
    >
      <div
        className={`transition-opacity -mx-4 -my-4 px-4 py-4 ${!hasCustomBg ? 'dark:bg-black' : ''}`}
        style={{ backgroundColor: hasCustomBg ? adaptedBgColor : undefined }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
            >
              <GripVertical className={`h-5 w-5 ${group.backgroundColor ? textColor.replace('text-', 'text-').replace('100', '400').replace('900', '500') : 'text-gray-400'} hover:text-blue-500 transition-colors pointer-events-none`} />
            </div>
            <div
              className="flex items-center space-x-3 flex-1 cursor-pointer hover:opacity-70"
              onClick={onToggleCollapse}
            >
              {isCollapsed ? (
                <ChevronRight className={`h-5 w-5 ${group.backgroundColor ? textColor.replace('text-', 'text-').replace('100', '400').replace('900', '500') : 'text-gray-500 dark:text-gray-400'}`} />
              ) : (
                <ChevronDown className={`h-5 w-5 ${group.backgroundColor ? textColor.replace('text-', 'text-').replace('100', '400').replace('900', '500') : 'text-gray-500 dark:text-gray-400'}`} />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h4 className={`font-semibold ${group.backgroundColor ? textColor : 'text-gray-900 dark:text-gray-100'}`}>
                    {groupIndex + 1}. {group.groupName}
                  </h4>
                  {group.isArrayGroup && (
                    <Tooltip content={
                      <div className="space-y-1">
                        <div className="font-semibold">Array Group</div>
                        <div className="text-xs">Fields from this group will be added to the same row</div>
                        {group.arrayJsonPath && (
                          <div className="text-xs mt-2">
                            <span className="font-medium">JSON Path:</span> {group.arrayJsonPath}
                          </div>
                        )}
                        <div className="text-xs">
                          <span className="font-medium">Rows:</span> {group.arrayMinRows} - {group.arrayMaxRows}
                        </div>
                      </div>
                    }>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full font-medium">
                        <Layers className="h-3 w-3" />
                        Array Group
                      </span>
                    </Tooltip>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full ${group.backgroundColor ? 'bg-black/10 dark:bg-white/10' : 'bg-gray-100 dark:bg-gray-700'} ${group.backgroundColor ? textColor.replace('900', '700').replace('100', '300') : 'text-gray-600 dark:text-gray-400'}`}>
                    {layoutedFieldCount}/{groupFields.length} fields in layout
                  </span>
                </div>
                {group.description && !isCollapsed && (
                  <p className={`text-sm mt-1 ${group.backgroundColor ? textColor.replace('900', '700').replace('100', '300') : 'text-gray-600 dark:text-gray-400'}`}>{group.description}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

interface LayoutEditModalProps {
  layout: OrderEntryFieldLayout;
  field: OrderEntryField;
  onSave: (updates: Partial<OrderEntryFieldLayout>) => void;
  onClose: () => void;
}

function LayoutEditModal({ layout, field, onSave, onClose }: LayoutEditModalProps) {
  const [widthColumns, setWidthColumns] = useState(layout.widthColumns);
  const [mobileWidthColumns, setMobileWidthColumns] = useState(layout.mobileWidthColumns);

  const handleSave = () => {
    onSave({
      widthColumns,
      mobileWidthColumns
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 mb-2">
            <FieldTypeIcon fieldType={field.fieldType} size="md" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Layout Settings
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">{field.fieldName}</p>
            <FieldTypeBadge fieldType={field.fieldType} />
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Desktop Width (columns out of 12)
              <HelpTooltip content="12-column responsive grid system. Choose 1-12 columns for desktop screens (≥768px). Common layouts: 12 = full width, 6 = half width, 4 = third width, 3 = quarter width." />
            </label>
            <input
              type="range"
              min="1"
              max="12"
              value={widthColumns}
              onChange={(e) => setWidthColumns(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1 column</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">{widthColumns} columns</span>
              <span>12 columns</span>
            </div>
            <div className="mt-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
              <div className="grid grid-cols-12 gap-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-8 rounded ${
                      i < widthColumns
                        ? 'bg-blue-500 dark:bg-blue-600'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mobile Width (columns out of 12)
              <HelpTooltip content="Choose 1-12 columns on mobile devices (<768px). Fields automatically stack on mobile if too wide. Most fields should use 12 (full width) for better mobile UX." />
            </label>
            <input
              type="range"
              min="1"
              max="12"
              value={mobileWidthColumns}
              onChange={(e) => setMobileWidthColumns(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1 column</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">{mobileWidthColumns} columns</span>
              <span>12 columns</span>
            </div>
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-xs text-blue-900 dark:text-blue-300 font-medium mb-1">
                Responsive Behavior:
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Fields automatically stack vertically on mobile if their combined width exceeds 12 columns. Recommended to use full width (12 columns) for most fields on mobile devices.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Layout
          </button>
        </div>
      </div>
    </div>
  );
}
