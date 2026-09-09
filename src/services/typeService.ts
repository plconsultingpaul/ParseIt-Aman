import { supabase } from '../lib/supabase';
import type { ExtractionType, TransformationType, ArrayEntryConfig, ArrayEntryField, ArraySplitConfig } from '../types';

// Extraction Types
export async function fetchExtractionTypes(): Promise<ExtractionType[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    console.log('[fetchExtractionTypes] Auth session:', {
      hasSession: !!sessionData?.session,
      userId: sessionData?.session?.user?.id,
      role: sessionData?.session?.user?.role,
      email: sessionData?.session?.user?.email
    });

    const { data, error } = await supabase
      .from('extraction_types')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('[fetchExtractionTypes] Query result:', {
      rowCount: data?.length ?? 0,
      error: error ? { message: error.message, code: error.code, details: error.details } : null
    });

    if (error) throw error;

    const types = data || [];

    // Fetch array split configurations
    const { data: arraySplitData, error: arraySplitError } = await supabase
      .from('extraction_type_array_splits')
      .select('*')
      .order('created_at', { ascending: true });

    if (arraySplitError) {
      console.error('Error fetching array split configs:', arraySplitError);
    }

    // Group array splits by extraction type ID
    const arraySplitsByType = new Map<string, any[]>();
    (arraySplitData || []).forEach(split => {
      if (!arraySplitsByType.has(split.extraction_type_id)) {
        arraySplitsByType.set(split.extraction_type_id, []);
      }
      arraySplitsByType.get(split.extraction_type_id)!.push(split);
    });

    // Fetch array entry configurations
    const { data: arrayEntryData, error: arrayEntryError } = await supabase
      .from('extraction_type_array_entries')
      .select('*')
      .order('entry_order', { ascending: true });

    if (arrayEntryError) {
      console.error('Error fetching array entry configs:', arrayEntryError);
    }

    // Fetch array entry fields
    const { data: arrayEntryFieldData, error: arrayEntryFieldError } = await supabase
      .from('extraction_type_array_entry_fields')
      .select('*')
      .order('field_order', { ascending: true });

    if (arrayEntryFieldError) {
      console.error('Error fetching array entry fields:', arrayEntryFieldError);
    }

    // Group entry fields by array entry ID
    const fieldsByEntryId = new Map<string, ArrayEntryField[]>();
    (arrayEntryFieldData || []).forEach(field => {
      if (!fieldsByEntryId.has(field.array_entry_id)) {
        fieldsByEntryId.set(field.array_entry_id, []);
      }
      fieldsByEntryId.get(field.array_entry_id)!.push({
        id: field.id,
        arrayEntryId: field.array_entry_id,
        fieldName: field.field_name,
        fieldType: field.field_type as 'hardcoded' | 'extracted',
        hardcodedValue: field.hardcoded_value,
        extractionInstruction: field.extraction_instruction,
        dataType: field.data_type as 'string' | 'number' | 'integer' | 'boolean' | 'datetime',
        maxLength: field.max_length,
        removeIfNull: field.remove_if_null,
        fieldOrder: field.field_order,
        createdAt: field.created_at
      });
    });

    // Group array entries by extraction type ID
    const arrayEntriesByType = new Map<string, ArrayEntryConfig[]>();
    (arrayEntryData || []).forEach(entry => {
      if (!arrayEntriesByType.has(entry.extraction_type_id)) {
        arrayEntriesByType.set(entry.extraction_type_id, []);
      }
      arrayEntriesByType.get(entry.extraction_type_id)!.push({
        id: entry.id,
        extractionTypeId: entry.extraction_type_id,
        targetArrayField: entry.target_array_field,
        entryOrder: entry.entry_order,
        isEnabled: entry.is_enabled,
        fields: fieldsByEntryId.get(entry.id) || [],
        conditions: entry.conditions || undefined,
        isRepeating: entry.is_repeating || false,
        repeatInstruction: entry.repeat_instruction || undefined,
        aiConditionInstruction: entry.ai_condition_instruction || undefined,
        removeEntryIfRinNull: entry.remove_entry_if_rin_null || false,
        parentArrayField: entry.parent_array_field || undefined,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      });
    });

    return types.map(type => ({
      id: type.id,
      name: type.name,
      defaultInstructions: type.default_instructions,
      formatTemplate: type.xml_format,
      filename: type.filename,
      formatType: type.format_type as 'XML' | 'JSON' | 'CSV',
      jsonPath: type.json_path,
      fieldMappings: type.field_mappings ? JSON.parse(type.field_mappings) : [],
      parseitIdMapping: type.parseit_id_mapping,
      traceTypeMapping: type.trace_type_mapping,
      traceTypeValue: type.trace_type_value,
      workflowId: type.workflow_id,
      workflowVersion: type.workflow_version || 'v1',
      workflowV2Id: type.workflow_v2_id || undefined,
      autoDetectInstructions: type.auto_detect_instructions,
      csvDelimiter: type.csv_delimiter,
      csvIncludeHeaders: type.csv_include_headers,
      csvRowDetectionInstructions: type.csv_row_detection_instructions,
      csvMultiPageProcessing: type.csv_multi_page_processing,
      jsonMultiPageProcessing: type.json_multi_page_processing,
      defaultUploadMode: type.default_upload_mode as 'manual' | 'auto' | undefined,
      lockUploadMode: type.lock_upload_mode || false,
      pageProcessingMode: type.page_processing_mode as 'all' | 'single' | 'range' | undefined,
      pageProcessingSinglePage: type.page_processing_single_page,
      pageProcessingRangeStart: type.page_processing_range_start,
      pageProcessingRangeEnd: type.page_processing_range_end,
      combinePagesAsSingleExtraction: type.combine_pages_as_single_extraction || false,
      enableFailureNotifications: type.enable_failure_notifications || false,
      failureNotificationTemplateId: type.failure_notification_template_id,
      failureRecipientEmailOverride: type.failure_recipient_email_override,
      enableSuccessNotifications: type.enable_success_notifications || false,
      successNotificationTemplateId: type.success_notification_template_id,
      successRecipientEmailOverride: type.success_recipient_email_override,
      enableReview: type.enable_review || false,
      enableConfidenceScoring: type.enable_confidence_scoring || false,
      inboxReviewTemplateId: type.inbox_review_template_id || undefined,
      arraySplitConfigs: (arraySplitsByType.get(type.id) || []).map(split => ({
        id: split.id,
        extractionTypeId: split.extraction_type_id,
        targetArrayField: split.target_array_field,
        splitBasedOnField: split.split_based_on_field,
        splitStrategy: split.split_strategy as 'one_per_entry' | 'divide_evenly',
        defaultToOneIfMissing: split.default_to_one_if_missing || false,
        createdAt: split.created_at,
        updatedAt: split.updated_at
      })),
      arrayEntryConfigs: arrayEntriesByType.get(type.id) || []
    }));
  } catch (error) {
    console.error('Error fetching extraction types:', error);
    throw error;
  }
}

