import React, { useRef, useState } from 'react';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import type { OrderEntryDocumentType } from '../../types';

interface DocumentUploadSectionProps {
  documentTypes: OrderEntryDocumentType[];
  uploadedFiles: Record<string, File>;
  onFileSelect: (documentTypeId: string, file: File) => void;
  onFileRemove: (documentTypeId: string) => void;
  errors?: Record<string, string>;
}

const FILE_TYPE_MAP: Record<string, { label: string; extensions: string[] }> = {
  pdf: { label: 'PDF', extensions: ['.pdf'] },
  doc: { label: 'Doc', extensions: ['.doc', '.docx'] },
  excel: { label: 'Excel', extensions: ['.xls', '.xlsx', '.csv'] },
  image: { label: 'Image', extensions: ['.png', '.jpg', '.jpeg', '.tiff', '.tif'] }
};

export default function DocumentUploadSection({
  documentTypes,
  uploadedFiles,
  onFileSelect,
  onFileRemove,
  errors
}: DocumentUploadSectionProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  if (documentTypes.length === 0) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getAcceptAttribute = (allowedFileTypes?: string): string => {
    if (!allowedFileTypes) return '';
    const types = allowedFileTypes.split(',').map(t => t.trim().toLowerCase());
    const extensions: string[] = [];
    types.forEach(type => {
      if (FILE_TYPE_MAP[type]) extensions.push(...FILE_TYPE_MAP[type].extensions);
    });
    return extensions.join(',');
  };

  const getAllowedExtensions = (allowedFileTypes?: string): string[] => {
    if (!allowedFileTypes) return [];
    const types = allowedFileTypes.split(',').map(t => t.trim().toLowerCase());
    const extensions: string[] = [];
    types.forEach(type => {
      if (FILE_TYPE_MAP[type]) extensions.push(...FILE_TYPE_MAP[type].extensions);
    });
    return extensions;
  };

  const getFileTypeLabels = (allowedFileTypes?: string): string => {
    if (!allowedFileTypes) return '';
    const types = allowedFileTypes.split(',').map(t => t.trim().toLowerCase());
    return types
      .map(t => FILE_TYPE_MAP[t]?.label)
      .filter(Boolean)
      .join(', ');
  };

  const isFileValid = (file: File, allowedFileTypes?: string): boolean => {
    if (!allowedFileTypes) return true;
    const extensions = getAllowedExtensions(allowedFileTypes);
    if (extensions.length === 0) return true;
    const fileName = file.name.toLowerCase();
    return extensions.some(ext => fileName.endsWith(ext));
  };

  const handleFileSelect = (dtId: string, file: File, allowedFileTypes?: string) => {
    if (!isFileValid(file, allowedFileTypes)) {
      const labels = getFileTypeLabels(allowedFileTypes);
      setValidationErrors(prev => ({
        ...prev,
        [dtId]: `Invalid file type. Accepted: ${labels}`
      }));
      return;
    }
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[dtId];
      return next;
    });
    onFileSelect(dtId, file);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center space-x-2 mb-4">
        <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Upload Documents</h3>
      </div>

      <div className="space-y-3">
        {documentTypes.map(dt => {
          const file = uploadedFiles[dt.id];
          const error = errors?.[dt.id] || validationErrors[dt.id];
          const typeLabels = getFileTypeLabels(dt.allowedFileTypes);

          return (
            <div key={dt.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {dt.name}
                  </span>
                  {dt.isRequired && (
                    <span className="text-xs text-red-500 font-medium">*</span>
                  )}
                  {typeLabels && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {typeLabels}
                    </span>
                  )}
                </div>

                {file ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <FileText className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-sm text-green-700 dark:text-green-300 truncate flex-1">
                      {file.name}
                    </span>
                    <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onFileRemove(dt.id)}
                      className="p-1 text-green-600 hover:text-red-600 dark:text-green-400 dark:hover:text-red-400 rounded transition-colors flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[dt.id]?.click()}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg transition-colors text-sm ${
                        error
                          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      <span>Choose file</span>
                    </button>
                    {error && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3 text-red-500" />
                        <span className="text-xs text-red-500">{error}</span>
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={el => { fileInputRefs.current[dt.id] = el; }}
                  type="file"
                  accept={getAcceptAttribute(dt.allowedFileTypes) || undefined}
                  className="hidden"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) {
                      handleFileSelect(dt.id, selectedFile, dt.allowedFileTypes);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
