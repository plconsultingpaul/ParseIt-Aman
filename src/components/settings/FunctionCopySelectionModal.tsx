import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Code, Copy, CheckCircle } from 'lucide-react';
import { ExtractionType, FieldMappingFunction } from '../../types';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';
import CustomDropdown from '../common/CustomDropdown';
import { supabase } from '../../lib/supabase';

interface FunctionCopySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractionTypes: ExtractionType[];
  currentExtractionTypeId: string;
  onSelect: (func: FieldMappingFunction) => void;
}

export default function FunctionCopySelectionModal({
  isOpen,
  onClose,
  extractionTypes,
  currentExtractionTypeId,
  onSelect
}: FunctionCopySelectionModalProps) {
  const [selectedExtractionTypeId, setSelectedExtractionTypeId] = useState<string>('');
  const [selectedFunctionId, setSelectedFunctionId] = useState<string>('');
  const [functions, setFunctions] = useState<FieldMappingFunction[]>([]);
  const [isLoadingFunctions, setIsLoadingFunctions] = useState(false);
  const [typesWithFunctions, setTypesWithFunctions] = useState<Set<string>>(new Set());
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTypesWithFunctions();
    } else {
      setSelectedExtractionTypeId('');
      setSelectedFunctionId('');
      setFunctions([]);
      setTypesWithFunctions(new Set());
    }
  }, [isOpen]);

  const loadTypesWithFunctions = async () => {
    setIsLoadingTypes(true);
    try {
      const { data } = await supabase
        .from('field_mapping_functions')
        .select('extraction_type_id')
        .not('extraction_type_id', 'is', null);

      const ids = new Set((data || []).map(d => d.extraction_type_id).filter(Boolean));
      setTypesWithFunctions(ids);
    } catch (error) {
      console.error('Error loading types with functions:', error);
    } finally {
      setIsLoadingTypes(false);
    }
  };

  const availableTypes = extractionTypes.filter(
    et => et.id !== currentExtractionTypeId && typesWithFunctions.has(et.id)
  );

  useEffect(() => {
    if (selectedExtractionTypeId) {
      loadFunctions(selectedExtractionTypeId);
    } else {
      setFunctions([]);
      setSelectedFunctionId('');
    }
  }, [selectedExtractionTypeId]);

  const loadFunctions = async (extractionTypeId: string) => {
    setIsLoadingFunctions(true);
    setSelectedFunctionId('');
    try {
      const data = await fieldMappingFunctionService.getFunctionsByExtractionType(extractionTypeId);
      setFunctions(data);
    } catch (error) {
      console.error('Error loading functions:', error);
      setFunctions([]);
    } finally {
      setIsLoadingFunctions(false);
    }
  };

  const handleConfirmSelection = () => {
    const selectedFunction = functions.find(f => f.id === selectedFunctionId);
    if (selectedFunction) {
      onSelect(selectedFunction);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="text-center mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Copy className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Copy Function from Another Type</h3>
          <p className="text-gray-600 dark:text-gray-400">Select an extraction type and then choose a function to copy</p>
        </div>

        {availableTypes.length === 0 ? (
          <div className="text-center py-8">
            <Code className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Extraction Types with Functions</h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No other extraction types have functions to copy from.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Extraction Type
                </label>
                <CustomDropdown
                  value={selectedExtractionTypeId}
                  onChange={setSelectedExtractionTypeId}
                  options={availableTypes.map((type) => ({
                    value: type.id,
                    label: type.name,
                  }))}
                  placeholder="-- Select Extraction Type --"
                  disabled={isLoadingTypes}
                />
              </div>

              {selectedExtractionTypeId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Function
                  </label>
                  {isLoadingFunctions ? (
                    <div className="text-center py-8">
                      <div className="text-gray-500 dark:text-gray-400">Loading functions...</div>
                    </div>
                  ) : functions.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <Code className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 dark:text-gray-400">No functions available in this extraction type</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {functions.map((func) => (
                        <div
                          key={func.id}
                          onClick={() => setSelectedFunctionId(func.id)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                            selectedFunctionId === func.id
                              ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Code className={`h-5 w-5 ${
                                selectedFunctionId === func.id
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`} />
                              <div>
                                <h4 className={`font-semibold ${
                                  selectedFunctionId === func.id
                                    ? 'text-blue-900 dark:text-blue-200'
                                    : 'text-gray-900 dark:text-gray-100'
                                }`}>
                                  {func.function_name}
                                </h4>
                                {func.description && (
                                  <p className={`text-sm ${
                                    selectedFunctionId === func.id
                                      ? 'text-blue-600 dark:text-blue-300'
                                      : 'text-gray-500 dark:text-gray-400'
                                  }`}>
                                    {func.description}
                                  </p>
                                )}
                                <div className="flex items-center space-x-2 mt-1">
                                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    {func.function_logic?.conditions?.length ?? 0} condition{(func.function_logic?.conditions?.length ?? 0) !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              selectedFunctionId === func.id
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                            }`}>
                              {selectedFunctionId === func.id && (
                                <CheckCircle className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleConfirmSelection}
                disabled={!selectedFunctionId}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
              >
                <Copy className="h-4 w-4" />
                <span>Copy Selected Function</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
