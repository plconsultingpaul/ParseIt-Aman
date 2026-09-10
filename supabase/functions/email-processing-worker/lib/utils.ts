export function truncateJsonEscaped(str: string, maxLength: number): string {
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

export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    const tenDigits = digits.slice(1);
    return `${tenDigits.slice(0, 3)}-${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
  }

  return "";
}

export function normalizeBooleanValue(value: any): string {
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

export function applyValidationFixes(jsonString: string): string {
  try {
    let parsed = JSON.parse(jsonString);

    const fixObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(fixObject);
      } else if (obj && typeof obj === 'object') {
        const fixed: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          fixed[key] = fixObject(value);
        }
        return fixed;
      } else if (typeof obj === 'string') {
        if (obj === 'N/A' || obj === 'n/a' || obj === 'null') {
          return '';
        }
        return obj;
      }
      return obj;
    };

    parsed = fixObject(parsed);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    console.warn('Could not apply validation fixes:', error);
    return jsonString;
  }
}

export function injectParseitId(jsonData: any, parseitIdMapping: string, parseitId: number): any {
  try {
    const mappingPath = parseitIdMapping.split('.');
    let current = jsonData;

    for (let i = 0; i < mappingPath.length - 1; i++) {
      const key = mappingPath[i];
      if (key === '[]' && Array.isArray(current) && current.length > 0) {
        current = current[0];
      } else if (current[key]) {
        current = current[key];
      } else {
        console.warn('Could not navigate to parseit ID mapping path:', parseitIdMapping);
        return jsonData;
      }
    }

    const finalKey = mappingPath[mappingPath.length - 1];
    current[finalKey] = parseitId;

    return jsonData;
  } catch (error) {
    console.error('Error injecting ParseIt ID:', error);
    return jsonData;
  }
}
