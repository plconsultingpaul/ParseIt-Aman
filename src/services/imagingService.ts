import { supabase } from '../lib/supabase';
import type { ImagingBucket, ImagingDocumentType, ImagingDocument, ImagingBarcodePattern, ImagingQueue, ImagingUnindexedItem, ImagingEmailMonitoringConfig, ImagingEmailProcessingRule, ImagingDocumentTypeProcessingRule, ImagingMetadataField, ImagingDocumentMetadata, ImagingDocumentTypeMetadataField, ImagingSftpConnection, ImagingSftpFolderConfig, ImagingSftpProcessingRule, ImagingSftpPollingLog } from '../types';

function mapBucket(row: any): ImagingBucket {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description || '',
    isActive: row.is_active,
    isDefault: row.is_default || false,
    supabaseStorageSlug: row.supabase_storage_slug || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateStorageSlug(name: string): string {
  return 'imaging-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function mapDocumentType(row: any): ImagingDocumentType {
  const manualAction = row.duplicate_manual_action;
  const emailAction = row.duplicate_email_action;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    isActive: row.is_active,
    allowDuplicates: row.allow_duplicates !== false,
    duplicateManualAction: (manualAction === 'keep_existing' || manualAction === 'use_new' || manualAction === 'prompt')
      ? manualAction
      : 'prompt',
    duplicateEmailAction: (emailAction === 'keep_existing' || emailAction === 'use_new')
      ? emailAction
      : 'keep_existing',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: any, metadataByField?: Record<string, string>): ImagingDocument {
  const detailLineId = metadataByField?.detailLineId || row.detail_line_id || '';
  const billNumber = metadataByField?.billNumber || row.bill_number || '';
  return {
    id: row.id,
    bucketId: row.bucket_id,
    documentTypeId: row.document_type_id,
    detailLineId,
    billNumber,
    storagePath: row.storage_path,
    originalFilename: row.original_filename || '',
    fileSize: row.file_size || 0,
    uploadedBy: row.uploaded_by,
    processingStatus: row.processing_status || 'none',
    epdfJobId: row.epdf_job_id || undefined,
    epdfStoragePath: row.epdf_storage_path || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bucketName: row.imaging_buckets?.name,
    documentTypeName: row.imaging_document_types?.name,
    bucketUrl: row.imaging_buckets?.url,
  };
}

let _metadataFieldNameCache: Record<string, string> | null = null;

async function getMetadataFieldNameMap(): Promise<Record<string, string>> {
  if (_metadataFieldNameCache) return _metadataFieldNameCache;
  const { data } = await supabase
    .from('imaging_metadata_fields')
    .select('id, field_name');
  const map: Record<string, string> = {};
  (data || []).forEach((r: any) => { map[r.id] = r.field_name; });
  _metadataFieldNameCache = map;
  return map;
}

export function clearMetadataFieldNameCache(): void {
  _metadataFieldNameCache = null;
}

async function enrichDocumentsWithMetadata(rows: any[]): Promise<ImagingDocument[]> {
  if (rows.length === 0) return [];
  const docIds = rows.map((r: any) => r.id);
  const fieldNameMap = await getMetadataFieldNameMap();
  const { data: metaRows } = await supabase
    .from('imaging_document_metadata')
    .select('document_id, field_id, value')
    .in('document_id', docIds);

  const metaByDoc: Record<string, Record<string, string>> = {};
  (metaRows || []).forEach((m: any) => {
    if (!metaByDoc[m.document_id]) metaByDoc[m.document_id] = {};
    const fieldName = fieldNameMap[m.field_id];
    if (fieldName) metaByDoc[m.document_id][fieldName] = m.value || '';
  });

  return rows.map((row: any) => mapDocument(row, metaByDoc[row.id]));
}

export async function fetchBuckets(): Promise<ImagingBucket[]> {
  const { data, error } = await supabase
    .from('imaging_buckets')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data || []).map(mapBucket);
}

export async function createBucket(name: string, description: string): Promise<ImagingBucket> {
  const slug = generateStorageSlug(name);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;

  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/manage-imaging-bucket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ action: 'create', name: slug }),
  });

  const edgeResult = await edgeRes.json();
  if (!edgeRes.ok || edgeResult.error) {
    throw new Error(`Failed to create storage bucket: ${edgeResult.error || 'Unknown error'}`);
  }

  const publicBaseUrl = `${supabaseUrl}/storage/v1/object/public/${slug}`;

  const { data, error } = await supabase
    .from('imaging_buckets')
    .insert({ name, url: publicBaseUrl, description, supabase_storage_slug: slug })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('imaging_queues').insert([
    { bucket_id: data.id, name: 'Indexed', slug: 'indexed', is_system: true, sort_order: 0 },
    { bucket_id: data.id, name: 'Unindexed', slug: 'unindexed', is_system: true, sort_order: 1 },
    { bucket_id: data.id, name: 'Missing', slug: 'missing', is_system: true, sort_order: 2 },
  ]);

  return mapBucket(data);
}

