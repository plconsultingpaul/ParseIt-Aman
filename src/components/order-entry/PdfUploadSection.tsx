import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, X, Loader, AlertCircle, CheckCircle, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { OrderEntryField } from '../../types';

interface PdfUploadSectionProps {
  userId: string;
  fields: OrderEntryField[];
  onExtractionComplete: (extractedData: Record<string, any>, confidenceScores: Record<string, number>) => void;
  onPdfUpload?: (pdfId: string) => void;
  onUploadStart?: () => void;
  onUploadError?: (error: string) => void;
  onExtractionStart?: () => void;
  onExtractionError?: (error: string) => void;
  compact?: boolean;
  resetTrigger?: number;
}

interface UploadedPdf {
  id: string;
  filename: string;
  fileSize: number;
  storageUrl: string;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

export default function PdfUploadSection({
  userId,
  fields,
  onExtractionComplete,
  onPdfUpload,
  onUploadStart,
  onUploadError,
  onExtractionStart,
  onExtractionError,
  compact = false,
  resetTrigger
}: PdfUploadSectionProps) {
  const [uploadedPdf, setUploadedPdf] = useState<UploadedPdf | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setUploadedPdf(null);
      setUploading(false);
      setUploadProgress(0);
      setExtracting(false);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [resetTrigger]);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const validateFile = (file: File): string | null => {
    if (file.type !== 'application/pdf') {
      return 'Only PDF files are allowed';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 10MB';
    }
    return null;
  };

