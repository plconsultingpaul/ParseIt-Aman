import { supabase } from '../lib/supabase';

export type EmailProcessingQueueStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface EmailProcessingQueueItem {
  id: string;
  source_message_id: string | null;
  provider: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_received_date: string | null;
  matching_rule_id: string | null;
  processing_mode: 'extraction' | 'workflow_v2' | 'transformation';
  extraction_type_id: string | null;
  transformation_type_id: string | null;
  workflow_v2_id: string | null;
  original_filename: string | null;
  storage_path: string;
  page_count: number | null;
  status: EmailProcessingQueueStatus;
  attempts: number;
  error_message: string | null;
  result: any;
  worker_locked_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailProcessingQueueTab = 'inbox' | 'processed' | 'failed';

export interface EmailProcessingQueueFilters {
  tab: EmailProcessingQueueTab;
  search?: string;
}

export async function fetchEmailProcessingQueueItems(
  filters: EmailProcessingQueueFilters
): Promise<EmailProcessingQueueItem[]> {
  let query = supabase
    .from('email_processing_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.tab === 'inbox') {
    query = query.in('status', ['pending', 'processing']);
  } else if (filters.tab === 'processed') {
    query = query.eq('status', 'processed');
  } else if (filters.tab === 'failed') {
    query = query.eq('status', 'failed');
  }

  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim();
    query = query.or(
      `original_filename.ilike.%${s}%,email_subject.ilike.%${s}%,email_from.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch email_processing_queue items:', error);
    throw error;
  }
  return (data || []) as EmailProcessingQueueItem[];
}

export async function fetchEmailProcessingQueuePendingCount(): Promise<number> {
  const { count, error } = await supabase
    .from('email_processing_queue')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'processing']);
  if (error) {
    console.error('Failed to count pending queue rows:', error);
    return 0;
  }
  return count || 0;
}

export async function fetchEmailProcessingQueueFailedCount(): Promise<number> {
  const { count, error } = await supabase
    .from('email_processing_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');
  if (error) {
    console.error('Failed to count failed queue rows:', error);
    return 0;
  }
  return count || 0;
}

export async function reprocessQueueItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('email_processing_queue')
    .update({
      status: 'pending',
      error_message: null,
      processed_at: null,
      worker_locked_at: null,
      failure_notified_at: null,
    })
    .eq('id', id);
  if (error) throw error;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (supabaseUrl && anonKey) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/email-processing-worker`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: 'reprocess', id }),
      });
    } catch (err) {
      console.warn('Worker nudge after reprocess failed (safe: pg_cron will pick it up):', err);
    }
  }
}

export async function deleteQueueItem(item: EmailProcessingQueueItem): Promise<void> {
  if (item.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('email-processing-pdfs')
      .remove([item.storage_path]);
    if (storageError) {
      console.warn('Failed to remove PDF from storage (proceeding with row delete):', storageError.message);
    }
  }
  const { error } = await supabase
    .from('email_processing_queue')
    .delete()
    .eq('id', item.id);
  if (error) throw error;
}

export async function getQueuePdfSignedUrl(item: EmailProcessingQueueItem): Promise<string> {
  const { data, error } = await supabase.storage
    .from('email-processing-pdfs')
    .createSignedUrl(item.storage_path, 60 * 10);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to create signed URL for PDF');
  }
  return data.signedUrl;
}
