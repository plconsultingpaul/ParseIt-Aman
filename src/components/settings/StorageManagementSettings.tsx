import { useState, useEffect, useMemo } from 'react';
import {
  HardDrive,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Trash2,
  CheckSquare,
  Square,
  Eye,
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/supabase';
import DatePicker from '../common/DatePicker';

type BucketUsage = {
  bucket: string;
  fileCount: number;
  totalBytes: number;
  oldest: string | null;
  newest: string | null;
};

type PreviewResult = {
  details: Record<string, { fileCount: number; totalBytes: number }>;
  totalFiles: number;
  totalBytes: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(size >= 100 || i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function defaultCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

async function callStorageManager(payload: Record<string, unknown>) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/storage-manager`;
  const headers = await getAuthHeaders();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      'Could not reach the storage service. The scan may have taken too long or your connection dropped. Try selecting fewer buckets and retry.',
    );
  }
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* keep {} */ }
  if (!res.ok) {
    throw new Error(data.error || `Storage service returned ${res.status}`);
  }
  return data;
}

export default function StorageManagementSettings() {
  const [usage, setUsage] = useState<BucketUsage[] | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set());
  const [cutoffDate, setCutoffDate] = useState<string>(defaultCutoff());

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [purging, setPurging] = useState(false);
  const [result, setResult] = useState<
    | { success: boolean; message: string; details?: Record<string, { fileCount: number; totalBytes: number }>; totalFiles?: number; totalBytes?: number }
    | null
  >(null);

  const loadUsage = async () => {
    setLoadingUsage(true);
    setUsageError(null);
    try {
      const data = await callStorageManager({ action: 'usage' });
      const list: BucketUsage[] = (data.usage ?? []).sort(
        (a: BucketUsage, b: BucketUsage) => b.totalBytes - a.totalBytes,
      );
      setUsage(list);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    void loadUsage();
  }, []);

  const totals = useMemo(() => {
    if (!usage) return { fileCount: 0, totalBytes: 0 };
    return usage.reduce(
      (acc, b) => ({
        fileCount: acc.fileCount + b.fileCount,
        totalBytes: acc.totalBytes + b.totalBytes,
      }),
      { fileCount: 0, totalBytes: 0 },
    );
  }, [usage]);

  const toggleBucket = (name: string) => {
    setSelectedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    setPreview(null);
    setResult(null);
  };

  const toggleAll = () => {
    if (!usage) return;
    if (selectedBuckets.size === usage.length) setSelectedBuckets(new Set());
    else setSelectedBuckets(new Set(usage.map(u => u.bucket)));
    setPreview(null);
    setResult(null);
  };

  const cutoffIso = useMemo(() => {
    if (!cutoffDate) return null;
    return new Date(`${cutoffDate}T00:00:00.000Z`).toISOString();
  }, [cutoffDate]);

  const canAct = selectedBuckets.size > 0 && !!cutoffIso;

  const handlePreview = async () => {
    if (!canAct || !cutoffIso) return;
    setPreviewing(true);
    setPreview(null);
    setResult(null);
    try {
      const data = await callStorageManager({
        action: 'preview',
        buckets: Array.from(selectedBuckets),
        cutoffDate: cutoffIso,
      });
      setPreview({
        details: data.details ?? {},
        totalFiles: data.totalFiles ?? 0,
        totalBytes: data.totalBytes ?? 0,
      });
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Preview failed',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handlePurge = async () => {
    if (!canAct || !cutoffIso || confirmText !== 'PURGE') return;
    setPurging(true);
    try {
      const data = await callStorageManager({
        action: 'purge',
        buckets: Array.from(selectedBuckets),
        cutoffDate: cutoffIso,
      });
      setResult({
        success: true,
        message: `Removed ${data.totalFiles ?? 0} file(s), freed ${formatBytes(data.totalBytes ?? 0)}.`,
        details: data.details,
        totalFiles: data.totalFiles,
        totalBytes: data.totalBytes,
      });
      setPreview(null);
      setShowConfirm(false);
      setConfirmText('');
      await loadUsage();
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Purge failed',
      });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Storage Management
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            See how much space each storage bucket is using and remove older files to free up space.
          </p>
        </div>
        <button
          onClick={loadUsage}
          disabled={loadingUsage}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-60"
        >
          {loadingUsage ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Buckets</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{usage?.length ?? 0}</p>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Files</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totals.fileCount.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total Size</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatBytes(totals.totalBytes)}</p>
        </div>
      </div>

      {usageError && (
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{usageError}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Buckets</h4>
          {usage && usage.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              {selectedBuckets.size === usage.length ? 'Uncheck All' : 'Check All'}
            </button>
          )}
        </div>

        {loadingUsage && !usage ? (
          <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading bucket usage...
          </div>
        ) : usage && usage.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-left text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2.5 w-10"></th>
                  <th className="px-4 py-2.5 font-medium">Bucket</th>
                  <th className="px-4 py-2.5 font-medium text-right">Files</th>
                  <th className="px-4 py-2.5 font-medium text-right">Size</th>
                  <th className="px-4 py-2.5 font-medium">Oldest</th>
                  <th className="px-4 py-2.5 font-medium">Newest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-700">
                {usage.map(b => {
                  const selected = selectedBuckets.has(b.bucket);
                  return (
                    <tr
                      key={b.bucket}
                      onClick={() => toggleBucket(b.bucket)}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-600/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        {selected ? (
                          <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{b.bucket}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                        {b.fileCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                        {formatBytes(b.totalBytes)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(b.oldest)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(b.newest)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            No storage buckets found.
          </div>
        )}
      </div>

      <div className="p-5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 space-y-4">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Purge Files by Date</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Select buckets above and choose a cutoff date. Files created before that date will be removed. Preview first to see what will be freed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              Remove files created before
            </label>
            <DatePicker
              value={cutoffDate}
              onChange={val => {
                setCutoffDate(val);
                setPreview(null);
                setResult(null);
              }}
              placeholder="Select cutoff date"
            />
          </div>
          <div className="flex items-end">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-gray-100">{selectedBuckets.size}</span> bucket{selectedBuckets.size === 1 ? '' : 's'} selected
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePreview}
            disabled={!canAct || previewing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              !canAct || previewing
                ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
            }`}
          >
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview
          </button>
          {preview && !showConfirm && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={preview.totalFiles === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                preview.totalFiles === 0
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md'
              }`}
            >
              <Trash2 className="h-4 w-4" />
              Purge
            </button>
          )}
        </div>

        {preview && (
          <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 space-y-2">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              {preview.totalFiles.toLocaleString()} file(s) would be removed, freeing {formatBytes(preview.totalBytes)}.
            </p>
            <div className="space-y-1">
              {Object.entries(preview.details).map(([bucket, d]) => (
                <p key={bucket} className="text-xs text-blue-800 dark:text-blue-300">
                  {bucket}: {d.fileCount.toLocaleString()} file(s) — {formatBytes(d.totalBytes)}
                </p>
              ))}
            </div>
          </div>
        )}

        {showConfirm && (
          <div className="p-4 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 space-y-3">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Type <span className="font-mono bg-red-100 dark:bg-red-800/50 px-1.5 py-0.5 rounded">PURGE</span> to confirm.
              This will permanently delete {preview?.totalFiles ?? 0} file(s) from {selectedBuckets.size} bucket(s).
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type PURGE to confirm"
                className="flex-1 px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
              />
              <button
                onClick={handlePurge}
                disabled={confirmText !== 'PURGE' || purging}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  confirmText === 'PURGE' && !purging
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                {purging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Purging...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Confirm Purge
                  </>
                )}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                disabled={purging}
                className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            result.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
          }`}>
            {result.success ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-medium text-sm ${
                result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
              }`}>
                {result.message}
              </p>
              {result.details && (
                <div className="mt-2 space-y-1">
                  {Object.entries(result.details).map(([bucket, d]) => (
                    <p key={bucket} className="text-xs text-green-700 dark:text-green-400">
                      {bucket}: {d.fileCount.toLocaleString()} file(s) — {formatBytes(d.totalBytes)} freed
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
