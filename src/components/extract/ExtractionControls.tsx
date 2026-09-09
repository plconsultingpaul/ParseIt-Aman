import React from 'react';
import { Brain } from 'lucide-react';
import type { ExtractionType } from '../../types';
import type { DetectionResult } from '../../types';
import Select from '../common/Select';

interface ExtractionControlsProps {
  extractionTypes: ExtractionType[];
  selectedExtractionType: string;
  additionalInstructions: string;
  uploadMode: 'manual' | 'auto';
  detectionResult: DetectionResult | null;
  onSelectExtractionType: (typeId: string) => void;
  onUpdateAdditionalInstructions: (instructions: string) => void;
}

export default function ExtractionControls({
  extractionTypes,
  selectedExtractionType,
  additionalInstructions,
  uploadMode,
  detectionResult,
  onSelectExtractionType,
  onUpdateAdditionalInstructions
}: ExtractionControlsProps) {
  const currentExtractionType = extractionTypes.find(type => type.id === selectedExtractionType);

  return (
    <div className="space-y-6">
      {/* Extraction Type */}
      <div>
        <Select
          label={`Extraction Type ${uploadMode === 'auto' ? '(Fallback)' : ''}`}
          value={selectedExtractionType}
          onValueChange={onSelectExtractionType}
          options={extractionTypes.map((type) => ({
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

      {/* Default Extraction Instructions */}
      {currentExtractionType && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
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
      )}

      {/* Additional Instructions */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          Additional Instructions (Optional)
        </label>
        <textarea
          value={additionalInstructions}
          onChange={(e) => onUpdateAdditionalInstructions(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-vertical"
          rows={3}
          placeholder="Add any specific instructions for this extraction..."
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          These instructions will be added to the default ones above.
        </p>
      </div>
    </div>
  );
}