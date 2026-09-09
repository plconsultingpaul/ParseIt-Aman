import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Filter, Download, Calendar, User, CheckCircle2, XCircle, Clock, TrendingUp, Eye, Copy, Check, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User as UserType } from '../types';
import StatusBadge from './common/StatusBadge';
import FieldTypeIcon, { FieldTypeBadge } from './common/FieldTypeIcon';
import { useKeyboardShortcuts, KeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { useToast } from '../hooks/useToast';
import ToastContainer from './common/ToastContainer';
import { TableSkeleton, StatsSkeleton } from './common/Skeleton';
import { NoSubmissionsEmptyState, NoSearchResultsEmptyState } from './common/EmptyState';
import Select from './common/Select';

interface OrderEntrySubmissionsPageProps {
  currentUser: UserType;
}

interface Submission {
  id: string;
  created_at: string;
  user_id: string;
  username: string;
  submission_status: string;
  api_status_code: number;
  workflow_status: string | null;
  pdf_id: string | null;
  error_message: string | null;
  api_response: any;
}

function getBillNumber(apiResponse: any): string | null {
  if (!apiResponse) return null;

  try {
    if (apiResponse.billNumber) return apiResponse.billNumber;
    if (apiResponse.orders && Array.isArray(apiResponse.orders) && apiResponse.orders.length > 0) {
      if (apiResponse.orders[0].billNumber) return apiResponse.orders[0].billNumber;
    }
    if (apiResponse.data?.orders && Array.isArray(apiResponse.data.orders) && apiResponse.data.orders.length > 0) {
      if (apiResponse.data.orders[0].billNumber) return apiResponse.data.orders[0].billNumber;
    }
    if (apiResponse.result?.billNumber) return apiResponse.result.billNumber;
  } catch {
    return null;
  }

  return null;
}

interface Statistics {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  successRate: number;
}

export default function OrderEntrySubmissionsPage({ currentUser }: OrderEntrySubmissionsPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics>({
    total: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    successRate: 0
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  useEffect(() => {
    const status = searchParams.get('status') || 'all';
    const range = searchParams.get('dateRange') || 'all';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '25');

    setStatusFilter(status);
    setDateRange(range);
    setSearchQuery(search);
    setCurrentPage(page);
    setItemsPerPage(pageSize);
    setInitialLoadDone(true);
  }, []);

  useEffect(() => {
    if (!initialLoadDone) return;

    const params: Record<string, string> = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (dateRange !== 'all') params.dateRange = dateRange;
    if (searchQuery) params.search = searchQuery;
    if (currentPage !== 1) params.page = currentPage.toString();
    if (itemsPerPage !== 25) params.pageSize = itemsPerPage.toString();

    setSearchParams(params, { replace: true });
  }, [statusFilter, dateRange, searchQuery, currentPage, itemsPerPage, initialLoadDone]);

  useEffect(() => {
    if (!currentUser.isAdmin || !initialLoadDone) {
      return;
    }
    loadSubmissions();
    loadStatistics();
  }, [currentUser, searchQuery, statusFilter, dateRange, currentPage, itemsPerPage, initialLoadDone]);

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'k',
      ctrlKey: true,
      callback: () => searchInputRef.current?.focus(),
      description: 'Focus search input'
    },
    {
      key: '/',
      callback: () => {
        const target = document.activeElement as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          searchInputRef.current?.focus();
        }
      },
      description: 'Focus search input (alternative)'
    },
    {
      key: 'f',
      ctrlKey: true,
      callback: () => setShowFilters(!showFilters),
      description: 'Toggle filters panel'
    }
  ];

  useKeyboardShortcuts(shortcuts);

  const loadStatistics = async () => {
    try {
      const { data, error } = await supabase
        .from('order_entry_submissions')
        .select('submission_status', { count: 'exact' });

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        completed: data?.filter(s => s.submission_status === 'completed').length || 0,
        failed: data?.filter(s => s.submission_status === 'failed').length || 0,
        pending: data?.filter(s => s.submission_status === 'pending').length || 0,
        successRate: 0
      };

      stats.successRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
      setStatistics(stats);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      toast.info('Loading submissions...');

      let query = supabase
        .from('order_entry_submissions')
        .select(`
          id,
          created_at,
          user_id,
          submission_status,
          api_status_code,
          api_response,
          pdf_id,
          error_message,
          workflow_execution_log_id,
          workflow_v2_execution_log_id,
          users!order_entry_submissions_user_id_fkey (
            username
          ),
          workflow_execution_logs (
            status
          ),
          workflow_v2_execution_logs (
            status
          )
        `, { count: 'exact' });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('submission_status', statusFilter);
      }

      if (searchQuery) {
        query = query.or(`id.ilike.%${searchQuery}%,users.username.ilike.%${searchQuery}%`);
      }

      if (dateRange !== 'all') {
        const now = new Date();
        let startDate = new Date();

        switch (dateRange) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case '7days':
            startDate.setDate(now.getDate() - 7);
            break;
          case '30days':
            startDate.setDate(now.getDate() - 30);
            break;
          case '90days':
            startDate.setDate(now.getDate() - 90);
            break;
        }

        if (dateRange !== 'all') {
          query = query.gte('created_at', startDate.toISOString());
        }
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const formattedSubmissions: Submission[] = (data || []).map((item: any) => ({
        id: item.id,
        created_at: item.created_at,
        user_id: item.user_id,
        username: item.users?.username || 'Unknown',
        submission_status: item.submission_status,
        api_status_code: item.api_status_code,
        workflow_status: item.workflow_execution_logs?.status || item.workflow_v2_execution_logs?.status || null,
        pdf_id: item.pdf_id,
        error_message: item.error_message,
        api_response: item.api_response
      }));

      setSubmissions(formattedSubmissions);
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error('Failed to load submissions:', error);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('Submission ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateRange('all');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (!currentUser.isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Order Submissions
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track and manage all order entry submissions
          </p>
        </div>
      </div>

      <FieldTypeLegend />

      {loading ? (
        <StatsSkeleton />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Submissions</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {statistics.total}
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                {statistics.successRate.toFixed(1)}%
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Failed</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
                {statistics.failed}
              </p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                {statistics.pending}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by ID or username... (Ctrl+K or /)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  title="Press Ctrl/Cmd + K or / to focus"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                  showFilters
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
                title="Toggle filters (Ctrl/Cmd + F)"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                <span className="ml-2 text-xs opacity-75 font-mono">(⌘F)</span>
              </button>
              {showFilters && (
                <>
                  <Select
                    value={statusFilter}
                    onValueChange={setStatusFilter}
                    options={[
                      { value: 'all', label: 'All Status' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'failed', label: 'Failed' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'processing', label: 'Processing' }
                    ]}
                    searchable={false}
                  />

                  <Select
                    value={dateRange}
                    onValueChange={setDateRange}
                    options={[
                      { value: 'all', label: 'All Time' },
                      { value: 'today', label: 'Today' },
                      { value: '7days', label: 'Last 7 Days' },
                      { value: '30days', label: 'Last 30 Days' },
                      { value: '90days', label: 'Last 90 Days' }
                    ]}
                    searchable={false}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date/Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Bill #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Submission ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  API Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Workflow
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    <TableSkeleton rows={5} columns={6} />
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12">
                    {searchQuery || statusFilter !== 'all' || dateRange !== 'all' ? (
                      <NoSearchResultsEmptyState onClear={handleClearFilters} />
                    ) : (
                      <NoSubmissionsEmptyState />
                    )}
                  </td>
                </tr>
              ) : (
                submissions.map((submission) => (
                  <tr
                    key={submission.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(submission.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                          <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {submission.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getBillNumber(submission.api_response) ? (
                        <span className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {getBillNumber(submission.api_response)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                          {submission.id.slice(0, 8)}...
                        </code>
                        <button
                          onClick={() => handleCopyId(submission.id)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        >
                          {copiedId === submission.id ? (
                            <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={submission.submission_status} type="submission" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={String(submission.api_status_code)} type="api" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge
                        status={submission.workflow_status || 'none'}
                        type="workflow"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => navigate(`/order-entry/submissions/${submission.id}`)}
                        className="inline-flex items-center px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
    </div>
  );
}

function FieldTypeLegend() {
  const [isExpanded, setIsExpanded] = useState(false);

  const fieldTypes = [
    { type: 'text', label: 'Text Field', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' },
    { type: 'number', label: 'Number Field', color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700' },
    { type: 'date', label: 'Date Field', color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700' },
    { type: 'phone', label: 'Phone Field', color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700' },
    { type: 'dropdown', label: 'Dropdown', color: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700' },
    { type: 'file', label: 'File Upload', color: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-700' },
    { type: 'boolean', label: 'Checkbox', color: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700' },
    { type: 'array', label: 'Array/Repeating', color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' }
  ];

  return (
    <div
      className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden shadow-sm"
      role="region"
      aria-labelledby="field-type-legend-title"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="field-type-legend-content"
        aria-label={`${isExpanded ? 'Hide' : 'Show'} field type reference guide`}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
          <div className="text-left">
            <h3 id="field-type-legend-title" className="text-base font-bold text-blue-900 dark:text-blue-300">
              Field Type Reference Guide
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
              {isExpanded ? 'Hide' : 'Show'} visual guide for all {fieldTypes.length} field types
            </p>
          </div>
        </div>
        <div className={`transform transition-transform duration-200 ${
          isExpanded ? 'rotate-180' : ''
        }`}>
          <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div
          id="field-type-legend-content"
          className="px-6 pb-6 pt-4 border-t border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" role="list" aria-label="Field type list">
            {fieldTypes.map(({ type, label, color }) => (
              <div
                key={type}
                className={`flex items-center space-x-3 p-4 rounded-lg border-2 transition-all hover:scale-105 hover:shadow-md ${color}`}
                role="listitem"
                aria-label={`${label} field type`}
              >
                <div className="flex-shrink-0">
                  <FieldTypeIcon fieldType={type} size="md" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 block">
                    {label}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                    {type}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <p className="text-sm text-blue-900 dark:text-blue-300 font-medium mb-1">
              How to use this guide:
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              These color-coded icons appear throughout the application - in forms, configuration pages, and submission details - to help you quickly identify field types at a glance.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