export async function updateExtractionTypes(types: ExtractionType[]): Promise<void> {
  try {
    const { data: existingTypes } = await supabase
      .from('extraction_types')
      .select('id');

    const existingIds = new Set((existingTypes || []).map(t => t.id));
    const typesToUpdate = types.filter(type => existingIds.has(type.id) && !type.id.startsWith('temp-'));
    const typesToInsert = types.filter(type => !existingIds.has(type.id) || type.id.startsWith('temp-'));

    for (const type of typesToUpdate) {
      const { error } = await supabase
        .from('extraction_types')
        .update({
          name: type.name,
          default_instructions: type.defaultInstructions,
          xml_format: type.formatTemplate,
          filename: type.filename,
          format_type: type.formatType,
          json_path: type.jsonPath,
          field_mappings: type.fieldMappings ? JSON.stringify(type.fieldMappings) : null,
          parseit_id_mapping: type.parseitIdMapping,
          trace_type_mapping: type.traceTypeMapping,
          trace_type_value: type.traceTypeValue,
          workflow_id: type.workflowId || null,
          workflow_version: type.workflowVersion || 'v1',
          workflow_v2_id: type.workflowV2Id || null,
          auto_detect_instructions: type.autoDetectInstructions,
          csv_delimiter: type.csvDelimiter || ',',
          csv_include_headers: type.csvIncludeHeaders !== false,
          csv_row_detection_instructions: type.csvRowDetectionInstructions || null,
          csv_multi_page_processing: type.csvMultiPageProcessing || false,
          json_multi_page_processing: type.jsonMultiPageProcessing || false,
          default_upload_mode: type.defaultUploadMode || null,
          lock_upload_mode: type.lockUploadMode || false,
          page_processing_mode: type.pageProcessingMode || 'all',
          page_processing_single_page: type.pageProcessingSinglePage || 1,
          page_processing_range_start: type.pageProcessingRangeStart || 1,
          page_processing_range_end: type.pageProcessingRangeEnd || 1,
          combine_pages_as_single_extraction: type.combinePagesAsSingleExtraction || false,
          enable_failure_notifications: type.enableFailureNotifications || false,
          failure_notification_template_id: type.failureNotificationTemplateId || null,
          failure_recipient_email_override: type.failureRecipientEmailOverride || null,
          enable_success_notifications: type.enableSuccessNotifications || false,
          success_notification_template_id: type.successNotificationTemplateId || null,
          success_recipient_email_override: type.successRecipientEmailOverride || null,
          enable_review: type.enableReview || false,
          enable_confidence_scoring: type.enableConfidenceScoring || false,
          inbox_review_template_id: type.inboxReviewTemplateId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', type.id);

      if (error) throw error;
    }

    if (typesToInsert.length > 0) {
      const insertData = typesToInsert.map(type => ({
        name: type.name,
        default_instructions: type.defaultInstructions || '',
        xml_format: type.formatTemplate || '',
        filename: type.filename || '',
        format_type: type.formatType || 'XML',
        json_path: type.jsonPath || '',
        field_mappings: type.fieldMappings ? JSON.stringify(type.fieldMappings) : null,
        parseit_id_mapping: type.parseitIdMapping || null,
        trace_type_mapping: type.traceTypeMapping || null,
        trace_type_value: type.traceTypeValue || null,
        workflow_id: type.workflowId || null,
        workflow_version: type.workflowVersion || 'v1',
        workflow_v2_id: type.workflowV2Id || null,
        auto_detect_instructions: type.autoDetectInstructions || null,
        csv_delimiter: type.csvDelimiter || ',',
        csv_include_headers: type.csvIncludeHeaders !== false,
        csv_row_detection_instructions: type.csvRowDetectionInstructions || null,
        csv_multi_page_processing: type.csvMultiPageProcessing || false,
        json_multi_page_processing: type.jsonMultiPageProcessing || false,
        default_upload_mode: type.defaultUploadMode || null,
        lock_upload_mode: type.lockUploadMode || false,
        page_processing_mode: type.pageProcessingMode || 'all',
        page_processing_single_page: type.pageProcessingSinglePage || 1,
        page_processing_range_start: type.pageProcessingRangeStart || 1,
        page_processing_range_end: type.pageProcessingRangeEnd || 1,
        combine_pages_as_single_extraction: type.combinePagesAsSingleExtraction || false,
        enable_failure_notifications: type.enableFailureNotifications || false,
        failure_notification_template_id: type.failureNotificationTemplateId || null,
        failure_recipient_email_override: type.failureRecipientEmailOverride || null,
        enable_success_notifications: type.enableSuccessNotifications || false,
        success_notification_template_id: type.successNotificationTemplateId || null,
        success_recipient_email_override: type.successRecipientEmailOverride || null,
        enable_review: type.enableReview || false,
        enable_confidence_scoring: type.enableConfidenceScoring || false,
        inbox_review_template_id: type.inboxReviewTemplateId || null
      }));

      const { error } = await supabase
        .from('extraction_types')
        .insert(insertData);

      if (error) throw error;
    }

    for (const type of types) {
      if (!type.id.startsWith('temp-') && type.arraySplitConfigs) {

        const { data: existingArraySplits } = await supabase
          .from('extraction_type_array_splits')
          .select('id')
          .eq('extraction_type_id', type.id);

        const existingArraySplitIds = new Set((existingArraySplits || []).map(split => split.id));
        const splitsToUpdate = type.arraySplitConfigs.filter(split => existingArraySplitIds.has(split.id!) && !split.id!.startsWith('temp-'));
        const splitsToInsert = type.arraySplitConfigs.filter(split => !split.id || !existingArraySplitIds.has(split.id) || split.id.startsWith('temp-'));
        const splitIdsToKeep = new Set(type.arraySplitConfigs.filter(s => s.id).map(split => split.id!));
        const splitsToDelete = (existingArraySplits || []).filter(split => !splitIdsToKeep.has(split.id));

        for (const split of splitsToUpdate) {
          const { error } = await supabase
            .from('extraction_type_array_splits')
            .update({
              target_array_field: split.targetArrayField,
              split_based_on_field: split.splitBasedOnField,
              split_strategy: split.splitStrategy,
              default_to_one_if_missing: split.defaultToOneIfMissing || false,
              updated_at: new Date().toISOString()
            })
            .eq('id', split.id!);

          if (error) throw new Error(`Failed to update array split configuration: ${error.message}`);
        }

        if (splitsToInsert.length > 0) {
          const insertData = splitsToInsert.map(split => ({
            extraction_type_id: type.id,
            target_array_field: split.targetArrayField,
            split_based_on_field: split.splitBasedOnField,
            split_strategy: split.splitStrategy,
            default_to_one_if_missing: split.defaultToOneIfMissing || false
          }));

          const { error } = await supabase
            .from('extraction_type_array_splits')
            .insert(insertData);

          if (error) throw new Error(`Failed to save array split configuration: ${error.message}`);
        }

        for (const split of splitsToDelete) {
          const { error } = await supabase
            .from('extraction_type_array_splits')
            .delete()
            .eq('id', split.id);

          if (error) throw error;
        }
      }
    }

    for (const type of types) {
      if (!type.id.startsWith('temp-') && type.arrayEntryConfigs) {
        console.log('=== Array Entry Processing for type:', type.name, '===');
        console.log('type.arrayEntryConfigs passed in:', type.arrayEntryConfigs.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));

        const { data: existingEntries } = await supabase
          .from('extraction_type_array_entries')
          .select('id')
          .eq('extraction_type_id', type.id);

        console.log('existingEntries in DB:', existingEntries?.map(e => e.id));

        const existingEntryIds = new Set((existingEntries || []).map(e => e.id));
        const entriesToUpdate = type.arrayEntryConfigs.filter(e => e.id && existingEntryIds.has(e.id) && !e.id.startsWith('temp-'));
        const entriesToInsert = type.arrayEntryConfigs.filter(e => !e.id || !existingEntryIds.has(e.id) || e.id.startsWith('temp-'));
        const entryIdsToKeep = new Set(type.arrayEntryConfigs.filter(e => e.id).map(e => e.id!));
        const entriesToDelete = (existingEntries || []).filter(e => !entryIdsToKeep.has(e.id));

        console.log('entriesToUpdate:', entriesToUpdate.map(e => ({ id: e.id, targetArrayField: e.targetArrayField })));
        console.log('entriesToInsert:', entriesToInsert.map(e => ({ id: e.id, targetArrayField: e.targetArrayField })));
        console.log('entriesToDelete:', entriesToDelete.map(e => e.id));

        for (const entry of entriesToUpdate) {
          const { error } = await supabase
            .from('extraction_type_array_entries')
            .update({
              target_array_field: entry.targetArrayField,
              entry_order: entry.entryOrder,
              is_enabled: entry.isEnabled,
              conditions: entry.conditions || null,
              is_repeating: entry.isRepeating || false,
              repeat_instruction: entry.repeatInstruction || null,
              ai_condition_instruction: entry.aiConditionInstruction || null,
              remove_entry_if_rin_null: entry.removeEntryIfRinNull || false,
              parent_array_field: entry.parentArrayField || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', entry.id!);

          if (error) throw error;

          // Update fields for this entry
          await updateArrayEntryFields(entry.id!, entry.fields);
        }

        for (const entry of entriesToInsert) {
          const { data: insertedEntry, error } = await supabase
            .from('extraction_type_array_entries')
            .insert({
              extraction_type_id: type.id,
              target_array_field: entry.targetArrayField,
              entry_order: entry.entryOrder,
              is_enabled: entry.isEnabled,
              conditions: entry.conditions || null,
              is_repeating: entry.isRepeating || false,
              repeat_instruction: entry.repeatInstruction || null,
              ai_condition_instruction: entry.aiConditionInstruction || null,
              remove_entry_if_rin_null: entry.removeEntryIfRinNull || false,
              parent_array_field: entry.parentArrayField || null
            })
            .select('id')
            .single();

          if (error) throw error;

          if (insertedEntry && entry.fields.length > 0) {
            await insertArrayEntryFields(insertedEntry.id, entry.fields);
          }
        }

        for (const entry of entriesToDelete) {
          const { error } = await supabase
            .from('extraction_type_array_entries')
            .delete()
            .eq('id', entry.id);

          if (error) throw error;
        }
      }
    }
  } catch (error) {
    console.error('Error updating extraction types:', error);
    throw error;
  }
}

async function updateArrayEntryFields(entryId: string, fields: ArrayEntryField[]): Promise<void> {
  // Get existing fields
  const { data: existingFields } = await supabase
    .from('extraction_type_array_entry_fields')
    .select('id')
    .eq('array_entry_id', entryId);

  const existingFieldIds = new Set((existingFields || []).map(f => f.id));
  const fieldsToUpdate = fields.filter(f => f.id && existingFieldIds.has(f.id) && !f.id.startsWith('temp-'));
  const fieldsToInsert = fields.filter(f => !f.id || !existingFieldIds.has(f.id) || f.id.startsWith('temp-'));
  const fieldIdsToKeep = new Set(fields.filter(f => f.id).map(f => f.id!));
  const fieldsToDelete = (existingFields || []).filter(f => !fieldIdsToKeep.has(f.id));

  // Update existing fields
  for (const field of fieldsToUpdate) {
    const { error } = await supabase
      .from('extraction_type_array_entry_fields')
      .update({
        field_name: field.fieldName,
        field_type: field.fieldType,
        hardcoded_value: field.hardcodedValue || null,
        extraction_instruction: field.extractionInstruction || null,
        data_type: field.dataType || 'string',
        max_length: field.maxLength || null,
        remove_if_null: field.removeIfNull || false,
        field_order: field.fieldOrder
      })
      .eq('id', field.id!);

    if (error) throw error;
  }

  // Insert new fields
  if (fieldsToInsert.length > 0) {
    await insertArrayEntryFields(entryId, fieldsToInsert);
  }

  // Delete removed fields
  for (const field of fieldsToDelete) {
    const { error } = await supabase
      .from('extraction_type_array_entry_fields')
      .delete()
      .eq('id', field.id);

    if (error) throw error;
  }
}

async function insertArrayEntryFields(entryId: string, fields: ArrayEntryField[]): Promise<void> {
  const insertData = fields.map(field => ({
    array_entry_id: entryId,
    field_name: field.fieldName,
    field_type: field.fieldType,
    hardcoded_value: field.hardcodedValue || null,
    extraction_instruction: field.extractionInstruction || null,
    data_type: field.dataType || 'string',
    max_length: field.maxLength || null,
    remove_if_null: field.removeIfNull || false,
    field_order: field.fieldOrder
  }));

  const { error } = await supabase
    .from('extraction_type_array_entry_fields')
    .insert(insertData);

  if (error) throw error;
}

export async function deleteExtractionType(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('extraction_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting extraction type:', error);
    throw error;
  }
}

// Transformation Types
export async function fetchTransformationTypes(): Promise<TransformationType[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    console.log('[fetchTransformationTypes] Auth session:', {
      hasSession: !!sessionData?.session,
      userId: sessionData?.session?.user?.id,
      role: sessionData?.session?.user?.role,
      email: sessionData?.session?.user?.email
    });

    const { data, error } = await supabase
      .from('transformation_types')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('[fetchTransformationTypes] Query result:', {
      rowCount: data?.length ?? 0,
      error: error ? { message: error.message, code: error.code, details: error.details } : null
    });

    if (error) throw error;

    const types = data || [];

    const { data: pageGroupData, error: pageGroupError } = await supabase
      .from('page_group_configs')
      .select('*')
      .order('group_order', { ascending: true });

    if (pageGroupError) {
      console.error('Error fetching page group configs:', pageGroupError);
    }

    const pageGroupsByType = new Map<string, any[]>();
    (pageGroupData || []).forEach(pg => {
      if (!pageGroupsByType.has(pg.transformation_type_id)) {
        pageGroupsByType.set(pg.transformation_type_id, []);
      }
      pageGroupsByType.get(pg.transformation_type_id)!.push(pg);
    });

    return types.map(type => ({
      id: type.id,
      name: type.name,
      defaultInstructions: type.default_instructions,
      filenameTemplate: type.filename_template,
      fieldMappings: type.field_mappings ? JSON.parse(type.field_mappings) : [],
      autoDetectInstructions: type.auto_detect_instructions,
      workflowId: type.workflow_id,
      workflowVersion: type.workflow_version || 'v1',
      workflowV2Id: type.workflow_v2_id || undefined,
      userId: type.user_id,
      createdAt: type.created_at,
      updatedAt: type.updated_at,
      pagesPerGroup: type.pages_per_group || 1,
      documentStartPattern: type.document_start_pattern,
      documentStartDetectionEnabled: type.document_start_detection_enabled || false,
      defaultUploadMode: type.default_upload_mode as 'manual' | 'auto' | undefined,
      lockUploadMode: type.lock_upload_mode || false,
      pageGroupConfigs: (pageGroupsByType.get(type.id) || []).map(pg => ({
        id: pg.id,
        transformationTypeId: pg.transformation_type_id,
        name: pg.name || '',
        groupOrder: pg.group_order,
        pagesPerGroup: pg.pages_per_group,
        workflowId: pg.workflow_id,
        workflowVersion: pg.workflow_version || 'v1',
        workflowV2Id: pg.workflow_v2_id || undefined,
        smartDetectionPattern: pg.smart_detection_pattern,
        processMode: pg.process_mode as 'single' | 'all',
        filenameTemplate: pg.filename_template,
        fieldMappings: pg.field_mappings ? JSON.parse(pg.field_mappings) : undefined,
        useAiDetection: pg.use_ai_detection || false,
        fallbackBehavior: pg.fallback_behavior as 'skip' | 'fixed_position' | 'error' | undefined,
        detectionConfidenceThreshold: pg.detection_confidence_threshold || 0.7,
        followsPreviousGroup: pg.follows_previous_group || false,
        detectionMode: pg.detection_mode || 'detect',
        createdAt: pg.created_at,
        updatedAt: pg.updated_at
      }))
    }));
  } catch (error) {
    console.error('Error fetching transformation types:', error);
    throw error;
  }
}

export async function updateTransformationTypes(types: TransformationType[]): Promise<void> {
  try {
    const { data: existingTypes } = await supabase
      .from('transformation_types')
      .select('id');

    const existingIds = new Set((existingTypes || []).map(t => t.id));
    const typesToUpdate = types.filter(type => existingIds.has(type.id) && !type.id.startsWith('temp-'));
    const typesToInsert = types.filter(type => !existingIds.has(type.id) || type.id.startsWith('temp-'));

    for (const type of typesToUpdate) {
      const { error } = await supabase
        .from('transformation_types')
        .update({
          name: type.name,
          default_instructions: type.defaultInstructions,
          filename_template: type.filenameTemplate,
          field_mappings: type.fieldMappings ? JSON.stringify(type.fieldMappings) : null,
          auto_detect_instructions: type.autoDetectInstructions,
          workflow_id: type.workflowId,
          workflow_version: type.workflowVersion || 'v1',
          workflow_v2_id: type.workflowV2Id || null,
          user_id: type.userId,
          pages_per_group: type.pagesPerGroup || 1,
          document_start_pattern: type.documentStartPattern,
          document_start_detection_enabled: type.documentStartDetectionEnabled || false,
          default_upload_mode: type.defaultUploadMode || null,
          lock_upload_mode: type.lockUploadMode || false,
          updated_at: new Date().toISOString()
        })
        .eq('id', type.id);

      if (error) throw error;
    }

    if (typesToInsert.length > 0) {
      const insertData = typesToInsert.map(type => ({
        name: type.name,
        default_instructions: type.defaultInstructions || '',
        filename_template: type.filenameTemplate || '',
        field_mappings: type.fieldMappings ? JSON.stringify(type.fieldMappings) : null,
        auto_detect_instructions: type.autoDetectInstructions || '',
        workflow_id: type.workflowId || null,
        workflow_version: type.workflowVersion || 'v1',
        workflow_v2_id: type.workflowV2Id || null,
        user_id: type.userId || null,
        pages_per_group: type.pagesPerGroup || 1,
        document_start_pattern: type.documentStartPattern || null,
        document_start_detection_enabled: type.documentStartDetectionEnabled || false,
        default_upload_mode: type.defaultUploadMode || null,
        lock_upload_mode: type.lockUploadMode || false
      }));

      const { error } = await supabase
        .from('transformation_types')
        .insert(insertData);

      if (error) throw error;
    }

    for (const type of types) {
      if (!type.id.startsWith('temp-') && type.pageGroupConfigs) {

        const { data: existingPageGroups } = await supabase
          .from('page_group_configs')
          .select('id')
          .eq('transformation_type_id', type.id);

        const existingPageGroupIds = new Set((existingPageGroups || []).map(pg => pg.id));
        const configsToUpdate = type.pageGroupConfigs.filter(cfg => existingPageGroupIds.has(cfg.id) && !cfg.id.startsWith('temp-'));
        const configsToInsert = type.pageGroupConfigs.filter(cfg => !existingPageGroupIds.has(cfg.id) || cfg.id.startsWith('temp-'));
        const configIdsToKeep = new Set(type.pageGroupConfigs.map(cfg => cfg.id));
        const configsToDelete = (existingPageGroups || []).filter(pg => !configIdsToKeep.has(pg.id));

        for (const config of configsToUpdate) {
          const { error } = await supabase
            .from('page_group_configs')
            .update({
              name: config.name || '',
              group_order: config.groupOrder,
              pages_per_group: config.pagesPerGroup,
              workflow_id: config.workflowId || null,
              workflow_version: config.workflowVersion || 'v1',
              workflow_v2_id: config.workflowV2Id || null,
              smart_detection_pattern: config.smartDetectionPattern || null,
              process_mode: config.processMode,
              filename_template: config.filenameTemplate || null,
              field_mappings: config.fieldMappings ? JSON.stringify(config.fieldMappings) : null,
              use_ai_detection: config.useAiDetection || false,
              fallback_behavior: config.fallbackBehavior || 'skip',
              detection_confidence_threshold: config.detectionConfidenceThreshold || 0.7,
              follows_previous_group: config.followsPreviousGroup || false,
              detection_mode: config.detectionMode || 'detect',
              updated_at: new Date().toISOString()
            })
            .eq('id', config.id);

          if (error) throw error;
        }

        if (configsToInsert.length > 0) {
          const insertData = configsToInsert.map(config => ({
            transformation_type_id: type.id,
            name: config.name || '',
            group_order: config.groupOrder,
            pages_per_group: config.pagesPerGroup,
            workflow_id: config.workflowId || null,
            workflow_version: config.workflowVersion || 'v1',
            workflow_v2_id: config.workflowV2Id || null,
            smart_detection_pattern: config.smartDetectionPattern || null,
            process_mode: config.processMode,
            filename_template: config.filenameTemplate || null,
            field_mappings: config.fieldMappings ? JSON.stringify(config.fieldMappings) : null,
            use_ai_detection: config.useAiDetection || false,
            fallback_behavior: config.fallbackBehavior || 'skip',
            detection_confidence_threshold: config.detectionConfidenceThreshold || 0.7,
            follows_previous_group: config.followsPreviousGroup || false,
            detection_mode: config.detectionMode || 'detect'
          }));

          const { error } = await supabase
            .from('page_group_configs')
            .insert(insertData);

          if (error) throw error;
        }

        for (const config of configsToDelete) {
          const { error } = await supabase
            .from('page_group_configs')
            .delete()
            .eq('id', config.id);

          if (error) throw error;
        }

      }
    }
  } catch (error) {
    console.error('Error updating transformation types:', error);
    throw error;
  }
}

export async function deleteTransformationType(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('transformation_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting transformation type:', error);
    throw error;
  }
}

