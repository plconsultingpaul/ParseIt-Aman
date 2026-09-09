import { getValueByPath } from "../utils.ts";

interface FieldMapping {
  fieldId?: string;
  column?: string;
  value: string;
  skipIfEmpty?: boolean;
}

const LEGACY_COLUMN_TO_FIELD_NAME: Record<string, string> = {
  detail_line_id: "detailLineId",
  bill_number: "billNumber",
};

const FIELD_NAME_TO_DOCUMENT_COLUMN: Record<string, string> = {
  detailLineId: "detail_line_id",
  billNumber: "bill_number",
};

async function getFieldName(
  supabaseUrl: string,
  supabaseServiceKey: string,
  fieldId: string
): Promise<string | null> {
  const url = `${supabaseUrl}/rest/v1/imaging_metadata_fields?id=eq.${encodeURIComponent(fieldId)}&select=field_name&limit=1`;
  const resp = await fetch(url, {
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0].field_name : null;
}

async function mirrorToDocumentColumn(
  supabaseUrl: string,
  supabaseServiceKey: string,
  imagingDocumentId: string,
  column: string,
  value: string
): Promise<void> {
  const patchUrl = `${supabaseUrl}/rest/v1/imaging_documents?id=eq.${encodeURIComponent(imagingDocumentId)}`;
  const patchResp = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ [column]: value, updated_at: new Date().toISOString() }),
  });
  if (!patchResp.ok) {
    const errText = await patchResp.text();
    throw new Error(`Failed to mirror ${column} on imaging_documents (${patchResp.status}): ${errText}`);
  }
}

