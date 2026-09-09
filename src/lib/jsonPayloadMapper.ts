import type { OrderEntryField, OrderEntryFieldGroup } from '../types';

interface FormData {
  [key: string]: any;
}

export function buildJsonPayload(
  formData: FormData,
  fields: OrderEntryField[],
  fieldGroups: any[] = []
): Record<string, any> {
  console.log('[JsonPayloadMapper] Building payload...');
  console.log('[JsonPayloadMapper] Form data keys:', Object.keys(formData));
  console.log('[JsonPayloadMapper] Fields count:', fields.length);
  console.log('[JsonPayloadMapper] Field groups count:', fieldGroups.length);

  const payload: Record<string, any> = {};

  const arrayGroupMap = new Map<string, any>();
  fieldGroups.forEach((group: any) => {
    if (group.is_array_group) {
      arrayGroupMap.set(group.id, {
        arrayJsonPath: group.array_json_path,
        fields: fields.filter(f => f.fieldGroupId === group.id)
      });
    }
  });

  arrayGroupMap.forEach((groupInfo, groupId) => {
    const arrayData = formData[groupId];
    if (Array.isArray(arrayData) && arrayData.length > 0) {
      const arrayPath = groupInfo.arrayJsonPath;
      const arrayOfObjects: any[] = [];

      arrayData.forEach((row: Record<string, any>) => {
        const rowObject: Record<string, any> = {};
        groupInfo.fields.forEach((field: OrderEntryField) => {
          // Handle count child array records
          if (field.countChildArrayRecords && field.countChildArrayGroupId) {
            const childKey = `_child_${field.countChildArrayGroupId}`;
            const childData = row[childKey];
            const count = Array.isArray(childData) ? childData.length : 0;
            const fieldPath = field.jsonPath || field.fieldName;
            const fieldKey = fieldPath.split('.').pop() || field.fieldName;
            rowObject[fieldKey] = count;
            return;
          }
          const value = row[field.fieldName];
          if (value !== undefined && value !== null && value !== '') {
            const fieldPath = field.jsonPath || field.fieldName;
            const fieldKey = fieldPath.split('.').pop() || field.fieldName;
            rowObject[fieldKey] = coerceFieldValue(value, field.fieldType);
          }
        });
        if (Object.keys(rowObject).length > 0) {
          arrayOfObjects.push(rowObject);
        }
      });

      if (arrayOfObjects.length > 0) {
        setNestedValue(payload, arrayPath, arrayOfObjects);
      }
    }
  });

  fields.forEach((field) => {
    const group = fieldGroups.find((g: any) => g.id === field.fieldGroupId);
    if (group?.is_array_group) {
      return;
    }

    const value = formData[field.fieldName];
    const jsonPath = field.jsonPath || field.fieldName;

    if (value === undefined || value === null) {
      return;
    }

    if (value === '' && !field.isRequired) {
      return;
    }

    setNestedValue(payload, jsonPath, coerceFieldValue(value, field.fieldType));
  });

  console.log('[JsonPayloadMapper] Final payload keys:', Object.keys(payload));
  return payload;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!current[key]) {
      current[key] = {};
    } else if (typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {};
    }

    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

function coerceFieldValue(value: any, fieldType: string): any {
  if (fieldType === 'number' || fieldType === 'decimal') {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }
  return value;
}

export function buildAuthHeaders(
  authType: string | null,
  authToken: string | null,
  customHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (authType && authToken) {
    switch (authType.toLowerCase()) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${authToken}`;
        break;
      case 'basic':
        headers['Authorization'] = `Basic ${authToken}`;
        break;
      case 'apikey':
        const [keyName, keyValue] = authToken.split(':');
        if (keyName && keyValue) {
          headers[keyName.trim()] = keyValue.trim();
        }
        break;
    }
  }

  return headers;
}

export async function submitWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  timeoutMs: number = 30000
): Promise<Response> {
  let lastError: Error | null = null;

  console.log('[SubmitWithRetry] Starting request to:', url);
  console.log('[SubmitWithRetry] Method:', options.method);
  console.log('[SubmitWithRetry] Max retries:', maxRetries);
  console.log('[SubmitWithRetry] Timeout:', timeoutMs, 'ms');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log('[SubmitWithRetry] Attempt', attempt + 1, 'of', maxRetries);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('[SubmitWithRetry] Response received:', response.status, response.statusText);

      if (response.status >= 500 && attempt < maxRetries - 1) {
        console.log('[SubmitWithRetry] Server error, retrying...');
        await delay(Math.pow(2, attempt) * 1000);
        continue;
      }

      return response;
    } catch (error: any) {
      console.error('[SubmitWithRetry] Request failed:', error.message);
      lastError = error;

      if (error.name === 'AbortError') {
        console.error('[SubmitWithRetry] Request timed out after', timeoutMs, 'ms');
        throw new Error('Request timed out. Please check your connection and try again.');
      }

      if (attempt < maxRetries - 1 && isRetriableError(error)) {
        console.log('[SubmitWithRetry] Retriable error, retrying...');
        await delay(Math.pow(2, attempt) * 1000);
        continue;
      }

      break;
    }
  }

  console.error('[SubmitWithRetry] All retries exhausted');
  throw lastError || new Error('Request failed after multiple attempts');
}

function isRetriableError(error: any): boolean {
  const retriableErrors = [
    'Failed to fetch',
    'Network request failed',
    'NetworkError',
    'ECONNREFUSED',
    'ETIMEDOUT'
  ];

  return retriableErrors.some(err =>
    error.message?.includes(err) || error.toString().includes(err)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getErrorMessage(statusCode: number, errorMessage?: string): string {
  const statusMessages: Record<number, string> = {
    400: 'Invalid data submitted. Please check your entries and try again.',
    401: 'Authentication failed. Please contact support.',
    403: 'Access denied. You do not have permission to perform this action.',
    404: 'API endpoint not found. This is a configuration error - please contact support.',
    409: 'Conflict detected. This order may already exist.',
    422: 'Validation failed. Please check your entries.',
    429: 'Too many requests. Please wait a moment and try again.',
    500: 'Server error occurred. Please try again in a few moments.',
    502: 'Service temporarily unavailable. Please try again.',
    503: 'Service is under maintenance. Please try again later.',
    504: 'Request timed out. Please try again.'
  };

  const baseMessage = statusMessages[statusCode] || 'An unexpected error occurred.';

  if (errorMessage) {
    return `${baseMessage}\n\nDetails: ${errorMessage}`;
  }

  return baseMessage;
}

export function parseApiResponse(response: Response, body: any): {
  success: boolean;
  data: any;
  message?: string;
} {
  const isSuccess = response.ok;

  if (isSuccess) {
    return {
      success: true,
      data: body,
      message: body?.message || 'Order submitted successfully'
    };
  }

  return {
    success: false,
    data: body,
    message: body?.error || body?.message || getErrorMessage(response.status)
  };
}
