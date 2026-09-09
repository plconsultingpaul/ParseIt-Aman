import { supabase, getAuthHeaders } from '../lib/supabase';
import type { SftpConfig, SettingsConfig, ApiConfig, CompanyBranding, SecondaryApiConfig } from '../types';

// API Configuration
export async function fetchApiConfig(): Promise<ApiConfig> {
  try {
    const { data, error } = await supabase
      .from('api_settings')
      .select('id, path, password, google_api_key, order_display_fields, custom_order_display_fields, test_endpoint, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      const config = data[0];
      
      // Parse custom_order_display_fields to ensure it's always an array
      let customOrderDisplayFields = [];
      try {
        if (typeof config.custom_order_display_fields === 'string') {
          customOrderDisplayFields = JSON.parse(config.custom_order_display_fields);
        } else if (Array.isArray(config.custom_order_display_fields)) {
          customOrderDisplayFields = config.custom_order_display_fields;
        }
      } catch (error) {
        console.warn('Failed to parse custom_order_display_fields, defaulting to empty array:', error);
        customOrderDisplayFields = [];
      }
      
      // Ensure it's an array
      if (!Array.isArray(customOrderDisplayFields)) {
        customOrderDisplayFields = [];
      }
      
      return {
        path: config.path || '',
        password: config.password || '',
        googleApiKey: config.google_api_key || '',
        orderDisplayFields: config.order_display_fields || '',
        customOrderDisplayFields,
        testEndpoint: config.test_endpoint || ''
      };
    }

    return {
      path: '',
      password: '',
      googleApiKey: '',
      orderDisplayFields: '',
      customOrderDisplayFields: [],
      testEndpoint: ''
    };
  } catch (error) {
    console.error('Error fetching API config:', error);
    throw error;
  }
}

