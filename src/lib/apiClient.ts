import type { ApiError, ExtractionType } from '../types';
import { getAuthHeaders } from './supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export async function sendToApi(
  jsonData: string,
  currentExtractionType: ExtractionType
): Promise<any> {
  if (!currentExtractionType?.jsonPath) {
    throw new Error('API configuration incomplete');
  }

  const headers = await getAuthHeaders();
  const response = await fetch(
    `${supabaseUrl}/functions/v1/api-proxy`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        apiPath: currentExtractionType.jsonPath,
        httpMethod: 'POST',
        body: jsonData,
      }),
    }
  );

  if (!response.ok) {
    let details: any;
    const contentType = response.headers.get('content-type');

    try {
      if (contentType && contentType.includes('application/json')) {
        details = await response.json();
      } else {
        details = await response.text();
      }
    } catch {
      details = 'Unable to parse response body';
    }

    const errorBody = typeof details === 'object' ? details : {};

    const apiError: ApiError = {
      statusCode: errorBody.statusCode || response.status,
      statusText: errorBody.statusText || response.statusText,
      details: errorBody.details || details,
      url: errorBody.url || currentExtractionType.jsonPath,
      headers: Object.fromEntries(response.headers.entries())
    };

    throw apiError;
  }

  const responseData = await response.json();
  return responseData;
}