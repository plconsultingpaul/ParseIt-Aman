import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Code, Copy } from 'lucide-react';
import { FieldMappingFunction, ExtractionType } from '../../types';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';
import { FunctionEditorModal } from './FunctionEditorModal';
import FunctionCopySelectionModal from './FunctionCopySelectionModal';
import FunctionCopyModal from './FunctionCopyModal';

interface AvailableField {
  fieldName: string;
  dataType?: string;
}

interface FieldMappingFunctionsManagerProps {
  extractionTypeId?: string;
  workflowNodeId?: string;
  flowNodeId?: string;
  availableFields: AvailableField[];
  extractionTypes: ExtractionType[];
}

export const FieldMappingFunctionsManager: React.FC<FieldMappingFunctionsManagerProps> = ({
  extractionTypeId,
  workflowNodeId,
  flowNodeId,
  availableFields,
  extractionTypes,
}) => {
  const ownerId = extractionTypeId || workflowNodeId || flowNodeId || '';
  const [functions, setFunctions] = useState<FieldMappingFunction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<FieldMappingFunction | null>(null);
  const [error, setError] = useState('');
  const [showCopySelectionModal, setShowCopySelectionModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [functionToCopy, setFunctionToCopy] = useState<FieldMappingFunction | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    loadFunctions();
  }, [ownerId]);

  const loadFunctions = async () => {
    if (!ownerId) return;
    setIsLoading(true);
    setError('');
    try {
      const data = flowNodeId
        ? await fieldMappingFunctionService.getFunctionsByFlowNode(flowNodeId)
        : workflowNodeId
        ? await fieldMappingFunctionService.getFunctionsByWorkflowNode(workflowNodeId)
        : await fieldMappingFunctionService.getFunctionsByExtractionType(extractionTypeId!);
      setFunctions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load functions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingFunction(null);
    setIsModalOpen(true);
  };

  const handleEdit = (func: FieldMappingFunction) => {
    setEditingFunction(func);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this function?')) {
      return;
    }

    try {
      await fieldMappingFunctionService.deleteFunction(id);
      await loadFunctions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete function');
    }
  };

  const handleSave = async () => {
    await loadFunctions();
  };

  const handleCopyClick = () => {
    setShowCopySelectionModal(true);
  };

  const handleFunctionSelectedForCopy = (func: FieldMappingFunction) => {
    setFunctionToCopy(func);
    setShowCopySelectionModal(false);
    setShowCopyModal(true);
  };

  const handleConfirmCopy = async (newName: string) => {
    if (!functionToCopy) return;

    if (functions.some(f => f.function_name.toLowerCase() === newName.toLowerCase())) {
      throw new Error('A function with this name already exists');
    }

    setIsCopying(true);
    try {
      if (flowNodeId) {
        await fieldMappingFunctionService.copyFunctionToFlowNode(functionToCopy.id, flowNodeId, newName);
      } else if (workflowNodeId) {
        await fieldMappingFunctionService.copyFunctionToWorkflowNode(functionToCopy.id, workflowNodeId, newName);
      } else {
        await fieldMappingFunctionService.copyFunction(functionToCopy.id, extractionTypeId!, newName);
      }
      await loadFunctions();
      setShowCopyModal(false);
      setFunctionToCopy(null);
    } catch (error) {
      throw error;
    } finally {
      setIsCopying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading functions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Field Mapping Functions</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Create reusable functions with conditional logic for field mappings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyClick}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy from Another Type
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Function
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {functions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <Code className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">No functions defined yet</p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Your First Function
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {functions.map((func) => (
            <div
              key={func.id}
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Code className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-medium text-gray-900 dark:text-white">{func.function_name}</h4>
                  </div>
                  {func.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{func.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {func.function_type === 'date' ? (
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                        Date Function
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                        {func.function_logic?.conditions?.length || 0} condition{(func.function_logic?.conditions?.length || 0) !== 1 ? 's' : ''}
                      </span>
                    )}
                    {func.function_logic?.default && (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        Has default value
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleFunctionSelectedForCopy(func)}
                    className="p-2 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Copy function"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(func)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    title="Edit function"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(func.id)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete function"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FunctionEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        functionData={editingFunction}
        extractionTypeId={extractionTypeId}
        workflowNodeId={workflowNodeId}
        flowNodeId={flowNodeId}
        availableFields={availableFields}
        onSave={handleSave}
      />

      <FunctionCopySelectionModal
        isOpen={showCopySelectionModal}
        onClose={() => setShowCopySelectionModal(false)}
        extractionTypes={extractionTypes}
        currentExtractionTypeId={extractionTypeId || ''}
        onSelect={handleFunctionSelectedForCopy}
      />

      <FunctionCopyModal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        functionToCopy={functionToCopy}
        onConfirmCopy={handleConfirmCopy}
        isCopying={isCopying}
      />
    </div>
  );
};
