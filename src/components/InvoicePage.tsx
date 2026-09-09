import React, { useState, useEffect, useMemo } from 'react';
import { Receipt, Search, Loader2, AlertCircle, Info, SlidersHorizontal, ChevronsUpDown, ChevronDown, Download, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { User, InvoiceConfig, InvoiceField, InvoiceDefaultField, InvoiceFilterPreset, InvoiceFilterValue } from '../types';
import { supabase, getAuthHeaders } from '../lib/supabase';
import FilterModal from './invoice/FilterModal';

interface InvoicePageProps {
  currentUser: User | null;
}

export default function InvoicePage({ currentUser }: InvoicePageProps) {
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<InvoiceConfig | null>(null);
  const [filterFields, setFilterFields] = useState<InvoiceField[]>([]);
  const [selectFields, setSelectFields] = useState<InvoiceField[]>([]);
  const [defaultFields, setDefaultFields] = useState<InvoiceDefaultField[]>([]);
  const [filterPresets, setFilterPresets] = useState<InvoiceFilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [selectedLimit, setSelectedLimit] = useState<number>(25);
  const [selectedOrderBy, setSelectedOrderBy] = useState<string>('');
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc');

  const [results, setResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [clientCode, setClientCode] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = selectedLimit;

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [exporting, setExporting] = useState(false);

  const handleColumnSort = (fieldName: string) => {
    if (sortColumn === fieldName) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(fieldName);
      setSortDirection('asc');
    }
  };

  const sortedResults = useMemo(() => {
    if (!sortColumn) return results;

    const field = selectFields.find(f => f.fieldName === sortColumn);
    const dataType = field?.dataType || 'string';

    return [...results].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1;

      let comparison = 0;
      if (dataType === 'number') {
        comparison = Number(aVal) - Number(bVal);
      } else if (dataType === 'date') {
        comparison = new Date(aVal).getTime() - new Date(bVal).getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [results, sortColumn, sortDirection, selectFields]);

  useEffect(() => {
    if (currentUser?.clientId) {
      loadConfig();
    } else {
      setLoading(false);
    }
  }, [currentUser?.clientId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('invoice_template_id, client_id')
        .eq('id', currentUser!.clientId)
        .maybeSingle();

      if (clientError) throw clientError;

      if (clientData?.client_id) {
        setClientCode(clientData.client_id);
      }

      const templateId: string | null = clientData?.invoice_template_id || null;

      if (!templateId) {
        setConfig(null);
        setLoading(false);
        return;
      }

      const { data: templateData, error: templateError } = await supabase
        .from('invoice_templates')
        .select('*')
        .eq('id', templateId)
        .eq('is_active', true)
        .maybeSingle();

      if (templateError) throw templateError;

      if (!templateData) {
        setConfig(null);
        setLoading(false);
        return;
      }

      const mappedConfig: InvoiceConfig = {
        id: templateData.id,
        clientId: currentUser!.clientId!,
        apiSourceType: templateData.api_source_type,
        secondaryApiId: templateData.secondary_api_id,
        apiSpecId: templateData.api_spec_id,
        apiSpecEndpointId: templateData.api_spec_endpoint_id,
        apiPath: templateData.api_path,
        httpMethod: templateData.http_method,
        requestBody: templateData.request_body || undefined,
        requestBodyMappings: templateData.request_body_mappings || [],
        limitOptions: templateData.limit_options || [10, 25, 50, 100],
        orderByOptions: templateData.order_by_options || [],
        defaultLimit: templateData.default_limit,
        defaultOrderBy: templateData.default_order_by,
        defaultOrderDirection: templateData.default_order_direction,
        isEnabled: true,
        createdAt: templateData.created_at,
        updatedAt: templateData.updated_at
      };

      setConfig(mappedConfig);
      setSelectedLimit(mappedConfig.defaultLimit);
      setSelectedOrderBy(mappedConfig.defaultOrderBy || '');
      setOrderDirection(mappedConfig.defaultOrderDirection);

      const { data: fieldsData, error: fieldsError } = await supabase
        .from('invoice_template_fields')
        .select('*')
        .eq('template_id', templateId)
        .eq('is_enabled', true)
        .order('field_order');

      if (fieldsError) throw fieldsError;

      const mappedFields: InvoiceField[] = (fieldsData || []).map((f: any) => ({
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
      }));

      setFilterFields(mappedFields.filter(f => f.fieldType === 'filter'));
      setSelectFields(mappedFields.filter(f => f.fieldType === 'select'));

      const { data: defaultFieldsData, error: defaultFieldsError } = await supabase
        .from('invoice_template_default_fields')
        .select('*')
        .eq('template_id', templateId)
        .order('created_at');

      if (defaultFieldsError) throw defaultFieldsError;

      const mappedDefaultFields: InvoiceDefaultField[] = (defaultFieldsData || []).map((f: any) => ({
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
      }));
      setDefaultFields(mappedDefaultFields);

      const { data: filterPresetsData, error: filterPresetsError } = await supabase
        .from('invoice_template_filter_presets')
        .select('*')
        .eq('template_id', templateId)
        .eq('is_active', true)
        .order('display_order');

      if (filterPresetsError) throw filterPresetsError;

      const mappedFilterPresets: InvoiceFilterPreset[] = (filterPresetsData || []).map((p: any) => {
        let parsedFilterValues: InvoiceFilterValue[] = [];
        const rawFilterValues = p.filter_values;
        if (Array.isArray(rawFilterValues)) {
          parsedFilterValues = rawFilterValues;
        } else if (rawFilterValues && typeof rawFilterValues === 'object') {
          parsedFilterValues = Object.entries(rawFilterValues).map(([fieldName, val]: [string, any]) => ({
            id: crypto.randomUUID(),
            fieldName,
            operator: val.operator || 'eq',
            value: val.value || ''
          }));
        }
        return {
          id: p.id,
          configId: p.template_id,
          name: p.name,
          displayOrder: p.display_order,
          filterValues: parsedFilterValues,
          isActive: p.is_active,
          createdAt: p.created_at,
          updatedAt: p.updated_at
        };
      });
      setFilterPresets(mappedFilterPresets);
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const resolveDefaultFieldValue = (field: InvoiceDefaultField): string => {
    if (field.valueType === 'static') {
      return field.staticValue || '';
    }
    if (field.dynamicValue === 'client.client_id' && clientCode) {
      return clientCode;
    }
    return '';
  };

  const resolveRequestBody = (): any | undefined => {
    if (!config) return undefined;
    if (!config.requestBodyMappings || config.requestBodyMappings.length === 0) {
      if (config.requestBody) {
        try {
          return JSON.parse(config.requestBody);
        } catch {
          return config.requestBody;
        }
      }
      return undefined;
    }

    const body: Record<string, any> = {};
    for (const mapping of config.requestBodyMappings) {
      let resolvedValue: any = mapping.value;

      if (mapping.sourceType === 'variable') {
        if (mapping.value === 'client.client_id') {
          resolvedValue = clientCode || '';
        }
      }

      if (mapping.dataType === 'number') {
        resolvedValue = Number(resolvedValue) || 0;
      } else if (mapping.dataType === 'boolean') {
        resolvedValue = resolvedValue === 'true' || resolvedValue === '1';
      }

      const parts = mapping.fieldPath.split('.');
      let current = body;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = resolvedValue;
    }

    return body;
  };

  const buildODataFilterForFields = (fields: InvoiceField[], stateFilterValues?: Record<string, any>): string => {
    const values = stateFilterValues || filterValues;
    const filterParts: string[] = [];

    fields.forEach(field => {
      let filterValue = values[field.id];
      if (filterValue === undefined || filterValue === null || filterValue === '') return;

      if (filterValue instanceof Date) {
        filterValue = filterValue.toISOString().split('T')[0];
      }

      const isLegacyValue = typeof filterValue === 'string' || typeof filterValue === 'number';
      const operator = isLegacyValue ? (field.filterOperator || 'eq') : (filterValue.operator || 'eq');
      const value = isLegacyValue ? filterValue : filterValue.value;

      if (!value && value !== 0) return;

      let filterStr = '';

      if (operator === 'in' || operator === 'not in') {
        const vals = String(value).split(',').map(v => {
          const trimmed = v.trim();
          return trimmed.startsWith("'") ? trimmed : `'${trimmed.replace(/'/g, "''")}'`;
        });
        if (operator === 'in') {
          filterStr = `${field.fieldName} in (${vals.join(',')})`;
        } else {
          filterStr = `(${vals.map(v => `${field.fieldName} ne ${v}`).join(' and ')})`;
        }
      } else if (field.dataType === 'string') {
        const escapedValue = String(value).replace(/'/g, "''");
        switch (operator) {
          case 'eq': filterStr = `${field.fieldName} eq '${escapedValue}'`; break;
          case 'ne': filterStr = `${field.fieldName} ne '${escapedValue}'`; break;
          case 'contains': filterStr = `contains(${field.fieldName},'${escapedValue}')`; break;
          case 'startswith': filterStr = `startswith(${field.fieldName},'${escapedValue}')`; break;
          case 'endswith': filterStr = `endswith(${field.fieldName},'${escapedValue}')`; break;
          default: filterStr = `${field.fieldName} eq '${escapedValue}'`;
        }
      } else if (field.dataType === 'number') {
        switch (operator) {
          case 'eq': filterStr = `${field.fieldName} eq ${value}`; break;
          case 'ne': filterStr = `${field.fieldName} ne ${value}`; break;
          case 'gt': filterStr = `${field.fieldName} gt ${value}`; break;
          case 'ge': filterStr = `${field.fieldName} ge ${value}`; break;
          case 'lt': filterStr = `${field.fieldName} lt ${value}`; break;
          case 'le': filterStr = `${field.fieldName} le ${value}`; break;
          default: filterStr = `${field.fieldName} eq ${value}`;
        }
      } else if (field.dataType === 'date') {
        const dateValue = value instanceof Date ? value.toISOString().split('T')[0] : value;
        switch (operator) {
          case 'eq': filterStr = `${field.fieldName} eq ${dateValue}`; break;
          case 'ge': filterStr = `${field.fieldName} ge ${dateValue}`; break;
          case 'le': filterStr = `${field.fieldName} le ${dateValue}`; break;
          default: filterStr = `${field.fieldName} eq ${dateValue}`;
        }
      } else if (field.dataType === 'boolean') {
        filterStr = `${field.fieldName} eq ${value}`;
      }

      if (filterStr) {
        filterParts.push(filterStr);
      }
    });

    return filterParts.join(' and ');
  };

  const buildODataFilterFromPreset = (presetFilterValues: InvoiceFilterValue[]): string => {
    const filterParts: string[] = [];

    presetFilterValues.forEach(fv => {
      if (!fv.value) return;

      const { fieldName, operator, value } = fv;
      let filterStr = '';

      if (operator === 'in' || operator === 'not in') {
        const vals = String(value).split(',').map(v => {
          const trimmed = v.trim();
          return trimmed.startsWith("'") ? trimmed : `'${trimmed.replace(/'/g, "''")}'`;
        });
        if (operator === 'in') {
          filterStr = `${fieldName} in (${vals.join(',')})`;
        } else {
          filterStr = `(${vals.map(v => `${fieldName} ne ${v}`).join(' and ')})`;
        }
      } else if (operator === 'contains' || operator === 'startswith' || operator === 'endswith' || operator === 'not endswith') {
        const escapedValue = String(value).replace(/'/g, "''");
        if (operator === 'not endswith') {
          filterStr = `not endswith(${fieldName},'${escapedValue}')`;
        } else {
          filterStr = `${operator}(${fieldName},'${escapedValue}')`;
        }
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

  const buildQueryParts = (
    page: number,
    preset: InvoiceFilterPreset | undefined,
    stateFilterValues: Record<string, any>,
    stateOrderBy: string,
    stateOrderDirection: 'asc' | 'desc',
    unlimitedExport: boolean = false
  ): string[] => {
    const queryParts: string[] = [];
    const odataFilterFields: InvoiceField[] = [];
    const directQueryFields: InvoiceField[] = [];

    filterFields.forEach(field => {
      const value = stateFilterValues[field.id];
      if (value === undefined || value === null || value === '') return;

      if (field.parameterType === 'query') {
        directQueryFields.push(field);
      } else {
        odataFilterFields.push(field);
      }
    });

    directQueryFields.forEach(field => {
      const value = stateFilterValues[field.id];
      if (value === undefined || value === null || value === '') return;
      queryParts.push(`${field.fieldName}=${encodeURIComponent(value)}`);
    });

    const odataFilterParts: string[] = [];

    if (preset && preset.filterValues && preset.filterValues.length > 0) {
      const presetFilter = buildODataFilterFromPreset(preset.filterValues);
      if (presetFilter) {
        odataFilterParts.push(presetFilter);
      }
    } else if (odataFilterFields.length > 0) {
      const odataFilter = buildODataFilterForFields(odataFilterFields, stateFilterValues);
      if (odataFilter) {
        odataFilterParts.push(odataFilter);
      }
    }

    defaultFields.forEach(field => {
      const value = resolveDefaultFieldValue(field);
      if (!value) return;

      if (field.parameterType === 'query') {
        const operator = field.operator || 'eq';
        const escapedValue = String(value).replace(/'/g, "''");
        let filterStr = '';

        if (operator === 'in' || operator === 'not in') {
          const vals = String(value).split(',').map(v => {
            const trimmed = v.trim();
            return trimmed.startsWith("'") ? trimmed : `'${trimmed.replace(/'/g, "''")}'`;
          });
          if (operator === 'in') {
            filterStr = `${field.fieldName} in (${vals.join(',')})`;
          } else {
            filterStr = `(${vals.map(v => `${field.fieldName} ne ${v}`).join(' and ')})`;
          }
        } else if (operator === 'contains' || operator === 'startswith' || operator === 'endswith') {
          filterStr = `${operator}(${field.fieldName},'${escapedValue}')`;
        } else if (operator === 'not endswith') {
          filterStr = `not endswith(${field.fieldName},'${escapedValue}')`;
        } else {
          const isNumeric = !isNaN(Number(value)) && value.toString().trim() !== '';
          if (isNumeric) {
            filterStr = `${field.fieldName} ${operator} ${value}`;
          } else {
            filterStr = `${field.fieldName} ${operator} '${escapedValue}'`;
          }
        }

        if (filterStr) {
          odataFilterParts.push(filterStr);
        }
      } else {
        queryParts.push(`${field.fieldName}=${encodeURIComponent(value)}`);
      }
    });

    if (odataFilterParts.length > 0) {
      queryParts.push(`$filter=${odataFilterParts.join(' and ')}`);
    }

    if (selectFields.length > 0) {
      const selectParam = selectFields[0].parameterType === '$select' ? '$select' : 'select';
      const fieldNames = selectFields.map(f => f.fieldName);
      queryParts.push(`${selectParam}=${fieldNames.join(',')}`);
    }

    if (unlimitedExport) {
      queryParts.push('limit=10000');
    } else {
      queryParts.push(`limit=${recordsPerPage}`);
      const offsetValue = (page - 1) * recordsPerPage;
      if (offsetValue > 0) {
        queryParts.push(`offset=${offsetValue}`);
      }
    }

    if (stateOrderBy && stateOrderBy !== '__none__') {
      queryParts.push(`$orderby=${stateOrderBy} ${stateOrderDirection}`);
    }

    return queryParts;
  };

  const parseApiResponse = (data: any): any[] => {
    if (Array.isArray(data)) return data;
    if (data.value && Array.isArray(data.value)) return data.value;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (typeof data === 'object') {
      const arrayProp = Object.keys(data).find(key => Array.isArray(data[key]) && key !== '_requestUrl');
      if (arrayProp) return data[arrayProp];
    }
    return [];
  };

  const handleSearch = async (page: number = 1, preset?: InvoiceFilterPreset) => {
    if (!config) return;

    const requiredMissing = filterFields
      .filter(f => f.isRequired)
      .filter(f => !filterValues[f.id] && filterValues[f.id] !== 0);

    if (requiredMissing.length > 0 && !preset) {
      setError(`Please fill in required fields: ${requiredMissing.map(f => f.displayLabel).join(', ')}`);
      return;
    }

    try {
      setSearching(true);
      setError(null);
      setHasSearched(true);
      setCurrentPage(page);

      const queryParts = buildQueryParts(page, preset, filterValues, selectedOrderBy, orderDirection);
      const queryString = queryParts.join('&');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          apiSourceType: config.apiSourceType,
          secondaryApiId: config.secondaryApiId,
          apiPath: config.apiPath,
          httpMethod: config.httpMethod || 'GET',
          requestBody: resolveRequestBody(),
          queryString
        })
      });

      if (!proxyResponse.ok) {
        let errorMessage = `API request failed: ${proxyResponse.status}`;
        try {
          const errorData = await proxyResponse.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          if (errorData.details) errorMessage += ` - ${errorData.details}`;
        } catch {
          const errorText = await proxyResponse.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await proxyResponse.json();
      const resultArray = parseApiResponse(data);
      setResults(resultArray);

      if (typeof data.count === 'number') {
        setTotalCount(data.count);
      } else {
        setTotalCount(null);
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleExportCsv = async () => {
    if (!config || selectFields.length === 0) return;

    try {
      setExporting(true);
      setError(null);

      const activePreset = activePresetId ? filterPresets.find(p => p.id === activePresetId) : undefined;
      const queryParts = buildQueryParts(1, activePreset, filterValues, selectedOrderBy, orderDirection, true);
      const queryString = queryParts.join('&');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          apiSourceType: config.apiSourceType,
          secondaryApiId: config.secondaryApiId,
          apiPath: config.apiPath,
          httpMethod: config.httpMethod || 'GET',
          requestBody: resolveRequestBody(),
          queryString
        })
      });

      if (!proxyResponse.ok) {
        let errorMessage = `Export failed: ${proxyResponse.status}`;
        try {
          const errorData = await proxyResponse.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          const errorText = await proxyResponse.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await proxyResponse.json();
      const exportData = parseApiResponse(data);

      if (exportData.length === 0) {
        setError('No data to export');
        return;
      }

      const escapeCSVValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n') || strValue.includes('\r')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      };

      const formatDateForCsv = (value: any): string => {
        if (!value) return '';
        try {
          const date = new Date(value);
          if (isNaN(date.getTime())) return String(value);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch {
          return String(value);
        }
      };

      const headers = selectFields.map(f => escapeCSVValue(f.displayLabel)).join(',');
      const rows = exportData.map(row => {
        return selectFields.map(field => {
          const rawValue = row[field.fieldName];
          let mappedValue = rawValue;
          if (field.valueMappings && field.valueMappings.length > 0) {
            const mapping = field.valueMappings.find(m => m.sourceValue === String(rawValue));
            if (mapping) mappedValue = mapping.displayValue;
          }
          const formattedValue = field.dataType === 'date' ? formatDateForCsv(mappedValue) : mappedValue;
          return escapeCSVValue(formattedValue);
        }).join(',');
      });

      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `invoice-export-${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleClear = () => {
    setFilterValues({});
    setResults([]);
    setHasSearched(false);
    setError(null);
    setCurrentPage(1);
    setActivePresetId(null);
  };

  const handlePresetClick = async (preset: InvoiceFilterPreset) => {
    setFilterValues({});
    setActivePresetId(preset.id);
    setCurrentPage(1);
    handleSearch(1, preset);
  };

  const handleFilterModalSave = (newFilterValues: Record<string, any>, newOrderBy: string, newOrderDirection: 'asc' | 'desc') => {
    setFilterValues(newFilterValues);
    setSelectedOrderBy(newOrderBy);
    setOrderDirection(newOrderDirection);
    setActivePresetId(null);
    setIsFilterModalOpen(false);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const activePreset = activePresetId ? filterPresets.find(p => p.id === activePresetId) : undefined;
      handleSearch(currentPage - 1, activePreset);
    }
  };

  const handleNextPage = () => {
    const activePreset = activePresetId ? filterPresets.find(p => p.id === activePresetId) : undefined;
    handleSearch(currentPage + 1, activePreset);
  };

  const handleFirstPage = () => {
    if (currentPage !== 1) {
      const activePreset = activePresetId ? filterPresets.find(p => p.id === activePresetId) : undefined;
      handleSearch(1, activePreset);
    }
  };

  const handleLastPage = () => {
    if (totalCount !== null) {
      const lastPage = Math.ceil(totalCount / recordsPerPage);
      if (currentPage !== lastPage) {
        const activePreset = activePresetId ? filterPresets.find(p => p.id === activePresetId) : undefined;
        handleSearch(lastPage, activePreset);
      }
    }
  };

  const totalPages = totalCount !== null ? Math.ceil(totalCount / recordsPerPage) : null;

  const getActiveFilterCount = (): number => {
    let count = 0;
    if (!activePresetId) {
      Object.values(filterValues).forEach(value => {
        if (value !== undefined && value !== null && value !== '') {
          count++;
        }
      });
    }
    if (selectedOrderBy && selectedOrderBy !== '__none__' && selectedOrderBy !== '') {
      count++;
    }
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  const formatCellValue = (value: any, dataType: string, valueMappings?: { sourceValue: string; displayValue: string }[]): string => {
    if (value === null || value === undefined || value === '') return '\u2014';

    if (valueMappings && valueMappings.length > 0) {
      const mapping = valueMappings.find(m => m.sourceValue === String(value));
      if (mapping) return mapping.displayValue;
    }

    switch (dataType) {
      case 'date':
        try {
          const date = new Date(value);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
          return String(value);
        }
      case 'boolean':
        return value ? 'Yes' : 'No';
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      default:
        return String(value);
    }
  };

  const getStatusBadgeClasses = (value: string): string => {
    const lowerValue = value?.toLowerCase() || '';
    if (lowerValue.includes('pending') || lowerValue.includes('waiting') || lowerValue.includes('hold') || lowerValue.includes('open')) {
      return 'bg-orange-100 text-orange-700 border-orange-200';
    }
    if (lowerValue.includes('paid') || lowerValue.includes('complete') || lowerValue.includes('settled')) {
      return 'bg-green-100 text-green-700 border-green-200';
    }
    if (lowerValue.includes('overdue') || lowerValue.includes('past due') || lowerValue.includes('late')) {
      return 'bg-red-100 text-red-700 border-red-200';
    }
    if (lowerValue.includes('partial') || lowerValue.includes('processing')) {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const isStatusField = (fieldName: string): boolean => {
    const lowerName = fieldName.toLowerCase();
    return lowerName.includes('status') || lowerName === 'state' || lowerName === 'condition';
  };

  const isCurrencyField = (fieldName: string): boolean => {
    const lowerName = fieldName.toLowerCase();
    return lowerName.includes('amount') || lowerName.includes('total') || lowerName.includes('price') || lowerName.includes('balance') || lowerName.includes('charge');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="bg-teal-100 dark:bg-teal-900/50 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <Receipt className="h-10 w-10 text-teal-600 dark:text-teal-400" />
            </div>

            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Invoices
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              Invoice access is not yet configured for your account. Please contact your administrator to enable this feature.
            </p>

            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-6 text-left">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-teal-900 dark:text-teal-300 mb-2">
                    Available Features
                  </h3>
                  <ul className="text-sm text-teal-700 dark:text-teal-400 space-y-1">
                    <li>- View and search invoices</li>
                    <li>- Filter by date, status, and more</li>
                    <li>- Export invoice data to CSV</li>
                    <li>- Sort and paginate results</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={() => {
                setActivePresetId(null);
                setFilterValues({});
                handleSearch(1);
              }}
              disabled={searching}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                activePresetId === null && hasSearched
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              All Invoices
            </button>
            {filterPresets.map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset)}
                disabled={searching}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                  activePresetId === preset.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {preset.name}
              </button>
            ))}
            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-teal-600 text-white rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {hasSearched && results.length > 0 && (
              <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            )}
            <button
              onClick={() => handleSearch(1)}
              disabled={searching}
              className="flex items-center px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </button>
          </div>
        </div>

        {hasSearched && (
          <div className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg overflow-hidden">
            {results.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No invoices found</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Try adjusting your search criteria</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-gray-700/50 border-b border-slate-200 dark:border-gray-700">
                      <tr>
                        {selectFields.map(field => (
                          <th key={field.id} className="text-left px-6 py-4">
                            <button
                              onClick={() => handleColumnSort(field.fieldName)}
                              className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider hover:text-slate-900 dark:hover:text-slate-200"
                            >
                              {field.displayLabel}
                              {sortColumn === field.fieldName ? (
                                <ChevronDown className={`w-4 h-4 text-teal-600 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                              ) : (
                                <ChevronsUpDown className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                      {sortedResults.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-gray-700/30 transition-colors">
                          {selectFields.map((field, fieldIdx) => {
                            const formattedValue = formatCellValue(row[field.fieldName], field.dataType, field.valueMappings);
                            return (
                              <td key={field.id} className="px-6 py-4">
                                {isStatusField(field.fieldName) && row[field.fieldName] ? (
                                  <span className={`inline-flex px-3 py-1 rounded-full border font-medium text-xs ${getStatusBadgeClasses(formattedValue)}`}>
                                    {formattedValue}
                                  </span>
                                ) : fieldIdx === 0 ? (
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    {formattedValue}
                                  </span>
                                ) : isCurrencyField(field.fieldName) && formattedValue !== '\u2014' ? (
                                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                                    {formattedValue}
                                  </span>
                                ) : formattedValue === '\u2014' ? (
                                  <span className="text-slate-400">{'\u2014'}</span>
                                ) : (
                                  <span className="text-sm text-slate-700 dark:text-slate-300">
                                    {formattedValue}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-4 bg-slate-50 dark:bg-gray-700/50 border-t border-slate-200 dark:border-gray-700 flex items-center justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Showing {((currentPage - 1) * recordsPerPage + 1).toLocaleString()} - {((currentPage - 1) * recordsPerPage + results.length).toLocaleString()}{totalCount !== null ? ` of ${totalCount.toLocaleString()}` : ''} invoice{(totalCount !== null ? totalCount : results.length) !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={handleFirstPage}
                      disabled={currentPage === 1 || searching}
                      className="p-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="First page"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1 || searching}
                      className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">
                      Page {currentPage}{totalPages !== null ? ` of ${totalPages}` : ''}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={results.length < recordsPerPage || searching}
                      className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                    <button
                      onClick={handleLastPage}
                      disabled={totalPages === null || currentPage === totalPages || searching}
                      className="p-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Last page"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!hasSearched && (
          <div className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg overflow-hidden">
            <div className="text-center py-16">
              <Receipt className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">
                {filterFields.length > 0
                  ? 'Use the Filters button to set search criteria, then click Search'
                  : 'Click Search to view all invoices'}
              </p>
            </div>
          </div>
        )}
      </div>

      {config && (
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          onSave={handleFilterModalSave}
          filterFields={filterFields}
          filterValues={filterValues}
          config={config}
          selectedOrderBy={selectedOrderBy}
          orderDirection={orderDirection}
        />
      )}
    </div>
  );
}