export async function updateBucket(id: string, updates: Partial<Pick<ImagingBucket, 'name' | 'url' | 'description' | 'isActive'>>): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.url !== undefined) dbUpdates.url = updates.url;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { error } = await supabase.from('imaging_buckets').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function setDefaultBucket(id: string): Promise<void> {
  const { error } = await supabase
    .from('imaging_buckets')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function clearDefaultBucket(id: string): Promise<void> {
  const { error } = await supabase
    .from('imaging_buckets')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBucket(id: string): Promise<void> {
  const { data: bucketRow } = await supabase
    .from('imaging_buckets')
    .select('supabase_storage_slug')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('imaging_buckets').delete().eq('id', id);
  if (error) throw error;

  if (bucketRow?.supabase_storage_slug) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || anonKey;

    await fetch(`${supabaseUrl}/functions/v1/manage-imaging-bucket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ action: 'delete', name: bucketRow.supabase_storage_slug }),
    });
  }
}

function mapQueue(row: any): ImagingQueue {
  return {
    id: row.id,
    bucketId: row.bucket_id,
    name: row.name,
    description: row.description || '',
    slug: row.slug,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bucketName: row.imaging_buckets?.name,
  };
}

export async function fetchQueues(bucketId?: string): Promise<ImagingQueue[]> {
  let query = supabase
    .from('imaging_queues')
    .select('*, imaging_buckets(name)')
    .order('sort_order', { ascending: true });
  if (bucketId) query = query.eq('bucket_id', bucketId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapQueue);
}

export async function createQueue(bucketId: string, name: string, description: string): Promise<ImagingQueue> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { data: existing } = await supabase
    .from('imaging_queues')
    .select('sort_order')
    .eq('bucket_id', bucketId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing && existing.length > 0 ? existing[0].sort_order : 0) + 1;

  const { data, error } = await supabase
    .from('imaging_queues')
    .insert({ bucket_id: bucketId, name, description, slug, sort_order: nextOrder })
    .select('*, imaging_buckets(name)')
    .single();
  if (error) throw error;
  return mapQueue(data);
}

export async function updateQueue(id: string, updates: Partial<Pick<ImagingQueue, 'name' | 'description' | 'sortOrder' | 'isActive'>>): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { error } = await supabase.from('imaging_queues').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteQueue(id: string): Promise<void> {
  const { error } = await supabase.from('imaging_queues').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchDocumentTypes(): Promise<ImagingDocumentType[]> {
  const { data, error } = await supabase
    .from('imaging_document_types')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data || []).map(mapDocumentType);
}

export async function fetchBucketDocumentTypeIds(bucketId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('imaging_bucket_document_types')
    .select('document_type_id')
    .eq('bucket_id', bucketId);
  if (error) throw error;
  return (data || []).map((r: any) => r.document_type_id);
}

export async function setBucketDocumentTypes(bucketId: string, documentTypeIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from('imaging_bucket_document_types')
    .delete()
    .eq('bucket_id', bucketId);
  if (delError) throw delError;
  if (documentTypeIds.length === 0) return;
  const rows = documentTypeIds.map(id => ({ bucket_id: bucketId, document_type_id: id }));
  const { error: insError } = await supabase
    .from('imaging_bucket_document_types')
    .insert(rows);
  if (insError) throw insError;
}

export async function createDocumentType(name: string, description: string): Promise<ImagingDocumentType> {
  const { data, error } = await supabase
    .from('imaging_document_types')
    .insert({ name, description })
    .select()
    .single();
  if (error) throw error;
  return mapDocumentType(data);
}

export async function updateDocumentType(
  id: string,
  updates: Partial<Pick<ImagingDocumentType, 'name' | 'description' | 'isActive' | 'allowDuplicates' | 'duplicateManualAction' | 'duplicateEmailAction'>>
): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.allowDuplicates !== undefined) dbUpdates.allow_duplicates = updates.allowDuplicates;
  if (updates.duplicateManualAction !== undefined) dbUpdates.duplicate_manual_action = updates.duplicateManualAction;
  if (updates.duplicateEmailAction !== undefined) dbUpdates.duplicate_email_action = updates.duplicateEmailAction;
  const { error } = await supabase.from('imaging_document_types').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteDocumentType(id: string): Promise<void> {
  const { error } = await supabase.from('imaging_document_types').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchDocuments(filters?: {
  bucketId?: string;
  documentTypeId?: string;
  search?: string;
}): Promise<ImagingDocument[]> {
  if (filters?.search) {
    const searchTerm = filters.search;

    let physicalQuery = supabase
      .from('imaging_documents')
      .select('id')
      .or(`detail_line_id.ilike.%${searchTerm}%,bill_number.ilike.%${searchTerm}%,original_filename.ilike.%${searchTerm}%`);
    if (filters.bucketId) physicalQuery = physicalQuery.eq('bucket_id', filters.bucketId);
    if (filters.documentTypeId) physicalQuery = physicalQuery.eq('document_type_id', filters.documentTypeId);
    const { data: physicalHits } = await physicalQuery;

    const { data: metaHits } = await supabase
      .from('imaging_document_metadata')
      .select('document_id')
      .ilike('value', `%${searchTerm}%`);

    const allIds = new Set<string>();
    (physicalHits || []).forEach((r: any) => allIds.add(r.id));
    (metaHits || []).forEach((r: any) => allIds.add(r.document_id));

    if (allIds.size === 0) return [];

    let docsQuery = supabase
      .from('imaging_documents')
      .select('*, imaging_buckets(name, url), imaging_document_types(name)')
      .in('id', [...allIds])
      .order('created_at', { ascending: false })
      .limit(200);
    if (filters.bucketId) docsQuery = docsQuery.eq('bucket_id', filters.bucketId);
    if (filters.documentTypeId) docsQuery = docsQuery.eq('document_type_id', filters.documentTypeId);
    const { data, error } = await docsQuery;
    if (error) throw error;
    return enrichDocumentsWithMetadata(data || []);
  }

  let query = supabase
    .from('imaging_documents')
    .select('*, imaging_buckets(name, url), imaging_document_types(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters?.bucketId) {
    query = query.eq('bucket_id', filters.bucketId);
  }
  if (filters?.documentTypeId) {
    query = query.eq('document_type_id', filters.documentTypeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return enrichDocumentsWithMetadata(data || []);
}

export async function updateDocumentProperties(id: string, updates: {
  originalFilename?: string;
  documentTypeId?: string;
  detailLineId?: string;
  billNumber?: string;
  bucketId?: string;
}): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.originalFilename !== undefined) dbUpdates.original_filename = updates.originalFilename;
  if (updates.documentTypeId !== undefined) dbUpdates.document_type_id = updates.documentTypeId;
  if (updates.detailLineId !== undefined) dbUpdates.detail_line_id = updates.detailLineId;
  if (updates.billNumber !== undefined) dbUpdates.bill_number = updates.billNumber;
  if (updates.bucketId !== undefined) dbUpdates.bucket_id = updates.bucketId;
  const { error } = await supabase.from('imaging_documents').update(dbUpdates).eq('id', id);
  if (error) throw error;

  const fieldNameMap = await getMetadataFieldNameMap();
  const fieldNameToId: Record<string, string> = {};
  Object.entries(fieldNameMap).forEach(([fid, name]) => { fieldNameToId[name] = fid; });

  const metaUpserts: { document_id: string; field_id: string; value: string; updated_at: string }[] = [];
  if (updates.detailLineId !== undefined && fieldNameToId['detailLineId']) {
    metaUpserts.push({
      document_id: id,
      field_id: fieldNameToId['detailLineId'],
      value: updates.detailLineId,
      updated_at: new Date().toISOString(),
    });
  }
  if (updates.billNumber !== undefined && fieldNameToId['billNumber']) {
    metaUpserts.push({
      document_id: id,
      field_id: fieldNameToId['billNumber'],
      value: updates.billNumber,
      updated_at: new Date().toISOString(),
    });
  }
  if (metaUpserts.length > 0) {
    await supabase
      .from('imaging_document_metadata')
      .upsert(metaUpserts, { onConflict: 'document_id,field_id' });
  }
}

export async function deleteDocument(id: string): Promise<void> {
  await supabase
    .from('imaging_documents')
    .update({ epdf_job_id: null })
    .eq('id', id);

  const { data, error } = await supabase
    .from('imaging_documents')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Delete was blocked by permissions. The document was not removed.');
  }
}

export async function findDuplicateDocument(params: {
  bucketId: string;
  documentTypeId: string;
  billNumber: string;
}): Promise<ImagingDocument | null> {
  const bill = (params.billNumber || '').trim();
  console.log('[IMAGING-DUP-LOOKUP] called', { bucketId: params.bucketId, documentTypeId: params.documentTypeId, rawBill: params.billNumber, trimmedBill: bill });
  if (!bill) {
    console.log('[IMAGING-DUP-LOOKUP] bill empty -> returning null (no dup check)');
    return null;
  }

  const { data: physicalMatch, error: physErr } = await supabase
    .from('imaging_documents')
    .select('*, imaging_buckets(name, url), imaging_document_types(name)')
    .eq('bucket_id', params.bucketId)
    .eq('document_type_id', params.documentTypeId)
    .eq('bill_number', bill)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (physErr) {
    console.error('[IMAGING-DUP-LOOKUP] physical column query error', physErr);
    throw physErr;
  }
  console.log('[IMAGING-DUP-LOOKUP] physical column match', { found: !!physicalMatch, id: physicalMatch?.id || null });
  if (physicalMatch) return mapDocument(physicalMatch);

  const fieldNameMap = await getMetadataFieldNameMap();
  const billFieldId = Object.entries(fieldNameMap).find(([, n]) => n === 'billNumber')?.[0];
  console.log('[IMAGING-DUP-LOOKUP] falling back to metadata table', { billFieldId });
  if (!billFieldId) return null;

  const { data: metaHits, error: metaErr } = await supabase
    .from('imaging_document_metadata')
    .select('document_id')
    .eq('field_id', billFieldId)
    .eq('value', bill);
  if (metaErr) {
    console.error('[IMAGING-DUP-LOOKUP] metadata query error', metaErr);
    throw metaErr;
  }
  const ids = (metaHits || []).map((r: any) => r.document_id);
  console.log('[IMAGING-DUP-LOOKUP] metadata match candidate ids', ids);
  if (ids.length === 0) return null;

  const { data: docs, error: docErr } = await supabase
    .from('imaging_documents')
    .select('*, imaging_buckets(name, url), imaging_document_types(name)')
    .in('id', ids)
    .eq('bucket_id', params.bucketId)
    .eq('document_type_id', params.documentTypeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (docErr) {
    console.error('[IMAGING-DUP-LOOKUP] metadata->docs query error', docErr);
    throw docErr;
  }
  console.log('[IMAGING-DUP-LOOKUP] final match via metadata', { found: !!docs, id: docs?.id || null });
  if (!docs) return null;
  return mapDocument(docs);
}

export async function uploadDocument(params: {
  file: File;
  bucketId: string;
  documentTypeId: string;
  billNumber?: string;
  metadata?: { fieldId: string; value: string }[];
  replaceDocumentId?: string;
}): Promise<ImagingDocument> {
  const { data: bucketRow, error: bucketError } = await supabase
    .from('imaging_buckets')
    .select('supabase_storage_slug, url')
    .eq('id', params.bucketId)
    .maybeSingle();
  if (bucketError) throw bucketError;

  let oldStorage: { slug: string | null; path: string | null } | null = null;
  if (params.replaceDocumentId) {
    const { data: existingRow } = await supabase
      .from('imaging_documents')
      .select('storage_path, imaging_buckets(supabase_storage_slug)')
      .eq('id', params.replaceDocumentId)
      .maybeSingle();
    if (existingRow) {
      const eb = (existingRow as any).imaging_buckets;
      oldStorage = {
        slug: eb?.supabase_storage_slug || null,
        path: (existingRow as any).storage_path || null,
      };
    }
  }

  const fileId = crypto.randomUUID();
  const ext = params.file.name.split('.').pop() || 'pdf';
  const filePath = `manual/${fileId}.${ext}`;
  const storageSlug = bucketRow?.supabase_storage_slug;

  let publicUrl: string;

  if (storageSlug) {
    const { error: uploadError } = await supabase.storage
      .from(storageSlug)
      .upload(filePath, params.file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(storageSlug).getPublicUrl(filePath);
    publicUrl = urlData?.publicUrl || filePath;
  } else {
    const legacyPath = `imaging/manual/${fileId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(legacyPath, params.file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(legacyPath);
    publicUrl = urlData?.publicUrl || legacyPath;
  }

  const fieldNameMap = await getMetadataFieldNameMap();
  const fieldNameToId: Record<string, string> = {};
  Object.entries(fieldNameMap).forEach(([id, name]) => { fieldNameToId[name] = id; });

  let detailLineIdValue: string | null = null;
  let billNumberValue: string | null = null;

  console.log('[IMAGING-UPLOAD-SVC] uploadDocument received', {
    fileName: params.file.name,
    fileSize: params.file.size,
    bucketId: params.bucketId,
    documentTypeId: params.documentTypeId,
    replaceDocumentId: params.replaceDocumentId || null,
    billNumberParam: params.billNumber || null,
    metadata: params.metadata,
    fieldNameMapSize: Object.keys(fieldNameMap).length,
  });

  if (params.metadata) {
    for (const m of params.metadata) {
      const fname = fieldNameMap[m.fieldId];
      console.log('[IMAGING-UPLOAD-SVC] metadata entry', { fieldId: m.fieldId, resolvedFieldName: fname, value: m.value });
      if (fname === 'detailLineId') detailLineIdValue = m.value;
      if (fname === 'billNumber') billNumberValue = m.value;
    }
  }
  if (params.billNumber && !billNumberValue) {
    billNumberValue = params.billNumber;
  }
  console.log('[IMAGING-UPLOAD-SVC] resolved values before write', { detailLineIdValue, billNumberValue });

  let data: any;
  if (params.replaceDocumentId) {
    const updateRow: Record<string, any> = {
      bucket_id: params.bucketId,
      document_type_id: params.documentTypeId,
      storage_path: publicUrl,
      original_filename: params.file.name,
      file_size: params.file.size,
      processing_status: 'none',
      epdf_job_id: null,
      epdf_storage_path: null,
      updated_at: new Date().toISOString(),
    };
    if (detailLineIdValue) updateRow.detail_line_id = detailLineIdValue;
    if (billNumberValue) updateRow.bill_number = billNumberValue;

    const upd = await supabase
      .from('imaging_documents')
      .update(updateRow)
      .eq('id', params.replaceDocumentId)
      .select('*, imaging_buckets(name, url), imaging_document_types(name)')
      .maybeSingle();
    if (upd.error) throw upd.error;
    if (!upd.data) {
      throw new Error('Could not replace the existing document. You may not have permission to update it, or it may have been removed.');
    }
    data = upd.data;

    if (oldStorage?.slug && oldStorage.path && oldStorage.path !== publicUrl) {
      let key = oldStorage.path;
      const marker = `/storage/v1/object/public/${oldStorage.slug}/`;
      const idx = key.indexOf(marker);
      if (idx >= 0) key = key.slice(idx + marker.length);
      supabase.storage.from(oldStorage.slug).remove([key]).catch(() => {});
    }
  } else {
    const insertRow: Record<string, any> = {
      bucket_id: params.bucketId,
      document_type_id: params.documentTypeId,
      storage_path: publicUrl,
      original_filename: params.file.name,
      file_size: params.file.size,
    };
    if (detailLineIdValue) insertRow.detail_line_id = detailLineIdValue;
    if (billNumberValue) insertRow.bill_number = billNumberValue;

    console.log('[IMAGING-UPLOAD-SVC] inserting imaging_documents row', insertRow);

    const ins = await supabase
      .from('imaging_documents')
      .insert(insertRow)
      .select('*, imaging_buckets(name, url), imaging_document_types(name)')
      .single();
    if (ins.error) {
      console.error('[IMAGING-UPLOAD-SVC] insert failed', ins.error);
      throw ins.error;
    }
    console.log('[IMAGING-UPLOAD-SVC] inserted row', { id: ins.data?.id, bill_number: ins.data?.bill_number });
    data = ins.data;
  }

  if (params.metadata && params.metadata.length > 0) {
    const metaRows = params.metadata
      .filter(m => m.value.trim())
      .map(m => ({
        document_id: data.id,
        field_id: m.fieldId,
        value: m.value,
        updated_at: new Date().toISOString(),
      }));
    if (metaRows.length > 0) {
      await supabase
        .from('imaging_document_metadata')
        .upsert(metaRows, { onConflict: 'document_id,field_id' });
    }
  } else {
    const legacyMeta: { document_id: string; field_id: string; value: string; updated_at: string }[] = [];
    if (billNumberValue && fieldNameToId['billNumber']) {
      legacyMeta.push({
        document_id: data.id,
        field_id: fieldNameToId['billNumber'],
        value: billNumberValue,
        updated_at: new Date().toISOString(),
      });
    }
    if (legacyMeta.length > 0) {
      await supabase
        .from('imaging_document_metadata')
        .upsert(legacyMeta, { onConflict: 'document_id,field_id' });
    }
  }

  triggerDocumentTypeRules(data.id, 'manual').catch((err) => {
    console.warn('[IMAGING-UPLOAD-SVC] document-type rule runner invocation failed', err);
  });

  return mapDocument(data);
}

export async function triggerDocumentTypeRules(documentId: string, source: 'manual' | 'api' | 'email' | 'sftp'): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;
  try {
    await fetch(`${supabaseUrl}/functions/v1/document-type-rule-runner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ documentId, source }),
    });
  } catch (err) {
    console.warn('[DOC-TYPE-RULES] runner call failed', err);
  }
}

export async function runWorkflowV2ForImagingDocument(workflowId: string, documentId: string): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;

  const { data: doc, error: docErr } = await supabase
    .from('imaging_documents')
    .select('id, bucket_id, document_type_id, original_filename, storage_path, bill_number, detail_line_id, imaging_buckets(name, url, supabase_storage_slug), imaging_document_types(name)')
    .eq('id', documentId)
    .maybeSingle();
  if (docErr || !doc) {
    throw new Error(docErr?.message || 'Imaging document not found');
  }

  const { data: metaRows } = await supabase
    .from('imaging_document_metadata')
    .select('field_id, value, imaging_metadata_fields(field_name)')
    .eq('document_id', documentId);

  const metadataByName: Record<string, string> = {};
  for (const row of (metaRows || []) as any[]) {
    const name = row?.imaging_metadata_fields?.field_name;
    if (name) metadataByName[name] = row.value;
  }

  const bucket = (doc as any).imaging_buckets || {};
  const docType = (doc as any).imaging_document_types || {};

  let storagePath: string | null = (doc as any).storage_path || null;
  if (storagePath && !/^https?:\/\//i.test(storagePath) && bucket.supabase_storage_slug) {
    const { data: publicUrlData } = supabase.storage
      .from(bucket.supabase_storage_slug)
      .getPublicUrl(storagePath);
    storagePath = publicUrlData?.publicUrl || storagePath;
  }

  const payload = {
    workflowId,
    userId: session?.user?.id || null,
    pdfFilename: storagePath,
    originalPdfFilename: (doc as any).original_filename || null,
    extractedData: metadataByName,
    processingMode: 'imaging',
    triggerSource: 'imaging_manual_rerun',
    contextData: {
      imagingDocumentId: documentId,
      bucketId: (doc as any).bucket_id,
      bucketName: bucket.name || null,
      bucketUrl: bucket.url || null,
      documentTypeId: (doc as any).document_type_id,
      documentTypeName: docType.name || null,
      billNumber: (doc as any).bill_number || null,
      detailLineId: (doc as any).detail_line_id || null,
      storagePath,
      source: 'manual',
      metadata: metadataByName,
    },
  };

  const resp = await fetch(`${supabaseUrl}/functions/v1/json-workflow-processor-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let msg = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      msg = body?.details || body?.error || msg;
    } catch {}
    throw new Error(msg);
  }
}

export async function runAutoWorkflowForImagingDocument(documentId: string): Promise<{ matched: number; ran: number }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;

  const resp = await fetch(`${supabaseUrl}/functions/v1/document-type-rule-runner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ documentId, source: 'manual' }),
  });

  if (!resp.ok) {
    let msg = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      msg = body?.error || body?.details || msg;
    } catch {}
    throw new Error(msg);
  }

  const body = await resp.json().catch(() => ({} as any));
  const results = Array.isArray(body?.results) ? body.results : [];
  const matched = Number(body?.ranRules ?? results.length);
  const ran = results.filter((r: any) => r?.ok).length;
  if (matched === 0) {
    throw new Error('No processing rule matches this document type');
  }
  const failed = results.find((r: any) => !r?.ok);
  if (ran === 0 && failed) {
    throw new Error(failed.error || 'Workflow invocation failed');
  }
  return { matched, ran };
}

export async function retryEpdfConversion(documentId: string): Promise<void> {
  const { data: doc, error: docErr } = await supabase
    .from('imaging_documents')
    .select('id, storage_path, imaging_buckets(supabase_storage_slug)')
    .eq('id', documentId)
    .maybeSingle();
  if (docErr || !doc) {
    throw new Error(docErr?.message || 'Imaging document not found');
  }

  const bucket = (doc as any).imaging_buckets || {};
  let fileUrl: string | null = (doc as any).storage_path || null;
  if (!fileUrl) {
    throw new Error('Document has no storage path');
  }
  if (!/^https?:\/\//i.test(fileUrl) && bucket.supabase_storage_slug) {
    const { data: publicUrlData } = supabase.storage
      .from(bucket.supabase_storage_slug)
      .getPublicUrl(fileUrl);
    fileUrl = publicUrlData?.publicUrl || fileUrl;
  }
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
    throw new Error('Could not resolve document URL for CloudConvert');
  }

  await triggerEpdfProcessing(documentId, fileUrl, false);
}

export async function triggerEpdfProcessing(documentId: string, fileUrl: string, skipOcr = false): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;
  const customerId = session?.user?.id;

  console.log('[EPDF-TRIGGER] called', {
    documentId,
    fileUrl,
    skipOcr,
    hasCustomerId: !!customerId,
    hasSession: !!session,
    supabaseUrl,
  });

  if (!customerId) {
    console.warn('[EPDF-TRIGGER] aborting: no customerId (no authenticated session)');
    return;
  }

  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
    console.error('[EPDF-TRIGGER] fileUrl is not an absolute http(s) URL — CloudConvert will reject it', { fileUrl });
  }

  const { error: preErr } = await supabase
    .from('imaging_documents')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId);
  if (preErr) {
    console.error('[EPDF-TRIGGER] failed to set processing_status=processing', preErr);
  }

  const payload = { file_url: fileUrl, customer_id: customerId, imaging_document_id: documentId, skip_ocr: skipOcr };
  console.log('[EPDF-TRIGGER] POST trigger-pdf-processing payload:', payload);

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/trigger-pdf-processing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    console.error('[EPDF-TRIGGER] network error calling trigger-pdf-processing', netErr);
    await supabase
      .from('imaging_documents')
      .update({ processing_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', documentId);
    return;
  }

  const rawBody = await res.text();
  let result: any = null;
  try {
    result = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    result = null;
  }

  console.log('[EPDF-TRIGGER] response', {
    httpStatus: res.status,
    ok: res.ok,
    parsedBody: result,
    rawBody: result ? undefined : rawBody,
  });

  if (!res.ok || !result || result.error) {
    console.error('[EPDF-TRIGGER] trigger-pdf-processing returned failure', {
      httpStatus: res.status,
      error: result?.error,
      details: result?.details,
      rawBody: !result ? rawBody : undefined,
    });
    const { error: updErr } = await supabase
      .from('imaging_documents')
      .update({ processing_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', documentId);
    if (updErr) console.error('[EPDF-TRIGGER] failed to set processing_status=failed', updErr);
    return;
  }

  console.log('[EPDF-TRIGGER] success', { jobId: result.job_id, cloudconvertJobId: result.cloudconvert_job_id });

  if (result.job_id) {
    const { error: jobErr } = await supabase
      .from('imaging_documents')
      .update({ epdf_job_id: result.job_id, updated_at: new Date().toISOString() })
      .eq('id', documentId);
    if (jobErr) console.error('[EPDF-TRIGGER] failed to save epdf_job_id', jobErr);
  }
}

export async function refreshDocumentProcessingStatus(documentIds: string[]): Promise<Record<string, { status: string; epdfStoragePath?: string }>> {
  if (documentIds.length === 0) return {};
  const { data, error } = await supabase
    .from('imaging_documents')
    .select('id, processing_status, epdf_storage_path')
    .in('id', documentIds);
  if (error) return {};
  const result: Record<string, { status: string; epdfStoragePath?: string }> = {};
  (data || []).forEach((row: any) => {
    result[row.id] = { status: row.processing_status, epdfStoragePath: row.epdf_storage_path || undefined };
  });
  return result;
}

function mapBarcodePattern(row: any): ImagingBarcodePattern {
  return {
    id: row.id,
    name: row.name || '',
    patternTemplate: row.pattern_template,
    separator: row.separator || '-',
    fixedDocumentType: row.fixed_document_type || null,
    bucketId: row.bucket_id,
    priority: row.priority || 0,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bucketName: row.imaging_buckets?.name,
  };
}

function mapUnindexedItem(row: any): ImagingUnindexedItem {
  return {
    id: row.id,
    bucketId: row.bucket_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename || '',
    fileSize: row.file_size || 0,
    detectedBarcodes: row.detected_barcodes || [],
    sourceSftpConfigId: row.source_sftp_config_id,
    sourceEmailConfigId: row.source_email_config_id || null,
    sourceType: row.source_type || 'sftp',
    status: row.status,
    detailLineId: row.detail_line_id,
    documentTypeId: row.document_type_id,
    billNumber: row.bill_number,
    indexedBy: row.indexed_by,
    indexedAt: row.indexed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bucketName: row.imaging_buckets?.name,
    bucketUrl: row.imaging_buckets?.url,
    documentTypeName: row.imaging_document_types?.name,
  };
}

export async function fetchBarcodePatterns(): Promise<ImagingBarcodePattern[]> {
  const { data, error } = await supabase
    .from('imaging_barcode_patterns')
    .select('*, imaging_buckets(name)')
    .order('priority')
    .order('name');
  if (error) throw error;
  return (data || []).map(mapBarcodePattern);
}

export async function createBarcodePattern(pattern: {
  name: string;
  patternTemplate: string;
  separator: string;
  fixedDocumentType: string | null;
  bucketId: string;
  priority: number;
}): Promise<ImagingBarcodePattern> {
  const { data, error } = await supabase
    .from('imaging_barcode_patterns')
    .insert({
      name: pattern.name,
      pattern_template: pattern.patternTemplate,
      separator: pattern.separator,
      fixed_document_type: pattern.fixedDocumentType || null,
      bucket_id: pattern.bucketId,
      priority: pattern.priority,
    })
    .select('*, imaging_buckets(name)')
    .single();
  if (error) throw error;
  return mapBarcodePattern(data);
}

export async function updateBarcodePattern(id: string, updates: Partial<{
  name: string;
  patternTemplate: string;
  separator: string;
  fixedDocumentType: string | null;
  bucketId: string;
  priority: number;
  isActive: boolean;
}>): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.patternTemplate !== undefined) dbUpdates.pattern_template = updates.patternTemplate;
  if (updates.separator !== undefined) dbUpdates.separator = updates.separator;
  if (updates.fixedDocumentType !== undefined) dbUpdates.fixed_document_type = updates.fixedDocumentType || null;
  if (updates.bucketId !== undefined) dbUpdates.bucket_id = updates.bucketId;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { error } = await supabase.from('imaging_barcode_patterns').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteBarcodePattern(id: string): Promise<void> {
  const { error } = await supabase.from('imaging_barcode_patterns').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchUnindexedQueue(filters?: {
  bucketId?: string;
  status?: string;
}): Promise<ImagingUnindexedItem[]> {
  let query = supabase
    .from('imaging_unindexed_queue')
    .select('*, imaging_buckets(name, url), imaging_document_types(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters?.bucketId) {
    query = query.eq('bucket_id', filters.bucketId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  } else {
    query = query.eq('status', 'pending');
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapUnindexedItem);
}

export async function indexUnindexedItem(id: string, params: {
  detailLineId?: string;
  documentTypeId: string;
  billNumber?: string;
  bucketId: string;
  storagePath: string;
  originalFilename: string;
  fileSize: number;
  metadata?: { fieldId: string; value: string }[];
}): Promise<void> {
  const fieldNameMap = await getMetadataFieldNameMap();
  const fieldNameToId: Record<string, string> = {};
  Object.entries(fieldNameMap).forEach(([fid, name]) => { fieldNameToId[name] = fid; });

  let detailLineIdValue = params.detailLineId || null;
  let billNumberValue = params.billNumber || null;

  if (params.metadata) {
    for (const m of params.metadata) {
      const fname = fieldNameMap[m.fieldId];
      if (fname === 'detailLineId' && m.value.trim()) detailLineIdValue = m.value;
      if (fname === 'billNumber' && m.value.trim()) billNumberValue = m.value;
    }
  }

  const insertRow: Record<string, any> = {
    bucket_id: params.bucketId,
    document_type_id: params.documentTypeId,
    storage_path: params.storagePath,
    original_filename: params.originalFilename,
    file_size: params.fileSize,
  };
  if (detailLineIdValue) insertRow.detail_line_id = detailLineIdValue;
  if (billNumberValue) insertRow.bill_number = billNumberValue;

  const { data: docData, error: docError } = await supabase
    .from('imaging_documents')
    .insert(insertRow)
    .select('id')
    .single();
  if (docError) throw docError;

  if (params.metadata && params.metadata.length > 0) {
    const metaRows = params.metadata
      .filter(m => m.value.trim())
      .map(m => ({
        document_id: docData.id,
        field_id: m.fieldId,
        value: m.value,
        updated_at: new Date().toISOString(),
      }));
    if (metaRows.length > 0) {
      await supabase
        .from('imaging_document_metadata')
        .upsert(metaRows, { onConflict: 'document_id,field_id' });
    }
  } else {
    const legacyMeta: { document_id: string; field_id: string; value: string; updated_at: string }[] = [];
    if (detailLineIdValue && fieldNameToId['detailLineId']) {
      legacyMeta.push({
        document_id: docData.id,
        field_id: fieldNameToId['detailLineId'],
        value: detailLineIdValue,
        updated_at: new Date().toISOString(),
      });
    }
    if (billNumberValue && fieldNameToId['billNumber']) {
      legacyMeta.push({
        document_id: docData.id,
        field_id: fieldNameToId['billNumber'],
        value: billNumberValue,
        updated_at: new Date().toISOString(),
      });
    }
    if (legacyMeta.length > 0) {
      await supabase
        .from('imaging_document_metadata')
        .upsert(legacyMeta, { onConflict: 'document_id,field_id' });
    }
  }

  const { error: queueError } = await supabase
    .from('imaging_unindexed_queue')
    .update({
      status: 'indexed',
      detail_line_id: detailLineIdValue || null,
      document_type_id: params.documentTypeId,
      bill_number: billNumberValue || null,
      indexed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (queueError) throw queueError;
}

export async function discardUnindexedItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('imaging_unindexed_queue')
    .update({
      status: 'discarded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// --- Batch persistence ---

export interface ImagingBatch {
  id: string;
  originalFilename: string;
  storagePath: string;
  totalPages: number;
  indexedCount: number;
  status: 'in_progress' | 'completed';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImagingBatchPage {
  id: string;
  batchId: string;
  pageNumber: number;
  bucketId: string | null;
  documentTypeId: string | null;
  metadata: Record<string, string>;
  rotation: number;
  indexed: boolean;
  ignored: boolean;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapBatchRow(row: any): ImagingBatch {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    totalPages: row.total_pages,
    indexedCount: row.indexed_count,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatchPageRow(row: any): ImagingBatchPage {
  return {
    id: row.id,
    batchId: row.batch_id,
    pageNumber: row.page_number,
    bucketId: row.bucket_id,
    documentTypeId: row.document_type_id,
    metadata: row.metadata || {},
    rotation: row.rotation || 0,
    indexed: row.indexed || false,
    ignored: row.ignored || false,
    groupId: row.group_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BATCH_STORAGE_BUCKET = 'imaging-batch-uploads';

async function ensureBatchBucket(): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;

  await fetch(`${supabaseUrl}/functions/v1/manage-imaging-bucket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ action: 'create', name: BATCH_STORAGE_BUCKET }),
  });
}

