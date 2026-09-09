/*
  # Create vendor extraction rules table

  1. New Tables
    - `vendor_extraction_rules`
      - `id` (uuid, primary key)
      - `vendor_id` (uuid, foreign key to users)
      - `rule_name` (text, not null)
      - `auto_detect_instructions` (text, not null)
      - `extraction_type_id` (uuid, foreign key to extraction_types, nullable)
      - `transformation_type_id` (uuid, foreign key to transformation_types, nullable)
      - `processing_mode` (text, check constraint)
      - `priority` (integer, not null)
      - `is_enabled` (boolean, default true)
      - `created_at` (timestamptz, default now)
      - `updated_at` (timestamptz, default now)

  2. Security
    - Enable RLS on vendor_extraction_rules table
    - Add policies for admin and vendor access
    - Add unique constraint on vendor_id + priority

  3. Indexes
    - Index on vendor_id for efficient queries
    - Index on priority for ordering
    - Index on processing_mode for filtering
*/

CREATE TABLE IF NOT EXISTS vendor_extraction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  auto_detect_instructions text NOT NULL,
  extraction_type_id uuid REFERENCES extraction_types(id) ON DELETE SET NULL,
  transformation_type_id uuid REFERENCES transformation_types(id) ON DELETE SET NULL,
  processing_mode text NOT NULL CHECK (processing_mode IN ('extraction', 'transformation')),
  priority integer NOT NULL,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add unique constraint on vendor_id + priority to ensure proper ordering
ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_vendor_priority_unique 
UNIQUE (vendor_id, priority);

-- Add check constraint to ensure only one type is selected per rule
ALTER TABLE vendor_extraction_rules 
ADD CONSTRAINT vendor_extraction_rules_type_check 
CHECK (
  (processing_mode = 'extraction' AND extraction_type_id IS NOT NULL AND transformation_type_id IS NULL) OR
  (processing_mode = 'transformation' AND transformation_type_id IS NOT NULL AND extraction_type_id IS NULL)
);

-- Enable RLS
ALTER TABLE vendor_extraction_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all vendor rules"
  ON vendor_extraction_rules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
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
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_vendor_id ON vendor_extraction_rules(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_priority ON vendor_extraction_rules(vendor_id, priority);
CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_processing_mode ON vendor_extraction_rules(processing_mode);
CREATE INDEX IF NOT EXISTS idx_vendor_extraction_rules_enabled ON vendor_extraction_rules(is_enabled);