import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, ChevronDown, ChevronRight, Pencil, RotateCcw, Loader2, Clock, Mail, Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Sparkles, Link, Lock, Zap, GitCompare, Eye, LayoutGrid, SkipForward } from 'lucide-react';
import { getInboxItemById, resolveInboxItem, type InboxItem, type ChangeLogEntry } from '../services/inboxService';
import { reviewSetupService, type LoadedReviewTemplate } from '../services/reviewSetupService';
import InboxReviewFormView from './InboxReviewFormView';
import { supabase } from '../lib/supabase';
import type { User, InboxReviewField, InboxReviewVisibilityCondition } from '../types';

interface InboxReviewPageProps {
  currentUser?: User;
}

type FieldSourceType = 'ai' | 'mapped' | 'hardcoded' | 'function';

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

function flattenJson(
  obj: any,
  parentPath: string = '',
  depth: number = 0,
  isArrayItem: boolean = false,
  arrayIndex?: number,
): FieldRow[] {
  const rows: FieldRow[] = [];
  if (obj === null || obj === undefined) return rows;
  if (typeof obj !== 'object') return rows;

  const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v] as const) : Object.entries(obj);

  for (const [key, value] of entries) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      rows.push({ path: currentPath, key, value: '{...}', depth, isArrayItem: false, parentPath });
      rows.push(...flattenJson(value, currentPath, depth + 1, false, undefined));
    } else if (Array.isArray(value)) {
      rows.push({ path: currentPath, key, value: `[${value.length} items]`, depth, isArrayItem: false, parentPath });
      value.forEach((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          rows.push({ path: `${currentPath}[${idx}]`, key: `[${idx}]`, value: '{...}', depth: depth + 1, isArrayItem: true, arrayIndex: idx, parentPath: currentPath });
          rows.push(...flattenJson(item, `${currentPath}[${idx}]`, depth + 2, true, idx));
        } else {
          rows.push({ path: `${currentPath}[${idx}]`, key: `[${idx}]`, value: item, depth: depth + 1, isArrayItem: true, arrayIndex: idx, parentPath: currentPath });
        }
      });
    } else {
      rows.push({ path: currentPath, key, value, depth, isArrayItem, arrayIndex, parentPath });
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

function getValueByPath(obj: any, path: string): any {
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

export default function InboxReviewPage({ currentUser }: InboxReviewPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jsonData, setJsonData] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null);
  const [rawText, setRawText] = useState('');
  const [isRawMode, setIsRawMode] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editCount, setEditCount] = useState(0);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [resolving, setResolving] = useState(false);
  const [resolveAction, setResolveAction] = useState<'accept' | 'reject' | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [resolveSuccess, setResolveSuccess] = useState<string | null>(null);
  const [showDiffView, setShowDiffView] = useState(false);

  const [reviewTemplate, setReviewTemplate] = useState<LoadedReviewTemplate | null>(null);
  const [viewMode, setViewMode] = useState<'field' | 'form' | 'raw'>('field');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    loadItem(id);
  }, [id]);

  const loadItem = async (itemId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInboxItemById(itemId);
      if (!data) {
        setError('Inbox item not found');
        return;
      }
      setItem(data);

      const extractedData = data.extracted_data || data.context_data?.extractedData || {};
      const workingData = data.status === 'accepted' && data.edited_data ? data.edited_data : extractedData;
      setJsonData(workingData);
      setOriginalData(data.original_extracted_data || extractedData);
      setRawText(JSON.stringify(workingData, null, 2));
      if (data.status === 'accepted' && data.has_edits) setShowDiffView(true);

      if (data.extraction_type_id) {
        try {
          const tmpl = await reviewSetupService.loadTemplateByExtractionType(data.extraction_type_id);
          setReviewTemplate(tmpl);
          if (tmpl) setViewMode('form');
        } catch { /* fallback to field view */ }
      }

      if (data.pdf_storage_path) {
        loadPdf(data.pdf_storage_path);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load inbox item');
    } finally {
      setLoading(false);
    }
  };

  const loadPdf = async (storagePath: string) => {
    setPdfLoading(true);
    try {
      const { data, error: storageError } = await supabase.storage
        .from('pdfs')
        .createSignedUrl(storagePath, 3600);

      if (storageError) {
        console.error('Failed to load PDF:', storageError);
        return;
      }
      if (data?.signedUrl) {
        setPdfUrl(data.signedUrl);
      }
    } catch (err) {
      console.error('Failed to load PDF from storage:', err);
    } finally {
      setPdfLoading(false);
    }
  };

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

  const handleReset = useCallback(() => {
    if (originalData) {
      setJsonData(JSON.parse(JSON.stringify(originalData)));
      setRawText(JSON.stringify(originalData, null, 2));
      setEditCount(0);
      setEditingPath(null);
    }
  }, [originalData]);

  const validateFormFields = useCallback((): boolean => {
    if (!reviewTemplate || viewMode !== 'form') return true;
    const errs: Record<string, string> = {};
    for (const field of reviewTemplate.fields) {
      if (!field.isVisible) continue;
      if (field.visibilityCondition) {
        const cond = field.visibilityCondition;
        const condVal = getValueByPath(jsonData, cond.fieldJsonPath);
        const condStr = condVal != null ? String(condVal) : '';
        let visible = true;
        switch (cond.operator) {
          case 'equals': visible = condStr === (cond.value || ''); break;
          case 'not_equals': visible = condStr !== (cond.value || ''); break;
          case 'contains': visible = condStr.toLowerCase().includes((cond.value || '').toLowerCase()); break;
          case 'not_empty': visible = condVal !== null && condVal !== undefined && condStr !== ''; break;
          case 'empty': visible = condVal === null || condVal === undefined || condStr === ''; break;
        }
        if (!visible) continue;
      }
      const group = reviewTemplate.groups.find(g => g.id === field.groupId);
      if (group?.isArrayGroup) continue;
      const val = getValueByPath(jsonData, field.jsonPath);
      if (field.isRequired && (val === undefined || val === null || val === '')) {
        errs[field.jsonPath] = `${field.fieldLabel} is required`;
      }
      if (field.validationRegex && val != null && String(val)) {
        try {
          const re = new RegExp(field.validationRegex);
          if (!re.test(String(val))) {
            errs[field.jsonPath] = `Invalid format`;
          }
        } catch { /* skip invalid regex */ }
      }
      if (field.maxLength && val != null && String(val).length > field.maxLength) {
        errs[field.jsonPath] = `Maximum ${field.maxLength} characters`;
      }
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }, [reviewTemplate, viewMode, jsonData]);

  const handleFormFieldChange = useCallback((jsonPath: string, value: any) => {
    setJsonData((prev: any) => {
      return setNestedValue(prev, jsonPath, value);
    });
    setFormErrors((prev) => {
      if (!prev[jsonPath]) return prev;
      const next = { ...prev };
      delete next[jsonPath];
      return next;
    });
    setEditCount((c: number) => c + 1);
  }, []);

  const handleAccept = async (loadNext = false) => {
    if (!item || !id) return;
    if (!validateFormFields()) return;
    setResolving(true);
    setResolveAction('accept');
    try {
      const changeLog: ChangeLogEntry[] = diffEntries.map((entry) => ({
        path: entry.path,
        label: getFieldLabel(entry.path),
        oldValue: entry.original ?? null,
        newValue: entry.current ?? null,
      }));
      await resolveInboxItem(id, 'accept', jsonData, undefined, currentUser?.id, changeLog);
      window.dispatchEvent(new Event('inbox-changed'));
      if (loadNext) {
        const { data: nextItems } = await supabase
          .from('inbox_items')
          .select('id')
          .in('status', ['pending', 'failed'])
          .neq('id', id)
          .order('created_at', { ascending: true })
          .limit(1);
        if (nextItems && nextItems.length > 0) {
          navigate(`/inbox/${nextItems[0].id}`, { replace: true });
          return;
        }
      }
      setResolveSuccess('accepted');
    } catch (err: any) {
      setError(err.message || 'Failed to accept item');
    } finally {
      setResolving(false);
    }
  };

  const handleReject = async () => {
    if (!item || !id) return;
    setResolving(true);
    setResolveAction('reject');
    try {
      await resolveInboxItem(id, 'reject', undefined, rejectNotes || undefined, currentUser?.id);
      setResolveSuccess('rejected');
      window.dispatchEvent(new Event('inbox-changed'));
      setShowRejectModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to reject item');
    } finally {
      setResolving(false);
    }
  };

  const isLeaf = useCallback((row: FieldRow) => {
    return typeof row.value !== 'string' || (!row.value.startsWith('{') && !row.value.startsWith('['));
  }, []);

  const rows = useMemo(() => {
    return jsonData ? flattenJson(jsonData) : [];
  }, [jsonData]);

  const getNestedValue = useCallback((obj: any, path: string): any => {
    if (!obj) return undefined;
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      const idx = Number(part);
      current = isNaN(idx) ? current[part] : current[idx];
    }
    return current;
  }, []);

  const changedFields = useMemo(() => {
    if (!originalData || !jsonData) return new Set<string>();
    const changed = new Set<string>();
    const checkRows = flattenJson(jsonData);
    for (const row of checkRows) {
      if (row.value === '{...}' || (typeof row.value === 'string' && row.value.match(/^\[\d+ items?\]$/))) continue;
      const originalVal = getNestedValue(originalData, row.path);
      if (String(row.value) !== String(originalVal)) {
        changed.add(row.path);
      }
    }
    return changed;
  }, [originalData, jsonData, getNestedValue]);

  const getFieldLabel = useCallback((path: string): string => {
    const normalized = path.replace(/\[\d+\]/g, '');
    if (reviewTemplate) {
      const field = reviewTemplate.fields.find(f => {
        if (f.jsonPath === path) return true;
        const fp = f.jsonPath.replace(/\[\d+\]/g, '').replace(/\[\]/g, '');
        return fp === normalized;
      });
      if (field) return field.fieldLabel;
    }
    return path.split('.').pop() || path;
  }, [reviewTemplate]);

  const diffEntries = useMemo(() => {
    if (!originalData || !jsonData) return [];
    const entries: { path: string; original: any; current: any }[] = [];
    for (const path of changedFields) {
      entries.push({
        path,
        original: getNestedValue(originalData, path),
        current: getNestedValue(jsonData, path),
      });
    }
    return entries;
  }, [changedFields, originalData, jsonData, getNestedValue]);

  const isPathCollapsed = (path: string) => {
    for (const cp of collapsedPaths) {
      if (path.startsWith(cp + '.') || path.startsWith(cp + '[')) return true;
    }
    return false;
  };

  const visibleRows = rows.filter(row => !isPathCollapsed(row.path));

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => navigate('/inbox')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Inbox
        </button>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (resolveSuccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className={`rounded-xl p-8 text-center border ${
          resolveSuccess === 'accepted'
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          {resolveSuccess === 'accepted' ? (
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
          ) : (
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          )}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Item {resolveSuccess === 'accepted' ? 'Accepted' : 'Rejected'}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {resolveSuccess === 'accepted'
              ? 'The workflow will now continue processing with the reviewed data.'
              : 'The item has been rejected and the workflow has been stopped.'}
          </p>
          <button
            onClick={() => navigate('/inbox')}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
          >
            Back to Inbox
          </button>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const isResolved = item.status === 'accepted' || item.status === 'rejected';

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-600 to-orange-600 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inbox')}
            className="text-white/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-white whitespace-nowrap">
              Review: {item.extraction_type_name || 'Inbox Item'}
            </h3>
            <span className="text-amber-200/60">|</span>
            <div className="flex items-center gap-3 text-amber-100 text-sm">
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {item.pdf_filename || item.original_pdf_filename || 'No file'}
              </span>
              {item.trigger_source === 'email_monitoring' && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {item.sender_email || 'Email'}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(item.created_at)}
              </span>
            </div>
          </div>
        </div>

        {isResolved && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
            item.status === 'accepted'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {item.status === 'accepted' ? 'Accepted' : 'Rejected'}
            {item.resolved_at && ` - ${formatDate(item.resolved_at)}`}
          </div>
        )}
        {item.status === 'failed' && (
          <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            Failed{item.failure_reason ? ` - ${item.failure_reason}` : ''}
          </div>
        )}
        {isResolved && item.resolution_notes && (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic max-w-xs truncate" title={item.resolution_notes}>
            Note: {item.resolution_notes}
          </div>
        )}
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - PDF Viewer */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 flex flex-col">
          {pdfLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-3 opacity-40" />
                <p className="text-sm">PDF preview not available</p>
                <p className="text-xs mt-1 text-gray-400">The original document was not stored with this item</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Field Review */}
        <div className="w-1/2 flex flex-col bg-white dark:bg-gray-800 min-h-0">
          {/* Status & Actions Bar */}
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                {editCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Pencil className="h-3.5 w-3.5" />
                    {editCount} edit{editCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {jsonData && (
                  <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                    <button
                      onClick={() => {
                        if (isRawMode) {
                          try {
                            const parsed = JSON.parse(rawText);
                            setJsonData(parsed);
                          } catch { /* keep current data */ }
                        }
                        setIsRawMode(false);
                        setViewMode('field');
                      }}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        !isRawMode && viewMode === 'field'
                          ? 'bg-blue-600 dark:bg-blue-500 text-white dark:text-white'
                          : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      <Eye className="h-3 w-3 inline mr-1" />
                      Fields
                    </button>
                    {reviewTemplate && (
                      <button
                        onClick={() => {
                          if (isRawMode) {
                            try {
                              const parsed = JSON.parse(rawText);
                              setJsonData(parsed);
                            } catch { /* keep current data */ }
                          }
                          setIsRawMode(false);
                          setViewMode('form');
                        }}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                          !isRawMode && viewMode === 'form'
                            ? 'bg-blue-600 dark:bg-blue-500 text-white dark:text-white'
                            : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        <LayoutGrid className="h-3 w-3 inline mr-1" />
                        Form
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsRawMode(true);
                        setRawText(JSON.stringify(jsonData, null, 2));
                      }}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                        isRawMode
                          ? 'bg-blue-600 dark:bg-blue-500 text-white dark:text-white'
                          : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      Raw
                    </button>
                  </div>
                )}
                {!isResolved && (
                  <button
                    onClick={handleReset}
                    className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
                <button
                  onClick={() => setShowDiffView(!showDiffView)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                    showDiffView
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                      : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                  title={changedFields.size > 0 ? `${changedFields.size} field(s) changed` : 'No changes yet'}
                >
                  <GitCompare className="h-3 w-3" />
                  Changes{changedFields.size > 0 && ` (${changedFields.size})`}
                </button>
                {!isResolved && (
                  <>
                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                    <button
                      onClick={() => setShowRejectModal(true)}
                      disabled={resolving}
                      className="px-3 py-1 text-xs font-medium text-white bg-red-600 border border-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleAccept(false)}
                      disabled={resolving}
                      className="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                    >
                      {resolving && resolveAction === 'accept' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Accept
                    </button>
                    <button
                      onClick={() => handleAccept(true)}
                      disabled={resolving}
                      className="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                    >
                      {resolving && resolveAction === 'accept' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <SkipForward className="h-3.5 w-3.5" />
                      )}
                      Accept / Next
                    </button>
                  </>
                )}
              </div>
            </div>
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
                readOnly={isResolved}
                className="w-full h-full min-h-[400px] font-mono text-sm p-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none border-0"
                spellCheck={false}
              />
            ) : viewMode === 'form' && reviewTemplate ? (
              <>
                {showDiffView && diffEntries.length > 0 && (
                  <div className="border-b border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <GitCompare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {diffEntries.length} field{diffEntries.length !== 1 ? 's' : ''} changed from original
                      </span>
                    </div>
                  </div>
                )}
                {showDiffView && diffEntries.length === 0 && (
                  <div className="border-b border-gray-200 dark:border-gray-700 bg-green-50/50 dark:bg-green-900/10 p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-700 dark:text-green-300">
                        No changes made — data matches original extraction
                      </span>
                    </div>
                  </div>
                )}
                {Object.keys(formErrors).length > 0 && (
                  <div className="border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
                        {Object.keys(formErrors).length} validation error{Object.keys(formErrors).length !== 1 ? 's' : ''} — please fix before accepting
                      </span>
                    </div>
                  </div>
                )}
                <InboxReviewFormView
                  groups={reviewTemplate.groups}
                  fields={reviewTemplate.fields}
                  layouts={reviewTemplate.layouts}
                  jsonData={jsonData}
                  onFieldChange={handleFormFieldChange}
                  errors={formErrors}
                  readOnly={isResolved}
                  changedFields={changedFields}
                  showChanges={showDiffView}
                />
              </>
            ) : (
              <>
                {showDiffView && diffEntries.length > 0 && (
                  <div className="border-b border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <GitCompare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {diffEntries.length} field{diffEntries.length !== 1 ? 's' : ''} changed from original
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {diffEntries.map((entry) => (
                        <div key={entry.path} className="flex items-start gap-2 text-xs bg-white dark:bg-gray-800 rounded p-2 border border-amber-200 dark:border-amber-800">
                          <span className="font-medium text-gray-700 dark:text-gray-300 shrink-0 min-w-[120px]" title={entry.path}>{getFieldLabel(entry.path)}</span>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                              <span className="text-red-600 dark:text-red-400 line-through truncate">{String(entry.original ?? '(empty)')}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"></span>
                              <span className="text-green-600 dark:text-green-400 truncate">{String(entry.current ?? '(empty)')}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {showDiffView && diffEntries.length === 0 && (
                  <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">No changes made - data matches the original</span>
                    </div>
                  </div>
                )}
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {visibleRows.map((row) => {
                  const isCollapsible = row.value === '{...}' || (typeof row.value === 'string' && row.value.match(/^\[\d+ items?\]$/));
                  const isCollapsed = collapsedPaths.has(row.path);
                  const isEditing = editingPath === row.path;
                  const isLeafNode = isLeaf(row);
                  const isChanged = changedFields.has(row.path);

                  return (
                    <div
                      key={row.path}
                      className={`flex items-center gap-2 py-2 px-3 transition-colors ${
                        isChanged && showDiffView
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-400 dark:border-amber-600'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
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
                        row.isArrayItem ? 'text-gray-400 dark:text-gray-500' : 'text-amber-700 dark:text-amber-400 font-medium'
                      }`}>
                        {row.key}
                      </span>

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
                              className="flex-1 px-2 py-1 font-mono text-sm border border-amber-400 dark:border-amber-500 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                            <button
                              onClick={() => saveEdit(row.path, row.value)}
                              className="p-1 text-amber-600 hover:text-amber-700 dark:text-amber-400"
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
                            onClick={() => !isResolved && startEditing(row.path, row.value)}
                            className={`font-mono text-sm px-2 py-0.5 rounded transition-colors truncate block ${
                              isResolved ? 'cursor-default' : 'cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            } ${
                              row.value === '' || row.value === null
                                ? 'text-gray-400 italic'
                                : typeof row.value === 'number'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : typeof row.value === 'boolean'
                                    ? 'text-orange-600 dark:text-orange-400'
                                    : 'text-gray-900 dark:text-gray-100'
                            }`}
                            title={isResolved ? undefined : 'Click to edit'}
                          >
                            {row.value === '' ? '(empty)' : row.value === null ? 'null' : String(row.value)}
                          </span>
                        ) : (
                          <span className="font-mono text-sm text-gray-400 dark:text-gray-500">
                            {row.value}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleRows.length === 0 && (
                  <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                    <p className="text-sm">No data to display</p>
                  </div>
                )}
              </div>
              </>
            )}
          </div>

          {/* Resolution info for already-resolved items */}
          {isResolved && item.resolution_notes && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium">Notes:</span> {item.resolution_notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-2 text-sm text-red-700 dark:text-red-300 flex items-center gap-2 shadow-lg">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Reject Item</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Rejecting will stop the workflow from continuing. Optionally add a note explaining why.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (optional)..."
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm mb-4 focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={resolving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={resolving}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {resolving && resolveAction === 'reject' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
