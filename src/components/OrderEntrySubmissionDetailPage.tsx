import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw, FileText, Code, Workflow, AlertTriangle, CheckCircle2, Clock, User, Calendar, Layers, ArrowRight, GitCompare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User as UserType, OrderEntryField } from '../types';
import StatusBadge from './common/StatusBadge';
import JsonViewer from './common/JsonViewer';
import FieldTypeIcon from './common/FieldTypeIcon';
import { CardSkeleton, JsonSkeleton } from './common/Skeleton';
import { NoWorkflowEmptyState } from './common/EmptyState';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface OrderEntrySubmissionDetailPageProps {
  currentUser: UserType;
}

interface SubmissionDetail {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  username: string;
  submission_status: string;
  submission_data: any;
  raw_form_data: any;
  api_response: any;
  api_status_code: number;
  error_message: string | null;
  pdf_id: string | null;
  pdf_filename: string | null;
  pdf_storage_path: string | null;
  workflow_execution_log_id: string | null;
  extraction_type_id: string | null;
  extraction_type_name: string | null;
}

interface FieldMapping {
  fieldName: string;
  type: string;
  value: string;
  dataType?: string;
  removeIfNull?: boolean;
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  context_data: any;
  current_step_name: string | null;
}

interface WorkflowStep {
  id: string;
  step_name: string;
  step_type: string;
  step_order: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_data: any;
  output_data: any;
  error_message: string | null;
  processed_config: any;
}

