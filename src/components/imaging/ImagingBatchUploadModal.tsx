import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Upload, Loader2, ChevronLeft, ChevronRight, Check, FileText,
  AlertCircle, Layers, CheckCircle2, Circle, RotateCw, Layers3, Ban, EyeOff,
  Minus, Plus, Maximize2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import type { ImagingBucket, ImagingDocumentType, ImagingMetadataField, ImagingDocumentTypeMetadataField } from '../../types';
import {
  fetchBuckets, fetchDocumentTypes, fetchMetadataFields, fetchDocTypeMetadataFields,
  uploadDocument, triggerEpdfProcessing,
  createBatchRecord, fetchBatchPages, saveBatchPageState, updateBatchIndexedCount,
  completeBatchRecord, downloadBatchPdf, findDuplicateDocument,
  type ImagingBatch, type ImagingBatchPage,
} from '../../services/imagingService';
import CustomDropdown from '../common/CustomDropdown';
import DatePicker from '../common/DatePicker';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

interface PageIndexData {
  bucketId: string;
  documentTypeId: string;
  metadata: Record<string, string>;
  indexed: boolean;
  ignored: boolean;
  groupId: string | null;
}

const EMPTY_PAGE_DATA: PageIndexData = { bucketId: '', documentTypeId: '', metadata: {}, indexed: false, ignored: false, groupId: null };

const GROUP_COLORS = [
  'border-l-emerald-500',
  'border-l-sky-500',
  'border-l-amber-500',
  'border-l-rose-500',
  'border-l-teal-500',
  'border-l-fuchsia-500',
  'border-l-lime-500',
  'border-l-orange-500',
];

function genGroupId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ImagingBatchUploadModalProps {
  onClose: () => void;
  onComplete: () => void;
  resumeBatch?: ImagingBatch | null;
}

