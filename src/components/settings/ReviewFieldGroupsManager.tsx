import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, GripVertical, ArrowUp, ArrowDown, X, Check, Layers, List, Braces } from 'lucide-react';
import type { InboxReviewFieldGroup, InboxReviewField, InboxReviewFieldType } from '../../types';
import { reviewSetupService } from '../../services/reviewSetupService';
import CustomDropdown from '../common/CustomDropdown';

interface ReviewFieldGroupsManagerProps {
  templateId: string;
  sampleJson: string | null;
}

const FIELD_TYPES: { value: InboxReviewFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'timestamp', label: 'Timestamp' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'readonly', label: 'Read-only' },
];

export default function ReviewFieldGroupsManager({ templateId, sampleJson }: ReviewFieldGroupsManagerProps) {
  const [groups, setGroups] = useState<InboxReviewFieldGroup[]>([]);
  const [fields, setFields] = useState<InboxReviewField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<InboxReviewFieldGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ groupName: '', description: '', isArrayGroup: false, arrayJsonPath: '', isCollapsedByDefault: false });

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<InboxReviewField | null>(null);
  const [fieldTargetGroupId, setFieldTargetGroupId] = useState<string | null>(null);
  const [fieldForm, setFieldForm] = useState(getEmptyFieldForm());

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'group' | 'field'; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showJsonPathPicker, setShowJsonPathPicker] = useState(false);
  const [jsonPathSearch, setJsonPathSearch] = useState('');
  const jsonPathPickerRef = useRef<HTMLDivElement>(null);
  const jsonPathBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 320, maxHeight: 256 });

  const updatePickerPosition = useCallback(() => {
    if (!jsonPathBtnRef.current) return;
    const rect = jsonPathBtnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const goUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxH = Math.min(256, goUp ? spaceAbove : spaceBelow);
    setPickerPos({
      top: goUp ? rect.top - maxH - 4 : rect.bottom + 4,
      left: rect.right - 320,
      width: 320,
      maxHeight: maxH,
    });
  }, []);

  const parsedJsonPaths = React.useMemo(() => {
    if (!sampleJson) return [];
    try {
      const obj = JSON.parse(sampleJson);
      const paths: { path: string; type: string; preview: string }[] = [];
      function walk(current: any, prefix: string) {
        if (current === null || current === undefined) return;
        if (Array.isArray(current)) {
          paths.push({ path: prefix, type: 'array', preview: `[${current.length} items]` });
          if (current.length > 0 && typeof current[0] === 'object' && current[0] !== null) {
            walk(current[0], `${prefix}[0]`);
          }
        } else if (typeof current === 'object') {
          for (const key of Object.keys(current)) {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            const val = current[key];
            if (val === null || val === undefined) {
              paths.push({ path: fullPath, type: 'null', preview: 'null' });
            } else if (Array.isArray(val)) {
              walk(val, fullPath);
            } else if (typeof val === 'object') {
              walk(val, fullPath);
            } else {
              paths.push({ path: fullPath, type: typeof val, preview: String(val).slice(0, 40) });
            }
          }
        }
      }
      walk(obj, '');
      return paths;
    } catch {
      return [];
    }
  }, [sampleJson]);

  useEffect(() => {
    loadData();
  }, [templateId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (jsonPathPickerRef.current?.contains(target) || jsonPathBtnRef.current?.contains(target)) return;
      setShowJsonPathPicker(false);
    }
    if (showJsonPathPicker) {
      updatePickerPosition();
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePickerPosition, true);
      window.addEventListener('resize', updatePickerPosition);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', updatePickerPosition, true);
        window.removeEventListener('resize', updatePickerPosition);
      };
    }
  }, [showJsonPathPicker, updatePickerPosition]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const groupsData = await reviewSetupService.loadFieldGroups(templateId);
      setGroups(groupsData);
      if (groupsData.length > 0) {
        const fieldsData = await reviewSetupService.loadFields(groupsData.map(g => g.id));
        setFields(fieldsData);
      } else {
        setFields([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function getEmptyFieldForm() {
    return { fieldName: '', fieldLabel: '', jsonPath: '', fieldType: 'text' as InboxReviewFieldType, isRequired: false, isEditable: true, isVisible: true, placeholder: '', defaultValue: '', helpText: '', dropdownOptions: '', validationRegex: '', maxLength: '', timeFormat: '12h' as '12h' | '24h' };
  }

  function getFieldsForGroup(groupId: string) {
    return fields.filter(f => f.groupId === groupId).sort((a, b) => a.fieldOrder - b.fieldOrder);
  }

  // --- Group CRUD ---
  function openAddGroup() {
    setEditingGroup(null);
    setGroupForm({ groupName: '', description: '', isArrayGroup: false, arrayJsonPath: '', isCollapsedByDefault: false });
    setShowGroupModal(true);
  }

  function openEditGroup(group: InboxReviewFieldGroup) {
    setEditingGroup(group);
    setGroupForm({ groupName: group.groupName, description: group.description || '', isArrayGroup: group.isArrayGroup, arrayJsonPath: group.arrayJsonPath || '', isCollapsedByDefault: group.isCollapsedByDefault });
    setShowGroupModal(true);
  }

  async function handleSaveGroup() {
    if (!groupForm.groupName.trim()) return;
    try {
      setSaving(true);
      if (editingGroup) {
        await reviewSetupService.updateFieldGroup(editingGroup.id, {
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || null,
          isArrayGroup: groupForm.isArrayGroup,
          arrayJsonPath: groupForm.isArrayGroup ? groupForm.arrayJsonPath.trim() || null : null,
          isCollapsedByDefault: groupForm.isCollapsedByDefault
        });
        setGroups(prev => prev.map(g => g.id === editingGroup.id ? { ...g, groupName: groupForm.groupName.trim(), description: groupForm.description.trim() || null, isArrayGroup: groupForm.isArrayGroup, arrayJsonPath: groupForm.isArrayGroup ? groupForm.arrayJsonPath.trim() || null : null, isCollapsedByDefault: groupForm.isCollapsedByDefault } : g));
      } else {
        const newGroup = await reviewSetupService.createFieldGroup({
          templateId,
          groupName: groupForm.groupName.trim(),
          groupOrder: groups.length,
          description: groupForm.description.trim() || null,
          isArrayGroup: groupForm.isArrayGroup,
          arrayJsonPath: groupForm.isArrayGroup ? groupForm.arrayJsonPath.trim() || null : null,
          isCollapsedByDefault: groupForm.isCollapsedByDefault
        });
        setGroups(prev => [...prev, newGroup]);
      }
      setShowGroupModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    const idx = groups.findIndex(g => g.id === groupId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === groups.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...groups];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const reordered = updated.map((g, i) => ({ ...g, groupOrder: i }));
    setGroups(reordered);
    try {
      await Promise.all([
        reviewSetupService.updateFieldGroup(reordered[idx].id, { groupOrder: idx }),
        reviewSetupService.updateFieldGroup(reordered[swapIdx].id, { groupOrder: swapIdx })
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
      loadData();
    }
  }

  // --- Field CRUD ---
  function openAddField(groupId: string) {
    setEditingField(null);
    setFieldTargetGroupId(groupId);
    setFieldForm(getEmptyFieldForm());
    setShowFieldModal(true);
  }

  function openEditField(field: InboxReviewField) {
    setEditingField(field);
    setFieldTargetGroupId(field.groupId);
    setFieldForm({
      fieldName: field.fieldName,
      fieldLabel: field.fieldLabel,
      jsonPath: field.jsonPath,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      isEditable: field.isEditable,
      isVisible: field.isVisible,
      placeholder: field.placeholder || '',
      defaultValue: field.defaultValue || '',
      helpText: field.helpText || '',
      dropdownOptions: field.dropdownOptions ? field.dropdownOptions.join(', ') : '',
      validationRegex: field.validationRegex || '',
      maxLength: field.maxLength ? String(field.maxLength) : '',
      timeFormat: field.timeFormat || '12h'
    });
    setShowFieldModal(true);
  }

  async function handleSaveField() {
    if (!fieldForm.fieldName.trim() || !fieldForm.fieldLabel.trim() || !fieldForm.jsonPath.trim() || !fieldTargetGroupId) return;
    const dropdownArr = fieldForm.fieldType === 'dropdown' && fieldForm.dropdownOptions.trim()
      ? fieldForm.dropdownOptions.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    try {
      setSaving(true);
      if (editingField) {
        await reviewSetupService.updateField(editingField.id, {
          fieldName: fieldForm.fieldName.trim(),
          fieldLabel: fieldForm.fieldLabel.trim(),
          jsonPath: fieldForm.jsonPath.trim(),
          fieldType: fieldForm.fieldType,
          isRequired: fieldForm.isRequired,
          isEditable: fieldForm.isEditable,
          isVisible: fieldForm.isVisible,
          placeholder: fieldForm.placeholder.trim() || null,
          defaultValue: fieldForm.defaultValue.trim() || null,
          helpText: fieldForm.helpText.trim() || null,
          dropdownOptions: dropdownArr,
          validationRegex: fieldForm.validationRegex.trim() || null,
          maxLength: fieldForm.maxLength ? parseInt(fieldForm.maxLength) : null,
          timeFormat: fieldForm.timeFormat
        });
        setFields(prev => prev.map(f => f.id === editingField.id ? {
          ...f,
          fieldName: fieldForm.fieldName.trim(),
          fieldLabel: fieldForm.fieldLabel.trim(),
          jsonPath: fieldForm.jsonPath.trim(),
          fieldType: fieldForm.fieldType,
          isRequired: fieldForm.isRequired,
          isEditable: fieldForm.isEditable,
          isVisible: fieldForm.isVisible,
          placeholder: fieldForm.placeholder.trim() || null,
          defaultValue: fieldForm.defaultValue.trim() || null,
          helpText: fieldForm.helpText.trim() || null,
          dropdownOptions: dropdownArr,
          validationRegex: fieldForm.validationRegex.trim() || null,
          maxLength: fieldForm.maxLength ? parseInt(fieldForm.maxLength) : null,
          timeFormat: fieldForm.timeFormat
        } : f));
      } else {
        const groupFields = getFieldsForGroup(fieldTargetGroupId);
        const newField = await reviewSetupService.createField({
          groupId: fieldTargetGroupId,
          fieldName: fieldForm.fieldName.trim(),
          fieldLabel: fieldForm.fieldLabel.trim(),
          jsonPath: fieldForm.jsonPath.trim(),
          fieldType: fieldForm.fieldType,
          fieldOrder: groupFields.length,
          isRequired: fieldForm.isRequired,
          isEditable: fieldForm.isEditable,
          isVisible: fieldForm.isVisible,
          placeholder: fieldForm.placeholder.trim() || null,
          defaultValue: fieldForm.defaultValue.trim() || null,
          helpText: fieldForm.helpText.trim() || null,
          dropdownOptions: dropdownArr,
          validationRegex: fieldForm.validationRegex.trim() || null,
          maxLength: fieldForm.maxLength ? parseInt(fieldForm.maxLength) : null,
          timeFormat: fieldForm.timeFormat
        });
        setFields(prev => [...prev, newField]);
      }
      setShowFieldModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save field');
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveField(fieldId: string, groupId: string, direction: 'up' | 'down') {
    const groupFields = getFieldsForGroup(groupId);
    const idx = groupFields.findIndex(f => f.id === fieldId);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === groupFields.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...groupFields];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const reordered = updated.map((f, i) => ({ ...f, fieldOrder: i }));
    setFields(prev => prev.map(f => {
      const found = reordered.find(r => r.id === f.id);
      return found ? { ...f, fieldOrder: found.fieldOrder } : f;
    }));
    try {
      await Promise.all([
        reviewSetupService.updateField(reordered[idx].id, { fieldOrder: idx }),
        reviewSetupService.updateField(reordered[swapIdx].id, { fieldOrder: swapIdx })
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
      loadData();
    }
  }

  // --- Delete ---
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      if (deleteTarget.type === 'group') {
        await reviewSetupService.deleteFieldGroup(deleteTarget.id);
        setGroups(prev => prev.filter(g => g.id !== deleteTarget.id));
        setFields(prev => prev.filter(f => f.groupId !== deleteTarget.id));
      } else {
        await reviewSetupService.deleteField(deleteTarget.id);
        setFields(prev => prev.filter(f => f.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Field Groups</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">({groups.length})</span>
        </div>
        <button
          onClick={openAddGroup}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-sm text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Group</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-2.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-xs">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 font-bold">x</button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <Layers className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No field groups yet. Add a group to start configuring fields.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group, gIdx) => {
            const groupFields = getFieldsForGroup(group.id);
            const isExpanded = expandedGroupId === group.id;
            return (
              <div key={group.id} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                {/* Group Header */}
                <div className="flex items-center bg-gray-50 dark:bg-gray-700/60 px-3 py-2.5">
                  <button onClick={() => setExpandedGroupId(isExpanded ? null : group.id)} className="mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <GripVertical className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 mr-2" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{group.groupName}</span>
                    {group.isArrayGroup && (
                      <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">Array</span>
                    )}
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{groupFields.length} field{groupFields.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button onClick={() => handleMoveGroup(group.id, 'up')} disabled={gIdx === 0} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleMoveGroup(group.id, 'down')} disabled={gIdx === groups.length - 1} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => openEditGroup(group)} className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget({ type: 'group', id: group.id, name: group.groupName })} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Fields */}
                {isExpanded && (
                  <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-600 space-y-2">
                    {groupFields.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">No fields in this group yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {groupFields.map((field, fIdx) => (
                          <div key={field.id} className="flex items-center px-2.5 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-md group hover:border-purple-200 dark:hover:border-purple-700 transition-colors">
                            <List className="h-3 w-3 text-gray-300 dark:text-gray-600 mr-2 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate">{field.fieldLabel}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{field.fieldType}</span>
                                {field.isRequired && <span className="text-xs text-red-500">*</span>}
                                {!field.isEditable && <span className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-1 py-0.5 rounded">locked</span>}
                              </div>
                              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{field.jsonPath}</p>
                            </div>
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleMoveField(field.id, group.id, 'up')} disabled={fIdx === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button onClick={() => handleMoveField(field.id, group.id, 'down')} disabled={fIdx === groupFields.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button onClick={() => openEditField(field)} className="p-1 text-gray-400 hover:text-blue-600">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => setDeleteTarget({ type: 'field', id: field.id, name: field.fieldLabel })} className="p-1 text-gray-400 hover:text-red-600">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => openAddField(group.id)}
                      className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors w-full justify-center border border-dashed border-purple-200 dark:border-purple-700"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Field</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editingGroup ? 'Edit Group' : 'Add Group'}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group Name *</label>
              <input type="text" value={groupForm.groupName} onChange={e => setGroupForm(prev => ({ ...prev, groupName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="e.g. Shipment Details" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input type="text" value={groupForm.description} onChange={e => setGroupForm(prev => ({ ...prev, description: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Optional description" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Array Group</span>
              <button onClick={() => setGroupForm(prev => ({ ...prev, isArrayGroup: !prev.isArrayGroup }))} className="text-gray-500">
                {groupForm.isArrayGroup ? <Check className="h-5 w-5 text-purple-600" /> : <X className="h-5 w-5 text-gray-300" />}
              </button>
            </div>
            {groupForm.isArrayGroup && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Array JSON Path</label>
                <input type="text" value={groupForm.arrayJsonPath} onChange={e => setGroupForm(prev => ({ ...prev, arrayJsonPath: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="e.g. items" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Collapsed by Default</span>
              <button onClick={() => setGroupForm(prev => ({ ...prev, isCollapsedByDefault: !prev.isCollapsedByDefault }))} className="text-gray-500">
                {groupForm.isCollapsedByDefault ? <Check className="h-5 w-5 text-purple-600" /> : <X className="h-5 w-5 text-gray-300" />}
              </button>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">Cancel</button>
              <button onClick={handleSaveGroup} disabled={!groupForm.groupName.trim() || saving} className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50">{saving ? 'Saving...' : editingGroup ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Field Modal */}
      {showFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-4xl w-full mx-4 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editingField ? 'Edit Field' : 'Add Field'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Field Name *</label>
                <input type="text" value={fieldForm.fieldName} onChange={e => setFieldForm(prev => ({ ...prev, fieldName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="shipperName" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Field Label *</label>
                <input type="text" value={fieldForm.fieldLabel} onChange={e => setFieldForm(prev => ({ ...prev, fieldLabel: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Shipper Name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">JSON Path *</label>
                <div className="relative flex gap-1">
                  <input type="text" value={fieldForm.jsonPath} onChange={e => setFieldForm(prev => ({ ...prev, jsonPath: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" placeholder="shipper.name" />
                  <button
                    ref={jsonPathBtnRef}
                    type="button"
                    onClick={() => { setJsonPathSearch(''); setShowJsonPathPicker(!showJsonPathPicker); }}
                    disabled={parsedJsonPaths.length === 0}
                    className="px-2.5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={parsedJsonPaths.length === 0 ? 'Import a sample JSON first to use the path picker' : 'Pick JSON path from sample'}
                  >
                    <Braces className="h-4 w-4" />
                  </button>
                  {showJsonPathPicker && parsedJsonPaths.length > 0 && createPortal(
                    <div ref={jsonPathPickerRef} style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, width: pickerPos.width, maxHeight: pickerPos.maxHeight, zIndex: 9999 }} className="overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
                      <div className="sticky top-0 bg-white dark:bg-gray-800 p-2 border-b border-gray-100 dark:border-gray-700">
                        <input
                          type="text"
                          value={jsonPathSearch}
                          onChange={(e) => setJsonPathSearch(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs focus:ring-1 focus:ring-teal-500 focus:border-transparent"
                          placeholder="Search paths..."
                          autoFocus
                        />
                      </div>
                      {parsedJsonPaths
                        .filter(p => !jsonPathSearch || p.path.toLowerCase().includes(jsonPathSearch.toLowerCase()))
                        .map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => {
                            setFieldForm(prev => ({ ...prev, jsonPath: item.path }));
                            setShowJsonPathPicker(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-900/20 border-b border-gray-50 dark:border-gray-700/50 last:border-0 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{item.path}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{item.type}</span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{item.preview}</p>
                        </button>
                      ))}
                      {parsedJsonPaths.filter(p => !jsonPathSearch || p.path.toLowerCase().includes(jsonPathSearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">No matching paths</p>
                      )}
                    </div>,
                    document.body
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Field Type</label>
                <CustomDropdown
                  value={fieldForm.fieldType}
                  onChange={(val) => setFieldForm(prev => ({ ...prev, fieldType: val as InboxReviewFieldType }))}
                  options={FIELD_TYPES.map(ft => ({ value: ft.value, label: ft.label }))}
                  size="sm"
                />
              </div>
            </div>
            {fieldForm.fieldType === 'timestamp' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Time Format</label>
                <CustomDropdown
                  value={fieldForm.timeFormat}
                  onChange={(val) => setFieldForm(prev => ({ ...prev, timeFormat: val as '12h' | '24h' }))}
                  options={[
                    { value: '12h', label: '12-hour (AM/PM)' },
                    { value: '24h', label: '24-hour' },
                  ]}
                  size="sm"
                />
              </div>
            )}
            {fieldForm.fieldType === 'dropdown' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Dropdown Options (comma-separated)</label>
                <input type="text" value={fieldForm.dropdownOptions} onChange={e => setFieldForm(prev => ({ ...prev, dropdownOptions: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Option A, Option B, Option C" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Placeholder</label>
                <input type="text" value={fieldForm.placeholder} onChange={e => setFieldForm(prev => ({ ...prev, placeholder: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Default Value</label>
                <input type="text" value={fieldForm.defaultValue} onChange={e => setFieldForm(prev => ({ ...prev, defaultValue: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="Pre-filled when adding a new row" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Help Text</label>
                <input type="text" value={fieldForm.helpText} onChange={e => setFieldForm(prev => ({ ...prev, helpText: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Validation Regex</label>
                <input type="text" value={fieldForm.validationRegex} onChange={e => setFieldForm(prev => ({ ...prev, validationRegex: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="^[A-Z]+$" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Max Length</label>
                <input type="number" value={fieldForm.maxLength} onChange={e => setFieldForm(prev => ({ ...prev, maxLength: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
            </div>
            <div className="flex items-center space-x-6 pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={fieldForm.isRequired} onChange={e => setFieldForm(prev => ({ ...prev, isRequired: e.target.checked }))} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={fieldForm.isEditable} onChange={e => setFieldForm(prev => ({ ...prev, isEditable: e.target.checked }))} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Editable</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={fieldForm.isVisible} onChange={e => setFieldForm(prev => ({ ...prev, isVisible: e.target.checked }))} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Visible</span>
              </label>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button onClick={() => setShowFieldModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">Cancel</button>
              <button onClick={handleSaveField} disabled={!fieldForm.fieldName.trim() || !fieldForm.fieldLabel.trim() || !fieldForm.jsonPath.trim() || saving} className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50">{saving ? 'Saving...' : editingField ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete {deleteTarget.type === 'group' ? 'Group' : 'Field'}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {deleteTarget.type === 'group'
                ? `This will delete the group "${deleteTarget.name}" and all its fields. This cannot be undone.`
                : `This will delete the field "${deleteTarget.name}". This cannot be undone.`}
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">Cancel</button>
              <button onClick={handleConfirmDelete} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">{saving ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
