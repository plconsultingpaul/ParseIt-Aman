import React, { useState } from 'react';
import { FileText, RefreshCw, GitBranch, GitMerge, Play, LayoutGrid } from 'lucide-react';
import type { ExtractionType, TransformationType, ExtractionWorkflow, WorkflowStep, ApiConfig, User } from '../types';
import ExtractionTypesSettings from './settings/ExtractionTypesSettings';
import TransformationTypesSettings from './settings/TransformationTypesSettings';
import ExecuteSetupSettings from './settings/ExecuteSetupSettings';
import WorkflowSettings from './settings/WorkflowSettings';
import WorkflowV2Settings from './settings/workflow-v2/WorkflowV2Settings';
import ReviewSetupSettings from './settings/ReviewSetupSettings';

interface TypeSetupPageProps {
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  workflows: ExtractionWorkflow[];
  workflowSteps: WorkflowStep[];
  apiConfig: ApiConfig;
  currentUser: User;
  refreshData: () => Promise<void>;
  refreshData: () => Promise<void>;
  onUpdateExtractionTypes: (types: ExtractionType[]) => Promise<void>;
  onDeleteExtractionType: (id: string) => Promise<void>;
  onUpdateTransformationTypes: (types: TransformationType[]) => Promise<void>;
  onDeleteTransformationType: (id: string) => Promise<void>;
}

type TypeSetupTab = 'extraction' | 'transformation' | 'execute' | 'workflows' | 'workflows_v2' | 'review_setup';

export default function TypeSetupPage({
  extractionTypes,
  transformationTypes,
  workflows,
  workflowSteps,
  apiConfig,
  currentUser,
  refreshData,
  onUpdateExtractionTypes,
  onDeleteExtractionType,
  onUpdateTransformationTypes,
  onDeleteTransformationType
}: TypeSetupPageProps) {
  const [activeTab, setActiveTab] = useState<TypeSetupTab>('extraction');

  const tabs = [
    ...(currentUser.permissions.extractionTypes ? [{ id: 'extraction' as TypeSetupTab, label: 'Extraction Types', icon: FileText, description: 'Manage PDF extraction templates' }] : []),
    ...(currentUser.permissions.transformationTypes ? [{ id: 'transformation' as TypeSetupTab, label: 'Transformation Types', icon: RefreshCw, description: 'Manage PDF transformation and renaming' }] : []),
    ...(currentUser.permissions.executeSetup ? [{ id: 'execute' as TypeSetupTab, label: 'Execute Setup', icon: Play, description: 'Configure execute buttons and parameters' }] : []),
    ...(currentUser.permissions.workflowManagement ? [{ id: 'workflows' as TypeSetupTab, label: 'Workflows', icon: GitBranch, description: 'Create multi-step processes' }] : []),
    ...(currentUser.permissions.workflowManagement ? [{ id: 'workflows_v2' as TypeSetupTab, label: 'Workflow v2', icon: GitMerge, description: 'Graph-based workflow engine' }] : []),
    ...(currentUser.permissions.extractionTypes ? [{ id: 'review_setup' as TypeSetupTab, label: 'Review Setup', icon: LayoutGrid, description: 'Configure inbox review templates' }] : [])
  ];

  const renderTabContent = (refreshData: () => Promise<void>) => {
    switch (activeTab) {
      case 'extraction':
        return currentUser.permissions.extractionTypes ? (
          <ExtractionTypesSettings
            extractionTypes={extractionTypes}
            onUpdateExtractionTypes={onUpdateExtractionTypes}
            onDeleteExtractionType={onDeleteExtractionType}
            refreshData={refreshData}
            isAdmin={currentUser.isAdmin}
            currentUser={currentUser}
          />
        ) : <PermissionDenied />;
      case 'transformation':
        return currentUser.permissions.transformationTypes ? (
          <TransformationTypesSettings
            transformationTypes={transformationTypes}
            refreshData={refreshData}
            onUpdateTransformationTypes={onUpdateTransformationTypes}
            onDeleteTransformationType={onDeleteTransformationType}
            isAdmin={currentUser.isAdmin}
            currentUser={currentUser}
          />
        ) : <PermissionDenied />;
      case 'execute':
        return currentUser.permissions.executeSetup ? (
          <ExecuteSetupSettings isAdmin={currentUser.isAdmin} currentUser={currentUser} />
        ) : <PermissionDenied />;
      case 'workflows':
        return currentUser.permissions.workflowManagement ? (
          <WorkflowSettings
            apiConfig={apiConfig}
            refreshData={refreshData}
            isAdmin={currentUser.isAdmin}
          />
        ) : <PermissionDenied />;
      case 'workflows_v2':
        return currentUser.permissions.workflowManagement ? (
          <WorkflowV2Settings isAdmin={currentUser.isAdmin} currentUser={currentUser} />
        ) : <PermissionDenied />;
      case 'review_setup':
        return currentUser.permissions.extractionTypes ? (
          <ReviewSetupSettings />
        ) : <PermissionDenied />;
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
        {renderTabContent(refreshData)}
      </div>
    </div>
  );
}

function PermissionDenied() {
  return (
    <div className="text-center py-12">
      <div className="bg-red-100 dark:bg-red-900/50 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
        <FileText className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Access Denied</h3>
      <p className="text-gray-600 dark:text-gray-400">You don't have permission to access this section.</p>
      <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">Contact your administrator to request access.</p>
    </div>
  );
}