import React, { useState } from 'react';
import { GitBranch, Plus, Save, Copy } from 'lucide-react';
import type { ApiConfig } from '../../types';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useWorkflowManagement } from '../../hooks/useWorkflowManagement';
import { updateWorkflowSteps } from '../../services/workflowService';
import WorkflowList from './workflow/WorkflowList';
import WorkflowDetail from './workflow/WorkflowDetail';
import WorkflowSelectionModal from './workflow/WorkflowSelectionModal';
import WorkflowCopyModal from './workflow/WorkflowCopyModal';
import WorkflowDeleteModal from './workflow/WorkflowDeleteModal';
import WorkflowCreateModal from './workflow/WorkflowCreateModal';

interface WorkflowSettingsProps {
  apiConfig: ApiConfig;
  refreshData: () => Promise<void>;
  isAdmin?: boolean;
}

export default function WorkflowSettings({ apiConfig, refreshData, isAdmin = true }: WorkflowSettingsProps) {
  const { workflows, workflowSteps, extractionTypes, refreshWorkflowSteps } = useSupabaseData();
  const {
    localWorkflows,
    isSaving,
    saveSuccess,
    isCopying,
    isDeleting,
    isCreating,
    addWorkflow,
    updateWorkflow,
    deleteWorkflow,
    copyWorkflow,
    saveWorkflows
  } = useWorkflowManagement(workflows, workflowSteps, refreshData, refreshWorkflowSteps);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [showWorkflowSelectionModal, setShowWorkflowSelectionModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [workflowToCopy, setWorkflowToCopy] = useState<any>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<any>(null);

  const selectedWorkflow = localWorkflows.find(w => w.id === selectedWorkflowId);
  const selectedWorkflowSteps = workflowSteps.filter(step => step.workflowId === selectedWorkflowId);

  const handleAddWorkflow = () => {
    setShowCreateModal(true);
  };

  const handleConfirmCreate = async (name: string, description: string) => {
    try {
      const newWorkflowId = await addWorkflow(name, description);
      setSelectedWorkflowId(newWorkflowId);
    } catch (error) {
      throw error;
    }
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    const workflow = localWorkflows.find(w => w.id === workflowId);
    if (workflow) {
      setWorkflowToDelete(workflow);
      setShowDeleteModal(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!workflowToDelete) return;
    
    try {
      await deleteWorkflow(workflowToDelete.id);
      
      // Clear selection if deleted workflow was selected
      if (selectedWorkflowId === workflowToDelete.id) {
        setSelectedWorkflowId(null);
      }
    } catch (error) {
      alert('Failed to delete workflow. Please try again.');
    }
  };

  const handleCopyWorkflowClick = () => {
    setShowWorkflowSelectionModal(true);
  };

  const handleWorkflowSelectedForCopy = (workflow: any) => {
    setWorkflowToCopy(workflow);
    setShowWorkflowSelectionModal(false);
    setShowCopyModal(true);
  };

  const handleConfirmCopy = async (newName: string) => {
    if (!workflowToCopy) return;

    // Check if name already exists
    if (localWorkflows.some(workflow => workflow.name.toLowerCase() === newName.toLowerCase())) {
      throw new Error('Name already exists');
    }

    const newWorkflowId = await copyWorkflow(workflowToCopy, newName);
    setSelectedWorkflowId(newWorkflowId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Workflow Management</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Create and manage multi-step extraction workflows</p>
        </div>
        <div className="flex items-center space-x-3">
          {localWorkflows.length > 0 && isAdmin && (
            <button
              onClick={handleCopyWorkflowClick}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>Copy Workflow</span>
            </button>
          )}
          <button
            onClick={handleAddWorkflow}
            disabled={!isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Workflow</span>
          </button>
          <button
            onClick={saveWorkflows}
            disabled={isSaving || !isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save All'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">Workflows saved successfully!</p>
        </div>
      )}

      {/* Create Workflow Modal */}
      <WorkflowCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onConfirmCreate={handleConfirmCreate}
        isCreating={isCreating}
        existingNames={localWorkflows.map(w => w.name)}
      />

      {/* Workflow Selection Modal */}
      <WorkflowSelectionModal
        isOpen={showWorkflowSelectionModal}
        onClose={() => setShowWorkflowSelectionModal(false)}
        workflows={localWorkflows}
        onSelect={handleWorkflowSelectedForCopy}
      />

      {/* Copy Workflow Modal */}
      <WorkflowCopyModal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        workflowToCopy={workflowToCopy}
        onConfirmCopy={handleConfirmCopy}
        isCopying={isCopying}
      />

      {/* Delete Workflow Modal */}
      <WorkflowDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        workflowToDelete={workflowToDelete}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflow List */}
        <div className="lg:col-span-1">
          <WorkflowList
            workflows={localWorkflows}
            selectedWorkflowId={selectedWorkflowId}
            onSelectWorkflow={setSelectedWorkflowId}
            onUpdateWorkflow={updateWorkflow}
            onDeleteWorkflow={handleDeleteWorkflow}
          />
        </div>

        {/* Workflow Detail */}
        <div className="lg:col-span-2">
          {selectedWorkflow ? (
            <WorkflowDetail
              workflow={selectedWorkflow}
              steps={selectedWorkflowSteps}
              apiConfig={apiConfig}
              extractionTypes={extractionTypes}
              onUpdateSteps={async (steps) => {
                const validSteps = steps.filter(step => step != null);
                await updateWorkflowSteps(selectedWorkflow.id, validSteps);
                await refreshWorkflowSteps();
              }}
            />
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
              <GitBranch className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Workflow Selected</h3>
              <p className="text-gray-600 dark:text-gray-400">Select a workflow from the list to view and edit its steps.</p>
            </div>
          )}
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Workflow System Information</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• Workflows define multi-step processes for handling extracted data</li>
          <li>• Steps are executed in order and can include API calls, conditional checks, and data transformations</li>
          <li>• Each extraction type can be linked to a specific workflow</li>
          <li>• Workflow execution progress is tracked and can be monitored in real-time</li>
          <li>• Failed steps will halt workflow execution and provide detailed error information</li>
        </ul>
      </div>
    </div>
  );
}