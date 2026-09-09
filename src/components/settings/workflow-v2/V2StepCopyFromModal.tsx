import React, { useState, useEffect } from 'react';
import { X, Copy, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import type { WorkflowV2, WorkflowV2Node } from '../../../types';
import { fetchWorkflowsV2, fetchWorkflowV2Nodes } from '../../../services/workflowV2Service';

interface V2StepCopyFromModalProps {
  currentWorkflowId: string;
  onCopy: (node: { label: string; stepType: string; configJson: any; escapeSingleQuotesInBody?: boolean; userResponseTemplate?: string }) => void;
  onCancel: () => void;
}

type ModalStep = 'select-workflow' | 'select-step' | 'rename-step';

const STEP_TYPE_LABELS: Record<string, string> = {
  api_call: 'API Call',
  api_endpoint: 'API Endpoint',
  conditional_check: 'Condition',
  data_transform: 'Transform',
  sftp_upload: 'SFTP Upload',
  email_action: 'Email',
  rename_file: 'Rename File',
  multipart_form_upload: 'Multipart Upload',
  ai_decision: 'AI Decision',
  read_email: 'Read Email',
  imaging: 'Imaging',
  read_barcode: 'Read Barcode',
};

export default function V2StepCopyFromModal({ currentWorkflowId, onCopy, onCancel }: V2StepCopyFromModalProps) {
  const [modalStep, setModalStep] = useState<ModalStep>('select-workflow');
  const [workflows, setWorkflows] = useState<WorkflowV2[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowV2Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowV2Node | null>(null);
  const [newStepName, setNewStepName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingNodes, setIsLoadingNodes] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchWorkflowsV2();
        setWorkflows(data);
      } catch (err) {
        console.error('Failed to load V2 workflows:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleWorkflowSelect = async (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    setSelectedNode(null);
    setIsLoadingNodes(true);
    try {
      const nodes = await fetchWorkflowV2Nodes(workflowId);
      setWorkflowNodes(nodes.filter(n => n.nodeType !== 'start'));
    } catch (err) {
      console.error('Failed to load workflow nodes:', err);
      setWorkflowNodes([]);
    } finally {
      setIsLoadingNodes(false);
    }
  };

  const handleStepSelect = (node: WorkflowV2Node) => {
    setSelectedNode(node);
    setNewStepName(`${node.label} (Copy)`);
  };

  const handleCopy = () => {
    if (!selectedNode || !newStepName.trim()) return;
    onCopy({
      label: newStepName.trim(),
      stepType: selectedNode.stepType || '',
      configJson: JSON.parse(JSON.stringify(selectedNode.configJson || {})),
      escapeSingleQuotesInBody: selectedNode.escapeSingleQuotesInBody,
      userResponseTemplate: selectedNode.userResponseTemplate,
    });
  };

  const steps: ModalStep[] = ['select-workflow', 'select-step', 'rename-step'];
  const currentStepIndex = steps.indexOf(modalStep);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                <Copy className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Copy From</h3>
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
            {steps.map((step, index) => (
              <React.Fragment key={step}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    modalStep === step
                      ? 'bg-blue-600 text-white'
                      : index < currentStepIndex
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {index < currentStepIndex ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                {index < 2 && (
                  <div className={`w-12 h-0.5 ${
                    index < currentStepIndex ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {modalStep === 'select-workflow' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {workflows.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No workflows available</p>
                  ) : (
                    workflows.map(workflow => (
                      <button
                        key={workflow.id}
                        onClick={() => handleWorkflowSelect(workflow.id)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedWorkflowId === workflow.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
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
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {workflow.workflowType}
                            </p>
                          </div>
                          {selectedWorkflowId === workflow.id && (
                            <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {modalStep === 'select-step' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {isLoadingNodes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                  ) : workflowNodes.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No steps in this workflow</p>
                  ) : (
                    workflowNodes.map(node => (
                      <button
                        key={node.id}
                        onClick={() => handleStepSelect(node)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedNode?.id === node.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                {STEP_TYPE_LABELS[node.stepType || ''] || node.stepType}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{node.label}</p>
                          </div>
                          {selectedNode?.id === node.id && (
                            <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {modalStep === 'rename-step' && selectedNode && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Copying from</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{selectedNode.label}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {STEP_TYPE_LABELS[selectedNode.stepType || ''] || selectedNode.stepType}
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
                      onKeyDown={(e) => { if (e.key === 'Enter' && newStepName.trim()) handleCopy(); }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
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
                setSelectedNode(null);
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
              disabled={!selectedWorkflowId}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {modalStep === 'select-step' && (
            <button
              onClick={() => setModalStep('rename-step')}
              disabled={!selectedNode}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {modalStep === 'rename-step' && (
            <button
              onClick={handleCopy}
              disabled={!newStepName.trim()}
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