export async function createBatchRecord(file: File, totalPages: number): Promise<ImagingBatch> {
  await ensureBatchBucket();

  const fileId = crypto.randomUUID();
  const filePath = `batches/${fileId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BATCH_STORAGE_BUCKET)
    .upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase
    .from('imaging_batches')
    .insert({
      original_filename: file.name,
      storage_path: filePath,
      total_pages: totalPages,
      created_by: session?.user?.id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapBatchRow(data);
}

export async function fetchInProgressBatches(): Promise<ImagingBatch[]> {
  const { data, error } = await supabase
    .from('imaging_batches')
    .select('*')
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapBatchRow);
}

export async function fetchBatchPages(batchId: string): Promise<ImagingBatchPage[]> {
  const { data, error } = await supabase
    .from('imaging_batch_pages')
    .select('*')
    .eq('batch_id', batchId)
    .order('page_number');
  if (error) throw error;
  return (data || []).map(mapBatchPageRow);
}

export async function saveBatchPageState(batchId: string, pageNumber: number, pageState: {
  bucketId?: string | null;
  documentTypeId?: string | null;
  metadata?: Record<string, string>;
  rotation?: number;
  indexed?: boolean;
  ignored?: boolean;
  groupId?: string | null;
}): Promise<void> {
  const row: Record<string, any> = {
    batch_id: batchId,
    page_number: pageNumber,
    updated_at: new Date().toISOString(),
  };
  if (pageState.bucketId !== undefined) row.bucket_id = pageState.bucketId || null;
  if (pageState.documentTypeId !== undefined) row.document_type_id = pageState.documentTypeId || null;
  if (pageState.metadata !== undefined) row.metadata = pageState.metadata;
  if (pageState.rotation !== undefined) row.rotation = pageState.rotation;
  if (pageState.indexed !== undefined) row.indexed = pageState.indexed;
  if (pageState.ignored !== undefined) row.ignored = pageState.ignored;
  if (pageState.groupId !== undefined) row.group_id = pageState.groupId;

  const { error } = await supabase
    .from('imaging_batch_pages')
    .upsert(row, { onConflict: 'batch_id,page_number' });
  if (error) throw error;
}

export async function updateBatchIndexedCount(batchId: string, indexedCount: number): Promise<void> {
  const { error } = await supabase
    .from('imaging_batches')
    .update({ indexed_count: indexedCount, updated_at: new Date().toISOString() })
    .eq('id', batchId);
  if (error) throw error;
}

export async function completeBatchRecord(batchId: string): Promise<void> {
  const { data: batch } = await supabase
    .from('imaging_batches')
    .select('storage_path, total_pages')
    .eq('id', batchId)
    .maybeSingle();

  const { error } = await supabase
    .from('imaging_batches')
    .update({
      status: 'completed',
      indexed_count: batch?.total_pages || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw error;

  if (batch?.storage_path) {
    await supabase.storage
      .from(BATCH_STORAGE_BUCKET)
      .remove([batch.storage_path]);
  }
}

export async function deleteBatchRecord(batchId: string): Promise<void> {
  const { data: batch } = await supabase
    .from('imaging_batches')
    .select('storage_path')
    .eq('id', batchId)
    .maybeSingle();

  if (batch?.storage_path) {
    await supabase.storage
      .from(BATCH_STORAGE_BUCKET)
      .remove([batch.storage_path]);
  }

  const { error } = await supabase
    .from('imaging_batches')
    .delete()
    .eq('id', batchId);
  if (error) throw error;
}

export async function downloadBatchPdf(storagePath: string): Promise<ArrayBuffer> {
  // Batches created from the email/SFTP intake store a full public storage URL
  // (pointing at the destination imaging bucket), while UI-uploaded batches
  // store a plain object key inside imaging-batch-uploads. Handle both.
  if (/^https?:\/\//i.test(storagePath)) {
    const publicMarker = '/storage/v1/object/public/';
    const signMarker = '/storage/v1/object/sign/';
    const marker =
      storagePath.indexOf(publicMarker) >= 0 ? publicMarker :
      storagePath.indexOf(signMarker) >= 0 ? signMarker :
      null;

    if (marker) {
      const rest = storagePath.slice(storagePath.indexOf(marker) + marker.length);
      const queryIdx = rest.indexOf('?');
      const pathPart = queryIdx >= 0 ? rest.slice(0, queryIdx) : rest;
      const slashIdx = pathPart.indexOf('/');
      if (slashIdx > 0) {
        const slug = pathPart.slice(0, slashIdx);
        const key = decodeURIComponent(pathPart.slice(slashIdx + 1));
        const { data, error } = await supabase.storage.from(slug).download(key);
        if (error) throw error;
        return data.arrayBuffer();
      }
    }

    const resp = await fetch(storagePath);
    if (!resp.ok) {
      throw new Error(`Failed to fetch batch PDF (HTTP ${resp.status})`);
    }
    return resp.arrayBuffer();
  }

  const { data, error } = await supabase.storage
    .from(BATCH_STORAGE_BUCKET)
    .download(storagePath);
  if (error) throw error;
  return data.arrayBuffer();
}

function mapEmailConfig(c: any): ImagingEmailMonitoringConfig {
  return {
    id: c.id,
    configName: c.config_name || '',
    provider: c.provider || 'office365',
    tenantId: c.tenant_id || '',
    clientId: c.client_id || '',
    clientSecret: c.client_secret || '',
    gmailClientId: c.gmail_client_id || '',
    gmailClientSecret: c.gmail_client_secret || '',
    gmailRefreshToken: c.gmail_refresh_token || '',
    monitoredEmail: c.monitored_email || '',
    gmailMonitoredLabel: c.gmail_monitored_label || 'INBOX',
    imagingBucketId: c.imaging_bucket_id || null,
    pollingInterval: c.polling_interval || 5,
    isEnabled: c.is_enabled || false,
    lastCheck: c.last_check,
    checkAllMessages: c.check_all_messages || false,
    forceToUnindexedQueue: c.force_to_unindexed_queue || false,
    postProcessAction: c.post_process_action || 'mark_read',
    processedFolderPath: c.processed_folder_path || 'Processed',
    postProcessActionOnFailure: c.post_process_action_on_failure || 'none',
    failureFolderPath: c.failure_folder_path || 'Failed',
    cronEnabled: c.cron_enabled || false,
    cronJobId: c.cron_job_id,
    cronSchedule: c.cron_schedule,
    lastCronRun: c.last_cron_run,
    nextCronRun: c.next_cron_run,
  };
}

export async function fetchImagingEmailConfigs(): Promise<ImagingEmailMonitoringConfig[]> {
  const { data, error } = await supabase
    .from('imaging_email_monitoring_config')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return (data || []).map(mapEmailConfig);
}

export async function fetchImagingEmailConfig(): Promise<ImagingEmailMonitoringConfig> {
  const configs = await fetchImagingEmailConfigs();
  if (configs.length > 0) return configs[0];
  return {
    configName: '',
    provider: 'office365',
    tenantId: '',
    clientId: '',
    clientSecret: '',
    gmailClientId: '',
    gmailClientSecret: '',
    gmailRefreshToken: '',
    monitoredEmail: '',
    gmailMonitoredLabel: 'INBOX',
    imagingBucketId: null,
    pollingInterval: 5,
    isEnabled: false,
    checkAllMessages: false,
    forceToUnindexedQueue: false,
    postProcessAction: 'mark_read',
    processedFolderPath: 'Processed',
    postProcessActionOnFailure: 'none',
    failureFolderPath: 'Failed',
  };
}

function configToDbData(config: ImagingEmailMonitoringConfig): Record<string, any> {
  return {
    config_name: config.configName,
    provider: config.provider,
    tenant_id: config.tenantId,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    gmail_client_id: config.gmailClientId,
    gmail_client_secret: config.gmailClientSecret,
    gmail_refresh_token: config.gmailRefreshToken,
    monitored_email: config.monitoredEmail,
    gmail_monitored_label: config.gmailMonitoredLabel,
    imaging_bucket_id: config.imagingBucketId || null,
    polling_interval: config.pollingInterval,
    is_enabled: config.isEnabled,
    check_all_messages: config.checkAllMessages,
    force_to_unindexed_queue: config.forceToUnindexedQueue,
    post_process_action: config.postProcessAction,
    processed_folder_path: config.processedFolderPath,
    post_process_action_on_failure: config.postProcessActionOnFailure,
    failure_folder_path: config.failureFolderPath,
    updated_at: new Date().toISOString(),
  };
}

export async function createImagingEmailConfig(config: ImagingEmailMonitoringConfig): Promise<ImagingEmailMonitoringConfig> {
  const { data, error } = await supabase
    .from('imaging_email_monitoring_config')
    .insert([configToDbData(config)])
    .select()
    .single();
  if (error) throw error;
  return mapEmailConfig(data);
}

export async function updateImagingEmailConfig(config: ImagingEmailMonitoringConfig): Promise<void> {
  if (config.id) {
    const { error } = await supabase
      .from('imaging_email_monitoring_config')
      .update(configToDbData(config))
      .eq('id', config.id);
    if (error) throw error;
  } else {
    const created = await createImagingEmailConfig(config);
    config.id = created.id;
  }
}

export async function deleteImagingEmailConfig(id: string): Promise<void> {
  const { error } = await supabase
    .from('imaging_email_monitoring_config')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

function mapMetadataField(row: any): ImagingMetadataField {
  return {
    id: row.id,
    fieldName: row.field_name,
    displayLabel: row.display_label,
    fieldType: row.field_type,
    dropdownOptions: row.dropdown_options || [],
    sortOrder: row.sort_order || 0,
    isPinnedToHeader: row.is_pinned_to_header || false,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchMetadataFields(): Promise<ImagingMetadataField[]> {
  const { data, error } = await supabase
    .from('imaging_metadata_fields')
    .select('*')
    .order('sort_order')
    .order('display_label');
  if (error) throw error;
  return (data || []).map(mapMetadataField);
}

export async function createMetadataField(field: {
  fieldName: string;
  displayLabel: string;
  fieldType: string;
  dropdownOptions?: string[];
  sortOrder?: number;
}): Promise<ImagingMetadataField> {
  const { data, error } = await supabase
    .from('imaging_metadata_fields')
    .insert({
      field_name: field.fieldName,
      display_label: field.displayLabel,
      field_type: field.fieldType,
      dropdown_options: field.dropdownOptions || [],
      sort_order: field.sortOrder || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return mapMetadataField(data);
}

export async function updateMetadataField(id: string, updates: Partial<{
  fieldName: string;
  displayLabel: string;
  fieldType: string;
  dropdownOptions: string[];
  sortOrder: number;
  isPinnedToHeader: boolean;
  isActive: boolean;
}>): Promise<void> {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.fieldName !== undefined) dbUpdates.field_name = updates.fieldName;
  if (updates.displayLabel !== undefined) dbUpdates.display_label = updates.displayLabel;
  if (updates.fieldType !== undefined) dbUpdates.field_type = updates.fieldType;
  if (updates.dropdownOptions !== undefined) dbUpdates.dropdown_options = updates.dropdownOptions;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
  if (updates.isPinnedToHeader !== undefined) dbUpdates.is_pinned_to_header = updates.isPinnedToHeader;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  const { error } = await supabase.from('imaging_metadata_fields').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export async function deleteMetadataField(id: string): Promise<void> {
  const { error } = await supabase.from('imaging_metadata_fields').delete().eq('id', id);
  if (error) throw error;
}

function mapDocTypeMetadataField(row: any): ImagingDocumentTypeMetadataField {
  return {
    id: row.id,
    documentTypeId: row.document_type_id,
    metadataFieldId: row.metadata_field_id,
    isRequired: row.is_required,
    isHiddenFromIndexing: row.is_hidden_from_indexing ?? false,
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
  };
}

export async function fetchDocTypeMetadataFields(documentTypeId: string): Promise<ImagingDocumentTypeMetadataField[]> {
  const { data, error } = await supabase
    .from('imaging_document_type_metadata_fields')
    .select('*')
    .eq('document_type_id', documentTypeId)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map(mapDocTypeMetadataField);
}

export async function saveDocTypeMetadataFields(
  documentTypeId: string,
  assignments: { metadataFieldId: string; isRequired: boolean; isHiddenFromIndexing?: boolean; sortOrder: number }[]
): Promise<void> {
  const { error: delError } = await supabase
    .from('imaging_document_type_metadata_fields')
    .delete()
    .eq('document_type_id', documentTypeId);
  if (delError) throw delError;

  if (assignments.length === 0) return;

  const rows = assignments.map(a => ({
    document_type_id: documentTypeId,
    metadata_field_id: a.metadataFieldId,
    is_required: !!a.isRequired && !a.isHiddenFromIndexing,
    is_hidden_from_indexing: !!a.isHiddenFromIndexing,
    sort_order: a.sortOrder,
  }));
  const { error: insError } = await supabase
    .from('imaging_document_type_metadata_fields')
    .insert(rows);
  if (insError) throw insError;
}

export async function fetchDocumentMetadata(documentId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('imaging_document_metadata')
    .select('field_id, value')
    .eq('document_id', documentId);
  if (error) throw error;
  const result: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    result[row.field_id] = row.value || '';
  });
  return result;
}

export async function fetchBulkDocumentMetadata(documentIds: string[]): Promise<Record<string, Record<string, string>>> {
  if (documentIds.length === 0) return {};
  const { data, error } = await supabase
    .from('imaging_document_metadata')
    .select('document_id, field_id, value')
    .in('document_id', documentIds);
  if (error) throw error;
  const result: Record<string, Record<string, string>> = {};
  (data || []).forEach((row: any) => {
    if (!result[row.document_id]) result[row.document_id] = {};
    result[row.document_id][row.field_id] = row.value || '';
  });
  return result;
}

export async function upsertDocumentMetadata(documentId: string, fieldId: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('imaging_document_metadata')
    .upsert({
      document_id: documentId,
      field_id: fieldId,
      value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'document_id,field_id' });
  if (error) throw error;
}

export async function saveDocumentMetadataBatch(documentId: string, metadata: Record<string, string>): Promise<void> {
  const entries = Object.entries(metadata).filter(([_, v]) => v !== '');
  if (entries.length === 0) return;
  const rows = entries.map(([fieldId, value]) => ({
    document_id: documentId,
    field_id: fieldId,
    value,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('imaging_document_metadata')
    .upsert(rows, { onConflict: 'document_id,field_id' });
  if (error) throw error;
}

export async function searchDocumentsByMetadata(filters: {
  bucketId?: string;
  documentTypeId?: string;
  search?: string;
  metadataFilters?: Record<string, string>;
}): Promise<ImagingDocument[]> {
  if (!filters.metadataFilters || Object.keys(filters.metadataFilters).length === 0) {
    return fetchDocuments(filters);
  }

  const activeFilters = Object.entries(filters.metadataFilters).filter(([_, v]) => v.trim() !== '');
  if (activeFilters.length === 0) {
    return fetchDocuments(filters);
  }

  const { data: fieldRows, error: fieldErr } = await supabase
    .from('imaging_metadata_fields')
    .select('id, field_name')
    .in('id', activeFilters.map(([fid]) => fid));
  if (fieldErr) throw fieldErr;
  const fieldNameById: Record<string, string> = {};
  (fieldRows || []).forEach((r: any) => { fieldNameById[r.id] = r.field_name; });

  const FIELD_NAME_TO_COLUMN: Record<string, string> = {
    detailLineId: 'detail_line_id',
    billNumber: 'bill_number',
  };

  const columnFilters: Array<{ column: string; value: string }> = [];
  const metadataOnlyFilters: Array<[string, string]> = [];
  for (const [fieldId, val] of activeFilters) {
    const col = FIELD_NAME_TO_COLUMN[fieldNameById[fieldId]];
    if (col) columnFilters.push({ column: col, value: val.trim() });
    else metadataOnlyFilters.push([fieldId, val]);
  }

  let matchingDocIds: string[] | null = null;
  if (metadataOnlyFilters.length > 0) {
    const { data: metaRows, error: metaErr } = await supabase
      .from('imaging_document_metadata')
      .select('document_id, field_id, value')
      .in('field_id', metadataOnlyFilters.map(([fid]) => fid));
    if (metaErr) throw metaErr;

    const metaMap: Record<string, Record<string, string>> = {};
    (metaRows || []).forEach((r: any) => {
      if (!metaMap[r.document_id]) metaMap[r.document_id] = {};
      metaMap[r.document_id][r.field_id] = (r.value || '').toLowerCase();
    });

    matchingDocIds = Object.keys(metaMap).filter(docId => {
      const docMeta = metaMap[docId];
      return metadataOnlyFilters.every(([fieldId, searchVal]) => {
        const stored = docMeta[fieldId] || '';
        return stored.includes(searchVal.toLowerCase());
      });
    });

    if (matchingDocIds.length === 0) return [];
  }

  let query = supabase
    .from('imaging_documents')
    .select('*, imaging_buckets(name, url), imaging_document_types(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (matchingDocIds) query = query.in('id', matchingDocIds);
  if (filters.bucketId) query = query.eq('bucket_id', filters.bucketId);
  if (filters.documentTypeId) query = query.eq('document_type_id', filters.documentTypeId);
  for (const cf of columnFilters) {
    query = query.ilike(cf.column, `%${cf.value}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return enrichDocumentsWithMetadata(data || []);
}

