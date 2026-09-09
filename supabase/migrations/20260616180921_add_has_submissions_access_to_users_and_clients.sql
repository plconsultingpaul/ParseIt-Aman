-- Add has_submissions_access column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_submissions_access boolean DEFAULT false;

-- Add has_submissions_access column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS has_submissions_access boolean DEFAULT false;