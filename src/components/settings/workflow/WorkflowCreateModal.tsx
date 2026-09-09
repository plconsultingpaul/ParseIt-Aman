import React, { useState } from 'react';
import { Plus } from 'lucide-react';

interface WorkflowCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCreate: (name: string, description: string) => Promise<void>;
  isCreating: boolean;
  existingNames: string[];
}

export default function WorkflowCreateModal({
  isOpen,
  onClose,
  onConfirmCreate,
  isCreating,
  existingNames
}: WorkflowCreateModalProps) {
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nameError, setNameError] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setWorkflowName('');
      setWorkflowDescription('');
      setNameError('');
    }
  }, [isOpen]);

  const validateName = (name: string): boolean => {
    if (!name.trim()) {
      setNameError('Workflow name is required');
      return false;
    }

    if (existingNames.some(existingName => existingName.toLowerCase() === name.trim().toLowerCase())) {
      setNameError('A workflow with this name already exists');
      return false;
    }

    setNameError('');
    return true;
  };

  const handleConfirmCreate = async () => {
    if (!validateName(workflowName)) {
      return;
    }

    try {
      await onConfirmCreate(workflowName.trim(), workflowDescription.trim());
      handleClose();
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Failed to create workflow');
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setWorkflowName('');
      setWorkflowDescription('');
      setNameError('');
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirmCreate();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Plus className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Create New Workflow</h3>
          <p className="text-gray-600 dark:text-gray-400">Enter a name for your new workflow</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Workflow Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setNameError('');
              }}
              onKeyDown={handleKeyPress}
              placeholder="e.g., Invoice Processing"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              autoFocus
              disabled={isCreating}
            />
            {nameError && (
              <p className="text-red-500 dark:text-red-400 text-sm mt-2">{nameError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Describe what this workflow does..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              disabled={isCreating}
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
            <p className="text-blue-700 dark:text-blue-400 text-sm">
              <strong>Next step:</strong> After creating the workflow, you can start adding workflow steps to define the processing logic.
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleConfirmCreate}
              disabled={isCreating}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {isCreating ? 'Creating...' : 'Create Workflow'}
            </button>
            <button
              onClick={handleClose}
              disabled={isCreating}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
