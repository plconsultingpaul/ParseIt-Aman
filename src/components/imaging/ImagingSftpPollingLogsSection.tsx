import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, Loader2, RefreshCw, AlertCircle, X } from 'lucide-react';
import type { ImagingSftpPollingLog, ImagingSftpFolderConfig } from '../../types';
import { fetchImagingSftpPollingLogs, fetchImagingSftpFolderConfigs } from '../../services/imagingService';

interface ImagingSftpPollingLogsSectionProps {
  isAdmin: boolean;
}

export default function ImagingSftpPollingLogsSection({ isAdmin }: ImagingSftpPollingLogsSectionProps) {
  const [logs, setLogs] = useState<ImagingSftpPollingLog[]>([]);
  const [folders, setFolders] = useState<ImagingSftpFolderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [logData, folderData] = await Promise.all([
        fetchImagingSftpPollingLogs(),
        fetchImagingSftpFolderConfigs(),
      ]);
      setLogs(logData);
      setFolders(folderData);
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
      const logData = await fetchImagingSftpPollingLogs();
      setLogs(logData);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh logs');
    } finally {
      setRefreshing(false);
    }
  };

  const getFolderName = (folderConfigId: string): string => {
    const folder = folders.find(f => f.id === folderConfigId);
    return folder?.folderName || 'Unknown Folder';
  };

  const formatTime = (ms: number): string => {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ScrollText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Polling Logs</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            {logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}
          </span>
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
          <ScrollText className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">No polling activity recorded yet.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Logs will appear here after running the SFTP monitor.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {logs.slice(0, 20).map((log) => (
              <div key={log.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      log.status === 'success' ? 'bg-green-500' :
                      log.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {getFolderName(log.folderConfigId)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {log.filesProcessed} / {log.filesFound} files processed
                    </p>
                    {log.executionTimeMs != null && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(log.executionTimeMs)}
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
    </section>
  );
}
