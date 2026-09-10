export type FunctionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty';

export interface FunctionConditionClause {
  field: string;
  operator: FunctionOperator;
  value: any;
}

export interface FunctionCondition {
  if: FunctionConditionClause;
  additionalConditions?: FunctionConditionClause[];
  then: any;
}

export interface ConditionalFunctionLogic {
  conditions: FunctionCondition[];
  default?: any;
}

export interface DateFunctionLogic {
  type: 'date';
  source: 'field' | 'current_date';
  fieldName?: string;
  operation: 'add' | 'subtract';
  days: number;
  outputFormat?: string;
}

export interface AddressLookupFunctionLogic {
  type: 'address_lookup';
  inputFields: string[];
  lookupType: 'postal_code' | 'city' | 'province' | 'country' | 'full_address';
  countryContext?: string;
  defaultValue?: string;
}

export type DateTimeMergeOutputFormat =
  | 'YYYY-MM-DDTHH:mm:ss'
  | 'YYYY-MM-DD HH:mm:ss'
  | 'YYYY-MM-DDTHH:mm:ssZ'
  | 'MM/DD/YYYY HH:mm:ss'
  | 'MM/DD/YYYY HH:mm'
  | 'DD/MM/YYYY HH:mm:ss'
  | 'DD/MM/YYYY HH:mm';

export interface DateTimeMergeFunctionLogic {
  type: 'datetime_merge';
  dateFieldName: string;
  timeFieldName: string;
  outputFormat: DateTimeMergeOutputFormat;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  emptyTimeDefault?: string;
}

export type FunctionLogic = ConditionalFunctionLogic | DateFunctionLogic | AddressLookupFunctionLogic | DateTimeMergeFunctionLogic;

export function getFieldValue(fieldPath: string, data: Record<string, any>): any {
  if (!fieldPath || !data) return undefined;

  const parts = fieldPath.split('.');
  let value: any = data;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[part];
  }

  return value;
}

function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'YYYY-MM-DDTHH:mm:ss':
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

function isDateFunctionLogic(logic: any): logic is DateFunctionLogic {
  return logic && logic.type === 'date';
}

function isAddressLookupFunctionLogic(logic: any): logic is AddressLookupFunctionLogic {
  return logic && logic.type === 'address_lookup';
}

function isDateTimeMergeFunctionLogic(logic: any): logic is DateTimeMergeFunctionLogic {
  return logic && logic.type === 'datetime_merge';
}

function parseDatePart(value: any, inputFormat?: string): { year: number; month: number; day: number } | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return { year: +isoMatch[1], month: +isoMatch[2], day: +isoMatch[3] };
  const slashMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const a = +slashMatch[1]; const b = +slashMatch[2]; const y = +slashMatch[3];
    if (inputFormat === 'DD/MM/YYYY') return { year: y, month: b, day: a };
    return { year: y, month: a, day: b };
  }
  const ddMmmYyyy = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (ddMmmYyyy) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const mIdx = months.indexOf(ddMmmYyyy[2].toLowerCase());
    if (mIdx >= 0) return { year: +ddMmmYyyy[3], month: mIdx + 1, day: +ddMmmYyyy[1] };
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
  return null;
}

function parseTimePart(value: any): { hours: number; minutes: number; seconds: number } | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    let h = +ampmMatch[1]; const m = +ampmMatch[2]; const s = ampmMatch[3] ? +ampmMatch[3] : 0;
    const isPm = ampmMatch[4].toLowerCase() === 'pm';
    if (h === 12) h = isPm ? 12 : 0; else if (isPm) h += 12;
    return { hours: h, minutes: m, seconds: s };
  }
  const hmsMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hmsMatch) return { hours: +hmsMatch[1], minutes: +hmsMatch[2], seconds: hmsMatch[3] ? +hmsMatch[3] : 0 };
  const compactMatch = str.match(/^(\d{2})(\d{2})(\d{2})?$/);
  if (compactMatch) return { hours: +compactMatch[1], minutes: +compactMatch[2], seconds: compactMatch[3] ? +compactMatch[3] : 0 };
  return null;
}

