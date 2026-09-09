import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertTriangle, ChevronDown, ChevronRight, Edit3, RotateCcw, Filter, Sparkles, Link, Lock, Zap } from 'lucide-react';
import type { FieldMapping } from '../../types';

type FieldSourceType = 'ai' | 'mapped' | 'hardcoded' | 'function';

interface AiReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (editedData: string) => void;
  extractedData: string;
  confidenceScores?: Record<string, number>;
  formatType: 'JSON' | 'XML' | 'CSV';
  extractionTypeName: string;
  pdfFilename: string;
  pdfFile?: File;
  fieldMappings?: FieldMapping[];
}

interface FieldRow {
  path: string;
  key: string;
  value: any;
  depth: number;
  isArrayItem: boolean;
  arrayIndex?: number;
  parentPath: string;
  confidence?: number;
  sourceType?: FieldSourceType;
}

const FIELD_TYPE_CONFIG: Record<FieldSourceType, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  ai: {
    label: 'AI',
    color: 'text-sky-700 dark:text-white',
    bg: 'bg-sky-50 dark:bg-sky-700',
    border: 'border-sky-200 dark:border-sky-500',
    icon: <Sparkles className="h-3 w-3" />
  },
  mapped: {
    label: 'Mapped',
    color: 'text-amber-700 dark:text-white',
    bg: 'bg-amber-50 dark:bg-amber-700',
    border: 'border-amber-200 dark:border-amber-500',
    icon: <Link className="h-3 w-3" />
  },
  hardcoded: {
    label: 'Hardcode',
    color: 'text-gray-700 dark:text-white',
    bg: 'bg-gray-100 dark:bg-gray-600',
    border: 'border-gray-300 dark:border-gray-400',
    icon: <Lock className="h-3 w-3" />
  },
  function: {
    label: 'Function',
    color: 'text-teal-700 dark:text-white',
    bg: 'bg-teal-50 dark:bg-teal-700',
    border: 'border-teal-200 dark:border-teal-500',
    icon: <Zap className="h-3 w-3" />
  }
};

function getConfidenceColor(score: number): string {
  if (score >= 85) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getConfidenceBg(score: number): string {
  if (score >= 85) return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700';
  if (score >= 60) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700';
  return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700';
}

function getConfidenceBarColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function buildFieldTypeMap(fieldMappings?: FieldMapping[]): Map<string, FieldSourceType> {
  const map = new Map<string, FieldSourceType>();
  if (!fieldMappings) return map;
  for (const fm of fieldMappings) {
    if (fm.type === 'order_entry') continue;
    map.set(fm.fieldName, fm.type as FieldSourceType);
  }
  return map;
}

function resolveFieldSourceType(row: FieldRow, fieldTypeMap: Map<string, FieldSourceType>): FieldSourceType | undefined {
  const pathMatch = fieldTypeMap.get(row.path);
  if (pathMatch) return pathMatch;
  const pathWithoutIndices = row.path.replace(/\[\d+\]/g, '');
  const pathWithoutIndicesMatch = fieldTypeMap.get(pathWithoutIndices);
  if (pathWithoutIndicesMatch) return pathWithoutIndicesMatch;
  const directMatch = fieldTypeMap.get(row.key);
  if (directMatch) return directMatch;
  const topLevelKey = row.path.split('.')[0].replace(/\[\d+\]/, '');
  const topMatch = fieldTypeMap.get(topLevelKey);
  if (topMatch && row.depth === 0) return topMatch;
  return undefined;
}

function flattenJson(
  obj: any,
  parentPath: string = '',
  depth: number = 0,
  isArrayItem: boolean = false,
  arrayIndex?: number,
  confidenceScores?: Record<string, number>,
  fieldTypeMap?: Map<string, FieldSourceType>
): FieldRow[] {
  const rows: FieldRow[] = [];
  if (obj === null || obj === undefined) return rows;
  if (typeof obj !== 'object') return rows;

  const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v] as const) : Object.entries(obj);

  for (const [key, value] of entries) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key;
    const sourceType = fieldTypeMap?.get(currentPath) || fieldTypeMap?.get(key);

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      rows.push({
        path: currentPath, key, value: '{...}', depth, isArrayItem: false, parentPath,
        confidence: confidenceScores?.[key], sourceType
      });
      rows.push(...flattenJson(value, currentPath, depth + 1, false, undefined, confidenceScores, fieldTypeMap));
    } else if (Array.isArray(value)) {
      rows.push({
        path: currentPath, key, value: `[${value.length} items]`, depth, isArrayItem: false, parentPath,
        confidence: confidenceScores?.[key], sourceType
      });
      value.forEach((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          rows.push({
            path: `${currentPath}[${idx}]`, key: `[${idx}]`, value: '{...}', depth: depth + 1,
            isArrayItem: true, arrayIndex: idx, parentPath: currentPath
          });
          rows.push(...flattenJson(item, `${currentPath}[${idx}]`, depth + 2, true, idx, confidenceScores, fieldTypeMap));
        } else {
          rows.push({
            path: `${currentPath}[${idx}]`, key: `[${idx}]`, value: item, depth: depth + 1,
            isArrayItem: true, arrayIndex: idx, parentPath: currentPath,
            confidence: confidenceScores?.[key], sourceType
          });
        }
      });
    } else {
      rows.push({
        path: currentPath, key, value, depth, isArrayItem, arrayIndex, parentPath,
        confidence: confidenceScores?.[key], sourceType
      });
    }
  }
  return rows;
}

