import React from 'react';
import { X, Trash2, GitBranch } from 'lucide-react';
import type { ExtractionWorkflow } from '../../../types';

interface WorkflowDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowToDelete: ExtractionWorkflow | null;
  onConfirmDelete: () => Promise<void>;
  isDeleting: boolean;
}

export default function WorkflowDeleteModal({ 
  isOpen, 
  onClose, 
  workflowToDelete, 
  onConfirmDelete,
  isDeleting 
}: WorkflowDeleteModalProps) {
  const handleConfirmDelete = async () => {
    try {
      await onConfirmDelete();
      onClose();
    } catch (error) {
      console.error('Delete workflow failed:', error);
      // Error handling is done in the parent component
    }
  };

  if (!isOpen || !workflowToDelete) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Workflow</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to permanently delete the workflow <strong>"{workflowToDelete.name}"</strong>?
          </p>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Warning</span>
          </div>
          <ul className="text-red-700 dark:text-red-400 text-sm space-y-1">
            <li>• This action cannot be undone</li>
            <li>• All workflow steps will be permanently deleted</li>
            <li>• Any extraction types using this workflow will lose their workflow assignment</li>
            <li>• All workflow execution logs will remain but reference a deleted workflow</li>
          </ul>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
          >
            {isDeleting ? 'Deleting...' : 'Delete Workflow'}
          </button>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}