export interface ExportedExtractionType {
  exportVersion: string;
  exportType: 'extraction';
  exportDate: string;
  typeName: string;
  type: Omit<ExtractionType, 'id' | 'workflowId'>;
  relatedData: {
    arraySplitConfigs: Omit<ArraySplitConfig, 'id' | 'extractionTypeId'>[];
    arrayEntryConfigs: {
      targetArrayField: string;
      entryOrder: number;
      isEnabled: boolean;
      fields: Omit<ArrayEntryField, 'id' | 'arrayEntryId'>[];
    }[];
    functions: {
      function_name: string;
      description?: string;
      function_type: string;
      function_logic: any;
    }[];
  };
}

export interface ExportedTransformationType {
  exportVersion: string;
  exportType: 'transformation';
  exportDate: string;
  typeName: string;
  type: Omit<TransformationType, 'id' | 'workflowId' | 'userId'>;
  relatedData: {
    pageGroupConfigs: Omit<PageGroupConfig, 'id' | 'transformationTypeId' | 'workflowId'>[];
  };
}

export async function exportExtractionType(extractionType: ExtractionType): Promise<ExportedExtractionType> {
  const { data: arraySplits } = await supabase
    .from('extraction_type_array_splits')
    .select('*')
    .eq('extraction_type_id', extractionType.id);

  const { data: arrayEntries } = await supabase
    .from('extraction_type_array_entries')
    .select('*')
    .eq('extraction_type_id', extractionType.id)
    .order('entry_order');

  const entryIds = (arrayEntries || []).map(e => e.id);
  let entryFields: any[] = [];
  if (entryIds.length > 0) {
    const { data: fields } = await supabase
      .from('extraction_type_array_entry_fields')
      .select('*')
      .in('array_entry_id', entryIds)
      .order('field_order');
    entryFields = fields || [];
  }

  const functionIds: string[] = [];
  if (extractionType.fieldMappings) {
    extractionType.fieldMappings.forEach(mapping => {
      if (mapping.type === 'function' && mapping.functionId) {
        functionIds.push(mapping.functionId);
      }
    });
  }

  let functions: any[] = [];
  if (functionIds.length > 0) {
    const { data: funcs } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .in('id', functionIds);
    functions = funcs || [];
  }

  const { id, workflowId, ...typeWithoutIdAndWorkflow } = extractionType;

  return {
    exportVersion: '1.0',
    exportType: 'extraction',
    exportDate: new Date().toISOString(),
    typeName: extractionType.name,
    type: typeWithoutIdAndWorkflow,
    relatedData: {
      arraySplitConfigs: (arraySplits || []).map(split => ({
        targetArrayField: split.target_array_field,
        splitBasedOnField: split.split_based_on_field,
        splitStrategy: split.split_strategy,
        defaultToOneIfMissing: split.default_to_one_if_missing
      })),
      arrayEntryConfigs: (arrayEntries || []).map(entry => ({
        targetArrayField: entry.target_array_field,
        entryOrder: entry.entry_order,
        isEnabled: entry.is_enabled,
        conditions: entry.conditions || undefined,
        isRepeating: entry.is_repeating || false,
        repeatInstruction: entry.repeat_instruction || undefined,
        aiConditionInstruction: entry.ai_condition_instruction || undefined,
        removeEntryIfRinNull: entry.remove_entry_if_rin_null || false,
        parentArrayField: entry.parent_array_field || undefined,
        fields: entryFields
          .filter(f => f.array_entry_id === entry.id)
          .map(f => ({
            fieldName: f.field_name,
            fieldType: f.field_type,
            hardcodedValue: f.hardcoded_value,
            extractionInstruction: f.extraction_instruction,
            dataType: f.data_type,
            maxLength: f.max_length,
            removeIfNull: f.remove_if_null,
            fieldOrder: f.field_order
          }))
      })),
      functions: functions.map(f => ({
        function_name: f.function_name,
        description: f.description,
        function_type: f.function_type || 'conditional',
        function_logic: f.function_logic
      }))
    }
  };
}

