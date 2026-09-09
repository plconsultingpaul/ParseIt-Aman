import React, { useState, useRef } from 'react';
import { Upload, FileText, Brain, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { detectExtractionType } from '../../lib/geminiDetector';
import { splitPdfIntoLogicalDocuments, splitPdfWithPageGroups } from '../../lib/pdfUtils';
import type { ExtractionType, DetectionResult, VendorExtractionRule, PageGroupConfig } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { getAuthHeaders } from '../../lib/supabase';

interface AutoDetectPdfUploadSectionProps {
  extractionTypes: ExtractionType[];
  onDetectionComplete: (
    uploadedFile: File,
    pdfPages: File[],
    detectedTypeId: string | null,
    detectionResult: DetectionResult,
    pageGroupConfigs?: PageGroupConfig[],
    pageRangeInfo?: { totalPages: number; usedPages: number[]; unusedPages: number[] },
    originalPdfFile?: File
  ) => void;
}

export default function AutoDetectPdfUploadSection({
  extractionTypes,
  onDetectionComplete
}: AutoDetectPdfUploadSectionProps) {
  const { user } = useAuth();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [detectionError, setDetectionError] = useState<string>('');
  const [vendorRules, setVendorRules] = useState<VendorExtractionRule[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filterPagesByProcessingMode = (
    allPages: File[],
    extractionType?: ExtractionType
  ): File[] => {
    if (!extractionType?.pageProcessingMode || extractionType.pageProcessingMode === 'all') {
      return allPages;
    }

    const filteredPages: File[] = [];

    if (extractionType.pageProcessingMode === 'single') {
      const targetPage = extractionType.pageProcessingSinglePage || 1;
      if (targetPage <= allPages.length) {
        filteredPages.push(allPages[targetPage - 1]);
      }
    } else if (extractionType.pageProcessingMode === 'range') {
      const rangeStart = extractionType.pageProcessingRangeStart || 1;
      const rangeEnd = Math.min(extractionType.pageProcessingRangeEnd || 1, allPages.length);

      if (rangeStart <= allPages.length) {
        filteredPages.push(...allPages.slice(rangeStart - 1, rangeEnd));
      }
    }

    return filteredPages;
  };

  // Load vendor rules if user is a vendor
  React.useEffect(() => {
    const loadVendorRules = async () => {
      if (user?.role === 'vendor') {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const headers = await getAuthHeaders();

          const response = await fetch(`${supabaseUrl}/rest/v1/vendor_extraction_rules?vendor_id=eq.${user.id}&is_enabled=eq.true&order=priority.asc`, {
            headers
          });

          if (response.ok) {
            const data = await response.json();
            const rules: VendorExtractionRule[] = data.map((rule: any) => ({
              id: rule.id,
              vendorId: rule.vendor_id,
              ruleName: rule.rule_name,
              autoDetectInstructions: rule.auto_detect_instructions,
              extractionTypeId: rule.extraction_type_id,
              transformationTypeId: rule.transformation_type_id,
              processingMode: rule.processing_mode,
              priority: rule.priority,
              isEnabled: rule.is_enabled,
              createdAt: rule.created_at,
              updatedAt: rule.updated_at
            }));
            
            setVendorRules(rules);
          }
        } catch (error) {
          console.error('Failed to load vendor rules:', error);
        }
      }
    };
    
    loadVendorRules();
  }, [user]);

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
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      handlePdfUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handlePdfUpload(files[0]);
    }
  };

  const handlePdfUpload = async (file: File) => {
    setUploadedFile(file);
    setIsProcessingPdf(true);
    setDetectionResult(null);
    setDetectionError('');

    try {
      // First, run AI detection on the entire PDF to determine transformation type
      const initialDetectionResult = await detectExtractionType({
        pdfFile: file,
        extractionTypes,
        vendorRules: user?.role === 'vendor' ? vendorRules : undefined
      });

      // Determine the transformation type to get grouping settings
      let detectedTransformationType = null;
      if (initialDetectionResult.detectedTypeId) {
        detectedTransformationType = extractionTypes.find(type => type.id === initialDetectionResult.detectedTypeId);
      }
      
      // Use the first transformation type as fallback if no detection
      const transformationType = detectedTransformationType || extractionTypes[0];
      
      // === CRITICAL DEBUG: TRANSFORMATION TYPE CONFIGURATION ===
      console.log('🔍 === TRANSFORMATION TYPE DEBUG - AutoDetectPdfUploadSection ===');
      console.log('🔍 Initial detection result:', initialDetectionResult);
      console.log('🔍 detectedTransformationType:', detectedTransformationType);
      console.log('🔍 extractionTypes[0] fallback:', extractionTypes[0]);
      console.log('🔍 Final transformationType used:', transformationType);
      
      if (transformationType) {
        console.log('🔍 transformationType properties:');
        console.log('🔍   - id:', transformationType.id);
        console.log('🔍   - name:', transformationType.name);
        console.log('🔍   - pagesPerGroup:', transformationType.pagesPerGroup);
        console.log('🔍   - pagesPerGroup type:', typeof transformationType.pagesPerGroup);
        console.log('🔍   - documentStartDetectionEnabled:', transformationType.documentStartDetectionEnabled);
        console.log('🔍   - documentStartPattern:', transformationType.documentStartPattern);
        
        // Test each condition separately
        const hasPagesPerGroup = transformationType.pagesPerGroup !== undefined && transformationType.pagesPerGroup !== null;
        const pagesPerGroupIsNumber = typeof transformationType.pagesPerGroup === 'number';
        const pagesPerGroupGreaterThan1 = transformationType.pagesPerGroup > 1;
        const hasDocumentDetection = transformationType.documentStartDetectionEnabled === true;
        
        console.log('🔍 Condition breakdown:');
        console.log('🔍   - hasPagesPerGroup:', hasPagesPerGroup);
        console.log('🔍   - pagesPerGroupIsNumber:', pagesPerGroupIsNumber);
        console.log('🔍   - pagesPerGroupGreaterThan1:', pagesPerGroupGreaterThan1);
        console.log('🔍   - hasDocumentDetection:', hasDocumentDetection);
        
        const shouldUseAdvancedSplitting = (hasPagesPerGroup && pagesPerGroupIsNumber && pagesPerGroupGreaterThan1) || hasDocumentDetection;
        console.log('🔍   - shouldUseAdvancedSplitting:', shouldUseAdvancedSplitting);
      } else {
        console.log('🔍 ❌ No transformation type available!');
      }
      
      // Get total page count for tracking (load PDF once)
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const totalPages = pdfDoc.getPageCount();

      // Split PDF into logical documents based on transformation type settings
      let logicalDocuments: File[] = [];
      let usedPageGroupConfigs: PageGroupConfig[] | undefined = undefined;
      const usedPages: number[] = [];

      // PRIORITY 1: Check if page group configurations exist (manual configuration)
      const hasPageGroupConfigs = transformationType &&
        transformationType.pageGroupConfigs &&
        transformationType.pageGroupConfigs.length > 0;

      console.log('🚨 === FINAL SPLITTING DECISION ===');
      console.log('🚨 transformationType exists:', !!transformationType);
      console.log('🚨 hasPageGroupConfigs:', hasPageGroupConfigs);

      if (hasPageGroupConfigs) {
        console.log('✅ === USING PAGE GROUP CONFIGURATIONS (MANUAL) ===');
        console.log('✅ Transformation type:', transformationType.name);
        console.log('✅ Page group configs count:', transformationType.pageGroupConfigs!.length);
        console.log('✅ Page group configs:', transformationType.pageGroupConfigs!.map((config, idx) => ({
          order: config.groupOrder,
          pagesPerGroup: config.pagesPerGroup,
          pattern: config.smartDetectionPattern,
          processMode: config.processMode,
          workflowId: config.workflowId
        })));

        // Use page group configuration splitting with AI support
        const pageGroupResults = await splitPdfWithPageGroups(
          file,
          transformationType.pageGroupConfigs!
        );
        logicalDocuments = pageGroupResults.map(result => result.file);
        usedPageGroupConfigs = transformationType.pageGroupConfigs;

        pageGroupResults.forEach(result => {
          if (result.assignedPages && result.assignedPages.length > 0) {
            result.assignedPages.forEach(page => {
              if (!usedPages.includes(page)) {
                usedPages.push(page);
              }
            });
          } else {
            for (let page = result.originalPdfPageStart; page <= result.originalPdfPageEnd; page++) {
              if (!usedPages.includes(page)) {
                usedPages.push(page);
              }
            }
          }
        });

        console.log('✅ Page group splitting completed, created', logicalDocuments.length, 'logical documents');
        console.log('✅ Document names:', logicalDocuments.map(doc => doc.name));
        console.log('✅ Used pages:', usedPages.sort((a, b) => a - b));
      } else {
        // PRIORITY 2: Check if we should use advanced splitting based on main transformation type settings
        const shouldUseAdvancedSplitting = transformationType && (
          (transformationType.pagesPerGroup &&
           typeof transformationType.pagesPerGroup === 'number' &&
           transformationType.pagesPerGroup > 1) ||
          (transformationType.documentStartDetectionEnabled === true)
        );

        console.log('🚨 shouldUseAdvancedSplitting (main settings):', shouldUseAdvancedSplitting);
        if (transformationType) {
          console.log('🚨 pagesPerGroup condition:', transformationType.pagesPerGroup && typeof transformationType.pagesPerGroup === 'number' && transformationType.pagesPerGroup > 1);
          console.log('🚨 documentStartDetection condition:', transformationType.documentStartDetectionEnabled === true);
        }

        if (shouldUseAdvancedSplitting) {
          console.log('✅ === USING ADVANCED PDF SPLITTING (MAIN SETTINGS) ===');
          console.log('✅ Transformation type:', transformationType.name);
          console.log('✅ Splitting options:', {
            pagesPerGroup: transformationType.pagesPerGroup,
            documentStartPattern: transformationType.documentStartPattern,
            documentStartDetectionEnabled: transformationType.documentStartDetectionEnabled
          });

          logicalDocuments = await splitPdfIntoLogicalDocuments(file, {
            pagesPerGroup: transformationType.pagesPerGroup || 1,
            documentStartPattern: transformationType.documentStartPattern,
            documentStartDetectionEnabled: transformationType.documentStartDetectionEnabled || false
          });

          console.log('✅ Advanced splitting completed, created', logicalDocuments.length, 'logical documents');
          console.log('✅ Document names:', logicalDocuments.map(doc => doc.name));
        } else {
        console.log('⚠️ === USING SIMPLE SINGLE-PAGE SPLITTING ===');
        console.log('⚠️ Reason: Advanced grouping conditions not met');
        if (transformationType) {
          console.log('⚠️ Detailed analysis:');
          console.log('⚠️   - transformationType exists: true');
          console.log('⚠️   - pagesPerGroup value:', transformationType.pagesPerGroup);
          console.log('⚠️   - pagesPerGroup type:', typeof transformationType.pagesPerGroup);
          console.log('⚠️   - pagesPerGroup > 1:', transformationType.pagesPerGroup > 1);
          console.log('⚠️   - documentStartDetectionEnabled:', transformationType.documentStartDetectionEnabled);
          console.log('⚠️   - documentStartDetectionEnabled type:', typeof transformationType.documentStartDetectionEnabled);
        } else {
          console.log('⚠️   - transformationType: null/undefined');
        }

        // Fall back to single-page splitting for backward compatibility
        console.log('⚠️ Creating', totalPages, 'individual page files (single-page splitting)');

        for (let i = 0; i < totalPages; i++) {
          const singlePageDoc = await PDFDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
          singlePageDoc.addPage(copiedPage);

          const pdfBytes = await singlePageDoc.save();
          const pageFile = new File([pdfBytes], `${file.name.replace('.pdf', '')}_page_${i + 1}.pdf`, {
            type: 'application/pdf'
          });

          logicalDocuments.push(pageFile);
          usedPages.push(i + 1); // Track this page as used (1-indexed)
        }

        console.log('⚠️ Simple splitting completed, created', logicalDocuments.length, 'individual pages');
        }
      }

      // Calculate unused pages
      const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
      const unusedPages = allPages.filter(page => !usedPages.includes(page));

      console.log('🏁 === PDF SPLITTING COMPLETE ===');
      console.log('🏁 Total pages in PDF:', totalPages);
      console.log('🏁 Total logical documents created:', logicalDocuments.length);
      console.log('🏁 Document names:', logicalDocuments.map(doc => doc.name));
      console.log('🏁 Used pages:', usedPages.sort((a, b) => a - b));
      console.log('🏁 Unused pages:', unusedPages);
      console.log('🏁 Used page group configs:', usedPageGroupConfigs ? 'YES' : 'NO');

      // Apply page processing filtering if detected extraction type has settings
      // Only apply when not using page group configs (those are for transformations)
      let finalLogicalDocuments = logicalDocuments;
      if (!hasPageGroupConfigs && initialDetectionResult.detectedTypeId) {
        const detectedType = extractionTypes.find(t => t.id === initialDetectionResult.detectedTypeId);
        if (detectedType?.pageProcessingMode && detectedType.pageProcessingMode !== 'all') {
          console.log('🔧 Applying page processing filter:', detectedType.pageProcessingMode);
          const beforeFilterCount = finalLogicalDocuments.length;
          finalLogicalDocuments = filterPagesByProcessingMode(finalLogicalDocuments, detectedType);
          console.log(`🔧 Filtered from ${beforeFilterCount} to ${finalLogicalDocuments.length} pages`);
        }
      }

      setIsProcessingPdf(false);

      // Use the initial detection result
      setDetectionResult(initialDetectionResult);
      setIsDetecting(false);

      // Notify parent component with the logical documents and page range info
      onDetectionComplete(
        file,
        finalLogicalDocuments,
        initialDetectionResult.detectedTypeId,
        initialDetectionResult,
        usedPageGroupConfigs,
        {
          totalPages,
          usedPages: usedPages.sort((a, b) => a - b),
          unusedPages
        },
        file  // Pass original PDF file
      );

    } catch (error) {
      setIsProcessingPdf(false);
      setIsDetecting(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process PDF or detect extraction type';
      setDetectionError(errorMessage);
      console.error('Auto-detection error:', error);

      // Still notify parent with null detection if PDF processing succeeded
      if (!isProcessingPdf) {
        try {
          // Try to get pages even if detection failed - use simple splitting as fallback
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const pageCount = pdfDoc.getPageCount();
          const pages: File[] = [];

          for (let i = 0; i < pageCount; i++) {
            const singlePageDoc = await PDFDocument.create();
            const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
            singlePageDoc.addPage(copiedPage);
            
            const pdfBytes = await singlePageDoc.save();
            const pageFile = new File([pdfBytes], `${file.name.replace('.pdf', '')}_page_${i + 1}.pdf`, {
              type: 'application/pdf'
            });
            
            pages.push(pageFile);
          }

          onDetectionComplete(file, pages, null, {
            detectedTypeId: null,
            confidence: null,
            reasoning: errorMessage
          });
        } catch (pdfError) {
          // If even PDF processing fails, just notify with empty pages
          onDetectionComplete(file, [], null, {
            detectedTypeId: null,
            confidence: null,
            reasoning: errorMessage
          });
        }
      }
    }
  };

  const getDetectionStatusIcon = () => {
    if (isDetecting || isProcessingPdf) {
      return <Brain className="h-6 w-6 text-blue-600 animate-pulse" />;
    }
    
    if (detectionError) {
      return <XCircle className="h-6 w-6 text-red-600" />;
    }
    
    if (detectionResult) {
      if (detectionResult.detectedTypeId) {
        return detectionResult.confidence === 'high' 
          ? <CheckCircle className="h-6 w-6 text-green-600" />
          : <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      } else {
        return <AlertTriangle className="h-6 w-6 text-orange-600" />;
      }
    }
    
    return <Brain className="h-6 w-6 text-purple-600" />;
  };

  const getDetectionStatusText = () => {
    if (isProcessingPdf) {
      return 'Processing PDF...';
    }
    
    if (isDetecting) {
      return 'AI is analyzing document...';
    }
    
    if (detectionError) {
      return `Detection failed: ${detectionError}`;
    }
    
    if (detectionResult) {
      if (detectionResult.detectedTypeId) {
        const detectedType = extractionTypes.find(type => type.id === detectionResult.detectedTypeId);
        if (detectionResult.isVendorRule && detectionResult.detectedRuleId) {
          const vendorRule = vendorRules.find(rule => rule.id === detectionResult.detectedRuleId);
          const ruleName = vendorRule?.ruleName || 'Unknown Rule';
          return `Detected: ${ruleName} (${detectionResult.confidence} confidence)`;
        } else {
          const typeName = detectedType?.name || 'Unknown Type';
          return `Detected: ${typeName} (${detectionResult.confidence} confidence)`;
        }
      } else {
        return 'Could not determine extraction type - please select manually';
      }
    }
    
    return 'Ready for AI-powered type detection';
  };

  const getStatusColor = () => {
    if (isDetecting || isProcessingPdf) {
      return 'text-blue-600';
    }
    
    if (detectionError) {
      return 'text-red-600';
    }
    
    if (detectionResult) {
      if (detectionResult.detectedTypeId) {
        return detectionResult.confidence === 'high' ? 'text-green-600' : 'text-yellow-600';
      } else {
        return 'text-orange-600';
      }
    }
    
    return 'text-purple-600';
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-3">
        <div className="flex items-center space-x-2">
          <Brain className="h-4 w-4 text-purple-600" />
          <span>{user?.role === 'vendor' ? 'Upload PDF Document' : 'AI Auto-Detection Upload'}</span>
        </div>
      </label>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-800/30'
            : uploadedFile
            ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
            : 'border-orange-200 bg-orange-25 hover:border-orange-400 hover:bg-orange-50 dark:border-orange-600 dark:bg-orange-900/20 dark:hover:border-orange-500 dark:hover:bg-orange-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {uploadedFile ? (
          <div className="space-y-3">
            <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto" />
            <p className="text-blue-700 dark:text-blue-300 font-medium text-sm">{uploadedFile.name}</p>
            <p className="text-xs text-blue-600">
              {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            
            {/* Detection Status */}
            <div className="border-t border-blue-200 pt-3 mt-3">
              <div className="flex items-center justify-center space-x-2 mb-2">
                {getDetectionStatusIcon()}
                <span className={`text-sm font-medium ${getStatusColor()}`}>
                  AI Detection Status
                </span>
              </div>
              <p className={`text-xs ${getStatusColor()}`}>
                {getDetectionStatusText()}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center space-x-2">
              <Upload className="h-8 w-8 text-orange-400" />
              <Brain className="h-6 w-6 text-orange-500" />
            </div>
            <p className="text-orange-600 font-medium text-sm">AI-Powered Type Detection</p>
            <p className="text-xs text-orange-500">Upload PDF to automatically detect extraction type</p>
          </div>
        )}
      </div>

    </div>
  );
}