import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Pencil as Edit2, GripVertical, ChevronDown, ChevronRight, Loader2, AlertCircle, Play, ChevronsDown, ChevronsRight, FolderOpen, GitBranch, Settings, ZoomIn, Save, Copy, QrCode, Link, Check, Download, Upload, Filter, X, ClipboardList, FileText, Search, Smartphone } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';
import ConfigChangeLogsModal, { logConfigChange } from '../common/ConfigChangeLogsModal';
import QRCode from 'qrcode';
import type { User } from '../../types';
import FieldTypeIcon, { FieldTypeBadge } from '../common/FieldTypeIcon';
import { useToast } from '../../hooks/useToast';
import ToastContainer from '../common/ToastContainer';
import { FormSkeleton } from '../common/Skeleton';
import ExecuteButtonStepsSection from './ExecuteButtonStepsSection';
import FlowDesigner from './flow/FlowDesigner';
import ExecuteButtonImportModal from './ExecuteButtonImportModal';
import CustomDropdown from '../common/CustomDropdown';
import { exportButton, downloadExport } from '../../services/executeButtonExportService';

interface ButtonCategory {
  id: string;
  name: string;
  displayOrder: number;
}

interface ExecuteButton {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  categoryIds?: string[];
  qrCodeEnabled?: boolean;
  qrCodeSlug?: string | null;
  visibleInMobile?: boolean;
}

interface ExecuteButtonGroup {
  id: string;
  buttonId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isArrayGroup: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  arrayFieldName: string;
  translations?: Record<string, { name?: string; description?: string }> | null;
  createdAt: string;
  updatedAt: string;
}

interface DropdownOptionVisibilityRule {
  dependsOnField: string;
  showWhenValues: string[];
}

interface DropdownOptionItem {
  value: string;
  description: string;
  visibilityRules?: DropdownOptionVisibilityRule[];
}

interface ExecuteButtonField {
  id: string;
  groupId: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue: string | null;
  options: DropdownOptionItem[];
  dropdownDisplayMode: 'description_only' | 'value_and_description';
  sortOrder: number;
  placeholder: string | null;
  helpText: string | null;
  maxLength: number | null;
  timeInputOnly: boolean;
  conditionalRequiredFieldId: string | null;
  conditionalRequiredOperator: string | null;
  conditionalRequiredValue: string | null;
  translations?: Record<string, { name?: string; placeholder?: string; helpText?: string }> | null;
  apiLookupEndpoint?: string | null;
  apiLookupSecondaryApiId?: string | null;
  apiLookupSpecId?: string | null;
  apiLookupHttpMethod?: string | null;
  apiLookupSearchParam?: string | null;
  apiLookupValueField?: string | null;
  apiLookupDisplayColumns?: { field: string; label: string }[] | null;
  apiLookupFieldMappings?: { responseField: string; targetFieldName: string }[] | null;
  apiLookupRequestBody?: string | null;
  apiLookupRequestBodyMappings?: { fieldName: string; type: 'hardcoded' | 'variable' | 'search'; value: string; dataType?: string }[] | null;
  apiLookupWrapBodyInArray?: boolean;
  createdAt: string;
  updatedAt: string;
}

type ExecuteFieldType = 'text' | 'number' | 'decimal' | 'date' | 'datetime' | 'phone' | 'zip' | 'postal_code' | 'province' | 'state' | 'dropdown' | 'email' | 'checkbox' | 'time' | 'api_lookup';

