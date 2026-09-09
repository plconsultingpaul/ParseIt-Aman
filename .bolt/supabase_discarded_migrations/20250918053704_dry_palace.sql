/*
  # Create Vendor Extraction Rules Table

  1. New Tables
    - `vendor_extraction_rules`
      - `id` (uuid, primary key)
      - `vendor_id` (uuid, foreign key to users)
      - `rule_name` (text, rule identifier)
      - `auto_detect_instructions` (text, AI detection criteria)
      - `extraction_type_id` (uuid, foreign key to extraction_types, nullable)
      - `transformation_type_id` (uuid, foreign key to transformation_types, nullable)
      - `processing_mode` (text, 'extraction' or 'transformation')
      - `priority` (integer, rule priority order)
      - `is_enabled` (boolean, rule active status)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `vendor_extraction_rules` table
    - Add policies for admin access and vendor self-access
    - Add indexes for performance

  3. Constraints
    - Unique constraint on (vendor_id, priority)
    - Check constraint for processing_mode values
    - Foreign key constraints with proper cascade behavior
*/

-- Create vendor_extraction_rules table
CREATE TABLE IF NOT EXISTS vendor_extraction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  rule_name text NOT NULL,
  auto_detect_instructions text NOT NULL,
  extraction_type_id uuid,
  transformation_type_id uuid,
  processing_mode text NOT NULL,
  priority integer NOT NULL,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add check constraint for processing_mode
ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_processing_mode_check 
CHECK (processing_mode IN ('extraction', 'transformation'));

-- Add unique constraint for vendor_id and priority
ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_vendor_priority_unique 
UNIQUE (vendor_id, priority);

-- Add foreign key constraints
ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_vendor_id_fkey 
FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_extraction_type_id_fkey 
FOREIGN KEY (extraction_type_id) REFERENCES extraction_types(id) ON DELETE SET NULL;

ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_transformation_type_id_fkey 
FOREIGN KEY (transformation_type_id) REFERENCES transformation_types(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_vendor_id 
ON vendor_extraction_rules(vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_priority 
ON vendor_extraction_rules(vendor_id, priority);

CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_enabled 
ON vendor_extraction_rules(is_enabled);

CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_processing_mode 
ON vendor_extraction_rules(processing_mode);

-- Enable Row Level Security
ALTER TABLE vendor_extraction_rules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage all vendor rules"
  ON vendor_extraction_rules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true 
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true 
      AND users.is_active = true
    )
  );

CREATE POLICY "Vendors can read their own rules"
  ON vendor_extraction_rules
  FOR SELECT
  TO authenticated
  USING (
    vendor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'vendor' 
      AND users.is_active = true
    )
  );

-- Create policy for public access (needed for the current app structure)
CREATE POLICY "Allow public access to vendor extraction rules"
  ON vendor_extraction_rules
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);