import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, BrainCircuit, Globe, Braces, Database } from 'lucide-react';
import V2ApiEndpointConfig from './V2ApiEndpointConfig';

interface SourceField {
  label: string;
  value: string;
}

interface V2AiDecisionConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  setConfig: (fn: (prev: any) => any) => void;
  allNodes?: any[];
  currentNodeId?: string;
}

export default function V2AiDecisionConfig({
  config,
  updateConfig,
  setConfig,
  allNodes = [],
  currentNodeId,
}: V2AiDecisionConfigProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    source: true,
    api: true,
    ai: true,
  });

  const sourceFields: SourceField[] = config.sourceFields || [];
  const resultArrayPath = config.resultArrayPath || '';
  const aiInstruction = config.aiInstruction || '';
  const returnFieldPath = config.returnFieldPath || '';
  const outputVariableName = config.outputVariableName || '';
  const responseDataMappings: Array<{ responsePath: string; updatePath: string }> = config.responseDataMappings || [];

  const addResponseMapping = () => {
    updateConfig('responseDataMappings', [...responseDataMappings, { responsePath: '', updatePath: '' }]);
  };

  const updateResponseMapping = (index: number, field: string, value: string) => {
    const updated = [...responseDataMappings];
    updated[index] = { ...updated[index], [field]: value };
    updateConfig('responseDataMappings', updated);
  };

  const removeResponseMapping = (index: number) => {
    updateConfig('responseDataMappings', responseDataMappings.filter((_, i) => i !== index));
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getAvailableVariables = () => {
    const variables: string[] = [];
    allNodes.forEach((node) => {
      if (node.id === currentNodeId || node.type === 'start') return;
      const nodeConfig = node.data?.configJson || {};
      if (nodeConfig.responseDataMappings && Array.isArray(nodeConfig.responseDataMappings)) {
        nodeConfig.responseDataMappings.forEach((m: any) => {
          if (m.updatePath) variables.push(m.updatePath);
        });
      }
    });
    return variables;
  };

  const addSourceField = () => {
    updateConfig('sourceFields', [...sourceFields, { label: '', value: '' }]);
  };

  const updateSourceField = (index: number, field: Partial<SourceField>) => {
    const updated = [...sourceFields];
    updated[index] = { ...updated[index], ...field };
    updateConfig('sourceFields', updated);
  };

  const removeSourceField = (index: number) => {
    updateConfig('sourceFields', sourceFields.filter((_, i) => i !== index));
  };

  const SectionHeader = ({ id, title, icon }: { id: string; title: string; icon: React.ReactNode }) => (
    <button
      onClick={() => toggleSection(id)}
      className="flex items-center space-x-2 w-full text-left py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
    >
      {expandedSections[id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      <span className="flex items-center space-x-1.5">
        {icon}
        <span>{title}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="p-2.5 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
        <div className="flex items-center space-x-2 mb-1">
          <BrainCircuit className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-semibold text-cyan-800 dark:text-cyan-200">AI Decision Step</span>
        </div>
        <p className="text-[11px] text-cyan-700 dark:text-cyan-300 leading-relaxed">
          Fetches candidates from an API endpoint, then uses Gemini AI to match the best
          result against your source record fields. Returns the specified field from the matched record.
        </p>
      </div>

      {/* Section 1: Source Record */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <SectionHeader
          id="source"
          title="Source Record (Extracted Data)"
          icon={<Database className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
        />
        {expandedSections.source && (
          <div className="px-3 pb-3 space-y-2">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Map the extracted fields that represent the record you want to match against.
              Use {'{{variableName}}'} to reference extraction data or prior step outputs.
            </p>
            {sourceFields.map((field, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateSourceField(idx, { label: e.target.value })}
                  placeholder="Label (e.g. Name)"
                  className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => updateSourceField(idx, { value: e.target.value })}
                  placeholder="{{shipperName}}"
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                />
                <button
                  onClick={() => removeSourceField(idx)}
                  className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={addSourceField}
              className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Plus className="h-3 w-3" />
              <span>Add source field</span>
            </button>
          </div>
        )}
      </div>

      {/* Section 2: API Lookup */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <SectionHeader
          id="api"
          title="API Lookup (Candidate Fetch)"
          icon={<Globe className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />}
        />
        {expandedSections.api && (
          <div className="px-3 pb-3 space-y-3">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Configure the API call that fetches multiple candidate records. The AI will pick the best match from these results.
            </p>
            <V2ApiEndpointConfig
              config={config}
              updateConfig={updateConfig}
              setConfig={setConfig}
              allNodes={allNodes}
              currentNodeId={currentNodeId}
              sourceRecordFields={sourceFields}
              hideArrayAndMappingSections
            />
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Result Array Path
              </label>
              <input
                type="text"
                value={resultArrayPath}
                onChange={(e) => updateConfig('resultArrayPath', e.target.value)}
                placeholder="value (e.g. value, data.results, items)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                Dot-path to the array of candidates in the API response. Leave empty if the response itself is the array.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: AI Matching */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <SectionHeader
          id="ai"
          title="AI Matching Configuration"
          icon={<BrainCircuit className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
        />
        {expandedSections.ai && (
          <div className="px-3 pb-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Matching Instructions
              </label>
              <textarea
                value={aiInstruction}
                onChange={(e) => updateConfig('aiInstruction', e.target.value)}
                rows={4}
                placeholder="Match the source record to the closest candidate based on company name and address similarity. Ignore minor spelling differences and abbreviations (e.g. St vs Street)."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                Instructions for Gemini on how to determine the best match. Be specific about what fields to prioritize.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Return Field Path
              </label>
              <input
                type="text"
                value={returnFieldPath}
                onChange={(e) => updateConfig('returnFieldPath', e.target.value)}
                placeholder="clientId (dot-path within matched record)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                The field path within the matched candidate record to extract (e.g. clientId, client.id).
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Output Variable Name
              </label>
              <input
                type="text"
                value={outputVariableName}
                onChange={(e) => updateConfig('outputVariableName', e.target.value)}
                placeholder="matchedClientId"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                Variable name to store the result. Referenced in later steps as {'{{matchedClientId}}'}.
              </p>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Response Data Mappings
                </label>
                <button
                  type="button"
                  onClick={addResponseMapping}
                  className="flex items-center space-x-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Mapping</span>
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                Extract values from the matched record and store them at specific paths in your extracted JSON data.
              </p>
              {responseDataMappings.map((mapping, index) => (
                <div key={index} className="flex items-start space-x-2 p-2.5 mb-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                  <div className="flex-1 space-y-1.5">
                    <div>
                      <input
                        type="text"
                        value={mapping.responsePath}
                        onChange={(e) => updateResponseMapping(index, 'responsePath', e.target.value)}
                        placeholder="clientId (path within matched record)"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                      />
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Field path in matched candidate record</p>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={mapping.updatePath}
                        onChange={(e) => updateResponseMapping(index, 'updatePath', e.target.value)}
                        placeholder="orders[0].consignee.clientId"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono"
                      />
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Where to store in extracted JSON</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeResponseMapping(index)}
                    className="p-1 mt-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.skipAiIfSingleResult !== false}
                onChange={(e) => updateConfig('skipAiIfSingleResult', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <label className="text-xs text-gray-600 dark:text-gray-400">
                Skip AI if only one candidate returned (use it directly)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={config.failOnNoMatch || false}
                onChange={(e) => updateConfig('failOnNoMatch', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <label className="text-xs text-gray-600 dark:text-gray-400">
                Fail step if AI cannot confidently match a record
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
