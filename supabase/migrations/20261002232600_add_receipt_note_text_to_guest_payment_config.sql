/*
# Add receipt note text to Guest Payment global branding

1. Modified Tables
- `guest_payment_config`
  - `receipt_note_text` (text, not null, default 'Your receipt will be sent here after payment.'):
    the note shown under the email field on the guest payment page. Empty means the note is hidden.

2. Security
- No changes; existing policies on `guest_payment_config` apply.
*/

ALTER TABLE guest_payment_config
  ADD COLUMN IF NOT EXISTS receipt_note_text text NOT NULL DEFAULT 'Your receipt will be sent here after payment.';
