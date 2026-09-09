import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Pencil as Edit2, Copy, GripVertical, ChevronDown, ChevronRight, Check, Loader2, AlertCircle, FileText, ChevronsDown, ChevronsRight, Eye, Braces, Download, Upload, Paperclip, Users, GitBranch } from 'lucide-react';
import type { OrderEntryTemplate, OrderEntryFieldGroup, OrderEntryField, OrderEntryFieldLayout, ExtractionType, FieldMapping, DropdownOption, OrderEntryDocumentType } from '../../types';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';
import CustomDropdown from '../common/CustomDropdown';
import FieldTypeIcon, { FieldTypeBadge } from '../common/FieldTypeIcon';
import { useToast } from '../../hooks/useToast';
import ToastContainer from '../common/ToastContainer';
import { FormSkeleton } from '../common/Skeleton';
import LayoutDesigner from './LayoutDesigner';
import FormPreviewModal from './FormPreviewModal';
import OrderEntryTemplateImportModal from './OrderEntryTemplateImportModal';

interface OrderEntryTemplatesSettingsProps {
  extractionTypes: ExtractionType[];
}

type OrderEntryFieldType = 'text' | 'number' | 'date' | 'datetime' | 'phone' | 'dropdown' | 'file' | 'boolean' | 'zip' | 'postal_code' | 'zip_postal' | 'province' | 'state' | 'api_lookup';

