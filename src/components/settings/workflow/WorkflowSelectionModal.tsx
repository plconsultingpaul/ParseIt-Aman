import React, { useState } from 'react';
import { X, GitBranch, Copy, CheckCircle } from 'lucide-react';
import type { ExtractionWorkflow } from '../../../types';

interface WorkflowSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflows: ExtractionWorkflow[];
  onSelect: (workflow: ExtractionWorkflow) => void;
}

export default function WorkflowSelectionModal({ 
  isOpen, 
  onClose, 
  workflows, 
  onSelect 
}: WorkflowSelectionModalProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');

  if (!isOpen) return null;

  const handleConfirmSelection = () => {
    const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
    if (selectedWorkflow) {
      onSelect(selectedWorkflow);
    }
  };

  const handleWorkflowSelect = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
  };

  // Filter out temporary workflows (not yet saved)
  const availableWorkflows = workflows.filter(w => !w.id.startsWith('temp-'));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden">
        <div className="text-center mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Copy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Select Workflow to Copy</h3>
          <p className="text-gray-600 dark:text-gray-400">Choose which workflow you want to duplicate</p>
        </div>
        
        {availableWorkflows.length === 0 ? (
          <div className="text-center py-8">
            <GitBranch className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Workflows Available</h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You need to save at least one workflow before you can copy it.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {availableWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  onClick={() => handleWorkflowSelect(workflow.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                    selectedWorkflowId === workflow.id
                      ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${
                        workflow.isActive ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-100 dark:bg-gray-600'
                      }`}>
                        <GitBranch className={`h-5 w-5 ${
                          workflow.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <h4 className={`font-semibold ${
                          selectedWorkflowId === workflow.id 
                            ? 'text-blue-900 dark:text-blue-200' 
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {workflow.name}
                        </h4>
                        <p className={`text-sm ${
                          selectedWorkflowId === workflow.id 
                            ? 'text-blue-600 dark:text-blue-300' 
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {workflow.description || 'No description'}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            workflow.isActive 
                              ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200' 
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                          }`}>
                            {workflow.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      selectedWorkflowId === workflow.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                    }`}>
                      {selectedWorkflowId === workflow.id && (
                        <CheckCircle className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleConfirmSelection}
                disabled={!selectedWorkflowId}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <Copy className="h-4 w-4" />
                <span>Copy Selected Workflow</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}