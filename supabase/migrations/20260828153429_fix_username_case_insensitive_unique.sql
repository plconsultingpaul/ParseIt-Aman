-- Remove duplicate account (username "gary" tied to gary2@prioritylogisticsinc.com)
DELETE FROM auth.users WHERE id = '41918929-4f12-4472-bc39-bd9eabb7d3ed';
DELETE FROM public.users WHERE id = '41918929-4f12-4472-bc39-bd9eabb7d3ed';

-- Replace the case-sensitive uniqueness on username with a case-insensitive one.
-- The lookup RPC already compares LOWER(username) = LOWER(input); this migration aligns
-- the storage-side uniqueness rule with that behavior so two rows differing only by case
-- can no longer coexist.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (LOWER(username));