export async function updateApiConfig(config: ApiConfig): Promise<void> {
  try {
    const { data: existingData } = await supabase
      .from('api_settings')
      .select('id')
      .limit(1);

    const configData: Record<string, any> = {
      path: config.path,
      password: config.password ?? '',
      google_api_key: config.googleApiKey,
      order_display_fields: config.orderDisplayFields,
      custom_order_display_fields: config.customOrderDisplayFields,
      test_endpoint: config.testEndpoint || null,
      updated_at: new Date().toISOString()
    };

    if (config.googlePlacesApiKey) {
      configData.google_places_api_key = config.googlePlacesApiKey;
    }

    if (existingData && existingData.length > 0) {
      const { error } = await supabase
        .from('api_settings')
        .update(configData)
        .eq('id', existingData[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('api_settings')
        .insert([configData]);
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error updating API config:', error);
    throw error;
  }
}

// SFTP Configuration
export async function fetchSftpConfig(): Promise<SftpConfig> {
  try {
    const { data, error } = await supabase
      .from('sftp_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      const config = data[0];
      return {
        host: config.host || '',
        port: config.port || 22,
        username: config.username || '',
        password: config.password || '',
        xmlPath: config.remote_path || '/uploads/xml/',
        pdfPath: config.pdf_path || '/uploads/pdf/',
        jsonPath: config.json_path || '/uploads/json/',
        csvPath: config.csv_path || '/uploads/csv/'
      };
    }

    return {
      host: '',
      port: 22,
      username: '',
      password: '',
      xmlPath: '/uploads/xml/',
      pdfPath: '/uploads/pdf/',
      jsonPath: '/uploads/json/',
      csvPath: '/uploads/csv/'
    };
  } catch (error) {
    console.error('Error fetching SFTP config:', error);
    throw error;
  }
}

export async function updateSftpConfig(config: SftpConfig): Promise<void> {
  try {
    const { data: existingData } = await supabase
      .from('sftp_config')
      .select('id')
      .limit(1);

    const configData = {
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      remote_path: config.xmlPath,
      pdf_path: config.pdfPath,
      json_path: config.jsonPath,
      csv_path: config.csvPath,
      updated_at: new Date().toISOString()
    };

    if (existingData && existingData.length > 0) {
      const { error } = await supabase
        .from('sftp_config')
        .update(configData)
        .eq('id', existingData[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('sftp_config')
        .insert([configData]);
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error updating SFTP config:', error);
    throw error;
  }
}

// Settings Configuration
export async function fetchSettingsConfig(): Promise<SettingsConfig> {
  try {
    const { data, error } = await supabase
      .from('settings_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      return {
        password: data[0].password || ''
      };
    }

    return {
      password: ''
    };
  } catch (error) {
    console.error('Error fetching settings config:', error);
    throw error;
  }
}

export async function updateSettingsConfig(config: SettingsConfig): Promise<void> {
  try {
    const { data: existingData } = await supabase
      .from('settings_config')
      .select('id')
      .limit(1);

    const configData = {
      password: config.password,
      updated_at: new Date().toISOString()
    };

    if (existingData && existingData.length > 0) {
      const { error } = await supabase
        .from('settings_config')
        .update(configData)
        .eq('id', existingData[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('settings_config')
        .insert([configData]);
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error updating settings config:', error);
    throw error;
  }
}

// Company Branding
export async function uploadCompanyLogo(file: File): Promise<{ publicUrl: string; storagePath: string }> {
  try {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Please upload PNG, JPG, SVG, or WebP');
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('File size must be less than 2MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `logo-${Date.now()}.${fileExt}`;
    const filePath = `company-logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('pdfs')
      .getPublicUrl(filePath);

    return { publicUrl, storagePath: filePath };
  } catch (error: any) {
    console.error('Error uploading logo:', error);
    throw error;
  }
}

export async function fetchCompanyBranding(): Promise<CompanyBranding> {
  console.log('[fetchCompanyBranding] Starting query to company_branding table');
  try {
    const { data, error } = await supabase
      .from('company_branding')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[fetchCompanyBranding] Supabase query error:', error.message, error.code, error.details);
      throw error;
    }

    console.log('[fetchCompanyBranding] Query returned rows:', data?.length ?? 0);

    if (data && data.length > 0) {
      const branding = data[0];
      console.log('[fetchCompanyBranding] Branding row found:', {
        id: branding.id,
        company_name: branding.company_name || '(empty)',
        logo_url: branding.logo_url ? branding.logo_url.substring(0, 60) + '...' : '(null)',
        show_company_name: branding.show_company_name,
        login_logo_size: branding.login_logo_size
      });
      return {
        id: branding.id,
        companyName: branding.company_name || '',
        logoUrl: branding.logo_url || '',
        logoStoragePath: branding.logo_storage_path || '',
        showCompanyName: branding.show_company_name || false,
        clientLoginLogoUrl: branding.client_login_logo_url || '',
        clientLoginLogoSize: branding.client_login_logo_size || 80,
        clientLoginCompanyName: branding.client_login_company_name || '',
        loginLogoSize: branding.login_logo_size || 80,
        appBaseUrl: branding.app_base_url || '',
        trainingVideoLink: branding.training_video_link || ''
      };
    }

    console.log('[fetchCompanyBranding] No branding rows found, returning defaults');
    return {
      id: '',
      companyName: '',
      logoUrl: '',
      logoStoragePath: '',
      showCompanyName: false,
      clientLoginLogoUrl: '',
      clientLoginLogoSize: 80,
      clientLoginCompanyName: '',
      loginLogoSize: 80,
      appBaseUrl: '',
      trainingVideoLink: ''
    };
  } catch (error) {
    console.error('[fetchCompanyBranding] Error fetching company branding:', error);
    throw error;
  }
}

export async function updateCompanyBranding(branding: CompanyBranding): Promise<void> {
  try {
    const { data: existingData } = await supabase
      .from('company_branding')
      .select('id')
      .limit(1);

    const brandingData = {
      company_name: branding.companyName,
      logo_url: branding.logoUrl,
      logo_storage_path: branding.logoStoragePath || null,
      show_company_name: branding.showCompanyName,
      client_login_logo_url: branding.clientLoginLogoUrl || null,
      client_login_logo_size: branding.clientLoginLogoSize || 80,
      client_login_company_name: branding.clientLoginCompanyName || null,
      login_logo_size: branding.loginLogoSize || 80,
      app_base_url: branding.appBaseUrl || '',
      training_video_link: branding.trainingVideoLink || null,
      updated_at: new Date().toISOString()
    };

    if (existingData && existingData.length > 0) {
      const { error } = await supabase
        .from('company_branding')
        .update(brandingData)
        .eq('id', existingData[0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('company_branding')
        .insert([brandingData]);
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error updating company branding:', error);
    throw error;
  }
}

// Secondary API Configuration
export async function fetchSecondaryApiConfigs(): Promise<SecondaryApiConfig[]> {
  try {
    const { data, error } = await supabase
      .from('secondary_api_configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      return data.map(config => ({
        id: config.id,
        name: config.name,
        baseUrl: config.base_url,
        authToken: config.auth_token || '',
        description: config.description || '',
        isActive: config.is_active,
        testEndpoint: config.test_endpoint || '',
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }));
    }

    return [];
  } catch (error) {
    console.error('Error fetching secondary API configs:', error);
    throw error;
  }
}

export async function createSecondaryApiConfig(config: Omit<SecondaryApiConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<SecondaryApiConfig> {
  try {
    const configData = {
      name: config.name,
      base_url: config.baseUrl,
      auth_token: config.authToken || '',
      description: config.description || '',
      is_active: config.isActive,
      test_endpoint: config.testEndpoint || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('secondary_api_configs')
      .insert([configData])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      baseUrl: data.base_url,
      authToken: data.auth_token || '',
      description: data.description || '',
      isActive: data.is_active,
      testEndpoint: data.test_endpoint || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  } catch (error) {
    console.error('Error creating secondary API config:', error);
    throw error;
  }
}

export async function updateSecondaryApiConfig(id: string, config: Partial<SecondaryApiConfig>): Promise<void> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (config.name !== undefined) updateData.name = config.name;
    if (config.baseUrl !== undefined) updateData.base_url = config.baseUrl;
    if (config.authToken !== undefined) updateData.auth_token = config.authToken;
    if (config.description !== undefined) updateData.description = config.description;
    if (config.isActive !== undefined) updateData.is_active = config.isActive;
    if (config.testEndpoint !== undefined) updateData.test_endpoint = config.testEndpoint || null;

    const { error } = await supabase
      .from('secondary_api_configs')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating secondary API config:', error);
    throw error;
  }
}

export async function deleteSecondaryApiConfig(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('secondary_api_configs')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting secondary API config:', error);
    throw error;
  }
}

export async function toggleSecondaryApiConfig(id: string, isActive: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from('secondary_api_configs')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error toggling secondary API config:', error);
    throw error;
  }
}

// API Authentication Configuration
export interface ApiAuthConfigDB {
  id: string;
  name: string;
  loginEndpoint: string;
  pingEndpoint: string;
  tokenFieldName: string;
  username: string;
  password: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const API_AUTH_CONFIG_SAFE_FIELDS = 'id, name, login_endpoint, ping_endpoint, token_field_name, username, is_active, created_at, updated_at';

function mapApiAuthConfigRow(data: Record<string, unknown>): ApiAuthConfigDB {
  return {
    id: data.id as string,
    name: data.name as string,
    loginEndpoint: data.login_endpoint as string,
    pingEndpoint: data.ping_endpoint as string,
    tokenFieldName: (data.token_field_name as string) || 'access_token',
    username: data.username as string,
    password: '',
    isActive: data.is_active as boolean,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string
  };
}

export async function fetchApiAuthConfig(): Promise<ApiAuthConfigDB | null> {
  try {
    const { data, error } = await supabase
      .from('api_auth_config')
      .select(API_AUTH_CONFIG_SAFE_FIELDS)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return mapApiAuthConfigRow(data);
    }

    return null;
  } catch (error) {
    console.error('Error fetching API auth config:', error);
    throw error;
  }
}

export async function fetchAllApiAuthConfigs(): Promise<ApiAuthConfigDB[]> {
  try {
    const { data, error } = await supabase
      .from('api_auth_config')
      .select(API_AUTH_CONFIG_SAFE_FIELDS)
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map(item => mapApiAuthConfigRow(item));
  } catch (error) {
    console.error('Error fetching all API auth configs:', error);
    throw error;
  }
}

export async function fetchApiAuthConfigById(id: string): Promise<ApiAuthConfigDB | null> {
  try {
    const { data, error } = await supabase
      .from('api_auth_config')
      .select(API_AUTH_CONFIG_SAFE_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return mapApiAuthConfigRow(data);
    }

    return null;
  } catch (error) {
    console.error('Error fetching API auth config by ID:', error);
    throw error;
  }
}

export async function fetchApiAuthConfigByName(name: string): Promise<ApiAuthConfigDB | null> {
  try {
    const { data, error } = await supabase
      .from('api_auth_config')
      .select(API_AUTH_CONFIG_SAFE_FIELDS)
      .eq('name', name)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return mapApiAuthConfigRow(data);
    }

    return null;
  } catch (error) {
    console.error('Error fetching API auth config by name:', error);
    throw error;
  }
}

export async function saveApiAuthConfig(config: Omit<ApiAuthConfigDB, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiAuthConfigDB> {
  try {
    const { data: existingData } = await supabase
      .from('api_auth_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    const configData: Record<string, unknown> = {
      name: config.name,
      login_endpoint: config.loginEndpoint,
      ping_endpoint: config.pingEndpoint,
      token_field_name: config.tokenFieldName || 'access_token',
      username: config.username,
      is_active: config.isActive,
      updated_at: new Date().toISOString()
    };

    if (config.password) {
      configData.password = config.password;
    }

    let result;

    if (existingData) {
      const { data, error } = await supabase
        .from('api_auth_config')
        .update(configData)
        .eq('id', existingData.id)
        .select(API_AUTH_CONFIG_SAFE_FIELDS)
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('api_auth_config')
        .insert([{ ...configData, created_at: new Date().toISOString() }])
        .select(API_AUTH_CONFIG_SAFE_FIELDS)
        .single();
      if (error) throw error;
      result = data;
    }

    return mapApiAuthConfigRow(result);
  } catch (error) {
    console.error('Error saving API auth config:', error);
    throw error;
  }
}

export async function createApiAuthConfig(config: Omit<ApiAuthConfigDB, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiAuthConfigDB> {
  try {
    if (!config.password) {
      throw new Error('Password is required when creating a new authentication configuration');
    }

    const configData = {
      name: config.name,
      login_endpoint: config.loginEndpoint,
      ping_endpoint: config.pingEndpoint,
      token_field_name: config.tokenFieldName || 'access_token',
      username: config.username,
      password: config.password,
      is_active: config.isActive,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('api_auth_config')
      .insert([configData])
      .select(API_AUTH_CONFIG_SAFE_FIELDS)
      .single();

    if (error) throw error;

    return mapApiAuthConfigRow(data);
  } catch (error) {
    console.error('Error creating API auth config:', error);
    throw error;
  }
}

export async function updateApiAuthConfig(id: string, config: Omit<ApiAuthConfigDB, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiAuthConfigDB> {
  try {
    const configData: Record<string, unknown> = {
      name: config.name,
      login_endpoint: config.loginEndpoint,
      ping_endpoint: config.pingEndpoint,
      token_field_name: config.tokenFieldName || 'access_token',
      username: config.username,
      is_active: config.isActive,
      updated_at: new Date().toISOString()
    };

    if (config.password) {
      configData.password = config.password;
    }

    const { data, error } = await supabase
      .from('api_auth_config')
      .update(configData)
      .eq('id', id)
      .select(API_AUTH_CONFIG_SAFE_FIELDS)
      .single();

    if (error) throw error;

    return mapApiAuthConfigRow(data);
  } catch (error) {
    console.error('Error updating API auth config:', error);
    throw error;
  }
}

export async function deleteApiAuthConfig(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('api_auth_config')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting API auth config:', error);
    throw error;
  }
}

export async function testApiAuthConnection(
  options: {
    configId?: string;
    loginEndpoint?: string;
    pingEndpoint?: string;
    username?: string;
    password?: string;
    tokenFieldName?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const headers = await getAuthHeaders();

    const response = await fetch(`${supabaseUrl}/functions/v1/test-api-auth`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options),
    });

    const result = await response.json();
    return { success: result.success, message: result.message };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}