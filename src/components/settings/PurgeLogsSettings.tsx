import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, CheckSquare, Square, AlertTriangle, Loader2, CheckCircle, RefreshCw, Database, HardDrive } from 'lucide-react';
import { getAuthHeaders } from '../../lib/supabase';

type UsageRow = {
  log_type: string;
  total_rows: number;
  expired_rows: number;
  total_bytes: number;
  expired_bytes_estimate: number;
};

type UsageResponse = {
  success: boolean;
  cutoff: string;
  retentionDays: number;
  usage: UsageRow[];
  storage: {
    email_processing_queue?: {
      bucket: string;
      storageBytes: number;
      expiredStorageBytes: number;
    };
  };
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatNumber = (n: number): string => n.toLocaleString();

const LOG_TYPES = [
  { id: 'extraction_logs', label: 'Processing Logs', description: 'PDF extraction and transformation activity logs' },
  { id: 'workflow_execution_logs', label: 'Workflow Logs', description: 'Workflow execution and step logs' },
  { id: 'email_polling_logs', label: 'Email Polling Logs', description: 'Email monitoring activity' },
  { id: 'processed_emails', label: 'Processed Emails', description: 'Processed email history' },
  { id: 'sftp_polling_logs', label: 'SFTP Polling Logs', description: 'SFTP folder monitoring logs' },
  { id: 'inbox_accepted', label: 'Inbox Accepted Logs', description: 'Accepted inbox review items' },
  { id: 'inbox_rejected', label: 'Inbox Rejected Logs', description: 'Rejected inbox review items' },
  { id: 'email_processing_queue', label: 'Email Processing Queue', description: 'Purge completed and failed email processing records and their stored PDFs older than the retention window.' },
] as const;

type LogTypeId = typeof LOG_TYPES[number]['id'];

const RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
];

