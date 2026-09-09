import React, { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Loader2, Save, Play, Trash2, Plus, AlertCircle, CheckCircle, X, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, FlaskConical, FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ImagingSftpFolderConfig, ImagingBucket } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import { fetchImagingSftpFolderConfigs, createImagingSftpFolderConfig, updateImagingSftpFolderConfig, deleteImagingSftpFolderConfig, fetchBuckets } from '../../services/imagingService';
import { supabase } from '../../lib/supabase';

interface TestFileResult {
  filename: string;
  size: number;
  matchedRule: string | null;
  matchedPattern: string | null;
  matchType: 'filename_pattern' | 'barcode_pattern' | null;
  detectedBarcodes: string[] | null;
  matchedBarcode: string | null;
  barcodeError: string | null;
  extractionError: string | null;
}

interface TestResult {
  folderName: string;
  monitoredPath: string;
  totalRules: number;
  barcodeRules: number;
  barcodesTested: boolean;
  files: TestFileResult[];
  summary: {
    totalFiles: number;
    matchedFiles: number;
    unmatchedFiles: number;
    ruleBreakdown: Record<string, number>;
  };
}

interface ImagingSftpFoldersSectionProps {
  isAdmin: boolean;
}

export default function ImagingSftpFoldersSection({ isAdmin }: ImagingSftpFoldersSectionProps) {
  const [folders, setFolders] = useState<ImagingSftpFolderConfig[]>([]);
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [flds, bkts] = await Promise.all([fetchImagingSftpFolderConfigs(), fetchBuckets()]);
      setFolders(flds);
      setBuckets(bkts);
      if (flds.length > 0 && !expandedId) {
        setExpandedId(flds[0].id || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load folder configs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const updateFolder = (folderId: string | undefined, partial: Partial<ImagingSftpFolderConfig>) => {
    setFolders(prev => prev.map(f => (f.id === folderId ? { ...f, ...partial } : f)));
  };

  const handleAddFolder = async () => {
    setError('');
    setSuccess('');
    try {
      const created = await createImagingSftpFolderConfig({
        folderName: `Folder ${folders.length + 1}`,
        monitoredPath: '/inbox/',
        processedPath: '/processed/',
        imagingBucketId: null,
        isEnabled: true,
        pollingInterval: 5,
      });
      setFolders(prev => [...prev, created]);
      setExpandedId(created.id || null);
      setSuccess('New folder added. Configure and save below.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create folder config');
    }
  };

  const handleSave = async (folder: ImagingSftpFolderConfig) => {
    if (!folder.id) return;
    setSavingId(folder.id);
    setError('');
    setSuccess('');
    try {
      await updateImagingSftpFolderConfig(folder);
      setSuccess(`"${folder.folderName || 'Folder'}" saved.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (folder: ImagingSftpFolderConfig) => {
    if (!folder.id) return;
    if (!window.confirm(`Delete "${folder.folderName || 'this folder'}" and all its processing rules? This cannot be undone.`)) return;
    setDeletingId(folder.id);
    setError('');
    try {
      await deleteImagingSftpFolderConfig(folder.id);
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      if (expandedId === folder.id) {
        setExpandedId(folders.find(f => f.id !== folder.id)?.id || null);
      }
      setSuccess('Folder deleted.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete folder');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRunNow = async (folder: ImagingSftpFolderConfig) => {
    if (!folder.id) return;
    setRunningId(folder.id);
    setError('');
    setSuccess('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/imaging-sftp-monitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ folderConfigId: folder.id }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || result.details || 'Run failed');
      const msg = result.filesFound !== undefined
        ? `"${folder.folderName}" - ${result.filesFound} file(s) found, ${result.filesProcessed || 0} processed.`
        : `"${folder.folderName}" - monitor completed.`;
      setSuccess(msg);
      setTimeout(() => setSuccess(''), 6000);
    } catch (err: any) {
      setError(err.message || 'Failed to run SFTP monitor');
    } finally {
      setRunningId(null);
    }
  };

  const handleTestFolder = async (folder: ImagingSftpFolderConfig) => {
    if (!folder.id) return;
    setTestingId(folder.id);
    setTestResult(null);
    setError('');
    setSuccess('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/imaging-sftp-monitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ action: 'test_folder', folderConfigId: folder.id }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Test failed');
      setTestResult(result as TestResult);
    } catch (err: any) {
      setError(err.message || 'Failed to test folder');
    } finally {
      setTestingId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FolderOpen className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monitored Folders</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            {folders.length} folder{folders.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isAdmin && (
          <button onClick={handleAddFolder}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" />
            <span>Add Folder</span>
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {folders.length === 0 && (
        <div className="text-center py-12">
          <FolderOpen className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No monitored folders configured.</p>
          {isAdmin && (
            <button onClick={handleAddFolder}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="h-4 w-4" />
              <span>Add Folder</span>
            </button>
          )}
        </div>
      )}

      {folders.map((folder) => {
        const isExpanded = expandedId === folder.id;
        const isSaving = savingId === folder.id;
        const isRunning = runningId === folder.id;
        const isDeleting = deletingId === folder.id;
        const isTesting = testingId === folder.id;

        return (
          <div key={folder.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : (folder.id || null))}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center space-x-3">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <FolderOpen className="h-4 w-4 text-amber-500" />
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {folder.folderName || 'Unnamed Folder'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {folder.monitoredPath}
                  </div>
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${folder.isEnabled ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'}`}>
                {folder.isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </button>

            {isExpanded && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Folder Name</label>
                    <input type="text" className={inputCls} value={folder.folderName}
                      onChange={(e) => updateFolder(folder.id, { folderName: e.target.value })}
                      placeholder="e.g., AR Folder" disabled={!isAdmin} />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</span>
                      <button onClick={() => updateFolder(folder.id, { isEnabled: !folder.isEnabled })} disabled={!isAdmin}>
                        {folder.isEnabled ? <ToggleRight className="h-6 w-6 text-green-500" /> : <ToggleLeft className="h-6 w-6 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Monitored Path</label>
                    <input type="text" className={inputCls} value={folder.monitoredPath}
                      onChange={(e) => updateFolder(folder.id, { monitoredPath: e.target.value })}
                      placeholder="/inbox/ar/" disabled={!isAdmin} />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">SFTP folder to scan for new files</p>
                  </div>
                  <div>
                    <label className={labelCls}>Processed Path</label>
                    <input type="text" className={inputCls} value={folder.processedPath}
                      onChange={(e) => updateFolder(folder.id, { processedPath: e.target.value })}
                      placeholder="/processed/ar/" disabled={!isAdmin} />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Move files here after processing</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Target Imaging Bucket</label>
                    <CustomDropdown
                      value={folder.imagingBucketId || ''}
                      onChange={(val) => updateFolder(folder.id, { imagingBucketId: val || null })}
                      placeholder="Select bucket..."
                      options={buckets.filter(b => b.isActive).map(b => ({ value: b.id, label: b.name }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Polling Interval (minutes)</label>
                    <input type="number" className={inputCls} value={folder.pollingInterval}
                      onChange={(e) => updateFolder(folder.id, { pollingInterval: parseInt(e.target.value) || 5 })}
                      min={1} disabled={!isAdmin} />
                  </div>
                </div>

                {folder.lastPolledAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last polled: {new Date(folder.lastPolledAt).toLocaleString()}
                  </p>
                )}

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button onClick={() => handleSave(folder)} disabled={isSaving}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span>Save</span>
                    </button>
                    <button onClick={() => handleTestFolder(folder)} disabled={isTesting}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      <span>Test</span>
                    </button>
                    <button onClick={() => handleRunNow(folder)} disabled={isRunning}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      <span>Run Now</span>
                    </button>
                    <button onClick={() => handleDelete(folder)} disabled={isDeleting}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto">
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      <span>Delete</span>
                    </button>
                  </div>
                )}

                {testResult && testResult.folderName === folder.folderName && (
                  <div className="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center space-x-2">
                        <FlaskConical className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Test Results</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">({testResult.monitoredPath})</span>
                      </div>
                      <button onClick={() => setTestResult(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors">
                        <X className="h-3.5 w-3.5 text-gray-500" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3 p-4">
                      <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{testResult.summary.totalFiles}</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Total Files</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">{testResult.summary.matchedFiles}</div>
                        <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Matched</div>
                      </div>
                      <div className={`text-center p-3 rounded-lg ${testResult.summary.unmatchedFiles > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700/30'}`}>
                        <div className={`text-2xl font-bold ${testResult.summary.unmatchedFiles > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}>{testResult.summary.unmatchedFiles}</div>
                        <div className={`text-xs mt-0.5 ${testResult.summary.unmatchedFiles > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>Unmatched</div>
                      </div>
                    </div>

                    {Object.keys(testResult.summary.ruleBreakdown).length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Rule Breakdown</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(testResult.summary.ruleBreakdown).map(([ruleName, count]) => (
                            <span key={ruleName} className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-xs font-medium">
                              <ShieldCheck className="h-3 w-3" />
                              <span>{ruleName}: {count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {testResult.barcodeRules > 0 && !testResult.barcodesTested && (
                      <div className="px-4 pb-3">
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center space-x-1.5">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>{testResult.barcodeRules} barcode pattern rule{testResult.barcodeRules !== 1 ? 's' : ''} configured but could not be tested (no active Gemini API key).</span>
                        </p>
                      </div>
                    )}

                    {testResult.files.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-600">
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                              <tr>
                                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">File</th>
                                <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Size</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Matched Rule</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {testResult.files.map((file, idx) => (
                                <tr key={idx} className={!file.matchedRule ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                                  <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                                    <div className="flex items-center space-x-1.5">
                                      <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="truncate max-w-[200px]" title={file.filename}>{file.filename}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatFileSize(file.size)}</td>
                                  <td className="px-4 py-2">
                                    {file.matchedRule ? (
                                      <div>
                                        <span className="inline-flex items-center space-x-1 text-green-700 dark:text-green-400">
                                          <ShieldCheck className="h-3 w-3" />
                                          <span>{file.matchedRule}</span>
                                          {file.matchType === 'barcode_pattern' && (
                                            <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">barcode</span>
                                          )}
                                        </span>
                                        {file.matchedBarcode && (
                                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                            Matched barcode: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{file.matchedBarcode}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="inline-flex items-center space-x-1 text-red-600 dark:text-red-400 font-medium">
                                          <ShieldAlert className="h-3 w-3" />
                                          <span>No matching rule</span>
                                        </span>
                                        {file.barcodeError && (
                                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Scan error: {file.barcodeError}</div>
                                        )}
                                      </div>
                                    )}
                                    {file.detectedBarcodes && file.detectedBarcodes.length > 0 && (
                                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                        Detected: {file.detectedBarcodes.map((bc, i) => (
                                          <span key={i} className="inline-block font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded mr-1 mb-0.5">{bc}</span>
                                        ))}
                                      </div>
                                    )}
                                    {file.detectedBarcodes && file.detectedBarcodes.length === 0 && !file.barcodeError && (
                                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">No barcodes detected in PDF</div>
                                    )}
                                    {file.extractionError && (
                                      <div className="text-[10px] text-red-500 dark:text-red-400 mt-1">
                                        Extraction error: {file.extractionError}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {testResult.files.length === 0 && (
                      <div className="px-4 pb-4 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">No PDF files found in this folder.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
