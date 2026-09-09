/*
  # Add transformation logging support to extraction_logs table

  1. Schema Changes
    - Add `transformation_type_id` column (UUID, nullable, foreign key to transformation_types)
    - Add `processing_mode` column (TEXT, not null, default 'extraction')
    - Add check constraint for processing_mode values
    - Add foreign key constraint for transformation_type_id
    - Add index for transformation_type_id
    - Add index for processing_mode

  2. Security
    - Maintain existing RLS policies (already allow public access)

  3. Data Integrity
    - Ensure processing_mode is either 'extraction' or 'transformation'
    - Link transformation logs to transformation_types table
*/

-- Add transformation_type_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extraction_logs' AND column_name = 'transformation_type_id'
  ) THEN
    ALTER TABLE extraction_logs ADD COLUMN transformation_type_id uuid;
  END IF;
END $$;

-- Add processing_mode column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extraction_logs' AND column_name = 'processing_mode'
  ) THEN
    ALTER TABLE extraction_logs ADD COLUMN processing_mode text NOT NULL DEFAULT 'extraction';
  END IF;
END $$;

-- Add check constraint for processing_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'extraction_logs' AND constraint_name = 'extraction_logs_processing_mode_check'
  ) THEN
    ALTER TABLE extraction_logs ADD CONSTRAINT extraction_logs_processing_mode_check 
    CHECK (processing_mode IN ('extraction', 'transformation'));
  END IF;
END $$;

-- Add foreign key constraint for transformation_type_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'extraction_logs' AND constraint_name = 'extraction_logs_transformation_type_id_fkey'
  ) THEN
    ALTER TABLE extraction_logs ADD CONSTRAINT extraction_logs_transformation_type_id_fkey 
    FOREIGN KEY (transformation_type_id) REFERENCES transformation_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for transformation_type_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'extraction_logs' AND indexname = 'idx_extraction_logs_transformation_type_id'
  ) THEN
    CREATE INDEX idx_extraction_logs_transformation_type_id ON extraction_logs(transformation_type_id);
  END IF;
END $$;

-- Add index for processing_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'extraction_logs' AND indexname = 'idx_extraction_logs_processing_mode'
  ) THEN
    CREATE INDEX idx_extraction_logs_processing_mode ON extraction_logs(processing_mode);
  END IF;
END $$;