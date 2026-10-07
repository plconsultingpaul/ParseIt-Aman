/*
  Guest Payment: switch receipt email to Email Sending Accounts.

  Adds three columns to guest_payment_config so admins can pick an existing
  Email Sending Account and configure the recipient/BCC addresses (with
  template placeholder support like `{guest_email}`).
*/

ALTER TABLE guest_payment_config
  ADD COLUMN IF NOT EXISTS receipt_sending_account_id uuid REFERENCES email_sending_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_to_email text NOT NULL DEFAULT '{guest_email}',
  ADD COLUMN IF NOT EXISTS receipt_from_email text NOT NULL DEFAULT '';