export default function OrderEntrySubmissionDetailPage({ currentUser }: OrderEntrySubmissionDetailPageProps) {
  const { id: submissionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [workflowExecution, setWorkflowExecution] = useState<WorkflowExecution | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'data' | 'mapping' | 'api' | 'workflow' | 'pdf' | 'documents'>('overview');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [resubmitting, setResubmitting] = useState(false);
  const [fields, setFields] = useState<OrderEntryField[]>([]);
  const [submissionDocuments, setSubmissionDocuments] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUser.isAdmin) {
      return;
    }
    if (submissionId) {
      loadSubmissionDetail();
    }
  }, [currentUser, submissionId]);

  const loadSubmissionDetail = async () => {
    try {
      setLoading(true);

      const [submissionResult, fieldsResult] = await Promise.all([
        supabase
          .from('order_entry_submissions')
          .select(`
            *,
            users!order_entry_submissions_user_id_fkey (
              username
            ),
            order_entry_pdfs (
              original_filename,
              storage_path
            ),
            extraction_types (
              name
            )
          `)
          .eq('id', submissionId)
          .maybeSingle(),
        supabase
          .from('order_entry_fields')
          .select('*')
          .order('field_order', { ascending: true })
      ]);

      const { data: submissionData, error: submissionError } = submissionResult;
      const { data: fieldsData } = fieldsResult;

      if (fieldsData) {
        setFields(fieldsData);
      }

      if (submissionError) throw submissionError;
      if (!submissionData) {
        navigate('/order-entry/submissions');
        return;
      }

      const detail: SubmissionDetail = {
        id: submissionData.id,
        created_at: submissionData.created_at,
        updated_at: submissionData.updated_at,
        user_id: submissionData.user_id,
        username: submissionData.users?.username || 'Unknown',
        submission_status: submissionData.submission_status,
        submission_data: submissionData.submission_data,
        raw_form_data: submissionData.raw_form_data,
        api_response: submissionData.api_response,
        api_status_code: submissionData.api_status_code,
        error_message: submissionData.error_message,
        pdf_id: submissionData.pdf_id,
        pdf_filename: submissionData.order_entry_pdfs?.original_filename || null,
        pdf_storage_path: submissionData.order_entry_pdfs?.storage_path || null,
        workflow_execution_log_id: submissionData.workflow_execution_log_id,
        extraction_type_id: submissionData.extraction_type_id || null,
        extraction_type_name: submissionData.extraction_types?.name || null
      };

      setSubmission(detail);

      if (detail.extraction_type_id) {
        const { data: extractionTypeData } = await supabase
          .from('extraction_types')
          .select('field_mappings')
          .eq('id', detail.extraction_type_id)
          .maybeSingle();

        if (extractionTypeData?.field_mappings) {
          let mappings = extractionTypeData.field_mappings;
          if (typeof mappings === 'string') {
            try {
              mappings = JSON.parse(mappings);
            } catch {
              mappings = [];
            }
          }
          setFieldMappings(Array.isArray(mappings) ? mappings : []);
        }
      }

      if (detail.pdf_storage_path) {
        let storagePath = detail.pdf_storage_path;
        if (storagePath.startsWith('http')) {
          const marker = '/object/public/order-entry-pdfs/';
          const idx = storagePath.indexOf(marker);
          if (idx !== -1) {
            storagePath = storagePath.substring(idx + marker.length);
          }
        }
        const { data, error: signedUrlError } = await supabase.storage
          .from('order-entry-pdfs')
          .createSignedUrl(storagePath, 3600);
        if (!signedUrlError && data?.signedUrl) {
          setPdfUrl(data.signedUrl);
        }
      }

      if (detail.workflow_execution_log_id) {
        await loadWorkflowExecution(detail.workflow_execution_log_id);
      }

      const { data: docsData } = await supabase
        .from('order_entry_submission_documents')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: true });
      if (docsData) setSubmissionDocuments(docsData);
    } catch (error) {
      console.error('Failed to load submission:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflowExecution = async (workflowLogId: string) => {
    try {
      const { data: workflowData, error: workflowError } = await supabase
        .from('workflow_execution_logs')
        .select(`
          *,
          workflows (
            workflow_name
          )
        `)
        .eq('id', workflowLogId)
        .maybeSingle();

      if (workflowError) throw workflowError;
      if (!workflowData) return;

      setWorkflowExecution({
        id: workflowData.id,
        workflow_id: workflowData.workflow_id,
        workflow_name: workflowData.workflows?.workflow_name || 'Unknown',
        status: workflowData.status,
        started_at: workflowData.started_at,
        completed_at: workflowData.completed_at,
        error_message: workflowData.error_message,
        context_data: workflowData.context_data,
        current_step_name: workflowData.current_step_name
      });

      const { data: stepsData, error: stepsError } = await supabase
        .from('workflow_step_logs')
        .select('*')
        .eq('workflow_execution_log_id', workflowLogId)
        .order('step_order');

      if (stepsError) throw stepsError;

      setWorkflowSteps(stepsData || []);
    } catch (error) {
      console.error('Failed to load workflow execution:', error);
    }
  };

  const handleExportJson = () => {
    if (!submission) return;

    const exportData = {
      submission: {
        id: submission.id,
        created_at: submission.created_at,
        user: submission.username,
        status: submission.submission_status
      },
      submission_data: submission.submission_data,
      api_request: {
        status_code: submission.api_status_code,
        response: submission.api_response
      },
      workflow: workflowExecution ? {
        name: workflowExecution.workflow_name,
        status: workflowExecution.status,
        steps: workflowSteps
      } : null,
      pdf: submission.pdf_filename ? {
        filename: submission.pdf_filename,
        storage_path: submission.pdf_storage_path
      } : null
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submission-${submission.id}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResubmit = async () => {
    if (!submission) return;

    const confirmed = window.confirm('Are you sure you want to resubmit this order? This will create a new submission.');
    if (!confirmed) return;

    try {
      setResubmitting(true);

      alert('Resubmission functionality will be implemented in a future update.');
    } catch (error) {
      console.error('Resubmission failed:', error);
      alert('Failed to resubmit order');
    } finally {
      setResubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  if (!currentUser.isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
        <JsonSkeleton depth={3} />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Submission not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/order-entry/submissions')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Submission Details
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-1">
              {submission.id}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {submission.submission_status === 'failed' && (
            <button
              onClick={handleResubmit}
              disabled={resubmitting}
              className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${resubmitting ? 'animate-spin' : ''}`} />
              Resubmit
            </button>
          )}
          <button
            onClick={handleExportJson}
            className="inline-flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
          >
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
            <StatusBadge status={submission.submission_status} type="submission" size="lg" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">API Status</p>
            <StatusBadge status={String(submission.api_status_code)} type="api" size="lg" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Submitted By</p>
            <div className="flex items-center mt-1">
              <User className="h-4 w-4 text-gray-400 mr-2" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {submission.username}
              </span>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Extraction Type</p>
            <div className="flex items-center mt-1">
              <Layers className="h-4 w-4 text-gray-400 mr-2" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {submission.extraction_type_name || 'Direct Submission'}
              </span>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Created</p>
            <div className="flex items-center mt-1">
              <Calendar className="h-4 w-4 text-gray-400 mr-2" />
              <span className="text-sm text-gray-900 dark:text-gray-100">
                {formatDate(submission.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {submission.error_message && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">Error Message</h3>
              <p className="text-sm text-red-700 dark:text-red-300">{submission.error_message}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'data'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-1" />
              Submission Data
            </button>
            {submission.extraction_type_id && (
              <button
                onClick={() => setActiveTab('mapping')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'mapping'
                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <GitCompare className="h-4 w-4 inline mr-1" />
                Data Mapping
              </button>
            )}
            <button
              onClick={() => setActiveTab('api')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'api'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Code className="h-4 w-4 inline mr-1" />
              API Details
            </button>
            {workflowExecution && (
              <button
                onClick={() => setActiveTab('workflow')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'workflow'
                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Workflow className="h-4 w-4 inline mr-1" />
                Workflow
              </button>
            )}
            {pdfUrl && (
              <button
                onClick={() => setActiveTab('pdf')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'pdf'
                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <FileText className="h-4 w-4 inline mr-1" />
                PDF Document
              </button>
            )}
            {submissionDocuments.length > 0 && (
              <button
                onClick={() => setActiveTab('documents')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'documents'
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
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Timeline</h3>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Submission Created</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(submission.created_at)}</p>
                    </div>
                  </div>
                  {workflowExecution && (
                    <>
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                            <Workflow className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Workflow Started</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(workflowExecution.started_at)}</p>
                        </div>
                      </div>
                      {workflowExecution.completed_at && (
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Workflow Completed</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(workflowExecution.completed_at)}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Submission Info</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-600 dark:text-gray-400">Fields Submitted:</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {submission.submission_data ? Object.keys(submission.submission_data).length : 0}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600 dark:text-gray-400">PDF Attached:</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {submission.pdf_id ? 'Yes' : 'No'}
                      </dd>
                    </div>
                  </dl>
                </div>

                {workflowExecution && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Workflow Info</h4>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-600 dark:text-gray-400">Workflow:</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                          {workflowExecution.workflow_name}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600 dark:text-gray-400">Steps:</dt>
                        <dd className="font-medium text-gray-900 dark:text-gray-100">
                          {workflowSteps.length}
                        </dd>
                      </div>
                      {workflowExecution.completed_at && workflowExecution.started_at && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600 dark:text-gray-400">Duration:</dt>
                          <dd className="font-medium text-gray-900 dark:text-gray-100">
                            {formatDuration(new Date(workflowExecution.completed_at).getTime() - new Date(workflowExecution.started_at).getTime())}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Submission Data (Mapped Output)</h3>
              {submission.submission_data && typeof submission.submission_data === 'object' ? (
                <div className="space-y-3">
                  {Object.entries(submission.submission_data).map(([key, value]) => {
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

          {activeTab === 'mapping' && submission.extraction_type_id && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <GitCompare className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    This view shows how form data was transformed through the Extraction Type field mappings.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-gray-500" />
                    Raw Form Data (Input)
                  </h4>
                  {submission.raw_form_data ? (
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                      <JsonViewer data={submission.raw_form_data} name="raw_form_data" defaultExpanded={true} />
                    </div>
                  ) : (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        Raw form data not available. This submission may have been created before this feature was added.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <Code className="h-5 w-5 mr-2 text-gray-500" />
                    Mapped Data (Output)
                  </h4>
                  {submission.submission_data ? (
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                      <JsonViewer data={submission.submission_data} name="submission_data" defaultExpanded={true} />
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400">No mapped data available</p>
                  )}
                </div>
              </div>

              {fieldMappings.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                    <Layers className="h-5 w-5 mr-2 text-gray-500" />
                    Field Mappings Applied ({fieldMappings.length})
                  </h4>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target Field</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source/Value</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Data Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {fieldMappings.map((mapping, index) => (
                          <tr key={index} className="hover:bg-gray-100 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">
                              {mapping.fieldName}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded ${
                                mapping.type === 'order_entry'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : mapping.type === 'hardcoded'
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}>
                                {mapping.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-mono">
                              {mapping.value || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {mapping.dataType || 'string'}
                              {mapping.removeIfNull && (
                                <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">(remove if null)</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {fieldMappings.length === 0 && (
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 text-center">
                  <Layers className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 dark:text-gray-400">No field mappings found for this extraction type.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">API Response</h3>
                <div className="mb-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Status Code: </span>
                  <StatusBadge status={String(submission.api_status_code)} type="api" size="md" />
                </div>
                {submission.api_response ? (
                  <JsonViewer data={submission.api_response} name="api_response" />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No API response data available</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'workflow' && workflowExecution && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Workflow Execution</h3>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{workflowExecution.workflow_name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">ID: {workflowExecution.id}</p>
                    </div>
                    <StatusBadge status={workflowExecution.status} type="workflow" size="lg" />
                  </div>
                  {workflowExecution.error_message && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                      <p className="text-sm text-red-700 dark:text-red-300">{workflowExecution.error_message}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4">Workflow Steps</h4>
                <div className="space-y-4">
                  {workflowSteps.map((step, index) => (
                    <div key={step.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{step.step_name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{step.step_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {step.duration_ms && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDuration(step.duration_ms)}
                            </span>
                          )}
                          <StatusBadge status={step.status} type="workflow" size="sm" />
                        </div>
                      </div>
                      {step.error_message && (
                        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                          {step.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pdf' && pdfUrl && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                PDF Document: {submission.pdf_filename}
              </h3>
              <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  className="flex justify-center"
                >
                  <Page pageNumber={pageNumber} width={Math.min(800, window.innerWidth - 100)} />
                </Document>
                {numPages > 1 && (
                  <div className="flex items-center justify-center space-x-4 mt-4">
                    <button
                      onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                      disabled={pageNumber === 1}
                      className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {pageNumber} of {numPages}
                    </span>
                    <button
                      onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                      disabled={pageNumber === numPages}
                      className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'documents' && submissionDocuments.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Uploaded Documents</h3>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Document Type</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Original File</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Renamed As</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Action</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {submissionDocuments.map(doc => (
                      <tr key={doc.id}>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{doc.document_type_name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{doc.original_file_name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{doc.renamed_file_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                            {doc.action_type === 'email' ? 'Email' : 'Imaging'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {doc.action_status === 'success' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">Success</span>
                          )}
                          {doc.action_status === 'pending' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">Pending</span>
                          )}
                          {doc.action_status === 'failed' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full" title={doc.action_error || ''}>Failed</span>
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
    </div>
  );
}
