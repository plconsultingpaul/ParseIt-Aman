import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { Upload, Copy, X, ZoomIn, ZoomOut, RotateCcw, Download, Square, Trash2, Plus } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface MappingPageProps {
  onClose: () => void;
}

interface SelectionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  pageNumber: number;
}

export default function MappingPage({ onClose }: MappingPageProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<Omit<SelectionBox, 'id' | 'label'> | null>(null);
  const [selectionBoxes, setSelectionBoxes] = useState<SelectionBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [newBoxLabel, setNewBoxLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      setUploadedFile(files[0]);
      setPageNumber(1);
      setSelectionBoxes([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      setUploadedFile(files[0]);
      setPageNumber(1);
      setSelectionBoxes([]);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = useCallback((page: any) => {
    const viewport = page.getViewport({ scale, rotation });
    setPageSize({ width: viewport.width, height: viewport.height });
  }, [scale, rotation]);

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => Math.min(Math.max(prevPageNumber + offset, 1), numPages));
    setSelectionBoxes([]); // Clear selections when changing pages
  };

  const changeScale = (newScale: number) => {
    setScale(Math.min(Math.max(newScale, 0.5), 3.0));
  };

  const resetView = () => {
    setScale(1.0);
    setRotation(0);
    setPageNumber(1);
    setSelectionBoxes([]);
  };

  const rotateDocument = () => {
    setRotation(prev => (prev + 90) % 360);
    setSelectionBoxes([]); // Clear selections when rotating
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!pdfContainerRef.current) return;
    
    const rect = pdfContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0, pageNumber });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint || !pdfContainerRef.current) return;
    
    const rect = pdfContainerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const width = currentX - startPoint.x;
    const height = currentY - startPoint.y;
    
    setCurrentBox({
      x: width < 0 ? currentX : startPoint.x,
      y: height < 0 ? currentY : startPoint.y,
      width: Math.abs(width),
      height: Math.abs(height),
      pageNumber
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox || currentBox.width < 10 || currentBox.height < 10) {
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentBox(null);
      return;
    }
    
    setIsDrawing(false);
    setStartPoint(null);
    setShowLabelInput(true);
  };

  const handleSaveSelection = () => {
    if (!currentBox || !newBoxLabel.trim()) return;
    
    const newSelection: SelectionBox = {
      id: `selection-${Date.now()}`,
      ...currentBox,
      label: newBoxLabel.trim()
    };
    
    setSelectionBoxes(prev => [...prev, newSelection]);
    setCurrentBox(null);
    setNewBoxLabel('');
    setShowLabelInput(false);
  };

  const handleCancelSelection = () => {
    setCurrentBox(null);
    setNewBoxLabel('');
    setShowLabelInput(false);
  };

  const removeSelection = (id: string) => {
    setSelectionBoxes(prev => prev.filter(box => box.id !== id));
    if (selectedBoxId === id) {
      setSelectedBoxId(null);
    }
  };

  // Convert a screen-space box (in the currently-rendered, possibly-rotated viewport)
  // back to unrotated pdfjs user-space at scale=1, which is the space the local
  // resolver (extractPositionedText) uses. Without this, boxes drawn while the
  // page is rotated save coordinates that will never match the extracted text.
  const toUnrotatedPdfCoords = (box: SelectionBox) => {
    const rotatedWidth = pageSize.width;
    const rotatedHeight = pageSize.height;
    const sx = box.x / scale;
    const sy = box.y / scale;
    const sw = box.width / scale;
    const sh = box.height / scale;
    const rW = rotatedWidth / scale;
    const rH = rotatedHeight / scale;

    const r = ((rotation % 360) + 360) % 360;
    let x: number, y: number, w: number, h: number;
    if (r === 0) {
      x = sx; y = sy; w = sw; h = sh;
    } else if (r === 90) {
      x = sy; y = rW - sx - sw; w = sh; h = sw;
    } else if (r === 180) {
      x = rW - sx - sw; y = rH - sy - sh; w = sw; h = sh;
    } else {
      x = rH - sy - sh; y = sx; w = sh; h = sw;
    }
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
    };
  };

  const copyCoordinates = (box: SelectionBox) => {
    const { x, y, width, height } = toUnrotatedPdfCoords(box);
    const coordinateText = `Extract data from coordinates (${x}, ${y}, ${width}, ${height}) on page ${box.pageNumber}`;

    navigator.clipboard.writeText(coordinateText).then(() => {
      setSelectedBoxId(box.id);
      setTimeout(() => setSelectedBoxId(null), 2000);
    });
  };

  const copyAllCoordinates = () => {
    const currentPageBoxes = selectionBoxes.filter(box => box.pageNumber === pageNumber);
    if (currentPageBoxes.length === 0) return;

    const coordinatesList = currentPageBoxes.map(box => {
      const { x, y, width, height } = toUnrotatedPdfCoords(box);
      return `${box.label}: Extract data from coordinates (${x}, ${y}, ${width}, ${height}) on page ${box.pageNumber}`;
    }).join('\n');

    navigator.clipboard.writeText(coordinatesList);
  };

  const currentPageBoxes = selectionBoxes.filter(box => box.pageNumber === pageNumber);

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-7xl w-full max-h-[95vh] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Interactive PDF Field Mapping</h2>
              <p className="text-purple-100 mt-1">Upload a PDF, draw selection boxes around fields, and get pixel coordinates for precise extraction</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors duration-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Label Input Modal */}
        {showLabelInput && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Label this field</h3>
              <input
                type="text"
                value={newBoxLabel}
                onChange={(e) => setNewBoxLabel(e.target.value)}
                placeholder="e.g., Invoice Number, Total Amount"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleSaveSelection()}
              />
              <div className="flex space-x-3">
                <button
                  onClick={handleSaveSelection}
                  disabled={!newBoxLabel.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  Save Selection
                </button>
                <button
                  onClick={handleCancelSelection}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex h-[calc(95vh-120px)]">
          {/* Left Panel - Controls */}
          <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 overflow-y-auto">
            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Upload PDF
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('mapping-file-input')?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragOver
                    ? 'border-purple-400 bg-purple-50'
                    : uploadedFile
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                }`}
              >
                <input
                  id="mapping-file-input"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {uploadedFile ? (
                  <div className="space-y-2">
                    <div className="text-green-600 dark:text-green-400 font-medium">{uploadedFile.name}</div>
                    <div className="text-sm text-green-500 dark:text-green-400">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 text-gray-400 mx-auto" />
                    <div className="text-gray-600 dark:text-gray-400">Click or drag PDF here</div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            {uploadedFile && (
              <div className="space-y-6">
                {/* Page Navigation */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Page Navigation
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => changePage(-1)}
                      disabled={pageNumber <= 1}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500 text-gray-900 dark:text-gray-100 rounded-lg transition-colors duration-200"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-2 bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg font-medium">
                      {pageNumber} / {numPages}
                    </span>
                    <button
                      onClick={() => changePage(1)}
                      disabled={pageNumber >= numPages}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500 text-gray-900 dark:text-gray-100 rounded-lg transition-colors duration-200"
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* Zoom Controls */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Zoom ({Math.round(scale * 100)}%)
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => changeScale(scale - 0.1)}
                      className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors duration-200"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={scale}
                      onChange={(e) => setScale(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <button
                      onClick={() => changeScale(scale + 0.1)}
                      className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors duration-200"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* View Controls */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    View Controls
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={rotateDocument}
                      className="px-3 py-2 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors duration-200 flex items-center space-x-1"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Rotate</span>
                    </button>
                    <button
                      onClick={resetView}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors duration-200"
                    >
                      Reset View
                    </button>
                  </div>
                </div>

                {/* Field Selections */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Field Selections (Page {pageNumber})
                    </label>
                    {currentPageBoxes.length > 0 && (
                      <button
                        onClick={copyAllCoordinates}
                        className="px-2 py-1 bg-green-100 dark:bg-green-900/50 hover:bg-green-200 dark:hover:bg-green-800/50 text-green-700 dark:text-green-300 text-xs font-medium rounded transition-colors duration-200 flex items-center space-x-1"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Copy All</span>
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {currentPageBoxes.map((box) => (
                      <div
                        key={box.id}
                        className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                          selectedBoxId === box.id
                            ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-purple-200 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{box.label}</span>
                          <button
                            onClick={() => removeSelection(box.id)}
                            className="p-1 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          PDF Coords: ({toUnrotatedPdfCoords(box).x}, {toUnrotatedPdfCoords(box).y}, {toUnrotatedPdfCoords(box).width}, {toUnrotatedPdfCoords(box).height})
                        </div>
                        <button
                          onClick={() => copyCoordinates(box)}
                          className={`w-full px-2 py-1 text-xs font-medium rounded transition-colors duration-200 flex items-center justify-center space-x-1 ${
                            selectedBoxId === box.id
                              ? 'bg-green-600 text-white'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                          }`}
                        >
                          <Copy className="h-3 w-3" />
                          <span>{selectedBoxId === box.id ? 'Copied!' : 'Copy Coordinates'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {currentPageBoxes.length === 0 && (
                    <div className="text-center py-6 text-gray-500">
                      <Square className="h-8 w-8 mx-auto mb-2 opacity-50 text-gray-400 dark:text-gray-500" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No selections on this page</p>
                      <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">Click and drag on the PDF to select fields</p>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">How to Use</h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                    <li>• Click and drag on the PDF to select field areas</li>
                    <li>• Label each selection for easy identification</li>
                    <li>• Copy coordinates to use in AI extraction instructions</li>
                    <li>• Coordinates are automatically adjusted for PDF scale</li>
                    <li>• Each page maintains separate selections</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - PDF Viewer with Selection Overlay */}
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-auto">
            {uploadedFile ? (
              <div className="p-6">
                <div 
                  ref={pdfContainerRef}
                  className="relative bg-white dark:bg-gray-800 rounded-lg shadow-lg inline-block cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{ userSelect: 'none' }}
                >
                  <Document
                    file={uploadedFile}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                      <div className="flex items-center justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading PDF...</span>
                      </div>
                    }
                    error={
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6 m-4">
                        <div className="text-red-800 dark:text-red-300 font-semibold mb-2">Failed to load PDF</div>
                        <div className="text-red-700 dark:text-red-400 text-sm">
                          Please make sure the file is a valid PDF document.
                        </div>
                      </div>
                    }
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      rotate={rotation}
                      onLoadSuccess={onPageLoadSuccess}
                      loading={
                        <div className="flex items-center justify-center p-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading page...</span>
                        </div>
                      }
                      error={
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                          <div className="text-red-800 dark:text-red-300 text-sm">Failed to load page {pageNumber}</div>
                        </div>
                      }
                    />
                  </Document>

                  {/* Selection Overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Existing selections for current page */}
                    {currentPageBoxes.map((box) => (
                      <div
                        key={box.id}
                        className="absolute border-2 border-purple-500 bg-purple-500 bg-opacity-20 pointer-events-auto"
                        style={{
                          left: box.x,
                          top: box.y,
                          width: box.width,
                          height: box.height,
                        }}
                      >
                        <div className="absolute -top-6 left-0 bg-purple-600 dark:bg-purple-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          {box.label}
                        </div>
                      </div>
                    ))}

                    {/* Current drawing selection */}
                    {currentBox && (
                      <div
                        className="absolute border-2 border-blue-500 bg-blue-500 bg-opacity-20"
                        style={{
                          left: currentBox.x,
                          top: currentBox.y,
                          width: currentBox.width,
                          height: currentBox.height,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Upload className="h-16 w-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No PDF Loaded</h3>
                  <p className="text-gray-600 dark:text-gray-400">Upload a PDF file to start mapping fields</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Status Bar */}
        {uploadedFile && (
          <div className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 px-6 py-3">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
              <div>
                Total selections: {selectionBoxes.length} | Current page: {currentPageBoxes.length}
              </div>
              <div>
                PDF Size: {Math.round(pageSize.width)}×{Math.round(pageSize.height)}px | Scale: {Math.round(scale * 100)}%
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}