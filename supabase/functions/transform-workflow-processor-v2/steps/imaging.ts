import { getValueByPath } from "../utils.ts";
import { extractText } from "npm:unpdf";
import { Buffer } from "node:buffer";

async function detectTextLayer(pdfBase64: string): Promise<boolean> {
  try {
    const bytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
    const { text } = await extractText(bytes);
    const rawText = Array.isArray(text) ? text.join("\n") : text;
    const trimmedLength = (rawText || "").trim().length;
    const hasText = trimmedLength > 50;
    console.log(`[IMAGING-TEXT-DETECT] extractedTextLength:${trimmedLength} => hasText:${hasText}`);
    return hasText;
  } catch (e) {
    console.error("[IMAGING-TEXT-DETECT] Failed to detect text layer:", e);
    return false;
  }
}

export async function executeImaging(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<any> {
  console.log("=== EXECUTING IMAGING STEP ===");
  const config = step.config_json || {};
  const mode = config.imagingMode || "put";
  console.log("Imaging mode:", mode);

  const resolveTemplate = (template: string): string => {
    if (!template) return "";
    return template.replace(/\{\{([^}]+)\}\}/g, (_match: string, path: string) => {
      const value = getValueByPath(contextData, path);
      return value !== null && value !== undefined ? String(value) : "";
    });
  };

  const detailLineId = resolveTemplate(config.detailLineId || "");
  const billNumber = resolveTemplate(config.billNumber || "");
  const bucketId = config.bucketId || "";
  const documentTypeId = config.documentTypeId || "";

  if (!bucketId || !documentTypeId) {
    throw new Error(
      `Imaging step missing required fields. bucketId: ${bucketId}, documentTypeId: ${documentTypeId}`
    );
  }

  const payload: any = {
    action: mode,
    bucketId,
    documentTypeId,
  };

  if (detailLineId) payload.detailLineId = detailLineId;

  if (mode === "put") {
    if (billNumber) payload.billNumber = billNumber;
    payload.pdfBase64 = contextData.pdfBase64 || "";

    if (config.filenameTemplate) {
      const resolvedFilename = resolveTemplate(config.filenameTemplate);
      payload.originalFilename = resolvedFilename;
      console.log("Imaging filename resolved from template:", resolvedFilename);
    } else {
      payload.originalFilename =
        contextData.renamedPdfFilename ||
        contextData.pdfFilename ||
        contextData.originalPdfFilename ||
        "";
    }

    payload.storagePath = config.storagePath
      ? resolveTemplate(config.storagePath)
      : undefined;
  }

  console.log("Imaging payload (excluding pdfBase64):", {
    ...payload,
    pdfBase64: payload.pdfBase64 ? `[${payload.pdfBase64.length} chars]` : "none",
  });

  const serviceHeaders = {
    Authorization: `Bearer ${supabaseServiceKey}`,
    "Content-Type": "application/json",
    apikey: supabaseServiceKey,
  };

  const resp = await fetch(`${supabaseUrl}/functions/v1/imaging-proxy`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify(payload),
  });

  const result = await resp.json();

  if (!resp.ok) {
    throw new Error(
      `Imaging ${mode} failed: ${result.error || resp.statusText}`
    );
  }

  console.log("Imaging result:", result);

  if (result.documentUrl) {
    contextData.imagingDocumentUrl = result.documentUrl;
  }
  if (result.documentId) {
    contextData.imagingDocumentId = result.documentId;
  }
  if (result.storagePath) {
    contextData.imagingStoragePath = result.storagePath;
  }

  if (mode === "put" && result.documentId) {
    const metadataMappings: { fieldId: string; value: string }[] =
      config.metadataMappings || [];
    const resolvedMappings = metadataMappings
      .filter((m: any) => m.fieldId && m.value)
      .map((m: any) => ({
        document_id: result.documentId,
        field_id: m.fieldId,
        value: resolveTemplate(m.value),
        updated_at: new Date().toISOString(),
      }));

    if (resolvedMappings.length > 0) {
      console.log("Saving imaging metadata mappings:", resolvedMappings.length);
      const metaResp = await fetch(
        `${supabaseUrl}/rest/v1/imaging_document_metadata`,
        {
          method: "POST",
          headers: {
            ...serviceHeaders,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(resolvedMappings),
        }
      );
      if (!metaResp.ok) {
        const metaErr = await metaResp.text();
        console.error("Failed to save imaging metadata:", metaErr);
      }
    }

    console.log("[IMAGING-EPDF-DEBUG] config.sendToCloudConvert:", config.sendToCloudConvert, "type:", typeof config.sendToCloudConvert);
    console.log("[IMAGING-EPDF-DEBUG] result.documentUrl:", result.documentUrl ? result.documentUrl.substring(0, 80) + "..." : "(falsy)");
    console.log("[IMAGING-EPDF-DEBUG] result.documentId:", result.documentId);
    console.log("[IMAGING-EPDF-DEBUG] contextData.userId:", contextData.userId);
    console.log("[IMAGING-EPDF-DEBUG] full config keys:", Object.keys(config));

    if (config.sendToCloudConvert && result.documentUrl) {
      console.log("[IMAGING-EPDF] ENTERING CloudConvert trigger block for document:", result.documentId);

      await fetch(`${supabaseUrl}/rest/v1/imaging_documents?id=eq.${result.documentId}`, {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ processing_status: "processing" }),
      }).catch((e: any) => console.error("[IMAGING-EPDF] Failed to set processing status:", e));

      const hasTextLayer = contextData.pdfBase64 ? await detectTextLayer(contextData.pdfBase64) : false;
      console.log("[IMAGING-EPDF] Text layer detected:", hasTextLayer, "=> skip_ocr:", hasTextLayer);

      const triggerPayload = {
        file_url: result.documentUrl,
        customer_id: contextData.userId || null,
        imaging_document_id: result.documentId,
        skip_ocr: hasTextLayer,
      };
      console.log("[IMAGING-EPDF] trigger-pdf-processing payload:", JSON.stringify(triggerPayload));
      try {
        const ccResp = await fetch(
          `${supabaseUrl}/functions/v1/trigger-pdf-processing`,
          {
            method: "POST",
            headers: serviceHeaders,
            body: JSON.stringify(triggerPayload),
          }
        );
        const ccResultText = await ccResp.text();
        console.log("[IMAGING-EPDF] trigger-pdf-processing response status:", ccResp.status);
        console.log("[IMAGING-EPDF] trigger-pdf-processing response body:", ccResultText);
        let ccResult: any;
        try { ccResult = JSON.parse(ccResultText); } catch { ccResult = { raw: ccResultText }; }
        if (ccResp.ok && ccResult.success) {
          console.log("CloudConvert processing triggered, job_id:", ccResult.job_id);
          contextData.imagingEpdfJobId = ccResult.job_id;

          await fetch(`${supabaseUrl}/rest/v1/imaging_documents?id=eq.${result.documentId}`, {
            method: "PATCH",
            headers: { ...serviceHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ epdf_job_id: ccResult.job_id }),
          }).catch((e: any) => console.error("[IMAGING-EPDF] Failed to save epdf_job_id:", e));
        } else {
          console.error("[IMAGING-EPDF] CloudConvert trigger failed:", ccResult.error || ccResp.statusText);
          await fetch(`${supabaseUrl}/rest/v1/imaging_documents?id=eq.${result.documentId}`, {
            method: "PATCH",
            headers: { ...serviceHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ processing_status: "failed" }),
          }).catch((e: any) => console.error("[IMAGING-EPDF] Failed to set failed status:", e));
        }
      } catch (ccErr) {
        console.error("[IMAGING-EPDF] CloudConvert trigger exception:", ccErr);
        await fetch(`${supabaseUrl}/rest/v1/imaging_documents?id=eq.${result.documentId}`, {
          method: "PATCH",
          headers: { ...serviceHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ processing_status: "failed" }),
        }).catch((e: any) => console.error("[IMAGING-EPDF] Failed to set failed status:", e));
      }
    } else {
      console.log("[IMAGING-EPDF] SKIPPED CloudConvert trigger. sendToCloudConvert:", config.sendToCloudConvert, "documentUrl truthy:", !!result.documentUrl);
    }
  }

  return result;
}
