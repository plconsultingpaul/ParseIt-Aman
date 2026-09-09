import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Filter, Loader2, Mail } from 'lucide-react';
import type { ImagingEmailProcessingRule, ImagingEmailMonitoringConfig, ImagingBucket, WorkflowV2 } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import { fetchImagingEmailRules, saveImagingEmailRules, fetchBuckets, fetchImagingEmailConfigs } from '../../services/imagingService';
import { fetchWorkflowsV2 } from '../../services/workflowV2Service';

interface ImagingEmailRulesSectionProps {
  isAdmin: boolean;
}

export default function ImagingEmailRulesSection({ isAdmin }: ImagingEmailRulesSectionProps) {
  const [emailConfigs, setEmailConfigs] = useState<ImagingEmailMonitoringConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [rules, setRules] = useState<ImagingEmailProcessingRule[]>([]);
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  const loadConfigs = useCallback(async () => {
    try {
      const [configs, bucketsData, wfData] = await Promise.all([
        fetchImagingEmailConfigs(),
        fetchBuckets(),
        fetchWorkflowsV2(),
      ]);
      setEmailConfigs(configs);
      setBuckets(bucketsData.filter(b => b.isActive));
      setWorkflows(wfData.filter(w => w.isActive && w.workflowType === 'imaging'));
      if (configs.length > 0 && !selectedConfigId) {
        setSelectedConfigId(configs[0].id || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load email configs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const loadRules = useCallback(async () => {
    if (!selectedConfigId) {
      setRules([]);
      return;
    }
    try {
      const rulesData = await fetchImagingEmailRules(selectedConfigId);
      setRules(rulesData);
    } catch (err: any) {
      setError(err.message || 'Failed to load rules');
    }
  }, [selectedConfigId]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const addRule = () => {
    setRules(prev => [...prev, {
      id: `temp-${Date.now()}`,
      ruleName: '',
      matchType: 'subject',
      matchPattern: '',
      workflowV2Id: workflows[0]?.id || undefined,
      imagingBucketId: null,
      emailConfigId: selectedConfigId,
      isEnabled: true,
      priority: prev.length + 1,
    }]);
  };

  const updateRule = (index: number, field: keyof ImagingEmailProcessingRule, value: any) => {
    setRules(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setSaveSuccess(false);
  };

  const removeRule = (index: number) => {
    setRules(prev => {
      const updated = prev.filter((_, i) => i !== index);
      updated.forEach((r, i) => { r.priority = i + 1; });
      return updated;
    });
    setSaveSuccess(false);
  };

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    setRules(prev => {
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      updated.forEach((r, i) => { r.priority = i + 1; });
      return updated;
    });
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      await saveImagingEmailRules(rules, selectedConfigId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save rules');
    } finally {
      setSaving(false);
    }
  };

  const selectedConfig = emailConfigs.find(c => c.id === selectedConfigId);
  const configLabel = selectedConfig
    ? (selectedConfig.configName || selectedConfig.monitoredEmail || 'Unnamed')
    : '';

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Processing Rules</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            {rules.length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : emailConfigs.length === 0 ? (
        <div className="text-center py-8">
          <Mail className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">No email accounts configured.</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Add an email account in the Provider Configuration section first.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls}>Email Account</label>
            <CustomDropdown
              value={selectedConfigId}
              onChange={(val) => {
                setSelectedConfigId(val);
                setSaveSuccess(false);
                setError('');
              }}
              options={emailConfigs.map(cfg => ({
                value: cfg.id,
                label: `${cfg.configName || cfg.monitoredEmail || 'Unnamed Account'}${cfg.monitoredEmail && cfg.configName ? ` (${cfg.monitoredEmail})` : ''}`,
              }))}
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              Rules are scoped to the selected email account
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
              Rules saved for {configLabel}.
            </div>
          )}

          {rules.map((rule, index) => (
            <div key={rule.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                    <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                      {rule.ruleName || `Rule ${index + 1}`}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Priority: {rule.priority} -- {rule.isEnabled ? 'Enabled' : 'Disabled'} -- Match: {rule.matchType === 'subject' ? 'Email Subject' : 'Barcode Pattern'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center space-x-1.5">
                    <button onClick={() => moveRule(index, 'up')} disabled={index === 0}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 text-xs" title="Move up">
                      ↑
                    </button>
                    <button onClick={() => moveRule(index, 'down')} disabled={index === rules.length - 1}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 text-xs" title="Move down">
                      ↓
                    </button>
                    <button onClick={() => updateRule(index, 'isEnabled', !rule.isEnabled)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                        rule.isEnabled
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 hover:bg-green-200'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}>
                      {rule.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button onClick={() => removeRule(index)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Rule Name</label>
                  <input type="text" className={inputCls} value={rule.ruleName}
                    onChange={(e) => updateRule(index, 'ruleName', e.target.value)}
                    placeholder="e.g., BOL Documents" disabled={!isAdmin} />
                </div>
                <div>
                  <label className={labelCls}>Match Type</label>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button type="button" onClick={() => updateRule(index, 'matchType', 'subject')} disabled={!isAdmin}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        rule.matchType === 'subject'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}>
                      Email Subject
                    </button>
                    <button type="button" onClick={() => updateRule(index, 'matchType', 'barcode_pattern')} disabled={!isAdmin}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        rule.matchType === 'barcode_pattern'
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}>
                      Barcode Pattern
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>
                    {rule.matchType === 'subject' ? 'Subject Pattern' : 'Barcode Pattern'}
                  </label>
                  <input type="text" className={inputCls} value={rule.matchPattern}
                    onChange={(e) => updateRule(index, 'matchPattern', e.target.value)}
                    placeholder={rule.matchType === 'subject' ? 'e.g., BOL or Invoice' : 'e.g., BOL-* or INV'}
                    disabled={!isAdmin} />
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {rule.matchType === 'subject' ? 'Partial match on email subject line' : 'Partial match on detected barcode value in PDF'}
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Workflow V2 (Imaging)</label>
                  <CustomDropdown
                    value={rule.workflowV2Id || ''}
                    onChange={(val) => updateRule(index, 'workflowV2Id', val || undefined)}
                    placeholder="Select workflow..."
                    options={workflows.map(wf => ({ value: wf.id, label: wf.name }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Bucket Override (optional)</label>
                  <CustomDropdown
                    value={rule.imagingBucketId || ''}
                    onChange={(val) => updateRule(index, 'imagingBucketId', val || null)}
                    placeholder="Use default bucket"
                    options={buckets.map(b => ({ value: b.id, label: b.name }))}
                  />
                </div>
              </div>
            </div>
          ))}

          {rules.length === 0 && (
            <div className="text-center py-8">
              <Mail className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No rules for {configLabel}.</p>
              {isAdmin && (
                <button onClick={addRule}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                  <Plus className="h-4 w-4" />
                  <span>Add Rule</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && rules.length > 0 && (
            <div className="flex items-center space-x-2">
              <button onClick={addRule}
                className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Plus className="h-4 w-4" />
                <span>Add Rule</span>
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center space-x-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>{saving ? 'Saving...' : 'Save Rules'}</span>
              </button>
            </div>
          )}

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p className="font-semibold">How Email Processing Rules Work</p>
            <ul className="space-y-0.5 ml-2">
              <li>Rules are scoped to the selected email account above</li>
              <li>Rules are evaluated in priority order (top to bottom)</li>
              <li>The first matching rule triggers the associated Imaging Workflow V2</li>
              <li><strong>Email Subject</strong> match: compares pattern against the email subject line (partial match)</li>
              <li><strong>Barcode Pattern</strong> match: compares pattern against barcode values detected in PDF attachments</li>
              <li>Optionally override the target bucket per rule</li>
              <li>If no rule matches, the default barcode indexing / unindexed queue behavior applies</li>
              <li>Only Imaging-type Workflow V2s are shown in the dropdown</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
