import React, { useState } from 'react';
import { X, Copy, GitBranch } from 'lucide-react';
import type { ExtractionWorkflow } from '../../../types';

interface WorkflowCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowToCopy: ExtractionWorkflow | null;
  onConfirmCopy: (newName: string) => Promise<void>;
  isCopying: boolean;
}

export default function WorkflowCopyModal({ 
  isOpen, 
  onClose, 
  workflowToCopy, 
  onConfirmCopy,
  isCopying 
}: WorkflowCopyModalProps) {
  const [copyWorkflowName, setCopyWorkflowName] = useState('');
  const [copyNameError, setCopyNameError] = useState('');

  React.useEffect(() => {
    if (isOpen && workflowToCopy) {
      setCopyWorkflowName(`${workflowToCopy.name} - Copy`);
      setCopyNameError('');
    }
  }, [isOpen, workflowToCopy]);

  const handleConfirmCopy = async () => {
    if (!copyWorkflowName.trim()) {
      setCopyNameError('Name is required');
      return;
    }

    try {
      await onConfirmCopy(copyWorkflowName.trim());
      handleClose();
    } catch (error) {
      setCopyNameError(error instanceof Error ? error.message : 'Failed to copy workflow');
    }
  };

  const handleClose = () => {
    setCopyWorkflowName('');
    setCopyNameError('');
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirmCopy();
    }
  };

  if (!isOpen || !workflowToCopy) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Copy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Copy Workflow</h3>
          <p className="text-gray-600 dark:text-gray-400">Create a copy of "{workflowToCopy.name}" with a new name</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Workflow Name
            </label>
            <input
              type="text"
              value={copyWorkflowName}
              onChange={(e) => setCopyWorkflowName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., Invoice Processing - Copy"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              disabled={isCopying}
            />
            {copyNameError && (
              <p className="text-red-500 dark:text-red-400 text-sm mt-2">{copyNameError}</p>
            )}
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
            <p className="text-blue-700 dark:text-blue-400 text-sm">
              <strong>What will be copied:</strong> All workflow steps, configurations, and settings. Step connections will be reset and need to be reconfigured.
            </p>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={handleConfirmCopy}
              disabled={isCopying}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {isCopying ? 'Copying...' : 'Copy Workflow'}
            </button>
            <button
              onClick={handleClose}
              disabled={isCopying}
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