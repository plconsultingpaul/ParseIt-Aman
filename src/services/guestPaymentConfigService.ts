import { supabase } from '../lib/supabase';

export interface GuestPaymentSearchBox {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  help_text?: string;
}

export interface GuestPaymentHeaderKV {
  key: string;
  value: string;
}

export interface GuestPaymentResponseMapping {
  source_path: string;
  target_key: string;
}

export type GuestPaymentApiSourceType = 'main' | 'secondary' | 'custom';

export type GuestPaymentBodyMappingType = 'hardcoded' | 'variable';
export type GuestPaymentBodyMappingDataType = 'string' | 'integer' | 'number' | 'boolean';

export interface GuestPaymentBodyFieldMapping {
  fieldName: string;
  type: GuestPaymentBodyMappingType;
  value: string;
  dataType: GuestPaymentBodyMappingDataType;
}

export interface GuestPaymentApiEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: GuestPaymentHeaderKV[];
  query_params: GuestPaymentHeaderKV[];
  body: string;
  body_field_mappings: GuestPaymentBodyFieldMapping[];
  response_data_path: string;
  response_mappings: GuestPaymentResponseMapping[];
  api_source_type?: GuestPaymentApiSourceType;
  secondary_api_id?: string | null;
  api_spec_id?: string | null;
  api_spec_endpoint_id?: string | null;
  api_path?: string;
  path_variables?: Record<string, string>;
  manual_api_entry?: boolean;
  response_binary?: boolean;
}

export interface GuestPaymentDocumentButton {
  enabled: boolean;
  label: string;
  filename_template: string;
  api_endpoint: GuestPaymentApiEndpoint;
}

export interface GuestPaymentGridColumn {
  key: string;
  label: string;
  format: 'text' | 'currency' | 'date' | 'datetime';
  is_amount?: boolean;
  is_bill_number?: boolean;
}

export type GuestPaymentStripeMode = 'live' | 'test';

export interface GuestPaymentConfig {
  id: string;
  use_company_logo: boolean;
  logo_size: string;
  header_text: string;
  header_size: string;
  sub_header_text: string;
  sub_header_size: string;
  receipt_note_text: string;
  search_boxes: GuestPaymentSearchBox[];
  search_api_1: GuestPaymentApiEndpoint;
  search_api_2: GuestPaymentApiEndpoint;
  grid_1_columns: GuestPaymentGridColumn[];
  grid_2_columns: GuestPaymentGridColumn[];
  stripe_currency: string;
  stripe_success_url: string;
  stripe_cancel_url: string;
  stripe_line_item_name_template: string;
  surcharge_enabled: boolean;
  surcharge_percent: number;
  surcharge_label: string;
  success_api_call: GuestPaymentApiEndpoint;
  receipt_subject_template: string;
  receipt_body_template: string;
  receipt_sending_account_id: string | null;
  receipt_to_email: string;
  receipt_from_email: string;
  routing_search_box_key: string;
  default_company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuestPaymentCompany {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  search_api_1: GuestPaymentApiEndpoint;
  search_api_2: GuestPaymentApiEndpoint;
  success_api_call: GuestPaymentApiEndpoint;
  grid_1_columns: GuestPaymentGridColumn[];
  grid_2_columns: GuestPaymentGridColumn[];
  receipt_subject_template: string;
  receipt_body_template: string;
  receipt_from_email: string;
  receipt_to_email: string;
  receipt_sending_account_id: string | null;
  document_button: GuestPaymentDocumentButton;
  branding: GuestPaymentCompanyBranding;
  stripe_mode: GuestPaymentStripeMode;
  stripe_publishable_key: string;
  stripe_test_publishable_key: string;
  created_at: string;
  updated_at: string;
}

export type GuestPaymentStripeSecretField =
  | 'live_secret_key'
  | 'test_secret_key'
  | 'live_webhook_secret'
  | 'test_webhook_secret';

export interface GuestPaymentStripeSecretsStatus {
  status: Record<GuestPaymentStripeSecretField, { set: boolean; last4: string }>;
  webhook_url: string;
}

export interface GuestPaymentCompanyBranding {
  logo_url: string;
  logo_size: string;
  company_name: string;
  company_name_size: string;
  header_text: string;
  header_size: string;
  sub_header_text: string;
  sub_header_size: string;
}

export const normalizeCompanyBranding = (input: unknown): GuestPaymentCompanyBranding => {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    logo_url: str(raw.logo_url),
    logo_size: str(raw.logo_size),
    company_name: str(raw.company_name),
    company_name_size: str(raw.company_name_size),
    header_text: str(raw.header_text),
    header_size: str(raw.header_size),
    sub_header_text: str(raw.sub_header_text),
    sub_header_size: str(raw.sub_header_size),
  };
};

