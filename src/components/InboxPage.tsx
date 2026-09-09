import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox, Clock, CheckCircle2, XCircle, AlertTriangle, Mail, Upload,
  Search, RefreshCw, Loader2, Copy, Check, Pencil, FileText, Trash2,
  Play, Cog,
} from 'lucide-react';
import {
  fetchInboxItems, fetchPendingInboxCount, reprocessInboxItem,
  type InboxItem, type InboxFilters,
} from '../services/inboxService';
import {
  fetchEmailProcessingQueueItems, fetchEmailProcessingQueuePendingCount, fetchEmailProcessingQueueFailedCount,
  reprocessQueueItem, deleteQueueItem, getQueuePdfSignedUrl,
  type EmailProcessingQueueItem, type EmailProcessingQueueTab,
} from '../services/emailProcessingQueueService';
import { supabase } from '../lib/supabase';
import CustomDropdown from './common/CustomDropdown';
import Modal from './common/Modal';
import type { User } from '../types';

interface InboxPageProps {
  currentUser?: User;
}

const AUTO_REFRESH_STORAGE_KEY = 'inboxAutoRefreshInterval';
const SOURCE_STORAGE_KEY = 'inboxSource';

const AUTO_REFRESH_OPTIONS = [
  { value: '0', label: 'Auto refresh: Off' },
  { value: '60', label: 'Auto refresh: 1 min' },
  { value: '120', label: 'Auto refresh: 2 min' },
  { value: '300', label: 'Auto refresh: 5 min' },
  { value: '600', label: 'Auto refresh: 10 min' },
  { value: '900', label: 'Auto refresh: 15 min' },
  { value: '1800', label: 'Auto refresh: 30 min' },
];

type Source = 'review' | 'email';