function formatDateTimeMerge(d: { year: number; month: number; day: number }, t: { hours: number; minutes: number; seconds: number }, format: string): string {
  const YYYY = String(d.year).padStart(4, '0');
  const MM = String(d.month).padStart(2, '0');
  const DD = String(d.day).padStart(2, '0');
  const HH = String(t.hours).padStart(2, '0');
  const mm = String(t.minutes).padStart(2, '0');
  const ss = String(t.seconds).padStart(2, '0');
  switch (format) {
    case 'YYYY-MM-DDTHH:mm:ss': return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}`;
    case 'YYYY-MM-DD HH:mm:ss': return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
    case 'YYYY-MM-DDTHH:mm:ssZ': return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}Z`;
    case 'MM/DD/YYYY HH:mm:ss': return `${MM}/${DD}/${YYYY} ${HH}:${mm}:${ss}`;
    case 'MM/DD/YYYY HH:mm': return `${MM}/${DD}/${YYYY} ${HH}:${mm}`;
    case 'DD/MM/YYYY HH:mm:ss': return `${DD}/${MM}/${YYYY} ${HH}:${mm}:${ss}`;
    case 'DD/MM/YYYY HH:mm': return `${DD}/${MM}/${YYYY} ${HH}:${mm}`;
    default: return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}`;
  }
}

export function evaluateDateTimeMergeFunction(logic: DateTimeMergeFunctionLogic, data: Record<string, any>): string {
  const dateVal = logic.dateFieldName ? getFieldValue(logic.dateFieldName, data) : null;
  const timeVal = logic.timeFieldName ? getFieldValue(logic.timeFieldName, data) : null;
  const dateParts = parseDatePart(dateVal, logic.inputDateFormat);
  if (!dateParts) return '';
  const timeParts =
    parseTimePart(timeVal) ||
    parseTimePart(logic.emptyTimeDefault) ||
    { hours: 0, minutes: 0, seconds: 0 };
  return formatDateTimeMerge(dateParts, timeParts, logic.outputFormat);
}

export function evaluateDateFunction(logic: DateFunctionLogic, data: Record<string, any>): string {
  let baseDate: Date;

  if (logic.source === 'current_date') {
    baseDate = new Date();
  } else {
    const fieldValue = logic.fieldName ? getFieldValue(logic.fieldName, data) : null;
    if (!fieldValue) {
      return '';
    }
    baseDate = new Date(fieldValue);
    if (isNaN(baseDate.getTime())) {
      return '';
    }
  }

  const days = logic.days || 0;
  if (logic.operation === 'subtract') {
    baseDate.setDate(baseDate.getDate() - days);
  } else {
    baseDate.setDate(baseDate.getDate() + days);
  }

  return formatDate(baseDate, logic.outputFormat);
}

export function evaluateCondition(condition: FunctionCondition['if'], data: Record<string, any>): boolean {
  const { field, operator, value: expectedValue } = condition;
  const actualValue = getFieldValue(field, data);

  switch (operator) {
    case 'equals':
      return actualValue === expectedValue;

    case 'not_equals':
      return actualValue !== expectedValue;

    case 'in':
      if (!Array.isArray(expectedValue)) return false;
      return expectedValue.includes(actualValue);

    case 'not_in':
      if (!Array.isArray(expectedValue)) return true;
      return !expectedValue.includes(actualValue);

    case 'greater_than':
      return Number(actualValue) > Number(expectedValue);

    case 'less_than':
      return Number(actualValue) < Number(expectedValue);

    case 'contains':
      if (typeof actualValue !== 'string') return false;
      return actualValue.includes(String(expectedValue));

    case 'starts_with':
      if (typeof actualValue !== 'string') return false;
      return actualValue.startsWith(String(expectedValue));

    case 'ends_with':
      if (typeof actualValue !== 'string') return false;
      return actualValue.endsWith(String(expectedValue));

    case 'is_empty':
      return actualValue === null || actualValue === undefined || actualValue === '' ||
             (Array.isArray(actualValue) && actualValue.length === 0);

    case 'is_not_empty':
      return actualValue !== null && actualValue !== undefined && actualValue !== '' &&
             (!Array.isArray(actualValue) || actualValue.length > 0);

    default:
      return false;
  }
}

export function evaluateFunction(functionLogic: FunctionLogic, data: Record<string, any>): any {
  if (!functionLogic) {
    return undefined;
  }

  if (isDateFunctionLogic(functionLogic)) {
    return evaluateDateFunction(functionLogic, data);
  }

  if (isDateTimeMergeFunctionLogic(functionLogic)) {
    return evaluateDateTimeMergeFunction(functionLogic, data);
  }

  if (isAddressLookupFunctionLogic(functionLogic)) {
    return '';
  }

  const conditionalLogic = functionLogic as ConditionalFunctionLogic;

  if (!conditionalLogic.conditions) {
    return conditionalLogic.default;
  }

  for (const condition of conditionalLogic.conditions) {
    if (!evaluateCondition(condition.if, data)) {
      continue;
    }

    if (condition.additionalConditions?.length) {
      const allAdditionalPass = condition.additionalConditions.every(
        addCond => evaluateCondition(addCond, data)
      );
      if (!allAdditionalPass) {
        continue;
      }
    }

    return condition.then;
  }

  return conditionalLogic.default;
}

export async function evaluateAddressLookupAsync(
  logic: AddressLookupFunctionLogic,
  data: Record<string, any>,
  apiKey: string
): Promise<string> {
  const { inputFields, lookupType, countryContext, defaultValue } = logic;

  const addressParts: string[] = [];
  for (const field of inputFields) {
    const value = getFieldValue(field, data);
    if (value && typeof value === 'string' && value.trim()) {
      addressParts.push(value.trim());
    }
  }

  if (addressParts.length === 0) {
    return defaultValue || '';
  }

  const addressString = addressParts.join(', ');

  const lookupTypeLabels: Record<string, string> = {
    'postal_code': 'postal code or ZIP code',
    'city': 'city name',
    'province': 'province or state (2-letter code)',
    'country': 'country name',
    'full_address': 'complete formatted address'
  };

  const lookupLabel = lookupTypeLabels[lookupType] || lookupType;
  const countryHint = countryContext ? ` The address is in ${countryContext}.` : '';

  const prompt = `You are an address resolution service. Given this address: "${addressString}"${countryHint}

