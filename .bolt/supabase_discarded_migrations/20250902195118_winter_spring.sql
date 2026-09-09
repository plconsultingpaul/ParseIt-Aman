-- ParseIt Database Schema
-- Complete SQL to recreate the database structure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sftp_config table
CREATE TABLE IF NOT EXISTS sftp_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host text NOT NULL DEFAULT ''::text,
    port integer NOT NULL DEFAULT 22,
    username text NOT NULL DEFAULT ''::text,
    password text NOT NULL DEFAULT ''::text,
    remote_path text NOT NULL DEFAULT '/uploads/xml/'::text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pdf_path text DEFAULT '/uploads/pdf/'::text,
    json_path text DEFAULT '/uploads/json/'::text
);

-- Enable RLS for sftp_config
ALTER TABLE sftp_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sftp_config
CREATE POLICY "Allow public delete access to sftp config" ON sftp_config
    FOR DELETE TO public USING (true);

CREATE POLICY "Allow public insert access to sftp config" ON sftp_config
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public read access to sftp config" ON sftp_config
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public update access to sftp config" ON sftp_config
    FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Create api_settings table
CREATE TABLE IF NOT EXISTS api_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    path text NOT NULL DEFAULT ''::text,
    password text NOT NULL DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    google_api_key text NOT NULL DEFAULT ''::text
);

-- Enable RLS for api_settings
ALTER TABLE api_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for api_settings
CREATE POLICY "Allow public access to API settings" ON api_settings
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Create email_monitoring_config table
CREATE TABLE IF NOT EXISTS email_monitoring_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id text NOT NULL DEFAULT ''::text,
    client_id text NOT NULL DEFAULT ''::text,
    client_secret text NOT NULL DEFAULT ''::text,
    monitored_email text NOT NULL DEFAULT ''::text,
    polling_interval integer NOT NULL DEFAULT 5,
    is_enabled boolean NOT NULL DEFAULT false,
    last_check timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create extraction_types table
CREATE TABLE IF NOT EXISTS extraction_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    default_instructions text NOT NULL,
    xml_format text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    filename text NOT NULL DEFAULT ''::text,
    format_type text DEFAULT 'XML'::text,
    json_path text,
    field_mappings text,
    parseit_id_mapping text,
    trace_type_mapping text,
    trace_type_value text
);

-- Enable RLS for extraction_types
ALTER TABLE extraction_types ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for extraction_types
CREATE POLICY "Allow public delete access to extraction types" ON extraction_types
    FOR DELETE TO public USING (true);

CREATE POLICY "Allow public insert access to extraction types" ON extraction_types
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public read access to extraction types" ON extraction_types
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow public update access to extraction types" ON extraction_types
    FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Create email_processing_rules table
CREATE TABLE IF NOT EXISTS email_processing_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name text NOT NULL,
    sender_pattern text NOT NULL DEFAULT ''::text,
    subject_pattern text NOT NULL DEFAULT ''::text,
    extraction_type_id uuid REFERENCES extraction_types(id) ON DELETE CASCADE,
    is_enabled boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create processed_emails table
CREATE TABLE IF NOT EXISTS processed_emails (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id text UNIQUE NOT NULL,
    sender text NOT NULL,
    subject text NOT NULL,
    received_date timestamp with time zone NOT NULL,
    processing_rule_id uuid REFERENCES email_processing_rules(id) ON DELETE SET NULL,
    extraction_type_id uuid REFERENCES extraction_types(id) ON DELETE SET NULL,
    pdf_filename text,
    processing_status text NOT NULL DEFAULT 'pending'::text,
    error_message text,
    parseit_id integer,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- Create settings_config table
CREATE TABLE IF NOT EXISTS settings_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    password text NOT NULL DEFAULT '1234'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    gemini_api_key text NOT NULL DEFAULT ''::text
);

-- Enable RLS for settings_config
ALTER TABLE settings_config ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for settings_config
CREATE POLICY "Allow public access to settings config" ON settings_config
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Create the get_next_parseit_id function
CREATE OR REPLACE FUNCTION get_next_parseit_id()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    next_id integer;
BEGIN
    -- Get the maximum parseit_id from processed_emails and add 1
    SELECT COALESCE(MAX(parseit_id), 0) + 1 INTO next_id FROM processed_emails;
    
    -- Insert a record to claim this ID
    INSERT INTO processed_emails (
        email_id, 
        sender, 
        subject, 
        received_date, 
        processing_status, 
        parseit_id
    ) VALUES (
        'system-generated-' || next_id::text, 
        'system', 
        'ParseIt ID allocation', 
        NOW(), 
        'completed', 
        next_id
    );
    
    RETURN next_id;
END;
$$;

-- Create indexes for better performance
CREATE UNIQUE INDEX IF NOT EXISTS processed_emails_email_id_key ON processed_emails USING btree (email_id);
CREATE UNIQUE INDEX IF NOT EXISTS sftp_config_pkey ON sftp_config USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS api_settings_pkey ON api_settings USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS email_monitoring_config_pkey ON email_monitoring_config USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS extraction_types_pkey ON extraction_types USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS email_processing_rules_pkey ON email_processing_rules USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS processed_emails_pkey ON processed_emails USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS settings_config_pkey ON settings_config USING btree (id);

-- Comments for documentation
COMMENT ON TABLE sftp_config IS 'SFTP server configuration for file uploads';
COMMENT ON TABLE api_settings IS 'API configuration including Google Gemini API key';
COMMENT ON TABLE email_monitoring_config IS 'Office 365 email monitoring configuration';
COMMENT ON TABLE extraction_types IS 'PDF data extraction templates and configurations';
COMMENT ON TABLE email_processing_rules IS 'Rules for automatically processing incoming emails';
COMMENT ON TABLE processed_emails IS 'Log of processed emails and their status';
COMMENT ON TABLE settings_config IS 'General application settings including access password';
COMMENT ON FUNCTION get_next_parseit_id() IS 'Generates the next sequential ParseIt ID for document processing';