import { supabase } from '../lib/supabase';
import type { ExtractionWorkflow, WorkflowStep } from '../types';

export async function fetchWorkflows(): Promise<ExtractionWorkflow[]> {
  try {
    const { data, error } = await supabase
      .from('extraction_workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description || '',
      isActive: workflow.is_active,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at
    }));
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return [];
  }
}

export async function updateWorkflows(workflows: ExtractionWorkflow[]): Promise<Map<string, string>> {
  console.log('=== updateWorkflows START ===');
  console.log('Input workflows count:', workflows.length);
  console.log('Input workflows:', workflows.map(w => ({ id: w.id, name: w.name, isTemp: w.id.startsWith('temp-') })));

  const tempToPermIdMap = new Map<string, string>();

  try {
    // Get existing workflows to determine which to update vs insert
    const { data: existingWorkflows } = await supabase
      .from('extraction_workflows')
      .select('id');

    const existingIds = new Set((existingWorkflows || []).map(w => w.id));
    console.log('Existing workflow IDs:', Array.from(existingIds));

    const workflowsToUpdate = workflows.filter(workflow => existingIds.has(workflow.id) && !workflow.id.startsWith('temp-'));
    const workflowsToInsert = workflows.filter(workflow => !existingIds.has(workflow.id) || workflow.id.startsWith('temp-'));

    console.log('Workflows to update:', workflowsToUpdate.length);
    console.log('Workflows to insert:', workflowsToInsert.length);

    // Update existing workflows
    for (const workflow of workflowsToUpdate) {
      console.log('Updating workflow:', workflow.id, workflow.name);
      const { error } = await supabase
        .from('extraction_workflows')
        .update({
          name: workflow.name,
          description: workflow.description,
          is_active: workflow.isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', workflow.id);

      if (error) throw error;
      console.log('✅ Updated workflow:', workflow.id);
    }

    // Insert new workflows
    if (workflowsToInsert.length > 0) {
      console.log('Inserting new workflows...');
      const { data: insertedWorkflows, error } = await supabase
        .from('extraction_workflows')
        .insert(
          workflowsToInsert.map(workflow => ({
            name: workflow.name,
            description: workflow.description,
            is_active: workflow.isActive
          }))
        )
        .select('id, name');

      if (error) throw error;

      console.log('✅ Inserted workflows:', insertedWorkflows);

      // Create mapping from temp IDs to permanent IDs
      workflowsToInsert.forEach((tempWorkflow, index) => {
        const insertedWorkflow = insertedWorkflows[index];
        if (insertedWorkflow) {
          tempToPermIdMap.set(tempWorkflow.id, insertedWorkflow.id);
          console.log(`Mapped ${tempWorkflow.id} -> ${insertedWorkflow.id}`);
        }
      });
    }

    // Delete workflows that are no longer in the list
    const currentIds = workflows.filter(workflow => !workflow.id.startsWith('temp-')).map(workflow => workflow.id);
    // Add newly inserted permanent IDs to the list of current IDs
    tempToPermIdMap.forEach(permId => currentIds.push(permId));
    
    if (currentIds.length > 0) {
      console.log('Current workflow IDs (including new ones):', currentIds);
      const { error } = await supabase
        .from('extraction_workflows')
        .delete()
        .filter('id', 'not.in', `(${currentIds.map(id => `"${id}"`).join(',')})`);

      if (error) throw error;
      console.log('✅ Cleaned up old workflows');
    }

    console.log('=== updateWorkflows COMPLETE ===');
    console.log('Temp to permanent ID mapping:', Object.fromEntries(tempToPermIdMap));
    return tempToPermIdMap;

  } catch (error) {
    console.error('❌ Error updating workflows:', error);
    throw error;
  }
}

export async function deleteWorkflow(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('extraction_workflows')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting workflow:', error);
    throw error;
  }
}

export async function fetchWorkflowSteps(): Promise<WorkflowStep[]> {
  try {
    const { data, error } = await supabase
      .from('workflow_steps')
      .select('*')
      .order('workflow_id, step_order');

    if (error) throw error;

    return (data || []).map(step => ({
      id: step.id,
      workflowId: step.workflow_id,
      stepOrder: step.step_order,
      stepType: step.step_type,
      stepName: step.step_name,
      configJson: step.config_json || {},
      nextStepOnSuccessId: step.next_step_on_success_id,
      nextStepOnFailureId: step.next_step_on_failure_id,
      userResponseTemplate: step.user_response_template,
      createdAt: step.created_at,
      updatedAt: step.updated_at
    }));
  } catch (error) {
    console.error('Error fetching workflow steps:', error);
    return [];
  }
}

export async function updateWorkflowSteps(workflowId: string, steps: WorkflowStep[]): Promise<void> {
  console.log('=== updateWorkflowSteps START ===');
  console.log('Workflow ID:', workflowId);
  console.log('Steps to save:', steps.length);
  console.log('Steps details:', steps.map(s => ({ id: s.id, name: s.stepName, order: s.stepOrder, type: s.stepType })));

  try {
    // Validate steps before proceeding
    if (steps.some(step => !step.stepName || !step.stepType || typeof step.stepOrder !== 'number')) {
      throw new Error('Invalid step data: all steps must have stepName, stepType, and stepOrder');
    }

    // Get current steps from database first to determine what exists
    const { data: currentSteps, error: fetchError } = await supabase
      .from('workflow_steps')
      .select('id')
      .eq('workflow_id', workflowId);

    if (fetchError) throw fetchError;

    const currentStepIds = new Set((currentSteps || []).map(s => s.id));

    // Separate steps into those that exist in DB and new steps
    // Check against actual DB records, not just ID format
    const existingSteps = steps.filter(step => step.id && currentStepIds.has(step.id));
    const newSteps = steps.filter(step => !step.id || !currentStepIds.has(step.id));

    console.log('Existing steps to update/keep:', existingSteps.length);
    console.log('New steps to insert:', newSteps.length);

    const keepStepIds = new Set(existingSteps.map(s => s.id));

    // Find steps to delete (exist in DB but not in our keep list)
    const stepsToDelete = Array.from(currentStepIds).filter(id => !keepStepIds.has(id));

    console.log('Steps to delete:', stepsToDelete.length);

    // Insert new steps with their IDs preserved
    if (newSteps.length > 0) {
      console.log('📝 Inserting new steps...');

      const stepsToInsert = newSteps.map(step => {
        const baseStep = {
          workflow_id: workflowId,
          step_order: step.stepOrder,
          step_type: step.stepType,
          step_name: step.stepName,
          config_json: step.configJson || {},
          next_step_on_success_id: step.nextStepOnSuccessId || null,
          next_step_on_failure_id: step.nextStepOnFailureId || null,
          user_response_template: step.userResponseTemplate || null
        };

        // Only include id if it's a valid UUID (from copy operation)
        // Omit id for temp IDs to let database auto-generate
        if (step.id && !step.id.toString().startsWith('temp-')) {
          return { id: step.id, ...baseStep };
        }

        return baseStep;
      });

      console.log('Inserting steps with IDs:', stepsToInsert);
      console.log('Inserting steps with full data:', JSON.stringify(stepsToInsert, null, 2));

      // Insert with specified id field to preserve UUIDs from copy operation
      const { data: insertedSteps, error: insertError } = await supabase
        .from('workflow_steps')
        .insert(stepsToInsert)
        .select();

      if (insertError) {
        console.error('❌ Insert error details:', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
          fullError: insertError
        });

        // Create a more descriptive error message
        const errorMsg = insertError.message || 'Database insert failed';
        const errorDetails = insertError.details ? ` Details: ${insertError.details}` : '';
        const errorHint = insertError.hint ? ` Hint: ${insertError.hint}` : '';

        throw new Error(`${errorMsg}${errorDetails}${errorHint}`);
      }
      console.log('✅ Steps inserted successfully:', insertedSteps?.length);
    }

    // Update existing steps
    if (existingSteps.length > 0) {
      console.log('🔄 Updating existing steps...');

      for (const step of existingSteps) {
        const { error: updateError } = await supabase
          .from('workflow_steps')
          .update({
            step_order: step.stepOrder,
            step_type: step.stepType,
            step_name: step.stepName,
            config_json: step.configJson || {},
            next_step_on_success_id: step.nextStepOnSuccessId || null,
            next_step_on_failure_id: step.nextStepOnFailureId || null,
            user_response_template: step.userResponseTemplate || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', step.id)
          .eq('workflow_id', workflowId);

        if (updateError) {
          console.error('❌ Update error for step:', step.id, {
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
            code: updateError.code,
            fullError: updateError
          });

          // Create a more descriptive error message
          const errorMsg = updateError.message || 'Database update failed';
          const errorDetails = updateError.details ? ` Details: ${updateError.details}` : '';
          const errorHint = updateError.hint ? ` Hint: ${updateError.hint}` : '';

          throw new Error(`${errorMsg}${errorDetails}${errorHint}`);
        }
      }
      console.log('✅ Existing steps updated');
    }

    // Delete removed steps (only after successful inserts/updates)
    if (stepsToDelete.length > 0) {
      console.log('🗑️ Deleting removed steps:', stepsToDelete);

      const { error: deleteError } = await supabase
        .from('workflow_steps')
        .delete()
        .in('id', stepsToDelete)
        .eq('workflow_id', workflowId);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw deleteError;
      }
      console.log('✅ Removed steps deleted');
    }

    console.log('=== updateWorkflowSteps COMPLETE ===');
  } catch (error) {
    console.error('❌ Error updating workflow steps:', error);
    throw error;
  }
}

export async function deleteWorkflowStep(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('workflow_steps')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting workflow step:', error);
    throw error;
  }
}