export default function ImagingBatchUploadModal({ onClose, onComplete, resumeBatch }: ImagingBatchUploadModalProps) {
  const [file, setFile] = useState<File | null>(resumeBatch ? ({ name: resumeBatch.originalFilename } as File) : null);
  const [totalPages, setTotalPages] = useState(resumeBatch?.totalPages || 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);

  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const [allMetadataFields, setAllMetadataFields] = useState<ImagingMetadataField[]>([]);
  const [docTypeAssignments, setDocTypeAssignments] = useState<ImagingDocumentTypeMetadataField[]>([]);

  const [pageData, setPageData] = useState<Record<number, PageIndexData>>({});
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [indexingComplete, setIndexingComplete] = useState(false);

  const [batchRecord, setBatchRecord] = useState<ImagingBatch | null>(resumeBatch || null);

  const [zoom, setZoom] = useState(1);
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.25;

  const [dupPrompt, setDupPrompt] = useState<null | {
    billNumber: string;
    bucketName: string;
    docTypeName: string;
    existingFilename: string;
    existingCreatedAt: string;
    resolve: (choice: 'keep_existing' | 'use_new' | 'cancel') => void;
  }>(null);
  const [loadingResume, setLoadingResume] = useState(!!resumeBatch);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderTaskRef = useRef<any>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelCooldownRef = useRef<number>(0);

  useEffect(() => {
    Promise.all([fetchBuckets(), fetchDocumentTypes(), fetchMetadataFields()]).then(([b, d, mf]) => {
      setBuckets(b.filter(x => x.isActive));
      setDocTypes(d.filter(x => x.isActive));
      setAllMetadataFields(mf.filter(x => x.isActive));
    });
  }, []);

  // Resume: download the PDF and restore page state
  useEffect(() => {
    if (!resumeBatch) return;
    (async () => {
      try {
        const [buffer, savedPages] = await Promise.all([
          downloadBatchPdf(resumeBatch.storagePath),
          fetchBatchPages(resumeBatch.id),
        ]);
        setPdfBytes(buffer);
        const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);

        const restoredData: Record<number, PageIndexData> = {};
        const restoredRotations: Record<number, number> = {};
        savedPages.forEach((p: ImagingBatchPage) => {
          restoredData[p.pageNumber] = {
            bucketId: p.bucketId || '',
            documentTypeId: p.documentTypeId || '',
            metadata: p.metadata || {},
            indexed: p.indexed,
            ignored: p.ignored,
            groupId: p.groupId || null,
          };
          if (p.rotation) restoredRotations[p.pageNumber] = p.rotation;
        });
        setPageData(restoredData);
        setPageRotations(restoredRotations);

        // Jump to first unresolved page (not yet indexed or ignored)
        const firstUnresolved = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
          .find(n => !restoredData[n]?.indexed && !restoredData[n]?.ignored);
        setCurrentPage(firstUnresolved || 1);
      } catch (err: any) {
        setError('Failed to load batch PDF. The file may have been removed.');
      } finally {
        setLoadingResume(false);
      }
    })();
  }, [resumeBatch]);

  const currentPageData = pageData[currentPage] || EMPTY_PAGE_DATA;

  const multiSelectActive = selectedPages.size > 1;

  const togglePageSelection = (pageNum: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const getPageGroupColor = (groupId: string | null | undefined): string | null => {
    if (!groupId) return null;
    const allGroups = Array.from(new Set(
      Object.values(pageData).map(p => p.groupId).filter(Boolean) as string[]
    ));
    const idx = allGroups.indexOf(groupId);
    if (idx < 0) return null;
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  };

  useEffect(() => {
    if (!currentPageData.documentTypeId) {
      setDocTypeAssignments([]);
      return;
    }
    fetchDocTypeMetadataFields(currentPageData.documentTypeId).then(setDocTypeAssignments).catch(() => setDocTypeAssignments([]));
  }, [currentPageData.documentTypeId]);

  // Auto-select document type if there is only one available
  useEffect(() => {
    if (currentPageData.bucketId && !currentPageData.documentTypeId && docTypes.length === 1) {
      updatePageData('documentTypeId', docTypes[0].id);
    }
  }, [currentPageData.bucketId, currentPageData.documentTypeId, docTypes]);

  const assignedFields = docTypeAssignments
    .filter(a => !a.isHiddenFromIndexing)
    .map(a => {
      const field = allMetadataFields.find(f => f.id === a.metadataFieldId);
      return field ? { ...field, isRequired: a.isRequired, sortOrder: a.sortOrder } : null;
    })
    .filter(Boolean) as (ImagingMetadataField & { isRequired: boolean; sortOrder: number })[];

  assignedFields.sort((a, b) => a.sortOrder - b.sortOrder);

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    try {
      const buffer = await selectedFile.arrayBuffer();
      setPdfBytes(buffer);
      const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setPageData({});
      setPageRotations({});
      setSelectedPages(new Set());
      setIndexingComplete(false);

      // Create batch record in DB
      const batch = await createBatchRecord(selectedFile, pdf.numPages);
      setBatchRecord(batch);
    } catch (err: any) {
      setError('Failed to load the PDF. Please try a different file.');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') handleFileSelected(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelected(f);
  };

  const handleRotate = () => {
    const newRotation = ((pageRotations[currentPage] || 0) + 90) % 360;
    setPageRotations(prev => ({ ...prev, [currentPage]: newRotation }));
    debouncedSavePage(currentPage, undefined, newRotation);
  };

  const renderPage = useCallback(async (pageNum: number, rotation: number = 0) => {
    if (!pdfDoc || !canvasRef.current) return;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    try {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const container = canvas.parentElement;
      const maxWidth = container ? container.clientWidth - 32 : 800;
      const maxHeight = container ? container.clientHeight - 32 : 1000;

      const viewport = page.getViewport({ scale: 1, rotation });
      const scaleW = maxWidth / viewport.width;
      const scaleH = maxHeight / viewport.height;
      const fitScale = Math.min(scaleW, scaleH, 2);
      const scale = fitScale * zoom;

      const scaledViewport = page.getViewport({ scale, rotation });
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const task = page.render({ canvasContext: ctx, viewport: scaledViewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Page render error:', err);
      }
    }
  }, [pdfDoc, zoom]);

  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPage(currentPage, pageRotations[currentPage] || 0);
    }
  }, [pdfDoc, currentPage, pageRotations, renderPage]);

  useEffect(() => {
    setZoom(1);
  }, [pdfDoc]);

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);

  const handleViewerWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!pdfDoc || totalPages < 2) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      if (!e.currentTarget.contains(active)) return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
      return;
    }
    if (Math.abs(e.deltaY) < 10) return;
    const now = Date.now();
    if (now - wheelCooldownRef.current < 220) return;
    wheelCooldownRef.current = now;
    if (e.deltaY > 0) {
      setCurrentPage(p => Math.min(totalPages, p + 1));
    } else if (e.deltaY < 0) {
      setCurrentPage(p => Math.max(1, p - 1));
    }
  };

  // Debounced save to DB
  const debouncedSavePage = useCallback((pageNum: number, pd?: PageIndexData, rotation?: number) => {
    if (!batchRecord) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const data = pd || pageData[pageNum] || EMPTY_PAGE_DATA;
      saveBatchPageState(batchRecord.id, pageNum, {
        bucketId: data.bucketId || null,
        documentTypeId: data.documentTypeId || null,
        metadata: data.metadata,
        rotation: rotation !== undefined ? rotation : (pageRotations[pageNum] || 0),
        indexed: data.indexed,
        ignored: data.ignored,
        groupId: data.groupId,
      }).catch(() => {});
    }, 500);
  }, [batchRecord, pageData, pageRotations]);

  const updatePageData = (key: keyof PageIndexData, value: any) => {
    setPageData(prev => {
      const updated = {
        ...prev,
        [currentPage]: {
          ...prev[currentPage] || EMPTY_PAGE_DATA,
          [key]: value,
        },
      };
      debouncedSavePage(currentPage, updated[currentPage]);
      return updated;
    });
  };

  const updateMetadata = (fieldId: string, value: string) => {
    const current = pageData[currentPage] || EMPTY_PAGE_DATA;
    setPageData(prev => {
      const updated = {
        ...prev,
        [currentPage]: {
          ...current,
          metadata: { ...current.metadata, [fieldId]: value },
        },
      };
      debouncedSavePage(currentPage, updated[currentPage]);
      return updated;
    });
  };

  const canIndexPage = () => {
    if (!currentPageData.bucketId || !currentPageData.documentTypeId) return false;
    const requiredMet = assignedFields
      .filter(f => f.isRequired)
      .every(f => (currentPageData.metadata[f.id] || '').trim() !== '');
    return requiredMet;
  };

  const handleIndexPage = () => {
    if (!canIndexPage()) return;
    setPageData(prev => {
      const base = prev[currentPage] || EMPTY_PAGE_DATA;
      const updated = {
        ...prev,
        [currentPage]: { ...base, indexed: true, ignored: false },
      };
      if (batchRecord) {
        saveBatchPageState(batchRecord.id, currentPage, {
          bucketId: updated[currentPage].bucketId || null,
          documentTypeId: updated[currentPage].documentTypeId || null,
          metadata: updated[currentPage].metadata,
          rotation: pageRotations[currentPage] || 0,
          indexed: true,
          ignored: false,
          groupId: updated[currentPage].groupId,
        }).catch(() => {});
        const newCount = Object.values(updated).filter(p => p.indexed).length;
        updateBatchIndexedCount(batchRecord.id, newCount).catch(() => {});
      }
      return updated;
    });
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleUnindexPage = () => {
    setPageData(prev => {
      const base = prev[currentPage] || EMPTY_PAGE_DATA;
      const updated = {
        ...prev,
        [currentPage]: { ...base, indexed: false, groupId: null },
      };
      if (batchRecord) {
        saveBatchPageState(batchRecord.id, currentPage, {
          bucketId: updated[currentPage].bucketId || null,
          documentTypeId: updated[currentPage].documentTypeId || null,
          metadata: updated[currentPage].metadata,
          rotation: pageRotations[currentPage] || 0,
          indexed: false,
          groupId: null,
        }).catch(() => {});
        const newCount = Object.values(updated).filter(p => p.indexed).length;
        updateBatchIndexedCount(batchRecord.id, newCount).catch(() => {});
      }
      return updated;
    });
  };

  const handleIgnorePage = () => {
    const targets = selectedPages.size > 1 ? Array.from(selectedPages) : [currentPage];
    setPageData(prev => {
      const updated = { ...prev };
      targets.forEach(p => {
        const base = prev[p] || EMPTY_PAGE_DATA;
        updated[p] = { ...base, indexed: false, ignored: true, groupId: null };
        if (batchRecord) {
          saveBatchPageState(batchRecord.id, p, {
            bucketId: updated[p].bucketId || null,
            documentTypeId: updated[p].documentTypeId || null,
            metadata: updated[p].metadata,
            rotation: pageRotations[p] || 0,
            indexed: false,
            ignored: true,
            groupId: null,
          }).catch(() => {});
        }
      });
      if (batchRecord) {
        const newCount = Object.values(updated).filter(p => p.indexed).length;
        updateBatchIndexedCount(batchRecord.id, newCount).catch(() => {});
      }
      return updated;
    });
    if (selectedPages.size > 1) setSelectedPages(new Set());
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handleUnignorePage = () => {
    setPageData(prev => {
      const base = prev[currentPage] || EMPTY_PAGE_DATA;
      const updated = {
        ...prev,
        [currentPage]: { ...base, ignored: false },
      };
      if (batchRecord) {
        saveBatchPageState(batchRecord.id, currentPage, {
          bucketId: updated[currentPage].bucketId || null,
          documentTypeId: updated[currentPage].documentTypeId || null,
          metadata: updated[currentPage].metadata,
          rotation: pageRotations[currentPage] || 0,
          ignored: false,
        }).catch(() => {});
      }
      return updated;
    });
  };

  const handleIndexGroup = () => {
    if (selectedPages.size < 2) return;
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    const source = pageData[currentPage];
    if (!source || !source.bucketId || !source.documentTypeId) return;
    const requiredMet = assignedFields
      .filter(f => f.isRequired)
      .every(f => (source.metadata[f.id] || '').trim() !== '');
    if (!requiredMet) return;

    const groupId = genGroupId();
    setPageData(prev => {
      const updated = { ...prev };
      pages.forEach(p => {
        updated[p] = {
          bucketId: source.bucketId,
          documentTypeId: source.documentTypeId,
          metadata: { ...source.metadata },
          indexed: true,
          ignored: false,
          groupId,
        };
        if (batchRecord) {
          saveBatchPageState(batchRecord.id, p, {
            bucketId: source.bucketId,
            documentTypeId: source.documentTypeId,
            metadata: { ...source.metadata },
            rotation: pageRotations[p] || 0,
            indexed: true,
            ignored: false,
            groupId,
          }).catch(() => {});
        }
      });
      if (batchRecord) {
        const newCount = Object.values(updated).filter(p => p.indexed).length;
        updateBatchIndexedCount(batchRecord.id, newCount).catch(() => {});
      }
      return updated;
    });
    setSelectedPages(new Set());
  };

  const indexedCount = Object.values(pageData).filter(p => p.indexed).length;
  const ignoredCount = Object.values(pageData).filter(p => p.ignored).length;
  const allResolved = totalPages > 0 && (indexedCount + ignoredCount) === totalPages;

  const handleCompleteBatch = async () => {
    if (!pdfBytes || !file) return;
    setSubmitting(true);
    setError('');

    try {
      const groups = buildPageGroups();
      const billFieldId = allMetadataFields.find(f => f.fieldName === 'billNumber')?.id;

      console.log('[IMAGING-BATCH] handleCompleteBatch start', {
        groupCount: groups.length,
        billFieldId,
        allMetadataFieldsCount: allMetadataFields.length,
      });

      for (const group of groups) {
        const dt = docTypes.find(d => d.id === group.documentTypeId);
        const bill = billFieldId ? (group.metadata[billFieldId] || '').trim() : '';

        console.log('[IMAGING-BATCH] processing group', {
          pages: group.pages,
          bucketId: group.bucketId,
          documentTypeId: group.documentTypeId,
          docTypeName: dt?.name,
          allowDuplicates: dt?.allowDuplicates,
          duplicateManualAction: dt?.duplicateManualAction,
          bill,
          metadataKeys: Object.keys(group.metadata),
          metadata: group.metadata,
        });

        let replaceDocumentId: string | undefined;
        let skipUpload = false;

        if (dt && !dt.allowDuplicates && bill) {
          const existing = await findDuplicateDocument({
            bucketId: group.bucketId,
            documentTypeId: group.documentTypeId,
            billNumber: bill,
          });
          console.log('[IMAGING-BATCH] duplicate lookup result', { found: !!existing, existingId: existing?.id || null });
          if (existing) {
            let action: 'keep_existing' | 'use_new' | 'prompt' = dt.duplicateManualAction;
            if (action === 'prompt') {
              const bucketName = buckets.find(b => b.id === group.bucketId)?.name || '';
              const choice = await new Promise<'keep_existing' | 'use_new' | 'cancel'>(resolve => {
                setDupPrompt({
                  billNumber: bill,
                  bucketName,
                  docTypeName: dt.name,
                  existingFilename: existing.originalFilename || existing.storagePath.split('/').pop() || '',
                  existingCreatedAt: existing.createdAt,
                  resolve,
                });
              });
              setDupPrompt(null);
              if (choice === 'cancel') {
                setSubmitting(false);
                return;
              }
              action = choice;
            }
            if (action === 'keep_existing') skipUpload = true;
            else if (action === 'use_new') replaceDocumentId = existing.id;
          }
        }

        if (skipUpload) continue;

        const splitPdfBytes = await extractPages(pdfBytes, group.pages, pageRotations);
        const splitFile = new File([splitPdfBytes], `${file.name.replace('.pdf', '')}_pages_${group.pages[0]}-${group.pages[group.pages.length - 1]}.pdf`, { type: 'application/pdf' });

        const metadataArray = Object.entries(group.metadata)
          .filter(([_, v]) => v.trim())
          .map(([fieldId, value]) => ({ fieldId, value: value.trim() }));

        const doc = await uploadDocument({
          file: splitFile,
          bucketId: group.bucketId,
          documentTypeId: group.documentTypeId,
          metadata: metadataArray.length > 0 ? metadataArray : undefined,
          replaceDocumentId,
        });

        doc.processingStatus = 'processing';
        console.log('[EPDF-UPLOAD] batch-upload triggering EPDF', { docId: doc.id, storagePath: doc.storagePath });
        triggerEpdfProcessing(doc.id, doc.storagePath, false).catch((e) => {
          console.error('[EPDF-UPLOAD] triggerEpdfProcessing threw', e);
        });
      }

      // Mark batch as completed and remove the raw PDF from storage
      if (batchRecord) {
        await completeBatchRecord(batchRecord.id);
      }

      setIndexingComplete(true);
      setTimeout(() => onComplete(), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to complete batch upload');
    } finally {
      setSubmitting(false);
    }
  };

  const buildPageGroups = (): { pages: number[]; bucketId: string; documentTypeId: string; metadata: Record<string, string> }[] => {
    const explicitGroups = new Map<string, { pages: number[]; bucketId: string; documentTypeId: string; metadata: Record<string, string>; firstPage: number }>();
    const ungrouped: number[] = [];

    for (let p = 1; p <= totalPages; p++) {
      const pd = pageData[p];
      if (!pd?.indexed) continue;
      if (pd.ignored) continue;
      if (pd.groupId) {
        const existing = explicitGroups.get(pd.groupId);
        if (existing) {
          existing.pages.push(p);
        } else {
          explicitGroups.set(pd.groupId, {
            pages: [p],
            bucketId: pd.bucketId,
            documentTypeId: pd.documentTypeId,
            metadata: { ...pd.metadata },
            firstPage: p,
          });
        }
      } else {
        ungrouped.push(p);
      }
    }

    const groups: { pages: number[]; bucketId: string; documentTypeId: string; metadata: Record<string, string>; firstPage: number }[] = [];
    let current: typeof groups[0] | null = null;

    for (const p of ungrouped) {
      const pd = pageData[p]!;
      if (current && current.bucketId === pd.bucketId && current.documentTypeId === pd.documentTypeId && metadataEqual(current.metadata, pd.metadata) && p === current.pages[current.pages.length - 1] + 1) {
        current.pages.push(p);
      } else {
        if (current) groups.push(current);
        current = { pages: [p], bucketId: pd.bucketId, documentTypeId: pd.documentTypeId, metadata: { ...pd.metadata }, firstPage: p };
      }
    }
    if (current) groups.push(current);

    const all = [...groups, ...Array.from(explicitGroups.values())];
    all.sort((a, b) => a.firstPage - b.firstPage);
    return all.map(g => ({ pages: g.pages.sort((a, b) => a - b), bucketId: g.bucketId, documentTypeId: g.documentTypeId, metadata: g.metadata }));
  };

  const metadataEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
    const keysA = Object.keys(a).filter(k => a[k]?.trim());
    const keysB = Object.keys(b).filter(k => b[k]?.trim());
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => a[k] === b[k]);
  };

  const extractPages = async (sourceBytes: ArrayBuffer, pages: number[], rotations: Record<number, number>): Promise<Uint8Array> => {
    const srcDoc = await PDFDocument.load(sourceBytes);
    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, pages.map(p => p - 1));
    copied.forEach((page, idx) => {
      const rot = rotations[pages[idx]] || 0;
      if (rot) {
        const existing = page.getRotation().angle;
        page.setRotation(degrees((existing + rot) % 360));
      }
      newDoc.addPage(page);
    });
    return newDoc.save();
  };

  const renderMetaInput = (field: ImagingMetadataField & { isRequired: boolean }) => {
    const value = currentPageData.metadata[field.id] || '';
    const inputClasses = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

    if (field.fieldType === 'dropdown') {
      return (
        <CustomDropdown
          value={value}
          onChange={(val) => updateMetadata(field.id, val)}
          placeholder="Select..."
          options={field.dropdownOptions.map(opt => ({ value: opt, label: opt }))}
        />
      );
    }
    if (field.fieldType === 'boolean') {
      return (
        <CustomDropdown
          value={value}
          onChange={(val) => updateMetadata(field.id, val)}
          placeholder="Select..."
          options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
        />
      );
    }
    if (field.fieldType === 'date') {
      return <DatePicker value={value} onChange={(val) => updateMetadata(field.id, val)} placeholder="Select date..." />;
    }
    return (
      <input
        type={field.fieldType === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => updateMetadata(field.id, e.target.value)}
        placeholder={`Enter ${field.displayLabel.toLowerCase()}...`}
        className={inputClasses}
      />
    );
  };

  // Loading state for resume
  if (loadingResume) {
    return createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70]">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-600 dark:text-gray-300">Loading batch...</p>
        </div>
      </div>,
      globalThis.document.body
    );
  }

  if (!file) {
    return createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Batch Upload</h3>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-8">
            {error && (
              <div className="flex items-center space-x-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-10 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
            >
              <input ref={fileInputRef} type="file" onChange={handleFileChange} accept=".pdf" className="hidden" />
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Select a multi-page PDF to batch index</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click to browse or drag and drop</p>
            </div>
          </div>
        </div>
      </div>,
      globalThis.document.body
    );
  }

  return createPortal(
    <>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70]">
      <div className="bg-white dark:bg-gray-800 shadow-2xl w-screen h-screen flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 shrink-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
                {file.name}
              </h3>
            </div>
            <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                {totalPages} pages
              </span>
              <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full font-medium">
                {indexedCount} indexed
              </span>
              {ignoredCount > 0 && (
                <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full font-medium">
                  {ignoredCount} ignored
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {allResolved && (
              <button
                onClick={handleCompleteBatch}
                disabled={submitting || indexingComplete}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  indexingComplete
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                } disabled:opacity-60`}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : indexingComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>{submitting ? 'Uploading...' : indexingComplete ? 'Done!' : 'Complete Batch'}</span>
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Page list sidebar */}
          <div className="w-24 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
            {selectedPages.size > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 shrink-0">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {selectedPages.size} selected
                </span>
                <button
                  onClick={() => setSelectedPages(new Set())}
                  className="p-0.5 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded"
                  title="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
              const pd = pageData[pageNum];
              const isActive = pageNum === currentPage;
              const isIndexed = pd?.indexed;
              const isSelected = selectedPages.has(pageNum);
              const groupColor = getPageGroupColor(pd?.groupId);
              const borderColor = isActive
                ? 'border-l-blue-600'
                : groupColor
                  ? groupColor
                  : 'border-l-transparent';
              return (
                <div
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`relative flex items-center py-2.5 pl-1 pr-1 border-b border-gray-200 dark:border-gray-700 border-l-4 transition-colors cursor-pointer ${borderColor} ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center h-full pr-1.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => togglePageSelection(pageNum, e)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                  <div className="flex-1 flex flex-col items-center">
                    <div className="relative">
                      <FileText className={`h-5 w-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : pd?.ignored ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'}`} />
                      {isIndexed ? (
                        <CheckCircle2 className="absolute -top-1 -right-1.5 h-3 w-3 text-green-500 bg-white dark:bg-gray-900 rounded-full" />
                      ) : pd?.ignored ? (
                        <Ban className="absolute -top-1 -right-1.5 h-3 w-3 text-gray-500 bg-white dark:bg-gray-900 rounded-full" />
                      ) : (
                        <Circle className="absolute -top-1 -right-1.5 h-3 w-3 text-gray-300 dark:text-gray-600 bg-white dark:bg-gray-900 rounded-full" />
                      )}
                    </div>
                    <span className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-blue-700 dark:text-blue-300' : pd?.ignored ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-500 dark:text-gray-400'}`}>
                      {pageNum}
                    </span>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* PDF Viewer */}
          <div className="flex-1 bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
            <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 shrink-0">
              <button
                onClick={handleRotate}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                title="Rotate 90 degrees"
              >
                <RotateCw className="h-4 w-4" />
                <span>Rotate</span>
              </button>
              <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= MIN_ZOOM}
                  className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Zoom out"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={zoomReset}
                  className="min-w-[64px] px-2 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border-x border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= MAX_ZOOM}
                  className="px-2.5 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Zoom in"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={zoomReset}
                disabled={zoom === 1}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Fit to window"
              >
                <Maximize2 className="h-4 w-4" />
                <span>Fit</span>
              </button>
            </div>
            <div
              className="flex-1 flex items-center justify-center overflow-auto p-4"
              onWheel={handleViewerWheel}
            >
              <canvas ref={canvasRef} className="shadow-lg rounded" />
            </div>
          </div>

          {/* Properties Panel */}
          <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {multiSelectActive ? (
                  <>
                    <Layers3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Indexing {selectedPages.size} pages as 1 document</span>
                  </>
                ) : (
                  <span>Page {currentPage} of {totalPages}</span>
                )}
              </h3>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 rounded transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 rounded transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                {currentPageData.indexed && (
                  <div className="flex items-center space-x-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Page indexed</span>
                  </div>
                )}

                {currentPageData.ignored && (
                  <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600">
                    <Ban className="h-4 w-4" />
                    <span>Page ignored — will not be saved</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bucket <span className="text-red-500">*</span></label>
                  <CustomDropdown
                    value={currentPageData.bucketId}
                    onChange={(val) => updatePageData('bucketId', val)}
                    placeholder="Select a bucket..."
                    options={buckets.map(b => ({ value: b.id, label: b.name }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Document Type <span className="text-red-500">*</span></label>
                  <CustomDropdown
                    value={currentPageData.documentTypeId}
                    onChange={(val) => {
                      updatePageData('documentTypeId', val);
                      updatePageData('metadata', {});
                    }}
                    placeholder="Select a document type..."
                    options={docTypes.map(d => ({ value: d.id, label: d.name }))}
                  />
                </div>

                {assignedFields.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Document Fields
                    </h4>
                    <div className="space-y-3">
                      {assignedFields.map(field => (
                        <div key={field.id}>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 shrink-0 space-y-2">
              {multiSelectActive && (
                <button
                  onClick={handleIndexGroup}
                  disabled={!canIndexPage()}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    canIndexPage()
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Layers3 className="h-4 w-4" />
                  <span>Index {selectedPages.size} Pages as 1 Document</span>
                </button>
              )}
              {(!multiSelectActive && currentPageData.ignored) ? (
                <button
                  onClick={handleUnignorePage}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <EyeOff className="h-4 w-4" />
                  <span>Restore Page (currently ignored)</span>
                </button>
              ) : (!multiSelectActive && currentPageData.indexed) ? (
                <button
                  onClick={handleUnindexPage}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span>Unmark as Indexed</span>
                </button>
              ) : !multiSelectActive ? (
                <>
                  <button
                    onClick={handleIndexPage}
                    disabled={!canIndexPage()}
                    className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      canIndexPage()
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                    <span>Index Page {currentPage < totalPages ? '& Next' : ''}</span>
                  </button>
                  <button
                    onClick={handleIgnorePage}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Ban className="h-4 w-4" />
                    <span>Ignore Page {currentPage < totalPages ? '& Next' : ''}</span>
                  </button>
                </>
              ) : null}
              {multiSelectActive && (
                <button
                  onClick={handleIgnorePage}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <Ban className="h-4 w-4" />
                  <span>Ignore {selectedPages.size} Selected Pages</span>
                </button>
              )}
              {!allResolved && totalPages > 0 && (
                <p className="text-center text-[10px] text-gray-500 dark:text-gray-400">
                  {indexedCount} indexed{ignoredCount > 0 ? ` · ${ignoredCount} ignored` : ''} of {totalPages}
                </p>
              )}
            </div>
          </div>
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
            <button
              onClick={() => dupPrompt.resolve('cancel')}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
            >Cancel batch</button>
            <button
              onClick={() => dupPrompt.resolve('keep_existing')}
              className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-100"
            >Keep Existing</button>
            <button
              onClick={() => dupPrompt.resolve('use_new')}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >Use New (Replace)</button>
          </div>
        </div>
      </div>
    )}
    </>,
    globalThis.document.body
  );
}
