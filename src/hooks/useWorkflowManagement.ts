import React from 'react';
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { updateWorkflows, updateWorkflowSteps } from '../services';
import type { ExtractionWorkflow, WorkflowStep } from '../types';

export function useWorkflowManagement(
  initialWorkflows: ExtractionWorkflow[],
  workflowSteps: WorkflowStep[],
  refreshData?: () => Promise<void>,
  refreshWorkflowSteps?: () => Promise<void>
) {
  const [localWorkflows, setLocalWorkflows] = useState<ExtractionWorkflow[]>(initialWorkflows);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Update local workflows when props change
  React.useEffect(() => {
    setLocalWorkflows(initialWorkflows);
  }, [initialWorkflows]);

  const addWorkflow = useCallback(async (name: string, description?: string): Promise<string> => {
    console.log('=== ADD WORKFLOW START ===');
    console.log('Workflow name:', name);
    console.log('Workflow description:', description);

    setIsCreating(true);

    try {
      // Insert directly into database
      const { data, error } = await supabase
        .from('extraction_workflows')
        .insert({
          name: name.trim(),
          description: description?.trim() || '',
          is_active: true
        })
        .select('id, name, description, is_active, created_at, updated_at')
        .single();

      if (error) throw error;

      console.log('✅ Workflow created in database:', data);

      // Create the workflow object for local state
      const newWorkflow: ExtractionWorkflow = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };

      // Update local state
      const updatedWorkflows = [...localWorkflows, newWorkflow];
      setLocalWorkflows(updatedWorkflows);

      console.log('✅ Add workflow completed successfully');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      return data.id;

    } catch (error) {
      console.error('❌ Add workflow failed:', error);
      console.error('❌ Add workflow error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      throw error;
    } finally {
      console.log('🏁 Add workflow process finished, resetting isCreating flag');
      setIsCreating(false);
    }
  }, [localWorkflows, refreshData]);

  const updateWorkflow = useCallback(async (workflowId: string, updates: Partial<ExtractionWorkflow>) => {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { error } = await supabase
        .from('extraction_workflows')
        .update(dbUpdates)
        .eq('id', workflowId);

      if (error) throw error;

      const updatedWorkflows = localWorkflows.map(workflow =>
        workflow.id === workflowId ? { ...workflow, ...updates } : workflow
      );
      setLocalWorkflows(updatedWorkflows);
    } catch (error) {
      console.error('Failed to update workflow:', error);
      throw error;
    }
  }, [localWorkflows]);

  const deleteWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    setIsDeleting(true);
    try {
      // Only call database delete if this is not a temporary workflow
      if (!workflowId.startsWith('temp-')) {
        const { error } = await supabase
          .from('extraction_workflows')
          .delete()
          .eq('id', workflowId);
        
        if (error) throw error;
      }
      
      // Remove from local state
      const updatedWorkflows = localWorkflows.filter(w => w.id !== workflowId);
      setLocalWorkflows(updatedWorkflows);
      
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, [localWorkflows]);

  const copyWorkflow = useCallback(async (originalWorkflow: ExtractionWorkflow, newName: string): Promise<string> => {
    console.log('=== COPY WORKFLOW START ===');
    console.log('Copy workflow name:', newName);
    console.log('Original workflow:', originalWorkflow);

    setIsCopying(true);

    try {
      // Create copied workflow object
      const copiedWorkflow: ExtractionWorkflow = {
        ...originalWorkflow,
        id: `temp-${Date.now()}`,
        name: newName.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('📋 Created copied workflow object');
      const updatedWorkflows = [...localWorkflows, copiedWorkflow];
      setLocalWorkflows(updatedWorkflows);
      
      console.log('💾 Saving workflows to database...');
      
      // Save workflows to get permanent ID
      const tempToPermIdMap = await updateWorkflows(updatedWorkflows);
      console.log('✅ Workflows saved successfully');
      
      // Get the permanent ID from the mapping
      const permanentWorkflowId = tempToPermIdMap.get(copiedWorkflow.id);
      if (!permanentWorkflowId) {
        console.error('❌ Failed to get permanent ID for copied workflow');
        throw new Error('Failed to get permanent ID for copied workflow');
      }
      
      console.log('✅ Got permanent workflow ID:', permanentWorkflowId);

      // Now copy the steps
      const originalSteps = workflowSteps.filter(step => step.workflowId === originalWorkflow.id);
      console.log('📋 Original steps to copy:', originalSteps.length);
      console.log('📋 Original steps details:', originalSteps.map(s => ({ id: s.id, name: s.stepName, order: s.stepOrder })));

      if (originalSteps.length > 0) {
        console.log('📋 Copying workflow steps...');
        
        // Sort original steps by step order to maintain sequence
        const sortedOriginalSteps = originalSteps.sort((a, b) => a.stepOrder - b.stepOrder);
        console.log('📋 Sorted original steps:', sortedOriginalSteps.map(s => ({ id: s.id, name: s.stepName, order: s.stepOrder })));
        
        // Generate new UUIDs for all steps first
        const oldToNewIdMap = new Map<string, string>();
        sortedOriginalSteps.forEach(step => {
          oldToNewIdMap.set(step.id, uuidv4());
        });
        console.log('📋 Generated new step IDs:', Object.fromEntries(oldToNewIdMap));
        
        // Create copies of all steps with new UUIDs and updated references
        const copiedSteps: WorkflowStep[] = sortedOriginalSteps.map((step, index) => {
          const newStepId = oldToNewIdMap.get(step.id)!;
          
          const copiedStep = {
            ...step,
            id: newStepId,
            workflowId: permanentWorkflowId,
            stepOrder: index + 1,
            // Update step connections to use new IDs
            nextStepOnSuccessId: step.nextStepOnSuccessId ? oldToNewIdMap.get(step.nextStepOnSuccessId) || null : null,
            nextStepOnFailureId: step.nextStepOnFailureId ? oldToNewIdMap.get(step.nextStepOnFailureId) || null : null,
            // Remove database-generated fields
            createdAt: undefined,
            updatedAt: undefined
          };
          
          console.log(`📋 Created copied step ${index + 1}:`, {
            originalId: step.id,
            newId: newStepId,
            name: copiedStep.stepName,
            order: copiedStep.stepOrder,
            type: copiedStep.stepType
          });
          
          return copiedStep;
        });

        console.log('📋 Created copied steps:', copiedSteps.length);
        console.log('📋 Copied steps details:', copiedSteps.map(s => ({ id: s.id, name: s.stepName, order: s.stepOrder, workflowId: s.workflowId })));
        
        // Save the copied steps
        console.log('💾 Saving copied steps to database...');
        await updateWorkflowSteps(permanentWorkflowId, copiedSteps);
        console.log('✅ Steps copied successfully');
      } else {
        console.log('⚠️ No steps found to copy for workflow:', originalWorkflow.id);
      }

      // Update local state with the saved workflow
      const savedWorkflow = {
        ...copiedWorkflow,
        id: permanentWorkflowId
      };
      
      const finalUpdatedWorkflows = updatedWorkflows.map(w => 
        w.id === copiedWorkflow.id ? savedWorkflow : w
      );
      setLocalWorkflows(finalUpdatedWorkflows);
      
      console.log('✅ Copy workflow completed successfully');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Refresh workflow steps to ensure copied steps are loaded
      if (refreshWorkflowSteps) {
        console.log('🔄 Refreshing workflow steps...');
        await refreshWorkflowSteps();
        console.log('✅ Workflow steps refreshed');
      }

      return permanentWorkflowId;

    } catch (error) {
      console.error('❌ Copy workflow failed:', error);
      console.error('❌ Copy workflow error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      throw error;
    } finally {
      console.log('🏁 Copy workflow process finished, resetting isCopying flag');
      setIsCopying(false);
    }
  }, [localWorkflows, workflowSteps]);

  const saveWorkflows = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateWorkflows(localWorkflows);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save workflows:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [localWorkflows]);

  return {
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
  };
}