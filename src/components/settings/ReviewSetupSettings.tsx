import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ToggleLeft, ToggleRight, LayoutGrid, AlertCircle, List, Grid3x3 as Grid3X3, Download, Upload, Eye, Copy, FileJson, X } from 'lucide-react';
import type { InboxReviewTemplate } from '../../types';
import { reviewSetupService, type LoadedReviewTemplate } from '../../services/reviewSetupService';
import { supabase } from '../../lib/supabase';
import ReviewFieldGroupsManager from './ReviewFieldGroupsManager';
import ReviewLayoutDesigner from './ReviewLayoutDesigner';
import ReviewTemplateImportModal from './ReviewTemplateImportModal';
import InboxReviewFormView from '../InboxReviewFormView';


type ConfigView = 'fields' | 'layout' | 'preview';

export default function ReviewSetupSettings() {
  const [templates, setTemplates] = useState<InboxReviewTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [configView, setConfigView] = useState<ConfigView>('fields');
  const [showImportModal, setShowImportModal] = useState(false);
  const [previewData, setPreviewData] = useState<LoadedReviewTemplate | null>(null);
  const [previewSampleJson, setPreviewSampleJson] = useState<any>({});
  const [showCopyFromOE, setShowCopyFromOE] = useState(false);
  const [copyingFromOE, setCopyingFromOE] = useState(false);

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSampleJsonModal, setShowSampleJsonModal] = useState(false);
  const [sampleJsonInput, setSampleJsonInput] = useState('');

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      setEditName(selectedTemplate.name);
      setEditDescription(selectedTemplate.description || '');
      setEditIsDefault(selectedTemplate.isDefault || false);
      setEditIsActive(selectedTemplate.isActive);
      setHasChanges(false);
    }
  }, [selectedTemplateId]);

  async function loadTemplates() {
    try {
      setLoading(true);
      const data = await reviewSetupService.loadTemplates();
      setTemplates(data);
      if (data.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      setSaving(true);
      const newTemplate = await reviewSetupService.createTemplate({
        name: 'New Review Template',
        description: '',
        isActive: true,
        isDefault: templates.length === 0
      });
      setTemplates(prev => [...prev, newTemplate]);
      setSelectedTemplateId(newTemplate.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create template');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selectedTemplateId) return;
    try {
      setSaving(true);
      await reviewSetupService.updateTemplate(selectedTemplateId, {
        name: editName.trim(),
        description: editDescription.trim(),
        isActive: editIsActive,
        isDefault: editIsDefault
      });
      setTemplates(prev =>
        prev.map(t =>
          t.id === selectedTemplateId
            ? { ...t, name: editName.trim(), description: editDescription.trim(), isActive: editIsActive, isDefault: editIsDefault }
            : editIsDefault ? { ...t, isDefault: false } : t
        )
      );
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedTemplateId) return;
    try {
      setSaving(true);
      await reviewSetupService.deleteTemplate(selectedTemplateId);
      const remaining = templates.filter(t => t.id !== selectedTemplateId);
      setTemplates(remaining);
      setSelectedTemplateId(remaining.length > 0 ? remaining[0].id : null);
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!selectedTemplateId) return;
    try {
      const exportData = await reviewSetupService.exportTemplate(selectedTemplateId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-template-${exportData.template?.name?.replace(/[^a-z0-9]/gi, '-') || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to export template');
    }
  }

  async function handleCopyFromOrderEntry() {
    if (!selectedTemplateId) return;
    setCopyingFromOE(true);
    try {
      const { data: oeGroups } = await supabase
        .from('order_entry_template_field_groups')
        .select('*')
        .limit(50);
      if (!oeGroups || oeGroups.length === 0) {
        setError('No Order Entry field groups found to copy.');
        return;
      }
      for (const g of oeGroups.slice(0, 10)) {
        await reviewSetupService.createFieldGroup({
          templateId: selectedTemplateId,
          groupName: g.group_name || g.name || 'Copied Group',
          groupOrder: g.group_order || g.sort_order || 0,
          description: g.description || null,
          isArrayGroup: g.is_array_group || false,
          arrayJsonPath: g.array_json_path || null,
          isCollapsedByDefault: false
        });
      }
      setConfigView('fields');
    } catch (err: any) {
      setError(err.message || 'Failed to copy from Order Entry');
    } finally {
      setCopyingFromOE(false);
    }
  }

  function markChanged() {
    setHasChanges(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <LayoutGrid className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Inbox Review Templates</h2>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          <span>New Template</span>
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center space-x-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          <span>Import</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">x</button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <LayoutGrid className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">No Review Templates</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Create a template to configure how inbox items are reviewed.</p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Create First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Template List */}
          <div className="lg:col-span-1 space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Templates</p>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplateId(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm ${
                  selectedTemplateId === t.id
                    ? 'bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 text-purple-900 dark:text-purple-200'
                    : 'bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {t.isDefault ? 'Default Template' : ''}
                </div>
                {!t.isActive && (
                  <span className="inline-block mt-1 text-xs bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Template Editor */}
          {selectedTemplate && (
            <div className="lg:col-span-3 space-y-5">
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-5 border border-gray-200 dark:border-gray-600 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => { setEditName(e.target.value); markChanged(); }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={e => { setEditDescription(e.target.value); markChanged(); }}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    placeholder="Optional description..."
                  />
                </div>

                {/* Default Toggle */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Template</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Used when an extraction type has no specific template assigned</p>
                  </div>
                  <button
                    onClick={() => { setEditIsDefault(!editIsDefault); markChanged(); }}
                    className="flex items-center"
                  >
                    {editIsDefault ? <ToggleRight className="h-6 w-6 text-teal-500" /> : <ToggleLeft className="h-6 w-6 text-gray-400" />}
                  </button>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Only active templates are used during inbox review.</p>
                  </div>
                  <button
                    onClick={() => { setEditIsActive(!editIsActive); markChanged(); }}
                    className="flex items-center"
                  >
                    {editIsActive ? (
                      <ToggleRight className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* View Toggle: Fields vs Layout vs Preview + Export */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
                  <button
                    onClick={() => setConfigView('fields')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      configView === 'fields'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                    <span>Fields</span>
                  </button>
                  <button
                    onClick={() => setConfigView('layout')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      configView === 'layout'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                    <span>Layout</span>
                  </button>
                  <button
                    onClick={async () => {
                      setConfigView('preview');
                      if (selectedTemplateId) {
                        try {
                          const loaded = await reviewSetupService.loadFullTemplate(selectedTemplateId);
                          setPreviewData(loaded);
                        } catch { /* ignore */ }
                      }
                    }}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      configView === 'preview'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Preview</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const currentJson = templates.find(t => t.id === selectedTemplateId)?.sampleJson || '';
                      setSampleJsonInput(currentJson);
                      setShowSampleJsonModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                    title="Import sample JSON for field path picker"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    Sample JSON
                  </button>
                  <button
                    onClick={handleCopyFromOrderEntry}
                    disabled={copyingFromOE}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                    title="Copy field groups from an Order Entry template"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy from OE
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                    title="Export this template as JSON"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                </div>
              </div>

              {/* Conditional Content */}
              {configView === 'fields' ? (
                <ReviewFieldGroupsManager templateId={selectedTemplateId!} sampleJson={templates.find(t => t.id === selectedTemplateId)?.sampleJson || null} />
              ) : configView === 'layout' ? (
                <ReviewLayoutDesigner key={selectedTemplateId} templateId={selectedTemplateId!} />
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Sample JSON (paste extracted data to preview the form)
                    </label>
                    <textarea
                      value={JSON.stringify(previewSampleJson, null, 2)}
                      onChange={(e) => {
                        try { setPreviewSampleJson(JSON.parse(e.target.value)); } catch { /* ignore invalid json while typing */ }
                      }}
                      className="w-full h-28 font-mono text-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                      placeholder='{"field": "value"}'
                    />
                  </div>
                  {previewData ? (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <InboxReviewFormView
                        groups={previewData.groups}
                        fields={previewData.fields}
                        layouts={previewData.layouts}
                        jsonData={previewSampleJson}
                        onFieldChange={(path, value) => {
                          setPreviewSampleJson((prev: any) => {
                            const clone = JSON.parse(JSON.stringify(prev));
                            const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
                            let cur = clone;
                            for (let i = 0; i < parts.length - 1; i++) {
                              const p = parts[i]; const idx = Number(p);
                              cur = isNaN(idx) ? cur[p] : cur[idx];
                            }
                            const last = parts[parts.length - 1]; const li = Number(last);
                            if (isNaN(li)) cur[last] = value; else cur[li] = value;
                            return clone;
                          });
                        }}
                        errors={{}}
                        readOnly={false}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
                      No template data loaded. Save some field groups and fields first.
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center space-x-1.5 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-sm transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Template</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Template</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This will permanently delete the template, all its field groups, fields, and layout configurations. This cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <ReviewTemplateImportModal
          existingTemplates={templates}
          onClose={() => setShowImportModal(false)}
          onImported={(tmpl) => {
            setTemplates(prev => [...prev, tmpl]);
            setSelectedTemplateId(tmpl.id);
            setShowImportModal(false);
          }}
        />
      )}

      {showSampleJsonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FileJson className="h-5 w-5 text-teal-500" />
                Import Sample JSON
              </h3>
              <button onClick={() => setShowSampleJsonModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Paste a sample JSON output from extraction. This will be used to populate the JSON Path picker when adding fields.
            </p>
            <textarea
              value={sampleJsonInput}
              onChange={(e) => setSampleJsonInput(e.target.value)}
              className="flex-1 min-h-[300px] w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              placeholder='{ "shipper": { "name": "...", "city": "..." }, "lineItems": [...] }'
            />
            {sampleJsonInput.trim() && (() => { try { JSON.parse(sampleJsonInput); return null; } catch { return <p className="text-xs text-red-500 mt-1">Invalid JSON format</p>; } })()}
            <div className="flex justify-end gap-2 mt-4">
              {templates.find(t => t.id === selectedTemplateId)?.sampleJson && (
                <button
                  onClick={async () => {
                    try {
                      await reviewSetupService.updateTemplate(selectedTemplateId!, { sampleJson: null });
                      setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? { ...t, sampleJson: null } : t));
                      setSampleJsonInput('');
                      setShowSampleJsonModal(false);
                    } catch {}
                  }}
                  className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  Clear
                </button>
              )}
              <button onClick={() => setShowSampleJsonModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    JSON.parse(sampleJsonInput);
                    await reviewSetupService.updateTemplate(selectedTemplateId!, { sampleJson: sampleJsonInput });
                    setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? { ...t, sampleJson: sampleJsonInput } : t));
                    setShowSampleJsonModal(false);
                  } catch { }
                }}
                disabled={!sampleJsonInput.trim() || (() => { try { JSON.parse(sampleJsonInput); return false; } catch { return true; } })()}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
