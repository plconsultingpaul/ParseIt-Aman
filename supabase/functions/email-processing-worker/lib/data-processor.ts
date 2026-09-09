import { FieldMapping, ArrayEntryConfig } from '../types.ts';
import { truncateJsonEscaped, formatPhoneNumber, normalizeBooleanValue } from './utils.ts';

const CANADIAN_PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

function formatPostalCode(postalCode: string, province: string): string {
  if (!postalCode || !province) return postalCode;

  const cleaned = postalCode.replace(/[\s\-]/g, '').toUpperCase();

  if (CANADIAN_PROVINCES.includes(province.toUpperCase())) {
    if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
      return `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
    }
  } else {
    if (/^\d{5}(\d{4})?$/.test(cleaned)) {
      return cleaned.substring(0, 5);
    }
  }

  return postalCode;
}

function formatZonePostalCode(postalCode: string): string {
  if (!postalCode) return postalCode;

  const cleaned = postalCode.replace(/[\s\-]/g, '').toUpperCase();

  if (cleaned.length === 6 && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
  }

  if (/^\d{5}(\d{4})?$/.test(cleaned)) {
    return cleaned.substring(0, 5);
  }

  return postalCode;
}

function formatPostalCodes(obj: any): void {
  if (Array.isArray(obj)) {
    obj.forEach(item => formatPostalCodes(item));
  } else if (obj && typeof obj === 'object') {
    if (obj.postalCode && obj.province) {
      obj.postalCode = formatPostalCode(obj.postalCode, obj.province);
    }

    if (obj.startZone) {
      obj.startZone = formatZonePostalCode(obj.startZone);
    }
    if (obj.endZone) {
      obj.endZone = formatZonePostalCode(obj.endZone);
    }

    for (const value of Object.values(obj)) {
      if (typeof value === 'object') {
        formatPostalCodes(value);
      }
    }
  }
}

function processObject(obj: any, mappings: FieldMapping[]): void {
  const currentDateTime = new Date().toISOString().slice(0, 19);

  mappings.forEach(mapping => {
    if (mapping.dataType === 'datetime') {
      processDatetimeField(obj, mapping, currentDateTime);
    } else if (mapping.dataType === 'phone') {
      processPhoneField(obj, mapping);
    } else if (mapping.dataType === 'string' || !mapping.dataType) {
      processStringField(obj, mapping);
    } else if (mapping.dataType === 'boolean') {
      processBooleanField(obj, mapping);
    }
  });
}

function validateAndFixDateSwap(value: string, inputDateFormat?: string): string {
  if (!inputDateFormat || !value) return value;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month > 12 && day <= 12) {
    const fixed = value.replace(/^(\d{4})-(\d{2})-(\d{2})/, `${match[1]}-${match[3]}-${match[2]}`);
    console.log(`[DateFix] Swapped month/day: "${value}" -> "${fixed}" (inputDateFormat: ${inputDateFormat})`);
    return fixed;
  }
  return value;
}

function processDatetimeField(obj: any, mapping: FieldMapping, currentDateTime: string): void {
  const fieldPath = mapping.fieldName.split('.');
  let current = obj;

  for (let i = 0; i < fieldPath.length - 1; i++) {
    if (current[fieldPath[i]] === undefined) {
      current[fieldPath[i]] = {};
    }

    if (Array.isArray(current[fieldPath[i]])) {
      const remainingPath = fieldPath.slice(i + 1).join('.');
      const nestedMapping = { ...mapping, fieldName: remainingPath };
      current[fieldPath[i]].forEach((item: any) => {
        processObject(item, [nestedMapping]);
      });
      return;
    }

    current = current[fieldPath[i]];
  }

  const finalField = fieldPath[fieldPath.length - 1];

  if (!current[finalField] || current[finalField] === "" || current[finalField] === "N/A") {
    if (mapping.type === 'hardcoded' && mapping.value) {
      current[finalField] = mapping.value;
    } else {
      current[finalField] = currentDateTime;
    }
  }

  if (current[finalField] && typeof current[finalField] === 'string' && mapping.inputDateFormat) {
    current[finalField] = validateAndFixDateSwap(current[finalField], mapping.inputDateFormat);
  }

  if (mapping.dateOnly && current[finalField] && typeof current[finalField] === 'string') {
    const dateMatch = current[finalField].match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      current[finalField] = dateMatch[1];
    }
  }
}

function processPhoneField(obj: any, mapping: FieldMapping): void {
  const fieldPath = mapping.fieldName.split('.');
  let current = obj;

  for (let i = 0; i < fieldPath.length - 1; i++) {
    if (current[fieldPath[i]] === undefined) {
      current[fieldPath[i]] = {};
    }

    if (Array.isArray(current[fieldPath[i]])) {
      const remainingPath = fieldPath.slice(i + 1).join('.');
      const nestedMapping = { ...mapping, fieldName: remainingPath };
      current[fieldPath[i]].forEach((item: any) => {
        processObject(item, [nestedMapping]);
      });
      return;
    }

    current = current[fieldPath[i]];
  }

  const finalField = fieldPath[fieldPath.length - 1];

  if (current[finalField] && typeof current[finalField] === 'string') {
    const formattedPhone = formatPhoneNumber(current[finalField]);
    current[finalField] = formattedPhone || "";
  }
}

function processStringField(obj: any, mapping: FieldMapping): void {
  const fieldPath = mapping.fieldName.split('.');
  let current = obj;

  for (let i = 0; i < fieldPath.length - 1; i++) {
    if (current[fieldPath[i]] === undefined) {
      current[fieldPath[i]] = {};
    }

    if (Array.isArray(current[fieldPath[i]])) {
      const remainingPath = fieldPath.slice(i + 1).join('.');
      const nestedMapping = { ...mapping, fieldName: remainingPath };
      current[fieldPath[i]].forEach((item: any) => {
        processObject(item, [nestedMapping]);
      });
      return;
    }

    current = current[fieldPath[i]];
  }

  const finalField = fieldPath[fieldPath.length - 1];

  if (current[finalField] === null || current[finalField] === "null") {
    current[finalField] = "";
  }

  if (typeof current[finalField] === 'string' && current[finalField] !== "") {
    current[finalField] = current[finalField].toUpperCase();
  }

  if (mapping.maxLength && typeof mapping.maxLength === 'number' && mapping.maxLength > 0) {
    if (typeof current[finalField] === 'string') {
      const jsonEscapedLength = JSON.stringify(current[finalField]).length - 2;
      if (jsonEscapedLength > mapping.maxLength) {
        current[finalField] = truncateJsonEscaped(current[finalField], mapping.maxLength);
      }
    }
  }
}

function processBooleanField(obj: any, mapping: FieldMapping): void {
  const fieldPath = mapping.fieldName.split('.');
  let current = obj;

  for (let i = 0; i < fieldPath.length - 1; i++) {
    if (current[fieldPath[i]] === undefined) {
      current[fieldPath[i]] = {};
    }

    if (Array.isArray(current[fieldPath[i]])) {
      const remainingPath = fieldPath.slice(i + 1).join('.');
      const nestedMapping = { ...mapping, fieldName: remainingPath };
      current[fieldPath[i]].forEach((item: any) => {
        processObject(item, [nestedMapping]);
      });
      return;
    }

    current = current[fieldPath[i]];
  }

  const finalField = fieldPath[fieldPath.length - 1];

  if (current[finalField] !== undefined) {
    current[finalField] = normalizeBooleanValue(current[finalField]);
  }
}

function cleanupNullStrings(obj: any, regularMappings: FieldMapping[]): void {
  if (Array.isArray(obj)) {
    obj.forEach(item => cleanupNullStrings(item, regularMappings));
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === "null" || value === "N/A" || value === "n/a") {
        const mapping = regularMappings.find(m => m.fieldName.endsWith(key) || m.fieldName === key);
        if (!mapping || mapping.dataType === 'string' || !mapping.dataType) {
          obj[key] = "";
        }
      } else if (typeof value === 'object') {
        cleanupNullStrings(value, regularMappings);
      }
    }
  }
}

function removeNullFields(obj: any, mappings: FieldMapping[]): void {
  mappings.forEach(mapping => {
    if (!mapping.removeIfNull) return;

    const fieldPath = mapping.fieldName.split('.');
    let current = obj;

    for (let i = 0; i < fieldPath.length - 1; i++) {
      if (!current[fieldPath[i]]) {
        return;
      }

      if (Array.isArray(current[fieldPath[i]])) {
        const remainingPath = fieldPath.slice(i + 1).join('.');
        const nestedMapping = { ...mapping, fieldName: remainingPath };
        current[fieldPath[i]].forEach((item: any) => {
          removeNullFields(item, [nestedMapping]);
        });
        return;
      }

      current = current[fieldPath[i]];
    }

    const finalField = fieldPath[fieldPath.length - 1];
    const fieldValue = current[finalField];

    if (
      fieldValue === null ||
      fieldValue === "" ||
      fieldValue === undefined ||
      fieldValue === "null"
    ) {
      delete current[finalField];
    }
  });
}

export function applyFieldMappingPostProcessing(jsonData: any, fieldMappings: FieldMapping[]): any {
  const regularMappings = fieldMappings.filter(m => !m.isWorkflowOnly);
  if (regularMappings.length === 0 && (!jsonData.orders || !Array.isArray(jsonData.orders))) {
    return jsonData;
  }

  if (jsonData.orders && Array.isArray(jsonData.orders)) {
    jsonData.orders.forEach((order: any) => {
      if (regularMappings.length > 0) {
        processObject(order, regularMappings);
        removeNullFields(order, regularMappings);
      }
      cleanupNullStrings(order, regularMappings);
      formatPostalCodes(order);

      if (order.traceNumbers && Array.isArray(order.traceNumbers)) {
        order.traceNumbers = order.traceNumbers.filter((trace: any) => {
          return trace.traceNumber &&
                 trace.traceNumber !== "" &&
                 trace.traceNumber !== null &&
                 trace.traceNumber !== "null";
        });
      }
    });
  }

  return jsonData;
}

export function constructArraysFromEntryConfigs(
  jsonData: any,
  arrayEntryConfigs: ArrayEntryConfig[],
  workflowOnlyData: Record<string, any>
): void {
  const enabledEntries = arrayEntryConfigs.filter(e => e.isEnabled);
  console.log(`[ArrayEntryBuilder] Enabled entries: ${enabledEntries.length}, Total configs: ${arrayEntryConfigs.length}`);
  if (enabledEntries.length === 0) return;

  // Separate parent entries (no parentArrayField) and child entries (have parentArrayField)
  const parentEntries = enabledEntries.filter(e => !e.parentArrayField);
  const childEntries = enabledEntries.filter(e => !!e.parentArrayField);

  // Separate repeating and static entries (among parent entries only)
  const repeatingEntries = parentEntries.filter(e => e.isRepeating);
  const staticEntries = parentEntries.filter(e => !e.isRepeating);
  console.log(`[ArrayEntryBuilder] Repeating entries: ${repeatingEntries.length}, Static entries: ${staticEntries.length}, Child entries: ${childEntries.length}`);

  // Group static entries by target array field
  const staticEntriesByArray = new Map<string, ArrayEntryConfig[]>();
  staticEntries.forEach(entry => {
    if (!staticEntriesByArray.has(entry.targetArrayField)) {
      staticEntriesByArray.set(entry.targetArrayField, []);
    }
    staticEntriesByArray.get(entry.targetArrayField)!.push(entry);
  });

  if (jsonData.orders && Array.isArray(jsonData.orders)) {
    jsonData.orders.forEach((order: any) => {
      const repeatingPopulatedArrays = new Set<string>();

      repeatingEntries.forEach(entry => {
        const repeatingKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
        const extractedArray = workflowOnlyData[repeatingKey];
        console.log(`[EMAIL-DIAG-ARRAY] Repeating entry "${entry.targetArrayField}": key="${repeatingKey}", found=${extractedArray !== undefined}, isArray=${Array.isArray(extractedArray)}, length=${Array.isArray(extractedArray) ? extractedArray.length : 'N/A'}`);

        if (Array.isArray(extractedArray) && extractedArray.length > 0) {
          console.log(`[EMAIL-DIAG-ARRAY] Processing ${extractedArray.length} repeating rows for "${entry.targetArrayField}"`);
          const processedArray = extractedArray.map((row: Record<string, any>, rowIdx: number) => {
            const processedRow: Record<string, any> = {};
            let rinFieldWasNull = false;

            entry.fields.forEach(field => {
              let value: any;
              if (field.fieldType === 'hardcoded') {
                value = field.hardcodedValue || '';
              } else {
                value = row[field.fieldName];
                console.log(`[EMAIL-DIAG-ARRAY] Repeating row[${rowIdx}] field "${field.fieldName}": raw="${value}", removeIfNull=${field.removeIfNull}`);
                if (value === undefined || value === null) {
                  value = '';
                }
              }

              if (field.removeIfNull) {
                const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                console.log(`[EMAIL-DIAG-ARRAY] RIN check for "${field.fieldName}" row[${rowIdx}]: value="${value}", rinCheck=${rinCheck}`);
                if (rinCheck) {
                  rinFieldWasNull = true;
                  return;
                }
              }

              if (field.dataType === 'number') {
                value = parseFloat(String(value)) || 0;
              } else if (field.dataType === 'integer') {
                value = parseInt(String(value)) || 0;
              } else if (field.dataType === 'string' && value) {
                value = String(value).toUpperCase();
              }

              processedRow[field.fieldName] = value;
            });

            if (entry.removeEntryIfRinNull && rinFieldWasNull) {
              console.log(`[EMAIL-DIAG-ARRAY] DROPPING repeating row[${rowIdx}] for "${entry.targetArrayField}" - removeEntryIfRinNull triggered`);
              return null;
            }

            console.log(`[EMAIL-DIAG-ARRAY] Repeating row[${rowIdx}] result:`, JSON.stringify(processedRow));
            return processedRow;
          }).filter((row: Record<string, any> | null) =>
            row !== null && Object.values(row).some(v => v !== '' && v !== null && v !== undefined && v !== 0)
          );

          console.log(`[EMAIL-DIAG-ARRAY] Repeating "${entry.targetArrayField}": ${extractedArray.length} raw -> ${processedArray.length} after filtering`);

          if (processedArray.length > 0) {
            order[entry.targetArrayField] = processedArray;
            repeatingPopulatedArrays.add(entry.targetArrayField);
          } else {
            console.log(`[EMAIL-DIAG-ARRAY] DELETING "${entry.targetArrayField}" - all rows filtered out`);
            delete order[entry.targetArrayField];
          }

          delete workflowOnlyData[repeatingKey];
        } else {
          console.log(`[EMAIL-DIAG-ARRAY] No WFO repeating data for "${entry.targetArrayField}", checking existing order array`);
          const existingArray = order[entry.targetArrayField];
          console.log(`[EMAIL-DIAG-ARRAY] Existing order array "${entry.targetArrayField}": isArray=${Array.isArray(existingArray)}, length=${Array.isArray(existingArray) ? existingArray.length : 'N/A'}`);

          if (Array.isArray(existingArray) && existingArray.length > 0) {
            const processedArray = existingArray.map((row: Record<string, any>, rowIdx: number) => {
              let rinFieldWasNull = false;
              const processedRow: Record<string, any> = { ...row };

              entry.fields.forEach(field => {
                if (field.removeIfNull) {
                  const value = processedRow[field.fieldName];
                  const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                  console.log(`[EMAIL-DIAG-ARRAY] Existing row[${rowIdx}] RIN check "${field.fieldName}": value="${value}", rinCheck=${rinCheck}`);
                  if (rinCheck) {
                    delete processedRow[field.fieldName];
                    rinFieldWasNull = true;
                  }
                }
              });

              if (entry.removeEntryIfRinNull && rinFieldWasNull) {
                console.log(`[EMAIL-DIAG-ARRAY] DROPPING existing row[${rowIdx}] for "${entry.targetArrayField}" - removeEntryIfRinNull triggered`);
                return null;
              }

              return processedRow;
            }).filter((row: Record<string, any> | null) => row !== null);

            console.log(`[EMAIL-DIAG-ARRAY] Existing "${entry.targetArrayField}": ${existingArray.length} raw -> ${processedArray.length} after RIN filtering`);

            if (processedArray.length > 0) {
              order[entry.targetArrayField] = processedArray;
              repeatingPopulatedArrays.add(entry.targetArrayField);
            } else {
              console.log(`[EMAIL-DIAG-ARRAY] DELETING "${entry.targetArrayField}" - all existing rows filtered out by RIN`);
              delete order[entry.targetArrayField];
            }
          } else if (Array.isArray(existingArray) && existingArray.length === 0) {
            console.log(`[EMAIL-DIAG-ARRAY] DELETING "${entry.targetArrayField}" - empty array`);
            delete order[entry.targetArrayField];
          }
        }
      });

      staticEntriesByArray.forEach((entries, arrayField) => {
        if (repeatingPopulatedArrays.has(arrayField)) {
          console.log(`[EMAIL-DIAG-STATIC] Skipping static entries for "${arrayField}" - already populated by repeating entry`);
          return;
        }

        const allWfoKeys = Object.keys(workflowOnlyData);
        const hadArrayEntryKeysInWfo = allWfoKeys.some(k => k.startsWith(`__ARRAY_ENTRY_${arrayField}_`));
        console.log(`[EMAIL-DIAG-STATIC] hadArrayEntryKeysInWfo for "${arrayField}": ${hadArrayEntryKeysInWfo}, matching keys:`, allWfoKeys.filter(k => k.startsWith(`__ARRAY_ENTRY_${arrayField}_`)));

        const sortedEntries = [...entries].sort((a, b) => a.entryOrder - b.entryOrder);
        const constructedArray: any[] = [];
        console.log(`[EMAIL-DIAG-STATIC] Processing ${sortedEntries.length} static entries for "${arrayField}"`);

        sortedEntries.forEach(entry => {
          console.log(`[EMAIL-DIAG-STATIC] Entry "${arrayField}"[${entry.entryOrder}]: aiCondition=${!!entry.aiConditionInstruction}, removeEntryIfRinNull=${entry.removeEntryIfRinNull}, fields=${entry.fields.length}`);

          if (entry.aiConditionInstruction) {
            const conditionKey = `__ARRAY_ENTRY_CONDITION_${entry.targetArrayField}_${entry.entryOrder}__`;
            const conditionResult = String(workflowOnlyData[conditionKey] || '').toLowerCase();
            console.log(`[EMAIL-DIAG-STATIC] AI condition key="${conditionKey}", result="${conditionResult}"`);
            delete workflowOnlyData[conditionKey];

            if (conditionResult !== 'true') {
              console.log(`[EMAIL-DIAG-STATIC] SKIPPING entry "${arrayField}"[${entry.entryOrder}] - AI condition="${conditionResult}"`);
              entry.fields.forEach(f => {
                const key = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${f.fieldName}__`;
                delete workflowOnlyData[key];
              });
              return;
            }
          }

          const entryObj: Record<string, any> = {};
          let rinFieldWasNull = false;

          entry.fields.forEach(field => {
            if (field.fieldType === 'hardcoded') {
              let value: any = field.hardcodedValue || '';
              if (field.dataType === 'number') {
                value = parseFloat(value) || 0;
              } else if (field.dataType === 'integer') {
                value = parseInt(value) || 0;
              } else if (field.dataType === 'string') {
                value = String(value).toUpperCase();
              }
              if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                console.log(`[EMAIL-DIAG-STATIC] RIN-SKIP hardcoded "${field.fieldName}" (value="${value}")`);
                rinFieldWasNull = true;
                return;
              }
              console.log(`[EMAIL-DIAG-STATIC] Hardcoded "${field.fieldName}" = "${value}"`);
              entryObj[field.fieldName] = value;
            } else if (field.fieldType === 'extracted' || field.fieldType === 'mapped') {
              const extractionKey = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${field.fieldName}__`;
              let value: any = workflowOnlyData[extractionKey] || '';
              console.log(`[EMAIL-DIAG-STATIC] Extracted "${field.fieldName}": key="${extractionKey}", value="${value}", removeIfNull=${field.removeIfNull}`);
              if (field.dataType === 'number') {
                value = parseFloat(value) || 0;
              } else if (field.dataType === 'integer') {
                value = parseInt(value) || 0;
              } else if (field.dataType === 'string' && value) {
                value = String(value).toUpperCase();
              }
              if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                console.log(`[EMAIL-DIAG-STATIC] RIN-SKIP extracted "${field.fieldName}" (value="${value}")`);
                rinFieldWasNull = true;
                delete workflowOnlyData[extractionKey];
                return;
              }
              entryObj[field.fieldName] = value;
              delete workflowOnlyData[extractionKey];
            }
          });

          if (entry.removeEntryIfRinNull && rinFieldWasNull) {
            console.log(`[EMAIL-DIAG-STATIC] DROPPING entire entry "${arrayField}"[${entry.entryOrder}] - removeEntryIfRinNull triggered`);
            return;
          }

          const hasNonEmptyValue = Object.values(entryObj).some(v => v !== '' && v !== null && v !== undefined);
          console.log(`[EMAIL-DIAG-STATIC] Entry "${arrayField}"[${entry.entryOrder}] built:`, JSON.stringify(entryObj), `hasNonEmpty=${hasNonEmptyValue}`);
          if (hasNonEmptyValue) {
            constructedArray.push(entryObj);
          }
        });

        if (constructedArray.length > 0) {
          order[arrayField] = constructedArray;
          console.log(`[EMAIL-DIAG-STATIC] Final "${arrayField}": ${constructedArray.length} entries constructed`);
        } else if (!hadArrayEntryKeysInWfo && Array.isArray(order[arrayField]) && order[arrayField].length > 0) {
          console.log(`[EMAIL-DIAG-STATIC] Array "${arrayField}" preserved from template — no __ARRAY_ENTRY_* keys in wfoData, template has ${order[arrayField].length} entries`);
          sortedEntries.forEach(entry => {
            const templateIdx = entry.entryOrder - 1;
            if (templateIdx >= 0 && templateIdx < order[arrayField].length) {
              entry.fields.forEach(field => {
                if (field.fieldType === 'hardcoded') {
                  let value: any = field.hardcodedValue || '';
                  if (field.dataType === 'number') {
                    value = parseFloat(value) || 0;
                  } else if (field.dataType === 'integer') {
                    value = parseInt(value) || 0;
                  } else if (field.dataType === 'boolean') {
                    value = normalizeBooleanValue(value);
                  } else if (field.dataType === 'string') {
                    value = String(value).toUpperCase();
                  }
                  console.log(`[EMAIL-DIAG-STATIC] Patching hardcoded "${field.fieldName}" = ${JSON.stringify(value)} onto preserved template entry [${templateIdx}]`);
                  order[arrayField][templateIdx][field.fieldName] = value;
                }
              });
            }
          });
        } else {
          delete order[arrayField];
          console.log(`[EMAIL-DIAG-STATIC] DELETED "${arrayField}" - no valid entries constructed and no template to preserve`);
        }
      });

      // Process child entries - nest inside parent array rows
      childEntries.forEach(entry => {
        const parentArray = order[entry.parentArrayField!];
        if (!Array.isArray(parentArray) || parentArray.length === 0) {
          console.log(`[ArrayEntryBuilder:Child] Skipping child "${entry.targetArrayField}" - parent "${entry.parentArrayField}" not found or empty`);
          return;
        }

        if (entry.isRepeating) {
          const repeatingKey = `__REPEATING_ARRAY_${entry.targetArrayField}__`;
          const extractedArray = workflowOnlyData[repeatingKey];
          console.log(`[ArrayEntryBuilder:Child] Repeating child "${entry.targetArrayField}" for parent "${entry.parentArrayField}": key="${repeatingKey}", found=${extractedArray !== undefined}, isArray=${Array.isArray(extractedArray)}`);

          if (Array.isArray(extractedArray) && extractedArray.length > 0) {
            const processedArray = extractedArray.map((row: Record<string, any>, rowIdx: number) => {
              const processedRow: Record<string, any> = {};
              let rinFieldWasNull = false;

              entry.fields.forEach(field => {
                let value: any;
                if (field.fieldType === 'hardcoded') {
                  value = field.hardcodedValue || '';
                } else {
                  value = row[field.fieldName];
                  if (value === undefined || value === null) {
                    value = '';
                  }
                }

                if (field.removeIfNull) {
                  const rinCheck = value === null || value === '' || value === undefined || value === 'null';
                  if (rinCheck) {
                    rinFieldWasNull = true;
                    return;
                  }
                }

                if (field.dataType === 'number') {
                  value = parseFloat(String(value)) || 0;
                } else if (field.dataType === 'integer') {
                  value = parseInt(String(value)) || 0;
                } else if (field.dataType === 'string' && value) {
                  value = String(value).toUpperCase();
                }

                processedRow[field.fieldName] = value;
              });

              if (entry.removeEntryIfRinNull && rinFieldWasNull) {
                console.log(`[ArrayEntryBuilder:Child] DROPPING child row[${rowIdx}] for "${entry.targetArrayField}" - RIN triggered`);
                return null;
              }

              return processedRow;
            }).filter((row: Record<string, any> | null) =>
              row !== null && Object.values(row).some(v => v !== '' && v !== null && v !== undefined && v !== 0)
            );

            if (processedArray.length > 0) {
              // Distribute child rows across parent rows - nest inside each parent row
              parentArray.forEach((parentRow: Record<string, any>) => {
                parentRow[entry.targetArrayField] = processedArray;
              });
              console.log(`[ArrayEntryBuilder:Child] Nested "${entry.targetArrayField}" (${processedArray.length} rows) inside each of ${parentArray.length} parent rows of "${entry.parentArrayField}"`);
            }

            delete workflowOnlyData[repeatingKey];
          }
        } else {
          // Static child entry - build single entry and nest in each parent row
          const entryObj: Record<string, any> = {};
          let rinFieldWasNull = false;

          entry.fields.forEach(field => {
            if (field.fieldType === 'hardcoded') {
              let value: any = field.hardcodedValue || '';
              if (field.dataType === 'number') value = parseFloat(value) || 0;
              else if (field.dataType === 'integer') value = parseInt(value) || 0;
              else if (field.dataType === 'string') value = String(value).toUpperCase();
              entryObj[field.fieldName] = value;
            } else {
              const extractionKey = `__ARRAY_ENTRY_${entry.targetArrayField}_${entry.entryOrder}_${field.fieldName}__`;
              let value: any = workflowOnlyData[extractionKey] || '';
              if (field.dataType === 'number') value = parseFloat(value) || 0;
              else if (field.dataType === 'integer') value = parseInt(value) || 0;
              else if (field.dataType === 'string' && value) value = String(value).toUpperCase();
              if (field.removeIfNull && (value === null || value === '' || value === undefined || value === 'null')) {
                rinFieldWasNull = true;
                delete workflowOnlyData[extractionKey];
                return;
              }
              entryObj[field.fieldName] = value;
              delete workflowOnlyData[extractionKey];
            }
          });

          if (!(entry.removeEntryIfRinNull && rinFieldWasNull)) {
            const hasNonEmpty = Object.values(entryObj).some(v => v !== '' && v !== null && v !== undefined);
            if (hasNonEmpty) {
              parentArray.forEach((parentRow: Record<string, any>) => {
                if (!Array.isArray(parentRow[entry.targetArrayField])) {
                  parentRow[entry.targetArrayField] = [];
                }
                parentRow[entry.targetArrayField].push(entryObj);
              });
              console.log(`[ArrayEntryBuilder:Child] Static child "${entry.targetArrayField}[${entry.entryOrder}]" nested in parent "${entry.parentArrayField}"`);
            }
          }
        }
      });
    });
  }
}

export function parseExtractionResponse(
  extractedContent: string,
  isJsonFormat: boolean,
  hasWFOFields: boolean
): { templateData: string; workflowOnlyData: string; extractedContent: string } {
  let templateData = '';
  let workflowOnlyData = '{}';

  if (isJsonFormat) {
    extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    if (hasWFOFields) {
      try {
        const wrapper = JSON.parse(extractedContent);
        if (wrapper.templateData && wrapper.workflowOnlyData !== undefined) {
          templateData = typeof wrapper.templateData === 'string'
            ? wrapper.templateData
            : JSON.stringify(wrapper.templateData);
          workflowOnlyData = typeof wrapper.workflowOnlyData === 'string'
            ? wrapper.workflowOnlyData
            : JSON.stringify(wrapper.workflowOnlyData);
          console.log('Successfully parsed dual-structure response');
          extractedContent = templateData;
        } else {
          console.warn('Wrapper missing expected fields, using full response as template');
          templateData = extractedContent;
          workflowOnlyData = '{}';
        }
      } catch (wrapperError) {
        console.warn('Failed to parse wrapper, using full response as template:', wrapperError);
        templateData = extractedContent;
        workflowOnlyData = '{}';
      }
    } else {
      templateData = extractedContent;
    }
  } else {
    extractedContent = extractedContent.replace(/```xml\n?/g, '').replace(/```\n?/g, '').trim();

    if (!extractedContent.startsWith('<') || !extractedContent.endsWith('>')) {
      throw new Error('AI returned invalid XML format');
    }
  }

  return { templateData, workflowOnlyData, extractedContent };
}
