CREATE TABLE IF NOT EXISTS workflow_v2_step_test_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id uuid NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, step_id)
);

ALTER TABLE workflow_v2_step_test_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_step_test_inputs"
  ON workflow_v2_step_test_inputs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_step_test_inputs"
  ON workflow_v2_step_test_inputs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_step_test_inputs"
  ON workflow_v2_step_test_inputs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_step_test_inputs"
  ON workflow_v2_step_test_inputs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_workflow_v2_step_test_inputs_user_step
  ON workflow_v2_step_test_inputs (user_id, step_id);
