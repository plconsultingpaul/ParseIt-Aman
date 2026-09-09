import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Mail, Filter, ChevronRight, ChevronDown, ChevronsUpDown } from 'lucide-react';
import CustomDropdown from '../common/CustomDropdown';
import type { EmailProcessingRule, ExtractionType, TransformationType, WorkflowV2 } from '../../types';
import { fetchWorkflowsV2 } from '../../services/workflowV2Service';

interface EmailRulesSettingsProps {
  emailRules: EmailProcessingRule[];
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  onUpdateEmailRules: (rules: EmailProcessingRule[]) => Promise<void>;
}

export default function EmailRulesSettings({ 
  emailRules, 
  extractionTypes, 
  transformationTypes,
  onUpdateEmailRules 
}: EmailRulesSettingsProps) {
  const [localRules, setLocalRules] = useState<EmailProcessingRule[]>(emailRules);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [workflowsV2, setWorkflowsV2] = useState<WorkflowV2[]>([]);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchWorkflowsV2()
      .then(setWorkflowsV2)
      .catch(err => console.error('Failed to fetch workflows v2:', err));
  }, []);

  const toggleRule = (ruleId: string) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedRules.size === localRules.length) {
      setExpandedRules(new Set());
    } else {
      setExpandedRules(new Set(localRules.map(r => r.id)));
    }
  };

  const getModeLabel = (mode: string) => {
    if (mode === 'workflow_v2') return 'Workflow V2 Mode';
    if (mode === 'transformation') return 'Transform Mode';
    return 'Extract Mode';
  };

  const addRule = () => {
    const newId = `temp-${Date.now()}`;
    const newRule: EmailProcessingRule = {
      id: newId,
      ruleName: '',
      senderPattern: '',
      subjectPattern: '',
      extractionTypeId: extractionTypes[0]?.id || '',
      transformationTypeId: undefined,
      processingMode: 'extraction',
      isEnabled: true,
      priority: 1
    };
    const shifted = localRules.map(r => ({ ...r, priority: r.priority + 1 }));
    setLocalRules([newRule, ...shifted]);
    setExpandedRules(prev => new Set([...prev, newId]));
  };

  const updateRule = (index: number, field: keyof EmailProcessingRule, value: any) => {
    const updated = [...localRules];
    updated[index] = { ...updated[index], [field]: value };
    setLocalRules(updated);
  };

  const removeRule = (index: number) => {
    const removedId = localRules[index].id;
    const updated = localRules.filter((_, i) => i !== index);
    updated.forEach((rule, i) => {
      rule.priority = i + 1;
    });
    setLocalRules(updated);
    setExpandedRules(prev => {
      const next = new Set(prev);
      next.delete(removedId);
      return next;
    });
  };

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const updated = [...localRules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < updated.length) {
      [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
      updated.forEach((rule, i) => {
        rule.priority = i + 1;
      });
      setLocalRules(updated);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateEmailRules(localRules);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save email rules:', error);
      alert('Failed to save email processing rules. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Email Processing Rules</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Define rules to automatically process incoming emails</p>
        </div>
        <div className="flex items-center space-x-3">
          {localRules.length > 0 && (
            <button
              onClick={toggleAll}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 flex items-center space-x-1.5"
            >
              <ChevronsUpDown className="h-4 w-4" />
              <span>{expandedRules.size === localRules.length ? 'Collapse All' : 'Expand All'}</span>
            </button>
          )}
          <button
            onClick={addRule}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Rule</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving...' : 'Save All'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">Email processing rules saved successfully!</p>
        </div>
      )}

      <div className="space-y-3">
        {localRules.map((rule, index) => {
          const isExpanded = expandedRules.has(rule.id);
          const senderDisplay = rule.senderPattern || 'Any sender';

          return (
            <div key={rule.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
              {/* Collapsed header - always visible */}
              <div
                className="flex items-center px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                onClick={() => toggleRule(rule.id)}
              >
                <div className="mr-3 text-gray-400 dark:text-gray-500">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg mr-3">
                  <Filter className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {rule.ruleName || `Rule ${index + 1}`}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    Priority: {rule.priority} • {rule.isEnabled ? 'Enabled' : 'Disabled'} • {getModeLabel(rule.processingMode)}
                    {rule.senderPattern && ` • Sender: ${rule.senderPattern}`}
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => moveRule(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveRule(index, 'down')}
                    disabled={index === localRules.length - 1}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => updateRule(index, 'isEnabled', !rule.isEnabled)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
                      rule.isEnabled
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {rule.isEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => removeRule(index)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-1 border-t border-gray-100 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Processing Mode
                      </label>
                      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => updateRule(index, 'processingMode', 'extraction')}
                          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                            rule.processingMode === 'extraction'
                              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          Extract Data
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRule(index, 'processingMode', 'transformation')}
                          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                            rule.processingMode === 'transformation'
                              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          Transform & Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRule(index, 'processingMode', 'workflow_v2')}
                          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                            rule.processingMode === 'workflow_v2'
                              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          Workflow V2
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Rule Name
                      </label>
                      <input
                        type="text"
                        value={rule.ruleName}
                        onChange={(e) => updateRule(index, 'ruleName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="e.g., Invoice Processing"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {rule.processingMode === 'workflow_v2' ? 'Workflow V2' : rule.processingMode === 'transformation' ? 'Transformation Type' : 'Extraction Type'}
                      </label>
                      {rule.processingMode === 'workflow_v2' ? (
                        <CustomDropdown
                          value={rule.workflowV2Id || ''}
                          onChange={(val) => updateRule(index, 'workflowV2Id', val)}
                          placeholder="Select workflow..."
                          options={workflowsV2.map((wf) => ({
                            value: wf.id,
                            label: wf.name,
                          }))}
                        />
                      ) : (
                        <CustomDropdown
                          value={rule.processingMode === 'transformation' ? (rule.transformationTypeId || '') : (rule.extractionTypeId || '')}
                          onChange={(val) => {
                            if (rule.processingMode === 'transformation') {
                              updateRule(index, 'transformationTypeId', val);
                            } else {
                              updateRule(index, 'extractionTypeId', val);
                            }
                          }}
                          placeholder={`Select ${rule.processingMode === 'transformation' ? 'transformation' : 'extraction'} type...`}
                          options={
                            rule.processingMode === 'transformation'
                              ? (transformationTypes || []).map((type) => ({
                                  value: type.id,
                                  label: type.name,
                                }))
                              : extractionTypes.map((type) => ({
                                  value: type.id,
                                  label: type.name,
                                }))
                          }
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Sender Pattern
                      </label>
                      <input
                        type="text"
                        value={rule.senderPattern}
                        onChange={(e) => updateRule(index, 'senderPattern', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="e.g., @supplier.com or John Doe"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Match sender email or name (partial match)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subject Pattern
                      </label>
                      <input
                        type="text"
                        value={rule.subjectPattern}
                        onChange={(e) => updateRule(index, 'subjectPattern', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="e.g., Invoice or Purchase Order"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Match subject line (partial match)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {localRules.length === 0 && (
          <div className="text-center py-12">
            <Mail className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Processing Rules</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Create your first email processing rule to get started.</p>
            <button
              onClick={addRule}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Add Processing Rule</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">How Email Processing Rules Work</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• Rules are processed in priority order (top to bottom)</li>
          <li>• First matching rule will be used to process the email</li>
          <li>• Choose processing mode: Extract Data, Transform & Rename, or Workflow V2</li>
          <li>• Extract mode processes PDFs for data extraction and API/SFTP upload</li>
          <li>• Transform mode analyzes PDFs to generate new filenames and rename them</li>
          <li>• Workflow V2 mode reads email body/subject data and runs it through a Workflow V2 pipeline</li>
          <li>• Both sender and subject patterns must match (if specified)</li>
          <li>• Leave patterns empty to match all emails</li>
          <li>• Extract and Transform modes require PDF attachments; Workflow V2 mode processes the email body directly</li>
        </ul>
      </div>
    </div>
  );
}
