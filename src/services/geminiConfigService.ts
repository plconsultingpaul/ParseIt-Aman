import { supabase, getAuthHeaders } from '../lib/supabase';

export interface GeminiApiKey {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeminiModel {
  id: string;
  api_key_id: string;
  model_name: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActiveGeminiConfig {
  modelName: string;
}

export interface AvailableGeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

export const geminiConfigService = {
  async getActiveConfiguration(): Promise<ActiveGeminiConfig | null> {
    try {
      const { data: activeModel, error: modelError } = await supabase
        .from('gemini_models')
        .select('model_name')
        .eq('is_active', true)
        .maybeSingle();

      if (modelError) throw modelError;
      if (!activeModel) return null;

      return {
        modelName: activeModel.model_name
      };
    } catch (error) {
      console.error('Error fetching active Gemini configuration:', error);
      return null;
    }
  },

  async getAllApiKeys(): Promise<GeminiApiKey[]> {
    const { data, error } = await supabase
      .from('gemini_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getModelsByApiKeyId(apiKeyId: string): Promise<GeminiModel[]> {
    const { data, error } = await supabase
      .from('gemini_models')
      .select('*')
      .eq('api_key_id', apiKeyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async addApiKey(name: string, apiKey: string, setAsActive: boolean = false): Promise<GeminiApiKey> {
    const { data, error } = await supabase
      .from('gemini_api_keys')
      .insert({ name, api_key: apiKey, is_active: setAsActive })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateApiKey(id: string, updates: { name?: string; api_key?: string }): Promise<void> {
    const { error } = await supabase
      .from('gemini_api_keys')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  },

  async deleteApiKey(id: string): Promise<void> {
    const { error } = await supabase
      .from('gemini_api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async setActiveApiKey(id: string): Promise<void> {
    const { error } = await supabase
      .from('gemini_api_keys')
      .update({ is_active: true })
      .eq('id', id);

    if (error) throw error;
  },

  async addModel(apiKeyId: string, modelName: string, displayName: string, setAsActive: boolean = false): Promise<GeminiModel> {
    const { data, error } = await supabase
      .from('gemini_models')
      .insert({
        api_key_id: apiKeyId,
        model_name: modelName,
        display_name: displayName,
        is_active: setAsActive
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async addModels(apiKeyId: string, models: Array<{ modelName: string; displayName: string }>): Promise<void> {
    const modelsToInsert = models.map(m => ({
      api_key_id: apiKeyId,
      model_name: m.modelName,
      display_name: m.displayName,
      is_active: false
    }));

    const { error } = await supabase
      .from('gemini_models')
      .insert(modelsToInsert);

    if (error) throw error;
  },

  async deleteModel(id: string): Promise<void> {
    const { error } = await supabase
      .from('gemini_models')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async setActiveModel(id: string): Promise<void> {
    const { error } = await supabase
      .from('gemini_models')
      .update({ is_active: true })
      .eq('id', id);

    if (error) throw error;
  },

  async testApiKey(rawApiKey: string, modelName?: string): Promise<{ success: boolean; message: string; data?: any }> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const headers = await getAuthHeaders();

    const response = await fetch(`${supabaseUrl}/functions/v1/test-gemini-key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKey: rawApiKey, mode: 'test' as const, modelName }),
    });

    const result = await response.json();
    return result;
  },

  async fetchAvailableModels(rawApiKey: string): Promise<AvailableGeminiModel[]> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const headers = await getAuthHeaders();

    const response = await fetch(`${supabaseUrl}/functions/v1/test-gemini-key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKey: rawApiKey, mode: 'list_models' as const }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch available models');
    }

    return result.data?.models || [];
  },

  async testApiKeyById(apiKeyId: string, modelName?: string): Promise<{ success: boolean; message: string; data?: any }> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const headers = await getAuthHeaders();

    const response = await fetch(`${supabaseUrl}/functions/v1/test-gemini-key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKeyId, mode: 'test' as const, modelName }),
    });

    const result = await response.json();
    return result;
  },

  async fetchAvailableModelsByKeyId(apiKeyId: string): Promise<AvailableGeminiModel[]> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const headers = await getAuthHeaders();

    const response = await fetch(`${supabaseUrl}/functions/v1/test-gemini-key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKeyId, mode: 'list_models' as const }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch available models');
    }

    return result.data?.models || [];
  },

  async getExistingModelNames(apiKeyId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('gemini_models')
      .select('model_name')
      .eq('api_key_id', apiKeyId);

    if (error) throw error;
    return (data || []).map(m => m.model_name);
  }
};