Your task: Return ONLY the ${lookupLabel}. No explanations, no extra text, just the value.

${lookupType === 'postal_code' ? 'For Canadian addresses, format as "A1A 1A1" (with space). For US addresses, use 5-digit format "12345".\n\nA street address with a city and province/state is always sufficient to determine the postal/ZIP code for that area. Provide the correct postal/ZIP code for this location.' : ''}
${lookupType === 'province' ? 'Return only the 2-letter province/state code (e.g., "ON", "BC", "CA", "NY").' : ''}

IMPORTANT: You MUST provide a value. Never respond with "Cannot determine", "Unknown", or any refusal. A city and province/state is sufficient to look up a ${lookupLabel}. Provide your best answer.`;

  const callGemini = async (promptText: string): Promise<string> => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  };

  const isRefusal = (text: string): boolean => {
    if (!text) return true;
    const lower = text.toLowerCase();
    return lower === 'unknown' || /^\[.*\]$/.test(text.trim()) ||
      lower.includes('cannot determine') || lower.includes('unable to determine') ||
      lower.includes('i cannot') || lower.includes("i can't") ||
      lower.includes('not able to') || lower.includes('not enough information') ||
      lower.includes('could not determine') || lower.includes('no valid') ||
      lower.includes('not possible') || lower.includes('insufficient');
  };

  try {
    let text = await callGemini(prompt);

    if (isRefusal(text)) {
      const retryPrompt = `What is the ${lookupLabel} for "${addressString}"${countryHint}? Reply with ONLY the value, nothing else.${lookupType === 'postal_code' ? ' Format: Canadian = "A1A 1A1", US = "12345".' : ''}`;
      text = await callGemini(retryPrompt);
    }

    if (isRefusal(text)) {
      return defaultValue || '';
    }
    return text;
  } catch (error) {
    console.error('Address lookup failed:', error);
    return defaultValue || '';
  }
}
