/*
# Add 'error_handler' to workflow_v2_nodes step_type CHECK constraint

Allows the new Error Handler (Try/Catch) step type to be saved.
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
      'update_imaging_document'::text,
      'error_handler'::text
    ])
  );
