import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Pencil as Edit2, GripVertical, AlertCircle, Save, Search, Filter, Columns2 as Columns, Settings, ChevronDown, ChevronRight, ChevronUp, Copy, FileText, Lock, Eye, Loader2, ExternalLink, Zap, X, Play, Mail, Download, Upload } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { User, TrackTraceTemplate, TrackTraceTemplateField, TrackTraceTemplateDefaultField, TrackTraceFilterPreset, TrackTraceFilterPresetDefaultField, TrackTraceFilterValue, TrackTraceOrderByOption, SecondaryApiConfig, ApiSpec, ApiSpecEndpoint, ApiEndpointField, TrackTraceValueMapping, TrackTraceTemplateSection, TrackTraceTemplateSectionType, TraceNumbersSectionConfig, TraceNumberFieldMapping, TrackTraceDocumentConfig, TrackTraceDocumentFilter, TrackTraceTimelineStatus, TrackTraceTimelineChildStatus, TimelineSectionConfig, BarcodeDetailsSectionConfig, BarcodeDetailsFieldMapping, BarcodeDetailsImageConfig } from '../../types';
import { supabase, getAuthHeaders } from '../../lib/supabase';
import Select from '../common/Select';
import { FormSkeleton } from '../common/Skeleton';
import RouteSummaryConfigModal from './RouteSummaryConfigModal';
import ShipmentSummaryConfigModal from './ShipmentSummaryConfigModal';
import TrackTraceTemplateImportModal from './TrackTraceTemplateImportModal';

interface SortableColumnItemProps {
  field: TrackTraceTemplateField;
  onEdit: (field: TrackTraceTemplateField) => void;
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
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </button>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {field.displayLabel}
            </span>
            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
              {field.dataType}
            </span>
            {!field.isEnabled && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-500 rounded">
                Disabled
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            API Field: {field.fieldName}
          </span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onEdit(field)}
          className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(field.id)}
          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface SortableSectionItemProps {
  section: {
    id: string;
    sectionType: string;
    displayOrder: number;
    isEnabled: boolean;
  };
  label: string;
  onToggleEnabled: (id: string) => void;
  onConfigure?: (id: string) => void;
  hasConfig?: boolean;
}

