import * as pdfjsLib from 'pdfjs-dist';
import { callGeminiProxy } from './geminiProxy';

const MIN_TEXT_LENGTH_THRESHOLD = 50;

export interface SmartDetectionRequest {
  pageText: string;
  pattern: string;
  confidenceThreshold?: number;
  apiKey?: string;
}

export interface SmartDetectionImageRequest {
  imageBase64: string;
  pattern: string;
  confidenceThreshold?: number;
  apiKey?: string;
}

export interface SmartDetectionResult {
  match: boolean;
  confidence: number;
  reasoning: string;
}

export async function detectPatternWithAI({
  pageText,
  pattern,
  confidenceThreshold = 0.7,
}: SmartDetectionRequest): Promise<SmartDetectionResult> {
  try {
    const prompt = `You are a pattern detection AI analyzing PDF text content. Your task is to determine if the provided text matches a given pattern or description.

PATTERN TO DETECT:
${pattern}

PAGE TEXT CONTENT:
${pageText}

INSTRUCTIONS:
1. Analyze the page text to determine if it matches the pattern description
2. The pattern may be:
   - A specific text string to find (e.g., "Transport Bourassa")
   - A descriptive condition (e.g., "If there is a dollar amount after TOTAL CDN")
   - A structural indicator (e.g., "Pages with invoice line items")
3. Be flexible with matching - consider:
   - Case variations (upper/lower case)
   - Minor spacing or formatting differences
   - Semantic meaning rather than exact text matching
4. Provide a confidence score from 0.0 to 1.0:
   - 1.0 = Perfect match, pattern clearly present
   - 0.7-0.9 = Strong match, pattern very likely present
   - 0.4-0.6 = Possible match, some indicators present
   - 0.0-0.3 = Weak or no match

RESPOND WITH VALID JSON ONLY (no markdown, no code blocks):
{
  "match": true or false (true if confidence >= threshold),
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why the pattern does or doesn't match"
}`;

    const responseText = await callGeminiProxy([prompt], 'smart detection (text)');
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const detectionResult = JSON.parse(cleaned);
    const finalMatch = detectionResult.confidence >= confidenceThreshold;

    return {
      match: finalMatch,
      confidence: detectionResult.confidence,
      reasoning: detectionResult.reasoning
    };

  } catch (error) {
    console.error('AI smart detection error:', error);
    throw new Error(`AI pattern detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function detectPatternWithAIImage({
  imageBase64,
  pattern,
  confidenceThreshold = 0.7,
}: SmartDetectionImageRequest): Promise<SmartDetectionResult> {
  try {
    const prompt = `You are a pattern detection AI analyzing a PDF page image. Your task is to determine if the page visually contains a given pattern or description.

PATTERN TO DETECT:
${pattern}

INSTRUCTIONS:
1. Analyze the page image to determine if it matches the pattern description
2. The pattern may be:
   - A specific text string to find (e.g., "Transport Bourassa")
   - A descriptive condition (e.g., "If there is a dollar amount after TOTAL CDN")
   - A structural indicator (e.g., "Pages with invoice line items")
3. Read any visible text in the image carefully
4. Be flexible with matching - consider:
   - Case variations (upper/lower case)
   - Minor spacing or formatting differences
   - Semantic meaning rather than exact text matching
5. Provide a confidence score from 0.0 to 1.0:
   - 1.0 = Perfect match, pattern clearly present
   - 0.7-0.9 = Strong match, pattern very likely present
   - 0.4-0.6 = Possible match, some indicators present
   - 0.0-0.3 = Weak or no match

RESPOND WITH VALID JSON ONLY (no markdown, no code blocks):
{
  "match": true or false (true if confidence >= threshold),
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why the pattern does or doesn't match"
}`;

    const responseText = await callGeminiProxy([
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64
        }
      },
      prompt
    ], 'smart detection (image)');

    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const detectionResult = JSON.parse(cleaned);
    const finalMatch = detectionResult.confidence >= confidenceThreshold;

    return {
      match: finalMatch,
      confidence: detectionResult.confidence,
      reasoning: detectionResult.reasoning
    };

  } catch (error) {
    console.error('AI smart detection (image) error:', error);
    throw new Error(`AI pattern detection (image) failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isTextSufficientForDetection(text: string): boolean {
  return text.trim().length >= MIN_TEXT_LENGTH_THRESHOLD;
}

export interface PageTextPreviewRequest {
  pdfFile: File;
}

export interface PageTextPreview {
  pageNumber: number;
  text: string;
  textLength: number;
}

export async function extractPageTextPreviews(pdfFile: File): Promise<PageTextPreview[]> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const previews: PageTextPreview[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
          .map((item: any) => {
            if ('str' in item) {
              return item.str;
            }
            return '';
          })
          .filter((str: string) => str.trim())
          .join(' ');

        previews.push({
          pageNumber: pageNum,
          text: pageText,
          textLength: pageText.length
        });
      } catch (pageError) {
        console.error(`Error extracting text from page ${pageNum}:`, pageError);
        previews.push({
          pageNumber: pageNum,
          text: '',
          textLength: 0
        });
      }
    }

    return previews;
  } catch (error) {
    console.error('Error extracting page text previews:', error);
    throw new Error(`Failed to extract page text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
