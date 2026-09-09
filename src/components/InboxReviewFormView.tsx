import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Lock, AlertCircle, Plus, Trash2 } from 'lucide-react';
import CustomDropdown from './common/CustomDropdown';
import DatePicker from './common/DatePicker';
import TimePicker from './common/TimePicker';
import type {
  InboxReviewFieldGroup,
  InboxReviewField,
  InboxReviewFieldLayout,
  InboxReviewFieldType,
  InboxReviewVisibilityCondition,
} from '../types';

interface InboxReviewFormViewProps {
  groups: InboxReviewFieldGroup[];
  fields: InboxReviewField[];
  layouts: InboxReviewFieldLayout[];
  jsonData: any;
  onFieldChange: (jsonPath: string, value: any) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
  changedFields?: Set<string>;
  showChanges?: boolean;
}

function extractDatePart(raw: any): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  return s.split('T')[0].split(' ')[0] || '';
}

function extractTimePart(raw: any): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const afterDate = s.includes('T')
    ? s.split('T').slice(1).join('T')
    : (s.includes(' ') ? s.split(' ').slice(1).join(' ') : '');
  const source = afterDate || s;
  const m = source.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?/i);
  if (!m) return '';
  const cleaned = m[2] ? `${m[1]} ${m[2].toUpperCase()}` : m[1];
  if (cleaned !== source.trim()) {
    console.warn('[InboxReviewFormView] Timestamp time portion contained extra content; using first valid token.', { raw: s, afterDate: source, cleaned });
  }
  return cleaned;
}

function withSeconds(time: string): string {
  if (!time) return '';
  const m = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*(AM|PM))?$/i);
  if (!m) return time;
  const hh = m[1];
  const mm = m[2];
  const ss = m[3] ?? '00';
  const suffix = m[5] ? ` ${m[5].toUpperCase()}` : '';
  return `${hh}:${mm}:${ss}${suffix}`;
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const idx = Number(part);
    current = isNaN(idx) ? current[part] : current[idx];
  }
  return current;
}

function resolveArrayLeafKey(
  parentObj: any,
  expectedLeafKey: string,
): string | null {
  if (!parentObj || typeof parentObj !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(parentObj, expectedLeafKey)) {
    return expectedLeafKey;
  }
  const target = expectedLeafKey.toLowerCase();
  for (const key of Object.keys(parentObj)) {
    if (key.toLowerCase() === target) return key;
  }
  return null;
}

interface ResolvedArrayItem {
  item: any;
  basePath: string;
}

function resolveArrayPath(obj: any, path: string): ResolvedArrayItem[] {
  if (!obj || !path) return [];

  const segments: string[] = [];
  let current = '';
  for (let i = 0; i < path.length; i++) {
    if (path[i] === '[' && path[i + 1] === ']') {
      if (current) segments.push(current);
      segments.push('[]');
      current = '';
      i += 1;
    } else if (path[i] === '.') {
      if (current) segments.push(current);
      current = '';
    } else {
      current += path[i];
    }
  }
  if (current) segments.push(current);

  let items: ResolvedArrayItem[] = [{ item: obj, basePath: '' }];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '[]') {
      const next: ResolvedArrayItem[] = [];
      for (const entry of items) {
        const arr = entry.item;
        if (Array.isArray(arr)) {
          arr.forEach((el, idx) => {
            next.push({
              item: el,
              basePath: `${entry.basePath}[${idx}]`,
            });
          });
        }
      }
      items = next;
    } else {
      items = items.map((entry) => ({
        item: entry.item?.[seg],
        basePath: entry.basePath ? `${entry.basePath}.${seg}` : seg,
      }));
    }
  }

  return items.filter((r) => r.item !== undefined && r.item !== null);
}

function evaluateVisibilityCondition(
  condition: InboxReviewVisibilityCondition | null | undefined,
  jsonData: any
): boolean {
  if (!condition) return true;
  const val = getNestedValue(jsonData, condition.fieldJsonPath);
  const strVal = val != null ? String(val) : '';

  switch (condition.operator) {
    case 'equals':
      return strVal === (condition.value || '');
    case 'not_equals':
      return strVal !== (condition.value || '');
    case 'contains':
      return strVal.toLowerCase().includes((condition.value || '').toLowerCase());
    case 'not_empty':
      return val !== null && val !== undefined && strVal !== '';
    case 'empty':
      return val === null || val === undefined || strVal === '';
    default:
      return true;
  }
}

