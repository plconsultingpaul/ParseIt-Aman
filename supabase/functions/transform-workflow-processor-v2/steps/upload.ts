import { Buffer } from "node:buffer";

export async function executeSftpUpload(
  step: any,
  contextData: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  formatType: string
): Promise<any> {
  console.log('📤 === EXECUTING SFTP UPLOAD STEP ===');
  const config = step.config_json || {};
  console.log('🔧 SFTP upload config:', JSON.stringify(config, null, 2));

  console.log('📋 Fetching default SFTP configuration...');
  const sftpConfigResponse = await fetch(`${supabaseUrl}/rest/v1/sftp_config?limit=1`, {
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey
    }
  });
  if (!sftpConfigResponse.ok) {
    throw new Error(`Failed to fetch SFTP configuration: ${sftpConfigResponse.status} ${sftpConfigResponse.statusText}`);
  }
  const sftpConfigs = await sftpConfigResponse.json();
  if (!sftpConfigs || sftpConfigs.length === 0) {
    throw new Error('No SFTP configuration found. Please configure SFTP settings in Settings.');
  }
  const sftpConfig = sftpConfigs[0];
  console.log('✅ SFTP configuration loaded:', sftpConfig.name || sftpConfig.host);

  let fileContent = '';
  let filename = contextData.renamedFilename || contextData.actualFilename || contextData.pdfFilename || 'document';

  if (config.uploadType === 'pdf') {
    console.log('📄 Uploading PDF file');
    if (contextData.renamedPdfFilename) {
      filename = contextData.renamedPdfFilename;
      console.log('✅ Using renamed PDF filename:', filename);
    } else if (!filename.toLowerCase().endsWith('.pdf')) {
      filename = `${filename}.pdf`;
    }
    if (!contextData.pdfBase64) {
      throw new Error('PDF base64 data not available');
    }
    fileContent = contextData.pdfBase64;
  } else if (config.uploadType === 'json') {
    console.log('📄 Uploading JSON file');
    if (contextData.renamedJsonFilename) {
      filename = contextData.renamedJsonFilename;
      console.log('✅ Using renamed JSON filename:', filename);
    } else if (!filename.toLowerCase().endsWith('.json')) {
      filename = filename.replace(/\.(pdf|json|xml|csv)$/i, '') + '.json';
    }
    const dataToUpload = contextData.extractedData || contextData;
    fileContent = Buffer.from(JSON.stringify(dataToUpload, null, 2)).toString('base64');
  } else if (config.uploadType === 'xml') {
    console.log('📄 Uploading XML file');
    if (contextData.renamedXmlFilename) {
      filename = contextData.renamedXmlFilename;
      console.log('✅ Using renamed XML filename:', filename);
    } else if (!filename.toLowerCase().endsWith('.xml')) {
      filename = filename.replace(/\.(pdf|json|xml|csv)$/i, '') + '.xml';
    }
    const dataToUpload = contextData.extractedData || contextData;
    fileContent = Buffer.from(JSON.stringify(dataToUpload, null, 2)).toString('base64');
  } else if (config.uploadType === 'csv') {
    console.log('📊 === UPLOADING CSV FILE ===');
    if (contextData.renamedCsvFilename) {
      filename = contextData.renamedCsvFilename;
      console.log('✅ Using renamed CSV filename:', filename);
    } else if (!filename.toLowerCase().endsWith('.csv')) {
      filename = filename.replace(/\.(pdf|json|xml|csv)$/i, '') + '.csv';
    }
    console.log('📊 Searching for CSV data in contextData...');
    console.log('📊 contextData.extractedData type:', typeof contextData.extractedData);
    console.log('📊 contextData.originalExtractedData type:', typeof contextData.originalExtractedData);
    let csvData = null;
    if (contextData.extractedData && typeof contextData.extractedData === 'string') {
      console.log('✅ Found CSV data in extractedData (string)');
      csvData = contextData.extractedData;
      console.log('📊 CSV data length:', csvData.length);
      console.log('📊 CSV data preview (first 200 chars):', csvData.substring(0, 200));
      console.log('📊 CSV data preview (last 100 chars):', csvData.substring(Math.max(0, csvData.length - 100)));
    } else if (contextData.originalExtractedData && typeof contextData.originalExtractedData === 'string') {
      console.log('✅ Found CSV data in originalExtractedData (string)');
      csvData = contextData.originalExtractedData;
      console.log('📊 CSV data length:', csvData.length);
      console.log('📊 CSV data preview (first 200 chars):', csvData.substring(0, 200));
      console.log('📊 CSV data preview (last 100 chars):', csvData.substring(Math.max(0, csvData.length - 100)));
    } else {
      console.error('❌ CSV data not found');
      console.error('- extractedData type:', typeof contextData.extractedData);
      console.error('- originalExtractedData type:', typeof contextData.originalExtractedData);
      console.error('- extractedData value:', contextData.extractedData);
      console.error('- originalExtractedData value:', contextData.originalExtractedData);
      throw new Error('CSV data not available or not in string format');
    }
    fileContent = csvData;
    console.log('✅ CSV data prepared for upload, length:', fileContent.length);
    console.log('✅ CSV fileContent preview (first 200 chars):', fileContent.substring(0, 200));
  }

  console.log('📤 Calling SFTP upload function...');
  console.log('📄 Filename:', filename);
  console.log('📏 File content length:', fileContent.length);

  const uploadFileTypes: any = {};
  if (config.uploadType === 'pdf') {
    uploadFileTypes.pdf = true;
  } else if (config.uploadType === 'json') {
    uploadFileTypes.json = true;
  } else if (config.uploadType === 'xml') {
    uploadFileTypes.xml = true;
  } else if (config.uploadType === 'csv') {
    uploadFileTypes.csv = true;
  }

  let exactFilenameToPass: string | undefined = undefined;
  if (config.uploadType === 'pdf' && contextData.renamedPdfFilename) {
    exactFilenameToPass = contextData.renamedPdfFilename.replace(/\.(pdf|csv|json|xml)$/i, '');
    console.log('📤 Passing exact filename for PDF:', exactFilenameToPass);
  } else if (config.uploadType === 'csv' && contextData.renamedCsvFilename) {
    exactFilenameToPass = contextData.renamedCsvFilename.replace(/\.(pdf|csv|json|xml)$/i, '');
    console.log('📤 Passing exact filename for CSV:', exactFilenameToPass);
  } else if (config.uploadType === 'json' && contextData.renamedJsonFilename) {
    exactFilenameToPass = contextData.renamedJsonFilename.replace(/\.(pdf|csv|json|xml)$/i, '');
    console.log('📤 Passing exact filename for JSON:', exactFilenameToPass);
  } else if (config.uploadType === 'xml' && contextData.renamedXmlFilename) {
    exactFilenameToPass = contextData.renamedXmlFilename.replace(/\.(pdf|csv|json|xml)$/i, '');
    console.log('📤 Passing exact filename for XML:', exactFilenameToPass);
  } else if (contextData.renamedFilename) {
    exactFilenameToPass = contextData.renamedFilename.replace(/\.(pdf|csv|json|xml)$/i, '');
    console.log('📤 Passing exact filename (generic):', exactFilenameToPass);
  }

  console.log('🔍 === PREPARING CONTENT FOR SFTP ===');
  console.log('🔍 config.uploadType:', config.uploadType);
  console.log('🔍 fileContent type:', typeof fileContent);
  console.log('🔍 fileContent length:', fileContent ? fileContent.length : 0);
  console.log('🔍 formatType:', formatType);

  let contentForSftp;
  if (config.uploadType === 'csv') {
    console.log('✅ Detected CSV upload type');
    contentForSftp = fileContent;
    console.log('📤 === PREPARING CSV FOR SFTP ===');
    console.log('📤 contentForSftp type:', typeof contentForSftp);
    console.log('📤 contentForSftp length:', contentForSftp.length);
    console.log('📤 contentForSftp preview (first 300 chars):', contentForSftp.substring(0, 300));
    console.log('📤 contentForSftp preview (last 200 chars):', contentForSftp.substring(Math.max(0, contentForSftp.length - 200)));
    if (!contentForSftp || contentForSftp.trim() === '') {
      console.error('❌ CRITICAL: contentForSftp is empty!');
      console.error('❌ fileContent was:', fileContent);
      throw new Error('CSV content is empty before SFTP upload');
    }
  } else if (contextData.extractedData && typeof contextData.extractedData === 'object') {
    console.log('✅ Detected object type, converting to JSON');
    contentForSftp = JSON.stringify(contextData.extractedData);
  } else {
    console.log('⚠️ No valid content found, using empty object');
    contentForSftp = '{}';
  }

  console.log('🔍 === FINAL contentForSftp CHECK ===');
  console.log('🔍 contentForSftp type:', typeof contentForSftp);
  console.log('🔍 contentForSftp length:', contentForSftp ? contentForSftp.length : 0);
  console.log('🔍 contentForSftp is empty?:', !contentForSftp || contentForSftp.trim() === '');

  const sftpUploadPayload: any = {
    sftpConfig: {
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: sftpConfig.username,
      password: sftpConfig.password,
      xmlPath: sftpConfig.remote_path || '/ParseIt_XML',
      pdfPath: sftpConfig.pdf_path || '/ParseIt_PDF',
      jsonPath: sftpConfig.json_path || '/ParseIt_JSON',
      csvPath: sftpConfig.csv_path || '/ParseIt_CSV'
    },
    xmlContent: contentForSftp,
    pdfBase64: contextData.pdfBase64 || '',
    baseFilename: filename,
    originalFilename: contextData.originalPdfFilename || filename,
    formatType: formatType,
    uploadFileTypes: uploadFileTypes,
    pageGroupFilenameTemplate: contextData.pageGroupFilenameTemplate
  };

  if (exactFilenameToPass) {
    sftpUploadPayload.exactFilename = exactFilenameToPass;
    console.log('📤 Adding exactFilename to payload:', exactFilenameToPass);
  }
  if (config.sftpPathOverride) {
    sftpUploadPayload.sftpPathOverride = config.sftpPathOverride;
    console.log('📤 Adding sftpPathOverride to payload:', config.sftpPathOverride);
  }

  console.log('📤 === SFTP UPLOAD PAYLOAD DEBUG ===');
  console.log('📤 Payload xmlContent type:', typeof sftpUploadPayload.xmlContent);
  console.log('📤 Payload xmlContent length:', sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.length : 0);
  console.log('📤 Payload xmlContent preview (first 300):', sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.substring(0, 300) : 'EMPTY');
  console.log('📤 Payload xmlContent preview (last 200):', sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.substring(Math.max(0, sftpUploadPayload.xmlContent.length - 200)) : 'EMPTY');
  console.log('📤 SFTP upload payload structure:', JSON.stringify({
    ...sftpUploadPayload,
    pdfBase64: `[${sftpUploadPayload.pdfBase64.length} chars]`,
    xmlContent: `[${sftpUploadPayload.xmlContent ? sftpUploadPayload.xmlContent.length : 0} chars]`
  }, null, 2));

  const sftpUploadResponse = await fetch(`${supabaseUrl}/functions/v1/sftp-upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sftpUploadPayload)
  });

  console.log('📤 SFTP upload response status:', sftpUploadResponse.status);
  if (!sftpUploadResponse.ok) {
    const errorText = await sftpUploadResponse.text();
    console.error('❌ SFTP upload failed:', errorText);
    throw new Error(`SFTP upload failed: ${errorText}`);
  }

  const uploadResult = await sftpUploadResponse.json();
  console.log('✅ SFTP upload successful:', uploadResult);
  return { uploadResult, filename };
}
