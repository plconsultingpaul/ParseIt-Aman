/*
# Add get_log_table_usage RPC

Provides a single call that returns row counts and disk usage for every log
table the Purge Logs panel supports, so the UI can show how much space would
be freed at the current retention setting.

1. New Functions
   - `public.get_log_table_usage(cutoff_date timestamptz)`
     - Returns one row per log type with total_rows, expired_rows,
       total_bytes and estimated bytes that would be freed.
     - SECURITY DEFINER so it can read `pg_total_relation_size` for the
       target tables regardless of caller privileges; only aggregate
       numbers are exposed, no row data.

2. Security
   - EXECUTE granted to `authenticated` only.
*/

CREATE OR REPLACE FUNCTION public.get_log_table_usage(cutoff_date timestamptz)
RETURNS TABLE (
  log_type text,
  total_rows bigint,
  expired_rows bigint,
  total_bytes bigint,
  expired_bytes_estimate bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  spec record;
  specs jsonb := jsonb_build_array(
    jsonb_build_object('log_type','extraction_logs','table','extraction_logs','date_col','created_at','where',''),
    jsonb_build_object('log_type','workflow_execution_logs','table','workflow_execution_logs','date_col','created_at','where',''),
    jsonb_build_object('log_type','email_polling_logs','table','email_polling_logs','date_col','created_at','where',''),
    jsonb_build_object('log_type','processed_emails','table','processed_emails','date_col','processed_at','where',''),
    jsonb_build_object('log_type','sftp_polling_logs','table','sftp_polling_logs','date_col','created_at','where',''),
    jsonb_build_object('log_type','inbox_accepted','table','inbox_items','date_col','resolved_at','where',$w$status = 'accepted'$w$),
    jsonb_build_object('log_type','inbox_rejected','table','inbox_items','date_col','resolved_at','where',$w$status = 'rejected'$w$),
    jsonb_build_object('log_type','email_processing_queue','table','email_processing_queue','date_col','processed_at','where',$w$status IN ('processed','failed')$w$)
  );
  v_total_rows bigint;
  v_expired_rows bigint;
  v_total_bytes bigint;
  v_expired_bytes bigint;
  v_table regclass;
  v_where text;
BEGIN
  FOR spec IN SELECT * FROM jsonb_array_elements(specs) AS elem LOOP
    BEGIN
      v_table := ('public.' || (spec.elem->>'table'))::regclass;
      v_where := spec.elem->>'where';

      IF v_where = '' THEN
        EXECUTE format('SELECT count(*) FROM %s', v_table) INTO v_total_rows;
        EXECUTE format(
          'SELECT count(*) FROM %s WHERE %I < $1',
          v_table, spec.elem->>'date_col'
        ) USING cutoff_date INTO v_expired_rows;
      ELSE
        EXECUTE format('SELECT count(*) FROM %s WHERE %s', v_table, v_where) INTO v_total_rows;
        EXECUTE format(
          'SELECT count(*) FROM %s WHERE %s AND %I < $1',
          v_table, v_where, spec.elem->>'date_col'
        ) USING cutoff_date INTO v_expired_rows;
      END IF;

      v_total_bytes := pg_total_relation_size(v_table);
      IF v_total_rows > 0 THEN
        v_expired_bytes := (v_total_bytes::numeric * v_expired_rows::numeric / v_total_rows::numeric)::bigint;
      ELSE
        v_expired_bytes := 0;
      END IF;

      log_type := spec.elem->>'log_type';
      total_rows := v_total_rows;
      expired_rows := v_expired_rows;
      total_bytes := v_total_bytes;
      expired_bytes_estimate := v_expired_bytes;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      log_type := spec.elem->>'log_type';
      total_rows := 0;
      expired_rows := 0;
      total_bytes := 0;
      expired_bytes_estimate := 0;
      RETURN NEXT;
    END;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.get_log_table_usage(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_log_table_usage(timestamptz) TO authenticated;
