import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScrollText, Loader2, RefreshCw, AlertCircle, X, CheckCircle2, XCircle, ShieldAlert, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CustomDropdown from '../common/CustomDropdown';

interface ImagingIngestLogsSectionProps {
  isAdmin: boolean;
}

interface IngestLogRow {
  id: string;
  api_key_id: string | null;
  partner_name: string | null;
  original_filename: string | null;
  bill_number: string | null;
  document_type_name: string | null;
  bucket_id: string | null;
  imaging_document_id: string | null;
  status: 'success' | 'error' | 'unauthorized';
  error_message: string | null;
  created_at: string;
}

interface BucketRow { id: string; name: string; }
interface ApiKeyRow { id: string; name: string; }

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'unauthorized', label: 'Unauthorized' },
];

export default function ImagingIngestLogsSection({ isAdmin: _isAdmin }: ImagingIngestLogsSectionProps) {
  const [logs, setLogs] = useState<IngestLogRow[]>([]);
  const [buckets, setBuckets] = useState<BucketRow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [logRes, bucketRes, keyRes] = await Promise.all([
      supabase
        .from('imaging_ingest_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('imaging_buckets').select('id, name'),
      supabase.from('imaging_api_keys').select('id, name'),
    ]);
    if (logRes.error) throw logRes.error;
    if (bucketRes.error) throw bucketRes.error;
    if (keyRes.error) throw keyRes.error;
    setLogs((logRes.data || []) as IngestLogRow[]);
    setBuckets((bucketRes.data || []) as BucketRow[]);
    setApiKeys((keyRes.data || []) as ApiKeyRow[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll()
      .catch((err: any) => setError(err.message || 'Failed to load ingest logs'))
      .finally(() => setLoading(false));
  }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh logs');
    } finally {
      setRefreshing(false);
    }
  };

  const bucketNameById = useMemo(() => {
    const m = new Map<string, string>();
    buckets.forEach(b => m.set(b.id, b.name));
    return m;
  }, [buckets]);

  const keyNameById = useMemo(() => {
    const m = new Map<string, string>();
    apiKeys.forEach(k => m.set(k.id, k.name));
    return m;
  }, [apiKeys]);

  const filteredLogs = useMemo(() => {
    if (!statusFilter) return logs;
    return logs.filter(l => l.status === statusFilter);
  }, [logs, statusFilter]);

  const counts = useMemo(() => {
    const c = { success: 0, error: 0, unauthorized: 0 };
    for (const l of logs) {
      if (l.status === 'success') c.success++;
      else if (l.status === 'error') c.error++;
      else if (l.status === 'unauthorized') c.unauthorized++;
    }
    return c;
  }, [logs]);

  const renderStatusIcon = (status: IngestLogRow['status']) => {
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'unauthorized') return <ShieldAlert className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const statusBadgeClass = (status: IngestLogRow['status']) => {
    if (status === 'success') return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
    if (status === 'unauthorized') return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-2">
          <ScrollText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Ingest Logs</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            {filteredLogs.length} of {logs.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <CustomDropdown
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
              placeholder="All Statuses"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Successful</span>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-2xl font-semibold text-green-700 dark:text-green-300 mt-1">{counts.success}</div>
        </div>
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-red-700 dark:text-red-400">Errors</span>
            <XCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-semibold text-red-700 dark:text-red-300 mt-1">{counts.error}</div>
        </div>
        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Unauthorized</span>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300 mt-1">{counts.unauthorized}</div>
        </div>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {filteredLogs.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <ScrollText className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {logs.length === 0 ? 'No ingest activity recorded yet.' : 'No entries match the selected filter.'}
          </p>
          {logs.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Entries appear here every time the imaging ingest endpoint is called.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredLogs.map((log) => {
              const isExpanded = expandedId === log.id;
              const partnerLabel =
                log.partner_name ||
                (log.api_key_id ? keyNameById.get(log.api_key_id) : null) ||
                (log.status === 'unauthorized' ? 'Unknown caller' : 'Unnamed partner');
              const bucketLabel = log.bucket_id ? bucketNameById.get(log.bucket_id) || 'Unknown bucket' : null;

              return (
                <div key={log.id} className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full flex items-start justify-between gap-3 text-left"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5">{renderStatusIcon(log.status)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadgeClass(log.status)}`}>
                            {log.status}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {partnerLabel}
                          </span>
                          {log.bill_number && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Bill: <span className="font-medium text-gray-700 dark:text-gray-300">{log.bill_number}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                          {log.original_filename && (
                            <span className="inline-flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              <span className="truncate max-w-[240px]">{log.original_filename}</span>
                            </span>
                          )}
                          {log.document_type_name && (
                            <span>Type: <span className="text-gray-700 dark:text-gray-300">{log.document_type_name}</span></span>
                          )}
                          {bucketLabel && (
                            <span>Bucket: <span className="text-gray-700 dark:text-gray-300">{bucketLabel}</span></span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {log.error_message && !isExpanded && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-xs text-red-700 dark:text-red-400">
                      {log.error_message}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1.5">
                      <DetailRow label="Timestamp" value={new Date(log.created_at).toLocaleString()} />
                      <DetailRow label="Status" value={log.status} />
                      <DetailRow label="Partner" value={partnerLabel} />
                      {log.api_key_id && <DetailRow label="API Key ID" value={log.api_key_id} mono />}
                      {log.bill_number && <DetailRow label="Bill Number" value={log.bill_number} />}
                      {log.original_filename && <DetailRow label="Filename" value={log.original_filename} />}
                      {log.document_type_name && <DetailRow label="Document Type" value={log.document_type_name} />}
                      {bucketLabel && <DetailRow label="Bucket" value={bucketLabel} />}
                      {log.imaging_document_id && <DetailRow label="Imaging Document ID" value={log.imaging_document_id} mono />}
                      {log.error_message && (
                        <div className="pt-1.5 mt-1.5 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Error Message</div>
                          <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-red-700 dark:text-red-400 whitespace-pre-wrap break-words">
                            {log.error_message}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-36 flex-shrink-0 text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`flex-1 min-w-0 text-gray-700 dark:text-gray-300 break-words ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </div>
    </div>
  );
}
