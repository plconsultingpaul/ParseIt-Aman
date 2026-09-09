import { supabase } from '../lib/supabase';

export interface SsoApplication {
  id: string;
  name: string;
  url: string;
  appIdentifier: string;
  iconUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SsoApplicationFormData {
  name: string;
  url: string;
  appIdentifier: string;
  iconUrl: string;
  sortOrder: number;
  isActive: boolean;
}

function mapRow(row: any): SsoApplication {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    appIdentifier: row.app_identifier,
    iconUrl: row.icon_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSsoApplications(): Promise<SsoApplication[]> {
  const { data, error } = await supabase
    .from('sso_applications')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function fetchActiveSsoApplications(): Promise<SsoApplication[]> {
  const { data, error } = await supabase
    .from('sso_applications')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function createSsoApplication(formData: SsoApplicationFormData): Promise<SsoApplication> {
  const { data, error } = await supabase
    .from('sso_applications')
    .insert([{
      name: formData.name,
      url: formData.url,
      app_identifier: formData.appIdentifier,
      icon_url: formData.iconUrl || null,
      sort_order: formData.sortOrder,
      is_active: formData.isActive,
    }])
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function updateSsoApplication(id: string, formData: SsoApplicationFormData): Promise<SsoApplication> {
  const { data, error } = await supabase
    .from('sso_applications')
    .update({
      name: formData.name,
      url: formData.url,
      app_identifier: formData.appIdentifier,
      icon_url: formData.iconUrl || null,
      sort_order: formData.sortOrder,
      is_active: formData.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function deleteSsoApplication(id: string): Promise<void> {
  const { error } = await supabase
    .from('sso_applications')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
