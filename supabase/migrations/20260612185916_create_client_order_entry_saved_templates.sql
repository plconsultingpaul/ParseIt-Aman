CREATE TABLE client_order_entry_saved_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_number text NOT NULL,
  template_name text NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}',
  order_entry_template_id uuid REFERENCES order_entry_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_client_order_entry_saved_templates_number 
  ON client_order_entry_saved_templates(client_id, template_number);

CREATE INDEX idx_client_order_entry_saved_templates_client 
  ON client_order_entry_saved_templates(client_id);

ALTER TABLE client_order_entry_saved_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_client_templates" ON client_order_entry_saved_templates
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT client_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "insert_own_client_templates" ON client_order_entry_saved_templates
  FOR INSERT TO authenticated
  WITH CHECK (client_id IN (SELECT client_id FROM public.users WHERE id = auth.uid()) AND user_id = auth.uid());

CREATE POLICY "update_own_client_templates" ON client_order_entry_saved_templates
  FOR UPDATE TO authenticated
  USING (client_id IN (SELECT client_id FROM public.users WHERE id = auth.uid()) AND user_id = auth.uid())
  WITH CHECK (client_id IN (SELECT client_id FROM public.users WHERE id = auth.uid()) AND user_id = auth.uid());

CREATE POLICY "delete_own_client_templates" ON client_order_entry_saved_templates
  FOR DELETE TO authenticated
  USING (client_id IN (SELECT client_id FROM public.users WHERE id = auth.uid()) AND user_id = auth.uid());
