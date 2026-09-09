/*
# Email Processing failure notifications

Adds site-wide toggles for sending an email when an Email Processing
queue row fails, plus a per-row timestamp so retries don't re-notify.

1. Modified Tables
   - `email_monitoring_config`
     - `enable_failure_notifications` (bool, default false) — master toggle.
     - `failure_notification_template_id` (uuid, FK notification_templates.id) — template to render.
     - `failure_recipient_email_override` (text) — optional override for template's recipient.
   - `email_processing_queue`
     - `failure_notified_at` (timestamptz) — set once a failure email has been sent for this row; cleared when a row is reprocessed.

2. Security
   - No RLS changes. Both tables were already RLS-managed by prior migrations.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_monitoring_config' AND column_name = 'enable_failure_notifications'
  ) THEN
    ALTER TABLE email_monitoring_config ADD COLUMN enable_failure_notifications boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_monitoring_config' AND column_name = 'failure_notification_template_id'
  ) THEN
    ALTER TABLE email_monitoring_config ADD COLUMN failure_notification_template_id uuid REFERENCES notification_templates(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_monitoring_config' AND column_name = 'failure_recipient_email_override'
  ) THEN
    ALTER TABLE email_monitoring_config ADD COLUMN failure_recipient_email_override text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_processing_queue' AND column_name = 'failure_notified_at'
  ) THEN
    ALTER TABLE email_processing_queue ADD COLUMN failure_notified_at timestamptz;
  END IF;
END $$;
