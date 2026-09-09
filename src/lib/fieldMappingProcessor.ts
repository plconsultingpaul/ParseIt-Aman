import type { FieldMapping } from '../types';

function truncateJsonEscaped(str: string, maxLength: number): string {
  if (!str || maxLength <= 0) {
    return '';
  }

  const getJsonEscapedLength = (s: string): number => {
    return JSON.stringify(s).length - 2;
  };

  if (getJsonEscapedLength(str) <= maxLength) {
    return str;
  }

  let left = 0;
  let right = str.length;
  let result = '';

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const prefix = str.substring(0, mid);
    const escapedLength = getJsonEscapedLength(prefix);

    if (escapedLength <= maxLength) {
      result = prefix;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    const tenDigits = digits.slice(1);
    return `${tenDigits.slice(0, 3)}-${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
  }

  return "";
}

function normalizeBooleanValue(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'False';
  }

  const strValue = String(value).trim().toLowerCase();

  if (strValue === 'true' || strValue === 'yes' || strValue === '1') {
    return 'True';
  }

  if (strValue === 'false' || strValue === 'no' || strValue === '0') {
    return 'False';
  }

  return 'False';
}

function getFieldValue(obj: any, fieldPath: string): any {
  const parts = fieldPath.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function setFieldValue(obj: any, fieldPath: string, value: any): void {
  const parts = fieldPath.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
}

function deleteFieldValue(obj: any, fieldPath: string): void {
  const parts = fieldPath.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) {
      return;
    }
    current = current[parts[i]];
  }

  delete current[parts[parts.length - 1]];
}

function isFieldPathReference(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('(') || value.includes(',')) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(value);
}

function isArrayPath(obj: any, fieldPath: string): { isArray: boolean; arrayKey: string; fieldKey: string } {
  const parts = fieldPath.split('.');
  if (parts.length < 2) return { isArray: false, arrayKey: '', fieldKey: '' };

  const firstPart = parts[0];
  if (obj[firstPart] && Array.isArray(obj[firstPart])) {
    return { isArray: true, arrayKey: firstPart, fieldKey: parts.slice(1).join('.') };
  }
  return { isArray: false, arrayKey: '', fieldKey: '' };
}

function processArrayRemoveIfNull(order: any, mapping: FieldMapping): void {
  const { isArray, arrayKey, fieldKey } = isArrayPath(order, mapping.fieldName);
  if (!isArray || !fieldKey) return;

  const arr = order[arrayKey];
  if (!Array.isArray(arr)) return;

  for (const item of arr) {
    const value = getFieldValue(item, fieldKey);
    if (value === null || value === undefined || value === '' || value === 'null') {
      deleteFieldValue(item, fieldKey);
      console.log(`[FieldMappingProcessor] Removed ${mapping.fieldName} from array item due to removeIfNull`);
    }
  }
}

function cleanupEmptyArrayItems(order: any): void {
  for (const key of Object.keys(order)) {
    if (Array.isArray(order[key])) {
      order[key] = order[key].filter((item: any) => {
        if (typeof item !== 'object' || item === null) return true;
        return Object.keys(item).length > 0;
      });

      if (order[key].length === 0) {
        delete order[key];
        console.log(`[FieldMappingProcessor] Removed empty array: ${key}`);
      }
    }
  }
}

export function applyFieldMappingPostProcessing(
  data: { orders: any[] },
  fieldMappings: FieldMapping[]
): { orders: any[] } {
  if (!data?.orders || !Array.isArray(data.orders) || fieldMappings.length === 0) {
    return data;
  }

  console.log('[FieldMappingProcessor] Starting post-processing with', fieldMappings.length, 'mappings');

  for (const order of data.orders) {
    for (const mapping of fieldMappings) {
      const fieldPath = mapping.fieldName;
      let value = getFieldValue(order, fieldPath);

      if ((mapping.type === 'mapped' || mapping.type === 'ai' || mapping.type === 'variable') && mapping.value && isFieldPathReference(mapping.value)) {
        const sourceValue = getFieldValue(order, mapping.value);
        if (sourceValue !== undefined) {
          console.log(`[FieldMappingProcessor] Resolving field reference: ${fieldPath} <- ${mapping.value} = "${sourceValue}"`);
          value = sourceValue;
          setFieldValue(order, fieldPath, value);
        } else {
          console.log(`[FieldMappingProcessor] Field reference source not found: ${mapping.value}`);
        }
      }

      if (value === undefined && mapping.type !== 'hardcoded') {
        continue;
      }

      if (mapping.dataType === 'string' || !mapping.dataType) {
        if (value === null || value === 'null') {
          value = '';
        }

        if (typeof value === 'string' && value !== '') {
          value = value.toUpperCase();
        }

        if (mapping.maxLength && typeof mapping.maxLength === 'number' && mapping.maxLength > 0) {
          if (typeof value === 'string') {
            const jsonEscapedLength = JSON.stringify(value).length - 2;
            if (jsonEscapedLength > mapping.maxLength) {
              value = truncateJsonEscaped(value, mapping.maxLength);
              console.log(`[FieldMappingProcessor] Truncated ${fieldPath} to maxLength ${mapping.maxLength}`);
            }
          }
        }

        setFieldValue(order, fieldPath, value);
      } else if (mapping.dataType === 'phone') {
        if (value && typeof value === 'string') {
          const formattedPhone = formatPhoneNumber(value);
          setFieldValue(order, fieldPath, formattedPhone);
        }
      } else if (mapping.dataType === 'boolean') {
        const normalizedValue = normalizeBooleanValue(value);
        setFieldValue(order, fieldPath, normalizedValue);
      } else if (mapping.dataType === 'date') {
        if (value) {
          let dateValue = String(value).trim();
          if (mapping.inputDateFormat) {
            const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
              const month = parseInt(match[2], 10);
              const day = parseInt(match[3], 10);
              if (month > 12 && day <= 12) {
                dateValue = dateValue.replace(/^(\d{4})-(\d{2})-(\d{2})/, `${match[1]}-${match[3]}-${match[2]}`);
              }
            }
          }
          const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (isoMatch) {
            value = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
            setFieldValue(order, fieldPath, value);
          } else {
            setFieldValue(order, fieldPath, dateValue);
          }
        }
      } else if (mapping.dataType === 'time') {
        if (value) {
          const raw = String(value).trim();
          const afterT = raw.includes('T') ? raw.split('T')[1] : raw;
          const ampmMatch = afterT.match(/^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?[Mm]\.?\s*$/);
          let hh: number | null = null;
          let mm: number | null = null;
          if (ampmMatch) {
            hh = parseInt(ampmMatch[1], 10) % 12;
            if (ampmMatch[3].toUpperCase() === 'P') hh += 12;
            mm = parseInt(ampmMatch[2], 10);
          } else {
            const h24 = afterT.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
            if (h24) {
              hh = parseInt(h24[1], 10);
              mm = parseInt(h24[2], 10);
            }
          }
          if (hh !== null && mm !== null && hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
            value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            setFieldValue(order, fieldPath, value);
          } else {
            setFieldValue(order, fieldPath, raw);
          }
        }
      } else if (mapping.dataType === 'datetime') {
        if (value) {
          let dateValue = String(value);
          if (mapping.inputDateFormat) {
            const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
              const month = parseInt(match[2], 10);
              const day = parseInt(match[3], 10);
              if (month > 12 && day <= 12) {
                dateValue = dateValue.replace(/^(\d{4})-(\d{2})-(\d{2})/, `${match[1]}-${match[3]}-${match[2]}`);
                console.log(`[FieldMappingProcessor] Swapped month/day for ${fieldPath}: "${value}" -> "${dateValue}"`);
              }
            }
          }
          if (mapping.dateOnly) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
              value = `${dateValue}T00:00:00`;
            } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateValue)) {
              value = `${dateValue.slice(0, 10)}T00:00:00`;
            }
          } else {
            value = dateValue;
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) {
              value = `${value}:00`;
            }
          }
          setFieldValue(order, fieldPath, value);
        }
      } else if (mapping.dataType === 'zip_postal') {
        if (value && typeof value === 'string') {
          let cleaned = value.replace(/\s+/g, '').toUpperCase();
          if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
            value = `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
          } else if (/^\d{5}(-\d{4})?$/.test(cleaned)) {
            value = cleaned.slice(0, 5);
          } else if (cleaned.length === 6) {
            const corrected = cleaned.split('').map((ch, i) => {
              if (i % 3 === 1) {
                if (ch === 'O') return '0';
                if (ch === 'I' || ch === 'L') return '1';
                if (ch === 'S') return '5';
                if (ch === 'B') return '8';
              } else if (i % 3 === 0 || i % 3 === 2) {
                if (ch === '0') return 'O';
                if (ch === '1') return 'I';
                if (ch === '5') return 'S';
                if (ch === '8') return 'B';
              }
              return ch;
            }).join('');
            if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(corrected)) {
              value = `${corrected.slice(0, 3)} ${corrected.slice(3)}`;
            } else {
              value = cleaned;
            }
          } else {
            value = cleaned;
          }
          setFieldValue(order, fieldPath, value);
        }
      }

      if (mapping.removeIfNull) {
        const { isArray } = isArrayPath(order, fieldPath);
        if (isArray) {
          processArrayRemoveIfNull(order, mapping);
        } else {
          const currentValue = getFieldValue(order, fieldPath);
          if (currentValue === null || currentValue === undefined || currentValue === '' || currentValue === 'null') {
            deleteFieldValue(order, fieldPath);
            console.log(`[FieldMappingProcessor] Removed ${fieldPath} due to removeIfNull`);
          }
        }
      }
    }

    cleanupEmptyArrayItems(order);
  }

  console.log('[FieldMappingProcessor] Post-processing complete');
  return data;
}
