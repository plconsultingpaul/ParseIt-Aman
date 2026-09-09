import React, { useState, useEffect } from 'react';
import { X, Copy, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import type { ExtractionWorkflow, WorkflowStep } from '../../../types';
import { fetchWorkflows, fetchWorkflowSteps } from '../../../services/workflowService';

interface StepCopyModalProps {
  currentWorkflowId: string;
  onCopy: (copiedStep: WorkflowStep) => void;
  onCancel: () => void;
}

type ModalStep = 'select-workflow' | 'select-step' | 'rename-step';

export default function StepCopyModal({ currentWorkflowId, onCopy, onCancel }: StepCopyModalProps) {
  const [modalStep, setModalStep] = useState<ModalStep>('select-workflow');
  const [workflows, setWorkflows] = useState<ExtractionWorkflow[]>([]);
  const [allSteps, setAllSteps] = useState<WorkflowStep[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [newStepName, setNewStepName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [workflowsData, stepsData] = await Promise.all([
          fetchWorkflows(),
          fetchWorkflowSteps()
        ]);
        setWorkflows(workflowsData);
        setAllSteps(stepsData);
      } catch (error) {
        console.error('Error loading workflows and steps:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const stepsForSelectedWorkflow = allSteps
    .filter(step => step.workflowId === selectedWorkflowId)
    .sort((a, b) => a.stepOrder - b.stepOrder);

  const getStepTypeLabel = (stepType: string) => {
    switch (stepType) {
      case 'api_call': return 'API Call';
      case 'api_endpoint': return 'API Endpoint';
      case 'conditional_check': return 'Conditional Check';
      case 'data_transform': return 'Data Transform';
      case 'sftp_upload': return 'SFTP Upload';
      case 'rename_file':
      case 'rename_pdf': return 'Rename File';
      case 'email_action': return 'Email Action';
      case 'multipart_form_upload': return 'Multipart Form';
      default: return stepType;
    }
  };

  const handleWorkflowSelect = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
  };

  const handleStepSelect = (step: WorkflowStep) => {
    setSelectedStep(step);
    setNewStepName(`${step.stepName} (Copy)`);
  };

  const handleCopy = () => {
    if (!selectedStep || !newStepName.trim()) return;

    const copiedStep: WorkflowStep = {
      id: `temp-${Date.now()}`,
      workflowId: currentWorkflowId,
      stepOrder: 0,
      stepType: selectedStep.stepType,
      stepName: newStepName.trim(),
      configJson: JSON.parse(JSON.stringify(selectedStep.configJson || {})),
      nextStepOnSuccessId: null,
      nextStepOnFailureId: null
    };

    onCopy(copiedStep);
  };

  const canProceedFromWorkflow = selectedWorkflowId !== '';
  const canProceedFromStep = selectedStep !== null;
  const canCopy = newStepName.trim() !== '';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                <Copy className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Copy Step</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {modalStep === 'select-workflow' && 'Select source workflow'}
                  {modalStep === 'select-step' && 'Select step to copy'}
                  {modalStep === 'rename-step' && 'Name your copied step'}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="flex items-center justify-center mt-4 space-x-2">
            {['select-workflow', 'select-step', 'rename-step'].map((step, index) => (
              <React.Fragment key={step}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    modalStep === step
                      ? 'bg-purple-600 text-white'
                      : index < ['select-workflow', 'select-step', 'rename-step'].indexOf(modalStep)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {index < ['select-workflow', 'select-step', 'rename-step'].indexOf(modalStep) ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < 2 && (
                  <div className={`w-12 h-0.5 ${
                    index < ['select-workflow', 'select-step', 'rename-step'].indexOf(modalStep)
                      ? 'bg-green-500'
                      : 'bg-gray-200 dark:bg-gray-600'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <>
              {modalStep === 'select-workflow' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {workflows.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No workflows available</p>
                  ) : (
                    workflows.map(workflow => {
                      const stepCount = allSteps.filter(s => s.workflowId === workflow.id).length;
                      return (
                        <button
                          key={workflow.id}
                          onClick={() => handleWorkflowSelect(workflow.id)}
                          className={`w-full p-3 rounded-lg border text-left transition-colors ${
                            selectedWorkflowId === workflow.id
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                {workflow.name}
                                {workflow.id === currentWorkflowId && (
                                  <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                    Current
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {stepCount} step{stepCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                            {selectedWorkflowId === workflow.id && (
                              <Check className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {modalStep === 'select-step' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {stepsForSelectedWorkflow.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No steps in this workflow</p>
                  ) : (
                    stepsForSelectedWorkflow.map(step => (
                      <button
                        key={step.id}
                        onClick={() => handleStepSelect(step)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedStep?.id === step.id
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                                Step {step.stepOrder}
                              </span>
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                {getStepTypeLabel(step.stepType)}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{step.stepName}</p>
                          </div>
                          {selectedStep?.id === step.id && (
                            <Check className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {modalStep === 'rename-step' && selectedStep && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Copying from</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{selectedStep.stepName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {getStepTypeLabel(selectedStep.stepType)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      New Step Name
                    </label>
                    <input
                      type="text"
                      value={newStepName}
                      onChange={(e) => setNewStepName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Enter step name"
                      autoFocus
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={() => {
              if (modalStep === 'select-step') {
                setModalStep('select-workflow');
                setSelectedStep(null);
              } else if (modalStep === 'rename-step') {
                setModalStep('select-step');
              } else {
                onCancel();
              }
            }}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center space-x-2"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{modalStep === 'select-workflow' ? 'Cancel' : 'Back'}</span>
          </button>

          {modalStep === 'select-workflow' && (
            <button
              onClick={() => setModalStep('select-step')}
              disabled={!canProceedFromWorkflow}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {modalStep === 'select-step' && (
            <button
              onClick={() => setModalStep('rename-step')}
              disabled={!canProceedFromStep}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {modalStep === 'rename-step' && (
            <button
              onClick={handleCopy}
              disabled={!canCopy}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>Copy Step</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
