import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, Calendar, User, CheckCircle2, Eye, Copy, Check, ChevronLeft, FileText, Layers, Clock, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User as UserType, OrderEntryField } from '../types';
import StatusBadge from './common/StatusBadge';
import FieldTypeIcon from './common/FieldTypeIcon';
import JsonViewer from './common/JsonViewer';
import { useToast } from '../hooks/useToast';
import ToastContainer from './common/ToastContainer';
import { TableSkeleton, StatsSkeleton } from './common/Skeleton';
import { NoSubmissionsEmptyState, NoSearchResultsEmptyState } from './common/EmptyState';
import Select from './common/Select';

interface ClientSubmissionsPageProps {
  currentUser: UserType;
}

interface Submission {
  id: string;
  created_at: string;
  user_id: string;
  username: string;
  submission_status: string;
  api_response: any;
}

interface SubmissionDetail {
  id: string;
  created_at: string;
  user_id: string;
  username: string;
  submission_status: string;
  submission_data: any;
  error_message: string | null;
  pdf_id: string | null;
}

interface TimeStats {
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
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

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function ClientSubmissionsPage({ currentUser }: ClientSubmissionsPageProps) {
  const toast = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeStats, setTimeStats] = useState<TimeStats>({ thisWeek: 0, lastWeek: 0, thisMonth: 0 });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [clientUsers, setClientUsers] = useState<{ value: string; label: string }[]>([]);
  const [dateRange, setDateRange] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'data' | 'documents'>('data');
  const [submissionDocuments, setSubmissionDocuments] = useState<any[]>([]);
  const [fields, setFields] = useState<OrderEntryField[]>([]);

  useEffect(() => {
    loadSubmissions();
    loadTimeStats();
  }, [currentUser, searchQuery, statusFilter, userFilter, dateRange, currentPage]);

  useEffect(() => {
    loadClientUsers();
  }, [currentUser]);

  const loadClientUsers = async () => {
    if (!currentUser.clientId) return;
    const { data } = await supabase
      .from('users')
      .select('id, username')
      .eq('client_id', currentUser.clientId)
      .order('username', { ascending: true });
    const options = [{ value: 'all', label: 'All Users' }];
    (data || []).forEach((u: any) => {
      options.push({ value: u.id, label: u.username });
    });
    setClientUsers(options);
  };

  const getClientUserIds = async (): Promise<string[]> => {
    if (!currentUser.clientId) return [];
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('client_id', currentUser.clientId);
    return (data || []).map((u: any) => u.id);
  };

  const loadTimeStats = async () => {
    try {
      const userIds = await getClientUserIds();
      if (userIds.length === 0) {
        setTimeStats({ thisWeek: 0, lastWeek: 0, thisMonth: 0 });
        return;
      }

      const now = new Date();
      const startOfThisWeek = getStartOfWeek(now);
      const startOfLastWeek = new Date(startOfThisWeek);
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
      const startOfMonth = getStartOfMonth(now);

      const [thisWeekResult, lastWeekResult, thisMonthResult] = await Promise.all([
        supabase
          .from('order_entry_submissions')
          .select('id', { count: 'exact', head: true })
          .in('user_id', userIds)
          .gte('created_at', startOfThisWeek.toISOString()),
        supabase
          .from('order_entry_submissions')
          .select('id', { count: 'exact', head: true })
          .in('user_id', userIds)
          .gte('created_at', startOfLastWeek.toISOString())
          .lt('created_at', startOfThisWeek.toISOString()),
        supabase
          .from('order_entry_submissions')
          .select('id', { count: 'exact', head: true })
          .in('user_id', userIds)
          .gte('created_at', startOfMonth.toISOString())
      ]);

      setTimeStats({
        thisWeek: thisWeekResult.count || 0,
        lastWeek: lastWeekResult.count || 0,
        thisMonth: thisMonthResult.count || 0
      });
    } catch (error) {
      console.error('Failed to load time stats:', error);
    }
  };

