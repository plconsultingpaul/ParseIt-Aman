import type { FieldMapping } from '../types';

export interface CsvGeneratorOptions {
  delimiter?: string;
  includeHeaders?: boolean;
  fieldMappings: FieldMapping[];
}

export interface CsvRow {
  [fieldName: string]: string | number | boolean | null;
}

export function escapeCsvValue(value: any, delimiter: string = ','): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  const needsQuoting =
    stringValue.includes(delimiter) ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsQuoting) {
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

export function generateCsvHeader(
  fieldMappings: FieldMapping[],
  delimiter: string = ','
): string {
  const headers = fieldMappings.map(mapping => mapping.fieldName);
  return headers.map(header => escapeCsvValue(header, delimiter)).join(delimiter);
}

export function generateCsvRow(
  rowData: CsvRow,
  fieldMappings: FieldMapping[],
  delimiter: string = ','
): string {
  const values = fieldMappings.map(mapping => {
    const value = rowData[mapping.fieldName];

    if (value === null || value === undefined) {
      return '';
    }

    const dataType = mapping.dataType || 'string';

    switch (dataType) {
      case 'number':
      case 'integer':
        if (typeof value === 'number') {
          return String(value);
        }
        const numValue = parseFloat(String(value));
        return isNaN(numValue) ? '' : String(numValue);

      case 'boolean':
        return value ? 'true' : 'false';

      case 'datetime':
      case 'date':
      case 'time':
        return escapeCsvValue(value, delimiter);

      case 'phone':
        const cleanPhone = String(value).replace(/[^0-9+\-() ]/g, '');
        return escapeCsvValue(cleanPhone, delimiter);

      case 'string':
      default:
        let stringValue = String(value);

        if (mapping.maxLength && stringValue.length > mapping.maxLength) {
          stringValue = stringValue.substring(0, mapping.maxLength);
        }

        return escapeCsvValue(stringValue, delimiter);
    }
  });

  return values.join(delimiter);
}

export function generateCsv(
  rows: CsvRow[],
  options: CsvGeneratorOptions
): string {
  const { delimiter = ',', includeHeaders = true, fieldMappings } = options;

  if (!fieldMappings || fieldMappings.length === 0) {
    throw new Error('Field mappings are required to generate CSV');
  }

  const lines: string[] = [];

  if (includeHeaders) {
    lines.push(generateCsvHeader(fieldMappings, delimiter));
  }

  for (const row of rows) {
    lines.push(generateCsvRow(row, fieldMappings, delimiter));
  }

  return lines.join('\n');
}

export function getDelimiterChar(delimiter: string): string {
  switch (delimiter.toLowerCase()) {
    case 'comma':
    case ',':
      return ',';
    case 'semicolon':
    case ';':
      return ';';
    case 'tab':
    case '\\t':
    case '\t':
      return '\t';
    case 'pipe':
    case '|':
      return '|';
    default:
      return ',';
  }
}

export function convertExtractedDataToCsv(
  extractedData: any[],
  fieldMappings: FieldMapping[],
  delimiter: string = ',',
  includeHeaders: boolean = true
): string {
  const rows: CsvRow[] = extractedData.map(item => {
    const row: CsvRow = {};

    fieldMappings.forEach(mapping => {
      row[mapping.fieldName] = item[mapping.fieldName] || null;
    });

    return row;
  });

  return generateCsv(rows, {
    delimiter: getDelimiterChar(delimiter),
    includeHeaders,
    fieldMappings
  });
}
