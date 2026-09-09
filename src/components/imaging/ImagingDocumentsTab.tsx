import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, Loader2, FileText, Trash2, Eye, X, RefreshCw, Upload, CheckCircle2, AlertTriangle, Clock, Layers, Play, Zap, RotateCcw } from 'lucide-react';
import type { ImagingBucket, ImagingDocumentType, ImagingDocument, ImagingMetadataField, WorkflowV2 } from '../../types';
import {
  fetchBuckets,
  fetchDocumentTypes,
  fetchDocuments,
  deleteDocument,
  fetchMetadataFields,
  fetchBulkDocumentMetadata,
  searchDocumentsByMetadata,
  refreshDocumentProcessingStatus,
  runWorkflowV2ForImagingDocument,
  runAutoWorkflowForImagingDocument,
  retryEpdfConversion,
} from '../../services/imagingService';
import { fetchWorkflowsV2 } from '../../services/workflowV2Service';
import ImagingViewerModal from './ImagingViewerModal';
import ImagingUploadModal from './ImagingUploadModal';
import ImagingBatchUploadModal from './ImagingBatchUploadModal';
import CustomDropdown from '../common/CustomDropdown';
import ImagingFilterModal from './ImagingFilterModal';

interface ImagingDocumentsTabProps {
  isAdmin: boolean;
  canDeleteImaging?: boolean;
  canRerunImagingWorkflow?: boolean;
  canRetryEpdf?: boolean;
}

