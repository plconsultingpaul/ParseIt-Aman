/*
# Restrict Workflow v2 scheduling functions to signed-in users

Postgres grants EXECUTE on new functions to PUBLIC by default, which would let
the anonymous (anon) role call the SECURITY DEFINER scheduling functions and
bypass the admin-only write rules on `workflows_v2`. This migration removes the
default PUBLIC grant and grants EXECUTE only to the `authenticated` role.

## Security
- REVOKE EXECUTE ... FROM PUBLIC on `schedule_workflow_v2` and
  `unschedule_workflow_v2`.
- GRANT EXECUTE ... TO authenticated (re-affirmed).

## Notes
1. No schema or data changes. Permissions only.
2. Idempotent and safe to re-run.
*/

REVOKE EXECUTE ON FUNCTION public.schedule_workflow_v2(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unschedule_workflow_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.schedule_workflow_v2(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unschedule_workflow_v2(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.schedule_workflow_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unschedule_workflow_v2(uuid) TO authenticated;
