import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, Braces, FileText, AlertCircle } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';
import { supabase } from '../../../lib/supabase';
import {
  emptyApiEndpoint,
  type GuestPaymentApiEndpoint,
  type GuestPaymentApiSourceType,
  type GuestPaymentBodyFieldMapping,
  type GuestPaymentBodyMappingDataType,
  type GuestPaymentBodyMappingType,
  type GuestPaymentGridColumn,
  type GuestPaymentHeaderKV,
  type GuestPaymentResponseMapping,
} from '../../../services/guestPaymentConfigService';

const BODY_MAPPING_TYPE_OPTIONS = [
  { value: 'hardcoded', label: 'Hardcoded' },
  { value: 'variable', label: 'Variable' },
];

const BODY_MAPPING_DATA_TYPE_OPTIONS = [
  { value: 'string', label: 'String' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
];

function extractLeafFields(
  obj: unknown,
  prefix = '',
): Array<{ fieldName: string; dataType: GuestPaymentBodyMappingDataType }> {
  const out: Array<{ fieldName: string; dataType: GuestPaymentBodyMappingDataType }> = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fieldName = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      out.push(...extractLeafFields(value[0], `${fieldName}[0]`));
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...extractLeafFields(value, fieldName));
    } else {
      let dataType: GuestPaymentBodyMappingDataType = 'string';
      if (typeof value === 'number') dataType = Number.isInteger(value) ? 'integer' : 'number';
      else if (typeof value === 'boolean') dataType = 'boolean';
      out.push({ fieldName, dataType });
    }
  }
  return out;
}

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'PATCH', label: 'PATCH' },
];

const COLUMN_FORMAT_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & Time' },
];

export const HEADER_SIZE_OPTIONS = [
  { value: 'lg', label: 'Small' },
  { value: 'xl', label: 'Medium' },
  { value: '2xl', label: 'Large' },
  { value: '3xl', label: 'Extra Large' },
  { value: '4xl', label: 'Huge' },
];

