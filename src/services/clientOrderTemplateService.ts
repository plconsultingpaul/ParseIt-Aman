import { supabase } from '../lib/supabase';

export interface ClientOrderTemplate {
  id: string;
  clientId: string;
  userId: string;
  templateNumber: string;
  templateName: string;
  formData: Record<string, any>;
  orderEntryTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchClientOrderTemplates(clientId: string): Promise<ClientOrderTemplate[]> {
  const { data, error } = await supabase
    .from('client_order_entry_saved_templates')
    .select('id, client_id, user_id, template_number, template_name, form_data, order_entry_template_id, created_at, updated_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((t: any) => ({
    id: t.id,
    clientId: t.client_id,
    userId: t.user_id,
    templateNumber: t.template_number,
    templateName: t.template_name,
    formData: t.form_data || {},
    orderEntryTemplateId: t.order_entry_template_id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

export async function generateTemplateNumber(clientId: string): Promise<string> {
  const { data, error } = await supabase
    .from('client_order_entry_saved_templates')
    .select('template_number')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) return 'TPL-001';

  const lastNum = data[0].template_number;
  const match = lastNum.match(/TPL-(\d+)/);
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `TPL-${String(next).padStart(3, '0')}`;
}

export async function saveClientOrderTemplate(params: {
  clientId: string;
  userId: string;
  templateName: string;
  formData: Record<string, any>;
  orderEntryTemplateId: string | null;
}): Promise<ClientOrderTemplate> {
  const templateNumber = await generateTemplateNumber(params.clientId);

  const { data, error } = await supabase
    .from('client_order_entry_saved_templates')
    .insert([{
      client_id: params.clientId,
      user_id: params.userId,
      template_number: templateNumber,
      template_name: params.templateName,
      form_data: params.formData,
      order_entry_template_id: params.orderEntryTemplateId,
    }])
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    clientId: data.client_id,
    userId: data.user_id,
    templateNumber: data.template_number,
    templateName: data.template_name,
    formData: data.form_data || {},
    orderEntryTemplateId: data.order_entry_template_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateClientOrderTemplate(templateId: string, formData: Record<string, any>): Promise<void> {
  const { error } = await supabase
    .from('client_order_entry_saved_templates')
    .update({ form_data: formData, updated_at: new Date().toISOString() })
    .eq('id', templateId);

  if (error) throw error;
}

export async function deleteClientOrderTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('client_order_entry_saved_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;
}
