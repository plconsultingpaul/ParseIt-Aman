import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ExternalLink, Download, FileText, AlertCircle,
  Save, Loader2, ChevronRight, ChevronLeft, Check, Mail, Send, Plus, XCircle
} from 'lucide-react';
import type { ImagingDocument, ImagingMetadataField, ImagingBucket, ImagingDocumentType } from '../../types';
import {
  fetchMetadataFields, fetchDocumentMetadata, saveDocumentMetadataBatch,
  updateDocumentProperties, fetchBuckets, fetchDocumentTypes,
} from '../../services/imagingService';
import { getAuthHeaders } from '../../lib/supabase';
import CustomDropdown from '../common/CustomDropdown';

interface ImagingViewerModalProps {
  doc: ImagingDocument;
  onClose: () => void;
  onMetadataSaved?: () => void;
}

export default function ImagingViewerModal({ doc, onClose, onMetadataSaved }: ImagingViewerModalProps) {
  const [loadError, setLoadError] = useState(false);
  const [showProperties, setShowProperties] = useState(true);

  const [fields, setFields] = useState<ImagingMetadataField[]>([]);
  const [metadataValues, setMetadataValues] = useState<Record<string, string>>({});
  const [originalMetadata, setOriginalMetadata] = useState<Record<string, string>>({});
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);

  const [propValues, setPropValues] = useState({
    originalFilename: doc.originalFilename || '',
    documentTypeId: doc.documentTypeId,
    bucketId: doc.bucketId,
  });
  const [originalProps, setOriginalProps] = useState({ ...propValues });

  const documentUrl = doc.storagePath?.startsWith('http')
    ? doc.storagePath
    : doc.bucketUrl
      ? `${doc.bucketUrl.replace(/\/$/, '')}/${doc.storagePath}`
      : '';

  console.log('[ImagingViewer] doc object:', {
    id: doc.id,
    storagePath: doc.storagePath,
    bucketUrl: doc.bucketUrl,
    bucketName: doc.bucketName,
    bucketId: doc.bucketId,
    originalFilename: doc.originalFilename,
  });
  console.log('[ImagingViewer] constructed documentUrl:', documentUrl);
  console.log('[ImagingViewer] storagePath starts with http:', doc.storagePath?.startsWith('http'));

  const loadMetadata = useCallback(async () => {
    try {
      setLoadingMeta(true);
      const [fieldsData, metaData, bucketsData, typesData] = await Promise.all([
        fetchMetadataFields(),
        fetchDocumentMetadata(doc.id),
        fetchBuckets(),
        fetchDocumentTypes(),
      ]);
      const activeFields = fieldsData.filter(f => f.isActive);
      setFields(activeFields);
      setBuckets(bucketsData.filter(b => b.isActive));
      setDocTypes(typesData.filter(t => t.isActive));

      const initial: Record<string, string> = {};
      activeFields.forEach(f => {
        initial[f.id] = metaData[f.id] || '';
      });
      setMetadataValues(initial);
      setOriginalMetadata(initial);
    } catch (err) {
      console.error('Failed to load metadata:', err);
    } finally {
      setLoadingMeta(false);
    }
  }, [doc.id]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (documentUrl) {
      console.log('[ImagingViewer] Attempting HEAD fetch to test URL accessibility...');
      fetch(documentUrl, { method: 'HEAD', mode: 'no-cors' })
        .then((res) => {
          console.log('[ImagingViewer] HEAD response status:', res.status, 'type:', res.type);
        })
        .catch((err) => {
          console.error('[ImagingViewer] HEAD fetch failed:', err.message);
        });
    }
  }, [documentUrl]);

  const hasMetaChanges = Object.keys(metadataValues).some(
    key => metadataValues[key] !== (originalMetadata[key] || '')
  );

  const hasPropChanges =
    propValues.originalFilename !== originalProps.originalFilename ||
    propValues.documentTypeId !== originalProps.documentTypeId ||
    propValues.bucketId !== originalProps.bucketId;

  const hasChanges = hasMetaChanges || hasPropChanges;

  const handleFieldChange = (fieldId: string, value: string) => {
    setMetadataValues(prev => ({ ...prev, [fieldId]: value }));
    setSaveSuccess(false);
  };

  const handlePropChange = (key: keyof typeof propValues, value: string) => {
    setPropValues(prev => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const promises: Promise<void>[] = [];

      if (hasPropChanges) {
        const updates: Record<string, string> = {};
        if (propValues.originalFilename !== originalProps.originalFilename) updates.originalFilename = propValues.originalFilename;
        if (propValues.documentTypeId !== originalProps.documentTypeId) updates.documentTypeId = propValues.documentTypeId;
        if (propValues.bucketId !== originalProps.bucketId) updates.bucketId = propValues.bucketId;
        promises.push(updateDocumentProperties(doc.id, updates));
      }

      if (hasMetaChanges) {
        promises.push(saveDocumentMetadataBatch(doc.id, metadataValues));
      }

      await Promise.all(promises);
      setOriginalMetadata({ ...metadataValues });
      setOriginalProps({ ...propValues });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      onMetadataSaved?.();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenExternal = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string } | null>(null);
  const emailFormRef = useRef<HTMLDivElement>(null);

  const addRecipient = () => {
    const trimmed = emailInput.trim();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !emailRecipients.includes(trimmed)) {
      setEmailRecipients(prev => [...prev, trimmed]);
      setEmailInput('');
    }
  };

  const removeRecipient = (email: string) => {
    setEmailRecipients(prev => prev.filter(r => r !== email));
  };

  const handleSendEmail = async () => {
    if (emailRecipients.length === 0 || !documentUrl) return;
    try {
      setEmailSending(true);
      setEmailResult(null);
      const headers = await getAuthHeaders();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-imaging-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          documentUrl,
          documentName: propValues.originalFilename || doc.originalFilename || 'document',
          recipients: emailRecipients,
          subject: emailSubject || undefined,
          message: emailMessage || undefined,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setEmailResult({ success: true, message: data.message || 'Email sent' });
        setTimeout(() => {
          setShowEmailForm(false);
          setEmailRecipients([]);
          setEmailSubject('');
          setEmailMessage('');
          setEmailResult(null);
        }, 2000);
      } else {
        setEmailResult({ success: false, message: data.message || 'Failed to send' });
      }
    } catch (err: any) {
      setEmailResult({ success: false, message: err.message || 'Failed to send email' });
    } finally {
      setEmailSending(false);
    }
  };

  useEffect(() => {
    if (!showEmailForm) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emailFormRef.current && !emailFormRef.current.contains(e.target as Node)) {
        setShowEmailForm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmailForm]);

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  const inputClasses = 'w-full text-sm px-3 py-1.5 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100';

  const renderMetaInput = (field: ImagingMetadataField) => {
    const value = metadataValues[field.id] || '';
    switch (field.fieldType) {
      case 'dropdown':
        return (
          <CustomDropdown
            value={value}
            onChange={(val) => handleFieldChange(field.id, val)}
            placeholder="--"
            options={field.dropdownOptions.map(opt => ({ value: opt, label: opt }))}
          />
        );
      case 'boolean':
        return (
          <CustomDropdown
            value={value}
            onChange={(val) => handleFieldChange(field.id, val)}
            placeholder="--"
            options={[
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' },
            ]}
          />
        );
      case 'date':
        return <input type="date" value={value} onChange={(e) => handleFieldChange(field.id, e.target.value)} className={inputClasses} />;
      case 'number':
        return <input type="number" value={value} onChange={(e) => handleFieldChange(field.id, e.target.value)} className={`${inputClasses} font-mono`} />;
      default:
        return <input type="text" value={value} onChange={(e) => handleFieldChange(field.id, e.target.value)} className={inputClasses} />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70]">
      <div className="bg-white dark:bg-gray-800 shadow-2xl w-screen h-screen flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {propValues.originalFilename || doc.storagePath}
            </h3>
            <div className="flex items-center space-x-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {doc.documentTypeName && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                  {docTypes.find(t => t.id === propValues.documentTypeId)?.name || doc.documentTypeName}
                </span>
              )}
              {doc.bucketName && (
                <span>Bucket: {buckets.find(b => b.id === propValues.bucketId)?.name || doc.bucketName}</span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 ml-4">
            {documentUrl && (
              <>
                <a
                  href={documentUrl}
                  download={propValues.originalFilename || 'document.pdf'}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={handleOpenExternal}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowEmailForm(!showEmailForm)}
                    className={`p-2 rounded-lg transition-colors ${
                      showEmailForm
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="Email document"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                  {showEmailForm && (
                    <div
                      ref={emailFormRef}
                      className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50"
                    >
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email Document</h4>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {emailRecipients.map(r => (
                              <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium">
                                {r}
                                <button onClick={() => removeRecipient(r)} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200">
                                  <XCircle className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              type="email"
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                              placeholder="email@example.com"
                              className={inputClasses}
                            />
                            <button
                              onClick={addRecipient}
                              disabled={!emailInput.trim()}
                              className="px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-40"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject (optional)</label>
                          <input
                            type="text"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            placeholder={`Document: ${propValues.originalFilename || 'document'}`}
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Message (optional)</label>
                          <textarea
                            value={emailMessage}
                            onChange={(e) => setEmailMessage(e.target.value)}
                            placeholder="Add a personal message..."
                            rows={3}
                            className={`${inputClasses} resize-none`}
                          />
                        </div>
                        {emailResult && (
                          <div className={`text-xs px-3 py-2 rounded-lg ${
                            emailResult.success
                              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          }`}>
                            {emailResult.message}
                          </div>
                        )}
                      </div>
                      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <button
                          onClick={handleSendEmail}
                          disabled={emailRecipients.length === 0 || emailSending}
                          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
                        >
                          {emailSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span>{emailSending ? 'Sending...' : 'Send'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
            <button
              onClick={() => setShowProperties(!showProperties)}
              className={`p-2 rounded-lg transition-colors ${
                showProperties
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Toggle properties panel"
            >
              {showProperties ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 bg-gray-100 dark:bg-gray-900 overflow-hidden">
            {!documentUrl ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <AlertCircle className="h-12 w-12 mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-medium">No URL available</p>
                <p className="text-xs mt-1">This document's bucket does not have a URL configured.</p>
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <FileText className="h-12 w-12 mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-sm font-medium">Unable to display document</p>
                <p className="text-xs mt-1 mb-4">The document could not be loaded in the viewer.</p>
                <button
                  onClick={handleOpenExternal}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open in New Tab</span>
                </button>
              </div>
            ) : (
              <iframe
                src={documentUrl}
                className="w-full h-full border-0"
                title={propValues.originalFilename || 'Document Viewer'}
                onLoad={() => console.log('[ImagingViewer] iframe onLoad fired for:', documentUrl)}
                onError={() => {
                  console.error('[ImagingViewer] iframe onError fired for:', documentUrl);
                  setLoadError(true);
                }}
              />
            )}
          </div>

          {showProperties && (
            <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Properties</h3>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-3 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Document Name</label>
                    <input
                      type="text"
                      value={propValues.originalFilename}
                      onChange={(e) => handlePropChange('originalFilename', e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Document Type</label>
                    <CustomDropdown
                      value={propValues.documentTypeId}
                      onChange={(val) => handlePropChange('documentTypeId', val)}
                      options={docTypes.map(t => ({ value: t.id, label: t.name }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bucket</label>
                    <CustomDropdown
                      value={propValues.bucketId}
                      onChange={(val) => handlePropChange('bucketId', val)}
                      options={buckets.map(b => ({ value: b.id, label: b.name }))}
                    />
                  </div>
                  <ReadOnlyField label="File Size" value={formatFileSize(doc.fileSize)} />
                  <ReadOnlyField label="Uploaded" value={formatDate(doc.createdAt)} />
                </div>

                {loadingMeta ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : fields.length > 0 ? (
                  <div className="p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Metadata
                    </h4>
                    {fields.map(field => (
                      <div key={field.id}>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          {field.displayLabel}
                        </label>
                        {renderMetaInput(field)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 shrink-0">
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    saveSuccess
                      ? 'bg-green-600 text-white'
                      : hasChanges
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Changes'}</span>
                </button>
                {hasChanges && !saving && (
                  <p className="text-center text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
                    You have unsaved changes
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    globalThis.document.body
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</label>
      <div className="text-sm text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600/50 truncate">
        {value || '-'}
      </div>
    </div>
  );
}
