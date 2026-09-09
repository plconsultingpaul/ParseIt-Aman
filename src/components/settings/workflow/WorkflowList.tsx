import React from 'react';
import { GitBranch, Trash2, Play, Pause, Edit3, Check, X } from 'lucide-react';
import type { ExtractionWorkflow } from '../../../types';

interface WorkflowListProps {
  workflows: ExtractionWorkflow[];
  selectedWorkflowId: string | null;
  onSelectWorkflow: (workflowId: string) => void;
  onUpdateWorkflow: (workflowId: string, updates: Partial<ExtractionWorkflow>) => Promise<void>;
  onDeleteWorkflow: (workflowId: string) => void;
}

export default function WorkflowList({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  onUpdateWorkflow,
  onDeleteWorkflow
}: WorkflowListProps) {
  const [editingWorkflowId, setEditingWorkflowId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState<string>('');

  const handleStartEdit = (workflow: ExtractionWorkflow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWorkflowId(workflow.id);
    setEditingName(workflow.name);
  };

  const handleSaveEdit = async (workflowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingName.trim()) {
      try {
        await onUpdateWorkflow(workflowId, { name: editingName.trim() });
        setEditingWorkflowId(null);
        setEditingName('');
      } catch (error) {
        alert('Failed to save workflow name. Please try again.');
      }
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWorkflowId(null);
    setEditingName('');
  };

  const handleKeyPress = async (e: React.KeyboardEvent, workflowId: string) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      if (editingName.trim()) {
        try {
          await onUpdateWorkflow(workflowId, { name: editingName.trim() });
          setEditingWorkflowId(null);
          setEditingName('');
        } catch (error) {
          alert('Failed to save workflow name. Please try again.');
        }
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setEditingWorkflowId(null);
      setEditingName('');
    }
  };

  const handleDeleteWorkflow = (workflowId: string, workflowName: string) => {
    // Don't use browser confirm - let the parent component handle the modal
    onDeleteWorkflow(workflowId);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">Workflows</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{workflows.length} workflow{workflows.length !== 1 ? 's' : ''}</p>
      </div>
      
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            className={`p-4 cursor-pointer transition-colors duration-200 dark:hover:bg-gray-700 ${
              selectedWorkflowId === workflow.id
                ? 'bg-purple-50 dark:bg-purple-900/30 border-r-4 border-purple-500'
                : 'hover:bg-gray-50 group'
            }`}
            onClick={() => onSelectWorkflow(workflow.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <div className={`p-2 rounded-lg ${
                  workflow.isActive ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <GitBranch className={`h-4 w-4 ${
                    workflow.isActive ? 'text-green-600' : 'text-gray-500'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  {editingWorkflowId === workflow.id ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyPress={(e) => handleKeyPress(e, workflow.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1"
                        autoFocus
                      />
                      <button
                        onClick={(e) => handleSaveEdit(workflow.id, e)}
                        className="p-1 text-green-600 hover:text-green-800 hover:bg-green-100 dark:hover:bg-green-900/20 rounded transition-colors duration-200"
                        title="Save changes"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                        title="Cancel editing"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {workflow.name}
                      </span>
                      <button
                        onClick={(e) => handleStartEdit(workflow, e)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200 opacity-0 group-hover:opacity-100"
                        title="Edit workflow name"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                    {workflow.description || 'No description'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-1 ml-2">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await onUpdateWorkflow(workflow.id, { isActive: !workflow.isActive });
                    } catch (error) {
                      alert('Failed to update workflow status. Please try again.');
                    }
                  }}
                  className={`p-1 rounded transition-colors duration-200 ${
                    workflow.isActive
                      ? 'text-green-600 hover:bg-green-100'
                      : 'text-gray-400 hover:bg-gray-100'
                  }`}
                  title={workflow.isActive ? 'Disable workflow' : 'Enable workflow'}
                >
                  {workflow.isActive ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWorkflow(workflow.id, workflow.name);
                  }}
                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors duration-200"
                  title="Delete workflow"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {workflows.length === 0 && (
          <div className="p-8 text-center">
            <GitBranch className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">No workflows created yet</p>
          </div>
        )}
      </div>
    </div>
  );
}