export default function OrderEntryTemplatesSettings({ extractionTypes }: OrderEntryTemplatesSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<OrderEntryTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [fieldGroups, setFieldGroups] = useState<OrderEntryFieldGroup[]>([]);
  const [fields, setFields] = useState<OrderEntryField[]>([]);
  const [fieldLayouts, setFieldLayouts] = useState<OrderEntryFieldLayout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState({
    fieldGroups: true,
    formLayout: true,
    documentTypes: true
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showCopyFromGlobalModal, setShowCopyFromGlobalModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDocTypeModal, setShowDocTypeModal] = useState(false);

  const [editingTemplate, setEditingTemplate] = useState<Partial<OrderEntryTemplate> | null>(null);
  const [editingGroup, setEditingGroup] = useState<Partial<OrderEntryFieldGroup> | null>(null);
  const [editingField, setEditingField] = useState<Partial<OrderEntryField> | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<OrderEntryTemplate | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<OrderEntryFieldGroup | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<OrderEntryField | null>(null);
  const [documentTypes, setDocumentTypes] = useState<OrderEntryDocumentType[]>([]);
  const [editingDocType, setEditingDocType] = useState<Partial<OrderEntryDocumentType> | null>(null);
  const [docTypeToDelete, setDocTypeToDelete] = useState<OrderEntryDocumentType | null>(null);
  const [imagingBuckets, setImagingBuckets] = useState<{ id: string; name: string }[]>([]);
  const [imagingDocTypes, setImagingDocTypes] = useState<{ id: string; name: string }[]>([]);
  const [adminUsers, setAdminUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [showVariablePicker, setShowVariablePicker] = useState<'emailSubject' | 'rename' | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const emailSubjectRef = useRef<HTMLInputElement>(null);
  const renameTemplateRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [conditionsField, setConditionsField] = useState<OrderEntryField | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const layoutSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const groupImportInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    loadTemplates();
    loadImagingOptions();
    loadAdminUsers();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplateData(selectedTemplateId);
    } else {
      setFieldGroups([]);
      setFields([]);
      setFieldLayouts([]);
      setDocumentTypes([]);
    }
  }, [selectedTemplateId]);

  const loadImagingOptions = async () => {
    const [bucketsRes, docTypesRes] = await Promise.all([
      supabase.from('imaging_buckets').select('id, name').eq('is_active', true).order('name'),
      supabase.from('imaging_document_types').select('id, name').order('name')
    ]);
    if (bucketsRes.data) setImagingBuckets(bucketsRes.data);
    if (docTypesRes.data) setImagingDocTypes(docTypesRes.data);
  };

  const loadAdminUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('is_active', true)
      .in('role', ['admin', 'user'])
      .order('name');
    if (data) {
      setAdminUsers(data.filter(u => u.email).map(u => ({ id: u.id, name: u.name || u.email, email: u.email })));
    }
  };

  const getAvailableVariables = () => {
    const baseVars = ['documentType', 'date', 'timestamp', 'clientCode', 'submissionId'];
    const fieldVars = fields.map(f => f.fieldName).filter(Boolean);
    return [...baseVars, ...fieldVars];
  };

  const insertVariable = (target: 'emailSubject' | 'rename', variable: string) => {
    const ref = target === 'emailSubject' ? emailSubjectRef : renameTemplateRef;
    const field = target === 'emailSubject' ? 'emailSubjectTemplate' : 'renameTemplate';
    const input = ref.current;
    const currentVal = (target === 'emailSubject' ? editingDocType?.emailSubjectTemplate : editingDocType?.renameTemplate) || '';
    const insertText = `{{${variable}}}`;

    if (input) {
      const start = input.selectionStart || currentVal.length;
      const end = input.selectionEnd || currentVal.length;
      const newValue = currentVal.slice(0, start) + insertText + currentVal.slice(end);
      setEditingDocType({ ...editingDocType!, [field]: newValue });
      setTimeout(() => {
        input.focus();
        const newCursor = start + insertText.length;
        input.setSelectionRange(newCursor, newCursor);
      }, 0);
    } else {
      setEditingDocType({ ...editingDocType!, [field]: currentVal + insertText });
    }
    setShowVariablePicker(null);
  };

  const addUserEmail = (email: string) => {
    const current = editingDocType?.emailRecipients || '';
    const emails = current.split(',').map(e => e.trim()).filter(Boolean);
    if (!emails.includes(email)) {
      emails.push(email);
      setEditingDocType({ ...editingDocType!, emailRecipients: emails.join(', ') });
    }
    setShowUserPicker(false);
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('order_entry_templates')
        .select('*')
        .order('name');

      if (error) throw error;

      const templatesData: OrderEntryTemplate[] = (data || []).map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        extractionTypeId: t.extraction_type_id,
        confirmationNumberField: t.confirmation_number_field,
        hidePdfAutofill: t.hide_pdf_autofill ?? false,
        isActive: t.is_active,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));

      setTemplates(templatesData);

      if (templatesData.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(templatesData[0].id);
      }
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateData = async (templateId: string) => {
    try {
      const [groupsRes, fieldsRes, layoutsRes, docTypesRes] = await Promise.all([
        supabase
          .from('order_entry_template_field_groups')
          .select('id, template_id, group_name, group_order, description, is_collapsible, is_expanded_by_default, background_color, border_color, is_array_group, array_min_rows, array_max_rows, array_json_path, hide_add_row, is_hidden, address_book_enabled, address_book_type, parent_group_id, child_button_label, reset_on_template_load, remove_if_empty, created_at, updated_at')
          .eq('template_id', templateId)
          .order('group_order', { ascending: true }),
        supabase
          .from('order_entry_template_fields')
          .select('id, template_id, field_group_id, field_name, field_label, field_type, placeholder, help_text, is_required, max_length, min_value, max_value, default_value, dropdown_options, dropdown_display_mode, json_path, is_array_field, array_min_rows, array_max_rows, ai_extraction_instructions, validation_regex, validation_error_message, field_order, copy_from_field, use_client_id_default, address_book_field, future_dates_only, hidden_from_client, count_child_array_records, count_child_array_group_id, conditional_visibility_field_id, conditional_visibility_operator, conditional_visibility_value, conditional_required_field_id, conditional_required_operator, conditional_required_value, exclusion_groups, api_lookup_endpoint, api_lookup_secondary_api_id, api_lookup_spec_id, api_lookup_display_columns, api_lookup_value_field, api_lookup_field_mappings, api_lookup_search_param, api_lookup_http_method, api_lookup_request_body, api_lookup_request_body_mappings, api_lookup_wrap_body_in_array, created_at, updated_at')
          .eq('template_id', templateId)
          .order('field_order', { ascending: true }),
        supabase
          .from('order_entry_template_field_layout')
          .select('id, template_id, field_id, row_index, column_index, width_columns, mobile_width_columns, created_at, updated_at')
          .eq('template_id', templateId),
        supabase
          .from('order_entry_template_document_types')
          .select('*')
          .eq('template_id', templateId)
          .order('sort_order', { ascending: true })
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (layoutsRes.error) throw layoutsRes.error;

      const groups = (groupsRes.data || []).map((g: any) => ({
        id: g.id,
        templateId: g.template_id,
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
        hideAddRow: g.hide_add_row || false,
        isHidden: g.is_hidden || false,
        addressBookEnabled: g.address_book_enabled || false,
        addressBookType: g.address_book_type || null,
        parentGroupId: g.parent_group_id || null,
        childButtonLabel: g.child_button_label || null,
        resetOnTemplateLoad: g.reset_on_template_load || false,
        removeIfEmpty: g.remove_if_empty || false,
        createdAt: g.created_at,
        updatedAt: g.updated_at
      }));

      const fieldsData = (fieldsRes.data || []).map((f: any) => ({
        id: f.id,
        templateId: f.template_id,
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
        copyFromField: f.copy_from_field,
        useClientIdDefault: f.use_client_id_default || false,
        addressBookField: f.address_book_field || null,
        futureDatesOnly: f.future_dates_only || false,
        allowWeekends: f.allow_weekends !== false,
        allowHolidays: f.allow_holidays !== false,
        hiddenFromClient: f.hidden_from_client || false,
        countChildArrayRecords: f.count_child_array_records || false,
        countChildArrayGroupId: f.count_child_array_group_id || null,
        conditionalVisibilityFieldId: f.conditional_visibility_field_id || null,
        conditionalVisibilityOperator: f.conditional_visibility_operator || null,
        conditionalVisibilityValue: f.conditional_visibility_value || null,
        conditionalRequiredFieldId: f.conditional_required_field_id || null,
        conditionalRequiredOperator: f.conditional_required_operator || null,
        conditionalRequiredValue: f.conditional_required_value || null,
        exclusionGroups: f.exclusion_groups || null,
        apiLookupEndpoint: f.api_lookup_endpoint || null,
        apiLookupSecondaryApiId: f.api_lookup_secondary_api_id || null,
        apiLookupSpecId: f.api_lookup_spec_id || null,
        apiLookupDisplayColumns: f.api_lookup_display_columns || null,
        apiLookupValueField: f.api_lookup_value_field || null,
        apiLookupFieldMappings: f.api_lookup_field_mappings || null,
        apiLookupSearchParam: f.api_lookup_search_param || null,
        apiLookupHttpMethod: f.api_lookup_http_method || 'GET',
        apiLookupRequestBody: f.api_lookup_request_body || null,
        apiLookupRequestBodyMappings: f.api_lookup_request_body_mappings || null,
        apiLookupWrapBodyInArray: f.api_lookup_wrap_body_in_array || false,
        createdAt: f.created_at,
        updatedAt: f.updated_at
      }));

      const layouts = (layoutsRes.data || []).map((l: any) => ({
        id: l.id,
        templateId: l.template_id,
        fieldId: l.field_id,
        rowIndex: l.row_index,
        columnIndex: l.column_index,
        widthColumns: l.width_columns,
        mobileWidthColumns: l.mobile_width_columns,
        createdAt: l.created_at,
        updatedAt: l.updated_at
      }));

      const previousGroupIds = new Set(fieldGroups.map(g => g.id));

      setFieldGroups(groups);
      setFields(fieldsData);
      setFieldLayouts(layouts);

      const docTypes: OrderEntryDocumentType[] = (docTypesRes.data || []).map((d: any) => ({
        id: d.id,
        templateId: d.template_id,
        name: d.name,
        sortOrder: d.sort_order,
        isRequired: d.is_required,
        actionType: d.action_type,
        emailRecipients: d.email_recipients,
        emailSubjectTemplate: d.email_subject_template,
        imagingBucketId: d.imaging_bucket_id,
        imagingDocumentTypeId: d.imaging_document_type_id,
        renameTemplate: d.rename_template,
        allowedFileTypes: d.allowed_file_types,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));
      setDocumentTypes(docTypes);

      setCollapsedGroups(prev => {
        if (prev.size === 0 && previousGroupIds.size === 0) {
          return new Set(groups.map((g: OrderEntryFieldGroup) => g.id));
        }
        const currentGroupIds = new Set(groups.map((g: OrderEntryFieldGroup) => g.id));
        const preserved = new Set<string>();
        prev.forEach(id => {
          if (currentGroupIds.has(id)) {
            preserved.add(id);
          }
        });
        groups.forEach((g: OrderEntryFieldGroup) => {
          if (!previousGroupIds.has(g.id)) {
            preserved.add(g.id);
          }
        });
        return preserved;
      });
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load template data');
    }
  };

  const handleCreateTemplate = async () => {
    if (!editingTemplate?.name?.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('order_entry_templates')
        .insert([{
          name: editingTemplate.name.trim(),
          description: editingTemplate.description?.trim() || null,
          extraction_type_id: editingTemplate.extractionTypeId || null,
          confirmation_number_field: editingTemplate.confirmationNumberField?.trim() || null,
          hide_pdf_autofill: editingTemplate.hidePdfAutofill ?? false,
          is_active: editingTemplate.isActive ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success('Template created successfully');
      setShowCreateModal(false);
      setEditingTemplate(null);
      await loadTemplates();
      setSelectedTemplateId(data.id);
    } catch (err: any) {
      toast.error('Failed to create template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate?.id || !editingTemplate?.name?.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('order_entry_templates')
        .update({
          name: editingTemplate.name.trim(),
          description: editingTemplate.description?.trim() || null,
          extraction_type_id: editingTemplate.extractionTypeId || null,
          confirmation_number_field: editingTemplate.confirmationNumberField?.trim() || null,
          hide_pdf_autofill: editingTemplate.hidePdfAutofill ?? false,
          is_active: editingTemplate.isActive ?? true,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingTemplate.id);

      if (error) throw error;

      toast.success('Template updated successfully');
      setShowEditModal(false);
      setEditingTemplate(null);
      await loadTemplates();
    } catch (err: any) {
      toast.error('Failed to update template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('order_entry_templates')
        .delete()
        .eq('id', templateToDelete.id);

      if (error) throw error;

      toast.success('Template deleted successfully');
      setShowDeleteModal(false);
      setTemplateToDelete(null);

      if (selectedTemplateId === templateToDelete.id) {
        setSelectedTemplateId(null);
      }

      await loadTemplates();
    } catch (err: any) {
      toast.error('Failed to delete template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportTemplate = async () => {
    if (!selectedTemplateId) return;
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    try {
      const [groupsRes, fieldsRes, layoutsRes, docTypesRes] = await Promise.all([
        supabase.from('order_entry_template_field_groups').select('*').eq('template_id', selectedTemplateId).order('group_order'),
        supabase.from('order_entry_template_fields').select('*').eq('template_id', selectedTemplateId).order('field_order'),
        supabase.from('order_entry_template_field_layout').select('*').eq('template_id', selectedTemplateId),
        supabase.from('order_entry_template_document_types').select('*').eq('template_id', selectedTemplateId).order('sort_order')
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (layoutsRes.error) throw layoutsRes.error;

      const exportData = {
        version: '1.0',
        type: 'order_entry_template',
        exportedAt: new Date().toISOString(),
        template: {
          name: template.name,
          description: template.description,
          extractionTypeId: template.extractionTypeId,
          confirmationNumberField: template.confirmationNumberField,
          hidePdfAutofill: template.hidePdfAutofill,
          isActive: template.isActive
        },
        fieldGroups: (groupsRes.data || []).map(g => ({
          id: g.id,
          groupName: g.group_name,
          groupOrder: g.group_order,
          description: g.description,
          isCollapsible: g.is_collapsible,
          isExpandedByDefault: g.is_expanded_by_default,
          backgroundColor: g.background_color,
          borderColor: g.border_color,
          isArrayGroup: g.is_array_group,
          arrayMinRows: g.array_min_rows,
          arrayMaxRows: g.array_max_rows,
          arrayJsonPath: g.array_json_path,
          hideAddRow: g.hide_add_row,
          isHidden: g.is_hidden || false,
          addressBookEnabled: g.address_book_enabled || false,
          addressBookType: g.address_book_type || null,
          resetOnTemplateLoad: g.reset_on_template_load || false,
          removeIfEmpty: g.remove_if_empty || false
        })),
        fields: (fieldsRes.data || []).map(f => ({
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
          dropdownOptions: f.dropdown_options,
          dropdownDisplayMode: f.dropdown_display_mode,
          jsonPath: f.json_path,
          isArrayField: f.is_array_field,
          arrayMinRows: f.array_min_rows,
          arrayMaxRows: f.array_max_rows,
          aiExtractionInstructions: f.ai_extraction_instructions,
          validationRegex: f.validation_regex,
          validationErrorMessage: f.validation_error_message,
          fieldOrder: f.field_order,
          copyFromField: f.copy_from_field,
          useClientIdDefault: f.use_client_id_default || false,
          addressBookField: f.address_book_field || null,
          futureDatesOnly: f.future_dates_only || false,
          allowWeekends: f.allow_weekends !== false,
          allowHolidays: f.allow_holidays !== false,
          hiddenFromClient: f.hidden_from_client || false,
          countChildArrayRecords: f.count_child_array_records || false,
          countChildArrayGroupId: f.count_child_array_group_id || null,
          apiLookupEndpoint: f.api_lookup_endpoint || null,
          apiLookupSecondaryApiId: f.api_lookup_secondary_api_id || null,
          apiLookupSpecId: f.api_lookup_spec_id || null,
          apiLookupDisplayColumns: f.api_lookup_display_columns || null,
          apiLookupValueField: f.api_lookup_value_field || null,
          apiLookupFieldMappings: f.api_lookup_field_mappings || null,
          apiLookupSearchParam: f.api_lookup_search_param || null
        })),
        layouts: (layoutsRes.data || []).map(l => ({
          fieldId: l.field_id,
          rowIndex: l.row_index,
          columnIndex: l.column_index,
          widthColumns: l.width_columns,
          mobileWidthColumns: l.mobile_width_columns
        })),
        documentTypes: (docTypesRes.data || []).map(d => ({
          name: d.name,
          sortOrder: d.sort_order,
          isRequired: d.is_required,
          actionType: d.action_type,
          emailRecipients: d.email_recipients,
          emailSubjectTemplate: d.email_subject_template,
          imagingBucketId: d.imaging_bucket_id,
          imagingDocumentTypeId: d.imaging_document_type_id,
          renameTemplate: d.rename_template,
          allowedFileTypes: d.allowed_file_types
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-entry-template-${template.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Template exported successfully');
    } catch (err: any) {
      toast.error('Failed to export template: ' + err.message);
    }
  };

  const handleImportComplete = async () => {
    setShowImportModal(false);
    await loadTemplates();
  };

  const handleExportFieldGroup = (group: OrderEntryFieldGroup) => {
    const groupFields = fields.filter(f => f.fieldGroupId === group.id);
    const groupFieldIds = new Set(groupFields.map(f => f.id));
    const groupLayouts = fieldLayouts.filter(l => groupFieldIds.has(l.fieldId));

    const exportData = {
      version: '1.0',
      type: 'order_entry_field_group',
      exportedAt: new Date().toISOString(),
      group: {
        id: group.id,
        groupName: group.groupName,
        groupOrder: group.groupOrder,
        description: group.description,
        isCollapsible: group.isCollapsible,
        isExpandedByDefault: group.isExpandedByDefault,
        backgroundColor: group.backgroundColor,
        borderColor: group.borderColor,
        isArrayGroup: group.isArrayGroup,
        arrayMinRows: group.arrayMinRows,
        arrayMaxRows: group.arrayMaxRows,
        arrayJsonPath: group.arrayJsonPath,
        hideAddRow: group.hideAddRow,
        isHidden: group.isHidden || false,
        addressBookEnabled: group.addressBookEnabled || false,
        addressBookType: group.addressBookType || null,
        resetOnTemplateLoad: group.resetOnTemplateLoad || false
      },
      fields: groupFields.map(f => ({
        id: f.id,
        fieldName: f.fieldName,
        fieldLabel: f.fieldLabel,
        fieldType: f.fieldType,
        placeholder: f.placeholder,
        helpText: f.helpText,
        isRequired: f.isRequired,
        maxLength: f.maxLength,
        minValue: f.minValue,
        maxValue: f.maxValue,
        defaultValue: f.defaultValue,
        dropdownOptions: f.dropdownOptions,
        dropdownDisplayMode: f.dropdownDisplayMode,
        jsonPath: f.jsonPath,
        isArrayField: f.isArrayField,
        arrayMinRows: f.arrayMinRows,
        arrayMaxRows: f.arrayMaxRows,
        aiExtractionInstructions: f.aiExtractionInstructions,
        validationRegex: f.validationRegex,
        validationErrorMessage: f.validationErrorMessage,
        fieldOrder: f.fieldOrder,
        copyFromField: f.copyFromField,
        useClientIdDefault: f.useClientIdDefault || false,
        futureDatesOnly: f.futureDatesOnly || false,
        allowWeekends: f.allowWeekends !== false,
        allowHolidays: f.allowHolidays !== false,
        hiddenFromClient: f.hiddenFromClient || false
      })),
      layouts: groupLayouts.map(l => ({
        fieldId: l.fieldId,
        rowIndex: l.rowIndex,
        columnIndex: l.columnIndex,
        widthColumns: l.widthColumns,
        mobileWidthColumns: l.mobileWidthColumns
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-group-${group.groupName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Field group "${group.groupName}" exported`);
  };

  const handleImportFieldGroup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedTemplateId) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || data.type !== 'order_entry_field_group') {
        toast.error('Invalid file: not a field group export file.');
        return;
      }
      if (!data.group || !data.group.groupName) {
        toast.error('Invalid file: missing group data.');
        return;
      }
      if (!Array.isArray(data.fields)) {
        toast.error('Invalid file: fields must be an array.');
        return;
      }

      setIsSaving(true);

      const { data: newGroup, error: groupError } = await supabase
        .from('order_entry_template_field_groups')
        .insert([{
          template_id: selectedTemplateId,
          group_name: data.group.groupName,
          group_order: fieldGroups.length,
          description: data.group.description || null,
          is_collapsible: data.group.isCollapsible || false,
          is_expanded_by_default: data.group.isExpandedByDefault ?? true,
          background_color: data.group.backgroundColor || '#ffffff',
          border_color: data.group.borderColor || '#14b8a6',
          is_array_group: data.group.isArrayGroup || false,
          array_min_rows: data.group.arrayMinRows || 1,
          array_max_rows: data.group.arrayMaxRows || 10,
          array_json_path: data.group.arrayJsonPath || null,
          hide_add_row: data.group.hideAddRow || false,
          is_hidden: data.group.isHidden || false,
          address_book_enabled: data.group.addressBookEnabled || false,
          address_book_type: data.group.addressBookType || null,
          reset_on_template_load: data.group.resetOnTemplateLoad || false,
          remove_if_empty: data.group.removeIfEmpty || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (groupError) throw groupError;

      const fieldIdMap: Record<string, string> = {};

      for (const field of data.fields) {
        const { data: newField, error: fieldError } = await supabase
          .from('order_entry_template_fields')
          .insert([{
            template_id: selectedTemplateId,
            field_group_id: newGroup.id,
            field_name: field.fieldName,
            field_label: field.fieldLabel,
            field_type: field.fieldType,
            placeholder: field.placeholder || null,
            help_text: field.helpText || null,
            is_required: field.isRequired || false,
            max_length: field.maxLength || null,
            min_value: field.minValue || null,
            max_value: field.maxValue || null,
            default_value: field.defaultValue || null,
            dropdown_options: field.dropdownOptions || [],
            dropdown_display_mode: field.dropdownDisplayMode || 'description_only',
            json_path: field.jsonPath || null,
            is_array_field: field.isArrayField || false,
            array_min_rows: field.arrayMinRows || 1,
            array_max_rows: field.arrayMaxRows || 10,
            ai_extraction_instructions: field.aiExtractionInstructions || null,
            validation_regex: field.validationRegex || null,
            validation_error_message: field.validationErrorMessage || null,
            field_order: field.fieldOrder,
            copy_from_field: field.copyFromField || null,
            use_client_id_default: field.useClientIdDefault || false,
            address_book_field: field.addressBookField || null,
            future_dates_only: field.futureDatesOnly || false,
            allow_weekends: field.allowWeekends !== false,
            allow_holidays: field.allowHolidays !== false,
            hidden_from_client: field.hiddenFromClient || false,
            count_child_array_records: field.countChildArrayRecords || false,
            count_child_array_group_id: field.countChildArrayGroupId || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (fieldError) throw fieldError;
        fieldIdMap[field.id] = newField.id;
      }

      if (Array.isArray(data.layouts) && data.layouts.length > 0) {
        const layoutsToInsert = data.layouts
          .filter((l: any) => fieldIdMap[l.fieldId])
          .map((l: any) => ({
            template_id: selectedTemplateId,
            field_id: fieldIdMap[l.fieldId],
            row_index: l.rowIndex,
            column_index: l.columnIndex,
            width_columns: l.widthColumns,
            mobile_width_columns: l.mobileWidthColumns || 12,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        if (layoutsToInsert.length > 0) {
          const { error: layoutError } = await supabase
            .from('order_entry_template_field_layout')
            .insert(layoutsToInsert);
          if (layoutError) throw layoutError;
        }
      }

      toast.success(`Field group "${data.group.groupName}" imported successfully`);
      await loadTemplateData(selectedTemplateId);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        toast.error('Invalid JSON file.');
      } else {
        toast.error('Import failed: ' + err.message);
      }
    } finally {
      setIsSaving(false);
      if (groupImportInputRef.current) {
        groupImportInputRef.current.value = '';
      }
    }
  };

  const handleCopyFromGlobal = async () => {
    if (!editingTemplate?.name?.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsSaving(true);
    try {
      const { data: templateData, error: templateError } = await supabase
        .from('order_entry_templates')
        .insert([{
          name: editingTemplate.name.trim(),
          description: editingTemplate.description?.trim() || 'Copied from global configuration',
          extraction_type_id: editingTemplate.extractionTypeId || null,
          confirmation_number_field: editingTemplate.confirmationNumberField?.trim() || null,
          hide_pdf_autofill: editingTemplate.hidePdfAutofill ?? false,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (templateError) throw templateError;

      const [globalGroupsRes, globalFieldsRes, globalLayoutsRes] = await Promise.all([
        supabase.from('order_entry_field_groups').select('*').order('group_order'),
        supabase.from('order_entry_fields').select('*').order('field_order'),
        supabase.from('order_entry_field_layout').select('*')
      ]);

      if (globalGroupsRes.error) throw globalGroupsRes.error;
      if (globalFieldsRes.error) throw globalFieldsRes.error;
      if (globalLayoutsRes.error) throw globalLayoutsRes.error;

      const groupIdMap: Record<string, string> = {};
      const fieldIdMap: Record<string, string> = {};

      if (globalGroupsRes.data && globalGroupsRes.data.length > 0) {
        for (const group of globalGroupsRes.data) {
          const { data: newGroup, error: groupError } = await supabase
            .from('order_entry_template_field_groups')
            .insert([{
              template_id: templateData.id,
              group_name: group.group_name,
              group_order: group.group_order,
              description: group.description,
              is_collapsible: group.is_collapsible,
              is_expanded_by_default: group.is_expanded_by_default,
              background_color: group.background_color,
              border_color: group.border_color,
              is_array_group: group.is_array_group,
              array_min_rows: group.array_min_rows,
              array_max_rows: group.array_max_rows,
              array_json_path: group.array_json_path,
              is_hidden: group.is_hidden || false,
              address_book_enabled: group.address_book_enabled || false,
              address_book_type: group.address_book_type || null,
              remove_if_empty: group.remove_if_empty || false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (groupError) throw groupError;
          groupIdMap[group.id] = newGroup.id;
        }
      }

      if (globalFieldsRes.data && globalFieldsRes.data.length > 0) {
        for (const field of globalFieldsRes.data) {
          const newGroupId = groupIdMap[field.field_group_id];
          if (!newGroupId) continue;

          const { data: newField, error: fieldError } = await supabase
            .from('order_entry_template_fields')
            .insert([{
              template_id: templateData.id,
              field_group_id: newGroupId,
              field_name: field.field_name,
              field_label: field.field_label,
              field_type: field.field_type,
              placeholder: field.placeholder,
              help_text: field.help_text,
              is_required: field.is_required,
              max_length: field.max_length,
              min_value: field.min_value,
              max_value: field.max_value,
              default_value: field.default_value,
              dropdown_options: field.dropdown_options,
              json_path: field.json_path,
              is_array_field: field.is_array_field,
              array_min_rows: field.array_min_rows,
              array_max_rows: field.array_max_rows,
              ai_extraction_instructions: field.ai_extraction_instructions,
              validation_regex: field.validation_regex,
              validation_error_message: field.validation_error_message,
              field_order: field.field_order,
              use_client_id_default: field.use_client_id_default || false,
              address_book_field: field.address_book_field || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (fieldError) throw fieldError;
          fieldIdMap[field.id] = newField.id;
        }
      }

      if (globalLayoutsRes.data && globalLayoutsRes.data.length > 0) {
        const layoutsToInsert = globalLayoutsRes.data
          .filter(layout => fieldIdMap[layout.field_id])
          .map(layout => ({
            template_id: templateData.id,
            field_id: fieldIdMap[layout.field_id],
            row_index: layout.row_index,
            column_index: layout.column_index,
            width_columns: layout.width_columns,
            mobile_width_columns: layout.mobile_width_columns,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        if (layoutsToInsert.length > 0) {
          const { error: layoutError } = await supabase
            .from('order_entry_template_field_layout')
            .insert(layoutsToInsert);

          if (layoutError) throw layoutError;
        }
      }

      toast.success('Template created from global configuration');
      setShowCopyFromGlobalModal(false);
      setEditingTemplate(null);
      await loadTemplates();
      setSelectedTemplateId(templateData.id);
    } catch (err: any) {
      toast.error('Failed to copy from global: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGroup = async () => {
    if (!editingGroup?.groupName?.trim() || !selectedTemplateId) {
      toast.error('Group name is required');
      return;
    }

    setIsSaving(true);
    try {
      const groupData = {
        template_id: selectedTemplateId,
        group_name: editingGroup.groupName.trim(),
        group_order: editingGroup.groupOrder || fieldGroups.length,
        description: editingGroup.description || null,
        is_collapsible: editingGroup.isCollapsible || false,
        is_expanded_by_default: editingGroup.isExpandedByDefault ?? true,
        background_color: editingGroup.backgroundColor || '#ffffff',
        border_color: editingGroup.borderColor || '#14b8a6',
        is_array_group: editingGroup.isArrayGroup || false,
        array_min_rows: editingGroup.arrayMinRows || 1,
        array_max_rows: editingGroup.arrayMaxRows || 10,
        array_json_path: editingGroup.arrayJsonPath || null,
        hide_add_row: editingGroup.hideAddRow || false,
        is_hidden: editingGroup.isHidden || false,
        address_book_enabled: editingGroup.addressBookEnabled || false,
        address_book_type: editingGroup.addressBookEnabled ? (editingGroup.addressBookType || 'both') : null,
        parent_group_id: editingGroup.parentGroupId || null,
        child_button_label: editingGroup.childButtonLabel || null,
        reset_on_template_load: editingGroup.resetOnTemplateLoad || false,
        remove_if_empty: editingGroup.removeIfEmpty || false,
        updated_at: new Date().toISOString()
      };

      if (editingGroup.id) {
        const { error } = await supabase
          .from('order_entry_template_field_groups')
          .update(groupData)
          .eq('id', editingGroup.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('order_entry_template_field_groups')
          .insert([{ ...groupData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      toast.success(editingGroup.id ? 'Group updated' : 'Group created');
      setShowGroupModal(false);
      setEditingGroup(null);
      await loadTemplateData(selectedTemplateId);
    } catch (err: any) {
      toast.error('Failed to save group: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('order_entry_template_field_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      toast.success('Group deleted');
      setGroupToDelete(null);
      if (selectedTemplateId) {
        await loadTemplateData(selectedTemplateId);
      }
    } catch (err: any) {
      toast.error('Failed to delete group: ' + err.message);
    }
  };

  const handleSaveField = async () => {
    if (!editingField?.fieldName?.trim() || !editingField?.fieldLabel?.trim() || !selectedTemplateId) {
      toast.error('Field name and label are required');
      return;
    }

    if (editingField.fieldType === 'api_lookup' && !editingField.apiLookupEndpoint?.trim() && !editingField.apiLookupSecondaryApiId) {
      toast.error('API Lookup fields require an endpoint path or a secondary API');
      return;
    }

    setIsSaving(true);
    try {
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
        template_id: selectedTemplateId,
        field_group_id: editingField.fieldGroupId,
        field_name: editingField.fieldName.trim(),
        field_label: editingField.fieldLabel.trim(),
        field_type: editingField.fieldType || 'text',
        placeholder: editingField.placeholder || null,
        help_text: editingField.helpText || null,
        is_required: editingField.isRequired || false,
        max_length: editingField.maxLength || null,
        min_value: editingField.minValue || null,
        max_value: editingField.maxValue || null,
        default_value: editingField.defaultValue || null,
        dropdown_options: cleanedDropdownOptions,
        dropdown_display_mode: editingField.dropdownDisplayMode || 'description_only',
        json_path: editingField.jsonPath || null,
        is_array_field: editingField.isArrayField || false,
        array_min_rows: editingField.arrayMinRows || 1,
        array_max_rows: editingField.arrayMaxRows || 10,
        ai_extraction_instructions: editingField.aiExtractionInstructions || null,
        validation_regex: editingField.validationRegex || null,
        validation_error_message: editingField.validationErrorMessage || null,
        field_order: editingField.fieldOrder || fields.filter(f => f.fieldGroupId === editingField.fieldGroupId).length,
        copy_from_field: editingField.copyFromField || null,
        use_client_id_default: editingField.useClientIdDefault || false,
        address_book_field: editingField.addressBookField || null,
        future_dates_only: editingField.futureDatesOnly || false,
        allow_weekends: editingField.allowWeekends !== false,
        allow_holidays: editingField.allowHolidays !== false,
        hidden_from_client: editingField.hiddenFromClient || false,
        count_child_array_records: editingField.countChildArrayRecords || false,
        count_child_array_group_id: editingField.countChildArrayGroupId || null,
        exclusion_groups: editingField.exclusionGroups?.filter(g => g.length > 0)?.length ? editingField.exclusionGroups.filter(g => g.length > 0) : null,
        api_lookup_endpoint: editingField.apiLookupEndpoint || null,
        api_lookup_secondary_api_id: editingField.apiLookupSecondaryApiId || null,
        api_lookup_spec_id: editingField.apiLookupSpecId || null,
        api_lookup_display_columns: editingField.apiLookupDisplayColumns?.length ? editingField.apiLookupDisplayColumns : null,
        api_lookup_value_field: editingField.apiLookupValueField || null,
        api_lookup_field_mappings: editingField.apiLookupFieldMappings?.length ? editingField.apiLookupFieldMappings : null,
        api_lookup_search_param: editingField.apiLookupSearchParam || null,
        api_lookup_http_method: editingField.apiLookupHttpMethod || 'GET',
        api_lookup_request_body: editingField.apiLookupRequestBody || null,
        api_lookup_request_body_mappings: editingField.apiLookupRequestBodyMappings?.length ? editingField.apiLookupRequestBodyMappings : null,
        api_lookup_wrap_body_in_array: editingField.apiLookupWrapBodyInArray || false,
        updated_at: new Date().toISOString()
      };

      if (editingField.id) {
        const { error } = await supabase
          .from('order_entry_template_fields')
          .update(fieldData)
          .eq('id', editingField.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('order_entry_template_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      toast.success(editingField.id ? 'Field updated' : 'Field created');
      setShowFieldModal(false);
      setEditingField(null);
      await loadTemplateData(selectedTemplateId);
    } catch (err: any) {
      toast.error('Failed to save field: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('order_entry_template_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;

      toast.success('Field deleted');
      setFieldToDelete(null);
      if (selectedTemplateId) {
        await loadTemplateData(selectedTemplateId);
      }
    } catch (err: any) {
      toast.error('Failed to delete field: ' + err.message);
    }
  };

  const saveLayoutToDatabase = async (layouts: OrderEntryFieldLayout[], templateId: string) => {
    try {
      setLayoutSaveStatus('saving');

      const layoutsToUpsert = layouts.map(layout => ({
        template_id: templateId,
        field_id: layout.fieldId,
        row_index: layout.rowIndex,
        column_index: layout.columnIndex,
        width_columns: layout.widthColumns,
        mobile_width_columns: layout.mobileWidthColumns,
        updated_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('order_entry_template_field_layout')
        .upsert(layoutsToUpsert, {
          onConflict: 'template_id,field_id',
          ignoreDuplicates: false
        })
        .select();

      if (error) throw error;

      const updatedLayouts: OrderEntryFieldLayout[] = (data || []).map(d => ({
        id: d.id,
        templateId: d.template_id,
        fieldId: d.field_id,
        rowIndex: d.row_index,
        columnIndex: d.column_index,
        widthColumns: d.width_columns,
        mobileWidthColumns: d.mobile_width_columns,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));

      const deletedFieldIds = fieldLayouts
        .map(l => l.fieldId)
        .filter(id => !layouts.find(l => l.fieldId === id));

      if (deletedFieldIds.length > 0) {
        await supabase
          .from('order_entry_template_field_layout')
          .delete()
          .eq('template_id', templateId)
          .in('field_id', deletedFieldIds);
      }

      setFieldLayouts(updatedLayouts);
      setLayoutSaveStatus('saved');

      setTimeout(() => {
        setLayoutSaveStatus('idle');
      }, 2000);
    } catch (err: any) {
      setLayoutSaveStatus('error');
      toast.error('Failed to save layout: ' + err.message);
    }
  };

  const handleLayoutChange = useCallback((layouts: OrderEntryFieldLayout[]) => {
    if (!selectedTemplateId) return;

    setFieldLayouts(layouts);
    setLayoutSaveStatus('saving');

    if (layoutSaveTimeoutRef.current) {
      clearTimeout(layoutSaveTimeoutRef.current);
    }

    layoutSaveTimeoutRef.current = setTimeout(() => {
      saveLayoutToDatabase(layouts, selectedTemplateId);
    }, 800);
  }, [selectedTemplateId, fieldLayouts]);

  const handleGroupOrderChange = useCallback(async (updatedGroups: OrderEntryFieldGroup[]) => {
    if (!selectedTemplateId) return;

    setFieldGroups(updatedGroups);
    setLayoutSaveStatus('saving');

    try {
      for (const group of updatedGroups) {
        const { error } = await supabase
          .from('order_entry_template_field_groups')
          .update({ group_order: group.groupOrder })
          .eq('id', group.id);

        if (error) throw error;
      }
      setLayoutSaveStatus('saved');
      setTimeout(() => setLayoutSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving group order:', error);
      setLayoutSaveStatus('error');
      toast.error('Failed to save group order');
    }
  }, [selectedTemplateId]);

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

  const handleSaveDocType = async () => {
    if (!editingDocType || !selectedTemplateId || !editingDocType.name?.trim()) return;
    setIsSaving(true);
    try {
      if (editingDocType.id) {
        const { error } = await supabase
          .from('order_entry_template_document_types')
          .update({
            name: editingDocType.name.trim(),
            sort_order: editingDocType.sortOrder ?? 0,
            is_required: editingDocType.isRequired ?? false,
            action_type: editingDocType.actionType || 'email',
            email_recipients: editingDocType.emailRecipients?.trim() || null,
            email_subject_template: editingDocType.emailSubjectTemplate?.trim() || null,
            imaging_bucket_id: editingDocType.imagingBucketId || null,
            imaging_document_type_id: editingDocType.imagingDocumentTypeId || null,
            rename_template: editingDocType.renameTemplate?.trim() || null,
            allowed_file_types: editingDocType.allowedFileTypes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingDocType.id);
        if (error) throw error;
        toast.success('Document type updated');
      } else {
        const { error } = await supabase
          .from('order_entry_template_document_types')
          .insert([{
            template_id: selectedTemplateId,
            name: editingDocType.name.trim(),
            sort_order: editingDocType.sortOrder ?? documentTypes.length,
            is_required: editingDocType.isRequired ?? false,
            action_type: editingDocType.actionType || 'email',
            email_recipients: editingDocType.emailRecipients?.trim() || null,
            email_subject_template: editingDocType.emailSubjectTemplate?.trim() || null,
            imaging_bucket_id: editingDocType.imagingBucketId || null,
            imaging_document_type_id: editingDocType.imagingDocumentTypeId || null,
            rename_template: editingDocType.renameTemplate?.trim() || null,
            allowed_file_types: editingDocType.allowedFileTypes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        if (error) throw error;
        toast.success('Document type created');
      }
      setShowDocTypeModal(false);
      setEditingDocType(null);
      await loadTemplateData(selectedTemplateId);
    } catch (err: any) {
      toast.error('Failed to save document type: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocType = async () => {
    if (!docTypeToDelete || !selectedTemplateId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('order_entry_template_document_types')
        .delete()
        .eq('id', docTypeToDelete.id);
      if (error) throw error;
      toast.success('Document type deleted');
      setDocTypeToDelete(null);
      await loadTemplateData(selectedTemplateId);
    } catch (err: any) {
      toast.error('Failed to delete document type: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewForm = async () => {
    if (fields.length === 0 || !selectedTemplateId) return;

    setLoadingPreview(true);

    if (layoutSaveTimeoutRef.current) {
      clearTimeout(layoutSaveTimeoutRef.current);
      await saveLayoutToDatabase(fieldLayouts, selectedTemplateId);
    }

    await loadTemplateData(selectedTemplateId);

    setTimeout(() => {
      setShowPreviewModal(true);
      setLoadingPreview(false);
    }, 100);
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Order Entry Templates</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Create and manage templates to assign different forms to clients
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="Import template from JSON file"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            {selectedTemplateId && (
              <button
                onClick={handleExportTemplate}
                className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Export selected template as JSON"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
            )}
            <button
              onClick={() => {
                setEditingTemplate({ name: '', description: '', isActive: true });
                setShowCopyFromGlobalModal(true);
              }}
              className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy From Global
            </button>
            {selectedTemplateId && fields.length > 0 && (
              <button
                onClick={handlePreviewForm}
                disabled={loadingPreview}
                className="flex items-center px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                title="Preview form configuration"
              >
                <Eye className={`h-4 w-4 mr-2 ${loadingPreview ? 'animate-pulse' : ''}`} />
                Preview
              </button>
            )}
            <button
              onClick={() => {
                setEditingTemplate({ name: '', description: '', isActive: true });
                setShowCreateModal(true);
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No templates yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Create a template or copy from global configuration
            </p>
          </div>
        ) : (
          <div className="flex items-center space-x-4 mb-6">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Template:
            </label>
            <div className="flex-1 max-w-md">
              <Select
                value={selectedTemplateId || ''}
                onValueChange={setSelectedTemplateId}
                options={templates.map(t => ({
                  value: t.id,
                  label: `${t.name}${t.isActive ? '' : ' (Inactive)'}`
                }))}
                searchable
              />
            </div>
            {selectedTemplate && (
              <>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setEditingTemplate(selectedTemplate);
                      setShowEditModal(true);
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    title="Edit template"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setTemplateToDelete(selectedTemplate);
                      setShowDeleteModal(true);
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="ml-4 pl-4 border-l border-gray-300 dark:border-gray-600">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Extraction Type:</span>
                  <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedTemplate.extractionTypeId
                      ? extractionTypes.find(et => et.id === selectedTemplate.extractionTypeId)?.name || 'Unknown'
                      : 'None'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {selectedTemplate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
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
                <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                  Field Groups - {selectedTemplate.name}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedTemplate.description || 'Configure fields for this template'}
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
                onClick={() => groupImportInputRef.current?.click()}
                className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Import a field group from JSON file"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Group
              </button>
              <input
                ref={groupImportInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFieldGroup}
                className="hidden"
              />
              <button
                onClick={() => {
                  setEditingGroup({
                    groupName: '',
                    groupOrder: fieldGroups.length,
                    isCollapsible: false,
                    isExpandedByDefault: true,
                    backgroundColor: '#ffffff',
                    borderColor: '#14b8a6',
                    isArrayGroup: false,
                    arrayMinRows: 1,
                    arrayMaxRows: 10
                  });
                  setShowGroupModal(true);
                }}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Group
              </button>
            </div>
          )}

          {!collapsedSections.fieldGroups && (
          <div className="space-y-4">
            {fieldGroups.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <p className="text-gray-600 dark:text-gray-400">No field groups yet</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                  Add a group to start building the form
                </p>
              </div>
            ) : (
              fieldGroups.map(group => {
                const isCollapsed = collapsedGroups.has(group.id);
                const groupFields = fields.filter(f => f.fieldGroupId === group.id);

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
                                {groupFields.length} {groupFields.length === 1 ? 'field' : 'fields'}
                              </span>
                              {group.isArrayGroup && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                  Array Group
                                </span>
                              )}
                              {group.parentGroupId && (
                                <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                                  Child of: {fieldGroups.find(g => g.id === group.parentGroupId)?.groupName || 'Unknown'}
                                </span>
                              )}
                              {(group as any).isHidden && (
                                <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                                  Hidden
                                </span>
                              )}
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
                              fieldGroupId: group.id,
                              fieldName: '',
                              fieldLabel: '',
                              fieldType: 'text',
                              isRequired: false,
                              dropdownOptions: [],
                              isArrayField: false,
                              arrayMinRows: 1,
                              arrayMaxRows: 10,
                              fieldOrder: groupFields.length
                            });
                            setShowFieldModal(true);
                          }}
                          className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                          title="Add Field"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleExportFieldGroup(group)}
                          className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Export Field Group"
                        >
                          <Download className="h-4 w-4" />
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
                          onClick={() => setGroupToDelete(group)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete Group"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-2 ml-8">
                        {groupFields.map(field => (
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
                                  {field.jsonPath && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded font-mono">
                                      {field.jsonPath}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  setEditingField(field);
                                  setShowFieldModal(true);
                                }}
                                className="p-1 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                title="Edit Field"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setConditionsField(field)}
                                className={`p-1 rounded transition-colors ${
                                  field.conditionalVisibilityFieldId || field.conditionalRequiredFieldId
                                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                    : 'text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                title="Conditional Logic"
                              >
                                <GitBranch className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setFieldToDelete(field)}
                                className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                title="Delete Field"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
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
          )}
        </div>
      )}

      {selectedTemplate && fields.length > 0 && (
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
                onGroupOrderChange={handleGroupOrderChange}
              />
            </div>
          )}
        </div>
      )}

      {selectedTemplate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <button
            onClick={() => toggleSectionCollapse('documentTypes')}
            className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center space-x-3">
              {collapsedSections.documentTypes ? (
                <ChevronRight className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Document Upload Types</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure document types clients can upload with their order ({documentTypes.length} configured)
                </p>
              </div>
            </div>
            <Paperclip className="h-5 w-5 text-gray-400" />
          </button>

          {!collapsedSections.documentTypes && (
            <div className="mt-4 space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => { setEditingDocType({ actionType: 'email', isRequired: false, sortOrder: documentTypes.length }); setShowDocTypeModal(true); }}
                  className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document Type
                </button>
              </div>

              {documentTypes.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No document types configured. Add one to allow clients to upload documents.</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Name</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Required</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">File Types</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Action</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Rename Template</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {documentTypes.map(dt => (
                        <tr key={dt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-2 text-gray-900 dark:text-gray-100 font-medium">{dt.name}</td>
                          <td className="px-4 py-2">
                            {dt.isRequired ? (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">Required</span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded-full">Optional</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs">
                            {dt.allowedFileTypes ? dt.allowedFileTypes.split(',').map(t => t.trim().toUpperCase()).join(', ') : 'All'}
                          </td>
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                            {dt.actionType === 'email' ? 'Email' : dt.actionType === 'imaging' ? 'Send to Imaging' : 'Email + Imaging'}
                          </td>
                          <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                            {dt.renameTemplate || '—'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => { setEditingDocType(dt); setShowDocTypeModal(true); }}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDocTypeToDelete(dt)}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
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
          )}
        </div>
      )}

      {showCreateModal && createPortal(
        <TemplateModal
          title="Create New Template"
          template={editingTemplate}
          onChange={setEditingTemplate}
          onSave={handleCreateTemplate}
          onClose={() => { setShowCreateModal(false); setEditingTemplate(null); }}
          isSaving={isSaving}
          extractionTypes={extractionTypes}
        />,
        document.body
      )}

      {showEditModal && createPortal(
        <TemplateModal
          title="Edit Template"
          template={editingTemplate}
          onChange={setEditingTemplate}
          onSave={handleUpdateTemplate}
          onClose={() => { setShowEditModal(false); setEditingTemplate(null); }}
          isSaving={isSaving}
          extractionTypes={extractionTypes}
        />,
        document.body
      )}

      {showDeleteModal && templateToDelete && createPortal(
        <DeleteConfirmModal
          templateName={templateToDelete.name}
          onConfirm={handleDeleteTemplate}
          onClose={() => { setShowDeleteModal(false); setTemplateToDelete(null); }}
          isSaving={isSaving}
        />,
        document.body
      )}

      {showCopyFromGlobalModal && createPortal(
        <TemplateModal
          title="Copy From Global Configuration"
          template={editingTemplate}
          onChange={setEditingTemplate}
          onSave={handleCopyFromGlobal}
          onClose={() => { setShowCopyFromGlobalModal(false); setEditingTemplate(null); }}
          isSaving={isSaving}
          extractionTypes={extractionTypes}
          saveButtonText="Create and Copy"
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
          fieldGroups={fieldGroups}
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
          extractionTypeFieldMappings={
            selectedTemplate?.extractionTypeId
              ? extractionTypes.find(et => et.id === selectedTemplate.extractionTypeId)?.fieldMappings || []
              : []
          }
          allFields={fields}
          fieldGroups={fieldGroups}
        />,
        document.body
      )}

      <FormPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        fields={fields}
        fieldGroups={fieldGroups}
        layouts={fieldLayouts}
      />

      {showImportModal && (
        <OrderEntryTemplateImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {showDocTypeModal && editingDocType && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowDocTypeModal(false); setEditingDocType(null); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingDocType.id ? 'Edit Document Type' : 'Add Document Type'}
              </h3>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={editingDocType.name || ''}
                  onChange={(e) => setEditingDocType({ ...editingDocType, name: e.target.value })}
                  placeholder="e.g., Bill of Lading, POD, Invoice"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={editingDocType.sortOrder ?? 0}
                    onChange={(e) => setEditingDocType({ ...editingDocType, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingDocType.isRequired ?? false}
                      onChange={(e) => setEditingDocType({ ...editingDocType, isRequired: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allowed File Types</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'pdf', label: 'PDF' },
                    { value: 'doc', label: 'Doc' },
                    { value: 'excel', label: 'Excel' },
                    { value: 'image', label: 'Image' }
                  ].map(ft => {
                    const selected = (editingDocType.allowedFileTypes || '').split(',').filter(Boolean).map(s => s.trim());
                    const isActive = selected.includes(ft.value);
                    return (
                      <button
                        key={ft.value}
                        type="button"
                        onClick={() => {
                          const current = (editingDocType.allowedFileTypes || '').split(',').filter(Boolean).map(s => s.trim());
                          const updated = isActive ? current.filter(v => v !== ft.value) : [...current, ft.value];
                          setEditingDocType({ ...editingDocType, allowedFileTypes: updated.length > 0 ? updated.join(',') : '' });
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600'
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                        }`}
                      >
                        {ft.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty to allow all file types</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action on Submit</label>
                <CustomDropdown
                  value={editingDocType.actionType || 'email'}
                  onChange={(val) => setEditingDocType({ ...editingDocType, actionType: val as 'email' | 'imaging' | 'both' })}
                  options={[
                    { value: 'email', label: 'Email Documents' },
                    { value: 'imaging', label: 'Send to Parse-It Imaging' },
                    { value: 'both', label: 'Email + Send to Imaging' }
                  ]}
                />
              </div>

              {(editingDocType.actionType === 'email' || editingDocType.actionType === 'both') && (
                <>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Recipients</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingDocType.emailRecipients || ''}
                        onChange={(e) => setEditingDocType({ ...editingDocType, emailRecipients: e.target.value })}
                        placeholder="email1@example.com, email2@example.com"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUserPicker(!showUserPicker)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                        title="Select from users"
                      >
                        <Users className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Comma-separated list of recipients</p>
                    {showUserPicker && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-72 max-h-52 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                        {adminUsers.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">No users with email found</div>
                        ) : (
                          adminUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => addUserEmail(u.email)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                            >
                              <div className="font-medium text-gray-900 dark:text-gray-100">{u.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Subject Template</label>
                      <button
                        type="button"
                        onClick={() => setShowVariablePicker(showVariablePicker === 'emailSubject' ? null : 'emailSubject')}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title="Insert variable"
                      >
                        <span className="font-bold">{'{ }'}</span>
                      </button>
                    </div>
                    <input
                      ref={emailSubjectRef}
                      type="text"
                      value={editingDocType.emailSubjectTemplate || ''}
                      onChange={(e) => setEditingDocType({ ...editingDocType, emailSubjectTemplate: e.target.value })}
                      placeholder="e.g., {{clientCode}} - {{documentType}} - {{date}}"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                    {showVariablePicker === 'emailSubject' && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                        {getAvailableVariables().map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => insertVariable('emailSubject', v)}
                            className="w-full text-left px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm font-mono text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                          >
                            {`{{${v}}}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {(editingDocType.actionType === 'imaging' || editingDocType.actionType === 'both') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imaging Bucket *</label>
                    <CustomDropdown
                      value={editingDocType.imagingBucketId || ''}
                      onChange={(val) => setEditingDocType({ ...editingDocType, imagingBucketId: val || undefined })}
                      options={[
                        { value: '', label: 'Select a bucket...' },
                        ...imagingBuckets.map(b => ({ value: b.id, label: b.name }))
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document Type (optional)</label>
                    <CustomDropdown
                      value={editingDocType.imagingDocumentTypeId || ''}
                      onChange={(val) => setEditingDocType({ ...editingDocType, imagingDocumentTypeId: val || undefined })}
                      options={[
                        { value: '', label: 'None' },
                        ...imagingDocTypes.map(dt => ({ value: dt.id, label: dt.name }))
                      ]}
                    />
                  </div>
                </>
              )}

              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rename Template</label>
                  <button
                    type="button"
                    onClick={() => setShowVariablePicker(showVariablePicker === 'rename' ? null : 'rename')}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Insert variable"
                  >
                    <span className="font-bold">{'{ }'}</span>
                  </button>
                </div>
                <input
                  ref={renameTemplateRef}
                  type="text"
                  value={editingDocType.renameTemplate || ''}
                  onChange={(e) => setEditingDocType({ ...editingDocType, renameTemplate: e.target.value })}
                  placeholder="e.g., {{billNumber}}_{{documentType}}_{{date}}"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variables: {'{{documentType}}'}, {'{{date}}'}, {'{{timestamp}}'}, {'{{clientCode}}'}, {'{{submissionId}}'}, or any form field name
                </p>
                {showVariablePicker === 'rename' && (
                  <div className="absolute left-0 right-0 bottom-full mb-1 z-50 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                    {getAvailableVariables().map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable('rename', v)}
                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm font-mono text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => { setShowDocTypeModal(false); setEditingDocType(null); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDocType}
                disabled={isSaving || !editingDocType.name?.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingDocType.id ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {docTypeToDelete && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDocTypeToDelete(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Document Type</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
                Are you sure you want to delete <span className="font-semibold">"{docTypeToDelete.name}"</span>?
              </p>
            </div>
            <div className="px-6 pb-6 flex justify-end space-x-3">
              <button
                onClick={() => setDocTypeToDelete(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDocType}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center"
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {groupToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Field Group</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-1">
                Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-gray-100">"{groupToDelete.name}"</span>?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will permanently remove the group and all its fields. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteGroup(groupToDelete.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {fieldToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Field</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-1">
                Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-gray-100">"{fieldToDelete.fieldLabel || fieldToDelete.fieldName}"</span>?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will permanently remove the field from the template. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setFieldToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteField(fieldToDelete.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Field
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {conditionsField && createPortal(
        <FieldConditionsModal
          field={conditionsField}
          allFields={fields.filter(f => f.fieldGroupId === conditionsField.fieldGroupId && f.id !== conditionsField.id)}
          onSave={async (updates) => {
            try {
              const { error } = await supabase
                .from('order_entry_template_fields')
                .update({
                  conditional_visibility_field_id: updates.conditionalVisibilityFieldId || null,
                  conditional_visibility_operator: updates.conditionalVisibilityOperator || null,
                  conditional_visibility_value: updates.conditionalVisibilityValue || null,
                  conditional_required_field_id: updates.conditionalRequiredFieldId || null,
                  conditional_required_operator: updates.conditionalRequiredOperator || null,
                  conditional_required_value: updates.conditionalRequiredValue || null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', conditionsField.id);
              if (error) throw error;
              toast.success('Conditional logic saved');
              setConditionsField(null);
              if (selectedTemplateId) await loadTemplateData(selectedTemplateId);
            } catch (err: any) {
              toast.error('Failed to save: ' + err.message);
            }
          }}
          onClose={() => setConditionsField(null)}
        />,
        document.body
      )}

      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
    </div>
  );
}

interface TemplateModalProps {
  title: string;
  template: Partial<OrderEntryTemplate> | null;
  onChange: (template: Partial<OrderEntryTemplate> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  extractionTypes: ExtractionType[];
  saveButtonText?: string;
}

function TemplateModal({ title, template, onChange, onSave, onClose, isSaving, extractionTypes, saveButtonText = 'Save' }: TemplateModalProps) {
  if (!template) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Name *
            </label>
            <input
              type="text"
              value={template.name || ''}
              onChange={(e) => onChange({ ...template, name: e.target.value })}
              placeholder="e.g., Standard Order Form"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={template.description || ''}
              onChange={(e) => onChange({ ...template, description: e.target.value })}
              placeholder="Optional description"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Extraction Type (for processing)
            </label>
            <Select
              value={template.extractionTypeId || '__none__'}
              onValueChange={(value) => onChange({ ...template, extractionTypeId: value === '__none__' ? undefined : value })}
              options={[
                { value: '__none__', label: 'No extraction type' },
                ...extractionTypes.map(et => ({ value: et.id, label: et.name }))
              ]}
              searchable
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Links to an Extraction Type for JSON Template, Field Mappings, and Workflow processing
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirmation Number Field
            </label>
            <input
              type="text"
              value={template.confirmationNumberField || ''}
              onChange={(e) => onChange({ ...template, confirmationNumberField: e.target.value })}
              placeholder="e.g., billNumber"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              The Response Data Mapping field name (updatePath) from the Workflow V2 API step to display as the Confirmation Number after submission. Example: if your API endpoint response mapping maps "orders.0.billNumber" to "billNumber", enter "billNumber" here.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="hidePdfAutofill"
              checked={template.hidePdfAutofill ?? false}
              onChange={(e) => onChange({ ...template, hidePdfAutofill: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="hidePdfAutofill" className="text-sm text-gray-700 dark:text-gray-300">
              Hide "Upload PDF to Autofill" button
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="templateActive"
              checked={template.isActive ?? true}
              onChange={(e) => onChange({ ...template, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="templateActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active (available for assignment)
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
            disabled={isSaving || !template.name?.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  templateName: string;
  onConfirm: () => void;
  onClose: () => void;
  isSaving: boolean;
}

function DeleteConfirmModal({ templateName, onConfirm, onClose, isSaving }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">Delete Template</h3>
        </div>

        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>"{templateName}"</strong>?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            This will delete all field groups, fields, and layouts in this template. This action cannot be undone.
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
  group: Partial<OrderEntryFieldGroup> | null;
  onChange: (group: Partial<OrderEntryFieldGroup> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  fieldGroups: OrderEntryFieldGroup[];
}

function GroupModal({ group, onChange, onSave, onClose, isSaving, fieldGroups }: GroupModalProps) {
  if (!group) return null;

  const parentGroupOptions = fieldGroups
    .filter(g => g.isArrayGroup && g.id !== group.id && !g.parentGroupId)
    .map(g => ({ value: g.id, label: g.groupName }));

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
              value={group.groupName || ''}
              onChange={(e) => onChange({ ...group, groupName: e.target.value })}
              placeholder="e.g., Shipment Details"
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
              placeholder="Optional description"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Background Color
              </label>
              <input
                type="color"
                value={group.backgroundColor || '#ffffff'}
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
                value={group.borderColor || '#14b8a6'}
                onChange={(e) => onChange({ ...group, borderColor: e.target.value })}
                className="w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600"
              />
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={group.isCollapsible || false}
                onChange={(e) => onChange({ ...group, isCollapsible: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Collapsible</span>
            </label>
            {group.isCollapsible && (
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={group.isExpandedByDefault ?? true}
                  onChange={(e) => onChange({ ...group, isExpandedByDefault: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Expanded by Default</span>
              </label>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <label className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={group.isHidden || false}
                onChange={(e) => onChange({ ...group, isHidden: e.target.checked })}
                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 mr-2"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hidden from Client</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Group and its fields will not be visible on the Order Entry form, but field values will still be submitted to the API</p>
              </div>
            </label>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <label className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={group.resetOnTemplateLoad || false}
                onChange={(e) => onChange({ ...group, resetOnTemplateLoad: e.target.checked })}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 mr-2"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Clear on Template Load</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fields in this group will be reset (cleared) when a saved template is loaded, requiring the user to re-enter values</p>
              </div>
            </label>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <label className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={group.addressBookEnabled || false}
                onChange={(e) => onChange({ ...group, addressBookEnabled: e.target.checked, addressBookType: e.target.checked ? (group.addressBookType || 'both') : undefined })}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 mr-2"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Address Book</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Allow customers to select from their Address Book to populate this group's fields</p>
              </div>
            </label>

            {group.addressBookEnabled && (
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Address Type
                </label>
                <CustomDropdown
                  value={group.addressBookType || 'both'}
                  onChange={(val) => onChange({ ...group, addressBookType: val as 'shipper' | 'consignee' | 'both' })}
                  options={[
                    { value: 'shipper', label: 'Shipper' },
                    { value: 'consignee', label: 'Consignee' },
                    { value: 'both', label: 'Both (Shipper & Consignee)' },
                  ]}
                  placeholder="Select address type"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Only addresses marked with the selected type will appear in the picker</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <label className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={group.isArrayGroup || false}
                onChange={(e) => onChange({ ...group, isArrayGroup: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Make this an Array Group</span>
            </label>

            {group.isArrayGroup && (
              <div className="space-y-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Array JSON Path
                  </label>
                  <input
                    type="text"
                    value={group.arrayJsonPath || ''}
                    onChange={(e) => onChange({ ...group, arrayJsonPath: e.target.value })}
                    placeholder="e.g., orders[details][]"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <label className="flex items-center mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                  <input
                    type="checkbox"
                    checked={group.hideAddRow || false}
                    onChange={(e) => onChange({ ...group, hideAddRow: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hide Add Row Button</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fixed rows only - users cannot add or remove rows</p>
                  </div>
                </label>

                <label className="flex items-center mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                  <input
                    type="checkbox"
                    checked={group.removeIfEmpty || false}
                    onChange={(e) => onChange({ ...group, removeIfEmpty: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Remove If Empty (RIN)</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Exclude rows with no user-entered values from the API payload. If all rows are empty, the entire array is omitted.</p>
                  </div>
                </label>

                {parentGroupOptions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Parent Group (Child Array)
                    </label>
                    <CustomDropdown
                      value={group.parentGroupId || ''}
                      onChange={(val) => onChange({ ...group, parentGroupId: val || null })}
                      options={[
                        { value: '', label: 'None (Top-level group)' },
                        ...parentGroupOptions
                      ]}
                      placeholder="Select parent group"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      When set, this group becomes a nested child array of the selected parent. It will appear as a button on each parent row.
                    </p>

                    {group.parentGroupId && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Button Label
                        </label>
                        <input
                          type="text"
                          value={group.childButtonLabel || ''}
                          onChange={(e) => onChange({ ...group, childButtonLabel: e.target.value })}
                          placeholder="e.g., Barcodes"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          The label shown on the button in the parent group's table row
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
            disabled={isSaving || !group.groupName?.trim()}
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

interface FieldModalProps {
  field: Partial<OrderEntryField> | null;
  onChange: (field: Partial<OrderEntryField> | null) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  extractionTypeFieldMappings?: FieldMapping[];
  allFields: OrderEntryField[];
  fieldGroups: OrderEntryFieldGroup[];
}

function FieldModal({ field, onChange, onSave, onClose, isSaving, extractionTypeFieldMappings = [], allFields, fieldGroups }: FieldModalProps) {
  const [showFieldMappingDropdown, setShowFieldMappingDropdown] = useState(false);
  const [secondaryApis, setSecondaryApis] = useState<{ id: string; name: string; base_url: string }[]>([]);
  const [apiSpecs, setApiSpecs] = useState<{ id: string; name: string; version: string }[]>([]);
  const [selectedApiSpecId, setSelectedApiSpecId] = useState(field?.apiLookupSpecId || '');
  const [availableEndpoints, setAvailableEndpoints] = useState<{ id: string; path: string; method: string; summary: string }[]>([]);
  const [manualEndpointEntry, setManualEndpointEntry] = useState(false);
  const [apiLookupJsonParseError, setApiLookupJsonParseError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const orderEntryFieldMappings = extractionTypeFieldMappings.filter(m => m.type === 'order_entry');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowFieldMappingDropdown(false);
      }
    };

    if (showFieldMappingDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFieldMappingDropdown]);

  useEffect(() => {
    const loadSecondaryApis = async () => {
      const { data } = await supabase
        .from('secondary_api_configs')
        .select('id, name, base_url')
        .eq('is_active', true)
        .order('name');
      if (data) setSecondaryApis(data);
    };
    loadSecondaryApis();
  }, []);

  useEffect(() => {
    if (field?.apiLookupSpecId) {
      setSelectedApiSpecId(field.apiLookupSpecId);
    }
    if (field?.apiLookupEndpoint && !field?.apiLookupSpecId) {
      setManualEndpointEntry(true);
    }
  }, [field?.id]);

  useEffect(() => {
    const loadSpecs = async () => {
      let query = supabase.from('api_specs').select('id, name, version');
      if (field?.apiLookupSecondaryApiId) {
        query = query.eq('secondary_api_id', field.apiLookupSecondaryApiId);
      } else {
        query = query.not('api_endpoint_id', 'is', null);
      }
      const { data } = await query.order('name');
      setApiSpecs(data || []);
    };
    if (field?.fieldType === 'api_lookup') {
      loadSpecs();
    }
  }, [field?.apiLookupSecondaryApiId, field?.fieldType]);

  useEffect(() => {
    if (!selectedApiSpecId) {
      setAvailableEndpoints([]);
      return;
    }
    const loadEndpoints = async () => {
      const method = (field?.apiLookupHttpMethod || 'GET').toUpperCase();
      const { data } = await supabase
        .from('api_spec_endpoints')
        .select('id, path, method, summary')
        .eq('api_spec_id', selectedApiSpecId)
        .eq('method', method)
        .order('path');
      setAvailableEndpoints(data || []);
    };
    loadEndpoints();
  }, [selectedApiSpecId, field?.apiLookupHttpMethod]);

  if (!field) return null;

  const fieldTypes: { value: OrderEntryFieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date & Time' },
    { value: 'phone', label: 'Phone' },
    { value: 'zip', label: 'Zip Code (US)' },
    { value: 'postal_code', label: 'Postal Code (CA)' },
    { value: 'zip_postal', label: 'Zip/Postal Code (US or CA)' },
    { value: 'province', label: 'Province' },
    { value: 'state', label: 'State' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'api_lookup', label: 'API Lookup' },
    { value: 'file', label: 'File Upload' },
    { value: 'boolean', label: 'Checkbox' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {field.id ? 'Edit Field' : 'Create Field'}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Name (Internal) *
              </label>
              <input
                type="text"
                value={field.fieldName || ''}
                onChange={(e) => onChange({ ...field, fieldName: e.target.value })}
                placeholder="e.g., shipper_name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Label (Display) *
              </label>
              <input
                type="text"
                value={field.fieldLabel || ''}
                onChange={(e) => onChange({ ...field, fieldLabel: e.target.value })}
                placeholder="e.g., Shipper Name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Field Type *
              </label>
              <Select
                value={field.fieldType || 'text'}
                onValueChange={(value) => onChange({ ...field, fieldType: value as OrderEntryFieldType })}
                options={fieldTypes.map(type => ({ value: type.value, label: type.label }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                JSON Path for API
              </label>
              <div className="relative" ref={dropdownRef}>
                <div className="flex">
                  <input
                    type="text"
                    value={field.jsonPath || ''}
                    onChange={(e) => onChange({ ...field, jsonPath: e.target.value })}
                    placeholder="e.g., order.shipper.name"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFieldMappingDropdown(!showFieldMappingDropdown)}
                    disabled={orderEntryFieldMappings.length === 0}
                    className={`px-3 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg transition-colors ${
                      orderEntryFieldMappings.length === 0
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-500'
                    }`}
                    title={orderEntryFieldMappings.length === 0 ? 'No Order Entry type field mappings available' : 'Select from Order Entry field mappings'}
                  >
                    <Braces className="h-4 w-4" />
                  </button>
                </div>
                {showFieldMappingDropdown && orderEntryFieldMappings.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {orderEntryFieldMappings.map((mapping, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          onChange({ ...field, jsonPath: mapping.fieldName });
                          setShowFieldMappingDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between"
                      >
                        <span className="font-mono text-gray-900 dark:text-gray-100">{mapping.fieldName}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{mapping.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {orderEntryFieldMappings.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Link an Extraction Type with Order Entry type field mappings
                </p>
              )}
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
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
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
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
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
                    className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Add Option
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Value is sent to the API. Description is what users see.</p>
              </div>

              {(() => {
                const fieldGroup = fieldGroups.find(g => g.id === field.fieldGroupId);
                return fieldGroup?.isArrayGroup;
              })() && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Exclusion Groups
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Options in the same group cannot coexist across rows. E.g., if "Chill Freight" is used in one row, "Frozen Freight" will be disabled in other rows.
                  </p>
                  <div className="space-y-2">
                    {(field.exclusionGroups || []).map((group, gIdx) => (
                      <div key={gIdx} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex-1 flex flex-wrap gap-1">
                          {group.map((val, vIdx) => (
                            <span key={vIdx} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                              {val}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...(field.exclusionGroups || [])];
                                  updated[gIdx] = updated[gIdx].filter((_, i) => i !== vIdx);
                                  if (updated[gIdx].length === 0) updated.splice(gIdx, 1);
                                  onChange({ ...field, exclusionGroups: updated });
                                }}
                                className="text-amber-600 hover:text-red-600 transition-colors"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                          <select
                            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const updated = [...(field.exclusionGroups || [])];
                              if (!updated[gIdx].includes(e.target.value)) {
                                updated[gIdx] = [...updated[gIdx], e.target.value];
                                onChange({ ...field, exclusionGroups: updated });
                              }
                            }}
                          >
                            <option value="">+ Add option...</option>
                            {(field.dropdownOptions || [])
                              .map(opt => typeof opt === 'string' ? opt : opt.value)
                              .filter(v => v && !group.includes(v))
                              .map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...(field.exclusionGroups || [])];
                            updated.splice(gIdx, 1);
                            onChange({ ...field, exclusionGroups: updated });
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(field.exclusionGroups || []), []];
                        onChange({ ...field, exclusionGroups: updated });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                    >
                      + Add Exclusion Group
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {field.fieldType === 'api_lookup' && (
            <div className="space-y-4 bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800">
              <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-200">API Lookup Configuration</h4>

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
                      API Endpoint Path {!field.apiLookupSecondaryApiId && <span className="text-red-500">*</span>}
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
                        ? `Optional path appended to the secondary API base URL. Leave empty to call the base URL directly.`
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
                        if (ep) {
                          onChange({ ...field, apiLookupEndpoint: ep.path });
                        }
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
                        if (!template) {
                          alert('Please add a JSON template first');
                          return;
                        }
                        try {
                          const parsed = JSON.parse(template);
                          const mappings: { fieldName: string; type: 'hardcoded' | 'variable' | 'search'; value: string; dataType?: string }[] = [];
                          const extractFields = (obj: any, prefix = '') => {
                            for (const [key, value] of Object.entries(obj)) {
                              const fieldName = prefix ? `${prefix}.${key}` : key;
                              if (Array.isArray(value) && value.length > 0) {
                                const firstItem = value[0];
                                if (firstItem && typeof firstItem === 'object') {
                                  extractFields(firstItem, `${fieldName}[0]`);
                                }
                              } else if (value && typeof value === 'object') {
                                extractFields(value, fieldName);
                              } else {
                                let dataType: string = 'string';
                                if (typeof value === 'number') {
                                  dataType = Number.isInteger(value) ? 'integer' : 'number';
                                } else if (typeof value === 'boolean') {
                                  dataType = 'boolean';
                                } else if (typeof value === 'string' && /^\d{4}-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12]\d)/.test(value)) {
                                  dataType = 'datetime';
                                }
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
                          let msg = 'Invalid JSON format.';
                          if (error?.message) {
                            const posMatch = error.message.match(/position (\d+)/i);
                            if (posMatch) {
                              const pos = parseInt(posMatch[1], 10);
                              const lines = template.substring(0, pos).split('\n');
                              msg = `JSON error at line ${lines.length}, col ${lines[lines.length - 1].length + 1}: ${error.message}`;
                            } else {
                              msg = `JSON error: ${error.message}`;
                            }
                          }
                          setApiLookupJsonParseError(msg);
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
                    onChange={(e) => {
                      onChange({ ...field, apiLookupRequestBody: e.target.value });
                      setApiLookupJsonParseError(null);
                    }}
                    placeholder={'{\n  "name": "searchTerm",\n  "inputs": {\n    "field1": "value"\n  }\n}'}
                    rows={8}
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
                    <span className="text-xs text-gray-400">{'(e.g., [{"field": "value"}])'}</span>
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
                            onChange={(e) => {
                              const updated = [...(field.apiLookupRequestBodyMappings || [])];
                              updated[idx] = { ...updated[idx], fieldName: e.target.value };
                              onChange({ ...field, apiLookupRequestBodyMappings: updated });
                            }}
                            placeholder="JSON path"
                            className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs font-mono"
                            readOnly
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
                                  .filter(f => f.id !== field.id && f.fieldGroupId === field.fieldGroupId)
                                  .map(f => ({ value: f.fieldName, label: f.fieldLabel }))
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
                              placeholder={mapping.type === 'search' ? 'Default value (e.g. %)' : 'Fixed value'}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                            />
                          )}
                          <Select
                            value={mapping.dataType || 'string'}
                            onValueChange={(value) => {
                              const updated = [...(field.apiLookupRequestBodyMappings || [])];
                              updated[idx] = { ...updated[idx], dataType: value as any };
                              onChange({ ...field, apiLookupRequestBodyMappings: updated });
                            }}
                            options={[
                              { value: 'string', label: 'String' },
                              { value: 'number', label: 'Number' },
                              { value: 'integer', label: 'Integer' },
                              { value: 'boolean', label: 'Boolean' },
                              { value: 'datetime', label: 'DateTime' },
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
                      <span className="text-gray-400 text-sm">→</span>
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
                            .filter(f => f.id !== field.id && f.fieldGroupId === field.fieldGroupId)
                            .map(f => ({ value: f.fieldName, label: f.fieldLabel }))
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
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              AI Extraction Instructions
            </label>
            <textarea
              value={field.aiExtractionInstructions || ''}
              onChange={(e) => onChange({ ...field, aiExtractionInstructions: e.target.value })}
              placeholder="Instructions for AI to extract this field from PDFs"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Value
              </label>
              <input
                type="text"
                value={field.useClientIdDefault ? '{{CLIENT_ID}}' : (field.defaultValue || '')}
                onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
                placeholder="Optional"
                disabled={field.useClientIdDefault}
                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${field.useClientIdDefault ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={field.useClientIdDefault || false}
                  onChange={(e) => onChange({ ...field, useClientIdDefault: e.target.checked, defaultValue: e.target.checked ? '' : field.defaultValue })}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 mr-2"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">Use Client ID as default</span>
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={field.isRequired || false}
                  onChange={(e) => onChange({ ...field, isRequired: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
              </label>
            </div>
          </div>

          {(field.fieldType === 'date' || field.fieldType === 'datetime') && (
            <div className="space-y-3">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={field.futureDatesOnly || false}
                    onChange={(e) => onChange({ ...field, futureDatesOnly: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Future Dates Only</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Only allow selecting dates in the future (today is not allowed)
                </p>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={field.allowWeekends !== false}
                    onChange={(e) => onChange({ ...field, allowWeekends: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Allow Weekends</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  When unchecked, Saturdays and Sundays will be disabled in the date picker
                </p>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={field.allowHolidays !== false}
                    onChange={(e) => onChange({ ...field, allowHolidays: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Allow Holidays</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  When unchecked, dates configured in Observed Holidays will be disabled
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Copy From Field
            </label>
            <Select
              value={field.copyFromField || '__none__'}
              onValueChange={(value) => onChange({ ...field, copyFromField: value === '__none__' ? undefined : value })}
              options={[
                { value: '__none__', label: 'None' },
                ...allFields
                  .filter(f => f.id !== field.id && f.fieldType === field.fieldType)
                  .map(f => ({ value: f.fieldName, label: `${f.fieldLabel} (${f.fieldName})` }))
              ]}
              searchable
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Auto-populate this field when the selected field is filled in (must be same field type)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Address Book Mapping
            </label>
            <Select
              value={field.addressBookField || '__none__'}
              onValueChange={(value) => onChange({ ...field, addressBookField: value === '__none__' ? undefined : value })}
              options={[
                { value: '__none__', label: 'None' },
                { value: 'name', label: 'Name' },
                { value: 'address1', label: 'Address 1' },
                { value: 'address2', label: 'Address 2' },
                { value: 'city', label: 'City' },
                { value: 'stateProv', label: 'State / Province' },
                { value: 'postalCode', label: 'Postal Code / Zip' },
                { value: 'country', label: 'Country' },
                { value: 'contactName', label: 'Contact Name' },
                { value: 'contactPhone', label: 'Contact Phone' },
                { value: 'contactPhoneExt', label: 'Contact Phone Ext' },
                { value: 'contactEmail', label: 'Contact Email' },
                { value: 'appointmentReq', label: 'Appointment Required' },
                { value: 'clientRefId', label: 'Client ID' }
              ]}
              searchable
              maxHeight="500px"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Maps this field to an Address Book property for auto-fill when an address is selected
            </p>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={field.hiddenFromClient || false}
                onChange={(e) => onChange({ ...field, hiddenFromClient: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Hidden from Client</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
              Field will not be visible to the customer but its value will still be included in the submission payload
            </p>
          </div>

          {(() => {
            const childGroupsForField = fieldGroups.filter(g => g.parentGroupId === field.fieldGroupId && g.isArrayGroup);
            if (childGroupsForField.length === 0) return null;
            return (
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={field.countChildArrayRecords || false}
                    onChange={(e) => onChange({ ...field, countChildArrayRecords: e.target.checked, countChildArrayGroupId: e.target.checked ? (field.countChildArrayGroupId || childGroupsForField[0]?.id || null) : null })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Count Child Array Records</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Auto-populate this field with the number of entries in a child array group
                </p>
                {field.countChildArrayRecords && (
                  <div className="mt-2 ml-6">
                    <CustomDropdown
                      value={field.countChildArrayGroupId || ''}
                      onChange={(val) => onChange({ ...field, countChildArrayGroupId: val || null })}
                      placeholder="Select child group to count..."
                      options={childGroupsForField.map(g => ({ value: g.id, label: g.groupName }))}
                      searchable={false}
                      maxHeight="200px"
                    />
                  </div>
                )}
              </div>
            );
          })()}
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
            disabled={isSaving || !field.fieldName?.trim() || !field.fieldLabel?.trim()}
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

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does Not Equal' },
  { value: 'in', label: 'Is One Of' },
  { value: 'not_in', label: 'Is Not One Of' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

interface FieldConditionsModalProps {
  field: OrderEntryField;
  allFields: OrderEntryField[];
  onSave: (updates: {
    conditionalVisibilityFieldId: string | null;
    conditionalVisibilityOperator: string | null;
    conditionalVisibilityValue: string | null;
    conditionalRequiredFieldId: string | null;
    conditionalRequiredOperator: string | null;
    conditionalRequiredValue: string | null;
  }) => void;
  onClose: () => void;
}

function FieldConditionsModal({ field, allFields, onSave, onClose }: FieldConditionsModalProps) {
  const [visFieldId, setVisFieldId] = useState(field.conditionalVisibilityFieldId || '');
  const [visOperator, setVisOperator] = useState(field.conditionalVisibilityOperator || '');
  const [visValue, setVisValue] = useState(field.conditionalVisibilityValue || '');
  const [reqFieldId, setReqFieldId] = useState(field.conditionalRequiredFieldId || '');
  const [reqOperator, setReqOperator] = useState(field.conditionalRequiredOperator || '');
  const [reqValue, setReqValue] = useState(field.conditionalRequiredValue || '');

  const fieldOptions = allFields.map(f => ({ value: f.id, label: f.fieldLabel }));
  const operatorOptions = CONDITION_OPERATORS;

  const visDepField = allFields.find(f => f.id === visFieldId);
  const reqDepField = allFields.find(f => f.id === reqFieldId);

  const needsValue = (op: string) => op && op !== 'is_empty' && op !== 'is_not_empty';

  const getDropdownOptionsForField = (f: OrderEntryField | undefined) => {
    if (!f || f.fieldType !== 'dropdown' || !f.dropdownOptions?.length) return null;
    return (f.dropdownOptions as any[]).map(opt =>
      typeof opt === 'string' ? opt : opt.value || opt.description || ''
    ).filter(Boolean);
  };

  const visDropdownOpts = getDropdownOptionsForField(visDepField);
  const reqDropdownOpts = getDropdownOptionsForField(reqDepField);

  const handleSave = () => {
    onSave({
      conditionalVisibilityFieldId: visFieldId || null,
      conditionalVisibilityOperator: visFieldId ? (visOperator || null) : null,
      conditionalVisibilityValue: visFieldId && needsValue(visOperator) ? (visValue || null) : null,
      conditionalRequiredFieldId: reqFieldId || null,
      conditionalRequiredOperator: reqFieldId ? (reqOperator || null) : null,
      conditionalRequiredValue: reqFieldId && needsValue(reqOperator) ? (reqValue || null) : null,
    });
  };

  const handleClearVisibility = () => {
    setVisFieldId('');
    setVisOperator('');
    setVisValue('');
  };

  const handleClearRequired = () => {
    setReqFieldId('');
    setReqOperator('');
    setReqValue('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conditional Logic</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure conditions for "{field.fieldLabel}"</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conditional Visibility</h4>
              {visFieldId && (
                <button onClick={handleClearVisibility} className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400">
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Show this field only when another field meets a condition</p>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">When field</label>
              <CustomDropdown
                value={visFieldId}
                onChange={(val) => { setVisFieldId(val); setVisValue(''); }}
                options={fieldOptions}
                placeholder="Select a field..."
                size="sm"
                searchable
              />
            </div>

            {visFieldId && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Operator</label>
                <CustomDropdown
                  value={visOperator}
                  onChange={setVisOperator}
                  options={operatorOptions}
                  placeholder="Select operator..."
                  size="sm"
                />
              </div>
            )}

            {visFieldId && needsValue(visOperator) && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Value {(visOperator === 'in' || visOperator === 'not_in') && <span className="text-gray-400">(comma-separated)</span>}
                </label>
                {visDropdownOpts ? (
                  <div className="flex flex-wrap gap-2">
                    {visDropdownOpts.map(opt => {
                      const selected = visValue.split(',').map(v => v.trim()).includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const current = visValue ? visValue.split(',').map(v => v.trim()).filter(Boolean) : [];
                            const updated = selected ? current.filter(v => v !== opt) : [...current, opt];
                            setVisValue(updated.join(','));
                            if (updated.length > 1 && (visOperator === 'equals' || visOperator === 'not_equals')) {
                              setVisOperator(visOperator === 'not_equals' ? 'not_in' : 'in');
                            } else if (updated.length <= 1 && (visOperator === 'in' || visOperator === 'not_in')) {
                              setVisOperator(visOperator === 'not_in' ? 'not_equals' : 'equals');
                            }
                          }}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            selected
                              ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={visValue}
                    onChange={e => setVisValue(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter value..."
                  />
                )}
              </div>
            )}
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Conditional Required</h4>
              {reqFieldId && (
                <button onClick={handleClearRequired} className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400">
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Make this field required when another field meets a condition</p>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">When field</label>
              <CustomDropdown
                value={reqFieldId}
                onChange={(val) => { setReqFieldId(val); setReqValue(''); }}
                options={fieldOptions}
                placeholder="Select a field..."
                size="sm"
                searchable
              />
            </div>

            {reqFieldId && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Operator</label>
                <CustomDropdown
                  value={reqOperator}
                  onChange={setReqOperator}
                  options={operatorOptions}
                  placeholder="Select operator..."
                  size="sm"
                />
              </div>
            )}

            {reqFieldId && needsValue(reqOperator) && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Value {(reqOperator === 'in' || reqOperator === 'not_in') && <span className="text-gray-400">(comma-separated)</span>}
                </label>
                {reqDropdownOpts ? (
                  <div className="flex flex-wrap gap-2">
                    {reqDropdownOpts.map(opt => {
                      const selected = reqValue.split(',').map(v => v.trim()).includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const current = reqValue ? reqValue.split(',').map(v => v.trim()).filter(Boolean) : [];
                            const updated = selected ? current.filter(v => v !== opt) : [...current, opt];
                            setReqValue(updated.join(','));
                            if (updated.length > 1 && (reqOperator === 'equals' || reqOperator === 'not_equals')) {
                              setReqOperator(reqOperator === 'not_equals' ? 'not_in' : 'in');
                            } else if (updated.length <= 1 && (reqOperator === 'in' || reqOperator === 'not_in')) {
                              setReqOperator(reqOperator === 'not_in' ? 'not_equals' : 'equals');
                            }
                          }}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            selected
                              ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={reqValue}
                    onChange={e => setReqValue(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter value..."
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Conditions
          </button>
        </div>
      </div>
    </div>
  );
}
