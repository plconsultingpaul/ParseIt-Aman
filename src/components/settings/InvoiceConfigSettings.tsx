import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Pencil as Edit2, GripVertical, AlertCircle, Save, Search, Filter, Columns2 as Columns, Settings, ChevronDown, ChevronRight, Zap, Loader2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { User, InvoiceTemplate, InvoiceField, InvoiceOrderByOption, InvoiceDefaultField, InvoiceFilterPreset, InvoiceFilterValue, InvoiceBodyMapping, SecondaryApiConfig, ApiSpec, ApiSpecEndpoint } from '../../types';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';
import { FormSkeleton } from '../common/Skeleton';

interface SortableColumnItemProps {
  field: InvoiceField;
  onEdit: (field: InvoiceField) => void;
  onDelete: (id: string) => void;
}

function SortableColumnItem({ field, onEdit, onDelete }: SortableColumnItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div className="flex items-center space-x-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="h-4 w-4 text-gray-400" />
        </button>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{field.displayLabel}</span>
            <span className="text-xs px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">{field.dataType}</span>
            {!field.isEnabled && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-500 rounded">Disabled</span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">API Field: {field.fieldName}</span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button onClick={() => onEdit(field)} className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
          <Edit2 className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(field.id)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface InvoiceConfigSettingsProps {
  currentUser: User;
}

export default function InvoiceConfigSettings({ currentUser }: InvoiceConfigSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [fields, setFields] = useState<InvoiceField[]>([]);
  const [defaultFields, setDefaultFields] = useState<InvoiceDefaultField[]>([]);
  const [filterPresets, setFilterPresets] = useState<InvoiceFilterPreset[]>([]);

  const [secondaryApis, setSecondaryApis] = useState<SecondaryApiConfig[]>([]);
  const [apiSpecs, setApiSpecs] = useState<ApiSpec[]>([]);
  const [apiEndpoints, setApiEndpoints] = useState<ApiSpecEndpoint[]>([]);

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<InvoiceField | null>(null);

  const [showDefaultFieldModal, setShowDefaultFieldModal] = useState(false);
  const [editingDefaultField, setEditingDefaultField] = useState<InvoiceDefaultField | null>(null);

  const [showPresetModal, setShowPresetModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<InvoiceFilterPreset | null>(null);

  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    api: true,
    options: true,
    filters: true,
    columns: true,
    defaults: false,
    presets: false
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplate(selectedTemplateId);
    } else {
      setTemplate(null);
      setFields([]);
      setDefaultFields([]);
      setFilterPresets([]);
    }
  }, [selectedTemplateId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [templatesRes, apisRes, specsRes] = await Promise.all([
        supabase.from('invoice_templates').select('*').order('name'),
        supabase.from('secondary_api_configs').select('*').eq('is_active', true).order('name'),
        supabase.from('api_specs').select('*').order('name')
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (apisRes.error) throw apisRes.error;
      if (specsRes.error) throw specsRes.error;

      const mapped: InvoiceTemplate[] = (templatesRes.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        apiSourceType: t.api_source_type,
        secondaryApiId: t.secondary_api_id,
        apiSpecId: t.api_spec_id,
        apiSpecEndpointId: t.api_spec_endpoint_id,
        apiPath: t.api_path,
        httpMethod: t.http_method,
        requestBody: t.request_body || '',
        requestBodyMappings: t.request_body_mappings || [],
        limitOptions: t.limit_options || [10, 25, 50, 100],
        orderByOptions: t.order_by_options || [],
        defaultLimit: t.default_limit,
        defaultOrderBy: t.default_order_by,
        defaultOrderDirection: t.default_order_direction,
        isActive: t.is_active,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));

      setTemplates(mapped);
      setSecondaryApis(apisRes.data || []);
      setApiSpecs(specsRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async (templateId: string) => {
    try {
      const [configRes, fieldsRes, defaultsRes, presetsRes] = await Promise.all([
        supabase.from('invoice_templates').select('*').eq('id', templateId).maybeSingle(),
        supabase.from('invoice_template_fields').select('*').eq('template_id', templateId).order('field_order'),
        supabase.from('invoice_template_default_fields').select('*').eq('template_id', templateId).order('created_at'),
        supabase.from('invoice_template_filter_presets').select('*').eq('template_id', templateId).order('display_order')
      ]);

      if (configRes.error) throw configRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (defaultsRes.error) throw defaultsRes.error;
      if (presetsRes.error) throw presetsRes.error;

      if (configRes.data) {
        const t = configRes.data;
        setTemplate({
          id: t.id,
          name: t.name,
          description: t.description,
          apiSourceType: t.api_source_type,
          secondaryApiId: t.secondary_api_id,
          apiSpecId: t.api_spec_id,
          apiSpecEndpointId: t.api_spec_endpoint_id,
          apiPath: t.api_path,
          httpMethod: t.http_method,
          requestBody: t.request_body || '',
          requestBodyMappings: t.request_body_mappings || [],
          limitOptions: t.limit_options || [10, 25, 50, 100],
          orderByOptions: t.order_by_options || [],
          defaultLimit: t.default_limit,
          defaultOrderBy: t.default_order_by,
          defaultOrderDirection: t.default_order_direction,
          isActive: t.is_active,
          createdAt: t.created_at,
          updatedAt: t.updated_at
        });

        if (t.api_spec_id) {
          const { data: endpoints } = await supabase
            .from('api_spec_endpoints')
            .select('*')
            .eq('api_spec_id', t.api_spec_id)
            .order('path');
          setApiEndpoints(endpoints || []);
        }
      }

      setFields((fieldsRes.data || []).map((f: any) => ({
        id: f.id,
        configId: f.template_id,
        fieldType: f.field_type,
        fieldName: f.field_name,
        displayLabel: f.display_label,
        dataType: f.data_type,
        filterOperator: f.filter_operator,
        parameterType: f.parameter_type,
        apiFieldPath: f.api_field_path,
        isRequired: f.is_required,
        fieldOrder: f.field_order,
        isEnabled: f.is_enabled,
        valueMappings: f.value_mappings || [],
        createdAt: f.created_at,
        updatedAt: f.updated_at
      })));

      setDefaultFields((defaultsRes.data || []).map((f: any) => ({
        id: f.id,
        configId: f.template_id,
        fieldName: f.field_name,
        parameterType: f.parameter_type,
        apiFieldPath: f.api_field_path,
        valueType: f.value_type,
        staticValue: f.static_value,
        dynamicValue: f.dynamic_value,
        operator: f.operator || 'eq',
        createdAt: f.created_at,
        updatedAt: f.updated_at
      })));

      setFilterPresets((presetsRes.data || []).map((p: any) => ({
        id: p.id,
        configId: p.template_id,
        name: p.name,
        displayOrder: p.display_order,
        filterValues: p.filter_values || [],
        isActive: p.is_active,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      })));
    } catch (err: any) {
      setError(err.message || 'Failed to load template');
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      setError('Template name is required');
      return;
    }

    try {
      setSaving(true);
      const { data, error: insertErr } = await supabase
        .from('invoice_templates')
        .insert([{
          name: newTemplateName.trim(),
          description: newTemplateDescription.trim() || null,
          api_source_type: 'main',
          api_path: '',
          http_method: 'GET',
          limit_options: [10, 25, 50, 100],
          order_by_options: [],
          default_limit: 25,
          default_order_direction: 'desc',
          is_active: true
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;

      setShowNewTemplateModal(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      await loadInitialData();
      setSelectedTemplateId(data.id);
      showSuccess('Template created successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;

    try {
      setSaving(true);
      const { error: delErr } = await supabase
        .from('invoice_templates')
        .delete()
        .eq('id', selectedTemplateId);

      if (delErr) throw delErr;

      setShowDeleteConfirm(false);
      setSelectedTemplateId('');
      setTemplate(null);
      await loadInitialData();
      showSuccess('Template deleted successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!template) return;

    try {
      setSaving(true);
      const { error: updateErr } = await supabase
        .from('invoice_templates')
        .update({
          name: template.name,
          description: template.description || null,
          api_source_type: template.apiSourceType,
          secondary_api_id: template.secondaryApiId || null,
          api_spec_id: template.apiSpecId || null,
          api_spec_endpoint_id: template.apiSpecEndpointId || null,
          api_path: template.apiPath,
          http_method: template.httpMethod,
          request_body: template.requestBody || null,
          request_body_mappings: template.requestBodyMappings || [],
          limit_options: template.limitOptions,
          order_by_options: template.orderByOptions,
          default_limit: template.defaultLimit,
          default_order_by: template.defaultOrderBy || null,
          default_order_direction: template.defaultOrderDirection,
          is_active: template.isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (updateErr) throw updateErr;
      showSuccess('Template saved successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleApiSpecChange = async (specId: string) => {
    setTemplate(prev => prev ? { ...prev, apiSpecId: specId || undefined, apiSpecEndpointId: undefined, apiPath: '' } : null);
    if (specId) {
      const { data: endpoints } = await supabase
        .from('api_spec_endpoints')
        .select('*')
        .eq('api_spec_id', specId)
        .order('path');
      setApiEndpoints(endpoints || []);
    } else {
      setApiEndpoints([]);
    }
  };

  const handleEndpointChange = (endpointId: string) => {
    const endpoint = apiEndpoints.find(e => e.id === endpointId);
    setTemplate(prev => prev ? {
      ...prev,
      apiSpecEndpointId: endpointId || undefined,
      apiPath: endpoint?.path || prev.apiPath,
      httpMethod: endpoint?.method?.toUpperCase() || prev.httpMethod
    } : null);
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setError(null);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Field CRUD
  const handleSaveField = async (fieldData: Partial<InvoiceField>, fieldType: 'filter' | 'select') => {
    if (!template) return;

    try {
      if (editingField) {
        const { error: updateErr } = await supabase
          .from('invoice_template_fields')
          .update({
            field_name: fieldData.fieldName,
            display_label: fieldData.displayLabel,
            data_type: fieldData.dataType,
            filter_operator: fieldData.filterOperator || null,
            parameter_type: fieldData.parameterType || null,
            api_field_path: fieldData.apiFieldPath || null,
            is_required: fieldData.isRequired || false,
            is_enabled: fieldData.isEnabled !== false,
            value_mappings: fieldData.valueMappings || [],
            updated_at: new Date().toISOString()
          })
          .eq('id', editingField.id);

        if (updateErr) throw updateErr;
      } else {
        const maxOrder = fields.filter(f => f.fieldType === fieldType).reduce((max, f) => Math.max(max, f.fieldOrder), -1);
        const { error: insertErr } = await supabase
          .from('invoice_template_fields')
          .insert([{
            template_id: template.id,
            field_type: fieldType,
            field_name: fieldData.fieldName,
            display_label: fieldData.displayLabel,
            data_type: fieldData.dataType || 'string',
            filter_operator: fieldData.filterOperator || null,
            parameter_type: fieldData.parameterType || null,
            api_field_path: fieldData.apiFieldPath || null,
            is_required: fieldData.isRequired || false,
            field_order: maxOrder + 1,
            is_enabled: true,
            value_mappings: fieldData.valueMappings || []
          }]);

        if (insertErr) throw insertErr;
      }

      setShowFieldModal(false);
      setEditingField(null);
      await loadTemplate(template.id);
      showSuccess(editingField ? 'Field updated' : 'Field added');
    } catch (err: any) {
      setError(err.message || 'Failed to save field');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      const { error: delErr } = await supabase.from('invoice_template_fields').delete().eq('id', fieldId);
      if (delErr) throw delErr;
      if (template) await loadTemplate(template.id);
      showSuccess('Field deleted');
    } catch (err: any) {
      setError(err.message || 'Failed to delete field');
    }
  };

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const selectFields = fields.filter(f => f.fieldType === 'select');
    const oldIndex = selectFields.findIndex(f => f.id === active.id);
    const newIndex = selectFields.findIndex(f => f.id === over.id);

    const reordered = arrayMove(selectFields, oldIndex, newIndex);
    const updatedFields = fields.map(f => {
      if (f.fieldType !== 'select') return f;
      const idx = reordered.findIndex(r => r.id === f.id);
      return { ...f, fieldOrder: idx };
    });
    setFields(updatedFields);

    for (let i = 0; i < reordered.length; i++) {
      await supabase.from('invoice_template_fields').update({ field_order: i }).eq('id', reordered[i].id);
    }
  };

  // Default Field CRUD
  const handleSaveDefaultField = async (fieldData: Partial<InvoiceDefaultField>) => {
    if (!template) return;

    try {
      if (editingDefaultField) {
        const { error: updateErr } = await supabase
          .from('invoice_template_default_fields')
          .update({
            field_name: fieldData.fieldName,
            parameter_type: fieldData.parameterType || 'query',
            api_field_path: fieldData.apiFieldPath || null,
            value_type: fieldData.valueType || 'static',
            static_value: fieldData.staticValue || null,
            dynamic_value: fieldData.dynamicValue || null,
            operator: fieldData.operator || 'eq',
            updated_at: new Date().toISOString()
          })
          .eq('id', editingDefaultField.id);

        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('invoice_template_default_fields')
          .insert([{
            template_id: template.id,
            field_name: fieldData.fieldName,
            parameter_type: fieldData.parameterType || 'query',
            api_field_path: fieldData.apiFieldPath || null,
            value_type: fieldData.valueType || 'static',
            static_value: fieldData.staticValue || null,
            dynamic_value: fieldData.dynamicValue || null,
            operator: fieldData.operator || 'eq'
          }]);

        if (insertErr) throw insertErr;
      }

      setShowDefaultFieldModal(false);
      setEditingDefaultField(null);
      await loadTemplate(template.id);
      showSuccess(editingDefaultField ? 'Default field updated' : 'Default field added');
    } catch (err: any) {
      setError(err.message || 'Failed to save default field');
    }
  };

  const handleDeleteDefaultField = async (fieldId: string) => {
    try {
      const { error: delErr } = await supabase.from('invoice_template_default_fields').delete().eq('id', fieldId);
      if (delErr) throw delErr;
      if (template) await loadTemplate(template.id);
      showSuccess('Default field deleted');
    } catch (err: any) {
      setError(err.message || 'Failed to delete default field');
    }
  };

  // Filter Preset CRUD
  const handleSavePreset = async (presetData: Partial<InvoiceFilterPreset>) => {
    if (!template) return;

    try {
      if (editingPreset) {
        const { error: updateErr } = await supabase
          .from('invoice_template_filter_presets')
          .update({
            name: presetData.name,
            filter_values: presetData.filterValues || [],
            is_active: presetData.isActive !== false,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPreset.id);

        if (updateErr) throw updateErr;
      } else {
        const maxOrder = filterPresets.reduce((max, p) => Math.max(max, p.displayOrder), -1);
        const { error: insertErr } = await supabase
          .from('invoice_template_filter_presets')
          .insert([{
            template_id: template.id,
            name: presetData.name,
            display_order: maxOrder + 1,
            filter_values: presetData.filterValues || [],
            is_active: true
          }]);

        if (insertErr) throw insertErr;
      }

      setShowPresetModal(false);
      setEditingPreset(null);
      await loadTemplate(template.id);
      showSuccess(editingPreset ? 'Preset updated' : 'Preset added');
    } catch (err: any) {
      setError(err.message || 'Failed to save preset');
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      const { error: delErr } = await supabase.from('invoice_template_filter_presets').delete().eq('id', presetId);
      if (delErr) throw delErr;
      if (template) await loadTemplate(template.id);
      showSuccess('Preset deleted');
    } catch (err: any) {
      setError(err.message || 'Failed to delete preset');
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filterFields = fields.filter(f => f.fieldType === 'filter');
  const selectFields = fields.filter(f => f.fieldType === 'select');

  if (loading) return <FormSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Invoice Templates</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configure invoice API endpoints and display fields</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowNewTemplateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Template</span>
          </button>
          {template && (
            <>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>Save</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-700 dark:text-green-400">{successMessage}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Template</label>
        <Select
          value={selectedTemplateId || '__none__'}
          onValueChange={(value) => setSelectedTemplateId(value === '__none__' ? '' : value)}
          options={[
            { value: '__none__', label: 'Select a template...' },
            ...templates.map(t => ({ value: t.id, label: `${t.name}${!t.isActive ? ' (Inactive)' : ''}` }))
          ]}
          searchable
        />
      </div>

      {!template && selectedTemplateId === '' && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Select a template to configure Invoices</p>
        </div>
      )}

      {template && (
        <div className="space-y-4">
          {/* API Configuration */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('api')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">API Configuration</span>
              </div>
              {expandedSections.api ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expandedSections.api && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={template.name}
                      onChange={(e) => setTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                    <Select
                      value={template.isActive ? 'active' : 'inactive'}
                      onValueChange={(v) => setTemplate(prev => prev ? { ...prev, isActive: v === 'active' } : null)}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' }
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={template.description || ''}
                    onChange={(e) => setTemplate(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Source</label>
                    <Select
                      value={template.apiSourceType}
                      onValueChange={(v) => setTemplate(prev => prev ? { ...prev, apiSourceType: v as 'main' | 'secondary', secondaryApiId: undefined } : null)}
                      options={[
                        { value: 'main', label: 'Main API' },
                        { value: 'secondary', label: 'Secondary API' }
                      ]}
                    />
                  </div>
                  {template.apiSourceType === 'secondary' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secondary API</label>
                      <Select
                        value={template.secondaryApiId || '__none__'}
                        onValueChange={(v) => setTemplate(prev => prev ? { ...prev, secondaryApiId: v === '__none__' ? undefined : v } : null)}
                        options={[
                          { value: '__none__', label: 'Select API...' },
                          ...secondaryApis.map(a => ({ value: a.id, label: a.name }))
                        ]}
                        searchable
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Spec</label>
                    <Select
                      value={template.apiSpecId || '__none__'}
                      onValueChange={(v) => handleApiSpecChange(v === '__none__' ? '' : v)}
                      options={[
                        { value: '__none__', label: 'None' },
                        ...apiSpecs.map(s => ({ value: s.id, label: s.name }))
                      ]}
                      searchable
                    />
                  </div>
                  {template.apiSpecId && apiEndpoints.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endpoint</label>
                      <Select
                        value={template.apiSpecEndpointId || '__none__'}
                        onValueChange={(v) => handleEndpointChange(v === '__none__' ? '' : v)}
                        options={[
                          { value: '__none__', label: 'Select endpoint...' },
                          ...apiEndpoints.map(e => ({ value: e.id, label: `${e.method?.toUpperCase()} ${e.path}` }))
                        ]}
                        searchable
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Path</label>
                    <input
                      type="text"
                      value={template.apiPath}
                      onChange={(e) => setTemplate(prev => prev ? { ...prev, apiPath: e.target.value } : null)}
                      placeholder="/api/invoices"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">HTTP Method</label>
                    <Select
                      value={template.httpMethod}
                      onValueChange={(v) => setTemplate(prev => prev ? { ...prev, httpMethod: v } : null)}
                      options={[
                        { value: 'GET', label: 'GET' },
                        { value: 'POST', label: 'POST' },
                        { value: 'PUT', label: 'PUT' },
                        { value: 'PATCH', label: 'PATCH' }
                      ]}
                    />
                  </div>
                </div>
                {(template.httpMethod === 'POST' || template.httpMethod === 'PUT' || template.httpMethod === 'PATCH') && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Request Body (JSON)</label>
                      <textarea
                        value={template.requestBody || ''}
                        onChange={(e) => setTemplate(prev => prev ? { ...prev, requestBody: e.target.value } : null)}
                        placeholder='{"key": "value"}'
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm resize-y"
                      />
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          JSON body sent with the API request. Click "Map JSON" to create field mappings for dynamic values.
                        </p>
                        <button
                          onClick={() => {
                            if (!template.requestBody?.trim()) {
                              setError('Enter a JSON body first before mapping');
                              return;
                            }
                            try {
                              const parsed = JSON.parse(template.requestBody);
                              const mappings: InvoiceBodyMapping[] = [];
                              const extractPaths = (obj: any, prefix: string = '') => {
                                for (const [key, value] of Object.entries(obj)) {
                                  const path = prefix ? `${prefix}.${key}` : key;
                                  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                                    extractPaths(value, path);
                                  } else {
                                    const existing = template.requestBodyMappings.find(m => m.fieldPath === path);
                                    if (existing) {
                                      mappings.push(existing);
                                    } else {
                                      let dataType: 'string' | 'number' | 'boolean' = 'string';
                                      if (typeof value === 'number') dataType = 'number';
                                      else if (typeof value === 'boolean') dataType = 'boolean';
                                      mappings.push({
                                        fieldPath: path,
                                        sourceType: 'hardcoded',
                                        dataType,
                                        value: value !== null && value !== undefined ? String(value) : ''
                                      });
                                    }
                                  }
                                }
                              };
                              extractPaths(parsed);
                              setTemplate(prev => prev ? { ...prev, requestBodyMappings: mappings } : null);
                              setError(null);
                            } catch {
                              setError('Invalid JSON in request body. Please fix the JSON before mapping.');
                            }
                          }}
                          className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          <span>Map JSON</span>
                        </button>
                      </div>
                    </div>

                    {template.requestBodyMappings.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Field Mappings</label>
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[1fr_140px_100px_1fr_40px] gap-2 p-2 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">
                            <span>Field Path</span>
                            <span>Source</span>
                            <span>Data Type</span>
                            <span>Value</span>
                            <span></span>
                          </div>
                          <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {template.requestBodyMappings.map((mapping, idx) => (
                              <div key={idx} className="grid grid-cols-[1fr_140px_100px_1fr_40px] gap-2 p-2 items-center">
                                <span className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate" title={mapping.fieldPath}>
                                  {mapping.fieldPath}
                                </span>
                                <Select
                                  value={mapping.sourceType}
                                  onValueChange={(v) => {
                                    const updated = [...template.requestBodyMappings];
                                    updated[idx] = { ...updated[idx], sourceType: v as 'hardcoded' | 'variable', value: '' };
                                    setTemplate(prev => prev ? { ...prev, requestBodyMappings: updated } : null);
                                  }}
                                  options={[
                                    { value: 'hardcoded', label: 'Hardcoded' },
                                    { value: 'variable', label: 'Variable' }
                                  ]}
                                />
                                <Select
                                  value={mapping.dataType}
                                  onValueChange={(v) => {
                                    const updated = [...template.requestBodyMappings];
                                    updated[idx] = { ...updated[idx], dataType: v as 'string' | 'number' | 'boolean' };
                                    setTemplate(prev => prev ? { ...prev, requestBodyMappings: updated } : null);
                                  }}
                                  options={[
                                    { value: 'string', label: 'String' },
                                    { value: 'number', label: 'Number' },
                                    { value: 'boolean', label: 'Boolean' }
                                  ]}
                                />
                                {mapping.sourceType === 'variable' ? (
                                  <Select
                                    value={mapping.value || '__none__'}
                                    onValueChange={(v) => {
                                      const updated = [...template.requestBodyMappings];
                                      updated[idx] = { ...updated[idx], value: v === '__none__' ? '' : v };
                                      setTemplate(prev => prev ? { ...prev, requestBodyMappings: updated } : null);
                                    }}
                                    options={[
                                      { value: '__none__', label: 'Select variable...' },
                                      { value: 'client.client_id', label: 'Client ID' }
                                    ]}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={mapping.value}
                                    onChange={(e) => {
                                      const updated = [...template.requestBodyMappings];
                                      updated[idx] = { ...updated[idx], value: e.target.value };
                                      setTemplate(prev => prev ? { ...prev, requestBodyMappings: updated } : null);
                                    }}
                                    placeholder="Value"
                                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                  />
                                )}
                                <button
                                  onClick={() => {
                                    const updated = template.requestBodyMappings.filter((_, i) => i !== idx);
                                    setTemplate(prev => prev ? { ...prev, requestBodyMappings: updated } : null);
                                  }}
                                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Query Options */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('options')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Query Options</span>
              </div>
              {expandedSections.options ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expandedSections.options && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Limit Options (comma separated)</label>
                  <input
                    type="text"
                    value={template.limitOptions.join(', ')}
                    onChange={(e) => {
                      const opts = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                      setTemplate(prev => prev ? { ...prev, limitOptions: opts.length > 0 ? opts : [25] } : null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Limit</label>
                    <input
                      type="number"
                      value={template.defaultLimit}
                      onChange={(e) => setTemplate(prev => prev ? { ...prev, defaultLimit: parseInt(e.target.value) || 25 } : null)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Order Direction</label>
                    <Select
                      value={template.defaultOrderDirection}
                      onValueChange={(v) => setTemplate(prev => prev ? { ...prev, defaultOrderDirection: v as 'asc' | 'desc' } : null)}
                      options={[
                        { value: 'asc', label: 'Ascending' },
                        { value: 'desc', label: 'Descending' }
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Order By Options
                    <button
                      onClick={() => setTemplate(prev => prev ? { ...prev, orderByOptions: [...prev.orderByOptions, { field: '', label: '', defaultDirection: 'desc' }] } : null)}
                      className="ml-2 text-xs text-teal-600 hover:text-teal-700"
                    >
                      + Add
                    </button>
                  </label>
                  {template.orderByOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center space-x-2 mb-2">
                      <input
                        type="text"
                        value={opt.field}
                        onChange={(e) => {
                          const updated = [...template.orderByOptions];
                          updated[idx] = { ...updated[idx], field: e.target.value };
                          setTemplate(prev => prev ? { ...prev, orderByOptions: updated } : null);
                        }}
                        placeholder="Field name"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => {
                          const updated = [...template.orderByOptions];
                          updated[idx] = { ...updated[idx], label: e.target.value };
                          setTemplate(prev => prev ? { ...prev, orderByOptions: updated } : null);
                        }}
                        placeholder="Display label"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                      <button
                        onClick={() => {
                          const updated = template.orderByOptions.filter((_, i) => i !== idx);
                          setTemplate(prev => prev ? { ...prev, orderByOptions: updated } : null);
                        }}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filter Fields */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('filters')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Filter Fields ({filterFields.length})</span>
              </div>
              {expandedSections.filters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expandedSections.filters && (
              <div className="p-4 space-y-3">
                <button
                  onClick={() => { setEditingField(null); setShowFieldModal(true); }}
                  className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/40"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Filter Field</span>
                </button>
                {filterFields.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No filter fields configured</p>
                ) : (
                  <div className="space-y-2">
                    {filterFields.map(field => (
                      <div key={field.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{field.displayLabel}</span>
                            <span className="text-xs px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">{field.dataType}</span>
                            {field.isRequired && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Required</span>}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {field.fieldName} {field.filterOperator && `(${field.filterOperator})`}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button onClick={() => { setEditingField(field); setShowFieldModal(true); }} className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDeleteField(field.id)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Result Columns */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('columns')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center space-x-2">
                <Columns className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Result Columns ({selectFields.length})</span>
              </div>
              {expandedSections.columns ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expandedSections.columns && (
              <div className="p-4 space-y-3">
                <button
                  onClick={() => { setEditingField(null); setShowFieldModal(true); }}
                  className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/40"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Column</span>
                </button>
                {selectFields.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No result columns configured</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                    <SortableContext items={selectFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {selectFields.map(field => (
                          <SortableColumnItem key={field.id} field={field} onEdit={(f) => { setEditingField(f); setShowFieldModal(true); }} onDelete={handleDeleteField} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}
          </div>

          {/* Default Fields */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('defaults')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Default Fields ({defaultFields.length})</span>
              </div>
              {expandedSections.defaults ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expandedSections.defaults && (
              <div className="p-4 space-y-3">
                <button
                  onClick={() => { setEditingDefaultField(null); setShowDefaultFieldModal(true); }}
                  className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/40"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Default Field</span>
                </button>
                {defaultFields.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No default fields configured</p>
                ) : (
                  <div className="space-y-2">
                    {defaultFields.map(field => (
                      <div key={field.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div>
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{field.fieldName}</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {field.valueType === 'static' ? `Static: ${field.staticValue}` : `Dynamic: ${field.dynamicValue}`}
                            {' '}({field.operator})
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button onClick={() => { setEditingDefaultField(field); setShowDefaultFieldModal(true); }} className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDeleteDefaultField(field.id)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Filter Buttons */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('presets')}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Quick Filter Buttons ({filterPresets.length})</span>
              </div>
              {expandedSections.presets ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {expandedSections.presets && (
              <div className="p-4 space-y-3">
                <button
                  onClick={() => { setEditingPreset(null); setShowPresetModal(true); }}
                  className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/40"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Quick Filter</span>
                </button>
                {filterPresets.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No quick filter buttons configured</p>
                ) : (
                  <div className="space-y-2">
                    {filterPresets.map(preset => (
                      <div key={preset.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div>
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{preset.name}</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {preset.filterValues.length} filter{preset.filterValues.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button onClick={() => { setEditingPreset(preset); setShowPresetModal(true); }} className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDeletePreset(preset.id)} className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Template Modal */}
      {showNewTemplateModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={() => setShowNewTemplateModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">New Invoice Template</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={newTemplateDescription}
                    onChange={(e) => setNewTemplateDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button onClick={() => setShowNewTemplateModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button onClick={handleCreateTemplate} disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Delete Template</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete "{template?.name}"? This will remove all associated fields, defaults, and presets.
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button onClick={handleDeleteTemplate} disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Field Edit Modal */}
      {showFieldModal && (
        <FieldEditModal
          field={editingField}
          onSave={handleSaveField}
          onClose={() => { setShowFieldModal(false); setEditingField(null); }}
        />
      )}

      {/* Default Field Modal */}
      {showDefaultFieldModal && (
        <DefaultFieldModal
          field={editingDefaultField}
          onSave={handleSaveDefaultField}
          onClose={() => { setShowDefaultFieldModal(false); setEditingDefaultField(null); }}
        />
      )}

      {/* Preset Modal */}
      {showPresetModal && (
        <PresetModal
          preset={editingPreset}
          onSave={handleSavePreset}
          onClose={() => { setShowPresetModal(false); setEditingPreset(null); }}
        />
      )}
    </div>
  );
}

// Field Edit Modal
function FieldEditModal({ field, onSave, onClose }: { field: InvoiceField | null; onSave: (data: Partial<InvoiceField>, type: 'filter' | 'select') => void; onClose: () => void }) {
  const [fieldName, setFieldName] = useState(field?.fieldName || '');
  const [displayLabel, setDisplayLabel] = useState(field?.displayLabel || '');
  const [dataType, setDataType] = useState(field?.dataType || 'string');
  const [fieldType, setFieldType] = useState<'filter' | 'select'>(field?.fieldType || 'filter');
  const [filterOperator, setFilterOperator] = useState(field?.filterOperator || 'eq');
  const [parameterType, setParameterType] = useState(field?.parameterType || 'query');
  const [isRequired, setIsRequired] = useState(field?.isRequired || false);
  const [isEnabled, setIsEnabled] = useState(field?.isEnabled !== false);
  const [valueMappings, setValueMappings] = useState<{ sourceValue: string; displayValue: string }[]>(field?.valueMappings || []);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {field ? 'Edit Field' : 'Add Field'}
          </h3>
          <div className="space-y-4">
            {!field && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Field Type</label>
                <Select
                  value={fieldType}
                  onValueChange={(v) => setFieldType(v as 'filter' | 'select')}
                  options={[
                    { value: 'filter', label: 'Filter Field' },
                    { value: 'select', label: 'Result Column' }
                  ]}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Field Name</label>
                <input type="text" value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="e.g. InvoiceNo" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Label</label>
                <input type="text" value={displayLabel} onChange={(e) => setDisplayLabel(e.target.value)} placeholder="e.g. Invoice Number" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Type</label>
                <Select value={dataType} onValueChange={(v) => setDataType(v as any)} options={[
                  { value: 'string', label: 'String' },
                  { value: 'number', label: 'Number' },
                  { value: 'date', label: 'Date' },
                  { value: 'boolean', label: 'Boolean' }
                ]} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parameter Type</label>
                <Select value={parameterType} onValueChange={(v) => setParameterType(v)} options={[
                  { value: 'query', label: 'Query ($filter)' },
                  { value: '$select', label: '$select' },
                  { value: 'path', label: 'Path' },
                  { value: 'header', label: 'Header' },
                  { value: 'body', label: 'Body' }
                ]} />
              </div>
            </div>
            {(fieldType === 'filter' || field?.fieldType === 'filter') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter Operator</label>
                <Select value={filterOperator} onValueChange={(v) => setFilterOperator(v)} options={[
                  { value: 'eq', label: 'Equals (eq)' },
                  { value: 'ne', label: 'Not Equals (ne)' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'startswith', label: 'Starts With' },
                  { value: 'endswith', label: 'Ends With' },
                  { value: 'gt', label: 'Greater Than (gt)' },
                  { value: 'ge', label: 'Greater or Equal (ge)' },
                  { value: 'lt', label: 'Less Than (lt)' },
                  { value: 'le', label: 'Less or Equal (le)' },
                  { value: 'in', label: 'In (comma separated)' },
                  { value: 'not in', label: 'Not In' }
                ]} />
              </div>
            )}
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="w-4 h-4 text-teal-600 rounded" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="w-4 h-4 text-teal-600 rounded" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Value Mappings
                <button onClick={() => setValueMappings([...valueMappings, { sourceValue: '', displayValue: '' }])} className="ml-2 text-xs text-teal-600 hover:text-teal-700">+ Add</button>
              </label>
              {valueMappings.map((m, idx) => (
                <div key={idx} className="flex items-center space-x-2 mb-2">
                  <input type="text" value={m.sourceValue} onChange={(e) => { const updated = [...valueMappings]; updated[idx] = { ...updated[idx], sourceValue: e.target.value }; setValueMappings(updated); }} placeholder="Source" className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  <span className="text-gray-400">→</span>
                  <input type="text" value={m.displayValue} onChange={(e) => { const updated = [...valueMappings]; updated[idx] = { ...updated[idx], displayValue: e.target.value }; setValueMappings(updated); }} placeholder="Display" className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  <button onClick={() => setValueMappings(valueMappings.filter((_, i) => i !== idx))} className="p-1 text-red-500"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button
              onClick={() => onSave({ fieldName, displayLabel, dataType: dataType as any, filterOperator, parameterType, isRequired, isEnabled, valueMappings: valueMappings.filter(m => m.sourceValue) }, field?.fieldType || fieldType)}
              disabled={!fieldName || !displayLabel}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {field ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Default Field Modal
function DefaultFieldModal({ field, onSave, onClose }: { field: InvoiceDefaultField | null; onSave: (data: Partial<InvoiceDefaultField>) => void; onClose: () => void }) {
  const [fieldName, setFieldName] = useState(field?.fieldName || '');
  const [parameterType, setParameterType] = useState(field?.parameterType || 'query');
  const [valueType, setValueType] = useState<'static' | 'dynamic'>(field?.valueType || 'static');
  const [staticValue, setStaticValue] = useState(field?.staticValue || '');
  const [dynamicValue, setDynamicValue] = useState(field?.dynamicValue || '');
  const [operator, setOperator] = useState(field?.operator || 'eq');

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{field ? 'Edit' : 'Add'} Default Field</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Field Name</label>
              <input type="text" value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="e.g. CustomerCode" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parameter Type</label>
                <Select value={parameterType} onValueChange={setParameterType} options={[
                  { value: 'query', label: 'Query ($filter)' },
                  { value: 'path', label: 'Path' },
                  { value: 'header', label: 'Header' },
                  { value: 'body', label: 'Body' }
                ]} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <Select value={operator} onValueChange={setOperator} options={[
                  { value: 'eq', label: 'eq' },
                  { value: 'ne', label: 'ne' },
                  { value: 'contains', label: 'contains' },
                  { value: 'startswith', label: 'startswith' },
                  { value: 'endswith', label: 'endswith' },
                  { value: 'not endswith', label: 'not endswith' },
                  { value: 'in', label: 'in' },
                  { value: 'not in', label: 'not in' }
                ]} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Value Type</label>
              <Select value={valueType} onValueChange={(v) => setValueType(v as 'static' | 'dynamic')} options={[
                { value: 'static', label: 'Static Value' },
                { value: 'dynamic', label: 'Dynamic Value' }
              ]} />
            </div>
            {valueType === 'static' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Static Value</label>
                <input type="text" value={staticValue} onChange={(e) => setStaticValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dynamic Value</label>
                <Select value={dynamicValue} onValueChange={setDynamicValue} options={[
                  { value: 'client.client_id', label: 'Client ID' }
                ]} />
              </div>
            )}
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={() => onSave({ fieldName, parameterType, valueType, staticValue, dynamicValue, operator })} disabled={!fieldName} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
              {field ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Preset Modal
function PresetModal({ preset, onSave, onClose }: { preset: InvoiceFilterPreset | null; onSave: (data: Partial<InvoiceFilterPreset>) => void; onClose: () => void }) {
  const [name, setName] = useState(preset?.name || '');
  const [filterValues, setFilterValues] = useState<InvoiceFilterValue[]>(preset?.filterValues || []);

  const addFilterValue = () => {
    setFilterValues([...filterValues, { id: crypto.randomUUID(), fieldName: '', operator: 'eq', value: '' }]);
  };

  const updateFilterValue = (idx: number, updates: Partial<InvoiceFilterValue>) => {
    const updated = [...filterValues];
    updated[idx] = { ...updated[idx], ...updates };
    setFilterValues(updated);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{preset ? 'Edit' : 'Add'} Quick Filter</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Button Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Open Invoices" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Filter Values
                <button onClick={addFilterValue} className="ml-2 text-xs text-teal-600 hover:text-teal-700">+ Add</button>
              </label>
              {filterValues.map((fv, idx) => (
                <div key={fv.id} className="flex items-center space-x-2 mb-2">
                  <input type="text" value={fv.fieldName} onChange={(e) => updateFilterValue(idx, { fieldName: e.target.value })} placeholder="Field" className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  <input type="text" value={fv.operator} onChange={(e) => updateFilterValue(idx, { operator: e.target.value })} placeholder="Op" className="w-20 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  <input type="text" value={fv.value} onChange={(e) => updateFilterValue(idx, { value: e.target.value })} placeholder="Value" className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  <button onClick={() => setFilterValues(filterValues.filter((_, i) => i !== idx))} className="p-1 text-red-500"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={() => onSave({ name, filterValues: filterValues.filter(fv => fv.fieldName) })} disabled={!name} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
              {preset ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
