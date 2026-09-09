import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, ArrowUp, ArrowDown, Settings, AlertTriangle, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ExecuteButtonStep, ExecuteButtonStepType, ApiConfig } from '../../types';
import { fetchApiConfig } from '../../services/configService';
import StepConfigForm from './workflow/StepConfigForm';

interface ExecuteButtonField {
  id: string;
  groupId: string;
  name: string;
  fieldKey: string;
  fieldType: string;
}

interface ExecuteButtonStepsSectionProps {
  buttonId: string;
  buttonName: string;
  fields: ExecuteButtonField[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function ExecuteButtonStepsSection({
  buttonId,
  buttonName,
  fields,
  onError,
  onSuccess
}: ExecuteButtonStepsSectionProps) {
  const [steps, setSteps] = useState<ExecuteButtonStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingStep, setEditingStep] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        console.log('[ExecuteButtonStepsSection] Warming up schema cache for execute_button_steps table...');
        const { error: warmupError } = await supabase
          .from('execute_button_steps')
          .select('id')
          .limit(0);

        if (warmupError) {
          console.error('[ExecuteButtonStepsSection] Schema cache warmup failed:', warmupError);
        } else {
          console.log('[ExecuteButtonStepsSection] Schema cache warmed up successfully');
        }
      } catch (err) {
        console.error('[ExecuteButtonStepsSection] Schema warmup exception:', err);
      }