function SortableSectionItem({ section, label, onToggleEnabled, onConfigure, hasConfig }: SortableSectionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
    >
      <div className="flex items-center space-x-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </button>
        <div className="flex items-center space-x-2">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {label}
          </span>
          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
            #{section.displayOrder}
          </span>
          {!section.isEnabled && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-500 rounded">
              Hidden
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {hasConfig && onConfigure && (
          <button
            onClick={() => onConfigure(section.id)}
            className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            title="Configure section"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={section.isEnabled}
            onChange={() => onToggleEnabled(section.id)}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">Show</span>
        </label>
      </div>
    </div>
  );
}

interface TrackTraceTemplatesSettingsProps {
  currentUser: User;
}

export default function TrackTraceTemplatesSettings({ currentUser }: TrackTraceTemplatesSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TrackTraceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [template, setTemplate] = useState<TrackTraceTemplate | null>(null);
  const [fields, setFields] = useState<TrackTraceTemplateField[]>([]);

  const [secondaryApis, setSecondaryApis] = useState<SecondaryApiConfig[]>([]);
  const [apiSpecs, setApiSpecs] = useState<ApiSpec[]>([]);
  const [apiEndpoints, setApiEndpoints] = useState<ApiSpecEndpoint[]>([]);

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<TrackTraceTemplateField | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');

  const [defaultFields, setDefaultFields] = useState<TrackTraceTemplateDefaultField[]>([]);
  const [showDefaultFieldModal, setShowDefaultFieldModal] = useState(false);
  const [editingDefaultField, setEditingDefaultField] = useState<TrackTraceTemplateDefaultField | null>(null);
  const [endpointFields, setEndpointFields] = useState<ApiEndpointField[]>([]);
  const [schemaFieldPaths, setSchemaFieldPaths] = useState<string[]>([]);

  const [filterPresets, setFilterPresets] = useState<TrackTraceFilterPreset[]>([]);
  const [showFilterPresetModal, setShowFilterPresetModal] = useState(false);
  const [editingFilterPreset, setEditingFilterPreset] = useState<TrackTraceFilterPreset | null>(null);
  const [editingPresetDefaultFields, setEditingPresetDefaultFields] = useState<TrackTraceFilterPresetDefaultField[]>([]);

  const [templateSections, setTemplateSections] = useState<TrackTraceTemplateSection[]>([]);
  const [showTraceNumbersConfigModal, setShowTraceNumbersConfigModal] = useState(false);
  const [editingTraceNumbersSection, setEditingTraceNumbersSection] = useState<TrackTraceTemplateSection | null>(null);
  const [traceNumbersApiEndpoints, setTraceNumbersApiEndpoints] = useState<ApiSpecEndpoint[]>([]);

  const [showDocumentsConfigModal, setShowDocumentsConfigModal] = useState(false);
  const [editingDocumentsSection, setEditingDocumentsSection] = useState<TrackTraceTemplateSection | null>(null);
  const [documentConfigs, setDocumentConfigs] = useState<TrackTraceDocumentConfig[]>([]);

  const [showTimelineConfigModal, setShowTimelineConfigModal] = useState(false);
  const [editingTimelineSection, setEditingTimelineSection] = useState<TrackTraceTemplateSection | null>(null);
  const [timelineStatuses, setTimelineStatuses] = useState<TrackTraceTimelineStatus[]>([]);

  const [showBarcodeDetailsConfigModal, setShowBarcodeDetailsConfigModal] = useState(false);
  const [editingBarcodeDetailsSection, setEditingBarcodeDetailsSection] = useState<TrackTraceTemplateSection | null>(null);
  const [barcodeDetailsApiEndpoints, setBarcodeDetailsApiEndpoints] = useState<ApiSpecEndpoint[]>([]);
  const [authConfigs, setAuthConfigs] = useState<{ id: string; name: string }[]>([]);
  const [loadedBarcodeConfig, setLoadedBarcodeConfig] = useState<BarcodeDetailsSectionConfig | null>(null);

  const [showRouteSummaryConfigModal, setShowRouteSummaryConfigModal] = useState(false);
  const [showShipmentSummaryConfigModal, setShowShipmentSummaryConfigModal] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    api: false,
    options: false,
    filters: false,
    columns: false,
    defaultFields: false,
    filterPresets: false,
    pageSections: false
  });

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'template' | 'field' | 'defaultField' | 'filterPreset';
    id: string;
    name: string;
  } | null>(null);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [mainApiSettings, setMainApiSettings] = useState<{ path: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadInitialData();
    loadActiveSchema();
    loadMainApiSettings();
  }, []);

  const loadActiveSchema = async () => {
    try {
      const { data, error } = await supabase
        .from('order_entry_json_schemas')
        .select('field_paths')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (data && Array.isArray(data.field_paths)) {
        setSchemaFieldPaths(data.field_paths);
      }
    } catch (err) {
      console.error('Failed to load active schema:', err);
    }
  };

  const loadMainApiSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('api_settings')
        .select('path')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setMainApiSettings(data);
      }
    } catch (err) {
      console.error('Failed to load main API settings:', err);
    }
  };

  useEffect(() => {
    if (selectedTemplateId) {
      loadTemplate(selectedTemplateId);
    } else {
      setTemplate(null);
      setFields([]);
      setDefaultFields([]);
      setFilterPresets([]);
      setTemplateSections([]);
    }
  }, [selectedTemplateId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [templatesRes, apisRes, specsRes] = await Promise.all([
        supabase.from('track_trace_templates').select('*').order('name'),
        supabase.from('secondary_api_configs').select('*').eq('is_active', true).order('name'),
        supabase.from('api_specs').select('*').order('name')
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (apisRes.error) throw apisRes.error;
      if (specsRes.error) throw specsRes.error;

      const mappedTemplates: TrackTraceTemplate[] = (templatesRes.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        apiSourceType: t.api_source_type,
        secondaryApiId: t.secondary_api_id,
        apiSpecId: t.api_spec_id,
        apiSpecEndpointId: t.api_spec_endpoint_id,
        apiPath: t.api_path,
        httpMethod: t.http_method,
        limitOptions: t.limit_options || [10, 25, 50, 100],
        orderByOptions: t.order_by_options || [],
        defaultLimit: t.default_limit,
        defaultOrderBy: t.default_order_by,
        defaultOrderDirection: t.default_order_direction,
        isActive: t.is_active,
        showUrl: t.show_url,
        orderIdFieldName: t.order_id_field_name,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));

      setTemplates(mappedTemplates);
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
      setError(null);
      const { data: templateData, error: templateError } = await supabase
        .from('track_trace_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();

      if (templateError) throw templateError;

      if (templateData) {
        const mappedTemplate: TrackTraceTemplate = {
          id: templateData.id,
          name: templateData.name,
          description: templateData.description,
          apiSourceType: templateData.api_source_type,
          secondaryApiId: templateData.secondary_api_id,
          apiSpecId: templateData.api_spec_id,
          apiSpecEndpointId: templateData.api_spec_endpoint_id,
          apiPath: templateData.api_path,
          httpMethod: templateData.http_method,
          limitOptions: templateData.limit_options || [10, 25, 50, 100],
          orderByOptions: templateData.order_by_options || [],
          defaultLimit: templateData.default_limit,
          defaultOrderBy: templateData.default_order_by,
          defaultOrderDirection: templateData.default_order_direction,
          isActive: templateData.is_active,
          showUrl: templateData.show_url || false,
          orderIdFieldName: templateData.order_id_field_name,
          createdAt: templateData.created_at,
          updatedAt: templateData.updated_at
        };
        setTemplate(mappedTemplate);

        if (templateData.api_spec_id) {
          loadEndpointsForSpec(templateData.api_spec_id);
        }

        if (templateData.api_spec_endpoint_id) {
          loadEndpointFields(templateData.api_spec_endpoint_id);
        }

        const { data: fieldsData, error: fieldsError } = await supabase
          .from('track_trace_template_fields')
          .select('*')
          .eq('template_id', templateData.id)
          .order('field_order');

        if (fieldsError) throw fieldsError;

        const mappedFields: TrackTraceTemplateField[] = (fieldsData || []).map((f: any) => ({
          id: f.id,
          templateId: f.template_id,
          fieldType: f.field_type,
          fieldName: f.field_name,
          displayLabel: f.display_label,
          dataType: f.data_type,
          filterOperator: f.filter_operator,
          parameterType: f.parameter_type || 'query',
          apiFieldPath: f.api_field_path,
          isRequired: f.is_required,
          fieldOrder: f.field_order,
          isEnabled: f.is_enabled,
          valueMappings: f.value_mappings || [],
          createdAt: f.created_at,
          updatedAt: f.updated_at
        }));
        setFields(mappedFields);

        const { data: defaultFieldsData, error: defaultFieldsError } = await supabase
          .from('track_trace_template_default_fields')
          .select('*')
          .eq('template_id', templateData.id)
          .order('created_at');

        if (defaultFieldsError) throw defaultFieldsError;

        const mappedDefaultFields: TrackTraceTemplateDefaultField[] = (defaultFieldsData || []).map((f: any) => ({
          id: f.id,
          templateId: f.template_id,
          fieldName: f.field_name,
          parameterType: f.parameter_type,
          apiFieldPath: f.api_field_path,
          valueType: f.value_type,
          staticValue: f.static_value,
          dynamicValue: f.dynamic_value,
          operator: f.operator || 'eq',
          createdAt: f.created_at,
          updatedAt: f.updated_at
        }));
        setDefaultFields(mappedDefaultFields);

        const { data: filterPresetsData, error: filterPresetsError } = await supabase
          .from('track_trace_filter_presets')
          .select('*')
          .eq('template_id', templateData.id)
          .order('display_order');

        if (filterPresetsError) throw filterPresetsError;

        const mappedFilterPresets: TrackTraceFilterPreset[] = (filterPresetsData || []).map((p: any) => {
          let filterValues: TrackTraceFilterValue[] = [];
          const rawFilterValues = p.filter_values;
          if (Array.isArray(rawFilterValues)) {
            filterValues = rawFilterValues;
          } else if (rawFilterValues && typeof rawFilterValues === 'object') {
            filterValues = Object.entries(rawFilterValues).map(([fieldName, val]: [string, any]) => ({
              id: crypto.randomUUID(),
              fieldName,
              operator: val.operator || 'eq',
              value: val.value || ''
            }));
          }
          return {
            id: p.id,
            templateId: p.template_id,
            name: p.name,
            displayOrder: p.display_order,
            filterValues,
            isActive: p.is_active,
            createdAt: p.created_at,
            updatedAt: p.updated_at
          };
        });
        setFilterPresets(mappedFilterPresets);

        const { data: sectionsData, error: sectionsError } = await supabase
          .from('track_trace_template_sections')
          .select('*')
          .eq('template_id', templateData.id)
          .order('display_order');

        if (sectionsError) throw sectionsError;

        const mappedSections: TrackTraceTemplateSection[] = (sectionsData || []).map((s: any) => ({
          id: s.id,
          templateId: s.template_id,
          sectionType: s.section_type,
          displayOrder: s.display_order,
          isEnabled: s.is_enabled,
          config: s.config || {},
          createdAt: s.created_at,
          updatedAt: s.updated_at
        }));
        setTemplateSections(mappedSections);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load template');
    }
  };

  const loadEndpointsForSpec = async (specId: string) => {
    try {
      const { data, error } = await supabase
        .from('api_spec_endpoints')
        .select('*')
        .eq('api_spec_id', specId)
        .order('path');

      if (error) throw error;
      setApiEndpoints(data || []);
    } catch (err) {
      console.error('Failed to load endpoints:', err);
    }
  };

  const loadEndpointFields = async (endpointId: string) => {
    try {
      const { data, error } = await supabase
        .from('api_endpoint_fields')
        .select('*')
        .eq('api_spec_endpoint_id', endpointId)
        .order('field_name');

      if (error) throw error;
      setEndpointFields(data || []);
    } catch (err) {
      console.error('Failed to load endpoint fields:', err);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;

    try {
      setSaving(true);
      setError(null);

      const { data, error } = await supabase
        .from('track_trace_templates')
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
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      setShowCreateModal(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      await loadInitialData();
      setSelectedTemplateId(data.id);
      setSuccessMessage('Template created successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!template) return;

    try {
      setSaving(true);
      setError(null);

      const templateData = {
        name: template.name,
        description: template.description || null,
        api_source_type: template.apiSourceType,
        secondary_api_id: template.apiSourceType === 'secondary' ? template.secondaryApiId : null,
        api_spec_id: template.apiSpecId || null,
        api_spec_endpoint_id: template.apiSpecEndpointId || null,
        api_path: template.apiPath,
        http_method: template.httpMethod,
        limit_options: template.limitOptions,
        order_by_options: template.orderByOptions,
        default_limit: template.defaultLimit,
        default_order_by: template.defaultOrderBy || null,
        default_order_direction: template.defaultOrderDirection,
        is_active: template.isActive,
        show_url: template.showUrl,
        order_id_field_name: template.orderIdFieldName || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('track_trace_templates')
        .update(templateData)
        .eq('id', template.id);

      if (error) throw error;

      await loadInitialData();
      setSuccessMessage('Template saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleExportTemplate = async () => {
    if (!template || !selectedTemplateId) return;

    try {
      const { data: fieldsData } = await supabase
        .from('track_trace_template_fields')
        .select('*')
        .eq('template_id', selectedTemplateId)
        .order('field_order');

      const { data: defaultFieldsData } = await supabase
        .from('track_trace_template_default_fields')
        .select('*')
        .eq('template_id', selectedTemplateId)
        .order('created_at');

      const { data: presetsData } = await supabase
        .from('track_trace_filter_presets')
        .select('*')
        .eq('template_id', selectedTemplateId)
        .order('display_order');

      const presetIds = (presetsData || []).map((p: any) => p.id);
      let presetDefaultFieldsMap: Record<string, any[]> = {};
      if (presetIds.length > 0) {
        const { data: pdfData } = await supabase
          .from('track_trace_filter_preset_default_fields')
          .select('*')
          .in('preset_id', presetIds);
        for (const f of (pdfData || [])) {
          if (!presetDefaultFieldsMap[f.preset_id]) presetDefaultFieldsMap[f.preset_id] = [];
          presetDefaultFieldsMap[f.preset_id].push(f);
        }
      }

      const { data: sectionsData } = await supabase
        .from('track_trace_template_sections')
        .select('*')
        .eq('template_id', selectedTemplateId)
        .order('display_order');

      const { data: docConfigsData } = await supabase
        .from('track_trace_document_configs')
        .select('*, filters:track_trace_document_filters(*)')
        .eq('template_id', selectedTemplateId)
        .order('sort_order');

      const { data: timelineData } = await supabase
        .from('track_trace_timeline_statuses')
        .select('*, childStatuses:track_trace_timeline_child_statuses(*)')
        .eq('template_id', selectedTemplateId)
        .order('display_order');

      const exportData = {
        version: '1.0',
        type: 'track_trace_template',
        exportedAt: new Date().toISOString(),
        template: {
          name: template.name,
          description: template.description,
          apiSourceType: template.apiSourceType,
          secondaryApiId: template.secondaryApiId,
          apiSpecId: template.apiSpecId,
          apiSpecEndpointId: template.apiSpecEndpointId,
          apiPath: template.apiPath,
          httpMethod: template.httpMethod,
          limitOptions: template.limitOptions,
          orderByOptions: template.orderByOptions,
          defaultLimit: template.defaultLimit,
          defaultOrderBy: template.defaultOrderBy,
          defaultOrderDirection: template.defaultOrderDirection,
          isActive: template.isActive,
          showUrl: template.showUrl,
          orderIdFieldName: template.orderIdFieldName
        },
        fields: (fieldsData || []).map((f: any) => ({
          id: f.id,
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
          valueMappings: f.value_mappings || []
        })),
        defaultFields: (defaultFieldsData || []).map((f: any) => ({
          id: f.id,
          fieldName: f.field_name,
          parameterType: f.parameter_type,
          apiFieldPath: f.api_field_path,
          valueType: f.value_type,
          staticValue: f.static_value,
          dynamicValue: f.dynamic_value,
          operator: f.operator
        })),
        filterPresets: (presetsData || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          displayOrder: p.display_order,
          filterValues: p.filter_values || [],
          isActive: p.is_active,
          defaultFields: (presetDefaultFieldsMap[p.id] || []).map((f: any) => ({
            id: f.id,
            fieldName: f.field_name,
            parameterType: f.parameter_type,
            apiFieldPath: f.api_field_path,
            valueType: f.value_type,
            staticValue: f.static_value,
            dynamicValue: f.dynamic_value
          }))
        })),
        templateSections: (sectionsData || []).map((s: any) => ({
          id: s.id,
          sectionType: s.section_type,
          displayOrder: s.display_order,
          isEnabled: s.is_enabled,
          config: s.config || {}
        })),
        documentConfigs: (docConfigsData || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          searchApiUrl: c.search_api_url,
          getDocumentApiUrl: c.get_document_api_url,
          docIdField: c.doc_id_field,
          docNameField: c.doc_name_field,
          docTypeField: c.doc_type_field,
          docSizeField: c.doc_size_field,
          authConfigId: c.auth_config_id,
          sortOrder: c.sort_order,
          isEnabled: c.is_enabled,
          emailEnabled: c.email_enabled,
          emailSubject: c.email_subject,
          emailTemplate: c.email_template,
          vendorType: c.vendor_type || 'synergize',
          parseitBucketId: c.parseit_bucket_id,
          parseitSearchField: c.parseit_search_field || 'bill_number',
          filters: (c.filters || []).map((f: any) => ({
            id: f.id,
            fieldName: f.field_name,
            valueType: f.value_type,
            variableName: f.variable_name,
            staticValue: f.static_value,
            sortOrder: f.sort_order
          }))
        })),
        timelineStatuses: (timelineData || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          displayOrder: s.display_order,
          locationField: s.location_field,
          dateField: s.date_field,
          childStatuses: (s.childStatuses || []).map((c: any) => ({
            id: c.id,
            statusValue: c.status_value,
            displayOrder: c.display_order
          }))
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `track-trace-template-${template.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccessMessage('Template exported successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError('Export failed: ' + err.message);
    }
  };

  const handleDeleteTemplate = () => {
    if (!template) return;
    setDeleteTarget({ type: 'template', id: template.id, name: template.name });
  };

  const confirmDeleteTemplate = async () => {
    if (!template) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('track_trace_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;

      setSelectedTemplateId('');
      setTemplate(null);
      setFields([]);
      setDeleteTarget(null);
      await loadInitialData();
      setSuccessMessage('Template deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = (fieldType: 'filter' | 'select') => {
    const newField: TrackTraceTemplateField = {
      id: '',
      templateId: template?.id || '',
      fieldType,
      fieldName: '',
      displayLabel: '',
      dataType: 'string',
      filterOperator: fieldType === 'filter' ? 'eq' : undefined,
      parameterType: fieldType === 'filter' ? '$filter' : '$select',
      apiFieldPath: undefined,
      isRequired: false,
      fieldOrder: fields.filter(f => f.fieldType === fieldType).length,
      isEnabled: true,
      createdAt: '',
      updatedAt: ''
    };
    setEditingField(newField);
    setShowFieldModal(true);
  };

  const handleEditField = (field: TrackTraceTemplateField) => {
    setEditingField({ ...field });
    setShowFieldModal(true);
  };

  const handleSaveField = async () => {
    if (!editingField || !template?.id) return;

    try {
      setSaving(true);
      setError(null);

      const fieldData = {
        template_id: template.id,
        field_type: editingField.fieldType,
        field_name: editingField.fieldName,
        display_label: editingField.displayLabel,
        data_type: editingField.dataType,
        filter_operator: editingField.fieldType === 'filter' ? editingField.filterOperator : null,
        parameter_type: editingField.parameterType || 'query',
        api_field_path: editingField.apiFieldPath || null,
        is_required: editingField.isRequired,
        field_order: editingField.fieldOrder,
        is_enabled: editingField.isEnabled,
        value_mappings: editingField.valueMappings || [],
        updated_at: new Date().toISOString()
      };

      if (editingField.id) {
        const { error } = await supabase
          .from('track_trace_template_fields')
          .update(fieldData)
          .eq('id', editingField.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('track_trace_template_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      setShowFieldModal(false);
      setEditingField(null);
      await loadTemplate(selectedTemplateId);
    } catch (err: any) {
      setError(err.message || 'Failed to save field');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    setDeleteTarget({ type: 'field', id: fieldId, name: field.displayLabel || field.fieldName });
  };

  const confirmDeleteField = async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('track_trace_template_fields')
        .delete()
        .eq('id', fieldId);
      if (error) throw error;
      setDeleteTarget(null);
      await loadTemplate(selectedTemplateId);
    } catch (err: any) {
      setError(err.message || 'Failed to delete field');
    }
  };

  const handleAddDefaultField = () => {
    const newField: TrackTraceTemplateDefaultField = {
      id: '',
      templateId: template?.id || '',
      fieldName: '',
      parameterType: 'query',
      apiFieldPath: undefined,
      valueType: 'static',
      staticValue: '',
      dynamicValue: undefined,
      operator: 'eq',
      createdAt: '',
      updatedAt: ''
    };
    setEditingDefaultField(newField);
    setShowDefaultFieldModal(true);
  };

  const handleEditDefaultField = (field: TrackTraceTemplateDefaultField) => {
    setEditingDefaultField({ ...field });
    setShowDefaultFieldModal(true);
  };

  const handleSaveDefaultField = async () => {
    if (!editingDefaultField || !template?.id) return;

    try {
      setSaving(true);
      setError(null);

      const fieldData = {
        template_id: template.id,
        field_name: editingDefaultField.fieldName,
        parameter_type: editingDefaultField.parameterType,
        api_field_path: editingDefaultField.apiFieldPath || null,
        value_type: editingDefaultField.valueType,
        static_value: editingDefaultField.valueType === 'static' ? editingDefaultField.staticValue : null,
        dynamic_value: editingDefaultField.valueType === 'dynamic' ? editingDefaultField.dynamicValue : null,
        operator: editingDefaultField.operator || 'eq',
        updated_at: new Date().toISOString()
      };

      if (editingDefaultField.id) {
        const { error } = await supabase
          .from('track_trace_template_default_fields')
          .update(fieldData)
          .eq('id', editingDefaultField.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('track_trace_template_default_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      setShowDefaultFieldModal(false);
      setEditingDefaultField(null);
      await loadTemplate(selectedTemplateId);
      setSuccessMessage('Default field saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save default field');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDefaultField = (fieldId: string) => {
    const field = defaultFields.find(f => f.id === fieldId);
    if (!field) return;
    setDeleteTarget({ type: 'defaultField', id: fieldId, name: field.fieldName });
  };

  const confirmDeleteDefaultField = async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('track_trace_template_default_fields')
        .delete()
        .eq('id', fieldId);
      if (error) throw error;
      setDeleteTarget(null);
      await loadTemplate(selectedTemplateId);
      setSuccessMessage('Default field deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete default field');
    }
  };

  const handleAddFilterPreset = () => {
    const newPreset: TrackTraceFilterPreset = {
      id: '',
      templateId: template?.id || '',
      name: '',
      displayOrder: filterPresets.length,
      filterValues: [],
      isActive: true,
      createdAt: '',
      updatedAt: ''
    };
    setEditingFilterPreset(newPreset);
    setEditingPresetDefaultFields([]);
    setShowFilterPresetModal(true);
  };

  const handleEditFilterPreset = async (preset: TrackTraceFilterPreset) => {
    setEditingFilterPreset({ ...preset });
    setEditingPresetDefaultFields([]);
    setShowFilterPresetModal(true);

    if (preset.id) {
      try {
        const { data, error } = await supabase
          .from('track_trace_filter_preset_default_fields')
          .select('*')
          .eq('preset_id', preset.id)
          .order('created_at');

        if (error) throw error;

        const mappedFields: TrackTraceFilterPresetDefaultField[] = (data || []).map((f: any) => ({
          id: f.id,
          presetId: f.preset_id,
          fieldName: f.field_name,
          parameterType: f.parameter_type,
          apiFieldPath: f.api_field_path,
          valueType: f.value_type,
          staticValue: f.static_value,
          dynamicValue: f.dynamic_value,
          createdAt: f.created_at,
          updatedAt: f.updated_at
        }));
        setEditingPresetDefaultFields(mappedFields);
      } catch (err) {
        console.error('Failed to load preset default fields:', err);
      }
    }
  };

  const handleSaveFilterPreset = async () => {
    if (!editingFilterPreset || !template?.id) return;

    try {
      setSaving(true);
      setError(null);

      const presetData = {
        template_id: template.id,
        name: editingFilterPreset.name,
        display_order: editingFilterPreset.displayOrder,
        filter_values: editingFilterPreset.filterValues,
        is_active: editingFilterPreset.isActive,
        updated_at: new Date().toISOString()
      };

      let presetId = editingFilterPreset.id;

      if (editingFilterPreset.id) {
        const { error } = await supabase
          .from('track_trace_filter_presets')
          .update(presetData)
          .eq('id', editingFilterPreset.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('track_trace_filter_presets')
          .insert([{ ...presetData, created_at: new Date().toISOString() }])
          .select('id')
          .single();
        if (error) throw error;
        presetId = data.id;
      }

      if (presetId) {
        await supabase
          .from('track_trace_filter_preset_default_fields')
          .delete()
          .eq('preset_id', presetId);

        if (editingPresetDefaultFields.length > 0) {
          const fieldsToInsert = editingPresetDefaultFields.map(field => ({
            preset_id: presetId,
            field_name: field.fieldName,
            parameter_type: field.parameterType,
            api_field_path: field.apiFieldPath || null,
            value_type: field.valueType,
            static_value: field.staticValue || null,
            dynamic_value: field.dynamicValue || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

          const { error: fieldsError } = await supabase
            .from('track_trace_filter_preset_default_fields')
            .insert(fieldsToInsert);
          if (fieldsError) throw fieldsError;
        }
      }

      setShowFilterPresetModal(false);
      setEditingFilterPreset(null);
      setEditingPresetDefaultFields([]);
      await loadTemplate(selectedTemplateId);
      setSuccessMessage('Quick filter button saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save quick filter button');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFilterPreset = (presetId: string) => {
    const preset = filterPresets.find(p => p.id === presetId);
    if (!preset) return;
    setDeleteTarget({ type: 'filterPreset', id: presetId, name: preset.name });
  };

  const confirmDeleteFilterPreset = async (presetId: string) => {
    try {
      const { error } = await supabase
        .from('track_trace_filter_presets')
        .delete()
        .eq('id', presetId);
      if (error) throw error;
      setDeleteTarget(null);
      await loadTemplate(selectedTemplateId);
      setSuccessMessage('Quick filter button deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete quick filter button');
    }
  };

  const handleAddOrderByOption = () => {
    if (!template) return;
    setTemplate({
      ...template,
      orderByOptions: [
        ...template.orderByOptions,
        { field: '', label: '', defaultDirection: 'desc' }
      ]
    });
  };

  const handleUpdateOrderByOption = (index: number, updates: Partial<TrackTraceOrderByOption>) => {
    if (!template) return;
    const newOptions = [...template.orderByOptions];
    newOptions[index] = { ...newOptions[index], ...updates };
    setTemplate({ ...template, orderByOptions: newOptions });
  };

  const handleRemoveOrderByOption = (index: number) => {
    if (!template) return;
    const newOptions = template.orderByOptions.filter((_, i) => i !== index);
    setTemplate({ ...template, orderByOptions: newOptions });
  };

  const handleColumnReorder = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const selectFields = fields.filter(f => f.fieldType === 'select');
    const oldIndex = selectFields.findIndex(f => f.id === active.id);
    const newIndex = selectFields.findIndex(f => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedSelectFields = arrayMove(selectFields, oldIndex, newIndex);
    const filterFieldsList = fields.filter(f => f.fieldType === 'filter');
    const updatedSelectFields = reorderedSelectFields.map((field, index) => ({
      ...field,
      fieldOrder: index
    }));

    setFields([...filterFieldsList, ...updatedSelectFields]);

    try {
      const updates = updatedSelectFields.map(field =>
        supabase
          .from('track_trace_template_fields')
          .update({ field_order: field.fieldOrder, updated_at: new Date().toISOString() })
          .eq('id', field.id)
      );
      await Promise.all(updates);
    } catch (err) {
      console.error('Failed to save column order:', err);
      setError('Failed to save column order');
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const sectionTypeLabels: Record<TrackTraceTemplateSectionType, string> = {
    shipment_summary: 'Shipment Summary',
    shipment_timeline: 'Shipment Timeline',
    route_summary: 'Route Summary',
    trace_numbers: 'Trace Numbers',
    barcode_details: 'Barcode Details',
    documents: 'Documents'
  };

  const handleSectionReorder = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = templateSections.findIndex(s => s.id === active.id);
    const newIndex = templateSections.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedSections = arrayMove(templateSections, oldIndex, newIndex);
    const updatedSections = reorderedSections.map((section, index) => ({
      ...section,
      displayOrder: index + 1
    }));

    setTemplateSections(updatedSections);

    try {
      const updates = updatedSections.map(section =>
        supabase
          .from('track_trace_template_sections')
          .update({ display_order: section.displayOrder, updated_at: new Date().toISOString() })
          .eq('id', section.id)
      );
      await Promise.all(updates);
    } catch (err) {
      console.error('Failed to save section order:', err);
      setError('Failed to save section order');
    }
  };

  const handleToggleSectionEnabled = async (sectionId: string) => {
    const section = templateSections.find(s => s.id === sectionId);
    if (!section) return;

    const newEnabled = !section.isEnabled;
    setTemplateSections(prev =>
      prev.map(s => s.id === sectionId ? { ...s, isEnabled: newEnabled } : s)
    );

    try {
      const { error } = await supabase
        .from('track_trace_template_sections')
        .update({ is_enabled: newEnabled, updated_at: new Date().toISOString() })
        .eq('id', sectionId);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to toggle section:', err);
      setError('Failed to toggle section');
      setTemplateSections(prev =>
        prev.map(s => s.id === sectionId ? { ...s, isEnabled: !newEnabled } : s)
      );
    }
  };

  const handleConfigureSection = (sectionId: string) => {
    const section = templateSections.find(s => s.id === sectionId);
    if (!section) return;

    if (section.sectionType === 'trace_numbers') {
      setEditingTraceNumbersSection(section);
      const config = section.config as TraceNumbersSectionConfig;
      if (config?.apiSpecId) {
        loadTraceNumbersEndpoints(config.apiSpecId);
      }
      setShowTraceNumbersConfigModal(true);
    } else if (section.sectionType === 'documents') {
      setEditingDocumentsSection(section);
      loadDocumentConfigs();
      setShowDocumentsConfigModal(true);
    } else if (section.sectionType === 'shipment_timeline') {
      setEditingTimelineSection(section);
      loadTimelineStatuses();
      setShowTimelineConfigModal(true);
    } else if (section.sectionType === 'barcode_details') {
      setEditingBarcodeDetailsSection(section);
      loadAuthConfigs();
      loadBarcodeConfigWithFields(section).then(loadedConfig => {
        setLoadedBarcodeConfig(loadedConfig);
        if (loadedConfig.apiSpecId) {
          loadBarcodeDetailsEndpoints(loadedConfig.apiSpecId);
        }
        setShowBarcodeDetailsConfigModal(true);
      });
    } else if (section.sectionType === 'route_summary') {
      setShowRouteSummaryConfigModal(true);
    } else if (section.sectionType === 'shipment_summary') {
      setShowShipmentSummaryConfigModal(true);
    }
  };

  const loadDocumentConfigs = async () => {
    if (!template?.id) return;
    try {
      const { data, error } = await supabase
        .from('track_trace_document_configs')
        .select(`
          *,
          filters:track_trace_document_filters(*)
        `)
        .eq('template_id', template.id)
        .order('sort_order');

      if (error) throw error;

      const mappedConfigs: TrackTraceDocumentConfig[] = (data || []).map((c: any) => ({
        id: c.id,
        templateId: c.template_id,
        name: c.name,
        searchApiUrl: c.search_api_url,
        getDocumentApiUrl: c.get_document_api_url,
        docIdField: c.doc_id_field,
        docNameField: c.doc_name_field,
        docTypeField: c.doc_type_field,
        docSizeField: c.doc_size_field,
        authConfigId: c.auth_config_id,
        sortOrder: c.sort_order,
        isEnabled: c.is_enabled,
        emailEnabled: c.email_enabled || false,
        emailSubject: c.email_subject,
        emailTemplate: c.email_template,
        vendorType: c.vendor_type || 'synergize',
        parseitBucketId: c.parseit_bucket_id,
        parseitSearchField: c.parseit_search_field || 'bill_number',
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        filters: (c.filters || []).map((f: any) => ({
          id: f.id,
          documentConfigId: f.document_config_id,
          fieldName: f.field_name,
          valueType: f.value_type,
          variableName: f.variable_name,
          staticValue: f.static_value,
          sortOrder: f.sort_order,
          createdAt: f.created_at,
          updatedAt: f.updated_at
        })).sort((a: any, b: any) => a.sortOrder - b.sortOrder)
      }));

      setDocumentConfigs(mappedConfigs);
    } catch (err) {
      console.error('Failed to load document configs:', err);
    }
  };

  const loadTimelineStatuses = async () => {
    if (!template?.id) return;
    try {
      const { data, error } = await supabase
        .from('track_trace_timeline_statuses')
        .select(`
          *,
          childStatuses:track_trace_timeline_child_statuses(*)
        `)
        .eq('template_id', template.id)
        .order('display_order');

      if (error) throw error;

      const mappedStatuses: TrackTraceTimelineStatus[] = (data || []).map((s: any) => ({
        id: s.id,
        templateId: s.template_id,
        name: s.name,
        displayOrder: s.display_order,
        locationField: s.location_field,
        dateField: s.date_field,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        childStatuses: (s.childStatuses || []).map((c: any) => ({
          id: c.id,
          timelineStatusId: c.timeline_status_id,
          statusValue: c.status_value,
          displayOrder: c.display_order,
          createdAt: c.created_at
        })).sort((a: any, b: any) => a.displayOrder - b.displayOrder)
      }));

      setTimelineStatuses(mappedStatuses);
    } catch (err) {
      console.error('Failed to load timeline statuses:', err);
    }
  };

  const loadTraceNumbersEndpoints = async (specId: string) => {
    try {
      const { data, error } = await supabase
        .from('api_spec_endpoints')
        .select('*')
        .eq('api_spec_id', specId)
        .order('path');

      if (error) throw error;
      setTraceNumbersApiEndpoints(data || []);
    } catch (err) {
      console.error('Failed to load trace numbers endpoints:', err);
    }
  };

  const loadBarcodeDetailsEndpoints = async (specId: string) => {
    try {
      const { data, error } = await supabase
        .from('api_spec_endpoints')
        .select('*')
        .eq('api_spec_id', specId)
        .order('path');

      if (error) throw error;
      setBarcodeDetailsApiEndpoints(data || []);
    } catch (err) {
      console.error('Failed to load barcode details endpoints:', err);
    }
  };

  const loadAuthConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('api_auth_config')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAuthConfigs(data || []);
    } catch (err) {
      console.error('Failed to load auth configs:', err);
    }
  };

  const loadBarcodeConfigWithFields = async (section: TrackTraceTemplateSection): Promise<BarcodeDetailsSectionConfig> => {
    const baseConfig = (section.config || {}) as BarcodeDetailsSectionConfig;

    if (!template?.id) {
      return { ...baseConfig, fieldMappings: baseConfig.fieldMappings || [] };
    }

    try {
      const { data: barcodeConfig, error } = await supabase
        .from('track_trace_barcode_configs')
        .select(`
          *,
          fields:track_trace_barcode_fields(
            id,
            label,
            api_field,
            show_total,
            is_required,
            display_order,
            group_id,
            group_separator,
            value_suffix
          ),
          image_config:track_trace_barcode_image_configs(
            api_url,
            source_field,
            auth_config_id
          )
        `)
        .eq('template_id', template.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load barcode config:', error);
        return { ...baseConfig, fieldMappings: [] };
      }

      if (!barcodeConfig) {
        return { ...baseConfig, fieldMappings: [] };
      }

      const fieldMappings = (barcodeConfig.fields || [])
        .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
        .map((f: any) => ({
          label: f.label,
          apiField: f.api_field,
          showTotal: f.show_total || false,
          isRequired: f.is_required || false,
          displayOrder: f.display_order || 0,
          groupId: f.group_id || undefined,
          groupSeparator: f.group_separator || undefined,
          valueSuffix: f.value_suffix || undefined
        }));

      const imageConfig = barcodeConfig.image_config?.[0] ? {
        apiUrl: barcodeConfig.image_config[0].api_url || '',
        sourceField: barcodeConfig.image_config[0].source_field || '',
        authConfigId: barcodeConfig.image_config[0].auth_config_id || undefined
      } : undefined;

      return {
        apiSourceType: barcodeConfig.api_source_type || baseConfig.apiSourceType || 'main',
        secondaryApiId: barcodeConfig.secondary_api_id || baseConfig.secondaryApiId || '',
        apiSpecId: barcodeConfig.api_spec_id || baseConfig.apiSpecId || '',
        apiSpecEndpointId: barcodeConfig.api_spec_endpoint_id || baseConfig.apiSpecEndpointId || '',
        responseArrayPath: barcodeConfig.response_array_path || baseConfig.responseArrayPath || '',
        nestedArrayPath: barcodeConfig.nested_array_path || baseConfig.nestedArrayPath || '',
        secondaryEndpointId: barcodeConfig.secondary_endpoint_id || baseConfig.secondaryEndpointId || '',
        secondaryParamField: barcodeConfig.secondary_param_field || baseConfig.secondaryParamField || '',
        fieldMappings,
        imageConfig
      };
    } catch (err) {
      console.error('Failed to load barcode config with fields:', err);
      return { ...baseConfig, fieldMappings: [] };
    }
  };

  const handleSaveBarcodeDetailsConfig = async (config: BarcodeDetailsSectionConfig) => {
    if (!editingBarcodeDetailsSection || !template?.id) return;

    try {
      setSaving(true);

      const { error: sectionError } = await supabase
        .from('track_trace_template_sections')
        .update({
          config: {
            apiSourceType: config.apiSourceType,
            secondaryApiId: config.secondaryApiId,
            apiSpecId: config.apiSpecId,
            apiSpecEndpointId: config.apiSpecEndpointId,
            responseArrayPath: config.responseArrayPath,
            nestedArrayPath: config.nestedArrayPath
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', editingBarcodeDetailsSection.id);

      if (sectionError) throw sectionError;

      const { data: existingConfig } = await supabase
        .from('track_trace_barcode_configs')
        .select('id')
        .eq('template_id', template.id)
        .maybeSingle();

      let barcodeConfigId: string;

      if (existingConfig) {
        barcodeConfigId = existingConfig.id;
        const { error: updateError } = await supabase
          .from('track_trace_barcode_configs')
          .update({
            api_source_type: config.apiSourceType,
            secondary_api_id: config.secondaryApiId || null,
            api_spec_id: config.apiSpecId || null,
            api_spec_endpoint_id: config.apiSpecEndpointId || null,
            response_array_path: config.responseArrayPath || null,
            nested_array_path: config.nestedArrayPath || null,
            secondary_endpoint_id: config.secondaryEndpointId || null,
            secondary_param_field: config.secondaryParamField || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingConfig.id);

        if (updateError) throw updateError;
      } else {
        const { data: newConfig, error: insertError } = await supabase
          .from('track_trace_barcode_configs')
          .insert({
            template_id: template.id,
            api_source_type: config.apiSourceType,
            secondary_api_id: config.secondaryApiId || null,
            api_spec_id: config.apiSpecId || null,
            api_spec_endpoint_id: config.apiSpecEndpointId || null,
            response_array_path: config.responseArrayPath || null,
            nested_array_path: config.nestedArrayPath || null,
            secondary_endpoint_id: config.secondaryEndpointId || null,
            secondary_param_field: config.secondaryParamField || null
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        barcodeConfigId = newConfig.id;
      }

      await supabase
        .from('track_trace_barcode_fields')
        .delete()
        .eq('barcode_config_id', barcodeConfigId);

      if (config.fieldMappings.length > 0) {
        const { error: fieldsError } = await supabase
          .from('track_trace_barcode_fields')
          .insert(
            config.fieldMappings.map((mapping, index) => ({
              barcode_config_id: barcodeConfigId,
              label: mapping.label,
              api_field: mapping.apiField,
              show_total: mapping.showTotal,
              is_required: mapping.isRequired || false,
              display_order: index,
              group_id: mapping.groupId || null,
              group_separator: mapping.groupSeparator || null,
              value_suffix: mapping.valueSuffix || null
            }))
          );

        if (fieldsError) throw fieldsError;
      }

      await supabase
        .from('track_trace_barcode_image_configs')
        .delete()
        .eq('barcode_config_id', barcodeConfigId);

      if (config.imageConfig && config.imageConfig.apiUrl) {
        const { error: imageError } = await supabase
          .from('track_trace_barcode_image_configs')
          .insert({
            barcode_config_id: barcodeConfigId,
            api_url: config.imageConfig.apiUrl,
            auth_config_id: config.imageConfig.authConfigId || null,
            source_field: config.imageConfig.sourceField || ''
          });

        if (imageError) throw imageError;
      }

      await loadTemplate(template.id);
      setShowBarcodeDetailsConfigModal(false);
      setEditingBarcodeDetailsSection(null);
      setSuccessMessage('Barcode Details configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save barcode details config:', err);
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTraceNumbersConfig = async (config: TraceNumbersSectionConfig) => {
    if (!editingTraceNumbersSection) return;

    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('track_trace_template_sections')
        .update({
          config,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingTraceNumbersSection.id);

      if (error) throw error;

      setTemplateSections(prev =>
        prev.map(s => s.id === editingTraceNumbersSection.id ? { ...s, config } : s)
      );

      setShowTraceNumbersConfigModal(false);
      setEditingTraceNumbersSection(null);
      setSuccessMessage('Trace Numbers configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const buildPreviewUrl = (): string => {
    if (!template) return '';

    let baseUrl = '';
    if (template.apiSourceType === 'secondary' && template.secondaryApiId) {
      const secondaryApi = secondaryApis.find(a => a.id === template.secondaryApiId);
      baseUrl = secondaryApi?.baseUrl || '';
    } else {
      baseUrl = mainApiSettings?.path || '';
    }

    if (!baseUrl && !template.apiPath) return '';

    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = template.apiPath.startsWith('/') ? template.apiPath : `/${template.apiPath}`;
    let url = normalizedBase + normalizedPath;

    const queryParams: string[] = [];
    const filterParts: string[] = [];

    const enabledFilterFields = fields.filter(f => f.fieldType === 'filter' && f.isEnabled && f.parameterType === '$filter');
    enabledFilterFields.forEach(field => {
      const fieldName = field.apiFieldPath || field.fieldName;
      const operator = field.filterOperator || 'eq';
      if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
        filterParts.push(`${operator}(${fieldName}, '{${field.displayLabel}}')`);
      } else {
        filterParts.push(`${fieldName} ${operator} '{${field.displayLabel}}'`);
      }
    });

    const queryDefaultFields = defaultFields.filter(f => f.parameterType === 'query');
    queryDefaultFields.forEach(field => {
      const value = field.valueType === 'static' ? field.staticValue : `{${field.dynamicValue}}`;
      if (!value) return;
      const rawFieldName = field.apiFieldPath || field.fieldName;
      const fieldName = rawFieldName.replace(/^\[.*?\]\s*/, '');
      const operator = field.operator || 'eq';
      if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
        filterParts.push(`${operator}(${fieldName}, '${value}')`);
      } else if (operator === 'not contains') {
        filterParts.push(`not contains(${fieldName}, '${value}')`);
      } else if (operator === 'not startswith') {
        filterParts.push(`not startswith(${fieldName}, '${value}')`);
      } else if (operator === 'not endswith') {
        filterParts.push(`not endswith(${fieldName}, '${value}')`);
      } else {
        filterParts.push(`${fieldName} ${operator} '${value}'`);
      }
    });

    if (filterParts.length > 0) {
      queryParams.push(`$filter=${filterParts.join(' and ')}`);
    }

    const enabledSelectFields = fields.filter(f => f.fieldType === 'select' && f.isEnabled);
    if (enabledSelectFields.length > 0) {
      const selectFieldNames = enabledSelectFields.map(f => f.apiFieldPath || f.fieldName);
      queryParams.push(`$select=${selectFieldNames.join(',')}`);
    }

    if (template.defaultLimit) {
      queryParams.push(`$limit=${template.defaultLimit}`);
    }

    if (template.defaultOrderBy) {
      queryParams.push(`$orderby=${template.defaultOrderBy} ${template.defaultOrderDirection || 'desc'}`);
    }

    fields.filter(f => f.fieldType === 'filter' && f.isEnabled && f.parameterType === 'query').forEach(field => {
      queryParams.push(`${field.fieldName}={${field.displayLabel}}`);
    });

    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }

    return url;
  };

  if (loading) {
    return <FormSkeleton fields={6} />;
  }

  const filterFields = fields.filter(f => f.fieldType === 'filter');
  const selectFields = fields.filter(f => f.fieldType === 'select');

  return (
    <div className="space-y-6">
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

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Track & Trace Templates</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Create reusable templates that can be assigned to multiple clients
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {selectedTemplateId && template && (
              <>
                <button
                  onClick={handleDeleteTemplate}
                  disabled={saving}
                  className="flex items-center px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Template
                </button>
                <button
                  onClick={() => setShowPreviewModal(true)}
                  disabled={filterFields.length === 0 && selectFields.length === 0}
                  className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </button>
                <button
                  onClick={handleExportTemplate}
                  className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={saving || !template.name.trim()}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </>
            )}
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Template
          </label>
          <Select
            value={selectedTemplateId || '__none__'}
            onValueChange={(value) => setSelectedTemplateId(value === '__none__' ? '' : value)}
            options={[
              { value: '__none__', label: 'Select a template...' },
              ...templates.map(t => ({ value: t.id, label: `${t.name}${t.isActive ? '' : ' (Inactive)'}` }))
            ]}
            searchable
          />
        </div>

        {selectedTemplateId && template && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={template.name}
                    onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={template.description || ''}
                    onChange={(e) => setTemplate({ ...template, description: e.target.value })}
                    placeholder="Optional description"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSection('api')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <Settings className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">API Configuration</span>
                  </div>
                  {expandedSections.api ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.api && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          API Source
                        </label>
                        <Select
                          value={template.apiSourceType}
                          onValueChange={(value) => setTemplate({ ...template, apiSourceType: value as 'main' | 'secondary' })}
                          options={[
                            { value: 'main', label: 'Main API' },
                            { value: 'secondary', label: 'Secondary API' }
                          ]}
                        />
                      </div>

                      {template.apiSourceType === 'secondary' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Secondary API
                          </label>
                          <Select
                            value={template.secondaryApiId || '__none__'}
                            onValueChange={(value) => setTemplate({ ...template, secondaryApiId: value === '__none__' ? undefined : value })}
                            options={[
                              { value: '__none__', label: 'Select API...' },
                              ...secondaryApis.map(a => ({ value: a.id || '__none__', label: a.name }))
                            ]}
                            searchable
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          API Spec (Optional)
                        </label>
                        <Select
                          value={template.apiSpecId || '__none__'}
                          onValueChange={(value) => {
                            const specId = value === '__none__' ? undefined : value;
                            setTemplate({ ...template, apiSpecId: specId, apiSpecEndpointId: undefined });
                            if (specId) {
                              loadEndpointsForSpec(specId);
                            } else {
                              setApiEndpoints([]);
                              setEndpointFields([]);
                            }
                          }}
                          options={[
                            { value: '__none__', label: 'None (Manual entry)' },
                            ...apiSpecs.map(s => ({ value: s.id, label: s.name }))
                          ]}
                          searchable
                        />
                      </div>

                      {template.apiSpecId && apiEndpoints.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Endpoint
                          </label>
                          <Select
                            value={template.apiSpecEndpointId || '__none__'}
                            onValueChange={(value) => {
                              const endpointId = value === '__none__' ? undefined : value;
                              const endpoint = apiEndpoints.find(e => e.id === endpointId);
                              setTemplate({
                                ...template,
                                apiSpecEndpointId: endpointId,
                                apiPath: endpoint?.path || template.apiPath,
                                httpMethod: endpoint?.method?.toUpperCase() || template.httpMethod
                              });
                              if (endpointId) {
                                loadEndpointFields(endpointId);
                              } else {
                                setEndpointFields([]);
                              }
                            }}
                            options={[
                              { value: '__none__', label: 'Select endpoint...' },
                              ...apiEndpoints.map(e => ({
                                value: e.id,
                                label: `${e.method.toUpperCase()} ${e.path}`
                              }))
                            ]}
                            searchable
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          HTTP Method
                        </label>
                        <Select
                          value={template.httpMethod}
                          onValueChange={(value) => setTemplate({ ...template, httpMethod: value })}
                          options={[
                            { value: 'GET', label: 'GET' },
                            { value: 'POST', label: 'POST' }
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          API Path
                        </label>
                        <input
                          type="text"
                          value={template.apiPath}
                          onChange={(e) => setTemplate({ ...template, apiPath: e.target.value })}
                          placeholder="/api/orders"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Order ID Field Name
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          (Field used for navigation to shipment details)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={template.orderIdFieldName || ''}
                        onChange={(e) => setTemplate({ ...template, orderIdFieldName: e.target.value })}
                        placeholder="orderId"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        This field does not need to be displayed in the grid
                      </p>
                    </div>

                    <div className="flex items-center mt-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={template.isActive}
                          onChange={(e) => setTemplate({ ...template, isActive: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Template is active (available for assignment)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSection('options')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <Search className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">Query Options</span>
                  </div>
                  {expandedSections.options ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.options && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Limit Options (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={template.limitOptions.join(', ')}
                          onChange={(e) => {
                            const values = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                            setTemplate({ ...template, limitOptions: values.length > 0 ? values : [10, 25, 50, 100] });
                          }}
                          placeholder="10, 25, 50, 100"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Default Limit
                        </label>
                        <Select
                          value={String(template.defaultLimit)}
                          onValueChange={(value) => setTemplate({ ...template, defaultLimit: parseInt(value) })}
                          options={template.limitOptions.map(l => ({ value: String(l), label: String(l) }))}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Order By Options
                        </label>
                        <button
                          onClick={handleAddOrderByOption}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          + Add Option
                        </button>
                      </div>

                      {template.orderByOptions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No order by options configured</p>
                      ) : (
                        <div className="space-y-2">
                          {template.orderByOptions.map((opt, idx) => (
                            <div key={idx} className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={opt.field}
                                onChange={(e) => handleUpdateOrderByOption(idx, { field: e.target.value })}
                                placeholder="Field name"
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) => handleUpdateOrderByOption(idx, { label: e.target.value })}
                                placeholder="Display label"
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                              <select
                                value={opt.defaultDirection}
                                onChange={(e) => handleUpdateOrderByOption(idx, { defaultDirection: e.target.value as 'asc' | 'desc' })}
                                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              >
                                <option value="asc">ASC</option>
                                <option value="desc">DESC</option>
                              </select>
                              <button
                                onClick={() => handleRemoveOrderByOption(idx)}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {template.orderByOptions.length > 0 && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Default Order By
                          </label>
                          <Select
                            value={template.defaultOrderBy || '__none__'}
                            onValueChange={(value) => setTemplate({ ...template, defaultOrderBy: value === '__none__' ? undefined : value })}
                            options={[
                              { value: '__none__', label: 'None' },
                              ...template.orderByOptions.filter(o => o.field).map(o => ({ value: o.field, label: o.label || o.field }))
                            ]}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Default Direction
                          </label>
                          <Select
                            value={template.defaultOrderDirection}
                            onValueChange={(value) => setTemplate({ ...template, defaultOrderDirection: value as 'asc' | 'desc' })}
                            options={[
                              { value: 'asc', label: 'Ascending' },
                              { value: 'desc', label: 'Descending' }
                            ]}
                          />
                        </div>
                      </div>
                    )}

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={template.showUrl}
                          onChange={(e) => setTemplate({ ...template, showUrl: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Show URL</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Display the API request URL on the Track & Trace page for debugging</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSection('filters')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <Filter className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Filter Fields ({filterFields.length})
                    </span>
                  </div>
                  {expandedSections.filters ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.filters && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => handleAddField('filter')}
                        className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Filter
                      </button>
                    </div>

                    {filterFields.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
                        No filter fields configured. Add filters to allow searching.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filterFields.map(field => (
                          <div
                            key={field.id}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {field.displayLabel}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                    {field.dataType}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                                    {field.filterOperator}
                                  </span>
                                  {field.isRequired && (
                                    <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                                      Required
                                    </span>
                                  )}
                                  {!field.isEnabled && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-500 rounded">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  API Field: {field.fieldName}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditField(field)}
                                className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteField(field.id)}
                                className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                              >
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

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSection('columns')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <Columns className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Result Columns ({selectFields.length})
                    </span>
                  </div>
                  {expandedSections.columns ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.columns && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => handleAddField('select')}
                        className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Column
                      </button>
                    </div>

                    {selectFields.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
                        No columns configured. Add columns to display in results.
                      </p>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleColumnReorder}
                      >
                        <SortableContext
                          items={selectFields.map(f => f.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {selectFields.map(field => (
                              <SortableColumnItem
                                key={field.id}
                                field={field}
                                onEdit={handleEditField}
                                onDelete={handleDeleteField}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSection('defaultFields')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <Lock className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Default Fields ({defaultFields.length})
                    </span>
                  </div>
                  {expandedSections.defaultFields ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.defaultFields && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Default fields are automatically sent with every API request. Client users cannot see or modify these values.
                    </p>
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={handleAddDefaultField}
                        className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Default Field
                      </button>
                    </div>

                    {defaultFields.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
                        No default fields configured. Add fields to pass hidden values to the API.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {defaultFields.map(field => (
                          <div
                            key={field.id}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <Lock className="h-4 w-4 text-gray-400" />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {field.fieldName}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                                    {field.parameterType}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    field.valueType === 'dynamic'
                                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                      : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                                  }`}>
                                    {field.valueType === 'dynamic' ? 'Dynamic' : 'Static'}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {field.apiFieldPath && `API Field: ${field.apiFieldPath} | `}
                                  Value: {field.valueType === 'dynamic' ? field.dynamicValue : field.staticValue}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditDefaultField(field)}
                                className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteDefaultField(field.id)}
                                className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                              >
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

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => toggleSection('filterPresets')}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <Zap className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Quick Filter Buttons ({filterPresets.length})
                    </span>
                  </div>
                  {expandedSections.filterPresets ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.filterPresets && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Quick filter buttons appear at the top of the Track & Trace page. When clicked, they apply pre-configured filter values that customers cannot change.
                    </p>
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={handleAddFilterPreset}
                        className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Quick Filter
                      </button>
                    </div>

                    {filterPresets.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
                        No quick filter buttons configured. Add buttons to give customers preset search options.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filterPresets.map(preset => (
                          <div
                            key={preset.id}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <Zap className="h-4 w-4 text-amber-500" />
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {preset.name}
                                  </span>
                                  {!preset.isActive && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-500 rounded">
                                      Inactive
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {preset.filterValues.length} filter value(s) configured
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditFilterPreset(preset)}
                                className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteFilterPreset(preset.id)}
                                className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                              >
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

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('pageSections')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center space-x-3">
                    <Settings className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Page Sections ({templateSections.filter(s => s.isEnabled).length}/{templateSections.length} visible)
                    </span>
                  </div>
                  {expandedSections.pageSections ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {expandedSections.pageSections && (
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Configure which sections appear on the shipment details page and their display order. Drag to reorder sections.
                    </p>

                    {templateSections.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
                        No page sections configured for this template.
                      </p>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleSectionReorder}
                      >
                        <SortableContext
                          items={templateSections.map(s => s.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {templateSections.map(section => (
                              <SortableSectionItem
                                key={section.id}
                                section={section}
                                label={sectionTypeLabels[section.sectionType]}
                                onToggleEnabled={handleToggleSectionEnabled}
                                onConfigure={handleConfigureSection}
                                hasConfig={section.sectionType === 'trace_numbers' || section.sectionType === 'documents' || section.sectionType === 'shipment_timeline' || section.sectionType === 'barcode_details' || section.sectionType === 'route_summary' || section.sectionType === 'shipment_summary'}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-start space-x-2 mb-2">
                  <ExternalLink className="w-4 h-4 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Full URL Preview:
                  </label>
                </div>
                <div className="ml-6 p-2 bg-white dark:bg-gray-900 border border-slate-300 dark:border-slate-600 rounded font-mono text-xs text-slate-900 dark:text-slate-100 break-all">
                  {buildPreviewUrl() || 'Configure API path and fields to see URL preview'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-6">
                  Values in curly braces like {'{Field Name}'} will be replaced with user input at runtime.
                </p>
              </div>
            </div>
          </>
        )}

        {!selectedTemplateId && (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Select a template to edit or create a new one</p>
          </div>
        )}
      </div>

      {showImportModal && (
        <TrackTraceTemplateImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            loadInitialData();
            setSuccessMessage('Template imported successfully');
            setTimeout(() => setSuccessMessage(null), 3000);
          }}
        />
      )}

      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Create New Template
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Standard TruckMate Template"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewTemplateName('');
                  setNewTemplateDescription('');
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showFieldModal && editingField && (
        <TemplateFieldEditModal
          field={editingField}
          onChange={setEditingField}
          onSave={handleSaveField}
          onClose={() => {
            setShowFieldModal(false);
            setEditingField(null);
          }}
          saving={saving}
          endpointFields={endpointFields}
          schemaFieldPaths={schemaFieldPaths}
          noSpecSelected={!template.apiSpecId}
        />
      )}

      {showDefaultFieldModal && editingDefaultField && (
        <DefaultFieldEditModal
          field={editingDefaultField}
          onChange={setEditingDefaultField}
          onSave={handleSaveDefaultField}
          onClose={() => {
            setShowDefaultFieldModal(false);
            setEditingDefaultField(null);
          }}
          saving={saving}
          endpointFields={endpointFields}
        />
      )}

      {showFilterPresetModal && editingFilterPreset && (
        <FilterPresetEditModal
          preset={editingFilterPreset}
          onChange={setEditingFilterPreset}
          onSave={handleSaveFilterPreset}
          onClose={() => {
            setShowFilterPresetModal(false);
            setEditingFilterPreset(null);
            setEditingPresetDefaultFields([]);
          }}
          saving={saving}
          filterFields={filterFields}
          defaultFields={editingPresetDefaultFields}
          onDefaultFieldsChange={setEditingPresetDefaultFields}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          type={deleteTarget.type}
          name={deleteTarget.name}
          onConfirm={() => {
            if (deleteTarget.type === 'template') {
              confirmDeleteTemplate();
            } else if (deleteTarget.type === 'field') {
              confirmDeleteField(deleteTarget.id);
            } else if (deleteTarget.type === 'defaultField') {
              confirmDeleteDefaultField(deleteTarget.id);
            } else if (deleteTarget.type === 'filterPreset') {
              confirmDeleteFilterPreset(deleteTarget.id);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
          saving={saving}
        />
      )}

      {showPreviewModal && template && (
        <TrackTracePreviewModal
          template={template}
          filterFields={filterFields}
          selectFields={selectFields}
          defaultFields={defaultFields}
          filterPresets={filterPresets}
          secondaryApis={secondaryApis}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {showTraceNumbersConfigModal && editingTraceNumbersSection && (
        <TraceNumbersConfigModal
          config={(editingTraceNumbersSection.config || {}) as TraceNumbersSectionConfig}
          onSave={handleSaveTraceNumbersConfig}
          onClose={() => {
            setShowTraceNumbersConfigModal(false);
            setEditingTraceNumbersSection(null);
          }}
          saving={saving}
          secondaryApis={secondaryApis}
          apiSpecs={apiSpecs}
          apiEndpoints={traceNumbersApiEndpoints}
          onSpecChange={loadTraceNumbersEndpoints}
        />
      )}

      {showDocumentsConfigModal && template && (
        <DocumentsConfigModal
          templateId={template.id}
          documentConfigs={documentConfigs}
          templateFields={fields}
          onClose={() => {
            setShowDocumentsConfigModal(false);
            setEditingDocumentsSection(null);
          }}
          onRefresh={loadDocumentConfigs}
        />
      )}

      {showTimelineConfigModal && template && editingTimelineSection && (
        <TimelineConfigModal
          templateId={template.id}
          section={editingTimelineSection}
          timelineStatuses={timelineStatuses}
          templateFields={fields}
          onClose={() => {
            setShowTimelineConfigModal(false);
            setEditingTimelineSection(null);
          }}
          onRefresh={loadTimelineStatuses}
          onSaveConfig={async (config: TimelineSectionConfig) => {
            try {
              setSaving(true);
              const { error } = await supabase
                .from('track_trace_template_sections')
                .update({
                  config,
                  updated_at: new Date().toISOString()
                })
                .eq('id', editingTimelineSection.id);

              if (error) throw error;

              setTemplateSections(prev =>
                prev.map(s => s.id === editingTimelineSection.id ? { ...s, config } : s)
              );
              setSuccessMessage('Timeline configuration saved successfully');
              setTimeout(() => setSuccessMessage(null), 3000);
            } catch (err: any) {
              setError(err.message || 'Failed to save timeline configuration');
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {showBarcodeDetailsConfigModal && editingBarcodeDetailsSection && loadedBarcodeConfig && (
        <BarcodeDetailsConfigModal
          config={loadedBarcodeConfig}
          onSave={handleSaveBarcodeDetailsConfig}
          onClose={() => {
            setShowBarcodeDetailsConfigModal(false);
            setEditingBarcodeDetailsSection(null);
            setLoadedBarcodeConfig(null);
          }}
          saving={saving}
          secondaryApis={secondaryApis}
          apiSpecs={apiSpecs}
          apiEndpoints={barcodeDetailsApiEndpoints}
          authConfigs={authConfigs}
          onSpecChange={loadBarcodeDetailsEndpoints}
        />
      )}

      {showRouteSummaryConfigModal && template && (
        <RouteSummaryConfigModal
          templateId={template.id}
          onClose={() => setShowRouteSummaryConfigModal(false)}
          onSave={() => setShowRouteSummaryConfigModal(false)}
        />
      )}

      {showShipmentSummaryConfigModal && template && (
        <ShipmentSummaryConfigModal
          templateId={template.id}
          onClose={() => setShowShipmentSummaryConfigModal(false)}
          onSave={() => setShowShipmentSummaryConfigModal(false)}
        />
      )}
    </div>
  );
}

interface TemplateFieldEditModalProps {
  field: TrackTraceTemplateField;
  onChange: (field: TrackTraceTemplateField) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  endpointFields: ApiEndpointField[];
  schemaFieldPaths: string[];
  noSpecSelected: boolean;
}

function TemplateFieldEditModal({ field, onChange, onSave, onClose, saving, endpointFields, schemaFieldPaths, noSpecSelected }: TemplateFieldEditModalProps) {
  const formatDisplayLabel = (fieldName: string): string => {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const filterOperators = [
    { value: 'eq', label: 'Equals (eq)' },
    { value: 'ne', label: 'Not Equals (ne)' },
    { value: 'contains', label: 'Contains' },
    { value: 'startswith', label: 'Starts With' },
    { value: 'endswith', label: 'Ends With' },
    { value: 'gt', label: 'Greater Than (gt)' },
    { value: 'ge', label: 'Greater Than or Equal (ge)' },
    { value: 'lt', label: 'Less Than (lt)' },
    { value: 'le', label: 'Less Than or Equal (le)' }
  ];

  const dataTypes = [
    { value: 'string', label: 'String' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'boolean', label: 'Boolean' }
  ];

  const parameterTypes = [
    { value: '$filter', label: '$filter (OData Filter)' },
    { value: '$select', label: '$select (OData Select)' },
    { value: '$orderBy', label: '$orderBy (OData Order By)' },
    { value: 'query', label: 'Query Parameter' },
    { value: 'path', label: 'Path Variable' },
    { value: 'header', label: 'Request Header' },
    { value: 'body', label: 'Request Body' }
  ];

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {field.id ? 'Edit' : 'Add'} {field.fieldType === 'filter' ? 'Filter' : 'Column'} Field
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Display Label *
            </label>
            <input
              type="text"
              value={field.displayLabel}
              onChange={(e) => onChange({ ...field, displayLabel: e.target.value })}
              placeholder="e.g., Order Number"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Type
            </label>
            <Select
              value={field.dataType}
              onValueChange={(value) => onChange({ ...field, dataType: value as any })}
              options={dataTypes}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Parameter Type *
            </label>
            <Select
              value={field.parameterType || '$filter'}
              onValueChange={(value) => onChange({ ...field, parameterType: value as any })}
              options={parameterTypes}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Field (from Spec)
            </label>
            {(() => {

              if (noSpecSelected) {
                return (
                  <Select
                    value={field.apiFieldPath || '__none__'}
                    onValueChange={(value) => {
                      onChange({
                        ...field,
                        apiFieldPath: value === '__none__' ? undefined : value,
                        fieldName: value !== '__none__' ? value : field.fieldName
                      });
                    }}
                    options={[
                      { value: '__none__', label: 'Manual entry' }
                    ]}
                  />
                );
              }

              const isODataType = ['$filter', '$select', '$orderBy'].includes(field.parameterType || '');
              const isStandardParamType = ['query', 'path', 'header'].includes(field.parameterType || '');
              const useEndpointFields = isODataType || isStandardParamType;
              const filteredEndpointFields = useEndpointFields
                ? endpointFields.filter(f => {
                    if (isODataType) {
                      return f.field_path && !f.field_path.startsWith('[query]') && !f.field_path.startsWith('[path]') && !f.field_path.startsWith('[header]');
                    }
                    return f.field_path?.startsWith(`[${field.parameterType}]`);
                  })
                : [];
              const hasOptions = useEndpointFields ? filteredEndpointFields.length > 0 : schemaFieldPaths.length > 0;

              if (!hasOptions) {
                return (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    {useEndpointFields
                      ? `No ${field.parameterType} parameters found in API spec.`
                      : 'No API schema configured. Upload a JSON schema in Settings to see available fields.'}
                  </p>
                );
              }

              return (
                <Select
                  value={field.apiFieldPath || '__none__'}
                  onValueChange={(value) => {
                    if (useEndpointFields) {
                      const selectedField = filteredEndpointFields.find(f => f.field_name === value);
                      onChange({
                        ...field,
                        apiFieldPath: value === '__none__' ? undefined : value,
                        fieldName: value !== '__none__' ? value : field.fieldName,
                        displayLabel: value !== '__none__' && !field.displayLabel
                          ? formatDisplayLabel(selectedField?.field_name || value)
                          : field.displayLabel
                      });
                    } else {
                      const extractedFieldName = value !== '__none__' ? (value.split('.').pop()?.replace('[]', '') || value) : '';
                      const newDisplayLabel = value !== '__none__' && !field.displayLabel ? formatDisplayLabel(extractedFieldName) : field.displayLabel;
                      onChange({
                        ...field,
                        apiFieldPath: value === '__none__' ? undefined : value,
                        fieldName: value !== '__none__' ? extractedFieldName : field.fieldName,
                        displayLabel: newDisplayLabel
                      });
                    }
                  }}
                  options={[
                    { value: '__none__', label: 'Manual entry' },
                    ...(useEndpointFields
                      ? filteredEndpointFields.map(f => ({
                          value: f.field_name,
                          label: `${f.field_name}${f.description ? ` - ${f.description.slice(0, 50)}${f.description.length > 50 ? '...' : ''}` : ''}`
                        }))
                      : schemaFieldPaths.map(path => ({
                          value: path,
                          label: path
                        })))
                  ]}
                  searchable
                />
              );
            })()}
          </div>

          {!field.apiFieldPath && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Field Name *
              </label>
              <input
                type="text"
                value={field.fieldName}
                onChange={(e) => onChange({ ...field, fieldName: e.target.value })}
                placeholder="e.g., billNumber"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {field.fieldType === 'filter' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filter Operator
                </label>
                <Select
                  value={field.filterOperator || 'eq'}
                  onValueChange={(value) => onChange({ ...field, filterOperator: value })}
                  options={filterOperators}
                />
              </div>

              <div className="flex items-center">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={field.isRequired}
                    onChange={(e) => onChange({ ...field, isRequired: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Required field</span>
                </label>
              </div>
            </>
          )}

          <div className="flex items-center">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={field.isEnabled}
                onChange={(e) => onChange({ ...field, isEnabled: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
            </label>
          </div>

          {field.fieldType === 'select' && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Value Mappings
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newMapping: TrackTraceValueMapping = { sourceValue: '', displayValue: '' };
                    onChange({ ...field, valueMappings: [...(field.valueMappings || []), newMapping] });
                  }}
                  className="flex items-center text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Mapping
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Transform API values to user-friendly display values
              </p>
              {(field.valueMappings && field.valueMappings.length > 0) ? (
                <div className="space-y-2">
                  {field.valueMappings.map((mapping, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mapping.sourceValue}
                        onChange={(e) => {
                          const updated = [...(field.valueMappings || [])];
                          updated[index] = { ...updated[index], sourceValue: e.target.value };
                          onChange({ ...field, valueMappings: updated });
                        }}
                        placeholder="API value"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-sm">→</span>
                      <input
                        type="text"
                        value={mapping.displayValue}
                        onChange={(e) => {
                          const updated = [...(field.valueMappings || [])];
                          updated[index] = { ...updated[index], displayValue: e.target.value };
                          onChange({ ...field, valueMappings: updated });
                        }}
                        placeholder="Display value"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (field.valueMappings || []).filter((_, i) => i !== index);
                          onChange({ ...field, valueMappings: updated });
                        }}
                        className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  No mappings configured. Values will display as returned by the API.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!field.fieldName.trim() || !field.displayLabel.trim() || saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Field'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface DefaultFieldEditModalProps {
  field: TrackTraceTemplateDefaultField;
  onChange: (field: TrackTraceTemplateDefaultField) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  endpointFields: ApiEndpointField[];
}

function DefaultFieldEditModal({ field, onChange, onSave, onClose, saving, endpointFields }: DefaultFieldEditModalProps) {
  const parameterTypes = [
    { value: 'query', label: 'Query Parameter' },
    { value: 'path', label: 'Path Variable' },
    { value: 'header', label: 'Request Header' },
    { value: 'body', label: 'Request Body' }
  ];

  const dynamicValueOptions = [
    { value: 'client.client_id', label: 'Client ID (from logged-in user)' }
  ];

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {field.id ? 'Edit' : 'Add'} Default Field
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Default fields are sent automatically with every API request.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Field Name *
            </label>
            <input
              type="text"
              value={field.fieldName}
              onChange={(e) => onChange({ ...field, fieldName: e.target.value })}
              placeholder="e.g., customerId"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Parameter Type *
            </label>
            <Select
              value={field.parameterType}
              onValueChange={(value) => onChange({ ...field, parameterType: value as any })}
              options={parameterTypes}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Field (from Spec)
            </label>
            {endpointFields.length > 0 ? (
              <Select
                value={field.apiFieldPath || '__none__'}
                onValueChange={(value) => onChange({
                  ...field,
                  apiFieldPath: value === '__none__' ? undefined : value,
                  fieldName: value !== '__none__' && !field.fieldName
                    ? endpointFields.find(f => f.field_path === value)?.field_name || field.fieldName
                    : field.fieldName
                })}
                options={[
                  { value: '__none__', label: 'Manual entry' },
                  ...endpointFields.map(f => ({
                    value: f.field_path,
                    label: `${f.field_name} (${f.field_path})`
                  }))
                ]}
                searchable
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                No API spec endpoint selected. Select an endpoint in API Configuration to see available fields.
              </p>
            )}
          </div>

          {field.parameterType === 'query' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Operator
              </label>
              <select
                value={field.operator || 'eq'}
                onChange={(e) => onChange({ ...field, operator: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="eq">eq (equals)</option>
                <option value="ne">ne (not equal)</option>
                <option value="gt">gt (greater than)</option>
                <option value="ge">ge (greater or equal)</option>
                <option value="lt">lt (less than)</option>
                <option value="le">le (less or equal)</option>
                <option value="in">in (in list)</option>
                <option value="not in">not in</option>
                <option value="contains">contains</option>
                <option value="startswith">startswith</option>
                <option value="endswith">endswith</option>
                <option value="not endswith">not endswith</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Value Type *
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={field.valueType === 'static'}
                  onChange={() => onChange({ ...field, valueType: 'static', dynamicValue: undefined })}
                  className="text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Static Value</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={field.valueType === 'dynamic'}
                  onChange={() => onChange({ ...field, valueType: 'dynamic', staticValue: undefined })}
                  className="text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Dynamic Value</span>
              </label>
            </div>
          </div>

          {field.valueType === 'static' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Static Value *
              </label>
              <input
                type="text"
                value={field.staticValue || ''}
                onChange={(e) => onChange({ ...field, staticValue: e.target.value })}
                placeholder="Enter the hardcoded value"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {field.valueType === 'dynamic' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Dynamic Value *
              </label>
              <Select
                value={field.dynamicValue || '__none__'}
                onValueChange={(value) => onChange({ ...field, dynamicValue: value === '__none__' ? undefined : value })}
                options={[
                  { value: '__none__', label: 'Select a dynamic value...' },
                  ...dynamicValueOptions
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Dynamic values are resolved at runtime based on the logged-in user's context.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={
              !field.fieldName.trim() ||
              (field.valueType === 'static' && !field.staticValue?.trim()) ||
              (field.valueType === 'dynamic' && !field.dynamicValue) ||
              saving
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Default Field'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface FilterPresetEditModalProps {
  preset: TrackTraceFilterPreset;
  onChange: (preset: TrackTraceFilterPreset) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  filterFields: TrackTraceTemplateField[];
  defaultFields: TrackTraceFilterPresetDefaultField[];
  onDefaultFieldsChange: (fields: TrackTraceFilterPresetDefaultField[]) => void;
}

function FilterPresetEditModal({ preset, onChange, onSave, onClose, saving, filterFields, defaultFields, onDefaultFieldsChange }: FilterPresetEditModalProps) {
  const handleFilterValueChange = (id: string, updates: Partial<TrackTraceFilterValue>) => {
    const newFilterValues = preset.filterValues.map(fv =>
      fv.id === id ? { ...fv, ...updates } : fv
    );
    onChange({ ...preset, filterValues: newFilterValues });
  };

  const handleRemoveFilterValue = (id: string) => {
    const newFilterValues = preset.filterValues.filter(fv => fv.id !== id);
    onChange({ ...preset, filterValues: newFilterValues });
  };

  const handleAddFilterValue = () => {
    const newFilterValue: TrackTraceFilterValue = {
      id: crypto.randomUUID(),
      fieldName: '',
      operator: 'eq',
      value: ''
    };
    onChange({ ...preset, filterValues: [...preset.filterValues, newFilterValue] });
  };

  const getFieldByName = (fieldName: string) => {
    return filterFields.find(f => f.fieldName === fieldName);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {preset.id ? 'Edit' : 'Add'} Quick Filter Button
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure a preset filter that customers can apply with one click.
          </p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Button Name *
            </label>
            <input
              type="text"
              value={preset.name}
              onChange={(e) => onChange({ ...preset, name: e.target.value })}
              placeholder="e.g., In Transit, Delivered, Exceptions"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Display Order
            </label>
            <input
              type="number"
              value={preset.displayOrder}
              onChange={(e) => onChange({ ...preset, displayOrder: parseInt(e.target.value) || 0 })}
              min={0}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Lower numbers appear first (left to right)
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter Values
              </label>
              {filterFields.length > 0 && (
                <button
                  onClick={handleAddFilterValue}
                  className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Filter Value
                </button>
              )}
            </div>

            {filterFields.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                No filter fields configured. Add filter fields first to set preset values.
              </p>
            ) : preset.filterValues.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                No filter values configured. Click "Add Filter Value" to add filters.
              </p>
            ) : (
              <div className="space-y-3">
                {preset.filterValues.map(filterValue => {
                  const field = getFieldByName(filterValue.fieldName);

                  return (
                    <div key={filterValue.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Field
                        </label>
                        <button
                          onClick={() => handleRemoveFilterValue(filterValue.id)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          title="Remove this filter"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={filterValue.fieldName}
                        onChange={(e) => handleFilterValueChange(filterValue.id, { fieldName: e.target.value })}
                        placeholder="Enter field name (e.g., traceNumber)"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Operator
                          </label>
                          <select
                            value={filterValue.operator}
                            onChange={(e) => handleFilterValueChange(filterValue.id, { operator: e.target.value })}
                            className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            <option value="eq">eq (equals)</option>
                            <option value="ne">ne (not equal)</option>
                            <option value="gt">gt (greater than)</option>
                            <option value="ge">ge (greater or equal)</option>
                            <option value="lt">lt (less than)</option>
                            <option value="le">le (less or equal)</option>
                            <option value="in">in (in list)</option>
                            <option value="not in">not in</option>
                            <option value="contains">contains</option>
                            <option value="startswith">startswith</option>
                            <option value="endswith">endswith</option>
                            <option value="not endswith">not endswith</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Value
                          </label>
                          <input
                            type={field && field.dataType === 'number' ? 'number' : 'text'}
                            value={filterValue.value}
                            onChange={(e) => handleFilterValueChange(filterValue.id, { value: e.target.value })}
                            placeholder={filterValue.operator === 'in' || filterValue.operator === 'not in' ? "e.g., 'AVAIL','ASSGN'" : `Value for ${filterValue.fieldName}`}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center pt-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={preset.isActive}
                onChange={(e) => onChange({ ...preset, isActive: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Active (visible to customers)</span>
            </label>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!preset.name.trim() || saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Quick Filter'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface DeleteConfirmModalProps {
  type: 'template' | 'field' | 'defaultField' | 'filterPreset';
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}

function DeleteConfirmModal({ type, name, onConfirm, onCancel, saving }: DeleteConfirmModalProps) {
  const getTitle = () => {
    switch (type) {
      case 'template': return 'Delete Template';
      case 'field': return 'Delete Field';
      case 'defaultField': return 'Delete Default Field';
      case 'filterPreset': return 'Delete Quick Filter';
    }
  };

  const getMessage = () => {
    switch (type) {
      case 'template':
        return `Are you sure you want to delete the template "${name}"? This will also delete all associated filter fields, result columns, and default fields. This action cannot be undone.`;
      case 'field':
        return `Are you sure you want to delete the field "${name}"? This action cannot be undone.`;
      case 'defaultField':
        return `Are you sure you want to delete the default field "${name}"? This action cannot be undone.`;
      case 'filterPreset':
        return `Are you sure you want to delete the quick filter button "${name}"? This action cannot be undone.`;
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {getTitle()}
            </h3>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getMessage()}
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface TrackTracePreviewModalProps {
  template: TrackTraceTemplate;
  filterFields: TrackTraceTemplateField[];
  selectFields: TrackTraceTemplateField[];
  defaultFields: TrackTraceTemplateDefaultField[];
  filterPresets: TrackTraceFilterPreset[];
  secondaryApis: SecondaryApiConfig[];
  onClose: () => void;
}

function TrackTracePreviewModal({
  template,
  filterFields,
  selectFields,
  defaultFields,
  filterPresets,
  secondaryApis,
  onClose
}: TrackTracePreviewModalProps) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [dynamicTestValues, setDynamicTestValues] = useState<Record<string, string>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [lastRequestUrl, setLastRequestUrl] = useState<string | null>(null);
  const [apiSettings, setApiSettings] = useState<{ path: string } | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activePresetFilterValues, setActivePresetFilterValues] = useState<TrackTraceFilterPreset['filterValues'] | null>(null);

  useEffect(() => {
    loadApiSettings();
  }, []);

  const loadApiSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('api_settings')
        .select('path')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setApiSettings(data);
      }
    } catch (err) {
      console.error('Failed to load API settings:', err);
    }
  };

  const getApiBaseUrl = (): string => {
    if (template.apiSourceType === 'secondary' && template.secondaryApiId) {
      const secondaryApi = secondaryApis.find(a => a.id === template.secondaryApiId);
      return secondaryApi?.baseUrl || '';
    }
    return apiSettings?.path || '';
  };

  const getAuthToken = (): string => {
    if (template.apiSourceType === 'secondary' && template.secondaryApiId) {
      const secondaryApi = secondaryApis.find(a => a.id === template.secondaryApiId);
      return secondaryApi?.authToken || '';
    }
    return '';
  };

  const buildODataFilterFromPreset = (presetFilterValues: TrackTraceFilterPreset['filterValues']): string => {
    const filterParts: string[] = [];

    presetFilterValues.forEach(filterValue => {
      if (!filterValue.value) return;

      const { fieldName, operator, value } = filterValue;
      let filterStr = '';

      if (operator === 'in' || operator === 'not in') {
        const values = String(value).split(',').map(v => {
          const trimmed = v.trim();
          return trimmed.startsWith("'") ? trimmed : `'${trimmed.replace(/'/g, "''")}'`;
        });
        if (operator === 'in') {
          filterStr = `${fieldName} in (${values.join(',')})`;
        } else {
          filterStr = `(${values.map(v => `${fieldName} ne ${v}`).join(' and ')})`;
        }
      } else if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
        const escapedValue = String(value).replace(/'/g, "''");
        filterStr = `${operator}(${fieldName},'${escapedValue}')`;
      } else if (operator === 'not endswith') {
        const escapedValue = String(value).replace(/'/g, "''");
        filterStr = `not endswith(${fieldName},'${escapedValue}')`;
      } else {
        const isNumeric = !isNaN(Number(value)) && value.toString().trim() !== '';
        if (isNumeric) {
          filterStr = `${fieldName} ${operator} ${value}`;
        } else {
          const escapedValue = String(value).replace(/'/g, "''");
          filterStr = `${fieldName} ${operator} '${escapedValue}'`;
        }
      }

      if (filterStr) {
        filterParts.push(filterStr);
      }
    });

    return filterParts.join(' and ');
  };

  const buildODataFilter = (usePreset: boolean = false): string => {
    const filterParts: string[] = [];

    if (usePreset && activePresetFilterValues && activePresetFilterValues.length > 0) {
      const presetFilter = buildODataFilterFromPreset(activePresetFilterValues);
      if (presetFilter) {
        filterParts.push(presetFilter);
      }
    } else {
      filterFields.filter(f => f.isEnabled && f.parameterType === '$filter').forEach(field => {
        const value = filterValues[field.id];
        if (!value) return;

        const fieldName = field.apiFieldPath || field.fieldName;
        const operator = field.filterOperator || 'eq';

        let filterExpr = '';
        if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
          filterExpr = `${operator}(${fieldName}, '${value}')`;
        } else {
          const formattedValue = field.dataType === 'string' ? `'${value}'` : value;
          filterExpr = `${fieldName} ${operator} ${formattedValue}`;
        }
        filterParts.push(filterExpr);
      });
    }

    defaultFields.filter(f => f.parameterType === 'query').forEach(field => {
      let value: string;
      if (field.valueType === 'static') {
        value = field.staticValue || '';
      } else {
        value = dynamicTestValues[field.fieldName] || `{${field.dynamicValue || field.fieldName}}`;
      }
      if (!value) return;
      const rawFieldName = field.apiFieldPath || field.fieldName;
      let fieldName = rawFieldName.replace(/^\[.*?\]\s*/, '');
      if (fieldName === '$filter') {
        fieldName = field.fieldName;
      }
      const operator = field.operator || 'eq';
      let filterExpr = '';
      if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
        filterExpr = `${operator}(${fieldName}, '${value}')`;
      } else if (operator === 'not contains') {
        filterExpr = `not contains(${fieldName}, '${value}')`;
      } else if (operator === 'not startswith') {
        filterExpr = `not startswith(${fieldName}, '${value}')`;
      } else if (operator === 'not endswith') {
        filterExpr = `not endswith(${fieldName}, '${value}')`;
      } else {
        filterExpr = `${fieldName} ${operator} '${value}'`;
      }
      filterParts.push(filterExpr);
    });

    return filterParts.join(' and ');
  };

  const buildCurrentPreviewUrl = (presetFilterValues?: TrackTraceFilterPreset['filterValues']): string => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) return '';

    const apiPath = template.apiPath.startsWith('/') ? template.apiPath : '/' + template.apiPath;
    let url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) + apiPath : baseUrl + apiPath;

    const queryParams: string[] = [];

    const filterParts: string[] = [];
    if (presetFilterValues && Object.keys(presetFilterValues).length > 0) {
      const presetFilter = buildODataFilterFromPreset(presetFilterValues);
      if (presetFilter) {
        filterParts.push(presetFilter);
      }
    } else {
      filterFields.filter(f => f.isEnabled && f.parameterType === '$filter').forEach(field => {
        const value = filterValues[field.id];
        if (!value) return;
        const rawFieldName = field.apiFieldPath || field.fieldName;
        let fieldName = rawFieldName.replace(/^\[.*?\]\s*/, '');
        if (fieldName === '$filter') {
          fieldName = field.fieldName;
        }
        const operator = field.filterOperator || 'eq';
        let filterExpr = '';
        if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
          filterExpr = `${operator}(${fieldName}, '${value}')`;
        } else {
          const formattedValue = field.dataType === 'string' ? `'${value}'` : value;
          filterExpr = `${fieldName} ${operator} ${formattedValue}`;
        }
        filterParts.push(filterExpr);
      });
    }

    defaultFields.filter(f => f.parameterType === 'query').forEach(field => {
      let value: string;
      if (field.valueType === 'static') {
        value = field.staticValue || '';
      } else {
        value = dynamicTestValues[field.fieldName] || `{${field.dynamicValue || field.fieldName}}`;
      }
      if (!value) return;
      const rawFieldName = field.apiFieldPath || field.fieldName;
      let fieldName = rawFieldName.replace(/^\[.*?\]\s*/, '');
      if (fieldName === '$filter') {
        fieldName = field.fieldName;
      }
      const operator = field.operator || 'eq';
      let filterExpr = '';
      if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
        filterExpr = `${operator}(${fieldName}, '${value}')`;
      } else if (operator === 'not contains') {
        filterExpr = `not contains(${fieldName}, '${value}')`;
      } else if (operator === 'not startswith') {
        filterExpr = `not startswith(${fieldName}, '${value}')`;
      } else if (operator === 'not endswith') {
        filterExpr = `not endswith(${fieldName}, '${value}')`;
      } else {
        filterExpr = `${fieldName} ${operator} '${value}'`;
      }
      filterParts.push(filterExpr);
    });

    if (filterParts.length > 0) {
      queryParams.push(`$filter=${filterParts.join(' and ')}`);
    }

    const selectParam = buildSelectFields();
    if (selectParam) {
      queryParams.push(`$select=${selectParam}`);
    }

    if (template.defaultLimit) {
      queryParams.push(`$limit=${template.defaultLimit}`);
    }

    if (template.defaultOrderBy) {
      queryParams.push(`$orderby=${template.defaultOrderBy} ${template.defaultOrderDirection || 'desc'}`);
    }

    filterFields.filter(f => f.isEnabled && f.parameterType === 'query').forEach(field => {
      const value = filterValues[field.id];
      if (value) {
        queryParams.push(`${field.fieldName}=${encodeURIComponent(value)}`);
      }
    });

    if (queryParams.length > 0) {
      url += (url.includes('?') ? '&' : '?') + queryParams.join('&');
    }

    return url;
  };

  const buildSelectFields = (): string => {
    const selectFieldNames = selectFields
      .filter(f => f.isEnabled)
      .map(f => f.apiFieldPath || f.fieldName);
    return selectFieldNames.join(',');
  };

  const handleSearch = async (usePreset: boolean = false) => {
    setIsSearching(true);
    setSearchError(null);
    setResults(null);

    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        throw new Error('API base URL not configured');
      }

      const authToken = getAuthToken();

      const apiPath = template.apiPath.startsWith('/') ? template.apiPath : '/' + template.apiPath;
      let url = baseUrl.endsWith('/')
        ? baseUrl.slice(0, -1) + apiPath
        : baseUrl + apiPath;

      const queryParams: string[] = [];

      const oDataFilter = buildODataFilter(usePreset);
      if (oDataFilter) {
        queryParams.push(`$filter=${oDataFilter}`);
      }

      const selectParam = buildSelectFields();
      if (selectParam) {
        queryParams.push(`$select=${selectParam}`);
      }

      if (template.defaultLimit) {
        queryParams.push(`$limit=${template.defaultLimit}`);
      }

      if (template.defaultOrderBy) {
        queryParams.push(`$orderby=${template.defaultOrderBy} ${template.defaultOrderDirection || 'desc'}`);
      }

      filterFields.filter(f => f.isEnabled && f.parameterType === 'query').forEach(field => {
        const value = filterValues[field.id];
        if (value) {
          queryParams.push(`${field.fieldName}=${encodeURIComponent(value)}`);
        }
      });

      if (queryParams.length > 0) {
        url += (url.includes('?') ? '&' : '?') + queryParams.join('&');
      }

      setLastRequestUrl(url);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        method: template.httpMethod || 'GET',
        headers
      });

      if (!response.ok) {
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
        } catch {
          const errorText = await response.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      let resultsArray: any[] = [];
      if (Array.isArray(data)) {
        resultsArray = data;
      } else if (data.value && Array.isArray(data.value)) {
        resultsArray = data.value;
      } else if (data.data && Array.isArray(data.data)) {
        resultsArray = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        resultsArray = data.results;
      } else {
        const arrayProp = Object.keys(data).find(key => Array.isArray(data[key]));
        if (arrayProp) {
          resultsArray = data[arrayProp];
        } else {
          resultsArray = [data];
        }
      }

      setResults(resultsArray);
    } catch (err: any) {
      setSearchError(err.message || 'Failed to execute search');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setFilterValues({});
    setDynamicTestValues({});
    setResults(null);
    setSearchError(null);
    setActivePresetId(null);
    setActivePresetFilterValues(null);
    setLastRequestUrl(null);
  };

  const handlePresetClick = (preset: TrackTraceFilterPreset) => {
    setActivePresetId(preset.id);
    setActivePresetFilterValues(preset.filterValues);
    setFilterValues({});
    const url = buildCurrentPreviewUrl(preset.filterValues);
    setLastRequestUrl(url);
    handleSearchWithPreset(preset.filterValues);
  };

  const handleSearchWithPreset = async (presetFilterValues: TrackTraceFilterPreset['filterValues']) => {
    setIsSearching(true);
    setSearchError(null);
    setResults(null);

    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        throw new Error('API base URL not configured');
      }

      const authToken = getAuthToken();
      const url = buildCurrentPreviewUrl(presetFilterValues);
      setLastRequestUrl(url);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        method: template.httpMethod || 'GET',
        headers
      });

      if (!response.ok) {
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
        } catch {
          const errorText = await response.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      let resultsArray: any[] = [];
      if (Array.isArray(data)) {
        resultsArray = data;
      } else if (data.value && Array.isArray(data.value)) {
        resultsArray = data.value;
      } else if (data.data && Array.isArray(data.data)) {
        resultsArray = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        resultsArray = data.results;
      } else {
        const arrayProp = Object.keys(data).find(key => Array.isArray(data[key]));
        if (arrayProp) {
          resultsArray = data[arrayProp];
        } else {
          resultsArray = [data];
        }
      }

      setResults(resultsArray);
    } catch (err: any) {
      setSearchError(err.message || 'Failed to execute search');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFilterValueChange = (fieldId: string, value: string) => {
    setFilterValues(prev => ({ ...prev, [fieldId]: value }));
    setActivePresetId(null);
    setActivePresetFilterValues(null);
  };

  const getFieldValue = (record: any, fieldName: string): string => {
    if (fieldName.includes('.')) {
      const parts = fieldName.split('.');
      let value = record;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = value[part];
        } else {
          return 'N/A';
        }
      }
      return value !== null && value !== undefined ? String(value) : 'N/A';
    }
    const value = record[fieldName];
    return value !== null && value !== undefined ? String(value) : 'N/A';
  };

  const enabledFilterFields = filterFields.filter(f => f.isEnabled);
  const enabledSelectFields = selectFields.filter(f => f.isEnabled);

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Test Template: {template.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Enter filter values and click Search to test the API response
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {filterPresets.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                <Zap className="h-4 w-4 mr-2" />
                Quick Filters
              </h4>
              <div className="flex flex-wrap gap-2">
                {filterPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(preset)}
                    disabled={isSearching}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                      activePresetId === preset.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {enabledFilterFields.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                <Filter className="h-4 w-4 mr-2" />
                Filter Fields
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {enabledFilterFields.map(field => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {field.displayLabel}
                      {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      <span className="text-xs text-gray-500 ml-2">({field.filterOperator})</span>
                    </label>
                    {field.dataType === 'boolean' ? (
                      <select
                        value={filterValues[field.id] || ''}
                        onChange={(e) => handleFilterValueChange(field.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">Select...</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : field.dataType === 'date' ? (
                      <input
                        type="date"
                        value={filterValues[field.id] || ''}
                        onChange={(e) => handleFilterValueChange(field.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    ) : (
                      <input
                        type={field.dataType === 'number' ? 'number' : 'text'}
                        value={filterValues[field.id] || ''}
                        onChange={(e) => handleFilterValueChange(field.id, e.target.value)}
                        placeholder={`Enter ${field.displayLabel.toLowerCase()}...`}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {defaultFields.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                <Lock className="h-4 w-4 mr-2" />
                Default Fields (sent automatically)
              </h4>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="space-y-3">
                  {defaultFields.map(field => (
                    <div key={field.id} className="flex items-center justify-between text-sm gap-4">
                      <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">{field.fieldName}</span>
                      {field.valueType === 'static' ? (
                        <span className="font-mono text-gray-900 dark:text-gray-100">
                          {field.staticValue}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <input
                            type="text"
                            value={dynamicTestValues[field.fieldName] || ''}
                            onChange={(e) => setDynamicTestValues(prev => ({
                              ...prev,
                              [field.fieldName]: e.target.value
                            }))}
                            placeholder={`Enter test value...`}
                            className="w-48 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                          <span className="text-blue-600 dark:text-blue-400 italic text-xs whitespace-nowrap">
                            {field.dynamicValue}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Clear
            </button>
          </div>

          {lastRequestUrl && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                <ExternalLink className="h-3 w-3 mr-1" />
                Request URL
              </h5>
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all select-all">
                {lastRequestUrl}
              </p>
            </div>
          )}

          {searchError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-red-800 dark:text-red-300">Search Failed</h5>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">{searchError}</p>
                </div>
              </div>
            </div>
          )}

          {results !== null && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                <Columns className="h-4 w-4 mr-2" />
                Results ({results.length} records)
              </h4>

              {results.length === 0 ? (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">No records found matching your search criteria</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {enabledSelectFields.map(field => (
                            <th
                              key={field.id}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                            >
                              {field.displayLabel}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {results.slice(0, 50).map((record, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            {enabledSelectFields.map(field => (
                              <td key={field.id} className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                {getFieldValue(record, field.apiFieldPath || field.fieldName)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {results.length > 50 && (
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
                      Showing first 50 of {results.length} results
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface TraceNumbersConfigModalProps {
  config: TraceNumbersSectionConfig;
  onSave: (config: TraceNumbersSectionConfig) => void;
  onClose: () => void;
  saving: boolean;
  secondaryApis: SecondaryApiConfig[];
  apiSpecs: ApiSpec[];
  apiEndpoints: ApiSpecEndpoint[];
  onSpecChange: (specId: string) => void;
}

function TraceNumbersConfigModal({
  config,
  onSave,
  onClose,
  saving,
  secondaryApis,
  apiSpecs,
  apiEndpoints,
  onSpecChange
}: TraceNumbersConfigModalProps) {
  const [localConfig, setLocalConfig] = useState<TraceNumbersSectionConfig>({
    apiSourceType: config.apiSourceType || 'main',
    secondaryApiId: config.secondaryApiId || '',
    apiSpecId: config.apiSpecId || '',
    apiSpecEndpointId: config.apiSpecEndpointId || '',
    fieldMappings: config.fieldMappings || []
  });

  const [newMappingLabel, setNewMappingLabel] = useState('');
  const [newMappingValueField, setNewMappingValueField] = useState('');
  const [newMappingDisplayType, setNewMappingDisplayType] = useState<'header' | 'detail'>('detail');
  const [editingFieldMappingIndex, setEditingFieldMappingIndex] = useState<number | null>(null);
  const [editingMappingIndex, setEditingMappingIndex] = useState<number | null>(null);
  const [editingValueMappings, setEditingValueMappings] = useState<TrackTraceValueMapping[]>([]);
  const [showValueMappingsModal, setShowValueMappingsModal] = useState(false);
  const [newValueMappingColor, setNewValueMappingColor] = useState('blue');

  const availableColors = [
    { value: 'blue', label: 'Blue', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: 'purple', label: 'Purple', className: 'bg-purple-100 text-purple-700 border-purple-200' },
    { value: 'red', label: 'Red', className: 'bg-red-100 text-red-700 border-red-200' },
    { value: 'green', label: 'Green', className: 'bg-green-100 text-green-700 border-green-200' },
    { value: 'yellow', label: 'Yellow', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { value: 'orange', label: 'Orange', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    { value: 'teal', label: 'Teal', className: 'bg-teal-100 text-teal-700 border-teal-200' },
    { value: 'gray', label: 'Gray', className: 'bg-gray-100 text-gray-700 border-gray-200' }
  ];

  const filteredSpecs = apiSpecs.filter(spec => {
    if (localConfig.apiSourceType === 'main') {
      return !spec.secondary_api_id;
    } else {
      return spec.secondary_api_id === localConfig.secondaryApiId;
    }
  });

  const handleAddFieldMapping = () => {
    if (!newMappingValueField.trim()) return;

    let updatedMappings = [...localConfig.fieldMappings];

    if (newMappingDisplayType === 'header') {
      updatedMappings = updatedMappings.map((m, i) =>
        (editingFieldMappingIndex !== null && i === editingFieldMappingIndex)
          ? m
          : { ...m, displayType: 'detail' as const }
      );
    }

    const newMapping: TraceNumberFieldMapping = {
      label: newMappingLabel.trim(),
      valueField: newMappingValueField.trim(),
      displayType: newMappingDisplayType,
      valueMappings: editingFieldMappingIndex !== null
        ? localConfig.fieldMappings[editingFieldMappingIndex]?.valueMappings || []
        : []
    };

    if (editingFieldMappingIndex !== null) {
      updatedMappings[editingFieldMappingIndex] = newMapping;
      setLocalConfig(prev => ({
        ...prev,
        fieldMappings: updatedMappings
      }));
    } else {
      setLocalConfig(prev => ({
        ...prev,
        fieldMappings: [...updatedMappings, newMapping]
      }));
    }

    setNewMappingLabel('');
    setNewMappingValueField('');
    setNewMappingDisplayType('detail');
    setEditingFieldMappingIndex(null);
  };

  const handleEditFieldMapping = (index: number) => {
    const mapping = localConfig.fieldMappings[index];
    setNewMappingLabel(mapping.label || '');
    setNewMappingValueField(mapping.valueField);
    setNewMappingDisplayType(mapping.displayType || 'detail');
    setEditingFieldMappingIndex(index);
  };

  const handleCancelEditFieldMapping = () => {
    setNewMappingLabel('');
    setNewMappingValueField('');
    setNewMappingDisplayType('detail');
    setEditingFieldMappingIndex(null);
  };

  const handleRemoveFieldMapping = (index: number) => {
    setLocalConfig(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index)
    }));
  };

  const handleEditValueMappings = (index: number) => {
    const mapping = localConfig.fieldMappings[index];
    setEditingMappingIndex(index);
    setEditingValueMappings(mapping.valueMappings || []);
    setShowValueMappingsModal(true);
  };

  const handleSaveValueMappings = () => {
    if (editingMappingIndex === null) return;

    setLocalConfig(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((m, i) =>
        i === editingMappingIndex
          ? { ...m, valueMappings: editingValueMappings }
          : m
      )
    }));
    setShowValueMappingsModal(false);
    setEditingMappingIndex(null);
    setEditingValueMappings([]);
  };

  const handleToggleDisplayType = (index: number) => {
    const currentMapping = localConfig.fieldMappings[index];
    const newDisplayType = currentMapping.displayType === 'header' ? 'detail' : 'header';

    setLocalConfig(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.map((m, i) => {
        if (i === index) {
          return { ...m, displayType: newDisplayType };
        } else if (newDisplayType === 'header') {
          return { ...m, displayType: 'detail' as const };
        }
        return m;
      })
    }));
  };

  const handleSpecChange = (specId: string) => {
    setLocalConfig(prev => ({
      ...prev,
      apiSpecId: specId,
      apiSpecEndpointId: ''
    }));
    if (specId) {
      onSpecChange(specId);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Configure Trace Numbers Section
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure the API endpoint and display settings for trace numbers
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Source
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="apiSourceType"
                  value="main"
                  checked={localConfig.apiSourceType === 'main'}
                  onChange={() => setLocalConfig(prev => ({
                    ...prev,
                    apiSourceType: 'main',
                    secondaryApiId: '',
                    apiSpecId: '',
                    apiSpecEndpointId: ''
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Main API</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="apiSourceType"
                  value="secondary"
                  checked={localConfig.apiSourceType === 'secondary'}
                  onChange={() => setLocalConfig(prev => ({
                    ...prev,
                    apiSourceType: 'secondary',
                    apiSpecId: '',
                    apiSpecEndpointId: ''
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Secondary API</span>
              </label>
            </div>
          </div>

          {localConfig.apiSourceType === 'secondary' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Secondary API
              </label>
              <Select
                value={localConfig.secondaryApiId || '__none__'}
                onValueChange={(value) => setLocalConfig(prev => ({
                  ...prev,
                  secondaryApiId: value === '__none__' ? '' : value,
                  apiSpecId: '',
                  apiSpecEndpointId: ''
                }))}
                options={[
                  { value: '__none__', label: 'Select Secondary API...' },
                  ...secondaryApis.map(api => ({ value: api.id!, label: api.name }))
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Specification
            </label>
            <Select
              value={localConfig.apiSpecId || '__none__'}
              onValueChange={(value) => handleSpecChange(value === '__none__' ? '' : value)}
              options={[
                { value: '__none__', label: 'Select API Spec...' },
                ...filteredSpecs.map(spec => ({ value: spec.id, label: spec.name }))
              ]}
            />
          </div>

          {localConfig.apiSpecId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Endpoint
              </label>
              <Select
                value={localConfig.apiSpecEndpointId || '__none__'}
                onValueChange={(value) => setLocalConfig(prev => ({
                  ...prev,
                  apiSpecEndpointId: value === '__none__' ? '' : value
                }))}
                options={[
                  { value: '__none__', label: 'Select Endpoint...' },
                  ...apiEndpoints
                    .filter(ep => ep.method === 'GET')
                    .map(ep => ({
                      value: ep.id,
                      label: `GET ${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}`
                    }))
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Field Mappings
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Define the trace number fields to display. Each mapping specifies a label and the API field containing the value.
            </p>

            {localConfig.fieldMappings.length > 0 && (
              <div className="space-y-2 mb-4">
                {localConfig.fieldMappings.map((mapping, index) => {
                  const displayType = mapping.displayType || 'detail';
                  const isBeingEdited = editingFieldMappingIndex === index;
                  return (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${isBeingEdited ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                      <div className="flex items-center space-x-3 flex-1">
                        {mapping.label ? (
                          <span className="px-2 py-1 text-xs font-medium text-gray-900 dark:text-gray-100">
                            {mapping.label}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs italic text-gray-400 dark:text-gray-500">
                            (no label)
                          </span>
                        )}
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {mapping.valueField}
                        </span>
                        <button
                          onClick={() => handleToggleDisplayType(index)}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            displayType === 'header'
                              ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          {displayType === 'header' ? 'Header (Color)' : 'Detail (Text)'}
                        </button>
                        <button
                          onClick={() => handleEditValueMappings(index)}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {mapping.valueMappings && mapping.valueMappings.length > 0
                            ? `${mapping.valueMappings.length} mappings`
                            : 'Add mappings'}
                        </button>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleEditFieldMapping(index)}
                          className="p-1 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600 rounded"
                          title="Edit field mapping"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveFieldMapping(index)}
                          className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-3">
              {editingFieldMappingIndex !== null && (
                <div className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Editing field mapping
                  </span>
                  <button
                    onClick={handleCancelEditFieldMapping}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={newMappingLabel}
                    onChange={(e) => setNewMappingLabel(e.target.value)}
                    placeholder="e.g., BOL"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Value Field</label>
                  <input
                    type="text"
                    value={newMappingValueField}
                    onChange={(e) => setNewMappingValueField(e.target.value)}
                    placeholder="e.g., bolNumber"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Display</label>
                  <Select
                    value={newMappingDisplayType}
                    onValueChange={(value) => setNewMappingDisplayType(value as 'header' | 'detail')}
                    options={[
                      { value: 'header', label: 'Header' },
                      { value: 'detail', label: 'Detail' }
                    ]}
                  />
                </div>
                <div className="col-span-1">
                  <button
                    onClick={handleAddFieldMapping}
                    disabled={!newMappingValueField.trim()}
                    className={`w-full px-3 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                      editingFieldMappingIndex !== null
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                    title={editingFieldMappingIndex !== null ? 'Update field mapping' : 'Add field mapping'}
                  >
                    {editingFieldMappingIndex !== null ? (
                      <Save className="h-4 w-4 mx-auto" />
                    ) : (
                      <Plus className="h-4 w-4 mx-auto" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Header: Displays with colored badge (color set in value mappings). Only one field can be set as Header.
                <br />
                Detail: Displays as plain black text. Label is optional - leave blank to show only the value.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(localConfig)}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>

      {showValueMappingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Value Mappings
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Map source values to display values with colors (e.g., B → BOL [Blue], P → PO [Green])
              </p>
            </div>

            <div className="p-6 space-y-4">
              {editingValueMappings.length > 0 && (
                <div className="space-y-2 mb-4">
                  {editingValueMappings.map((mapping, idx) => {
                    const colorConfig = availableColors.find(c => c.value === mapping.color);
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                          {mapping.sourceValue} → {mapping.displayValue}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${colorConfig?.className || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {colorConfig?.label || 'Gray'}
                        </span>
                        <button
                          onClick={() => setEditingValueMappings(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Source Value</label>
                  <input
                    type="text"
                    id="sourceValue"
                    placeholder="e.g., B"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Display Value</label>
                  <input
                    type="text"
                    id="displayValue"
                    placeholder="e.g., BOL"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Color</label>
                  <Select
                    value={newValueMappingColor}
                    onValueChange={setNewValueMappingColor}
                    options={availableColors.map(c => ({ value: c.value, label: c.label }))}
                  />
                </div>
                <div className="col-span-1">
                  <button
                    onClick={() => {
                      const sourceInput = document.getElementById('sourceValue') as HTMLInputElement;
                      const displayInput = document.getElementById('displayValue') as HTMLInputElement;
                      if (sourceInput.value.trim() && displayInput.value.trim()) {
                        setEditingValueMappings(prev => [...prev, {
                          sourceValue: sourceInput.value.trim(),
                          displayValue: displayInput.value.trim(),
                          color: newValueMappingColor
                        }]);
                        sourceInput.value = '';
                        displayInput.value = '';
                        setNewValueMappingColor('blue');
                      }
                    }}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mx-auto" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowValueMappingsModal(false);
                  setEditingMappingIndex(null);
                  setEditingValueMappings([]);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveValueMappings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Mappings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

interface DocumentsConfigModalProps {
  templateId: string;
  documentConfigs: TrackTraceDocumentConfig[];
  templateFields: TrackTraceTemplateField[];
  onClose: () => void;
  onRefresh: () => void;
}

interface AuthConfig {
  id: string;
  name: string;
}

function DocumentsConfigModal({
  templateId,
  documentConfigs,
  templateFields,
  onClose,
  onRefresh
}: DocumentsConfigModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<TrackTraceDocumentConfig | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [authConfigs, setAuthConfigs] = useState<AuthConfig[]>([]);
  const [imagingBuckets, setImagingBuckets] = useState<{ id: string; name: string }[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyConfig, setCopyConfig] = useState<TrackTraceDocumentConfig | null>(null);
  const [copyName, setCopyName] = useState('');
  const [showUrlVarDropdown, setShowUrlVarDropdown] = useState(false);
  const getDocUrlInputRef = useRef<HTMLInputElement>(null);

  const [showTestSection, setShowTestSection] = useState(false);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testLoading, setTestLoading] = useState(false);
  const [testResults, setTestResults] = useState<{
    searchApiResponse?: any[];
    getDocResponse?: any;
    searchApiUrl?: string;
    getDocApiUrl?: string;
    error?: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    searchApiUrl: '',
    getDocumentApiUrl: '',
    docIdField: 'docId',
    docNameField: 'fileName',
    docTypeField: 'fileExtension',
    docSizeField: 'fileSize',
    authConfigId: '',
    isEnabled: true,
    emailEnabled: false,
    emailSubject: 'Document: {{document_name}}',
    vendorType: 'synergize',
    parseitBucketId: '',
    parseitSearchField: 'bill_number',
    emailTemplate: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">
                {{document_name}}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hello,
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Please find the attached document: <strong>{{document_name}}</strong>
              </p>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                This document was shared with you from the shipment tracking system.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                {{company_name}}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  });

  useEffect(() => {
    loadAuthConfigs();
    loadImagingBuckets();
  }, []);

  const loadAuthConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('api_auth_config')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setAuthConfigs(data || []);
    } catch (err) {
      console.error('Failed to load auth configs:', err);
    }
  };

  const loadImagingBuckets = async () => {
    try {
      const { data, error } = await supabase
        .from('imaging_buckets')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setImagingBuckets(data || []);
    } catch (err) {
      console.error('Failed to load imaging buckets:', err);
    }
  };

  const [filters, setFilters] = useState<Array<{
    id?: string;
    fieldName: string;
    valueType: 'variable' | 'static';
    variableName: string;
    staticValue: string;
  }>>([]);

  const handleAddConfig = () => {
    setEditingConfig(null);
    setFormData({
      name: '',
      searchApiUrl: '',
      getDocumentApiUrl: '',
      docIdField: 'docId',
      docNameField: 'fileName',
      docTypeField: 'fileExtension',
      docSizeField: 'fileSize',
      authConfigId: '',
      isEnabled: true,
      emailEnabled: false,
      emailSubject: 'Document: {{document_name}}',
      emailTemplate: formData.emailTemplate,
      vendorType: 'synergize',
      parseitBucketId: '',
      parseitSearchField: 'bill_number'
    });
    setFilters([]);
    setShowConfigForm(true);
  };

  const handleEditConfig = (config: TrackTraceDocumentConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      searchApiUrl: config.searchApiUrl,
      getDocumentApiUrl: config.getDocumentApiUrl,
      docIdField: config.docIdField,
      docNameField: config.docNameField,
      docTypeField: config.docTypeField || 'fileExtension',
      docSizeField: config.docSizeField || 'fileSize',
      authConfigId: config.authConfigId || '',
      isEnabled: config.isEnabled,
      emailEnabled: config.emailEnabled || false,
      emailSubject: config.emailSubject || 'Document: {{document_name}}',
      emailTemplate: config.emailTemplate || formData.emailTemplate,
      vendorType: config.vendorType || 'synergize',
      parseitBucketId: config.parseitBucketId || '',
      parseitSearchField: config.parseitSearchField || 'bill_number'
    });
    setFilters((config.filters || []).map(f => ({
      id: f.id,
      fieldName: f.fieldName,
      valueType: f.valueType,
      variableName: f.variableName || '',
      staticValue: f.staticValue || ''
    })));
    setShowConfigForm(true);
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this document configuration?')) return;

    try {
      const { error } = await supabase
        .from('track_trace_document_configs')
        .delete()
        .eq('id', configId);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete configuration');
    }
  };

  const handleCopyConfig = (config: TrackTraceDocumentConfig) => {
    setCopyConfig(config);
    setCopyName(`${config.name} - Copy`);
    setShowCopyModal(true);
  };

  const executeCopy = async () => {
    if (!copyConfig || !copyName.trim()) return;

    try {
      setSaving(true);
      setError(null);

      const { data: newConfig, error: insertError } = await supabase
        .from('track_trace_document_configs')
        .insert({
          template_id: templateId,
          name: copyName.trim(),
          search_api_url: copyConfig.searchApiUrl,
          get_document_api_url: copyConfig.getDocumentApiUrl,
          doc_id_field: copyConfig.docIdField,
          doc_name_field: copyConfig.docNameField,
          doc_type_field: copyConfig.docTypeField || 'fileExtension',
          doc_size_field: copyConfig.docSizeField || 'fileSize',
          auth_config_id: copyConfig.authConfigId || null,
          is_enabled: copyConfig.isEnabled,
          vendor_type: copyConfig.vendorType || 'synergize',
          parseit_bucket_id: copyConfig.parseitBucketId || null,
          parseit_search_field: copyConfig.parseitSearchField || 'bill_number',
          sort_order: documentConfigs.length
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (copyConfig.filters && copyConfig.filters.length > 0 && newConfig) {
        const filtersToInsert = copyConfig.filters.map((f, index) => ({
          document_config_id: newConfig.id,
          field_name: f.fieldName,
          value_type: f.valueType,
          variable_name: f.variableName || null,
          static_value: f.staticValue || null,
          sort_order: index
        }));

        const { error: filtersError } = await supabase
          .from('track_trace_document_filters')
          .insert(filtersToInsert);

        if (filtersError) throw filtersError;
      }

      setShowCopyModal(false);
      setCopyConfig(null);
      setCopyName('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to copy configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (formData.vendorType === 'synergize' && (!formData.searchApiUrl.trim() || !formData.getDocumentApiUrl.trim())) {
      setError('Search API URL and Get Document API URL are required for Synergize');
      return;
    }
    if (formData.vendorType === 'parseit' && !formData.parseitBucketId) {
      setError('Imaging Bucket is required for Parse-It');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (editingConfig) {
        const { error: updateError } = await supabase
          .from('track_trace_document_configs')
          .update({
            name: formData.name,
            search_api_url: formData.searchApiUrl,
            get_document_api_url: formData.getDocumentApiUrl,
            doc_id_field: formData.docIdField,
            doc_name_field: formData.docNameField,
            doc_type_field: formData.docTypeField,
            doc_size_field: formData.docSizeField,
            auth_config_id: formData.authConfigId || null,
            is_enabled: formData.isEnabled,
            email_enabled: formData.emailEnabled,
            email_subject: formData.emailSubject,
            email_template: formData.emailTemplate,
            vendor_type: formData.vendorType,
            parseit_bucket_id: formData.parseitBucketId || null,
            parseit_search_field: formData.parseitSearchField || 'bill_number',
            updated_at: new Date().toISOString()
          })
          .eq('id', editingConfig.id);

        if (updateError) throw updateError;

        await supabase
          .from('track_trace_document_filters')
          .delete()
          .eq('document_config_id', editingConfig.id);

        if (filters.length > 0) {
          const filtersToInsert = filters.map((f, index) => ({
            document_config_id: editingConfig.id,
            field_name: f.fieldName,
            value_type: f.valueType,
            variable_name: f.valueType === 'variable' ? f.variableName : null,
            static_value: f.valueType === 'static' ? f.staticValue : null,
            sort_order: index
          }));

          const { error: filtersError } = await supabase
            .from('track_trace_document_filters')
            .insert(filtersToInsert);

          if (filtersError) throw filtersError;
        }
      } else {
        const { data: newConfig, error: insertError } = await supabase
          .from('track_trace_document_configs')
          .insert({
            template_id: templateId,
            name: formData.name,
            search_api_url: formData.searchApiUrl,
            get_document_api_url: formData.getDocumentApiUrl,
            doc_id_field: formData.docIdField,
            doc_name_field: formData.docNameField,
            doc_type_field: formData.docTypeField,
            doc_size_field: formData.docSizeField,
            auth_config_id: formData.authConfigId || null,
            is_enabled: formData.isEnabled,
            email_enabled: formData.emailEnabled,
            email_subject: formData.emailSubject,
            email_template: formData.emailTemplate,
            vendor_type: formData.vendorType,
            parseit_bucket_id: formData.parseitBucketId || null,
            parseit_search_field: formData.parseitSearchField || 'bill_number',
            sort_order: documentConfigs.length
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (filters.length > 0 && newConfig) {
          const filtersToInsert = filters.map((f, index) => ({
            document_config_id: newConfig.id,
            field_name: f.fieldName,
            value_type: f.valueType,
            variable_name: f.valueType === 'variable' ? f.variableName : null,
            static_value: f.valueType === 'static' ? f.staticValue : null,
            sort_order: index
          }));

          const { error: filtersError } = await supabase
            .from('track_trace_document_filters')
            .insert(filtersToInsert);

          if (filtersError) throw filtersError;
        }
      }

      setShowConfigForm(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFilter = () => {
    setFilters(prev => [...prev, {
      fieldName: '',
      valueType: 'static',
      variableName: '',
      staticValue: ''
    }]);
  };

  const handleRemoveFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleFilterChange = (index: number, field: string, value: string) => {
    setFilters(prev => prev.map((f, i) =>
      i === index ? { ...f, [field]: value } : f
    ));
  };

  const insertUrlVariable = (variable: string) => {
    const input = getDocUrlInputRef.current;
    if (!input) {
      setFormData(prev => ({ ...prev, getDocumentApiUrl: prev.getDocumentApiUrl + `{{${variable}}}` }));
      setShowUrlVarDropdown(false);
      return;
    }

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const currentValue = formData.getDocumentApiUrl;
    const newValue = currentValue.substring(0, start) + `{{${variable}}}` + currentValue.substring(end);

    setFormData(prev => ({ ...prev, getDocumentApiUrl: newValue }));
    setShowUrlVarDropdown(false);

    setTimeout(() => {
      const newCursorPos = start + variable.length + 4;
      input.focus();
      input.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleTestApi = async () => {
    setTestLoading(true);
    setTestResults(null);

    try {
      const filterParts: string[] = [];
      filters.forEach(f => {
        if (f.fieldName) {
          let value = '';
          if (f.valueType === 'static') {
            value = f.staticValue;
          } else if (f.valueType === 'variable') {
            value = testValues[f.fieldName] || '';
          }
          if (value) {
            filterParts.push(`${f.fieldName} eq '${value}'`);
          }
        }
      });

      const filterQuery = filterParts.length > 0 ? filterParts.join(' and ') : '';
      const separator = formData.searchApiUrl.includes('?') ? '&' : '?';
      const searchUrl = filterQuery
        ? `${formData.searchApiUrl}${separator}$filter=${encodeURIComponent(filterQuery)}`
        : formData.searchApiUrl;

      const authHeaders = await getAuthHeaders();

      const searchResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          fullUrl: searchUrl,
          authConfigId: formData.authConfigId || undefined
        })
      });

      const searchData = await searchResponse.json();

      if (searchData.error) {
        setTestResults({
          error: searchData.error,
          searchApiUrl: searchUrl
        });
        return;
      }

      let responseArray = searchData.value || searchData;

      if (!Array.isArray(responseArray) && typeof responseArray === 'object' && responseArray !== null) {
        const dataKeys = Object.keys(responseArray).filter(k => !k.startsWith('_'));
        if (dataKeys.length > 0 && dataKeys.every(k => !isNaN(Number(k)))) {
          responseArray = dataKeys.map(k => responseArray[k]);
        } else {
          responseArray = [responseArray];
        }
      } else if (!Array.isArray(responseArray)) {
        responseArray = [responseArray];
      }

      let getDocResponse = null;
      let getDocApiUrl = '';

      if (responseArray.length > 0 && formData.getDocumentApiUrl) {
        const firstDoc = responseArray[0];
        getDocApiUrl = formData.getDocumentApiUrl.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
          return firstDoc?.[key] || '';
        });

        const getDocResponseData = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-trace-proxy`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            fullUrl: getDocApiUrl,
            authConfigId: formData.authConfigId || undefined
          })
        });

        const getDocData = await getDocResponseData.json();
        getDocResponse = getDocData.error ? { error: getDocData.error } : { success: true, status: getDocResponseData.status };
      }

      setTestResults({
        searchApiResponse: responseArray,
        getDocResponse,
        searchApiUrl: searchUrl,
        getDocApiUrl
      });

    } catch (err: any) {
      setTestResults({
        error: err.message || 'Failed to test API configuration'
      });
    } finally {
      setTestLoading(false);
    }
  };

  const variableFilters = filters.filter(f => f.valueType === 'variable' && f.fieldName);

  return createPortal(
    <>
      {showCopyModal && copyConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Copy className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Copy Configuration
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Create a copy of "{copyConfig.name}"
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Configuration Name
              </label>
              <input
                type="text"
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                placeholder="Enter name for the copy"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && copyName.trim()) {
                    executeCopy();
                  }
                }}
              />
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCopyModal(false);
                  setCopyConfig(null);
                  setCopyName('');
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeCopy}
                disabled={!copyName.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Copying...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Create Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {showConfigForm ? (editingConfig ? 'Edit Document Configuration' : 'Add Document Configuration') : 'Document API Configuration'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {showConfigForm ? 'Configure search API and filters for document retrieval' : 'Configure APIs to fetch and display shipment documents'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {showConfigForm ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Configuration Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., POD Documents"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <Select
                  label="Imaging Provider *"
                  value={formData.vendorType}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, vendorType: val }))}
                  options={[
                    { value: 'synergize', label: 'Synergize' },
                    { value: 'parseit', label: 'Parse-It Imaging' }
                  ]}
                  placeholder="Select provider"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formData.vendorType === 'parseit'
                    ? 'Fetches documents from the built-in Parse-It imaging system.'
                    : 'Fetches documents from an external Synergize API endpoint.'}
                </p>
              </div>

              {formData.vendorType === 'parseit' && (
                <>
                  <div>
                    <Select
                      label="Imaging Bucket *"
                      value={formData.parseitBucketId}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, parseitBucketId: val }))}
                      options={imagingBuckets.map(b => ({ value: b.id, label: b.name }))}
                      placeholder="Select bucket"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Select which imaging bucket to search for documents.
                    </p>
                  </div>
                  <div>
                    <Select
                      label="Search Field *"
                      value={formData.parseitSearchField}
                      onValueChange={(val) => setFormData(prev => ({ ...prev, parseitSearchField: val }))}
                      options={[
                        { value: 'bill_number', label: 'Bill Number' },
                        { value: 'detail_line_id', label: 'Detail Line ID' }
                      ]}
                      placeholder="Select search field"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The field used to match imaging documents to this shipment.
                    </p>
                  </div>
                </>
              )}

              {formData.vendorType === 'synergize' && (
              <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Authentication
                  </div>
                </label>
                <select
                  value={formData.authConfigId}
                  onChange={(e) => setFormData(prev => ({ ...prev, authConfigId: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No authentication (use default API settings)</option>
                  {authConfigs.map(config => (
                    <option key={config.id} value={config.id}>{config.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Select which authentication configuration to use for fetching documents. Configure authentications in Settings &gt; API Settings &gt; Authentication.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Search API URL (API #1) *
                </label>
                <input
                  type="text"
                  value={formData.searchApiUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, searchApiUrl: e.target.value }))}
                  placeholder="https://api.example.com/documents"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Base URL for searching documents. Filters will be appended as $filter query parameter.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    $filter Parameters for Search API URL
                  </h4>
                  <button
                    onClick={handleAddFilter}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Filter
                  </button>
                </div>

                {filters.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No filters configured. Click "Add Filter" to add query parameters.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filters.map((filter, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Field Name
                            </label>
                            <input
                              type="text"
                              value={filter.fieldName}
                              onChange={(e) => handleFilterChange(index, 'fieldName', e.target.value)}
                              placeholder="e.g., FBNumber"
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Value Type
                            </label>
                            <select
                              value={filter.valueType}
                              onChange={(e) => handleFilterChange(index, 'valueType', e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="variable">Variable (from shipment)</option>
                              <option value="static">Static Value</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              {filter.valueType === 'variable' ? 'Variable Name' : 'Static Value'}
                            </label>
                            {filter.valueType === 'variable' ? (
                              <select
                                value={filter.variableName}
                                onChange={(e) => handleFilterChange(index, 'variableName', e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              >
                                <option value="">Select variable...</option>
                                {templateFields
                                  .filter(f => f.parameterType === '$select')
                                  .map(field => (
                                    <option key={field.id} value={field.apiFieldPath || field.fieldName}>
                                      {field.displayLabel} ({field.apiFieldPath || field.fieldName})
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={filter.staticValue}
                                onChange={(e) => handleFilterChange(index, 'staticValue', e.target.value)}
                                placeholder="e.g., POD"
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              />
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFilter(index)}
                          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded mt-5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                  Response Field Mappings
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Define the field names from the Search API response. These can be used as variables in the Get Document API URL below.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Document ID Field
                    </label>
                    <input
                      type="text"
                      value={formData.docIdField}
                      onChange={(e) => setFormData(prev => ({ ...prev, docIdField: e.target.value }))}
                      placeholder="docId"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Document Name Field
                    </label>
                    <input
                      type="text"
                      value={formData.docNameField}
                      onChange={(e) => setFormData(prev => ({ ...prev, docNameField: e.target.value }))}
                      placeholder="fileName"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      File Type Field
                    </label>
                    <input
                      type="text"
                      value={formData.docTypeField}
                      onChange={(e) => setFormData(prev => ({ ...prev, docTypeField: e.target.value }))}
                      placeholder="fileExtension"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      File Size Field
                    </label>
                    <input
                      type="text"
                      value={formData.docSizeField}
                      onChange={(e) => setFormData(prev => ({ ...prev, docSizeField: e.target.value }))}
                      placeholder="fileSize"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Get Document API URL (API #2) *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowUrlVarDropdown(!showUrlVarDropdown)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                    >
                      <ChevronDown className="h-3 w-3" />
                      Insert Variable
                    </button>
                    {showUrlVarDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Response Field Variables</p>
                        </div>
                        <div className="py-1">
                          {[
                            { key: formData.docIdField || 'docId', label: 'Document ID' },
                            { key: formData.docNameField || 'fileName', label: 'Document Name' },
                            { key: formData.docTypeField || 'fileExtension', label: 'File Type' },
                            { key: formData.docSizeField || 'fileSize', label: 'File Size' },
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => insertUrlVariable(item.key)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
                            >
                              <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">{`{{${item.key}}}`}</code>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={getDocUrlInputRef}
                  type="text"
                  value={formData.getDocumentApiUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, getDocumentApiUrl: e.target.value }))}
                  placeholder="https://api.example.com/documents/{{docId}}/content"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  URL template for retrieving document content. Use variables like {`{{docId}}`} from response field mappings above.
                </p>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTestSection(!showTestSection)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Test Configuration</span>
                  </div>
                  {showTestSection ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {showTestSection && (
                  <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {variableFilters.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Enter test values for the variable filters to test the API configuration.
                        </p>
                        {variableFilters.map((f, index) => (
                          <div key={index}>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              {f.fieldName} {f.variableName && <span className="text-gray-400">({f.variableName})</span>}
                            </label>
                            <input
                              type="text"
                              value={testValues[f.fieldName] || ''}
                              onChange={(e) => setTestValues(prev => ({ ...prev, [f.fieldName]: e.target.value }))}
                              placeholder={`Enter test value for ${f.fieldName}`}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        No variable filters configured. Add a filter with "Variable (from shipment)" type to test with dynamic values.
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleTestApi}
                      disabled={testLoading || !formData.searchApiUrl}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Test APIs
                        </>
                      )}
                    </button>

                    {testResults && (
                      <div className="space-y-3">
                        {testResults.error ? (
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{testResults.error}</p>
                              </div>
                            </div>
                            {testResults.searchApiUrl && (
                              <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                                <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{testResults.searchApiUrl}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                                  Search API (API #1) - {testResults.searchApiResponse?.length || 0} document(s) found
                                </p>
                              </div>
                              <p className="text-xs text-green-600 dark:text-green-400 font-mono break-all mb-2">{testResults.searchApiUrl}</p>
                              {testResults.searchApiResponse && testResults.searchApiResponse.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">First result:</p>
                                  <div className="bg-white dark:bg-gray-800 rounded p-2 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto">
                                    <pre className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                      {JSON.stringify(testResults.searchApiResponse[0], null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>

                            {testResults.getDocApiUrl && (
                              <div className={`p-3 border rounded-lg ${
                                testResults.getDocResponse?.success
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                  : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                              }`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`w-2 h-2 rounded-full ${
                                    testResults.getDocResponse?.success ? 'bg-green-500' : 'bg-yellow-500'
                                  }`} />
                                  <p className={`text-sm font-medium ${
                                    testResults.getDocResponse?.success
                                      ? 'text-green-800 dark:text-green-300'
                                      : 'text-yellow-800 dark:text-yellow-300'
                                  }`}>
                                    Get Document API (API #2) - {testResults.getDocResponse?.success ? 'Accessible' : 'Issue detected'}
                                  </p>
                                </div>
                                <p className={`text-xs font-mono break-all ${
                                  testResults.getDocResponse?.success
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-yellow-600 dark:text-yellow-400'
                                }`}>{testResults.getDocApiUrl}</p>
                                {testResults.getDocResponse?.error && (
                                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{testResults.getDocResponse.error}</p>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              </>
              )}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isEnabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, isEnabled: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Enable this configuration</span>
              </label>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Mail className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Document Feature</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Allow users to email documents to recipients</p>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.emailEnabled}
                      onChange={(e) => setFormData(prev => ({ ...prev, emailEnabled: e.target.checked }))}
                      className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable Email Button</span>
                  </label>
                </div>

                {formData.emailEnabled && (
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email Subject
                      </label>
                      <input
                        type="text"
                        value={formData.emailSubject}
                        onChange={(e) => setFormData(prev => ({ ...prev, emailSubject: e.target.value }))}
                        placeholder="Document: {{document_name}}"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Available variables: {'{{document_name}}'}, {'{{company_name}}'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email Template (HTML)
                      </label>
                      <textarea
                        value={formData.emailTemplate}
                        onChange={(e) => setFormData(prev => ({ ...prev, emailTemplate: e.target.value }))}
                        rows={12}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 font-mono text-sm"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        HTML email template. Available variables: {'{{document_name}}'}, {'{{company_name}}'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {documentConfigs.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No document configurations yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Add a configuration to enable document retrieval</p>
                </div>
              ) : (
                documentConfigs.map(config => (
                  <div key={config.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{config.name}</h4>
                          {!config.isEnabled && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-500 rounded">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate">
                          {config.searchApiUrl}
                        </p>
                        {config.filters && config.filters.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {config.filters.map((f, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                {f.fieldName} = {f.valueType === 'variable' ? `{${f.variableName}}` : `'${f.staticValue}'`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditConfig(config)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleCopyConfig(config)}
                          disabled={saving}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                          title="Copy"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(config.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <button
                onClick={handleAddConfig}
                className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Add Document Configuration
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          {showConfigForm ? (
            <>
              <button
                onClick={() => setShowConfigForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
        </div>
      </div>
    </>,
    document.body
  );
}

interface TimelineConfigModalProps {
  templateId: string;
  section: TrackTraceTemplateSection;
  timelineStatuses: TrackTraceTimelineStatus[];
  templateFields: TrackTraceTemplateField[];
  onClose: () => void;
  onRefresh: () => void;
  onSaveConfig: (config: TimelineSectionConfig) => Promise<void>;
}

function TimelineConfigModal({
  templateId,
  section,
  timelineStatuses,
  templateFields,
  onClose,
  onRefresh,
  onSaveConfig
}: TimelineConfigModalProps) {
  const [statuses, setStatuses] = useState<TrackTraceTimelineStatus[]>(timelineStatuses);
  const [editingStatus, setEditingStatus] = useState<TrackTraceTimelineStatus | null>(null);
  const [newStatusName, setNewStatusName] = useState('');
  const [newChildStatus, setNewChildStatus] = useState('');
  const [statusField, setStatusField] = useState((section.config as TimelineSectionConfig)?.statusField || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatuses(timelineStatuses);
  }, [timelineStatuses]);

  const handleAddStatus = async () => {
    if (!newStatusName.trim()) return;

    try {
      setSaving(true);
      setError(null);

      const nextOrder = statuses.length > 0
        ? Math.max(...statuses.map(s => s.displayOrder)) + 1
        : 1;

      const { data, error } = await supabase
        .from('track_trace_timeline_statuses')
        .insert({
          template_id: templateId,
          name: newStatusName.trim(),
          display_order: nextOrder
        })
        .select()
        .single();

      if (error) throw error;

      const newStatus: TrackTraceTimelineStatus = {
        id: data.id,
        templateId: data.template_id,
        name: data.name,
        displayOrder: data.display_order,
        locationField: data.location_field,
        dateField: data.date_field,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        childStatuses: []
      };

      setStatuses(prev => [...prev, newStatus]);
      setNewStatusName('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to add status');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('track_trace_timeline_statuses')
        .delete()
        .eq('id', statusId);

      if (error) throw error;

      setStatuses(prev => prev.filter(s => s.id !== statusId));
      if (editingStatus?.id === statusId) {
        setEditingStatus(null);
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete status');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (status: TrackTraceTimelineStatus) => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('track_trace_timeline_statuses')
        .update({
          name: status.name,
          location_field: status.locationField || null,
          date_field: status.dateField || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', status.id);

      if (error) throw error;

      setStatuses(prev => prev.map(s => s.id === status.id ? status : s));
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleAddChildStatus = async (parentId: string) => {
    if (!newChildStatus.trim()) return;

    try {
      setSaving(true);
      setError(null);

      const parent = statuses.find(s => s.id === parentId);
      const nextOrder = parent?.childStatuses && parent.childStatuses.length > 0
        ? Math.max(...parent.childStatuses.map(c => c.displayOrder)) + 1
        : 1;

      const { data, error } = await supabase
        .from('track_trace_timeline_child_statuses')
        .insert({
          timeline_status_id: parentId,
          status_value: newChildStatus.trim(),
          display_order: nextOrder
        })
        .select()
        .single();

      if (error) throw error;

      const newChild: TrackTraceTimelineChildStatus = {
        id: data.id,
        timelineStatusId: data.timeline_status_id,
        statusValue: data.status_value,
        displayOrder: data.display_order,
        createdAt: data.created_at
      };

      setStatuses(prev => prev.map(s => {
        if (s.id === parentId) {
          return {
            ...s,
            childStatuses: [...(s.childStatuses || []), newChild]
          };
        }
        return s;
      }));

      if (editingStatus?.id === parentId) {
        setEditingStatus(prev => prev ? {
          ...prev,
          childStatuses: [...(prev.childStatuses || []), newChild]
        } : null);
      }

      setNewChildStatus('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to add child status');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChildStatus = async (childId: string, parentId: string) => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('track_trace_timeline_child_statuses')
        .delete()
        .eq('id', childId);

      if (error) throw error;

      setStatuses(prev => prev.map(s => {
        if (s.id === parentId) {
          return {
            ...s,
            childStatuses: (s.childStatuses || []).filter(c => c.id !== childId)
          };
        }
        return s;
      }));

      if (editingStatus?.id === parentId) {
        setEditingStatus(prev => prev ? {
          ...prev,
          childStatuses: (prev.childStatuses || []).filter(c => c.id !== childId)
        } : null);
      }

      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete child status');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStatus = async (statusId: string, direction: 'up' | 'down') => {
    const index = statuses.findIndex(s => s.id === statusId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === statuses.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const newStatuses = [...statuses];
    const temp = newStatuses[index];
    newStatuses[index] = newStatuses[newIndex];
    newStatuses[newIndex] = temp;

    const updatedStatuses = newStatuses.map((s, i) => ({
      ...s,
      displayOrder: i + 1
    }));

    setStatuses(updatedStatuses);

    try {
      for (const s of updatedStatuses) {
        await supabase
          .from('track_trace_timeline_statuses')
          .update({ display_order: s.displayOrder })
          .eq('id', s.id);
      }
      onRefresh();
    } catch (err) {
      console.error('Failed to update status order:', err);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      const config: TimelineSectionConfig = {
        statusField
      };
      await onSaveConfig(config);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const fieldOptions = templateFields
    .filter(f => f.isEnabled)
    .reduce((acc, f) => {
      if (!acc.some(opt => opt.value === f.fieldName)) {
        acc.push({ value: f.fieldName, label: f.displayLabel });
      }
      return acc;
    }, [] as { value: string; label: string }[]);

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-4 md:inset-8 lg:inset-16 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Shipment Timeline Configuration
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status Field
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Select the API field that contains the shipment status. This value will be compared against child statuses to determine timeline progress.
            </p>
            <Select
              value={statusField}
              onValueChange={setStatusField}
              options={fieldOptions}
              placeholder="Select status field"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Timeline Statuses</h4>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="New status name..."
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                />
                <button
                  onClick={handleAddStatus}
                  disabled={saving || !newStatusName.trim()}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Status
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {statuses.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-8">
                  No timeline statuses configured. Add statuses to define the shipment timeline.
                </p>
              ) : (
                statuses.map((status, index) => (
                  <div
                    key={status.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleMoveStatus(status.id, 'up')}
                            disabled={index === 0}
                            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleMoveStatus(status.id, 'down')}
                            disabled={index === statuses.length - 1}
                            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="w-8 h-8 flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium">
                          {status.displayOrder}
                        </span>
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-gray-100">{status.name}</h5>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {status.childStatuses?.length || 0} child status{(status.childStatuses?.length || 0) !== 1 ? 'es' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingStatus(editingStatus?.id === status.id ? null : status)}
                          className="p-1.5 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                          title="Configure"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStatus(status.id)}
                          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {editingStatus?.id === status.id && (
                      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Status Name
                            </label>
                            <input
                              type="text"
                              value={editingStatus.name}
                              onChange={(e) => setEditingStatus({ ...editingStatus, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Location Field (Optional)
                            </label>
                            <Select
                              value={editingStatus.locationField || '__none__'}
                              onValueChange={(value) => setEditingStatus({ ...editingStatus, locationField: value === '__none__' ? undefined : value })}
                              options={[
                                { value: '__none__', label: 'None' },
                                ...fieldOptions
                              ]}
                              placeholder="Select field"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Date Field (Optional)
                          </label>
                          <Select
                            value={editingStatus.dateField || '__none__'}
                            onValueChange={(value) => setEditingStatus({ ...editingStatus, dateField: value === '__none__' ? undefined : value })}
                            options={[
                              { value: '__none__', label: 'None' },
                              ...fieldOptions
                            ]}
                            placeholder="Select field"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Child Statuses
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            Add API status values that should mark this timeline status as complete. If the shipment's status matches any of these values, this status and all previous statuses will be shown as complete.
                          </p>
                          <div className="flex items-center gap-2 mb-3">
                            <input
                              type="text"
                              value={newChildStatus}
                              onChange={(e) => setNewChildStatus(e.target.value)}
                              placeholder="API status value (e.g., DELIVERED, IN_TRANSIT)"
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              onKeyDown={(e) => e.key === 'Enter' && handleAddChildStatus(status.id)}
                            />
                            <button
                              onClick={() => handleAddChildStatus(status.id)}
                              disabled={saving || !newChildStatus.trim()}
                              className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 text-sm"
                            >
                              <Plus className="h-4 w-4" />
                              Add
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {(editingStatus.childStatuses || []).map((child) => (
                              <span
                                key={child.id}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm"
                              >
                                {child.statusValue}
                                <button
                                  onClick={() => handleDeleteChildStatus(child.id, status.id)}
                                  className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            {(!editingStatus.childStatuses || editingStatus.childStatuses.length === 0) && (
                              <span className="text-sm text-gray-500 dark:text-gray-400 italic">
                                No child statuses added
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => handleUpdateStatus(editingStatus)}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving || !statusField}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

interface BarcodeDetailsConfigModalProps {
  config: BarcodeDetailsSectionConfig;
  onSave: (config: BarcodeDetailsSectionConfig) => void;
  onClose: () => void;
  saving: boolean;
  secondaryApis: SecondaryApiConfig[];
  apiSpecs: ApiSpec[];
  apiEndpoints: ApiSpecEndpoint[];
  authConfigs: { id: string; name: string }[];
  onSpecChange: (specId: string) => void;
}

function BarcodeDetailsConfigModal({
  config,
  onSave,
  onClose,
  saving,
  secondaryApis,
  apiSpecs,
  apiEndpoints,
  authConfigs,
  onSpecChange
}: BarcodeDetailsConfigModalProps) {
  const [localConfig, setLocalConfig] = useState<BarcodeDetailsSectionConfig>({
    apiSourceType: config.apiSourceType || 'main',
    secondaryApiId: config.secondaryApiId || '',
    apiSpecId: config.apiSpecId || '',
    apiSpecEndpointId: config.apiSpecEndpointId || '',
    responseArrayPath: config.responseArrayPath || '',
    nestedArrayPath: config.nestedArrayPath || '',
    secondaryEndpointId: config.secondaryEndpointId || '',
    secondaryParamField: config.secondaryParamField || '',
    fieldMappings: config.fieldMappings || [],
    imageConfig: config.imageConfig || { apiUrl: '', sourceField: '' }
  });

  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldApiField, setNewFieldApiField] = useState('');
  const [newFieldShowTotal, setNewFieldShowTotal] = useState(false);
  const [newFieldIsRequired, setNewFieldIsRequired] = useState(false);
  const [newFieldGroupId, setNewFieldGroupId] = useState('');
  const [newFieldGroupSeparator, setNewFieldGroupSeparator] = useState('');
  const [newFieldValueSuffix, setNewFieldValueSuffix] = useState('');
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);

  const filteredSpecs = apiSpecs.filter(spec => {
    if (localConfig.apiSourceType === 'main') {
      return !spec.secondary_api_id;
    } else {
      return spec.secondary_api_id === localConfig.secondaryApiId;
    }
  });

  const handleAddField = () => {
    if (!newFieldLabel.trim() || !newFieldApiField.trim()) return;

    const newMapping: BarcodeDetailsFieldMapping = {
      label: newFieldLabel.trim(),
      apiField: newFieldApiField.trim(),
      showTotal: newFieldShowTotal,
      isRequired: newFieldIsRequired,
      displayOrder: editingFieldIndex !== null ? editingFieldIndex : localConfig.fieldMappings.length,
      groupId: newFieldGroupId.trim() || undefined,
      groupSeparator: newFieldGroupSeparator || undefined,
      valueSuffix: newFieldValueSuffix || undefined
    };

    if (editingFieldIndex !== null) {
      setLocalConfig(prev => ({
        ...prev,
        fieldMappings: prev.fieldMappings.map((m, i) => i === editingFieldIndex ? newMapping : m)
      }));
    } else {
      setLocalConfig(prev => ({
        ...prev,
        fieldMappings: [...prev.fieldMappings, newMapping]
      }));
    }

    setNewFieldLabel('');
    setNewFieldApiField('');
    setNewFieldShowTotal(false);
    setNewFieldIsRequired(false);
    setNewFieldGroupId('');
    setNewFieldGroupSeparator('');
    setNewFieldValueSuffix('');
    setEditingFieldIndex(null);
  };

  const handleEditField = (index: number) => {
    const field = localConfig.fieldMappings[index];
    setNewFieldLabel(field.label);
    setNewFieldApiField(field.apiField);
    setNewFieldShowTotal(field.showTotal);
    setNewFieldIsRequired(field.isRequired || false);
    setNewFieldGroupId(field.groupId || '');
    setNewFieldGroupSeparator(field.groupSeparator || '');
    setNewFieldValueSuffix(field.valueSuffix || '');
    setEditingFieldIndex(index);
  };

  const handleRemoveField = (index: number) => {
    setLocalConfig(prev => ({
      ...prev,
      fieldMappings: prev.fieldMappings.filter((_, i) => i !== index)
    }));
  };

  const handleSpecChange = (specId: string) => {
    setLocalConfig(prev => ({
      ...prev,
      apiSpecId: specId,
      apiSpecEndpointId: ''
    }));
    if (specId) {
      onSpecChange(specId);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Configure Barcode Details Section
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure the API endpoint, field mappings, and image viewer for barcode details
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Source
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="barcodeApiSourceType"
                  value="main"
                  checked={localConfig.apiSourceType === 'main'}
                  onChange={() => setLocalConfig(prev => ({
                    ...prev,
                    apiSourceType: 'main',
                    secondaryApiId: '',
                    apiSpecId: '',
                    apiSpecEndpointId: ''
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Main API</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="barcodeApiSourceType"
                  value="secondary"
                  checked={localConfig.apiSourceType === 'secondary'}
                  onChange={() => setLocalConfig(prev => ({
                    ...prev,
                    apiSourceType: 'secondary',
                    apiSpecId: '',
                    apiSpecEndpointId: ''
                  }))}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Secondary API</span>
              </label>
            </div>
          </div>

          {localConfig.apiSourceType === 'secondary' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Secondary API
              </label>
              <Select
                value={localConfig.secondaryApiId || '__none__'}
                onValueChange={(value) => setLocalConfig(prev => ({
                  ...prev,
                  secondaryApiId: value === '__none__' ? '' : value,
                  apiSpecId: '',
                  apiSpecEndpointId: ''
                }))}
                options={[
                  { value: '__none__', label: 'Select Secondary API...' },
                  ...secondaryApis.map(api => ({ value: api.id!, label: api.name }))
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Specification
            </label>
            <Select
              value={localConfig.apiSpecId || '__none__'}
              onValueChange={(value) => handleSpecChange(value === '__none__' ? '' : value)}
              options={[
                { value: '__none__', label: 'Select API Spec...' },
                ...filteredSpecs.map(spec => ({ value: spec.id, label: spec.name }))
              ]}
            />
          </div>

          {localConfig.apiSpecId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Endpoint
              </label>
              <Select
                value={localConfig.apiSpecEndpointId || '__none__'}
                onValueChange={(value) => setLocalConfig(prev => ({
                  ...prev,
                  apiSpecEndpointId: value === '__none__' ? '' : value
                }))}
                options={[
                  { value: '__none__', label: 'Select Endpoint...' },
                  ...apiEndpoints
                    .filter(ep => ep.method === 'GET')
                    .map(ep => ({
                      value: ep.id,
                      label: `GET ${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}`
                    }))
                ]}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Response Array Path
            </label>
            <input
              type="text"
              value={localConfig.responseArrayPath || ''}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, responseArrayPath: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="e.g., details or data.items"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Path to the parent array in the API response (dot notation). Leave empty if response is already an array.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nested Array Field (Optional)
            </label>
            <input
              type="text"
              value={localConfig.nestedArrayPath || ''}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, nestedArrayPath: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="e.g., barcodes"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Field within each parent item containing the nested array to flatten. Each nested item inherits parent fields.
              Example: If parent has commodity/description and child has barcode/pcs, both are accessible in field mappings.
            </p>
          </div>

          {localConfig.apiSpecId && (
            <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Secondary API Endpoint (API #2) - Optional
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  If your barcode data requires a second API call, select the endpoint here. API #2 will be called for each item returned by API #1.
                </p>
                <Select
                  value={localConfig.secondaryEndpointId || '__none__'}
                  onValueChange={(value) => setLocalConfig(prev => ({
                    ...prev,
                    secondaryEndpointId: value === '__none__' ? '' : value
                  }))}
                  options={[
                    { value: '__none__', label: 'None (single API call)' },
                    ...apiEndpoints
                      .filter(ep => ep.method === 'GET')
                      .map(ep => ({
                        value: ep.id,
                        label: `GET ${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}`
                      }))
                  ]}
                />
              </div>

              {localConfig.secondaryEndpointId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Parameter Field from API #1
                  </label>
                  <input
                    type="text"
                    value={localConfig.secondaryParamField || ''}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, secondaryParamField: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., orderDetailId"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The field from API #1 response to use as the URL parameter in API #2. This value will replace the matching variable in the API #2 URL.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Field Mappings
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Define the columns to display in the barcode details grid. Enable "Show Total" for numeric fields to display a sum in the footer.
            </p>

            {localConfig.fieldMappings.length > 0 && (
              <div className="space-y-2 mb-4">
                {localConfig.fieldMappings.map((field, index) => (
                  <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${editingFieldIndex === index ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300' : field.groupId ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                    <div className="flex items-center space-x-3 flex-1 flex-wrap gap-y-1">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {field.label}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {field.apiField}
                      </span>
                      {field.groupId && (
                        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                          Group: {field.groupId}
                          {field.groupSeparator && ` (sep: "${field.groupSeparator}")`}
                          {field.valueSuffix && ` (suffix: "${field.valueSuffix}")`}
                        </span>
                      )}
                      {field.showTotal && (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">
                          Show Total
                        </span>
                      )}
                      {field.isRequired && (
                        <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditField(index)}
                        className="p-1 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600 rounded"
                        title="Edit field"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveField(index)}
                        className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title="Remove field"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Label</label>
                  <input
                    type="text"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Column header"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API Field</label>
                  <input
                    type="text"
                    value={newFieldApiField}
                    onChange={(e) => setNewFieldApiField(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="API field path"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldShowTotal}
                      onChange={(e) => setNewFieldShowTotal(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Total</span>
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldIsRequired}
                      onChange={(e) => setNewFieldIsRequired(e.target.checked)}
                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Required</span>
                  </label>
                </div>
                <div className="col-span-2">
                  <button
                    onClick={handleAddField}
                    disabled={!newFieldLabel.trim() || !newFieldApiField.trim()}
                    className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingFieldIndex !== null ? 'Update' : 'Add'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Group ID</label>
                  <input
                    type="text"
                    value={newFieldGroupId}
                    onChange={(e) => setNewFieldGroupId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., dimensions"
                    list="existing-group-ids"
                  />
                  <datalist id="existing-group-ids">
                    {[...new Set(localConfig.fieldMappings.map(f => f.groupId).filter(Boolean))].map(gid => (
                      <option key={gid} value={gid} />
                    ))}
                  </datalist>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Separator</label>
                  <input
                    type="text"
                    value={newFieldGroupSeparator}
                    onChange={(e) => setNewFieldGroupSeparator(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., x or space"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Value Suffix</label>
                  <input
                    type="text"
                    value={newFieldValueSuffix}
                    onChange={(e) => setNewFieldValueSuffix(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder={'e.g., " for inches'}
                  />
                </div>
                <div className="col-span-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fields with same Group ID combine into one column
                  </p>
                </div>
              </div>
            </div>
            {editingFieldIndex !== null && (
              <button
                onClick={() => {
                  setNewFieldLabel('');
                  setNewFieldApiField('');
                  setNewFieldShowTotal(false);
                  setNewFieldIsRequired(false);
                  setNewFieldGroupId('');
                  setNewFieldGroupSeparator('');
                  setNewFieldValueSuffix('');
                  setEditingFieldIndex(null);
                }}
                className="mt-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Images Configuration
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Configure the API endpoint for viewing barcode images. Use {'{fieldName}'} syntax to include a field value from the barcode data.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">API URL</label>
                <input
                  type="text"
                  value={localConfig.imageConfig?.apiUrl || ''}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    imageConfig: { ...prev.imageConfig!, apiUrl: e.target.value }
                  }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g., /api/barcodes/{barcodeId}/images"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Source Field (for URL variable)</label>
                <input
                  type="text"
                  value={localConfig.imageConfig?.sourceField || ''}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    imageConfig: { ...prev.imageConfig!, sourceField: e.target.value }
                  }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g., barcodeId"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  The field from the barcode data to use when calling the images API
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Authentication</label>
                <Select
                  value={localConfig.imageConfig?.authConfigId || '__none__'}
                  onValueChange={(value) => setLocalConfig(prev => ({
                    ...prev,
                    imageConfig: { ...prev.imageConfig!, authConfigId: value === '__none__' ? undefined : value }
                  }))}
                  options={[
                    { value: '__none__', label: 'No authentication' },
                    ...authConfigs.map(auth => ({ value: auth.id, label: auth.name }))
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(localConfig)}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
