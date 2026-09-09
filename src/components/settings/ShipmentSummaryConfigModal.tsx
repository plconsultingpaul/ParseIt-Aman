import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, GripVertical, Save, Loader2, Eye, Settings, Thermometer, AlertTriangle } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ShipmentSummaryGroup, ShipmentSummaryField, ShipmentSummaryConfig } from '../../types';
import { supabase } from '../../lib/supabase';

interface SortableFieldItemProps {
  field: ShipmentSummaryField;
  onUpdate: (field: ShipmentSummaryField) => void;
  onDelete: (id: string) => void;
}

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
      <button
        onClick={() => field.id && onDelete(field.id)}
        className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ShipmentSummaryConfigModalProps {
  templateId: string;
  onClose: () => void;
  onSave: () => void;
}

export default function ShipmentSummaryConfigModal({ templateId, onClose, onSave }: ShipmentSummaryConfigModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ShipmentSummaryConfig>({
    templateId,
    headerFieldName: 'billNumber',
    showTimelineStatus: true,
    tempControlledField: 'temperatureControlled',
    tempControlledLabel: 'Temp Controlled',
    hazardousField: 'isDangerousGoods',
    hazardousLabel: 'Hazardous'
  });
  const [groups, setGroups] = useState<ShipmentSummaryGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadConfig();
    loadGroups();
  }, [templateId]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('track_trace_shipment_summary_config')
        .select('*')
        .eq('template_id', templateId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          id: data.id,
          templateId: data.template_id,
          headerFieldName: data.header_field_name || 'billNumber',
          showTimelineStatus: data.show_timeline_status ?? true,
          tempControlledField: data.temp_controlled_field || 'temperatureControlled',
          tempControlledLabel: data.temp_controlled_label || 'Temp Controlled',
          hazardousField: data.hazardous_field || 'isDangerousGoods',
          hazardousLabel: data.hazardous_label || 'Hazardous'
        });
      }
    } catch (err) {
      console.error('Failed to load shipment summary config:', err);
    }
  };

  const loadGroups = async () => {
    try {
      setLoading(true);
      const { data: groupsData, error: groupsError } = await supabase
        .from('track_trace_shipment_summary_groups')
        .select('*')
        .eq('template_id', templateId)
        .order('display_order');

      if (groupsError) throw groupsError;

      const groupsWithFields: ShipmentSummaryGroup[] = [];
      for (const g of groupsData || []) {
        const { data: fieldsData, error: fieldsError } = await supabase
          .from('track_trace_shipment_summary_fields')
          .select('*')
          .eq('group_id', g.id)
          .order('display_order');

        if (fieldsError) throw fieldsError;

        groupsWithFields.push({
          id: g.id,
          templateId: g.template_id,
          name: g.name,
          displayOrder: g.display_order,
          fields: (fieldsData || []).map((f: any) => ({
            id: f.id,
            groupId: f.group_id,
            label: f.label,
            apiField: f.api_field,
            displayOrder: f.display_order
          }))
        });
      }

      setGroups(groupsWithFields);
    } catch (err) {
      console.error('Failed to load shipment summary groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      if (config.id) {
        const { error } = await supabase
          .from('track_trace_shipment_summary_config')
          .update({
            header_field_name: config.headerFieldName,
            show_timeline_status: config.showTimelineStatus,
            temp_controlled_field: config.tempControlledField,
            temp_controlled_label: config.tempControlledLabel,
            hazardous_field: config.hazardousField,
            hazardous_label: config.hazardousLabel,
            updated_at: new Date().toISOString()
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('track_trace_shipment_summary_config')
          .insert({
            template_id: templateId,
            header_field_name: config.headerFieldName,
            show_timeline_status: config.showTimelineStatus,
            temp_controlled_field: config.tempControlledField,
            temp_controlled_label: config.tempControlledLabel,
            hazardous_field: config.hazardousField,
            hazardous_label: config.hazardousLabel
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const maxOrder = groups.length;

      const { data, error } = await supabase
        .from('track_trace_shipment_summary_groups')
        .insert({
          template_id: templateId,
          name: newGroupName.trim(),
          display_order: maxOrder
        })
        .select()
        .single();

      if (error) throw error;

      setGroups([...groups, {
        id: data.id,
        templateId: data.template_id,
        name: data.name,
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
        .from('track_trace_shipment_summary_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      setGroups(groups.filter(g => g.id !== groupId));
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleUpdateGroup = async (group: ShipmentSummaryGroup) => {
    try {
      const { error } = await supabase
        .from('track_trace_shipment_summary_groups')
        .update({
          name: group.name,
          display_order: group.displayOrder,
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

      const { data, error } = await supabase
        .from('track_trace_shipment_summary_fields')
        .insert({
          group_id: groupId,
          label: 'New Field',
          api_field: '',
          display_order: maxOrder
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
              displayOrder: data.display_order
            }]
          };
        }
        return g;
      }));
    } catch (err) {
      console.error('Failed to add field:', err);
    }
  };

  const handleUpdateField = async (groupId: string, field: ShipmentSummaryField) => {
    try {
      const { error } = await supabase
        .from('track_trace_shipment_summary_fields')
        .update({
          label: field.label,
          api_field: field.apiField,
          display_order: field.displayOrder,
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
        .from('track_trace_shipment_summary_fields')
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
        .from('track_trace_shipment_summary_fields')
        .update({ display_order: field.displayOrder })
        .eq('id', field.id);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await handleSaveConfig();
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Shipment Summary Configuration
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
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Header Settings</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Header Field (Main Number)
                    </label>
                    <input
                      type="text"
                      value={config.headerFieldName}
                      onChange={(e) => setConfig(prev => ({ ...prev, headerFieldName: e.target.value }))}
                      placeholder="e.g., billNumber"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">API field for the large header number</p>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showTimelineStatus}
                        onChange={(e) => setConfig(prev => ({ ...prev, showTimelineStatus: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Show Current Timeline Status</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Indicator Buttons</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  These buttons appear when the specified boolean fields are true
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-2 mb-3">
                      <Thermometer className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Temperature Controlled</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">API Field (boolean)</label>
                        <input
                          type="text"
                          value={config.tempControlledField}
                          onChange={(e) => setConfig(prev => ({ ...prev, tempControlledField: e.target.value }))}
                          placeholder="temperatureControlled"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Button Label</label>
                        <input
                          type="text"
                          value={config.tempControlledLabel}
                          onChange={(e) => setConfig(prev => ({ ...prev, tempControlledLabel: e.target.value }))}
                          placeholder="Temp Controlled"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hazardous Goods</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">API Field (boolean)</label>
                        <input
                          type="text"
                          value={config.hazardousField}
                          onChange={(e) => setConfig(prev => ({ ...prev, hazardousField: e.target.value }))}
                          placeholder="isDangerousGoods"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Button Label</label>
                        <input
                          type="text"
                          value={config.hazardousLabel}
                          onChange={(e) => setConfig(prev => ({ ...prev, hazardousLabel: e.target.value }))}
                          placeholder="Hazardous"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add Field Group</h3>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Group Name</label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g., Shipment Info, Cargo Details"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
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
              </div>

              {groups.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No field groups configured. Add a group above to display fields in the Shipment Summary.
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.sort((a, b) => a.displayOrder - b.displayOrder).map(group => (
                    <div key={group.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => handleUpdateGroup({ ...group, name: e.target.value })}
                          className="font-medium text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          onClick={() => group.id && handleDeleteGroup(group.id)}
                          className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
              )}
            </>
          )}
        </div>

        {showPreview && (
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
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Sample-{config.headerFieldName || 'Value'}
                  </h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    {config.showTimelineStatus && (
                      <span className="inline-flex px-4 py-2 rounded-full border font-semibold bg-blue-100 text-blue-700 border-blue-200">
                        In Transit
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium bg-sky-50 text-sky-700 border-sky-200 text-sm">
                      <Thermometer className="h-3.5 w-3.5" />
                      {config.tempControlledLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium bg-red-50 text-red-700 border-red-200 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {config.hazardousLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {groups.flatMap(g => g.fields).slice(0, 8).map((field, idx) => (
                  <div key={field.id || idx}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">{field.label || 'Label'}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sample Value</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg flex items-center gap-2 border border-blue-200 dark:border-blue-800"
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
