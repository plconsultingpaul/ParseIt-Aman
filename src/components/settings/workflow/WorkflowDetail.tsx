import React, { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, Save, Settings, AlertTriangle, X, Copy } from 'lucide-react';
import type { ExtractionWorkflow, WorkflowStep, ApiConfig } from '../../../types';
import StepConfigForm from './StepConfigForm';
import StepCopyModal from './StepCopyModal';

interface WorkflowDetailProps {
  workflow: ExtractionWorkflow;
  steps: WorkflowStep[];
  apiConfig: ApiConfig;
  onUpdateSteps: (steps: WorkflowStep[]) => void;
  extractionTypes?: any[];
}

export default function WorkflowDetail({ workflow, steps, apiConfig, onUpdateSteps, extractionTypes }: WorkflowDetailProps) {
  const [localSteps, setLocalSteps] = useState<WorkflowStep[]>(steps);
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);

  // Check if workflow has a temporary ID (not yet saved)
  const isTemporaryWorkflow = workflow.id.startsWith('temp-');
  const [hasMigrated, setHasMigrated] = React.useState(false);

  // Update local steps when props change and migrate to 100-interval numbering if needed
  React.useEffect(() => {
    // Check if steps need migration to 100-interval numbering
    const needsMigration = steps.some(step => step.stepOrder < 100);

    if (needsMigration && steps.length > 0 && !hasMigrated) {
      console.log('Migrating workflow steps to 100-interval numbering system...');

      // Sort by current order
      const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

      // Multiply existing orders by 100
      const migratedSteps = sortedSteps.map((step, index) => ({
        ...step,
        stepOrder: (index + 1) * 100
      }));

      console.log('Migrated steps:', migratedSteps.map(s => ({
        name: s.stepName,
        oldOrder: steps.find(orig => orig.id === s.id)?.stepOrder,
        newOrder: s.stepOrder
      })));

      setLocalSteps(migratedSteps);
      setHasMigrated(true);

      // Trigger save after state is updated
      setTimeout(() => {
        onUpdateSteps(migratedSteps);
      }, 100);
    } else if (!needsMigration) {
      setLocalSteps(steps);
    }
  }, [steps, hasMigrated, onUpdateSteps]);

  const handleAddStep = () => {
    // Calculate the next available step order using 100-unit intervals
    const maxStepOrder = localSteps.length > 0 ? Math.max(...localSteps.map(s => s.stepOrder)) : 0;

    const newStep: WorkflowStep = {
      id: `temp-${Date.now()}`,
      workflowId: workflow.id,
      stepOrder: maxStepOrder + 100,
      stepType: 'api_call',
      stepName: 'New Step',
      configJson: {}
    };

    setEditingStep(newStep);
    setShowStepForm(true);
  };

  const handleEditStep = (step: WorkflowStep) => {
    console.log('Editing step:', step);
    console.log('Step configJson:', step.configJson);
    setEditingStep(step);
    setShowStepForm(true);
  };

  const handleCopyStep = async (copiedStep: WorkflowStep) => {
    const maxStepOrder = localSteps.length > 0 ? Math.max(...localSteps.map(s => s.stepOrder)) : 0;
    const stepWithOrder = {
      ...copiedStep,
      stepOrder: maxStepOrder + 100
    };

    const updatedSteps = [...localSteps, stepWithOrder];
    setLocalSteps(updatedSteps);
    setShowCopyModal(false);

    try {
      await handleSaveStepsToDatabase(updatedSteps);
    } catch (error) {
      console.log('Copy failed, keeping modal closed');
    }
  };

  const handleSaveStep = async (step: WorkflowStep) => {
    console.log('Saving step:', step);

    // Ensure configJson is never undefined
    if (!step.configJson) {
      step.configJson = {};
    }

    // Check if this is a new step or updating existing
    const existingStepIndex = localSteps.findIndex(s => s.id === step.id);
    let updatedSteps: WorkflowStep[];

    if (existingStepIndex >= 0) {
      // Updating existing step
      updatedSteps = localSteps.map(s => s.id === step.id ? step : s);
    } else {
      // Adding new step - assign next available step order using 100-unit intervals
      const maxStepOrder = localSteps.length > 0 ? Math.max(...localSteps.map(s => s.stepOrder)) : 0;
      const stepWithOrder = {
        ...step,
        stepOrder: maxStepOrder + 100
      };
      updatedSteps = [...localSteps, stepWithOrder];
    }

    console.log('Updated steps array:', updatedSteps);
    setLocalSteps(updatedSteps);

    // Immediately save to database
    try {
      await handleSaveStepsToDatabase(updatedSteps);

      // Only close form if save succeeded
      setShowStepForm(false);
      setEditingStep(null);
    } catch (error) {
      // Error already handled in handleSaveStepsToDatabase
      // Keep form open so user can retry or cancel
      console.log('Save failed, keeping form open for retry');
    }
  };

  const handleDeleteStep = (stepId: string) => {
    const step = localSteps.find(s => s.id === stepId);
    if (step) {
      setStepToDelete({ id: stepId, name: step.stepName });
      setShowDeleteModal(true);
    }
  };

  const confirmDeleteStep = async () => {
    if (!stepToDelete) return;

    const updatedSteps = localSteps.filter(s => s.id !== stepToDelete.id);
    setLocalSteps(updatedSteps);

    try {
      // Immediately save to database
      await handleSaveStepsToDatabase(updatedSteps);

      // Only close modal if save succeeded
      setShowDeleteModal(false);
      setStepToDelete(null);
    } catch (error) {
      // Error already handled in handleSaveStepsToDatabase
      // Keep modal open so user can retry or cancel
      console.log('Delete failed, keeping modal open for retry');
    }
  };

  const handleMoveStep = async (stepId: string, direction: 'up' | 'down') => {
    // Sort steps by order to get correct current positions
    const sortedSteps = [...localSteps].sort((a, b) => a.stepOrder - b.stepOrder);
    const stepIndex = sortedSteps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return;

    const newIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
    if (newIndex < 0 || newIndex >= sortedSteps.length) return;

    // Calculate new step order by placing it between adjacent steps
    const currentStep = sortedSteps[stepIndex];
    let newStepOrder: number;

    if (direction === 'up') {
      // Moving up: place between the step above and two steps above
      const targetStep = sortedSteps[newIndex];
      const stepAboveTarget = newIndex > 0 ? sortedSteps[newIndex - 1] : null;

      if (stepAboveTarget) {
        // Calculate midpoint between stepAboveTarget and targetStep
        newStepOrder = Math.floor((stepAboveTarget.stepOrder + targetStep.stepOrder) / 2);
      } else {
        // Moving to first position
        newStepOrder = targetStep.stepOrder - 100;
      }
    } else {
      // Moving down: place between the step below and two steps below
      const targetStep = sortedSteps[newIndex];
      const stepBelowTarget = newIndex < sortedSteps.length - 1 ? sortedSteps[newIndex + 1] : null;

      if (stepBelowTarget) {
        // Calculate midpoint between targetStep and stepBelowTarget
        newStepOrder = Math.floor((targetStep.stepOrder + stepBelowTarget.stepOrder) / 2);
      } else {
        // Moving to last position
        newStepOrder = targetStep.stepOrder + 100;
      }
    }

    // Update the moved step's order
    const updatedSteps = localSteps.map(s =>
      s.id === stepId ? { ...s, stepOrder: newStepOrder } : s
    );

    setLocalSteps(updatedSteps);

    // Immediately save to database
    try {
      await handleSaveStepsToDatabase(updatedSteps);

      // Check if we need to renormalize (if gaps are getting too small)
      const sortedUpdated = [...updatedSteps].sort((a, b) => a.stepOrder - b.stepOrder);
      let needsRenormalization = false;

      for (let i = 1; i < sortedUpdated.length; i++) {
        const gap = sortedUpdated[i].stepOrder - sortedUpdated[i - 1].stepOrder;
        if (gap < 10) {
          needsRenormalization = true;
          break;
        }
      }

      if (needsRenormalization) {
        console.log('Gap too small, renormalizing step orders...');
        await renormalizeStepOrders(updatedSteps);
      }
    } catch (error) {
      // Error already handled in handleSaveStepsToDatabase
      console.log('Move failed, steps restored to previous state');
    }
  };

  const renormalizeStepOrders = async (stepsToRenormalize: WorkflowStep[]) => {
    // Sort steps by current order
    const sortedSteps = [...stepsToRenormalize].sort((a, b) => a.stepOrder - b.stepOrder);

    // Reassign orders with 100-unit intervals
    const renormalizedSteps = sortedSteps.map((step, index) => ({
      ...step,
      stepOrder: (index + 1) * 100
    }));

    console.log('Renormalizing step orders:', renormalizedSteps.map(s => ({ id: s.id, name: s.stepName, order: s.stepOrder })));

    // Update local state
    setLocalSteps(renormalizedSteps);

    // Save to database
    await handleSaveStepsToDatabase(renormalizedSteps);
  };

  const handleSaveSteps = async () => {
    await handleSaveStepsToDatabase(localSteps);
  };

  const handleSaveStepsToDatabase = async (stepsToSave: WorkflowStep[]) => {
    setIsSaving(true);

    // Keep a backup of current steps in case save fails
    const previousSteps = [...localSteps];

    try {
      // Filter out any undefined, null, or invalid steps before saving
      const validSteps = stepsToSave.filter(step => {
        if (!step || typeof step !== 'object') {
          console.log('Filtering out invalid step (not object):', step);
          return false;
        }
        if (!step.id || typeof step.id !== 'string') {
          console.log('Filtering out step with invalid ID:', step);
          return false;
        }
        if (!step.stepName || !step.stepType) {
          console.log('Filtering out step with missing name/type:', step);
          console.log('Step details:', { stepName: step.stepName, stepType: step.stepType });
          return false;
        }
        if (typeof step.stepOrder !== 'number' || step.stepOrder < 1) {
          console.log('Filtering out step with invalid stepOrder:', step);
          return false;
        }
        // Ensure configJson exists
        if (!step.configJson) {
          console.log('Step missing configJson, setting to empty object:', step.id);
          step.configJson = {};
        }
        return true;
      });

      console.log('Original steps to save:', stepsToSave);
      console.log('Valid steps after filtering:', validSteps);

      if (validSteps.length !== stepsToSave.length) {
        console.warn(`Filtered out ${stepsToSave.length - validSteps.length} invalid steps`);
      }

      // Don't proceed if we have no valid steps and we're not intentionally clearing
      if (validSteps.length === 0 && stepsToSave.length > 0) {
        console.error('All steps were filtered out as invalid, aborting save to prevent data loss');
        console.error('Steps that were filtered out:', stepsToSave);
        throw new Error('All workflow steps are invalid. Please check step configuration.');
      }

      console.log('Saving valid steps to database:', validSteps);
      await onUpdateSteps(validSteps);
      console.log('Steps saved successfully');
    } catch (error) {
      console.error('❌ Failed to save steps - Full error object:', error);

      // Extract detailed error message
      let errorMessage = 'Unknown error occurred';

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Handle Supabase error objects
        const supabaseError = error as any;
        if (supabaseError.message) {
          errorMessage = supabaseError.message;
        }
        if (supabaseError.details) {
          errorMessage += `\nDetails: ${supabaseError.details}`;
        }
        if (supabaseError.hint) {
          errorMessage += `\nHint: ${supabaseError.hint}`;
        }
      }

      console.error('Extracted error message:', errorMessage);

      // Restore previous steps on error to prevent UI from showing empty state
      console.log('Restoring previous steps due to save error');
      setLocalSteps(previousSteps);

      alert(`Failed to save workflow steps: ${errorMessage}\n\nYour changes have been reverted to prevent data loss.`);

      // Re-throw to prevent caller from thinking save succeeded
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const getStepTypeIcon = (stepType: string) => {
    switch (stepType) {
      case 'api_call':
        return '🌐';
      case 'conditional_check':
        return '❓';
      case 'data_transform':
        return '🔄';
      case 'email_action':
        return '📧';
      default:
        return '⚙️';
    }
  };

  const getStepTypeLabel = (stepType: string) => {
    switch (stepType) {
      case 'api_call':
        return 'API Call';
      case 'api_endpoint':
        return 'API Endpoint';
      case 'conditional_check':
        return 'Conditional Check';
      case 'data_transform':
        return 'Data Transform';
      case 'sftp_upload':
        return 'SFTP Upload';
      case 'rename_file':
      case 'rename_pdf':
        return 'Rename File';
      case 'email_action':
        return 'Email Action';
      case 'multipart_form_upload':
        return 'Multipart Form';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
      {/* Delete Confirmation Modal */}
      {showDeleteModal && stepToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Workflow Step</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to permanently delete the step <strong>"{stepToDelete.name}"</strong>?
              </p>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span className="font-semibold text-red-800 dark:text-red-300">Warning</span>
              </div>
              <p className="text-red-700 dark:text-red-400 text-sm">
                This action cannot be undone. The step will be permanently removed from the workflow and all its configuration will be lost.
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={confirmDeleteStep}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Step</span>
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setStepToDelete(null);
                }}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Configuration Modal */}
      {showStepForm && editingStep && (
        <StepConfigForm
          step={editingStep}
          allSteps={localSteps}
          apiConfig={apiConfig}
          onSave={handleSaveStep}
          onCancel={() => {
            setShowStepForm(false);
            setEditingStep(null);
          }}
          extractionType={extractionTypes?.find(et => et.workflowId === workflow.id)}
        />
      )}

      {/* Step Copy Modal */}
      {showCopyModal && (
        <StepCopyModal
          currentWorkflowId={workflow.id}
          onCopy={handleCopyStep}
          onCancel={() => setShowCopyModal(false)}
        />
      )}

      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{workflow.name}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {workflow.description || 'No description provided'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowCopyModal(true)}
              disabled={isTemporaryWorkflow}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Copy className="h-4 w-4" />
              <span>Copy Step</span>
            </button>
            <button
              onClick={handleAddStep}
              disabled={isTemporaryWorkflow}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Step</span>
            </button>
            <button
              onClick={handleSaveSteps}
              disabled={isSaving || isTemporaryWorkflow}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving...' : 'Save Steps'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Steps List */}
      <div className="p-6">
        {isTemporaryWorkflow && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                  Workflow Not Saved
                </h3>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-400">
                  <p>
                    This workflow has not been saved to the database yet. Please use the "Save All" button above to save it before adding steps.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {localSteps.length === 0 ? (
          <div className="text-center py-8">
            <Settings className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Steps Defined</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Add your first step to get started with this workflow.</p>
            <button
              onClick={handleAddStep}
              disabled={isTemporaryWorkflow}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Step</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {localSteps
              .sort((a, b) => a.stepOrder - b.stepOrder)
              .map((step, index) => (
                <div
                  key={step.id}
                  className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-white dark:bg-gray-600 p-2 rounded-lg border border-gray-300 dark:border-gray-500">
                        <span className="text-lg">{getStepTypeIcon(step.stepType)}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-1 rounded-full">
                            Step {step.stepOrder}
                          </span>
                          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                            {getStepTypeLabel(step.stepType)}
                          </span>
                        </div>
                        <h5 className="font-medium text-gray-900 dark:text-gray-100 mt-1">{step.stepName}</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {step.stepType === 'api_call' && step.configJson.url && `URL: ${step.configJson.url}`}
                          {step.stepType === 'conditional_check' && step.configJson.jsonPath && `Check: ${step.configJson.jsonPath}`}
                          {step.stepType === 'data_transform' && 'Transform data'}
                          {step.stepType === 'sftp_upload' && 'Upload PDF to SFTP'}
                          {(step.stepType === 'rename_file' || step.stepType === 'rename_pdf') && step.configJson.filenameTemplate && `Template: ${step.configJson.filenameTemplate}`}
                          {step.stepType === 'email_action' && step.configJson.to && `To: ${step.configJson.to}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleMoveStep(step.id, 'up')}
                        disabled={index === 0}
                        className="p-2 text-gray-600 dark:text-white hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-all duration-200 border border-transparent hover:border-gray-300 dark:hover:border-gray-500"
                        title="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleMoveStep(step.id, 'down')}
                        disabled={index === localSteps.length - 1}
                        className="p-2 text-gray-600 dark:text-white hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-all duration-200 border border-transparent hover:border-gray-300 dark:hover:border-gray-500"
                        title="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEditStep(step)}
                        className="p-2 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200 border border-transparent hover:border-blue-300 dark:hover:border-blue-500"
                        title="Edit step"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        className="p-2 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 border border-transparent hover:border-red-300 dark:hover:border-red-500"
                        title="Delete step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}