export default function InboxReviewFormView({
  groups,
  fields,
  layouts,
  jsonData,
  onFieldChange,
  errors,
  readOnly = false,
  changedFields,
  showChanges = false,
}: InboxReviewFormViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    groups.forEach((g) => {
      if (g.isCollapsedByDefault) initial.add(g.id);
    });
    return initial;
  });

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.groupOrder - b.groupOrder),
    [groups]
  );

  const fieldsByGroup = useMemo(() => {
    const map: Record<string, InboxReviewField[]> = {};
    for (const f of fields) {
      if (!map[f.groupId]) map[f.groupId] = [];
      map[f.groupId].push(f);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.fieldOrder - b.fieldOrder);
    }
    return map;
  }, [fields]);

  const layoutByField = useMemo(() => {
    const map: Record<string, InboxReviewFieldLayout> = {};
    for (const l of layouts) {
      map[l.fieldId] = l;
    }
    return map;
  }, [layouts]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  return (
    <div className="p-3 space-y-2">
      {sortedGroups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.id);
        const groupFields = fieldsByGroup[group.id] || [];

        if (group.isArrayGroup && group.arrayJsonPath) {
          return (
            <ArrayGroupCard
              key={group.id}
              group={group}
              fields={groupFields}
              layouts={layoutByField}
              jsonData={jsonData}
              onFieldChange={onFieldChange}
              errors={errors}
              readOnly={readOnly}
              isCollapsed={isCollapsed}
              onToggle={() => toggleGroup(group.id)}
              changedFields={changedFields}
              showChanges={showChanges}
            />
          );
        }

        return (
          <GroupCard
            key={group.id}
            group={group}
            fields={groupFields}
            layouts={layoutByField}
            jsonData={jsonData}
            onFieldChange={onFieldChange}
            errors={errors}
            readOnly={readOnly}
            isCollapsed={isCollapsed}
            onToggle={() => toggleGroup(group.id)}
            changedFields={changedFields}
            showChanges={showChanges}
          />
        );
      })}
    </div>
  );
}

interface GroupCardProps {
  group: InboxReviewFieldGroup;
  fields: InboxReviewField[];
  layouts: Record<string, InboxReviewFieldLayout>;
  jsonData: any;
  onFieldChange: (jsonPath: string, value: any) => void;
  errors: Record<string, string>;
  readOnly: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  changedFields?: Set<string>;
  showChanges?: boolean;
}

