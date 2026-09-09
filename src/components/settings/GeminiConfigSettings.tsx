import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, RefreshCw, Settings, Check, AlertCircle, Loader2, Download, AlertTriangle } from 'lucide-react';
import {
  geminiConfigService,
  GeminiApiKey,
  GeminiModel,
  AvailableGeminiModel
} from '../../services/geminiConfigService';
import Modal from '../common/Modal';
import ToastContainer from '../common/ToastContainer';
import { useToast } from '../../hooks/useToast';

interface AddKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AddKeyModal({ isOpen, onClose, onSuccess }: AddKeyModalProps) {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [setAsActive, setSetAsActive] = useState(false);
  const [autoFetchModels, setAutoFetchModels] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const toast = useToast();

  const handleTest = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key first');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await geminiConfigService.testApiKey(apiKey);
      setTestResult(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
      toast.error(error.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !apiKey.trim()) {
      toast.error('Name and API key are required');
      return;
    }

    setIsSubmitting(true);

    try {
      const newKey = await geminiConfigService.addApiKey(name, apiKey, setAsActive);

      if (autoFetchModels) {
        try {
          const availableModels = await geminiConfigService.fetchAvailableModelsByKeyId(newKey.id);
          const modelsToAdd = availableModels.map(m => ({
            modelName: m.name,
            displayName: m.displayName
          }));
          await geminiConfigService.addModels(newKey.id, modelsToAdd);
          toast.success(`API key added with ${modelsToAdd.length} models`);
        } catch (error: any) {
          toast.error(`API key added, but failed to fetch models: ${error.message}`);
        }
      } else {
        toast.success('API key added successfully');
      }

      setName('');
      setApiKey('');
      setSetAsActive(false);
      setAutoFetchModels(true);
      setTestResult(null);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Gemini API Key">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Key Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Primary Key, Backup Key"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            API Key
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Google Gemini API key"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
          />
        </div>

        <button
          onClick={handleTest}
          disabled={isTesting || !apiKey.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>

        {testResult && (
          <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${testResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </p>
                <p className={`text-sm ${testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {testResult.message}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="setAsActive"
            checked={setAsActive}
            onChange={(e) => setSetAsActive(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor="setAsActive" className="text-sm text-gray-700 dark:text-gray-300">
            Set as active key
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoFetchModels"
            checked={autoFetchModels}
            onChange={(e) => setAutoFetchModels(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor="autoFetchModels" className="text-sm text-gray-700 dark:text-gray-300">
            Automatically fetch available models
          </label>
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !apiKey.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Key
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface FetchModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: GeminiApiKey;
  onSuccess: () => void;
}

function FetchModelsModal({ isOpen, onClose, apiKey, onSuccess }: FetchModelsModalProps) {
  const [availableModels, setAvailableModels] = useState<AvailableGeminiModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [existingModels, setExistingModels] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  const fetchModels = async () => {
    setIsLoading(true);
    try {
      const [available, existing] = await Promise.all([
        geminiConfigService.fetchAvailableModelsByKeyId(apiKey.id),
        geminiConfigService.getExistingModelNames(apiKey.id)
      ]);

      setAvailableModels(available);
      setExistingModels(new Set(existing));
      setSelectedModels(new Set());
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModel = (modelName: string) => {
    const newSelected = new Set(selectedModels);
    if (newSelected.has(modelName)) {
      newSelected.delete(modelName);
    } else {
      newSelected.add(modelName);
    }
    setSelectedModels(newSelected);
  };

  const handleSubmit = async () => {
    if (selectedModels.size === 0) {
      toast.error('Please select at least one model');
      return;
    }

    setIsSubmitting(true);
    try {
      const modelsToAdd = availableModels
        .filter(m => selectedModels.has(m.name))
        .map(m => ({
          modelName: m.name,
          displayName: m.displayName
        }));

      await geminiConfigService.addModels(apiKey.id, modelsToAdd);
      toast.success(`Added ${modelsToAdd.length} models successfully`);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add models');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Fetch Models for ${apiKey.name}`}>
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select models to add. Models already in the database are highlighted.
            </p>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {availableModels.map((model) => {
                const isExisting = existingModels.has(model.name);
                const isSelected = selectedModels.has(model.name);

                return (
                  <div
                    key={model.name}
                    className={`p-3 border rounded-lg ${
                      isExisting
                        ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 opacity-50'
                        : isSelected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer'
                    }`}
                    onClick={() => !isExisting && toggleModel(model.name)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isExisting}
                        onChange={() => {}}
                        className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {model.displayName}
                          </p>
                          {isExisting && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                              Already Added
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {model.name}
                        </p>
                        {model.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {model.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedModels.size} model{selectedModels.size !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || selectedModels.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Add Selected
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

interface AddModelManuallyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: GeminiApiKey;
  onSuccess: () => void;
}

function AddModelManuallyModal({ isOpen, onClose, apiKey, onSuccess }: AddModelManuallyModalProps) {
  const [modelName, setModelName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!modelName.trim() || !displayName.trim()) {
      toast.error('Model name and display name are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await geminiConfigService.addModel(apiKey.id, modelName, displayName);
      toast.success('Model added successfully');
      setModelName('');
      setDisplayName('');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add model');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add Model to ${apiKey.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Model Name
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g., gemini-1.5-flash"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Gemini 1.5 Flash"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !modelName.trim() || !displayName.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Model
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DeleteModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: GeminiModel | null;
  onConfirm: () => void;
}

function DeleteModelModal({ isOpen, onClose, model, onConfirm }: DeleteModelModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  };

  if (!model) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Model">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
              Delete {model.display_name}?
            </p>
            <p className="text-sm text-red-800 dark:text-red-200">
              This will remove the model from your configuration. You can add it back anytime by fetching models again.
            </p>
          </div>
        </div>

        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Model Name</p>
          <p className="text-sm font-mono text-gray-900 dark:text-white">{model.model_name}</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete Model
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DeleteApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: GeminiApiKey | null;
  modelCount: number;
  onConfirm: () => void;
}

function DeleteApiKeyModal({ isOpen, onClose, apiKey, modelCount, onConfirm }: DeleteApiKeyModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  };

  if (!apiKey) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete API Key">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
              Delete "{apiKey.name}" API Key?
            </p>
            <p className="text-sm text-red-800 dark:text-red-200">
              This will permanently delete this API key and all {modelCount} associated model{modelCount !== 1 ? 's' : ''}.
              {apiKey.is_active && ' You will need to set another key as active before you can use Gemini features.'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">API Key</p>
            <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{apiKey.api_key}</p>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Associated Models</p>
            <p className="text-sm text-gray-900 dark:text-white">{modelCount} model{modelCount !== 1 ? 's' : ''} will be deleted</p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete API Key
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function GeminiConfigSettings() {
  const [apiKeys, setApiKeys] = useState<GeminiApiKey[]>([]);
  const [modelsByKey, setModelsByKey] = useState<Record<string, GeminiModel[]>>({});
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [showFetchModelsModal, setShowFetchModelsModal] = useState(false);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [showDeleteModelModal, setShowDeleteModelModal] = useState(false);
  const [showDeleteApiKeyModal, setShowDeleteApiKeyModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState<GeminiApiKey | null>(null);
  const [apiKeyToDelete, setApiKeyToDelete] = useState<GeminiApiKey | null>(null);
  const [modelToDelete, setModelToDelete] = useState<GeminiModel | null>(null);
  const [testingKeys, setTestingKeys] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const keys = await geminiConfigService.getAllApiKeys();
      setApiKeys(keys);

      const modelsData: Record<string, GeminiModel[]> = {};
      for (const key of keys) {
        const models = await geminiConfigService.getModelsByApiKeyId(key.id);
        modelsData[key.id] = models;
      }
      setModelsByKey(modelsData);

      if (keys.length > 0) {
        setExpandedKeys(new Set([keys.find(k => k.is_active)?.id || keys[0].id]));
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load Gemini configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpanded = (keyId: string) => {
    const newExpanded = new Set(expandedKeys);
    if (newExpanded.has(keyId)) {
      newExpanded.delete(keyId);
    } else {
      newExpanded.add(keyId);
    }
    setExpandedKeys(newExpanded);
  };

  const handleSetActiveKey = async (keyId: string) => {
    try {
      await geminiConfigService.setActiveApiKey(keyId);
      toast.success('Active API key updated');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to set active key');
    }
  };

  const handleSetActiveModel = async (modelId: string) => {
    try {
      await geminiConfigService.setActiveModel(modelId);
      toast.success('Active model updated');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to set active model');
    }
  };

  const handleDeleteKey = (key: GeminiApiKey) => {
    setApiKeyToDelete(key);
    setShowDeleteApiKeyModal(true);
  };

  const confirmDeleteApiKey = async () => {
    if (!apiKeyToDelete) return;

    try {
      await geminiConfigService.deleteApiKey(apiKeyToDelete.id);
      toast.success(`API key "${apiKeyToDelete.name}" deleted successfully`);
      setShowDeleteApiKeyModal(false);
      setApiKeyToDelete(null);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete API key');
    }
  };

  const handleDeleteModel = (model: GeminiModel) => {
    setModelToDelete(model);
    setShowDeleteModelModal(true);
  };

  const confirmDeleteModel = async () => {
    if (!modelToDelete) return;

    try {
      await geminiConfigService.deleteModel(modelToDelete.id);

      setModelsByKey(prev => {
        const updated = { ...prev };
        updated[modelToDelete.api_key_id] = updated[modelToDelete.api_key_id].filter(
          m => m.id !== modelToDelete.id
        );
        return updated;
      });

      toast.success('Model removed successfully');
      setShowDeleteModelModal(false);
      setModelToDelete(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete model');
    }
  };

  const handleTestApiKey = async (key: GeminiApiKey) => {
    setTestingKeys(prev => new Set([...prev, key.id]));
    setTestResults(prev => {
      const updated = { ...prev };
      delete updated[key.id];
      return updated;
    });

    try {
      const models = modelsByKey[key.id] || [];
      const activeModel = models.find(m => m.is_active);
      const modelToTest = activeModel?.model_name || models[0]?.model_name;

      if (!modelToTest) {
        const errorResult = {
          success: false,
          message: 'No models configured for this API key. Please add models first.'
        };
        setTestResults(prev => ({
          ...prev,
          [key.id]: errorResult
        }));
        toast.error(errorResult.message);
        setTestingKeys(prev => {
          const updated = new Set(prev);
          updated.delete(key.id);
          return updated;
        });
        return;
      }

      const result = await geminiConfigService.testApiKeyById(key.id, modelToTest);
      setTestResults(prev => ({
        ...prev,
        [key.id]: result
      }));

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      const errorResult = {
        success: false,
        message: error.message || 'Failed to test API key'
      };
      setTestResults(prev => ({
        ...prev,
        [key.id]: errorResult
      }));
      toast.error(errorResult.message);
    } finally {
      setTestingKeys(prev => {
        const updated = new Set(prev);
        updated.delete(key.id);
        return updated;
      });
    }
  };

  const activeKey = apiKeys.find(k => k.is_active);
  const activeModel = activeKey
    ? modelsByKey[activeKey.id]?.find(m => m.is_active)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Gemini API Configuration
          </h3>
        </div>
        <button
          onClick={() => setShowAddKeyModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add API Key
        </button>
      </div>

      {activeKey && activeModel && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h4 className="font-semibold text-green-900 dark:text-green-100">
              Current Active Configuration
            </h4>
          </div>
          <p className="text-sm text-green-800 dark:text-green-200">
            Using Key: <span className="font-medium">{activeKey.name}</span> | Model: <span className="font-medium">{activeModel.model_name}</span>
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <Key className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No API keys configured yet
          </p>
          <button
            onClick={() => setShowAddKeyModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Your First API Key
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => {
            const isExpanded = expandedKeys.has(key.id);
            const models = modelsByKey[key.id] || [];

            return (
              <div
                key={key.id}
                className={`border rounded-lg ${
                  key.is_active
                    ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => toggleExpanded(key.id)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <svg
                          className={`w-5 h-5 transform transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                      <Key className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {key.name}
                          </h4>
                          {key.is_active && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                          {key.api_key}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!key.is_active && (
                        <button
                          onClick={() => handleSetActiveKey(key.id)}
                          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Set as Active
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteKey(key)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleTestApiKey(key)}
                          disabled={testingKeys.has(key.id)}
                          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          {testingKeys.has(key.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          {testingKeys.has(key.id) ? 'Testing...' : 'Test Connection'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedKey(key);
                            setShowFetchModelsModal(true);
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          <Download className="w-4 h-4" />
                          Fetch Available Models
                        </button>
                        <button
                          onClick={() => {
                            setSelectedKey(key);
                            setShowAddModelModal(true);
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <Plus className="w-4 h-4" />
                          Add Model Manually
                        </button>
                      </div>

                      {testResults[key.id] && (
                        <div className={`p-3 rounded-lg ${testResults[key.id].success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                          <div className="flex items-start gap-2">
                            {testResults[key.id].success ? (
                              <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className={`text-sm font-medium ${testResults[key.id].success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                                {testResults[key.id].success ? 'Connection Successful' : 'Connection Failed'}
                              </p>
                              <p className={`text-sm ${testResults[key.id].success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                                {testResults[key.id].message}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {models.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No models configured for this key
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Models ({models.length})
                          </p>
                          {models.map((model) => (
                            <div
                              key={model.id}
                              className={`p-3 rounded border ${
                                model.is_active
                                  ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                                  : 'border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {model.display_name}
                                    </p>
                                    {model.is_active && (
                                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                    {model.model_name}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!model.is_active && (
                                    <button
                                      onClick={() => handleSetActiveModel(model.id)}
                                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                      Set as Active
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteModel(model)}
                                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddKeyModal
        isOpen={showAddKeyModal}
        onClose={() => setShowAddKeyModal(false)}
        onSuccess={loadData}
      />

      {selectedKey && (
        <>
          <FetchModelsModal
            isOpen={showFetchModelsModal}
            onClose={() => {
              setShowFetchModelsModal(false);
              setSelectedKey(null);
            }}
            apiKey={selectedKey}
            onSuccess={loadData}
          />

          <AddModelManuallyModal
            isOpen={showAddModelModal}
            onClose={() => {
              setShowAddModelModal(false);
              setSelectedKey(null);
            }}
            apiKey={selectedKey}
            onSuccess={loadData}
          />
        </>
      )}

      <DeleteModelModal
        isOpen={showDeleteModelModal}
        onClose={() => {
          setShowDeleteModelModal(false);
          setModelToDelete(null);
        }}
        model={modelToDelete}
        onConfirm={confirmDeleteModel}
      />

      <DeleteApiKeyModal
        isOpen={showDeleteApiKeyModal}
        onClose={() => {
          setShowDeleteApiKeyModal(false);
          setApiKeyToDelete(null);
        }}
        apiKey={apiKeyToDelete}
        modelCount={apiKeyToDelete ? (modelsByKey[apiKeyToDelete.id] || []).length : 0}
        onConfirm={confirmDeleteApiKey}
      />

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How It Works
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Add multiple API keys with friendly names for easy identification</li>
          <li>• Each key can have multiple models associated with it</li>
          <li>• Only one key and one model can be active at a time</li>
          <li>• Quickly switch between keys/models if one is sunset or stops working</li>
          <li>• Use "Fetch Available Models" to automatically discover new models from Google</li>
        </ul>
      </div>

      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
    </div>
  );
}