async function resolveLegacyFieldId(
  supabaseUrl: string,
  supabaseServiceKey: string,
  fieldName: string
): Promise<string | null> {
  const url = `${supabaseUrl}/rest/v1/imaging_metadata_fields?field_name=eq.${encodeURIComponent(fieldName)}&select=id&limit=1`;
  const resp = await fetch(url, {
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
}

export async function executeUpdateImagingDocument(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<any> {
  console.log("=== EXECUTING UPDATE IMAGING DOCUMENT STEP ===");

  const config = step.config_json || {};
  const rawMappings: FieldMapping[] = Array.isArray(config.fieldMappings)
    ? config.fieldMappings
    : Array.isArray(config.columnMappings)
      ? config.columnMappings
      : [];

  const configuredDocumentTypeId = String(config.documentTypeId || "").trim();
  const matchFieldId = String(config.matchFieldId || "").trim();
  const rawMatchValue = String(config.matchValue ?? "");
  const targetDocumentIds: string[] = [];

  const resolveTemplate = (template: string): string => {
    if (!template) return "";
    return template.replace(/\{\{([^}]+)\}\}/g, (_m: string, path: string) => {
      const value = getValueByPath(contextData, path.trim());
      return value !== null && value !== undefined ? String(value) : "";
    });
  };

  if (matchFieldId) {
    const resolvedMatchValue = resolveTemplate(rawMatchValue).trim();
    if (!resolvedMatchValue) {
      throw new Error(
        "Update Imaging Document step: 'Find record by' value resolved to empty. Provide a static value or a variable that has a value at run time."
      );
    }

    const matchFieldName = await getFieldName(supabaseUrl, supabaseServiceKey, matchFieldId);
    if (!matchFieldName) {
      throw new Error(`Update Imaging Document step: match field ${matchFieldId} not found.`);
    }
    const mirroredColumn = FIELD_NAME_TO_DOCUMENT_COLUMN[matchFieldName];

    const baseFilters: string[] = [];
    if (configuredDocumentTypeId) {
      baseFilters.push(`document_type_id=eq.${encodeURIComponent(configuredDocumentTypeId)}`);
    }

    let lookupUrl: string;
    if (mirroredColumn) {
      lookupUrl = `${supabaseUrl}/rest/v1/imaging_documents?${[
        ...baseFilters,
        `${mirroredColumn}=eq.${encodeURIComponent(resolvedMatchValue)}`,
      ].join("&")}&select=id&order=created_at.desc`;
    } else {
      const metaUrl = `${supabaseUrl}/rest/v1/imaging_document_metadata?field_id=eq.${encodeURIComponent(matchFieldId)}&value=eq.${encodeURIComponent(resolvedMatchValue)}&select=document_id`;
      const metaResp = await fetch(metaUrl, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
      });
      if (!metaResp.ok) {
        const errText = await metaResp.text();
        throw new Error(`Failed to look up imaging metadata for match field (${metaResp.status}): ${errText}`);
      }
      const metaRows = await metaResp.json();
      const docIds = Array.isArray(metaRows) ? metaRows.map((r: any) => r.document_id).filter(Boolean) : [];
      if (docIds.length === 0) {
        throw new Error(
          `Update Imaging Document: no document found where ${matchFieldName}=${resolvedMatchValue}${configuredDocumentTypeId ? ` and documentTypeId=${configuredDocumentTypeId}` : ""}.`
        );
      }
      const inList = docIds.map((id: string) => encodeURIComponent(id)).join(",");
      lookupUrl = `${supabaseUrl}/rest/v1/imaging_documents?${[
        ...baseFilters,
        `id=in.(${inList})`,
      ].join("&")}&select=id&order=created_at.desc`;
    }

    console.log("[UPDATE-IMAGING] Resolving documents by match field:", lookupUrl);
    const lookupResp = await fetch(lookupUrl, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    });
    if (!lookupResp.ok) {
      const errText = await lookupResp.text();
      throw new Error(`Failed to look up imaging documents by match field (${lookupResp.status}): ${errText}`);
    }
    const rows = await lookupResp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(
        `Update Imaging Document: no document found where ${matchFieldName}=${resolvedMatchValue}${configuredDocumentTypeId ? ` and documentTypeId=${configuredDocumentTypeId}` : ""}.`
      );
    }
    for (const row of rows) {
      if (row && row.id) targetDocumentIds.push(String(row.id));
    }
    console.log(`[UPDATE-IMAGING] Resolved ${targetDocumentIds.length} document(s) via match field ${matchFieldName}=${resolvedMatchValue}:`, targetDocumentIds);
  } else if (configuredDocumentTypeId) {
    const contextDetailLineId = contextData?.detailLineId != null ? String(contextData.detailLineId).trim() : "";
    const contextBillNumber = contextData?.billNumber != null ? String(contextData.billNumber).trim() : "";

    if (!contextDetailLineId && !contextBillNumber) {
      throw new Error(
        "Update Imaging Document step is filtered by Document Type but the workflow context has no detailLineId or billNumber to match on."
      );
    }

    const filters: string[] = [
      `document_type_id=eq.${encodeURIComponent(configuredDocumentTypeId)}`,
    ];
    if (contextDetailLineId) {
      filters.push(`detail_line_id=eq.${encodeURIComponent(contextDetailLineId)}`);
    } else {
      filters.push(`bill_number=eq.${encodeURIComponent(contextBillNumber)}`);
    }

    const lookupUrl = `${supabaseUrl}/rest/v1/imaging_documents?${filters.join("&")}&select=id&order=created_at.desc`;
    console.log("[UPDATE-IMAGING] Resolving documents by type filter:", lookupUrl);
    const lookupResp = await fetch(lookupUrl, {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    });
    if (!lookupResp.ok) {
      const errText = await lookupResp.text();
      throw new Error(`Failed to look up imaging documents by type (${lookupResp.status}): ${errText}`);
    }
    const rows = await lookupResp.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(
        `Update Imaging Document: no document found matching documentTypeId=${configuredDocumentTypeId} and ${contextDetailLineId ? `detailLineId=${contextDetailLineId}` : `billNumber=${contextBillNumber}`}.`
      );
    }
    for (const row of rows) {
      if (row && row.id) targetDocumentIds.push(String(row.id));
    }
    console.log(`[UPDATE-IMAGING] Resolved ${targetDocumentIds.length} document(s) via type filter:`, targetDocumentIds);
  } else if (contextData?.imagingDocumentId) {
    targetDocumentIds.push(String(contextData.imagingDocumentId));
  }

  if (targetDocumentIds.length === 0) {
    throw new Error(
      "Update Imaging Document step requires imagingDocumentId in context (or a Document Type filter that resolves one). This step must be invoked from an Imaging workflow triggered by a Document Type Processing Rule, or configured with a Document Type plus a detailLineId/billNumber in context."
    );
  }

  if (rawMappings.length === 0) {
    console.log("No field mappings configured; nothing to update.");
    return { skipped: true, reason: "no field mappings", imagingDocumentIds: targetDocumentIds };
  }

  const skipped: Array<{ fieldId?: string; column?: string; reason: string }> = [];
  const applied: Array<{ imagingDocumentId: string; fieldId: string; value: string }> = [];

  for (const mapping of rawMappings) {
    let fieldId = String(mapping.fieldId || "").trim();

    if (!fieldId && mapping.column) {
      const fieldName = LEGACY_COLUMN_TO_FIELD_NAME[String(mapping.column).trim()];
      if (fieldName) {
        const resolvedId = await resolveLegacyFieldId(supabaseUrl, supabaseServiceKey, fieldName);
        if (resolvedId) fieldId = resolvedId;
      }
    }

    if (!fieldId) {
      skipped.push({ column: mapping.column, reason: "missing field id" });
      continue;
    }

    const resolved = resolveTemplate(String(mapping.value ?? ""));
    const trimmed = resolved.trim();
    const skipIfEmpty = mapping.skipIfEmpty !== false;

    if (trimmed === "" && skipIfEmpty) {
      skipped.push({ fieldId, reason: "resolved value is empty" });
      continue;
    }

    const fieldName = await getFieldName(supabaseUrl, supabaseServiceKey, fieldId);
    const mirrorColumn = fieldName ? FIELD_NAME_TO_DOCUMENT_COLUMN[fieldName] : null;

    for (const docId of targetDocumentIds) {
      const upsertUrl = `${supabaseUrl}/rest/v1/imaging_document_metadata?on_conflict=document_id,field_id`;
      const upsertResp = await fetch(upsertUrl, {
        method: "POST",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          document_id: docId,
          field_id: fieldId,
          value: trimmed,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!upsertResp.ok) {
        const errText = await upsertResp.text();
        throw new Error(`Failed to upsert imaging metadata for document ${docId} (${upsertResp.status}): ${errText}`);
      }

      applied.push({ imagingDocumentId: docId, fieldId, value: trimmed });

      if (mirrorColumn) {
        await mirrorToDocumentColumn(
          supabaseUrl,
          supabaseServiceKey,
          docId,
          mirrorColumn,
          trimmed
        );
        console.log(`Mirrored ${fieldName} to imaging_documents(${docId}).${mirrorColumn} = ${JSON.stringify(trimmed)}`);
      }
    }
  }

  console.log("Imaging document metadata updated:", { imagingDocumentIds: targetDocumentIds, applied, skipped });

  return {
    imagingDocumentIds: targetDocumentIds,
    imagingDocumentId: targetDocumentIds[0],
    updatedFields: applied,
    skippedMappings: skipped,
  };
}
