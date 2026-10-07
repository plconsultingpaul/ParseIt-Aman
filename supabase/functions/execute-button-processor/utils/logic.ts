import { getValueByPath } from "./objectPaths.ts";

function getZonedParts(date: Date, timeZone?: string): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } {
  if (!timeZone || timeZone === 'UTC' && date.getTimezoneOffset() === 0) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds()
    };
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
    let hours = get('hour');
    if (hours === 24) hours = 0;
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hours,
      minutes: get('minute'),
      seconds: get('second')
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hours: date.getHours(),
      minutes: date.getMinutes(),
      seconds: date.getSeconds()
    };
  }
}

function parseWallClock(raw: string): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/);
  if (iso) {
    return {
      year: +iso[1], month: +iso[2], day: +iso[3],
      hours: iso[4] ? +iso[4] : 0,
      minutes: iso[5] ? +iso[5] : 0,
      seconds: iso[6] ? +iso[6] : 0
    };
  }
  const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slash) {
    return {
      year: +slash[3], month: +slash[1], day: +slash[2],
      hours: slash[4] ? +slash[4] : 0,
      minutes: slash[5] ? +slash[5] : 0,
      seconds: slash[6] ? +slash[6] : 0
    };
  }
  const mmm = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (mmm) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const mi = months.indexOf(mmm[2].toLowerCase());
    if (mi >= 0) {
      return {
        year: +mmm[3], month: mi + 1, day: +mmm[1],
        hours: mmm[4] ? +mmm[4] : 0,
        minutes: mmm[5] ? +mmm[5] : 0,
        seconds: mmm[6] ? +mmm[6] : 0
      };
    }
  }
  const timeAmPm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (timeAmPm) {
    let h = +timeAmPm[1]; const m = +timeAmPm[2]; const sec = timeAmPm[3] ? +timeAmPm[3] : 0;
    const pm = timeAmPm[4].toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    return { year: 0, month: 0, day: 0, hours: h, minutes: m, seconds: sec };
  }
  const time24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (time24) {
    return { year: 0, month: 0, day: 0, hours: +time24[1], minutes: +time24[2], seconds: time24[3] ? +time24[3] : 0 };
  }
  return null;
}

