import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import type { InboxReviewFieldGroup, InboxReviewField, InboxReviewFieldLayout, OrderEntryField, OrderEntryFieldGroup, OrderEntryFieldLayout } from '../../types';
import { reviewSetupService } from '../../services/reviewSetupService';
import LayoutDesigner from './LayoutDesigner';

interface ReviewLayoutDesignerProps {
  templateId: string;
}

function adaptFieldGroupToOrderEntry(group: InboxReviewFieldGroup): OrderEntryFieldGroup {
  return {
    id: group.id,
    groupName: group.groupName,
    groupOrder: group.groupOrder,
    description: group.description || '',
    isCollapsible: true,
    isExpandedByDefault: !group.isCollapsedByDefault,
    backgroundColor: '',
    borderColor: '',
    isArrayGroup: group.isArrayGroup,
    arrayMinRows: 1,
    arrayMaxRows: 99,
    arrayJsonPath: group.arrayJsonPath || '',
    hideAddRow: false,
    isHidden: false,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

function adaptFieldToOrderEntry(field: InboxReviewField): OrderEntryField {
  return {
    id: field.id,
    fieldGroupId: field.groupId,
    fieldName: field.fieldName,
    fieldLabel: field.fieldLabel,
    fieldType: field.fieldType as any,
    placeholder: field.placeholder || '',
    helpText: field.helpText || '',
    isRequired: field.isRequired,
    maxLength: field.maxLength || undefined,
    defaultValue: '',
    dropdownOptions: field.dropdownOptions || [],
    jsonPath: field.jsonPath,
    isArrayField: false,
    arrayMinRows: 0,
    arrayMaxRows: 0,
    aiExtractionInstructions: '',
    validationRegex: field.validationRegex || '',
    validationErrorMessage: '',
    fieldOrder: field.fieldOrder,
    createdAt: field.createdAt,
    updatedAt: field.updatedAt
  };
}

function adaptLayoutToOrderEntry(layout: InboxReviewFieldLayout): OrderEntryFieldLayout {
  return {
    id: layout.id,
    fieldId: layout.fieldId,
    rowIndex: layout.rowIndex,
    columnIndex: layout.columnIndex,
    widthColumns: layout.widthColumns,
    mobileWidthColumns: layout.mobileWidthColumns,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt
  };
}

function adaptLayoutFromOrderEntry(layout: OrderEntryFieldLayout): InboxReviewFieldLayout {
  return {
    id: layout.id,
    fieldId: layout.fieldId,
    rowIndex: layout.rowIndex,
    columnIndex: layout.columnIndex,
    widthColumns: layout.widthColumns,
    mobileWidthColumns: layout.mobileWidthColumns,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt
  };
}

export default function ReviewLayoutDesigner({ templateId }: ReviewLayoutDesignerProps) {
  const [groups, setGroups] = useState<InboxReviewFieldGroup[]>([]);
  const [fields, setFields] = useState<InboxReviewField[]>([]);
  const [layouts, setLayouts] = useState<InboxReviewFieldLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldIdsRef = useRef<string[]>([]);

  useEffect(() => {
    loadAll();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [templateId]);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const groupsData = await reviewSetupService.loadFieldGroups(templateId);
      setGroups(groupsData);
      if (groupsData.length > 0) {
        const fieldsData = await reviewSetupService.loadFields(groupsData.map(g => g.id));
        setFields(fieldsData);
        const fIds = fieldsData.map(f => f.id);
        fieldIdsRef.current = fIds;
        if (fIds.length > 0) {
          const layoutsData = await reviewSetupService.loadLayouts(fIds);
          setLayouts(layoutsData);
        } else {
          setLayouts([]);
        }
      } else {
        setFields([]);
        setLayouts([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load layout data');
    } finally {
      setLoading(false);
    }
  }

  const handleLayoutChange = useCallback((newLayouts: OrderEntryFieldLayout[]) => {
    const converted = newLayouts.map(adaptLayoutFromOrderEntry);
    setLayouts(converted);
    setSaveStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await reviewSetupService.saveLayouts(converted, fieldIdsRef.current);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
        setError('Failed to save layout');
      }
    }, 800);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
        <p className="text-sm text-gray-500 dark:text-gray-400">Add fields in the "Fields" view before configuring the layout.</p>
      </div>
    );
  }

  const adaptedGroups = groups.map(adaptFieldGroupToOrderEntry);
  const adaptedFields = fields.map(adaptFieldToOrderEntry);
  const adaptedLayouts = layouts.map(adaptLayoutToOrderEntry);

  return (
    <div className="space-y-2">
      {/* Save indicator */}
      <div className="flex justify-end h-5">
        {saveStatus === 'saving' && (
          <span className="flex items-center space-x-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Saving layout...</span>
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center space-x-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3 w-3" />
            <span>Layout saved</span>
          </span>
        )}
      </div>

      <LayoutDesigner
        fields={adaptedFields}
        fieldGroups={adaptedGroups}
        layouts={adaptedLayouts}
        onLayoutChange={handleLayoutChange}
      />
    </div>
  );
}
