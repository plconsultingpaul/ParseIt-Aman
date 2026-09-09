import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export async function extractTextFromPdfPages(pdfFile: File): Promise<string[]> {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Extract text items and join them with spaces
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        pageTexts.push(pageText);
      } catch (pageError) {
        console.error(`Error extracting text from page ${pageNum}:`, pageError);
        pageTexts.push(''); // Add empty string for failed pages
      }
    }

    return pageTexts;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}