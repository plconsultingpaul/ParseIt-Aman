# Add `processing_status` and `epdf_job_id` to `imaging_documents`

## Context

The Imaging step writes two columns on `public.imaging_documents` that are missing
from the other Parse-It database:

- `processing_status` — tracks the ePDF conversion state for a document
- `epdf_job_id` — links a document row to its CloudConvert job in `epdf_processing_jobs`

Both columns already exist in this project's Supabase (verified against
`information_schema.columns`). The SQL below reproduces the exact shape,
foreign key, and indexes so the other database ends up identical.

## Verified current shape (source database)

| Column              | Type                     | Nullable | Default        |
|---------------------|--------------------------|----------|----------------|
| `processing_status` | `text`                   | NO       | `'none'::text` |
| `epdf_job_id`       | `uuid`                   | YES      | `NULL`         |

Foreign key: `epdf_job_id → epdf_processing_jobs(id) ON DELETE SET NULL`

Indexes:
- `idx_imaging_documents_processing_status (processing_status)`
- `idx_imaging_documents_epdf_job_id (epdf_job_id)`

## Prerequisite: `epdf_processing_jobs` table

The `epdf_job_id` foreign key references `public.epdf_processing_jobs`. Before
adding the FK, confirm that table exists on the target database. If it does
not, create it first with the SQL in **Section B** below.

---

## Section A — Add the columns to `imaging_documents`

Run this on the OTHER Parse-It Supabase database (SQL editor or via
`apply_migration`). It is idempotent — safe to run more than once.

```sql
-- 1. processing_status: NOT NULL, default 'none'
ALTER TABLE public.imaging_documents
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'none';

-- 2. epdf_job_id: nullable uuid
ALTER TABLE public.imaging_documents
  ADD COLUMN IF NOT EXISTS epdf_job_id uuid;

-- 3. Foreign key to epdf_processing_jobs (run Section B first if that table is missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'imaging_documents_epdf_job_id_fkey'
      AND conrelid = 'public.imaging_documents'::regclass
  ) THEN
    ALTER TABLE public.imaging_documents
      ADD CONSTRAINT imaging_documents_epdf_job_id_fkey
      FOREIGN KEY (epdf_job_id)
      REFERENCES public.epdf_processing_jobs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_imaging_documents_processing_status
  ON public.imaging_documents (processing_status);

CREATE INDEX IF NOT EXISTS idx_imaging_documents_epdf_job_id
  ON public.imaging_documents (epdf_job_id);
```

---

## Section B — Create `epdf_processing_jobs` (only if it does not exist)

Skip this section if the target database already has `public.epdf_processing_jobs`.

```sql
CREATE TABLE IF NOT EXISTS public.epdf_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  source_file_url text NOT NULL,
  cloudconvert_job_id text,
  status text NOT NULL DEFAULT 'pending',
  output_storage_path text,
  output_file_name text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  imaging_document_id uuid
);

ALTER TABLE public.epdf_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Replicate whatever policies the source database has on this table.
-- At minimum, authenticated users typically need SELECT/INSERT/UPDATE for their own rows.
-- Adjust the predicate to match the ownership model on the target database.
```

If the target database uses this table too, also check that its own indexes
and RLS policies match the source before continuing.

---

## Verification

After running Section A (and B if needed), confirm the columns landed:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'imaging_documents'
  AND column_name IN ('processing_status', 'epdf_job_id');
```

Expected rows:

```
processing_status | text | NO  | 'none'::text
epdf_job_id       | uuid | YES | (null)
```

And the FK:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.imaging_documents'::regclass
  AND conname = 'imaging_documents_epdf_job_id_fkey';
```

Expected: `FOREIGN KEY (epdf_job_id) REFERENCES epdf_processing_jobs(id) ON DELETE SET NULL`

Once both queries return the expected results, the Imaging step will stop
erroring on those two columns.
