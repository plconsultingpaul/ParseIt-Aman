/*
# Add 'update_imaging_document' to workflow_v2_nodes step_type CHECK constraint

## Summary
The step_type column on workflow_v2_nodes has a CHECK constraint that validates
allowed step types. Adds a new value 'update_imaging_document' so imaging workflows
can write values (such as the Detail Line Id returned by a prior API Endpoint step)
back onto the imaging_documents record identified by contextData.imagingDocumentId.

## Changes
- Drop the existing step_type_check constraint.
- Re-create it with 'update_imaging_document' added to the allowed values.

## Important Notes
1. Non-destructive: no rows are modified or deleted.
2. The constraint is dropped and re-created in a single migration to avoid a window
   without validation.
*/

ALTER TABLE workflow_v2_nodes DROP CONSTRAINT IF EXISTS workflow_v2_nodes_step_type_check;

ALTER TABLE workflow_v2_nodes ADD CONSTRAINT workflow_v2_nodes_step_type_check
  CHECK (
    step_type IS NULL OR step_type = ANY (ARRAY[
      'api_call'::text,
      'api_endpoint'::text,
      'conditional_check'::text,
      'data_transform'::text,
      'sftp_upload'::text,
      'email_action'::text,
      'rename_file'::text,
      'multipart_form_upload'::text,
      'ai_decision'::text,
      'imaging'::text,
      'read_email'::text,
      'read_barcode'::text,
      'user_message'::text,
      'inbox'::text,
      'update_imaging_document'::text
    ])
  );