export default function PurgeLogsSettings() {
  const [selectedTypes, setSelectedTypes] = useState<Set<LogTypeId>>(new Set());
  const [retentionDays, setRetentionDays] = useState(30);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [purging, setPurging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; details?: Record<string, number> } | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const loadUsage = useCallback(async (days: number) => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${supabaseUrl}/functions/v1/purge-logs`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: 'usage', retentionDays: days }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load usage');
      if (!Array.isArray(data?.usage)) throw new Error('Unexpected response');
      setUsage(data as UsageResponse);
    } catch (err: any) {
      setUsageError(err.message || 'Failed to load usage');
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { loadUsage(retentionDays); }, 250);
    return () => clearTimeout(t);
  }, [retentionDays, loadUsage]);

  const toggleType = (id: LogTypeId) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setResult(null);
  };

  const toggleAll = () => {
    if (selectedTypes.size === LOG_TYPES.length) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(LOG_TYPES.map(t => t.id)));
    }
    setResult(null);
  };

  const allSelected = selectedTypes.size === LOG_TYPES.length;
  const noneSelected = selectedTypes.size === 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const handlePurge = async () => {
    if (confirmText !== 'PURGE') return;

    setPurging(true);
    setResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/functions/v1/purge-logs`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          logTypes: Array.from(selectedTypes),
          retentionDays,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to purge logs');
      }

      setResult({
        success: true,
        message: `Purged logs older than ${retentionDays} days.`,
        details: data.deleted,
      });
      setShowConfirm(false);
      setConfirmText('');
      loadUsage(retentionDays);
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'An error occurred while purging logs.',
      });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Purge Logs</h3>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Remove old log entries to free up database space. Select which log types to purge and how many days of data to keep.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">This action is irreversible.</p>
          <p className="mt-1">Purged log entries cannot be recovered. Make sure you have exported any data you need before proceeding.</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Log Storage Usage</h4>
            {usageLoading && <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />}
          </div>
          <button
            onClick={() => loadUsage(retentionDays)}
            disabled={usageLoading}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${usageLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {usageError ? (
          <div className="px-4 py-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {usageError}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Log Type</th>
                  <th className="text-right px-4 py-2 font-semibold">Total Rows</th>
                  <th className="text-right px-4 py-2 font-semibold">Would Purge</th>
                  <th className="text-right px-4 py-2 font-semibold">Database Size</th>
                  <th className="text-right px-4 py-2 font-semibold">Est. Freed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {LOG_TYPES.map((logType) => {
                  const row = usage?.usage.find(u => u.log_type === logType.id);
                  const storage = logType.id === 'email_processing_queue' ? usage?.storage?.email_processing_queue : undefined;
                  const totalRows = row?.total_rows ?? 0;
                  const expiredRows = row?.expired_rows ?? 0;
                  const totalBytes = (row?.total_bytes ?? 0) + (storage?.storageBytes ?? 0);
                  const freedBytes = (row?.expired_bytes_estimate ?? 0) + (storage?.expiredStorageBytes ?? 0);
                  const hasPurge = expiredRows > 0;
                  return (
                    <tr key={logType.id} className={hasPurge ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}>
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                        <div className="font-medium">{logType.label}</div>
                        {storage && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                            <HardDrive className="h-3 w-3" />
                            includes {storage.bucket} bucket
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatNumber(totalRows)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${hasPurge ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-gray-500 dark:text-gray-500'}`}>{formatNumber(expiredRows)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{formatBytes(totalBytes)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${hasPurge ? 'text-green-700 dark:text-green-300 font-semibold' : 'text-gray-500 dark:text-gray-500'}`}>{formatBytes(freedBytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {usage && (
                <tfoot className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600">
                  <tr className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    <td className="px-4 py-2">Totals</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatNumber(usage.usage.reduce((s, r) => s + Number(r.total_rows || 0), 0))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
                      {formatNumber(usage.usage.reduce((s, r) => s + Number(r.expired_rows || 0), 0))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatBytes(
                        usage.usage.reduce((s, r) => s + Number(r.total_bytes || 0), 0) +
                        (usage.storage?.email_processing_queue?.storageBytes ?? 0)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-green-700 dark:text-green-300">
                      {formatBytes(
                        usage.usage.reduce((s, r) => s + Number(r.expired_bytes_estimate || 0), 0) +
                        (usage.storage?.email_processing_queue?.expiredStorageBytes ?? 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
              Database sizes include tables, indexes and TOAST storage. "Would Purge" and "Est. Freed" reflect the current retention setting of {retentionDays} days. Estimated freed space is proportional to the share of rows being removed.
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Log Types to Purge</h4>
            <button
              onClick={toggleAll}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
            >
              {allSelected ? 'Uncheck All' : 'Check All'}
            </button>
          </div>

          <div className="space-y-2">
            {LOG_TYPES.map((logType) => {
              const isSelected = selectedTypes.has(logType.id);
              return (
                <button
                  key={logType.id}
                  onClick={() => toggleType(logType.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                    isSelected
                      ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Square className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{logType.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{logType.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Retention Period</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Keep logs from the last <strong>{retentionDays} days</strong>. Everything older will be permanently deleted.
          </p>

          <div className="grid grid-cols-2 gap-2">
            {RETENTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setRetentionDays(opt.value); setResult(null); }}
                className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  retentionDays === opt.value
                    ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Cutoff date: <span className="font-semibold text-gray-900 dark:text-gray-100">{cutoffDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              All selected log entries created before this date will be permanently removed.
            </p>
          </div>
        </div>
      </div>

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
          <div>
            <p className={`font-medium text-sm ${result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
              {result.message}
            </p>
            {result.details && (
              <div className="mt-2 space-y-1">
                {Object.entries(result.details).map(([table, count]) => {
                  const logType = LOG_TYPES.find(t => t.id === table);
                  return (
                    <p key={table} className="text-xs text-green-700 dark:text-green-400">
                      {logType?.label || table}: {count} record{count !== 1 ? 's' : ''} deleted
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {!showConfirm ? (
        <div className="flex justify-end">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={noneSelected}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
              noneSelected
                ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md'
            }`}
          >
            <Trash2 className="h-4 w-4" />
            Purge Selected Logs
          </button>
        </div>
      ) : (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg space-y-3">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Type <span className="font-mono bg-red-100 dark:bg-red-800/50 px-1.5 py-0.5 rounded">PURGE</span> to confirm deletion of {selectedTypes.size} log type{selectedTypes.size !== 1 ? 's' : ''} older than {retentionDays} days.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type PURGE to confirm"
              className="flex-1 px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <button
              onClick={handlePurge}
              disabled={confirmText !== 'PURGE' || purging}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm transition-all ${
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
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
