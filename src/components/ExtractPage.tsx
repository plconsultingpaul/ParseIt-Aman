import React, { useState } from 'react';
import { Settings, Brain, FileText, CheckCircle, Lock } from 'lucide-react';
import type { ExtractionType, TransformationType, SftpConfig, SettingsConfig, ApiConfig } from '../types';
import { useAuth } from '../hooks/useAuth';
import PdfUploadSection from './extract/PdfUploadSection';
import AutoDetectPdfUploadSection from './extract/AutoDetectPdfUploadSection';
import MultiPageProcessor from './extract/MultiPageProcessor';
import MultiPageTransformer from './transform/MultiPageTransformer';
import { useSupabaseData } from '../hooks/useSupabaseData';
import type { DetectionResult } from '../types';
import Select from './common/Select';


interface ExtractPageProps {
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  sftpConfig: SftpConfig;
  settingsConfig: SettingsConfig;
  apiConfig: ApiConfig;
  onNavigateToSettings: () => void;
}

export default function ExtractPage({
  extractionTypes,
  transformationTypes,
  sftpConfig,
  settingsConfig,
  apiConfig,
  onNavigateToSettings
}: ExtractPageProps) {
  const { user, getUserExtractionTypes } = useAuth();
  const { workflowSteps } = useSupabaseData();
  const [allowedExtractionTypes, setAllowedExtractionTypes] = useState<ExtractionType[]>([]);
  const [selectedExtractionType, setSelectedExtractionType] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pdfPages, setPdfPages] = useState<File[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [pdfProcessorKey, setPdfProcessorKey] = useState(0);
  const [uploadMode, setUploadMode] = useState<'manual' | 'auto'>('manual');
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [processingMode, setProcessingMode] = useState<'extraction' | 'transformation'>('extraction');
  const [selectedTransformationType, setSelectedTransformationType] = useState<string>('');

  const currentExtractionType = extractionTypes.find(type => type.id === selectedExtractionType);
  const currentTransformationType = transformationTypes.find(type => type.id === selectedTransformationType);

  // Filter extraction types based on user permissions
  React.useEffect(() => {
    const filterExtractionTypes = async () => {
      if (!user) {
        setAllowedExtractionTypes([]);
        return;
      }

      if (user.isAdmin || user.role === 'admin') {
        // Admins see all extraction types
        setAllowedExtractionTypes(extractionTypes);
      } else if (user.role === 'user') {
        // Regular users see only their assigned extraction types
        const userTypeIds = await getUserExtractionTypes(user.id);
        const filtered = extractionTypes.filter(type => userTypeIds.includes(type.id));
        setAllowedExtractionTypes(filtered);
      } else {
        // Vendors and others see all (existing behavior)
        setAllowedExtractionTypes(extractionTypes);
      }
    };

    filterExtractionTypes();
  }, [extractionTypes, user?.id, user?.role, user?.isAdmin, getUserExtractionTypes]);

  // Set selected extraction type to first allowed type
  React.useEffect(() => {
    if (allowedExtractionTypes.length > 0) {
      // Only update if current selection is not in allowed list
      const isCurrentValid = allowedExtractionTypes.some(t => t.id === selectedExtractionType);
      if (!isCurrentValid) {
        setSelectedExtractionType(allowedExtractionTypes[0].id);
      }
    }
  }, [allowedExtractionTypes]);

  // Set selected transformation type to first allowed transformation type
  React.useEffect(() => {
    if (transformationTypes.length > 0) {
      // Only update if current selection is empty or not in list
      const isCurrentValid = transformationTypes.some(t => t.id === selectedTransformationType);
      if (!isCurrentValid) {
        setSelectedTransformationType(transformationTypes[0].id);
      }
    }
  }, [transformationTypes]);

  // Initialize upload mode from extraction type default, then user preference
  React.useEffect(() => {
    if (user?.role === 'vendor') {
      // Force vendors to use AI auto-detect mode
      setUploadMode('auto');
      // Force vendors to transformation mode only
      setProcessingMode('transformation');
    } else if (currentExtractionType?.defaultUploadMode) {
      // Use extraction type's default upload mode if configured
      setUploadMode(currentExtractionType.defaultUploadMode);
    } else if (user?.preferredUploadMode) {
      // Fall back to user preference
      setUploadMode(user.preferredUploadMode);
    }
  }, [user?.preferredUploadMode, user?.role, currentExtractionType?.defaultUploadMode]);

  // Set initial upload mode when component mounts
  React.useEffect(() => {
    if (user?.role === 'vendor') {
      // Force vendors to use AI auto-detect mode
      setUploadMode('auto');
      // Force vendors to transformation mode only
      setProcessingMode('transformation');
    } else if (currentExtractionType?.defaultUploadMode) {
      // Use extraction type's default upload mode if configured
      setUploadMode(currentExtractionType.defaultUploadMode);
    } else if (user?.preferredUploadMode) {
      // Fall back to user preference
      setUploadMode(user.preferredUploadMode);
    }
  }, [user]);

  const handlePdfUpload = (file: File, pages: File[]) => {
    setUploadedFile(file);
    setPdfPages(pages);
    setDetectionResult(null);
    // Reset the processor components by changing their key
    setPdfProcessorKey(prev => prev + 1);
  };

  const handleRemovePage = (pageIndex: number) => {
    setPdfPages(prev => prev.filter((_, index) => index !== pageIndex));
  };

  const handleAutoDetectionComplete = (
    file: File, 
    pages: File[], 
    detectedTypeId: string | null, 
    result: DetectionResult
  ) => {
    setUploadedFile(file);
    setPdfPages(pages);
    setDetectionResult(result);
    
    // If a type was detected, automatically select it
    if (detectedTypeId) {
      if (processingMode === 'extraction') {
        setSelectedExtractionType(detectedTypeId);
      } else {
        setSelectedTransformationType(detectedTypeId);
      }
    }
    
    // Reset the processor components by changing their key
    setPdfProcessorKey(prev => prev + 1);
  };

  const handleSelectExtractionType = (typeId: string) => {
    if (typeId !== selectedExtractionType) {
      setUploadedFile(null);
      setPdfPages([]);
      setDetectionResult(null);
    }
    setSelectedExtractionType(typeId);
  };

  const handleUpdateAdditionalInstructions = (instructions: string) => {
    setAdditionalInstructions(instructions);
  };

  return (
    <div className="space-y-8">
      {/* Main Upload Card */}
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 overflow-hidden">
        <div className="p-8">
          {/* Extraction Type and File Upload - Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Left Column - Extraction Type */}
            <div>
              <Select
                label={`Extraction Type ${uploadMode === 'auto' ? '(Fallback)' : ''}`}
                value={selectedExtractionType}
                onValueChange={handleSelectExtractionType}
                options={allowedExtractionTypes.map((type) => ({
                  value: type.id,
                  label: type.name
                }))}
              />
              {uploadMode === 'auto' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This type will be used for pages where AI cannot detect a specific extraction type
                </p>
              )}
              
              {/* Detection Result Display */}
              {detectionResult && uploadMode === 'auto' && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-300">AI Detection Result</span>
                  </div>
                  {detectionResult.detectedTypeId ? (
                    <div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Detected:</strong> {extractionTypes.find(t => t.id === detectionResult.detectedTypeId)?.name}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        <strong>Confidence:</strong> {detectionResult.confidence} • <strong>Reason:</strong> {detectionResult.reasoning}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-orange-700 dark:text-orange-400">
                      Could not determine type automatically. {detectionResult.reasoning}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - Upload Options */}
            <div>
              <div className="space-y-4">
                {/* Upload Mode Toggle */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Upload Mode
                  </label>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      onClick={() => !currentExtractionType?.lockUploadMode && setUploadMode('manual')}
                      disabled={currentExtractionType?.lockUploadMode}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                        uploadMode === 'manual'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent hover:border-purple-400 dark:hover:border-purple-500'
                      } ${currentExtractionType?.lockUploadMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Manual Selection
                    </button>
                    <button
                      onClick={() => !currentExtractionType?.lockUploadMode && setUploadMode('auto')}
                      disabled={currentExtractionType?.lockUploadMode}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                        uploadMode === 'auto'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent hover:border-purple-400 dark:hover:border-purple-500'
                      } ${currentExtractionType?.lockUploadMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      AI Auto-Detect
                    </button>
                  </div>
                  {currentExtractionType?.lockUploadMode && (
                    <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg flex items-center space-x-2">
                      <Lock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <p className="text-xs text-purple-700 dark:text-purple-400">
                        Upload mode is locked for this extraction type
                      </p>
                    </div>
                  )}
                  {uploadMode === 'auto' && !currentExtractionType?.lockUploadMode && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Each page will be analyzed individually to determine the best extraction type
                    </p>
                  )}
                </div>

                {/* Upload Section */}
                {uploadMode === 'manual' ? (
                  <PdfUploadSection
                    key={selectedExtractionType}
                    onPdfUpload={handlePdfUpload}
                    extractionType={currentExtractionType}
                  />
                ) : (
                  <AutoDetectPdfUploadSection
                    extractionTypes={extractionTypes}
                    onDetectionComplete={handleAutoDetectionComplete}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* No Extraction Types Message */}
      {extractionTypes.length === 0 && (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 p-8 text-center">
          <div className="bg-orange-100 dark:bg-orange-900/50 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Settings className="h-10 w-10 text-orange-600 dark:text-orange-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">No Extraction Types</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            You need to create extraction types before you can extract data from PDFs. 
            Extraction types define how to extract data and what format to use.
          </p>
          <button
            onClick={onNavigateToSettings}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
          >
            <Settings className="h-5 w-5" />
            <span>Go to Type Setup</span>
          </button>
        </div>
      )}

      {/* CSV Multi-Page Mode Indicator */}
      {uploadedFile && currentExtractionType && pdfPages.length > 1 &&
       currentExtractionType.formatType === 'CSV' &&
       currentExtractionType.csvMultiPageProcessing && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="bg-blue-100 dark:bg-blue-800 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Multi-Page CSV Processing Enabled
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm leading-relaxed">
                All {pdfPages.length} pages will be processed together as a single document. The extracted data from all pages will be combined into one CSV file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* JSON Multi-Page Mode Indicator */}
      {uploadedFile && currentExtractionType && pdfPages.length > 1 &&
       currentExtractionType.formatType === 'JSON' &&
       currentExtractionType.jsonMultiPageProcessing && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="bg-blue-100 dark:bg-blue-800 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Multi-Page JSON Processing Enabled
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm leading-relaxed">
                All pages from each PDF will be analyzed together to produce a single JSON output per PDF. Each PDF is treated as a separate document.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Multi-page Processor */}
      {uploadedFile && currentExtractionType && pdfPages.length > 0 && (
        <MultiPageProcessor
          key={pdfProcessorKey}
          pdfPages={pdfPages}
          currentExtractionType={currentExtractionType}
          additionalInstructions={additionalInstructions}
          sftpConfig={sftpConfig}
          settingsConfig={settingsConfig}
          apiConfig={apiConfig}
          user={user}
          workflowSteps={workflowSteps}
          onRemovePage={handleRemovePage}
        />
      )}

      {/* Instructions Section - Only show when extraction type is selected and no file uploaded */}
      {currentExtractionType && !uploadedFile && (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 overflow-hidden">
          <div className="p-8">
            <div className="space-y-6">
              {/* Default Extraction Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Default Extraction Instructions {uploadMode === 'auto' ? '(Fallback)' : ''}
                </label>
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-4">
                  <p className="text-purple-800 dark:text-purple-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {currentExtractionType.defaultInstructions}
                  </p>
                </div>
                {uploadMode === 'auto' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    These instructions will be used for pages where AI cannot detect a specific extraction type
                  </p>
                )}
              </div>

              {/* Additional Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Additional Instructions (Optional)
                </label>
                <textarea
                  value={additionalInstructions}
                  onChange={(e) => handleUpdateAdditionalInstructions(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                  rows={3}
                  placeholder="Add any specific instructions for this extraction..."
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  These instructions will be added to the default ones above.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}