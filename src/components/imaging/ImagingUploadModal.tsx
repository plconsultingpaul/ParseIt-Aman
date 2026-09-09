import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Loader2, FileUp, AlertCircle } from 'lucide-react';
import type { ImagingBucket, ImagingDocumentType, ImagingDocument, ImagingMetadataField, ImagingDocumentTypeMetadataField } from '../../types';
import CustomDropdown from '../common/CustomDropdown';
import { uploadDocument, fetchMetadataFields, triggerEpdfProcessing, fetchDocTypeMetadataFields, findDuplicateDocument } from '../../services/imagingService';
import { extractTextFromPdfPages } from '../../lib/pdfTextExtractor';

interface ImagingUploadModalProps {
  buckets: ImagingBucket[];
  docTypes: ImagingDocumentType[];
  onClose: () => void;
  onUploaded: (doc: ImagingDocument, metadataByFieldId?: Record<string, string>) => void;
}

export default function ImagingUploadModal({ buckets, docTypes, onClose, onUploaded }: ImagingUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bucketId, setBucketId] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allMetadataFields, setAllMetadataFields] = useState<ImagingMetadataField[]>([]);
  const [docTypeAssignments, setDocTypeAssignments] = useState<ImagingDocumentTypeMetadataField[]>([]);
  const [metadataValues, setMetadataValues] = useState<Record<string, string>>({});

  const [dupPrompt, setDupPrompt] = useState<null | {
    billNumber: string;
    bucketName: string;
    docTypeName: string;
    existingFilename: string;
    resolve: (choice: 'keep_existing' | 'use_new' | 'cancel') => void;
  }>(null);

  useEffect(() => {
    fetchMetadataFields().then(fields => {
      setAllMetadataFields(fields.filter(f => f.isActive));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!documentTypeId) {
      setDocTypeAssignments([]);
      setMetadataValues({});
      return;
    }
    fetchDocTypeMetadataFields(documentTypeId).then(assignments => {
      setDocTypeAssignments(assignments);
      const initial: Record<string, string> = {};
      assignments.forEach(a => { initial[a.metadataFieldId] = ''; });
      setMetadataValues(initial);
    }).catch(() => {
      setDocTypeAssignments([]);
    });
  }, [documentTypeId]);

  const assignedFields = docTypeAssignments
    .filter(a => !a.isHiddenFromIndexing)
    .map(a => {
      const field = allMetadataFields.find(f => f.id === a.metadataFieldId);
      return field ? { ...field, isRequired: a.isRequired, sortOrder: a.sortOrder } : null;
    })
    .filter(Boolean) as (ImagingMetadataField & { isRequired: boolean; sortOrder: number })[];

  assignedFields.sort((a, b) => a.sortOrder - b.sortOrder);

  const activeBuckets = buckets.filter(b => b.isActive);
  const activeDocTypes = docTypes.filter(d => d.isActive);

  const requiredFieldsMet = assignedFields
    .filter(f => f.isRequired)
    .every(f => (metadataValues[f.id] || '').trim() !== '');

  const canSubmit = selectedFile && bucketId && documentTypeId && requiredFieldsMet && !uploading;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  const handleMetadataChange = (fieldId: string, value: string) => {
    setMetadataValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setUploading(true);
    setError('');
    try {
      const metadataArray = Object.entries(metadataValues)
        .filter(([_, v]) => v.trim())
        .map(([fieldId, value]) => ({ fieldId, value: value.trim() }));

      let replaceDocumentId: string | undefined;
      const dt = docTypes.find(d => d.id === documentTypeId);
      const billField = allMetadataFields.find(f => f.fieldName === 'billNumber');
      const bill = billField ? (metadataValues[billField.id] || '').trim() : '';

      console.log('[IMAGING-UPLOAD] handleSubmit inputs', {
        bucketId,
        documentTypeId,
        docType: dt ? { id: dt.id, name: dt.name, allowDuplicates: dt.allowDuplicates, duplicateManualAction: dt.duplicateManualAction } : null,
        allMetadataFieldsCount: allMetadataFields.length,
        allMetadataFieldNames: allMetadataFields.map(f => f.fieldName),
        billFieldFound: !!billField,
        billFieldId: billField?.id || null,
        billValue: bill,
        metadataValues,
        metadataArray,
      });

      if (dt && !dt.allowDuplicates && bill) {
        console.log('[IMAGING-UPLOAD] running duplicate lookup', { bucketId, documentTypeId, bill });
        const existing = await findDuplicateDocument({ bucketId, documentTypeId, billNumber: bill });
        console.log('[IMAGING-UPLOAD] duplicate lookup result', {
          found: !!existing,
          existingId: existing?.id || null,
          existingBillNumber: existing?.billNumber || null,
          existingFilename: existing?.originalFilename || null,
        });
        if (existing) {
          let action: 'keep_existing' | 'use_new' | 'prompt' = dt.duplicateManualAction;
          if (action === 'prompt') {
            const bucketName = buckets.find(b => b.id === bucketId)?.name || '';
            const choice = await new Promise<'keep_existing' | 'use_new' | 'cancel'>(resolve => {
              setDupPrompt({
                billNumber: bill,
                bucketName,
                docTypeName: dt.name,
                existingFilename: existing.originalFilename || existing.storagePath.split('/').pop() || '',
                resolve,
              });
            });
            setDupPrompt(null);
            if (choice === 'cancel') { setUploading(false); return; }
            action = choice;
          }
          if (action === 'keep_existing') {
            setError(`A document with bill number ${bill} already exists for this bucket and type. Upload cancelled.`);
            setUploading(false);
            return;
          }
          if (action === 'use_new') replaceDocumentId = existing.id;
        }
      }

      const doc = await uploadDocument({
        file: selectedFile,
        bucketId,
        documentTypeId,
        metadata: metadataArray.length > 0 ? metadataArray : undefined,
        replaceDocumentId,
      });

      const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        doc.processingStatus = 'processing';
        let skipOcr = false;
        try {
          const pageTexts = await extractTextFromPdfPages(selectedFile);
          const totalText = pageTexts.join('').trim();
          skipOcr = totalText.length > 50;
        } catch {
          skipOcr = false;
        }
        console.log('[EPDF-UPLOAD] single-upload triggering EPDF', { docId: doc.id, storagePath: doc.storagePath, skipOcr });
        triggerEpdfProcessing(doc.id, doc.storagePath, skipOcr).catch((e) => {
          console.error('[EPDF-UPLOAD] triggerEpdfProcessing threw', e);
        });
      }

      onUploaded(doc, metadataValues);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const renderMetaInput = (field: ImagingMetadataField & { isRequired: boolean }) => {
    const value = metadataValues[field.id] || '';
    const inputClasses = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

    if (field.fieldType === 'dropdown') {
      return (
        <CustomDropdown
          value={value}
          onChange={(val) => handleMetadataChange(field.id, val)}
          placeholder="Select..."
          options={field.dropdownOptions.map(opt => ({ value: opt, label: opt }))}
        />
      );
    }
    if (field.fieldType === 'boolean') {
      return (
        <CustomDropdown
          value={value}
          onChange={(val) => handleMetadataChange(field.id, val)}
          placeholder="Select..."
          options={[
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]}
        />
      );
    }
    if (field.fieldType === 'date') {
      return (
        <input type="date" value={value} onChange={(e) => handleMetadataChange(field.id, e.target.value)} className={inputClasses} />
      );
    }
    return (
      <input
        type={field.fieldType === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => handleMetadataChange(field.id, e.target.value)}
        placeholder={`Enter ${field.displayLabel.toLowerCase()}...`}
        className={inputClasses}
      />
    );
  };

  return createPortal(
    <>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center space-x-2">
            <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Upload Document</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              selectedFile
                ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.tif,.tiff,.png,.jpg,.jpeg"
              className="hidden"
            />
            {selectedFile ? (
              <div className="space-y-1">
                <FileUp className="h-8 w-8 text-blue-500 mx-auto" />
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs mx-auto">{selectedFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Click or drop to replace</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 text-gray-400 mx-auto" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to select or drag and drop</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">PDF, TIFF, PNG, JPG</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bucket</label>
            <CustomDropdown
              value={bucketId}
              onChange={(val) => setBucketId(val)}
              placeholder="Select a bucket..."
              options={activeBuckets.map(b => ({ value: b.id, label: b.name }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document Type</label>
            <CustomDropdown
              value={documentTypeId}
              onChange={(val) => setDocumentTypeId(val)}
              placeholder="Select a document type..."
              options={activeDocTypes.map(d => ({ value: d.id, label: d.name }))}
            />
          </div>

          {assignedFields.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Document Fields
              </h4>
              <div className="space-y-3">
                {assignedFields.map(field => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {field.displayLabel}
                      {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {renderMetaInput(field)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 shrink-0">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Upload</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    {dupPrompt && (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[80]">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md p-5">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Duplicate bill number</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                A document with bill number <span className="font-semibold">{dupPrompt.billNumber}</span> already exists in <span className="font-semibold">{dupPrompt.bucketName}</span> ({dupPrompt.docTypeName}).
              </p>
              {dupPrompt.existingFilename && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">Existing: {dupPrompt.existingFilename}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end space-x-2 mt-5">
            <button onClick={() => dupPrompt.resolve('cancel')} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">Cancel</button>
            <button onClick={() => dupPrompt.resolve('keep_existing')} className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-100">Keep Existing</button>
            <button onClick={() => dupPrompt.resolve('use_new')} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Use New (Replace)</button>
          </div>
        </div>
      </div>
    )}
    </>,
    globalThis.document.body
  );
}
