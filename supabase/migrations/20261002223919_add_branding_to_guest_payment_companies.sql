/*
# Guest Payment - Per-company branding

1. Modified Tables
  - `guest_payment_companies`
    - `branding` (jsonb, default '{}') — per-company branding overrides for the guest
      payment, success and cancel pages. Shape:
        { logo_url, logo_size, company_name, header_text, header_size,
          sub_header_text, sub_header_size }
      Any blank value falls back to the Global Branding settings in
      `guest_payment_config`. `company_name` is company-only (no global equivalent).

2. Security
  - No policy changes. Existing admin-only policies on `guest_payment_companies`
    still apply; guests receive branding only through service-role edge functions.

3. Notes
  1. Additive only; existing companies get an empty object, meaning "use global".
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guest_payment_companies' AND column_name = 'branding'
  ) THEN
    ALTER TABLE guest_payment_companies ADD COLUMN branding jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;