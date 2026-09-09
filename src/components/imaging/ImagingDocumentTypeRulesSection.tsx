import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Filter, Loader2, FileType, Pencil } from 'lucide-react';
import type { ImagingDocumentTypeProcessingRule, ImagingDocumentType, ImagingBucket, WorkflowV2 } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import {
  fetchImagingDocumentTypeRules,
  saveImagingDocumentTypeRules,
  fetchBuckets,
  fetchDocumentTypes,
} from '../../services/imagingService';
import { fetchWorkflowsV2 } from '../../services/workflowV2Service';

interface ImagingDocumentTypeRulesSectionProps {
  isAdmin: boolean;
}

const ALL_SOURCES: Array<{ value: 'manual' | 'api' | 'email' | 'sftp'; label: string }> = [
  { value: 'manual', label: 'Manual (UI)' },
  { value: 'api', label: 'API Endpoint' },
  { value: 'email', label: 'Email Ingest' },
  { value: 'sftp', label: 'SFTP Ingest' },
];

export default function ImagingDocumentTypeRulesSection({ isAdmin }: ImagingDocumentTypeRulesSectionProps) {
  const [rules, setRules] = useState<ImagingDocumentTypeProcessingRule[]>([]);
  const [documentTypes, setDocumentTypes] = useState<ImagingDocumentType[]>([]);
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [rulesData, dtypes, bucketsData, wfData] = await Promise.all([
        fetchImagingDocumentTypeRules(),
        fetchDocumentTypes(),
        fetchBuckets(),
        fetchWorkflowsV2(),
      ]);
      setRules(rulesData);
      setDocumentTypes(dtypes.filter(dt => dt.isActive));
      setBuckets(bucketsData.filter(b => b.isActive));
      setWorkflows(wfData.filter(w => w.isActive && w.workflowType === 'imaging'));
    } catch (err: any) {
      setError(err.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRule = () => {
    setRules(prev => {
      const next = [...prev, {
        id: `temp-${Date.now()}`,
        ruleName: '',
        documentTypeId: documentTypes[0]?.id || '',
        imagingBucketId: null,
        workflowV2Id: workflows[0]?.id || undefined,
        triggerSources: ['manual', 'api'] as Array<'manual' | 'api' | 'email' | 'sftp'>,
        isEnabled: true,
        priority: prev.length + 1,
      }];
      setEditingIndex(next.length - 1);
      return next;
    });
    setSaveSuccess(false);
  };

  const updateRule = (index: number, field: keyof ImagingDocumentTypeProcessingRule, value: any) => {
    setRules(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setSaveSuccess(false);
  };

  const toggleSource = (index: number, source: 'manual' | 'api' | 'email' | 'sftp') => {
    setRules(prev => {
      const updated = [...prev];
      const current = new Set(updated[index].triggerSources || []);
      if (current.has(source)) current.delete(source);
      else current.add(source);
      updated[index] = {
        ...updated[index],
        triggerSources: Array.from(current) as Array<'manual' | 'api' | 'email' | 'sftp'>,
      };
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
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
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
      await saveImagingDocumentTypeRules(rules);
      setSaveSuccess(true);
      setEditingIndex(null);
      const refreshed = await fetchImagingDocumentTypeRules();
      setRules(refreshed);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save rules');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  const docTypeName = (id: string) => documentTypes.find(d => d.id === id)?.name || 'Unknown';
  const bucketName = (id?: string | null) => id ? buckets.find(b => b.id === id)?.name || '' : 'Any bucket';
  const workflowName = (id?: string) => id ? workflows.find(w => w.id === id)?.name || '(missing)' : '(none)';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Document Type Processing Rules</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            {rules.length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}
          {saveSuccess && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
              Rules saved.
            </div>
          )}

          {rules.map((rule, index) => {
            const isEditing = editingIndex === index;
            return (
              <div key={rule.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                      <FileType className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {rule.ruleName || `Rule ${index + 1}`}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Priority: {rule.priority} — {rule.isEnabled ? 'Enabled' : 'Disabled'} — Type: {docTypeName(rule.documentTypeId)} — Bucket: {bucketName(rule.imagingBucketId)} — Workflow: {workflowName(rule.workflowV2Id)}
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
                      <button onClick={() => setEditingIndex(isEditing ? null : index)}
                        title={isEditing ? 'Close editor' : 'Edit rule'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isEditing
                            ? 'text-blue-700 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                        }`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeRule(index)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className={labelCls}>Rule Name</label>
                        <input type="text" className={inputCls} value={rule.ruleName}
                          onChange={(e) => updateRule(index, 'ruleName', e.target.value)}
                          placeholder="e.g., Invoice to Customer" disabled={!isAdmin} />
                      </div>
                      <div>
                        <label className={labelCls}>Document Type</label>
                        <CustomDropdown
                          value={rule.documentTypeId}
                          onChange={(val) => updateRule(index, 'documentTypeId', val)}
                          placeholder="Select document type..."
                          options={documentTypes.map(dt => ({ value: dt.id, label: dt.name }))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
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
                        <label className={labelCls}>Bucket Filter (optional)</label>
                        <CustomDropdown
                          value={rule.imagingBucketId || ''}
                          onChange={(val) => updateRule(index, 'imagingBucketId', val || null)}
                          placeholder="Any bucket"
                          options={[
                            { value: '', label: 'Any bucket' },
                            ...buckets.map(b => ({ value: b.id, label: b.name })),
                          ]}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Trigger Sources</label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_SOURCES.map(src => {
                          const active = (rule.triggerSources || []).includes(src.value);
                          return (
                            <button
                              key={src.value}
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => toggleSource(index, src.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                            >
                              {src.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        Rule fires only for the selected ingestion sources.
                      </p>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {rules.length === 0 && (
            <div className="text-center py-8">
              <FileType className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No document type rules yet.</p>
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
            <p className="font-semibold">How Document Type Rules Work</p>
            <ul className="space-y-0.5 ml-2">
              <li>Rules run whenever a document is indexed and its document type matches.</li>
              <li>All matching enabled rules fire in priority order (top to bottom).</li>
              <li>Bucket filter is optional — leave empty to run for any bucket.</li>
              <li>Trigger sources control which ingestion paths (Manual UI, API, Email, SFTP) fire the rule.</li>
              <li>The associated Imaging Workflow V2 receives the document, bucket, and indexed metadata.</li>
              <li>Runs appear in the Workflow Execution Logs page.</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
