import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil as Edit2, Trash2, Loader2, Database, ToggleLeft, ToggleRight, Check, X, AlertCircle, Info, Star, Eye, Copy, FileType, ChevronUp, ChevronDown } from 'lucide-react';
import type { ImagingBucket, ImagingDocumentType } from '../../types';
import {
  fetchBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  setDefaultBucket,
  clearDefaultBucket,
  fetchDocumentTypes,
  fetchBucketDocumentTypeIds,
  setBucketDocumentTypes,
} from '../../services/imagingService';

interface ImagingBucketsSectionProps {
  isAdmin: boolean;
}

export default function ImagingBucketsSection({ isAdmin }: ImagingBucketsSectionProps) {
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketDesc, setNewBucketDesc] = useState('');
  const [creatingBucket, setCreatingBucket] = useState(false);

  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [editBucketName, setEditBucketName] = useState('');
  const [editBucketDesc, setEditBucketDesc] = useState('');
  const [deleteBucketConfirmId, setDeleteBucketConfirmId] = useState<string | null>(null);
  const [viewingBucket, setViewingBucket] = useState<ImagingBucket | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const [assignmentsOpenId, setAssignmentsOpenId] = useState<string | null>(null);
  const [assignmentSelection, setAssignmentSelection] = useState<Set<string>>(new Set());
  const [assignmentInitial, setAssignmentInitial] = useState<Set<string>>(new Set());
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const handleCopy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(prev => (prev === field ? null : prev)), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [b, dt] = await Promise.all([fetchBuckets(), fetchDocumentTypes()]);
      setBuckets(b);
      setDocTypes(dt);
      const counts: Record<string, number> = {};
      await Promise.all(
        b.map(async (bk) => {
          try {
            const ids = await fetchBucketDocumentTypeIds(bk.id);
            counts[bk.id] = ids.length;
          } catch {
            counts[bk.id] = 0;
          }
        })
      );
      setAssignmentCounts(counts);
    } catch (err: any) {
      setError(err.message || 'Failed to load buckets');
    } finally {
      setLoading(false);
    }
  }, []);

  const openAssignments = async (bucketId: string) => {
    if (assignmentsOpenId === bucketId) {
      setAssignmentsOpenId(null);
      return;
    }
    setAssignmentsOpenId(bucketId);
    setAssignmentLoading(true);
    try {
      const ids = await fetchBucketDocumentTypeIds(bucketId);
      const set = new Set(ids);
      setAssignmentSelection(set);
      setAssignmentInitial(new Set(set));
    } catch (err: any) {
      setError(err.message || 'Failed to load document type assignments');
      setAssignmentsOpenId(null);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const toggleAssignmentSelection = (documentTypeId: string) => {
    setAssignmentSelection(prev => {
      const next = new Set(prev);
      if (next.has(documentTypeId)) next.delete(documentTypeId);
      else next.add(documentTypeId);
      return next;
    });
  };

  const saveAssignments = async (bucketId: string) => {
    setAssignmentSaving(true);
    setError('');
    try {
      const ids = Array.from(assignmentSelection);
      await setBucketDocumentTypes(bucketId, ids);
      setAssignmentCounts(prev => ({ ...prev, [bucketId]: ids.length }));
      setAssignmentInitial(new Set(assignmentSelection));
      setAssignmentsOpenId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save document type assignments');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const assignmentDirty = (() => {
    if (assignmentSelection.size !== assignmentInitial.size) return true;
    for (const id of assignmentSelection) if (!assignmentInitial.has(id)) return true;
    return false;
  })();

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateBucket = async () => {
    if (!newBucketName.trim()) return;
    setCreatingBucket(true);
    setError('');
    try {
      const bucket = await createBucket(newBucketName.trim(), newBucketDesc.trim());
      setBuckets(prev => [...prev, bucket].sort((a, b) => a.name.localeCompare(b.name)));
      setNewBucketName('');
      setNewBucketDesc('');
    } catch (err: any) {
      setError(err.message || 'Failed to create bucket');
    } finally {
      setCreatingBucket(false);
    }
  };

  const handleSaveBucket = async (id: string) => {
    if (!editBucketName.trim()) return;
    setError('');
    try {
      await updateBucket(id, { name: editBucketName.trim(), description: editBucketDesc.trim() });
      setBuckets(prev => prev.map(b => b.id === id ? { ...b, name: editBucketName.trim(), description: editBucketDesc.trim() } : b));
      setEditingBucketId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update bucket');
    }
  };

  const handleToggleBucket = async (id: string, currentActive: boolean) => {
    try {
      await updateBucket(id, { isActive: !currentActive });
      setBuckets(prev => prev.map(b => b.id === id ? { ...b, isActive: !currentActive } : b));
    } catch (err: any) {
      setError(err.message || 'Failed to toggle bucket');
    }
  };

  const handleDeleteBucket = async (id: string) => {
    setError('');
    try {
      await deleteBucket(id);
      setBuckets(prev => prev.filter(b => b.id !== id));
      setDeleteBucketConfirmId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete bucket. It may have documents linked to it.');
    }
  };

  const handleToggleDefault = async (id: string, currentlyDefault: boolean) => {
    setError('');
    try {
      if (currentlyDefault) {
        await clearDefaultBucket(id);
        setBuckets(prev => prev.map(b => b.id === id ? { ...b, isDefault: false } : b));
      } else {
        await setDefaultBucket(id);
        setBuckets(prev => prev.map(b => ({ ...b, isDefault: b.id === id })));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to set default bucket');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <Database className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Storage Buckets</h3>
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
          {buckets.length}
        </span>
      </div>

      <div className="flex items-start space-x-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-blue-800 dark:text-blue-300 space-y-1">
          <p className="font-medium">Document Imaging Viewer URL</p>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            To open the imaging viewer, use: <code className="bg-blue-100 dark:bg-blue-800/50 px-1.5 py-0.5 rounded font-mono">/imaging/view?documentId=VALUE</code>
          </p>
          <div className="text-xs text-blue-600 dark:text-blue-400/80 space-y-0.5">
            <p><code className="font-mono bg-blue-100 dark:bg-blue-800/50 px-1 rounded">documentId</code> <span className="text-blue-500 dark:text-blue-500">(required)</span> &mdash; the imaging document UUID. Use <code className="font-mono bg-blue-100 dark:bg-blue-800/50 px-1 rounded">%i</code> as a placeholder for the data value in workflow steps.</p>
            <p><code className="font-mono bg-blue-100 dark:bg-blue-800/50 px-1 rounded">documentType</code> <span className="text-blue-500 dark:text-blue-500">(optional)</span> &mdash; filters to a specific document type name.</p>
          </div>
        </div>
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

      {isAdmin && (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={newBucketName}
              onChange={(e) => setNewBucketName(e.target.value)}
              placeholder="Bucket name..."
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              value={newBucketDesc}
              onChange={(e) => setNewBucketDesc(e.target.value)}
              placeholder="Description (optional)"
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A Supabase Storage bucket will be created automatically. The public URL will be generated for you.
          </p>
          <button
            onClick={handleCreateBucket}
            disabled={!newBucketName.trim() || creatingBucket}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creatingBucket ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>Add Bucket</span>
          </button>
        </div>
      )}

      {buckets.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
          No storage buckets configured yet.
        </div>
      ) : (
        <div className="space-y-2">
          {buckets.map(bucket => (
            <div
              key={bucket.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
            >
            <div
              className="flex items-center justify-between p-3 group"
            >
              {editingBucketId === bucket.id ? (
                <div className="flex-1 space-y-2 mr-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editBucketName}
                      onChange={(e) => setEditBucketName(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editBucketDesc}
                      onChange={(e) => setEditBucketDesc(e.target.value)}
                      placeholder="Description"
                      className="px-2 py-1.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => handleSaveBucket(bucket.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingBucketId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{bucket.name}</span>
                    {bucket.isDefault && (
                      <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        <span>Default</span>
                      </span>
                    )}
                    {!bucket.isActive && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{bucket.url}</p>
                  {bucket.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{bucket.description}</p>}
                </div>
              )}

              {editingBucketId !== bucket.id && isAdmin && (
                <div className="flex items-center space-x-1 ml-3">
                  <button
                    onClick={() => setViewingBucket(bucket)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                    title="View bucket details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openAssignments(bucket.id)}
                    className={`p-1.5 rounded transition-colors flex items-center space-x-1 ${
                      assignmentsOpenId === bucket.id
                        ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                    }`}
                    title="Assign document types"
                  >
                    <FileType className="h-4 w-4" />
                    {(assignmentCounts[bucket.id] ?? 0) > 0 && (
                      <span className="text-[10px] font-semibold px-1 py-0 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {assignmentCounts[bucket.id]}
                      </span>
                    )}
                    {assignmentsOpenId === bucket.id
                      ? <ChevronUp className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => handleToggleDefault(bucket.id, bucket.isDefault)}
                    className={`p-1.5 rounded transition-colors ${bucket.isDefault ? 'text-amber-500' : 'text-gray-300 dark:text-gray-500 hover:text-amber-400'}`}
                    title={bucket.isDefault ? 'Remove as default' : 'Set as default'}
                  >
                    <Star className={`h-4 w-4 ${bucket.isDefault ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleToggleBucket(bucket.id, bucket.isActive)}
                    className="p-1.5 rounded transition-colors"
                    title={bucket.isActive ? 'Active' : 'Inactive'}
                  >
                    {bucket.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setEditingBucketId(bucket.id);
                      setEditBucketName(bucket.name);
                      setEditBucketDesc(bucket.description);
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  {deleteBucketConfirmId === bucket.id ? (
                    <div className="flex items-center space-x-1">
                      <button onClick={() => handleDeleteBucket(bucket.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                      <button onClick={() => setDeleteBucketConfirmId(null)} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteBucketConfirmId(bucket.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
              {assignmentsOpenId === bucket.id && (
                <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Allowed document types</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Check the document types you want to allow in this bucket. Leave everything unchecked to allow all types.
                      </p>
                    </div>
                  </div>
                  {assignmentLoading ? (
                    <div className="flex items-center py-4 text-xs text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading assignments...
                    </div>
                  ) : docTypes.length === 0 ? (
                    <p className="py-3 text-xs text-gray-500 dark:text-gray-400">
                      No document types are configured yet. Add them in the Document Types section first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 mb-3">
                      {docTypes.filter(dt => dt.isActive).map(dt => {
                        const checked = assignmentSelection.has(dt.id);
                        return (
                          <label
                            key={dt.id}
                            className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-xs cursor-pointer border transition-colors ${
                              checked
                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssignmentSelection(dt.id)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="truncate">{dt.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => setAssignmentsOpenId(null)}
                      disabled={assignmentSaving}
                      className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveAssignments(bucket.id)}
                      disabled={assignmentSaving || assignmentLoading || !assignmentDirty}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:hover:bg-blue-600"
                    >
                      {assignmentSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      <span>Save assignments</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingBucket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewingBucket(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-blue-500" />
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Bucket Details</h4>
              </div>
              <button
                onClick={() => setViewingBucket(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Name</label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{viewingBucket.name}</span>
                  {viewingBucket.isDefault && (
                    <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      <span>Default</span>
                    </span>
                  )}
                  {!viewingBucket.isActive && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded">Inactive</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Bucket ID</label>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                  Use this permanent identifier for API integrations. It never changes.
                </p>
                <div className="flex items-stretch">
                  <code className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-gray-800 dark:text-gray-200 break-all">
                    {viewingBucket.id}
                  </code>
                  <button
                    onClick={() => handleCopy(viewingBucket.id, 'id')}
                    className="px-3 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center"
                    title="Copy Bucket ID"
                  >
                    {copiedField === 'id' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Storage Slug</label>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
                  Human-friendly name of the underlying storage bucket.
                </p>
                <div className="flex items-stretch">
                  <code className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-gray-800 dark:text-gray-200 break-all">
                    {viewingBucket.supabaseStorageSlug || '—'}
                  </code>
                  <button
                    onClick={() => viewingBucket.supabaseStorageSlug && handleCopy(viewingBucket.supabaseStorageSlug, 'slug')}
                    disabled={!viewingBucket.supabaseStorageSlug}
                    className="px-3 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                    title="Copy slug"
                  >
                    {copiedField === 'slug' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {viewingBucket.url && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Public URL</label>
                  <div className="flex items-stretch">
                    <code className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-l-lg text-gray-800 dark:text-gray-200 break-all">
                      {viewingBucket.url}
                    </code>
                    <button
                      onClick={() => handleCopy(viewingBucket.url, 'url')}
                      className="px-3 border border-l-0 border-gray-200 dark:border-gray-700 rounded-r-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center"
                      title="Copy URL"
                    >
                      {copiedField === 'url' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {viewingBucket.description && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Description</label>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{viewingBucket.description}</p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 flex justify-end">
              <button
                onClick={() => setViewingBucket(null)}
                className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