  const uploadToStorage = async (file: File): Promise<string> => {
    const fileExt = 'pdf';
    const fileName = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('order-entry-pdfs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    return filePath;
  };

  const createPdfRecord = async (file: File, storageUrl: string): Promise<string> => {
    const { data, error } = await supabase
      .from('order_entry_pdfs')
      .insert({
        user_id: userId,
        original_filename: file.name,
        storage_path: storageUrl,
        file_size: file.size,
        extraction_status: 'pending'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create PDF record: ${error.message}`);
    }

    return data.id;
  };

  const callExtractionFunction = async (pdfId: string, storageUrl: string) => {
    setExtracting(true);
    onExtractionStart?.();

    try {
      console.log('[PDF Extraction Debug] Starting extraction...');
      console.log('[PDF Extraction Debug] pdfId:', pdfId);
      console.log('[PDF Extraction Debug] storageUrl:', storageUrl);
      console.log('[PDF Extraction Debug] fields count:', fields?.length);
      console.log('[PDF Extraction Debug] fields type:', typeof fields);
      console.log('[PDF Extraction Debug] fields is array:', Array.isArray(fields));

      if (fields && fields.length > 0) {
        console.log('[PDF Extraction Debug] First field raw:', fields[0]);
        console.log('[PDF Extraction Debug] First field keys:', Object.keys(fields[0]));
      }

      const cleanFields = fields.map(f => ({
        id: String(f.id || ''),
        fieldName: String(f.fieldName || ''),
        fieldLabel: String(f.fieldLabel || ''),
        fieldType: String(f.fieldType || 'text'),
        aiExtractionInstructions: f.aiExtractionInstructions ? String(f.aiExtractionInstructions) : undefined
      }));

      console.log('[PDF Extraction Debug] cleanFields count:', cleanFields.length);
      if (cleanFields.length > 0) {
        console.log('[PDF Extraction Debug] First cleanField:', cleanFields[0]);
      }

      const requestBody = {
        pdfId,
        storageUrl,
        fields: cleanFields
      };

      console.log('[PDF Extraction Debug] requestBody keys:', Object.keys(requestBody));

      let serializedBody: string;
      try {
        serializedBody = JSON.stringify(requestBody);
        console.log('[PDF Extraction Debug] JSON.stringify succeeded, length:', serializedBody.length);
        console.log('[PDF Extraction Debug] Serialized body preview:', serializedBody.substring(0, 500));
      } catch (jsonError: any) {
        console.error('[PDF Extraction Debug] JSON.stringify FAILED:', jsonError.message);
        throw new Error(`Failed to serialize request body: ${jsonError.message}`);
      }

      console.log('[PDF Extraction Debug] About to call supabase.functions.invoke...');

      const { data, error } = await supabase.functions.invoke('extract-order-entry-data', {
        body: requestBody
      });

      console.log('[PDF Extraction Debug] supabase.functions.invoke completed');

      if (error) {
        throw new Error(`Extraction failed: ${error.message}`);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const extractedData = data?.extractedData || {};
      const confidenceScores = data?.confidenceScores || {};

      await supabase
        .from('order_entry_pdfs')
        .update({
          extraction_status: 'completed',
          extracted_data: extractedData,
          extraction_confidence: confidenceScores,
          updated_at: new Date().toISOString()
        })
        .eq('id', pdfId);

      setUploadedPdf(prev => prev ? { ...prev, extractionStatus: 'completed' } : null);
      onExtractionComplete(extractedData, confidenceScores);

    } catch (err: any) {
      console.error('[PDF Extraction Debug] Extraction error caught:', err);
      console.error('[PDF Extraction Debug] Error name:', err?.name);
      console.error('[PDF Extraction Debug] Error message:', err?.message);
      console.error('[PDF Extraction Debug] Error stack:', err?.stack);

      await supabase
        .from('order_entry_pdfs')
        .update({
          extraction_status: 'failed',
          error_message: err.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', pdfId);

      setUploadedPdf(prev => prev ? {
        ...prev,
        extractionStatus: 'failed',
        errorMessage: err.message
      } : null);

      setError(`Extraction failed: ${err.message}`);
      onExtractionError?.(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setError(null);
    setUploadProgress(0);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setUploading(true);
      onUploadStart?.();
      setUploadProgress(25);

      const storageUrl = await uploadToStorage(file);
      setUploadProgress(50);

      const pdfId = await createPdfRecord(file, storageUrl);
      setUploadProgress(75);

      setUploadedPdf({
        id: pdfId,
        filename: file.name,
        fileSize: file.size,
        storageUrl,
        extractionStatus: 'pending'
      });

      setUploadProgress(100);
      setTimeout(() => setUploadProgress(0), 500);

      if (onPdfUpload) {
        onPdfUpload(pdfId);
      }

      await callExtractionFunction(pdfId, storageUrl);

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to upload PDF';
      setError(errorMsg);
      onUploadError?.(errorMsg);
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemovePdf = async () => {
    if (!uploadedPdf) return;

    const confirmed = window.confirm('Are you sure you want to remove this PDF?');
    if (!confirmed) return;

    try {
      await supabase
        .from('order_entry_pdfs')
        .delete()
        .eq('id', uploadedPdf.id);

      const fileName = uploadedPdf.storageUrl.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('order-entry-pdfs')
          .remove([`${userId}/${fileName}`]);
      }

      setUploadedPdf(null);
      setError(null);
    } catch (err: any) {
      setError(`Failed to remove PDF: ${err.message}`);
    }
  };

  const handleReExtract = async () => {
    if (!uploadedPdf) return;

    setError(null);
    await callExtractionFunction(uploadedPdf.id, uploadedPdf.storageUrl);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || extracting}
          className="px-4 py-2.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors font-medium flex items-center space-x-2 disabled:opacity-70"
        >
          {uploading || extracting ? (
            <>
              <Loader className="h-4 w-4 animate-spin" />
              <span>{extracting ? 'Extracting...' : 'Uploading...'}</span>
            </>
          ) : uploadedPdf?.extractionStatus === 'completed' ? (
            <>
              <CheckCircle className="h-4 w-4" />
              <span>PDF Loaded</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>Upload PDF to Autofill</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Upload PDF for Auto-Fill
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Upload a PDF document and we'll automatically extract data to pre-populate the form fields.
      </p>

      {!uploadedPdf ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 bg-gray-50 dark:bg-gray-800/50'
          }`}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
            {dragOver ? 'Drop your PDF here' : 'Click to upload or drag and drop'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            PDF files only, up to 10MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              <FileText className="h-6 w-6 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {uploadedPdf.filename}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(uploadedPdf.fileSize)}
                </p>
              </div>
            </div>
            <button
              onClick={handleRemovePdf}
              disabled={uploading || extracting}
              className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {uploadedPdf.extractionStatus === 'pending' && !extracting && (
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
              <Loader className="h-4 w-4 animate-spin mr-2" />
              <span>Ready to extract...</span>
            </div>
          )}

          {extracting && (
            <div className="flex items-center text-sm text-orange-600 dark:text-orange-400">
              <Loader className="h-4 w-4 animate-spin mr-2" />
              <span>Extracting data from PDF...</span>
            </div>
          )}

          {uploadedPdf.extractionStatus === 'completed' && (
            <div className="space-y-2">
              <div className="flex items-center text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4 mr-2" />
                <span>Extraction completed successfully</span>
              </div>
              <button
                onClick={handleReExtract}
                disabled={extracting}
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Re-extract from PDF
              </button>
            </div>
          )}

          {uploadedPdf.extractionStatus === 'failed' && (
            <div className="space-y-2">
              <div className="flex items-start text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>{uploadedPdf.errorMessage || 'Extraction failed'}</span>
              </div>
              <button
                onClick={handleReExtract}
                disabled={extracting}
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline flex items-center disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {uploading && uploadProgress > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Uploading...</span>
            <span className="text-orange-600 dark:text-orange-400">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-orange-500 dark:bg-orange-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
