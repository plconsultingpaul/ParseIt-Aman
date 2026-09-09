import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { OrderEntryConfig, OrderEntryFieldGroup, OrderEntryField, OrderEntryFieldLayout, OrderEntryDocumentType } from '../types';

interface UseOrderEntryFormOptions {
  clientId?: string;
}

export function useOrderEntryForm(options: UseOrderEntryFormOptions = {}) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<OrderEntryConfig | null>(null);
  const [fieldGroups, setFieldGroups] = useState<OrderEntryFieldGroup[]>([]);
  const [fields, setFields] = useState<OrderEntryField[]>([]);
  const [layouts, setLayouts] = useState<OrderEntryFieldLayout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [extractionTypeId, setExtractionTypeId] = useState<string | null>(null);
  const [confirmationNumberField, setConfirmationNumberField] = useState<string | null>(null);
  const [hidePdfAutofill, setHidePdfAutofill] = useState(false);
  const [clientCode, setClientCode] = useState<string | null>(null);
  const [documentTypes, setDocumentTypes] = useState<OrderEntryDocumentType[]>([]);

  useEffect(() => {
    loadFormConfiguration();
  }, [options.clientId]);

  const loadFormConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[useOrderEntryForm] ========== LOADING FORM CONFIGURATION ==========');
      console.log('[useOrderEntryForm] Client ID passed:', options.clientId);

      let assignedTemplateId: string | null = null;

      if (options.clientId) {
        console.log('[useOrderEntryForm] Looking up client template assignment...');
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('order_entry_template_id, client_id')
          .eq('id', options.clientId)
          .maybeSingle();

        if (clientError) {
          console.error('[useOrderEntryForm] Client lookup error:', clientError);
          throw clientError;
        }
        assignedTemplateId = clientData?.order_entry_template_id || null;
        setClientCode(clientData?.client_id || null);
        console.log('[useOrderEntryForm] Client assigned template ID:', assignedTemplateId);
      }

      if (!assignedTemplateId) {
        console.log('[useOrderEntryForm] No template assigned - checking for default template...');
        const { data: defaultTemplate, error: defaultError } = await supabase
          .from('order_entry_templates')
          .select('id, name, extraction_type_id')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (defaultError) {
          console.error('[useOrderEntryForm] Default template lookup error:', defaultError);
        } else if (defaultTemplate) {
          console.log('[useOrderEntryForm] Found default template:', defaultTemplate);
          assignedTemplateId = defaultTemplate.id;
        } else {
          console.log('[useOrderEntryForm] No default template found');
        }
      }

      console.log('[useOrderEntryForm] Final template ID to load:', assignedTemplateId);

      if (assignedTemplateId) {
        await loadFromTemplate(assignedTemplateId);
      } else {
        await loadFromGlobalConfig();
      }

    } catch (err: any) {
      setError(err.message || 'Failed to load form configuration');
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFromTemplate = async (templateIdParam: string) => {
    console.log('[useOrderEntryForm] loadFromTemplate() called with templateId:', templateIdParam);

    const { data: templateData, error: templateError } = await supabase
      .from('order_entry_templates')
      .select('*')
      .eq('id', templateIdParam)
      .eq('is_active', true)
      .maybeSingle();

    console.log('[useOrderEntryForm] Template query result:', { templateData, templateError });

    if (templateError) throw templateError;

    if (!templateData) {
      console.log('[useOrderEntryForm] Template not found or not active, falling back to global config');
      await loadFromGlobalConfig();
      return;
    }

    console.log('[useOrderEntryForm] ========== TEMPLATE DATA ==========');
    console.log('[useOrderEntryForm] Template ID:', templateData.id);
    console.log('[useOrderEntryForm] Template Name:', templateData.name);
    console.log('[useOrderEntryForm] Extraction Type ID from DB:', templateData.extraction_type_id);
    console.log('[useOrderEntryForm] Raw template data:', JSON.stringify(templateData, null, 2));

    setTemplateId(templateData.id);
    setTemplateName(templateData.name);
    setExtractionTypeId(templateData.extraction_type_id || null);
    setConfirmationNumberField(templateData.confirmation_number_field || null);
    setHidePdfAutofill(templateData.hide_pdf_autofill ?? false);

    console.log('[useOrderEntryForm] State set - extractionTypeId:', templateData.extraction_type_id || null);

    const [groupsRes, fieldsRes, layoutsRes, configRes, docTypesRes] = await Promise.all([
      supabase
        .from('order_entry_template_field_groups')
        .select('id, template_id, group_name, group_order, description, is_collapsible, is_expanded_by_default, background_color, border_color, is_array_group, array_min_rows, array_max_rows, array_json_path, hide_add_row, is_hidden, address_book_enabled, address_book_type, parent_group_id, child_button_label, reset_on_template_load, remove_if_empty, created_at, updated_at')
        .eq('template_id', templateIdParam)
        .order('group_order', { ascending: true }),
      supabase
        .from('order_entry_template_fields')
        .select('*')
        .eq('template_id', templateIdParam)
        .order('field_order', { ascending: true }),
      supabase
        .from('order_entry_template_field_layout')
        .select('*')
        .eq('template_id', templateIdParam),
      supabase.from('order_entry_config').select('*').maybeSingle(),
      supabase
        .from('order_entry_template_document_types')
        .select('*')
        .eq('template_id', templateIdParam)
        .order('sort_order', { ascending: true })
    ]);

    if (groupsRes.error) throw groupsRes.error;
    if (fieldsRes.error) throw fieldsRes.error;
    if (layoutsRes.error) throw layoutsRes.error;
    if (configRes.error) throw configRes.error;

    const transformedConfig = configRes.data ? {
      id: configRes.data.id,
      apiEndpoint: configRes.data.api_endpoint,
      apiMethod: configRes.data.api_method,
      apiHeaders: configRes.data.api_headers,
      apiAuthType: configRes.data.api_auth_type,
      apiAuthToken: configRes.data.api_auth_token,
      workflowId: templateData.workflow_id || configRes.data.workflow_id,
      isEnabled: configRes.data.is_enabled,
      createdAt: configRes.data.created_at,
      updatedAt: configRes.data.updated_at
    } : null;

    const transformedGroups = (groupsRes.data || []).map((g: any) => ({
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

    const transformedFields = (fieldsRes.data || []).map((f: any) => ({
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
      dropdownOptions: typeof f.dropdown_options === 'string' ? JSON.parse(f.dropdown_options) : (f.dropdown_options || []),
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
      futureDatesOnly: f.future_dates_only || false,
      allowWeekends: f.allow_weekends !== false,
      allowHolidays: f.allow_holidays !== false,
      hiddenFromClient: f.hidden_from_client || false,
      countChildArrayRecords: f.count_child_array_records || false,
      countChildArrayGroupId: f.count_child_array_group_id || null,
      createdAt: f.created_at,
      updatedAt: f.updated_at
    }));

    const transformedLayouts = (layoutsRes.data || []).map((l: any) => ({
      id: l.id,
      fieldId: l.field_id,
      rowIndex: l.row_index,
      columnIndex: l.column_index,
      widthColumns: l.width_columns,
      mobileWidthColumns: l.mobile_width_columns,
      createdAt: l.created_at,
      updatedAt: l.updated_at
    }));

    setConfig(transformedConfig);
    setFieldGroups(transformedGroups);
    setFields(transformedFields);
    setLayouts(transformedLayouts);

    const transformedDocTypes: OrderEntryDocumentType[] = (docTypesRes.data || []).map((d: any) => ({
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
    setDocumentTypes(transformedDocTypes);

    if (!transformedConfig?.isEnabled) {
      setError('Order entry is currently disabled. Please contact your administrator.');
    }
  };

  const loadFromGlobalConfig = async () => {
    setTemplateId(null);
    setTemplateName(null);
    setExtractionTypeId(null);
    setDocumentTypes([]);
    console.log('[useOrderEntryForm] Loading from global config (no template)');

    const [configRes, groupsRes, fieldsRes, layoutsRes] = await Promise.all([
      supabase.from('order_entry_config').select('*').maybeSingle(),
      supabase.from('order_entry_field_groups').select('*').order('group_order', { ascending: true }),
      supabase.from('order_entry_fields').select('*').order('field_order', { ascending: true }),
      supabase.from('order_entry_field_layout').select('*')
    ]);

    if (configRes.error) throw configRes.error;
    if (groupsRes.error) throw groupsRes.error;
    if (fieldsRes.error) throw fieldsRes.error;
    if (layoutsRes.error) throw layoutsRes.error;

    const transformedConfig = configRes.data ? {
      id: configRes.data.id,
      apiEndpoint: configRes.data.api_endpoint,
      apiMethod: configRes.data.api_method,
      apiHeaders: configRes.data.api_headers,
      apiAuthType: configRes.data.api_auth_type,
      apiAuthToken: configRes.data.api_auth_token,
      workflowId: configRes.data.workflow_id,
      isEnabled: configRes.data.is_enabled,
      createdAt: configRes.data.created_at,
      updatedAt: configRes.data.updated_at
    } : null;

    const transformedGroups = (groupsRes.data || []).map((g: any) => ({
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

    const transformedFields = (fieldsRes.data || []).map((f: any) => ({
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
      dropdownOptions: typeof f.dropdown_options === 'string' ? JSON.parse(f.dropdown_options) : (f.dropdown_options || []),
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
      futureDatesOnly: f.future_dates_only || false,
      allowWeekends: f.allow_weekends !== false,
      allowHolidays: f.allow_holidays !== false,
      hiddenFromClient: f.hidden_from_client || false,
      countChildArrayRecords: f.count_child_array_records || false,
      countChildArrayGroupId: f.count_child_array_group_id || null,
      createdAt: f.created_at,
      updatedAt: f.updated_at
    }));

    const transformedLayouts = (layoutsRes.data || []).map((l: any) => ({
      id: l.id,
      fieldId: l.field_id,
      rowIndex: l.row_index,
      columnIndex: l.column_index,
      widthColumns: l.width_columns,
      mobileWidthColumns: l.mobile_width_columns,
      createdAt: l.created_at,
      updatedAt: l.updated_at
    }));

    setConfig(transformedConfig);
    setFieldGroups(transformedGroups);
    setFields(transformedFields);
    setLayouts(transformedLayouts);


    if (!transformedConfig?.isEnabled) {
      setError('Order entry is currently disabled. Please contact your administrator.');
    }
  };

  return {
    loading,
    config,
    fieldGroups,
    fields,
    layouts,
    error,
    templateId,
    templateName,
    extractionTypeId,
    confirmationNumberField,
    hidePdfAutofill,
    clientCode,
    documentTypes,
    reload: loadFormConfiguration
  };
}
