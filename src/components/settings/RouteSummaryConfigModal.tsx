import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, GripVertical, Save, Loader2, Eye, Route, Link } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RouteSummaryGroup, RouteSummaryField } from '../../types';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';

interface ApiSpecEndpoint {
  id: string;
  path: string;
  method: string;
  api_spec_id: string;
  apiSpecName?: string;
}

interface AuthConfig {
  id: string;
  name: string;
}

interface SortableFieldItemProps {
  field: RouteSummaryField;
  onUpdate: (field: RouteSummaryField) => void;
  onDelete: (id: string) => void;
}

const DISPLAY_FORMAT_OPTIONS = [
  { value: '__none__', label: 'None' },
  { value: 'date', label: 'Date (Jul 8, 2020)' },
  { value: 'datetime', label: 'DateTime (2020-07-08 12:00 AM)' },
  { value: 'date_short', label: 'Date Short (07/08/2020)' },
  { value: 'time', label: 'Time (12:00 AM)' },
];

function SortableFieldItem({ field, onUpdate, onDelete }: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id || '' });
  const [localLabel, setLocalLabel] = useState(field.label);
  const [localApiField, setLocalApiField] = useState(field.apiField);

  useEffect(() => {
    setLocalLabel(field.label);
    setLocalApiField(field.apiField);
  }, [field.id]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleLabelBlur = () => {
    if (localLabel !== field.label) {
      onUpdate({ ...field, label: localLabel });
    }
  };

  const handleApiFieldBlur = () => {
    if (localApiField !== field.apiField) {
      onUpdate({ ...field, apiField: localApiField });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none text-gray-400"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <input
        type="text"
        value={localLabel}
        onChange={(e) => setLocalLabel(e.target.value)}
        onBlur={handleLabelBlur}
        placeholder="Label"
        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      />
      <input
        type="text"
        value={localApiField}
        onChange={(e) => setLocalApiField(e.target.value)}
        onBlur={handleApiFieldBlur}
        placeholder="API Field"
        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      />
      <div className="w-40">
        <Select
          value={field.displayFormat || '__none__'}
          onValueChange={(val) => onUpdate({ ...field, displayFormat: val === '__none__' ? undefined : val })}
          options={DISPLAY_FORMAT_OPTIONS}
          placeholder="Format"
        />
      </div>
      <select
        value={field.gridColumn || 1}
        onChange={(e) => onUpdate({ ...field, gridColumn: Number(e.target.value) })}
        className="w-16 px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
        title="Column position"
      >
        <option value={1}>Col 1</option>
        <option value={2}>Col 2</option>
        <option value={3}>Col 3</option>
        <option value={4}>Col 4</option>
      </select>
      <button
        onClick={() => field.id && onDelete(field.id)}
        className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface RouteSummaryConfigModalProps {
  templateId: string;
  onClose: () => void;
  onSave: () => void;
}

export default function RouteSummaryConfigModal({ templateId, onClose, onSave }: RouteSummaryConfigModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<RouteSummaryGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupRowIndex, setNewGroupRowIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [apiEndpoints, setApiEndpoints] = useState<ApiSpecEndpoint[]>([]);
  const [authConfigs, setAuthConfigs] = useState<AuthConfig[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadGroups();
    loadApiEndpoints();
    loadAuthConfigs();
  }, [templateId]);

  const loadApiEndpoints = async () => {
    try {
      const { data: specs } = await supabase
        .from('api_specs')
        .select('id, name');

      const { data: endpoints, error } = await supabase
        .from('api_spec_endpoints')
        .select('id, path, method, api_spec_id')
        .eq('method', 'GET');

      if (error) throw error;

      const endpointsWithSpecNames = (endpoints || []).map(ep => ({
        ...ep,
        apiSpecName: specs?.find(s => s.id === ep.api_spec_id)?.name || 'Unknown'
      }));

      setApiEndpoints(endpointsWithSpecNames);
    } catch (err) {
      console.error('Failed to load API endpoints:', err);
    }
  };

  const loadAuthConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('api_auth_config')
        .select('id, name');

      if (error) throw error;
      setAuthConfigs(data || []);
    } catch (err) {
      console.error('Failed to load auth configs:', err);
    }
  };

  const loadGroups = async () => {
    try {
      setLoading(true);
      const { data: groupsData, error: groupsError } = await supabase
        .from('track_trace_route_summary_groups')
        .select('*')
        .eq('template_id', templateId)
        .order('row_index')
        .order('display_order');

      if (groupsError) throw groupsError;

      const groupsWithFields: RouteSummaryGroup[] = [];
      for (const g of groupsData || []) {
        const { data: fieldsData, error: fieldsError } = await supabase
          .from('track_trace_route_summary_fields')
          .select('*')
          .eq('group_id', g.id)
          .order('display_order');

        if (fieldsError) throw fieldsError;

        groupsWithFields.push({
          id: g.id,
          templateId: g.template_id,
          name: g.name,
          rowIndex: g.row_index,
          displayOrder: g.display_order,
          apiSpecEndpointId: g.api_spec_endpoint_id || undefined,
          apiSourceType: g.api_source_type || 'main',
          secondaryApiId: g.secondary_api_id || undefined,
          authConfigId: g.auth_config_id || undefined,
          fields: (fieldsData || []).map((f: any) => ({
            id: f.id,
            groupId: f.group_id,
            label: f.label,
            apiField: f.api_field,
            displayOrder: f.display_order,
            gridColumn: f.grid_column || 1,
            displayFormat: f.display_format || undefined
          }))
        });
      }

      setGroups(groupsWithFields);
    } catch (err) {
      console.error('Failed to load route summary groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const maxOrder = groups.filter(g => g.rowIndex === newGroupRowIndex).length;

      const { data, error } = await supabase
        .from('track_trace_route_summary_groups')
        .insert({
          template_id: templateId,
          name: newGroupName.trim(),
          row_index: newGroupRowIndex,
          display_order: maxOrder
        })
        .select()
        .single();

      if (error) throw error;

      setGroups([...groups, {
        id: data.id,
        templateId: data.template_id,
        name: data.name,
        rowIndex: data.row_index,
        displayOrder: data.display_order,
        fields: []
      }]);
      setNewGroupName('');
    } catch (err) {
      console.error('Failed to add group:', err);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('track_trace_route_summary_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      setGroups(groups.filter(g => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleUpdateGroup = async (group: RouteSummaryGroup) => {
    try {
      const { error } = await supabase
        .from('track_trace_route_summary_groups')
        .update({
          name: group.name,
          row_index: group.rowIndex,
          display_order: group.displayOrder,
          api_spec_endpoint_id: group.apiSpecEndpointId || null,
          api_source_type: group.apiSourceType || 'main',
          secondary_api_id: group.secondaryApiId || null,
          auth_config_id: group.authConfigId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', group.id);

      if (error) throw error;
      setGroups(groups.map(g => g.id === group.id ? group : g));
    } catch (err) {
      console.error('Failed to update group:', err);
    }
  };

  const handleAddField = async (groupId: string) => {
    try {
      const group = groups.find(g => g.id === groupId);
      const maxOrder = group?.fields.length || 0;
      const maxColumn = Math.max(...(group?.fields.map(f => f.gridColumn || 1) || [0]), 0);
      const nextColumn = maxColumn < 4 ? maxColumn + 1 : 1;

      const { data, error } = await supabase
        .from('track_trace_route_summary_fields')
        .insert({
          group_id: groupId,
          label: 'New Field',
          api_field: '',
          display_order: maxOrder,
          grid_column: nextColumn
        })
        .select()
        .single();

      if (error) throw error;

      setGroups(groups.map(g => {
        if (g.id === groupId) {
          return {
            ...g,
            fields: [...g.fields, {
              id: data.id,
              groupId: data.group_id,
              label: data.label,
              apiField: data.api_field,
              displayOrder: data.display_order,
              gridColumn: data.grid_column || 1,
              displayFormat: data.display_format || undefined
            }]
          };
        }
        return g;
      }));
    } catch (err) {
      console.error('Failed to add field:', err);
    }
  };

  const handleUpdateField = async (groupId: string, field: RouteSummaryField) => {
    try {
      const { error } = await supabase
        .from('track_trace_route_summary_fields')
        .update({
          label: field.label,
          api_field: field.apiField,
          display_order: field.displayOrder,
          grid_column: field.gridColumn || 1,
          display_format: field.displayFormat || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', field.id);

      if (error) throw error;

      setGroups(groups.map(g => {
        if (g.id === groupId) {
          return {
            ...g,
            fields: g.fields.map(f => f.id === field.id ? field : f)
          };
        }
        return g;
      }));
    } catch (err) {
      console.error('Failed to update field:', err);
    }
  };

  const handleDeleteField = async (groupId: string, fieldId: string) => {
    try {
      const { error } = await supabase
        .from('track_trace_route_summary_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;

      setGroups(groups.map(g => {
        if (g.id === groupId) {
          return {
            ...g,
            fields: g.fields.filter(f => f.id !== fieldId)
          };
        }
        return g;
      }));
    } catch (err) {
      console.error('Failed to delete field:', err);
    }
  };

  const handleFieldDragEnd = (groupId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const oldIndex = group.fields.findIndex(f => f.id === active.id);
    const newIndex = group.fields.findIndex(f => f.id === over.id);

    const newFields = arrayMove(group.fields, oldIndex, newIndex).map((f, i) => ({
      ...f,
      displayOrder: i
    }));

    setGroups(groups.map(g => g.id === groupId ? { ...g, fields: newFields } : g));

    newFields.forEach(async (field) => {
      await supabase
        .from('track_trace_route_summary_fields')
        .update({ display_order: field.displayOrder })
        .eq('id', field.id);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const groupedByRow = groups.reduce((acc, group) => {
    const row = group.rowIndex;
    if (!acc[row]) acc[row] = [];
    acc[row].push(group);
    return acc;
  }, {} as Record<number, RouteSummaryGroup[]>);

  const rowIndices = Object.keys(groupedByRow).map(Number).sort((a, b) => a - b);
  const maxRowIndex = rowIndices.length > 0 ? Math.max(...rowIndices) : -1;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Route Summary Configuration
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add New Group</h3>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Group Name</label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g., Origin, Destination, Status"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Row</label>
                    <select
                      value={newGroupRowIndex}
                      onChange={(e) => setNewGroupRowIndex(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      {[...Array(maxRowIndex + 2)].map((_, i) => (
                        <option key={i} value={i}>Row {i + 1}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAddGroup}
                    disabled={!newGroupName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Group
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Groups on the same row will display side-by-side
                </p>
              </div>

              {rowIndices.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No groups configured. Add a group above to get started.
                </div>
              ) : (
                <div className="space-y-6">
                  {rowIndices.map(rowIndex => {
                    const rowGroups = groupedByRow[rowIndex];
                    const groupCount = rowGroups.length;
                    return (
                    <div key={rowIndex} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                        Row {rowIndex + 1} - {groupCount === 1 ? 'Full width' : 'Groups display side-by-side'}
                      </h4>
                      <div className={`grid gap-4 ${groupCount === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                        {rowGroups.sort((a, b) => a.displayOrder - b.displayOrder).map(group => (
                          <div key={group.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-3">
                              <input
                                type="text"
                                value={group.name}
                                onChange={(e) => handleUpdateGroup({ ...group, name: e.target.value })}
                                className="font-medium text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <select
                                  value={group.rowIndex}
                                  onChange={(e) => handleUpdateGroup({ ...group, rowIndex: Number(e.target.value) })}
                                  className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                  {[...Array(maxRowIndex + 2)].map((_, i) => (
                                    <option key={i} value={i}>Row {i + 1}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => group.id && handleDeleteGroup(group.id)}
                                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                              <div className="flex items-center gap-2 mb-2">
                                <Link className="h-3.5 w-3.5 text-gray-500" />
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">API Endpoint (Optional)</span>
                              </div>
                              <select
                                value={group.apiSpecEndpointId || ''}
                                onChange={(e) => handleUpdateGroup({ ...group, apiSpecEndpointId: e.target.value || undefined })}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-2"
                              >
                                <option value="">Use main shipment data</option>
                                {apiEndpoints.map(ep => (
                                  <option key={ep.id} value={ep.id}>
                                    {ep.apiSpecName}: {ep.path}
                                  </option>
                                ))}
                              </select>
                              {group.apiSpecEndpointId && authConfigs.length > 0 && (
                                <select
                                  value={group.authConfigId || ''}
                                  onChange={(e) => handleUpdateGroup({ ...group, authConfigId: e.target.value || undefined })}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                >
                                  <option value="">Default authentication</option>
                                  {authConfigs.map(ac => (
                                    <option key={ac.id} value={ac.id}>{ac.name}</option>
                                  ))}
                                </select>
                              )}
                              {group.apiSpecEndpointId && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Data will be fetched from this endpoint and merged
                                </p>
                              )}
                            </div>

                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(e) => group.id && handleFieldDragEnd(group.id, e)}
                            >
                              <SortableContext
                                items={group.fields.map(f => f.id || '')}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="space-y-2 mb-3">
                                  {group.fields.map(field => (
                                    <SortableFieldItem
                                      key={field.id}
                                      field={field}
                                      onUpdate={(f) => group.id && handleUpdateField(group.id, f)}
                                      onDelete={(id) => group.id && handleDeleteField(group.id, id)}
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>

                            <button
                              onClick={() => group.id && handleAddField(group.id)}
                              className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center gap-2"
                            >
                              <Plus className="h-4 w-4" />
                              Add Field
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {showPreview && groups.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Hide Preview
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                  <Route className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Route Summary</h2>
              </div>
              <div className="space-y-4">
                {rowIndices.map(rowIndex => {
                  const rowGroups = groupedByRow[rowIndex];
                  const groupCount = rowGroups.length;
                  return (
                    <div key={rowIndex} className={`grid gap-4 ${groupCount === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                      {rowGroups.sort((a, b) => a.displayOrder - b.displayOrder).map(group => {
                        const maxColumn = Math.max(...group.fields.map(f => f.gridColumn || 1), 1);
                        const columnCount = Math.min(maxColumn, 4);
                        const fieldsByColumn: Record<number, RouteSummaryField[]> = {};
                        group.fields.forEach(field => {
                          const col = field.gridColumn || 1;
                          if (!fieldsByColumn[col]) fieldsByColumn[col] = [];
                          fieldsByColumn[col].push(field);
                        });

                        return (
                          <div key={group.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                              {group.name}
                            </h3>
                            <div className={`grid gap-x-6 gap-y-2 ${
                              columnCount === 1 ? 'grid-cols-1' :
                              columnCount === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                              columnCount === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                            }`}>
                              {Array.from({ length: columnCount }, (_, colIndex) => {
                                const colFields = fieldsByColumn[colIndex + 1] || [];
                                return (
                                  <div key={colIndex} className="space-y-2">
                                    {colFields.sort((a, b) => a.displayOrder - b.displayOrder).map(field => (
                                      <div key={field.id}>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 block">{field.label}</span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                          Sample Value
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowPreview(!showPreview)}
            disabled={groups.length === 0}
            className="px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-blue-200 dark:border-blue-800"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
