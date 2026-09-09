import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function writeMetadata(
  supabaseUrl: string,
  dbHeaders: Record<string, string>,
  documentId: string,
  metadataEntries: { fieldId: string; value: string }[]
) {
  for (const entry of metadataEntries) {
    if (!entry.fieldId || entry.value === undefined || entry.value === null) continue;
    await fetch(`${supabaseUrl}/rest/v1/imaging_document_metadata`, {
      method: "POST",
      headers: { ...dbHeaders, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        document_id: documentId,
        field_id: entry.fieldId,
        value: String(entry.value),
      }),
    });
  }
}

async function lookupMetadataFieldId(
  supabaseUrl: string,
  dbHeaders: Record<string, string>,
  fieldName: string
): Promise<string | null> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/imaging_metadata_fields?field_name=eq.${encodeURIComponent(fieldName)}&select=id&limit=1`,
    { headers: dbHeaders }
  );
  const rows = await resp.json();
  return rows?.[0]?.id || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResp({ error: "Supabase configuration missing" }, 500);
    }

    const body = await req.json();
    const {
      action,
      bucketId,
      documentTypeId,
      detailLineId,
      billNumber,
      pdfBase64,
      originalFilename,
      storagePath,
      documentId,
      metadata,
      metadataFilter,
    } = body;

    const dbHeaders = {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      "apikey": supabaseServiceKey,
    };

    if (action === "put") {
      if (!bucketId || !documentTypeId) {
        return jsonResp({ error: "Missing required fields: bucketId, documentTypeId" }, 400);
      }

      const bucketResp = await fetch(
        `${supabaseUrl}/rest/v1/imaging_buckets?id=eq.${bucketId}`,
        { headers: dbHeaders }
      );
      const buckets = await bucketResp.json();
      if (!buckets || buckets.length === 0) {
        return jsonResp({ error: `Bucket not found: ${bucketId}` }, 404);
      }
      const bucket = buckets[0];

      const docTypeResp = await fetch(
        `${supabaseUrl}/rest/v1/imaging_document_types?id=eq.${documentTypeId}`,
        { headers: dbHeaders }
      );
      const docTypes = await docTypeResp.json();
      if (!docTypes || docTypes.length === 0) {
        return jsonResp({ error: `Document type not found: ${documentTypeId}` }, 404);
      }
      const docType = docTypes[0];

      let replaceRow: any = null;
      if (docType.allow_duplicates === false && billNumber && String(billNumber).trim().length > 0) {
        const dupResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_documents?bucket_id=eq.${bucketId}&document_type_id=eq.${documentTypeId}&bill_number=eq.${encodeURIComponent(String(billNumber).trim())}&order=created_at.desc&limit=1`,
          { headers: dbHeaders }
        );
        const dupRows = await dupResp.json();
        const existing = Array.isArray(dupRows) && dupRows.length > 0 ? dupRows[0] : null;
        if (existing) {
          const emailAction = docType.duplicate_email_action || "keep_existing";
          if (emailAction === "keep_existing") {
            const url = existing.storage_path?.startsWith("http")
              ? existing.storage_path
              : `${bucket.url.replace(/\/$/, "")}/${existing.storage_path}`;
            return jsonResp({
              success: true,
              action: "put",
              skipped: true,
              reason: "duplicate_bill_number",
              documentId: existing.id,
              storagePath: existing.storage_path,
              documentUrl: url,
              bucketName: bucket.name,
              documentTypeName: docType.name,
              detailLineId: existing.detail_line_id || null,
              billNumber: existing.bill_number || null,
            });
          }
          replaceRow = existing;
        }
      }

      const fileSize = pdfBase64 ? Math.round((pdfBase64.length * 3) / 4) : 0;
      const pathId = detailLineId || crypto.randomUUID();
      let finalStoragePath = storagePath || `${docType.name}/${pathId}_${Date.now()}.pdf`;
      let documentUrl: string;
      let oldStorageObjectToDelete: { slug: string; key: string } | null = null;

      if (bucket.supabase_storage_slug && pdfBase64) {
        const { createClient } = await import("npm:@supabase/supabase-js@2");
        const supa = createClient(supabaseUrl, supabaseServiceKey);
        const pdfBytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
        const uploadPath = `${docType.name}/${pathId}_${Date.now()}.pdf`;
        const { error: uploadErr } = await supa.storage
          .from(bucket.supabase_storage_slug)
          .upload(uploadPath, pdfBytes, { contentType: "application/pdf", upsert: true });
        if (uploadErr) {
          return jsonResp({ error: "Storage upload failed", details: uploadErr.message }, 500);
        }
        const { data: urlData } = supa.storage
          .from(bucket.supabase_storage_slug)
          .getPublicUrl(uploadPath);
        finalStoragePath = urlData?.publicUrl || uploadPath;
        documentUrl = finalStoragePath;

        if (replaceRow && replaceRow.storage_path) {
          const marker = `/storage/v1/object/public/${bucket.supabase_storage_slug}/`;
          const idx = String(replaceRow.storage_path).indexOf(marker);
          if (idx >= 0) {
            oldStorageObjectToDelete = {
              slug: bucket.supabase_storage_slug,
              key: String(replaceRow.storage_path).slice(idx + marker.length),
            };
          }
        }
      } else {
        documentUrl = `${bucket.url.replace(/\/$/, "")}/${finalStoragePath}`;
      }

      const docRecord: Record<string, unknown> = {
        bucket_id: bucketId,
        document_type_id: documentTypeId,
        storage_path: finalStoragePath,
        original_filename: originalFilename || "",
        file_size: fileSize,
      };
      if (detailLineId) docRecord.detail_line_id = detailLineId;
      if (billNumber) docRecord.bill_number = billNumber;

      let insertedDoc: any;

      if (replaceRow) {
        const updateBody: Record<string, unknown> = {
          storage_path: finalStoragePath,
          original_filename: originalFilename || replaceRow.original_filename || "",
          file_size: fileSize,
          processing_status: "none",
          epdf_job_id: null,
          epdf_storage_path: null,
        };
        if (detailLineId) updateBody.detail_line_id = detailLineId;
        if (billNumber) updateBody.bill_number = billNumber;

        const updResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_documents?id=eq.${replaceRow.id}`,
          {
            method: "PATCH",
            headers: { ...dbHeaders, "Prefer": "return=representation" },
            body: JSON.stringify(updateBody),
          }
        );
        if (!updResp.ok) {
          const errText = await updResp.text();
          return jsonResp({ error: "Failed to update existing imaging document", details: errText }, 500);
        }
        const rows = await updResp.json();
        insertedDoc = Array.isArray(rows) ? rows[0] : rows;

        if (oldStorageObjectToDelete) {
          try {
            const { createClient } = await import("npm:@supabase/supabase-js@2");
            const supa = createClient(supabaseUrl, supabaseServiceKey);
            await supa.storage.from(oldStorageObjectToDelete.slug).remove([oldStorageObjectToDelete.key]);
          } catch (_e) { /* best-effort */ }
        }
      } else {
        const insertResp = await fetch(`${supabaseUrl}/rest/v1/imaging_documents`, {
          method: "POST",
          headers: { ...dbHeaders, "Prefer": "return=representation" },
          body: JSON.stringify(docRecord),
        });

        if (!insertResp.ok) {
          const errText = await insertResp.text();
          return jsonResp({ error: "Failed to create imaging document record", details: errText }, 500);
        }

        const insertedDocs = await insertResp.json();
        insertedDoc = Array.isArray(insertedDocs) ? insertedDocs[0] : insertedDocs;
      }

      const metadataToWrite: { fieldId: string; value: string }[] = [];

      if (detailLineId) {
        const fieldId = await lookupMetadataFieldId(supabaseUrl, dbHeaders, "detailLineId");
        if (fieldId) metadataToWrite.push({ fieldId, value: detailLineId });
      }
      if (billNumber) {
        const fieldId = await lookupMetadataFieldId(supabaseUrl, dbHeaders, "billNumber");
        if (fieldId) metadataToWrite.push({ fieldId, value: billNumber });
      }
      if (Array.isArray(metadata)) {
        for (const m of metadata) {
          if (m.fieldId && m.value !== undefined && m.value !== null) {
            metadataToWrite.push({ fieldId: m.fieldId, value: String(m.value) });
          }
        }
      }

      if (metadataToWrite.length > 0) {
        await writeMetadata(supabaseUrl, dbHeaders, insertedDoc.id, metadataToWrite);
      }

      return jsonResp({
        success: true,
        action: "put",
        replaced: replaceRow ? true : false,
        documentId: insertedDoc.id,
        storagePath: finalStoragePath,
        documentUrl,
        bucketName: bucket.name,
        documentTypeName: docType.name,
        detailLineId: detailLineId || null,
        billNumber: billNumber || null,
      });
    }

    if (action === "get") {
      if (!documentId && (!bucketId || !documentTypeId || !detailLineId)) {
        return jsonResp(
          { error: "Provide either documentId, or bucketId + documentTypeId + detailLineId" },
          400
        );
      }

      let doc: any = null;
      let bucket: any = null;

      if (documentId) {
        const docResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_documents?id=eq.${documentId}&limit=1`,
          { headers: dbHeaders }
        );
        const docs = await docResp.json();
        doc = docs?.[0] || null;

        if (doc) {
          const bucketResp = await fetch(
            `${supabaseUrl}/rest/v1/imaging_buckets?id=eq.${doc.bucket_id}`,
            { headers: dbHeaders }
          );
          const buckets = await bucketResp.json();
          bucket = buckets?.[0] || null;
        }
      } else {
        const bucketResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_buckets?id=eq.${bucketId}`,
          { headers: dbHeaders }
        );
        const buckets = await bucketResp.json();
        if (!buckets || buckets.length === 0) {
          return jsonResp({ error: `Bucket not found: ${bucketId}` }, 404);
        }
        bucket = buckets[0];

        const searchResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_documents?bucket_id=eq.${bucketId}&document_type_id=eq.${documentTypeId}&detail_line_id=eq.${encodeURIComponent(detailLineId)}&order=created_at.desc&limit=1`,
          { headers: dbHeaders }
        );
        const docs = await searchResp.json();
        doc = docs?.[0] || null;
      }

      if (!doc) {
        return jsonResp({
          success: false,
          action: "get",
          error: "Document not found",
          detailLineId: detailLineId || null,
          documentId: documentId || null,
        }, 404);
      }

      const documentUrl = doc.storage_path?.startsWith("http")
        ? doc.storage_path
        : bucket ? `${bucket.url.replace(/\/$/, "")}/${doc.storage_path}` : doc.storage_path;

      return jsonResp({
        success: true,
        action: "get",
        documentId: doc.id,
        storagePath: doc.storage_path,
        documentUrl,
        bucketName: bucket?.name || "",
        detailLineId: doc.detail_line_id,
        billNumber: doc.bill_number,
        originalFilename: doc.original_filename,
      });
    }

    if (action === "list") {
      let queryParts: string[] = [];

      console.log("[imaging-proxy] list action params:", { documentId, detailLineId, billNumber, bucketId, documentTypeId });

      if (documentId) {
        queryParts.push(`id=eq.${documentId}`);
      } else if (detailLineId || billNumber) {
        // billNumber and detailLineId are stored in imaging_document_metadata, not on the document row
        // Look up the metadata field, then find matching document_ids
        let metaFieldName = detailLineId ? 'detailLineId' : 'billNumber';
        let metaValue = String(detailLineId || billNumber).trim();

        const fieldResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_metadata_fields?field_name=eq.${metaFieldName}&select=id&limit=1`,
          { headers: dbHeaders }
        );
        const fields = await fieldResp.json();
        console.log("[imaging-proxy] metadata field lookup for", metaFieldName, ":", fields);

        if (fields && fields.length > 0) {
          const fieldId = fields[0].id;
          const metaResp = await fetch(
            `${supabaseUrl}/rest/v1/imaging_document_metadata?field_id=eq.${fieldId}&value=eq.${encodeURIComponent(metaValue)}&select=document_id`,
            { headers: dbHeaders }
          );
          const metaRows = await metaResp.json();
          const matchedDocIds = (metaRows || []).map((r: any) => r.document_id);
          console.log("[imaging-proxy] metadata lookup matched doc IDs:", matchedDocIds);

          if (matchedDocIds.length === 0) {
            return jsonResp({
              success: false,
              action: "list",
              documents: [],
              detailLineId: detailLineId || null,
            }, 404);
          }
          queryParts.push(`id=in.(${matchedDocIds.join(",")})`);
        } else {
          // Metadata field doesn't exist, fall back to column-based query
          if (detailLineId) {
            queryParts.push(`detail_line_id=eq.${encodeURIComponent(String(detailLineId).trim())}`);
          } else {
            queryParts.push(`bill_number=eq.${encodeURIComponent(String(billNumber).trim())}`);
          }
        }
      }

      if (bucketId) queryParts.push(`bucket_id=eq.${bucketId}`);
      if (documentTypeId) queryParts.push(`document_type_id=eq.${documentTypeId}`);

      queryParts.push("order=created_at.desc", "limit=50");

      let docs: any[] = [];

      if (Array.isArray(metadataFilter) && metadataFilter.length > 0 && !documentId && !detailLineId && !billNumber) {
        const firstFilter = metadataFilter[0];
        const metaResp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_document_metadata?field_id=eq.${firstFilter.fieldId}&value=eq.${encodeURIComponent(firstFilter.value)}&select=document_id`,
          { headers: dbHeaders }
        );
        const metaRows = await metaResp.json();
        const matchedDocIds = (metaRows || []).map((r: any) => r.document_id);

        if (matchedDocIds.length === 0) {
          return jsonResp({
            success: false,
            action: "list",
            documents: [],
            detailLineId: detailLineId || null,
          }, 404);
        }

        for (let i = 1; i < metadataFilter.length; i++) {
          const f = metadataFilter[i];
          const resp = await fetch(
            `${supabaseUrl}/rest/v1/imaging_document_metadata?field_id=eq.${f.fieldId}&value=eq.${encodeURIComponent(f.value)}&document_id=in.(${matchedDocIds.join(",")})&select=document_id`,
            { headers: dbHeaders }
          );
          const rows = await resp.json();
          const narrowedIds = new Set((rows || []).map((r: any) => r.document_id));
          matchedDocIds.length = 0;
          for (const id of narrowedIds) matchedDocIds.push(id);
          if (matchedDocIds.length === 0) break;
        }

        if (matchedDocIds.length === 0) {
          return jsonResp({ success: false, action: "list", documents: [], detailLineId: null }, 404);
        }

        queryParts = [
          `id=in.(${matchedDocIds.join(",")})`,
          ...(bucketId ? [`bucket_id=eq.${bucketId}`] : []),
          ...(documentTypeId ? [`document_type_id=eq.${documentTypeId}`] : []),
          "order=created_at.desc",
          "limit=50",
        ];
      }

      if (!documentId && !detailLineId && !billNumber && (!metadataFilter || metadataFilter.length === 0) && !bucketId && !documentTypeId) {
        return jsonResp({ error: "At least one filter is required: documentId, detailLineId, billNumber, bucketId, documentTypeId, or metadataFilter" }, 400);
      }

      const queryUrl = `${supabaseUrl}/rest/v1/imaging_documents?${queryParts.join("&")}`;
      console.log("[imaging-proxy] list query URL:", queryUrl);

      const docsResp = await fetch(queryUrl, { headers: dbHeaders });
      docs = await docsResp.json();

      console.log("[imaging-proxy] list response status:", docsResp.status, "docs count:", Array.isArray(docs) ? docs.length : 'not-array', "raw:", JSON.stringify(docs).slice(0, 500));

      if (!docs || docs.length === 0) {
        return jsonResp({
          success: false,
          action: "list",
          documents: [],
          detailLineId: detailLineId || null,
        }, 404);
      }

      const bucketIds = [...new Set(docs.map((d: any) => d.bucket_id))];
      const docTypeIds = [...new Set(docs.map((d: any) => d.document_type_id))];

      const [bucketsResp, typesResp] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/imaging_buckets?id=in.(${bucketIds.join(",")})`, { headers: dbHeaders }),
        fetch(`${supabaseUrl}/rest/v1/imaging_document_types?id=in.(${docTypeIds.join(",")})`, { headers: dbHeaders }),
      ]);
      const allBuckets = await bucketsResp.json();
      const allTypes = await typesResp.json();

      const bucketMap = Object.fromEntries((allBuckets || []).map((b: any) => [b.id, b]));
      const typeMap = Object.fromEntries((allTypes || []).map((t: any) => [t.id, t]));

      const documents = docs.map((doc: any) => {
        const bkt = bucketMap[doc.bucket_id];
        const typ = typeMap[doc.document_type_id];
        const url = doc.storage_path?.startsWith("http")
          ? doc.storage_path
          : bkt ? `${bkt.url.replace(/\/$/, "")}/${doc.storage_path}` : "";
        return {
          documentId: doc.id,
          storagePath: doc.storage_path,
          documentUrl: url,
          bucketName: bkt?.name || "",
          documentTypeName: typ?.name || "",
          detailLineId: doc.detail_line_id,
          billNumber: doc.bill_number || "",
          originalFilename: doc.original_filename || "",
          fileSize: doc.file_size || 0,
          createdAt: doc.created_at,
        };
      });

      return jsonResp({
        success: true,
        action: "list",
        detailLineId: detailLineId || null,
        documents,
      });
    }

    return jsonResp({ error: `Unknown action: ${action}. Expected 'put', 'get', or 'list'.` }, 400);
  } catch (error: any) {
    console.error("Imaging proxy error:", error);
    return jsonResp({ error: error.message || "Internal server error" }, 500);
  }
});