function setNestedValue(obj: any, path: string, value: any): any {
  const clone = JSON.parse(JSON.stringify(obj));
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const idx = Number(part);
    current = isNaN(idx) ? current[part] : current[idx];
  }
  const lastPart = parts[parts.length - 1];
  const lastIdx = Number(lastPart);
  if (isNaN(lastIdx)) {
    current[lastPart] = value;
  } else {
    current[lastIdx] = value;
  }
  return clone;
}

export default function AiReviewModal({
  isOpen,
  onClose,
  onConfirm,
  extractedData,
  confidenceScores,
  formatType,
  extractionTypeName,
  pdfFilename,
  pdfFile,
  fieldMappings
}: AiReviewModalProps) {
  const [jsonData, setJsonData] = useState<any>(null);
  const [rawText, setRawText] = useState('');
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [editCount, setEditCount] = useState(0);
  const [isRawMode, setIsRawMode] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FieldSourceType>>(new Set());

  const fieldTypeMap = useMemo(() => buildFieldTypeMap(fieldMappings), [fieldMappings]);

  useEffect(() => {
    if (!isOpen || !pdfFile) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      return;
    }
    const url = URL.createObjectURL(pdfFile);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isOpen, pdfFile]);

  useEffect(() => {
    if (!isOpen) return;
    if (formatType === 'JSON') {
      try {
        const parsed = JSON.parse(extractedData);
        setJsonData(parsed);
        setRawText(JSON.stringify(parsed, null, 2));
      } catch {
        setJsonData(null);
        setRawText(extractedData);
        setIsRawMode(true);
      }
    } else {
      setJsonData(null);
      setRawText(extractedData);
      setIsRawMode(true);
    }
    setEditingPath(null);
    setEditCount(0);
    setCollapsedPaths(new Set());
    setActiveFilters(new Set());
  }, [isOpen, extractedData, formatType]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const toggleCollapse = useCallback((path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const startEditing = useCallback((path: string, currentValue: any) => {
    setEditingPath(path);
    setEditValue(currentValue === null || currentValue === undefined ? '' : String(currentValue));
  }, []);

  const saveEdit = useCallback((path: string, originalValue: any) => {
    if (jsonData === null) return;
    let newValue: any = editValue;
    if (typeof originalValue === 'number') {
      const num = Number(editValue);
      if (!isNaN(num)) newValue = num;
    } else if (typeof originalValue === 'boolean') {
      newValue = editValue.toLowerCase() === 'true';
    }
    const updated = setNestedValue(jsonData, path, newValue);
    setJsonData(updated);
    setRawText(JSON.stringify(updated, null, 2));
    setEditingPath(null);
    setEditCount(prev => prev + 1);
  }, [jsonData, editValue]);

  const handleConfirm = useCallback(() => {
    if (isRawMode) {
      onConfirm(rawText);
    } else {
      onConfirm(JSON.stringify(jsonData));
    }
  }, [isRawMode, rawText, jsonData, onConfirm]);

  const handleReset = useCallback(() => {
    if (formatType === 'JSON') {
      try {
        const parsed = JSON.parse(extractedData);
        setJsonData(parsed);
        setRawText(JSON.stringify(parsed, null, 2));
      } catch {
        setRawText(extractedData);
      }
    } else {
      setRawText(extractedData);
    }
    setEditCount(0);
    setEditingPath(null);
  }, [extractedData, formatType]);

  const toggleFilter = useCallback((type: FieldSourceType) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const isLeaf = useCallback((row: FieldRow) => {
    return typeof row.value !== 'string' || (!row.value.startsWith('{') && !row.value.startsWith('['));
  }, []);

  const rows = useMemo(() => {
    return jsonData ? flattenJson(jsonData, '', 0, false, undefined, confidenceScores, fieldTypeMap) : [];
  }, [jsonData, confidenceScores, fieldTypeMap]);

  const rowsWithResolved = useMemo(() => {
    return rows.map(row => ({
      ...row,
      sourceType: row.sourceType || resolveFieldSourceType(row, fieldTypeMap)
    }));
  }, [rows, fieldTypeMap]);

  const typeCounts = useMemo(() => {
    const counts: Record<FieldSourceType, number> = { ai: 0, mapped: 0, hardcoded: 0, function: 0 };
    for (const row of rowsWithResolved) {
      if (isLeaf(row) && row.sourceType) {
        counts[row.sourceType]++;
      }
    }
    return counts;
  }, [rowsWithResolved, isLeaf]);

  if (!isOpen) return null;

  const isPathCollapsed = (path: string) => {
    for (const cp of collapsedPaths) {
      if (path.startsWith(cp + '.') || path.startsWith(cp + '[')) return true;
    }
    return false;
  };

  const hasActiveFilters = activeFilters.size > 0;

  const shouldShowRow = (row: FieldRow & { sourceType?: FieldSourceType }) => {
    if (!hasActiveFilters) return true;
    if (!isLeaf(row)) return true;
    return row.sourceType !== undefined && activeFilters.has(row.sourceType);
  };

  const visibleRows = rowsWithResolved
    .filter(row => !isPathCollapsed(row.path))
    .filter(shouldShowRow);

  const hasConfidence = confidenceScores && Object.keys(confidenceScores).length > 0;
  const lowConfidenceCount = hasConfidence
    ? Object.values(confidenceScores!).filter(s => s < 60).length
    : 0;

  const hasMappings = fieldTypeMap.size > 0;

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex flex-col">
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-teal-600 to-cyan-600 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-white">Review Extracted Data</h3>
            <p className="text-teal-100 text-sm mt-0.5">
              {extractionTypeName} &mdash; {pdfFilename}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Main Content - Split View */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - PDF Viewer */}
          <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 flex flex-col">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <svg className="h-16 w-16 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">PDF preview not available</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Field Review */}
          <div className="w-1/2 flex flex-col bg-white dark:bg-gray-800 min-h-0">
            {/* Status & Filter Bar */}
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 text-sm">
                  {editCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Edit3 className="h-3.5 w-3.5" />
                      {editCount} edit{editCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {hasConfidence && lowConfidenceCount > 0 && (
                    <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {lowConfidenceCount} low confidence
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isRawMode && jsonData && (
                    <button
                      onClick={() => setIsRawMode(true)}
                      className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      Raw JSON
                    </button>
                  )}
                  {isRawMode && jsonData && (
                    <button
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(rawText);
                          setJsonData(parsed);
                          setIsRawMode(false);
                        } catch { /* stay in raw mode */ }
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      Field View
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                </div>
              </div>

              {/* Type Filter Buttons */}
              {hasMappings && !isRawMode && (
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 mr-0.5" />
                  {(Object.keys(FIELD_TYPE_CONFIG) as FieldSourceType[]).map(type => {
                    const config = FIELD_TYPE_CONFIG[type];
                    const count = typeCounts[type];
                    if (count === 0) return null;
                    const isActive = activeFilters.has(type);
                    return (
                      <button
                        key={type}
                        onClick={() => toggleFilter(type)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-all ${
                          isActive
                            ? `${config.bg} ${config.color} ${config.border} ring-2 ring-current/30 shadow-sm`
                            : hasActiveFilters
                              ? 'bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-400 border-gray-200 dark:border-gray-500 opacity-50 hover:opacity-100'
                              : `${config.bg} ${config.color} ${config.border} hover:shadow-sm`
                        }`}
                      >
                        {config.icon}
                        {config.label}
                        <span className="text-[10px] opacity-70">({count})</span>
                      </button>
                    );
                  })}
                  {hasActiveFilters && (
                    <button
                      onClick={() => setActiveFilters(new Set())}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Field Content */}
            <div className="flex-1 overflow-y-auto">
              {isRawMode ? (
                <textarea
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                    setEditCount(prev => prev + 1);
                  }}
                  className="w-full h-full min-h-[400px] font-mono text-sm p-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none border-0"
                  spellCheck={false}
                />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {visibleRows.map((row) => {
                    const isCollapsible = row.value === '{...}' || (typeof row.value === 'string' && row.value.match(/^\[\d+ items?\]$/));
                    const isCollapsed = collapsedPaths.has(row.path);
                    const isEditing = editingPath === row.path;
                    const isLeafNode = isLeaf(row);
                    const typeConfig = row.sourceType ? FIELD_TYPE_CONFIG[row.sourceType] : null;

                    return (
                      <div
                        key={row.path}
                        className={`flex items-center gap-2 py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                          row.confidence !== undefined && row.confidence < 60
                            ? 'bg-red-50/50 dark:bg-red-900/10'
                            : ''
                        }`}
                        style={{ paddingLeft: `${row.depth * 20 + 12}px` }}
                      >
                        <div className="w-4 flex-shrink-0">
                          {isCollapsible && (
                            <button
                              onClick={() => toggleCollapse(row.path)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>

                        <span className={`font-mono text-sm flex-shrink-0 min-w-[120px] ${
                          row.isArrayItem ? 'text-gray-400 dark:text-gray-500' : 'text-teal-700 dark:text-teal-400 font-medium'
                        }`}>
                          {row.key}
                        </span>

                        {/* Field Type Badge */}
                        {typeConfig && isLeafNode && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${typeConfig.bg} ${typeConfig.color} ${typeConfig.border} border flex-shrink-0 uppercase tracking-wider`}>
                            {typeConfig.icon}
                            {typeConfig.label}
                          </span>
                        )}

                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit(row.path, row.value);
                                  if (e.key === 'Escape') setEditingPath(null);
                                }}
                                className="flex-1 px-2 py-1 font-mono text-sm border border-teal-400 dark:border-teal-500 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                              />
                              <button
                                onClick={() => saveEdit(row.path, row.value)}
                                className="p-1 text-teal-600 hover:text-teal-700 dark:text-teal-400"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditingPath(null)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : isLeafNode ? (
                            <span
                              onClick={() => startEditing(row.path, row.value)}
                              className={`font-mono text-sm cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 px-2 py-0.5 rounded transition-colors truncate block ${
                                row.value === '' || row.value === null
                                  ? 'text-gray-400 italic'
                                  : typeof row.value === 'number'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : typeof row.value === 'boolean'
                                      ? 'text-orange-600 dark:text-orange-400'
                                      : 'text-gray-900 dark:text-gray-100'
                              }`}
                              title="Click to edit"
                            >
                              {row.value === '' ? '(empty)' : row.value === null ? 'null' : String(row.value)}
                            </span>
                          ) : (
                            <span className="font-mono text-sm text-gray-400 dark:text-gray-500">
                              {row.value}
                            </span>
                          )}
                        </div>

                        {row.confidence !== undefined && isLeafNode && (
                          <div className={`flex items-center gap-1.5 flex-shrink-0 px-2 py-0.5 rounded-full border text-xs font-medium ${getConfidenceBg(row.confidence)}`}>
                            <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${getConfidenceBarColor(row.confidence)}`}
                                style={{ width: `${row.confidence}%` }}
                              />
                            </div>
                            <span className={getConfidenceColor(row.confidence)}>
                              {row.confidence}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-750 flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Click any value to edit
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Check className="h-4 w-4" />
                  Confirm & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
