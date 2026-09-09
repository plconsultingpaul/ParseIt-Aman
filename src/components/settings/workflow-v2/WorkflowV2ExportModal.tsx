import React, { useState } from 'react';
import { Download, Loader2, X, Check, GitMerge } from 'lucide-react';
import type { WorkflowV2 } from '../../../types';
import { exportWorkflowsV2, downloadWorkflowV2Export } from '../../../services/workflowV2ExportService';

interface WorkflowV2ExportModalProps {
  workflows: WorkflowV2[];
  onClose: () => void;
}

export default function WorkflowV2ExportModal({ workflows, onClose }: WorkflowV2ExportModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === workflows.length && workflows.length > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(workflows.map(w => w.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    setError(null);

    try {
      const ids = Array.from(selected);
      const data = await exportWorkflowsV2(ids);

      const names = workflows
        .filter(w => selected.has(w.id))
        .map(w => w.name);
      const filename = names.length === 1
        ? `workflow-v2-${names[0].replace(/\s+/g, '-').toLowerCase()}.json`
        : `workflow-v2-export-${data.workflows.length}-workflows.json`;

      downloadWorkflowV2Export(data, filename);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const typeBadge = (type: string) => {
    const cls = type === 'extraction'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
      : type === 'transformation'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
    const label = type === 'extraction' ? 'Extract' : type === 'transformation' ? 'Transform' : 'Imaging';
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${cls}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Export Workflows</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Select the workflows you want to export
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start">
              <X className="h-4 w-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {workflows.length === 0 ? (
            <div className="text-center py-8">
              <GitMerge className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No workflows available to export</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-500 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Select All ({workflows.length})
                </span>
              </label>

              <div className="max-h-72 overflow-y-auto space-y-1">
                {workflows.map(wf => (
                  <label
                    key={wf.id}
                    className="flex items-center space-x-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(wf.id)}
                      onChange={() => toggle(wf.id)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">{wf.name}</span>
                    {typeBadge(wf.workflowType)}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={selected.size === 0 || exporting}
            className="flex items-center px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
