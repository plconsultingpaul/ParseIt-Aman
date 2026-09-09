import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.24.1"
import { createClient } from "npm:@supabase/supabase-js@2"
import * as pdfjs from "npm:pdfjs-dist@3.11.174"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

const MIN_TEXT_LENGTH_THRESHOLD = 50

interface DetectionRequest {
  pdfBase64: string
  extractionTypes: Array<{
    id: string
    name: string
    autoDetectInstructions: string
    formatType: string
  }>
}

interface DetectionResult {
  detectedTypeId: string | null
  confidence: 'high' | 'medium' | 'low' | null
  reasoning?: string
}

async function extractTextFromPdfBase64(pdfBase64: string): Promise<string> {
  try {
    const binaryString = atob(pdfBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const pdf = await pdfjs.getDocument({ data: bytes }).promise
    const textParts: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: { str?: string }) => item.str || '')
        .join(' ')
      textParts.push(pageText)
    }

    return textParts.join('\n\n')
  } catch (error) {
    console.warn('PDF.js text extraction failed:', error)
    return ''
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
    const { pdfBase64, extractionTypes }: DetectionRequest = await req.json()

    if (extractionTypes.length === 0) {
      throw new Error('No extraction types available for detection')
    }

    const detectableTypes = extractionTypes.filter(type =>
      type.autoDetectInstructions && type.autoDetectInstructions.trim()
    )

    if (detectableTypes.length === 0) {
      return new Response(
        JSON.stringify({
          detectedTypeId: null,
          confidence: null,
          reasoning: 'No extraction types have auto-detection instructions configured'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const extractedText = await extractTextFromPdfBase64(pdfBase64)
    const useTextBasedDetection = extractedText.trim().length >= MIN_TEXT_LENGTH_THRESHOLD

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: activeKeyData } = await supabase
      .from("gemini_api_keys")
      .select("id, api_key")
      .eq("is_active", true)
      .maybeSingle();

    if (!activeKeyData?.api_key) {
      throw new Error('No active Gemini API key found. Please configure one in Settings → Gemini Configuration.');
    }

    let modelName = "gemini-2.5-pro";
    const { data: activeModelData } = await supabase
      .from("gemini_models")
      .select("model_name")
      .eq("api_key_id", activeKeyData.id)
      .eq("is_active", true)
      .maybeSingle();

    if (activeModelData?.model_name) {
      modelName = activeModelData.model_name;
    }

    const genAI = new GoogleGenerativeAI(activeKeyData.api_key)
    const model = genAI.getGenerativeModel({ model: modelName })

    const typeInstructions = detectableTypes
      .map(type => `
TYPE ID: ${type.id}
TYPE NAME: ${type.name}
DETECTION CRITERIA: ${type.autoDetectInstructions}
FORMAT: ${type.formatType}
---`)
      .join('\n')

    const textBasedPrompt = `
You are a document classification AI. Your task is to analyze the provided document text and determine which extraction type should be used based on the content.

EXTRACTED DOCUMENT TEXT:
${extractedText}

AVAILABLE EXTRACTION TYPES:
${typeInstructions}

CLASSIFICATION INSTRUCTIONS:
1. Analyze the document text content for key indicators
2. Compare against each extraction type's detection criteria
3. Look for document titles, company names, specific fields, or document patterns

RESPONSE FORMAT:
You must respond with ONLY a JSON object in this exact format:
{
  "detectedTypeId": "TYPE_ID_HERE_OR_NULL",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of why this type was selected or why no match was found"
}

IMPORTANT RULES:
- If you find a clear match, use the exact TYPE ID from the list above
- If no extraction type clearly matches the document, set "detectedTypeId" to null
- Confidence levels: "high" (90%+), "medium" (70-89%), "low" (50-69%)
- Return ONLY the JSON object, no additional text or formatting
`

    const imageBasedPrompt = `
You are a document classification AI. Your task is to analyze the provided PDF document and determine which extraction type should be used based on visual content and structure.

AVAILABLE EXTRACTION TYPES:
${typeInstructions}

CLASSIFICATION INSTRUCTIONS:
1. Analyze the document's visual layout, structure, and any visible text
2. Compare against each extraction type's detection criteria
3. Look for document titles, form layouts, company names, logos, or document patterns

RESPONSE FORMAT:
You must respond with ONLY a JSON object in this exact format:
{
  "detectedTypeId": "TYPE_ID_HERE_OR_NULL",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of why this type was selected or why no match was found"
}

IMPORTANT RULES:
- If you find a clear match, use the exact TYPE ID from the list above
- If no extraction type clearly matches the document, set "detectedTypeId" to null
- Confidence levels: "high" (90%+), "medium" (70-89%), "low" (50-69%)
- Return ONLY the JSON object, no additional text or formatting
`

    let result
    if (useTextBasedDetection) {
      result = await model.generateContent(textBasedPrompt)
    } else {
      result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        imageBasedPrompt
      ])
    }

    const response = await result.response
    let responseText = response.text().trim()

    // Clean up the response - remove any markdown formatting
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Parse the AI response
    try {
      const detectionResult = JSON.parse(responseText)
      
      // Validate the response structure
      if (typeof detectionResult !== 'object' || detectionResult === null) {
        throw new Error('Invalid response format from AI')
      }

      const { detectedTypeId, confidence, reasoning } = detectionResult

      // Validate detectedTypeId
      if (detectedTypeId !== null && typeof detectedTypeId !== 'string') {
        throw new Error('Invalid detectedTypeId in AI response')
      }

      // If a type ID was returned, verify it exists in our extraction types
      if (detectedTypeId && !extractionTypes.find(type => type.id === detectedTypeId)) {
        console.warn('AI returned unknown extraction type ID:', detectedTypeId)
        return new Response(
          JSON.stringify({
            detectedTypeId: null,
            confidence: null,
            reasoning: 'AI returned an unknown extraction type ID'
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      // Validate confidence level
      const validConfidenceLevels = ['high', 'medium', 'low']
      const validatedConfidence = validConfidenceLevels.includes(confidence) ? confidence : null

      return new Response(
        JSON.stringify({
          detectedTypeId: detectedTypeId,
          confidence: validatedConfidence,
          reasoning: typeof reasoning === 'string' ? reasoning : 'No reasoning provided'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )

    } catch (parseError) {
      console.error('Failed to parse AI detection response:', parseError)
      console.error('Raw AI response:', responseText)
      throw new Error('AI returned an invalid response format. Please try again.')
    }

  } catch (error) {
    console.error("PDF type detection error:", error)
    
    return new Response(
      JSON.stringify({ 
        error: "PDF type detection failed", 
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})