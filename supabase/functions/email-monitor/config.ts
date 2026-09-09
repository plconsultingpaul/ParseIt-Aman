import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

export function getSupabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') || '';
}

export function getSupabaseServiceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

export function createSupabaseClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();
  return createClient(url, key);
}

export async function getActiveGeminiApiKey(supabase: SupabaseClient): Promise<string> {
  const { data: activeKeyData, error: keyError } = await supabase
    .from('gemini_api_keys')
    .select('id, api_key')
    .eq('is_active', true)
    .maybeSingle();

  if (keyError) {
    console.error('Error fetching Gemini API key:', keyError.message);
  }

  if (!activeKeyData) {
    console.error('No active Gemini API key found. Please configure in Settings -> Gemini Configuration.');
    return '';
  }

  return activeKeyData.api_key || '';
}

export async function getActiveModelName(supabase: SupabaseClient): Promise<string> {
  try {
    const { data: activeKeyData } = await supabase
      .from("gemini_api_keys")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (activeKeyData) {
      const { data: activeModelData } = await supabase
        .from("gemini_models")
        .select("model_name")
        .eq("api_key_id", activeKeyData.id)
        .eq("is_active", true)
        .maybeSingle();

      if (activeModelData?.model_name) {
        console.log('Using active Gemini model:', activeModelData.model_name);
        return activeModelData.model_name;
      }
    }

    console.log('No active model configuration found, using default: gemini-2.5-pro');
    return 'gemini-2.5-pro';
  } catch (error) {
    console.error('Failed to fetch active model configuration:', error);
    return 'gemini-2.5-pro';
  }
}
