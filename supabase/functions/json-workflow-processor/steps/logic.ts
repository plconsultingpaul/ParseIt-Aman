// steps/logic.ts - Conditional checks, transforms, and file renaming

import { getValueByPath, filterJsonWorkflowOnlyFields } from "../utils.ts";

export async function executeConditionalCheck(step: any, contextData: any): Promise<any> {
  console.log('🔍 === EXECUTING CONDITIONAL CHECK STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Conditional check config:', JSON.stringify(config, null, 2));

  const rawFieldPath = config.fieldPath || config.checkField || '';
  const fieldPath = rawFieldPath.replace(/^\{\{|\}\}$/g, '');
  const operator = config.operator || 'exists';
  const expectedValue = config.expectedValue;
  const storeResultAs = config.storeResultAs || `condition_${step.step_order}_result`;

  console.log('🔍 Checking field:', fieldPath);
  console.log('🔍 Operator:', operator);
  console.log('🔍 Expected value:', expectedValue);

  const actualValue = getValueByPath(contextData, fieldPath);
  console.log('🔍 Actual value from context:', actualValue);
  console.log('🔍 Actual value type:', typeof actualValue);

  let conditionMet = false;

  switch (operator) {
    case 'exists':
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
      console.log(`🔍 Condition (exists): ${conditionMet}`);
      break;

    case 'not_exists':
    case 'notExists':
      conditionMet = actualValue === null || actualValue === undefined || actualValue === '';
      console.log(`🔍 Condition (not_exists): ${conditionMet}`);
      break;

    case 'is_null':
    case 'isNull':
      conditionMet = actualValue === null || actualValue === undefined;
      console.log(`🔍 Condition (is_null): ${conditionMet}`);
      break;

    case 'is_not_null':
    case 'isNotNull':
      conditionMet = actualValue !== null && actualValue !== undefined;
      console.log(`🔍 Condition (is_not_null): ${conditionMet}`);
      break;

    case 'equals':
    case 'eq':
      conditionMet = String(actualValue) === String(expectedValue);
      console.log(`🔍 Condition (equals): "${actualValue}" === "${expectedValue}" = ${conditionMet}`);
      break;

    case 'not_equals':
    case 'notEquals':
    case 'ne':
      conditionMet = String(actualValue) !== String(expectedValue);
      console.log(`🔍 Condition (not_equals): "${actualValue}" !== "${expectedValue}" = ${conditionMet}`);
      break;

    case 'contains':
      conditionMet = String(actualValue).includes(String(expectedValue));
      console.log(`🔍 Condition (contains): "${actualValue}".includes("${expectedValue}") = ${conditionMet}`);
      break;

    case 'not_contains':
    case 'notContains':
      conditionMet = !String(actualValue).includes(String(expectedValue));
      console.log(`🔍 Condition (not_contains): !("${actualValue}".includes("${expectedValue}")) = ${conditionMet}`);
      break;

    case 'greater_than':
    case 'gt':
      const gtActual = parseFloat(actualValue);
      const gtExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(gtActual) && !isNaN(gtExpected) && gtActual > gtExpected;
      console.log(`🔍 Condition (greater_than): ${gtActual} > ${gtExpected} = ${conditionMet}`);
      break;

    case 'less_than':
    case 'lt':
      const ltActual = parseFloat(actualValue);
      const ltExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(ltActual) && !isNaN(ltExpected) && ltActual < ltExpected;
      console.log(`🔍 Condition (less_than): ${ltActual} < ${ltExpected} = ${conditionMet}`);
      break;

    case 'greater_than_or_equal':
    case 'gte':
      const gteActual = parseFloat(actualValue);
      const gteExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(gteActual) && !isNaN(gteExpected) && gteActual >= gteExpected;
      console.log(`🔍 Condition (greater_than_or_equal): ${gteActual} >= ${gteExpected} = ${conditionMet}`);
      break;

    case 'less_than_or_equal':
    case 'lte':
      const lteActual = parseFloat(actualValue);
      const lteExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(lteActual) && !isNaN(lteExpected) && lteActual <= lteExpected;
      console.log(`🔍 Condition (less_than_or_equal): ${lteActual} <= ${lteExpected} = ${conditionMet}`);
      break;

    default:
      console.warn(`⚠️ Unknown operator: ${operator}, defaulting to 'exists'`);
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
  }

  contextData[storeResultAs] = conditionMet;
  console.log(`✅ Conditional check result stored as "${storeResultAs}": ${conditionMet}`);

  return {
    conditionMet,
    fieldPath,
    operator,
    actualValue,
    expectedValue,
    storeResultAs
  };
}

export async function executeJsonTransform(step: any, contextData: any): Promise<any> {
  console.log('🔧 === EXECUTING JSON TRANSFORM STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Transform config:', JSON.stringify(config, null, 2));

  if (config.outputFields && Array.isArray(config.outputFields)) {
    console.log('📊 Filtering JSON to include only output fields...');
    const filteredData = filterJsonWorkflowOnlyFields(contextData.extractedData, config.outputFields);
    contextData.extractedData = filteredData;
    console.log('✅ JSON transform applied successfully');
    return { transformed: true, fieldCount: config.outputFields.filter((f: any) => !f.isWorkflowOnly).length };
  } else {
    console.log('ℹ️ No output fields configured, skipping transform');
    return { transformed: false, reason: 'no output fields configured' };
  }
}

