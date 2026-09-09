import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Check, PenTool, Loader2, ChevronLeft } from 'lucide-react';

interface SignaturePadModalProps {
  inputLabel: string;
  isExecuting: boolean;
  onSubmit: (data: { signeeName: string; signedTime: string; imageData: string }) => void;
  onCancel: () => void;
  onBack?: () => void;
}

function SignaturePadCanvas({ onSigned, onClear, isLandscape, onClose }: { onSigned: (imageData: string) => void; onClear: () => void; isLandscape: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokesRef = useRef(false);

  const drawBaseline = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    const baselineY = canvas.height * 0.75;
    ctx.beginPath();
    ctx.moveTo(30, baselineY);
    ctx.lineTo(canvas.width - 30, baselineY);
    ctx.stroke();
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    drawBaseline(canvas, ctx);
    hasStrokesRef.current = false;
  }, [drawBaseline]);

  const getCanvasPoint = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scaleX = canvas.width / dpr / rect.width;
    const scaleY = canvas.height / dpr / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const drawLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }, []);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const point = getCanvasPoint(e);
    if (point) {
      lastPointRef.current = point;
      hasStrokesRef.current = true;
    }
  }, [getCanvasPoint]);

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const point = getCanvasPoint(e);
    if (point && lastPointRef.current) {
      drawLine(lastPointRef.current, point);
      lastPointRef.current = point;
    }
  }, [getCanvasPoint, drawLine]);

  const handleEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  useEffect(() => {
    resizeCanvas();
    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeCanvas]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    drawBaseline(canvas, ctx);
    hasStrokesRef.current = false;
    onClear();
  }, [onClear, drawBaseline]);

  const handleSigned = useCallback(() => {
    if (!hasStrokesRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imageData = canvas.toDataURL('image/png');
    const base64Only = imageData.replace(/^data:image\/png;base64,/, '');
    onSigned(base64Only);
  }, [onSigned]);

  const canvasElement = (
    <div ref={containerRef} className="flex-1 min-h-0 min-w-0 relative bg-white rounded-lg overflow-hidden border-2 border-gray-300">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
      {!hasStrokesRef.current && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-400 text-lg select-none">Sign here</p>
        </div>
      )}
    </div>
  );

  if (isLandscape) {
    return (
      <div className="flex h-full min-h-0 gap-2 overflow-hidden">
        {canvasElement}
        <div className="flex flex-col justify-between w-20 shrink-0 py-1">
          <button
            onClick={onClose}
            className="flex items-center justify-center p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleClear}
              className="flex flex-col items-center justify-center px-2 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors font-medium text-xs"
            >
              <RotateCcw className="h-4 w-4 mb-1" />
              Clear
            </button>
            <button
              onClick={handleSigned}
              className="flex flex-col items-center justify-center px-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium text-xs"
            >
              <Check className="h-4 w-4 mb-1" />
              Signed
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {canvasElement}
      <div className="flex items-center justify-between mt-3 gap-3">
        <button
          onClick={handleClear}
          className="flex items-center px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Clear
        </button>
        <button
          onClick={handleSigned}
          className="flex items-center px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"
        >
          <Check className="h-4 w-4 mr-2" />
          Signed
        </button>
      </div>
    </div>
  );
}

export default function SignaturePadModal({ inputLabel, isExecuting, onSubmit, onCancel, onBack }: SignaturePadModalProps) {
  const [signeeName, setSigneeName] = useState('');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const checkOrientation = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  const currentDateTime = new Date().toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const handleSignedFromPad = useCallback((imageData: string) => {
    setSignatureImage(imageData);
    setShowPad(false);
  }, []);

  const handleClearFromPad = useCallback(() => {
    setSignatureImage(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!signeeName.trim() || !signatureImage) return;
    onSubmit({
      signeeName: signeeName.trim(),
      signedTime: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19),
      imageData: signatureImage,
    });
  }, [signeeName, signatureImage, onSubmit]);

  if (showPad) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-gray-900 flex flex-col h-[100dvh] overflow-hidden">
        {!isLandscape && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
            <div className="flex items-center space-x-3">
              <PenTool className="h-5 w-5 text-emerald-400" />
              <h3 className="text-white font-medium text-lg">{inputLabel || 'Capture Signature'}</h3>
            </div>
            <button
              onClick={() => setShowPad(false)}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={`flex-1 min-h-0 ${isLandscape ? 'p-2' : 'p-4'}`}>
          <SignaturePadCanvas
            onSigned={handleSignedFromPad}
            onClear={handleClearFromPad}
            isLandscape={isLandscape}
            onClose={() => setShowPad(false)}
          />
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <PenTool className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{inputLabel || 'Capture Signature'}</h3>

          <div className="w-full max-w-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Signee Name
              </label>
              <input
                type="text"
                value={signeeName}
                onChange={(e) => setSigneeName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-gray-100 text-base"
                placeholder="Enter full name"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Date & Time
              </label>
              <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 text-sm">
                {currentDateTime}
              </div>
            </div>

            {signatureImage ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Signature
                </label>
                <div className="bg-white border-2 border-emerald-300 dark:border-emerald-600 rounded-lg p-3">
                  <img
                    src={`data:image/png;base64,${signatureImage}`}
                    alt="Captured signature"
                    className="w-full h-auto max-h-32 object-contain"
                  />
                </div>
                <button
                  onClick={() => setShowPad(true)}
                  className="w-full flex items-center justify-center px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Re-sign
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Signature
                </label>
                <button
                  onClick={() => setShowPad(true)}
                  className="w-full flex items-center justify-center px-4 py-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-dashed border-emerald-300 dark:border-emerald-600 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                >
                  <PenTool className="h-5 w-5 mr-2" />
                  Tap to Sign
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        <button
          onClick={onBack || onCancel}
          className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {onBack ? 'Back' : 'Cancel'}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!signeeName.trim() || !signatureImage || isExecuting}
          className="flex items-center px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Submit
        </button>
      </div>
    </>
  );
}
