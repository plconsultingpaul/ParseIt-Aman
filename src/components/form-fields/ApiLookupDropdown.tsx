import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import CustomDropdown from '../common/CustomDropdown';
import { supabase, getAuthHeaders } from '../../lib/supabase';

interface ApiLookupDropdownProps {
  fieldKey: string;
  value: string;
  placeholder?: string;
  error?: string;
  buttonId?: string;
  apiLookupEndpoint?: string | null;
  apiLookupSecondaryApiId?: string | null;
  apiLookupHttpMethod?: string | null;
  apiLookupSearchParam?: string | null;
  apiLookupValueField?: string | null;
  apiLookupDisplayColumns?: { field: string; label: string }[] | null;
  apiLookupFieldMappings?: { responseField: string; targetFieldName: string }[] | null;
  apiLookupRequestBody?: string | null;
  apiLookupRequestBodyMappings?: { fieldName: string; type: 'hardcoded' | 'variable' | 'search'; value: string; dataType?: string }[] | null;
  apiLookupWrapBodyInArray?: boolean;
  formData?: Record<string, any>;
  onChange: (value: string) => void;
  onMappings?: (mappings: Record<string, string>) => void;
}

function buildRequestBody(
  template: string,
  mappings: { fieldName: string; type: string; value: string; dataType?: string }[],
  formData: Record<string, any>,
  wrapInArray: boolean
): any {
  try {
    const body = JSON.parse(template);

    const setNestedValue = (obj: any, path: string, value: any) => {
      const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
      let current = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const nextKey = parts[i + 1];
        if (current[key] === undefined) {
          current[key] = /^\d+$/.test(nextKey) ? [] : {};
        }
        current = current[key];
      }
      current[parts[parts.length - 1]] = value;
    };

    for (const mapping of mappings) {
      if (!mapping.fieldName) continue;
      let rawValue: any;
      if (mapping.type === 'hardcoded') {
        rawValue = mapping.value;
      } else if (mapping.type === 'variable') {
        rawValue = formData[mapping.value] ?? mapping.value;
      } else {
        rawValue = mapping.value || '';
      }

      const dataType = mapping.dataType || 'string';
      let typedValue: any = rawValue;
      if (dataType === 'number' || dataType === 'integer') {
        typedValue = Number(rawValue) || 0;
        if (dataType === 'integer') typedValue = Math.round(typedValue);
      } else if (dataType === 'boolean') {
        typedValue = rawValue === 'true' || rawValue === true;
      }

      setNestedValue(body, mapping.fieldName, typedValue);
    }

    return wrapInArray ? [body] : body;
  } catch {
    return wrapInArray ? [JSON.parse(template)] : JSON.parse(template);
  }
}

export default function ApiLookupDropdown({
  fieldKey,
  value,
  placeholder,
  error,
  buttonId,
  apiLookupEndpoint,
  apiLookupSecondaryApiId,
  apiLookupHttpMethod,
  apiLookupValueField,
  apiLookupDisplayColumns,
  apiLookupFieldMappings,
  apiLookupRequestBody,
  apiLookupRequestBodyMappings,
  apiLookupWrapBodyInArray,
  formData = {},
  onChange,
  onMappings,
}: ApiLookupDropdownProps) {
  const [options, setOptions] = useState<{ value: string; label: string; raw: Record<string, any> }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    if (!apiLookupEndpoint && !apiLookupSecondaryApiId) {
      console.error('[ApiLookupDropdown] No endpoint or secondary API configured', { apiLookupEndpoint, apiLookupSecondaryApiId });
      setFetchError('No API configured for this field');
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      const headers = await getAuthHeaders();
      const httpMethod = (apiLookupHttpMethod || 'POST').toUpperCase();

      let body: any = undefined;
      if (apiLookupRequestBody && httpMethod !== 'GET') {
        body = buildRequestBody(
          apiLookupRequestBody,
          apiLookupRequestBodyMappings || [],
          formData,
          apiLookupWrapBodyInArray || false
        );
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-proxy`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiPath: apiLookupEndpoint || '',
          httpMethod,
          secondaryApiId: apiLookupSecondaryApiId,
          body,
          ...(buttonId && { buttonId }),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `API request failed: ${response.status}`);
      }

      const data = await response.json();
      let resultsArray: any[] = [];
      if (Array.isArray(data)) {
        resultsArray = data;
      } else if (data && typeof data === 'object') {
        const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
        if (arrayKey) {
          resultsArray = data[arrayKey];
        }
      }

      const valueField = apiLookupValueField || '';
      const displayCols = apiLookupDisplayColumns || [];

      const mapped = resultsArray.map((item: any) => {
        const val = valueField ? String(item[valueField] ?? '') : JSON.stringify(item);
        let label: string;
        if (displayCols.length > 0) {
          label = displayCols.map(col => String(item[col.field] ?? '')).filter(Boolean).join(' - ');
        } else if (valueField) {
          label = String(item[valueField] ?? '');
        } else {
          label = JSON.stringify(item);
        }
        return { value: val, label, raw: item };
      });

      setOptions(mapped);
    } catch (err: any) {
      console.error('[ApiLookupDropdown] Error:', err);
      setFetchError(err.message || 'Failed to fetch options');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (selectedValue: string) => {
    onChange(selectedValue);

    if (apiLookupFieldMappings?.length && onMappings) {
      const selectedOption = options.find(o => o.value === selectedValue);
      if (selectedOption) {
        const mappingUpdates: Record<string, string> = {};
        for (const mapping of apiLookupFieldMappings) {
          if (mapping.responseField && mapping.targetFieldName) {
            mappingUpdates[mapping.targetFieldName] = String(selectedOption.raw[mapping.responseField] ?? '');
          }
        }
        onMappings(mappingUpdates);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading options...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{fetchError}</span>
        </div>
      </div>
    );
  }

  return (
    <CustomDropdown
      value={value}
      onChange={handleChange}
      options={options}
      placeholder={placeholder || 'Select...'}
      searchable
      error={!!error}
    />
  );
}