export async function executeRename(step: any, contextData: any, formatType: string, lastApiResponse: any): Promise<any> {
  console.log('📝 === EXECUTING RENAME FILE STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Rename config:', JSON.stringify(config, null, 2));
  console.log('🔍 DEBUG - contextData keys at start of rename:', Object.keys(contextData));
  console.log('🔍 DEBUG - contextData.billNumber:', contextData.billNumber);
  console.log('🔍 DEBUG - lastApiResponse:', lastApiResponse);

  let template = config.filenameTemplate || contextData.pageGroupFilenameTemplate || contextData.extractionTypeFilename || config.template || 'Remit_{{pdfFilename}}';
  console.log('📄 Original template:', template);

  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = placeholderRegex.exec(template)) !== null) {
    const placeholder = match[0];
    const path = match[1];
    let value = getValueByPath(contextData, path);

    console.log(`🔍 Replacing ${placeholder} (path: "${path}")`);
    console.log(`🔍   - Value from contextData:`, value);

    if ((value === null || value === undefined) && lastApiResponse) {
      value = getValueByPath(lastApiResponse, path);
      console.log(`🔍   - Fallback value from lastApiResponse:`, value);
    }

    if (value !== null && value !== undefined) {
      template = template.replace(placeholder, String(value));
      console.log(`🔍   - Replaced with:`, String(value));
    } else {
      console.log(`⚠️   - No value found for ${placeholder}`);
    }
  }

  console.log('📄 Template after replacements:', template);

  let baseFilename = template.replace(/\.(pdf|csv|json|xml)$/i, '');
  console.log('📄 Base filename (without extension):', baseFilename);

  const appendTimestamp = config.appendTimestamp === true;
  const timestampFormat = config.timestampFormat || 'YYYYMMDD';
  console.log('⏰ Append timestamp:', appendTimestamp);
  if (appendTimestamp) {
    console.log('⏰ Timestamp format:', timestampFormat);
  }

  let timestamp = '';
  if (appendTimestamp) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    switch (timestampFormat) {
      case 'YYYYMMDD':
        timestamp = `${year}${month}${day}`;
        break;
      case 'YYYY-MM-DD':
        timestamp = `${year}-${month}-${day}`;
        break;
      case 'YYYYMMDD_HHMMSS':
        timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        break;
      case 'YYYY-MM-DD_HH-MM-SS':
        timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
        break;
      default:
        timestamp = `${year}${month}${day}`;
    }
    console.log('⏰ Generated timestamp:', timestamp);
    baseFilename = `${baseFilename}_${timestamp}`;
    console.log('📄 Base filename with timestamp:', baseFilename);
  }

  const renamePdf = config.renamePdf === true;
  const renameCsv = config.renameCsv === true;
  const renameJson = config.renameJson === true;
  const renameXml = config.renameXml === true;

  console.log('📋 File types to rename:', { renamePdf, renameCsv, renameJson, renameXml });

  const renamedFilenames: any = {};

  if (renamePdf) {
    contextData.renamedPdfFilename = `${baseFilename}.pdf`;
    renamedFilenames.pdf = contextData.renamedPdfFilename;
    console.log('✅ Renamed PDF filename:', contextData.renamedPdfFilename);
  }

  if (renameCsv) {
    contextData.renamedCsvFilename = `${baseFilename}.csv`;
    renamedFilenames.csv = contextData.renamedCsvFilename;
    console.log('✅ Renamed CSV filename:', contextData.renamedCsvFilename);
  }

  if (renameJson) {
    contextData.renamedJsonFilename = `${baseFilename}.json`;
    renamedFilenames.json = contextData.renamedJsonFilename;
    console.log('✅ Renamed JSON filename:', contextData.renamedJsonFilename);
  }

  if (renameXml) {
    contextData.renamedXmlFilename = `${baseFilename}.xml`;
    renamedFilenames.xml = contextData.renamedXmlFilename;
    console.log('✅ Renamed XML filename:', contextData.renamedXmlFilename);
  }

  let primaryFilename = baseFilename;
  if (formatType === 'JSON' && renameJson) {
    primaryFilename = contextData.renamedJsonFilename;
  } else if (formatType === 'CSV' && renameCsv) {
    primaryFilename = contextData.renamedCsvFilename;
  } else if (formatType === 'XML' && renameXml) {
    primaryFilename = contextData.renamedXmlFilename;
  } else if (renamePdf) {
    primaryFilename = contextData.renamedPdfFilename;
  } else if (renameJson) {
    primaryFilename = contextData.renamedJsonFilename;
  } else if (renameCsv) {
    primaryFilename = contextData.renamedCsvFilename;
  } else if (renameXml) {
    primaryFilename = contextData.renamedXmlFilename;
  }

  contextData.renamedFilename = primaryFilename;
  contextData.actualFilename = primaryFilename;
  console.log('✅ Primary renamed filename:', primaryFilename);

  return {
    renamedFilenames,
    primaryFilename,
    baseFilename
  };
}
