import React, { useState, useEffect, useCallback } from 'react';
import { Server, Loader2, RefreshCw, AlertCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SftpPollingLog, SftpPollingConfig, ImagingSftpPollingLog, ImagingSftpFolderConfig } from '../../types';
import { fetchSftpPollingLogs } from '../../services/logService';
import { fetchImagingSftpPollingLogs, fetchImagingSftpFolderConfigs } from '../../services/imagingService';

interface UnifiedSftpLog {
  id: string;
  source: 'extract' | 'imaging';
  name: string;
  timestamp: string;
  status: string;
  filesFound: number;
  filesProcessed: number;
  errorMessage?: string;
  executionTimeMs?: number;
}

export default function SftpPollingLogsSettings() {
  const [logs, setLogs] = useState<UnifiedSftpLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [extractLogs, imagingLogs, extractConfigs, imagingFolders] = await Promise.all([
        fetchSftpPollingLogs(),
        fetchImagingSftpPollingLogs(),
        loadExtractConfigs(),
        fetchImagingSftpFolderConfigs(),
      ]);

      const unified = mergeAndSort(extractLogs, imagingLogs, extractConfigs, imagingFolders);
      setLogs(unified);
    } catch (err: any) {
      setError(err.message || 'Failed to load polling logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const [extractLogs, imagingLogs, extractConfigs, imagingFolders] = await Promise.all([
        fetchSftpPollingLogs(),
        fetchImagingSftpPollingLogs(),
        loadExtractConfigs(),
        fetchImagingSftpFolderConfigs(),
      ]);
      setLogs(mergeAndSort(extractLogs, imagingLogs, extractConfigs, imagingFolders));
    } catch (err: any) {
      setError(err.message || 'Failed to refresh logs');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">SFTP Polling Logs</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Monitor SFTP folder polling activity across Extract and Imaging
          </p>
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

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-12">
          <Server className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">No SFTP polling activity recorded yet.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Logs will appear here after SFTP monitoring runs.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {logs.map((log) => (
              <div key={`${log.source}-${log.id}`} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      log.status === 'success' ? 'bg-green-500' :
                      log.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                    }`} />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {log.name}
                        </p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${
                          log.source === 'imaging'
                            ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                            : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                        }`}>
                          {log.source === 'imaging' ? 'Imaging' : 'Extract'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {log.filesProcessed} / {log.filesFound} files processed
                    </p>
                    {log.executionTimeMs != null && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {log.executionTimeMs < 1000 ? `${log.executionTimeMs}ms` : `${(log.executionTimeMs / 1000).toFixed(1)}s`}
                      </p>
                    )}
                  </div>
                </div>
                {log.errorMessage && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-400">
                    {log.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function loadExtractConfigs(): Promise<SftpPollingConfig[]> {
  const { data, error } = await supabase
    .from('sftp_polling_configs')
    .select('id, name, processing_mode');
  if (error) throw error;
  return (data || []).map((c: any) => ({
    ...c,
    name: c.name,
    processingMode: c.processing_mode,
  }));
}

function mergeAndSort(
  extractLogs: SftpPollingLog[],
  imagingLogs: ImagingSftpPollingLog[],
  extractConfigs: SftpPollingConfig[],
  imagingFolders: ImagingSftpFolderConfig[]
): UnifiedSftpLog[] {
  const fromExtract: UnifiedSftpLog[] = extractLogs.map((log) => {
    const config = extractConfigs.find(c => c.id === log.configId);
    return {
      id: log.id,
      source: 'extract',
      name: config?.name || 'Unknown Config',
      timestamp: log.timestamp,
      status: log.status,
      filesFound: log.filesFound,
      filesProcessed: log.filesProcessed,
      errorMessage: log.errorMessage,
      executionTimeMs: log.executionTimeMs,
    };
  });

  const fromImaging: UnifiedSftpLog[] = imagingLogs.map((log) => {
    const folder = imagingFolders.find(f => f.id === log.folderConfigId);
    return {
      id: log.id,
      source: 'imaging',
      name: folder?.folderName || 'Unknown Folder',
      timestamp: log.timestamp,
      status: log.status,
      filesFound: log.filesFound,
      filesProcessed: log.filesProcessed,
      errorMessage: log.errorMessage,
      executionTimeMs: log.executionTimeMs,
    };
  });

  return [...fromExtract, ...fromImaging].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