      loadSteps();
      loadApiConfig();
    };

    initializeComponent();
  }, [buttonId]);

  const loadSteps = async () => {
    try {
      setLoading(true);
      console.log('[ExecuteButtonStepsSection] Loading steps for button:', buttonId);

      const { data, error } = await supabase
        .from('execute_button_steps')
        .select('*')
        .eq('button_id', buttonId)
        .order('step_order', { ascending: true });

      console.log('[ExecuteButtonStepsSection] Load steps result:', { data, error, count: data?.length });

      if (error) {
        console.error('[ExecuteButtonStepsSection] Load steps error:', error);
        throw error;
      }

      const stepsData: ExecuteButtonStep[] = (data || []).map((s: any) => ({
        id: s.id,
        buttonId: s.button_id,
        stepOrder: s.step_order,
        stepType: s.step_type,
        stepName: s.step_name,
        configJson: s.config_json || {},
        nextStepOnSuccessId: s.next_step_on_success_id,
        nextStepOnFailureId: s.next_step_on_failure_id,
        escapeSingleQuotesInBody: s.escape_single_quotes_in_body,
        isEnabled: s.is_enabled,
        createdAt: s.created_at,
        updatedAt: s.updated_at
      }));

      setSteps(stepsData);
    } catch (err: any) {
      console.error('[ExecuteButtonStepsSection] Failed to load steps:', err);
      onError('Failed to load workflow steps');
    } finally {
      setLoading(false);
    }
  };

  const loadApiConfig = async () => {
    try {
      const config = await fetchApiConfig();
      setApiConfig(config);
    } catch (err: any) {
      console.error('Failed to load API config:', err);
    }
  };

  const handleAddStep = () => {
    const maxStepOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) : 0;

    const newStep = {
      id: `temp-${Date.now()}`,
      buttonId: buttonId,
      stepOrder: maxStepOrder + 100,
      stepType: 'api_call' as ExecuteButtonStepType,
      stepName: 'New Step',
      configJson: {},
      isEnabled: true,
      workflowId: buttonId
    };

    setEditingStep(newStep);
    setShowStepForm(true);
  };

  const handleEditStep = (step: ExecuteButtonStep) => {
    setEditingStep({
      ...step,
      workflowId: buttonId,
      step_type: step.stepType,
      step_name: step.stepName,
      step_order: step.stepOrder,
      config_json: step.configJson
    });
    setShowStepForm(true);
  };

  const handleSaveStep = async (stepData: any) => {
    setIsSaving(true);
    try {
      const stepRecord = {
        button_id: buttonId,
        step_order: stepData.stepOrder || stepData.step_order,
        step_type: stepData.stepType || stepData.step_type,
        step_name: stepData.stepName || stepData.step_name,
        config_json: stepData.configJson || stepData.config_json || {},
        next_step_on_success_id: stepData.nextStepOnSuccessId || null,
        next_step_on_failure_id: stepData.nextStepOnFailureId || null,
        escape_single_quotes_in_body: stepData.escapeSingleQuotesInBody || false,
        is_enabled: stepData.isEnabled !== false,
        updated_at: new Date().toISOString()
      };

      console.log('[ExecuteButtonStepsSection] Preparing to save step:', {
        isUpdate: stepData.id && !stepData.id.startsWith('temp-'),
        stepId: stepData.id,
        stepRecord,
        originalStepData: stepData
      });

      if (stepData.id && !stepData.id.startsWith('temp-')) {
        console.log('[ExecuteButtonStepsSection] Executing UPDATE query...');
        const { data, error } = await supabase
          .from('execute_button_steps')
          .update(stepRecord)
          .eq('id', stepData.id)
          .select();

        console.log('[ExecuteButtonStepsSection] UPDATE result:', { data, error });
        if (error) {
          console.error('[ExecuteButtonStepsSection] UPDATE error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          throw error;
        }
        onSuccess('Step updated successfully');
      } else {
        const insertRecord = { ...stepRecord, created_at: new Date().toISOString() };
        console.log('[ExecuteButtonStepsSection] Executing INSERT query with record:', insertRecord);

        const { data, error } = await supabase
          .from('execute_button_steps')
          .insert([insertRecord])
          .select();

        console.log('[ExecuteButtonStepsSection] INSERT result:', { data, error });
        if (error) {
          console.error('[ExecuteButtonStepsSection] INSERT error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          throw error;
        }
        onSuccess('Step created successfully');
      }

      setShowStepForm(false);
      setEditingStep(null);
      await loadSteps();
    } catch (err: any) {
      console.error('[ExecuteButtonStepsSection] Save failed with exception:', err);
      onError('Failed to save step: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStep = (step: ExecuteButtonStep) => {
    setStepToDelete({ id: step.id, name: step.stepName });
    setShowDeleteModal(true);
  };

  const confirmDeleteStep = async () => {
    if (!stepToDelete) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('execute_button_steps')
        .delete()
        .eq('id', stepToDelete.id);

      if (error) throw error;

      onSuccess('Step deleted successfully');
      setShowDeleteModal(false);
      setStepToDelete(null);
      await loadSteps();
    } catch (err: any) {
      onError('Failed to delete step: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveStep = async (stepId: string, direction: 'up' | 'down') => {
    const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const stepIndex = sortedSteps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return;

    const newIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
    if (newIndex < 0 || newIndex >= sortedSteps.length) return;

    const currentStep = sortedSteps[stepIndex];
    const targetStep = sortedSteps[newIndex];

    let newStepOrder: number;
    if (direction === 'up') {
      const stepAboveTarget = newIndex > 0 ? sortedSteps[newIndex - 1] : null;
      newStepOrder = stepAboveTarget
        ? Math.floor((stepAboveTarget.stepOrder + targetStep.stepOrder) / 2)
        : targetStep.stepOrder - 100;
    } else {
      const stepBelowTarget = newIndex < sortedSteps.length - 1 ? sortedSteps[newIndex + 1] : null;
      newStepOrder = stepBelowTarget
        ? Math.floor((targetStep.stepOrder + stepBelowTarget.stepOrder) / 2)
        : targetStep.stepOrder + 100;
    }

    try {
      const { error } = await supabase
        .from('execute_button_steps')
        .update({ step_order: newStepOrder, updated_at: new Date().toISOString() })
        .eq('id', stepId);

      if (error) throw error;
      await loadSteps();
    } catch (err: any) {
      onError('Failed to reorder step: ' + err.message);
    }
  };

  const handleToggleEnabled = async (step: ExecuteButtonStep) => {
    try {
      const { error } = await supabase
        .from('execute_button_steps')
        .update({ is_enabled: !step.isEnabled, updated_at: new Date().toISOString() })
        .eq('id', step.id);

      if (error) throw error;
      await loadSteps();
    } catch (err: any) {
      onError('Failed to toggle step: ' + err.message);
    }
  };

  const getStepTypeIcon = (stepType: string) => {
    switch (stepType) {
      case 'api_call':
      case 'api_endpoint':
        return '🌐';
      case 'conditional_check':
        return '❓';
      case 'data_transform':
        return '🔄';
      case 'email_action':
        return '📧';
      case 'sftp_upload':
        return '📤';
      case 'rename_file':
        return '📝';
      default:
        return '⚙️';
    }
  };

  const getStepTypeLabel = (stepType: string) => {
    switch (stepType) {
      case 'api_call': return 'API Call';
      case 'api_endpoint': return 'API Endpoint';
      case 'conditional_check': return 'Conditional Check';
      case 'data_transform': return 'Data Transform';
      case 'sftp_upload': return 'SFTP Upload';
      case 'email_action': return 'Email Action';
      case 'rename_file': return 'Rename File';
      default: return 'Unknown';
    }
  };

  const convertStepForForm = (step: ExecuteButtonStep) => {
    return {
      id: step.id,
      workflowId: buttonId,
      stepOrder: step.stepOrder,
      stepType: step.stepType,
      stepName: step.stepName,
      configJson: step.configJson,
      nextStepOnSuccessId: step.nextStepOnSuccessId,
      nextStepOnFailureId: step.nextStepOnFailureId,
      escapeSingleQuotesInBody: step.escapeSingleQuotesInBody
    };
  };

  const allStepsForForm = steps.map(convertStepForForm);

  const executeButtonFieldVariables = fields.map(f => ({
    name: `execute.${f.fieldKey}`,
    description: f.name
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">
            Workflow Steps - {buttonName}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure the steps that will execute when this button is clicked
          </p>
        </div>
        <button
          onClick={handleAddStep}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Step
        </button>
      </div>

      {fields.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-1">
            Available Field Variables
          </p>
          <div className="flex flex-wrap gap-2">
            {fields.map(f => (
              <code key={f.id} className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded">
                {'{{execute.' + f.fieldKey + '}}'}
              </code>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Loading steps...</p>
        </div>
      ) : steps.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <Settings className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">No workflow steps yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Add steps to define what happens when this button is clicked
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {steps
            .sort((a, b) => a.stepOrder - b.stepOrder)
            .map((step, index) => (
              <div
                key={step.id}
                className={`border rounded-lg p-4 transition-colors ${
                  step.isEnabled
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white dark:bg-gray-600 p-2 rounded-lg border border-gray-300 dark:border-gray-500">
                      <span className="text-lg">{getStepTypeIcon(step.stepType)}</span>
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                          Step {index + 1}
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                          {getStepTypeLabel(step.stepType)}
                        </span>
                        {!step.isEnabled && (
                          <span className="bg-gray-200 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
                            Disabled
                          </span>
                        )}
                      </div>
                      <h5 className="font-medium text-gray-900 dark:text-gray-100 mt-1">{step.stepName}</h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {step.stepType === 'api_call' && step.configJson.url && `URL: ${step.configJson.url}`}
                        {step.stepType === 'api_endpoint' && step.configJson.apiPath && `Path: ${step.configJson.apiPath}`}
                        {step.stepType === 'conditional_check' && step.configJson.jsonPath && `Check: ${step.configJson.jsonPath}`}
                        {step.stepType === 'email_action' && step.configJson.to && `To: ${step.configJson.to}`}
                        {step.stepType === 'sftp_upload' && 'Upload to SFTP'}
                        {step.stepType === 'rename_file' && step.configJson.filenameTemplate && `Template: ${step.configJson.filenameTemplate}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleToggleEnabled(step)}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        step.isEnabled
                          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                          : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={step.isEnabled ? 'Disable step' : 'Enable step'}
                    >
                      {step.isEnabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => handleMoveStep(step.id, 'up')}
                      disabled={index === 0}
                      className="p-2 text-gray-600 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-all duration-200"
                      title="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleMoveStep(step.id, 'down')}
                      disabled={index === steps.length - 1}
                      className="p-2 text-gray-600 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-all duration-200"
                      title="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleEditStep(step)}
                      className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200"
                      title="Edit step"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteStep(step)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200"
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

      {showStepForm && editingStep && (
        <StepConfigForm
          step={editingStep}
          allSteps={allStepsForForm}
          apiConfig={apiConfig || { path: '', password: '', googleApiKey: '', orderDisplayFields: '', customOrderDisplayFields: [] }}
          onSave={handleSaveStep}
          onCancel={() => {
            setShowStepForm(false);
            setEditingStep(null);
          }}
          executeButtonFields={fields.map(f => ({ fieldKey: f.fieldKey, name: f.name }))}
        />
      )}

      {showDeleteModal && stepToDelete && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Delete Step</h3>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to delete <strong>"{stepToDelete.name}"</strong>?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                This action cannot be undone.
              </p>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setStepToDelete(null);
                }}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </button>
              <button
                onClick={confirmDeleteStep}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
