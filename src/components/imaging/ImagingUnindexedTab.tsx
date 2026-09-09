import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Loader2, FileText, Eye, X, RefreshCw, CheckCircle, XCircle, Tag, AlertCircle, Mail, HardDrive, Layers, Pencil } from 'lucide-react';
import type { ImagingBucket, ImagingDocumentType, ImagingUnindexedItem, ImagingMetadataField, ImagingDocumentTypeMetadataField } from '../../types';
import {
  fetchBuckets, fetchDocumentTypes, fetchUnindexedQueue, indexUnindexedItem, discardUnindexedItem,
  fetchMetadataFields, fetchDocTypeMetadataFields, fetchInProgressBatches, deleteBatchRecord,
  type ImagingBatch,
} from '../../services/imagingService';
import ImagingViewerModal from './ImagingViewerModal';
import ImagingBatchUploadModal from './ImagingBatchUploadModal';
import CustomDropdown from '../common/CustomDropdown';
import DatePicker from '../common/DatePicker';

interface ImagingUnindexedTabProps {
  isAdmin: boolean;
  canDeleteImaging?: boolean;
}

export default function ImagingUnindexedTab({ isAdmin, canDeleteImaging = false }: ImagingUnindexedTabProps) {
  const canDelete = isAdmin || canDeleteImaging;
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const [items, setItems] = useState<ImagingUnindexedItem[]>([]);
  const [batches, setBatches] = useState<ImagingBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filterBucket, setFilterBucket] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterSource, setFilterSource] = useState<'all' | 'single' | 'batch'>('all');

  const [viewingItem, setViewingItem] = useState<ImagingUnindexedItem | null>(null);
  const [indexingItemId, setIndexingItemId] = useState<string | null>(null);
  const [indexDocTypeId, setIndexDocTypeId] = useState('');
  const [submittingIndex, setSubmittingIndex] = useState(false);
  const [discardConfirmId, setDiscardConfirmId] = useState<string | null>(null);
  const [deleteBatchConfirmId, setDeleteBatchConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [allMetadataFields, setAllMetadataFields] = useState<ImagingMetadataField[]>([]);
  const [indexDocTypeAssignments, setIndexDocTypeAssignments] = useState<ImagingDocumentTypeMetadataField[]>([]);
  const [indexMetaValues, setIndexMetaValues] = useState<Record<string, string>>({});

  const [resumingBatch, setResumingBatch] = useState<ImagingBatch | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const [b, d, mf] = await Promise.all([fetchBuckets(), fetchDocumentTypes(), fetchMetadataFields()]);
      setBuckets(b);
      setDocTypes(d);
      setAllMetadataFields(mf.filter(f => f.isActive));
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const [data, batchData] = await Promise.all([
        fetchUnindexedQueue({
          bucketId: filterBucket || undefined,
          status: filterStatus || undefined,
        }),
        fetchInProgressBatches(),
      ]);
      setItems(data);
      setBatches(batchData);
    } catch (err) {
      console.error('Failed to load unindexed queue:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterBucket, filterStatus]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadItems();
  };

  const handleStartIndex = (item: ImagingUnindexedItem) => {
    setIndexingItemId(item.id);
    setIndexDocTypeId('');
    setIndexMetaValues({});
    setIndexDocTypeAssignments([]);
    setError('');

    if (item.detectedBarcodes.length > 0) {
      const firstBarcode = item.detectedBarcodes[0];
      const dashIdx = firstBarcode.indexOf('-');
      if (dashIdx > 0) {
        const possibleType = firstBarcode.substring(0, dashIdx);
        const matchedType = docTypes.find(dt => dt.name.toLowerCase() === possibleType.toLowerCase());
        if (matchedType) {
          setIndexDocTypeId(matchedType.id);
          fetchDocTypeMetadataFields(matchedType.id).then(assignments => {
            setIndexDocTypeAssignments(assignments);
            const initial: Record<string, string> = {};
            assignments.forEach(a => { initial[a.metadataFieldId] = ''; });
            setIndexMetaValues(initial);
          }).catch(() => {});
        }
      }
    }
  };

  const handleIndexDocTypeChange = (typeId: string) => {
    setIndexDocTypeId(typeId);
    if (!typeId) {
      setIndexDocTypeAssignments([]);
      setIndexMetaValues({});
      return;
    }
    fetchDocTypeMetadataFields(typeId).then(assignments => {
      setIndexDocTypeAssignments(assignments);
      const initial: Record<string, string> = {};
      assignments.forEach(a => { initial[a.metadataFieldId] = ''; });
      setIndexMetaValues(initial);
    }).catch(() => {
      setIndexDocTypeAssignments([]);
      setIndexMetaValues({});
    });
  };

  const indexAssignedFields = indexDocTypeAssignments
    .filter(a => !a.isHiddenFromIndexing)
    .map(a => {
      const field = allMetadataFields.find(f => f.id === a.metadataFieldId);
      return field ? { ...field, isRequired: a.isRequired, sortOrder: a.sortOrder } : null;
    })
    .filter(Boolean) as (ImagingMetadataField & { isRequired: boolean; sortOrder: number })[];
  indexAssignedFields.sort((a, b) => a.sortOrder - b.sortOrder);

  const indexRequiredMet = indexAssignedFields
    .filter(f => f.isRequired)
    .every(f => (indexMetaValues[f.id] || '').trim() !== '');

  const handleSubmitIndex = async (item: ImagingUnindexedItem) => {
    if (!indexDocTypeId) {
      setError('Document Type is required');
      return;
    }
    if (!indexRequiredMet) {
      setError('Please fill in all required fields');
      return;
    }
    setSubmittingIndex(true);
    setError('');
    try {
      const metadataArray = Object.entries(indexMetaValues)
        .filter(([_, v]) => v.trim())
        .map(([fieldId, value]) => ({ fieldId, value: value.trim() }));

      await indexUnindexedItem(item.id, {
        documentTypeId: indexDocTypeId,
        bucketId: item.bucketId,
        storagePath: item.storagePath,
        originalFilename: item.originalFilename,
        fileSize: item.fileSize,
        metadata: metadataArray.length > 0 ? metadataArray : undefined,
      });
      setItems(prev => prev.filter(i => i.id !== item.id));
      setIndexingItemId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to index document');
    } finally {
      setSubmittingIndex(false);
    }
  };

  const handleDiscard = async (id: string) => {
    try {
      await discardUnindexedItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setDiscardConfirmId(null);
    } catch (err) {
      console.error('Failed to discard item:', err);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    try {
      await deleteBatchRecord(batchId);
      setBatches(prev => prev.filter(b => b.id !== batchId));
      setDeleteBatchConfirmId(null);
    } catch (err) {
      console.error('Failed to delete batch:', err);
    }
  };

  const handleBatchComplete = () => {
    setResumingBatch(null);
    loadItems();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  const showBatches = filterSource === 'all' || filterSource === 'batch';
  const showSingles = filterSource === 'all' || filterSource === 'single';

  const visibleBatches = showBatches ? batches : [];
  const visibleItems = showSingles ? items : [];
  const totalVisible = visibleBatches.length + visibleItems.length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
            value={filterStatus}
            onChange={(val) => { setFilterStatus(val); setLoading(true); }}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'indexed', label: 'Indexed' },
              { value: 'discarded', label: 'Discarded' },
              { value: '', label: 'All' },
            ]}
          />
          <CustomDropdown
            value={filterSource}
            onChange={(val) => setFilterSource(val as 'all' | 'single' | 'batch')}
            options={[
              { value: 'all', label: 'All Sources' },
              { value: 'single', label: 'Singles' },
              { value: 'batch', label: 'Batches' },
            ]}
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : totalVisible === 0 ? (
        <div className="text-center py-16">
          <CheckCircle className="h-12 w-12 text-green-300 dark:text-green-700 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            {filterStatus === 'pending' ? 'No unindexed documents' : 'No documents found'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filterStatus === 'pending'
              ? 'All documents from SFTP/Email polling have been indexed or the queue is empty.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Batch rows */}
          {visibleBatches.map(batch => (
            <div key={`batch-${batch.id}`} className="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                        {batch.originalFilename}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        Batch
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        In Progress
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{batch.totalPages} pages</span>
                      <span>{batch.indexedCount} of {batch.totalPages} indexed</span>
                      <span>{formatDate(batch.createdAt)}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 w-48">
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${batch.totalPages > 0 ? (batch.indexedCount / batch.totalPages) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-3">
                    <button
                      onClick={() => setResumingBatch(batch)}
                      className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                      title="Resume indexing"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Resume</span>
                    </button>
                    {canDelete && (deleteBatchConfirmId === batch.id ? (
                      <div className="flex items-center space-x-1">
                        <button onClick={() => handleDeleteBatch(batch.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                        <button onClick={() => setDeleteBatchConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteBatchConfirmId(batch.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Delete batch"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Single item rows */}
          {visibleItems.map(item => (
            <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                        {item.originalFilename || item.storagePath}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        item.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                        : item.status === 'indexed' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                      }`}>
                        {item.status}
                      </span>
                      <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        item.sourceType === 'email'
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {item.sourceType === 'email' ? <Mail className="h-2.5 w-2.5" /> : <HardDrive className="h-2.5 w-2.5" />}
                        <span>{item.sourceType === 'email' ? 'Email' : 'SFTP'}</span>
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatFileSize(item.fileSize)}</span>
                      <span>{formatDate(item.createdAt)}</span>
                      {item.bucketName && <span>Bucket: {item.bucketName}</span>}
                    </div>
                    {item.detectedBarcodes.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1.5 mt-2">
                        <Tag className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        {item.detectedBarcodes.map((bc, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                            {bc}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.detectedBarcodes.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">No barcodes detected</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 ml-3">
                    {item.bucketUrl && (
                      <button
                        onClick={() => setViewingItem(item)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title="View document"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStartIndex(item)}
                          className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        >
                          Index
                        </button>
                        {canDelete && (discardConfirmId === item.id ? (
                          <div className="flex items-center space-x-1">
                            <button onClick={() => handleDiscard(item.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                            <button onClick={() => setDiscardConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDiscardConfirmId(item.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Discard"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {indexingItemId === item.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Manual Index</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Document Type *</label>
                        <CustomDropdown
                          value={indexDocTypeId}
                          onChange={(val) => handleIndexDocTypeChange(val)}
                          placeholder="Select type..."
                          options={docTypes.filter(d => d.isActive).map(d => ({ value: d.id, label: d.name }))}
                        />
                      </div>
                      {indexAssignedFields.map(field => (
                        <div key={field.id}>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {field.displayLabel}{field.isRequired ? ' *' : ''}
                          </label>
                          {field.fieldType === 'dropdown' ? (
                            <CustomDropdown
                              value={indexMetaValues[field.id] || ''}
                              onChange={(val) => setIndexMetaValues(prev => ({ ...prev, [field.id]: val }))}
                              placeholder="Select..."
                              options={field.dropdownOptions.map(opt => ({ value: opt, label: opt }))}
                            />
                          ) : field.fieldType === 'boolean' ? (
                            <CustomDropdown
                              value={indexMetaValues[field.id] || ''}
                              onChange={(val) => setIndexMetaValues(prev => ({ ...prev, [field.id]: val }))}
                              placeholder="Select..."
                              options={[
                                { value: 'true', label: 'Yes' },
                                { value: 'false', label: 'No' },
                              ]}
                            />
                          ) : field.fieldType === 'date' ? (
                            <DatePicker
                              value={indexMetaValues[field.id] || ''}
                              onChange={(val) => setIndexMetaValues(prev => ({ ...prev, [field.id]: val }))}
                              placeholder="Select date..."
                            />
                          ) : (
                            <input
                              type={field.fieldType === 'number' ? 'number' : 'text'}
                              value={indexMetaValues[field.id] || ''}
                              onChange={(e) => setIndexMetaValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                              placeholder={`Enter ${field.displayLabel.toLowerCase()}...`}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center space-x-2 mt-3">
                      <button
                        onClick={() => handleSubmitIndex(item)}
                        disabled={!indexDocTypeId || !indexRequiredMet || submittingIndex}
                        className="flex items-center space-x-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {submittingIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        <span>Confirm Index</span>
                      </button>
                      <button
                        onClick={() => setIndexingItemId(null)}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
            Showing {totalVisible} item{totalVisible !== 1 ? 's' : ''}
            {visibleBatches.length > 0 && ` (${visibleBatches.length} batch${visibleBatches.length !== 1 ? 'es' : ''})`}
          </div>
        </div>
      )}

      {viewingItem && (
        <ImagingViewerModal
          doc={{
            id: viewingItem.id,
            bucketId: viewingItem.bucketId,
            documentTypeId: viewingItem.documentTypeId || '',
            storagePath: viewingItem.storagePath,
            originalFilename: viewingItem.originalFilename,
            fileSize: viewingItem.fileSize,
            processingStatus: 'none',
            createdAt: viewingItem.createdAt,
            updatedAt: viewingItem.updatedAt,
            bucketName: viewingItem.bucketName,
            bucketUrl: viewingItem.bucketUrl,
          }}
          onClose={() => setViewingItem(null)}
        />
      )}

      {resumingBatch && (
        <ImagingBatchUploadModal
          resumeBatch={resumingBatch}
          onClose={() => setResumingBatch(null)}
          onComplete={handleBatchComplete}
        />
      )}
    </div>
  );
}