function GroupCard({
  group,
  fields,
  layouts,
  jsonData,
  onFieldChange,
  errors,
  readOnly,
  isCollapsed,
  onToggle,
  changedFields,
  showChanges = false,
}: GroupCardProps) {
  const rows = useMemo(() => buildGridRows(fields, layouts), [fields, layouts]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-semibold text-black">
          {group.groupName}
        </span>
        {group.description && (
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            {group.description}
          </span>
        )}
      </button>

      {!isCollapsed && (
        <div className="px-3 py-2 space-y-2">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-12 gap-2">
              {row.map((cell) => {
                const isFieldChanged = showChanges && changedFields?.has(cell.field.jsonPath);
                return (
                  <div
                    key={cell.field.id}
                    className={`col-span-12 md:col-span-${cell.width}${
                      isFieldChanged ? ' ring-2 ring-amber-400 dark:ring-amber-600 bg-amber-50/50 dark:bg-amber-900/20 rounded-lg p-1' : ''
                    }`}
                    style={{ gridColumn: `span ${cell.width} / span ${cell.width}` }}
                  >
                    <ReviewField
                      field={cell.field}
                      value={getNestedValue(jsonData, cell.field.jsonPath)}
                      onChange={(val) => onFieldChange(cell.field.jsonPath, val)}
                      error={errors[cell.field.jsonPath]}
                      readOnly={readOnly}
                      jsonData={jsonData}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ArrayGroupCardProps extends GroupCardProps {}

function getFieldSuffix(fieldJsonPath: string, arrayJsonPath: string): string {
  const patternParts = arrayJsonPath.split('[]');
  let pos = 0;
  for (let i = 0; i < patternParts.length; i++) {
    const seg = patternParts[i];
    if (seg && !fieldJsonPath.startsWith(seg, pos)) return fieldJsonPath;
    pos += seg.length;
    if (i < patternParts.length - 1) {
      const bracketOpen = fieldJsonPath.indexOf('[', pos);
      if (bracketOpen !== pos) return fieldJsonPath;
      const bracketClose = fieldJsonPath.indexOf(']', bracketOpen);
      if (bracketClose === -1) return fieldJsonPath;
      pos = bracketClose + 1;
    }
  }
  return fieldJsonPath.slice(pos);
}

function getLeafArrayPath(arrayJsonPath: string, jsonData: any): string | null {
  const lastBracket = arrayJsonPath.lastIndexOf('[]');
  if (lastBracket === -1) return null;
  const parentPattern = arrayJsonPath.slice(0, lastBracket);
  if (!parentPattern.includes('[]')) {
    return parentPattern;
  }
  const parentResolved = resolveArrayPath(jsonData, parentPattern);
  if (parentResolved.length > 0) return parentResolved[0].basePath;
  return null;
}

function ArrayGroupCard({
  group,
  fields,
  layouts,
  jsonData,
  onFieldChange,
  errors,
  readOnly,
  isCollapsed,
  onToggle,
  changedFields,
  showChanges = false,
}: ArrayGroupCardProps) {
  const sortedFields = useMemo(() => {
    return [...fields].filter(f => f.isVisible !== false).sort((a, b) => {
      const la = layouts[a.id];
      const lb = layouts[b.id];
      if (la && lb) {
        if (la.rowIndex !== lb.rowIndex) return la.rowIndex - lb.rowIndex;
        return la.columnIndex - lb.columnIndex;
      }
      if (la) return -1;
      if (lb) return 1;
      return a.fieldOrder - b.fieldOrder;
    });
  }, [fields, layouts]);

  const resolvedItems = resolveArrayPath(jsonData, group.arrayJsonPath!);

  const handleAddRow = () => {
    const leafPath = getLeafArrayPath(group.arrayJsonPath!, jsonData);
    if (!leafPath) return;
    const currentArr = getNestedValue(jsonData, leafPath);
    const arr = Array.isArray(currentArr) ? [...currentArr] : [];
    const newRow: Record<string, any> = {};
    fields.forEach((f) => {
      const suffix = getFieldSuffix(f.jsonPath, group.arrayJsonPath!);
      const key = suffix.startsWith('.') ? suffix.slice(1) : suffix;
      if (key) newRow[key] = f.defaultValue || '';
    });
    arr.push(newRow);
    onFieldChange(leafPath, arr);
  };

  const handleRemoveRow = (index: number) => {
    const leafPath = getLeafArrayPath(group.arrayJsonPath!, jsonData);
    if (!leafPath) return;
    const currentArr = getNestedValue(jsonData, leafPath);
    if (!Array.isArray(currentArr)) return;
    const arr = currentArr.filter((_: any, i: number) => i !== index);
    onFieldChange(leafPath, arr);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-750">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left flex-1"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
          )}
          <span className="text-sm font-semibold text-black">
            {group.groupName}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            ({resolvedItems.length} item{resolvedItems.length !== 1 ? 's' : ''})
          </span>
        </button>
        {!readOnly && (
          <button
            onClick={handleAddRow}
            className="mr-3 px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Row</span>
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-10">
                  #
                </th>
                {sortedFields.map((f) => (
                  <th
                    key={f.id}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {f.fieldLabel}
                    {f.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                  </th>
                ))}
                {!readOnly && (
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 w-10" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {resolvedItems.map((resolved, rowIndex) => {
                const basePath = resolved.basePath;
                return (
                  <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-3 py-2 text-xs text-gray-400">{rowIndex + 1}</td>
                    {sortedFields.map((f) => {
                      const suffix = getFieldSuffix(f.jsonPath, group.arrayJsonPath!);
                      const expectedLeafKey = suffix.startsWith('.') ? suffix.slice(1) : suffix;
                      const parentObj = getNestedValue(jsonData, basePath);
                      const actualLeafKey =
                        resolveArrayLeafKey(parentObj, expectedLeafKey) ?? expectedLeafKey;
                      const fieldJsonPath = `${basePath}.${actualLeafKey}`;
                      const val = getNestedValue(jsonData, fieldJsonPath);
                      const errKey = fieldJsonPath;

                      const isCellChanged = showChanges && changedFields?.has(fieldJsonPath);

                      return (
                        <td key={f.id} className={`px-3 py-1.5${isCellChanged ? ' bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400 dark:ring-amber-600' : ''}`}>
                          <ReviewFieldInline
                            field={f}
                            value={val}
                            onChange={(v) => onFieldChange(fieldJsonPath, v)}
                            error={errors[errKey]}
                            readOnly={readOnly}
                          />
                        </td>
                      );
                    })}
                    {!readOnly && (
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => handleRemoveRow(rowIndex)}
                          className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded"
                          title="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {resolvedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={fields.length + (readOnly ? 1 : 2)}
                    className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
                  >
                    No items
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ReviewFieldProps {
  field: InboxReviewField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  readOnly: boolean;
  jsonData?: any;
}

function ReviewField({ field, value, onChange, error, readOnly, jsonData }: ReviewFieldProps) {
  if (!field.isVisible) return null;
  if (!evaluateVisibilityCondition(field.visibilityCondition, jsonData)) return null;

  const isDisabled = readOnly || !field.isEditable;
  const fieldType = field.fieldType as InboxReviewFieldType;

  return (
    <div>
      <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        <span>{field.fieldLabel}</span>
        {field.isRequired && <span className="text-red-500">*</span>}
        {!field.isEditable && <Lock className="h-3 w-3 text-gray-400" />}
      </label>

      {fieldType === 'readonly' ? (
        <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 min-h-[32px] flex items-center">
          {value !== null && value !== undefined ? String(value) : <span className="text-gray-400 italic">—</span>}
        </div>
      ) : fieldType === 'boolean' ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => !isDisabled && onChange(e.target.checked)}
            disabled={isDisabled}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {value ? 'Yes' : 'No'}
          </span>
        </label>
      ) : fieldType === 'dropdown' ? (
        <CustomDropdown
          value={value != null ? String(value) : ''}
          onChange={(v) => onChange(v)}
          options={(field.dropdownOptions || []).map((opt: any) =>
            typeof opt === 'string' ? { value: opt, label: opt } : opt
          )}
          placeholder={field.placeholder || 'Select...'}
          disabled={isDisabled}
          error={!!error}
        />
      ) : fieldType === 'date' ? (
        <DatePicker
          value={value != null ? String(value) : ''}
          onChange={(v) => !isDisabled && onChange(v)}
          placeholder={field.placeholder || 'Select date...'}
          disabled={isDisabled}
          error={error}
        />
      ) : fieldType === 'timestamp' ? (
        <div className="grid grid-cols-5 gap-2">
          <div className="group col-span-3 min-w-0 [&_.lucide-calendar]:hidden group-hover:[&_.lucide-calendar]:inline-block group-focus-within:[&_.lucide-calendar]:inline-block">
            <DatePicker
              value={extractDatePart(value)}
              onChange={(v) => {
                if (isDisabled) return;
                const currentTime = extractTimePart(value);
                onChange(v ? (currentTime ? `${v} ${currentTime}` : v) : '');
              }}
              placeholder="Select date..."
              disabled={isDisabled}
              error={error}
            />
          </div>
          <div className="group col-span-2 min-w-0 [&_button[aria-label='Open_time_picker']]:hidden group-hover:[&_button[aria-label='Open_time_picker']]:inline-flex group-focus-within:[&_button[aria-label='Open_time_picker']]:inline-flex">
            <TimePicker
              value={(() => {
                return extractTimePart(value);
              })()}
              onChange={(t) => {
                if (isDisabled) return;
                const datePart = extractDatePart(value);
                const timeWithSeconds = withSeconds(t);
                onChange(datePart && timeWithSeconds ? `${datePart} ${timeWithSeconds}` : datePart || timeWithSeconds || '');
              }}
              placeholder="Select time..."
              disabled={isDisabled}
              error={error}
              use24Hour={field.timeFormat === '24h'}
            />
          </div>
        </div>
      ) : fieldType === 'number' ? (
        <input
          type="number"
          value={value != null ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={isDisabled}
          placeholder={field.placeholder || ''}
          step="any"
          className={`w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      ) : (
        <input
          type="text"
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          placeholder={field.placeholder || ''}
          maxLength={field.maxLength || undefined}
          className={`w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      )}

      {field.helpText && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function ReviewFieldInline({ field, value, onChange, error, readOnly }: ReviewFieldProps) {
  const isDisabled = readOnly || !field.isEditable;
  const fieldType = field.fieldType as InboxReviewFieldType;

  if (fieldType === 'readonly') {
    return (
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {value != null ? String(value) : '—'}
      </span>
    );
  }

  if (fieldType === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => !isDisabled && onChange(e.target.checked)}
        disabled={isDisabled}
        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
      />
    );
  }

  if (fieldType === 'dropdown') {
    return (
      <CustomDropdown
        value={value != null ? String(value) : ''}
        onChange={(val) => onChange(val)}
        options={(field.dropdownOptions || []).map((opt: any) => {
          const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
          return { value: o.value, label: o.label };
        })}
        placeholder="—"
        size="sm"
        disabled={isDisabled}
        error={!!error}
      />
    );
  }

  if (fieldType === 'timestamp') {
    return (
      <div className="grid grid-cols-5 gap-1.5">
        <div className="group col-span-3 min-w-0 [&_.lucide-calendar]:hidden group-hover:[&_.lucide-calendar]:inline-block group-focus-within:[&_.lucide-calendar]:inline-block">
          <DatePicker
            value={extractDatePart(value)}
            onChange={(v) => {
              if (isDisabled) return;
              const currentTime = extractTimePart(value);
              onChange(v ? (currentTime ? `${v} ${currentTime}` : v) : '');
            }}
            placeholder="Date..."
            disabled={isDisabled}
            error={!!error}
          />
        </div>
        <div className="group col-span-2 min-w-0 [&_button[aria-label='Open_time_picker']]:hidden group-hover:[&_button[aria-label='Open_time_picker']]:inline-flex group-focus-within:[&_button[aria-label='Open_time_picker']]:inline-flex">
          <TimePicker
            value={(() => {
              return extractTimePart(value);
            })()}
            onChange={(t) => {
              if (isDisabled) return;
              const datePart = extractDatePart(value);
              const timeWithSeconds = withSeconds(t);
              onChange(datePart && timeWithSeconds ? `${datePart} ${timeWithSeconds}` : datePart || timeWithSeconds || '');
            }}
            placeholder="Time..."
            disabled={isDisabled}
            error={!!error}
            use24Hour={field.timeFormat === '24h'}
          />
        </div>
      </div>
    );
  }

  return (
    <input
      type={fieldType === 'number' ? 'number' : 'text'}
      value={value != null ? String(value) : ''}
      onChange={(e) => {
        if (fieldType === 'number') {
          onChange(e.target.value === '' ? '' : Number(e.target.value));
        } else {
          onChange(e.target.value);
        }
      }}
      disabled={isDisabled}
      placeholder={field.placeholder || ''}
      className={`w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
        error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    />
  );
}

interface GridCell {
  field: InboxReviewField;
  width: number;
}

function buildGridRows(
  fields: InboxReviewField[],
  layouts: Record<string, InboxReviewFieldLayout>
): GridCell[][] {
  const visibleFields = fields.filter((f) => f.isVisible !== false);

  const fieldsWithLayout = visibleFields.filter((f) => layouts[f.id]);
  const fieldsWithoutLayout = visibleFields.filter((f) => !layouts[f.id]);

  if (fieldsWithLayout.length > 0) {
    const rowMap: Record<number, { field: InboxReviewField; layout: InboxReviewFieldLayout }[]> = {};
    for (const f of fieldsWithLayout) {
      const l = layouts[f.id];
      if (!rowMap[l.rowIndex]) rowMap[l.rowIndex] = [];
      rowMap[l.rowIndex].push({ field: f, layout: l });
    }

    const rows: GridCell[][] = [];
    const sortedRowKeys = Object.keys(rowMap)
      .map(Number)
      .sort((a, b) => a - b);

    for (const key of sortedRowKeys) {
      const items = rowMap[key].sort((a, b) => a.layout.columnIndex - b.layout.columnIndex);
      rows.push(items.map((item) => ({ field: item.field, width: item.layout.widthColumns })));
    }

    if (fieldsWithoutLayout.length > 0) {
      let currentRow: GridCell[] = [];
      let currentWidth = 0;
      for (const f of fieldsWithoutLayout) {
        const w = 6;
        if (currentWidth + w > 12) {
          rows.push(currentRow);
          currentRow = [];
          currentWidth = 0;
        }
        currentRow.push({ field: f, width: w });
        currentWidth += w;
      }
      if (currentRow.length > 0) rows.push(currentRow);
    }

    return rows;
  }

  const rows: GridCell[][] = [];
  let currentRow: GridCell[] = [];
  let currentWidth = 0;

  for (const f of visibleFields) {
    const w = 6;
    if (currentWidth + w > 12) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push({ field: f, width: w });
    currentWidth += w;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows;
}