export const SUB_HEADER_SIZE_OPTIONS = [
  { value: 'sm', label: 'Small' },
  { value: 'base', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
];

export const LOGO_SIZE_OPTIONS = [
  { value: 'xs', label: 'Extra Small' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
  { value: '2xl', label: 'Huge' },
];

export function LabeledInput({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}

export function LabeledTextarea({
  label, value, onChange, placeholder, rows = 4,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}

export function KVListEditor({
  label, value, onChange, keyPlaceholder, valuePlaceholder, variables,
}: {
  label: string; value: GuestPaymentHeaderKV[]; onChange: (v: GuestPaymentHeaderKV[]) => void;
  keyPlaceholder?: string; valuePlaceholder?: string;
  variables?: { name: string; label: string }[];
}) {
  const setRow = (idx: number, patch: Partial<GuestPaymentHeaderKV>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickerIdx === null) return;
    const btn = buttonRefs.current[pickerIdx];
    if (!btn) return;
    const update = () => {
      const rect = btn.getBoundingClientRect();
      const width = 260;
      let left = rect.right - width;
      if (left < 8) left = 8;
      let top = rect.bottom + 4;
      const maxH = 280;
      if (top + maxH > window.innerHeight - 8) top = rect.top - maxH - 4;
      if (top < 8) top = 8;
      setPickerPos({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [pickerIdx]);

  useEffect(() => {
    if (pickerIdx === null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRefs.current[pickerIdx]?.contains(t)) return;
      setPickerIdx(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerIdx(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerIdx]);

  const insertVariable = (idx: number, name: string) => {
    const input = inputRefs.current[idx];
    const current = value[idx]?.value ?? '';
    const token = `{${name}}`;
    let next: string;
    let cursor: number;
    if (input && typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number') {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      next = current.slice(0, start) + token + current.slice(end);
      cursor = start + token.length;
    } else {
      next = current + token;
      cursor = next.length;
    }
    setRow(idx, { value: next });
    setPickerIdx(null);
    requestAnimationFrame(() => {
      const el = inputRefs.current[idx];
      if (el) {
        el.focus();
        try { el.setSelectionRange(cursor, cursor); } catch { /* noop */ }
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
        <button
          onClick={() => onChange([...value, { key: '', value: '' }])}
          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {value.length === 0 && <div className="text-xs italic text-gray-400">None</div>}
      {value.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            value={row.key}
            onChange={(e) => setRow(idx, { key: e.target.value })}
            placeholder={keyPlaceholder ?? 'Key'}
            className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          />
          <input
            ref={(el) => { inputRefs.current[idx] = el; }}
            value={row.value}
            onChange={(e) => setRow(idx, { value: e.target.value })}
            placeholder={valuePlaceholder ?? 'Value'}
            className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
          />
          {variables && variables.length > 0 && (
            <button
              ref={(el) => { buttonRefs.current[idx] = el; }}
              type="button"
              onClick={() => setPickerIdx(pickerIdx === idx ? null : idx)}
              title="Insert Search Box variable"
              className="p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              <Braces className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </button>
        </div>
      ))}
      {variables && variables.length > 0 && pickerIdx !== null && createPortal(
        <div
          ref={popoverRef}
          className="fixed w-[260px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-y-auto"
          style={{ top: pickerPos.top, left: pickerPos.left, maxHeight: 280, zIndex: 9999 }}
        >
          <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
              Search Box Variables
            </span>
          </div>
          {variables.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No search boxes configured.</div>
          ) : (
            variables.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => insertVariable(pickerIdx, v.name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <span className="font-mono text-gray-900 dark:text-gray-100">{`{${v.name}}`}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{v.label}</span>
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function ResponseMappingsEditor({
  value, onChange,
}: { value: GuestPaymentResponseMapping[]; onChange: (v: GuestPaymentResponseMapping[]) => void }) {
  const setRow = (idx: number, patch: Partial<GuestPaymentResponseMapping>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Response Data Mappings</span>
        <button
          onClick={() => onChange([...value, { source_path: '', target_key: '' }])}
          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {value.length === 0 && (
        <div className="text-xs italic text-gray-400">
          Map response fields to keys the next step can use.
        </div>
      )}
      {value.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            value={row.source_path}
            onChange={(e) => setRow(idx, { source_path: e.target.value })}
            placeholder="Source path (e.g. data[0].customerId)"
            className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono"
          />
          <input
            value={row.target_key}
            onChange={(e) => setRow(idx, { target_key: e.target.value })}
            placeholder="Target key (e.g. customer_id)"
            className="flex-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono"
          />
          <button
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </button>
        </div>
      ))}
    </div>
  );
}

const SOURCE_TYPE_OPTIONS = [
  { value: 'main', label: 'Main API' },
  { value: 'secondary', label: 'Secondary API' },
  { value: 'custom', label: 'Custom URL' },
];

type SecondaryApiRow = { id: string; name: string; base_url: string };
type ApiSpecRow = { id: string; name: string; version: string | null };
type ApiSpecEndpointRow = { id: string; path: string; method: string; summary: string | null };

function extractPathVariables(path: string): string[] {
  const regex = /\{([^}]+)\}/g;
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(path)) !== null) vars.push(m[1]);
  return Array.from(new Set(vars));
}

export function ApiEndpointSection({
  title, description, value, onChange, variables,
}: {
  title: string; description: string;
  value: GuestPaymentApiEndpoint; onChange: (v: GuestPaymentApiEndpoint) => void;
  variables?: { name: string; label: string }[];
}) {
  const endpoint = useMemo(() => value ?? emptyApiEndpoint(), [value]);
  const patch = (p: Partial<GuestPaymentApiEndpoint>) => onChange({ ...endpoint, ...p });
  const sourceType: GuestPaymentApiSourceType = endpoint.api_source_type ?? 'custom';
  const manualEntry = endpoint.manual_api_entry === true;

  const [secondaryApis, setSecondaryApis] = useState<SecondaryApiRow[]>([]);
  const [mainBaseUrl, setMainBaseUrl] = useState<string>('');
  const [apiSpecs, setApiSpecs] = useState<ApiSpecRow[]>([]);
  const [availableEndpoints, setAvailableEndpoints] = useState<ApiSpecEndpointRow[]>([]);
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);

  const bodyFieldMappings = endpoint.body_field_mappings ?? [];

  const setBodyFieldMappings = (next: GuestPaymentBodyFieldMapping[]) => {
    patch({ body_field_mappings: next });
  };

  const generateBodyFieldMappings = () => {
    if (!endpoint.body || !endpoint.body.trim()) {
      setJsonParseError('Enter a JSON request body first.');
      return;
    }
    try {
      const parsed = JSON.parse(endpoint.body);
      const leaves = extractLeafFields(parsed);
      const existing = new Set(bodyFieldMappings.map((m) => m.fieldName));
      const additions: GuestPaymentBodyFieldMapping[] = leaves
        .filter((l) => !existing.has(l.fieldName))
        .map((l) => ({ fieldName: l.fieldName, type: 'hardcoded', value: '', dataType: l.dataType }));
      if (additions.length === 0 && leaves.length === 0) {
        setJsonParseError('No leaf fields found in the JSON body.');
        return;
      }
      setBodyFieldMappings([...bodyFieldMappings, ...additions]);
      setJsonParseError(null);
    } catch (err) {
      setJsonParseError(err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON.');
    }
  };

  const updateMapping = (index: number, patchMapping: Partial<GuestPaymentBodyFieldMapping>) => {
    const next = [...bodyFieldMappings];
    next[index] = { ...next[index], ...patchMapping };
    setBodyFieldMappings(next);
  };

  const removeMapping = (index: number) => {
    setBodyFieldMappings(bodyFieldMappings.filter((_, i) => i !== index));
  };

  const addMapping = () => {
    setBodyFieldMappings([
      ...bodyFieldMappings,
      { fieldName: '', type: 'hardcoded', value: '', dataType: 'string' },
    ]);
  };

  const variableOptions = useMemo(
    () => [
      { value: '', label: 'Insert variable...' },
      ...(variables ?? []).map((v) => ({ value: v.name, label: v.label })),
    ],
    [variables],
  );

  const insertVariableIntoMapping = (index: number, variableName: string) => {
    if (!variableName) return;
    const current = bodyFieldMappings[index];
    if (!current) return;
    if (current.type === 'variable') {
      updateMapping(index, { value: variableName });
    } else {
      const existing = current.value ?? '';
      updateMapping(index, { value: existing ? `${existing}{${variableName}}` : `{${variableName}}` });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sec, main] = await Promise.all([
        supabase.from('secondary_api_configs').select('id, name, base_url').eq('is_active', true).order('name'),
        supabase.from('api_settings').select('path').maybeSingle(),
      ]);
      if (cancelled) return;
      setSecondaryApis((sec.data as SecondaryApiRow[] | null) ?? []);
      setMainBaseUrl(((main.data as { path?: string } | null)?.path) ?? '');
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (sourceType === 'main') {
        const { data } = await supabase
          .from('api_specs')
          .select('id, name, version')
          .not('api_endpoint_id', 'is', null)
          .order('uploaded_at', { ascending: false });
        if (!cancelled) setApiSpecs((data as ApiSpecRow[] | null) ?? []);
      } else if (sourceType === 'secondary' && endpoint.secondary_api_id) {
        const { data } = await supabase
          .from('api_specs')
          .select('id, name, version')
          .eq('secondary_api_id', endpoint.secondary_api_id)
          .order('uploaded_at', { ascending: false });
        if (!cancelled) setApiSpecs((data as ApiSpecRow[] | null) ?? []);
      } else {
        setApiSpecs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceType, endpoint.secondary_api_id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!endpoint.api_spec_id) { setAvailableEndpoints([]); return; }
      const { data } = await supabase
        .from('api_spec_endpoints')
        .select('id, path, method, summary')
        .eq('api_spec_id', endpoint.api_spec_id)
        .eq('method', endpoint.method)
        .order('path');
      if (!cancelled) setAvailableEndpoints((data as ApiSpecEndpointRow[] | null) ?? []);
    })();
    return () => { cancelled = true; };
  }, [endpoint.api_spec_id, endpoint.method]);

  const specOptions = useMemo(
    () => apiSpecs.map((s) => ({ value: s.id, label: s.version ? `${s.name} (${s.version})` : s.name })),
    [apiSpecs],
  );
  const secondaryOptions = useMemo(
    () => secondaryApis.map((s) => ({ value: s.id, label: s.name })),
    [secondaryApis],
  );
  const endpointOptions = useMemo(
    () => availableEndpoints.map((e) => ({ value: e.id, label: `${e.path}${e.summary ? ` — ${e.summary}` : ''}` })),
    [availableEndpoints],
  );

  const handleSourceChange = (v: string) => {
    const nextSource = v as GuestPaymentApiSourceType;
    patch({
      api_source_type: nextSource,
      secondary_api_id: null,
      api_spec_id: null,
      api_spec_endpoint_id: null,
      api_path: '',
      path_variables: {},
      manual_api_entry: nextSource === 'custom' ? true : false,
    });
  };

  const handleSecondaryChange = (v: string) => {
    patch({ secondary_api_id: v || null, api_spec_id: null, api_spec_endpoint_id: null, api_path: '', path_variables: {} });
  };

  const handleSpecChange = (v: string) => {
    patch({ api_spec_id: v || null, api_spec_endpoint_id: null, api_path: '', path_variables: {} });
  };

  const handleEndpointChange = (v: string) => {
    const ep = availableEndpoints.find((e) => e.id === v);
    if (!ep) { patch({ api_spec_endpoint_id: null, api_path: '', path_variables: {} }); return; }
    const vars = extractPathVariables(ep.path);
    const nextVars: Record<string, string> = {};
    for (const name of vars) nextVars[name] = endpoint.path_variables?.[name] ?? '';
    patch({ api_spec_endpoint_id: ep.id, api_path: ep.path, path_variables: nextVars });
  };

  const setPathVar = (name: string, val: string) => {
    patch({ path_variables: { ...(endpoint.path_variables ?? {}), [name]: val } });
  };

  const baseUrl = sourceType === 'main'
    ? mainBaseUrl
    : sourceType === 'secondary'
      ? secondaryApis.find((a) => a.id === endpoint.secondary_api_id)?.base_url ?? ''
      : '';

  const previewPath = manualEntry ? endpoint.api_path ?? '' : endpoint.api_path ?? '';
  const previewUrl = sourceType === 'custom'
    ? endpoint.url
    : `${baseUrl}${previewPath}`;

  const pathVars = extractPathVariables(endpoint.api_path ?? '');
  const showChain = sourceType === 'main' || sourceType === 'secondary';

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">API Source</span>
          <CustomDropdown
            value={sourceType}
            onChange={handleSourceChange}
            options={SOURCE_TYPE_OPTIONS}
          />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">HTTP Method</span>
          <CustomDropdown
            value={endpoint.method}
            onChange={(v) => patch({ method: v as GuestPaymentApiEndpoint['method'], api_spec_endpoint_id: null })}
            options={METHOD_OPTIONS}
          />
        </div>
      </div>

      {sourceType === 'secondary' && (
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Secondary API</span>
          <CustomDropdown
            value={endpoint.secondary_api_id ?? ''}
            onChange={handleSecondaryChange}
            options={secondaryOptions}
            placeholder="Select a secondary API"
            searchable
          />
        </div>
      )}

      {showChain && (
        <>
          <div>
            <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">API Specification</span>
            <CustomDropdown
              value={endpoint.api_spec_id ?? ''}
              onChange={handleSpecChange}
              options={specOptions}
              placeholder={sourceType === 'secondary' && !endpoint.secondary_api_id ? 'Select a secondary API first' : 'Select an API specification'}
              searchable
              disabled={sourceType === 'secondary' && !endpoint.secondary_api_id}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`manual-${title}`}
              type="checkbox"
              checked={manualEntry}
              onChange={(e) => patch({ manual_api_entry: e.target.checked, api_spec_endpoint_id: e.target.checked ? null : endpoint.api_spec_endpoint_id })}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor={`manual-${title}`} className="text-xs text-gray-700 dark:text-gray-200">
              Enter endpoint path manually
            </label>
          </div>

          {!manualEntry ? (
            <div>
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">API Endpoint</span>
              <CustomDropdown
                value={endpoint.api_spec_endpoint_id ?? ''}
                onChange={handleEndpointChange}
                options={endpointOptions}
                placeholder={endpoint.api_spec_id ? 'Select an endpoint' : 'Select an API specification first'}
                searchable
                disabled={!endpoint.api_spec_id}
              />
            </div>
          ) : (
            <LabeledInput
              label="Endpoint Path"
              value={endpoint.api_path ?? ''}
              onChange={(v) => patch({ api_path: v, path_variables: (() => {
                const vars = extractPathVariables(v);
                const next: Record<string, string> = {};
                for (const n of vars) next[n] = endpoint.path_variables?.[n] ?? '';
                return next;
              })() })}
              placeholder="/customers/{customer_id}/invoices"
            />
          )}

          {pathVars.length > 0 && (
            <div className="p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 space-y-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300">Path Variables</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pathVars.map((name) => (
                  <LabeledInput
                    key={name}
                    label={`{${name}}`}
                    value={endpoint.path_variables?.[name] ?? ''}
                    onChange={(v) => setPathVar(name, v)}
                    placeholder={`Value for {${name}} — supports {variables}`}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {sourceType === 'custom' && (
        <LabeledInput
          label="URL"
          value={endpoint.url}
          onChange={(v) => patch({ url: v })}
          placeholder="https://api.example.com/customers/{customer_id}/invoices"
        />
      )}

      <div className="p-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
        <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">URL Preview</div>
        <div className="text-xs font-mono break-all text-gray-800 dark:text-gray-100">
          {previewUrl || <span className="italic text-gray-400">Select a source and endpoint to preview.</span>}
        </div>
      </div>

      <KVListEditor label="Headers" value={endpoint.headers} onChange={(v) => patch({ headers: v })} keyPlaceholder="Header name" valuePlaceholder="Header value" />
      <KVListEditor label="Query Parameters" value={endpoint.query_params} onChange={(v) => patch({ query_params: v })} variables={variables} />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Request Body (JSON template, supports {'{variables}'})
          </span>
          <button
            type="button"
            onClick={generateBodyFieldMappings}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileText className="h-3 w-3" />
            Map JSON
          </button>
        </div>
        <textarea
          value={endpoint.body}
          onChange={(e) => {
            patch({ body: e.target.value });
            if (jsonParseError) setJsonParseError(null);
          }}
          placeholder={`{\n  "name": "xpsPortalFindArBill",\n  "inputs": { "IBILL_NUMBER": "" }\n}`}
          rows={6}
          className={`w-full px-3 py-2 rounded-md border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            jsonParseError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {jsonParseError && (
          <div className="flex items-start gap-1.5 p-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-xs">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-red-700 dark:text-red-300 font-mono">{jsonParseError}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Field Mappings {bodyFieldMappings.length > 0 && (
              <span className="ml-1 text-gray-400 font-normal">({bodyFieldMappings.length})</span>
            )}
          </span>
          <button
            type="button"
            onClick={addMapping}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-3 w-3" />
            Add Mapping
          </button>
        </div>

        {bodyFieldMappings.length === 0 ? (
          <div className="text-xs italic text-gray-500 dark:text-gray-400 px-1">
            No mappings yet. Paste JSON above and click Map JSON to generate one row per field, or add rows manually.
          </div>
        ) : (
          <div className="space-y-1.5">
            {bodyFieldMappings.map((mapping, index) => (
              <div
                key={index}
                className={`p-2 rounded border ${
                  mapping.type === 'hardcoded'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <input
                    type="text"
                    value={mapping.fieldName}
                    onChange={(e) => updateMapping(index, { fieldName: e.target.value })}
                    placeholder="inputs.IBILL_NUMBER"
                    className="flex-1 px-2 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <CustomDropdown
                    value={mapping.type}
                    onChange={(v) => updateMapping(index, { type: v as GuestPaymentBodyMappingType, value: '' })}
                    options={BODY_MAPPING_TYPE_OPTIONS}
                    size="sm"
                    className="w-28"
                    dropdownMinWidth={120}
                  />
                  <CustomDropdown
                    value={mapping.dataType}
                    onChange={(v) => updateMapping(index, { dataType: v as GuestPaymentBodyMappingDataType })}
                    options={BODY_MAPPING_DATA_TYPE_OPTIONS}
                    size="sm"
                    className="w-24"
                    dropdownMinWidth={110}
                  />
                  <button
                    type="button"
                    onClick={() => removeMapping(index)}
                    className="p-1 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                    title="Remove mapping"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {mapping.type === 'variable' && variableOptions.length > 1 ? (
                    <CustomDropdown
                      value={mapping.value}
                      onChange={(v) => updateMapping(index, { value: v })}
                      options={variableOptions}
                      size="sm"
                      searchable
                    />
                  ) : (
                    <input
                      type="text"
                      value={mapping.value}
                      onChange={(e) => updateMapping(index, { value: e.target.value })}
                      placeholder={mapping.type === 'hardcoded' ? 'Literal value (supports {variables})' : 'variable.path'}
                      className="flex-1 px-2 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  )}
                  {mapping.type === 'hardcoded' && variableOptions.length > 1 && (
                    <div className="w-64">
                      <CustomDropdown
                        value=""
                        onChange={(v) => insertVariableIntoMapping(index, v)}
                        options={variableOptions}
                        size="sm"
                        placeholder="Insert variable"
                        dropdownMinWidth={360}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LabeledInput
        label="Response Data Path"
        value={endpoint.response_data_path}
        onChange={(v) => patch({ response_data_path: v })}
        placeholder="data.results"
      />
      <ResponseMappingsEditor value={endpoint.response_mappings} onChange={(v) => patch({ response_mappings: v })} />
    </div>
  );
}

function ResponseKeyPickerButton({
  availableKeys, onPick, disabled,
}: {
  availableKeys: Array<{ target_key: string; source_path?: string }>;
  onPick: (key: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (!btn) return;
    const update = () => {
      const rect = btn.getBoundingClientRect();
      const width = 280;
      let left = rect.right - width;
      if (left < 8) left = 8;
      let top = rect.bottom + 4;
      const maxH = 300;
      if (top + maxH > window.innerHeight - 8) top = rect.top - maxH - 4;
      if (top < 8) top = 8;
      setPos({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = availableKeys.filter((k) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return k.target_key.toLowerCase().includes(q) || (k.source_path ?? '').toLowerCase().includes(q);
  });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Insert from response data mappings"
        className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Braces className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="fixed z-[9999] w-[280px] max-h-[300px] overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg flex flex-col"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Response Data Mappings</div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter keys..."
              className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs italic text-gray-500 dark:text-gray-400">
                {availableKeys.length === 0
                  ? 'No response mappings defined on this Search API yet. Add them in the Search API tab first.'
                  : 'No keys match your filter.'}
              </div>
            ) : (
              filtered.map((k, idx) => (
                <button
                  key={`${k.target_key}-${idx}`}
                  type="button"
                  onClick={() => { onPick(k.target_key); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 flex flex-col"
                >
                  <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{k.target_key}</span>
                  {k.source_path && (
                    <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">{k.source_path}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function GridColumnsSection({
  title, description, value, onChange, withBillFlags, availableKeys = [],
}: {
  title: string; description: string;
  value: GuestPaymentGridColumn[]; onChange: (v: GuestPaymentGridColumn[]) => void;
  withBillFlags: boolean;
  availableKeys?: Array<{ target_key: string; source_path?: string }>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<GuestPaymentGridColumn>({ key: '', label: '', format: 'text' });

  const beginAdd = () => { setDraft({ key: '', label: '', format: 'text' }); setEditing(value.length); };
  const beginEdit = (idx: number) => { setDraft(value[idx]); setEditing(idx); };
  const save = () => {
    if (editing === null) return;
    if (!draft.key.trim() || !draft.label.trim()) return;
    const next = [...value];
    if (withBillFlags && draft.is_amount) next.forEach((c) => (c.is_amount = false));
    if (withBillFlags && draft.is_bill_number) next.forEach((c) => (c.is_bill_number = false));
    next[editing] = draft;
    onChange(next);
    setEditing(null);
  };
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
    if (editing === idx) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <button
          onClick={beginAdd}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Column
        </button>
      </div>
      <div className="space-y-2">
        {value.length === 0 && editing === null && (
          <div className="text-xs italic text-gray-500 dark:text-gray-400">No columns configured.</div>
        )}
        {value.map((col, idx) => (
          <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">{col.label}</span>
              <span className="text-gray-500 dark:text-gray-400 ml-2">({col.key})</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 uppercase">{col.format}</span>
              {col.is_amount && <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Amount</span>}
              {col.is_bill_number && <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">Bill #</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => beginEdit(idx)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <Pencil className="h-3.5 w-3.5 text-gray-500" />
              </button>
              <button onClick={() => remove(idx)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40">
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing !== null && (
        <div className="p-4 bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-md space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Key (response field)</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft.key}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  placeholder="bill_number"
                  className="flex-1 min-w-0 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <ResponseKeyPickerButton
                  availableKeys={availableKeys}
                  onPick={(k) => setDraft({ ...draft, key: k })}
                />
              </div>
            </div>
            <LabeledInput label="Label" value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} placeholder="Bill Number" />
            <div>
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Format</span>
              <CustomDropdown
                value={draft.format}
                onChange={(v) => setDraft({ ...draft, format: v as GuestPaymentGridColumn['format'] })}
                options={COLUMN_FORMAT_OPTIONS}
              />
            </div>
          </div>
          {withBillFlags && (
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={!!draft.is_amount} onChange={(e) => setDraft({ ...draft, is_amount: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                This column holds the amount
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={!!draft.is_bill_number} onChange={(e) => setDraft({ ...draft, is_bill_number: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                This column holds the Bill Number
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 rounded-md text-xs bg-emerald-600 text-white">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
