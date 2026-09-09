import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import type { ExtractionType } from '../../types';

interface PdfUploadSectionProps {
  onPdfUpload: (uploadedFile: File, pdfPages: File[]) => void;
  extractionType?: ExtractionType;
}

export default function PdfUploadSection({ onPdfUpload, extractionType }: PdfUploadSectionProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pdfPages, setPdfPages] = useState<File[]>([]);
  const [filePageCounts, setFilePageCounts] = useState<{ name: string; size: number; pages: number }[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [totalPagesBeforeFilter, setTotalPagesBeforeFilter] = useState(0);
  const [pageFilterWarnings, setPageFilterWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
    if (files.length > 0) {
      handlePdfUpload(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
      if (pdfFiles.length > 0) {
        handlePdfUpload(pdfFiles);
      }
    }
  };

  const filterPagesByProcessingMode = (
    allPages: File[],
    filePageCounts: { name: string; pages: number }[],
    extractionType?: ExtractionType
  ): { filteredPages: File[]; warnings: string[] } => {
    if (!extractionType?.pageProcessingMode || extractionType.pageProcessingMode === 'all') {
      return { filteredPages: allPages, warnings: [] };
    }

    const filteredPages: File[] = [];
    const warnings: string[] = [];
    let pageIndex = 0;

    for (const fileInfo of filePageCounts) {
      const filePages = allPages.slice(pageIndex, pageIndex + fileInfo.pages);

      if (extractionType.pageProcessingMode === 'single') {
        const targetPage = extractionType.pageProcessingSinglePage || 1;

        if (targetPage > fileInfo.pages) {
          warnings.push(`${fileInfo.name}: Page ${targetPage} not found (only has ${fileInfo.pages} page${fileInfo.pages !== 1 ? 's' : ''}), skipping`);
        } else {
          filteredPages.push(filePages[targetPage - 1]);
        }
      } else if (extractionType.pageProcessingMode === 'range') {
        const rangeStart = extractionType.pageProcessingRangeStart || 1;
        const rangeEnd = extractionType.pageProcessingRangeEnd || 1;

        if (rangeStart > fileInfo.pages) {
          warnings.push(`${fileInfo.name}: Page range ${rangeStart}-${rangeEnd} not found (only has ${fileInfo.pages} page${fileInfo.pages !== 1 ? 's' : ''}), skipping`);
        } else {
          const actualEnd = Math.min(rangeEnd, fileInfo.pages);
          const pagesToAdd = filePages.slice(rangeStart - 1, actualEnd);
          filteredPages.push(...pagesToAdd);

          if (rangeEnd > fileInfo.pages) {
            warnings.push(`${fileInfo.name}: Only extracted pages ${rangeStart}-${actualEnd} (requested ${rangeStart}-${rangeEnd})`);
          }
        }
      }

      pageIndex += fileInfo.pages;
    }

    return { filteredPages, warnings };
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handlePdfUpload = async (files: File[]) => {
    const fileBuffers: { file: File; buffer: ArrayBuffer }[] = [];
    for (const file of files) {
      try {
        const buffer = await readFileAsArrayBuffer(file);
        fileBuffers.push({ file, buffer });
      } catch (error) {
        console.error(`Error reading PDF ${file.name}:`, error);
      }
    }

    if (fileBuffers.length === 0) {
      console.error('No PDF files could be read');
      return;
    }

    setUploadedFiles(files);
    setIsProcessingPdf(true);
    setPdfPages([]);
    setFilePageCounts([]);
    setPageFilterWarnings([]);
    setTotalPagesBeforeFilter(0);

    try {
      const allPages: File[] = [];
      const pageCounts: { name: string; size: number; pages: number }[] = [];

      for (const { file, buffer } of fileBuffers) {
        try {
          const pdfDoc = await PDFDocument.load(buffer);
          const pageCount = pdfDoc.getPageCount();

          for (let i = 0; i < pageCount; i++) {
            const singlePageDoc = await PDFDocument.create();
            const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
            singlePageDoc.addPage(copiedPage);

            const pdfBytes = await singlePageDoc.save();
            const pageFile = new File(
              [pdfBytes],
              `${file.name.replace('.pdf', '')}_page_${i + 1}.pdf`,
              { type: 'application/pdf' }
            );

            allPages.push(pageFile);
          }

          pageCounts.push({
            name: file.name,
            size: file.size,
            pages: pageCount
          });
        } catch (error) {
          console.error(`Error processing PDF ${file.name}:`, error);
        }
      }

      const totalPages = allPages.length;
      setTotalPagesBeforeFilter(totalPages);

      const { filteredPages, warnings } = filterPagesByProcessingMode(allPages, pageCounts, extractionType);

      setPdfPages(filteredPages);
      setFilePageCounts(pageCounts);
      setPageFilterWarnings(warnings);
      onPdfUpload(files[0], filteredPages);
    } catch (error) {
      console.error('Error splitting PDFs:', error);
      onPdfUpload(files[0], []);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-3">
        <span className="text-gray-700 dark:text-gray-200">PDF Document</span>
      </label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-purple-400 bg-purple-50'
            : uploadedFiles.length > 0
            ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
            : 'border-purple-200 bg-purple-25 hover:border-purple-400 hover:bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20 dark:hover:border-purple-500 dark:hover:bg-purple-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {uploadedFiles.length > 0 ? (
          <div className="space-y-3">
            <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto" />

            {filePageCounts.length > 0 ? (
              <div className="space-y-2">
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {filePageCounts.map((fileInfo, index) => (
                    <div key={index} className="text-xs text-blue-700 dark:text-blue-300">
                      <span className="font-medium">{fileInfo.name}</span>
                      <span className="text-blue-600 dark:text-blue-400 ml-2">
                        ({(fileInfo.size / 1024 / 1024).toFixed(2)} MB • {fileInfo.pages} page{fileInfo.pages !== 1 ? 's' : ''})
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold">
                    Total: {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} • {pdfPages.length} page{pdfPages.length !== 1 ? 's' : ''}
                    {totalPagesBeforeFilter > 0 && totalPagesBeforeFilter !== pdfPages.length && (
                      <span className="ml-2 text-xs font-normal text-orange-600 dark:text-orange-400">
                        ({totalPagesBeforeFilter - pdfPages.length} filtered out)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {(uploadedFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB total
                  </p>
                  {extractionType?.pageProcessingMode && extractionType.pageProcessingMode !== 'all' && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {extractionType.pageProcessingMode === 'single' && (
                        <>Page {extractionType.pageProcessingSinglePage} from each PDF</>
                      )}
                      {extractionType.pageProcessingMode === 'range' && (
                        <>Pages {extractionType.pageProcessingRangeStart}-{extractionType.pageProcessingRangeEnd} from each PDF</>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-blue-700 dark:text-blue-300 font-medium text-sm">
                  {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {isProcessingPdf ? 'Processing...' : 'Ready to process'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-8 w-8 text-purple-400 mx-auto" />
            <p className="text-purple-600 font-medium text-sm">Click to upload or drag & drop files</p>
            <p className="text-xs text-purple-500">PDF files only • Multiple files supported</p>
          </div>
        )}
      </div>

      {pageFilterWarnings.length > 0 && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">Page Filtering Warnings</p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                {pageFilterWarnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}