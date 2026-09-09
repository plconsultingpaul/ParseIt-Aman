/*
# Add scheduling support to Workflow v2

Lets an administrator run a Workflow v2 automatically on a recurring timer
(e.g. every 30 or 60 minutes) instead of only when triggered by an
extraction or transformation. Mirrors the existing Imaging Email Monitoring
scheduling pattern: uses pg_cron to run the job and pg_net to call the
workflow processor edge function on each tick.

## 1. Extension
- Ensures `pg_net` is installed (provides `net.http_post`) so scheduled
  cron jobs can invoke the edge function over HTTP. `pg_cron` is already
  installed.

## 2. Modified Tables
- `workflows_v2` — new columns (all nullable / defaulted, no data loss):
  1. `schedule_enabled` (boolean, default false) — whether a recurring
     schedule is currently active for this workflow.
  2. `schedule_interval_minutes` (integer) — how often the workflow runs,
     in minutes.
  3. `cron_job_id` (bigint) — the pg_cron job id backing this schedule.
  4. `cron_schedule` (text) — the cron expression currently in effect.
  5. `last_scheduled_run` (timestamptz) — when the schedule last fired.
  6. `next_scheduled_run` (timestamptz) — the next expected fire time.

## 3. New Functions (SECURITY DEFINER)
- `schedule_workflow_v2(p_workflow_id uuid, p_interval_minutes integer)` —
  (re)registers a pg_cron job that POSTs to the `json-workflow-processor-v2`
  edge function with the workflow id every N minutes, and records the job
  details back on the workflow row.
- `unschedule_workflow_v2(p_workflow_id uuid)` — removes the pg_cron job and
  clears the schedule fields on the workflow row.

## 4. Security
- Both functions are SECURITY DEFINER (they manage cron jobs) and EXECUTE is
  granted to the `authenticated` role, matching the existing imaging
  scheduling functions. They reuse the existing `cron_settings` record for
  the Supabase URL and anon key.

## Important Notes
1. Scheduling only. This migration does NOT change what the workflow does;
   it only adds the ability to run an existing workflow on a timer.
2. Idempotent. Safe to re-run: column adds are guarded, and both functions
   are CREATE OR REPLACE.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflows_v2' AND column_name='schedule_enabled') THEN
    ALTER TABLE workflows_v2 ADD COLUMN schedule_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflows_v2' AND column_name='schedule_interval_minutes') THEN
    ALTER TABLE workflows_v2 ADD COLUMN schedule_interval_minutes integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflows_v2' AND column_name='cron_job_id') THEN
    ALTER TABLE workflows_v2 ADD COLUMN cron_job_id bigint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflows_v2' AND column_name='cron_schedule') THEN
    ALTER TABLE workflows_v2 ADD COLUMN cron_schedule text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflows_v2' AND column_name='last_scheduled_run') THEN
    ALTER TABLE workflows_v2 ADD COLUMN last_scheduled_run timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workflows_v2' AND column_name='next_scheduled_run') THEN
    ALTER TABLE workflows_v2 ADD COLUMN next_scheduled_run timestamptz;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_workflow_v2(p_workflow_id uuid, p_interval_minutes integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'extensions'
AS $function$
DECLARE
  v_workflow record;
  v_cron_settings record;
  v_cron_expression text;
  v_job_id bigint;
  v_existing_job_id bigint;
  v_job_name text;
BEGIN
  SELECT * INTO v_workflow FROM workflows_v2 WHERE id = p_workflow_id;

  IF v_workflow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workflow not found');
  END IF;

  IF p_interval_minutes IS NULL OR p_interval_minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A positive interval (in minutes) is required');
  END IF;

  SELECT * INTO v_cron_settings FROM cron_settings LIMIT 1;

  IF v_cron_settings IS NULL OR v_cron_settings.supabase_url IS NULL OR v_cron_settings.supabase_anon_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cron settings not configured. Please configure Supabase URL and Anon Key in the Scheduled Monitoring settings.'
    );
  END IF;

  v_job_name := 'workflow-v2-poll-' || v_workflow.id::text;

  IF v_workflow.cron_job_id IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(v_workflow.cron_job_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = v_job_name;
  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  v_cron_expression := get_cron_expression(p_interval_minutes);

  SELECT cron.schedule(
    v_job_name,
    v_cron_expression,
    format(
      $cron$
      SELECT net.http_post(
        url := '%s/functions/v1/json-workflow-processor-v2',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := jsonb_build_object('workflowId', '%s', 'workflowType', '%s', 'scheduled', true)
      );
      UPDATE public.workflows_v2 SET last_scheduled_run = NOW(), next_scheduled_run = NOW() + interval '%s minutes' WHERE id = '%s'::uuid;
      $cron$,
      v_cron_settings.supabase_url,
      v_cron_settings.supabase_anon_key,
      v_workflow.id,
      v_workflow.workflow_type,
      p_interval_minutes,
      v_workflow.id
    )
  ) INTO v_job_id;

  UPDATE workflows_v2
  SET
    cron_job_id = v_job_id,
    cron_schedule = v_cron_expression,
    schedule_enabled = true,
    schedule_interval_minutes = p_interval_minutes,
    next_scheduled_run = NOW() + (p_interval_minutes || ' minutes')::interval,
    updated_at = NOW()
  WHERE id = v_workflow.id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'schedule', v_cron_expression,
    'interval_minutes', p_interval_minutes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.unschedule_workflow_v2(p_workflow_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'extensions'
AS $function$
DECLARE
  v_workflow record;
  v_existing_job_id bigint;
  v_job_name text;
BEGIN
  SELECT * INTO v_workflow FROM workflows_v2 WHERE id = p_workflow_id;

  IF v_workflow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workflow not found');
  END IF;

  v_job_name := 'workflow-v2-poll-' || v_workflow.id::text;

  IF v_workflow.cron_job_id IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(v_workflow.cron_job_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = v_job_name;
  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  UPDATE workflows_v2
  SET
    cron_job_id = NULL,
    cron_schedule = NULL,
    schedule_enabled = false,
    next_scheduled_run = NULL,
    updated_at = NOW()
  WHERE id = v_workflow.id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.schedule_workflow_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unschedule_workflow_v2(uuid) TO authenticated;
