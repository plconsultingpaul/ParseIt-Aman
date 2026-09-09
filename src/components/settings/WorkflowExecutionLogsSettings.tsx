import React, { useState, useEffect, useMemo } from 'react';
import { GitBranch, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Eye, Calendar, Timer, Play, X, Copy, Database, Check, ChevronDown, ChevronRight, User as UserIcon, Filter, PauseCircle } from 'lucide-react';
import { fetchWorkflowExecutionLogById, fetchWorkflowStepLogsByExecutionId, fetchWorkflowExecutionLogsByDateRange, type WorkflowStepLog } from '../../services/logService';
import { supabase } from '../../lib/supabase';
import CustomDropdown from '../common/CustomDropdown';
import DatePicker from '../common/DatePicker';
import type { WorkflowExecutionLog, ExtractionWorkflow, WorkflowStep, User, ExtractionType, TransformationType } from '../../types';

interface WorkflowExecutionLogsSettingsProps {
  workflowExecutionLogs: WorkflowExecutionLog[];
  workflows: ExtractionWorkflow[];
  workflowSteps: WorkflowStep[];
  users: User[];
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  onRefreshWorkflowLogs: () => Promise<WorkflowExecutionLog[]>;
}

export default function WorkflowExecutionLogsSettings({
  workflowExecutionLogs,
  workflows,
  workflowSteps,
  users,
  extractionTypes,
  transformationTypes,
  onRefreshWorkflowLogs
}: WorkflowExecutionLogsSettingsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [loadingContextData, setLoadingContextData] = useState(false);
  const [expandedLogData, setExpandedLogData] = useState<WorkflowExecutionLog | null>(null);
  const [stepLogs, setStepLogs] = useState<WorkflowStepLog[]>([]);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [isContextCollapsed, setIsContextCollapsed] = useState(true);
  const [v2WorkflowNames, setV2WorkflowNames] = useState<Record<string, string>>({});
  const [executeButtonNames, setExecuteButtonNames] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [dateRangeLogs, setDateRangeLogs] = useState<WorkflowExecutionLog[] | null>(null);
  const [isFetchingDateRange, setIsFetchingDateRange] = useState(false);

  useEffect(() => {
    if (!filterFromDate && !filterToDate) {
      setDateRangeLogs(null);
      return;
    }
    let cancelled = false;
    setIsFetchingDateRange(true);
    const handle = setTimeout(async () => {
      try {
        const results = await fetchWorkflowExecutionLogsByDateRange(
          filterFromDate || null,
          filterToDate || null
        );
        if (!cancelled) setDateRangeLogs(results);
      } catch (err) {
        console.error('Failed to fetch workflow logs by date range:', err);
        if (!cancelled) setDateRangeLogs([]);
      } finally {
        if (!cancelled) setIsFetchingDateRange(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filterFromDate, filterToDate]);

  const sourceLogs = dateRangeLogs ?? workflowExecutionLogs;

  useEffect(() => {
    (async () => {
      try {
        const [wfResult, ebResult] = await Promise.all([
          supabase.from('workflows_v2').select('id, name'),
          supabase.from('execute_buttons').select('id, name')
        ]);
        if (wfResult.data) {
          const map: Record<string, string> = {};
          wfResult.data.forEach(w => { map[w.id] = w.name; });
          setV2WorkflowNames(map);
        }
        if (ebResult.data) {
          const map: Record<string, string> = {};
          ebResult.data.forEach(b => { map[b.id] = b.name; });
          setExecuteButtonNames(map);
        }
      } catch (_e) { /* best effort */ }
    })();
  }, [workflowExecutionLogs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshWorkflowLogs();
    } catch (error) {
      console.error('Failed to refresh workflow logs:', error);
      alert('Failed to refresh workflow execution logs. Please try again.');
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
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'paused_at_inbox':
        return <PauseCircle className="h-4 w-4 text-amber-600" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'paused_at_inbox') return 'Paused';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'running':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'paused_at_inbox':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getWorkflowName = (log: WorkflowExecutionLog) => {
    if (log.processingMode === 'execute') {
      return executeButtonNames[log.workflowId] || `Execute Button`;
    }
    const workflow = workflows.find(w => w.id === log.workflowId);
    if (workflow) return workflow.name;
    if (v2WorkflowNames[log.workflowId]) return v2WorkflowNames[log.workflowId];
    return `Unknown Workflow (${log.workflowId.substring(0, 8)}...)`;
  };

  const getUserName = (userId: string | undefined) => {
    if (!userId) return 'System';
    const user = users.find(u => u.id === userId);
    return user?.username || 'Unknown';
  };

  const getTypeName = (log: WorkflowExecutionLog) => {
    if (log.processingMode === 'execute') {
      return executeButtonNames[log.workflowId] || 'Execute Button';
    } else if (log.processingMode === 'imaging') {
      return v2WorkflowNames[log.workflowId] || 'Imaging Workflow';
    } else if (log.processingMode === 'transformation' && log.transformationTypeId) {
      const type = transformationTypes.find(t => t.id === log.transformationTypeId);
      return type?.name || 'Unknown';
    } else if (log.extractionTypeId) {
      const type = extractionTypes.find(t => t.id === log.extractionTypeId);
      return type?.name || 'Unknown';
    }
    return 'N/A';
  };

  const toggleLogExpansion = async (logId: string) => {
    if (expandedLogId === logId) {
      // Collapsing
      setExpandedLogId(null);
      setExpandedLogData(null);
      setStepLogs([]);
      setExpandedStepIds(new Set());
      setIsContextCollapsed(true);
    } else {
      // Expanding
      setExpandedLogId(logId);
      setLoadingContextData(true);
      setIsContextCollapsed(true);

      try {
        const [fullLogData, stepLogsData] = await Promise.all([
          fetchWorkflowExecutionLogById(logId),
          fetchWorkflowStepLogsByExecutionId(logId)
        ]);
        setExpandedLogData(fullLogData);
        setStepLogs(stepLogsData);
      } catch (error) {
        console.error('Error fetching log details:', error);
        alert('Failed to load log details. Please try again.');
      } finally {
        setLoadingContextData(false);
      }
    }
    setCopySuccess(false);
  };

  const toggleStepExpansion = (stepLogId: string) => {
    setExpandedStepIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepLogId)) {
        newSet.delete(stepLogId);
      } else {
        newSet.add(stepLogId);
      }
      return newSet;
    });
  };

  const toggleContextCollapse = () => {
    setIsContextCollapsed(prev => !prev);
  };

  const getExecutionTime = (log: WorkflowExecutionLog) => {
    if (!log.completedAt) return 'N/A';
    const start = new Date(log.startedAt).getTime();
    const end = new Date(log.completedAt).getTime();
    const duration = end - start;
    return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
  };

  const handleCopyContextData = async () => {
    if (!expandedLogData?.contextData) return;
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(expandedLogData.contextData, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(expandedLogData.contextData, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const statusOptions = useMemo(() => [
    { value: '', label: 'All Statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'running', label: 'Running' },
    { value: 'paused_at_inbox', label: 'Paused' },
    { value: 'pending', label: 'Pending' },
  ], []);

  const userOptions = useMemo(() => {
    const activeUserIds = new Set(sourceLogs.map(l => l.userId).filter(Boolean));
    const opts = [{ value: '', label: 'All Users' }];
    users.filter(u => activeUserIds.has(u.id)).forEach(u => {
      opts.push({ value: u.id, label: u.username || u.email || u.id });
    });
    if (activeUserIds.has(undefined as any) || sourceLogs.some(l => !l.userId)) {
      opts.push({ value: '__system__', label: 'System' });
    }
    return opts;
  }, [sourceLogs, users]);

  const modeOptions = useMemo(() => [
    { value: '', label: 'All Modes' },
    { value: 'extraction', label: 'Extract' },
    { value: 'transformation', label: 'Transform' },
    { value: 'execute', label: 'Execute' },
    { value: 'imaging', label: 'Imaging' },
  ], []);

  const typeOptions = useMemo(() => {
    const opts = [{ value: '', label: 'All Types' }];

    const activeExtractionIds = new Set(sourceLogs.filter(l => l.processingMode === 'extraction').map(l => l.extractionTypeId).filter(Boolean));
    const activeTransformationIds = new Set(sourceLogs.filter(l => l.processingMode === 'transformation').map(l => l.transformationTypeId).filter(Boolean));
    const activeExecuteIds = new Set(sourceLogs.filter(l => l.processingMode === 'execute').map(l => l.workflowId).filter(Boolean));
    const activeImagingIds = new Set(sourceLogs.filter(l => l.processingMode === 'imaging').map(l => l.workflowId).filter(Boolean));

    if (!filterMode || filterMode === 'extraction') {
      extractionTypes.forEach(t => {
        if (!filterMode || activeExtractionIds.has(t.id)) {
          opts.push({ value: `ext:${t.id}`, label: t.name });
        }
      });
    }
    if (!filterMode || filterMode === 'transformation') {
      transformationTypes.forEach(t => {
        if (!filterMode || activeTransformationIds.has(t.id)) {
          opts.push({ value: `trans:${t.id}`, label: t.name });
        }
      });
    }
    if (!filterMode || filterMode === 'execute') {
      const ids = filterMode ? Array.from(activeExecuteIds) : Object.keys(executeButtonNames);
      ids.forEach(id => {
        const label = executeButtonNames[id as string];
        if (label) opts.push({ value: `exec:${id}`, label });
      });
    }
    if (!filterMode || filterMode === 'imaging') {
      const ids = filterMode ? Array.from(activeImagingIds) : Object.keys(v2WorkflowNames);
      ids.forEach(id => {
        const label = v2WorkflowNames[id as string];
        if (label) opts.push({ value: `imag:${id}`, label });
      });
    }

    return opts;
  }, [extractionTypes, transformationTypes, executeButtonNames, v2WorkflowNames, sourceLogs, filterMode]);

  useEffect(() => {
    if (!filterType || !filterMode) return;
    const prefix = filterType.split(':')[0];
    const expected =
      filterMode === 'extraction' ? 'ext' :
      filterMode === 'transformation' ? 'trans' :
      filterMode === 'execute' ? 'exec' :
      filterMode === 'imaging' ? 'imag' : null;
    if (expected && prefix !== expected) {
      setFilterType('');
    }
  }, [filterMode, filterType]);

  const filteredLogs = useMemo(() => {
    return sourceLogs.filter(log => {
      if (filterStatus && log.status !== filterStatus) return false;
      if (filterUser) {
        if (filterUser === '__system__') {
          if (log.userId) return false;
        } else if (log.userId !== filterUser) return false;
      }
      if (filterMode && log.processingMode !== filterMode) return false;
      if (filterType) {
        if (filterType.startsWith('ext:')) {
          if (log.extractionTypeId !== filterType.slice(4)) return false;
        } else if (filterType.startsWith('trans:')) {
          if (log.transformationTypeId !== filterType.slice(6)) return false;
        } else if (filterType.startsWith('exec:')) {
          if (log.processingMode !== 'execute' || log.workflowId !== filterType.slice(5)) return false;
        } else if (filterType.startsWith('imag:')) {
          if (log.processingMode !== 'imaging' || log.workflowId !== filterType.slice(5)) return false;
        }
      }
      if (filterFromDate) {
        const [fy, fm, fd] = filterFromDate.split('-').map(Number);
        const from = new Date(fy, (fm || 1) - 1, fd || 1, 0, 0, 0, 0);
        if (new Date(log.startedAt) < from) return false;
      }
      if (filterToDate) {
        const [ty, tm, td] = filterToDate.split('-').map(Number);
        const to = new Date(ty, (tm || 1) - 1, td || 1, 23, 59, 59, 999);
        if (new Date(log.startedAt) > to) return false;
      }
      return true;
    });
  }, [sourceLogs, filterStatus, filterUser, filterMode, filterType, filterFromDate, filterToDate]);

  const hasActiveFilters = filterStatus || filterUser || filterMode || filterType || filterFromDate || filterToDate;

  const clearFilters = () => {
    setFilterStatus('');
    setFilterUser('');
    setFilterMode('');
    setFilterType('');
    setFilterFromDate('');
    setFilterToDate('');
  };

  const totalExecutions = filteredLogs.length;
  const completedExecutions = filteredLogs.filter(log => log.status === 'completed').length;
  const failedExecutions = filteredLogs.filter(log => log.status === 'failed').length;
  const runningExecutions = filteredLogs.filter(log => log.status === 'running').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Workflow Execution Logs</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor workflow execution progress and results</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {/* Statistics Cards */}
      {totalExecutions > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Play className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Executions</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totalExecutions}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{completedExecutions}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Failed</span>
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{failedExecutions}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Running</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{runningExecutions}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <CustomDropdown
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusOptions}
              size="sm"
              placeholder="All Statuses"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">User</label>
            <CustomDropdown
              value={filterUser}
              onChange={setFilterUser}
              options={userOptions}
              size="sm"
              placeholder="All Users"
              searchable
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Mode</label>
            <CustomDropdown
              value={filterMode}
              onChange={setFilterMode}
              options={modeOptions}
              size="sm"
              placeholder="All Modes"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <CustomDropdown
              value={filterType}
              onChange={setFilterType}
              options={typeOptions}
              size="sm"
              placeholder="All Types"
              searchable
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Started From</label>
            <DatePicker
              value={filterFromDate}
              onChange={setFilterFromDate}
              placeholder="Start date"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Started To</label>
            <DatePicker
              value={filterToDate}
              onChange={setFilterToDate}
              placeholder="End date"
            />
          </div>
        </div>
      </div>

      {/* Execution Logs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden w-full">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Recent Workflow Executions</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {filteredLogs.length} execution{filteredLogs.length !== 1 ? 's' : ''}{hasActiveFilters ? ` (of ${sourceLogs.length} total)` : ' recorded'}
            {isFetchingDateRange && <span className="ml-2 text-blue-600 dark:text-blue-400">Loading date range...</span>}
          </p>
        </div>
        
        <div className="overflow-x-auto w-full">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                  Workflow
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">
                  Mode
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-44">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">
                  Notifications
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLogs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap w-28">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                        {getStatusIcon(log.status)}
                        <span className="ml-1">{getStatusLabel(log.status)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 w-40">
                      <div className="flex items-center space-x-2">
                        <GitBranch className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate" title={getWorkflowName(log)}>
                          {getWorkflowName(log)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap w-32">
                      <div className="flex items-center space-x-2">
                        <UserIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate" title={getUserName(log.userId)}>
                          {getUserName(log.userId)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap w-28">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.processingMode === 'transformation'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                          : log.processingMode === 'execute'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                          : log.processingMode === 'imaging'
                          ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                      }`}>
                        {log.processingMode === 'transformation' ? 'Transform' : log.processingMode === 'execute' ? 'Execute' : log.processingMode === 'imaging' ? 'Imaging' : 'Extract'}
                      </span>
                    </td>
                    <td className="px-6 py-4 w-40">
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate block" title={getTypeName(log)}>
                        {getTypeName(log)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap w-44">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{formatDate(log.startedAt)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap w-24">
                      <div className="flex items-center space-x-2">
                        <Timer className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{getExecutionTime(log)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap w-28">
                      <div className="flex flex-col gap-1">
                        {log.successNotificationSent && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                            ✓ Success
                          </span>
                        )}
                        {log.failureNotificationSent && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">
                            ✓ Failure
                          </span>
                        )}
                        {!log.successNotificationSent && !log.failureNotificationSent && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap w-32">
                      <button
                        onClick={() => toggleLogExpansion(log.id)}
                        className={`text-sm font-medium flex items-center space-x-1 whitespace-nowrap transition-colors duration-200 ${
                          log.errorMessage
                            ? 'text-red-600 hover:text-red-800'
                            : 'text-blue-600 hover:text-blue-800'
                        }`}
                      >
                        {expandedLogId === log.id ? (
                          <>
                            <X className="h-4 w-4" />
                            <span>Hide Details</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4" />
                            <span>View Details</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>

                  {expandedLogId === log.id && (
                    <tr>
                      <td colSpan={9} className="px-0 py-0">
                        {loadingContextData ? (
                          <div className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 p-6">
                            <div className="flex items-center justify-center space-x-2">
                              <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                              <span className="text-gray-600 dark:text-gray-400">Loading log details...</span>
                            </div>
                          </div>
                        ) : expandedLogData ? (
                          <div className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                            <div className="p-6 space-y-6">
                              {/* Execution Summary */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                                    <Play className="h-5 w-5 text-purple-600" />
                                    <span>Execution Summary</span>
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Status:</span>
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(expandedLogData.status)}`}>
                                        {getStatusIcon(expandedLogData.status)}
                                        <span className="ml-1">{getStatusLabel(expandedLogData.status)}</span>
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Started:</span>
                                      <span className="text-gray-900 dark:text-gray-100">{formatDate(expandedLogData.startedAt)}</span>
                                    </div>
                                    {expandedLogData.completedAt && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-400">Completed:</span>
                                        <span className="text-gray-900 dark:text-gray-100">{formatDate(expandedLogData.completedAt)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                                      <span className="text-gray-900 dark:text-gray-100">{getExecutionTime(expandedLogData)}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                                    <GitBranch className="h-5 w-5 text-blue-600" />
                                    <span>Processing Details</span>
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Workflow:</span>
                                      <span className="text-gray-900 dark:text-gray-100">{getWorkflowName(expandedLogData)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">User:</span>
                                      <span className="text-gray-900 dark:text-gray-100">{getUserName(expandedLogData.userId)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Mode:</span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        expandedLogData.processingMode === 'transformation'
                                          ? 'bg-orange-100 text-orange-800'
                                          : expandedLogData.processingMode === 'execute'
                                          ? 'bg-amber-100 text-amber-800'
                                          : expandedLogData.processingMode === 'imaging'
                                          ? 'bg-cyan-100 text-cyan-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {expandedLogData.processingMode === 'transformation' ? 'Transform' : expandedLogData.processingMode === 'execute' ? 'Execute' : expandedLogData.processingMode === 'imaging' ? 'Imaging' : 'Extract'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600 dark:text-gray-400">Type:</span>
                                      <span className="text-gray-900 dark:text-gray-100">{getTypeName(expandedLogData)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Error Message */}
                              {expandedLogData.errorMessage && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <XCircle className="h-5 w-5 text-red-600" />
                                    <h4 className="font-medium text-red-800 dark:text-red-300">Error Details</h4>
                                  </div>
                                  <p className="text-red-700 dark:text-red-400 text-sm whitespace-pre-wrap">{expandedLogData.errorMessage}</p>
                                </div>
                              )}

                              {/* Workflow Steps Progress */}
                              <div>
                                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                                  <GitBranch className="h-5 w-5 text-purple-600" />
                                  <span>Workflow Steps Execution</span>
                                  <span className="text-sm text-gray-600 dark:text-gray-400">({stepLogs.length} step{stepLogs.length !== 1 ? 's' : ''})</span>
                                </h4>
                                <div className="space-y-2">
                                  {stepLogs.length > 0 ? (
                                    stepLogs.map((stepLog) => {
                                      const isExpanded = expandedStepIds.has(stepLog.id);
                                      const statusColor =
                                        stepLog.status === 'completed' ? 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700' :
                                        stepLog.status === 'failed' ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700' :
                                        stepLog.status === 'running' ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700' :
                                        stepLog.status === 'skipped' ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700' :
                                        'border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-600';

                                      const badgeColor =
                                        stepLog.status === 'completed' ? 'bg-green-200 text-green-800' :
                                        stepLog.status === 'failed' ? 'bg-red-200 text-red-800' :
                                        stepLog.status === 'running' ? 'bg-blue-200 text-blue-800' :
                                        stepLog.status === 'skipped' ? 'bg-yellow-200 text-yellow-800' :
                                        'bg-gray-200 text-gray-600';

                                      return (
                                        <div
                                          key={stepLog.id}
                                          className={`rounded-lg border-2 ${statusColor}`}
                                        >
                                          <div className="p-3 cursor-pointer hover:opacity-80" onClick={() => toggleStepExpansion(stepLog.id)}>
                                            <div className="flex items-center space-x-3">
                                              {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-600" /> : <ChevronRight className="h-4 w-4 text-gray-600" />}
                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${badgeColor}`}>
                                                {stepLog.stepOrder}
                                              </div>
                                              <div className="flex-1">
                                                <h5 className="font-medium text-gray-900 dark:text-gray-100">{stepLog.stepName}</h5>
                                                <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-400">
                                                  <span className="capitalize">{stepLog.stepType.replace('_', ' ')}</span>
                                                  {stepLog.durationMs !== null && (
                                                    <span className="text-xs">• {stepLog.durationMs < 1000 ? `${stepLog.durationMs}ms` : `${(stepLog.durationMs / 1000).toFixed(1)}s`}</span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="flex items-center space-x-2">
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${badgeColor}`}>
                                                  {stepLog.status}
                                                </span>
                                                {stepLog.status === 'failed' && <XCircle className="h-5 w-5 text-red-600" />}
                                                {stepLog.status === 'running' && <Clock className="h-5 w-5 text-blue-600 animate-pulse" />}
                                                {stepLog.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
                                                {stepLog.status === 'skipped' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
                                              </div>
                                            </div>
                                          </div>

                                          {isExpanded && (
                                            <div className="border-t border-gray-300 dark:border-gray-600 p-4 bg-white/50 dark:bg-gray-800/50 space-y-3">
                                              <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                  <span className="text-gray-600 dark:text-gray-400">Started:</span>
                                                  <p className="text-gray-900 dark:text-gray-100 font-medium">{formatDate(stepLog.startedAt)}</p>
                                                </div>
                                                {stepLog.completedAt && (
                                                  <div>
                                                    <span className="text-gray-600 dark:text-gray-400">Completed:</span>
                                                    <p className="text-gray-900 dark:text-gray-100 font-medium">{formatDate(stepLog.completedAt)}</p>
                                                  </div>
                                                )}
                                              </div>

                                              {stepLog.errorMessage && (
                                                <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-3">
                                                  <h6 className="font-medium text-red-800 dark:text-red-300 mb-1">Error:</h6>
                                                  <p className="text-sm text-red-700 dark:text-red-400">{stepLog.errorMessage}</p>
                                                </div>
                                              )}

                                              {stepLog.inputData && Object.keys(stepLog.inputData).length > 0 && (
                                                <div>
                                                  <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Input Data:</h6>
                                                  <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 max-h-48 overflow-auto">
                                                    <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                                      {JSON.stringify(stepLog.inputData?.config || stepLog.inputData, null, 2)}
                                                    </pre>
                                                  </div>
                                                </div>
                                              )}

                                              {stepLog.inputData?.extractedData && (
                                                <div>
                                                  <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Extracted Data:</h6>
                                                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded p-3 max-h-64 overflow-auto">
                                                    <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                                      {JSON.stringify(stepLog.inputData.extractedData, null, 2)}
                                                    </pre>
                                                  </div>
                                                </div>
                                              )}

                                              {stepLog.inputData?.resolvedRequestBody && (
                                                <div>
                                                  <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Resolved Request Body:</h6>
                                                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-3 max-h-64 overflow-auto">
                                                    <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                                      {(() => {
                                                        try {
                                                          return JSON.stringify(JSON.parse(stepLog.inputData.resolvedRequestBody), null, 2);
                                                        } catch {
                                                          return stepLog.inputData.resolvedRequestBody;
                                                        }
                                                      })()}
                                                    </pre>
                                                  </div>
                                                </div>
                                              )}

                                              {stepLog.outputData && Object.keys(stepLog.outputData).length > 0 && (
                                                <div>
                                                  <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Output Data:</h6>
                                                  <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 max-h-48 overflow-auto">
                                                    <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                                      {(() => {
                                                        const { _responseDataMappings, ...rest } = stepLog.outputData || {};
                                                        return JSON.stringify(rest, null, 2);
                                                      })()}
                                                    </pre>
                                                  </div>
                                                </div>
                                              )}

                                              {stepLog.outputData?._responseDataMappings && Object.keys(stepLog.outputData._responseDataMappings).length > 0 && (
                                                <div>
                                                  <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Response Data Mappings:</h6>
                                                  <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded p-3 max-h-64 overflow-auto">
                                                    <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                                      {JSON.stringify(stepLog.outputData._responseDataMappings, null, 2)}
                                                    </pre>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                                      <p>No step execution logs found</p>
                                      <p className="text-sm mt-1">Step logs will appear here once workflow steps execute</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Context Data */}
                              {expandedLogData.contextData && (
                                <div className="rounded-lg border-2 border-purple-300 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-700">
                                  <div
                                    className="p-3 cursor-pointer hover:opacity-80 flex items-center justify-between"
                                    onClick={toggleContextCollapse}
                                  >
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                                      {isContextCollapsed ? <ChevronRight className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
                                      <Database className="h-5 w-5 text-purple-600" />
                                      <span>Execution Context</span>
                                    </h4>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyContextData();
                                      }}
                                      className={`px-3 py-1 rounded text-sm font-medium transition-colors flex items-center space-x-1 ${
                                        copySuccess
                                          ? 'bg-green-600 text-white'
                                          : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                      }`}
                                    >
                                      {copySuccess ? (
                                        <>
                                          <Check className="w-4 h-4" />
                                          <span>Copied!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-4 h-4" />
                                          <span>Copy Context</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  {!isContextCollapsed && (
                                    <div className="border-t border-purple-300 dark:border-purple-700 p-4 bg-white/50 dark:bg-gray-800/50">
                                      <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono break-words overflow-x-auto">
                                        {JSON.stringify(expandedLogData.contextData, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 p-6">
                            <div className="text-center text-gray-600 dark:text-gray-400">
                              Failed to load log details. Please try again.
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <GitBranch className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              {hasActiveFilters ? 'No Matching Executions' : 'No Workflow Executions'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {hasActiveFilters
                ? 'No workflow executions match your current filters.'
                : 'Workflow execution logs will appear here once workflows start running.'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
              >
                <X className="h-4 w-4" />
                <span>Clear Filters</span>
              </button>
            ) : (
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Check for Logs</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 mb-2">Workflow Execution Information</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Each workflow execution is logged with detailed progress tracking</li>
          <li>• View step-by-step execution progress and identify where failures occur</li>
          <li>• Context data shows the current state of data at each step</li>
          <li>• Failed executions include detailed error messages for troubleshooting</li>
          <li>• Execution logs are automatically created when workflows are triggered</li>
        </ul>
      </div>
    </div>
  );
}