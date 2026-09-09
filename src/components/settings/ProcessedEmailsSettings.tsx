import React from 'react';
import { Mail, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Filter, X, FileText, Shuffle, GitBranch, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import CustomDropdown from '../common/CustomDropdown';
import DatePicker from '../common/DatePicker';
import type { ProcessedEmail } from '../../types';

interface ProcessedEmailsSettingsProps {
  processedEmails: ProcessedEmail[];
  onRefresh?: (startDate?: string, endDate?: string) => Promise<void>;
}

export default function ProcessedEmailsSettings({ processedEmails, onRefresh }: ProcessedEmailsSettingsProps) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedError, setSelectedError] = React.useState<{ subject: string; error: string } | null>(null);

  const getTodayRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return { start: today, end: todayEnd };
  };

  const todayRange = getTodayRange();
  const [startDate, setStartDate] = React.useState(todayRange.start.toISOString().split('T')[0]);
  const [endDate, setEndDate] = React.useState(todayRange.end.toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'completed' | 'failed' | 'processing'>('all');
  const [directionFilter, setDirectionFilter] = React.useState<'all' | 'inbound' | 'outbound'>('all');

  const handleRefresh = async () => {
    if (!onRefresh) return;

    setIsRefreshing(true);
    try {
      await onRefresh(startDate, endDate);
    } catch (error) {
      console.error('Failed to refresh processed emails:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'processing':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    }
  };

  const getProcessingModeConfig = (mode?: string) => {
    switch (mode) {
      case 'extraction':
        return {
          label: 'Extract',
          icon: <FileText className="h-3 w-3" />,
          classes: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700'
        };
      case 'transformation':
        return {
          label: 'Transform',
          icon: <Shuffle className="h-3 w-3" />,
          classes: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
        };
      case 'workflow_v2':
        return {
          label: 'Workflow V2',
          icon: <GitBranch className="h-3 w-3" />,
          classes: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700'
        };
      default:
        return null;
    }
  };

  const formatFilenamesWithPages = (email: ProcessedEmail): string => {
    const filenames = email.pdfFilenames || email.pdfFilename;
    if (!filenames) return '-';

    const pageCounts = email.attachmentPageCounts;
    if (!pageCounts) return filenames;

    const filenameList = filenames.split(', ');
    const pageCountList = pageCounts.split(', ');

    return filenameList.map((filename, index) => {
      const pages = pageCountList[index] ? parseInt(pageCountList[index], 10) : 1;
      const pageLabel = pages === 1 ? 'page' : 'pages';
      return `${filename} (${pages} ${pageLabel})`;
    }).join(', ');
  };

  React.useEffect(() => {
    if (onRefresh) {
      onRefresh(startDate, endDate);
    }
  }, [startDate, endDate]);

  const handleClearFilters = () => {
    const todayRange = getTodayRange();
    setStartDate(todayRange.start.toISOString().split('T')[0]);
    setEndDate(todayRange.end.toISOString().split('T')[0]);
    setStatusFilter('all');
    setDirectionFilter('all');
  };

  const filteredEmails = React.useMemo(() => {
    return processedEmails.filter((email) => {
      const emailDate = new Date(email.receivedDate);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const isInDateRange = emailDate >= start && emailDate <= end;
      const matchesStatus = statusFilter === 'all' || email.processingStatus === statusFilter;
      const matchesDirection = directionFilter === 'all' || email.direction === directionFilter;

      return isInDateRange && matchesStatus && matchesDirection;
    });
  }, [processedEmails, startDate, endDate, statusFilter, directionFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Processed Emails</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View recently processed emails and their status</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Emails'}</span>
        </button>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h4>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              From Date
            </label>
            <DatePicker
              value={startDate}
              onChange={(val) => setStartDate(val)}
              placeholder="Select start date"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              To Date
            </label>
            <DatePicker
              value={endDate}
              onChange={(val) => setEndDate(val)}
              placeholder="Select end date"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <CustomDropdown
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as 'all' | 'completed' | 'failed' | 'processing')}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'completed', label: 'Completed' },
                { value: 'failed', label: 'Failed' },
                { value: 'processing', label: 'Processing' },
              ]}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Direction
            </label>
            <CustomDropdown
              value={directionFilter}
              onChange={(val) => setDirectionFilter(val as 'all' | 'inbound' | 'outbound')}
              options={[
                { value: 'all', label: 'All Directions' },
                { value: 'inbound', label: 'Inbound' },
                { value: 'outbound', label: 'Outbound' },
              ]}
            />
          </div>
          <div>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredEmails.length} of {processedEmails.length} emails
        </div>
      </div>

      {filteredEmails.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Emails Found</h3>
          <p className="text-gray-600 dark:text-gray-400">
            {processedEmails.length === 0
              ? 'Processed emails will appear here once email monitoring is active.'
              : 'No emails match the selected filters. Try adjusting your date range or status filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEmails.map((email) => (
            <div key={email.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
              <div className="grid grid-cols-[auto,auto,2fr,1.5fr,1fr,1fr,auto] gap-4 items-center">
                <div
                  className={`p-2 rounded-lg ${
                    email.direction === 'outbound'
                      ? 'bg-orange-100 dark:bg-orange-900/30'
                      : 'bg-emerald-100 dark:bg-emerald-900/30'
                  }`}
                  title={email.direction === 'outbound' ? 'Outbound' : 'Inbound'}
                >
                  {email.direction === 'outbound' ? (
                    <ArrowUpRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>

                <div>
                  {(() => {
                    const modeConfig = getProcessingModeConfig(email.processingMode);
                    if (!modeConfig) return <span className="inline-block w-20" />;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap ${modeConfig.classes}`}>
                        {modeConfig.icon}
                        {modeConfig.label}
                      </span>
                    );
                  })()}
                </div>

                <div className="min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={email.subject}>
                    {email.subject}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate" title={email.sender}>
                    From: {email.sender}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Received: {new Date(email.receivedDate).toLocaleString()}
                  </p>
                </div>

                <div className="text-sm min-w-0">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    PDF {email.attachmentCount && email.attachmentCount > 1 ? `Files (${email.attachmentCount}):` : 'File:'}
                  </span>
                  <p className="text-gray-600 dark:text-gray-400 truncate" title={formatFilenamesWithPages(email)}>
                    {formatFilenamesWithPages(email)}
                  </p>
                </div>

                <div className="text-sm min-w-0">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Processed:</span>
                  <p className="text-gray-600 dark:text-gray-400 truncate">
                    {email.processedAt ? new Date(email.processedAt).toLocaleString() : '-'}
                  </p>
                </div>

                <div className="min-w-0">
                  {email.errorMessage && (
                    <button
                      onClick={() => setSelectedError({ subject: email.subject, error: email.errorMessage! })}
                      className="w-full text-left flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                    >
                      <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <span className="text-red-700 dark:text-red-400 text-sm truncate">{email.errorMessage}</span>
                    </button>
                  )}
                </div>

                <div className={`px-3 py-1 rounded-full border text-xs font-medium flex items-center gap-1 whitespace-nowrap ${getStatusColor(email.processingStatus)}`}>
                  {getStatusIcon(email.processingStatus)}
                  <span className="capitalize">{email.processingStatus}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statistics */}
      {filteredEmails.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Processing Statistics (Filtered)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-700 dark:text-blue-400">Total:</span>
              <p className="text-blue-600 dark:text-blue-300">{filteredEmails.length}</p>
            </div>
            <div>
              <span className="font-medium text-blue-700 dark:text-blue-400">Completed:</span>
              <p className="text-blue-600 dark:text-blue-300">
                {filteredEmails.filter(e => e.processingStatus === 'completed').length}
              </p>
            </div>
            <div>
              <span className="font-medium text-blue-700 dark:text-blue-400">Failed:</span>
              <p className="text-blue-600 dark:text-blue-300">
                {filteredEmails.filter(e => e.processingStatus === 'failed').length}
              </p>
            </div>
            <div>
              <span className="font-medium text-blue-700 dark:text-blue-400">Processing:</span>
              <p className="text-blue-600 dark:text-blue-300">
                {filteredEmails.filter(e => e.processingStatus === 'processing').length}
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Error Details</h3>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Subject</label>
                <p className="text-gray-900 dark:text-gray-100 mt-1">{selectedError.subject}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Error Message</label>
                <div className="mt-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 max-h-[50vh] overflow-auto">
                  <pre className="text-red-700 dark:text-red-400 text-sm whitespace-pre-wrap break-words font-mono">
                    {selectedError.error}
                  </pre>
                </div>
              </div>
            </div>
            <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}