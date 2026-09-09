import React, { useState, useEffect } from 'react';
import { Plus, Trash2, MoveUp, MoveDown, Brain, FileText, ChevronDown, ChevronUp, Database, ArrowRight, Code, Repeat, Search } from 'lucide-react';
import type { PageGroupConfig, Workflow, TransformationFieldMapping, FieldMappingFunction, WorkflowV2 } from '../../types';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';

interface PageGroupConfigEditorProps {
  transformationTypeId: string;
  pageGroupConfigs: PageGroupConfig[];
  workflows: Workflow[];
  workflowsV2?: WorkflowV2[];
  onChange: (configs: PageGroupConfig[]) => void;
}

export default function PageGroupConfigEditor({
  transformationTypeId,
  pageGroupConfigs,
  workflows,
  workflowsV2 = [],
  onChange
}: PageGroupConfigEditorProps) {
  const [configs, setConfigs] = useState<PageGroupConfig[]>(pageGroupConfigs);
  const [expandedFieldMappings, setExpandedFieldMappings] = useState<Set<number>>(new Set());
  const [functions, setFunctions] = useState<FieldMappingFunction[]>([]);

  useEffect(() => {
    const loadFunctions = async () => {
      try {
        const data = await fieldMappingFunctionService.getFunctionsByExtractionType(transformationTypeId);
        setFunctions(data);
      } catch (error) {
        console.error('Failed to load functions:', error);
      }
    };
    if (transformationTypeId) {
      loadFunctions();
    }
  }, [transformationTypeId]);

  const handleAddGroup = () => {
    const newOrder = configs.length > 0 ? Math.max(...configs.map(c => c.groupOrder)) + 1 : 1;
    const newConfig: PageGroupConfig = {
      id: `temp-${Date.now()}`,
      transformationTypeId,
      name: '',
      groupOrder: newOrder,
      pagesPerGroup: 1,
      processMode: 'all',
      smartDetectionPattern: '',
      workflowId: undefined,
      filenameTemplate: undefined
    };

    const updatedConfigs = [...configs, newConfig];
    setConfigs(updatedConfigs);
    onChange(updatedConfigs);
  };

  const handleRemoveGroup = (index: number) => {
    const updatedConfigs = configs.filter((_, i) => i !== index);
    const reorderedConfigs = updatedConfigs.map((config, i) => ({
      ...config,
      groupOrder: i + 1
    }));
    setConfigs(reorderedConfigs);
    onChange(reorderedConfigs);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;

    const updatedConfigs = [...configs];
    [updatedConfigs[index - 1], updatedConfigs[index]] = [updatedConfigs[index], updatedConfigs[index - 1]];

    const reorderedConfigs = updatedConfigs.map((config, i) => ({
      ...config,
      groupOrder: i + 1
    }));

    setConfigs(reorderedConfigs);
    onChange(reorderedConfigs);
  };

  const handleMoveDown = (index: number) => {
    if (index === configs.length - 1) return;

    const updatedConfigs = [...configs];
    [updatedConfigs[index], updatedConfigs[index + 1]] = [updatedConfigs[index + 1], updatedConfigs[index]];

    const reorderedConfigs = updatedConfigs.map((config, i) => ({
      ...config,
      groupOrder: i + 1
    }));

    setConfigs(reorderedConfigs);
    onChange(reorderedConfigs);
  };

  const handleUpdateConfig = (index: number, field: keyof PageGroupConfig, value: any) => {
    const updatedConfigs = configs.map((config, i) => {
      if (i === index) {
        return { ...config, [field]: value };
      }
      return config;
    });
    setConfigs(updatedConfigs);
    onChange(updatedConfigs);
  };

  const toggleFieldMappings = (index: number) => {
    const newExpanded = new Set(expandedFieldMappings);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedFieldMappings(newExpanded);
  };

  const handleAddFieldMapping = (configIndex: number) => {
    const updatedConfigs = [...configs];
    const config = updatedConfigs[configIndex];
    const newMapping: TransformationFieldMapping = {
      fieldName: '',
      type: 'ai',
      value: '',
      dataType: 'string',
      pageNumberInGroup: 1
    };

    updatedConfigs[configIndex] = {
      ...config,
      fieldMappings: [...(config.fieldMappings || []), newMapping]
    };

    setConfigs(updatedConfigs);
    onChange(updatedConfigs);
  };

  const handleUpdateFieldMapping = (configIndex: number, mappingIndex: number, field: keyof TransformationFieldMapping, value: any) => {
    const updatedConfigs = [...configs];
    const config = updatedConfigs[configIndex];
    const updatedMappings = [...(config.fieldMappings || [])];
    updatedMappings[mappingIndex] = { ...updatedMappings[mappingIndex], [field]: value };

    updatedConfigs[configIndex] = {
      ...config,
      fieldMappings: updatedMappings
    };

    setConfigs(updatedConfigs);
    onChange(updatedConfigs);
  };

  const handleRemoveFieldMapping = (configIndex: number, mappingIndex: number) => {
    const updatedConfigs = [...configs];
    const config = updatedConfigs[configIndex];
    const updatedMappings = (config.fieldMappings || []).filter((_, i) => i !== mappingIndex);

    updatedConfigs[configIndex] = {
      ...config,
      fieldMappings: updatedMappings.length > 0 ? updatedMappings : undefined
    };

    setConfigs(updatedConfigs);
    onChange(updatedConfigs);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>Page Group Configuration</span>
          </h5>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure multiple page groups with different workflows and detection patterns
          </p>
        </div>
        <button
          onClick={handleAddGroup}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Page Group</span>
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
          <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            No page groups configured. Add a page group to enable multi-document workflow routing.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            Without page group configs, the system uses the transformation type's default settings.
          </p>
          <button
            onClick={handleAddGroup}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 inline-flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add First Page Group</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config, index) => (
            <div
              key={config.id}
              className="bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 dark:bg-blue-900/50 px-3 py-1 rounded-lg">
                    <span className="text-blue-800 dark:text-blue-300 font-bold">
                      Group {config.groupOrder}{config.name ? ` - ${config.name}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <MoveUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === configs.length - 1}
                      className="p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <MoveDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveGroup(index)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                  title="Remove group"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={config.name || ''}
                    onChange={(e) => handleUpdateConfig(index, 'name', e.target.value)}
                    placeholder="e.g., Invoice, POD, Bill of Lading"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Optional label to identify this group (e.g., Invoice, POD)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pages Per Group
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={config.pagesPerGroup}
                    onChange={(e) => handleUpdateConfig(index, 'pagesPerGroup', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Maximum pages in this group
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Process Mode
                  </label>
                  <select
                    value={config.processMode}
                    onChange={(e) => handleUpdateConfig(index, 'processMode', e.target.value as 'single' | 'all')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Process All Pages</option>
                    <option value="single">Process Single Page Only</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {config.processMode === 'single'
                      ? 'Only first page processed, rest discarded'
                      : 'All pages up to next boundary processed'}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Detection Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleUpdateConfig(index, 'detectionMode', 'fixed_sequence')}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        (config.detectionMode || 'detect') === 'fixed_sequence'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <Repeat className={`h-4 w-4 ${(config.detectionMode || 'detect') === 'fixed_sequence' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                        <span className={`text-sm font-semibold ${(config.detectionMode || 'detect') === 'fixed_sequence' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          Fixed Sequence
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Pages cycle through groups in order. No detection needed.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateConfig(index, 'detectionMode', 'detect')}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        (config.detectionMode || 'detect') === 'detect'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <Search className={`h-4 w-4 ${(config.detectionMode || 'detect') === 'detect' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                        <span className={`text-sm font-semibold ${(config.detectionMode || 'detect') === 'detect' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          Detect Pages
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Use patterns or AI to identify which pages belong to each group.
                      </p>
                    </button>
                  </div>
                </div>

                {config.groupOrder > 1 && (config.detectionMode || 'detect') === 'detect' && (
                  <div className="md:col-span-2">
                    <label className="flex items-center space-x-3 cursor-pointer p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={config.followsPreviousGroup || false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const updatedConfigs = configs.map((cfg, i) => {
                            if (i === index) {
                              if (checked) {
                                return {
                                  ...cfg,
                                  followsPreviousGroup: true,
                                  smartDetectionPattern: undefined,
                                  useAiDetection: false,
                                  detectionConfidenceThreshold: undefined,
                                  fallbackBehavior: undefined
                                };
                              } else {
                                return {
                                  ...cfg,
                                  followsPreviousGroup: false
                                };
                              }
                            }
                            return cfg;
                          });
                          setConfigs(updatedConfigs);
                          onChange(updatedConfigs);
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center space-x-2">
                        <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Follows Previous Group
                        </span>
                      </div>
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-1">
                      {config.followsPreviousGroup
                        ? `This group will start immediately after Group ${config.groupOrder - 1} ends`
                        : 'Enable to automatically process pages after the previous group'}
                    </p>
                  </div>
                )}

                {(config.detectionMode || 'detect') === 'detect' && !config.followsPreviousGroup && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span>Smart Detection Pattern (Optional)</span>
                      </div>
                    </label>
                  <input
                    type="text"
                    value={config.smartDetectionPattern || ''}
                    onChange={(e) => handleUpdateConfig(index, 'smartDetectionPattern', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Transport Bourassa, or If there is a dollar amount after TOTAL CDN"
                  />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {config.smartDetectionPattern
                        ? 'Text pattern or description to detect this page group'
                        : 'Will use fixed page positions'}
                    </p>
                  </div>
                )}

                {(config.detectionMode || 'detect') === 'detect' && config.followsPreviousGroup && (
                  <div className="md:col-span-2">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Note:</strong> Smart Detection is disabled because this group follows the previous group.
                        Pages will be processed sequentially starting from where Group {config.groupOrder - 1} ended.
                      </p>
                    </div>
                  </div>
                )}

                {(config.detectionMode || 'detect') === 'fixed_sequence' && (
                  <div className="md:col-span-2">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <Repeat className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-300">
                            Fixed Sequence Mode
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                            Pages are assigned to groups in repeating order without any detection.
                            {configs.length >= 2 && (
                              <span className="block mt-1">
                                Pattern: {configs.map((c, i) => `Page ${i + 1} = Group ${c.groupOrder}`).join(', ')}
                                {configs.length <= 4 ? `, Page ${configs.length + 1} = Group ${configs[0]?.groupOrder}, ...` : ', ...'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(config.detectionMode || 'detect') === 'detect' && !config.followsPreviousGroup && config.smartDetectionPattern && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <div className="flex items-center space-x-2">
                          <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span>Use AI Detection</span>
                        </div>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.useAiDetection || false}
                          onChange={(e) => handleUpdateConfig(index, 'useAiDetection', e.target.checked)}
                          className="w-5 h-5 text-purple-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Enable AI-powered pattern matching
                        </span>
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {config.useAiDetection
                          ? 'AI will understand context and semantic meaning'
                          : 'Simple case-insensitive text search'}
                      </p>
                    </div>

                    {config.useAiDetection && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          AI Confidence Threshold
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={config.detectionConfidenceThreshold || 0.7}
                          onChange={(e) => handleUpdateConfig(index, 'detectionConfidenceThreshold', parseFloat(e.target.value) || 0.7)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Minimum confidence (0.0-1.0) required for AI match
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Fallback Behavior
                      </label>
                      <select
                        value={config.fallbackBehavior || 'skip'}
                        onChange={(e) => handleUpdateConfig(index, 'fallbackBehavior', e.target.value as 'skip' | 'fixed_position' | 'error')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="skip">Skip Group if Pattern Not Found</option>
                        <option value="fixed_position">Use Fixed Position as Fallback</option>
                        <option value="error">Stop with Error</option>
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {config.fallbackBehavior === 'skip' && 'Skip this group if pattern not found'}
                        {config.fallbackBehavior === 'fixed_position' && 'Process pages at expected position anyway'}
                        {config.fallbackBehavior === 'error' && 'Show error and stop processing'}
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Assigned Workflow (Optional)
                    </label>
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const updatedConfigs = configs.map((c, i) =>
                            i === index ? { ...c, workflowVersion: 'v1' as const, workflowV2Id: undefined } : c
                          );
                          setConfigs(updatedConfigs);
                          onChange(updatedConfigs);
                        }}
                        className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-colors ${
                          (config.workflowVersion || 'v1') === 'v1'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        V1
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updatedConfigs = configs.map((c, i) =>
                            i === index ? { ...c, workflowVersion: 'v2' as const, workflowId: undefined } : c
                          );
                          setConfigs(updatedConfigs);
                          onChange(updatedConfigs);
                        }}
                        className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-colors ${
                          config.workflowVersion === 'v2'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        V2
                      </button>
                    </div>
                  </div>
                  {config.workflowVersion === 'v2' ? (
                    <select
                      value={config.workflowV2Id || ''}
                      onChange={(e) => handleUpdateConfig(index, 'workflowV2Id', e.target.value || undefined)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No workflow</option>
                      {workflowsV2
                        .filter(w => w.isActive && w.workflowType === 'transformation')
                        .map((workflow) => (
                          <option key={workflow.id} value={workflow.id}>
                            {workflow.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <select
                      value={config.workflowId || ''}
                      onChange={(e) => handleUpdateConfig(index, 'workflowId', e.target.value || undefined)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No workflow</option>
                      {workflows
                        .filter(w => w.isActive)
                        .map((workflow) => (
                          <option key={workflow.id} value={workflow.id}>
                            {workflow.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Workflow for this page group
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Filename Template (Optional)
                  </label>
                  <input
                    type="text"
                    value={config.filenameTemplate || ''}
                    onChange={(e) => handleUpdateConfig(index, 'filenameTemplate', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., {{invoiceNumber}}_{{customerName}}"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Custom filename template for this page group. Use {`{{fieldName}}`} placeholders. If not set, the transformation type's default template will be used.
                  </p>

                  {/* Show available fields from previous groups */}
                  {config.groupOrder > 1 && (
                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <ArrowRight className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                            Cross-Group Field Access Available
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-400">
                            You can reference fields from previous groups in this group's filename template and workflow.
                          </p>
                          <div className="mt-2 space-y-1">
                            {configs.slice(0, index).map((prevConfig, prevIndex) => {
                              const prevGroupFields = prevConfig.fieldMappings?.map(fm => fm.fieldName) || [];
                              if (prevGroupFields.length === 0) return null;
                              return (
                                <div key={prevIndex} className="text-xs">
                                  <span className="font-semibold text-green-800 dark:text-green-300">
                                    Group {prevConfig.groupOrder} fields:
                                  </span>
                                  <span className="text-green-700 dark:text-green-400 ml-2">
                                    {prevGroupFields.map(field => `{{group${prevConfig.groupOrder}_${field}}}`).join(', ')}
                                  </span>
                                </div>
                              );
                            })}
                            {configs.slice(0, index).every(c => !c.fieldMappings || c.fieldMappings.length === 0) && (
                              <p className="text-xs text-green-600 dark:text-green-500 italic">
                                No field mappings defined in previous groups yet. Add field mappings to earlier groups to reference them here.
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-green-600 dark:text-green-500 mt-2 italic">
                            Example: Use {`{{group1_bolNumber}}`} to reference the bolNumber field from Group 1
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Field Mappings Section */}
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                <button
                  onClick={() => toggleFieldMappings(index)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Field Mappings
                    </span>
                    {config.fieldMappings && config.fieldMappings.length > 0 && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-xs font-semibold rounded-full">
                        {config.fieldMappings.length}
                      </span>
                    )}
                  </div>
                  {expandedFieldMappings.has(index) ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </button>

                {expandedFieldMappings.has(index) && (
                  <div className="mt-3 space-y-3">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                      <p className="text-sm text-blue-700 dark:text-blue-400">
                        <strong>Note:</strong> Field mappings defined here will completely replace the transformation type's field mappings for this page group.
                      </p>
                    </div>

                    {config.fieldMappings && config.fieldMappings.length > 0 ? (
                      <div className="space-y-3">
                        {config.fieldMappings.map((mapping, mappingIndex) => (
                          <div key={mappingIndex} className={`p-3 rounded-lg border-2 ${
                            mapping.type === 'hardcoded'
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                              : mapping.type === 'mapped'
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                              : mapping.type === 'function'
                              ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
                              : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                          }`}>
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  Field Name
                                </label>
                                <input
                                  type="text"
                                  value={mapping.fieldName}
                                  onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'fieldName', e.target.value)}
                                  className={`w-full px-2 py-1 border-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                                    mapping.type === 'hardcoded'
                                      ? 'border-green-400 dark:border-green-500'
                                      : mapping.type === 'mapped'
                                      ? 'border-blue-400 dark:border-blue-500'
                                      : mapping.type === 'function'
                                      ? 'border-purple-400 dark:border-purple-500'
                                      : 'border-orange-400 dark:border-orange-500'
                                  }`}
                                  placeholder="fieldName"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  Type
                                </label>
                                <select
                                  value={mapping.type}
                                  onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'type', e.target.value as 'ai' | 'mapped' | 'hardcoded' | 'function')}
                                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="ai">AI</option>
                                  <option value="mapped">Mapped</option>
                                  <option value="hardcoded">Hardcoded</option>
                                  <option value="function">Function</option>
                                </select>
                              </div>
                              {mapping.type !== 'function' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    {mapping.type === 'hardcoded' ? 'Value' : mapping.type === 'mapped' ? 'PDF Coordinates' : 'Description'}
                                  </label>
                                  <input
                                    type="text"
                                    value={mapping.value}
                                    onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'value', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder={
                                      mapping.type === 'hardcoded' ? 'Fixed value' :
                                      mapping.type === 'mapped' ? 'e.g., (100, 200, 150, 30)' :
                                      'What to extract'
                                    }
                                  />
                                </div>
                              )}
                              {mapping.type === 'function' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Function
                                  </label>
                                  <select
                                    value={mapping.functionId || ''}
                                    onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'functionId', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="">Select function...</option>
                                    {functions.map((func) => (
                                      <option key={func.id} value={func.id}>
                                        {func.function_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  Page in Group
                                </label>
                                {config.pagesPerGroup > 1 ? (
                                  <input
                                    type="number"
                                    min="1"
                                    max={config.pagesPerGroup}
                                    value={mapping.pageNumberInGroup || 1}
                                    onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'pageNumberInGroup', parseInt(e.target.value) || 1)}
                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="1"
                                  />
                                ) : (
                                  <div className="w-full px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                                    1 (single page)
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  Data Type
                                </label>
                                <select
                                  value={mapping.dataType || 'string'}
                                  onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'dataType', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="string">String</option>
                                  <option value="number">Number</option>
                                  <option value="integer">Integer</option>
                                  <option value="datetime">DateTime</option>
                                  <option value="phone">Phone Number</option>
                                  <option value="boolean">Boolean</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  Max Length
                                </label>
                                {(mapping.dataType || 'string') === 'string' ? (
                                  <input
                                    type="number"
                                    value={mapping.maxLength || ''}
                                    onChange={(e) => handleUpdateFieldMapping(index, mappingIndex, 'maxLength', e.target.value ? parseInt(e.target.value) : undefined)}
                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="40"
                                    min="1"
                                  />
                                ) : (
                                  <div className="w-full px-2 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                                    {(mapping.dataType === 'phone') ? 'Auto' : (mapping.dataType === 'boolean') ? 'True/False' : 'N/A'}
                                  </div>
                                )}
                              </div>
                              <div>
                                <button
                                  onClick={() => handleRemoveFieldMapping(index, mappingIndex)}
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                                  title="Remove field mapping"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                        <Database className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          No field mappings configured for this page group
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => handleAddFieldMapping(index)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Field</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {configs.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h6 className="font-medium text-blue-800 dark:text-blue-300 mb-2">How Page Groups Work</h6>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
            <li>• <strong>Order matters:</strong> Groups are processed sequentially (Group 1, then Group 2, etc.)</li>
            <li>• <strong>Smart detection:</strong> When pattern is set, pages are grouped when that text is found</li>
            <li>• <strong>Fixed positions:</strong> Without a pattern, pages are grouped by position ({configs[0]?.pagesPerGroup} per group)</li>
            <li>• <strong>Process modes:</strong> "Single" processes only first page, "All" processes all pages in the group</li>
            <li>• <strong>Workflows:</strong> Each group can route to a different workflow for custom processing</li>
          </ul>
        </div>
      )}
    </div>
  );
}