export default function InboxPage({ currentUser }: InboxPageProps) {
  const navigate = useNavigate();

  const [source, setSource] = useState<Source>(() => {
    const stored = localStorage.getItem(SOURCE_STORAGE_KEY);
    return stored === 'email' ? 'email' : 'review';
  });

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'accepted' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [copiedBillId, setCopiedBillId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<string>(() => {
    return localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) || '0';
  });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [queueTab, setQueueTab] = useState<EmailProcessingQueueTab>('inbox');
  const [queueItems, setQueueItems] = useState<EmailProcessingQueueItem[]>([]);
  const [queuePendingCount, setQueuePendingCount] = useState(0);
  const [queueFailedCount, setQueueFailedCount] = useState(0);
  const [queueSearch, setQueueSearch] = useState('');
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailProcessingQueueItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<EmailProcessingQueueItem | null>(null);
  const [errorCopied, setErrorCopied] = useState(false);

  const handleSourceChange = useCallback((s: Source) => {
    setSource(s);
    localStorage.setItem(SOURCE_STORAGE_KEY, s);
  }, []);

  const loadReviewItems = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      const filters: InboxFilters = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (searchQuery.trim()) filters.extractionTypeName = searchQuery.trim();
      const data = await fetchInboxItems(filters);
      setItems(data);
      const count = await fetchPendingInboxCount();
      setPendingCount(count);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load inbox items:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  const loadQueueItems = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchEmailProcessingQueueItems({ tab: queueTab, search: queueSearch });
      setQueueItems(data);
      const [pending, failed] = await Promise.all([
        fetchEmailProcessingQueuePendingCount(),
        fetchEmailProcessingQueueFailedCount(),
      ]);
      setQueuePendingCount(pending);
      setQueueFailedCount(failed);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load email processing queue:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queueTab, queueSearch]);

  const loadAll = useCallback((showRefreshing = false) => {
    if (source === 'review') loadReviewItems(showRefreshing);
    else loadQueueItems(showRefreshing);
  }, [source, loadReviewItems, loadQueueItems]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const refreshTabIndicators = useCallback(async () => {
    try {
      const [reviewPending, queuePending, queueFailed] = await Promise.all([
        fetchPendingInboxCount(),
        fetchEmailProcessingQueuePendingCount(),
        fetchEmailProcessingQueueFailedCount(),
      ]);
      setPendingCount(reviewPending);
      setQueuePendingCount(queuePending);
      setQueueFailedCount(queueFailed);
    } catch (err) {
      console.error('Failed to refresh tab indicators:', err);
    }
  }, []);

  useEffect(() => {
    refreshTabIndicators();
  }, [refreshTabIndicators, source, items, queueItems]);

  const handleAutoRefreshChange = useCallback((value: string) => {
    setAutoRefreshInterval(value);
    localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, value);
  }, []);

  useEffect(() => {
    const seconds = parseInt(autoRefreshInterval, 10);
    if (!seconds) return;
    const timer = window.setInterval(() => {
      loadAll(true);
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshInterval, loadAll]);

  useEffect(() => {
    const loadUsers = async () => {
      const { data } = await supabase.from('users').select('id, username, name');
      if (data) {
        const map: Record<string, string> = {};
        for (const u of data) {
          map[u.id] = u.name || u.username || 'Unknown';
        }
        setUserMap(map);
      }
    };
    loadUsers();
  }, []);

  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock className="h-3 w-3" />Pending
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <CheckCircle2 className="h-3 w-3" />Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <XCircle className="h-3 w-3" />Rejected
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" />Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getQueueStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock className="h-3 w-3" />Pending
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <Cog className="h-3 w-3 animate-spin" />Processing
          </span>
        );
      case 'processed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <CheckCircle2 className="h-3 w-3" />Processed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" />Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getSourceIcon = (src: string | null) => {
    switch (src) {
      case 'email_monitoring':
        return <Mail className="h-4 w-4 text-blue-500" />;
      default:
        return <Upload className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSourceLabel = (src: string | null) => {
    switch (src) {
      case 'email_monitoring': return 'Email';
      default: return 'Upload';
    }
  };

  const handleReprocess = async (item: InboxItem) => {
    if (reprocessingId) return;
    setReprocessingId(item.id);
    try {
      await reprocessInboxItem(item.id);
      await loadReviewItems(true);
    } catch (err) {
      console.error('Reprocess failed:', err);
    } finally {
      setReprocessingId(null);
    }
  };

  const handleQueueReprocess = async (item: EmailProcessingQueueItem) => {
    if (queueBusyId) return;
    setQueueBusyId(item.id);
    try {
      await reprocessQueueItem(item.id);
      await loadQueueItems(true);
    } catch (err) {
      console.error('Queue reprocess failed:', err);
      alert(`Failed to reprocess: ${(err as Error).message}`);
    } finally {
      setQueueBusyId(null);
    }
  };

  const handleQueueDelete = (item: EmailProcessingQueueItem) => {
    if (queueBusyId) return;
    setDeleteError(null);
    setDeleteTarget(item);
  };

  const confirmQueueDelete = async () => {
    const item = deleteTarget;
    if (!item || queueBusyId) return;
    setDeleteError(null);
    setQueueBusyId(item.id);
    try {
      await deleteQueueItem(item);
      await loadQueueItems(true);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Queue delete failed:', err);
      setDeleteError((err as Error).message || 'Failed to delete queue record.');
    } finally {
      setQueueBusyId(null);
    }
  };

  const handleQueueViewPdf = async (item: EmailProcessingQueueItem) => {
    try {
      const url = await getQueuePdfSignedUrl(item);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open PDF:', err);
      alert(`Failed to open PDF: ${(err as Error).message}`);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  const modeLabel = (m: string) => {
    switch (m) {
      case 'workflow_v2': return 'Workflow V2';
      case 'transformation': return 'Transformation';
      case 'extraction': return 'Extraction';
      default: return m;
    }
  };

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Inbox className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inbox</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {source === 'review'
                ? 'Review and approve workflow items awaiting human review'
                : 'Track email-captured PDFs as they flow through the processing queue'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
              Last: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <CustomDropdown
            value={autoRefreshInterval}
            onChange={handleAutoRefreshChange}
            options={AUTO_REFRESH_OPTIONS}
            size="sm"
            icon={<Clock className="h-3.5 w-3.5" />}
            className="w-44"
          />
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Source switch */}
      <div className="flex items-center gap-1 p-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
        {([
          {
            id: 'review' as const,
            label: 'Review Queue',
            indicator: pendingCount > 0
              ? { color: 'bg-amber-500', pulse: false, title: `${pendingCount} pending` }
              : null,
          },
          {
            id: 'email' as const,
            label: 'Email Processing',
            indicator: queueFailedCount > 0
              ? { color: 'bg-red-500', pulse: true, title: `${queueFailedCount} failed` }
              : queuePendingCount > 0
                ? { color: 'bg-amber-500', pulse: false, title: `${queuePendingCount} pending` }
                : null,
          },
        ]).map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleSourceChange(opt.id)}
            className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              source === opt.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>{opt.label}</span>
            {opt.indicator && (
              <span className="relative inline-flex" title={opt.indicator.title}>
                {opt.indicator.pulse && (
                  <span className={`absolute inline-flex h-2.5 w-2.5 rounded-full ${opt.indicator.color} opacity-75 animate-ping`} />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${opt.indicator.color} ring-2 ring-white dark:ring-gray-800`} />
              </span>
            )}
          </button>
        ))}
      </div>

      {source === 'review' ? (
        <ReviewView
          items={items}
          loading={loading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          pendingCount={pendingCount}
          userMap={userMap}
          copiedBillId={copiedBillId}
          setCopiedBillId={setCopiedBillId}
          reprocessingId={reprocessingId}
          onReprocess={handleReprocess}
          onOpenItem={(id) => navigate(`/inbox/${id}`)}
          getStatusBadge={getReviewStatusBadge}
          getSourceIcon={getSourceIcon}
          getSourceLabel={getSourceLabel}
          formatDate={formatDate}
        />
      ) : (
        <QueueView
          items={queueItems}
          loading={loading}
          tab={queueTab}
          setTab={setQueueTab}
          search={queueSearch}
          setSearch={setQueueSearch}
          pendingCount={queuePendingCount}
          busyId={queueBusyId}
          onReprocess={handleQueueReprocess}
          onDelete={handleQueueDelete}
          onViewPdf={handleQueueViewPdf}
          onShowError={(item) => { setErrorCopied(false); setErrorModal(item); }}
          getStatusBadge={getQueueStatusBadge}
          formatDate={formatDate}
          modeLabel={modeLabel}
        />
      )}

      <Modal
        isOpen={!!errorModal}
        onClose={() => setErrorModal(null)}
        title="Processing Error"
      >
        {errorModal && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Filename</div>
                <div className="text-gray-900 dark:text-gray-100 break-all">{errorModal.original_filename || '-'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Sender</div>
                <div className="text-gray-900 dark:text-gray-100 break-all">{errorModal.email_from || '-'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Subject</div>
                <div className="text-gray-900 dark:text-gray-100 break-words">{errorModal.email_subject || '-'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Attempts</div>
                <div className="text-gray-900 dark:text-gray-100">{errorModal.attempts}</div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Error Message</div>
                <button
                  onClick={async () => {
                    if (!errorModal.error_message) return;
                    try {
                      await navigator.clipboard.writeText(errorModal.error_message);
                      setErrorCopied(true);
                      setTimeout(() => setErrorCopied(false), 1500);
                    } catch (err) {
                      console.error('Copy failed:', err);
                    }
                  }}
                  disabled={!errorModal.error_message}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors disabled:opacity-50"
                >
                  {errorCopied ? (
                    <>
                      <Check className="h-3 w-3 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-96 overflow-auto p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap break-words border border-red-200 dark:border-red-800/50">
                {errorModal.error_message || 'No error message recorded.'}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setErrorModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => queueBusyId !== deleteTarget.id && setDeleteTarget(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-full bg-red-100 dark:bg-red-900/40">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Delete this queued email?
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    This will permanently remove the queue record and the stored PDF from Supabase storage. This action cannot be undone.
                  </p>
                  <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3 space-y-1.5 text-sm">
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-gray-100 break-all">
                        {deleteTarget.original_filename || 'Untitled attachment'}
                      </span>
                    </div>
                    {deleteTarget.email_subject && (
                      <div className="flex items-start gap-2">
                        <Mail className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700 dark:text-gray-300 break-words line-clamp-2">
                          {deleteTarget.email_subject}
                        </span>
                      </div>
                    )}
                    {deleteTarget.email_from && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 pl-6 break-all">
                        from {deleteTarget.email_from}
                      </div>
                    )}
                  </div>
                  {deleteError && (
                    <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-3 text-sm text-red-800 dark:text-red-200">
                      {deleteError}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={queueBusyId === deleteTarget.id}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmQueueDelete}
                disabled={queueBusyId === deleteTarget.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {queueBusyId === deleteTarget.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReviewViewProps {
  items: InboxItem[];
  loading: boolean;
  statusFilter: 'pending' | 'accepted' | 'rejected' | 'all';
  setStatusFilter: (s: 'pending' | 'accepted' | 'rejected' | 'all') => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  pendingCount: number;
  userMap: Record<string, string>;
  copiedBillId: string | null;
  setCopiedBillId: (id: string | null) => void;
  reprocessingId: string | null;
  onReprocess: (item: InboxItem) => void;
  onOpenItem: (id: string) => void;
  getStatusBadge: (s: string) => React.ReactNode;
  getSourceIcon: (s: string | null) => React.ReactNode;
  getSourceLabel: (s: string | null) => string;
  formatDate: (s: string | null | undefined) => string;
}

function ReviewView({
  items, loading, statusFilter, setStatusFilter, searchQuery, setSearchQuery,
  pendingCount, userMap, copiedBillId, setCopiedBillId, reprocessingId, onReprocess,
  onOpenItem, getStatusBadge, getSourceIcon, getSourceLabel, formatDate,
}: ReviewViewProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by type name..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {(['all', 'pending', 'accepted', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === status
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              {status === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No inbox items</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {statusFilter === 'pending'
              ? 'There are no items awaiting review right now.'
              : 'No items match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filename</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  {(statusFilter === 'accepted' || statusFilter === 'rejected') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resolved</th>
                  )}
                  {statusFilter === 'accepted' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Accepted By</th>
                  )}
                  {statusFilter === 'accepted' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bill Number</th>
                  )}
                  {statusFilter === 'rejected' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rejected By</th>
                  )}
                  {statusFilter === 'rejected' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rejection Reason</th>
                  )}
                  {statusFilter === 'pending' && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Failure Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpenItem(item.id)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(item.status)}
                        {item.status === 'accepted' && item.has_edits && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
                            title={`${item.change_log?.length ?? 0} field${(item.change_log?.length ?? 0) === 1 ? '' : 's'} changed during review`}
                          >
                            <Pencil className="w-3 h-3" />
                            Edited
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.extraction_type_name || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] block">
                        {item.pdf_filename || item.original_pdf_filename || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {getSourceIcon(item.trigger_source)}
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {getSourceLabel(item.trigger_source)}
                        </span>
                        {item.sender_email && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]" title={item.sender_email}>
                            ({item.sender_email})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {formatDate(item.created_at)}
                      </span>
                    </td>
                    {(statusFilter === 'accepted' || statusFilter === 'rejected') && (
                      <td className="px-4 py-3">
                        {item.resolved_at ? (
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {formatDate(item.resolved_at)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    )}
                    {statusFilter === 'accepted' && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {item.resolved_by ? userMap[item.resolved_by] || '-' : '-'}
                        </span>
                      </td>
                    )}
                    {statusFilter === 'rejected' && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {item.resolved_by ? userMap[item.resolved_by] || '-' : '-'}
                        </span>
                      </td>
                    )}
                    {statusFilter === 'rejected' && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px] block" title={item.resolution_notes || ''}>
                          {item.resolution_notes || '-'}
                        </span>
                      </td>
                    )}
                    {statusFilter === 'pending' && (
                      <td className="px-4 py-3">
                        {item.status === 'failed' && item.failure_reason ? (
                          <span className="text-sm text-red-600 dark:text-red-400 truncate max-w-[200px] block" title={item.failure_reason}>
                            {item.failure_reason}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                    )}
                    {statusFilter === 'pending' && (
                      <td className="px-4 py-3">
                        {item.status === 'failed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onReprocess(item);
                            }}
                            disabled={reprocessingId === item.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-700 transition-colors disabled:opacity-50"
                            title="Reprocess this item"
                          >
                            {reprocessingId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Retry
                          </button>
                        )}
                      </td>
                    )}
                    {statusFilter === 'accepted' && (
                      <td className="px-4 py-3">
                        {item.bill_number ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                              {item.bill_number}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.bill_number!);
                                setCopiedBillId(item.id);
                                setTimeout(() => setCopiedBillId(null), 1500);
                              }}
                              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              title="Copy bill number"
                            >
                              {copiedBillId === item.id ? (
                                <Check className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

interface QueueViewProps {
  items: EmailProcessingQueueItem[];
  loading: boolean;
  tab: EmailProcessingQueueTab;
  setTab: (t: EmailProcessingQueueTab) => void;
  search: string;
  setSearch: (s: string) => void;
  pendingCount: number;
  busyId: string | null;
  onReprocess: (item: EmailProcessingQueueItem) => void;
  onDelete: (item: EmailProcessingQueueItem) => void;
  onViewPdf: (item: EmailProcessingQueueItem) => void;
  onShowError: (item: EmailProcessingQueueItem) => void;
  getStatusBadge: (s: string) => React.ReactNode;
  formatDate: (s: string | null | undefined) => string;
  modeLabel: (m: string) => string;
}

function QueueView({
  items, loading, tab, setTab, search, setSearch, pendingCount, busyId,
  onReprocess, onDelete, onViewPdf, onShowError, getStatusBadge, formatDate, modeLabel,
}: QueueViewProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename, subject, sender..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {([
            { id: 'inbox' as const, label: 'Inbox' },
            { id: 'processed' as const, label: 'Processed' },
            { id: 'failed' as const, label: 'Failed' },
          ]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTab(opt.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === opt.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
              {opt.id === 'inbox' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No records</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tab === 'inbox'
              ? 'The email processing queue is empty right now.'
              : tab === 'processed'
                ? 'Nothing has finished processing yet.'
                : 'No failed records — everything ran cleanly.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filename</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sender / Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attempts</th>
                  {tab === 'failed' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Error</th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[220px]" title={item.original_filename || ''}>
                          {item.original_filename || '-'}
                        </span>
                      </div>
                      {item.page_count != null && (
                        <span className="text-[11px] text-gray-400 ml-5">{item.page_count} page{item.page_count === 1 ? '' : 's'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate max-w-[260px]" title={item.email_from || ''}>
                          {item.email_from || '-'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]" title={item.email_subject || ''}>
                          {item.email_subject || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{modeLabel(item.processing_mode)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {formatDate(item.email_received_date || item.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.attempts}</span>
                    </td>
                    {tab === 'failed' && (
                      <td className="px-4 py-3">
                        {item.error_message ? (
                          <button
                            onClick={() => onShowError(item)}
                            className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline decoration-dotted underline-offset-2 truncate max-w-[260px] block text-left"
                            title="Click to see the full error"
                          >
                            {item.error_message}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => onViewPdf(item)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors"
                          title="View PDF"
                        >
                          <FileText className="h-3 w-3" />
                          View
                        </button>
                        {(item.status === 'failed' || item.status === 'processed') && (
                          <button
                            onClick={() => onReprocess(item)}
                            disabled={busyId === item.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-700 transition-colors disabled:opacity-50"
                            title="Reprocess"
                          >
                            {busyId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                            Reprocess
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(item)}
                          disabled={busyId === item.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-700 transition-colors disabled:opacity-50"
                          title="Delete queue record and stored PDF"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