function mapEmailRule(row: any): ImagingEmailProcessingRule {
  return {
    id: row.id,
    ruleName: row.rule_name || '',
    matchType: row.match_type || 'subject',
    matchPattern: row.match_pattern || '',
    workflowV2Id: row.workflow_v2_id || undefined,
    imagingBucketId: row.imaging_bucket_id || null,
    emailConfigId: row.email_config_id || undefined,
    isEnabled: row.is_enabled,
    priority: row.priority || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchImagingEmailRules(emailConfigId?: string): Promise<ImagingEmailProcessingRule[]> {
  let query = supabase
    .from('imaging_email_processing_rules')
    .select('*')
    .order('priority');
  if (emailConfigId) {
    query = query.eq('email_config_id', emailConfigId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapEmailRule);
}

export async function saveImagingEmailRules(rules: ImagingEmailProcessingRule[], emailConfigId?: string): Promise<void> {
  if (emailConfigId) {
    const { error: deleteError } = await supabase
      .from('imaging_email_processing_rules')
      .delete()
      .eq('email_config_id', emailConfigId);
    if (deleteError) throw deleteError;
  } else {
    const { error: deleteError } = await supabase
      .from('imaging_email_processing_rules')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) throw deleteError;
  }

  if (rules.length > 0) {
    const { error: insertError } = await supabase
      .from('imaging_email_processing_rules')
      .insert(
        rules.map(rule => ({
          rule_name: rule.ruleName,
          match_type: rule.matchType,
          match_pattern: rule.matchPattern,
          workflow_v2_id: rule.workflowV2Id || null,
          imaging_bucket_id: rule.imagingBucketId || null,
          email_config_id: emailConfigId || rule.emailConfigId || null,
          is_enabled: rule.isEnabled,
          priority: rule.priority,
        }))
      );
    if (insertError) throw insertError;
  }
}

function mapSftpConnection(row: any): ImagingSftpConnection {
  return {
    id: row.id,
    host: row.host || '',
    port: row.port || 22,
    username: row.username || '',
    password: row.password || '',
    isEnabled: row.is_enabled || false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchImagingSftpConnection(): Promise<ImagingSftpConnection | null> {
  const { data, error } = await supabase
    .from('imaging_sftp_connection')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSftpConnection(data) : null;
}

export async function saveImagingSftpConnection(conn: ImagingSftpConnection): Promise<ImagingSftpConnection> {
  const dbData = {
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    is_enabled: conn.isEnabled,
    updated_at: new Date().toISOString(),
  };

  if (conn.id) {
    const { data, error } = await supabase
      .from('imaging_sftp_connection')
      .update(dbData)
      .eq('id', conn.id)
      .select()
      .single();
    if (error) throw error;
    return mapSftpConnection(data);
  }

  const { data, error } = await supabase
    .from('imaging_sftp_connection')
    .insert(dbData)
    .select()
    .single();
  if (error) throw error;
  return mapSftpConnection(data);
}

function mapSftpFolderConfig(row: any): ImagingSftpFolderConfig {
  return {
    id: row.id,
    folderName: row.folder_name || '',
    monitoredPath: row.monitored_path || '/inbox/',
    processedPath: row.processed_path || '/processed/',
    imagingBucketId: row.imaging_bucket_id || null,
    isEnabled: row.is_enabled,
    pollingInterval: row.polling_interval || 5,
    lastPolledAt: row.last_polled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchImagingSftpFolderConfigs(): Promise<ImagingSftpFolderConfig[]> {
  const { data, error } = await supabase
    .from('imaging_sftp_folder_configs')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return (data || []).map(mapSftpFolderConfig);
}

export async function createImagingSftpFolderConfig(config: ImagingSftpFolderConfig): Promise<ImagingSftpFolderConfig> {
  const { data, error } = await supabase
    .from('imaging_sftp_folder_configs')
    .insert({
      folder_name: config.folderName,
      monitored_path: config.monitoredPath,
      processed_path: config.processedPath,
      imaging_bucket_id: config.imagingBucketId || null,
      is_enabled: config.isEnabled,
      polling_interval: config.pollingInterval,
    })
    .select()
    .single();
  if (error) throw error;
  return mapSftpFolderConfig(data);
}

export async function updateImagingSftpFolderConfig(config: ImagingSftpFolderConfig): Promise<void> {
  if (!config.id) return;
  const { error } = await supabase
    .from('imaging_sftp_folder_configs')
    .update({
      folder_name: config.folderName,
      monitored_path: config.monitoredPath,
      processed_path: config.processedPath,
      imaging_bucket_id: config.imagingBucketId || null,
      is_enabled: config.isEnabled,
      polling_interval: config.pollingInterval,
      updated_at: new Date().toISOString(),
    })
    .eq('id', config.id);
  if (error) throw error;
}

export async function deleteImagingSftpFolderConfig(id: string): Promise<void> {
  const { error } = await supabase
    .from('imaging_sftp_folder_configs')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

function mapSftpRule(row: any): ImagingSftpProcessingRule {
  return {
    id: row.id,
    sftpFolderConfigId: row.sftp_folder_config_id || '',
    ruleName: row.rule_name || '',
    matchType: row.match_type || 'filename_pattern',
    matchPattern: row.match_pattern || '',
    workflowV2Id: row.workflow_v2_id || undefined,
    imagingBucketId: row.imaging_bucket_id || null,
    isEnabled: row.is_enabled,
    priority: row.priority || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchImagingSftpRules(folderConfigId?: string): Promise<ImagingSftpProcessingRule[]> {
  let query = supabase
    .from('imaging_sftp_processing_rules')
    .select('*')
    .order('priority');
  if (folderConfigId) {
    query = query.eq('sftp_folder_config_id', folderConfigId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapSftpRule);
}

export async function saveImagingSftpRules(rules: ImagingSftpProcessingRule[], folderConfigId: string): Promise<void> {
  const { error: deleteError } = await supabase
    .from('imaging_sftp_processing_rules')
    .delete()
    .eq('sftp_folder_config_id', folderConfigId);
  if (deleteError) throw deleteError;

  if (rules.length > 0) {
    const { error: insertError } = await supabase
      .from('imaging_sftp_processing_rules')
      .insert(
        rules.map(rule => ({
          sftp_folder_config_id: folderConfigId,
          rule_name: rule.ruleName,
          match_type: rule.matchType,
          match_pattern: rule.matchPattern,
          workflow_v2_id: rule.workflowV2Id || null,
          imaging_bucket_id: rule.imagingBucketId || null,
          is_enabled: rule.isEnabled,
          priority: rule.priority,
        }))
      );
    if (insertError) throw insertError;
  }
}

export async function fetchImagingSftpPollingLogs(): Promise<ImagingSftpPollingLog[]> {
  const { data, error } = await supabase
    .from('imaging_sftp_polling_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((row: any): ImagingSftpPollingLog => ({
    id: row.id,
    folderConfigId: row.folder_config_id,
    timestamp: row.timestamp,
    status: row.status,
    filesFound: row.files_found,
    filesProcessed: row.files_processed,
    errorMessage: row.error_message || undefined,
    executionTimeMs: row.execution_time_ms || undefined,
    createdAt: row.created_at,
  }));
}

function mapDocTypeRule(row: any): ImagingDocumentTypeProcessingRule {
  return {
    id: row.id,
    ruleName: row.rule_name || '',
    documentTypeId: row.document_type_id,
    imagingBucketId: row.imaging_bucket_id || null,
    workflowV2Id: row.workflow_v2_id || undefined,
    triggerSources: Array.isArray(row.trigger_sources) ? row.trigger_sources : ['manual', 'api'],
    isEnabled: !!row.is_enabled,
    priority: row.priority ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchImagingDocumentTypeRules(): Promise<ImagingDocumentTypeProcessingRule[]> {
  const { data, error } = await supabase
    .from('imaging_document_type_processing_rules')
    .select('*')
    .order('priority');
  if (error) throw error;
  return (data || []).map(mapDocTypeRule);
}

export async function saveImagingDocumentTypeRules(rules: ImagingDocumentTypeProcessingRule[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('imaging_document_type_processing_rules')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) throw deleteError;

  if (rules.length > 0) {
    const { error: insertError } = await supabase
      .from('imaging_document_type_processing_rules')
      .insert(
        rules.map(rule => ({
          rule_name: rule.ruleName,
          document_type_id: rule.documentTypeId,
          imaging_bucket_id: rule.imagingBucketId || null,
          workflow_v2_id: rule.workflowV2Id || null,
          trigger_sources: rule.triggerSources && rule.triggerSources.length > 0 ? rule.triggerSources : ['manual', 'api'],
          is_enabled: rule.isEnabled,
          priority: rule.priority,
        })),
      );
    if (insertError) throw insertError;
  }
}
