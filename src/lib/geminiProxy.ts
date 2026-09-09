import { withRetry } from './retryHelper';
import { getAuthHeaders } from './supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export async function callGeminiProxy(
  contents: any[],
  operationName?: string
): Promise<string> {
  const label = operationName || 'Gemini proxy call';

  return withRetry(
    async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/gemini-proxy`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ contents }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Gemini proxy returned ${response.status}`);
      }

      const data = await response.json();
      return data.text;
    },
    label
  );
}