function shiftCalendarDays(
  p: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number },
  days: number
): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } {
  if (!days || p.year === 0) return p;
  const utc = new Date(Date.UTC(p.year, p.month - 1, p.day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hours: p.hours,
    minutes: p.minutes,
    seconds: p.seconds
  };
}

export function evaluateFunctionLogic(functionLogic: any, data: any, companyTimezone?: string): any {
  if (!functionLogic) return undefined;

  if (functionLogic.type === 'date') {
    const days = functionLogic.days || 0;
    const fmt = functionLogic.outputFormat || 'YYYY-MM-DD';
    const formatFromParts = (p: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number }) => {
      const y = String(p.year).padStart(4, '0');
      const m = String(p.month).padStart(2, '0');
      const d = String(p.day).padStart(2, '0');
      if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
      if (fmt === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
      if (fmt === 'MM-DD-YYYY') return `${m}-${d}-${y}`;
      if (fmt === 'YYYY-MM-DDTHH:mm:ss') {
        const hh = String(p.hours).padStart(2, '0');
        const mm = String(p.minutes).padStart(2, '0');
        const ss = String(p.seconds).padStart(2, '0');
        return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
      }
      return `${y}-${m}-${d}`;
    };

    if (functionLogic.source === 'current_date') {
      const baseDate = new Date();
      if (functionLogic.operation === 'subtract') baseDate.setUTCDate(baseDate.getUTCDate() - days);
      else if (functionLogic.operation === 'add') baseDate.setUTCDate(baseDate.getUTCDate() + days);
      return formatFromParts(getZonedParts(baseDate, companyTimezone));
    }

    const fieldValue = functionLogic.fieldName ? getValueByPath(data, functionLogic.fieldName) : null;
    if (fieldValue === null || fieldValue === undefined || fieldValue === '') return '';
    const raw = String(fieldValue).trim();
    if (!raw) return '';

    const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);

    if (!hasZone) {
      const parts = parseWallClock(raw);
      if (parts) {
        const shifted = days !== 0
          ? shiftCalendarDays(parts, functionLogic.operation === 'subtract' ? -days : (functionLogic.operation === 'add' ? days : 0))
          : parts;
        return formatFromParts(shifted);
      }
    }

    const baseDate = new Date(raw);
    if (isNaN(baseDate.getTime())) return '';
    if (functionLogic.operation === 'subtract') baseDate.setUTCDate(baseDate.getUTCDate() - days);
    else if (functionLogic.operation === 'add') baseDate.setUTCDate(baseDate.getUTCDate() + days);
    return formatFromParts(getZonedParts(baseDate, companyTimezone));
  }

  if (functionLogic.type === 'datetime_merge') {
    const dateVal = functionLogic.dateFieldName ? getValueByPath(data, functionLogic.dateFieldName) : null;
    const timeVal = functionLogic.timeFieldName ? getValueByPath(data, functionLogic.timeFieldName) : null;

    const parseDate = (v: any, fmt?: string) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] };
      const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (slash) {
        const a = +slash[1], b = +slash[2], y = +slash[3];
        if (fmt === 'DD/MM/YYYY') return { year: y, month: b, day: a };
        return { year: y, month: a, day: b };
      }
      const mmm = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (mmm) {
        const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const mi = months.indexOf(mmm[2].toLowerCase());
        if (mi >= 0) return { year: +mmm[3], month: mi + 1, day: +mmm[1] };
      }
      const p = new Date(s);
      if (!isNaN(p.getTime())) return { year: p.getFullYear(), month: p.getMonth() + 1, day: p.getDate() };
      return null;
    };
    const parseTime = (v: any) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      const ap = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
      if (ap) {
        let h = +ap[1]; const m = +ap[2]; const sec = ap[3] ? +ap[3] : 0;
        const pm = ap[4].toLowerCase() === 'pm';
        if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
        return { hours: h, minutes: m, seconds: sec };
      }
      const hms = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (hms) return { hours: +hms[1], minutes: +hms[2], seconds: hms[3] ? +hms[3] : 0 };
      const cm = s.match(/^(\d{2})(\d{2})(\d{2})?$/);
      if (cm) return { hours: +cm[1], minutes: +cm[2], seconds: cm[3] ? +cm[3] : 0 };
      return null;
    };
    const dp = parseDate(dateVal, functionLogic.inputDateFormat);
    if (!dp) return '';
    const tp = parseTime(timeVal) || parseTime(functionLogic.emptyTimeDefault) || { hours: 0, minutes: 0, seconds: 0 };
    const YYYY = String(dp.year).padStart(4, '0');
    const MM = String(dp.month).padStart(2, '0');
    const DD = String(dp.day).padStart(2, '0');
    const HH = String(tp.hours).padStart(2, '0');
    const mm = String(tp.minutes).padStart(2, '0');
    const ss = String(tp.seconds).padStart(2, '0');
    const fmt = functionLogic.outputFormat || 'YYYY-MM-DDTHH:mm:ss';
    switch (fmt) {
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

  if (functionLogic.type === 'address_lookup') return '';

  const conditions = functionLogic.conditions || [];
  for (const cond of conditions) {
    const clause = cond.if;
    if (!clause) continue;
    const actual = getValueByPath(data, clause.field);
    let match = false;
    switch (clause.operator) {
      case 'equals': match = actual === clause.value; break;
      case 'not_equals': match = actual !== clause.value; break;
      case 'in': match = Array.isArray(clause.value) && clause.value.includes(actual); break;
      case 'not_in': match = !Array.isArray(clause.value) || !clause.value.includes(actual); break;
      case 'greater_than': match = Number(actual) > Number(clause.value); break;
      case 'less_than': match = Number(actual) < Number(clause.value); break;
      case 'contains': match = typeof actual === 'string' && actual.includes(String(clause.value)); break;
      case 'starts_with': match = typeof actual === 'string' && actual.startsWith(String(clause.value)); break;
      case 'ends_with': match = typeof actual === 'string' && actual.endsWith(String(clause.value)); break;
      case 'is_empty': match = actual === null || actual === undefined || actual === ''; break;
      case 'is_not_empty': match = actual !== null && actual !== undefined && actual !== ''; break;
      default: match = false;
    }
    if (!match) continue;
    if (cond.additionalConditions?.length) {
      const allPass = cond.additionalConditions.every((ac: any) => {
        const av = getValueByPath(data, ac.field);
        switch (ac.operator) {
          case 'equals': return av === ac.value;
          case 'not_equals': return av !== ac.value;
          case 'in': return Array.isArray(ac.value) && ac.value.includes(av);
          case 'not_in': return !Array.isArray(ac.value) || !ac.value.includes(av);
          case 'greater_than': return Number(av) > Number(ac.value);
          case 'less_than': return Number(av) < Number(ac.value);
          case 'contains': return typeof av === 'string' && av.includes(String(ac.value));
          case 'starts_with': return typeof av === 'string' && av.startsWith(String(ac.value));
          case 'ends_with': return typeof av === 'string' && av.endsWith(String(ac.value));
          case 'is_empty': return av === null || av === undefined || av === '';
          case 'is_not_empty': return av !== null && av !== undefined && av !== '';
          default: return false;
        }
      });
      if (!allPass) continue;
    }
    return cond.then;
  }
  return functionLogic.default;
}