export async function importExtractionType(exportData: ExportedExtractionType): Promise<{ success: boolean; newTypeId?: string; error?: string }> {
  try {
    const { data: existingTypes } = await supabase
      .from('extraction_types')
      .select('name')
      .ilike('name', exportData.typeName);

    let newName = exportData.typeName;
    if (existingTypes && existingTypes.length > 0) {
      newName = `${exportData.typeName} (Imported)`;
    }

    const functionIdMap = new Map<string, string>();

    for (const func of exportData.relatedData.functions) {
      const { data: existingFunc } = await supabase
        .from('field_mapping_functions')
        .select('id, function_name')
        .eq('function_name', func.function_name)
        .maybeSingle();

      if (existingFunc) {
        functionIdMap.set(func.function_name, existingFunc.id);
      } else {
        const { data: newFunc, error: funcError } = await supabase
          .from('field_mapping_functions')
          .insert({
            function_name: func.function_name,
            description: func.description,
            function_type: func.function_type,
            function_logic: func.function_logic
          })
          .select('id')
          .single();

        if (funcError) throw funcError;
        functionIdMap.set(func.function_name, newFunc.id);
      }
    }

    let fieldMappings = exportData.type.fieldMappings;
    if (fieldMappings) {
      fieldMappings = fieldMappings.map(mapping => {
        if (mapping.type === 'function' && mapping.functionId) {
          const funcData = exportData.relatedData.functions.find(f => {
            const originalFunc = exportData.relatedData.functions.find(fn => fn.function_name);
            return originalFunc;
          });
          if (funcData) {
            const newFuncId = functionIdMap.get(funcData.function_name);
            if (newFuncId) {
              return { ...mapping, functionId: newFuncId };
            }
          }
        }
        return mapping;
      });
    }

    const { data: newType, error: typeError } = await supabase
      .from('extraction_types')
      .insert({
        name: newName,
        default_instructions: exportData.type.defaultInstructions || '',
        xml_format: exportData.type.formatTemplate || '',
        filename: exportData.type.filename || '',
        format_type: exportData.type.formatType || 'XML',
        json_path: exportData.type.jsonPath || '',
        field_mappings: fieldMappings ? JSON.stringify(fieldMappings) : null,
        parseit_id_mapping: exportData.type.parseitIdMapping || null,
        trace_type_mapping: exportData.type.traceTypeMapping || null,
        trace_type_value: exportData.type.traceTypeValue || null,
        auto_detect_instructions: exportData.type.autoDetectInstructions || null,
        csv_delimiter: exportData.type.csvDelimiter || ',',
        csv_include_headers: exportData.type.csvIncludeHeaders !== false,
        csv_row_detection_instructions: exportData.type.csvRowDetectionInstructions || null,
        csv_multi_page_processing: exportData.type.csvMultiPageProcessing || false,
        json_multi_page_processing: exportData.type.jsonMultiPageProcessing || false,
        default_upload_mode: exportData.type.defaultUploadMode || null,
        lock_upload_mode: exportData.type.lockUploadMode || false,
        page_processing_mode: exportData.type.pageProcessingMode || 'all',
        page_processing_single_page: exportData.type.pageProcessingSinglePage || 1,
        page_processing_range_start: exportData.type.pageProcessingRangeStart || 1,
        page_processing_range_end: exportData.type.pageProcessingRangeEnd || 1
      })
      .select('id')
      .single();

    if (typeError) throw typeError;

    if (exportData.relatedData.arraySplitConfigs.length > 0) {
      const { error: splitError } = await supabase
        .from('extraction_type_array_splits')
        .insert(exportData.relatedData.arraySplitConfigs.map(split => ({
          extraction_type_id: newType.id,
          target_array_field: split.targetArrayField,
          split_based_on_field: split.splitBasedOnField,
          split_strategy: split.splitStrategy,
          default_to_one_if_missing: split.defaultToOneIfMissing
        })));

      if (splitError) throw splitError;
    }

    for (const entry of exportData.relatedData.arrayEntryConfigs) {
      const { data: newEntry, error: entryError } = await supabase
        .from('extraction_type_array_entries')
        .insert({
          extraction_type_id: newType.id,
          target_array_field: entry.targetArrayField,
          entry_order: entry.entryOrder,
          is_enabled: entry.isEnabled,
          conditions: entry.conditions || null,
          is_repeating: entry.isRepeating || false,
          repeat_instruction: entry.repeatInstruction || null,
          ai_condition_instruction: entry.aiConditionInstruction || null,
          remove_entry_if_rin_null: entry.removeEntryIfRinNull || false,
          parent_array_field: (entry as any).parentArrayField || null
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      if (entry.fields.length > 0) {
        const { error: fieldsError } = await supabase
          .from('extraction_type_array_entry_fields')
          .insert(entry.fields.map(f => ({
            array_entry_id: newEntry.id,
            field_name: f.fieldName,
            field_type: f.fieldType,
            hardcoded_value: f.hardcodedValue || null,
            extraction_instruction: f.extractionInstruction || null,
            data_type: f.dataType || 'string',
            max_length: f.maxLength || null,
            remove_if_null: f.removeIfNull || false,
            field_order: f.fieldOrder
          })));

        if (fieldsError) throw fieldsError;
      }
    }

    for (const func of exportData.relatedData.functions) {
      const newFuncId = functionIdMap.get(func.function_name);
      if (newFuncId) {
        await supabase
          .from('field_mapping_functions')
          .update({ extraction_type_id: newType.id })
          .eq('id', newFuncId)
          .is('extraction_type_id', null);
      }
    }

    return { success: true, newTypeId: newType.id };
  } catch (error: any) {
    console.error('Error importing extraction type:', error);
    return { success: false, error: error.message };
  }
}

interface PageGroupConfig {
  id: string;
  transformationTypeId: string;
  groupOrder: number;
  pagesPerGroup: number;
  workflowId?: string;
  smartDetectionPattern?: string;
  processMode: 'single' | 'all';
  filenameTemplate?: string;
  fieldMappings?: any[];
  useAiDetection?: boolean;
  fallbackBehavior?: 'skip' | 'fixed_position' | 'error';
  detectionConfidenceThreshold?: number;
  followsPreviousGroup?: boolean;
  detectionMode?: 'detect' | 'fixed_sequence';
}

export async function exportTransformationType(transformationType: TransformationType): Promise<ExportedTransformationType> {
  const { data: pageGroups } = await supabase
    .from('page_group_configs')
    .select('*')
    .eq('transformation_type_id', transformationType.id)
    .order('group_order');

  const { id, workflowId, userId, ...typeWithoutIds } = transformationType;

  return {
    exportVersion: '1.0',
    exportType: 'transformation',
    exportDate: new Date().toISOString(),
    typeName: transformationType.name,
    type: typeWithoutIds,
    relatedData: {
      pageGroupConfigs: (pageGroups || []).map(pg => ({
        groupOrder: pg.group_order,
        pagesPerGroup: pg.pages_per_group,
        smartDetectionPattern: pg.smart_detection_pattern,
        processMode: pg.process_mode,
        filenameTemplate: pg.filename_template,
        fieldMappings: pg.field_mappings ? JSON.parse(pg.field_mappings) : undefined,
        useAiDetection: pg.use_ai_detection,
        fallbackBehavior: pg.fallback_behavior,
        detectionConfidenceThreshold: pg.detection_confidence_threshold,
        followsPreviousGroup: pg.follows_previous_group,
        detectionMode: pg.detection_mode || 'detect'
      }))
    }
  };
}

export async function importTransformationType(exportData: ExportedTransformationType): Promise<{ success: boolean; newTypeId?: string; error?: string }> {
  try {
    const { data: existingTypes } = await supabase
      .from('transformation_types')
      .select('name')
      .ilike('name', exportData.typeName);

    let newName = exportData.typeName;
    if (existingTypes && existingTypes.length > 0) {
      newName = `${exportData.typeName} (Imported)`;
    }

    const { data: newType, error: typeError } = await supabase
      .from('transformation_types')
      .insert({
        name: newName,
        default_instructions: exportData.type.defaultInstructions || '',
        filename_template: exportData.type.filenameTemplate || '',
        field_mappings: exportData.type.fieldMappings ? JSON.stringify(exportData.type.fieldMappings) : null,
        auto_detect_instructions: exportData.type.autoDetectInstructions || '',
        pages_per_group: exportData.type.pagesPerGroup || 1,
        document_start_pattern: exportData.type.documentStartPattern || null,
        document_start_detection_enabled: exportData.type.documentStartDetectionEnabled || false,
        default_upload_mode: exportData.type.defaultUploadMode || null,
        lock_upload_mode: exportData.type.lockUploadMode || false
      })
      .select('id')
      .single();

    if (typeError) throw typeError;

    if (exportData.relatedData.pageGroupConfigs.length > 0) {
      const { error: pgError } = await supabase
        .from('page_group_configs')
        .insert(exportData.relatedData.pageGroupConfigs.map(pg => ({
          transformation_type_id: newType.id,
          group_order: pg.groupOrder,
          pages_per_group: pg.pagesPerGroup,
          smart_detection_pattern: pg.smartDetectionPattern || null,
          process_mode: pg.processMode,
          filename_template: pg.filenameTemplate || null,
          field_mappings: pg.fieldMappings ? JSON.stringify(pg.fieldMappings) : null,
          use_ai_detection: pg.useAiDetection || false,
          fallback_behavior: pg.fallbackBehavior || 'skip',
          detection_confidence_threshold: pg.detectionConfidenceThreshold || 0.7,
          follows_previous_group: pg.followsPreviousGroup || false,
          detection_mode: pg.detectionMode || 'detect'
        })));

      if (pgError) throw pgError;
    }

    return { success: true, newTypeId: newType.id };
  } catch (error: any) {
    console.error('Error importing transformation type:', error);
    return { success: false, error: error.message };
  }
}