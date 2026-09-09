import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, X, CheckCircle, AlertCircle, RotateCcw, Info } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { detectDocumentEdges, drawDetectedEdges, resetDetectionState, Point } from '../lib/simpleEdgeDetection';

interface DocumentScannerProps {
  onScanComplete: (pdfFile: File) => void;
  onCancel: () => void;
  documentName: string;
}

export default function DocumentScanner({ onScanComplete, onCancel, documentName }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanner, setScanner] = useState<any>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [detectionQuality, setDetectionQuality] = useState<'good' | 'poor' | 'none'>('none');
  const [opencvReady, setOpencvReady] = useState(false);
  const [isProcessingDetection, setIsProcessingDetection] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [initializationError, setInitializationError] = useState('');
  const [deviceInfo, setDeviceInfo] = useState<string>('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const lastDetectionAttempt = useRef<number>(0);
  const detectionThrottle = 100;
  const [useJsDetection, setUseJsDetection] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<Point[] | null>(null);

  useEffect(() => {
    const info = getDeviceInfo();
    setDeviceInfo(info);
    console.log('[Scanner] Device Info:', info);
    resetDetectionState();
    initializeScanner();

    return () => {
      stopCamera();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      resetDetectionState();
    };
  }, []);

  useEffect(() => {
    if (stream && isDetecting && !animationFrameRef.current) {
      console.log('[Scanner] Stream and detection ready, checking scanner state...');
      console.log('[Scanner] Scanner available:', scanner ? 'Yes' : 'No');
      console.log('[Scanner] useJsDetection:', useJsDetection);
      console.log('[Scanner] fallbackMode:', fallbackMode);

      if (scanner || useJsDetection) {
        console.log('[Scanner] Starting edge detection from useEffect');
        startEdgeDetection();
      } else {
        console.log('[Scanner] No detection method available, running in fallback mode');
      }
    }
  }, [stream, isDetecting, scanner, useJsDetection, fallbackMode]);

  const getDeviceInfo = (): string => {
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isChrome = /Chrome/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);
    const isMobile = /Mobile|Android|iPhone/i.test(ua);

    return `${isAndroid ? 'Android' : isIOS ? 'iOS' : 'Desktop'} | ${isChrome ? 'Chrome' : isSafari ? 'Safari' : 'Other'} | ${isMobile ? 'Mobile' : 'Desktop'}`;
  };

  const initializeScanner = async () => {
    try {
      console.log('[Scanner] Starting initialization...');

      const opencvLoaded = await waitForOpenCV();

      if (!opencvLoaded) {
        console.warn('[Scanner] OpenCV not available, trying JavaScript detection');
        setUseJsDetection(true);
        setInitializationError('Using simplified edge detection');
        startCamera();
        return;
      }

      console.log('[Scanner] OpenCV loaded, initializing jscanify...');
      try {
        const jscanifyModule = await import('jscanify');
        const jscanifyClass = jscanifyModule.default;
        const scannerInstance = new jscanifyClass();

        console.log('[Scanner] jscanify initialized successfully');
        setScanner(scannerInstance);
        setOpencvReady(true);
      } catch (jscanifyErr) {
        console.error('[Scanner] jscanify initialization failed:', jscanifyErr);
        console.log('[Scanner] Falling back to JavaScript detection');
        setUseJsDetection(true);
        setInitializationError('Using simplified edge detection');
      }

      startCamera();
    } catch (err) {
      console.error('[Scanner] Error initializing scanner:', err);
      setUseJsDetection(true);
      setInitializationError('Using simplified edge detection');
      startCamera();
    }
  };

  const waitForOpenCV = (): Promise<boolean> => {
    return new Promise((resolve) => {
      console.log('[Scanner] Checking for OpenCV...');
      console.log('[Scanner] User Agent:', navigator.userAgent);
      console.log('[Scanner] Window.cv exists:', typeof (window as any).cv !== 'undefined');

      if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
        console.log('[Scanner] OpenCV already loaded');
        try {
          const testMat = new (window as any).cv.Mat();
          testMat.delete();
          console.log('[Scanner] OpenCV test successful');
          resolve(true);
        } catch (err) {
          console.error('[Scanner] OpenCV test failed:', err);
          resolve(false);
        }
        return;
      }

      let attempts = 0;
      const maxAttempts = 150;

      const checkInterval = setInterval(() => {
        attempts++;

        if (attempts % 10 === 0) {
          console.log(`[Scanner] Waiting for OpenCV... attempt ${attempts}/${maxAttempts}`);
        }

        if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
          console.log('[Scanner] OpenCV loaded successfully');
          clearInterval(checkInterval);

          try {
            const testMat = new (window as any).cv.Mat();
            testMat.delete();
            console.log('[Scanner] OpenCV functional test passed');
            resolve(true);
          } catch (err) {
            console.error('[Scanner] OpenCV loaded but not functional:', err);
            resolve(false);
          }
        }

        if (attempts >= maxAttempts) {
          console.warn('[Scanner] OpenCV loading timeout - proceeding with fallback');
          console.warn('[Scanner] window.cv status:', typeof (window as any).cv);
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  };

  const startCamera = async () => {
    try {
      console.log('[Scanner] Requesting camera access...');

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      console.log('[Scanner] Camera access granted');

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);

        videoRef.current.onloadedmetadata = () => {
          console.log('[Scanner] Video metadata loaded');
          console.log(`[Scanner] Video dimensions: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);

          if (videoRef.current) {
            videoRef.current.play();
          }

          console.log('[Scanner] Setting isDetecting to true - this will trigger useEffect');
          setIsDetecting(true);
        };
      }
    } catch (err) {
      console.error('[Scanner] Error accessing camera:', err);
      setError('Could not access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsDetecting(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const startEdgeDetection = () => {
    if (animationFrameRef.current) {
      console.log('[Scanner] Edge detection already running, skipping start');
      return;
    }

    console.log('[Scanner] Starting continuous edge detection');
    console.log('[Scanner] Scanner instance:', scanner ? 'Available' : 'Not available');
    console.log('[Scanner] OpenCV available:', typeof (window as any).cv !== 'undefined');
    console.log('[Scanner] JS Detection:', useJsDetection);
    console.log('[Scanner] Detection method:', useJsDetection ? 'JavaScript' : 'OpenCV');

    const detectLoop = () => {
      const now = Date.now();
      if (now - lastDetectionAttempt.current >= detectionThrottle) {
        lastDetectionAttempt.current = now;
        if (useJsDetection) {
          detectDocumentEdgesJS();
        } else {
          detectDocumentEdgesOpenCV();
        }
      }
      animationFrameRef.current = requestAnimationFrame(detectLoop);
    };

    console.log('[Scanner] Initiating detection loop...');
    detectLoop();
  };

  const detectDocumentEdgesJS = useCallback(() => {
    if (!videoRef.current || !overlayCanvasRef.current || !isDetecting || isProcessingDetection) {
      return;
    }

    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    setIsProcessingDetection(true);

    try {
      if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;
        console.log(`[Scanner] Canvas resized to ${overlayCanvas.width}x${overlayCanvas.height}`);
      }

      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      ctx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);

      const result = detectDocumentEdges(overlayCanvas);

      if (result.corners && result.corners.length === 4) {
        setDetectedCorners(result.corners);

        if (result.confidence === 'high') {
          setDetectionQuality('good');
        } else if (result.confidence === 'medium') {
          setDetectionQuality('poor');
        } else {
          setDetectionQuality('none');
        }

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        ctx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);
        drawDetectedEdges(overlayCanvas, result.corners, result.confidence === 'high' ? '#10b981' : '#eab308');
      } else {
        setDetectionQuality('none');
        setDetectedCorners(null);
        drawGridGuide(ctx, overlayCanvas.width, overlayCanvas.height);
      }
    } catch (err) {
      console.error('[Scanner] JS edge detection error:', err);
      setDetectionQuality('none');
    } finally {
      setIsProcessingDetection(false);
    }
  }, [isDetecting, isProcessingDetection]);

  const detectDocumentEdgesOpenCV = useCallback(() => {
    if (!videoRef.current || !overlayCanvasRef.current || !scanner || !isDetecting || isProcessingDetection) {
      return;
    }

    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    setIsProcessingDetection(true);

    let mat: any = null;
    let contour: any = null;

    try {
      const targetWidth = Math.min(video.videoWidth, 1280);
      const targetHeight = Math.min(video.videoHeight, 720);
      const scale = Math.min(targetWidth / video.videoWidth, targetHeight / video.videoHeight);
      const scaledWidth = Math.floor(video.videoWidth * scale);
      const scaledHeight = Math.floor(video.videoHeight * scale);

      if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
        overlayCanvas.width = video.videoWidth;
        overlayCanvas.height = video.videoHeight;
      }

      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      ctx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);

      if (!(window as any).cv || !(window as any).cv.matFromImageData) {
        console.error('[Scanner] OpenCV Mat conversion not available');
        throw new Error('OpenCV Mat conversion not available');
      }

      const processCanvas = document.createElement('canvas');
      processCanvas.width = scaledWidth;
      processCanvas.height = scaledHeight;
      const processCtx = processCanvas.getContext('2d');
      if (!processCtx) throw new Error('Could not create processing context');

      processCtx.drawImage(video, 0, 0, scaledWidth, scaledHeight);

      const imageData = processCtx.getImageData(0, 0, scaledWidth, scaledHeight);

      mat = (window as any).cv.matFromImageData(imageData);

      contour = scanner.findPaperContour(mat);

      if (contour && contour.data32S && contour.data32S.length > 0) {
        const cornerPoints = scanner.getCornerPoints(contour);

        if (cornerPoints.topLeftCorner && cornerPoints.topRightCorner &&
            cornerPoints.bottomLeftCorner && cornerPoints.bottomRightCorner) {

          const corners: Point[] = [
            { x: cornerPoints.topLeftCorner.x / scale, y: cornerPoints.topLeftCorner.y / scale },
            { x: cornerPoints.topRightCorner.x / scale, y: cornerPoints.topRightCorner.y / scale },
            { x: cornerPoints.bottomRightCorner.x / scale, y: cornerPoints.bottomRightCorner.y / scale },
            { x: cornerPoints.bottomLeftCorner.x / scale, y: cornerPoints.bottomLeftCorner.y / scale }
          ];

          setDetectedCorners(corners);

          const area = calculatePolygonArea(corners);
          const canvasArea = overlayCanvas.width * overlayCanvas.height;
          const areaRatio = area / canvasArea;

          if (areaRatio > 0.10 && areaRatio < 0.85) {
            setDetectionQuality('good');
          } else if (areaRatio > 0.05 && areaRatio < 0.95) {
            setDetectionQuality('poor');
          } else {
            setDetectionQuality('none');
          }

          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          ctx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);
          drawManualFrame(ctx, corners, overlayCanvas.width, overlayCanvas.height);
        } else {
          setDetectionQuality('none');
          setDetectedCorners(null);
          drawGridGuide(ctx, overlayCanvas.width, overlayCanvas.height);
        }
      } else {
        setDetectionQuality('none');
        setDetectedCorners(null);
        drawGridGuide(ctx, overlayCanvas.width, overlayCanvas.height);
      }
    } catch (err) {
      console.error('[Scanner] Edge detection error:', err);
      console.error('[Scanner] Error details:', err instanceof Error ? err.message : String(err));

      if (err instanceof Error && err.message.includes('Mat')) {
        console.warn('[Scanner] OpenCV Mat conversion failed, switching to JS detection');
        setUseJsDetection(true);
      }

      setDetectionQuality('none');
    } finally {
      if (contour) {
        try {
          contour.delete();
        } catch (deleteErr) {
          console.warn('[Scanner] Error deleting contour:', deleteErr);
        }
      }
      if (mat) {
        try {
          mat.delete();
        } catch (deleteErr) {
          console.warn('[Scanner] Error deleting Mat:', deleteErr);
        }
      }
      setIsProcessingDetection(false);
    }
  }, [scanner, isDetecting, isProcessingDetection]);

  const drawManualFrame = (ctx: CanvasRenderingContext2D, corners: any[], width: number, height: number) => {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = 0;
    corners.forEach((corner: any) => {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 15, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 15, 0, 2 * Math.PI);
      ctx.stroke();
    });
  };

  const drawGridGuide = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const margin = 50;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(margin, margin, width - (margin * 2), height - (margin * 2));
    ctx.setLineDash([]);
  };

  const calculatePolygonArea = (corners: any[]): number => {
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length;
      area += corners[i].x * corners[j].y;
      area -= corners[j].x * corners[i].y;
    }
    return Math.abs(area / 2);
  };

  const captureDocument = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setProcessing(true);
    setError('');

    let mat: any = null;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Could not get canvas context');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      let imageDataUrl: string;

      if (detectedCorners && detectedCorners.length === 4 && scanner && (window as any).cv) {
        try {
          console.log('[Scanner] Extracting document with detected edges');
          console.log('[Scanner] Detected corners:', detectedCorners);

          const cornerPoints = {
            topLeftCorner: detectedCorners[0],
            topRightCorner: detectedCorners[1],
            bottomRightCorner: detectedCorners[2],
            bottomLeftCorner: detectedCorners[3]
          };

          const width = Math.max(
            Math.hypot(cornerPoints.topRightCorner.x - cornerPoints.topLeftCorner.x,
                       cornerPoints.topRightCorner.y - cornerPoints.topLeftCorner.y),
            Math.hypot(cornerPoints.bottomRightCorner.x - cornerPoints.bottomLeftCorner.x,
                       cornerPoints.bottomRightCorner.y - cornerPoints.bottomLeftCorner.y)
          );

          const height = Math.max(
            Math.hypot(cornerPoints.bottomLeftCorner.x - cornerPoints.topLeftCorner.x,
                       cornerPoints.bottomLeftCorner.y - cornerPoints.topLeftCorner.y),
            Math.hypot(cornerPoints.bottomRightCorner.x - cornerPoints.topRightCorner.x,
                       cornerPoints.bottomRightCorner.y - cornerPoints.topRightCorner.y)
          );

          console.log(`[Scanner] Calculated document dimensions: ${width.toFixed(0)}x${height.toFixed(0)}`);

          const extractedCanvas = scanner.extractPaper(canvas, Math.round(width), Math.round(height), cornerPoints);

          if (extractedCanvas) {
            imageDataUrl = extractedCanvas.toDataURL('image/jpeg', 0.95);
            console.log('[Scanner] Document extracted and cropped successfully');
          } else {
            console.log('[Scanner] extractPaper returned null, using full frame');
            imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          }
        } catch (extractErr) {
          console.error('[Scanner] Error extracting document:', extractErr);
          console.log('[Scanner] Falling back to full frame capture');
          imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        }
      } else {
        console.log('[Scanner] No edges detected or scanner not available, capturing full frame');
        imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      }

      setCapturedImage(imageDataUrl);
      stopCamera();
      setProcessing(false);
    } catch (err) {
      console.error('[Scanner] Error capturing document:', err);
      setError('Failed to capture document. Please try again.');
      setProcessing(false);
    } finally {
      if (mat) {
        try {
          mat.delete();
        } catch (deleteErr) {
          console.warn('[Scanner] Error deleting Mat during capture:', deleteErr);
        }
      }
    }
  };

  const convertToPdf = async (): Promise<File> => {
    if (!capturedImage) throw new Error('No captured image');

    setProcessing(true);

    try {
      const imageBytes = await fetch(capturedImage).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.create();

      const img = await pdfDoc.embedJpg(imageBytes);
      const imgDims = img.scale(1);

      const page = pdfDoc.addPage([imgDims.width, imgDims.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: imgDims.width,
        height: imgDims.height,
      });

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], `${documentName}.pdf`, { type: 'application/pdf' });

      return pdfFile;
    } catch (err) {
      console.error('Error converting to PDF:', err);
      throw new Error('Failed to convert to PDF');
    }
  };

  const handleConfirmScan = async () => {
    try {
      const pdfFile = await convertToPdf();
      onScanComplete(pdfFile);
    } catch (err) {
      setError('Failed to process document. Please try again.');
      setProcessing(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setError('');
    startCamera();
  };

  if (capturedImage) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <img
            src={capturedImage}
            alt="Scanned document"
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {error && (
          <div className="absolute top-4 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="p-4 bg-gray-900 space-y-3">
          <button
            onClick={handleConfirmScan}
            disabled={processing}
            className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {processing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-6 w-6" />
                <span>Use This Scan</span>
              </>
            )}
          </button>
          <button
            onClick={handleRetake}
            disabled={processing}
            className="w-full bg-gray-700 text-white py-4 rounded-lg font-semibold text-lg hover:bg-gray-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <RotateCcw className="h-6 w-6" />
            <span>Retake</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {error && (
          <div className="absolute top-4 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
          <div className="flex flex-col space-y-2">
            {!fallbackMode && (
              <div className={`px-4 py-2 rounded-lg font-semibold ${
                detectionQuality === 'good' ? 'bg-green-600 text-white' :
                detectionQuality === 'poor' ? 'bg-yellow-600 text-white' :
                'bg-gray-800 text-white'
              }`}>
                {detectionQuality === 'good' && 'Document Detected'}
                {detectionQuality === 'poor' && 'Adjust Position'}
                {detectionQuality === 'none' && 'Position Document'}
              </div>
            )}
            {initializationError && (
              <div className="px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white text-sm">
                {initializationError}
              </div>
            )}
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="bg-gray-800 bg-opacity-75 text-white px-3 py-1 rounded-lg text-xs hover:bg-opacity-100 transition-all flex items-center space-x-1"
            >
              <Info className="h-3 w-3" />
              <span>Debug</span>
            </button>
            {showDiagnostics && (
              <div className="bg-black bg-opacity-90 text-white text-xs p-3 rounded-lg space-y-1 max-w-xs">
                <div><strong>Device:</strong> {deviceInfo}</div>
                <div><strong>OpenCV:</strong> {typeof (window as any).cv !== 'undefined' ? 'Loaded' : 'Not loaded'}</div>
                <div><strong>Scanner:</strong> {scanner ? 'Ready' : 'Not ready'}</div>
                <div><strong>JS Detection:</strong> {useJsDetection ? 'Active' : 'Inactive'}</div>
                <div><strong>Fallback:</strong> {fallbackMode ? 'Yes' : 'No'}</div>
                <div><strong>Video:</strong> {videoRef.current?.videoWidth}x{videoRef.current?.videoHeight}</div>
                <div><strong>Detection:</strong> {detectionQuality}</div>
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            className="bg-gray-800 bg-opacity-75 text-white p-2 rounded-lg hover:bg-opacity-100 transition-all"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 text-white text-center px-4 max-w-md">
          <p className="text-sm bg-gray-900 bg-opacity-75 px-4 py-2 rounded-lg">
            {fallbackMode
              ? 'Position the document within the frame and tap Capture.'
              : useJsDetection
              ? 'Position the document within the frame. Edges will be highlighted when detected.'
              : 'Position the document within the frame. Edges will be highlighted when detected.'}
          </p>
        </div>
      </div>

      <div className="p-4 bg-gray-900">
        <button
          onClick={captureDocument}
          disabled={processing}
          className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {processing ? (
            <>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span>Capture Document</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