  const loadSubmissions = async () => {
    try {
      setLoading(true);

      const userIds = await getClientUserIds();
      if (userIds.length === 0) {
        setSubmissions([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('order_entry_submissions')
        .select(`
          id,
          created_at,
          user_id,
          submission_status,
          api_response,
          users!order_entry_submissions_user_id_fkey (
            username
          )
        `, { count: 'exact' });

      if (userFilter && userFilter !== 'all') {
        query = query.eq('user_id', userFilter);
      } else {
        query = query.in('user_id', userIds);
      }

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('submission_status', statusFilter);
      }

      if (searchQuery) {
        query = query.or(`id.ilike.%${searchQuery}%`);
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
        query = query.gte('created_at', startDate.toISOString());
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

  const loadSubmissionDetail = async (submissionId: string) => {
    try {
      setDetailLoading(true);
      setDetailTab('data');

      const [submissionResult, fieldsResult, documentsResult] = await Promise.all([
        supabase
          .from('order_entry_submissions')
          .select(`
            id,
            created_at,
            user_id,
            submission_status,
            submission_data,
            error_message,
            pdf_id,
            users!order_entry_submissions_user_id_fkey (
              username
            )
          `)
          .eq('id', submissionId)
          .maybeSingle(),
        supabase
          .from('order_entry_fields')
          .select('*')
          .order('field_order', { ascending: true }),
        supabase
          .from('order_entry_submission_documents')
          .select('*')
          .eq('submission_id', submissionId)
          .order('created_at', { ascending: true })
      ]);

      if (submissionResult.error) throw submissionResult.error;
      if (!submissionResult.data) return;

      const detail: SubmissionDetail = {
        id: submissionResult.data.id,
        created_at: submissionResult.data.created_at,
        user_id: submissionResult.data.user_id,
        username: (submissionResult.data as any).users?.username || 'Unknown',
        submission_status: submissionResult.data.submission_status,
        submission_data: submissionResult.data.submission_data,
        error_message: submissionResult.data.error_message,
        pdf_id: submissionResult.data.pdf_id
      };

      setSelectedSubmission(detail);
      setFields(fieldsResult.data || []);
      setSubmissionDocuments(documentsResult.data || []);
    } catch (error) {
      console.error('Failed to load submission detail:', error);
      toast.error('Failed to load submission details');
    } finally {
      setDetailLoading(false);
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
    toast.success('Submission ID copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateRange('all');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (selectedSubmission) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSelectedSubmission(null)}
            className="inline-flex items-center px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Submission Details
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {selectedSubmission.id}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
              <StatusBadge status={selectedSubmission.submission_status} type="submission" size="lg" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Submitted By</p>
              <div className="flex items-center mt-1">
                <User className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {selectedSubmission.username}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Created</p>
              <div className="flex items-center mt-1">
                <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(selectedSubmission.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {selectedSubmission.error_message && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
            <div className="flex items-start">
              <div className="p-1 bg-red-100 dark:bg-red-900/50 rounded">
                <CheckCircle2 className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">Error</h3>
                <p className="text-sm text-red-700 dark:text-red-300">{selectedSubmission.error_message}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setDetailTab('data')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  detailTab === 'data'
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <FileText className="h-4 w-4 inline mr-1" />
                Submission Data
              </button>
              {submissionDocuments.length > 0 && (
                <button
                  onClick={() => setDetailTab('documents')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    detailTab === 'documents'
                      ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Layers className="h-4 w-4 inline mr-1" />
                  Documents ({submissionDocuments.length})
                </button>
              )}
            </nav>
          </div>

          <div className="p-6">
            {detailTab === 'data' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Submission Data</h3>
                {selectedSubmission.submission_data && typeof selectedSubmission.submission_data === 'object' ? (
                  <div className="space-y-3">
                    {Object.entries(selectedSubmission.submission_data).map(([key, value]) => {
                      const field = fields.find(f => f.fieldName === key);
                      return (
                        <div key={key} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-2">
                            {field && <FieldTypeIcon fieldType={field.fieldType} size="sm" />}
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {field?.fieldLabel || key}
                            </span>
                            {field && (
                              <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                {field.fieldType}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                            {typeof value === 'object' ? (
                              <JsonViewer data={value} name={key} />
                            ) : (
                              <span>{String(value)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No submission data available</p>
                )}
              </div>
            )}

            {detailTab === 'documents' && submissionDocuments.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Uploaded Documents</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Document Type</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Original File</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Status</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {submissionDocuments.map(doc => (
                        <tr key={doc.id}>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{doc.document_type_name}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{doc.original_file_name}</td>
                          <td className="px-4 py-3">
                            {doc.action_status === 'success' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">Success</span>
                            )}
                            {doc.action_status === 'pending' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">Pending</span>
                            )}
                            {doc.action_status === 'failed' && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">Failed</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {doc.storage_path ? (
                              <button
                                onClick={() => window.open(doc.storage_path, '_blank')}
                                className="inline-flex items-center justify-center p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title={`View ${doc.original_file_name}`}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">This Week</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {timeStats.thisWeek}
                </p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Last Week</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {timeStats.lastWeek}
                </p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">This Month</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {timeStats.thisMonth}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Calendar className="h-6 w-6 text-green-600 dark:text-green-400" />
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
                  placeholder="Search by submission ID..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                  showFilters
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </button>
              {showFilters && (
                <>
                  <Select
                    value={statusFilter}
                    onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
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
                    onValueChange={(val) => { setDateRange(val); setCurrentPage(1); }}
                    options={[
                      { value: 'all', label: 'All Time' },
                      { value: 'today', label: 'Today' },
                      { value: '7days', label: 'Last 7 Days' },
                      { value: '30days', label: 'Last 30 Days' },
                      { value: '90days', label: 'Last 90 Days' }
                    ]}
                    searchable={false}
                  />

                  {clientUsers.length > 2 && (
                    <Select
                      value={userFilter}
                      onValueChange={(val) => { setUserFilter(val); setCurrentPage(1); }}
                      options={clientUsers}
                      searchable={clientUsers.length > 5}
                    />
                  )}
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12">
                    <TableSkeleton rows={5} columns={6} />
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12">
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
                        <div className="flex-shrink-0 h-8 w-8 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                          <User className="h-4 w-4 text-orange-600 dark:text-orange-400" />
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => loadSubmissionDetail(submission.id)}
                        className="inline-flex items-center px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
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