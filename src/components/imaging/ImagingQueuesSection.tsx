import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Loader2, Layers, Check, X, AlertCircle, Lock, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import type { ImagingBucket, ImagingQueue } from '../../types';
import { fetchBuckets } from '../../services/imagingService';
import { fetchQueues, createQueue, updateQueue, deleteQueue } from '../../services/imagingService';

interface ImagingQueuesSectionProps {
  isAdmin: boolean;
}

export default function ImagingQueuesSection({ isAdmin }: ImagingQueuesSectionProps) {
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [queues, setQueues] = useState<ImagingQueue[]>([]);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [error, setError] = useState('');

  const [newQueueName, setNewQueueName] = useState('');
  const [newQueueDesc, setNewQueueDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadBuckets = useCallback(async () => {
    try {
      const b = await fetchBuckets();
      setBuckets(b);
      if (b.length > 0 && !selectedBucketId) {
        setSelectedBucketId(b[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load buckets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBuckets(); }, [loadBuckets]);

  const loadQueues = useCallback(async () => {
    if (!selectedBucketId) return;
    setQueuesLoading(true);
    setError('');
    try {
      const q = await fetchQueues(selectedBucketId);
      setQueues(q);
    } catch (err: any) {
      setError(err.message || 'Failed to load queues');
    } finally {
      setQueuesLoading(false);
    }
  }, [selectedBucketId]);

  useEffect(() => { loadQueues(); }, [loadQueues]);

  const handleCreate = async () => {
    if (!newQueueName.trim() || !selectedBucketId) return;
    setCreating(true);
    setError('');
    try {
      const q = await createQueue(selectedBucketId, newQueueName.trim(), newQueueDesc.trim());
      setQueues(prev => [...prev, q].sort((a, b) => a.sortOrder - b.sortOrder));
      setNewQueueName('');
      setNewQueueDesc('');
    } catch (err: any) {
      setError(err.message || 'Failed to create queue');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (id: string) => {
    if (!editName.trim()) return;
    setError('');
    try {
      await updateQueue(id, { name: editName.trim(), description: editDesc.trim() });
      setQueues(prev => prev.map(q => q.id === id ? { ...q, name: editName.trim(), description: editDesc.trim() } : q));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update queue');
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      await updateQueue(id, { isActive: !currentActive });
      setQueues(prev => prev.map(q => q.id === id ? { ...q, isActive: !currentActive } : q));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle queue');
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await deleteQueue(id);
      setQueues(prev => prev.filter(q => q.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete queue');
    }
  };

  const handleMoveUp = async (queue: ImagingQueue, index: number) => {
    if (index === 0) return;
    const prev = queues[index - 1];
    try {
      await updateQueue(queue.id, { sortOrder: prev.sortOrder });
      await updateQueue(prev.id, { sortOrder: queue.sortOrder });
      setQueues(qs => {
        const updated = [...qs];
        updated[index] = { ...prev, sortOrder: queue.sortOrder };
        updated[index - 1] = { ...queue, sortOrder: prev.sortOrder };
        return updated;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
    }
  };

  const handleMoveDown = async (queue: ImagingQueue, index: number) => {
    if (index === queues.length - 1) return;
    const next = queues[index + 1];
    try {
      await updateQueue(queue.id, { sortOrder: next.sortOrder });
      await updateQueue(next.id, { sortOrder: queue.sortOrder });
      setQueues(qs => {
        const updated = [...qs];
        updated[index] = { ...next, sortOrder: queue.sortOrder };
        updated[index + 1] = { ...queue, sortOrder: next.sortOrder };
        return updated;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to reorder');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const selectedBucket = buckets.find(b => b.id === selectedBucketId);

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <Layers className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Queues</h3>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 min-h-[300px]">
        <div className="lg:w-48 flex-shrink-0 space-y-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-2">
            Buckets
          </h4>
          {buckets.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-2">No buckets found.</p>
          ) : (
            buckets.map(bucket => (
              <button
                key={bucket.id}
                onClick={() => setSelectedBucketId(bucket.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  selectedBucketId === bucket.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="truncate block">{bucket.name}</span>
                {!bucket.isActive && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Inactive</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          {!selectedBucket ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              Select a bucket to manage its queues.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {selectedBucket.name} Queues
                </h4>
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                  {queues.length}
                </span>
              </div>

              {isAdmin && (
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newQueueName}
                      onChange={(e) => setNewQueueName(e.target.value)}
                      placeholder="Queue name..."
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <input
                      type="text"
                      value={newQueueDesc}
                      onChange={(e) => setNewQueueDesc(e.target.value)}
                      placeholder="Description (optional)"
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={!newQueueName.trim() || creating}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    <span>Add Queue</span>
                  </button>
                </div>
              )}

              {queuesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : queues.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  No queues found for this bucket.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {queues.map((queue, idx) => (
                    <div
                      key={queue.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 group"
                    >
                      {editingId === queue.id ? (
                        <div className="flex-1 space-y-2 mr-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              placeholder="Description"
                              className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex space-x-2">
                            <button onClick={() => handleSave(queue.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          {isAdmin && (
                            <div className="flex flex-col -space-y-1">
                              <button
                                onClick={() => handleMoveUp(queue, idx)}
                                disabled={idx === 0}
                                className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-30 disabled:cursor-default transition-colors"
                                title="Move up"
                              >
                                <GripVertical className="h-3 w-3 rotate-180" />
                              </button>
                              <button
                                onClick={() => handleMoveDown(queue, idx)}
                                disabled={idx === queues.length - 1}
                                className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-30 disabled:cursor-default transition-colors"
                                title="Move down"
                              >
                                <GripVertical className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{queue.name}</span>
                              {queue.isSystem && (
                                <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                                  <Lock className="h-2.5 w-2.5" />
                                  <span>System</span>
                                </span>
                              )}
                              {!queue.isActive && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded">Inactive</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {queue.slug}
                              {queue.description && <> &mdash; {queue.description}</>}
                            </p>
                          </div>
                        </div>
                      )}

                      {editingId !== queue.id && isAdmin && (
                        <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                          {!queue.isSystem && (
                            <button
                              onClick={() => handleToggle(queue.id, queue.isActive)}
                              className="p-1.5 rounded transition-colors"
                              title={queue.isActive ? 'Active' : 'Inactive'}
                            >
                              {queue.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                            </button>
                          )}
                          {!queue.isSystem && (
                            <button
                              onClick={() => {
                                setEditingId(queue.id);
                                setEditName(queue.name);
                                setEditDesc(queue.description);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!queue.isSystem && (
                            deleteConfirmId === queue.id ? (
                              <div className="flex items-center space-x-1">
                                <button onClick={() => handleDelete(queue.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                                <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(queue.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
