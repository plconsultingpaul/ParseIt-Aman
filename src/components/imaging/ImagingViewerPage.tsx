import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, AlertCircle, Download, ExternalLink, Printer,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize,
  FileText, Info, X, Image as ImageIcon
} from 'lucide-react';

interface ViewerDocument {
  documentId: string;
  storagePath: string;
  documentUrl: string;
  bucketName: string;
  documentTypeName: string;
  originalFilename: string;
  fileSize: number;
  createdAt: string;
}

interface MetadataFieldDef {
  id: string;
  display_label: string;
  field_name: string;
  field_type: string;
  sort_order: number;
}

interface DocMetadataEntry {
  field_id: string;
  value: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString();
}

export default function ImagingViewerPage() {
  const [searchParams] = useSearchParams();
  const documentId = (searchParams.get('documentId') || '').trim();
  const detailLineId = (searchParams.get('detailLineId') || '').trim();
  const billNumber = (searchParams.get('billNumber') || '').trim();
  const documentType = (searchParams.get('documentType') || '').trim();

  const [documents, setDocuments] = useState<ViewerDocument[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [showProperties, setShowProperties] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState<'page' | 'width' | 'height' | null>('page');
  const [metadataFields, setMetadataFields] = useState<MetadataFieldDef[]>([]);
  const [docMetadata, setDocMetadata] = useState<Record<string, string>>({});

  const currentDoc = documents[currentIndex] || null;

  const fetchDocuments = useCallback(async () => {
    if (!documentId && !detailLineId && !billNumber) {
      setError('Missing parameter: provide documentId, detailLineId, or billNumber');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const body: Record<string, string> = { action: 'list' };
      if (documentId) body.documentId = documentId;
      if (detailLineId) body.detailLineId = detailLineId;
      if (billNumber) body.billNumber = billNumber;

      if (documentType) {
        const typeLookup = await fetch(
          `${supabaseUrl}/rest/v1/imaging_document_types?name=eq.${encodeURIComponent(documentType)}&limit=1`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'apikey': supabaseAnonKey,
              'Content-Type': 'application/json',
            },
          }
        );
        const types = await typeLookup.json();
        if (types && types.length > 0) {
          body.documentTypeId = types[0].id;
        }
      }

      console.log('[ImagingViewer] request body:', body);

      const resp = await fetch(`${supabaseUrl}/functions/v1/imaging-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      console.log('[ImagingViewer] response status:', resp.status, 'data:', data);

      if (data.success && data.documents && data.documents.length > 0) {
        setDocuments(data.documents);
        setCurrentIndex(0);
      } else {
        setError('No documents found for the given parameters.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [documentId, detailLineId, billNumber, documentType]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    setLoadError(false);
  }, [currentIndex]);

  useEffect(() => {
    const loadMetadataFields = async () => {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_metadata_fields?is_active=eq.true&order=sort_order,display_label`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'apikey': supabaseAnonKey,
              'Content-Type': 'application/json',
            },
          }
        );
        const data = await resp.json();
        if (Array.isArray(data)) setMetadataFields(data);
      } catch {}
    };
    loadMetadataFields();
  }, []);

  useEffect(() => {
    if (!currentDoc?.documentId || metadataFields.length === 0) {
      setDocMetadata({});
      return;
    }
    const loadDocMeta = async () => {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/imaging_document_metadata?document_id=eq.${currentDoc.documentId}&select=field_id,value`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'apikey': supabaseAnonKey,
              'Content-Type': 'application/json',
            },
          }
        );
        const data: DocMetadataEntry[] = await resp.json();
        const map: Record<string, string> = {};
        if (Array.isArray(data)) {
          data.forEach(entry => { map[entry.field_id] = entry.value || ''; });
        }
        setDocMetadata(map);
      } catch {
        setDocMetadata({});
      }
    };
    loadDocMeta();
  }, [currentDoc?.documentId, metadataFields.length]);

  const handlePrevDoc = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleNextDoc = () => {
    if (currentIndex < documents.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handleZoomIn = () => {
    setFitMode(null);
    setZoom(prev => Math.min(prev + 25, 400));
  };

  const handleZoomOut = () => {
    setFitMode(null);
    setZoom(prev => Math.max(prev - 25, 25));
  };

  const handleFit = (mode: 'page' | 'width' | 'height') => {
    setFitMode(mode);
    setZoom(100);
  };

  const handlePrint = () => {
    if (currentDoc?.documentUrl) {
      const printWindow = window.open(currentDoc.documentUrl, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      }
    }
  };

  const iframeStyle: React.CSSProperties = fitMode === 'page'
    ? { width: '100%', height: '100%' }
    : fitMode === 'width'
      ? { width: '100%', height: `${zoom * 2}%`, minHeight: '100%' }
      : fitMode === 'height'
        ? { width: `${zoom * 2}%`, height: '100%', minWidth: '100%' }
        : { width: `${zoom}%`, height: `${zoom}%`, minWidth: '100%', minHeight: '100%' };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Document Not Found</h2>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          {(documentId || detailLineId || billNumber) && (
            <p className="text-xs text-gray-400 font-mono">
              {documentId ? `Document ID: ${documentId}` : detailLineId ? `Detail Line ID: ${detailLineId}` : `Bill Number: ${billNumber}`}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="flex items-center space-x-2 text-blue-400">
            <ImageIcon className="h-5 w-5 shrink-0" />
            <span className="font-semibold text-sm whitespace-nowrap">Parse-It Imaging</span>
          </div>
          <div className="h-5 w-px bg-gray-600" />
          <span className="text-xs text-gray-400 font-mono truncate">
            {currentDoc?.originalFilename || documentId}
          </span>
          {documentType && (
            <span className="px-2 py-0.5 bg-blue-900/60 text-blue-300 rounded text-xs font-medium shrink-0">
              {documentType}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          {currentDoc?.documentUrl && (
            <>
              <a
                href={currentDoc.documentUrl}
                download={currentDoc.originalFilename || 'document'}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={() => window.open(currentDoc.documentUrl, '_blank', 'noopener,noreferrer')}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                onClick={handlePrint}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Print"
              >
                <Printer className="h-4 w-4" />
              </button>
            </>
          )}
          <div className="h-5 w-px bg-gray-600 mx-1" />
          <button
            onClick={() => setShowProperties(!showProperties)}
            className={`p-1.5 rounded transition-colors ${showProperties ? 'text-blue-400 bg-blue-900/40' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            title="Toggle properties"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      {documents.length > 1 && (
        <div className="flex items-center justify-center px-4 py-1.5 bg-gray-800/80 border-b border-gray-700 shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrevDoc}
              disabled={currentIndex === 0}
              className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-gray-300 font-medium">
              Document {currentIndex + 1} of {documents.length}
            </span>
            <button
              onClick={handleNextDoc}
              disabled={currentIndex === documents.length - 1}
              className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {currentDoc && (
            <div className="ml-4 pl-4 border-l border-gray-600">
              <span className="text-xs text-gray-400 truncate max-w-[300px] inline-block">
                {currentDoc.originalFilename || currentDoc.storagePath}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-center px-4 py-1.5 bg-gray-800/50 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-gray-400 w-10 text-center font-mono">
            {fitMode ? '--' : `${zoom}%`}
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-gray-600 mx-1" />
          <button
            onClick={() => handleFit('width')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${fitMode === 'width' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          >
            Fit Width
          </button>
          <button
            onClick={() => handleFit('height')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${fitMode === 'height' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          >
            Fit Height
          </button>
          <button
            onClick={() => handleFit('page')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${fitMode === 'page' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          >
            Fit Page
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 bg-gray-900 overflow-auto relative">
          {!currentDoc?.documentUrl ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <AlertCircle className="h-12 w-12 mb-3 text-gray-600" />
              <p className="text-sm font-medium">No document URL available</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText className="h-12 w-12 mb-3 text-gray-600" />
              <p className="text-sm font-medium mb-1">Unable to display document</p>
              <p className="text-xs mb-4 text-gray-600">The document could not be loaded in the viewer.</p>
              <button
                onClick={() => window.open(currentDoc.documentUrl, '_blank', 'noopener,noreferrer')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open in New Tab</span>
              </button>
            </div>
          ) : (
            <iframe
              src={currentDoc.documentUrl}
              style={iframeStyle}
              className="border-0"
              title={currentDoc.originalFilename || 'Document Viewer'}
              onError={() => setLoadError(true)}
            />
          )}
        </div>

        {showProperties && currentDoc && (
          <div className="w-72 bg-gray-800 border-l border-gray-700 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-blue-400">Properties</h3>
              <button
                onClick={() => setShowProperties(false)}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <PropertyField label="Document Name" value={currentDoc.originalFilename || currentDoc.storagePath} />
              <PropertyField label="Document Type" value={currentDoc.documentTypeName} />
              <PropertyField label="Bucket" value={currentDoc.bucketName} />
              <PropertyField label="File Size" value={formatFileSize(currentDoc.fileSize)} />
              <PropertyField label="Uploaded" value={formatDate(currentDoc.createdAt)} />
            </div>
            {metadataFields.length > 0 && (
              <div className="border-t border-gray-700 p-4 space-y-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Metadata
                </h4>
                {metadataFields.map(field => (
                  <PropertyField
                    key={field.id}
                    label={field.display_label}
                    value={docMetadata[field.id] || ''}
                    mono={field.field_type === 'number'}
                  />
                ))}
              </div>
            )}
            {documents.length > 1 && (
              <div className="border-t border-gray-700 p-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  All Documents ({documents.length})
                </h4>
                <div className="space-y-1.5">
                  {documents.map((doc, idx) => (
                    <button
                      key={doc.documentId}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                        idx === currentIndex
                          ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="truncate font-medium">
                        {doc.originalFilename || `Document ${idx + 1}`}
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {doc.documentTypeName} - {formatFileSize(doc.fileSize)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className={`text-sm text-gray-200 bg-gray-700/50 px-3 py-1.5 rounded border border-gray-600/50 truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '-'}
      </div>
    </div>
  );
}
