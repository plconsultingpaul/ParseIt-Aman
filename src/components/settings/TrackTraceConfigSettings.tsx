import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, GripVertical, AlertCircle, Save, Search, Filter, Columns, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import type { User, Client, TrackTraceConfig, TrackTraceField, TrackTraceOrderByOption, SecondaryApiConfig, ApiSpec, ApiSpecEndpoint } from '../../types';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';
import { FormSkeleton } from '../common/Skeleton';

interface TrackTraceConfigSettingsProps {
  currentUser: User;
}

export default function TrackTraceConfigSettings({ currentUser }: TrackTraceConfigSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [config, setConfig] = useState<TrackTraceConfig | null>(null);
  const [fields, setFields] = useState<TrackTraceField[]>([]);

  const [secondaryApis, setSecondaryApis] = useState<SecondaryApiConfig[]>([]);
  const [apiSpecs, setApiSpecs] = useState<ApiSpec[]>([]);
  const [apiEndpoints, setApiEndpoints] = useState<ApiSpecEndpoint[]>([]);

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<TrackTraceField | null>(null);

  const [expandedSections, setExpandedSections] = useState({
    api: true,
    options: true,
    filters: true,
    columns: true
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      loadConfigForClient(selectedClientId);
    } else {
      setConfig(null);
      setFields([]);
    }
  }, [selectedClientId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [clientsRes, apisRes, specsRes] = await Promise.all([
        supabase.from('clients').select('*').eq('is_active', true).order('client_name'),
        supabase.from('secondary_api_configs').select('*').eq('is_active', true).order('name'),
        supabase.from('api_specs').select('*').order('name')
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (apisRes.error) throw apisRes.error;
      if (specsRes.error) throw specsRes.error;

      const mappedClients: Client[] = (clientsRes.data || []).map((c: any) => ({
        id: c.id,
        clientName: c.client_name,
        clientId: c.client_id,
        isActive: c.is_active,
        hasOrderEntryAccess: c.has_order_entry_access,
        hasRateQuoteAccess: c.has_rate_quote_access,
        hasAddressBookAccess: c.has_address_book_access,
        hasTrackTraceAccess: c.has_track_trace_access,
        hasInvoiceAccess: c.has_invoice_access,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }));

      setClients(mappedClients);
      setSecondaryApis(apisRes.data || []);
      setApiSpecs(specsRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadConfigForClient = async (clientId: string) => {
    try {
      setError(null);
      const { data: configData, error: configError } = await supabase
        .from('track_trace_configs')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (configError) throw configError;

      if (configData) {
        const mappedConfig: TrackTraceConfig = {
          id: configData.id,
          clientId: configData.client_id,
          apiSourceType: configData.api_source_type,
          secondaryApiId: configData.secondary_api_id,
          apiSpecId: configData.api_spec_id,
          apiSpecEndpointId: configData.api_spec_endpoint_id,
          apiPath: configData.api_path,
          httpMethod: configData.http_method,
          limitOptions: configData.limit_options || [10, 25, 50, 100],
          orderByOptions: configData.order_by_options || [],
          defaultLimit: configData.default_limit,
          defaultOrderBy: configData.default_order_by,
          defaultOrderDirection: configData.default_order_direction,
          isEnabled: configData.is_enabled,
          createdAt: configData.created_at,
          updatedAt: configData.updated_at
        };
        setConfig(mappedConfig);

        if (configData.api_spec_id) {
          loadEndpointsForSpec(configData.api_spec_id);
        }

        const { data: fieldsData, error: fieldsError } = await supabase
          .from('track_trace_fields')
          .select('*')
          .eq('config_id', configData.id)
          .order('field_order');

        if (fieldsError) throw fieldsError;

        const mappedFields: TrackTraceField[] = (fieldsData || []).map((f: any) => ({
          id: f.id,
          configId: f.config_id,
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
          createdAt: f.created_at,
          updatedAt: f.updated_at
        }));
        setFields(mappedFields);
      } else {
        setConfig({
          id: '',
          clientId,
          apiSourceType: 'main',
          apiPath: '',
          httpMethod: 'GET',
          limitOptions: [10, 25, 50, 100],
          orderByOptions: [],
          defaultLimit: 25,
          defaultOrderDirection: 'desc',
          isEnabled: false,
          createdAt: '',
          updatedAt: ''
        });
        setFields([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load config');
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

  const handleSaveConfig = async () => {
    if (!config || !selectedClientId) return;

    try {
      setSaving(true);
      setError(null);

      const configData = {
        client_id: selectedClientId,
        api_source_type: config.apiSourceType,
        secondary_api_id: config.apiSourceType === 'secondary' ? config.secondaryApiId : null,
        api_spec_id: config.apiSpecId || null,
        api_spec_endpoint_id: config.apiSpecEndpointId || null,
        api_path: config.apiPath,
        http_method: config.httpMethod,
        limit_options: config.limitOptions,
        order_by_options: config.orderByOptions,
        default_limit: config.defaultLimit,
        default_order_by: config.defaultOrderBy || null,
        default_order_direction: config.defaultOrderDirection,
        is_enabled: config.isEnabled,
        updated_at: new Date().toISOString()
      };

      let savedConfigId = config.id;

      if (config.id) {
        const { error } = await supabase
          .from('track_trace_configs')
          .update(configData)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('track_trace_configs')
          .insert([{ ...configData, created_at: new Date().toISOString() }])
          .select()
          .single();
        if (error) throw error;
        savedConfigId = data.id;
        setConfig({ ...config, id: savedConfigId });
      }

      setSuccessMessage('Configuration saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = (fieldType: 'filter' | 'select') => {
    const newField: TrackTraceField = {
      id: '',
      configId: config?.id || '',
      fieldType,
      fieldName: '',
      displayLabel: '',
      dataType: 'string',
      filterOperator: fieldType === 'filter' ? 'eq' : undefined,
      parameterType: 'query',
      apiFieldPath: '',
      isRequired: false,
      fieldOrder: fields.filter(f => f.fieldType === fieldType).length,
      isEnabled: true,
      createdAt: '',
      updatedAt: ''
    };
    setEditingField(newField);
    setShowFieldModal(true);
  };

  const handleEditField = (field: TrackTraceField) => {
    setEditingField({ ...field });
    setShowFieldModal(true);
  };

  const handleSaveField = async () => {
    if (!editingField || !config?.id) return;

    try {
      setSaving(true);
      setError(null);

      const fieldData = {
        config_id: config.id,
        field_type: editingField.fieldType,
        field_name: editingField.fieldName,
        display_label: editingField.displayLabel,
        data_type: editingField.dataType,
        filter_operator: editingField.fieldType === 'filter' ? editingField.filterOperator : null,
        parameter_type: editingField.fieldType === 'filter' ? (editingField.parameterType || 'query') : null,
        api_field_path: editingField.apiFieldPath || null,
        is_required: editingField.isRequired,
        field_order: editingField.fieldOrder,
        is_enabled: editingField.isEnabled,
        updated_at: new Date().toISOString()
      };

      if (editingField.id) {
        const { error } = await supabase
          .from('track_trace_fields')
          .update(fieldData)
          .eq('id', editingField.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('track_trace_fields')
          .insert([{ ...fieldData, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }

      setShowFieldModal(false);
      setEditingField(null);
      await loadConfigForClient(selectedClientId);
    } catch (err: any) {
      setError(err.message || 'Failed to save field');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field?')) return;

    try {
      const { error } = await supabase
        .from('track_trace_fields')
        .delete()
        .eq('id', fieldId);
      if (error) throw error;
      await loadConfigForClient(selectedClientId);
    } catch (err: any) {
      setError(err.message || 'Failed to delete field');
    }
  };

  const handleAddOrderByOption = () => {
    if (!config) return;
    setConfig({
      ...config,
      orderByOptions: [
        ...config.orderByOptions,
        { field: '', label: '', defaultDirection: 'desc' }
      ]
    });
  };

  const handleUpdateOrderByOption = (index: number, updates: Partial<TrackTraceOrderByOption>) => {
    if (!config) return;
    const newOptions = [...config.orderByOptions];
    newOptions[index] = { ...newOptions[index], ...updates };
    setConfig({ ...config, orderByOptions: newOptions });
  };

  const handleRemoveOrderByOption = (index: number) => {
    if (!config) return;
    const newOptions = config.orderByOptions.filter((_, i) => i !== index);
    setConfig({ ...config, orderByOptions: newOptions });
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Track & Trace Configuration</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Configure API endpoints and search fields for client Track & Trace
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Client
          </label>
          <Select
            value={selectedClientId || '__none__'}
            onValueChange={(value) => setSelectedClientId(value === '__none__' ? '' : value)}
            options={[
              { value: '__none__', label: 'Select a client...' },
              ...clients.map(c => ({ value: c.id, label: c.clientName }))
            ]}
            searchable
          />
        </div>

        {selectedClientId && config && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-6">
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
                          value={config.apiSourceType}
                          onValueChange={(value) => setConfig({ ...config, apiSourceType: value as 'main' | 'secondary' })}
                          options={[
                            { value: 'main', label: 'Main API' },
                            { value: 'secondary', label: 'Secondary API' }
                          ]}
                        />
                      </div>

                      {config.apiSourceType === 'secondary' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Secondary API
                          </label>
                          <Select
                            value={config.secondaryApiId || '__none__'}
                            onValueChange={(value) => setConfig({ ...config, secondaryApiId: value === '__none__' ? undefined : value })}
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
                          value={config.apiSpecId || '__none__'}
                          onValueChange={(value) => {
                            const specId = value === '__none__' ? undefined : value;
                            setConfig({ ...config, apiSpecId: specId, apiSpecEndpointId: undefined });
                            if (specId) loadEndpointsForSpec(specId);
                            else setApiEndpoints([]);
                          }}
                          options={[
                            { value: '__none__', label: 'None (Manual entry)' },
                            ...apiSpecs.map(s => ({ value: s.id, label: s.name }))
                          ]}
                          searchable
                        />
                      </div>

                      {config.apiSpecId && apiEndpoints.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Endpoint
                          </label>
                          <Select
                            value={config.apiSpecEndpointId || '__none__'}
                            onValueChange={(value) => {
                              const endpointId = value === '__none__' ? undefined : value;
                              const endpoint = apiEndpoints.find(e => e.id === endpointId);
                              setConfig({
                                ...config,
                                apiSpecEndpointId: endpointId,
                                apiPath: endpoint?.path || config.apiPath,
                                httpMethod: endpoint?.method?.toUpperCase() || config.httpMethod
                              });
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
                          value={config.httpMethod}
                          onValueChange={(value) => setConfig({ ...config, httpMethod: value })}
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
                          value={config.apiPath}
                          onChange={(e) => setConfig({ ...config, apiPath: e.target.value })}
                          placeholder="/api/orders"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center mt-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={config.isEnabled}
                          onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Enable Track & Trace for this client</span>
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
                          value={config.limitOptions.join(', ')}
                          onChange={(e) => {
                            const values = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                            setConfig({ ...config, limitOptions: values.length > 0 ? values : [10, 25, 50, 100] });
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
                          value={String(config.defaultLimit)}
                          onValueChange={(value) => setConfig({ ...config, defaultLimit: parseInt(value) })}
                          options={config.limitOptions.map(l => ({ value: String(l), label: String(l) }))}
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

                      {config.orderByOptions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No order by options configured</p>
                      ) : (
                        <div className="space-y-2">
                          {config.orderByOptions.map((opt, idx) => (
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

                    {config.orderByOptions.length > 0 && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Default Order By
                          </label>
                          <Select
                            value={config.defaultOrderBy || '__none__'}
                            onValueChange={(value) => setConfig({ ...config, defaultOrderBy: value === '__none__' ? undefined : value })}
                            options={[
                              { value: '__none__', label: 'None' },
                              ...config.orderByOptions.map(o => ({ value: o.field, label: o.label || o.field }))
                            ]}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Default Direction
                          </label>
                          <Select
                            value={config.defaultOrderDirection}
                            onValueChange={(value) => setConfig({ ...config, defaultOrderDirection: value as 'asc' | 'desc' })}
                            options={[
                              { value: 'asc', label: 'Ascending' },
                              { value: 'desc', label: 'Descending' }
                            ]}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>

              {config.id && (
                <>
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
                                    <div className="flex items-center flex-wrap gap-1">
                                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                        {field.displayLabel}
                                      </span>
                                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                        {field.dataType}
                                      </span>
                                      <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                                        {field.filterOperator}
                                      </span>
                                      <span className="text-xs px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">
                                        {field.parameterType || 'query'}
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
                          <div className="space-y-2">
                            {selectFields.map(field => (
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
                </>
              )}
            </div>
          </>
        )}

        {!selectedClientId && (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Select a client to configure Track & Trace</p>
          </div>
        )}
      </div>

      {showFieldModal && editingField && (
        <FieldEditModal
          field={editingField}
          onChange={setEditingField}
          onSave={handleSaveField}
          onClose={() => {
            setShowFieldModal(false);
            setEditingField(null);
          }}
          saving={saving}
          config={config}
          apiEndpoints={apiEndpoints}
        />
      )}
    </div>
  );
}

interface FieldEditModalProps {
  field: TrackTraceField;
  onChange: (field: TrackTraceField) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  config: TrackTraceConfig | null;
  apiEndpoints: ApiSpecEndpoint[];
}

function FieldEditModal({ field, onChange, onSave, onClose, saving, config, apiEndpoints }: FieldEditModalProps) {
  const [endpointParameters, setEndpointParameters] = useState<any[]>([]);
  const [showFieldSuggestions, setShowFieldSuggestions] = useState(false);
  const [fieldFilter, setFieldFilter] = useState('');

  useEffect(() => {
    if (config?.apiSpecEndpointId) {
      const endpoint = apiEndpoints.find(e => e.id === config.apiSpecEndpointId);
      if (endpoint?.parameters) {
        setEndpointParameters(endpoint.parameters);
      } else {
        setEndpointParameters([]);
      }
    } else {
      setEndpointParameters([]);
    }
  }, [config?.apiSpecEndpointId, apiEndpoints]);

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
    { value: 'query', label: 'Query Parameter' },
    { value: 'path', label: 'Path Variable' },
    { value: 'header', label: 'Header' },
    { value: 'body', label: 'Request Body' }
  ];

  const filteredParameters = endpointParameters.filter((param: any) =>
    param.name?.toLowerCase().includes(fieldFilter.toLowerCase()) ||
    param.description?.toLowerCase().includes(fieldFilter.toLowerCase())
  );

  const getParameterTypeFromSpec = (paramIn: string): 'query' | 'path' | 'header' | 'body' => {
    switch (paramIn) {
      case 'query': return 'query';
      case 'path': return 'path';
      case 'header': return 'header';
      case 'body': return 'body';
      default: return 'query';
    }
  };

  const getDataTypeFromSpec = (schema: any): 'string' | 'number' | 'date' | 'boolean' => {
    if (!schema) return 'string';
    const type = schema.type || 'string';
    const format = schema.format;

    if (type === 'integer' || type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    if (format === 'date' || format === 'date-time') return 'date';
    return 'string';
  };

  const handleSelectApiField = (param: any) => {
    onChange({
      ...field,
      fieldName: param.name,
      displayLabel: field.displayLabel || param.name,
      apiFieldPath: param.name,
      parameterType: getParameterTypeFromSpec(param.in),
      dataType: getDataTypeFromSpec(param.schema)
    });
    setShowFieldSuggestions(false);
    setFieldFilter('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {field.id ? 'Edit' : 'Add'} {field.fieldType === 'filter' ? 'Filter' : 'Column'} Field
          </h3>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {field.fieldType === 'filter' && endpointParameters.length > 0 && (
            <div className="relative">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select from API Spec
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  ({endpointParameters.length} parameters available)
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={fieldFilter}
                  onChange={(e) => {
                    setFieldFilter(e.target.value);
                    setShowFieldSuggestions(true);
                  }}
                  onFocus={() => setShowFieldSuggestions(true)}
                  placeholder="Search API parameters..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
                {showFieldSuggestions && filteredParameters.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredParameters.slice(0, 20).map((param: any, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectApiField(param)}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {param.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                              {param.in}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                              {param.schema?.type || 'string'}
                            </span>
                          </div>
                        </div>
                        {param.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {param.description}
                          </p>
                        )}
                      </button>
                    ))}
                    {filteredParameters.length > 20 && (
                      <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600">
                        +{filteredParameters.length - 20} more parameters
                      </div>
                    )}
                  </div>
                )}
                {showFieldSuggestions && (
                  <button
                    type="button"
                    onClick={() => setShowFieldSuggestions(false)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    &times;
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Select a parameter from the API spec to auto-fill the fields below
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Field Name *
            </label>
            <input
              type="text"
              value={field.fieldName}
              onChange={(e) => onChange({ ...field, fieldName: e.target.value })}
              placeholder="e.g., orderNumber"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

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

          {field.fieldType === 'filter' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Parameter Type
              </label>
              <Select
                value={field.parameterType || 'query'}
                onValueChange={(value) => onChange({ ...field, parameterType: value as any })}
                options={parameterTypes}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Determines how the filter value is passed to the API
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Type
            </label>
            <Select
              value={field.dataType}
              onValueChange={(value) => onChange({ ...field, dataType: value as any })}
              options={dataTypes}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Controls how the value is formatted when sent to the API
            </p>
          </div>

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
    </div>
  );
}
