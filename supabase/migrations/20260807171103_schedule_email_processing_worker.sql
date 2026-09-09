/*
# Schedule email-processing-worker every minute

Adds a pg_cron job that pings the new `email-processing-worker` edge function
once a minute. The worker is idempotent: it claims the oldest pending queue
row (or returns immediately if there is nothing to do), so this schedule acts
purely as a safety net in case the email-monitor's inline worker-nudge is
missed (e.g. cold start dropped the waitUntil).

## 1. New Function
- `schedule_email_processing_worker()` — SECURITY DEFINER. Reads the existing
  `cron_settings` row for the Supabase URL and anon key, unschedules any
  previous job named `email-processing-worker-tick`, and re-registers a
  `* * * * *` (every minute) job that POSTs to
  `/functions/v1/email-processing-worker`. Returns the pg_cron job id.

## 2. Auto-run
- A DO block invokes the function once so the schedule takes effect
  immediately after the migration is applied. It swallows the "cron_settings
  not configured" case gracefully — an operator can call the function
  manually later once cron settings exist.

## 3. Security
- The function is SECURITY DEFINER. EXECUTE is granted to `authenticated` so
  a settings screen could re-run it if the schedule ever needs re-anchoring.
  It reuses the existing `cron_settings` record (same pattern as
  `schedule_workflow_v2`).

## 4. Notes
1. Idempotent: unschedules the previous job name before re-registering.
2. Does NOT drop or alter any tables.
3. The worker itself is safe to invoke on an empty queue (returns fast).
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.schedule_email_processing_worker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'extensions'
AS $function$
DECLARE
  v_cron_settings record;
  v_job_id bigint;
  v_existing_job_id bigint;
  v_job_name text := 'email-processing-worker-tick';
BEGIN
  SELECT * INTO v_cron_settings FROM cron_settings LIMIT 1;

  IF v_cron_settings IS NULL
     OR v_cron_settings.supabase_url IS NULL
     OR v_cron_settings.supabase_anon_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cron settings not configured. Configure Supabase URL and Anon Key in the Scheduled Monitoring settings, then call schedule_email_processing_worker() again.'
    );
  END IF;

  SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = v_job_name;
  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  SELECT cron.schedule(
    v_job_name,
    '* * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := '%s/functions/v1/email-processing-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := jsonb_build_object('source', 'pg_cron')
      );
      $cron$,
      v_cron_settings.supabase_url,
      v_cron_settings.supabase_anon_key
    )
  ) INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'schedule', '* * * * *'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_email_processing_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_email_processing_worker() TO authenticated, service_role;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    v_result := public.schedule_email_processing_worker();
    RAISE NOTICE 'schedule_email_processing_worker result: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'schedule_email_processing_worker skipped: %', SQLERRM;
  END;
END $$;
