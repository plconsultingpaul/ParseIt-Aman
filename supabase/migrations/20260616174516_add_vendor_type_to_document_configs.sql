ALTER TABLE track_trace_document_configs
ADD COLUMN vendor_type text NOT NULL DEFAULT 'synergize',
ADD COLUMN parseit_bucket_id uuid DEFAULT NULL,
ADD COLUMN parseit_search_field text DEFAULT 'bill_number';