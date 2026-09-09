import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Save, FileText, Code, Database, Map as MapIcon, Brain, Copy, Split, AlertTriangle, FunctionSquare, CheckCircle, XCircle, Layers, Download, Upload, ChevronDown, ChevronRight, Filter, RefreshCw, Mail, ClipboardList, Pencil } from 'lucide-react';
import type { ExtractionType, FieldMapping, ArraySplitConfig, FieldMappingFunction, ArrayEntryConfig, ArrayEntryField, ArrayEntryConditions, ArrayEntryConditionRule, User } from '../../types';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import ConfigChangeLogsModal, { logConfigChange } from '../common/ConfigChangeLogsModal';
import CustomDropdown from '../common/CustomDropdown';
import MappingPage from '../MappingPage';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';
import { FieldMappingFunctionsManager } from './FieldMappingFunctionsManager';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';
import { exportExtractionType, importExtractionType, ExportedExtractionType } from '../../services/typeService';
import { fetchWorkflowsV2 } from '../../services/workflowV2Service';
import type { WorkflowV2 } from '../../types';

interface ExtractionTypesSettingsProps {
  extractionTypes: ExtractionType[];
  onUpdateExtractionTypes: (types: ExtractionType[]) => Promise<void>;
  onDeleteExtractionType: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  isAdmin?: boolean;
  currentUser?: User;
}

