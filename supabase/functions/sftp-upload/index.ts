import { Buffer } from "node:buffer"
import { PDFDocument } from "npm:pdf-lib@1.17.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

interface UploadRequest {
  sftpConfig: {
    host: string
    port: number
    username: string
    password: string
    xmlPath: string
    pdfPath: string
    jsonPath: string
    csvPath?: string
  }
  xmlContent: string
  pdfBase64: string
  baseFilename: string
  originalFilename?: string
  parseitIdMapping?: string
  useExistingParseitId?: number
  userId?: string
  extractionTypeId?: string
  transformationTypeId?: string
  formatType?: string
  customFilenamePart?: string
  exactFilename?: string
  pageGroupFilenameTemplate?: string
  pdfUploadStrategy?: 'all_pages_in_group' | 'specific_page_in_group'
  specificPageToUpload?: number
  sftpPathOverride?: string
  uploadFileTypes?: {
    json?: boolean
    pdf?: boolean
    xml?: boolean
    csv?: boolean
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const { sftpConfig, xmlContent, pdfBase64, baseFilename, originalFilename, parseitIdMapping, useExistingParseitId, userId, extractionTypeId, transformationTypeId, formatType, customFilenamePart, exactFilename, pageGroupFilenameTemplate, pdfUploadStrategy, specificPageToUpload, sftpPathOverride, uploadFileTypes }: UploadRequest = await req.json()

    console.log('=== SFTP UPLOAD DEBUG ===')
    console.log('Request received with fields:')
    console.log('- sftpConfig present:', !!sftpConfig)
    console.log('- sftpConfig.host:', sftpConfig?.host || 'MISSING')
    console.log('- sftpConfig.username:', sftpConfig?.username ? 'SET' : 'MISSING')
    console.log('- sftpConfig.password:', sftpConfig?.password ? 'SET' : 'MISSING')
    console.log('- sftpConfig.xmlPath:', sftpConfig?.xmlPath || 'MISSING')
    console.log('- sftpConfig.pdfPath:', sftpConfig?.pdfPath || 'MISSING')
    console.log('- sftpConfig.jsonPath:', sftpConfig?.jsonPath || 'MISSING')
    console.log('- sftpConfig.csvPath:', sftpConfig?.csvPath || 'MISSING')
    console.log('- sftpPathOverride:', sftpPathOverride || 'NOT SET')
    console.log('- xmlContent present:', !!xmlContent)
    console.log('- xmlContent type:', typeof xmlContent)
    console.log('- xmlContent length:', xmlContent?.length || 0)
    console.log('- pdfBase64 present:', !!pdfBase64)
    console.log('- pdfBase64 length:', pdfBase64?.length || 0)
    console.log('- baseFilename:', baseFilename || 'MISSING')
    console.log('- originalFilename:', originalFilename || 'MISSING')
    console.log('- exactFilename:', exactFilename || 'MISSING')
    console.log('- formatType:', formatType || 'MISSING')
    console.log('- pdfUploadStrategy:', pdfUploadStrategy || 'MISSING')
    console.log('- uploadFileTypes:', uploadFileTypes || 'MISSING (will default to all types)')

    if (!sftpConfig.host || !sftpConfig.username || !xmlContent || !pdfBase64 || !baseFilename) {
      console.log('=== VALIDATION FAILED ===')
      console.log('Missing required fields:')
      console.log('- sftpConfig.host:', !sftpConfig.host ? 'MISSING' : 'OK')
      console.log('- sftpConfig.username:', !sftpConfig.username ? 'MISSING' : 'OK')
      console.log('- xmlContent:', !xmlContent ? 'MISSING' : 'OK')
      console.log('- pdfBase64:', !pdfBase64 ? 'MISSING' : 'OK')
      console.log('- baseFilename:', !baseFilename ? 'MISSING' : 'OK')

      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const Client = (await import("ssh2-sftp-client")).default
    const sftp = new Client()

    try {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64')
      const pdfDoc = await PDFDocument.load(pdfBuffer)
      const pageCount = pdfDoc.getPageCount()

      console.log(`🔧 PDF received has ${pageCount} pages`)
      console.log(`🔧 pdfUploadStrategy: ${pdfUploadStrategy || 'all_pages_in_group (default)'})`)

      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase configuration missing')
      }

      console.log('🔌 === ATTEMPTING SFTP CONNECTION ===')
      console.log('🔌 SFTP Host:', sftpConfig.host)
      console.log('🔌 SFTP Port:', sftpConfig.port)

      await sftp.connect({
        host: sftpConfig.host,
        port: sftpConfig.port,
        username: sftpConfig.username,
        password: sftpConfig.password,
        readyTimeout: 30000,
        retries: 2,
        retry_minTimeout: 2000
      })
      console.log('✅ SFTP CONNECTION SUCCESSFUL')

      console.log('📁 === CREATING/VERIFYING SFTP DIRECTORIES ===')

      const effectivePdfPath = sftpPathOverride || sftpConfig.pdfPath
      const effectiveJsonPath = sftpPathOverride || sftpConfig.jsonPath
      const effectiveXmlPath = sftpPathOverride || sftpConfig.xmlPath
      const effectiveCsvPath = sftpPathOverride || sftpConfig.csvPath

      if (sftpPathOverride) {
        console.log('🔧 Using SFTP path override:', sftpPathOverride)
        console.log('🔧 Default pdfPath would have been:', sftpConfig.pdfPath)
      }

      await sftp.mkdir(effectiveXmlPath, true)
      await sftp.mkdir(effectivePdfPath, true)
      await sftp.mkdir(effectiveJsonPath, true)
      if (effectiveCsvPath) {
        await sftp.mkdir(effectiveCsvPath, true)
      }
      console.log('✅ ALL DIRECTORIES VERIFIED')

      const defaultUploadFileTypes = {
        json: true,
        pdf: true,
        xml: false,
        csv: false
      }

      const finalUploadFileTypes = uploadFileTypes || defaultUploadFileTypes
      console.log('📤 Upload file types:', finalUploadFileTypes)

      let parseitId = useExistingParseitId || null

      if (!parseitId) {
        console.log('🔢 Fetching next ParseIt ID...')
        const parseitResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_parseit_id`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey
          }
        })

        if (!parseitResponse.ok) {
          throw new Error('Failed to get ParseIt ID')
        }

        parseitId = await parseitResponse.json()
        console.log('✅ Got ParseIt ID:', parseitId)
      }

      const results: any[] = []
      const actualFilenames: string[] = []

      const pagesToProcess = pdfUploadStrategy === 'specific_page_in_group' && specificPageToUpload
        ? [specificPageToUpload]
        : Array.from({ length: pageCount }, (_, i) => i + 1)

      console.log(`📄 Processing ${pagesToProcess.length} page(s)...`)

      for (const pageNum of pagesToProcess) {
        console.log(`\n📄 === PROCESSING PAGE ${pageNum} ===`)

        let singlePagePdfBytes: Uint8Array
        if (pageCount === 1) {
          singlePagePdfBytes = pdfBuffer
        } else {
          const singlePageDoc = await PDFDocument.create()
          const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum - 1])
          singlePageDoc.addPage(copiedPage)
          singlePagePdfBytes = await singlePageDoc.save()
        }

        const singlePageBase64 = Buffer.from(singlePagePdfBytes).toString('base64')

        let finalFilenameBase: string

        console.log('🔧 Filename decision process:')
        console.log('  - pageGroupFilenameTemplate (page group config):', pageGroupFilenameTemplate || 'not provided')
        console.log('  - exactFilename (workflow rename):', exactFilename || 'not provided')
        console.log('  - baseFilename (may include extraction type):', baseFilename || 'not provided')
        console.log('  - originalFilename (original PDF):', originalFilename || 'not provided')
        console.log('  - customFilenamePart:', customFilenamePart || 'not provided')

        if (pageGroupFilenameTemplate) {
          finalFilenameBase = pageGroupFilenameTemplate
          console.log('  ✅ Using pageGroupFilenameTemplate from page group config')
        } else if (exactFilename) {
          finalFilenameBase = exactFilename
          console.log('  ✅ Using exactFilename from workflow rename')
        } else if (customFilenamePart) {
          finalFilenameBase = `${baseFilename}_${customFilenamePart}`
          console.log('  ✅ Using baseFilename with customFilenamePart')
        } else if (baseFilename && baseFilename !== '' && baseFilename !== 'document') {
          finalFilenameBase = baseFilename
          console.log('  ✅ Using baseFilename (extraction type or workflow default)')
        } else if (originalFilename) {
          const fileNameWithoutExt = originalFilename.replace(/\.(pdf|csv|json|xml)$/i, '')
          finalFilenameBase = fileNameWithoutExt
          console.log('  ✅ Using originalFilename (fallback)')
        } else {
          finalFilenameBase = 'document'
          console.log('  ⚠️ Using fallback: document')
        }

        console.log('  📝 Final filename base chosen:', finalFilenameBase)

        const shouldAppendPageNumber = pagesToProcess.length > 1

        const actualFilename = shouldAppendPageNumber
          ? `${finalFilenameBase}_${pageNum}.pdf`
          : `${finalFilenameBase}.pdf`

        const dataFilename = formatType === 'CSV'
          ? (shouldAppendPageNumber ? `${finalFilenameBase}_${pageNum}.csv` : `${finalFilenameBase}.csv`)
          : formatType === 'XML'
          ? (shouldAppendPageNumber ? `${finalFilenameBase}_${pageNum}.xml` : `${finalFilenameBase}.xml`)
          : (shouldAppendPageNumber ? `${finalFilenameBase}_${pageNum}.json` : `${finalFilenameBase}.json`)

        actualFilenames.push(actualFilename)

        const uploadedFiles: any = {}

        if (finalUploadFileTypes.pdf) {
          console.log(`📤 Uploading PDF: ${actualFilename}`)
          const pdfPath = `${effectivePdfPath}/${actualFilename}`

          try {
            await sftp.put(Buffer.from(singlePageBase64, 'base64'), pdfPath)
            console.log(`✅ PDF uploaded successfully: ${pdfPath}`)
            uploadedFiles.pdf = pdfPath
          } catch (pdfError) {
            console.error(`❌ Failed to upload PDF:`, pdfError)
            throw new Error(`PDF upload failed: ${pdfError.message}`)
          }
        } else {
          console.log('⏭️ Skipping PDF upload (not requested)')
        }

        if (finalUploadFileTypes.json && formatType === 'JSON') {
          console.log(`📤 Uploading JSON: ${dataFilename}`)
          const jsonPath = `${effectiveJsonPath}/${dataFilename}`

          try {
            await sftp.put(Buffer.from(xmlContent), jsonPath)
            console.log(`✅ JSON uploaded successfully: ${jsonPath}`)
            uploadedFiles.data = jsonPath
          } catch (jsonError) {
            console.error(`❌ Failed to upload JSON:`, jsonError)
            throw new Error(`JSON upload failed: ${jsonError.message}`)
          }
        }

        if (finalUploadFileTypes.xml && formatType === 'XML') {
          console.log(`📤 Uploading XML: ${dataFilename}`)
          const xmlPath = `${effectiveXmlPath}/${dataFilename}`

          try {
            await sftp.put(Buffer.from(xmlContent), xmlPath)
            console.log(`✅ XML uploaded successfully: ${xmlPath}`)
            uploadedFiles.data = xmlPath
          } catch (xmlError) {
            console.error(`❌ Failed to upload XML:`, xmlError)
            throw new Error(`XML upload failed: ${xmlError.message}`)
          }
        }

        if (finalUploadFileTypes.csv && formatType === 'CSV' && effectiveCsvPath) {
          console.log(`📤 Uploading CSV: ${dataFilename}`)
          const csvPath = `${effectiveCsvPath}/${dataFilename}`

          try {
            await sftp.put(Buffer.from(xmlContent), csvPath)
            console.log(`✅ CSV uploaded successfully: ${csvPath}`)
            uploadedFiles.data = csvPath
          } catch (csvError) {
            console.error(`❌ Failed to upload CSV:`, csvError)
            throw new Error(`CSV upload failed: ${csvError.message}`)
          }
        }

        results.push({
          page: pageNum,
          parseitId: parseitId,
          actualFilename: actualFilename,
          dataFilename: dataFilename,
          files: uploadedFiles
        })

        console.log(`✅ Page ${pageNum} processed successfully`)
      }

      await sftp.end()
      console.log('✅ SFTP connection closed')

      const responseData = {
        success: true,
        message: `Successfully processed PDF and uploaded ${results.length} file(s) with unique ParseIt IDs`,
        pageCount: pageCount,
        results: results,
        actualFilenames: actualFilenames,
        actualFilename: actualFilenames[0]
      }

      console.log('🎉 Upload completed:', responseData)

      return new Response(
        JSON.stringify(responseData),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )

    } catch (sftpError) {
      try {
        await sftp.end()
      } catch (closeError) {
        console.warn('Failed to close SFTP connection:', closeError)
      }
      throw sftpError
    }

  } catch (error) {
    console.error("SFTP upload error:", error)
    return new Response(
      JSON.stringify({
        error: "SFTP upload failed",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})