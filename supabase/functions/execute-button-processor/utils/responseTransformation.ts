import { getValueByPath, setValueByPath, replaceVariables } from "./objectPaths.ts";

export interface FilterCondition {
  field: string;
  operator: string;
  value: string;
}

export interface ResponseTransformationConfig {
  enabled?: boolean;
  arrayPath?: string;
  filters?: FilterCondition[];
  selectFields?: string[];
  skipIfEmpty?: boolean;
}

export interface TransformationResult {
  data: any;
  skipRemainingLoopSteps: boolean;
}

const US_TZ_OFFSETS: Record<string, string> = {
  EST: '-05:00', EDT: '-04:00',
  CST: '-06:00', CDT: '-05:00',
  MST: '-07:00', MDT: '-06:00',
  PST: '-08:00', PDT: '-07:00',
  UTC: '+00:00', GMT: '+00:00',
};

function isDstUS(d: Date): boolean {
  const y = d.getUTCFullYear();
  const second = (n: number, day: number, m: number) => {
    const dt = new Date(Date.UTC(y, m, 1));
    let count = 0;
    while (dt.getUTCMonth() === m) {
      if (dt.getUTCDay() === day) {
        count++;
        if (count === n) return new Date(dt);
      }
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return null;
  };
  const start = second(2, 0, 2);
  const end = second(1, 0, 10);
  if (!start || !end) return false;
  return d >= start && d < end;
}

function normalizeDateString(input: string): string {
  if (!input) return input;
  const ambiguous: Record<string, [string, string]> = {
    ET: ['EST', 'EDT'],
    CT: ['CST', 'CDT'],
    MT: ['MST', 'MDT'],
    PT: ['PST', 'PDT'],
  };
  let s = input.trim();
  const ambigMatch = s.match(/\s(ET|CT|MT|PT)\b\s*$/i);
  if (ambigMatch) {
    const key = ambigMatch[1].toUpperCase() as keyof typeof ambiguous;
    const probe = s.replace(ambigMatch[0], '').trim();
    const probeDate = new Date(probe);
    if (!isNaN(probeDate.getTime())) {
      const [std, dst] = ambiguous[key];
      const tz = isDstUS(probeDate) ? dst : std;
      s = s.replace(ambigMatch[0], '');
      const off = US_TZ_OFFSETS[tz];
      return `${s}${off}`;
    }
  }
  for (const tz of Object.keys(US_TZ_OFFSETS)) {
    const re = new RegExp(`\\s${tz}\\b\\s*$`, 'i');
    if (re.test(s)) {
      return s.replace(re, US_TZ_OFFSETS[tz]);
    }
  }
  return s;
}

function compareDatesOrNumbers(strValue: string, targetValue: string, operator: string): boolean {
  if (!targetValue) {
    return ['greaterThan', 'greaterThanOrEqual', 'notEquals'].includes(operator);
  }
  const msValue = Date.parse(normalizeDateString(strValue));
  const msTarget = Date.parse(normalizeDateString(targetValue));
  if (!isNaN(msValue) && !isNaN(msTarget)) {
    switch (operator) {
      case 'greaterThan': return msValue > msTarget;
      case 'lessThan': return msValue < msTarget;
      case 'greaterThanOrEqual': return msValue >= msTarget;
      case 'lessThanOrEqual': return msValue <= msTarget;
    }
  }
  const numValue = parseFloat(strValue);
  const numTarget = parseFloat(targetValue);
  if (!isNaN(numValue) && !isNaN(numTarget)) {
    switch (operator) {
      case 'greaterThan': return numValue > numTarget;
      case 'lessThan': return numValue < numTarget;
      case 'greaterThanOrEqual': return numValue >= numTarget;
      case 'lessThanOrEqual': return numValue <= numTarget;
    }
  }
  return false;
}

function evaluateFilterCondition(value: any, operator: string, target: string): boolean {
  const strValue = value !== null && value !== undefined ? String(value) : '';
  switch (operator) {
    case 'equals': return strValue === target;
    case 'notEquals': return strValue !== target;
    case 'contains': return strValue.toLowerCase().includes(target.toLowerCase());
    case 'startsWith': return strValue.toLowerCase().startsWith(target.toLowerCase());
    case 'endsWith': return strValue.toLowerCase().endsWith(target.toLowerCase());
    case 'greaterThan':
    case 'lessThan':
    case 'greaterThanOrEqual':
    case 'lessThanOrEqual':
      return compareDatesOrNumbers(strValue, target, operator);
    case 'isNull': return value === null || value === undefined || value === '';
    case 'isNotNull': return value !== null && value !== undefined && value !== '';
    default: return true;
  }
}

function stripArrayPathPrefix(field: string, arrayPath: string): string {
  if (!arrayPath) return field;
  const prefixes = [`${arrayPath}[].`, `${arrayPath}.`, `${arrayPath}[]`];
  for (const p of prefixes) {
    if (field.startsWith(p)) return field.substring(p.length);
  }
  return field;
}

export function applyResponseTransformation(
  responseData: any,
  config: ResponseTransformationConfig | undefined,
  contextData: any
): TransformationResult {
  if (!config || !config.enabled) {
    return { data: responseData, skipRemainingLoopSteps: false };
  }

  const arrayPath = (config.arrayPath || '').trim();
  let arrayLocationPath = '';
  let targetArray: any[] | null = null;

  if (arrayPath) {
    const bracketIdx = arrayPath.indexOf('[]');
    arrayLocationPath = bracketIdx >= 0
      ? arrayPath.substring(0, bracketIdx).replace(/\.$/, '')
      : arrayPath;
    const located = getValueByPath(responseData, arrayLocationPath);
    if (!Array.isArray(located)) {
      console.log('[RESPONSE_TRANSFORM] arrayPath did not resolve to array; passing response through unchanged');
      return { data: responseData, skipRemainingLoopSteps: false };
    }
    targetArray = located;
  } else if (Array.isArray(responseData)) {
    targetArray = responseData;
  } else {
    console.log('[RESPONSE_TRANSFORM] arrayPath is empty AND response is not a top-level array; passing response through unchanged');
    return { data: responseData, skipRemainingLoopSteps: false };
  }

  if (config.filters && config.filters.length > 0) {
    const resolvedFilters = config.filters.map(f => ({
      field: stripArrayPathPrefix(f.field, arrayLocationPath || arrayPath),
      operator: f.operator,
      value: replaceVariables(f.value || '', contextData),
    }));
    const before = targetArray.length;
    targetArray = targetArray.filter(item => {
      return resolvedFilters.every(f => {
        const fv = getValueByPath(item, f.field);
        return evaluateFilterCondition(fv, f.operator, f.value);
      });
    });
    console.log(`[RESPONSE_TRANSFORM] Filters reduced ${before} -> ${targetArray.length} item(s)`);
  }

  if (config.selectFields && config.selectFields.length > 0) {
    const fields = config.selectFields.map(s => s.trim()).filter(Boolean);
    targetArray = targetArray.map(item => {
      const out: Record<string, any> = {};
      for (const f of fields) {
        if (f.includes('.')) {
          const v = getValueByPath(item, f);
          if (v !== undefined && v !== null) setValueByPath(out, f, v);
        } else if (item && Object.prototype.hasOwnProperty.call(item, f)) {
          out[f] = item[f];
        }
      }
      return out;
    });
  }

  let transformed: any;
  if (arrayLocationPath) {
    const cloned = structuredClone(responseData);
    setValueByPath(cloned, arrayLocationPath, targetArray);
    transformed = cloned;
  } else {
    transformed = targetArray;
  }

  const skipRemainingLoopSteps = !!config.skipIfEmpty && targetArray.length === 0;
  if (skipRemainingLoopSteps) {
    console.log('[RESPONSE_TRANSFORM] skipIfEmpty triggered (array empty after transformation)');
  }
  return { data: transformed, skipRemainingLoopSteps };
}