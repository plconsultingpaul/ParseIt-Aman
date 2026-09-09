import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Pencil, Settings, GripVertical, Eye, AlertCircle, Download, HelpCircle, Brain, ChevronDown, ChevronRight, Check, Loader2, ChevronsDown, ChevronsRight, FileText, Wrench, Power, Save, Code, Calendar } from 'lucide-react';
import type { OrderEntryFieldGroup, OrderEntryField, OrderEntryFieldLayout, User, ExtractionType, DropdownOption } from '../../types';
import { supabase } from '../../lib/supabase';
import LayoutDesigner from './LayoutDesigner';
import JsonSchemaManager from './JsonSchemaManager';
import FieldTypeIcon, { FieldTypeBadge } from '../common/FieldTypeIcon';
import FormPreviewModal from './FormPreviewModal';
import { HelpTooltip } from '../common/Tooltip';
import DatePicker from '../common/DatePicker';
import { useKeyboardShortcuts, KeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import KeyboardShortcutsModal from '../common/KeyboardShortcutsModal';
import { useToast } from '../../hooks/useToast';
import ToastContainer from '../common/ToastContainer';
import { FormSkeleton } from '../common/Skeleton';
import { NoFieldsEmptyState } from '../common/EmptyState';
import Select from '../common/Select';
import OrderEntryTemplatesSettings from './OrderEntryTemplatesSettings';

interface OrderEntryConfigSettingsProps {
  currentUser: User;
}

type OrderEntrySubTab = 'templates' | 'configuration';

export default function OrderEntryConfigSettings({ currentUser }: OrderEntryConfigSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<OrderEntrySubTab>('templates');
  const [loading, setLoading] = useState(true);
  const [fieldGroups, setFieldGroups] = useState<OrderEntryFieldGroup[]>([]);
  const [fields, setFields] = useState<OrderEntryField[]>([]);
  const [fieldLayouts, setFieldLayouts] = useState<OrderEntryFieldLayout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [globalConfigLoading, setGlobalConfigLoading] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<{
    id?: string;
    isEnabled: boolean;
  }>({
    isEnabled: false
  });
  const [extractionTypes, setExtractionTypes] = useState<ExtractionType[]>([]);

  const [holidays, setHolidays] = useState<{ id: string; name: string; date: string; recurring: boolean }[]>([]);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<{ id?: string; name: string; date: string; recurring: boolean } | null>(null);
  const [holidaySaving, setHolidaySaving] = useState(false);

  const [editingGroup, setEditingGroup] = useState<OrderEntryFieldGroup | null>(null);
  const [editingField, setEditingField] = useState<OrderEntryField | null>(null);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState({
    fieldGroups: true,
    formLayout: true,
    jsonSchema: true
  });
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pendingLayoutSave, setPendingLayoutSave] = useState(false);
  const layoutSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveCompletionRef = useRef<Promise<void> | null>(null);

  const toast = useToast();

  useEffect(() => {
    loadData(true);
    loadGlobalConfig();
    loadExtractionTypes();
    loadHolidays();
  }, []);

  const loadGlobalConfig = async () => {
    try {
      setGlobalConfigLoading(true);
      const { data, error } = await supabase
        .from('order_entry_config')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setGlobalConfig({
          id: data.id,
          isEnabled: data.is_enabled || false
        });
      }
    } catch (err: any) {
      console.error('Failed to load global config:', err);
      toast.error('Failed to load global configuration');
    } finally {
      setGlobalConfigLoading(false);
    }
  };

  const loadExtractionTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('extraction_types')
        .select('*')
        .order('name');

      if (error) throw error;

      const types: ExtractionType[] = (data || []).map((t: any) => {
        let fieldMappings = [];
        if (t.field_mappings) {
          try {
            fieldMappings = typeof t.field_mappings === 'string'
              ? JSON.parse(t.field_mappings)
              : t.field_mappings;
          } catch (e) {
            console.error('Failed to parse field_mappings for extraction type:', t.name, e);
          }
        }

        return {
          id: t.id,
          name: t.name,
          defaultInstructions: t.default_instructions || '',
          formatTemplate: t.format_template || '',
          filename: t.filename || '',
          formatType: t.format_type || 'JSON',
          workflowId: t.workflow_id,
          fieldMappings
        };
      });

      console.log('[OrderEntryConfigSettings] Loaded extraction types with fieldMappings:', types.map(t => ({ name: t.name, fieldMappingsCount: t.fieldMappings?.length || 0 })));
      setExtractionTypes(types);
    } catch (err: any) {
      console.error('Failed to load extraction types:', err);
    }
  };

  const loadHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('order_entry_holidays')
        .select('*')
        .order('date', { ascending: true });
      if (error) throw error;
      setHolidays(data || []);
    } catch (err: any) {
      console.error('Failed to load holidays:', err);
    }
  };

  const saveHoliday = async () => {
    if (!editingHoliday || !editingHoliday.name.trim() || !editingHoliday.date) return;
    try {
      setHolidaySaving(true);
      if (editingHoliday.id) {
        const { error } = await supabase
          .from('order_entry_holidays')
          .update({ name: editingHoliday.name.trim(), date: editingHoliday.date, recurring: editingHoliday.recurring, updated_at: new Date().toISOString() })
          .eq('id', editingHoliday.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('order_entry_holidays')
          .insert({ name: editingHoliday.name.trim(), date: editingHoliday.date, recurring: editingHoliday.recurring });
        if (error) throw error;
      }
      await loadHolidays();
      setShowHolidayModal(false);
      setEditingHoliday(null);
    } catch (err: any) {
      console.error('Failed to save holiday:', err);
    } finally {
      setHolidaySaving(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    try {
      const { error } = await supabase
        .from('order_entry_holidays')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadHolidays();
    } catch (err: any) {
      console.error('Failed to delete holiday:', err);
    }
  };

  const saveGlobalConfig = async () => {
    try {
      setGlobalConfigLoading(true);
      const configData = {
        is_enabled: globalConfig.isEnabled,
        updated_at: new Date().toISOString()
      };

      if (globalConfig.id) {
        const { error } = await supabase
          .from('order_entry_config')
          .update(configData)
          .eq('id', globalConfig.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('order_entry_config')
          .insert([{ ...configData, created_at: new Date().toISOString() }])
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setGlobalConfig(prev => ({ ...prev, id: data.id }));
        }
      }

      toast.success('Global configuration saved successfully');
    } catch (err: any) {
      console.error('Failed to save global config:', err);
      toast.error('Failed to save global configuration');
    } finally {
      setGlobalConfigLoading(false);
    }
  };

  const handleExportConfig = () => {
    try {
      const exportData = {
        fieldGroups,
        fields,
        fieldLayouts
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-entry-fields-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Field configuration exported successfully');
    } catch (err) {
      toast.error('Failed to export field configuration');
    }
  };

  const handleNewField = () => {
    if (fieldGroups.length === 0) {
      toast.warning('Please create a field group first');
      return;
    }
    setEditingField(null);
    setShowFieldModal(true);
  };

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'e',
      ctrlKey: true,
      callback: handleExportConfig,
      description: 'Export field configuration'
    },
    {
      key: 'p',
      ctrlKey: true,
      callback: () => handlePreviewForm(),
      description: 'Preview form'
    },
    {
      key: 'n',
      ctrlKey: true,
      callback: handleNewField,
      description: 'Create new field'
    },
    {
      key: '?',
      callback: () => setShowShortcutsModal(true),
      description: 'Show keyboard shortcuts'
    }
  ];

  useKeyboardShortcuts(shortcuts);

  const loadData = async (resetCollapsedState = false) => {
    try {
      setLoading(true);
      setError(null);

      const [groupsRes, fieldsRes, layoutsRes] = await Promise.all([
        supabase.from('order_entry_field_groups').select('*').order('group_order', { ascending: true }),
        supabase.from('order_entry_fields').select('*').order('field_order', { ascending: true }),
        supabase.from('order_entry_field_layout').select('*')
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (layoutsRes.error) throw layoutsRes.error;

      const groups = (groupsRes.data || []).map((g: any) => ({
        id: g.id,
        groupName: g.group_name,
        groupOrder: g.group_order,
        description: g.description,
        isCollapsible: g.is_collapsible,
        isExpandedByDefault: g.is_expanded_by_default,
        backgroundColor: g.background_color,
        borderColor: g.border_color,
        isArrayGroup: g.is_array_group || false,
        arrayMinRows: g.array_min_rows || 1,
        arrayMaxRows: g.array_max_rows || 10,
        arrayJsonPath: g.array_json_path || '',
        removeIfEmpty: g.remove_if_empty || false,
        createdAt: g.created_at,
        updatedAt: g.updated_at
      }));

      const fields = (fieldsRes.data || []).map((f: any) => ({
        id: f.id,
        fieldGroupId: f.field_group_id,
        fieldName: f.field_name,
        fieldLabel: f.field_label,
        fieldType: f.field_type,
        placeholder: f.placeholder,
        helpText: f.help_text,
        isRequired: f.is_required,
        maxLength: f.max_length,
        minValue: f.min_value,
        maxValue: f.max_value,
        defaultValue: f.default_value,
        dropdownOptions: f.dropdown_options || [],
        dropdownDisplayMode: f.dropdown_display_mode || 'description_only',
        jsonPath: f.json_path,
        isArrayField: f.is_array_field,
        arrayMinRows: f.array_min_rows,
        arrayMaxRows: f.array_max_rows,
        aiExtractionInstructions: f.ai_extraction_instructions,
        validationRegex: f.validation_regex,
        validationErrorMessage: f.validation_error_message,
        fieldOrder: f.field_order,
        createdAt: f.created_at,
        updatedAt: f.updated_at
      }));

      const layouts = (layoutsRes.data || []).map((l: any) => ({
        id: l.id,
        fieldId: l.field_id,
        rowIndex: l.row_index,
        columnIndex: l.column_index,
        widthColumns: l.width_columns,
        mobileWidthColumns: l.mobile_width_columns,
        createdAt: l.created_at,
        updatedAt: l.updated_at
      }));

      setFieldGroups(groups);
      setFields(fields);
      setFieldLayouts(layouts);

      // Only reset collapsed state if explicitly requested (e.g., on initial page load)
      if (resetCollapsedState) {
        setCollapsedGroups(new Set(groups.map((g: OrderEntryFieldGroup) => g.id)));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };


  const createFieldGroup = () => {
    const newGroup: Partial<OrderEntryFieldGroup> = {
      groupName: '',
      groupOrder: fieldGroups.length + 1,
      description: '',
      isCollapsible: false,
      isExpandedByDefault: true,
      backgroundColor: '#ffffff',
      borderColor: '#14b8a6',
      isArrayGroup: false,
      arrayMinRows: 1,
      arrayMaxRows: 10,
      arrayJsonPath: ''
    };
    setEditingGroup(newGroup as OrderEntryFieldGroup);
    setShowGroupModal(true);
  };

  const editFieldGroup = (group: OrderEntryFieldGroup) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const saveFieldGroup = async () => {
    if (!editingGroup) return;

    try {
      setError(null);
      const groupData = {
        group_name: editingGroup.groupName,
        group_order: editingGroup.groupOrder,
        description: editingGroup.description,
        is_collapsible: editingGroup.isCollapsible,
        is_expanded_by_default: editingGroup.isExpandedByDefault,
        background_color: editingGroup.backgroundColor,
        border_color: editingGroup.borderColor,
        is_array_group: editingGroup.isArrayGroup || false,
        array_min_rows: editingGroup.arrayMinRows || 1,
        array_max_rows: editingGroup.arrayMaxRows || 10,
        array_json_path: editingGroup.arrayJsonPath || null,
        remove_if_empty: editingGroup.removeIfEmpty || false,
        updated_at: new Date().toISOString()
      };

      let result;
      if (editingGroup.id) {
        result = await supabase
          .from('order_entry_field_groups')
          .update(groupData)
          .eq('id', editingGroup.id);
      } else {
        result = await supabase
          .from('order_entry_field_groups')
          .insert([{ ...groupData, created_at: new Date().toISOString() }]);
      }

      if (result.error) throw result.error;

      setShowGroupModal(false);
      setEditingGroup(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save field group');
    }
  };

  const deleteFieldGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this field group? All fields in this group will also be deleted.')) {
      return;
    }

    try {
      setError(null);
      const { error } = await supabase
        .from('order_entry_field_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete field group');
    }
  };

  const toggleGroupCollapse = (groupId: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(groupId)) {
      newCollapsed.delete(groupId);
    } else {
      newCollapsed.add(groupId);
    }
    setCollapsedGroups(newCollapsed);
  };

  const collapseAllGroups = () => {
    setCollapsedGroups(new Set(fieldGroups.map(g => g.id)));
  };

  const expandAllGroups = () => {
    setCollapsedGroups(new Set());
  };

  const toggleSectionCollapse = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handlePreviewForm = async () => {
    if (fields.length === 0) return;

    setLoadingPreview(true);

    if (layoutSaveTimeoutRef.current) {
      clearTimeout(layoutSaveTimeoutRef.current);
      if (fieldLayouts.length > 0) {
        await saveLayoutToDatabase(fieldLayouts);
      }
    }

    if (saveCompletionRef.current) {
      await saveCompletionRef.current;
    }

    await loadData();

    setTimeout(() => {
      setShowPreviewModal(true);
      setLoadingPreview(false);
    }, 100);
  };

  const createField = (groupId: string) => {
    const newField: Partial<OrderEntryField> = {
      fieldGroupId: groupId,
      fieldName: '',
      fieldLabel: '',
      fieldType: 'text',
      placeholder: '',
      helpText: '',
      isRequired: false,
      maxLength: undefined,
      defaultValue: '',
      dropdownOptions: [],
      jsonPath: '',
      isArrayField: false,
      arrayMinRows: 1,
      arrayMaxRows: 10,
      aiExtractionInstructions: '',
      validationRegex: '',
      validationErrorMessage: '',
      fieldOrder: fields.filter(f => f.fieldGroupId === groupId).length + 1
    };
    setEditingField(newField as OrderEntryField);
    setShowFieldModal(true);
  };

  const editField = (field: OrderEntryField) => {
    setEditingField(field);
    setShowFieldModal(true);
  };

  const saveField = async () => {
    if (!editingField) return;

    try {
      setError(null);

      const cleanedDropdownOptions = (editingField.dropdownOptions || [])
        .filter((opt: string | DropdownOption) => {
          if (typeof opt === 'string') return opt.trim().length > 0;
          return opt.value?.trim().length > 0;
        })
        .map((opt: string | DropdownOption) => {
          if (typeof opt === 'string') return { value: opt.trim(), description: opt.trim() };
          return { value: opt.value?.trim() || '', description: opt.description?.trim() || opt.value?.trim() || '' };
        });

      const fieldData = {
        field_group_id: editingField.fieldGroupId,
        field_name: editingField.fieldName,
        field_label: editingField.fieldLabel,
        field_type: editingField.fieldType,
        placeholder: editingField.placeholder,
        help_text: editingField.helpText,
        is_required: editingField.isRequired,
        max_length: editingField.maxLength,
        min_value: editingField.minValue,
        max_value: editingField.maxValue,
        default_value: editingField.defaultValue,
        dropdown_options: cleanedDropdownOptions,
        dropdown_display_mode: editingField.dropdownDisplayMode || 'description_only',
        json_path: editingField.jsonPath,
        is_array_field: editingField.isArrayField,
        array_min_rows: editingField.arrayMinRows,
        array_max_rows: editingField.arrayMaxRows,
        ai_extraction_instructions: editingField.aiExtractionInstructions,
        validation_regex: editingField.validationRegex,
        validation_error_message: editingField.validationErrorMessage,
        field_order: editingField.fieldOrder,
        updated_at: new Date().toISOString()
      };

      let result;
      if (editingField.id) {
        result = await supabase
          .from('order_entry_fields')
          .update(fieldData)
          .eq('id', editingField.id);
      } else {
        result = await supabase
          .from('order_entry_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }]);
      }

      if (result.error) throw result.error;

      setShowFieldModal(false);
      setEditingField(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save field');
    }
  };

  const deleteField = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field?')) {
      return;
    }

    try {
      setError(null);
      const { error } = await supabase
        .from('order_entry_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete field');
    }
  };

  const saveLayoutToDatabase = async (layouts: OrderEntryFieldLayout[]) => {
    try {
      setLayoutSaveStatus('saving');
      setPendingLayoutSave(true);

      // Prepare all layout data for batch upsert
      const layoutsToUpsert = layouts.map(layout => ({
        field_id: layout.fieldId,
        row_index: layout.rowIndex,
        column_index: layout.columnIndex,
        width_columns: layout.widthColumns,
        mobile_width_columns: layout.mobileWidthColumns,
        updated_at: new Date().toISOString()
      }));

      // Single batch upsert operation - automatically handles INSERT or UPDATE
      const { data, error } = await supabase
        .from('order_entry_field_layout')
        .upsert(layoutsToUpsert, {
          onConflict: 'field_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) throw error;

      // Map returned data to application format
      const updatedLayouts: OrderEntryFieldLayout[] = (data || []).map(d => ({
        id: d.id,
        fieldId: d.field_id,
        rowIndex: d.row_index,
        columnIndex: d.column_index,
        widthColumns: d.width_columns,
        mobileWidthColumns: d.mobile_width_columns,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));

      // Handle deletions - remove layouts for fields that no longer exist
      const deletedFieldIds = fieldLayouts
        .map(l => l.fieldId)
        .filter(id => !layouts.find(l => l.fieldId === id));

      if (deletedFieldIds.length > 0) {
        const { error } = await supabase
          .from('order_entry_field_layout')
          .delete()
          .in('field_id', deletedFieldIds);

        if (error) throw error;
      }

      setFieldLayouts(updatedLayouts);

      setLayoutSaveStatus('saved');
      setPendingLayoutSave(false);

      setTimeout(() => {
        setLayoutSaveStatus('idle');
      }, 2000);
    } catch (err: any) {
      setLayoutSaveStatus('error');
      setPendingLayoutSave(false);
      toast.error('Failed to save layout: ' + err.message);
      console.error('Layout save error:', err);
    }
  };

  const handleLayoutChange = useCallback((layouts: OrderEntryFieldLayout[]) => {
    setFieldLayouts(layouts);
    setLayoutSaveStatus('saving');

    if (layoutSaveTimeoutRef.current) {
      clearTimeout(layoutSaveTimeoutRef.current);
    }

    layoutSaveTimeoutRef.current = setTimeout(() => {
      const savePromise = saveLayoutToDatabase(layouts);
      saveCompletionRef.current = savePromise;
    }, 800);
  }, [fieldLayouts]);

  if (loading && activeSubTab === 'configuration') {
    return (
      <div className="space-y-6">
        <FormSkeleton fields={8} />
      </div>
    );
  }

  const subTabs = [
    { id: 'templates' as OrderEntrySubTab, label: 'Templates', icon: FileText, description: 'Manage order entry templates for clients' },
    { id: 'configuration' as OrderEntrySubTab, label: 'Global Configuration', icon: Wrench, description: 'Default form configuration (not for clients)' }
  ];

  if (activeSubTab === 'templates') {
    return (
      <div className="space-y-6">
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-all duration-200 ${
                  activeSubTab === tab.id
                    ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <Icon className={`h-4 w-4 ${
                  activeSubTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Power className="h-5 w-5" />
                Global Order Entry Settings
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Enable or disable order entry system-wide. This affects all users and templates.
              </p>
            </div>
            <button
              onClick={saveGlobalConfig}
              disabled={globalConfigLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {globalConfigLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${globalConfig.isEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <Power className={`h-6 w-6 ${globalConfig.isEnabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
              </div>
              <div>
                <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                  Order Entry System Status
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {globalConfig.isEnabled
                    ? 'Order entry is currently enabled for all users with access'
                    : 'Order entry is currently disabled - users will see "Form Unavailable"'}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={globalConfig.isEnabled}
                onChange={(e) => setGlobalConfig({ ...globalConfig, isEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
              <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                {globalConfig.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>

        {/* Holidays Management */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-500" />
                Observed Holidays
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Define holidays that can be restricted on date fields. Fields with "Allow Holidays" unchecked will block these dates.
              </p>
            </div>
            <button
              onClick={() => { setEditingHoliday({ name: '', date: '', recurring: true }); setShowHolidayModal(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Add Holiday
            </button>
          </div>

          {holidays.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No holidays configured yet.</p>
              <p className="text-xs mt-1">Add holidays to restrict date selection in order entry forms.</p>
            </div>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Recurring</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{h.name}</td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{h.date}</td>
                      <td className="px-4 py-2.5">
                        {h.recurring ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Yearly</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">One-time</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditingHoliday({ id: h.id, name: h.name, date: h.date, recurring: h.recurring }); setShowHolidayModal(true); }}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteHoliday(h.id)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Holiday Add/Edit Modal */}
        {showHolidayModal && editingHoliday && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {editingHoliday.id ? 'Edit Holiday' : 'Add Holiday'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Holiday Name</label>
                  <input
                    type="text"
                    value={editingHoliday.name}
                    onChange={(e) => setEditingHoliday({ ...editingHoliday, name: e.target.value })}
                    placeholder="e.g. Christmas Day"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                  <DatePicker
                    value={editingHoliday.date}
                    onChange={(val) => setEditingHoliday({ ...editingHoliday, date: val })}
                    placeholder="Select date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="recurring-holiday"
                    checked={editingHoliday.recurring}
                    onChange={(e) => setEditingHoliday({ ...editingHoliday, recurring: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="recurring-holiday" className="text-sm text-gray-700 dark:text-gray-300">
                    Recurring every year (same month/day)
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-6">
                <button
                  onClick={() => { setShowHolidayModal(false); setEditingHoliday(null); }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveHoliday}
                  disabled={!editingHoliday.name.trim() || !editingHoliday.date || holidaySaving}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {holidaySaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingHoliday.id ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        <OrderEntryTemplatesSettings extractionTypes={extractionTypes} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-all duration-200 ${
                activeSubTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              <Icon className={`h-4 w-4 ${
                activeSubTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h4>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Order Entry Form Configuration</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Design your form fields and layout. API configuration is managed in Settings.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowShortcutsModal(true)}
              className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Show keyboard shortcuts (?)"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Shortcuts
              <span className="ml-2 text-xs opacity-75 font-mono">(?)</span>
            </button>
            <button
              onClick={handleExportConfig}
              className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Export field configuration (Ctrl/Cmd + E)"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
              <span className="ml-2 text-xs opacity-75 font-mono">(⌘E)</span>
            </button>
            <button
              onClick={handlePreviewForm}
              disabled={fields.length === 0 || loadingPreview}
              className="flex items-center px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
              title={fields.length === 0 ? 'Add fields to enable preview' : 'Preview form configuration (Ctrl/Cmd + P)'}
            >
              <Eye className={`h-4 w-4 mr-2 ${loadingPreview ? 'animate-pulse' : ''}`} />
              Preview
              {!loadingPreview && <span className="ml-2 text-xs opacity-75 font-mono">(⌘P)</span>}
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            onClick={() => toggleSectionCollapse('fieldGroups')}
            className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-4"
          >
            <div className="flex items-center space-x-3">
              {collapsedSections.fieldGroups ? (
                <ChevronRight className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
              <div className="text-left">
                <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">Field Groups</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Organize your form fields into logical groups
                </p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
              {fieldGroups.length} {fieldGroups.length === 1 ? 'group' : 'groups'}
            </span>
          </button>

          {!collapsedSections.fieldGroups && (
            <div className="flex items-center justify-end space-x-2 mb-4">
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
              <button
                onClick={createFieldGroup}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Group
              </button>
            </div>
          )}
        </div>

        {!collapsedSections.fieldGroups && (
        <div className="space-y-4">
          {fields.length === 0 && (
            <NoFieldsEmptyState onCreate={() => {
              if (fieldGroups.length > 0) {
                createField(fieldGroups[0].id);
              } else {
                toast.warning('Please create a field group first');
              }
            }} />
          )}

          {fieldGroups.map(group => {
            const isCollapsed = collapsedGroups.has(group.id);
            const fieldCount = fields.filter(f => f.fieldGroupId === group.id).length;

            return (
              <div
                key={group.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                style={{ borderColor: group.borderColor }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3 flex-1">
                    <GripVertical className="h-5 w-5 text-gray-400 mt-1 cursor-move" />
                    <button
                      onClick={() => toggleGroupCollapse(group.id)}
                      className="flex items-center space-x-2 text-left hover:opacity-70 transition-opacity"
                      title={isCollapsed ? "Click to expand" : "Click to collapse"}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{group.groupName}</h4>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                            {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                          </span>
                        </div>
                        {group.description && !isCollapsed && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{group.description}</p>
                        )}
                      </div>
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                  <button
                    onClick={() => createField(group.id)}
                    className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                    title="Add Field (Ctrl/Cmd + N)"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => editFieldGroup(group)}
                    className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Edit Group"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteFieldGroup(group.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete Group"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="space-y-2 ml-8">
                  {fields.filter(f => f.fieldGroupId === group.id).map(field => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                        <FieldTypeIcon fieldType={field.fieldType} size="sm" />
                        <div>
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {field.fieldLabel}
                            </span>
                            <FieldTypeBadge fieldType={field.fieldType} />
                            {field.isRequired && (
                              <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                                Required
                              </span>
                            )}
                            {field.isArrayField && (
                              <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                Array
                              </span>
                            )}
                            {field.aiExtractionInstructions && (
                              <span className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded flex items-center gap-1">
                                <Brain className="h-3 w-3" />
                                AI
                              </span>
                            )}
                            {field.jsonPath && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                JSON Path: {field.jsonPath}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => editField(field)}
                          className="p-1 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          title="Edit Field"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteField(field.id)}
                          className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Delete Field"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {fields.filter(f => f.fieldGroupId === group.id).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No fields in this group</p>
                  )}
                </div>
              )}
            </div>
            );
          })}

          {fieldGroups.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No field groups yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Click "Add Group" to create your first field group</p>
            </div>
          )}
        </div>
        )}
      </div>

      {fields.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <button
            onClick={() => toggleSectionCollapse('formLayout')}
            className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center space-x-3">
              {collapsedSections.formLayout ? (
                <ChevronRight className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Form Layout</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Changes are automatically saved
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {layoutSaveStatus === 'saving' && (
                <div className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </div>
              )}
              {layoutSaveStatus === 'saved' && (
                <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  <span>Saved</span>
                </div>
              )}
              {layoutSaveStatus === 'error' && (
                <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>Error saving</span>
                </div>
              )}
            </div>
          </button>
          {!collapsedSections.formLayout && (
            <div className="mt-4">
              <LayoutDesigner
                fields={fields}
                fieldGroups={fieldGroups}
                layouts={fieldLayouts}
                onLayoutChange={handleLayoutChange}
              />
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <button
          onClick={() => toggleSectionCollapse('jsonSchema')}
          className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <div className="flex items-center space-x-3">
            {collapsedSections.jsonSchema ? (
              <ChevronRight className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-500" />
            )}
            <div className="text-left">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">JSON Schema Management</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload and manage API response schemas
              </p>
            </div>
          </div>
        </button>
        {!collapsedSections.jsonSchema && (
          <div className="mt-4">
            <JsonSchemaManager />
          </div>
        )}
      </div>

      {showGroupModal && editingGroup && (
        <FieldGroupModal
          group={editingGroup}
          onChange={setEditingGroup}
          onSave={saveFieldGroup}
          onClose={() => {
            setShowGroupModal(false);
            setEditingGroup(null);
          }}
        />
      )}

      {showFieldModal && editingField && (
        <FieldEditModal
          field={editingField}
          onChange={setEditingField}
          onSave={saveField}
          onClose={() => {
            setShowFieldModal(false);
            setEditingField(null);
          }}
        />
      )}

      <FormPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        fields={fields}
        fieldGroups={fieldGroups}
        layouts={fieldLayouts}
      />

      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        shortcuts={shortcuts}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
    </div>
  );
}

interface FieldGroupModalProps {
  group: OrderEntryFieldGroup;
  onChange: (group: OrderEntryFieldGroup) => void;
  onSave: () => void;
  onClose: () => void;
}

function FieldGroupModal({ group, onChange, onSave, onClose }: FieldGroupModalProps) {
  const [activeSchema, setActiveSchema] = useState<any>(null);
  const [showArrayPathSuggestions, setShowArrayPathSuggestions] = useState(false);
  const [arrayPathFilter, setArrayPathFilter] = useState('');

  useEffect(() => {
    loadActiveSchema();
  }, []);

  const loadActiveSchema = async () => {
    try {
      const { data, error } = await supabase
        .from('order_entry_json_schemas')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setActiveSchema({
          fieldPaths: Array.isArray(data.field_paths) ? data.field_paths : []
        });
      }
    } catch (err) {
      console.error('Failed to load active schema:', err);
    }
  };

  const filteredArrayPaths = activeSchema?.fieldPaths
    .filter((path: string) => path.includes('[]'))
    .filter((path: string) =>
      path.toLowerCase().includes(arrayPathFilter.toLowerCase())
    ) || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {group.id ? 'Edit Field Group' : 'Create Field Group'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Group Name *
            </label>
            <input
              type="text"
              value={group.groupName}
              onChange={(e) => onChange({ ...group, groupName: e.target.value })}
              placeholder="e.g., Shipment Details"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={group.description}
              onChange={(e) => onChange({ ...group, description: e.target.value })}
              placeholder="Optional description for this group"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Background Color
              </label>
              <input
                type="color"
                value={group.backgroundColor}
                onChange={(e) => onChange({ ...group, backgroundColor: e.target.value })}
                className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Border Color
              </label>
              <input
                type="color"
                value={group.borderColor}
                onChange={(e) => onChange({ ...group, borderColor: e.target.value })}
                className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={group.isCollapsible}
                onChange={(e) => onChange({ ...group, isCollapsible: e.target.checked })}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Collapsible</span>
            </label>

            {group.isCollapsible && (
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={group.isExpandedByDefault}
                  onChange={(e) => onChange({ ...group, isExpandedByDefault: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Expanded by Default</span>
              </label>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <label className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={group.isArrayGroup}
                onChange={(e) => onChange({ ...group, isArrayGroup: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Make this an Array Group</span>
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              Array groups display all fields as columns in a multi-row table
            </p>

            {group.isArrayGroup && (
              <div className="space-y-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Min Rows *
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={group.arrayMinRows || 1}
                      onChange={(e) => onChange({ ...group, arrayMinRows: parseInt(e.target.value) || 1 })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Max Rows *
                    </label>
                    <input
                      type="number"
                      min={group.arrayMinRows || 1}
                      value={group.arrayMaxRows || 10}
                      onChange={(e) => onChange({ ...group, arrayMaxRows: parseInt(e.target.value) || 10 })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Array JSON Path *
                    {activeSchema && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        (Autocomplete available from active schema)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={group.arrayJsonPath || ''}
                    onChange={(e) => {
                      onChange({ ...group, arrayJsonPath: e.target.value });
                      setArrayPathFilter(e.target.value);
                      setShowArrayPathSuggestions(true);
                    }}
                    onFocus={() => setShowArrayPathSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowArrayPathSuggestions(false), 200)}
                    placeholder="e.g., orders[details][]"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                  {showArrayPathSuggestions && activeSchema && filteredArrayPaths.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredArrayPaths.slice(0, 20).map((path: string, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onChange({ ...group, arrayJsonPath: path });
                            setShowArrayPathSuggestions(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                        >
                          <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                            {path}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    All fields in this array group must have JSON paths that start with this array path
                  </p>
                </div>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={group.removeIfEmpty || false}
                    onChange={(e) => onChange({ ...group, removeIfEmpty: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Remove If Empty (RIN)</span>
                </label>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  When enabled, rows where the user has not entered any values will be excluded from the API payload. If all rows are empty, the entire array will be omitted.
                </p>
              </div>
            )}
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
            onClick={onSave}
            disabled={!group.groupName.trim() || (group.isArrayGroup && !group.arrayJsonPath?.trim())}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Group
          </button>
        </div>
      </div>
    </div>
  );
}

interface FieldEditModalProps {
  field: OrderEntryField;
  onChange: (field: OrderEntryField) => void;
  onSave: () => void;
  onClose: () => void;
}

function FieldEditModal({ field, onChange, onSave, onClose }: FieldEditModalProps) {
  const [activeSchema, setActiveSchema] = useState<any>(null);
  const [showPathSuggestions, setShowPathSuggestions] = useState(false);
  const [pathFilter, setPathFilter] = useState('');

  useEffect(() => {
    loadActiveSchema();
  }, []);

  const loadActiveSchema = async () => {
    try {
      const { data, error } = await supabase
        .from('order_entry_json_schemas')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setActiveSchema({
          fieldPaths: Array.isArray(data.field_paths) ? data.field_paths : []
        });
      }
    } catch (err) {
      console.error('Failed to load active schema:', err);
    }
  };

  const filteredPaths = activeSchema?.fieldPaths.filter((path: string) =>
    path.toLowerCase().includes(pathFilter.toLowerCase())
  ) || [];

  const fieldTypes: { value: OrderEntryFieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date & Time' },
    { value: 'phone', label: 'Phone' },
    { value: 'zip', label: 'Zip Code (US 5 digits)' },
    { value: 'postal_code', label: 'Postal Code (Canadian)' },
    { value: 'zip_postal', label: 'Zip/Postal Code (US or CA)' },
    { value: 'province', label: 'Province (Canadian)' },
    { value: 'state', label: 'State (US)' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'file', label: 'File Upload' },
    { value: 'boolean', label: 'Checkbox' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <FieldTypeIcon fieldType={field.fieldType} size="md" />
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {field.id ? 'Edit Field' : 'Create Field'}
              </h3>
              {field.id && <FieldTypeBadge fieldType={field.fieldType} />}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Name (Internal) *
              </label>
              <input
                type="text"
                value={field.fieldName}
                onChange={(e) => onChange({ ...field, fieldName: e.target.value })}
                placeholder="e.g., shipper_name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Label (Display) *
              </label>
              <input
                type="text"
                value={field.fieldLabel}
                onChange={(e) => onChange({ ...field, fieldLabel: e.target.value })}
                placeholder="e.g., Shipper Name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Type *
                <HelpTooltip content="Select the type of input field. Text for general text, Number for numeric values, Date for date-only pickers, Date & Time for timestamp fields (DB2), Phone for phone numbers, Dropdown for selection lists, File for uploads, Boolean for checkboxes, and Array for repeating field groups." />
              </label>
              <Select
                value={field.fieldType}
                onValueChange={(value) => onChange({ ...field, fieldType: value as any })}
                options={fieldTypes.map(type => ({
                  value: type.value,
                  label: type.label
                }))}
                searchable={false}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {fieldTypes.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => onChange({ ...field, fieldType: type.value })}
                    className={`px-3 py-2 rounded-lg border-2 transition-all ${
                      field.fieldType === type.value
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <FieldTypeBadge fieldType={type.value} />
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                JSON Path for API
                <HelpTooltip content="Use dot notation (e.g., order.shipper.name) to create nested objects in the API payload. This defines where this field's value will be placed in the JSON structure sent to your API." />
                {activeSchema && (
                  <span className="text-xs text-purple-600 dark:text-purple-400 ml-2">
                    (Autocomplete available from active schema)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={field.jsonPath}
                onChange={(e) => {
                  onChange({ ...field, jsonPath: e.target.value });
                  setPathFilter(e.target.value);
                  setShowPathSuggestions(true);
                }}
                onFocus={() => setShowPathSuggestions(true)}
                onBlur={() => setTimeout(() => setShowPathSuggestions(false), 200)}
                placeholder="e.g., order.shipper.name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
              />
              {showPathSuggestions && activeSchema && filteredPaths.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredPaths.slice(0, 20).map((path: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        onChange({ ...field, jsonPath: path });
                        setShowPathSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex items-center justify-between"
                    >
                      <span>{path}</span>
                      {path.includes('[]') && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                          array
                        </span>
                      )}
                    </button>
                  ))}
                  {filteredPaths.length > 20 && (
                    <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600">
                      +{filteredPaths.length - 20} more paths available
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Placeholder Text
            </label>
            <input
              type="text"
              value={field.placeholder}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              placeholder="Enter placeholder text"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Help Text
            </label>
            <input
              type="text"
              value={field.helpText}
              onChange={(e) => onChange({ ...field, helpText: e.target.value })}
              placeholder="Helper text shown below the field"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
            />
          </div>

          {field.fieldType === 'dropdown' && (
            <div className="space-y-4">
              <Select
                label="Display Mode"
                value={field.dropdownDisplayMode || 'description_only'}
                onValueChange={(value) => onChange({ ...field, dropdownDisplayMode: value as 'description_only' | 'value_and_description' })}
                options={[
                  { value: 'description_only', label: 'Show description only' },
                  { value: 'value_and_description', label: 'Show value and description' }
                ]}
                helpText="Controls how options appear to users in the dropdown"
                searchable={false}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dropdown Options
                </label>
                <div className="space-y-2">
                  {(field.dropdownOptions || []).map((opt: string | DropdownOption, index: number) => {
                    const optValue = typeof opt === 'string' ? opt : opt.value;
                    const optDesc = typeof opt === 'string' ? opt : opt.description;
                    return (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={optValue}
                          onChange={(e) => {
                            const newOptions = [...(field.dropdownOptions || [])];
                            newOptions[index] = { value: e.target.value, description: optDesc };
                            onChange({ ...field, dropdownOptions: newOptions });
                          }}
                          placeholder="Value"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <input
                          type="text"
                          value={optDesc}
                          onChange={(e) => {
                            const newOptions = [...(field.dropdownOptions || [])];
                            newOptions[index] = { value: optValue, description: e.target.value };
                            onChange({ ...field, dropdownOptions: newOptions });
                          }}
                          placeholder="Description"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newOptions = (field.dropdownOptions || []).filter((_: string | DropdownOption, i: number) => i !== index);
                            onChange({ ...field, dropdownOptions: newOptions });
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = [...(field.dropdownOptions || []), { value: '', description: '' }];
                      onChange({ ...field, dropdownOptions: newOptions });
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Add Option
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Value is sent to the API. Description is what users see.</p>
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              AI Extraction Instructions
              <HelpTooltip content="Provide specific guidance to help AI extract this field correctly from PDF documents. Be detailed and specific (e.g., 'Extract the shipper company name from the top left of the document, typically in bold text')." />
            </label>
            <textarea
              value={field.aiExtractionInstructions}
              onChange={(e) => onChange({ ...field, aiExtractionInstructions: e.target.value })}
              placeholder="Instructions for AI to extract this field from PDFs"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Provide specific instructions to help AI extract this field accurately
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {(field.fieldType === 'text' || field.fieldType === 'number') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Length
                </label>
                <input
                  type="number"
                  value={field.maxLength || ''}
                  onChange={(e) => onChange({ ...field, maxLength: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="No limit"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Value
              </label>
              <input
                type="text"
                value={field.defaultValue}
                onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
                placeholder="Optional"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.isRequired}
                  onChange={(e) => onChange({ ...field, isRequired: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
                <HelpTooltip content="User must fill this field before submitting the form. Validation will prevent form submission if this field is empty." />
              </label>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={field.isArrayField}
                onChange={(e) => onChange({ ...field, isArrayField: e.target.checked })}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-2"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Array Field (Multiple Rows)</span>
              <HelpTooltip content="Allows users to add multiple rows of this field. Perfect for line items, products, or any repeating data structure. Users can dynamically add and remove rows." />
            </label>

            {field.isArrayField && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Minimum Rows
                  </label>
                  <input
                    type="number"
                    value={field.arrayMinRows}
                    onChange={(e) => onChange({ ...field, arrayMinRows: parseInt(e.target.value) || 1 })}
                    min="1"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Maximum Rows
                  </label>
                  <input
                    type="number"
                    value={field.arrayMaxRows}
                    onChange={(e) => onChange({ ...field, arrayMaxRows: parseInt(e.target.value) || 10 })}
                    min={field.arrayMinRows}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                  />
                </div>
              </div>
            )}
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
            onClick={onSave}
            disabled={!field.fieldName.trim() || !field.fieldLabel.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Field
          </button>
        </div>
      </div>
    </div>
  );
}
