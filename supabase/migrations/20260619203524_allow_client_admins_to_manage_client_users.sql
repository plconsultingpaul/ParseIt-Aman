-- Create helper function to check if current user is a client admin
CREATE OR REPLACE FUNCTION public.is_client_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND is_client_admin = true
    AND is_active = true
    AND role = 'client'
  );
$$;

-- Create helper function to get current user's client_id
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT client_id FROM public.users
  WHERE id = auth.uid()
  AND is_active = true
  LIMIT 1;
$$;

-- Update SELECT policy: allow client admins to see users in their client
DROP POLICY IF EXISTS "Authenticated can select own row or admin all" ON users;
CREATE POLICY "Authenticated can select own row or admin all" ON users
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR is_admin()
    OR (is_client_admin() AND client_id = get_my_client_id())
  );

-- Update INSERT policy: allow client admins to insert users in their client
DROP POLICY IF EXISTS "Admins can insert users" ON users;
CREATE POLICY "Admins or client admins can insert users" ON users
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (is_client_admin() AND client_id = get_my_client_id() AND role = 'client')
  );

-- Update UPDATE policy: allow client admins to update users in their client
DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins or client admins can update users" ON users
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR auth.uid() = id
    OR (is_client_admin() AND client_id = get_my_client_id() AND role = 'client')
  )
  WITH CHECK (
    is_admin()
    OR auth.uid() = id
    OR (is_client_admin() AND client_id = get_my_client_id() AND role = 'client')
  );

-- Update DELETE policy: allow client admins to delete users in their client
DROP POLICY IF EXISTS "Admins can delete users" ON users;
CREATE POLICY "Admins or client admins can delete users" ON users
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (is_client_admin() AND client_id = get_my_client_id() AND role = 'client')
  );
