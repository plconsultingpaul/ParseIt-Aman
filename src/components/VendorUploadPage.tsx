import React, { useState } from 'react';
import { FileText, Brain, CheckCircle } from 'lucide-react';
import type { TransformationType, SftpConfig, SettingsConfig, ApiConfig, User, WorkflowStep } from '../types';
import { useAuth } from '../hooks/useAuth';
import AutoDetectPdfUploadSection from './extract/AutoDetectPdfUploadSection';
import MultiPageTransformer from './transform/MultiPageTransformer';
import type { DetectionResult } from '../types';


interface VendorUploadPageProps {
  transformationTypes: TransformationType[];
  sftpConfig: SftpConfig;
  settingsConfig: SettingsConfig;
  apiConfig: ApiConfig;
  workflowSteps: WorkflowStep[];
}

export default function VendorUploadPage({
  transformationTypes = [],
  sftpConfig,
  settingsConfig,
  apiConfig,
  workflowSteps
}: VendorUploadPageProps) {
  const { user } = useAuth();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pdfPages, setPdfPages] = useState<File[]>([]);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [fallbackTransformationType, setFallbackTransformationType] = useState<TransformationType | null>(
    transformationTypes?.[0] || null
  );

  const handleAutoDetectionComplete = (
    file: File, 
    pages: File[], 
    detectedTypeId: string | null, 
    result: DetectionResult
  ) => {
    setUploadedFile(file);
    setPdfPages(pages);
    setDetectionResult(result);
    
    // Set fallback transformation type
    if (detectedTypeId) {
      const detectedType = transformationTypes.find(type => type.id === detectedTypeId);
      if (detectedType) {
        setFallbackTransformationType(detectedType);
      }
    }
  };

  return (
    <div className="space-y-8">

      {/* Main Upload Card */}
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 overflow-hidden">
        <div className="p-8">
          {/* Upload Section */}
          <div className="mb-8">
            <AutoDetectPdfUploadSection
              extractionTypes={transformationTypes}
              onDetectionComplete={handleAutoDetectionComplete}
            />
          </div>

          {/* Detection Result Display */}
          {detectionResult && uploadedFile && (
            <></>
          )}
        </div>
      </div>

      {/* Multi-page Transformer */}
      {uploadedFile && fallbackTransformationType && pdfPages.length > 0 && (
        <MultiPageTransformer
          pdfPages={pdfPages}
          fallbackTransformationType={fallbackTransformationType}
          allTransformationTypes={transformationTypes}
          uploadMode="auto"
          additionalInstructions=""
          sftpConfig={sftpConfig}
          settingsConfig={settingsConfig}
          apiConfig={apiConfig}
          user={user}
          workflowSteps={workflowSteps}
        />
      )}

      {/* No Transformation Types Message */}
      {transformationTypes.length === 0 && (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 p-8 text-center">
          <div className="bg-orange-100 dark:bg-orange-900/50 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Brain className="h-10 w-10 text-orange-600 dark:text-orange-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">No Transformation Types Available</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Please contact your administrator to set up transformation types for document processing.
          </p>
        </div>
      )}
    </div>
  );
}