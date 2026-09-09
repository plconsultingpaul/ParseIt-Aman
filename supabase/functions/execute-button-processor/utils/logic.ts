import { getValueByPath } from "./objectPaths.ts";

export function evaluateFunctionLogic(functionLogic: any, data: any): any {
  if (!functionLogic) return undefined;

  if (functionLogic.type === 'date') {
    let baseDate: Date;
    if (functionLogic.source === 'current_date') {
      baseDate = new Date();
    } else {
      const fieldValue = functionLogic.fieldName ? getValueByPath(data, functionLogic.fieldName) : null;
      if (!fieldValue) return '';
      baseDate = new Date(fieldValue);
      if (isNaN(baseDate.getTime())) return '';
    }
    const days = functionLogic.days || 0;
    if (functionLogic.operation === 'subtract') {
      baseDate.setDate(baseDate.getDate() - days);
    } else {
      baseDate.setDate(baseDate.getDate() + days);
    }
    const y = baseDate.getFullYear();
    const m = String(baseDate.getMonth() + 1).padStart(2, '0');
    const d = String(baseDate.getDate()).padStart(2, '0');
    const fmt = functionLogic.outputFormat || 'YYYY-MM-DD';
    if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
    if (fmt === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
    if (fmt === 'MM-DD-YYYY') return `${m}-${d}-${y}`;
    if (fmt === 'YYYY-MM-DDTHH:mm:ss') {
      const hh = String(baseDate.getHours()).padStart(2, '0');
      const mm = String(baseDate.getMinutes()).padStart(2, '0');
      const ss = String(baseDate.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
    }
    return `${y}-${m}-${d}`;
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