export type GuestPaymentRoutingMatchType = 'prefix' | 'equals' | 'contains';

export interface GuestPaymentRoutingRule {
  id: string;
  company_id: string;
  match_type: GuestPaymentRoutingMatchType;
  match_value: string;
  case_sensitive: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const emptyApiEndpoint = (): GuestPaymentApiEndpoint => ({
  url: '',
  method: 'GET',
  headers: [],
  query_params: [],
  body: '',
  body_field_mappings: [],
  response_data_path: '',
  response_mappings: [],
  api_source_type: 'custom',
  secondary_api_id: null,
  api_spec_id: null,
  api_spec_endpoint_id: null,
  api_path: '',
  path_variables: {},
  manual_api_entry: false,
  response_binary: false,
});

export const emptyDocumentButton = (): GuestPaymentDocumentButton => ({
  enabled: false,
  label: 'View Document',
  filename_template: 'document.pdf',
  api_endpoint: { ...emptyApiEndpoint(), response_binary: true },
});

export const normalizeDocumentButton = (input: unknown): GuestPaymentDocumentButton => {
  const base = emptyDocumentButton();
  if (!input || typeof input !== 'object') return base;
  const raw = input as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label : base.label,
    filename_template:
      typeof raw.filename_template === 'string' && raw.filename_template.length > 0
        ? raw.filename_template
        : base.filename_template,
    api_endpoint: normalizeApiEndpoint(raw.api_endpoint),
  };
};