export default function ExtractionTypesSettings({
  extractionTypes,
  onUpdateExtractionTypes,
  onDeleteExtractionType,
  refreshData,
  isAdmin = true,
  currentUser
}: ExtractionTypesSettingsProps) {
  const { workflows } = useSupabaseData();
  const [localExtractionTypes, setLocalExtractionTypes] = useState<ExtractionType[]>(extractionTypes);
  const [workflowsV2, setWorkflowsV2] = useState<WorkflowV2[]>([]);
  const [reviewTemplates, setReviewTemplates] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchWorkflowsV2().then(setWorkflowsV2).catch(console.error);
    supabase.from('inbox_review_templates').select('id, name').eq('is_active', true)
      .then(({ data }) => { if (data) setReviewTemplates(data); });
  }, []);

  useEffect(() => {
    console.log('=== useEffect [extractionTypes] triggered - syncing to local state ===');
    if (extractionTypes.length > 0) {
      const firstType = extractionTypes[0];
      console.log('First type arrayEntryConfigs from props:', firstType.arrayEntryConfigs?.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));
    }
    setLocalExtractionTypes(extractionTypes);
    if (pendingSelectionRef.current && extractionTypes.length > 0) {
      const { id, name } = pendingSelectionRef.current;
      const newIndex = extractionTypes.findIndex(t => t.id === id || t.name === name);
      if (newIndex >= 0) {
        setSelectedTypeIndex(newIndex);
      }
    }
  }, [extractionTypes]);
  const [selectedTypeIndex, setSelectedTypeIndex] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showChangeLogs, setShowChangeLogs] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMappingPage, setShowMappingPage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<{ index: number; name: string; id?: string } | null>(null);
  const [showTypeSelectionModal, setShowTypeSelectionModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [typeToCopy, setTypeToCopy] = useState<ExtractionType | null>(null);
  const [copyTypeName, setCopyTypeName] = useState('');
  const [copyNameError, setCopyNameError] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeFormatType, setNewTypeFormatType] = useState<'XML' | 'JSON' | 'CSV'>('JSON');
  const [nameError, setNameError] = useState('');
  const [showArraySplitModal, setShowArraySplitModal] = useState(false);
  const [editingArraySplit, setEditingArraySplit] = useState<ArraySplitConfig | null>(null);
  const [arraySplitForm, setArraySplitForm] = useState<Partial<ArraySplitConfig>>({
    targetArrayField: '',
    splitBasedOnField: '',
    splitStrategy: 'one_per_entry',
    defaultToOneIfMissing: false
  });
  const [showJsonErrorModal, setShowJsonErrorModal] = useState(false);
  const [jsonErrorMessage, setJsonErrorMessage] = useState('');
  const [jsonValidationResult, setJsonValidationResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [notificationTemplates, setNotificationTemplates] = useState<Array<{ id: string; template_name: string; template_type: string }>>([]);
  const [showFunctionsModal, setShowFunctionsModal] = useState(false);
  const [availableFunctions, setAvailableFunctions] = useState<FieldMappingFunction[]>([]);
  const pendingSelectionRef = useRef<{ id?: string; name?: string } | null>(null);
  const [showArrayEntryModal, setShowArrayEntryModal] = useState(false);
  const [editingArrayEntry, setEditingArrayEntry] = useState<ArrayEntryConfig | null>(null);
  const [arrayEntryForm, setArrayEntryForm] = useState<Partial<ArrayEntryConfig>>({
    targetArrayField: '',
    entryOrder: 1,
    isEnabled: true,
    fields: [],
    conditions: undefined,
    isRepeating: false,
    repeatInstruction: '',
    aiConditionInstruction: ''
  });
  const [showConditionsSection, setShowConditionsSection] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [conditionFieldSelectorOpen, setConditionFieldSelectorOpen] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNotificationTemplates();
  }, []);

  useEffect(() => {
    const loadFunctions = async () => {
      const currentType = localExtractionTypes[selectedTypeIndex];
      if (currentType?.id && !currentType.id.startsWith('temp-')) {
        try {
          const functions = await fieldMappingFunctionService.getFunctionsByExtractionType(currentType.id);
          setAvailableFunctions(functions);
        } catch (err) {
          console.error('Failed to load functions:', err);
          setAvailableFunctions([]);
        }
      } else {
        setAvailableFunctions([]);
      }
    };
    loadFunctions();
  }, [selectedTypeIndex, localExtractionTypes]);

  const fetchNotificationTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('id, template_name, template_type')
        .order('template_type', { ascending: true })
        .order('is_global_default', { ascending: false })
        .order('template_name', { ascending: true });

      if (!error && data) {
        setNotificationTemplates(data);
      }
    } catch (error) {
      console.error('Failed to fetch notification templates:', error);
    }
  };

  const handleAddTypeClick = () => {
    setShowAddModal(true);
    setNewTypeName('');
    setNameError('');
  };

  const handleExport = async () => {
    const selectedType = localExtractionTypes[selectedTypeIndex];
    if (!selectedType || selectedType.id.startsWith('temp-')) {
      return;
    }

    setIsExporting(true);
    try {
      const exportData = await exportExtractionType(selectedType);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
      const safeName = selectedType.name.replace(/[^a-zA-Z0-9]/g, '_');
      link.href = url;
      link.download = `${timestamp}_Extract_${safeName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError('');
    setImportSuccess('');

    try {
      const text = await file.text();
      const exportData: ExportedExtractionType = JSON.parse(text);

      if (exportData.exportType !== 'extraction' || !exportData.exportVersion) {
        throw new Error('Invalid export file format');
      }

      const result = await importExtractionType(exportData);

      if (result.success) {
        setImportSuccess(`Successfully imported "${exportData.typeName}"${exportData.relatedData.functions.length > 0 ? ` with ${exportData.relatedData.functions.length} function(s)` : ''}`);
        setTimeout(() => setImportSuccess(''), 5000);
        await refreshData();
      } else {
        setImportError(result.error || 'Import failed');
        setTimeout(() => setImportError(''), 5000);
      }
    } catch (error: any) {
      console.error('Import failed:', error);
      setImportError(error.message || 'Failed to import file');
      setTimeout(() => setImportError(''), 5000);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopyTypeClick = () => {
    setShowTypeSelectionModal(true);
  };

  const handleTypeSelectedForCopy = (type: ExtractionType) => {
    setTypeToCopy(type);
    setCopyTypeName(`${type.name} - Copy`);
    setCopyNameError('');
    setShowTypeSelectionModal(false);
    setShowCopyModal(true);
  };

  const handleCopyType = async () => {
    if (!copyTypeName.trim()) {
      setCopyNameError('Name is required');
      return;
    }

    // Check if name already exists
    if (localExtractionTypes.some(type => type.name.toLowerCase() === copyTypeName.trim().toLowerCase())) {
      setCopyNameError('Name already exists');
      return;
    }

    if (!typeToCopy) return;

    const copiedType: ExtractionType = {
      ...typeToCopy,
      id: `temp-${Date.now()}`,
      name: copyTypeName.trim(),
      fieldMappings: typeToCopy.fieldMappings ? typeToCopy.fieldMappings.map(mapping => ({ ...mapping })) : []
    };

    console.log('[CopyType] Source type:', typeToCopy.name, 'ID:', typeToCopy.id);
    console.log('[CopyType] Field mappings count:', copiedType.fieldMappings.length);
    console.log('[CopyType] All field mapping types:', copiedType.fieldMappings.map((m: FieldMapping) => ({ field: m.fieldName, type: m.type, functionId: m.functionId })));

    const updatedTypes = [...localExtractionTypes, copiedType];
    setLocalExtractionTypes(updatedTypes);

    try {
      await onUpdateExtractionTypes(updatedTypes);
      await refreshData();

      // Look up the newly created type's real ID
      const { data: newSavedType } = await supabase
        .from('extraction_types')
        .select('id')
        .eq('name', copyTypeName.trim())
        .maybeSingle();

      // Copy Array Split Configs
      if (newSavedType && typeToCopy.arraySplitConfigs && typeToCopy.arraySplitConfigs.length > 0) {
        console.log('[CopyType] Copying', typeToCopy.arraySplitConfigs.length, 'array split configs');
        const splitInsertData = typeToCopy.arraySplitConfigs.map(split => ({
          extraction_type_id: newSavedType.id,
          target_array_field: split.targetArrayField,
          split_based_on_field: split.splitBasedOnField,
          split_strategy: split.splitStrategy,
          default_to_one_if_missing: split.defaultToOneIfMissing || false
        }));
        const { error: splitError } = await supabase
          .from('extraction_type_array_splits')
          .insert(splitInsertData);
        if (splitError) console.error('[CopyType] Failed to copy array split configs:', splitError);
      }

      // Copy Array Entry Configs (with their fields)
      if (newSavedType && typeToCopy.arrayEntryConfigs && typeToCopy.arrayEntryConfigs.length > 0) {
        console.log('[CopyType] Copying', typeToCopy.arrayEntryConfigs.length, 'array entry configs');
        for (const entry of typeToCopy.arrayEntryConfigs) {
          const { data: insertedEntry, error: entryError } = await supabase
            .from('extraction_type_array_entries')
            .insert({
              extraction_type_id: newSavedType.id,
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

          if (entryError) {
            console.error('[CopyType] Failed to copy array entry:', entryError);
            continue;
          }

          if (insertedEntry && entry.fields && entry.fields.length > 0) {
            const fieldInsertData = entry.fields.map(field => ({
              array_entry_id: insertedEntry.id,
              field_name: field.fieldName,
              field_type: field.fieldType,
              hardcoded_value: field.hardcodedValue || null,
              extraction_instruction: field.extractionInstruction || null,
              data_type: field.dataType || 'string',
              max_length: field.maxLength || null,
              remove_if_null: field.removeIfNull || false,
              field_order: field.fieldOrder
            }));
            const { error: fieldError } = await supabase
              .from('extraction_type_array_entry_fields')
              .insert(fieldInsertData);
            if (fieldError) console.error('[CopyType] Failed to copy array entry fields:', fieldError);
          }
        }
      }

      const functionMappings = copiedType.fieldMappings.filter(
        (m: FieldMapping) => m.type === 'function' && m.functionId
      );

      console.log('[CopyType] Function mappings found:', functionMappings.length);
      console.log('[CopyType] Function mapping details:', functionMappings.map((m: FieldMapping) => ({ field: m.fieldName, functionId: m.functionId })));

      const { data: allFunctionsForSource } = await supabase
        .from('field_mapping_functions')
        .select('id, function_name')
        .eq('extraction_type_id', typeToCopy.id);
      console.log('[CopyType] All functions owned by source type:', allFunctionsForSource);

      if (functionMappings.length > 0) {
        const savedType = newSavedType;
        const lookupError = null;

        console.log('[CopyType] Looked up saved type by name:', copyTypeName.trim(), 'Result:', savedType, 'Error:', lookupError);

        if (savedType) {
          const functionIdMap = new Map<string, string>();
          const uniqueFunctionIds = [...new Set(functionMappings.map((m: FieldMapping) => m.functionId!))];

          console.log('[CopyType] Unique function IDs to copy:', uniqueFunctionIds);

          for (const oldFuncId of uniqueFunctionIds) {
            try {
              const sourceFunc = await fieldMappingFunctionService.getFunctionById(oldFuncId);
              console.log('[CopyType] Copying function:', sourceFunc.function_name, 'ID:', oldFuncId, 'to target type:', savedType.id);
              const newFunc = await fieldMappingFunctionService.copyFunction(
                oldFuncId,
                savedType.id,
                sourceFunc.function_name
              );
              console.log('[CopyType] Function copied successfully. Old ID:', oldFuncId, 'New ID:', newFunc.id);
              functionIdMap.set(oldFuncId, newFunc.id);
            } catch (e) {
              console.error(`[CopyType] Failed to copy function ${oldFuncId}:`, e);
            }
          }

          console.log('[CopyType] Function ID map (old -> new):', Object.fromEntries(functionIdMap));

          if (functionIdMap.size > 0) {
            const { data: freshType } = await supabase
              .from('extraction_types')
              .select('field_mappings')
              .eq('id', savedType.id)
              .maybeSingle();

            console.log('[CopyType] Fresh type field_mappings type:', typeof freshType?.field_mappings);
            console.log('[CopyType] Fresh type field_mappings raw:', freshType?.field_mappings);

            if (freshType?.field_mappings) {
              const parsedMappings = typeof freshType.field_mappings === 'string'
                ? JSON.parse(freshType.field_mappings)
                : freshType.field_mappings;

              const remappedMappings = parsedMappings.map((m: any) => {
                if (m.type === 'function' && m.functionId && functionIdMap.has(m.functionId)) {
                  console.log('[CopyType] Remapping field:', m.fieldName, 'from functionId:', m.functionId, 'to:', functionIdMap.get(m.functionId));
                  return { ...m, functionId: functionIdMap.get(m.functionId) };
                }
                return m;
              });

              const { error: updateError } = await supabase
                .from('extraction_types')
                .update({ field_mappings: JSON.stringify(remappedMappings) })
                .eq('id', savedType.id);

              console.log('[CopyType] Field mappings update error:', updateError);
            }
          }

          await refreshData();
        }
      } else {
        console.log('[CopyType] No function mappings found - checking if source type has functions that are not referenced in field mappings');

        if (newSavedType && allFunctionsForSource && allFunctionsForSource.length > 0) {
          console.log('[CopyType] Source has', allFunctionsForSource.length, 'functions but none are referenced in field mappings. These functions will NOT be copied.');
          console.log('[CopyType] Unreferenced functions:', allFunctionsForSource.map(f => f.function_name));
        }
      }

      setSelectedTypeIndex(updatedTypes.length - 1);
      setShowCopyModal(false);
      setTypeToCopy(null);
      setCopyTypeName('');
      setCopyNameError('');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('[CopyType] Failed to save copied extraction type:', error);
      setCopyNameError('Failed to save copied type. Please try again.');
    }
  };

  const handleCopyNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCopyType();
    }
  };

  const handleAddType = () => {
    if (!newTypeName.trim()) {
      setNameError('Name is required');
      return;
    }

    // Check if name already exists
    if (localExtractionTypes.some(type => type.name.toLowerCase() === newTypeName.trim().toLowerCase())) {
      setNameError('Name already exists');
      return;
    }

    const newType: ExtractionType = {
      id: `temp-${Date.now()}`,
      name: newTypeName.trim(),
      defaultInstructions: '',
      formatTemplate: '',
      filename: '',
      formatType: newTypeFormatType,
      jsonPath: '',
      fieldMappings: []
    };
    
    const updatedTypes = [...localExtractionTypes, newType];
    setLocalExtractionTypes(updatedTypes);
    
    // Automatically save the new type to the database
    handleSaveNewType(updatedTypes, updatedTypes.length - 1);
  };

  const handleSaveNewType = async (updatedTypes: ExtractionType[], newTypeIndex: number) => {
    try {
      await onUpdateExtractionTypes(updatedTypes);
      await refreshData();

      const typeName = updatedTypes[newTypeIndex]?.name;
      if (typeName) {
        const { data: newType } = await supabase
          .from('extraction_types')
          .select('id')
          .eq('name', typeName)
          .maybeSingle();
        if (newType) {
          const { data: adminUsers } = await supabase
            .from('users')
            .select('id')
            .eq('is_admin', true);
          if (adminUsers && adminUsers.length > 0) {
            await supabase.from('user_extraction_types').insert(
              adminUsers.map(u => ({ user_id: u.id, extraction_type_id: newType.id }))
            );
          }
        }
      }

      setSelectedTypeIndex(newTypeIndex);
      setShowAddModal(false);
      setNewTypeName('');
      setNameError('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save new extraction type:', error);
      setNameError('Failed to save extraction type. Please try again.');
    }
  };

  const handleNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddType();
    }
  };

  const updateExtractionType = (index: number, field: keyof ExtractionType, value: any) => {
    setLocalExtractionTypes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeExtractionType = (index: number) => {
    const updated = localExtractionTypes.filter((_, i) => i !== index);
    setLocalExtractionTypes(updated);
    // Adjust selected index if needed
    if (selectedTypeIndex >= updated.length) {
      setSelectedTypeIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleDeleteClick = (index: number) => {
    const typeToDelete = localExtractionTypes[index];
    setTypeToDelete({ index, name: typeToDelete.name, id: typeToDelete.id });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!typeToDelete) return;
    
    try {
      // Only call database delete if this is not a temporary type
      if (typeToDelete.id && !typeToDelete.id.startsWith('temp-')) {
        await onDeleteExtractionType(typeToDelete.id);
      }
      
      // Remove from local state
      removeExtractionType(typeToDelete.index);
      
      setShowDeleteModal(false);
      setTypeToDelete(null);
    } catch (error) {
      console.error('Failed to delete extraction type:', error);
      alert('Failed to delete extraction type. Please try again.');
    }
  };

  const handleDeleteFromDatabase = async (extractionTypeId: string, index: number) => {
    try {
      await onDeleteExtractionType(extractionTypeId);
      // Remove from local state after successful database deletion
      removeExtractionType(index);
    } catch (error) {
      console.error('Failed to delete extraction type:', error);
    }
  };

  const addFieldMapping = (typeIndex: number) => {
    const updated = [...localExtractionTypes];
    const newMapping: FieldMapping = {
      fieldName: '',
      type: 'mapped',
      value: '',
      dataType: 'string'
    };
    updated[typeIndex].fieldMappings = [...(updated[typeIndex].fieldMappings || []), newMapping];
    setLocalExtractionTypes(updated);
  };

  const updateFieldMapping = (typeIndex: number, mappingIndex: number, field: keyof FieldMapping, value: any) => {
    const updated = [...localExtractionTypes];
    const mappings = [...(updated[typeIndex].fieldMappings || [])];
    mappings[mappingIndex] = { ...mappings[mappingIndex], [field]: value };
    updated[typeIndex].fieldMappings = mappings;
    setLocalExtractionTypes(updated);
  };

  const removeFieldMapping = (typeIndex: number, mappingIndex: number) => {
    const updated = [...localExtractionTypes];
    const mappings = (updated[typeIndex].fieldMappings || []).filter((_, i) => i !== mappingIndex);
    updated[typeIndex].fieldMappings = mappings;
    setLocalExtractionTypes(updated);
  };

  const generateFieldMappingsFromTemplate = (typeIndex: number) => {
    const extractionType = localExtractionTypes[typeIndex];
  };

  const generateFieldMappingsFromTemplateAsync = async (typeIndex: number) => {
    const extractionType = localExtractionTypes[typeIndex];
    if (!extractionType.formatTemplate) {
      setJsonErrorMessage('Please add a JSON template first');
      setShowJsonErrorModal(true);
      return;
    }

    try {
      // Parse the JSON template to extract field names
      const template = JSON.parse(extractionType.formatTemplate);
      const fieldMappings: FieldMapping[] = [];

      const extractFields = (obj: any, prefix = '', isArrayItem = false) => {
        for (const [key, value] of Object.entries(obj)) {
          const fieldName = prefix ? `${prefix}.${key}` : key;
          
          if (Array.isArray(value) && value.length > 0) {
            // Handle arrays - extract fields from the first item
            const firstItem = value[0];
            if (firstItem && typeof firstItem === 'object') {
              extractFields(firstItem, fieldName, true);
            }
          } else if (value && typeof value === 'object') {
            // Nested object - recurse
            extractFields(value, fieldName);
          } else {
            // Determine data type based on the template value
            let dataType: 'string' | 'number' | 'integer' | 'datetime' = 'string';
            
            if (typeof value === 'number') {
              dataType = Number.isInteger(value) ? 'integer' : 'number';
            } else if (typeof value === 'boolean') {
              dataType = 'string'; // Treat booleans as strings for hardcoded values
            } else if (typeof value === 'string') {
              // Check if it looks like a datetime
              if (/^\d{4}-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12]\d)((T| )([01]\d|2[0-3]):([0-5]\d):([0-5]\d))?$/.test(value)) {
                dataType = 'datetime';
              }
            }

            // Create a readable description from the field name and path
            const description = `Extract ${key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}${prefix ? ` from ${prefix.replace(/\./g, ' → ')}` : ''}`;
            
            // Add all fields (both nested and root-level)
            fieldMappings.push({
              fieldName: fieldName,
              type: 'ai',
              value: '',
              dataType
            });
          }
        }
      };

      // Extract fields from the array items (skip the top-level "orders" container)
      for (const [topKey, topValue] of Object.entries(template)) {
        if (Array.isArray(topValue) && topValue.length > 0) {
          // If top level is an array, extract from the first item
          const firstItem = topValue[0];
          if (firstItem && typeof firstItem === 'object') {
            extractFields(firstItem, '');
          }
        }
      }

      // Update the extraction type with the generated mappings (merge, don't replace)
      const updated = [...localExtractionTypes];
      const existingMappings = extractionType.fieldMappings || [];
      const existingFieldNames = new Set(existingMappings.map(m => m.fieldName));
      const newMappings = fieldMappings.filter(m => !existingFieldNames.has(m.fieldName));
      updated[typeIndex].fieldMappings = [...existingMappings, ...newMappings];
      setLocalExtractionTypes(updated);

      // Automatically save the changes to persist the field mappings
      try {
        await onUpdateExtractionTypes(updated);
        await refreshData();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (error) {
        console.error('Failed to auto-save after mapping JSON:', error);
        setJsonErrorMessage('Field mappings generated but failed to save automatically. Please use the Save button to save your changes.');
        setShowJsonErrorModal(true);
      }

    } catch (error) {
      setJsonErrorMessage('Invalid JSON template. Please check the JSON syntax.');
      setShowJsonErrorModal(true);
    }
  };

  const handleCheckJson = () => {
    const currentType = localExtractionTypes[selectedTypeIndex];
    if (!currentType?.formatTemplate) {
      setJsonValidationResult({ valid: false, message: 'No JSON template to validate' });
      return;
    }

    try {
      JSON.parse(currentType.formatTemplate);
      setJsonValidationResult({ valid: true, message: 'Valid JSON format' });
    } catch (error) {
      const errorMessage = error instanceof SyntaxError ? error.message : 'Invalid JSON format';
      setJsonValidationResult({ valid: false, message: errorMessage });
    }

    setTimeout(() => setJsonValidationResult(null), 5000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    const currentType = localExtractionTypes[selectedTypeIndex];
    console.log('=== handleSave (Save All) triggered ===');
    console.log('currentType arrayEntryConfigs at time of Save All:', currentType?.arrayEntryConfigs?.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));
    if (currentType) {
      pendingSelectionRef.current = { id: currentType.id, name: currentType.name };
    }
    try {
      await onUpdateExtractionTypes(localExtractionTypes);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (currentUser) {
        const typeName = localExtractionTypes[selectedTypeIndex]?.name || 'Unknown';
        logConfigChange('extraction', typeName, currentUser.id, currentUser.username);
      }
    } catch (error) {
      console.error('Failed to save extraction types:', error);
      alert('Failed to save extraction types. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddArraySplitClick = () => {
    setEditingArraySplit(null);
    setArraySplitForm({
      targetArrayField: '',
      splitBasedOnField: '',
      splitStrategy: 'one_per_entry'
    });
    setShowArraySplitModal(true);
  };

  const handleEditArraySplit = (split: ArraySplitConfig) => {
    setEditingArraySplit(split);
    setArraySplitForm(split);
    setShowArraySplitModal(true);
  };

  const handleSaveArraySplit = async () => {
    if (!arraySplitForm.targetArrayField || !arraySplitForm.splitBasedOnField) {
      alert('Please fill in all required fields');
      return;
    }

    const updated = [...localExtractionTypes];
    const currentType = updated[selectedTypeIndex];

    if (!currentType.arraySplitConfigs) {
      currentType.arraySplitConfigs = [];
    }

    if (editingArraySplit) {
      const index = currentType.arraySplitConfigs.findIndex(s => s.id === editingArraySplit.id);
      if (index !== -1) {
        currentType.arraySplitConfigs[index] = {
          ...editingArraySplit,
          ...arraySplitForm
        };
      }
    } else {
      currentType.arraySplitConfigs.push({
        id: `temp-${Date.now()}`,
        targetArrayField: arraySplitForm.targetArrayField!,
        splitBasedOnField: arraySplitForm.splitBasedOnField!,
        splitStrategy: arraySplitForm.splitStrategy || 'one_per_entry'
      });
    }

    setLocalExtractionTypes(updated);
    setShowArraySplitModal(false);

    try {
      await onUpdateExtractionTypes(updated);
      await refreshData();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save array split config:', error);
      alert('Failed to save array split configuration. Please try again.');
    }
  };

  const handleDeleteArraySplit = async (splitId: string) => {
    const updated = [...localExtractionTypes];
    const currentType = updated[selectedTypeIndex];

    if (currentType.arraySplitConfigs) {
      currentType.arraySplitConfigs = currentType.arraySplitConfigs.filter(s => s.id !== splitId);
      setLocalExtractionTypes(updated);

      try {
        await onUpdateExtractionTypes(updated);
        await refreshData();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (error) {
        console.error('Failed to delete array split config:', error);
        alert('Failed to delete array split configuration. Please try again.');
      }
    }
  };

  const handleAddArrayEntryClick = () => {
    const currentType = localExtractionTypes[selectedTypeIndex];
    const existingEntries = currentType.arrayEntryConfigs || [];
    const nextOrder = existingEntries.length > 0
      ? Math.max(...existingEntries.map(e => e.entryOrder)) + 1
      : 1;

    setEditingArrayEntry(null);
    setArrayEntryForm({
      targetArrayField: '',
      entryOrder: nextOrder,
      isEnabled: true,
      fields: [],
      conditions: undefined,
      isRepeating: false,
      repeatInstruction: '',
      removeEntryIfRinNull: false
    });
    setShowConditionsSection(false);
    setShowArrayEntryModal(true);
  };

  const handleEditArrayEntry = (entry: ArrayEntryConfig) => {
    setEditingArrayEntry(entry);
    setArrayEntryForm({
      ...entry,
      fields: [...entry.fields],
      conditions: entry.conditions ? { ...entry.conditions, rules: [...entry.conditions.rules] } : undefined,
      isRepeating: entry.isRepeating || false,
      repeatInstruction: entry.repeatInstruction || '',
      aiConditionInstruction: entry.aiConditionInstruction || '',
      removeEntryIfRinNull: entry.removeEntryIfRinNull || false
    });
    setShowConditionsSection(entry.conditions?.enabled || false);
    setShowArrayEntryModal(true);
  };

  const handleCopyArrayEntry = (entry: ArrayEntryConfig) => {
    const currentType = localExtractionTypes[selectedTypeIndex];
    const existingEntries = currentType.arrayEntryConfigs || [];
    const nextOrder = existingEntries.length > 0
      ? Math.max(...existingEntries.map(e => e.entryOrder)) + 1
      : 1;

    setEditingArrayEntry(null);
    setArrayEntryForm({
      targetArrayField: entry.targetArrayField,
      entryOrder: nextOrder,
      isEnabled: true,
      fields: entry.fields.map(f => ({ ...f })),
      conditions: entry.conditions ? { ...entry.conditions, rules: entry.conditions.rules.map(r => ({ ...r })) } : undefined,
      isRepeating: entry.isRepeating || false,
      repeatInstruction: entry.repeatInstruction || '',
      removeEntryIfRinNull: entry.removeEntryIfRinNull || false,
      parentArrayField: entry.parentArrayField || undefined
    });
    setShowConditionsSection(entry.conditions?.enabled || false);
    setShowArrayEntryModal(true);
  };

  const handleAddArrayEntryField = () => {
    const currentFields = arrayEntryForm.fields || [];
    const nextOrder = currentFields.length > 0
      ? Math.max(...currentFields.map(f => f.fieldOrder)) + 1
      : 1;

    setArrayEntryForm({
      ...arrayEntryForm,
      fields: [
        ...currentFields,
        {
          id: `temp-${Date.now()}`,
          fieldName: '',
          fieldType: 'hardcoded',
          hardcodedValue: '',
          extractionInstruction: '',
          dataType: 'string',
          fieldOrder: nextOrder
        }
      ]
    });
  };

  const handleUpdateArrayEntryField = (fieldIndex: number, field: keyof ArrayEntryField, value: any) => {
    const updatedFields = [...(arrayEntryForm.fields || [])];
    updatedFields[fieldIndex] = { ...updatedFields[fieldIndex], [field]: value };
    setArrayEntryForm({ ...arrayEntryForm, fields: updatedFields });
  };

  const handleRemoveArrayEntryField = (fieldIndex: number) => {
    const updatedFields = (arrayEntryForm.fields || []).filter((_, i) => i !== fieldIndex);
    setArrayEntryForm({ ...arrayEntryForm, fields: updatedFields });
  };

  const handleSaveArrayEntry = async () => {
    if (!arrayEntryForm.targetArrayField) {
      alert('Please enter a target array field');
      return;
    }

    if (!arrayEntryForm.fields || arrayEntryForm.fields.length === 0) {
      alert('Please add at least one field');
      return;
    }

    const hasInvalidFields = arrayEntryForm.fields.some(f => !f.fieldName);
    if (hasInvalidFields) {
      alert('All fields must have a field name');
      return;
    }

    console.log('=== handleSaveArrayEntry START ===');
    console.log('editingArrayEntry:', editingArrayEntry ? { id: editingArrayEntry.id, targetArrayField: editingArrayEntry.targetArrayField } : null);
    console.log('arrayEntryForm:', { targetArrayField: arrayEntryForm.targetArrayField, entryOrder: arrayEntryForm.entryOrder, fieldsCount: arrayEntryForm.fields?.length });

    const currentType = localExtractionTypes[selectedTypeIndex];
    console.log('Current type arrayEntryConfigs BEFORE update:', currentType.arrayEntryConfigs?.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));

    const updated = localExtractionTypes.map((t, i) => {
      if (i !== selectedTypeIndex) return t;
      const configs = t.arrayEntryConfigs ? [...t.arrayEntryConfigs] : [];

      console.log('configs array (copied from existing):', configs.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));

      if (editingArrayEntry) {
        const index = configs.findIndex(e => e.id === editingArrayEntry.id);
        console.log('EDITING mode - looking for id:', editingArrayEntry.id, 'found at index:', index);
        if (index !== -1) {
          configs[index] = {
            ...editingArrayEntry,
            ...arrayEntryForm,
            id: editingArrayEntry.id,
            extractionTypeId: editingArrayEntry.extractionTypeId,
            fields: arrayEntryForm.fields || [],
            conditions: arrayEntryForm.conditions || null
          } as ArrayEntryConfig;
        } else {
          console.warn('WARNING: editingArrayEntry.id not found in configs! This will NOT update, entry might be duplicated.');
        }
      } else {
        console.log('INSERT mode - adding new temp entry');
        configs.push({
          id: `temp-${Date.now()}`,
          extractionTypeId: t.id,
          targetArrayField: arrayEntryForm.targetArrayField!,
          entryOrder: arrayEntryForm.entryOrder || 1,
          isEnabled: arrayEntryForm.isEnabled !== false,
          fields: arrayEntryForm.fields || [],
          isRepeating: arrayEntryForm.isRepeating || false,
          repeatInstruction: arrayEntryForm.repeatInstruction || '',
          aiConditionInstruction: arrayEntryForm.aiConditionInstruction || '',
          conditions: arrayEntryForm.conditions || null,
          parentArrayField: arrayEntryForm.parentArrayField || undefined
        });
      }

      console.log('configs array AFTER modification:', configs.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));
      return { ...t, arrayEntryConfigs: configs };
    });

    const updatedType = updated[selectedTypeIndex];
    console.log('Updated type arrayEntryConfigs being sent to save:', updatedType.arrayEntryConfigs?.map(e => ({ id: e.id, targetArrayField: e.targetArrayField, entryOrder: e.entryOrder })));

    setLocalExtractionTypes(updated);
    setShowArrayEntryModal(false);

    try {
      await onUpdateExtractionTypes(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      console.log('=== handleSaveArrayEntry COMPLETE (success) ===');
    } catch (error) {
      console.error('Failed to save array entry config:', error);
      alert('Failed to save array entry configuration. Please try again.');
    }
  };

  const handleDeleteArrayEntry = async (entryId: string) => {
    const currentType = localExtractionTypes[selectedTypeIndex];
    if (!currentType?.arrayEntryConfigs) return;

    const updated = localExtractionTypes.map((t, i) => {
      if (i !== selectedTypeIndex) return t;
      return { ...t, arrayEntryConfigs: (t.arrayEntryConfigs || []).filter(e => e.id !== entryId) };
    });
    setLocalExtractionTypes(updated);

    try {
      await onUpdateExtractionTypes(updated);
      await refreshData();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to delete array entry config:', error);
      alert('Failed to delete array entry configuration. Please try again.');
    }
  };

  const selectedType = localExtractionTypes[selectedTypeIndex];

  return (
    <div className="space-y-6">
      {/* Mapping Page Modal */}
      {showMappingPage && (
        <MappingPage onClose={() => setShowMappingPage(false)} />
      )}

      {/* Type Selection Modal */}
      {showTypeSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Copy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Select Extraction Type to Copy</h3>
              <p className="text-gray-600 dark:text-gray-400">Choose which extraction type you want to duplicate</p>
            </div>
            
            {localExtractionTypes.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Extraction Types Available</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  You need to create at least one extraction type before you can copy it.
                </p>
                <button
                  onClick={() => setShowTypeSelectionModal(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                  {localExtractionTypes.map((type) => (
                    <div
                      key={type.id}
                      onClick={() => handleTypeSelectedForCopy(type)}
                      className="p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-purple-300 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-purple-100 dark:bg-purple-800 p-2 rounded-lg">
                            {type.formatType === 'JSON' ? (
                              <Code className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {type.name}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {type.formatType} Format • {type.fieldMappings?.length || 0} field mappings
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {type.filename && `Filename: ${type.filename}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-purple-600 dark:text-purple-400">
                          <Copy className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowTypeSelectionModal(false)}
                    className="px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Copy Type Modal */}
      {showCopyModal && typeToCopy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Copy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Copy Extraction Type</h3>
              <p className="text-gray-600 dark:text-gray-400">Create a copy of "{typeToCopy.name}" with a new name</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Extraction Type Name
                </label>
                <input
                  type="text"
                  value={copyTypeName}
                  onChange={(e) => setCopyTypeName(e.target.value)}
                  onKeyPress={handleCopyNameKeyPress}
                  placeholder="e.g., Invoice Processing - Copy"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {copyNameError && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2">{copyNameError}</p>
                )}
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <p className="text-blue-700 dark:text-blue-400 text-sm">
                  <strong>What will be copied:</strong> All settings, instructions, template, field mappings, and configuration from the original extraction type.
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleCopyType}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  Copy Extraction Type
                </button>
                <button
                  onClick={() => {
                    setShowCopyModal(false);
                    setTypeToCopy(null);
                    setCopyTypeName('');
                    setCopyNameError('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Type Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Plus className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Add New Extraction Type</h3>
              <p className="text-gray-600 dark:text-gray-400">Enter a name for your new extraction type</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Extraction Type Name
                </label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyPress={handleNameKeyPress}
                  placeholder="e.g., Invoice Processing"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoFocus
                />
                {nameError && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2">{nameError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Format Type
                </label>
                <Select
                  value={newTypeFormatType}
                  onValueChange={(value) => setNewTypeFormatType(value as 'XML' | 'JSON' | 'CSV')}
                  options={[
                    { value: 'XML', label: 'XML' },
                    { value: 'JSON', label: 'JSON' },
                    { value: 'CSV', label: 'CSV' }
                  ]}
                  searchable={false}
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleAddType}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewTypeName('');
                    setNewTypeFormatType('JSON');
                    setNameError('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && typeToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Extraction Type</h3>
              <p className="text-gray-600 dark:text-gray-400">Are you sure you want to delete "{typeToDelete.name}"? This action cannot be undone.</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setTypeToDelete(null);
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Array Split Configuration Modal */}
      {showArraySplitModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Split className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {editingArraySplit ? 'Edit Array Split Configuration' : 'Add Array Split Configuration'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Configure how to split array entries based on a field value
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Array Field
                </label>
                <input
                  type="text"
                  value={arraySplitForm.targetArrayField || ''}
                  onChange={(e) => setArraySplitForm({ ...arraySplitForm, targetArrayField: e.target.value })}
                  placeholder="e.g., barcodes"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  The name of the array field in your JSON template (e.g., "barcodes")
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Split Based On Field
                </label>
                <input
                  type="text"
                  value={arraySplitForm.splitBasedOnField || ''}
                  onChange={(e) => setArraySplitForm({ ...arraySplitForm, splitBasedOnField: e.target.value })}
                  placeholder="e.g., pieces"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  The field name whose value determines how many entries to create (e.g., "pieces")
                </p>
              </div>

              <div>
                <Select
                  label="Split Strategy"
                  value={arraySplitForm.splitStrategy || 'one_per_entry'}
                  onValueChange={(value) => setArraySplitForm({ ...arraySplitForm, splitStrategy: value as 'one_per_entry' | 'divide_evenly' })}
                  options={[
                    { value: 'one_per_entry', label: 'One Per Entry (each entry gets 1)' },
                    { value: 'divide_evenly', label: 'Divide Evenly (split total across entries)' }
                  ]}
                  searchable={false}
                  helpText={arraySplitForm.splitStrategy === 'one_per_entry'
                    ? 'If pieces = 3, create 3 entries each with pieces = 1'
                    : 'If pieces = 9, you can manually distribute across entries'}
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={arraySplitForm.defaultToOneIfMissing || false}
                    onChange={(e) => setArraySplitForm({ ...arraySplitForm, defaultToOneIfMissing: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Default to 1 Record if Field Not Found
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  When enabled, if the field value is missing, empty, or 0, create 1 record instead of none
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Example</h4>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  If your PDF shows "Pieces: 3", the AI will create 3 separate {arraySplitForm.targetArrayField || 'array'} entries,
                  each with {arraySplitForm.splitBasedOnField || 'the field'} = {arraySplitForm.splitStrategy === 'one_per_entry' ? '1' : 'divided value'}.
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleSaveArraySplit}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {editingArraySplit ? 'Update Configuration' : 'Add Configuration'}
                </button>
                <button
                  onClick={() => setShowArraySplitModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Array Entry Builder Modal */}
      {showArrayEntryModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-10 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-4xl w-full mx-4 my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Layers className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {editingArrayEntry ? 'Edit Array Entry' : 'Add Array Entry'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Define an array entry with hardcoded and extracted field values
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Array Field
                  </label>
                  <input
                    type="text"
                    value={arrayEntryForm.targetArrayField || ''}
                    onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, targetArrayField: e.target.value })}
                    placeholder="e.g., traceNumbers"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The array field in your JSON template
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Entry Order
                  </label>
                  <input
                    type="number"
                    value={arrayEntryForm.entryOrder || 1}
                    onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, entryOrder: parseInt(e.target.value) || 1 })}
                    min="1"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Position in the array (1, 2, 3...)
                  </p>
                </div>
              </div>

              {/* Parent Array Field - for nesting child arrays inside a parent array */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parent Array (Optional)
                </label>
                <CustomDropdown
                  value={arrayEntryForm.parentArrayField || ''}
                  onChange={(val) => setArrayEntryForm({ ...arrayEntryForm, parentArrayField: val || undefined })}
                  options={[
                    { value: '', label: 'None (top-level array)' },
                    ...(localExtractionTypes[selectedTypeIndex]?.arrayEntryConfigs || [])
                      .filter(e => e.targetArrayField !== arrayEntryForm.targetArrayField && !e.parentArrayField)
                      .map(e => e.targetArrayField)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map(field => ({ value: field, label: field }))
                  ]}
                  placeholder="Select parent array..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  If set, this array will be nested inside each row of the parent array
                </p>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={arrayEntryForm.isEnabled !== false}
                    onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, isEnabled: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Entry Enabled
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={arrayEntryForm.isRepeating || false}
                    onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, isRepeating: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Repeating Entry
                  </span>
                </label>
              </div>

              {(arrayEntryForm.fields || []).some(f => f.removeIfNull) && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={arrayEntryForm.removeEntryIfRinNull || false}
                          onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, removeEntryIfRinNull: e.target.checked })}
                          className="w-4 h-4 text-red-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-red-500 focus:ring-2"
                        />
                        <span className="text-sm font-semibold text-red-900 dark:text-red-100">
                          Remove Entire Entry If RIN Field Is Null
                        </span>
                      </label>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1 ml-6">
                        When enabled, if any field marked with RIN has a null or empty value, the entire array entry will be excluded from the output instead of just omitting that field.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {arrayEntryForm.isRepeating && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        Repeating Entry Mode
                      </h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                        AI will find ALL matching rows in the PDF and create one array entry for each. The field templates below will be applied to each row found.
                      </p>
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Row Identification Instruction
                      </label>
                      <textarea
                        value={arrayEntryForm.repeatInstruction || ''}
                        onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, repeatInstruction: e.target.value })}
                        placeholder="e.g., Find all line items in the table where QTY >= 1. Each row has QTY, Description, Weight columns."
                        rows={3}
                        className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Describe how to identify each row to extract (table structure, filtering criteria, etc.)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!arrayEntryForm.isRepeating && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Brain className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
                        AI Condition Instruction
                      </h4>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                        Describe a condition the AI should check on the PDF to determine if this entry should be included. This can reference any visible content, even fields not in your mappings.
                      </p>
                      <textarea
                        value={arrayEntryForm.aiConditionInstruction || ''}
                        onChange={(e) => setArrayEntryForm({ ...arrayEntryForm, aiConditionInstruction: e.target.value })}
                        placeholder="e.g., Only include this entry if Temperature Required is Yes on the PDF"
                        rows={2}
                        className="w-full px-3 py-2 border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                      />
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Leave empty to always include this entry.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Entry Fields
                  </label>
                  <button
                    onClick={handleAddArrayEntryField}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Field</span>
                  </button>
                </div>

                {(arrayEntryForm.fields || []).length === 0 ? (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No fields defined yet</p>
                    <p className="text-xs mt-1">Click "Add Field" to define field values</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {(arrayEntryForm.fields || []).map((field, fieldIndex) => (
                      <div
                        key={field.id || fieldIndex}
                        className={`p-3 rounded-lg border-2 ${
                          field.fieldType === 'hardcoded'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                            : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                        }`}
                      >
                        <div className="grid grid-cols-[1fr_100px_1.2fr_100px_70px_40px_40px] gap-2 items-end">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Field Name
                            </label>
                            <input
                              type="text"
                              value={field.fieldName}
                              onChange={(e) => handleUpdateArrayEntryField(fieldIndex, 'fieldName', e.target.value)}
                              placeholder="e.g., traceType"
                              className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Type
                            </label>
                            <CustomDropdown
                              value={field.fieldType}
                              onChange={(val) => handleUpdateArrayEntryField(fieldIndex, 'fieldType', val as 'hardcoded' | 'extracted' | 'mapped' | 'order_entry')}
                              options={[
                                { value: 'hardcoded', label: 'Hardcoded' },
                                { value: 'extracted', label: 'AI' },
                                { value: 'mapped', label: 'Mapped' },
                                { value: 'order_entry', label: 'Order Entry' },
                              ]}
                              colorMap={{
                                hardcoded: { triggerClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
                                extracted: { triggerClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
                                mapped: { triggerClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
                                order_entry: { triggerClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
                              }}
                              size="sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              {field.fieldType === 'hardcoded' ? 'Value' : field.fieldType === 'mapped' ? 'PDF Coordinates' : field.fieldType === 'order_entry' ? 'Order Entry Field' : 'Extraction Instruction'}
                            </label>
                            {field.fieldType === 'hardcoded' ? (
                              <input
                                type="text"
                                value={field.hardcodedValue || ''}
                                onChange={(e) => handleUpdateArrayEntryField(fieldIndex, 'hardcodedValue', e.target.value)}
                                placeholder="e.g., PRO"
                                className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                              />
                            ) : (
                              <input
                                type="text"
                                value={field.extractionInstruction || ''}
                                onChange={(e) => handleUpdateArrayEntryField(fieldIndex, 'extractionInstruction', e.target.value)}
                                placeholder={field.fieldType === 'mapped' ? 'e.g., (100, 200, 150, 30)' : 'e.g., Extract PRO number from top right'}
                                className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Data Type
                            </label>
                            <CustomDropdown
                              value={field.dataType || 'string'}
                              onChange={(val) => handleUpdateArrayEntryField(fieldIndex, 'dataType', val)}
                              options={[
                                { value: 'string', label: 'String' },
                                { value: 'number', label: 'Number' },
                                { value: 'integer', label: 'Integer' },
                                { value: 'boolean', label: 'Boolean' },
                              ]}
                              size="sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Max Len
                            </label>
                            {(field.dataType || 'string') === 'string' ? (
                              <input
                                type="number"
                                value={field.maxLength || ''}
                                onChange={(e) => handleUpdateArrayEntryField(fieldIndex, 'maxLength', e.target.value ? parseInt(e.target.value) : undefined)}
                                className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                                placeholder="40"
                                min="1"
                              />
                            ) : (
                              <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">N/A</div>
                            )}
                          </div>
                          <div title="Remove if Null">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 cursor-help">
                              RIN
                            </label>
                            <div className="flex justify-center pt-1">
                              <input
                                type="checkbox"
                                checked={field.removeIfNull || false}
                                onChange={(e) => handleUpdateArrayEntryField(fieldIndex, 'removeIfNull', e.target.checked)}
                                className="w-4 h-4 text-emerald-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:ring-2"
                                title="Remove if Null"
                              />
                            </div>
                          </div>
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleRemoveArrayEntryField(fieldIndex)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900 rounded transition-colors duration-200"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Conditional Logic Section */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowConditionsSection(!showConditionsSection)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">Conditional Logic</span>
                    {arrayEntryForm.conditions?.enabled && arrayEntryForm.conditions.rules.length > 0 && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        {arrayEntryForm.conditions.rules.length} rule{arrayEntryForm.conditions.rules.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {showConditionsSection ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {showConditionsSection && (
                  <div className="p-4 space-y-4 bg-white dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={arrayEntryForm.conditions?.enabled || false}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setArrayEntryForm({
                                ...arrayEntryForm,
                                conditions: enabled
                                  ? { enabled: true, logic: 'AND', rules: arrayEntryForm.conditions?.rules || [] }
                                  : { ...arrayEntryForm.conditions, enabled: false, logic: arrayEntryForm.conditions?.logic || 'AND', rules: arrayEntryForm.conditions?.rules || [] }
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500"></div>
                        </label>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Only include this entry when conditions are met
                        </span>
                      </div>
                    </div>

                    {arrayEntryForm.conditions?.enabled && (
                      <>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Match</span>
                          <select
                            value={arrayEntryForm.conditions?.logic || 'AND'}
                            onChange={(e) => {
                              setArrayEntryForm({
                                ...arrayEntryForm,
                                conditions: {
                                  ...arrayEntryForm.conditions!,
                                  logic: e.target.value as 'AND' | 'OR'
                                }
                              });
                            }}
                            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            <option value="AND">ALL</option>
                            <option value="OR">ANY</option>
                          </select>
                          <span className="text-sm text-gray-600 dark:text-gray-400">of the following conditions</span>
                        </div>

                        <div className="space-y-2">
                          {(arrayEntryForm.conditions?.rules || []).map((rule, ruleIndex) => (
                            <div key={ruleIndex} className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                              <div className="flex-1 flex items-center space-x-1 relative">
                                <input
                                  type="text"
                                  value={rule.fieldPath}
                                  onChange={(e) => {
                                    const newRules = [...(arrayEntryForm.conditions?.rules || [])];
                                    newRules[ruleIndex] = { ...rule, fieldPath: e.target.value };
                                    setArrayEntryForm({
                                      ...arrayEntryForm,
                                      conditions: { ...arrayEntryForm.conditions!, rules: newRules }
                                    });
                                  }}
                                  placeholder="e.g., details.dangerousGoods"
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                                <button
                                  type="button"
                                  data-condition-field-btn={ruleIndex}
                                  onClick={() => setConditionFieldSelectorOpen(conditionFieldSelectorOpen === ruleIndex ? null : ruleIndex)}
                                  className="px-2 py-1.5 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                  title="Select from field mappings"
                                >
                                  {'{'}  {'}'}
                                </button>
                                {conditionFieldSelectorOpen === ruleIndex && createPortal(
                                  <div
                                    className="fixed w-64 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg"
                                    style={{
                                      zIndex: 99999,
                                      top: (document.querySelector(`[data-condition-field-btn="${ruleIndex}"]`)?.getBoundingClientRect().bottom ?? 0) + 4,
                                      left: document.querySelector(`[data-condition-field-btn="${ruleIndex}"]`)?.getBoundingClientRect().left ?? 0
                                    }}
                                  >
                                    {(selectedType?.fieldMappings || []).filter(m => m.fieldName).length > 0 ? (
                                      (selectedType?.fieldMappings || []).filter(m => m.fieldName).map((mapping, mIndex) => (
                                        <button
                                          key={mIndex}
                                          type="button"
                                          onClick={() => {
                                            const newRules = [...(arrayEntryForm.conditions?.rules || [])];
                                            newRules[ruleIndex] = { ...rule, fieldPath: mapping.fieldName };
                                            setArrayEntryForm({
                                              ...arrayEntryForm,
                                              conditions: { ...arrayEntryForm.conditions!, rules: newRules }
                                            });
                                            setConditionFieldSelectorOpen(null);
                                          }}
                                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
                                        >
                                          <span className="font-mono text-gray-900 dark:text-gray-100">{mapping.fieldName}</span>
                                          {mapping.dataType && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{mapping.dataType}</span>
                                          )}
                                        </button>
                                      ))
                                    ) : (
                                      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                        No field mappings defined
                                      </div>
                                    )}
                                  </div>,
                                  document.body
                                )}
                              </div>
                              <select
                                value={rule.operator}
                                onChange={(e) => {
                                  const newRules = [...(arrayEntryForm.conditions?.rules || [])];
                                  newRules[ruleIndex] = { ...rule, operator: e.target.value as ArrayEntryConditionRule['operator'] };
                                  setArrayEntryForm({
                                    ...arrayEntryForm,
                                    conditions: { ...arrayEntryForm.conditions!, rules: newRules }
                                  });
                                }}
                                className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              >
                                <option value="equals">equals</option>
                                <option value="notEquals">not equals</option>
                                <option value="contains">contains</option>
                                <option value="notContains">not contains</option>
                                <option value="greaterThan">greater than</option>
                                <option value="lessThan">less than</option>
                                <option value="greaterThanOrEqual">greater or equal</option>
                                <option value="lessThanOrEqual">less or equal</option>
                                <option value="isEmpty">is empty</option>
                                <option value="isNotEmpty">is not empty</option>
                              </select>
                              {rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' && (
                                <input
                                  type="text"
                                  value={rule.value}
                                  onChange={(e) => {
                                    const newRules = [...(arrayEntryForm.conditions?.rules || [])];
                                    newRules[ruleIndex] = { ...rule, value: e.target.value };
                                    setArrayEntryForm({
                                      ...arrayEntryForm,
                                      conditions: { ...arrayEntryForm.conditions!, rules: newRules }
                                    });
                                  }}
                                  placeholder="Value"
                                  className="w-32 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const newRules = (arrayEntryForm.conditions?.rules || []).filter((_, i) => i !== ruleIndex);
                                  setArrayEntryForm({
                                    ...arrayEntryForm,
                                    conditions: { ...arrayEntryForm.conditions!, rules: newRules }
                                  });
                                }}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const newRule: ArrayEntryConditionRule = {
                              fieldPath: '',
                              operator: 'equals',
                              value: ''
                            };
                            setArrayEntryForm({
                              ...arrayEntryForm,
                              conditions: {
                                ...arrayEntryForm.conditions!,
                                rules: [...(arrayEntryForm.conditions?.rules || []), newRule]
                              }
                            });
                          }}
                          className="flex items-center space-x-1 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Add Condition</span>
                        </button>

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Use field mapping names like <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">details.dangerousGoods</code> or <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">shipper.clientID</code>
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
                <h4 className="font-semibold text-emerald-800 dark:text-emerald-300 mb-2">Example Usage</h4>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  For a traceNumbers array, you might create 3 entries:
                </p>
                <ul className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 space-y-1 list-disc list-inside">
                  <li>Entry 1: traceType="PRO" (hardcoded), traceNumber extracted from header</li>
                  <li>Entry 2: traceType="BOL" (hardcoded), traceNumber extracted from shipper section</li>
                  <li>Entry 3: traceType="PO" (hardcoded), traceNumber extracted from order details</li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleSaveArrayEntry(); }}
                  className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {editingArrayEntry ? 'Update Entry' : 'Add Entry'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowArrayEntryModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* JSON Error Modal */}
      {showJsonErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Invalid JSON Template</h3>
              <p className="text-gray-600 dark:text-gray-400">{jsonErrorMessage}</p>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setShowJsonErrorModal(false)}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Mapping Functions Modal */}
      {showFunctionsModal && selectedType && selectedType.id && !selectedType.id.startsWith('temp-') && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-4xl w-full mx-4 my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                  <FunctionSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Functions for {selectedType.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Create conditional logic functions to use in field mappings
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowFunctionsModal(false);
                  const loadFunctions = async () => {
                    try {
                      const functions = await fieldMappingFunctionService.getFunctionsByExtractionType(selectedType.id);
                      setAvailableFunctions(functions);
                    } catch (err) {
                      console.error('Failed to reload functions:', err);
                    }
                  };
                  loadFunctions();
                }}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <FieldMappingFunctionsManager
              extractionTypeId={selectedType.id}
              availableFields={(selectedType.fieldMappings || []).filter(m => m.fieldName).map(m => ({ fieldName: m.fieldName, dataType: m.dataType }))}
              extractionTypes={localExtractionTypes}
            />
          </div>
        </div>,
        document.body
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Extraction Types</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Configure different types of data extraction templates</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowChangeLogs(true)}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <ClipboardList className="h-4 w-4" />
            <span>Logs</span>
          </button>
          <button
            onClick={() => setShowMappingPage(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <MapIcon className="h-4 w-4" />
            <span>Mapping</span>
          </button>
          {localExtractionTypes.length > 0 && isAdmin && (
            <button
              onClick={handleCopyTypeClick}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </button>
          )}
          {localExtractionTypes.length > 0 && localExtractionTypes[selectedTypeIndex] && !localExtractionTypes[selectedTypeIndex].id.startsWith('temp-') && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? 'Exporting...' : 'Export'}</span>
            </button>
          )}
          <button
            onClick={handleImportClick}
            disabled={isImporting || !isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>{isImporting ? 'Importing...' : 'Import'}</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={handleAddTypeClick}
            disabled={!isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800">Success!</span>
          </div>
          <p className="text-green-700 text-sm mt-1">Extraction types saved successfully!</p>
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-green-800 dark:text-green-300">Import Successful!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">{importSuccess}</p>
        </div>
      )}

      {importError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-red-800 dark:text-red-300">Import Failed</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{importError}</p>
        </div>
      )}

      {/* Extraction Type Selector */}
      {localExtractionTypes.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <Select
                label="Select Extraction Type to Edit"
                value={selectedTypeIndex.toString()}
                onValueChange={(value) => setSelectedTypeIndex(parseInt(value))}
                options={localExtractionTypes.map((type, index) => ({
                  value: index.toString(),
                  label: `${type.name || `Extraction Type ${index + 1}`} (${type.formatType})`
                }))}
                placeholder="Select an extraction type..."
                className="min-w-64"
              />
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-6">
              {localExtractionTypes.length} type{localExtractionTypes.length !== 1 ? 's' : ''} total
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {selectedType && (
          <div key={selectedType.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  {selectedType.formatType === 'JSON' ? (
                    <Code className="h-5 w-5 text-purple-600" />
                  ) : (
                    <FileText className="h-5 w-5 text-purple-600" />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {selectedType.name || 'New Extraction Type'}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedType.formatType} Format
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleDeleteClick(selectedTypeIndex)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={selectedType.name}
                  onChange={(e) => updateExtractionType(selectedTypeIndex, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors duration-200"
                  placeholder="e.g., Invoice Data"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filename
                </label>
                <input
                  type="text"
                  value={selectedType.filename}
                  onChange={(e) => updateExtractionType(selectedTypeIndex, 'filename', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors duration-200"
                  placeholder="e.g., invoice"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Select
                  label="Format Type"
                  value={selectedType.formatType}
                  onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'formatType', value as 'XML' | 'JSON' | 'CSV')}
                  options={[
                    { value: 'XML', label: 'XML' },
                    { value: 'JSON', label: 'JSON' },
                    { value: 'CSV', label: 'CSV' }
                  ]}
                  searchable={false}
                />
              </div>
              {selectedType.formatType === 'JSON' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    JSON API Path
                  </label>
                  <input
                    type="text"
                    value={selectedType.jsonPath || ''}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'jsonPath', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors duration-200"
                    placeholder="e.g., /api/orders"
                  />
                </div>
              )}
              {selectedType.formatType === 'CSV' && (
                <>
                  <div>
                    <Select
                      label="CSV Delimiter"
                      value={selectedType.csvDelimiter || ','}
                      onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'csvDelimiter', value)}
                      options={[
                        { value: ',', label: 'Comma (,)' },
                        { value: ';', label: 'Semicolon (;)' },
                        { value: '\t', label: 'Tab' },
                        { value: '|', label: 'Pipe (|)' }
                      ]}
                      searchable={false}
                    />
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id={`csvHeaders-${selectedTypeIndex}`}
                      checked={selectedType.csvIncludeHeaders !== false}
                      onChange={(e) => updateExtractionType(selectedTypeIndex, 'csvIncludeHeaders', e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                    />
                    <label htmlFor={`csvHeaders-${selectedTypeIndex}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Include Header Row
                    </label>
                  </div>
                </>
              )}
            </div>

            {selectedType.formatType === 'JSON' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id={`jsonMultiPage-${selectedTypeIndex}`}
                    checked={selectedType.jsonMultiPageProcessing === true}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'jsonMultiPageProcessing', e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor={`jsonMultiPage-${selectedTypeIndex}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer">
                      Process all pages as one JSON document
                    </label>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      When enabled, all pages from each multi-page PDF will be processed together and output as a single JSON file per PDF. Each PDF is treated as a separate document. This is useful for documents where data spans multiple pages (e.g., multi-page invoices, order lists).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedType.formatType === 'CSV' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id={`csvMultiPage-${selectedTypeIndex}`}
                    checked={selectedType.csvMultiPageProcessing === true}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'csvMultiPageProcessing', e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor={`csvMultiPage-${selectedTypeIndex}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer">
                      Process all pages as one CSV document
                    </label>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      When enabled, all pages from a multi-page PDF will be processed together and output as a single CSV file.
                      This is useful for documents where tabular data spans multiple pages (e.g., multi-page invoices, order lists).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* CSV Row Detection Instructions */}
            {selectedType.formatType === 'CSV' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-purple-600" />
                    <span>Row Detection Instructions</span>
                  </div>
                </label>
                <textarea
                  value={selectedType.csvRowDetectionInstructions || ''}
                  onChange={(e) => updateExtractionType(selectedTypeIndex, 'csvRowDetectionInstructions', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical transition-colors duration-200"
                  rows={3}
                  placeholder="e.g., 'Each Carrier Reference 1 field creates a new row in the CSV'"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Describe what constitutes a new row in the CSV. This helps the AI identify individual records in the PDF.
                </p>
              </div>
            )}

            {/* Workflow Assignment */}
            <div className="mb-4">
              <div className="flex items-center space-x-3 mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Workflow Version</label>
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      updateExtractionType(selectedTypeIndex, 'workflowVersion', 'v1');
                      updateExtractionType(selectedTypeIndex, 'workflowV2Id', undefined);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      (selectedType.workflowVersion || 'v1') === 'v1'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    V1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateExtractionType(selectedTypeIndex, 'workflowVersion', 'v2');
                      updateExtractionType(selectedTypeIndex, 'workflowId', undefined);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      selectedType.workflowVersion === 'v2'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    V2
                  </button>
                </div>
              </div>
              {selectedType.workflowVersion === 'v2' ? (
                <Select
                  label="Assigned Workflow v2 (Optional)"
                  value={selectedType.workflowV2Id || '__none__'}
                  onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'workflowV2Id', value === '__none__' ? undefined : value)}
                  options={[
                    { value: '__none__', label: 'No workflow assigned' },
                    ...workflowsV2
                      .filter(w => w.isActive && w.workflowType === 'extraction')
                      .map((workflow) => ({
                        value: workflow.id,
                        label: workflow.name
                      }))
                  ]}
                  placeholder="Select a v2 workflow..."
                  helpText="Graph-based workflow executed after extraction."
                />
              ) : (
                <Select
                  label="Assigned Workflow (Optional)"
                  value={selectedType.workflowId || '__none__'}
                  onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'workflowId', value === '__none__' ? undefined : value)}
                  options={[
                    { value: '__none__', label: 'No workflow assigned' },
                    ...workflows
                      .filter(w => w.isActive)
                      .map((workflow) => ({
                        value: workflow.id,
                        label: workflow.name
                      }))
                  ]}
                  placeholder="Select a workflow..."
                  helpText="When a workflow is assigned, it will be executed after data extraction for additional processing steps."
                />
              )}
            </div>

            {/* Notification Settings */}
            <div className="mb-4 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700/50">
              <button
                type="button"
                onClick={() => setShowNotificationSettings(!showNotificationSettings)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-500" /> Notification Settings
                </h3>
                {showNotificationSettings ? (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-500" />
                )}
              </button>

              {showNotificationSettings && (
                <div className="p-4 pt-0 space-y-4">
                  {/* Failure Notifications */}
                  <div className="mb-4">
                <label className="flex items-center space-x-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={selectedType.enableFailureNotifications || false}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'enableFailureNotifications', e.target.checked)}
                    className="w-4 h-4 text-red-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-red-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Failure Notifications
                  </span>
                </label>

                {selectedType.enableFailureNotifications && (
                  <div className="ml-6 space-y-3">
                    <Select
                      label="Failure Notification Template"
                      value={selectedType.failureNotificationTemplateId || '__default__'}
                      onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'failureNotificationTemplateId', value === '__default__' ? undefined : value)}
                      options={[
                        { value: '__default__', label: 'Use Global Default' },
                        ...notificationTemplates
                          .filter(t => t.template_type === 'failure')
                          .map((template) => ({
                            value: template.id,
                            label: template.template_name
                          }))
                      ]}
                      placeholder="Select a template..."
                      helpText="Template used for failure notification emails."
                    />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Override Recipient Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={selectedType.failureRecipientEmailOverride || ''}
                        onChange={(e) => updateExtractionType(selectedTypeIndex, 'failureRecipientEmailOverride', e.target.value)}
                        placeholder="admin@example.com"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Leave empty to use template default (usually sender email)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Success Notifications */}
              <div className="mb-0">
                <label className="flex items-center space-x-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={selectedType.enableSuccessNotifications || false}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'enableSuccessNotifications', e.target.checked)}
                    className="w-4 h-4 text-green-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-green-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Success Notifications
                  </span>
                </label>

                {selectedType.enableSuccessNotifications && (
                  <div className="ml-6 space-y-3">
                    <Select
                      label="Success Notification Template"
                      value={selectedType.successNotificationTemplateId || '__default__'}
                      onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'successNotificationTemplateId', value === '__default__' ? undefined : value)}
                      options={[
                        { value: '__default__', label: 'Use Global Default' },
                        ...notificationTemplates
                          .filter(t => t.template_type === 'success')
                          .map((template) => ({
                            value: template.id,
                            label: template.template_name
                          }))
                      ]}
                      placeholder="Select a template..."
                      helpText="Template used for success notification emails. Supports {{response.*}} variables for API response data."
                    />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Override Recipient Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={selectedType.successRecipientEmailOverride || ''}
                        onChange={(e) => updateExtractionType(selectedTypeIndex, 'successRecipientEmailOverride', e.target.value)}
                        placeholder="notifications@example.com"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Leave empty to send to original sender email
                      </p>
                    </div>
                  </div>
                )}
              </div>
                </div>
              )}
            </div>

            {/* Review & Confidence Settings */}
            <div className="mb-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-teal-500" />
                  Review & Confidence
                </h4>
              </div>
              <div className="p-4 space-y-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedType.enableReview || false}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'enableReview', e.target.checked)}
                    className="w-4 h-4 text-teal-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Review Before Workflow
                  </span>
                </label>
                {selectedType.enableReview && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                    Extracted data will be shown in a review modal where users can edit values before the workflow executes.
                  </p>
                )}

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedType.enableConfidenceScoring || false}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'enableConfidenceScoring', e.target.checked)}
                    className="w-4 h-4 text-teal-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Confidence Scoring
                  </span>
                </label>
                {selectedType.enableConfidenceScoring && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                    AI provides a confidence score (0-100%) per field. Requires an additional AI call. Visible in the review modal when review is also enabled.
                  </p>
                )}

                {selectedType.enableReview && (
                  <div className="ml-6 pt-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Review Template</label>
                    <CustomDropdown
                      value={selectedType.inboxReviewTemplateId || ''}
                      onChange={(val) => updateExtractionType(selectedTypeIndex, 'inboxReviewTemplateId', val || null)}
                      options={[
                        { value: '', label: 'Use Default Template' },
                        ...reviewTemplates.map(rt => ({ value: rt.id, label: rt.name }))
                      ]}
                      placeholder="Use Default Template"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Choose which review template to use for this extraction type, or leave as default.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Default Upload Mode */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Default Upload Mode (Optional)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`lockUploadMode-${selectedTypeIndex}`}
                    checked={selectedType.lockUploadMode || false}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'lockUploadMode', e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                  />
                  <label htmlFor={`lockUploadMode-${selectedTypeIndex}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Lock Mode
                  </label>
                </div>
              </div>
              <Select
                value={selectedType.defaultUploadMode || '__none__'}
                onValueChange={(value) => updateExtractionType(selectedTypeIndex, 'defaultUploadMode', value === '__none__' ? undefined : value)}
                options={[
                  { value: '__none__', label: 'No default (use user preference)' },
                  { value: 'manual', label: 'Manual Selection' },
                  { value: 'auto', label: 'AI Auto-Detect' }
                ]}
                searchable={false}
                helpText={`When set, the Extract page will automatically default to this upload mode when this extraction type is selected.${selectedType.lockUploadMode ? ' Lock Mode prevents users from changing the upload mode.' : ''}`}
              />
            </div>

            {/* Page Processing Settings */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Page Processing Options
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Configure which pages to extract from each PDF. This applies to EACH uploaded PDF individually.
              </p>

              <div className="flex items-start gap-4">
                <div className="w-64 flex-shrink-0">
                  <Select
                    value={selectedType.pageProcessingMode || 'all'}
                    onValueChange={(value) => {
                      updateExtractionType(selectedTypeIndex, 'pageProcessingMode', value);
                      if (value === 'single' && !selectedType.pageProcessingSinglePage) {
                        updateExtractionType(selectedTypeIndex, 'pageProcessingSinglePage', 1);
                      }
                      if (value === 'range') {
                        if (!selectedType.pageProcessingRangeStart) {
                          updateExtractionType(selectedTypeIndex, 'pageProcessingRangeStart', 1);
                        }
                        if (!selectedType.pageProcessingRangeEnd) {
                          updateExtractionType(selectedTypeIndex, 'pageProcessingRangeEnd', 2);
                        }
                      }
                    }}
                    options={[
                      { value: 'all', label: 'All Pages' },
                      { value: 'single', label: 'Single Page' },
                      { value: 'range', label: 'Page Range' }
                    ]}
                    searchable={false}
                  />
                </div>

                <div className="flex-1 flex items-center gap-3">
                  {selectedType.pageProcessingMode === 'single' && (
                    <>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Page:</label>
                      <input
                        type="number"
                        min="1"
                        value={selectedType.pageProcessingSinglePage || 1}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (value >= 1) {
                            updateExtractionType(selectedTypeIndex, 'pageProcessingSinglePage', value);
                          }
                        }}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        (e.g., Page {selectedType.pageProcessingSinglePage || 1} from each PDF)
                      </span>
                    </>
                  )}

                  {selectedType.pageProcessingMode === 'range' && (
                    <>
                      <label className="text-sm text-gray-600 dark:text-gray-400">From:</label>
                      <input
                        type="number"
                        min="1"
                        value={selectedType.pageProcessingRangeStart || 1}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (value >= 1) {
                            updateExtractionType(selectedTypeIndex, 'pageProcessingRangeStart', value);
                            if (selectedType.pageProcessingRangeEnd && value > selectedType.pageProcessingRangeEnd) {
                              updateExtractionType(selectedTypeIndex, 'pageProcessingRangeEnd', value);
                            }
                          }
                        }}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <label className="text-sm text-gray-600 dark:text-gray-400">To:</label>
                      <input
                        type="number"
                        min={selectedType.pageProcessingRangeStart || 1}
                        value={selectedType.pageProcessingRangeEnd || 2}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          const start = selectedType.pageProcessingRangeStart || 1;
                          if (value >= start) {
                            updateExtractionType(selectedTypeIndex, 'pageProcessingRangeEnd', value);
                          }
                        }}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        (Pages {selectedType.pageProcessingRangeStart || 1}-{selectedType.pageProcessingRangeEnd || 2} from each PDF)
                      </span>
                    </>
                  )}

                  {(!selectedType.pageProcessingMode || selectedType.pageProcessingMode === 'all') && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Extract all pages from each PDF (default behavior)
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <strong>Example:</strong> If you upload 2 PDFs with "Single Page: Page 1" selected, page 1 from EACH PDF will be extracted (2 pages total).
              </p>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedType.combinePagesAsSingleExtraction || false}
                    onChange={(e) => updateExtractionType(selectedTypeIndex, 'combinePagesAsSingleExtraction', e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Combine all pages into a single extraction
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      When enabled, all pages of a PDF are sent to the AI as ONE extraction request instead of extracting each page separately. Useful when a document's content spans multiple pages but should be treated as one record.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Instructions
              </label>
              <textarea
                value={selectedType.defaultInstructions}
                onChange={(e) => updateExtractionType(selectedTypeIndex, 'defaultInstructions', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical transition-colors duration-200"
                rows={3}
                placeholder="Describe what data to extract from the PDF..."
              />
            </div>

            {selectedType.formatType !== 'CSV' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedType.formatType === 'JSON' ? 'JSON Template' : 'XML Template'}
                  </label>
                  {selectedType.formatType === 'JSON' && (
                    <button
                      type="button"
                      onClick={handleCheckJson}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                    >
                      <Code className="h-3.5 w-3.5" />
                      <span>Check JSON</span>
                    </button>
                  )}
                </div>
                <textarea
                  value={selectedType.formatTemplate}
                  onChange={(e) => {
                    updateExtractionType(selectedTypeIndex, 'formatTemplate', e.target.value);
                    setJsonValidationResult(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical font-mono text-sm transition-colors duration-200"
                  rows={6}
                  placeholder={selectedType.formatType === 'JSON' ?
                    '{\n  "field1": "value1",\n  "field2": "value2"\n}' :
                    '<Trace>\n  <TraceType type="">\n    <Number>{{PARSE_IT_ID_PLACEHOLDER}}</Number>\n  </TraceType>\n</Trace>'
                  }
                />
                {selectedType.formatType === 'JSON' && jsonValidationResult && (
                  <div className={`mt-2 flex items-center space-x-2 text-sm ${jsonValidationResult.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {jsonValidationResult.valid ? (
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span>{jsonValidationResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* Auto-Detection Instructions */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center space-x-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  <span>Auto-Detection Instructions</span>
                </div>
              </label>
              <textarea
                value={selectedType.autoDetectInstructions || ''}
                onChange={(e) => updateExtractionType(selectedTypeIndex, 'autoDetectInstructions', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical transition-colors duration-200"
                rows={3}
                placeholder="Describe the characteristics that identify this document type (e.g., 'Invoice documents with company letterhead, contains invoice number, billing address, line items with quantities and prices')"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                These instructions help the AI identify when to use this extraction type. Be specific about document layout, key fields, headers, or unique characteristics.
              </p>
            </div>

            {/* Array Split Configuration Section - Only for JSON */}
            {selectedType.formatType === 'JSON' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <div className="flex items-center space-x-2">
                      <Split className="h-4 w-4 text-blue-600" />
                      <span>Array Split Configuration</span>
                    </div>
                  </label>
                  <button
                    onClick={handleAddArraySplitClick}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Split Rule</span>
                  </button>
                </div>

                {selectedType.arraySplitConfigs && selectedType.arraySplitConfigs.length > 0 && (
                  <div className="space-y-2">
                    {selectedType.arraySplitConfigs.map((split) => (
                      <div
                        key={split.id}
                        className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                {split.targetArrayField}
                              </span>
                              <span className="text-xs text-blue-600 dark:text-blue-400">→</span>
                              <span className="text-sm text-blue-800 dark:text-blue-200">
                                split by {split.splitBasedOnField}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <p className="text-xs text-blue-700 dark:text-blue-300">
                                Strategy: {split.splitStrategy === 'one_per_entry' ? 'One per entry' : 'Divide evenly'}
                              </p>
                              {split.defaultToOneIfMissing && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                  Default to 1
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEditArraySplit(split)}
                              className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors duration-200"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteArraySplit(split.id!)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900 rounded transition-colors duration-200"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    <strong>Array splitting</strong> tells the AI to create multiple array entries based on a field value.
                    For example, if "pieces" = 3, create 3 barcode entries each with pieces = 1.
                  </p>
                </div>
              </div>
            )}

            {/* Array Entry Builder Section - Only for JSON */}
            {selectedType.formatType === 'JSON' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <div className="flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-emerald-600" />
                      <span>Array Entry Builder</span>
                    </div>
                  </label>
                  <button
                    onClick={handleAddArrayEntryClick}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Entry</span>
                  </button>
                </div>

                {selectedType.arrayEntryConfigs && selectedType.arrayEntryConfigs.length > 0 && (
                  <div className="space-y-2">
                    {selectedType.arrayEntryConfigs.map((entry) => (
                      <div
                        key={entry.id}
                        className={`p-3 border rounded-lg ${entry.isEnabled ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 opacity-60'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                                {entry.targetArrayField}{entry.isRepeating ? '[*]' : `[${entry.entryOrder}]`}
                              </span>
                              {entry.isRepeating && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded flex items-center space-x-1">
                                  <RefreshCw className="h-3 w-3" />
                                  <span>Repeating</span>
                                </span>
                              )}
                              {entry.aiConditionInstruction && (
                                <Brain className="h-4 w-4 text-amber-500" title="AI Condition" />
                              )}
                              {entry.conditions?.enabled && (entry.conditions?.rules?.length ?? 0) > 0 && (
                                <Filter className="h-4 w-4 text-amber-500" />
                              )}
                              {entry.removeEntryIfRinNull && (
                                <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded flex items-center space-x-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>RIN Drops Entry</span>
                                </span>
                              )}
                              {entry.parentArrayField && (
                                <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded">
                                  Child of: {entry.parentArrayField}
                                </span>
                              )}
                              {!entry.isEnabled && (
                                <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.fields.map((field, idx) => (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    field.fieldType === 'hardcoded'
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                      : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                                  }`}
                                >
                                  {field.fieldName}: {field.fieldType === 'hardcoded' ? `"${field.hardcodedValue}"` : `"${field.extractionInstruction?.substring(0, 40)}${(field.extractionInstruction?.length || 0) > 40 ? '...' : ''}"`}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEditArrayEntry(entry)}
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800 rounded transition-colors duration-200"
                              title="Edit entry"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleCopyArrayEntry(entry)}
                              className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors duration-200"
                              title="Copy entry"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteArrayEntry(entry.id!)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900 rounded transition-colors duration-200"
                              title="Delete entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    <strong>Array Entry Builder</strong> lets you define multiple array entries with mixed hardcoded and extracted values.
                    Each entry can have fields with fixed values or AI extraction instructions from different PDF locations.
                  </p>
                </div>
              </div>
            )}

            {(selectedType.formatType === 'JSON' || selectedType.formatType === 'CSV') && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedType.formatType === 'CSV' ? 'CSV Column Mappings' : 'Field Mappings'}
                  </label>
                  <div className="flex items-center space-x-2">
                    {selectedType.id && !selectedType.id.startsWith('temp-') && (
                      <button
                        onClick={() => setShowFunctionsModal(true)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                        title="Manage conditional logic functions for field mappings"
                      >
                        <FunctionSquare className="h-3 w-3" />
                        <span>Functions</span>
                      </button>
                    )}
                    {selectedType.formatType === 'JSON' && (
                      <button
                        onClick={() => generateFieldMappingsFromTemplateAsync(selectedTypeIndex)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                      >
                        <FileText className="h-3 w-3" />
                        <span>Map JSON</span>
                      </button>
                    )}
                    <button
                      onClick={() => addFieldMapping(selectedTypeIndex)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Field</span>
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                    >
                      <Save className="h-3 w-3" />
                      <span>{isSaving ? 'Saving...' : 'Save'}</span>
                    </button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {(selectedType.fieldMappings || []).map((mapping, mappingIndex) => (
                    <div key={mappingIndex} className={`p-3 rounded-lg border-2 ${
                      mapping.type === 'hardcoded'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : mapping.type === 'mapped'
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                        : mapping.type === 'function'
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                        : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                    }`}>
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(120px,1fr)_120px_minmax(200px,2fr)_150px_80px_70px_130px_60px_60px_40px] gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Field Name
                          </label>
                          <input
                            type="text"
                            value={mapping.fieldName}
                            onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'fieldName', e.target.value)}
                            className={`w-full px-2 py-1 border-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                              mapping.type === 'hardcoded'
                                ? 'border-green-400 dark:border-green-500'
                                : mapping.type === 'mapped'
                                ? 'border-blue-400 dark:border-blue-500'
                                : mapping.type === 'function'
                                ? 'border-indigo-400 dark:border-indigo-500'
                                : 'border-orange-400 dark:border-orange-500'
                            }`}
                            placeholder="fieldName"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
                          <CustomDropdown
                            value={mapping.type}
                            onChange={(value) => {
                              updateFieldMapping(selectedTypeIndex, mappingIndex, 'type', value as 'ai' | 'mapped' | 'hardcoded' | 'function' | 'variable');
                              if (value !== 'function') {
                                updateFieldMapping(selectedTypeIndex, mappingIndex, 'functionId', undefined);
                              }
                            }}
                            options={[
                              { value: 'ai', label: 'AI' },
                              { value: 'mapped', label: 'Mapped' },
                              { value: 'hardcoded', label: 'Hardcoded' },
                              { value: 'function', label: 'Function' },
                              { value: 'order_entry', label: 'Order Entry' },
                              { value: 'variable', label: 'Variable' }
                            ]}
                            colorMap={{
                              ai: { triggerClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
                              mapped: { triggerClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
                              hardcoded: { triggerClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
                              function: { triggerClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
                              order_entry: { triggerClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
                              variable: { triggerClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300' },
                            }}
                            size="sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {mapping.type === 'hardcoded' ? 'Value' : mapping.type === 'mapped' ? 'PDF Coordinates' : mapping.type === 'function' ? 'Select Function' : mapping.type === 'variable' ? 'Source Field' : 'Description'}
                          </label>
                          {mapping.type === 'function' ? (
                            <Select
                              label="Select Function"
                              value={mapping.functionId || ''}
                              onValueChange={(value) => {
                                updateFieldMapping(selectedTypeIndex, mappingIndex, 'functionId', value || undefined);
                                const func = availableFunctions.find(f => f.id === value);
                                if (func) {
                                  updateFieldMapping(selectedTypeIndex, mappingIndex, 'value', func.function_name);
                                }
                              }}
                              options={availableFunctions.map((func) => ({
                                value: func.id,
                                label: func.function_name,
                              }))}
                              placeholder="Select a function..."
                              searchable={false}
                            />
                          ) : (
                            <input
                              type="text"
                              value={mapping.value}
                              onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'value', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                              placeholder={
                                mapping.type === 'hardcoded' ? 'Fixed value' :
                                mapping.type === 'mapped' ? 'e.g., (100, 200, 150, 30)' :
                                mapping.type === 'variable' ? 'e.g., consignee.postalCode' :
                                'What to extract'
                              }
                            />
                          )}
                        </div>
                        <div>
                          <Select
                            label="Data Type"
                            value={mapping.dataType || 'string'}
                            onValueChange={(value) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'dataType', value as 'string' | 'number' | 'integer' | 'boolean' | 'zip_postal' | 'date' | 'time')}
                            options={[
                              { value: 'string', label: 'String' },
                              { value: 'number', label: 'Number' },
                              { value: 'integer', label: 'Integer' },
                              { value: 'datetime', label: 'DateTime' },
                              { value: 'date', label: 'Date (yyyy-MM-dd)' },
                              { value: 'time', label: 'Time (HH:mm)' },
                              { value: 'phone', label: 'Phone Number' },
                              { value: 'boolean', label: 'Boolean' },
                              { value: 'zip_postal', label: 'Zip/Postal Code' }
                            ]}
                            searchable={false}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Max Length
                          </label>
                          {(mapping.dataType || 'string') === 'string' ? (
                            <input
                              type="number"
                              value={mapping.maxLength || ''}
                              onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'maxLength', e.target.value ? parseInt(e.target.value) : undefined)}
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                              placeholder="40"
                              min="1"
                            />
                          ) : (
                            <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                              {(mapping.dataType === 'phone') ? 'Auto' : (mapping.dataType === 'boolean') ? 'True/False' : 'N/A'}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-center text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" title="Date Only">
                            Date Only
                          </label>
                          {mapping.dataType === 'datetime' ? (
                            <div className="flex items-center justify-center h-[34px]">
                              <input
                                type="checkbox"
                                checked={mapping.dateOnly || false}
                                onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'dateOnly', e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                                title="Show date only, time will be set to 00:00:00"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-[34px] text-xs text-gray-400 dark:text-gray-500 italic">
                              N/A
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" title="Input Date Format">
                            Input Format
                          </label>
                          {(mapping.dataType === 'datetime' || mapping.dataType === 'date') ? (
                            <select
                              value={mapping.inputDateFormat || ''}
                              onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'inputDateFormat', e.target.value || undefined)}
                              className="w-full px-1 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              title="How dates appear in the source document"
                            >
                              <option value="">Auto-detect</option>
                              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                              <option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                            </select>
                          ) : (
                            <div className="flex items-center justify-center h-[34px] text-xs text-gray-400 dark:text-gray-500 italic">
                              N/A
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-center text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" title="Remove if Null">
                            RIN
                          </label>
                          <div className="flex items-center justify-center h-[34px]">
                            <input
                              type="checkbox"
                              checked={mapping.removeIfNull || false}
                              onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'removeIfNull', e.target.checked)}
                              className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                              title="Remove if Null"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-center text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" title="Workflow Only">
                            WFO
                          </label>
                          <div className="flex items-center justify-center h-[34px]">
                            <input
                              type="checkbox"
                              checked={mapping.isWorkflowOnly || false}
                              onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'isWorkflowOnly', e.target.checked)}
                              className="w-4 h-4 text-purple-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                              title="Workflow Only - This field will be excluded from the extracted output but available in workflows"
                            />
                          </div>
                        </div>
                        <div>
                          <button
                            onClick={() => removeFieldMapping(selectedTypeIndex, mappingIndex)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors duration-200"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {localExtractionTypes.length === 0 && (
          <div className="text-center py-12">
            <Database className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Extraction Types</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first extraction type to get started.</p>
            <button
              onClick={handleAddTypeClick}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add Extraction Type</span>
            </button>
          </div>
        )}
      </div>

      {/* Information Panel */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">How Extraction Types Work</h4>
        <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-1">
          <li>• Extraction types define templates for extracting specific data from PDFs</li>
          <li>• Use field mappings to specify exactly what data to extract (AI, Mapped coordinates, Hardcoded values, or Functions)</li>
          <li>• <strong>Functions</strong> allow you to define conditional logic (if-then-else) to transform field values based on extracted data</li>
          <li>• JSON templates use placeholders like {`{{PARSE_IT_ID_PLACEHOLDER}}`} that get replaced with actual IDs</li>
          <li>• XML templates can include {`{{PARSE_IT_ID_PLACEHOLDER}}`} directly in the XML structure</li>
          <li>• Auto-detection instructions help AI choose the right extraction type automatically</li>
        </ul>
      </div>

      {showChangeLogs && (
        <ConfigChangeLogsModal
          configType="extraction"
          title="Extraction Type Change Logs"
          onClose={() => setShowChangeLogs(false)}
        />
      )}
    </div>
  );
}