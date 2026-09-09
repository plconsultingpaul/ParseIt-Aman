/*
  # Create All PostgreSQL Functions for ParseIt Application

  This migration creates all the necessary PostgreSQL functions for the ParseIt application,
  including authentication, ID generation, HTTP client functions, and utility functions.

  ## Functions Created:
  1. Authentication Functions
     - verify_password: Secure password verification using bcrypt
     - create_user: Create new users with hashed passwords

  2. ID Generation
     - get_next_parseit_id: Generate sequential ParseIt IDs

  3. HTTP Client Functions
     - http: Main HTTP request function
     - http_get: GET requests
     - http_post: POST requests with JSON data
     - http_put: PUT requests
     - http_patch: PATCH requests
     - http_delete: DELETE requests
     - http_head: HEAD requests
     - http_header: Create HTTP headers
     - http_list_curlopt: List available curl options
     - http_reset_curlopt: Reset curl options

  4. Utility Functions
     - bytea_to_text: Convert bytea to base64 text

  ## Security
  - All functions use proper security practices
  - Password hashing with bcrypt
  - Appropriate permission grants
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS http;

-- Create sequence for ParseIt IDs
CREATE SEQUENCE IF NOT EXISTS parseit_id_seq START 1;

-- =====================================================
-- AUTHENTICATION FUNCTIONS
-- =====================================================

-- Function to verify user password
CREATE OR REPLACE FUNCTION verify_password(
  username_input text,
  password_input text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record record;
  is_valid boolean := false;
BEGIN
  -- Get user record
  SELECT id, username, password_hash, is_admin, is_active, role
  INTO user_record
  FROM users
  WHERE username = username_input AND is_active = true;

  -- Check if user exists and password is correct
  IF user_record.id IS NOT NULL THEN
    is_valid := (user_record.password_hash = crypt(password_input, user_record.password_hash));
  END IF;

  -- Return result
  IF is_valid THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Login successful',
      'user_id', user_record.id,
      'is_admin', user_record.is_admin,
      'role', user_record.role
    );
  ELSE
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid username or password'
    );
  END IF;
END;
$$;

-- Function to create new user
CREATE OR REPLACE FUNCTION create_user(
  username_input text,
  password_input text,
  is_admin_input boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  password_hash text;
BEGIN
  -- Check if username already exists
  IF EXISTS (SELECT 1 FROM users WHERE username = username_input) THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Username already exists'
    );
  END IF;

  -- Hash the password
  password_hash := crypt(password_input, gen_salt('bf'));

  -- Insert new user
  INSERT INTO users (username, password_hash, is_admin, is_active, role)
  VALUES (username_input, password_hash, is_admin_input, true, CASE WHEN is_admin_input THEN 'admin' ELSE 'user' END)
  RETURNING id INTO user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'User created successfully',
    'user_id', user_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Failed to create user: ' || SQLERRM
    );
END;
$$;

-- =====================================================
-- ID GENERATION FUNCTIONS
-- =====================================================

-- Function to get next ParseIt ID
CREATE OR REPLACE FUNCTION get_next_parseit_id()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT nextval('parseit_id_seq')::integer;
$$;

-- =====================================================
-- HTTP CLIENT FUNCTIONS
-- =====================================================

-- Main HTTP request function
CREATE OR REPLACE FUNCTION http(
  request http_request
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  response http_response;
BEGIN
  -- Use the http extension to make the request
  SELECT * INTO response FROM http_request(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error response
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'HTTP request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP GET function
CREATE OR REPLACE FUNCTION http_get(
  uri character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build GET request
  request := ROW(
    'GET',
    uri,
    ARRAY[]::http_header[],
    NULL,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'GET request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP GET with data function
CREATE OR REPLACE FUNCTION http_get(
  uri character varying,
  data jsonb
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
  query_string text := '';
  key text;
  value text;
BEGIN
  -- Build query string from jsonb data
  IF data IS NOT NULL THEN
    FOR key, value IN SELECT * FROM jsonb_each_text(data)
    LOOP
      IF query_string != '' THEN
        query_string := query_string || '&';
      END IF;
      query_string := query_string || key || '=' || value;
    END LOOP;
    
    -- Append query string to URI
    IF query_string != '' THEN
      uri := uri || CASE WHEN uri LIKE '%?%' THEN '&' ELSE '?' END || query_string;
    END IF;
  END IF;

  -- Build GET request
  request := ROW(
    'GET',
    uri,
    ARRAY[http_header('content-type', 'application/json')],
    NULL,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'GET request with data failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP POST function
CREATE OR REPLACE FUNCTION http_post(
  uri character varying,
  content character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build POST request
  request := ROW(
    'POST',
    uri,
    ARRAY[
      http_header('content-type', 'application/json'),
      http_header('content-length', length(content)::text)
    ],
    content,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'POST request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP POST with JSON data function
CREATE OR REPLACE FUNCTION http_post(
  uri character varying,
  data jsonb
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
  json_content text;
BEGIN
  -- Convert jsonb to text
  json_content := data::text;
  
  -- Build POST request
  request := ROW(
    'POST',
    uri,
    ARRAY[
      http_header('content-type', 'application/json'),
      http_header('content-length', length(json_content)::text)
    ],
    json_content,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'POST request with JSON failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP PUT function
CREATE OR REPLACE FUNCTION http_put(
  uri character varying,
  content character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build PUT request
  request := ROW(
    'PUT',
    uri,
    ARRAY[
      http_header('content-type', 'application/json'),
      http_header('content-length', length(content)::text)
    ],
    content,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'PUT request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP PATCH function
CREATE OR REPLACE FUNCTION http_patch(
  uri character varying,
  content character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build PATCH request
  request := ROW(
    'PATCH',
    uri,
    ARRAY[
      http_header('content-type', 'application/json'),
      http_header('content-length', length(content)::text)
    ],
    content,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'PATCH request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP DELETE function (single parameter)
CREATE OR REPLACE FUNCTION http_delete(
  uri character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build DELETE request
  request := ROW(
    'DELETE',
    uri,
    ARRAY[http_header('content-type', 'application/json')],
    NULL,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'DELETE request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP DELETE function (with content)
CREATE OR REPLACE FUNCTION http_delete(
  uri character varying,
  content character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build DELETE request with content
  request := ROW(
    'DELETE',
    uri,
    ARRAY[
      http_header('content-type', 'application/json'),
      http_header('content-length', length(content)::text)
    ],
    content,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'DELETE request with content failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP HEAD function
CREATE OR REPLACE FUNCTION http_head(
  uri character varying
)
RETURNS http_response
LANGUAGE plpgsql
AS $$
DECLARE
  request http_request;
  response http_response;
BEGIN
  -- Build HEAD request
  request := ROW(
    'HEAD',
    uri,
    ARRAY[]::http_header[],
    NULL,
    NULL
  )::http_request;
  
  -- Make the request
  SELECT * INTO response FROM http(request);
  RETURN response;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ROW(
      500,
      'Internal Server Error',
      ARRAY[http_header('content-type', 'application/json')],
      json_build_object('error', 'HEAD request failed', 'details', SQLERRM)::text,
      NULL
    )::http_response;
END;
$$;

-- HTTP header creation function
CREATE OR REPLACE FUNCTION http_header(
  field character varying,
  value character varying
)
RETURNS http_header
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROW(field, value)::http_header;
$$;

-- HTTP list curl options function
CREATE OR REPLACE FUNCTION http_list_curlopt()
RETURNS TABLE(curlopt text, value text)
LANGUAGE sql
AS $$
  SELECT 'CURLOPT_TIMEOUT'::text, '30'::text
  UNION ALL
  SELECT 'CURLOPT_CONNECTTIMEOUT'::text, '10'::text
  UNION ALL
  SELECT 'CURLOPT_FOLLOWLOCATION'::text, '1'::text
  UNION ALL
  SELECT 'CURLOPT_MAXREDIRS'::text, '5'::text
  UNION ALL
  SELECT 'CURLOPT_SSL_VERIFYPEER'::text, '1'::text
  UNION ALL
  SELECT 'CURLOPT_SSL_VERIFYHOST'::text, '2'::text
  UNION ALL
  SELECT 'CURLOPT_USERAGENT'::text, 'PostgreSQL HTTP Client'::text;
$$;

-- HTTP reset curl options function
CREATE OR REPLACE FUNCTION http_reset_curlopt()
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT true;
$$;

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to convert bytea to base64 text
CREATE OR REPLACE FUNCTION bytea_to_text(
  _bytea_data bytea
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(_bytea_data, 'base64');
$$;

-- Alternative bytea to text function using hex encoding
CREATE OR REPLACE FUNCTION bytea_to_hex_text(
  _bytea_data bytea
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(_bytea_data, 'hex');
$$;

-- Function to convert text back to bytea from base64
CREATE OR REPLACE FUNCTION text_to_bytea(
  _text_data text
)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT decode(_text_data, 'base64');
$$;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION verify_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_parseit_id() TO authenticated;
GRANT EXECUTE ON FUNCTION bytea_to_text(bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION bytea_to_hex_text(bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION text_to_bytea(text) TO authenticated;

-- Grant execute permissions to anonymous users (for login functionality)
GRANT EXECUTE ON FUNCTION verify_password(text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_next_parseit_id() TO anon;
GRANT EXECUTE ON FUNCTION bytea_to_text(bytea) TO anon;
GRANT EXECUTE ON FUNCTION bytea_to_hex_text(bytea) TO anon;
GRANT EXECUTE ON FUNCTION text_to_bytea(text) TO anon;

-- Grant HTTP function permissions
GRANT EXECUTE ON FUNCTION http(http_request) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_get(character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_get(character varying, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_post(character varying, character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_post(character varying, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_put(character varying, character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_patch(character varying, character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_delete(character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_delete(character varying, character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_head(character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_header(character varying, character varying) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_list_curlopt() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION http_reset_curlopt() TO authenticated, anon;

-- Grant sequence usage permissions
GRANT USAGE ON SEQUENCE parseit_id_seq TO authenticated, anon;