export const normalizeApiEndpoint = (input: unknown): GuestPaymentApiEndpoint => {
  const base = emptyApiEndpoint();
  if (!input || typeof input !== 'object') return base;
  const raw = input as Record<string, unknown>;
  const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const sourceType = raw.api_source_type;
  const normalizedSource: GuestPaymentApiSourceType =
    sourceType === 'main' || sourceType === 'secondary' || sourceType === 'custom'
      ? sourceType
      : typeof raw.url === 'string' && raw.url.length > 0
        ? 'custom'
        : 'main';
  const pathVarsRaw = raw.path_variables;
  const pathVariables: Record<string, string> = {};
  if (pathVarsRaw && typeof pathVarsRaw === 'object' && !Array.isArray(pathVarsRaw)) {
    for (const [k, v] of Object.entries(pathVarsRaw as Record<string, unknown>)) {
      pathVariables[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
    }
  }
  return {
    url: typeof raw.url === 'string' ? raw.url : '',
    method: (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const).includes(raw.method as never)
      ? (raw.method as GuestPaymentApiEndpoint['method'])
      : 'GET',
    headers: asArray<GuestPaymentHeaderKV>(raw.headers),
    query_params: asArray<GuestPaymentHeaderKV>(raw.query_params),
    body: typeof raw.body === 'string' ? raw.body : '',
    body_field_mappings: asArray<Record<string, unknown>>(raw.body_field_mappings)
      .map((m) => {
        const t = m.type;
        const dt = m.dataType;
        return {
          fieldName: typeof m.fieldName === 'string' ? m.fieldName : '',
          type: t === 'variable' ? 'variable' : 'hardcoded',
          value: typeof m.value === 'string' ? m.value : m.value == null ? '' : String(m.value),
          dataType:
            dt === 'integer' || dt === 'number' || dt === 'boolean' || dt === 'string'
              ? (dt as GuestPaymentBodyMappingDataType)
              : 'string',
        } as GuestPaymentBodyFieldMapping;
      })
      .filter((m) => m.fieldName.trim().length > 0),
    response_data_path: typeof raw.response_data_path === 'string' ? raw.response_data_path : '',
    response_mappings: asArray<GuestPaymentResponseMapping>(raw.response_mappings),
    api_source_type: normalizedSource,
    secondary_api_id: typeof raw.secondary_api_id === 'string' ? raw.secondary_api_id : null,
    api_spec_id: typeof raw.api_spec_id === 'string' ? raw.api_spec_id : null,
    api_spec_endpoint_id: typeof raw.api_spec_endpoint_id === 'string' ? raw.api_spec_endpoint_id : null,
    api_path: typeof raw.api_path === 'string' ? raw.api_path : '',
    path_variables: pathVariables,
    manual_api_entry: raw.manual_api_entry === true,
    response_binary: raw.response_binary === true,
  };
};

const normalizeConfig = (row: Record<string, unknown>): GuestPaymentConfig => ({
  id: String(row.id),
  use_company_logo: row.use_company_logo !== false,
  logo_size: (row.logo_size as string) ?? 'md',
  header_text: (row.header_text as string) ?? '',
  header_size: (row.header_size as string) ?? '3xl',
  sub_header_text: (row.sub_header_text as string) ?? '',
  sub_header_size: (row.sub_header_size as string) ?? 'lg',
  receipt_note_text:
    typeof row.receipt_note_text === 'string' ? row.receipt_note_text : 'Your receipt will be sent here after payment.',
  search_boxes: Array.isArray(row.search_boxes)
    ? (row.search_boxes as Array<Record<string, unknown>>).map((b) => ({
        key: typeof b.key === 'string' ? b.key : '',
        label: typeof b.label === 'string' ? b.label : '',
        placeholder: typeof b.placeholder === 'string' ? b.placeholder : '',
        required: b.required === true,
        help_text: typeof b.help_text === 'string' ? b.help_text : '',
      }))
    : [],
  search_api_1: normalizeApiEndpoint(row.search_api_1),
  search_api_2: normalizeApiEndpoint(row.search_api_2),
  grid_1_columns: Array.isArray(row.grid_1_columns) ? (row.grid_1_columns as GuestPaymentGridColumn[]) : [],
  grid_2_columns: Array.isArray(row.grid_2_columns) ? (row.grid_2_columns as GuestPaymentGridColumn[]) : [],

  stripe_currency: (row.stripe_currency as string) ?? 'usd',
  stripe_success_url: (row.stripe_success_url as string) ?? '',
  stripe_cancel_url: (row.stripe_cancel_url as string) ?? '',
  stripe_line_item_name_template:
    (row.stripe_line_item_name_template as string) ?? 'Freight Invoice {bill_number}',
  surcharge_enabled: row.surcharge_enabled === true,
  surcharge_percent: Number.isFinite(Number(row.surcharge_percent)) ? Number(row.surcharge_percent) : 3,
  surcharge_label: (row.surcharge_label as string) ?? 'Surcharge',
  success_api_call: normalizeApiEndpoint(row.success_api_call),
  receipt_subject_template: (row.receipt_subject_template as string) ?? '',
  receipt_body_template: (row.receipt_body_template as string) ?? '',
  receipt_sending_account_id: (row.receipt_sending_account_id as string | null) ?? null,
  receipt_to_email: (row.receipt_to_email as string) ?? '{guest_email}',
  receipt_from_email: (row.receipt_from_email as string) ?? '',
  routing_search_box_key: (row.routing_search_box_key as string) ?? '',
  default_company_id: (row.default_company_id as string | null) ?? null,
  created_at: (row.created_at as string) ?? '',
  updated_at: (row.updated_at as string) ?? '',
});

export async function getGuestPaymentConfig(): Promise<GuestPaymentConfig | null> {
  const { data, error } = await supabase
    .from('guest_payment_config')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalizeConfig(data as Record<string, unknown>);
}

export async function getOrCreateGuestPaymentConfig(): Promise<GuestPaymentConfig> {
  const existing = await getGuestPaymentConfig();
  if (existing) return existing;
  const { data, error } = await supabase
    .from('guest_payment_config')
    .insert({})
    .select('*')
    .single();
  if (error) throw error;
  return normalizeConfig(data as Record<string, unknown>);
}

export async function saveGuestPaymentConfig(
  config: GuestPaymentConfig
): Promise<GuestPaymentConfig> {
  const payload = {
    use_company_logo: config.use_company_logo,
    logo_size: config.logo_size,
    header_text: config.header_text,
    header_size: config.header_size,
    sub_header_text: config.sub_header_text,
    sub_header_size: config.sub_header_size,
    receipt_note_text: config.receipt_note_text,
    search_boxes: config.search_boxes,
    search_api_1: config.search_api_1,
    search_api_2: config.search_api_2,
    grid_1_columns: config.grid_1_columns,
    grid_2_columns: config.grid_2_columns,
    stripe_currency: config.stripe_currency,
    stripe_success_url: config.stripe_success_url,
    stripe_cancel_url: config.stripe_cancel_url,
    stripe_line_item_name_template: config.stripe_line_item_name_template,
    surcharge_enabled: config.surcharge_enabled,
    surcharge_percent: config.surcharge_percent,
    surcharge_label: config.surcharge_label,
    success_api_call: config.success_api_call,
    receipt_subject_template: config.receipt_subject_template,
    receipt_body_template: config.receipt_body_template,
    receipt_sending_account_id: config.receipt_sending_account_id,
    receipt_to_email: config.receipt_to_email,
    receipt_from_email: config.receipt_from_email,
    routing_search_box_key: config.routing_search_box_key,
    default_company_id: config.default_company_id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('guest_payment_config')
    .update(payload)
    .eq('id', config.id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeConfig(data as Record<string, unknown>);
}

const normalizeCompany = (row: Record<string, unknown>): GuestPaymentCompany => ({
  id: String(row.id),
  name: (row.name as string) ?? '',
  enabled: row.enabled !== false,
  sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
  search_api_1: normalizeApiEndpoint(row.search_api_1),
  search_api_2: normalizeApiEndpoint(row.search_api_2),
  success_api_call: normalizeApiEndpoint(row.success_api_call),
  grid_1_columns: Array.isArray(row.grid_1_columns) ? (row.grid_1_columns as GuestPaymentGridColumn[]) : [],
  grid_2_columns: Array.isArray(row.grid_2_columns) ? (row.grid_2_columns as GuestPaymentGridColumn[]) : [],
  receipt_subject_template: (row.receipt_subject_template as string) ?? '',
  receipt_body_template: (row.receipt_body_template as string) ?? '',
  receipt_from_email: (row.receipt_from_email as string) ?? '',
  receipt_to_email: (row.receipt_to_email as string) ?? '{guest_email}',
  receipt_sending_account_id: (row.receipt_sending_account_id as string | null) ?? null,
  document_button: normalizeDocumentButton(row.document_button),
  branding: normalizeCompanyBranding(row.branding),
  stripe_mode: row.stripe_mode === 'live' ? 'live' : 'test',
  stripe_publishable_key: (row.stripe_publishable_key as string) ?? '',
  stripe_test_publishable_key: (row.stripe_test_publishable_key as string) ?? '',
  created_at: (row.created_at as string) ?? '',
  updated_at: (row.updated_at as string) ?? '',
});

const normalizeRoutingRule = (row: Record<string, unknown>): GuestPaymentRoutingRule => {
  const mt = row.match_type;
  return {
    id: String(row.id),
    company_id: String(row.company_id ?? ''),
    match_type: (mt === 'equals' || mt === 'contains' || mt === 'prefix') ? mt : 'prefix',
    match_value: (row.match_value as string) ?? '',
    case_sensitive: row.case_sensitive === true,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    created_at: (row.created_at as string) ?? '',
    updated_at: (row.updated_at as string) ?? '',
  };
};

export async function listGuestPaymentCompanies(): Promise<GuestPaymentCompany[]> {
  const { data, error } = await supabase
    .from('guest_payment_companies')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => normalizeCompany(row as Record<string, unknown>));
}

export async function createGuestPaymentCompany(name: string): Promise<GuestPaymentCompany> {
  const { data, error } = await supabase
    .from('guest_payment_companies')
    .insert({ name })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeCompany(data as Record<string, unknown>);
}

export async function saveGuestPaymentCompany(
  company: GuestPaymentCompany
): Promise<GuestPaymentCompany> {
  const payload = {
    name: company.name,
    enabled: company.enabled,
    sort_order: company.sort_order,
    search_api_1: company.search_api_1,
    search_api_2: company.search_api_2,
    success_api_call: company.success_api_call,
    grid_1_columns: company.grid_1_columns,
    grid_2_columns: company.grid_2_columns,
    receipt_subject_template: company.receipt_subject_template,
    receipt_body_template: company.receipt_body_template,
    receipt_from_email: company.receipt_from_email,
    receipt_to_email: company.receipt_to_email,
    receipt_sending_account_id: company.receipt_sending_account_id,
    document_button: company.document_button,
    branding: company.branding,
    stripe_mode: company.stripe_mode,
    stripe_publishable_key: company.stripe_publishable_key,
    stripe_test_publishable_key: company.stripe_test_publishable_key,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('guest_payment_companies')
    .update(payload)
    .eq('id', company.id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeCompany(data as Record<string, unknown>);
}

export async function deleteGuestPaymentCompany(id: string): Promise<void> {
  const { error } = await supabase.from('guest_payment_companies').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateGuestPaymentCompany(
  sourceId: string,
  newName: string
): Promise<GuestPaymentCompany> {
  const { data: src, error: readErr } = await supabase
    .from('guest_payment_companies')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!src) throw new Error('Source company not found');
  const source = normalizeCompany(src as Record<string, unknown>);
  const { data, error } = await supabase
    .from('guest_payment_companies')
    .insert({
      name: newName,
      enabled: source.enabled,
      sort_order: source.sort_order + 1,
      search_api_1: source.search_api_1,
      search_api_2: source.search_api_2,
      success_api_call: source.success_api_call,
      grid_1_columns: source.grid_1_columns,
      grid_2_columns: source.grid_2_columns,
      receipt_subject_template: source.receipt_subject_template,
      receipt_body_template: source.receipt_body_template,
      receipt_from_email: source.receipt_from_email,
      receipt_to_email: source.receipt_to_email,
      receipt_sending_account_id: source.receipt_sending_account_id,
      document_button: source.document_button,
      branding: source.branding,
      stripe_mode: source.stripe_mode,
      stripe_publishable_key: source.stripe_publishable_key,
      stripe_test_publishable_key: source.stripe_test_publishable_key,
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeCompany(data as Record<string, unknown>);
}

async function callStripeSecretsFunction(body: Record<string, unknown>): Promise<GuestPaymentStripeSecretsStatus> {
  const { data, error } = await supabase.functions.invoke('manage-guest-payment-stripe-secrets', { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep original message
    }
    throw new Error(message);
  }
  if (!data || typeof data !== 'object' || !data.status || typeof data.webhook_url !== 'string') {
    throw new Error('Unexpected response while loading Stripe keys');
  }
  return data as GuestPaymentStripeSecretsStatus;
}

export function getCompanyStripeSecretsStatus(companyId: string) {
  return callStripeSecretsFunction({ action: 'status', company_id: companyId });
}

export function saveCompanyStripeSecrets(
  companyId: string,
  updates: Partial<Record<GuestPaymentStripeSecretField, string>>
) {
  return callStripeSecretsFunction({ action: 'save', company_id: companyId, updates });
}

export async function listRoutingRules(): Promise<GuestPaymentRoutingRule[]> {
  const { data, error } = await supabase
    .from('guest_payment_routing_rules')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => normalizeRoutingRule(row as Record<string, unknown>));
}

export async function listRoutingRulesForCompany(companyId: string): Promise<GuestPaymentRoutingRule[]> {
  const { data, error } = await supabase
    .from('guest_payment_routing_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => normalizeRoutingRule(row as Record<string, unknown>));
}

export async function saveRoutingRule(
  rule: Omit<GuestPaymentRoutingRule, 'created_at' | 'updated_at'> & { id?: string }
): Promise<GuestPaymentRoutingRule> {
  const payload = {
    company_id: rule.company_id,
    match_type: rule.match_type,
    match_value: rule.match_value,
    case_sensitive: rule.case_sensitive,
    sort_order: rule.sort_order,
    updated_at: new Date().toISOString(),
  };
  if (rule.id) {
    const { data, error } = await supabase
      .from('guest_payment_routing_rules')
      .update(payload)
      .eq('id', rule.id)
      .select('*')
      .single();
    if (error) throw error;
    return normalizeRoutingRule(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from('guest_payment_routing_rules')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeRoutingRule(data as Record<string, unknown>);
}

export async function deleteRoutingRule(id: string): Promise<void> {
  const { error } = await supabase.from('guest_payment_routing_rules').delete().eq('id', id);
  if (error) throw error;
}
