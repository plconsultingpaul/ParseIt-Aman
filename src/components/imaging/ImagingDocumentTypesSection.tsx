import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil as Edit2, Trash2, Loader2, FileType, ToggleLeft, ToggleRight, Check, X, AlertCircle, Tag, Asterisk, Eye, EyeOff } from 'lucide-react';
import type { ImagingDocumentType, ImagingDuplicateEmailAction, ImagingDuplicateManualAction, ImagingMetadataField, ImagingDocumentTypeMetadataField } from '../../types';
import {
  fetchDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  fetchMetadataFields,
  fetchDocTypeMetadataFields,
  saveDocTypeMetadataFields,
} from '../../services/imagingService';
import CustomDropdown from '../common/CustomDropdown';

interface ImagingDocumentTypesSectionProps {
  isAdmin: boolean;
}

export default function ImagingDocumentTypesSection({ isAdmin }: ImagingDocumentTypesSectionProps) {
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newDocTypeName, setNewDocTypeName] = useState('');
  const [newDocTypeDesc, setNewDocTypeDesc] = useState('');
  const [creatingDocType, setCreatingDocType] = useState(false);

  const [editingDocTypeId, setEditingDocTypeId] = useState<string | null>(null);
  const [editDocTypeName, setEditDocTypeName] = useState('');
  const [editDocTypeDesc, setEditDocTypeDesc] = useState('');
  const [deleteDocTypeConfirmId, setDeleteDocTypeConfirmId] = useState<string | null>(null);

  const [selectedDocTypeId, setSelectedDocTypeId] = useState<string | null>(null);
  const [allMetaFields, setAllMetaFields] = useState<ImagingMetadataField[]>([]);
  const [assignments, setAssignments] = useState<ImagingDocumentTypeMetadataField[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);
  const [assignmentsDirty, setAssignmentsDirty] = useState(false);

  const [dupAllow, setDupAllow] = useState(true);
  const [dupManual, setDupManual] = useState<ImagingDuplicateManualAction>('prompt');
  const [dupEmail, setDupEmail] = useState<ImagingDuplicateEmailAction>('keep_existing');
  const [dupDirty, setDupDirty] = useState(false);
  const [dupSaving, setDupSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [d, mf] = await Promise.all([fetchDocumentTypes(), fetchMetadataFields()]);
      setDocTypes(d);
      setAllMetaFields(mf);
      if (d.length > 0 && !selectedDocTypeId) {
        setSelectedDocTypeId(d[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load document types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadAssignments = useCallback(async () => {
    if (!selectedDocTypeId) return;
    setAssignmentsLoading(true);
    setAssignmentsDirty(false);
    try {
      const a = await fetchDocTypeMetadataFields(selectedDocTypeId);
      setAssignments(a);
    } catch (err: any) {
      setError(err.message || 'Failed to load field assignments');
    } finally {
      setAssignmentsLoading(false);
    }
  }, [selectedDocTypeId]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  useEffect(() => {
    const dt = docTypes.find(d => d.id === selectedDocTypeId);
    if (!dt) return;
    setDupAllow(dt.allowDuplicates);
    setDupManual(dt.duplicateManualAction);
    setDupEmail(dt.duplicateEmailAction);
    setDupDirty(false);
  }, [selectedDocTypeId, docTypes]);

  const handleSaveDuplicateSettings = async () => {
    if (!selectedDocTypeId) return;
    setDupSaving(true);
    setError('');
    try {
      await updateDocumentType(selectedDocTypeId, {
        allowDuplicates: dupAllow,
        duplicateManualAction: dupManual,
        duplicateEmailAction: dupEmail,
      });
      setDocTypes(prev => prev.map(d => d.id === selectedDocTypeId ? {
        ...d,
        allowDuplicates: dupAllow,
        duplicateManualAction: dupManual,
        duplicateEmailAction: dupEmail,
      } : d));
      setDupDirty(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save duplicate settings');
    } finally {
      setDupSaving(false);
    }
  };

  const handleCreateDocType = async () => {
    if (!newDocTypeName.trim()) return;
    setCreatingDocType(true);
    setError('');
    try {
      const dt = await createDocumentType(newDocTypeName.trim(), newDocTypeDesc.trim());
      const updated = [...docTypes, dt].sort((a, b) => a.name.localeCompare(b.name));
      setDocTypes(updated);
      setNewDocTypeName('');
      setNewDocTypeDesc('');
      setSelectedDocTypeId(dt.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create document type');
    } finally {
      setCreatingDocType(false);
    }
  };

  const handleSaveDocType = async (id: string) => {
    if (!editDocTypeName.trim()) return;
    setError('');
    try {
      await updateDocumentType(id, { name: editDocTypeName.trim(), description: editDocTypeDesc.trim() });
      setDocTypes(prev => prev.map(d => d.id === id ? { ...d, name: editDocTypeName.trim(), description: editDocTypeDesc.trim() } : d));
      setEditingDocTypeId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update document type');
    }
  };

  const handleToggleDocType = async (id: string, currentActive: boolean) => {
    try {
      await updateDocumentType(id, { isActive: !currentActive });
      setDocTypes(prev => prev.map(d => d.id === id ? { ...d, isActive: !currentActive } : d));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle document type');
    }
  };

  const handleDeleteDocType = async (id: string) => {
    setError('');
    try {
      await deleteDocumentType(id);
      const updated = docTypes.filter(d => d.id !== id);
      setDocTypes(updated);
      setDeleteDocTypeConfirmId(null);
      if (selectedDocTypeId === id) {
        setSelectedDocTypeId(updated.length > 0 ? updated[0].id : null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete document type. It may have documents linked to it.');
    }
  };

  const isFieldAssigned = (fieldId: string) => assignments.some(a => a.metadataFieldId === fieldId);
  const isFieldRequired = (fieldId: string) => assignments.find(a => a.metadataFieldId === fieldId)?.isRequired || false;
  const isFieldHidden = (fieldId: string) => assignments.find(a => a.metadataFieldId === fieldId)?.isHiddenFromIndexing || false;

  const handleToggleField = (fieldId: string) => {
    if (isFieldAssigned(fieldId)) {
      setAssignments(prev => prev.filter(a => a.metadataFieldId !== fieldId));
    } else {
      setAssignments(prev => [...prev, {
        id: '',
        documentTypeId: selectedDocTypeId!,
        metadataFieldId: fieldId,
        isRequired: false,
        isHiddenFromIndexing: false,
        sortOrder: prev.length,
        createdAt: '',
      }]);
    }
    setAssignmentsDirty(true);
  };

  const handleToggleRequired = (fieldId: string) => {
    setAssignments(prev => prev.map(a =>
      a.metadataFieldId === fieldId
        ? { ...a, isRequired: !a.isRequired, isHiddenFromIndexing: !a.isRequired ? false : a.isHiddenFromIndexing }
        : a
    ));
    setAssignmentsDirty(true);
  };

  const handleToggleHidden = (fieldId: string) => {
    setAssignments(prev => prev.map(a =>
      a.metadataFieldId === fieldId
        ? { ...a, isHiddenFromIndexing: !a.isHiddenFromIndexing, isRequired: !a.isHiddenFromIndexing ? false : a.isRequired }
        : a
    ));
    setAssignmentsDirty(true);
  };

  const handleSaveAssignments = async () => {
    if (!selectedDocTypeId) return;
    setAssignmentsSaving(true);
    setError('');
    try {
      const payload = assignments.map((a, idx) => ({
        metadataFieldId: a.metadataFieldId,
        isRequired: a.isRequired,
        isHiddenFromIndexing: a.isHiddenFromIndexing,
        sortOrder: idx,
      }));
      await saveDocTypeMetadataFields(selectedDocTypeId, payload);
      setAssignmentsDirty(false);
      await loadAssignments();
    } catch (err: any) {
      setError(err.message || 'Failed to save field assignments');
    } finally {
      setAssignmentsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const selectedDocType = docTypes.find(d => d.id === selectedDocTypeId);
  const activeMetaFields = allMetaFields.filter(f => f.isActive);
  const fieldTypeLabels: Record<string, string> = { text: 'Text', number: 'Number', date: 'Date', boolean: 'Yes/No', dropdown: 'Dropdown' };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <FileType className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Document Types</h3>
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
          {docTypes.length}
        </span>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 min-h-[300px]">
        {/* Left panel - Document Types list */}
        <div className="lg:w-56 flex-shrink-0 space-y-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-2">
            Document Types
          </h4>

          {isAdmin && (
            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input
                type="text"
                value={newDocTypeName}
                onChange={(e) => setNewDocTypeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDocType()}
                placeholder="Type name..."
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                value={newDocTypeDesc}
                onChange={(e) => setNewDocTypeDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDocType()}
                placeholder="Description (optional)"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleCreateDocType}
                disabled={!newDocTypeName.trim() || creatingDocType}
                className="flex items-center space-x-1 w-full justify-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {creatingDocType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>Add Type</span>
              </button>
            </div>
          )}

          {docTypes.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-2">No document types found.</p>
          ) : (
            docTypes.map(dt => (
              <button
                key={dt.id}
                onClick={() => {
                  setSelectedDocTypeId(dt.id);
                  setEditingDocTypeId(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  selectedDocTypeId === dt.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="truncate block">{dt.name}</span>
                {!dt.isActive && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Inactive</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

        {/* Right panel - Selected doc type details + meta field assignments */}
        <div className="flex-1 min-w-0">
          {!selectedDocType ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              Select a document type to manage its details and metadata fields.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Doc type header with inline edit */}
              <div className="flex items-start justify-between">
                {editingDocTypeId === selectedDocType.id ? (
                  <div className="flex-1 space-y-2 mr-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editDocTypeName}
                        onChange={(e) => setEditDocTypeName(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editDocTypeDesc}
                        onChange={(e) => setEditDocTypeDesc(e.target.value)}
                        placeholder="Description"
                        className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button onClick={() => handleSaveDocType(selectedDocType.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingDocTypeId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {selectedDocType.name}
                      </h4>
                      {!selectedDocType.isActive && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded">Inactive</span>
                      )}
                    </div>
                    {selectedDocType.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{selectedDocType.description}</p>
                    )}
                  </div>
                )}

                {editingDocTypeId !== selectedDocType.id && isAdmin && (
                  <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleToggleDocType(selectedDocType.id, selectedDocType.isActive)}
                      className="p-1.5 rounded transition-colors"
                      title={selectedDocType.isActive ? 'Active' : 'Inactive'}
                    >
                      {selectedDocType.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDocTypeId(selectedDocType.id);
                        setEditDocTypeName(selectedDocType.name);
                        setEditDocTypeDesc(selectedDocType.description);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {deleteDocTypeConfirmId === selectedDocType.id ? (
                      <div className="flex items-center space-x-1">
                        <button onClick={() => handleDeleteDocType(selectedDocType.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                        <button onClick={() => setDeleteDocTypeConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteDocTypeConfirmId(selectedDocType.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Duplicate Handling */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <FileType className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Duplicate Handling</h5>
                  </div>
                  {isAdmin && dupDirty && (
                    <button
                      onClick={handleSaveDuplicateSettings}
                      disabled={dupSaving}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {dupSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      <span>Save Changes</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                    <div className="min-w-0 pr-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Allow duplicate bill numbers</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        When off, duplicates within the same bucket + document type are blocked or replaced based on the actions below.
                      </p>
                    </div>
                    <button
                      onClick={() => { if (!isAdmin) return; setDupAllow(v => !v); setDupDirty(true); }}
                      disabled={!isAdmin}
                      className="p-1 rounded transition-colors disabled:cursor-not-allowed"
                      title={dupAllow ? 'Duplicates allowed' : 'Duplicates not allowed'}
                    >
                      {dupAllow
                        ? <ToggleRight className="h-6 w-6 text-green-500" />
                        : <ToggleLeft className="h-6 w-6 text-gray-400" />}
                    </button>
                  </div>

                  {!dupAllow && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Manual indexing action
                        </label>
                        <CustomDropdown
                          value={dupManual}
                          onChange={(v) => { setDupManual(v as ImagingDuplicateManualAction); setDupDirty(true); }}
                          options={[
                            { value: 'keep_existing', label: 'Keep Existing (discard new)' },
                            { value: 'use_new', label: 'Use New (replace existing)' },
                            { value: 'prompt', label: 'Prompt User' },
                          ]}
                          disabled={!isAdmin}
                          size="sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Email / automated action
                        </label>
                        <CustomDropdown
                          value={dupEmail}
                          onChange={(v) => { setDupEmail(v as ImagingDuplicateEmailAction); setDupDirty(true); }}
                          options={[
                            { value: 'keep_existing', label: 'Keep Existing (discard new)' },
                            { value: 'use_new', label: 'Use New (replace existing)' },
                          ]}
                          disabled={!isAdmin}
                          size="sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta Fields Assignment */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Tag className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assigned Meta Fields</h5>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                      {assignments.length}
                    </span>
                  </div>
                  {isAdmin && assignmentsDirty && (
                    <button
                      onClick={handleSaveAssignments}
                      disabled={assignmentsSaving}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {assignmentsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      <span>Save Changes</span>
                    </button>
                  )}
                </div>

                {assignmentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : activeMetaFields.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
                    No metadata fields have been created yet. Add fields in the Meta Fields section first.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeMetaFields.map(field => {
                      const assigned = isFieldAssigned(field.id);
                      const required = isFieldRequired(field.id);
                      return (
                        <div
                          key={field.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                            assigned
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            {isAdmin ? (
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={assigned}
                                  onChange={() => handleToggleField(field.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </label>
                            ) : (
                              <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                                assigned ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                              }`}>
                                {assigned && <Check className="h-3 w-3 text-white" />}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field.displayLabel}</span>
                                <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{field.fieldName}</span>
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                                  {fieldTypeLabels[field.fieldType] || field.fieldType}
                                </span>
                              </div>
                            </div>
                          </div>

                          {assigned && (
                            <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
                              {isAdmin ? (
                                <>
                                  <button
                                    onClick={() => handleToggleRequired(field.id)}
                                    disabled={isFieldHidden(field.id)}
                                    className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                      required
                                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${isFieldHidden(field.id) ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    title={isFieldHidden(field.id) ? 'Hidden fields cannot be required' : required ? 'Required - click to make optional' : 'Optional - click to make required'}
                                  >
                                    <Asterisk className="h-3 w-3" />
                                    <span>{required ? 'Required' : 'Optional'}</span>
                                  </button>
                                  <button
                                    onClick={() => handleToggleHidden(field.id)}
                                    className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                      isFieldHidden(field.id)
                                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                    title={isFieldHidden(field.id) ? 'Hidden from indexing UI - click to show' : 'Visible on indexing UI - click to hide (workflows can still populate it)'}
                                  >
                                    {isFieldHidden(field.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    <span>{isFieldHidden(field.id) ? 'Hidden' : 'Visible'}</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  {required && (
                                    <span className="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                      <Asterisk className="h-3 w-3" />
                                      <span>Required</span>
                                    </span>
                                  )}
                                  {isFieldHidden(field.id) && (
                                    <span className="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                      <EyeOff className="h-3 w-3" />
                                      <span>Hidden</span>
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
