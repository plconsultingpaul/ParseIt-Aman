import { supabase } from '../lib/supabase';
import type { InboxReviewTemplate, InboxReviewFieldGroup, InboxReviewField, InboxReviewFieldLayout } from '../types';

export interface LoadedReviewTemplate {
  template: InboxReviewTemplate;
  groups: InboxReviewFieldGroup[];
  fields: InboxReviewField[];
  layouts: InboxReviewFieldLayout[];
}

export const reviewSetupService = {
  async loadFullTemplate(templateId: string): Promise<LoadedReviewTemplate | null> {
    const { data, error } = await supabase
      .from('inbox_review_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const template = mapTemplate(data);
    const groups = await this.loadFieldGroups(template.id);
    if (groups.length === 0) return null;

    const groupIds = groups.map(g => g.id);
    const fields = await this.loadFields(groupIds);
    if (fields.length === 0) return null;

    const fieldIds = fields.map(f => f.id);
    const layouts = await this.loadLayouts(fieldIds);

    return { template, groups, fields, layouts };
  },

  async loadTemplateByExtractionType(extractionTypeId: string): Promise<LoadedReviewTemplate | null> {
    // First check if the extraction type has an explicit template assigned
    const { data: etRow } = await supabase
      .from('extraction_types')
      .select('inbox_review_template_id')
      .eq('id', extractionTypeId)
      .maybeSingle();

    let templateData: any = null;

    if (etRow?.inbox_review_template_id) {
      const { data, error } = await supabase
        .from('inbox_review_templates')
        .select('*')
        .eq('id', etRow.inbox_review_template_id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      templateData = data;
    }

    // Fall back to the default template
    if (!templateData) {
      const { data, error } = await supabase
        .from('inbox_review_templates')
        .select('*')
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      templateData = data;
    }

    if (!templateData) return null;

    const template = mapTemplate(templateData);
    const groups = await this.loadFieldGroups(template.id);
    if (groups.length === 0) return null;

    const groupIds = groups.map(g => g.id);
    const fields = await this.loadFields(groupIds);
    if (fields.length === 0) return null;

    const fieldIds = fields.map(f => f.id);
    const layouts = await this.loadLayouts(fieldIds);

    return { template, groups, fields, layouts };
  },

  async loadTemplates(): Promise<InboxReviewTemplate[]> {
    const { data, error } = await supabase
      .from('inbox_review_templates')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data || []).map(mapTemplate);
  },

  async createTemplate(template: Partial<InboxReviewTemplate>): Promise<InboxReviewTemplate> {
    const { data, error } = await supabase
      .from('inbox_review_templates')
      .insert({
        name: template.name,
        description: template.description || null,
        is_active: template.isActive ?? true,
        is_default: template.isDefault ?? false
      })
      .select()
      .single();
    if (error) throw error;
    return mapTemplate(data);
  },

  async updateTemplate(id: string, updates: Partial<InboxReviewTemplate>): Promise<void> {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.isDefault !== undefined) payload.is_default = updates.isDefault;
    if (updates.sampleJson !== undefined) payload.sample_json = updates.sampleJson;

    const { error } = await supabase
      .from('inbox_review_templates')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
  },

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('inbox_review_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async loadFieldGroups(templateId: string): Promise<InboxReviewFieldGroup[]> {
    const { data, error } = await supabase
      .from('inbox_review_field_groups')
      .select('*')
      .eq('template_id', templateId)
      .order('group_order');
    if (error) throw error;
    return (data || []).map(mapFieldGroup);
  },

  async createFieldGroup(group: Partial<InboxReviewFieldGroup>): Promise<InboxReviewFieldGroup> {
    const { data, error } = await supabase
      .from('inbox_review_field_groups')
      .insert({
        template_id: group.templateId,
        group_name: group.groupName,
        group_order: group.groupOrder ?? 0,
        description: group.description || null,
        is_array_group: group.isArrayGroup ?? false,
        array_json_path: group.arrayJsonPath || null,
        is_collapsed_by_default: group.isCollapsedByDefault ?? false
      })
      .select()
      .single();
    if (error) throw error;
    return mapFieldGroup(data);
  },

  async updateFieldGroup(id: string, updates: Partial<InboxReviewFieldGroup>): Promise<void> {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.groupName !== undefined) payload.group_name = updates.groupName;
    if (updates.groupOrder !== undefined) payload.group_order = updates.groupOrder;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.isArrayGroup !== undefined) payload.is_array_group = updates.isArrayGroup;
    if (updates.arrayJsonPath !== undefined) payload.array_json_path = updates.arrayJsonPath;
    if (updates.isCollapsedByDefault !== undefined) payload.is_collapsed_by_default = updates.isCollapsedByDefault;

    const { error } = await supabase
      .from('inbox_review_field_groups')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
  },

  async deleteFieldGroup(id: string): Promise<void> {
    const { error } = await supabase
      .from('inbox_review_field_groups')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async loadFields(groupIds: string[]): Promise<InboxReviewField[]> {
    if (groupIds.length === 0) return [];
    const { data, error } = await supabase
      .from('inbox_review_fields')
      .select('*')
      .in('group_id', groupIds)
      .order('field_order');
    if (error) throw error;
    return (data || []).map(mapField);
  },

  async createField(field: Partial<InboxReviewField>): Promise<InboxReviewField> {
    const { data, error } = await supabase
      .from('inbox_review_fields')
      .insert({
        group_id: field.groupId,
        field_name: field.fieldName,
        field_label: field.fieldLabel,
        field_type: field.fieldType ?? 'text',
        json_path: field.jsonPath,
        field_order: field.fieldOrder ?? 0,
        is_required: field.isRequired ?? false,
        is_editable: field.isEditable ?? true,
        is_visible: field.isVisible ?? true,
        placeholder: field.placeholder || null,
        default_value: field.defaultValue || null,
        help_text: field.helpText || null,
        dropdown_options: field.dropdownOptions || null,
        validation_regex: field.validationRegex || null,
        max_length: field.maxLength || null,
        time_format: field.timeFormat || '12h',
        visibility_condition: field.visibilityCondition || null
      })
      .select()
      .single();
    if (error) throw error;
    return mapField(data);
  },

  async updateField(id: string, updates: Partial<InboxReviewField>): Promise<void> {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.fieldName !== undefined) payload.field_name = updates.fieldName;
    if (updates.fieldLabel !== undefined) payload.field_label = updates.fieldLabel;
    if (updates.fieldType !== undefined) payload.field_type = updates.fieldType;
    if (updates.jsonPath !== undefined) payload.json_path = updates.jsonPath;
    if (updates.fieldOrder !== undefined) payload.field_order = updates.fieldOrder;
    if (updates.isRequired !== undefined) payload.is_required = updates.isRequired;
    if (updates.isEditable !== undefined) payload.is_editable = updates.isEditable;
    if (updates.isVisible !== undefined) payload.is_visible = updates.isVisible;
    if (updates.placeholder !== undefined) payload.placeholder = updates.placeholder;
    if (updates.defaultValue !== undefined) payload.default_value = updates.defaultValue;
    if (updates.helpText !== undefined) payload.help_text = updates.helpText;
    if (updates.dropdownOptions !== undefined) payload.dropdown_options = updates.dropdownOptions;
    if (updates.validationRegex !== undefined) payload.validation_regex = updates.validationRegex;
    if (updates.maxLength !== undefined) payload.max_length = updates.maxLength;
    if (updates.timeFormat !== undefined) payload.time_format = updates.timeFormat;
    if (updates.visibilityCondition !== undefined) payload.visibility_condition = updates.visibilityCondition;

    const { error } = await supabase
      .from('inbox_review_fields')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
  },

  async deleteField(id: string): Promise<void> {
    const { error } = await supabase
      .from('inbox_review_fields')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async loadLayouts(fieldIds: string[]): Promise<InboxReviewFieldLayout[]> {
    if (fieldIds.length === 0) return [];
    const { data, error } = await supabase
      .from('inbox_review_field_layout')
      .select('*')
      .in('field_id', fieldIds);
    if (error) throw error;
    return (data || []).map(mapLayout);
  },

  async saveLayouts(layouts: InboxReviewFieldLayout[], allFieldIds: string[]): Promise<void> {
    if (allFieldIds.length > 0) {
      const { error: delError } = await supabase
        .from('inbox_review_field_layout')
        .delete()
        .in('field_id', allFieldIds);
      if (delError) throw delError;
    }

    if (layouts.length > 0) {
      const rows = layouts.map(l => ({
        field_id: l.fieldId,
        row_index: l.rowIndex,
        column_index: l.columnIndex,
        width_columns: l.widthColumns,
        mobile_width_columns: l.mobileWidthColumns
      }));
      const { error } = await supabase
        .from('inbox_review_field_layout')
        .insert(rows);
      if (error) throw error;
    }
  },

  async exportTemplate(templateId: string): Promise<any> {
    const { data: tmplRow, error: tmplErr } = await supabase
      .from('inbox_review_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (tmplErr) throw tmplErr;

    const groups = await this.loadFieldGroups(templateId);
    const groupIds = groups.map(g => g.id);
    const fields = groupIds.length > 0 ? await this.loadFields(groupIds) : [];
    const fieldIds = fields.map(f => f.id);
    const layouts = fieldIds.length > 0 ? await this.loadLayouts(fieldIds) : [];

    return {
      version: '1.0',
      type: 'inbox_review_template',
      exportedAt: new Date().toISOString(),
      template: { name: tmplRow.name, description: tmplRow.description, isActive: tmplRow.is_active },
      fieldGroups: groups.map(g => ({
        id: g.id, groupName: g.groupName, groupOrder: g.groupOrder, description: g.description,
        isArrayGroup: g.isArrayGroup, arrayJsonPath: g.arrayJsonPath, isCollapsedByDefault: g.isCollapsedByDefault
      })),
      fields: fields.map(f => ({
        id: f.id, groupId: f.groupId, fieldName: f.fieldName, fieldLabel: f.fieldLabel,
        fieldType: f.fieldType, jsonPath: f.jsonPath, fieldOrder: f.fieldOrder,
        isRequired: f.isRequired, isEditable: f.isEditable, isVisible: f.isVisible,
        placeholder: f.placeholder, helpText: f.helpText, dropdownOptions: f.dropdownOptions,
        validationRegex: f.validationRegex, maxLength: f.maxLength, timeFormat: f.timeFormat, visibilityCondition: f.visibilityCondition
      })),
      layouts: layouts.map(l => ({
        fieldId: l.fieldId, rowIndex: l.rowIndex, columnIndex: l.columnIndex,
        widthColumns: l.widthColumns, mobileWidthColumns: l.mobileWidthColumns
      }))
    };
  },

  async importTemplate(
    importData: any,
    name: string
  ): Promise<InboxReviewTemplate> {
    const newTemplate = await this.createTemplate({
      name,
      description: importData.template?.description || '',
      isActive: true,
      isDefault: false
    });

    const groupIdMap: Record<string, string> = {};
    for (const g of importData.fieldGroups || []) {
      const created = await this.createFieldGroup({
        templateId: newTemplate.id,
        groupName: g.groupName,
        groupOrder: g.groupOrder,
        description: g.description || null,
        isArrayGroup: g.isArrayGroup || false,
        arrayJsonPath: g.arrayJsonPath || null,
        isCollapsedByDefault: g.isCollapsedByDefault || false
      });
      groupIdMap[g.id] = created.id;
    }

    const fieldIdMap: Record<string, string> = {};
    for (const f of importData.fields || []) {
      const newGroupId = groupIdMap[f.groupId];
      if (!newGroupId) continue;
      const created = await this.createField({
        groupId: newGroupId,
        fieldName: f.fieldName,
        fieldLabel: f.fieldLabel,
        fieldType: f.fieldType,
        jsonPath: f.jsonPath,
        fieldOrder: f.fieldOrder,
        isRequired: f.isRequired || false,
        isEditable: f.isEditable !== false,
        isVisible: f.isVisible !== false,
        placeholder: f.placeholder || null,
        helpText: f.helpText || null,
        dropdownOptions: f.dropdownOptions || null,
        validationRegex: f.validationRegex || null,
        maxLength: f.maxLength || null,
        timeFormat: f.timeFormat || '12h',
        visibilityCondition: f.visibilityCondition || null
      });
      fieldIdMap[f.id] = created.id;
    }

    const mappedLayouts = (importData.layouts || [])
      .filter((l: any) => fieldIdMap[l.fieldId])
      .map((l: any) => ({
        id: '',
        fieldId: fieldIdMap[l.fieldId],
        rowIndex: l.rowIndex,
        columnIndex: l.columnIndex,
        widthColumns: l.widthColumns || 6,
        mobileWidthColumns: l.mobileWidthColumns || 12,
        createdAt: '', updatedAt: ''
      }));

    if (mappedLayouts.length > 0) {
      await this.saveLayouts(mappedLayouts, Object.values(fieldIdMap));
    }

    return newTemplate;
  }
};

function mapTemplate(row: any): InboxReviewTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    isDefault: row.is_default || false,
    sampleJson: row.sample_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFieldGroup(row: any): InboxReviewFieldGroup {
  return {
    id: row.id,
    templateId: row.template_id,
    groupName: row.group_name,
    groupOrder: row.group_order,
    description: row.description,
    isArrayGroup: row.is_array_group || false,
    arrayJsonPath: row.array_json_path,
    isCollapsedByDefault: row.is_collapsed_by_default || false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapField(row: any): InboxReviewField {
  return {
    id: row.id,
    groupId: row.group_id,
    fieldName: row.field_name,
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    jsonPath: row.json_path,
    fieldOrder: row.field_order,
    isRequired: row.is_required,
    isEditable: row.is_editable,
    isVisible: row.is_visible,
    placeholder: row.placeholder,
    defaultValue: row.default_value || null,
    helpText: row.help_text,
    dropdownOptions: row.dropdown_options,
    validationRegex: row.validation_regex,
    maxLength: row.max_length,
    timeFormat: row.time_format || '12h',
    visibilityCondition: row.visibility_condition || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLayout(row: any): InboxReviewFieldLayout {
  return {
    id: row.id,
    fieldId: row.field_id,
    rowIndex: row.row_index,
    columnIndex: row.column_index,
    widthColumns: row.width_columns,
    mobileWidthColumns: row.mobile_width_columns,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
