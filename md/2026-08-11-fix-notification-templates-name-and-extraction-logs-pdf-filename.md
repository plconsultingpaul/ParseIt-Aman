# Fix: notification_templates.name column error & extraction_logs.pdf_filename NOT NULL constraint

**Date:** 2026-08-11

## Problem

Two errors occurring in the other ParseIT environment:

1. **`column notification_templates.name does not exist`** — The frontend code
   in the Email Monitoring settings was querying for a column called `name`,
   but the actual column on the `notification_templates` table is
   `template_name`. This has been fixed in the application code.

2. **`null value in column "pdf_filename" of relation "extraction_logs" violates
   not-null constraint`** — The `pdf_filename` column on `extraction_logs` is
   `NOT NULL` but has no `DEFAULT` value in the other environment. When an
   insert omits the field, Postgres rejects it. The fix adds a default empty
   string so inserts that omit the filename succeed gracefully.

---

## SQL Script — Run in Supabase SQL Editor

```sql
-- ============================================================
-- Fix 1: extraction_logs.pdf_filename — add a default value
--         so inserts that omit the column no longer fail.
-- ============================================================

ALTER TABLE extraction_logs
  ALTER COLUMN pdf_filename SET DEFAULT '';

-- ============================================================
-- Fix 2 (verification): confirm notification_templates has
--         the column "template_name" (NOT "name").
--         This SELECT will return the column info if it exists.
-- ============================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notification_templates'
  AND column_name IN ('name', 'template_name');

-- If the above returns only "template_name", the app code fix
-- (already applied) is the correct solution — no DB change needed.
--
-- If for some reason neither column exists, run:
--   ALTER TABLE notification_templates ADD COLUMN template_name text NOT NULL DEFAULT '';
```

## Notes

- The application code has also been updated: the Email Monitoring settings
  page now queries `template_name` instead of `name`, matching the actual
  database column.
- No data migration is required — this is a schema default change only.
