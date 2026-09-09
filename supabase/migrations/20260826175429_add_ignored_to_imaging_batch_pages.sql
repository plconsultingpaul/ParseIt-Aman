/*
  # Add ignored flag to imaging_batch_pages

  Adds an `ignored` boolean column so pages in a batch can be explicitly marked
  as "skip" without being indexed. Batches can then be completed once every
  page is either indexed or ignored. Ignored pages are excluded from the split
  uploads.

  1. Changes
    - `imaging_batch_pages.ignored` boolean NOT NULL DEFAULT false

  2. Notes
    - Additive column, no data loss.
    - Existing RLS policies cover the new column.
*/

ALTER TABLE imaging_batch_pages
  ADD COLUMN IF NOT EXISTS ignored boolean NOT NULL DEFAULT false;
