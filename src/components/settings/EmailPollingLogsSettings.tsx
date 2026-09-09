import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Clock, CheckCircle, XCircle, RefreshCw, Activity, AlertCircle, Calendar, Timer, StopCircle, X, SkipForward } from 'lucide-react';
import type { EmailPollingLog } from '../../types';

interface EmailPollingLogsSettingsProps {
  emailPollingLogs: EmailPollingLog[];
  onRefreshPollingLogs: () => Promise<EmailPollingLog[]>;
  onStopRunningLogs: () => Promise<void>;
}

export default function EmailPollingLogsSettings({
  emailPollingLogs,
  onRefreshPollingLogs,
  onStopRunningLogs
}: EmailPollingLogsSettingsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshPollingLogs();
    } catch (error) {
      console.error('Failed to refresh polling logs:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStopRunning = async () => {
    setIsStopping(true);
    try {
      await onStopRunningLogs();
    } catch (error) {
      console.error('Failed to stop running logs:', error);
    } finally {
      setIsStopping(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'running':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatExecutionTime = (timeMs?: number) => {
    if (!timeMs) return 'N/A';
    if (timeMs < 1000) return `${timeMs}ms`;
    return `${(timeMs / 1000).toFixed(1)}s`;
  };

  const getProviderIcon = (provider: string) => {
    return provider === 'gmail' ? '📧' : '🏢';
  };

  const runningPolls = emailPollingLogs.filter(log => log.status === 'running').length;
  const totalPolls = emailPollingLogs.length;
  const successfulPolls = emailPollingLogs.filter(log => log.status === 'success').length;
  const failedPolls = emailPollingLogs.filter(log => log.status === 'failed').length;
  const totalEmailsFound = emailPollingLogs.reduce((sum, log) => sum + log.emailsFound, 0);
  const totalEmailsProcessed = emailPollingLogs.reduce((sum, log) => sum + log.emailsProcessed, 0);
  const totalEmailsSkipped = emailPollingLogs.reduce((sum, log) => sum + (log.emailsSkipped || 0), 0);
  const totalEmailsFailed = emailPollingLogs.reduce((sum, log) => sum + (log.emailsFailed || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Email Polling Activity</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor email polling attempts and their results</p>
        </div>
        <div className="flex items-center space-x-2">
          {runningPolls > 0 && (
            <button
              onClick={handleStopRunning}
              disabled={isStopping}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <StopCircle className={`h-4 w-4 ${isStopping ? 'animate-pulse' : ''}`} />
              <span>{isStopping ? 'Stopping...' : `Stop Running (${runningPolls})`}</span>
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
          </button>
        </div>
      </div>

      {totalPolls > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Polls</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totalPolls}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Successful</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{successfulPolls}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{failedPolls}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-cyan-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Emails Found</span>
            </div>
            <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{totalEmailsFound}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Processed</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{totalEmailsProcessed}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <SkipForward className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Emails Skipped</span>
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totalEmailsSkipped}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Emails Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{totalEmailsFailed}</p>
          </div>
        </div>
      )}

      {/* Polling Logs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Recent Polling Activity</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {emailPollingLogs.length} polling attempt{emailPollingLogs.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Emails Found
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Emails Processed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Emails Skipped
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Emails Failed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Execution Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Error Message
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {emailPollingLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                      {getStatusIcon(log.status)}
                      <span className="ml-1 capitalize">{log.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{getProviderIcon(log.provider)}</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 capitalize">{log.provider}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{formatDate(log.timestamp)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{log.emailsFound}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{log.emailsProcessed}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${(log.emailsSkipped || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {log.emailsSkipped || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${(log.emailsFailed || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {log.emailsFailed || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Timer className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{formatExecutionTime(log.executionTimeMs)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {log.errorMessage ? (
                      <button
                        onClick={() => setSelectedError(log.errorMessage!)}
                        className="text-sm text-red-600 hover:text-red-400 truncate max-w-xs block cursor-pointer text-left transition-colors"
                        title="Click to view full message"
                      >
                        {log.errorMessage.length > 50
                          ? `${log.errorMessage.substring(0, 50)}...`
                          : log.errorMessage
                        }
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {emailPollingLogs.length === 0 && (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Polling Activity</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Email polling logs will appear here once the monitoring system starts running.
            </p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Check for Logs</span>
            </button>
          </div>
        )}
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Email Polling Information</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• Each polling attempt is logged with timestamp and results</li>
          <li>• "Emails Found" shows how many emails matched your time filter and had attachments</li>
          <li>• "Emails Processed" shows how many were successfully extracted and uploaded</li>
          <li>• Execution time helps monitor performance and identify issues</li>
          <li>• Failed polls will show error messages to help with troubleshooting</li>
          <li>• Logs are automatically created when you click "Run Now" in Email Monitoring</li>
        </ul>
      </div>

      {/* Scheduling Information */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Setting Up Automatic Polling</h4>
        <div className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
          <p>
            <strong>Current Status:</strong> Email monitoring is currently manual. To enable automatic polling:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Go to your Supabase project dashboard</li>
            <li>Navigate to "Database" → "Functions" → "Cron Jobs"</li>
            <li>Create a new cron job with your desired schedule (e.g., <code className="bg-amber-100 px-1 rounded">*/1 * * * *</code> for every minute)</li>
            <li>Set the function to call: <code className="bg-amber-100 px-1 rounded">email-monitor</code></li>
            <li>Enable the cron job to start automatic polling</li>
          </ol>
          <p className="mt-2">
            <strong>Note:</strong> Once automatic polling is set up, you'll see regular entries in this log showing the polling activity.
          </p>
        </div>
      </div>
      {selectedError && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setSelectedError(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Error Message</h3>
              <button
                onClick={() => setSelectedError(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-4 overflow-auto">
              <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {selectedError}
              </p>
            </div>
            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}