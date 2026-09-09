@@ .. @@
          // Create copies of all steps with new IDs, updated workflow ID, and sequential step orders
          const copiedSteps: WorkflowStep[] = sortedOriginalSteps.map((step, index) => ({
            ...step,
            id: stepIdMapping[step.id],
            workflowId: savedWorkflow.id,
            stepOrder: index + 1, // Ensure sequential step orders starting from 1
            // Preserve step connections by mapping to new step IDs
            nextStepOnSuccessId: step.nextStepOnSuccessId ? (stepIdMapping[step.nextStepOnSuccessId] || null) : null,
            nextStepOnFailureId: step.nextStepOnFailureId ? (stepIdMapping[step.nextStepOnFailureId] || null) : null,
            // Remove any database-generated fields that shouldn't be copied
            createdAt: undefined,
            updatedAt: undefined
          }));

            onUpdateSteps={async (steps) => {
              const validSteps = steps.filter(step => step != null);
              await updateWorkflowSteps(selectedWorkflow.id, validSteps);
              await refreshData();
            }}