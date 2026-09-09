import { supabase } from '../lib/supabase';

export interface InboxItem {
  id: string;
  workflow_id: string;
  workflow_execution_log_id: string | null;
  extraction_log_id: string | null;
  extraction_type_id: string | null;
  inbox_node_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'failed';
  failure_reason: string | null;
  context_data: any;
  extracted_data: any;
  original_extracted_data: any;
  pdf_storage_path: string | null;
  pdf_filename: string | null;
  original_pdf_filename: string | null;
  trigger_source: string | null;
  sender_email: string | null;
  extraction_type_name: string | null;
  format_type: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  edited_data: any;
  has_edits: boolean;
  change_log: ChangeLogEntry[] | null;
  bill_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeLogEntry {
  path: string;
  label: string;
  oldValue: any;
  newValue: any;
}

export interface InboxFilters {
  status?: 'pending' | 'accepted' | 'rejected' | 'failed' | 'all';
  extractionTypeName?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchInboxItems(filters?: InboxFilters): Promise<InboxItem[]> {
  let query = supabase
    .from('inbox_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    if (filters.status === 'pending') {
      query = query.in('status', ['pending', 'failed']);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters?.extractionTypeName) {
    query = query.ilike('extraction_type_name', `%${filters.extractionTypeName}%`);
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch inbox items:', error);
    throw error;
  }

  return data || [];
}

export async function getInboxItemById(id: string): Promise<InboxItem | null> {
  const { data, error } = await supabase
    .from('inbox_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch inbox item:', error);
    throw error;
  }

  return data;
}

export async function resolveInboxItem(
  id: string,
  action: 'accept' | 'reject',
  editedData?: any,
  resolutionNotes?: string,
  userId?: string,
  changeLog?: ChangeLogEntry[]
): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL || (supabase as any).supabaseUrl}/functions/v1/inbox-resolve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        inboxItemId: id,
        action,
        editedData: editedData || undefined,
        resolutionNotes: resolutionNotes || undefined,
        userId: userId || undefined,
        changeLog: changeLog && changeLog.length > 0 ? changeLog : undefined,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to resolve inbox item');
  }

  return result;
}

export async function reprocessInboxItem(id: string, userId?: string): Promise<any> {
  // Reset the item back to pending
  const { error: resetError } = await supabase
    .from('inbox_items')
    .update({ status: 'pending', failure_reason: null, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (resetError) {
    throw new Error('Failed to reset inbox item status');
  }

  // Re-trigger the resolve flow (accept) which will re-run the workflow
  return resolveInboxItem(id, 'accept', undefined, undefined, userId);
}

export async function fetchPendingInboxCount(): Promise<number> {
  const { count, error } = await supabase
    .from('inbox_items')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'failed']);

  if (error) {
    console.error('Failed to fetch pending inbox count:', error);
    return 0;
  }

  return count || 0;
}
