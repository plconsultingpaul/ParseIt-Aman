import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Save, FileText, Code, Database, Map, Brain, RefreshCw, Copy, Download, Upload, CheckCircle, XCircle, ClipboardList } from 'lucide-react';
import type { TransformationType, TransformationFieldMapping, PageGroupConfig, WorkflowV2, User } from '../../types';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import MappingPage from '../MappingPage';
import PageGroupConfigEditor from './PageGroupConfigEditor';
import Select from '../common/Select';
import { exportTransformationType, importTransformationType, ExportedTransformationType } from '../../services/typeService';
import { supabase } from '../../lib/supabase';
import { fetchWorkflowsV2 } from '../../services/workflowV2Service';
import ConfigChangeLogsModal, { logConfigChange } from '../common/ConfigChangeLogsModal';

interface TransformationTypesSettingsProps {
  transformationTypes: TransformationType[];
  refreshData?: () => Promise<void>;
  onUpdateTransformationTypes: (types: TransformationType[]) => Promise<void>;
  onDeleteTransformationType: (id: string) => Promise<void>;
  isAdmin?: boolean;
  currentUser?: User;
}

export default function TransformationTypesSettings({
  transformationTypes,
  refreshData,
  onUpdateTransformationTypes,
  onDeleteTransformationType,
  isAdmin = true,
  currentUser
}: TransformationTypesSettingsProps) {
  const { workflows } = useSupabaseData();
  const [workflowsV2, setWorkflowsV2] = useState<WorkflowV2[]>([]);

  useEffect(() => {
    fetchWorkflowsV2().then(setWorkflowsV2).catch(console.error);
  }, []);

  const [localTransformationTypes, setLocalTransformationTypes] = useState<TransformationType[]>(transformationTypes || []);
  const [selectedTypeIndex, setSelectedTypeIndex] = useState<number>((transformationTypes && transformationTypes.length > 0) ? 0 : -1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showChangeLogs, setShowChangeLogs] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMappingPage, setShowMappingPage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTypeSelectionModal, setShowTypeSelectionModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [typeToCopy, setTypeToCopy] = useState<TransformationType | null>(null);
  const [copyTypeName, setCopyTypeName] = useState('');
  const [copyNameError, setCopyNameError] = useState('');
  const [typeToDelete, setTypeToDelete] = useState<{ index: number; name: string; id?: string } | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [nameError, setNameError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add error boundary state
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Error boundary effect
  useEffect(() => {
    try {
      // Test if we can safely access the transformation types
      if (transformationTypes && Array.isArray(transformationTypes)) {
        setLocalTransformationTypes(transformationTypes);
        setHasError(false);
        setErrorMessage('');
      } else {
        console.warn('Transformation types is not an array:', transformationTypes);
        setLocalTransformationTypes([]);
        setHasError(true);
        setErrorMessage('Transformation types data is not available. Please refresh the page or contact support.');
      }
    } catch (error) {
      console.error('Error initializing transformation types:', error);
      setHasError(true);
      setErrorMessage('Failed to load transformation types. Please refresh the page.');
      setLocalTransformationTypes([]);
    }
  }, [transformationTypes]);

  // Update selectedTypeIndex when transformationTypes changes
  useEffect(() => {
    try {
      if (localTransformationTypes && localTransformationTypes.length > 0 && selectedTypeIndex === -1) {
        setSelectedTypeIndex(0);
      } else if (!localTransformationTypes || localTransformationTypes.length === 0) {
        setSelectedTypeIndex(-1);
      }
    } catch (error) {
      console.error('Error updating selected type index:', error);
      setSelectedTypeIndex(-1);
    }
  }, [localTransformationTypes.length, selectedTypeIndex]);

  const handleAddTypeClick = () => {
    setShowAddModal(true);
    setNewTypeName('');
    setNameError('');
  };

  const handleExport = async () => {
    const selectedType = localTransformationTypes[selectedTypeIndex];
    if (!selectedType || selectedType.id.startsWith('temp-')) {
      return;
    }

    setIsExporting(true);
    try {
      const exportData = await exportTransformationType(selectedType);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
      const safeName = selectedType.name.replace(/[^a-zA-Z0-9]/g, '_');
      link.href = url;
      link.download = `${timestamp}_Transform_${safeName}.json`;
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
      const exportData: ExportedTransformationType = JSON.parse(text);

      if (exportData.exportType !== 'transformation' || !exportData.exportVersion) {
        throw new Error('Invalid export file format');
      }

      const result = await importTransformationType(exportData);

      if (result.success) {
        setImportSuccess(`Successfully imported "${exportData.typeName}"`);
        setTimeout(() => setImportSuccess(''), 5000);
        if (refreshData) {
          await refreshData();
        }
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

  const handleTypeSelectedForCopy = (type: TransformationType) => {
    setTypeToCopy(type);
    setCopyTypeName(`${type.name} - Copy`);
    setCopyNameError('');
    setShowTypeSelectionModal(false);
    setShowCopyModal(true);
  };

  const handleCopyType = async () => { // Ensure this function is marked as async
    console.log('=== COPY TRANSFORMATION TYPE START ===');
    console.log('Copy type name:', copyTypeName);
    console.log('Type to copy:', typeToCopy);
    
    if (!copyTypeName.trim()) {
      console.log('Copy failed: Name is required');
      setCopyNameError('Name is required');
      return;
    }

    // Check if name already exists
    if (localTransformationTypes.some(type => type.name.toLowerCase() === copyTypeName.trim().toLowerCase())) {
      console.log('Copy failed: Name already exists');
      setCopyNameError('Name already exists');
      return;
    }

    if (!typeToCopy) {
      console.log('Copy failed: No type to copy');
      return;
    }

    console.log('Creating copy of transformation type...');
    console.log('Original type properties:', Object.keys(typeToCopy));
    console.log('Original type field mappings:', typeToCopy.fieldMappings?.length || 0);
    console.log('Original type pages per group:', typeToCopy.pagesPerGroup);
    console.log('Original type document start detection:', typeToCopy.documentStartDetectionEnabled);
    console.log('Original type document start pattern:', typeToCopy.documentStartPattern);
    // Create a deep copy of the original type with a new ID and name
    const copiedType: TransformationType = {
      ...typeToCopy,
      id: `temp-${Date.now()}`,
      name: copyTypeName.trim(),
      // Deep copy field mappings array
      fieldMappings: typeToCopy.fieldMappings ? typeToCopy.fieldMappings.map(mapping => ({ ...mapping })) : []
    };
    
    console.log('Created copied type:', copiedType);
    console.log('Copied type properties:', Object.keys(copiedType));
    console.log('Copied type field mappings:', copiedType.fieldMappings?.length || 0);
    console.log('Copied type pages per group:', copiedType.pagesPerGroup);
    console.log('Copied type document start detection:', copiedType.documentStartDetectionEnabled);
    console.log('Copied type document start pattern:', copiedType.documentStartPattern);
    
    const updatedTypes = [...localTransformationTypes, copiedType];
    console.log('Updated types array length:', updatedTypes.length);
    console.log('Last type in array:', updatedTypes[updatedTypes.length - 1]);
    
    setLocalTransformationTypes(updatedTypes);
    console.log('Local state updated with copied type');
    
    // Automatically save the new type
    try {
      console.log('Attempting to save copied type to database...');
      console.log('Calling onUpdateTransformationTypes with:', updatedTypes.length, 'types');
      console.log('=== DETAILED SAVE DEBUG ===');
      console.log('Types being sent to database:');
      updatedTypes.forEach((type, index) => {
        console.log(`Type ${index}:`, {
        });
      });
      console.log('=== END DETAILED SAVE DEBUG ===');
      
      // Wait a moment for database transaction to fully commit
      console.log('Waiting for database transaction to commit...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await onUpdateTransformationTypes(updatedTypes);
      console.log('onUpdateTransformationTypes completed successfully');
      console.log('Database save successful');
      
      // Close modal and show success
      setShowCopyModal(false);
      setTypeToCopy(null);
      setCopyTypeName('');
      setCopyNameError('');
      
      // Show success message
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      console.log('=== COPY TRANSFORMATION TYPE SUCCESS ===');
      
      // Wait for parent component to refresh data, then select the copied type
      setTimeout(() => {
        console.log('Looking for copied type in updated props...');
        // The parent component should have refreshed by now
        // We'll rely on the useEffect to select the copied type when props update
      }, 2000);
      
    } catch (error) {
      console.error('Failed to save copied transformation type:', error);
      console.log('=== SAVE ERROR DETAILS ===');
      console.log('Error type:', error?.constructor?.name);
      console.log('Error message:', error?.message);
      console.log('Error stack:', error?.stack);
      console.log('=== END SAVE ERROR DETAILS ===');
      console.error('Error stack:', error.stack);
      setCopyNameError('Failed to save copied type. Please try again.');
    }
  };

  // Update local state when props change and handle copy selection
  React.useEffect(() => {
    console.log('TransformationTypes prop updated, length:', transformationTypes.length);
    console.log('Current local types length:', localTransformationTypes.length);
    
    // Update local state with new props data
    setLocalTransformationTypes(transformationTypes);
    
    // If we just copied a type and the props now have more types, select the new one
    if (copyTypeName && transformationTypes.length > 0) {
      console.log('Looking for copied type:', copyTypeName);
      const copiedTypeIndex = transformationTypes.findIndex(type => type.name === copyTypeName.trim());
      console.log('Found copied type at index:', copiedTypeIndex);
      
      if (copiedTypeIndex >= 0) {
        console.log('Selecting copied type at index:', copiedTypeIndex);
        setSelectedTypeIndex(copiedTypeIndex);
        setCopyTypeName(''); // Clear to prevent re-triggering
      } else {
        console.log('Copied type not found yet, will try again on next update');
      }
    }
  }, [transformationTypes, copyTypeName]);

  const handleCopyNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCopyType();
    }
  };

  const handleAddType = async () => {
    console.log('=== ADD TRANSFORMATION TYPE START ===');
    console.log('New type name:', newTypeName);
    console.log('Current local types count:', localTransformationTypes.length);
    
    if (!newTypeName.trim()) {
      console.log('Add failed: Name is required');
      setNameError('Name is required');
      return;
    }

    // Check if name already exists
    if (localTransformationTypes.some(type => type.name.toLowerCase() === newTypeName.trim().toLowerCase())) {
      console.log('Add failed: Name already exists');
      setNameError('Name already exists');
      return;
    }

    setIsCreating(true);
    setError('');
    setSuccess('');

    console.log('Creating new transformation type...');
    const newType: TransformationType = {
      id: `temp-${Date.now()}`,
      name: newTypeName.trim(),
      defaultInstructions: '',
      filenameTemplate: '',
      fieldMappings: [],
      pagesPerGroup: 1,
      documentStartDetectionEnabled: false,
      documentStartPattern: '',
      autoDetectInstructions: ''
    };
    
    console.log('New type created:', newType);
    console.log('New type properties:', Object.keys(newType));
    
    const updatedTypes = [...localTransformationTypes, newType];
    console.log('Updated types array length:', updatedTypes.length);
    console.log('Last type in updated array:', updatedTypes[updatedTypes.length - 1]);
    
    setLocalTransformationTypes(updatedTypes);
    console.log('Local state updated with new type');
    
    try {
      console.log('=== AUTO-SAVING NEW TRANSFORMATION TYPE ===');
      await onUpdateTransformationTypes(updatedTypes);
      console.log('✅ New transformation type saved successfully');

      const typeName = updatedTypes[updatedTypes.length - 1]?.name;
      if (typeName) {
        const { data: newType } = await supabase
          .from('transformation_types')
          .select('id')
          .eq('name', typeName)
          .maybeSingle();
        if (newType) {
          const { data: adminUsers } = await supabase
            .from('users')
            .select('id')
            .eq('is_admin', true);
          if (adminUsers && adminUsers.length > 0) {
            await supabase.from('user_transformation_types').insert(
              adminUsers.map(u => ({ user_id: u.id, transformation_type_id: newType.id }))
            );
          }
        }
      }

      setSelectedTypeIndex(updatedTypes.length - 1);
      console.log('Selecting new type at index:', updatedTypes.length - 1);

      setShowAddModal(false);
      setNewTypeName('');
      setNameError('');
      setSuccess('Transformation type created and saved successfully!');
      setTimeout(() => setSuccess(''), 3000);

      console.log('=== ADD TRANSFORMATION TYPE COMPLETE ===');
    } catch (error) {
      console.error('❌ Failed to save new transformation type:', error);
      setError('Failed to save transformation type. Please try again.');
      // Remove the type from local state since save failed
      setLocalTransformationTypes(localTransformationTypes);
    } finally {
      setIsCreating(false);
    }
  };

  const handleNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddType();
    }
  };

  const removeTransformationType = (index: number) => {
    const updated = localTransformationTypes.filter((_, i) => i !== index);
    setLocalTransformationTypes(updated);
    // Adjust selected index if needed
    if (selectedTypeIndex >= updated.length) {
      setSelectedTypeIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleDeleteClick = (index: number) => {
    const typeToDelete = localTransformationTypes[index];
    setTypeToDelete({ index, name: typeToDelete.name, id: typeToDelete.id });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!typeToDelete) return;
    
    try {
      // Only call database delete if this is not a temporary type
      if (typeToDelete.id && !typeToDelete.id.startsWith('temp-')) {
        await onDeleteTransformationType(typeToDelete.id);
      }
      
      // Remove from local state
      removeTransformationType(typeToDelete.index);
      
      setShowDeleteModal(false);
      setTypeToDelete(null);
    } catch (error) {
      console.error('Failed to delete transformation type:', error);
      alert('Failed to delete transformation type. Please try again.');
    }
  };

  const addFieldMapping = (typeIndex: number) => {
    const updated = [...localTransformationTypes];
    const newMapping: TransformationFieldMapping = {
      fieldName: '',
      type: 'ai',
      value: '',
      dataType: 'string'
    };
    updated[typeIndex].fieldMappings = [...(updated[typeIndex].fieldMappings || []), newMapping];
    setLocalTransformationTypes(updated);
  };

  const updateFieldMapping = (typeIndex: number, mappingIndex: number, field: keyof TransformationFieldMapping, value: any) => {
    const updated = [...localTransformationTypes];
    const mappings = [...(updated[typeIndex].fieldMappings || [])];
    mappings[mappingIndex] = { ...mappings[mappingIndex], [field]: value };
    updated[typeIndex].fieldMappings = mappings;
    setLocalTransformationTypes(updated);
  };

  const removeFieldMapping = (typeIndex: number, mappingIndex: number) => {
    const updated = [...localTransformationTypes];
    const mappings = (updated[typeIndex].fieldMappings || []).filter((_, i) => i !== mappingIndex);
    updated[typeIndex].fieldMappings = mappings;
    setLocalTransformationTypes(updated);
  };

  const generateFieldMappingsFromTemplate = (typeIndex: number) => {
    const transformationType = localTransformationTypes[typeIndex];
    if (!transformationType.filenameTemplate) {
      alert('Please add a filename template first');
      return;
    }

    try {
      // Extract field names from filename template (e.g., {{invoiceNumber}}, {{customerName}})
      const fieldMatches = transformationType.filenameTemplate.match(/\{\{([^}]+)\}\}/g);
      if (!fieldMatches) {
        alert('No field placeholders found in filename template. Use {{fieldName}} format.');
        return;
      }

      const fieldMappings: TransformationFieldMapping[] = fieldMatches.map(match => {
        const fieldName = match.replace(/[{}]/g, '');
        return {
          fieldName,
          type: 'ai',
          value: `Extract ${fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`,
          dataType: 'string'
        };
      });

      // Update the transformation type with the generated mappings
      const updated = [...localTransformationTypes];
      updated[typeIndex].fieldMappings = fieldMappings;
      setLocalTransformationTypes(updated);

    } catch (error) {
      alert('Error parsing filename template. Please check the template format.');
    }
  };

  const updateTransformationType = (typeIndex: number, field: keyof TransformationType, value: any) => {
    setLocalTransformationTypes(prev => {
      const updated = [...prev];
      updated[typeIndex] = { ...updated[typeIndex], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    console.log('=== SAVE TRANSFORMATION TYPES START ===');
    console.log('Local transformation types to save:', localTransformationTypes.length);
    console.log('Types being saved:');
    localTransformationTypes.forEach((type, index) => {
      console.log(`  Type ${index}:`, {
        id: type.id,
        name: type.name,
        isTemp: type.id.startsWith('temp-'),
        hasRequiredFields: !!(type.name && type.defaultInstructions !== undefined && type.filenameTemplate !== undefined),
        pagesPerGroup: type.pagesPerGroup,
        documentStartDetectionEnabled: type.documentStartDetectionEnabled,
        fieldMappingsCount: type.fieldMappings?.length || 0
      });
    });
    
    setIsSaving(true);
    try {
      await onUpdateTransformationTypes(localTransformationTypes);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (currentUser) {
        const typeName = localTransformationTypes[selectedTypeIndex]?.name || 'Unknown';
        logConfigChange('transformation', typeName, currentUser.id, currentUser.username);
      }
    } catch (error) {
      console.error('Failed to save transformation types:', error);
      console.log('=== SAVE ERROR DETAILS ===');
      console.log('Error type:', error?.constructor?.name);
      console.log('Error message:', error?.message);
      if (error?.stack) console.log('Error stack:', error.stack);
      console.log('=== END SAVE ERROR DETAILS ===');
      alert('Failed to save transformation types. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedType = selectedTypeIndex >= 0 ? localTransformationTypes[selectedTypeIndex] : null;

  // Show error state if there's an error
  if (hasError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Transformation Types</h3>
            <p className="text-gray-600 mt-1">Configure PDF transformation and renaming templates</p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="bg-red-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <RefreshCw className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-red-800 mb-2">Unable to Load Transformation Types</h3>
          <p className="text-red-700 mb-4">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors duration-200"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

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
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Select Transformation Type to Copy</h3>
              <p className="text-gray-600 dark:text-gray-400">Choose which transformation type you want to duplicate</p>
            </div>
            
            {localTransformationTypes.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Transformation Types Available</h4>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  You need to create at least one transformation type before you can copy it.
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
                  {localTransformationTypes.map((type) => (
                    <div
                      key={type.id}
                      onClick={() => handleTypeSelectedForCopy(type)}
                      className="p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-orange-300 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-orange-100 dark:bg-orange-800 p-2 rounded-lg">
                            <RefreshCw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {type.name}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {type.fieldMappings?.length || 0} field mappings
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {type.filenameTemplate && `Template: ${type.filenameTemplate}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-orange-600 dark:text-orange-400">
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
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Copy Transformation Type</h3>
              <p className="text-gray-600 dark:text-gray-400">Create a copy of "{typeToCopy.name}" with a new name</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Transformation Type Name
                </label>
                <input
                  type="text"
                  value={copyTypeName}
                  onChange={(e) => setCopyTypeName(e.target.value)}
                  onKeyPress={handleCopyNameKeyPress}
                  placeholder="e.g., Invoice Renaming - Copy"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {copyNameError && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2">{copyNameError}</p>
                )}
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <p className="text-blue-700 dark:text-blue-400 text-sm">
                  <strong>What will be copied:</strong> All settings, instructions, filename template, field mappings, and configuration from the original transformation type.
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleCopyType}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  Copy Transformation Type
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Plus className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Add New Transformation Type</h3>
              <p className="text-gray-600 dark:text-gray-400">Enter a name for your new transformation type</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Transformation Type Name
                </label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyPress={handleNameKeyPress}
                  placeholder="e.g., Invoice Renaming"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  autoFocus
                />
                {nameError && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2">{nameError}</p>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleAddType}
                  disabled={isCreating}
                  className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isCreating ? 'Creating & Saving...' : 'Create Transformation Type'}
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  disabled={isCreating}
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
      {showDeleteModal && typeToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Transformation Type</h3>
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
        </div>,
        document.body
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Transformation Types</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Configure PDF transformation and renaming templates</p>
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
            <Map className="h-4 w-4" />
            <span>Mapping</span>
          </button>
          {localTransformationTypes.length > 0 && isAdmin && (
            <button
              onClick={handleCopyTypeClick}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>Copy</span>
            </button>
          )}
          {localTransformationTypes.length > 0 && selectedTypeIndex >= 0 && localTransformationTypes[selectedTypeIndex] && !localTransformationTypes[selectedTypeIndex].id.startsWith('temp-') && (
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
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
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
          <p className="text-green-700 text-sm mt-1">Transformation types saved successfully!</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{error}</p>
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

      {/* Transformation Type Selector */}
      {localTransformationTypes.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <Select
                label="Select Transformation Type to Edit"
                value={selectedTypeIndex.toString()}
                onValueChange={(value) => setSelectedTypeIndex(parseInt(value))}
                options={localTransformationTypes.map((type, index) => ({
                  value: index.toString(),
                  label: type.name || `Transformation Type ${index + 1}`
                }))}
                placeholder="Select a transformation type..."
                className="min-w-64"
              />
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-6">
              {localTransformationTypes.length} type{localTransformationTypes.length !== 1 ? 's' : ''} total
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {selectedType && selectedTypeIndex >= 0 && (
          <div key={selectedType.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {selectedType.name || 'New Transformation Type'}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    PDF Renaming Configuration
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
                  onChange={(e) => updateTransformationType(selectedTypeIndex, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors duration-200"
                  placeholder="e.g., Invoice Renaming"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filename Template
                </label>
                <input
                  type="text"
                  value={selectedType.filenameTemplate}
                  onChange={(e) => updateTransformationType(selectedTypeIndex, 'filenameTemplate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono transition-colors duration-200"
                  placeholder="e.g., {{invoiceNumber}}-{{customerName}}.pdf"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Use {`{{fieldName}}`} placeholders for extracted data
                </p>
              </div>
            </div>

            {/* Workflow Assignment */}
            <div className="mb-4">
              <div className="flex items-center space-x-3 mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Workflow Version</label>
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      updateTransformationType(selectedTypeIndex, 'workflowVersion', 'v1');
                      updateTransformationType(selectedTypeIndex, 'workflowV2Id', undefined);
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
                      updateTransformationType(selectedTypeIndex, 'workflowVersion', 'v2');
                      updateTransformationType(selectedTypeIndex, 'workflowId', undefined);
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
                  onValueChange={(value) => updateTransformationType(selectedTypeIndex, 'workflowV2Id', value === '__none__' ? undefined : value)}
                  options={[
                    { value: '__none__', label: 'No workflow assigned' },
                    ...workflowsV2
                      .filter(w => w.isActive && w.workflowType === 'transformation')
                      .map((workflow) => ({
                        value: workflow.id,
                        label: workflow.name
                      }))
                  ]}
                  placeholder="Select a v2 workflow..."
                  helpText="Graph-based workflow executed after transformation."
                />
              ) : (
                <Select
                  label="Assigned Workflow (Optional)"
                  value={selectedType.workflowId || '__none__'}
                  onValueChange={(value) => updateTransformationType(selectedTypeIndex, 'workflowId', value === '__none__' ? undefined : value)}
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
                    onChange={(e) => updateTransformationType(selectedTypeIndex, 'lockUploadMode', e.target.checked)}
                    className="w-4 h-4 text-orange-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-orange-500"
                  />
                  <label htmlFor={`lockUploadMode-${selectedTypeIndex}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Lock Mode
                  </label>
                </div>
              </div>
              <Select
                value={selectedType.defaultUploadMode || '__none__'}
                onValueChange={(value) => updateTransformationType(selectedTypeIndex, 'defaultUploadMode', value === '__none__' ? undefined : value)}
                options={[
                  { value: '__none__', label: 'No default (use user preference)' },
                  { value: 'manual', label: 'Manual Selection' },
                  { value: 'auto', label: 'AI Auto-Detect' }
                ]}
                searchable={false}
                helpText={`When set, the Transform page will automatically default to this upload mode when this transformation type is selected.${selectedType.lockUploadMode ? ' Lock Mode prevents users from changing the upload mode.' : ''}`}
              />
            </div>

            {/* PDF Grouping Configuration */}
            <div className="mb-4">
              <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                <FileText className="h-5 w-5 text-orange-600" />
                <span>PDF Document Grouping</span>
              </h5>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pages Per Group
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={selectedType.pagesPerGroup || 1}
                    onChange={(e) => updateTransformationType(selectedTypeIndex, 'pagesPerGroup', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors duration-200"
                    placeholder="1"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Maximum number of pages to group together (default: 1)
                  </p>
                </div>
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <input
                      type="checkbox"
                      id={`documentStartDetection-${selectedTypeIndex}`}
                      checked={selectedType.documentStartDetectionEnabled || false}
                      onChange={(e) => updateTransformationType(selectedTypeIndex, 'documentStartDetectionEnabled', e.target.checked)}
                      className="w-4 h-4 text-orange-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-orange-500"
                    />
                    <label htmlFor={`documentStartDetection-${selectedTypeIndex}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enable Smart Document Detection
                    </label>
                  </div>
                  {selectedType.documentStartDetectionEnabled && (
                    <input
                      type="text"
                      value={selectedType.documentStartPattern || ''}
                      onChange={(e) => updateTransformationType(selectedTypeIndex, 'documentStartPattern', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors duration-200"
                      placeholder="e.g., INVOICE / FACTURE"
                    />
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {selectedType.documentStartDetectionEnabled
                      ? 'Text pattern that indicates the start of a new document'
                      : 'Automatically detect document boundaries based on text patterns'
                    }
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                <h6 className="font-medium text-orange-800 dark:text-orange-300 mb-2">How Document Grouping Works</h6>
                <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1">
                  <li>• <strong>Fixed Grouping:</strong> Groups exactly {selectedType.pagesPerGroup || 1} page{(selectedType.pagesPerGroup || 1) !== 1 ? 's' : ''} together (e.g., 1-{selectedType.pagesPerGroup || 1}, {(selectedType.pagesPerGroup || 1) + 1}-{(selectedType.pagesPerGroup || 1) * 2})</li>
                  <li>• <strong>Smart Detection:</strong> Finds text pattern to identify document starts, then groups up to {selectedType.pagesPerGroup || 1} page{(selectedType.pagesPerGroup || 1) !== 1 ? 's' : ''} from each start</li>
                  <li>• <strong>Combined Mode:</strong> When both are enabled, pattern detection takes priority with pages-per-group as the maximum limit</li>
                  <li>• Each group becomes one logical document for processing and renaming</li>
                </ul>
              </div>
            </div>

            {/* Page Group Configuration */}
            <div className="mb-4">
              <PageGroupConfigEditor
                transformationTypeId={selectedType.id}
                pageGroupConfigs={selectedType.pageGroupConfigs || []}
                workflows={workflows}
                workflowsV2={workflowsV2}
                onChange={(configs) => updateTransformationType(selectedTypeIndex, 'pageGroupConfigs', configs)}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Instructions
              </label>
              <textarea
                value={selectedType.defaultInstructions}
                onChange={(e) => updateTransformationType(selectedTypeIndex, 'defaultInstructions', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-vertical transition-colors duration-200"
                rows={3}
                placeholder="Describe what data to extract from the PDF for renaming..."
              />
            </div>

            {/* Auto-Detection Instructions */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center space-x-2">
                  <Brain className="h-4 w-4 text-orange-600" />
                  <span>Auto-Detection Instructions</span>
                </div>
              </label>
              <textarea
                value={selectedType.autoDetectInstructions || ''}
                onChange={(e) => updateTransformationType(selectedTypeIndex, 'autoDetectInstructions', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-vertical transition-colors duration-200"
                rows={3}
                placeholder="Describe the characteristics that identify this document type for transformation (e.g., 'Invoice documents that need to be renamed with invoice number and customer name')"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                These instructions help the AI identify when to use this transformation type for renaming.
              </p>
            </div>

            {/* Field Mappings */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Field Mappings
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => generateFieldMappingsFromTemplate(selectedTypeIndex)}
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                  >
                    <FileText className="h-3 w-3" />
                    <span>Map Template</span>
                  </button>
                  <button
                    onClick={() => addFieldMapping(selectedTypeIndex)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Field</span>
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {(selectedType.fieldMappings || []).map((mapping, mappingIndex) => (
                  <div key={mappingIndex} className={`p-3 rounded-lg border-2 ${
                    mapping.type === 'hardcoded' 
                      ? 'bg-green-50 border-green-300' 
                      : mapping.type === 'mapped'
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-orange-50 border-orange-300'
                  }`}>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Field Name
                        </label>
                        <input
                          type="text"
                          value={mapping.fieldName}
                          onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'fieldName', e.target.value)}
                          className={`w-full px-2 py-1 border-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            mapping.type === 'hardcoded'
                              ? 'border-green-400 dark:border-green-500'
                              : mapping.type === 'mapped'
                              ? 'border-blue-400 dark:border-blue-500'
                              : 'border-orange-400 dark:border-orange-500'
                          }`}
                          placeholder="fieldName"
                        />
                      </div>
                      <div>
                        <Select
                          label="Type"
                          value={mapping.type}
                          onValueChange={(value) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'type', value as 'ai' | 'mapped' | 'hardcoded')}
                          options={[
                            { value: 'ai', label: 'AI' },
                            { value: 'mapped', label: 'Mapped' },
                            { value: 'hardcoded', label: 'Hardcoded' }
                          ]}
                          searchable={false}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          {mapping.type === 'hardcoded' ? 'Value' : mapping.type === 'mapped' ? 'PDF Coordinates' : 'Description'}
                        </label>
                        <input
                          type="text"
                          value={mapping.value}
                          onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'value', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                          placeholder={
                            mapping.type === 'hardcoded' ? 'Fixed value' : 
                            mapping.type === 'mapped' ? 'e.g., (100, 200, 150, 30)' : 
                            'What to extract'
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Page in Group
                        </label>
                        {(selectedType.pagesPerGroup || 1) > 1 ? (
                          <input
                            type="number"
                            min="1"
                            max={selectedType.pagesPerGroup || 1}
                            value={mapping.pageNumberInGroup || 1}
                            onChange={(e) => updateFieldMapping(selectedTypeIndex, mappingIndex, 'pageNumberInGroup', parseInt(e.target.value) || 1)}
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                            placeholder="1"
                          />
                        ) : (
                          <div className="w-full px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                            1 (single page)
                          </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Which page in the group (1-{selectedType.pagesPerGroup || 1})
                        </p>
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
                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                            placeholder="40"
                            min="1"
                          />
                        ) : (
                          <div className="w-full px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                            {(mapping.dataType === 'phone') ? 'Auto' : (mapping.dataType === 'boolean') ? 'True/False' : 'N/A'}
                          </div>
                        )}
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
          </div>
        )}

        {localTransformationTypes.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Transformation Types</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first transformation type to get started.</p>
            <button
              onClick={handleAddTypeClick}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add Transformation Type</span>
            </button>
          </div>
        )}
      </div>

      {/* Information Panel */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h4 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">How Transformation Types Work</h4>
        <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1">
          <li>• Transformation types extract specific data from PDFs to generate new filenames</li>
          <li>• Use field mappings to specify exactly what data to extract (AI, Mapped coordinates, or Hardcoded values)</li>
          <li>• Filename templates use placeholders like {`{{invoiceNumber}}`} that get replaced with extracted data</li>
          <li>• Workflows can be assigned to perform additional processing after transformation</li>
          <li>• Auto-detection instructions help AI choose the right transformation type automatically</li>
        </ul>
      </div>

      {showChangeLogs && (
        <ConfigChangeLogsModal
          configType="transformation"
          title="Transformation Type Change Logs"
          onClose={() => setShowChangeLogs(false)}
        />
      )}
    </div>
  );
}