import { getValueByPath } from "../utils.ts";

export function executeRename(step: any, contextData: any, lastApiResponse: any, formatType: string): any {
  console.log('=== EXECUTING RENAME FILE STEP ===');
  const config = step.config_json || {};

  let template = config.filenameTemplate || contextData.pageGroupFilenameTemplate || contextData.extractionTypeFilename || config.template || 'Remit_{{pdfFilename}}';

  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = placeholderRegex.exec(template)) !== null) {
    const placeholder = match[0];
    const path = match[1];
    let value = getValueByPath(contextData, path);
    if ((value === null || value === undefined) && lastApiResponse) {
      value = getValueByPath(lastApiResponse, path);
    }
    if (value !== null && value !== undefined) {
      template = template.replace(placeholder, String(value));
    } else {
      console.warn(`No value found for ${placeholder}`);
    }
  }

  let baseFilename = template.replace(/\.(pdf|csv|json|xml)$/i, '');

  const appendTimestamp = config.appendTimestamp === true;
  const timestampFormat = config.timestampFormat || 'YYYYMMDD';

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
    baseFilename = `${baseFilename}_${timestamp}`;
  }

  const renamePdf = config.renamePdf !== false;
  const renameCsv = config.renameCsv === true;
  const renameJson = config.renameJson === true;
  const renameXml = config.renameXml === true;

  const renamedFilenames: any = {};
  if (renamePdf) {
    contextData.renamedPdfFilename = `${baseFilename}.pdf`;
    renamedFilenames.pdf = contextData.renamedPdfFilename;
  }
  if (renameCsv) {
    contextData.renamedCsvFilename = `${baseFilename}.csv`;
    renamedFilenames.csv = contextData.renamedCsvFilename;
  }
  if (renameJson) {
    contextData.renamedJsonFilename = `${baseFilename}.json`;
    renamedFilenames.json = contextData.renamedJsonFilename;
  }
  if (renameXml) {
    contextData.renamedXmlFilename = `${baseFilename}.xml`;
    renamedFilenames.xml = contextData.renamedXmlFilename;
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
  } else {
    const ext = formatType === 'CSV' ? '.csv' : formatType === 'XML' ? '.xml' : formatType === 'JSON' ? '.json' : '.pdf';
    primaryFilename = `${baseFilename}${ext}`;
  }

  contextData.renamedFilename = primaryFilename;
  contextData.actualFilename = primaryFilename;
  console.log('Renamed file:', primaryFilename);

  return { renamedFilenames, primaryFilename, baseFilename };
}