export default function ImagingDocumentsTab({ isAdmin, canDeleteImaging = false, canRerunImagingWorkflow = false, canRetryEpdf = false }: ImagingDocumentsTabProps) {
  const canDelete = isAdmin || canDeleteImaging;
  const canRerun = isAdmin || canRerunImagingWorkflow;
  const canRetry = isAdmin || canRetryEpdf;
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const [documents, setDocuments] = useState<ImagingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filterBucket, setFilterBucket] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [metadataFields, setMetadataFields] = useState<ImagingMetadataField[]>([]);
  const [metadataFilters, setMetadataFilters] = useState<Record<string, string>>({});
  const [pinnedFieldValues, setPinnedFieldValues] = useState<Record<string, string>>({});
  const [docMetadata, setDocMetadata] = useState<Record<string, Record<string, string>>>({});
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [viewingDoc, setViewingDoc] = useState<ImagingDocument | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imagingWorkflows, setImagingWorkflows] = useState<WorkflowV2[]>([]);
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [rerunWorkflowId, setRerunWorkflowId] = useState('');
  const [rerunning, setRerunning] = useState(false);
  const [rerunResult, setRerunResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [autoRerunning, setAutoRerunning] = useState(false);
  const [autoRerunResult, setAutoRerunResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [rerunProgress, setRerunProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoRerunProgress, setAutoRerunProgress] = useState<{ current: number; total: number } | null>(null);

  const pinnedFields = metadataFields.filter(f => f.isActive && f.isPinnedToHeader);
  const activeFilterCount = Object.values(metadataFilters).filter(v => v.trim()).length;
  const pinnedFilterCount = Object.values(pinnedFieldValues).filter(v => v.trim()).length;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const defaultAppliedRef = useRef(false);

  const loadFilters = useCallback(async () => {
    try {
      const [b, d, mf, wf] = await Promise.all([
        fetchBuckets(),
        fetchDocumentTypes(),
        fetchMetadataFields(),
        fetchWorkflowsV2().catch(() => [] as WorkflowV2[]),
      ]);
      setBuckets(b);
      setDocTypes(d);
      setMetadataFields(mf);
      setImagingWorkflows(wf.filter(w => w.isActive && w.workflowType === 'imaging'));
      if (!defaultAppliedRef.current) {
        const defaultBucket = b.find(bucket => bucket.isDefault);
        if (defaultBucket) {
          setFilterBucket(defaultBucket.id);
        }
        defaultAppliedRef.current = true;
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const allMetaFilters: Record<string, string> = { ...metadataFilters };
      Object.entries(pinnedFieldValues).forEach(([k, v]) => {
        if (v.trim()) allMetaFilters[k] = v;
      });

      const hasMetaFilters = Object.values(allMetaFilters).some(v => v.trim());

      let docs: ImagingDocument[];
      if (hasMetaFilters) {
        docs = await searchDocumentsByMetadata({
          bucketId: filterBucket || undefined,
          documentTypeId: filterDocType || undefined,
          search: debouncedSearch || undefined,
          metadataFilters: allMetaFilters,
        });
      } else {
        docs = await fetchDocuments({
          bucketId: filterBucket || undefined,
          documentTypeId: filterDocType || undefined,
          search: debouncedSearch || undefined,
        });
      }
      setDocuments(docs);

      if (docs.length > 0 && metadataFields.length > 0) {
        const meta = await fetchBulkDocumentMetadata(docs.map(d => d.id));
        setDocMetadata(meta);
      } else {
        setDocMetadata({});
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterBucket, filterDocType, debouncedSearch, metadataFilters, pinnedFieldValues, metadataFields.length]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const processingIds = documents.filter(d => d.processingStatus === 'processing').map(d => d.id);
    if (processingIds.length === 0) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }

    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      const currentProcessing = documents.filter(d => d.processingStatus === 'processing').map(d => d.id);
      if (currentProcessing.length === 0) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        return;
      }
      const statuses = await refreshDocumentProcessingStatus(currentProcessing);
      setDocuments(prev => prev.map(doc => {
        const updated = statuses[doc.id];
        if (updated && updated.status !== doc.processingStatus) {
          return { ...doc, processingStatus: updated.status as ImagingDocument['processingStatus'], epdfStoragePath: updated.epdfStoragePath };
        }
        return doc;
      }));
    }, 5000);

    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [documents]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDocuments();
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filterBucket, filterDocType, debouncedSearch, metadataFilters, pinnedFieldValues]);

  const toggleRowSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleIds = documents.map(d => d.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  const openRerunModal = () => {
    setRerunWorkflowId(imagingWorkflows.length === 1 ? imagingWorkflows[0].id : '');
    setRerunResult(null);
    setShowRerunModal(true);
  };

  const handleRerunWorkflow = async () => {
    if (!rerunWorkflowId) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setRerunning(true);
    setRerunResult(null);
    setRerunProgress({ current: 0, total: ids.length });

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        await runWorkflowV2ForImagingDocument(rerunWorkflowId, id);
        success++;
      } catch (err: any) {
        const doc = documents.find(d => d.id === id);
        const label = doc?.originalFilename || doc?.storagePath || id;
        errors.push(`${label}: ${err?.message || 'Failed to run workflow'}`);
      }
      setRerunProgress({ current: i + 1, total: ids.length });
    }

    setRerunning(false);
    setRerunProgress(null);
    setRerunResult({ success, failed: errors.length, errors });
    if (errors.length === 0) {
      setSelectedIds(new Set());
    }
  };

  const handleRerunAutoWorkflow = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setAutoRerunning(true);
    setAutoRerunResult(null);
    setAutoRerunProgress({ current: 0, total: ids.length });

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        await runAutoWorkflowForImagingDocument(id);
        success++;
      } catch (err: any) {
        const doc = documents.find(d => d.id === id);
        const label = doc?.originalFilename || doc?.storagePath || id;
        errors.push(`${label}: ${err?.message || 'Failed to run auto workflow'}`);
      }
      setAutoRerunProgress({ current: i + 1, total: ids.length });
    }

    setAutoRerunning(false);
    setAutoRerunProgress(null);
    setAutoRerunResult({ success, failed: errors.length, errors });
    setSelectedIds(new Set());
    loadDocuments();
    if (errors.length === 0) {
      window.setTimeout(() => setAutoRerunResult(null), 4000);
    }
  };

  const closeRerunModal = () => {
    if (rerunning) return;
    setShowRerunModal(false);
    setRerunWorkflowId('');
    setRerunResult(null);
  };

  const handleApplyMetadataFilters = (filters: Record<string, string>) => {
    setMetadataFilters(filters);
    setLoading(true);
  };

  const handlePinnedFieldChange = (fieldId: string, value: string) => {
    setPinnedFieldValues(prev => ({ ...prev, [fieldId]: value }));
    setLoading(true);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const pinnedColumnsFields = metadataFields.filter(f => f.isActive && f.isPinnedToHeader);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center space-x-2 flex-1">
            <Filter className="h-4 w-4 text-gray-400" />
            <CustomDropdown
              value={filterBucket}
              onChange={(val) => { setFilterBucket(val); setLoading(true); }}
              placeholder="All Buckets"
              options={buckets.map(b => ({ value: b.id, label: b.name }))}
            />
            <CustomDropdown
              value={filterDocType}
              onChange={(val) => { setFilterDocType(val); setLoading(true); }}
              placeholder="All Document Types"
              options={docTypes.map(d => ({ value: d.id, label: d.name }))}
            />
          </div>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {metadataFields.filter(f => f.isActive).length > 0 && (
              <button
                onClick={() => setShowFilterModal(true)}
                className={`relative flex items-center space-x-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeFilterCount > 0
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-900/60'
                    : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <Filter className="h-4 w-4" />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full min-w-[18px] text-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowBatchUploadModal(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Layers className="h-4 w-4" />
              <span>Batch</span>
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </button>
          </div>
        </div>

        {pinnedFields.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pl-6">
            {pinnedFields.map(field => (
              <div key={field.id} className="flex items-center space-x-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {field.displayLabel}:
                </label>
                {field.fieldType === 'dropdown' ? (
                  <CustomDropdown
                    value={pinnedFieldValues[field.id] || ''}
                    onChange={(val) => handlePinnedFieldChange(field.id, val)}
                    placeholder="Any"
                    options={field.dropdownOptions.map(opt => ({ value: opt, label: opt }))}
                  />
                ) : field.fieldType === 'boolean' ? (
                  <CustomDropdown
                    value={pinnedFieldValues[field.id] || ''}
                    onChange={(val) => handlePinnedFieldChange(field.id, val)}
                    placeholder="Any"
                    options={[
                      { value: 'true', label: 'Yes' },
                      { value: 'false', label: 'No' },
                    ]}
                  />
                ) : field.fieldType === 'date' ? (
                  <input
                    type="date"
                    value={pinnedFieldValues[field.id] || ''}
                    onChange={(e) => handlePinnedFieldChange(field.id, e.target.value)}
                    className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <input
                    type={field.fieldType === 'number' ? 'number' : 'text'}
                    value={pinnedFieldValues[field.id] || ''}
                    onChange={(e) => handlePinnedFieldChange(field.id, e.target.value)}
                    placeholder={`Search...`}
                    className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32"
                  />
                )}
              </div>
            ))}
            {pinnedFilterCount > 0 && (
              <button
                onClick={() => { setPinnedFieldValues({}); setLoading(true); }}
                className="px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {activeFilterCount > 0 && (
          <div className="flex items-center space-x-2 pl-6">
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {activeFilterCount} metadata filter{activeFilterCount !== 1 ? 's' : ''} active
            </span>
            <button
              onClick={() => { setMetadataFilters({}); setLoading(true); }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No documents found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {searchQuery || filterBucket || filterDocType || activeFilterCount > 0 || pinnedFilterCount > 0
              ? 'Try adjusting your filters or search query.'
              : 'Documents will appear here once uploaded through workflows.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {canRerun && selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">{selectedIds.size} document{selectedIds.size !== 1 ? 's' : ''} selected</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRerunAutoWorkflow}
                  disabled={autoRerunning}
                  title="Run the workflow configured on each document type's processing rule"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                >
                  {autoRerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  <span>Rerun Auto Workflow</span>
                </button>
                <button
                  onClick={openRerunModal}
                  disabled={imagingWorkflows.length === 0 || autoRerunning}
                  title={imagingWorkflows.length === 0 ? 'No active Imaging Workflow v2 available' : 'Pick a specific Imaging Workflow v2 to run on the selected documents'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Rerun Manual Workflow</span>
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          {autoRerunProgress && (
            <div className="mb-3 px-3 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-xs text-emerald-800 dark:text-emerald-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium">Running auto workflow...</span>
                <span className="tabular-nums">{autoRerunProgress.current} / {autoRerunProgress.total}</span>
              </div>
              <div className="h-1.5 bg-emerald-200/60 dark:bg-emerald-900/40 rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-600 dark:bg-emerald-400 transition-all duration-200"
                  style={{ width: `${autoRerunProgress.total > 0 ? (autoRerunProgress.current / autoRerunProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {autoRerunResult && (
            <div className={`mb-3 px-3 py-2.5 rounded-lg border text-xs ${
              autoRerunResult.failed === 0
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  Auto workflow: {autoRerunResult.success} triggered, {autoRerunResult.failed} failed
                </span>
                <button
                  onClick={() => setAutoRerunResult(null)}
                  className="text-xs opacity-70 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {autoRerunResult.errors.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
                  {autoRerunResult.errors.slice(0, 10).map((e, i) => (
                    <li key={i} className="truncate">{e}</li>
                  ))}
                  {autoRerunResult.errors.length > 10 && (
                    <li className="italic">+ {autoRerunResult.errors.length - 10} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {canRerun && (
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Document Type</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bucket</th>
                {pinnedColumnsFields.map(field => (
                  <th key={field.id} className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {field.displayLabel}
                  </th>
                ))}
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ePDF</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filename</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Size</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uploaded</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {documents.map(doc => (
                <tr key={doc.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${selectedIds.has(doc.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                  {canRerun && (
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => toggleRowSelected(doc.id)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        aria-label={`Select ${doc.originalFilename || doc.id}`}
                      />
                    </td>
                  )}
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                      {doc.documentTypeName || '-'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400">{doc.bucketName || '-'}</td>
                  {pinnedColumnsFields.map(field => (
                    <td key={field.id} className="py-2.5 px-3 text-gray-600 dark:text-gray-400 text-xs">
                      {docMetadata[doc.id]?.[field.id] || '-'}
                    </td>
                  ))}
                  <td className="py-2.5 px-3">
                    {doc.processingStatus === 'processing' ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full">
                        <Clock className="h-3 w-3 animate-pulse" />
                        <span>Converting</span>
                      </span>
                    ) : doc.processingStatus === 'completed' ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>ePDF</span>
                      </span>
                    ) : doc.processingStatus === 'failed' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Failed</span>
                        </span>
                        {canRetry && (
                          <button
                            onClick={async () => {
                              if (retryingIds.has(doc.id)) return;
                              setRetryingIds(prev => new Set(prev).add(doc.id));
                              setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, processingStatus: 'processing' } : d));
                              try {
                                await retryEpdfConversion(doc.id);
                              } catch (err) {
                                console.error('[EPDF-RETRY] failed', err);
                                setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, processingStatus: 'failed' } : d));
                              } finally {
                                setRetryingIds(prev => {
                                  const next = new Set(prev);
                                  next.delete(doc.id);
                                  return next;
                                });
                              }
                            }}
                            disabled={retryingIds.has(doc.id)}
                            title="Retry ePDF conversion"
                            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {retryingIds.has(doc.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{doc.originalFilename || doc.storagePath}</td>
                  <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400">{formatFileSize(doc.fileSize)}</td>
                  <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400 text-xs">{formatDate(doc.createdAt)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={() => setViewingDoc(doc)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title="View document"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canDelete && (
                        deleteConfirmId === doc.id ? (
                          <div className="flex items-center space-x-1">
                            <button onClick={() => handleDelete(doc.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(doc.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-right">
            Showing {documents.length} document{documents.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {viewingDoc && (
        <ImagingViewerModal
          doc={viewingDoc}
          onClose={() => setViewingDoc(null)}
          onMetadataSaved={loadDocuments}
        />
      )}

      {showUploadModal && (
        <ImagingUploadModal
          buckets={buckets}
          docTypes={docTypes}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(doc, meta) => {
            setDocuments(prev => {
              const filtered = prev.filter(d => d.id !== doc.id);
              return [doc, ...filtered];
            });
            if (meta) {
              setDocMetadata(prev => ({
                ...prev,
                [doc.id]: { ...(prev[doc.id] || {}), ...meta },
              }));
            }
          }}
        />
      )}

      {showBatchUploadModal && (
        <ImagingBatchUploadModal
          resumeBatch={null}
          onClose={() => setShowBatchUploadModal(false)}
          onComplete={() => {
            setShowBatchUploadModal(false);
            loadDocuments();
          }}
        />
      )}

      {showFilterModal && (
        <ImagingFilterModal
          fields={metadataFields}
          currentFilters={metadataFilters}
          onApply={handleApplyMetadataFilters}
          onClose={() => setShowFilterModal(false)}
        />
      )}

      {showRerunModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg">
                  <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Rerun Manual Imaging Workflow</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Run a workflow across {selectedIds.size} document{selectedIds.size !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={closeRerunModal}
                disabled={rerunning}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Imaging Workflow v2
                </label>
                {imagingWorkflows.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    No active Imaging Workflow v2 exists. Create one in Workflows Setup first.
                  </div>
                ) : (
                  <CustomDropdown
                    value={rerunWorkflowId}
                    onChange={setRerunWorkflowId}
                    placeholder="Select a workflow"
                    options={imagingWorkflows.map(w => ({ value: w.id, label: w.name }))}
                    disabled={rerunning}
                  />
                )}
              </div>

              {rerunProgress && (
                <div className="px-3 py-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-800 dark:text-blue-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium">Running workflow...</span>
                    <span className="tabular-nums">{rerunProgress.current} / {rerunProgress.total}</span>
                  </div>
                  <div className="h-1.5 bg-blue-200/60 dark:bg-blue-900/40 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-200"
                      style={{ width: `${rerunProgress.total > 0 ? (rerunProgress.current / rerunProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {rerunResult && (
                <div className={`px-3 py-2.5 text-xs rounded-lg border ${
                  rerunResult.failed === 0
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                }`}>
                  <div className="font-medium">
                    {rerunResult.success} succeeded, {rerunResult.failed} failed
                  </div>
                  {rerunResult.errors.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                      {rerunResult.errors.slice(0, 20).map((e, i) => (
                        <li key={i} className="truncate">- {e}</li>
                      ))}
                      {rerunResult.errors.length > 20 && (
                        <li className="italic">+ {rerunResult.errors.length - 20} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 rounded-b-2xl">
              <button
                onClick={closeRerunModal}
                disabled={rerunning}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                {rerunResult ? 'Close' : 'Cancel'}
              </button>
              {!rerunResult && (
                <button
                  onClick={handleRerunWorkflow}
                  disabled={rerunning || !rerunWorkflowId || imagingWorkflows.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                >
                  {rerunning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      <span>Run Workflow</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
