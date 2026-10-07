/*
  # Add missing EPDF/CloudConvert columns

  1. epdf_processing_jobs.imaging_document_id (uuid) — links a CloudConvert job back to the source imaging_documents row.
  2. imaging_documents.epdf_storage_path (text) — stores the storage path/URL of the processed ePDF returned by CloudConvert.

  Both are additive; no existing data is touched.
*/

ALTER TABLE epdf_processing_jobs
  ADD COLUMN IF NOT EXISTS imaging_document_id uuid REFERENCES imaging_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_epdf_processing_jobs_imaging_document_id
  ON epdf_processing_jobs(imaging_document_id);

ALTER TABLE imaging_documents
  ADD COLUMN IF NOT EXISTS epdf_storage_path text;
