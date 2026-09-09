import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil as Edit2, Trash2, Loader2, Tags, ToggleLeft, ToggleRight, Check, X, AlertCircle, Pin, PinOff, GripVertical } from 'lucide-react';
import type { ImagingMetadataField, ImagingMetadataFieldType } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import {
  fetchMetadataFields,
  createMetadataField,
  updateMetadataField,
  deleteMetadataField,
} from '../../services/imagingService';

interface ImagingMetadataFieldsSectionProps {
  isAdmin: boolean;
}

const FIELD_TYPE_LABELS: Record<ImagingMetadataFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes/No',
  dropdown: 'Dropdown',
};

export default function ImagingMetadataFieldsSection({ isAdmin }: ImagingMetadataFieldsSectionProps) {
  const [fields, setFields] = useState<ImagingMetadataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newFieldName, setNewFieldName] = useState('');
  const [newDisplayLabel, setNewDisplayLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<ImagingMetadataFieldType>('text');
  const [newDropdownOptions, setNewDropdownOptions] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editDisplayLabel, setEditDisplayLabel] = useState('');
  const [editFieldType, setEditFieldType] = useState<ImagingMetadataFieldType>('text');
  const [editDropdownOptions, setEditDropdownOptions] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadFields = useCallback(async () => {
    try {
      const data = await fetchMetadataFields();
      setFields(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load metadata fields');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFields(); }, [loadFields]);

  const handleCreate = async () => {
    if (!newFieldName.trim() || !newDisplayLabel.trim()) return;
    setCreating(true);
    setError('');
    try {
      const opts = newFieldType === 'dropdown' && newDropdownOptions.trim()
        ? newDropdownOptions.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const field = await createMetadataField({
        fieldName: newFieldName.trim(),
        displayLabel: newDisplayLabel.trim(),
        fieldType: newFieldType,
        dropdownOptions: opts,
        sortOrder: fields.length,
      });
      setFields(prev => [...prev, field]);
      setNewFieldName('');
      setNewDisplayLabel('');
      setNewFieldType('text');
      setNewDropdownOptions('');
    } catch (err: any) {
      setError(err.message || 'Failed to create field');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (id: string) => {
    if (!editFieldName.trim() || !editDisplayLabel.trim()) return;
    setError('');
    try {
      const opts = editFieldType === 'dropdown' && editDropdownOptions.trim()
        ? editDropdownOptions.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      await updateMetadataField(id, {
        fieldName: editFieldName.trim(),
        displayLabel: editDisplayLabel.trim(),
        fieldType: editFieldType,
        dropdownOptions: opts,
      });
      setFields(prev => prev.map(f => f.id === id ? {
        ...f,
        fieldName: editFieldName.trim(),
        displayLabel: editDisplayLabel.trim(),
        fieldType: editFieldType as ImagingMetadataFieldType,
        dropdownOptions: opts,
      } : f));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update field');
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      await updateMetadataField(id, { isActive: !currentActive });
      setFields(prev => prev.map(f => f.id === id ? { ...f, isActive: !currentActive } : f));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle field');
    }
  };

  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    try {
      await updateMetadataField(id, { isPinnedToHeader: !currentPinned });
      setFields(prev => prev.map(f => f.id === id ? { ...f, isPinnedToHeader: !currentPinned } : f));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle pin');
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await deleteMetadataField(id);
      setFields(prev => prev.filter(f => f.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete field. It may have values linked to it.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center space-x-2 mb-4">
        <Tags className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Metadata Fields</h3>
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
          {fields.length}
        </span>
      </div>

      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-400 space-y-1">
        <p><strong>Custom Metadata:</strong> Define fields to track additional information on each document (e.g., DriverID, CarrierID, TripNumber).</p>
        <p>Fields marked with the <strong>pin icon</strong> will appear directly in the Documents search header for quick filtering.</p>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value.replace(/\s/g, ''))}
              placeholder="Field name (e.g. DriverID)"
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            />
            <input
              type="text"
              value={newDisplayLabel}
              onChange={(e) => setNewDisplayLabel(e.target.value)}
              placeholder="Display label (e.g. Driver ID)"
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <CustomDropdown
              value={newFieldType}
              onChange={(val) => setNewFieldType(val as ImagingMetadataFieldType)}
              options={Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => ({ value: key, label }))}
            />
          </div>
          {newFieldType === 'dropdown' && (
            <input
              type="text"
              value={newDropdownOptions}
              onChange={(e) => setNewDropdownOptions(e.target.value)}
              placeholder="Dropdown options (comma separated, e.g. Option1, Option2, Option3)"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}
          <button
            onClick={handleCreate}
            disabled={!newFieldName.trim() || !newDisplayLabel.trim() || creating}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Add Field</span>
          </button>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          No metadata fields configured yet. Add fields to track custom properties on documents.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map(field => (
            <div
              key={field.id}
              className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 group"
            >
              {editingId === field.id ? (
                <div className="flex-1 space-y-2 mr-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editFieldName}
                      onChange={(e) => setEditFieldName(e.target.value.replace(/\s/g, ''))}
                      className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono"
                      autoFocus
                      placeholder="Field name"
                    />
                    <input
                      type="text"
                      value={editDisplayLabel}
                      onChange={(e) => setEditDisplayLabel(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      placeholder="Display label"
                    />
                    <CustomDropdown
                      value={editFieldType}
                      onChange={(val) => setEditFieldType(val as ImagingMetadataFieldType)}
                      options={Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => ({ value: key, label }))}
                    />
                  </div>
                  {editFieldType === 'dropdown' && (
                    <input
                      type="text"
                      value={editDropdownOptions}
                      onChange={(e) => setEditDropdownOptions(e.target.value)}
                      placeholder="Dropdown options (comma separated)"
                      className="w-full px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  <div className="flex space-x-2">
                    <button onClick={() => handleSave(field.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{field.displayLabel}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                      {field.fieldName}
                    </span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      field.fieldType === 'text' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' :
                      field.fieldType === 'number' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                      field.fieldType === 'date' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                      field.fieldType === 'boolean' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' :
                      'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                    }`}>
                      {FIELD_TYPE_LABELS[field.fieldType]}
                    </span>
                    {field.isPinnedToHeader && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded flex items-center space-x-0.5">
                        <Pin className="h-2.5 w-2.5" />
                        <span>Header</span>
                      </span>
                    )}
                    {!field.isActive && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded">Inactive</span>
                    )}
                  </div>
                  {field.fieldType === 'dropdown' && field.dropdownOptions.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Options: {field.dropdownOptions.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {editingId !== field.id && isAdmin && (
                <div className="flex items-center space-x-1 ml-3">
                  <button
                    onClick={() => handleTogglePin(field.id, field.isPinnedToHeader)}
                    className={`p-1.5 rounded transition-colors ${
                      field.isPinnedToHeader
                        ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                        : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 opacity-0 group-hover:opacity-100'
                    }`}
                    title={field.isPinnedToHeader ? 'Unpin from header' : 'Pin to header'}
                  >
                    {field.isPinnedToHeader ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleToggle(field.id, field.isActive)}
                    className="p-1.5 rounded transition-colors"
                    title={field.isActive ? 'Active' : 'Inactive'}
                  >
                    {field.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(field.id);
                      setEditFieldName(field.fieldName);
                      setEditDisplayLabel(field.displayLabel);
                      setEditFieldType(field.fieldType);
                      setEditDropdownOptions(field.dropdownOptions.join(', '));
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  {deleteConfirmId === field.id ? (
                    <div className="flex items-center space-x-1">
                      <button onClick={() => handleDelete(field.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(field.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