export function evaluateSingleCondition(
  fieldPath: string,
  operator: string,
  expectedValue: any,
  contextData: any
): { conditionMet: boolean; actualValue: any } {
  const cleanFieldPath = fieldPath.replace(/^\{\{|\}\}$/g, '');

  let resolvedExpectedValue = expectedValue;
  if (typeof expectedValue === 'string' && expectedValue.startsWith('{{') && expectedValue.endsWith('}}')) {
    const expectedPath = expectedValue.replace(/^\{\{|\}\}$/g, '');
    let resolved = getValueByPath(contextData.execute, expectedPath);
    if (resolved === null || resolved === undefined) {
      resolved = getValueByPath(contextData.response, expectedPath);
    }
    if ((resolved === null || resolved === undefined) && contextData.forEach) {
      resolved = contextData.forEach[expectedPath] ?? getValueByPath(contextData.forEach, expectedPath);
    }
    if (resolved === null || resolved === undefined) {
      resolved = getValueByPath(contextData, expectedPath);
    }
    if (resolved !== null && resolved !== undefined) {
      resolvedExpectedValue = typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    }
    console.log(`[CONDITION_DEBUG] Resolved expectedValue variable: "${expectedValue}" => "${resolvedExpectedValue}"`);
  }

  console.log(`[CONDITION_DEBUG] Raw fieldPath: "${fieldPath}" => cleaned: "${cleanFieldPath}"`);
  console.log(`[CONDITION_DEBUG] Operator: "${operator}", Expected: "${resolvedExpectedValue}"`);
  console.log(`[CONDITION_DEBUG] contextData.execute keys:`, contextData.execute ? Object.keys(contextData.execute) : 'N/A');
  console.log(`[CONDITION_DEBUG] contextData.response keys:`, contextData.response ? Object.keys(contextData.response) : 'N/A');
  console.log(`[CONDITION_DEBUG] contextData top-level keys:`, Object.keys(contextData));

  let actualValue = getValueByPath(contextData.execute, cleanFieldPath);
  console.log(`[CONDITION_DEBUG] Lookup in execute["${cleanFieldPath}"]:`, actualValue);
  if (actualValue === null || actualValue === undefined) {
    actualValue = getValueByPath(contextData.response, cleanFieldPath);
    console.log(`[CONDITION_DEBUG] Lookup in response["${cleanFieldPath}"]:`, actualValue);
  }
  if (actualValue === null || actualValue === undefined) {
    if (contextData.forEach) {
      actualValue = contextData.forEach[cleanFieldPath] ?? getValueByPath(contextData.forEach, cleanFieldPath);
      console.log(`[CONDITION_DEBUG] Lookup in forEach["${cleanFieldPath}"]:`, actualValue);
    }
  }
  if (actualValue === null || actualValue === undefined) {
    actualValue = getValueByPath(contextData, cleanFieldPath);
    console.log(`[CONDITION_DEBUG] Lookup in contextData["${cleanFieldPath}"]:`, actualValue);
  }

  console.log(`[CONDITION_DEBUG] FINAL actualValue:`, actualValue, `(type: ${typeof actualValue})`);

  let conditionMet = false;

  switch (operator) {
    case 'exists':
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
      break;
    case 'not_exists':
    case 'notExists':
      conditionMet = actualValue === null || actualValue === undefined || actualValue === '';
      break;
    case 'is_null':
    case 'isNull':
      conditionMet = actualValue === null || actualValue === undefined || actualValue === '';
      break;
    case 'is_not_null':
    case 'isNotNull':
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
      break;
    case 'equals':
    case 'eq':
      conditionMet = String(actualValue).toLowerCase() === String(resolvedExpectedValue).toLowerCase();
      break;
    case 'not_equals':
    case 'notEquals':
    case 'ne':
      conditionMet = String(actualValue).toLowerCase() !== String(resolvedExpectedValue).toLowerCase();
      break;
    case 'contains':
      conditionMet = String(actualValue).toLowerCase().includes(String(resolvedExpectedValue).toLowerCase());
      break;
    case 'not_contains':
    case 'notContains':
      conditionMet = !String(actualValue).toLowerCase().includes(String(resolvedExpectedValue).toLowerCase());
      break;
    case 'greater_than':
    case 'gt':
      conditionMet = parseFloat(actualValue) > parseFloat(resolvedExpectedValue);
      break;
    case 'less_than':
    case 'lt':
      conditionMet = parseFloat(actualValue) < parseFloat(resolvedExpectedValue);
      break;
    default:
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
  }

  console.log(`[CONDITION_DEBUG] RESULT: conditionMet=${conditionMet} (operator="${operator}", actual="${actualValue}", expected="${resolvedExpectedValue}")`);

  return { conditionMet, actualValue };
}