export default function ExecuteSetupSettings({ isAdmin = true, currentUser }: { isAdmin?: boolean; currentUser?: User }) {
  const [loading, setLoading] = useState(true);
  const [buttons, setButtons] = useState<ExecuteButton[]>([]);
  const [categories, setCategories] = useState<ButtonCategory[]>([]);
  const [selectedButtonId, setSelectedButtonId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ExecuteButtonGroup[]>([]);
  const [fields, setFields] = useState<ExecuteButtonField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showFlowDesigner, setShowFlowDesigner] = useState(false);
  const [showFieldDeleteModal, setShowFieldDeleteModal] = useState(false);
  const [showGroupDeleteModal, setShowGroupDeleteModal] = useState(false);
  const [showDisplayPrefsModal, setShowDisplayPrefsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCopyGroupModal, setShowCopyGroupModal] = useState(false);
  const [copyGroupSource, setCopyGroupSource] = useState<ExecuteButtonGroup | null>(null);
  const [copyGroupTargetButtonId, setCopyGroupTargetButtonId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [defaultFlowZoom, setDefaultFlowZoom] = useState(75);

  const [editingButton, setEditingButton] = useState<Partial<ExecuteButton> | null>(null);
  const [editingGroup, setEditingGroup] = useState<Partial<ExecuteButtonGroup> | null>(null);
  const [editingField, setEditingField] = useState<Partial<ExecuteButtonField> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<ButtonCategory> | null>(null);
  const [buttonToDelete, setButtonToDelete] = useState<ExecuteButton | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<ExecuteButtonField | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<{ group: ExecuteButtonGroup; fieldCount: number } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [showChangeLogs, setShowChangeLogs] = useState(false);
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadButtons();
    loadCategories();
    loadGlobalSettings();
  }, []);

  useEffect(() => {
    if (selectedButtonId) {
      loadButtonData(selectedButtonId).then((groupsData) => {
        setCollapsedGroups(new Set(groupsData.map((g: ExecuteButtonGroup) => g.id)));
      });
    } else {
      setGroups([]);
      setFields([]);
    }
  }, [selectedButtonId]);

  const loadButtons = async () => {
    try {
      setLoading(true);
      const [buttonsRes, assignmentsRes] = await Promise.all([
        supabase
          .from('execute_buttons')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('execute_button_category_assignments')
          .select('button_id, category_id')
      ]);

      if (buttonsRes.error) throw buttonsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      const assignmentsByButton: Record<string, string[]> = {};
      (assignmentsRes.data || []).forEach((a: any) => {
        if (!assignmentsByButton[a.button_id]) {
          assignmentsByButton[a.button_id] = [];
        }
        assignmentsByButton[a.button_id].push(a.category_id);
      });

      const buttonsData: ExecuteButton[] = (buttonsRes.data || []).map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        sortOrder: b.sort_order,
        isActive: b.is_active,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
        categoryIds: assignmentsByButton[b.id] || [],
        qrCodeEnabled: b.qr_code_enabled || false,
        qrCodeSlug: b.qr_code_slug,
        visibleInMobile: b.visible_in_mobile || false
      }));

      setButtons(buttonsData);

      if (buttonsData.length > 0 && !selectedButtonId) {
        setSelectedButtonId(buttonsData[0].id);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load execute buttons');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('execute_button_categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      const categoriesData: ButtonCategory[] = (data || []).map(c => ({
        id: c.id,
        name: c.name,
        displayOrder: c.display_order
      }));

      setCategories(categoriesData);
    } catch (err: any) {
      toast.error('Failed to load categories');
    }
  };

  const loadGlobalSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('execute_button_global_settings')
        .select('default_flow_zoom')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setDefaultFlowZoom(data.default_flow_zoom);
      }
    } catch (err: any) {
      console.error('Failed to load global settings:', err);
    }
  };

  const saveGlobalSettings = async (zoom: number) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('execute_button_global_settings')
        .upsert({
          id: 1,
          default_flow_zoom: zoom,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setDefaultFlowZoom(zoom);
      toast.success('Display preferences saved');
      setShowDisplayPrefsModal(false);
    } catch (err: any) {
      toast.error('Failed to save display preferences: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const loadButtonData = async (buttonId: string) => {
    try {
      const [groupsRes, fieldsRes] = await Promise.all([
        supabase
          .from('execute_button_groups')
          .select('*')
          .eq('button_id', buttonId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('execute_button_fields')
          .select('*')
          .order('sort_order', { ascending: true })
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;

      const groupsData = (groupsRes.data || []).map((g: any) => ({
        id: g.id,
        buttonId: g.button_id,
        name: g.name,
        description: g.description,
        sortOrder: g.sort_order,
        isArrayGroup: g.is_array_group || false,
        arrayMinRows: g.array_min_rows || 1,
        arrayMaxRows: g.array_max_rows || 10,
        arrayFieldName: g.array_field_name || '',
        translations: g.translations || null,
        createdAt: g.created_at,
        updatedAt: g.updated_at
      }));

      const groupIds = groupsData.map(g => g.id);
      const fieldsData = (fieldsRes.data || [])
        .filter((f: any) => groupIds.includes(f.group_id))
        .map((f: any) => {
          const rawOptions = f.options || [];
          const normalizedOptions: DropdownOptionItem[] = rawOptions.map((opt: any) => {
            if (typeof opt === 'string') {
              return { value: opt, description: opt };
            }
            return { value: opt.value || '', description: opt.description || opt.value || '', visibilityRules: opt.visibilityRules };
          });
          return {
            id: f.id,
            groupId: f.group_id,
            name: f.name,
            fieldKey: f.field_key,
            fieldType: f.field_type,
            isRequired: f.is_required,
            defaultValue: f.default_value,
            options: normalizedOptions,
            dropdownDisplayMode: f.dropdown_display_mode || 'description_only',
            sortOrder: f.sort_order,
            placeholder: f.placeholder,
            helpText: f.help_text,
            maxLength: f.max_length,
            timeInputOnly: f.time_input_only || false,
            conditionalRequiredFieldId: f.conditional_required_field_id || null,
            conditionalRequiredOperator: f.conditional_required_operator || null,
            conditionalRequiredValue: f.conditional_required_value || null,
            translations: f.translations || null,
            apiLookupEndpoint: f.api_lookup_endpoint || null,
            apiLookupSecondaryApiId: f.api_lookup_secondary_api_id || null,
            apiLookupSpecId: f.api_lookup_spec_id || null,
            apiLookupHttpMethod: f.api_lookup_http_method || 'GET',
            apiLookupSearchParam: f.api_lookup_search_param || null,
            apiLookupValueField: f.api_lookup_value_field || null,
            apiLookupDisplayColumns: f.api_lookup_display_columns || null,
            apiLookupFieldMappings: f.api_lookup_field_mappings || null,
            apiLookupRequestBody: f.api_lookup_request_body || null,
            apiLookupRequestBodyMappings: f.api_lookup_request_body_mappings || null,
            apiLookupWrapBodyInArray: f.api_lookup_wrap_body_in_array || false,
            createdAt: f.created_at,
            updatedAt: f.updated_at
          };
        });

      setGroups(groupsData);
      setFields(fieldsData);
      return groupsData;
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load button data');
      return [];
    }
  };

  const handleCreateButton = async () => {
    if (!editingButton?.name?.trim()) {
      toast.error('Button name is required');
      return;
    }

    setIsSaving(true);
    try {
      const qrSlug = (editingButton.qrCodeEnabled || editingButton.visibleInMobile) ? crypto.randomUUID() : null;

      const { data, error } = await supabase
        .from('execute_buttons')
        .insert([{
          name: editingButton.name.trim(),
          description: editingButton.description?.trim() || null,
          sort_order: buttons.length,
          is_active: editingButton.isActive ?? true,
          qr_code_enabled: editingButton.qrCodeEnabled || false,
          qr_code_slug: qrSlug,
          visible_in_mobile: editingButton.visibleInMobile || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      if (editingButton.categoryIds && editingButton.categoryIds.length > 0) {
        const assignments = editingButton.categoryIds.map(categoryId => ({
          button_id: data.id,
          category_id: categoryId
        }));
        await supabase.from('execute_button_category_assignments').insert(assignments);
      }

      toast.success('Button created successfully');
      if (currentUser) logConfigChange('execute', `Created button: ${editingButton.name.trim()}`, currentUser.id, currentUser.username);
      setShowCreateModal(false);
      setEditingButton(null);
      await loadButtons();
      setSelectedButtonId(data.id);
    } catch (err: any) {
      toast.error('Failed to create button: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateButton = async () => {
    if (!editingButton?.id || !editingButton?.name?.trim()) {
      toast.error('Button name is required');
      return;
    }

    setIsSaving(true);
    try {
      let qrSlug = editingButton.qrCodeSlug;
      const needsSlug = editingButton.qrCodeEnabled || editingButton.visibleInMobile;
      if (needsSlug && !qrSlug) {
        qrSlug = crypto.randomUUID();
      } else if (!needsSlug) {
        qrSlug = null;
      }

      const { error } = await supabase
        .from('execute_buttons')
        .update({
          name: editingButton.name.trim(),
          description: editingButton.description?.trim() || null,
          is_active: editingButton.isActive ?? true,
          qr_code_enabled: editingButton.qrCodeEnabled || false,
          qr_code_slug: qrSlug,
          visible_in_mobile: editingButton.visibleInMobile || false,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingButton.id);

      if (error) throw error;

      await supabase
        .from('execute_button_category_assignments')
        .delete()
        .eq('button_id', editingButton.id);

      if (editingButton.categoryIds && editingButton.categoryIds.length > 0) {
        const assignments = editingButton.categoryIds.map(categoryId => ({
          button_id: editingButton.id,
          category_id: categoryId
        }));
        await supabase.from('execute_button_category_assignments').insert(assignments);
      }

      toast.success('Button updated successfully');
      if (currentUser) logConfigChange('execute', `Updated button: ${editingButton.name!.trim()}`, currentUser.id, currentUser.username);
      setShowEditModal(false);
      setEditingButton(null);
      await loadButtons();
    } catch (err: any) {
      toast.error('Failed to update button: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory?.name?.trim()) {
      toast.error('Category name is required');
      return;
    }

    setIsSaving(true);
    try {
      const categoryData = {
        name: editingCategory.name.trim(),
        display_order: editingCategory.displayOrder ?? categories.length,
        updated_at: new Date().toISOString()
      };

      if (editingCategory.id) {
        const { error } = await supabase
          .from('execute_button_categories')
          .update(categoryData)
          .eq('id', editingCategory.id);
        if (error) throw error;
      } else {
        const { data: newCat, error } = await supabase
          .from('execute_button_categories')
          .insert([{ ...categoryData, created_at: new Date().toISOString() }])
          .select()
          .single();
        if (error) throw error;

        if (newCat) {
          const { data: adminUsers } = await supabase
            .from('users')
            .select('id')
            .eq('is_admin', true);
          if (adminUsers && adminUsers.length > 0) {
            await supabase.from('user_execute_category_access').insert(
              adminUsers.map(u => ({ user_id: u.id, category_id: newCat.id }))
            );
          }
        }
      }

      toast.success(editingCategory.id ? 'Category updated' : 'Category created');
      if (currentUser) logConfigChange('execute', `${editingCategory.id ? 'Updated' : 'Created'} category: ${editingCategory.name!.trim()}`, currentUser.id, currentUser.username);
      setShowCategoryModal(false);
      setEditingCategory(null);
      await loadCategories();
    } catch (err: any) {
      toast.error('Failed to save category: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Delete this category? Buttons will be unassigned from this category.')) return;

    try {
      const { error } = await supabase
        .from('execute_button_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      toast.success('Category deleted');
      await loadCategories();
    } catch (err: any) {
      toast.error('Failed to delete category: ' + err.message);
    }
  };

  const handleDeleteButton = async () => {
    if (!buttonToDelete) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('execute_buttons')
        .delete()
        .eq('id', buttonToDelete.id);

      if (error) throw error;

      toast.success('Button deleted successfully');
      setShowDeleteModal(false);
      setButtonToDelete(null);

      if (selectedButtonId === buttonToDelete.id) {
        setSelectedButtonId(null);
      }

      await loadButtons();
    } catch (err: any) {
      toast.error('Failed to delete button: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGroup = async () => {
    if (!editingGroup?.name?.trim() || !selectedButtonId) {
      toast.error('Group name is required');
      return;
    }

    setIsSaving(true);
    try {
      const groupData = {
        button_id: selectedButtonId,
        name: editingGroup.name.trim(),
        description: editingGroup.description || null,
        sort_order: editingGroup.sortOrder || groups.length,
        is_array_group: editingGroup.isArrayGroup || false,
        array_min_rows: editingGroup.arrayMinRows || 1,
        array_max_rows: editingGroup.arrayMaxRows || 10,
        array_field_name: editingGroup.arrayFieldName || null,
        translations: editingGroup.translations || null,
        updated_at: new Date().toISOString()
      };

      if (editingGroup.id) {
        const { error } = await supabase
          .from('execute_button_groups')
          .update(groupData)
          .eq('id', editingGroup.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('execute_button_groups')
          .insert([{ ...groupData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      toast.success(editingGroup.id ? 'Group updated' : 'Group created');
      if (currentUser) logConfigChange('execute', `${editingGroup.id ? 'Updated' : 'Created'} group: ${editingGroup.name!.trim()}`, currentUser.id, currentUser.username);
      setShowGroupModal(false);
      setEditingGroup(null);
      await loadButtonData(selectedButtonId);
    } catch (err: any) {
      toast.error('Failed to save group: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const fieldCount = fields.filter(f => f.groupId === groupId).length;
    setGroupToDelete({ group, fieldCount });
    setShowGroupDeleteModal(true);
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('execute_button_groups')
        .delete()
        .eq('id', groupToDelete.group.id);

      if (error) throw error;

      toast.success('Group deleted');
      setShowGroupDeleteModal(false);
      setGroupToDelete(null);
      if (selectedButtonId) {
        await loadButtonData(selectedButtonId);
      }
    } catch (err: any) {
      toast.error('Failed to delete group: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCopyGroupModal = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    setCopyGroupSource(group);
    setCopyGroupTargetButtonId(selectedButtonId);
    setShowCopyGroupModal(true);
  };

  const handleCopyGroup = async () => {
    if (!copyGroupSource || !copyGroupTargetButtonId) return;

    setIsSaving(true);
    try {
      const targetButton = buttons.find(b => b.id === copyGroupTargetButtonId);
      const targetButtonName = targetButton?.name || 'target button';

      const { data: targetGroups, error: targetGroupsError } = await supabase
        .from('execute_button_groups')
        .select('id')
        .eq('button_id', copyGroupTargetButtonId);

      if (targetGroupsError) throw targetGroupsError;

      const sortOrder = targetGroups?.length || 0;
      const newGroupName = `${copyGroupSource.name} (Copy)`;

      const { data: newGroup, error: groupError } = await supabase
        .from('execute_button_groups')
        .insert([{
          button_id: copyGroupTargetButtonId,
          name: newGroupName,
          description: copyGroupSource.description,
          sort_order: sortOrder,
          is_array_group: copyGroupSource.isArrayGroup || false,
          array_min_rows: copyGroupSource.arrayMinRows || 1,
          array_max_rows: copyGroupSource.arrayMaxRows || 10,
          array_field_name: copyGroupSource.arrayFieldName || null,
          translations: copyGroupSource.translations || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (groupError) throw groupError;

      const groupFields = fields.filter(f => f.groupId === copyGroupSource.id);
      if (groupFields.length > 0) {
        const fieldInserts = groupFields.map((field, index) => ({
          group_id: newGroup.id,
          name: field.name,
          field_key: field.fieldKey,
          field_type: field.fieldType,
          is_required: field.isRequired,
          default_value: field.defaultValue,
          options: field.options,
          sort_order: index,
          placeholder: field.placeholder,
          help_text: field.helpText,
          max_length: field.maxLength,
          time_input_only: field.timeInputOnly || false,
          translations: field.translations || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: fieldsError } = await supabase
          .from('execute_button_fields')
          .insert(fieldInserts);

        if (fieldsError) throw fieldsError;
      }

      toast.success(`Group "${copyGroupSource.name}" copied to "${targetButtonName}"`);
      setShowCopyGroupModal(false);
      setCopyGroupSource(null);

      if (copyGroupTargetButtonId === selectedButtonId) {
        await loadButtonData(selectedButtonId);
      }
    } catch (err: any) {
      toast.error('Failed to copy group: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveField = async () => {
    if (!editingField?.name?.trim() || !editingField?.fieldKey?.trim() || !selectedButtonId) {
      toast.error('Field name and key are required');
      return;
    }

    setIsSaving(true);
    try {
      const cleanedOptions = (editingField.options || [])
        .filter((o: DropdownOptionItem) => o.value.trim().length > 0)
        .map((o: DropdownOptionItem) => ({ value: o.value.trim(), description: o.description.trim(), visibilityRules: o.visibilityRules }));

      const fieldData = {
        group_id: editingField.groupId,
        name: editingField.name.trim(),
        field_key: editingField.fieldKey.trim(),
        field_type: editingField.fieldType || 'text',
        is_required: editingField.isRequired || false,
        default_value: editingField.defaultValue || null,
        options: cleanedOptions,
        dropdown_display_mode: editingField.dropdownDisplayMode || 'description_only',
        sort_order: editingField.sortOrder || fields.filter(f => f.groupId === editingField.groupId).length,
        placeholder: editingField.placeholder || null,
        help_text: editingField.helpText || null,
        max_length: (editingField.fieldType === 'text' || editingField.fieldType === 'email') && editingField.maxLength ? editingField.maxLength : null,
        time_input_only: editingField.fieldType === 'datetime' ? (editingField.timeInputOnly || false) : false,
        conditional_required_field_id: editingField.conditionalRequiredFieldId || null,
        conditional_required_operator: editingField.conditionalRequiredOperator || null,
        conditional_required_value: editingField.conditionalRequiredValue || null,
        translations: editingField.translations || null,
        api_lookup_endpoint: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupEndpoint || null) : null,
        api_lookup_secondary_api_id: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupSecondaryApiId || null) : null,
        api_lookup_spec_id: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupSpecId || null) : null,
        api_lookup_http_method: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupHttpMethod || 'GET') : null,
        api_lookup_search_param: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupSearchParam || null) : null,
        api_lookup_value_field: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupValueField || null) : null,
        api_lookup_display_columns: editingField.fieldType === 'api_lookup' && editingField.apiLookupDisplayColumns?.length ? editingField.apiLookupDisplayColumns : null,
        api_lookup_field_mappings: editingField.fieldType === 'api_lookup' && editingField.apiLookupFieldMappings?.length ? editingField.apiLookupFieldMappings : null,
        api_lookup_request_body: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupRequestBody || null) : null,
        api_lookup_request_body_mappings: editingField.fieldType === 'api_lookup' && editingField.apiLookupRequestBodyMappings?.length ? editingField.apiLookupRequestBodyMappings : null,
        api_lookup_wrap_body_in_array: editingField.fieldType === 'api_lookup' ? (editingField.apiLookupWrapBodyInArray || false) : false,
        updated_at: new Date().toISOString()
      };

      if (editingField.id) {
        const { error } = await supabase
          .from('execute_button_fields')
          .update(fieldData)
          .eq('id', editingField.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('execute_button_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      toast.success(editingField.id ? 'Field updated' : 'Field created');
      if (currentUser) logConfigChange('execute', `${editingField.id ? 'Updated' : 'Created'} field: ${editingField.name!.trim()}`, currentUser.id, currentUser.username);
      setShowFieldModal(false);
      setEditingField(null);
      await loadButtonData(selectedButtonId);
    } catch (err: any) {
      toast.error('Failed to save field: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async () => {
    if (!fieldToDelete) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('execute_button_fields')
        .delete()
        .eq('id', fieldToDelete.id);

      if (error) throw error;

      setFields(prev => prev.filter(f => f.id !== fieldToDelete.id));
      toast.success('Field deleted');
      setShowFieldDeleteModal(false);
      setFieldToDelete(null);
    } catch (err: any) {
      toast.error('Failed to delete field: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldDragEnd = async (event: DragEndEvent, groupId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const groupFields = fields.filter(f => f.groupId === groupId);
    const oldIndex = groupFields.findIndex(f => f.id === active.id);
    const newIndex = groupFields.findIndex(f => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFields = arrayMove(groupFields, oldIndex, newIndex);
    const otherFields = fields.filter(f => f.groupId !== groupId);
    setFields([...otherFields, ...reorderedFields.map((f, i) => ({ ...f, sortOrder: i }))]);

    try {
      const updates = reorderedFields.map((field, index) => ({
        id: field.id,
        sort_order: index
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('execute_button_fields')
          .update({ sort_order: update.sort_order, updated_at: new Date().toISOString() })
          .eq('id', update.id);
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error('Failed to reorder fields: ' + err.message);
      if (selectedButtonId) {
        await loadButtonData(selectedButtonId);
      }
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
    setCollapsedGroups(new Set(groups.map(g => g.id)));
  };

  const expandAllGroups = () => {
    setCollapsedGroups(new Set());
  };

  const handleExportButton = async (buttonId: string, buttonName: string) => {
    setIsExporting(true);
    try {
      const data = await exportButton(buttonId);
      const safeName = buttonName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      downloadExport(data, `${safeName}_export.json`);
      toast.success('Button exported successfully');
      if (currentUser) logConfigChange('execute', `Exported button: ${buttonName}`, currentUser.id, currentUser.username);
    } catch (err: any) {
      toast.error('Failed to export: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedButton = buttons.find(b => b.id === selectedButtonId);

  if (loading) {
    return <FormSkeleton fields={6} />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Button Categories</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Organize buttons into categories for filtering on the Execute page
            </p>
          </div>
          <button
            onClick={() => {
              setEditingCategory({ name: '', displayOrder: categories.length });
              setShowCategoryModal(true);
            }}
            disabled={!isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </button>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <FolderOpen className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">No categories yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Add a category to organize buttons
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <div
                key={category.id}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg group"
              >
                <FolderOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {category.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({buttons.filter(b => b.categoryIds?.includes(category.id)).length})
                </span>
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingCategory(category);
                        setShowCategoryModal(true);
                      }}
                      className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category.id)}
                      className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Execute Buttons</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Create buttons with multi-step parameter forms for users to execute
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              disabled={!isAdmin}
              title={!isAdmin ? 'Admin access required' : 'Import button from file'}
              className="flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            <button
              onClick={() => {
                setEditingButton({ name: '', description: '', isActive: true });
                setShowCreateModal(true);
              }}
              disabled={!isAdmin}
              title={!isAdmin ? 'Admin access required' : undefined}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Button
            </button>
          </div>
        </div>

        {buttons.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <Play className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No execute buttons yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Create a button to get started
            </p>
          </div>
        ) : (
          <div className="flex items-center space-x-4 mb-6">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Button:
            </label>
            <div className="flex-1 max-w-md">
              <Select
                value={selectedButtonId || ''}
                onValueChange={setSelectedButtonId}
                options={buttons.map(b => ({
                  value: b.id,
                  label: `${b.name}${b.isActive ? '' : ' (Inactive)'}`
                }))}
                searchable
              />
            </div>
            {selectedButton && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowFlowDesigner(true)}
                  className="flex items-center px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  title="Open Flow Designer"
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Flow Designer
                </button>
                <button
                  onClick={() => setShowDisplayPrefsModal(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 rounded-lg transition-colors"
                  title="Display Preferences"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowChangeLogs(true)}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 rounded-lg transition-colors"
                  title={`View logs for ${selectedButton.name}`}
                >
                  <ClipboardList className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleExportButton(selectedButton.id, selectedButton.name)}
                  disabled={isExporting}
                  className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 rounded-lg transition-colors disabled:opacity-50"
                  title="Export button configuration"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setEditingButton(selectedButton);
                        setShowEditModal(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Edit button"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setButtonToDelete(selectedButton);
                        setShowDeleteModal(true);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Delete button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedButton && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                Groups/Pages - {selectedButton.name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedButton.description || 'Configure parameter groups for this button'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={collapseAllGroups}
                className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <ChevronsRight className="h-4 w-4 mr-2" />
                Collapse All
              </button>
              <button
                onClick={expandAllGroups}
                className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <ChevronsDown className="h-4 w-4 mr-2" />
                Expand All
              </button>
              <button
                onClick={() => {
                  setEditingGroup({
                    name: '',
                    sortOrder: groups.length,
                    isArrayGroup: false,
                    arrayMinRows: 1,
                    arrayMaxRows: 10,
                    arrayFieldName: ''
                  });
                  setShowGroupModal(true);
                }}
                disabled={!isAdmin}
                title={!isAdmin ? 'Admin access required' : undefined}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Group
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {groups.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <p className="text-gray-600 dark:text-gray-400">No groups yet</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                  Add a group to start building the parameter form
                </p>
              </div>
            ) : (
              groups.map((group, index) => {
                const isCollapsed = collapsedGroups.has(group.id);
                const groupFields = fields.filter(f => f.groupId === group.id);

                return (
                  <div
                    key={group.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start space-x-3 flex-1">
                        <GripVertical className="h-5 w-5 text-gray-400 mt-1 cursor-move" />
                        <button
                          onClick={() => toggleGroupCollapse(group.id)}
                          className="flex items-center space-x-2 text-left hover:opacity-70 transition-opacity"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-5 w-5 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                Page {index + 1}
                              </span>
                              <h4 className="font-medium text-gray-900 dark:text-gray-100">{group.name}</h4>
                              {group.isArrayGroup && (
                                <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                                  Array: {group.arrayFieldName}
                                </span>
                              )}
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                                {groupFields.length} {groupFields.length === 1 ? 'field' : 'fields'}
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
                          onClick={() => {
                            setEditingField({
                              groupId: group.id,
                              name: '',
                              fieldKey: '',
                              fieldType: 'text',
                              isRequired: false,
                              options: [],
                              sortOrder: groupFields.length
                            });
                            setShowFieldModal(true);
                          }}
                          className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                          title="Add Field"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenCopyGroupModal(group.id)}
                          disabled={isSaving}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                          title="Copy Group"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingGroup(group);
                            setShowGroupModal(true);
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Edit Group"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete Group"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-2 ml-8">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleFieldDragEnd(event, group.id)}
                        >
                          <SortableContext
                            items={groupFields.map(f => f.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {groupFields.map(field => (
                              <SortableFieldRow
                                key={field.id}
                                field={field}
                                onEdit={() => {
                                  setEditingField(field);
                                  setShowFieldModal(true);
                                }}
                                onCopy={() => {
                                  setEditingField({
                                    ...field,
                                    id: '',
                                    name: `${field.name} (Copy)`,
                                    fieldKey: `${field.fieldKey}_copy`,
                                  });
                                  setShowFieldModal(true);
                                }}
                                onDelete={() => {
                                  setFieldToDelete(field);
                                  setShowFieldDeleteModal(true);
                                }}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                        {groupFields.length === 0 && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No fields in this group</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {selectedButton && (
        <ExecuteButtonStepsSection
          buttonId={selectedButton.id}
          buttonName={selectedButton.name}
          fields={fields}
          onError={(message) => toast.error(message)}
          onSuccess={(message) => toast.success(message)}
        />
      )}

      {showCreateModal && createPortal(
        <ButtonModal
          title="Create New Button"
          button={editingButton}
          onChange={setEditingButton}
          onSave={handleCreateButton}
          onClose={() => { setShowCreateModal(false); setEditingButton(null); }}
          isSaving={isSaving}
          categories={categories}
        />,
        document.body
      )}

      {showEditModal && createPortal(
        <ButtonModal
          title="Edit Button"
          button={editingButton}
          onChange={setEditingButton}
          onSave={handleUpdateButton}
          onClose={() => { setShowEditModal(false); setEditingButton(null); }}
          isSaving={isSaving}
          categories={categories}
        />,
        document.body
      )}

      {showCategoryModal && createPortal(
        <CategoryModal
          category={editingCategory}
          onChange={setEditingCategory}
          onSave={handleSaveCategory}
          onClose={() => { setShowCategoryModal(false); setEditingCategory(null); }}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showDeleteModal && buttonToDelete && createPortal(
        <DeleteConfirmModal
          buttonName={buttonToDelete.name}
          onConfirm={handleDeleteButton}
          onClose={() => { setShowDeleteModal(false); setButtonToDelete(null); }}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showGroupModal && createPortal(
        <GroupModal
          group={editingGroup}
          onChange={setEditingGroup}
          onSave={handleSaveGroup}
          onClose={() => { setShowGroupModal(false); setEditingGroup(null); }}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showFieldModal && createPortal(
        <FieldModal
          field={editingField}
          onChange={setEditingField}
          onSave={handleSaveField}
          onClose={() => { setShowFieldModal(false); setEditingField(null); }}
          isSaving={isSaving}
          allFields={fields}
        />,
        document.body
      )}

      {showFieldDeleteModal && fieldToDelete && createPortal(
        <FieldDeleteConfirmModal
          fieldName={fieldToDelete.name}
          onConfirm={handleDeleteField}
          onClose={() => { setShowFieldDeleteModal(false); setFieldToDelete(null); }}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showGroupDeleteModal && groupToDelete && createPortal(
        <GroupDeleteConfirmModal
          groupName={groupToDelete.group.name}
          fieldCount={groupToDelete.fieldCount}
          onConfirm={confirmDeleteGroup}
          onClose={() => { setShowGroupDeleteModal(false); setGroupToDelete(null); }}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showCopyGroupModal && copyGroupSource && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Copy Group</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Copying "{copyGroupSource.name}"
                </p>
              </div>
              <button
                onClick={() => { setShowCopyGroupModal(false); setCopyGroupSource(null); }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Destination Button
                </label>
                <select
                  value={copyGroupTargetButtonId || ''}
                  onChange={(e) => setCopyGroupTargetButtonId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {buttons.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.id === selectedButtonId ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                All fields in this group will be copied to the selected button.
              </p>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => { setShowCopyGroupModal(false); setCopyGroupSource(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCopyGroup}
                disabled={isSaving || !copyGroupTargetButtonId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                Copy Group
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

      {showFlowDesigner && selectedButton && createPortal(
        <FlowDesigner
          buttonId={selectedButton.id}
          buttonName={selectedButton.name}
          groups={groups}
          fields={fields}
          defaultZoom={defaultFlowZoom}
          onClose={() => setShowFlowDesigner(false)}
          onSave={() => {
            loadButtons();
          }}
          onError={(message) => toast.error(message)}
          onSuccess={(message) => toast.success(message)}
        />,
        document.body
      )}

      {showDisplayPrefsModal && createPortal(
        <DisplayPreferencesModal
          currentZoom={defaultFlowZoom}
          onSave={saveGlobalSettings}
          onClose={() => setShowDisplayPrefsModal(false)}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showChangeLogs && selectedButton && (
        <ConfigChangeLogsModal
          configType="execute"
          title={`Logs: ${selectedButton.name}`}
          itemFilter={selectedButton.name}
          onClose={() => setShowChangeLogs(false)}
        />
      )}

      {showImportModal && createPortal(
        <ExecuteButtonImportModal
          onClose={() => setShowImportModal(false)}
          onImported={async (buttonId) => {
            await loadButtons();
            setSelectedButtonId(buttonId);
            toast.success('Button imported successfully');
            if (currentUser) logConfigChange('execute', 'Imported button from file', currentUser.id, currentUser.username);
          }}
          buttonCount={buttons.length}
        />,
        document.body
      )}
    </div>
  );
}

function QrCodeDisplay({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const baseUrl = window.location.origin;
  const executeUrl = `${baseUrl}/execute/${slug}`;

  useEffect(() => {
    QRCode.toDataURL(executeUrl, { width: 150, margin: 1 })
      .then(setQrDataUrl)
      .catch((err: unknown) => console.error('Failed to generate QR code:', err));
  }, [executeUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(executeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = executeUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQrCode = useCallback(async () => {
    try {
      setDownloading(true);
      const dataUrl = await QRCode.toDataURL(executeUrl, { width: 400, margin: 1 });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `qr-code-${slug}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download QR code:', err);
    } finally {
      setDownloading(false);
    }
  }, [executeUrl, slug]);

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-start gap-4">
        <div className="bg-white p-2 rounded-lg shadow-sm">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code" className="w-[120px] h-[120px]" />
          ) : (
            <div className="w-[120px] h-[120px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Scan to launch this flow
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1.5 rounded">
                {executeUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Link className="h-3.5 w-3.5" />
                  Copy URL
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={handleDownloadQrCode}
              disabled={downloading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download QR Code
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Users can scan this QR code with their phone to open the flow directly.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ButtonModalProps {
  title: string;
  button: Partial<ExecuteButton> | null;
  onChange: (button: Partial<ExecuteButton> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  categories: ButtonCategory[];
}

function ButtonModal({ title, button, onChange, onSave, onClose, isSaving, categories }: ButtonModalProps) {
  if (!button) return null;

  const toggleCategory = (categoryId: string) => {
    const currentIds = button.categoryIds || [];
    const newIds = currentIds.includes(categoryId)
      ? currentIds.filter(id => id !== categoryId)
      : [...currentIds, categoryId];
    onChange({ ...button, categoryIds: newIds });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Button Name *
            </label>
            <input
              type="text"
              value={button.name || ''}
              onChange={(e) => onChange({ ...button, name: e.target.value })}
              placeholder="e.g., Generate Report"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={button.description || ''}
              onChange={(e) => onChange({ ...button, description: e.target.value })}
              placeholder="Optional description"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Categories
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map(category => {
                  const isSelected = (button.categoryIds || []).includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Click to assign this button to categories
              </p>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="buttonActive"
              checked={button.isActive ?? true}
              onChange={(e) => onChange({ ...button, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="buttonActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active (visible to users)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="buttonQrCode"
              checked={button.qrCodeEnabled ?? false}
              onChange={(e) => onChange({ ...button, qrCodeEnabled: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="buttonQrCode" className="text-sm text-gray-700 dark:text-gray-300 flex items-center">
              <QrCode className="h-4 w-4 mr-1.5" />
              Enable QR Code Access
            </label>
          </div>

          {button.qrCodeEnabled && button.qrCodeSlug && (
            <QrCodeDisplay slug={button.qrCodeSlug} />
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="buttonVisibleInMobile"
              checked={button.visibleInMobile ?? false}
              onChange={(e) => onChange({ ...button, visibleInMobile: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="buttonVisibleInMobile" className="text-sm text-gray-700 dark:text-gray-300 flex items-center">
              <Smartphone className="h-4 w-4 mr-1.5" />
              Show in Mobile App
            </label>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !button.name?.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface CategoryModalProps {
  category: Partial<ButtonCategory> | null;
  onChange: (category: Partial<ButtonCategory> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function CategoryModal({ category, onChange, onSave, onClose, isSaving }: CategoryModalProps) {
  if (!category) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {category.id ? 'Edit Category' : 'Create Category'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category Name *
            </label>
            <input
              type="text"
              value={category.name || ''}
              onChange={(e) => onChange({ ...category, name: e.target.value })}
              placeholder="e.g., Operations"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !category.name?.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  buttonName: string;
  onConfirm: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function DeleteConfirmModal({ buttonName, onConfirm, onClose, isSaving }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">Delete Button</h3>
        </div>

        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>"{buttonName}"</strong>?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            This will delete all groups and fields in this button. This action cannot be undone.
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface GroupDeleteConfirmModalProps {
  groupName: string;
  fieldCount: number;
  onConfirm: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function GroupDeleteConfirmModal({ groupName, fieldCount, onConfirm, onClose, isSaving }: GroupDeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">Delete Group</h3>
        </div>

        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete the group <strong>"{groupName}"</strong>?
          </p>
          {fieldCount > 0 && (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300 flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                This will also delete {fieldCount} {fieldCount === 1 ? 'field' : 'fields'} in this group.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            This action cannot be undone.
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete Group
          </button>
        </div>
      </div>
    </div>
  );
}

interface FieldDeleteConfirmModalProps {
  fieldName: string;
  onConfirm: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function FieldDeleteConfirmModal({ fieldName, onConfirm, onClose, isSaving }: FieldDeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">Delete Field</h3>
        </div>

        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete the field <strong>"{fieldName}"</strong>?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            This action cannot be undone.
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface GroupModalProps {
  group: Partial<ExecuteButtonGroup> | null;
  onChange: (group: Partial<ExecuteButtonGroup> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function GroupModal({ group, onChange, onSave, onClose, isSaving }: GroupModalProps) {
  const [translationsOpen, setTranslationsOpen] = useState(false);
  if (!group) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {group.id ? 'Edit Group' : 'Create Group'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Group Name *
            </label>
            <input
              type="text"
              value={group.name || ''}
              onChange={(e) => onChange({ ...group, name: e.target.value })}
              placeholder="e.g., Report Parameters"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={group.description || ''}
              onChange={(e) => onChange({ ...group, description: e.target.value })}
              placeholder="Optional description shown to users"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setTranslationsOpen(!translationsOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {translationsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Language Translations
            </button>
            {translationsOpen && (
            <div className="space-y-3 pl-4 border-l-2 border-slate-300 dark:border-slate-600">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Group Name - French
                  </label>
                  <input
                    type="text"
                    value={group.translations?.fr?.name || ''}
                    onChange={(e) => onChange({ ...group, translations: { ...group.translations, fr: { ...group.translations?.fr, name: e.target.value }, es: group.translations?.es || {} } })}
                    placeholder="Nom du groupe"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Group Name - Spanish
                  </label>
                  <input
                    type="text"
                    value={group.translations?.es?.name || ''}
                    onChange={(e) => onChange({ ...group, translations: { ...group.translations, fr: group.translations?.fr || {}, es: { ...group.translations?.es, name: e.target.value } } })}
                    placeholder="Nombre del grupo"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description - French
                  </label>
                  <textarea
                    value={group.translations?.fr?.description || ''}
                    onChange={(e) => onChange({ ...group, translations: { ...group.translations, fr: { ...group.translations?.fr, description: e.target.value }, es: group.translations?.es || {} } })}
                    placeholder="Description en francais"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description - Spanish
                  </label>
                  <textarea
                    value={group.translations?.es?.description || ''}
                    onChange={(e) => onChange({ ...group, translations: { ...group.translations, fr: group.translations?.fr || {}, es: { ...group.translations?.es, description: e.target.value } } })}
                    placeholder="Descripcion en espanol"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={group.isArrayGroup || false}
                onChange={(e) => onChange({ ...group, isArrayGroup: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Make this an Array Group
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Allows users to add multiple rows of fields
                </p>
              </div>
            </label>
          </div>

          {group.isArrayGroup && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Array Field Name *
                </label>
                <input
                  type="text"
                  value={group.arrayFieldName || ''}
                  onChange={(e) => onChange({ ...group, arrayFieldName: e.target.value })}
                  placeholder="e.g., items, clients, stops"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Used as the JSON key for the array in API payloads
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Min Rows
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
                    Max Rows
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
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !group.name?.trim() || (group.isArrayGroup && !group.arrayFieldName?.trim())}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Group
          </button>
        </div>
      </div>
    </div>
  );
}

interface ApiLookupConfigProps {
  field: Partial<ExecuteButtonField>;
  onChange: (field: Partial<ExecuteButtonField> | null) => void;
  allFields: ExecuteButtonField[];
}

function ApiLookupConfig({ field, onChange, allFields }: ApiLookupConfigProps) {
  const [secondaryApis, setSecondaryApis] = useState<{ id: string; name: string }[]>([]);
  const [apiSpecs, setApiSpecs] = useState<{ id: string; name: string; version: string }[]>([]);
  const [availableEndpoints, setAvailableEndpoints] = useState<{ id: string; path: string; summary?: string }[]>([]);
  const [selectedApiSpecId, setSelectedApiSpecId] = useState(field?.apiLookupSpecId || '');
  const [manualEndpointEntry, setManualEndpointEntry] = useState(!field?.apiLookupSpecId);
  const [apiLookupJsonParseError, setApiLookupJsonParseError] = useState<string | null>(null);

  useEffect(() => {
    const loadApis = async () => {
      const { data } = await supabase.from('secondary_api_configs').select('id, name, base_url').eq('is_active', true).order('name');
      if (data) setSecondaryApis(data);
    };
    loadApis();
  }, []);

  useEffect(() => {
    const loadSpecs = async () => {
      let query = supabase.from('api_specs').select('id, name, version');
      if (field?.apiLookupSecondaryApiId) {
        query = query.eq('secondary_api_id', field.apiLookupSecondaryApiId);
      } else {
        query = query.not('api_endpoint_id', 'is', null);
      }
      const { data } = await query.order('name');
      if (data) setApiSpecs(data);
    };
    if (field?.fieldType === 'api_lookup') {
      loadSpecs();
    }
  }, [field?.apiLookupSecondaryApiId, field?.fieldType]);

  useEffect(() => {
    const loadEndpoints = async () => {
      if (!selectedApiSpecId) { setAvailableEndpoints([]); return; }
      const method = (field?.apiLookupHttpMethod || 'GET').toUpperCase();
      const { data } = await supabase.from('api_spec_endpoints').select('id, path, summary').eq('spec_id', selectedApiSpecId).eq('method', method).order('path');
      if (data) setAvailableEndpoints(data);
    };
    loadEndpoints();
  }, [selectedApiSpecId, field?.apiLookupHttpMethod]);

  useEffect(() => {
    if (field?.apiLookupSpecId) {
      setSelectedApiSpecId(field.apiLookupSpecId);
    }
    if (field?.apiLookupEndpoint && !field?.apiLookupSpecId) {
      setManualEndpointEntry(true);
    }
  }, []);

  return (
    <div className="space-y-4 bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800">
      <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-200 flex items-center gap-2">
        <Search className="w-4 h-4" />
        API Lookup Configuration
      </h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Source
          </label>
          <Select
            value={field.apiLookupSecondaryApiId || '__primary__'}
            onValueChange={(value) => {
              onChange({ ...field, apiLookupSecondaryApiId: value === '__primary__' ? null : value, apiLookupSpecId: null, apiLookupEndpoint: '' });
              setSelectedApiSpecId('');
              setAvailableEndpoints([]);
            }}
            options={[
              { value: '__primary__', label: 'Primary API' },
              ...secondaryApis.map(api => ({ value: api.id, label: api.name }))
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            HTTP Method
          </label>
          <Select
            value={field.apiLookupHttpMethod || 'GET'}
            onValueChange={(value) => {
              onChange({ ...field, apiLookupHttpMethod: value, apiLookupEndpoint: '' });
              setAvailableEndpoints([]);
            }}
            options={[
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'PATCH', label: 'PATCH' },
            ]}
          />
        </div>
      </div>

      {apiSpecs.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Specification
          </label>
          <Select
            value={selectedApiSpecId || '__none__'}
            onValueChange={(val) => {
              const actualVal = val === '__none__' ? '' : val;
              setSelectedApiSpecId(actualVal);
              onChange({ ...field, apiLookupSpecId: actualVal || null, apiLookupEndpoint: '' });
            }}
            options={[
              { value: '__none__', label: 'Select specification...' },
              ...apiSpecs.map(spec => ({ value: spec.id, label: `${spec.name} (v${spec.version})` }))
            ]}
          />
        </div>
      )}

      <div>
        {apiSpecs.length > 0 && selectedApiSpecId && (
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="checkbox"
              checked={manualEndpointEntry}
              onChange={(e) => setManualEndpointEntry(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500"
            />
            <label className="text-xs text-gray-600 dark:text-gray-400">Enter path manually</label>
          </div>
        )}

        {apiSpecs.length === 0 || !selectedApiSpecId || manualEndpointEntry ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Endpoint Path
            </label>
            <input
              type="text"
              value={field.apiLookupEndpoint || ''}
              onChange={(e) => onChange({ ...field, apiLookupEndpoint: e.target.value })}
              placeholder="/api/v1/customers"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              {field.apiLookupSecondaryApiId
                ? 'Optional path appended to the secondary API base URL'
                : `The API path to call (${field.apiLookupHttpMethod || 'GET'}) for fetching results`}
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Endpoint
            </label>
            <Select
              value={availableEndpoints.find(e => e.path === field.apiLookupEndpoint)?.id || '__none__'}
              onValueChange={(endpointId) => {
                if (endpointId === '__none__') return;
                const ep = availableEndpoints.find(e => e.id === endpointId);
                if (ep) onChange({ ...field, apiLookupEndpoint: ep.path });
              }}
              options={[
                { value: '__none__', label: availableEndpoints.length === 0 ? `No ${field.apiLookupHttpMethod || 'GET'} endpoints in this spec` : 'Select endpoint...' },
                ...availableEndpoints.map(ep => ({
                  value: ep.id,
                  label: `${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}`
                }))
              ]}
              searchable
            />
            {field.apiLookupEndpoint && (
              <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1 font-mono">{field.apiLookupEndpoint}</p>
            )}
          </div>
        )}
      </div>

      {['POST', 'PUT', 'PATCH'].includes(field.apiLookupHttpMethod || 'GET') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Request Body
            </label>
            <button
              type="button"
              onClick={() => {
                const template = field.apiLookupRequestBody;
                if (!template) { alert('Please add a JSON template first'); return; }
                try {
                  const parsed = JSON.parse(template);
                  const mappings: { fieldName: string; type: 'hardcoded' | 'variable' | 'search'; value: string; dataType?: string }[] = [];
                  const extractFields = (obj: any, prefix = '') => {
                    for (const [key, value] of Object.entries(obj)) {
                      const fieldName = prefix ? `${prefix}.${key}` : key;
                      if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object') {
                        extractFields(value[0], `${fieldName}[0]`);
                      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                        extractFields(value, fieldName);
                      } else {
                        let dataType: string = 'string';
                        if (typeof value === 'number') dataType = Number.isInteger(value) ? 'integer' : 'number';
                        else if (typeof value === 'boolean') dataType = 'boolean';
                        mappings.push({ fieldName, type: 'hardcoded', value: '', dataType });
                      }
                    }
                  };
                  extractFields(parsed);
                  const existing = new Set((field.apiLookupRequestBodyMappings || []).map(m => m.fieldName));
                  const newMappings = mappings.filter(m => !existing.has(m.fieldName));
                  onChange({ ...field, apiLookupRequestBodyMappings: [...(field.apiLookupRequestBodyMappings || []), ...newMappings] });
                  setApiLookupJsonParseError(null);
                } catch (error: any) {
                  setApiLookupJsonParseError(`JSON error: ${error.message}`);
                }
              }}
              className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Map JSON
            </button>
          </div>
          <p className="text-xs text-gray-500">Enter the JSON structure for the request body</p>
          <textarea
            value={field.apiLookupRequestBody || ''}
            onChange={(e) => { onChange({ ...field, apiLookupRequestBody: e.target.value }); setApiLookupJsonParseError(null); }}
            placeholder={'{\n  "name": "searchTerm",\n  "inputs": {\n    "field1": "value"\n  }\n}'}
            rows={6}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono text-sm ${apiLookupJsonParseError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
          />
          {apiLookupJsonParseError && (
            <p className="text-xs text-red-600 dark:text-red-400">{apiLookupJsonParseError}</p>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={field.apiLookupWrapBodyInArray || false}
              onChange={(e) => onChange({ ...field, apiLookupWrapBodyInArray: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500"
            />
            <label className="text-xs text-gray-600 dark:text-gray-400">Wrap request body in array</label>
          </div>

          {(field.apiLookupRequestBodyMappings || []).length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Request Body Field Mappings
              </label>
              {(field.apiLookupRequestBodyMappings || []).map((mapping, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={mapping.fieldName}
                    readOnly
                    className="w-36 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs font-mono"
                  />
                  <Select
                    value={mapping.type}
                    onValueChange={(value) => {
                      const updated = [...(field.apiLookupRequestBodyMappings || [])];
                      updated[idx] = { ...updated[idx], type: value as 'hardcoded' | 'variable' | 'search', value: '' };
                      onChange({ ...field, apiLookupRequestBodyMappings: updated });
                    }}
                    options={[
                      { value: 'hardcoded', label: 'Hardcoded' },
                      { value: 'variable', label: 'Form Field' },
                      { value: 'search', label: 'Search Input' },
                    ]}
                  />
                  {mapping.type === 'variable' ? (
                    <Select
                      value={mapping.value || '__none__'}
                      onValueChange={(value) => {
                        const updated = [...(field.apiLookupRequestBodyMappings || [])];
                        updated[idx] = { ...updated[idx], value: value === '__none__' ? '' : value };
                        onChange({ ...field, apiLookupRequestBodyMappings: updated });
                      }}
                      options={[
                        { value: '__none__', label: 'Select field...' },
                        { value: '__search__', label: '{{search}} (Search Query)' },
                        ...allFields
                          .filter(f => f.id !== field.id && f.groupId === field.groupId)
                          .map(f => ({ value: f.fieldKey, label: f.name }))
                      ]}
                      searchable
                    />
                  ) : (
                    <input
                      type="text"
                      value={mapping.value}
                      onChange={(e) => {
                        const updated = [...(field.apiLookupRequestBodyMappings || [])];
                        updated[idx] = { ...updated[idx], value: e.target.value };
                        onChange({ ...field, apiLookupRequestBodyMappings: updated });
                      }}
                      placeholder={mapping.type === 'search' ? 'Default value' : 'Fixed value'}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  )}
                  <Select
                    value={mapping.dataType || 'string'}
                    onValueChange={(value) => {
                      const updated = [...(field.apiLookupRequestBodyMappings || [])];
                      updated[idx] = { ...updated[idx], dataType: value };
                      onChange({ ...field, apiLookupRequestBodyMappings: updated });
                    }}
                    options={[
                      { value: 'string', label: 'String' },
                      { value: 'number', label: 'Number' },
                      { value: 'integer', label: 'Integer' },
                      { value: 'boolean', label: 'Boolean' },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (field.apiLookupRequestBodyMappings || []).filter((_, i) => i !== idx);
                      onChange({ ...field, apiLookupRequestBodyMappings: updated });
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const updated = [...(field.apiLookupRequestBodyMappings || []), { fieldName: '', type: 'hardcoded' as const, value: '', dataType: 'string' }];
                  onChange({ ...field, apiLookupRequestBodyMappings: updated });
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Add Field
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Search Parameter Name
        </label>
        <input
          type="text"
          value={field.apiLookupSearchParam || ''}
          onChange={(e) => onChange({ ...field, apiLookupSearchParam: e.target.value })}
          placeholder="search"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">Query parameter name to pass search term (e.g. "search" becomes ?search=term)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Value Field
        </label>
        <input
          type="text"
          value={field.apiLookupValueField || ''}
          onChange={(e) => onChange({ ...field, apiLookupValueField: e.target.value })}
          placeholder="id"
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">Response field that becomes this field's value when a result is selected</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Display Columns
        </label>
        <p className="text-xs text-gray-500 mb-2">Columns shown in the results popup table</p>
        <div className="space-y-2">
          {(field.apiLookupDisplayColumns || []).map((col, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                value={col.field}
                onChange={(e) => {
                  const updated = [...(field.apiLookupDisplayColumns || [])];
                  updated[idx] = { ...updated[idx], field: e.target.value };
                  onChange({ ...field, apiLookupDisplayColumns: updated });
                }}
                placeholder="Response field path"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="text"
                value={col.label}
                onChange={(e) => {
                  const updated = [...(field.apiLookupDisplayColumns || [])];
                  updated[idx] = { ...updated[idx], label: e.target.value };
                  onChange({ ...field, apiLookupDisplayColumns: updated });
                }}
                placeholder="Column header label"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const updated = (field.apiLookupDisplayColumns || []).filter((_, i) => i !== idx);
                  onChange({ ...field, apiLookupDisplayColumns: updated });
                }}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const updated = [...(field.apiLookupDisplayColumns || []), { field: '', label: '' }];
              onChange({ ...field, apiLookupDisplayColumns: updated });
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add Column
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Field Mappings
        </label>
        <p className="text-xs text-gray-500 mb-2">Map response fields to other fields in the same group to auto-populate on selection</p>
        <div className="space-y-2">
          {(field.apiLookupFieldMappings || []).map((mapping, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                value={mapping.responseField}
                onChange={(e) => {
                  const updated = [...(field.apiLookupFieldMappings || [])];
                  updated[idx] = { ...updated[idx], responseField: e.target.value };
                  onChange({ ...field, apiLookupFieldMappings: updated });
                }}
                placeholder="Response field"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <span className="text-gray-400 text-sm">&rarr;</span>
              <Select
                value={mapping.targetFieldName || '__none__'}
                onValueChange={(value) => {
                  const updated = [...(field.apiLookupFieldMappings || [])];
                  updated[idx] = { ...updated[idx], targetFieldName: value === '__none__' ? '' : value };
                  onChange({ ...field, apiLookupFieldMappings: updated });
                }}
                options={[
                  { value: '__none__', label: 'Select field...' },
                  ...allFields
                    .filter(f => f.id !== field.id && f.groupId === field.groupId)
                    .map(f => ({ value: f.fieldKey, label: f.name }))
                ]}
                searchable
              />
              <button
                type="button"
                onClick={() => {
                  const updated = (field.apiLookupFieldMappings || []).filter((_, i) => i !== idx);
                  onChange({ ...field, apiLookupFieldMappings: updated });
                }}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const updated = [...(field.apiLookupFieldMappings || []), { responseField: '', targetFieldName: '' }];
              onChange({ ...field, apiLookupFieldMappings: updated });
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add Mapping
          </button>
        </div>
      </div>
    </div>
  );
}

interface FieldModalProps {
  field: Partial<ExecuteButtonField> | null;
  onChange: (field: Partial<ExecuteButtonField> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  allFields: ExecuteButtonField[];
}

function FieldModal({ field, onChange, onSave, onClose, isSaving, allFields }: FieldModalProps) {
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [translationsOpen, setTranslationsOpen] = useState(false);

  if (!field) return null;

  const availableDependencyFields = allFields.filter(f =>
    f.id !== field.id &&
    f.groupId === field.groupId &&
    (f.fieldType === 'dropdown' || f.fieldType === 'text')
  );

  const fieldTypes: { value: ExecuteFieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'email', label: 'Email' },
    { value: 'number', label: 'Number' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date & Time' },
    { value: 'time', label: 'Time' },
    { value: 'phone', label: 'Phone' },
    { value: 'zip', label: 'Zip Code' },
    { value: 'postal_code', label: 'Postal Code' },
    { value: 'province', label: 'Province' },
    { value: 'state', label: 'State' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'api_lookup', label: 'API Lookup' },
    { value: 'checkbox', label: 'Checkbox' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {field.id ? 'Edit Field' : 'Create Field'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Label *
              </label>
              <input
                type="text"
                value={field.name || ''}
                onChange={(e) => onChange({ ...field, name: e.target.value })}
                placeholder="e.g., Start Date"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Key *
              </label>
              <input
                type="text"
                value={field.fieldKey || ''}
                onChange={(e) => onChange({ ...field, fieldKey: e.target.value })}
                placeholder="e.g., start_date"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">Used as parameter name when executing</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Type *
              </label>
              <Select
                value={field.fieldType || 'text'}
                onValueChange={(value) => onChange({ ...field, fieldType: value as ExecuteFieldType })}
                options={fieldTypes.map(type => ({ value: type.value, label: type.label }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Value
              </label>
              <input
                type="text"
                value={field.defaultValue || ''}
                onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
                placeholder="Optional"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Placeholder Text
            </label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              placeholder="Enter placeholder text"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {(field.fieldType === 'text' || field.fieldType === 'email') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Length
              </label>
              <input
                type="number"
                min="0"
                value={field.maxLength || ''}
                onChange={(e) => onChange({ ...field, maxLength: e.target.value ? parseInt(e.target.value, 10) : null })}
                placeholder="No limit"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum number of characters allowed (leave empty for no limit)</p>
            </div>
          )}

          {field.fieldType === 'datetime' && (
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.timeInputOnly || false}
                  onChange={(e) => onChange({ ...field, timeInputOnly: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Input Only</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">Only show the time picker. The current date will be automatically combined with the entered time.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Help Text
            </label>
            <input
              type="text"
              value={field.helpText || ''}
              onChange={(e) => onChange({ ...field, helpText: e.target.value })}
              placeholder="Helper text shown below the field"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setTranslationsOpen(!translationsOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {translationsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Language Translations
            </button>
            {translationsOpen && (
            <div className="space-y-3 pl-4 border-l-2 border-slate-300 dark:border-slate-600">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Field Label - French
                  </label>
                  <input
                    type="text"
                    value={field.translations?.fr?.name || ''}
                    onChange={(e) => onChange({ ...field, translations: { ...field.translations, fr: { ...field.translations?.fr, name: e.target.value }, es: field.translations?.es || {} } })}
                    placeholder="Libelle du champ"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Field Label - Spanish
                  </label>
                  <input
                    type="text"
                    value={field.translations?.es?.name || ''}
                    onChange={(e) => onChange({ ...field, translations: { ...field.translations, fr: field.translations?.fr || {}, es: { ...field.translations?.es, name: e.target.value } } })}
                    placeholder="Etiqueta del campo"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Placeholder - French
                  </label>
                  <input
                    type="text"
                    value={field.translations?.fr?.placeholder || ''}
                    onChange={(e) => onChange({ ...field, translations: { ...field.translations, fr: { ...field.translations?.fr, placeholder: e.target.value }, es: field.translations?.es || {} } })}
                    placeholder="Texte indicatif"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Placeholder - Spanish
                  </label>
                  <input
                    type="text"
                    value={field.translations?.es?.placeholder || ''}
                    onChange={(e) => onChange({ ...field, translations: { ...field.translations, fr: field.translations?.fr || {}, es: { ...field.translations?.es, placeholder: e.target.value } } })}
                    placeholder="Texto indicativo"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Help Text - French
                  </label>
                  <input
                    type="text"
                    value={field.translations?.fr?.helpText || ''}
                    onChange={(e) => onChange({ ...field, translations: { ...field.translations, fr: { ...field.translations?.fr, helpText: e.target.value }, es: field.translations?.es || {} } })}
                    placeholder="Texte d'aide"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Help Text - Spanish
                  </label>
                  <input
                    type="text"
                    value={field.translations?.es?.helpText || ''}
                    onChange={(e) => onChange({ ...field, translations: { ...field.translations, fr: field.translations?.fr || {}, es: { ...field.translations?.es, helpText: e.target.value } } })}
                    placeholder="Texto de ayuda"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            )}
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
                  {(field.options || []).map((opt: DropdownOptionItem, index: number) => (
                    <div key={index} className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={opt.value}
                          onChange={(e) => {
                            const newOptions = [...(field.options || [])];
                            newOptions[index] = { ...opt, value: e.target.value };
                            onChange({ ...field, options: newOptions });
                          }}
                          placeholder="Value"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <input
                          type="text"
                          value={opt.description}
                          onChange={(e) => {
                            const newOptions = [...(field.options || [])];
                            newOptions[index] = { ...opt, description: e.target.value };
                            onChange({ ...field, options: newOptions });
                          }}
                          placeholder="Description"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingRuleIndex(editingRuleIndex === index ? null : index)}
                          className={`p-2 rounded-lg transition-colors ${
                            opt.visibilityRules && opt.visibilityRules.length > 0
                              ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600'
                          }`}
                          title={opt.visibilityRules?.length ? `${opt.visibilityRules.length} visibility rule(s)` : 'Add visibility rule'}
                        >
                          <Filter className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newOptions = (field.options || []).filter((_: DropdownOptionItem, i: number) => i !== index);
                            onChange({ ...field, options: newOptions });
                            if (editingRuleIndex === index) setEditingRuleIndex(null);
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {editingRuleIndex === index && (
                        <div className="ml-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Visibility Rules</span>
                            <button
                              type="button"
                              onClick={() => setEditingRuleIndex(null)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            This option will only appear when the selected field has one of the specified values.
                          </p>

                          {(opt.visibilityRules || []).map((rule, ruleIndex) => (
                            <div key={ruleIndex} className="flex gap-2 items-start mb-2">
                              <CustomDropdown
                                value={rule.dependsOnField}
                                onChange={(val) => {
                                  const newOptions = [...(field.options || [])];
                                  const newRules = [...(opt.visibilityRules || [])];
                                  newRules[ruleIndex] = { ...rule, dependsOnField: val };
                                  newOptions[index] = { ...opt, visibilityRules: newRules };
                                  onChange({ ...field, options: newOptions });
                                }}
                                options={availableDependencyFields.map(f => ({ value: f.fieldKey, label: `${f.name} (${f.fieldKey})` }))}
                                placeholder="Select field..."
                                size="sm"
                                className="flex-1"
                                dropdownMinWidth={220}
                              />
                              {(() => {
                                const dependentField = availableDependencyFields.find(f => f.fieldKey === rule.dependsOnField);
                                const hasDropdownOptions = dependentField?.fieldType === 'dropdown' && dependentField?.options?.length > 0;

                                if (hasDropdownOptions) {
                                  return (
                                    <div className="flex-1 relative">
                                      <div className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 min-h-[30px] max-h-[120px] overflow-y-auto">
                                        {dependentField.options.map((depOpt: DropdownOptionItem) => (
                                          <label key={depOpt.value} className="flex items-center gap-2 py-1 px-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={rule.showWhenValues.includes(depOpt.value)}
                                              onChange={(e) => {
                                                const newOptions = [...(field.options || [])];
                                                const newRules = [...(opt.visibilityRules || [])];
                                                let newValues = [...rule.showWhenValues];
                                                if (e.target.checked) {
                                                  if (!newValues.includes(depOpt.value)) {
                                                    newValues.push(depOpt.value);
                                                  }
                                                } else {
                                                  newValues = newValues.filter(v => v !== depOpt.value);
                                                }
                                                newRules[ruleIndex] = { ...rule, showWhenValues: newValues };
                                                newOptions[index] = { ...opt, visibilityRules: newRules };
                                                onChange({ ...field, options: newOptions });
                                              }}
                                              className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-gray-900 dark:text-gray-100 truncate">
                                              {depOpt.description || depOpt.value}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <input
                                    type="text"
                                    value={rule.showWhenValues.join(', ')}
                                    onChange={(e) => {
                                      const newOptions = [...(field.options || [])];
                                      const newRules = [...(opt.visibilityRules || [])];
                                      newRules[ruleIndex] = {
                                        ...rule,
                                        showWhenValues: e.target.value.split(',').map(v => v.trim()).filter(v => v)
                                      };
                                      newOptions[index] = { ...opt, visibilityRules: newRules };
                                      onChange({ ...field, options: newOptions });
                                    }}
                                    placeholder="Values (comma-separated)"
                                    className="flex-1 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                  />
                                );
                              })()}
                              <button
                                type="button"
                                onClick={() => {
                                  const newOptions = [...(field.options || [])];
                                  const newRules = (opt.visibilityRules || []).filter((_, i) => i !== ruleIndex);
                                  newOptions[index] = { ...opt, visibilityRules: newRules.length > 0 ? newRules : undefined };
                                  onChange({ ...field, options: newOptions });
                                }}
                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}

                          {availableDependencyFields.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                const newOptions = [...(field.options || [])];
                                const newRules = [...(opt.visibilityRules || []), { dependsOnField: '', showWhenValues: [] }];
                                newOptions[index] = { ...opt, visibilityRules: newRules };
                                onChange({ ...field, options: newOptions });
                              }}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            >
                              <Plus className="w-3 h-3" />
                              Add Rule
                            </button>
                          ) : (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              No other dropdown or text fields in this group to depend on.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = [...(field.options || []), { value: '', description: '' }];
                      onChange({ ...field, options: newOptions });
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Add Option
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Value is sent to the API. Description is what users see.</p>
              </div>
            </div>
          )}

          {field.fieldType === 'api_lookup' && (
            <ApiLookupConfig
              field={field}
              onChange={onChange}
              allFields={allFields}
            />
          )}

          <div className="flex items-center">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={field.isRequired || false}
                onChange={(e) => onChange({ ...field, isRequired: e.target.checked, conditionalRequiredFieldId: e.target.checked ? null : field.conditionalRequiredFieldId, conditionalRequiredOperator: e.target.checked ? null : field.conditionalRequiredOperator, conditionalRequiredValue: e.target.checked ? null : field.conditionalRequiredValue })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
            </label>
          </div>

          {!field.isRequired && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={!!field.conditionalRequiredFieldId}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange({ ...field, conditionalRequiredOperator: 'not_null', conditionalRequiredValue: null, conditionalRequiredFieldId: '' });
                    } else {
                      onChange({ ...field, conditionalRequiredFieldId: null, conditionalRequiredOperator: null, conditionalRequiredValue: null });
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Conditionally Required</span>
              </label>

              {(field.conditionalRequiredFieldId !== null && field.conditionalRequiredFieldId !== undefined) && (
                <div className="space-y-3 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">When this field</label>
                    <select
                      value={field.conditionalRequiredFieldId || ''}
                      onChange={(e) => onChange({ ...field, conditionalRequiredFieldId: e.target.value || null })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="">Select a field...</option>
                      {allFields
                        .filter(f => f.id !== field.id && f.groupId === field.groupId)
                        .map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Condition</label>
                    <select
                      value={field.conditionalRequiredOperator || 'not_null'}
                      onChange={(e) => onChange({ ...field, conditionalRequiredOperator: e.target.value, conditionalRequiredValue: (e.target.value === 'starts_with' || e.target.value === 'contains') ? (field.conditionalRequiredValue || '') : null })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="not_null">Is Not Empty</option>
                      <option value="null">Is Empty</option>
                      <option value="starts_with">Starts With</option>
                      <option value="contains">Contains</option>
                    </select>
                  </div>

                  {(field.conditionalRequiredOperator === 'starts_with' || field.conditionalRequiredOperator === 'contains') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Value</label>
                      <input
                        type="text"
                        value={field.conditionalRequiredValue || ''}
                        onChange={(e) => onChange({ ...field, conditionalRequiredValue: e.target.value })}
                        placeholder="Enter comparison value"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !field.name?.trim() || !field.fieldKey?.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Field
          </button>
        </div>
      </div>
    </div>
  );
}

interface SortableFieldRowProps {
  field: ExecuteButtonField;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

function SortableFieldRow({ field, onEdit, onCopy, onDelete }: SortableFieldRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </button>
        <FieldTypeIcon fieldType={field.fieldType} size="sm" />
        <div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {field.name}
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded font-mono">
              {field.fieldKey}
            </span>
            <FieldTypeBadge fieldType={field.fieldType} />
            {field.isRequired && (
              <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                Required
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onEdit}
          className="p-1 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          title="Edit Field"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onCopy}
          className="p-1 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          title="Copy Field"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
          title="Delete Field"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface DisplayPreferencesModalProps {
  currentZoom: number;
  onSave: (zoom: number) => void;
  onClose: () => void;
  isSaving: boolean;
}

function DisplayPreferencesModal({ currentZoom, onSave, onClose, isSaving }: DisplayPreferencesModalProps) {
  const [zoom, setZoom] = useState(currentZoom);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Display Preferences</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Customize how workflows are displayed in the designer
          </p>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Default Workflow Zoom Level
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Controls the initial zoom level when opening a workflow. Lower values show more of the workflow at once.
              </p>

              <div className="space-y-3">
                <input
                  type="range"
                  min="25"
                  max="150"
                  step="5"
                  value={zoom}
                  onChange={(e) => setZoom(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">25% (Show More)</span>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <ZoomIn className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{zoom}%</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">150% (Show Less)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(zoom)}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Preference
          </button>
        </div>
      </div>
    </div>
  );
}
