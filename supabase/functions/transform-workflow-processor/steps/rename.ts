import { getValueByPath } from "../utils.ts";

export function executeRename(step: any, contextData: any, lastApiResponse: any, formatType: string): any {
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
  if (formatType === 'CSV' && renameCsv) {
    primaryFilename = contextData.renamedCsvFilename;
  } else if (formatType === 'JSON' && renameJson) {
    primaryFilename = contextData.renamedJsonFilename;
  } else if (formatType === 'XML' && renameXml) {
    primaryFilename = contextData.renamedXmlFilename;
  } else if (renamePdf) {
    primaryFilename = contextData.renamedPdfFilename;
  } else if (renameCsv) {
    primaryFilename = contextData.renamedCsvFilename;
  } else if (renameJson) {
    primaryFilename = contextData.renamedJsonFilename;
  } else if (renameXml) {
    primaryFilename = contextData.renamedXmlFilename;
  }

  contextData.renamedFilename = primaryFilename;
  contextData.actualFilename = primaryFilename;
  console.log('✅ Primary renamed filename:', primaryFilename);

  return { renamedFilenames, primaryFilename, baseFilename };
}
