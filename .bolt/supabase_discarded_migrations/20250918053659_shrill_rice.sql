/*
  # Add User Roles Support

  1. Schema Changes
    - Add `role` column to `users` table with check constraint
    - Set default role to 'user'
    - Update existing users to have proper roles

  2. Security
    - Maintain existing RLS policies
    - Ensure role-based access control
*/

-- Add role column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role text DEFAULT 'user';
  END IF;
END $$;

-- Add check constraint for role values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('admin', 'user', 'vendor'));
  END IF;
END $$;

-- Update existing admin users to have admin role
UPDATE users 
SET role = 'admin' 
WHERE is_admin = true AND (role IS NULL OR role = 'user');

-- Update remaining users to have user role
UPDATE users 
SET role = 'user' 
WHERE role IS NULL;

-- Make role column NOT NULL now that all rows have values
ALTER TABLE users ALTER COLUMN role SET NOT NULL;

-- Add index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);