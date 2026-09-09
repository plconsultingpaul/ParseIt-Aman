import { supabase } from '../lib/supabase';
import type {
  OrderEntryConfig,
  OrderEntryJsonSchema,
  OrderEntryFieldGroup,
  OrderEntryField,
  OrderEntryFieldLayout,
  OrderEntryPdf,
  OrderEntrySubmission,
  UserRegistrationToken
} from '../types';

export const orderEntryService = {
  async getConfig(): Promise<OrderEntryConfig | null> {
    const { data, error } = await supabase
      .from('order_entry_config')
      .select('*')
      .single();

    if (error) {
      console.error('Error loading order entry config:', error);
      return null;
    }

    return data ? this.transformConfig(data) : null;
  },

  async saveConfig(config: Partial<OrderEntryConfig>): Promise<{ success: boolean; message: string }> {
    try {
      const existing = await this.getConfig();

      const configData = {
        api_endpoint: config.apiEndpoint,
        api_method: config.apiMethod,
        api_headers: config.apiHeaders || {},
        api_auth_type: config.apiAuthType,
        api_auth_token: config.apiAuthToken,
        workflow_id: config.workflowId,
        is_enabled: config.isEnabled,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        const { error } = await supabase
          .from('order_entry_config')
          .update(configData)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('order_entry_config')
          .insert([{ ...configData, created_at: new Date().toISOString() }]);

        if (error) throw error;
      }

      return { success: true, message: 'Configuration saved successfully' };
    } catch (error) {
      console.error('Error saving config:', error);
      return { success: false, message: 'Failed to save configuration' };
    }
  },

  async getFieldGroups(): Promise<OrderEntryFieldGroup[]> {
    const { data, error } = await supabase
      .from('order_entry_field_groups')
      .select('*')
      .order('group_order', { ascending: true });

    if (error) {
      console.error('Error loading field groups:', error);
      return [];
    }

    return data.map(this.transformFieldGroup);
  },

  async saveFieldGroup(group: Partial<OrderEntryFieldGroup>): Promise<{ success: boolean; message: string; id?: string }> {
    try {
      const groupData = {
        group_name: group.groupName,
        group_order: group.groupOrder,
        description: group.description || '',
        is_collapsible: group.isCollapsible,
        is_expanded_by_default: group.isExpandedByDefault,
        background_color: group.backgroundColor || '',
        border_color: group.borderColor || '',
        updated_at: new Date().toISOString()
      };

      if (group.id) {
        const { error } = await supabase
          .from('order_entry_field_groups')
          .update(groupData)
          .eq('id', group.id);

        if (error) throw error;
        return { success: true, message: 'Group updated successfully', id: group.id };
      } else {
        const { data, error } = await supabase
          .from('order_entry_field_groups')
          .insert([{ ...groupData, created_at: new Date().toISOString() }])
          .select()
          .single();

        if (error) throw error;
        return { success: true, message: 'Group created successfully', id: data.id };
      }
    } catch (error) {
      console.error('Error saving field group:', error);
      return { success: false, message: 'Failed to save field group' };
    }
  },

  async deleteFieldGroup(groupId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { error } = await supabase
        .from('order_entry_field_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      return { success: true, message: 'Group deleted successfully' };
    } catch (error) {
      console.error('Error deleting field group:', error);
      return { success: false, message: 'Failed to delete field group' };
    }
  },

  async getFields(): Promise<OrderEntryField[]> {
    const { data, error } = await supabase
      .from('order_entry_fields')
      .select('*')
      .order('field_order', { ascending: true });

    if (error) {
      console.error('Error loading fields:', error);
      return [];
    }

    return data.map(this.transformField);
  },

  async saveField(field: Partial<OrderEntryField>): Promise<{ success: boolean; message: string; id?: string }> {
    try {
      const fieldData = {
        field_group_id: field.fieldGroupId,
        field_name: field.fieldName,
        field_label: field.fieldLabel,
        field_type: field.fieldType,
        placeholder: field.placeholder || '',
        help_text: field.helpText || '',
        is_required: field.isRequired,
        max_length: field.maxLength,
        min_value: field.minValue,
        max_value: field.maxValue,
        default_value: field.defaultValue || '',
        dropdown_options: JSON.stringify(field.dropdownOptions || []),
        json_path: field.jsonPath,
        is_array_field: field.isArrayField,
        array_min_rows: field.arrayMinRows,
        array_max_rows: field.arrayMaxRows,
        ai_extraction_instructions: field.aiExtractionInstructions || '',
        validation_regex: field.validationRegex || '',
        validation_error_message: field.validationErrorMessage || '',
        field_order: field.fieldOrder,
        future_dates_only: field.futureDatesOnly || false,
        updated_at: new Date().toISOString()
      };

      if (field.id) {
        const { error } = await supabase
          .from('order_entry_fields')
          .update(fieldData)
          .eq('id', field.id);

        if (error) throw error;
        return { success: true, message: 'Field updated successfully', id: field.id };
      } else {
        const { data, error } = await supabase
          .from('order_entry_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }])
          .select()
          .single();

        if (error) throw error;
        return { success: true, message: 'Field created successfully', id: data.id };
      }
    } catch (error) {
      console.error('Error saving field:', error);
      return { success: false, message: 'Failed to save field' };
    }
  },

  async deleteField(fieldId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { error } = await supabase
        .from('order_entry_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;
      return { success: true, message: 'Field deleted successfully' };
    } catch (error) {
      console.error('Error deleting field:', error);
      return { success: false, message: 'Failed to delete field' };
    }
  },

  async getFieldLayout(fieldId: string): Promise<OrderEntryFieldLayout | null> {
    const { data, error } = await supabase
      .from('order_entry_field_layout')
      .select('*')
      .eq('field_id', fieldId)
      .single();

    if (error) {
      return null;
    }

    return this.transformFieldLayout(data);
  },

  async saveFieldLayout(layout: Partial<OrderEntryFieldLayout>): Promise<{ success: boolean; message: string }> {
    try {
      const layoutData = {
        field_id: layout.fieldId,
        row_index: layout.rowIndex,
        column_index: layout.columnIndex,
        width_columns: layout.widthColumns,
        mobile_width_columns: layout.mobileWidthColumns,
        updated_at: new Date().toISOString()
      };

      const existing = await this.getFieldLayout(layout.fieldId!);

      if (existing) {
        const { error } = await supabase
          .from('order_entry_field_layout')
          .update(layoutData)
          .eq('field_id', layout.fieldId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('order_entry_field_layout')
          .insert([{ ...layoutData, created_at: new Date().toISOString() }]);

        if (error) throw error;
      }

      return { success: true, message: 'Layout saved successfully' };
    } catch (error) {
      console.error('Error saving field layout:', error);
      return { success: false, message: 'Failed to save field layout' };
    }
  },

  async uploadPdf(file: File, userId: string): Promise<{ success: boolean; pdf?: OrderEntryPdf; message?: string }> {
    try {
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name}`;
      const storagePath = `order-entry/${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('order_entry_pdfs')
        .insert([{
          user_id: userId,
          original_filename: file.name,
          storage_path: storagePath,
          file_size: file.size,
          page_count: 1,
          extraction_status: 'pending',
          extracted_data: {},
          extraction_confidence: {},
          error_message: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      return { success: true, pdf: this.transformPdf(data) };
    } catch (error) {
      console.error('Error uploading PDF:', error);
      return { success: false, message: 'Failed to upload PDF' };
    }
  },

  async createSubmission(
    userId: string,
    submissionData: Record<string, any>,
    pdfId?: string
  ): Promise<{ success: boolean; submission?: OrderEntrySubmission; message?: string }> {
    try {
      const { data, error } = await supabase
        .from('order_entry_submissions')
        .insert([{
          user_id: userId,
          pdf_id: pdfId,
          submission_data: submissionData,
          api_response: {},
          submission_status: 'pending',
          error_message: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      return { success: true, submission: this.transformSubmission(data) };
    } catch (error) {
      console.error('Error creating submission:', error);
      return { success: false, message: 'Failed to create submission' };
    }
  },

  async updateSubmission(
    submissionId: string,
    updates: Partial<OrderEntrySubmission>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.apiResponse !== undefined) updateData.api_response = updates.apiResponse;
      if (updates.apiStatusCode !== undefined) updateData.api_status_code = updates.apiStatusCode;
      if (updates.workflowExecutionLogId !== undefined) updateData.workflow_execution_log_id = updates.workflowExecutionLogId;
      if (updates.submissionStatus !== undefined) updateData.submission_status = updates.submissionStatus;
      if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;

      const { error } = await supabase
        .from('order_entry_submissions')
        .update(updateData)
        .eq('id', submissionId);

      if (error) throw error;

      return { success: true, message: 'Submission updated successfully' };
    } catch (error) {
      console.error('Error updating submission:', error);
      return { success: false, message: 'Failed to update submission' };
    }
  },

  async createRegistrationToken(userId: string): Promise<{ success: boolean; token?: string; message?: string }> {
    try {
      const token = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      const { error } = await supabase
        .from('user_registration_tokens')
        .insert([{
          user_id: userId,
          token,
          expires_at: expiresAt.toISOString(),
          is_used: false,
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      return { success: true, token };
    } catch (error) {
      console.error('Error creating registration token:', error);
      return { success: false, message: 'Failed to create registration token' };
    }
  },

  async validateToken(token: string): Promise<{ valid: boolean; userId?: string; message?: string }> {
    const { data, error } = await supabase.rpc('validate_registration_token', { p_token: token });

    if (error || !data || data.length === 0 || !data[0].valid) {
      return { valid: false, message: data?.[0]?.message || 'Invalid token' };
    }

    return { valid: true, userId: data[0].user_id };
  },

  async markTokenAsUsed(token: string): Promise<{ success: boolean }> {
    try {
      const { data, error } = await supabase.rpc('mark_registration_token_used', { p_token: token });
      return { success: !error && data === true };
    } catch (error) {
      console.error('Error marking token as used:', error);
      return { success: false };
    }
  },

  transformConfig(data: any): OrderEntryConfig {
    return {
      id: data.id,
      apiEndpoint: data.api_endpoint,
      apiMethod: data.api_method,
      apiHeaders: data.api_headers,
      apiAuthType: data.api_auth_type,
      apiAuthToken: data.api_auth_token,
      workflowId: data.workflow_id,
      isEnabled: data.is_enabled,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  transformFieldGroup(data: any): OrderEntryFieldGroup {
    return {
      id: data.id,
      groupName: data.group_name,
      groupOrder: data.group_order,
      description: data.description,
      isCollapsible: data.is_collapsible,
      isExpandedByDefault: data.is_expanded_by_default,
      backgroundColor: data.background_color,
      borderColor: data.border_color,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  transformField(data: any): OrderEntryField {
    return {
      id: data.id,
      fieldGroupId: data.field_group_id,
      fieldName: data.field_name,
      fieldLabel: data.field_label,
      fieldType: data.field_type,
      placeholder: data.placeholder,
      helpText: data.help_text,
      isRequired: data.is_required,
      maxLength: data.max_length,
      minValue: data.min_value,
      maxValue: data.max_value,
      defaultValue: data.default_value,
      dropdownOptions: typeof data.dropdown_options === 'string'
        ? JSON.parse(data.dropdown_options)
        : data.dropdown_options,
      jsonPath: data.json_path,
      isArrayField: data.is_array_field,
      arrayMinRows: data.array_min_rows,
      arrayMaxRows: data.array_max_rows,
      aiExtractionInstructions: data.ai_extraction_instructions,
      validationRegex: data.validation_regex,
      validationErrorMessage: data.validation_error_message,
      fieldOrder: data.field_order,
      futureDatesOnly: data.future_dates_only || false,
      countChildArrayRecords: data.count_child_array_records || false,
      countChildArrayGroupId: data.count_child_array_group_id || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  transformFieldLayout(data: any): OrderEntryFieldLayout {
    return {
      id: data.id,
      fieldId: data.field_id,
      rowIndex: data.row_index,
      columnIndex: data.column_index,
      widthColumns: data.width_columns,
      mobileWidthColumns: data.mobile_width_columns,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  transformPdf(data: any): OrderEntryPdf {
    return {
      id: data.id,
      userId: data.user_id,
      originalFilename: data.original_filename,
      storagePath: data.storage_path,
      fileSize: data.file_size,
      pageCount: data.page_count,
      extractionStatus: data.extraction_status,
      extractedData: data.extracted_data,
      extractionConfidence: data.extraction_confidence,
      errorMessage: data.error_message,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  transformSubmission(data: any): OrderEntrySubmission {
    return {
      id: data.id,
      userId: data.user_id,
      pdfId: data.pdf_id,
      submissionData: data.submission_data,
      apiResponse: data.api_response,
      apiStatusCode: data.api_status_code,
      workflowExecutionLogId: data.workflow_execution_log_id,
      submissionStatus: data.submission_status,
      errorMessage: data.error_message,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
};
