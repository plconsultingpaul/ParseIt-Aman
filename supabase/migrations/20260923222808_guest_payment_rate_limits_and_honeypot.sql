/*
  Guest Payment — Phase 7: rate limiting + admin retry support.

  1. New table `guest_payment_rate_limits`
     - Per-IP + per-endpoint sliding window counters used by the public
       edge functions (get-guest-payment-config, guest-payment-search,
       create-guest-checkout).
     - RLS enabled; no policies (service-role writes only).

  2. Optional column on transactions for tracking a bot honeypot hit and
     the last retry attempt (already logged as a JSONB, so retry data
     goes into existing success_api_results field).
*/

CREATE TABLE IF NOT EXISTS guest_payment_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_payment_rate_limits_ip_endpoint_idx
  ON guest_payment_rate_limits (ip_address, endpoint);

CREATE INDEX IF NOT EXISTS guest_payment_rate_limits_window_idx
  ON guest_payment_rate_limits (window_start);

ALTER TABLE guest_payment_rate_limits ENABLE ROW LEVEL SECURITY;
