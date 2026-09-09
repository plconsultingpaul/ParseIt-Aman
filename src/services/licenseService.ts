import { supabase } from '../lib/supabase';
import type { ParseItLicense } from '../types';

export async function fetchActiveLicense(): Promise<ParseItLicense | null> {
  try {
    const { data, error } = await supabase
      .from('parse_it_license')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      customerName: data.customer_name,
      issuedAt: data.issued_at,
      expiryDate: data.expiry_date,
      extract: data.extractions,
      transform: data.transformations,
      execute: data.execute_flows,
      clientSetup: data.client_portal,
      vendorSetup: data.vendor_portal,
      imaging: data.imaging,
      rawPayload: data.raw_payload,
      uploadedAt: data.uploaded_at,
    };
  } catch (error) {
    console.error('Error fetching active license:', error);
    return null;
  }
}

export async function validateAndStoreLicense(
  licenseFileContent: string
): Promise<{ success: boolean; license?: ParseItLicense; error?: string }> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-license`;
    console.log('[License] Calling validate-license edge function at:', apiUrl);
    console.log('[License] License file content length:', licenseFileContent.trim().length);
    console.log('[License] License file first 50 chars:', licenseFileContent.trim().substring(0, 50));

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.error('[License] No active session found');
      return { success: false, error: 'You must be logged in to upload a license.' };
    }
    console.log('[License] Session found, making request...');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ licenseData: licenseFileContent.trim() }),
    });

    console.log('[License] Edge function response status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('[License] Edge function raw response:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('[License] Failed to parse edge function response as JSON:', parseErr);
      return { success: false, error: `Edge function returned non-JSON response (HTTP ${response.status}): ${responseText.substring(0, 200)}` };
    }

    console.log('[License] Parsed edge function result:', JSON.stringify(result, null, 2));

    if (!result.valid) {
      console.error('[License] Validation failed:', result.error);
      return { success: false, error: result.error || 'Invalid license file.' };
    }

    const payload = result.payload;
    console.log('[License] License payload keys:', Object.keys(payload));
    console.log('[License] License payload:', JSON.stringify(payload, null, 2));

    console.log('[License] Inserting license into database...');
    const { data: insertedData, error: insertError } = await supabase
      .from('parse_it_license')
      .insert({
        customer_name: payload.customerName || 'Unknown',
        issued_at: payload.issuedAt || new Date().toISOString(),
        expiry_date: payload.expiryDate || null,
        extractions: payload.extract ?? payload.extractions ?? payload['Extract'] ?? false,
        transformations: payload.transform ?? payload.transformations ?? payload['Transform'] ?? false,
        execute_flows: payload.execute ?? payload.executeFlows ?? payload['Execute'] ?? false,
        client_portal: payload.clientSetup ?? payload.clientPortal ?? payload['Client Setup'] ?? false,
        vendor_portal: payload.vendorSetup ?? payload.vendorPortal ?? payload['Vendor Setup'] ?? false,
        imaging: payload.imaging ?? payload['Imaging'] ?? false,
        raw_payload: payload,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[License] Database insert error:', JSON.stringify(insertError, null, 2));
      throw insertError;
    }

    console.log('[License] License stored successfully, id:', insertedData.id);

    const license: ParseItLicense = {
      id: insertedData.id,
      customerName: insertedData.customer_name,
      issuedAt: insertedData.issued_at,
      expiryDate: insertedData.expiry_date,
      extract: insertedData.extractions,
      transform: insertedData.transformations,
      execute: insertedData.execute_flows,
      clientSetup: insertedData.client_portal,
      vendorSetup: insertedData.vendor_portal,
      imaging: insertedData.imaging,
      rawPayload: insertedData.raw_payload,
      uploadedAt: insertedData.uploaded_at,
    };

    return { success: true, license };
  } catch (error) {
    console.error('[License] Error validating/storing license:', error);
    console.error('[License] Error type:', typeof error);
    console.error('[License] Error constructor:', error?.constructor?.name);
    if (error && typeof error === 'object') {
      console.error('[License] Error details:', JSON.stringify(error, null, 2));
    }
    const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) : 'Unknown error occurred');
    return { success: false, error: `Failed to process license: ${message}` };
  }
}
