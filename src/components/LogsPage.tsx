import React, { useState, useMemo } from 'react';
import { FileText, Clock, GitBranch, Server, Mail, Trash2, HardDrive } from 'lucide-react';
import type { ExtractionLog, ExtractionType, TransformationType, User, UserPermissions, EmailPollingLog, WorkflowExecutionLog, ExtractionWorkflow, WorkflowStep, SftpPollingLog, ProcessedEmail } from '../types';
import ExtractionLogsSettings from './settings/ExtractionLogsSettings';
import EmailPollingLogsSettings from './settings/EmailPollingLogsSettings';
import WorkflowExecutionLogsSettings from './settings/WorkflowExecutionLogsSettings';
import ProcessedEmailsSettings from './settings/ProcessedEmailsSettings';
import PurgeLogsSettings from './settings/PurgeLogsSettings';
import StorageManagementSettings from './settings/StorageManagementSettings';
import SftpPollingLogsSettings from './settings/SftpPollingLogsSettings';

interface LogsPageProps {
  extractionLogs: ExtractionLog[];
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  users: User[];
  emailPollingLogs: EmailPollingLog[];
  workflowExecutionLogs: WorkflowExecutionLog[];
  workflows: ExtractionWorkflow[];
  workflowSteps: WorkflowStep[];
  sftpPollingLogs: SftpPollingLog[];
  processedEmails: ProcessedEmail[];
  isAdmin?: boolean;
  userPermissions?: UserPermissions;
  onRefreshLogs: () => Promise<void>;
  onRefreshLogsWithFilters: (filters: any) => Promise<any>;
  onRefreshPollingLogs: () => Promise<any>;
  onStopRunningPollingLogs: () => Promise<void>;
  onRefreshWorkflowLogs: () => Promise<any>;
  onRefreshSftpPollingLogs: () => Promise<any>;
  onRefreshProcessedEmails: (startDate?: string, endDate?: string) => Promise<any>;
}

type LogsTab = 'extraction' | 'polling' | 'workflow' | 'sftp' | 'processed' | 'purge' | 'storage';

export default function LogsPage({
  extractionLogs,
  extractionTypes,
  transformationTypes,
  users,
  emailPollingLogs,
  workflowExecutionLogs,
  workflows,
  workflowSteps,
  sftpPollingLogs,
  processedEmails,
  isAdmin,
  userPermissions,
  onRefreshLogs,
  onRefreshLogsWithFilters,
  onRefreshPollingLogs,
  onStopRunningPollingLogs,
  onRefreshWorkflowLogs,
  onRefreshSftpPollingLogs,
  onRefreshProcessedEmails
}: LogsPageProps) {
  const tabPermissionMap: Record<string, keyof UserPermissions> = {
    extraction: 'extractionLogs',
    workflow: 'workflowLogs',
    polling: 'emailPolling',
    processed: 'processedEmails',
    sftp: 'sftpPolling',
  };

  const allTabs = [
    { id: 'extraction' as LogsTab, label: 'Processing Logs', icon: FileText, description: 'PDF extraction and transformation activity logs' },
    { id: 'workflow' as LogsTab, label: 'Workflow Logs', icon: GitBranch, description: 'Workflow execution logs' },
    { id: 'polling' as LogsTab, label: 'Email Polling', icon: Clock, description: 'Email monitoring activity' },
    { id: 'processed' as LogsTab, label: 'Processed Emails', icon: Mail, description: 'Processed email history' },
    { id: 'sftp' as LogsTab, label: 'SFTP Polling', icon: Server, description: 'SFTP folder monitoring logs' },
  ];

  const tabs = useMemo(() => {
    let filtered = isAdmin
      ? allTabs
      : allTabs.filter(tab => {
          const permKey = tabPermissionMap[tab.id];
          return !userPermissions || !permKey || userPermissions[permKey];
        });
    if (isAdmin) {
      filtered = [
        ...filtered,
        { id: 'purge' as LogsTab, label: 'Purge', icon: Trash2, description: 'Purge old log entries' },
        { id: 'storage' as LogsTab, label: 'Storage', icon: HardDrive, description: 'View bucket usage and purge old files' },
      ];
    }
    return filtered;
  }, [isAdmin, userPermissions]);

  const [activeTab, setActiveTab] = useState<LogsTab>(() => {
    if (isAdmin) return 'extraction';
    if (!userPermissions) return 'extraction';
    const firstPermitted = allTabs.find(tab => {
      const permKey = tabPermissionMap[tab.id];
      return !permKey || userPermissions[permKey];
    });
    return firstPermitted?.id ?? 'extraction';
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'extraction':
        return (
          <ExtractionLogsSettings
            extractionLogs={extractionLogs}
            extractionTypes={extractionTypes}
            transformationTypes={transformationTypes}
            users={users}
            onRefresh={onRefreshLogs}
            onRefreshWithFilters={onRefreshLogsWithFilters}
          />
        );
      case 'polling':
        return (
          <EmailPollingLogsSettings
            emailPollingLogs={emailPollingLogs}
            onRefreshPollingLogs={onRefreshPollingLogs}
            onStopRunningLogs={onStopRunningPollingLogs}
          />
        );
      case 'workflow':
        return (
          <WorkflowExecutionLogsSettings
            workflowExecutionLogs={workflowExecutionLogs}
            workflows={workflows}
            workflowSteps={workflowSteps}
            users={users}
            extractionTypes={extractionTypes}
            transformationTypes={transformationTypes}
            onRefreshWorkflowLogs={onRefreshWorkflowLogs}
          />
        );
      case 'processed':
        return (
          <ProcessedEmailsSettings
            processedEmails={processedEmails}
            onRefresh={onRefreshProcessedEmails}
          />
        );
      case 'sftp':
        return <SftpPollingLogsSettings />;
      case 'purge':
        return <PurgeLogsSettings />;
      case 'storage':
        return <StorageManagementSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Horizontal Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-purple-700 dark:text-purple-300 shadow-sm font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 hover:ring-2 hover:ring-purple-400 dark:hover:ring-purple-500'
              }`}
            >
              <Icon className={`h-4 w-4 ${
                activeTab === tab.id ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'
              }`} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl border border-purple-100 dark:border-gray-700 p-6">
        {renderTabContent()}
      </div>
    </div>
  );
}