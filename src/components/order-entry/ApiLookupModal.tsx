import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, X, AlertCircle } from 'lucide-react';
import type { OrderEntryField, ApiLookupDisplayColumn, ApiLookupRequestBodyMapping } from '../../types';
import { supabase, getAuthHeaders } from '../../lib/supabase';

interface ApiLookupModalProps {
  field: OrderEntryField;
  formData?: Record<string, any>;
  onSelect: (result: Record<string, any>) => void;
  onClose: () => void;
}

function buildRequestBody(
  template: string,
  mappings: ApiLookupRequestBodyMapping[],
  formData: Record<string, any>,
  searchQuery: string,
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
      const lastKey = parts[parts.length - 1];
      current[lastKey] = value;
    };

    const castValue = (raw: string, dataType?: string): any => {
      if (!raw && raw !== '0') return raw;
      switch (dataType) {
        case 'number': return parseFloat(raw) || 0;
        case 'integer': return parseInt(raw, 10) || 0;
        case 'boolean': return raw === 'true' || raw === '1';
        default: return raw;
      }
    };

    for (const mapping of mappings) {
      if (!mapping.fieldName) continue;
      let rawValue = '';
      if (mapping.type === 'search') {
        rawValue = searchQuery || mapping.value || '';
      } else if (mapping.type === 'variable') {
        if (mapping.value === '__search__') {
          rawValue = searchQuery;
        } else {
          rawValue = String(formData[mapping.value] ?? '');
        }
      } else {
        rawValue = mapping.value || '';
      }
      setNestedValue(body, mapping.fieldName, castValue(rawValue, mapping.dataType));
    }

    return wrapInArray ? [body] : body;
  } catch {
    return null;
  }
}

export default function ApiLookupModal({ field, formData = {}, onSelect, onClose }: ApiLookupModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const displayColumns: ApiLookupDisplayColumn[] = field.apiLookupDisplayColumns || [];
  const httpMethod = (field.apiLookupHttpMethod || 'GET').toUpperCase();
  const hasRequestBody = ['POST', 'PUT', 'PATCH'].includes(httpMethod) && field.apiLookupRequestBody;

  const fetchResults = useCallback(async (query?: string) => {
    if (!field.apiLookupEndpoint && !field.apiLookupSecondaryApiId) {
      setError('No API endpoint configured for this field');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorUrl(null);

    try {
      const headers = await getAuthHeaders();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      let queryString = '';
      if (query && field.apiLookupSearchParam) {
        queryString = `${field.apiLookupSearchParam}=${encodeURIComponent(query)}`;
      }

      const proxyPayload: Record<string, any> = {
        apiPath: field.apiLookupEndpoint || '',
        httpMethod,
        queryString,
        secondaryApiId: field.apiLookupSecondaryApiId || undefined,
      };

      if (hasRequestBody) {
        const body = buildRequestBody(
          field.apiLookupRequestBody!,
          field.apiLookupRequestBodyMappings || [],
          formData,
          query || '',
          field.apiLookupWrapBodyInArray || false
        );
        if (body !== null) {
          proxyPayload.body = body;
        }
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/api-proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify(proxyPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.url) {
          setErrorUrl(errorData.url);
        }
        throw new Error(errorData?.error || errorData?.details || `API returned ${response.status}`);
      }

      const data = await response.json();
      let resultArray: Record<string, any>[] = [];
      if (Array.isArray(data)) {
        resultArray = data;
      } else if (data && typeof data === 'object') {
        const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
        if (arrayKey) {
          resultArray = data[arrayKey];
        } else {
          resultArray = [data];
        }
      }

      setResults(resultArray);
      setHasSearched(true);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch results');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [field.apiLookupEndpoint, field.apiLookupSearchParam, field.apiLookupSecondaryApiId, httpMethod, hasRequestBody, formData]);

  useEffect(() => {
    if (!field.apiLookupEndpoint && !field.apiLookupSecondaryApiId) {
      setError('No API endpoint configured for this field. Please set the endpoint path in Client Setup → Order Entry → Field Configuration.');
      return;
    }
    fetchResults();
  }, []);

  const handleSearch = () => {
    fetchResults(searchQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const getNestedValue = (obj: Record<string, any>, path: string): any => {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {field.fieldLabel} - Lookup
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Select a result to populate the field
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {error && (
            <div className="p-4 m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
              {errorUrl && (
                <p className="mt-2 ml-8 text-xs text-red-600/80 dark:text-red-400/80 font-mono break-all">
                  Target URL: {errorUrl}
                </p>
              )}
            </div>
          )}

          {loading && !hasSearched && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <Search className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No results found</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {displayColumns.length > 0 ? (
                      displayColumns.map((col, idx) => (
                        <th key={idx} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                          {col.label}
                        </th>
                      ))
                    ) : (
                      Object.keys(results[0]).slice(0, 5).map((key) => (
                        <th key={key} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-600">
                          {key}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {results.map((result, rowIdx) => (
                    <tr
                      key={rowIdx}
                      onClick={() => onSelect(result)}
                      className="cursor-pointer hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors"
                    >
                      {displayColumns.length > 0 ? (
                        displayColumns.map((col, colIdx) => (
                          <td key={colIdx} className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {String(getNestedValue(result, col.field) ?? '')}
                          </td>
                        ))
                      ) : (
                        Object.keys(results[0]).slice(0, 5).map((key) => (
                          <td key={key} className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {String(result[key] ?? '')}
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {results.length > 0 ? `${results.length} result${results.length !== 1 ? 's' : ''}` : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
