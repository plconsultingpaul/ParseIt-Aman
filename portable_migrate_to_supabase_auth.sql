/*
  # Portable Migration: Migrate to Supabase Auth

  This migration is designed to be run on ANY ParseIt environment.
  It dynamically reads all users from public.users and creates
  corresponding Supabase Auth accounts.

  ## What it does:
    1. Loops through ALL users in public.users with a non-null email
    2. Creates a Supabase Auth account (auth.users) for each, using the SAME UUID
    3. Creates an auth identity (auth.identities) for each
    4. Skips users that already have an auth account (no duplicates)
    5. Makes password_hash column nullable (no longer needed)
    6. Creates an is_admin() helper function for RLS policies

  ## After running:
    - All users log in with their EMAIL + temporary password: TempPass123!
    - Users should change their password after first login
    - All existing foreign key relationships are preserved (same UUIDs)
    - The manage-auth-user edge function must also be deployed

  ## Prerequisites:
    - pgcrypto extension must be enabled (for crypt/gen_salt)
    - public.users table must exist with: id (uuid), email (text), username (text)

  ## How to run:
    - Go to your Supabase Dashboard > SQL Editor
    - Paste this entire file and click "Run"
    - Check the output notices for results
*/

-- Step 1: Ensure pgcrypto is available for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Dynamically create auth accounts for all existing users
DO $$
DECLARE
  user_record RECORD;
  user_count INT := 0;
  skip_count INT := 0;
BEGIN
  FOR user_record IN
    SELECT id, email, username
    FROM public.users
    WHERE email IS NOT NULL AND email != ''
  LOOP
    BEGIN
      IF EXISTS (SELECT 1 FROM auth.users WHERE id = user_record.id) THEN
        skip_count := skip_count + 1;
        RAISE NOTICE 'SKIPPED (already exists): % (%)', user_record.username, user_record.email;
        CONTINUE;
      END IF;

      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        user_record.id,
        'authenticated',
        'authenticated',
        user_record.email,
        crypt('TempPass123!', gen_salt('bf')),
        NOW(),
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('username', user_record.username),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        user_record.id,
        user_record.id,
        user_record.email,
        jsonb_build_object('sub', user_record.id::text, 'email', user_record.email),
        'email',
        NOW(),
        NOW(),
        NOW()
      );

      user_count := user_count + 1;
      RAISE NOTICE 'CREATED: % (%)', user_record.username, user_record.email;
    EXCEPTION WHEN unique_violation THEN
      skip_count := skip_count + 1;
      RAISE NOTICE 'SKIPPED (conflict): % (%)', user_record.username, user_record.email;
    END;
  END LOOP;

  RAISE NOTICE '--- MIGRATION COMPLETE ---';
  RAISE NOTICE 'Created: % auth accounts', user_count;
  RAISE NOTICE 'Skipped: % (already existed)', skip_count;
END $$;

-- Step 3: Make password_hash nullable (no longer used for auth)
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

-- Step 4: Create is_admin() helper function for RLS policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND is_admin = true
    AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
