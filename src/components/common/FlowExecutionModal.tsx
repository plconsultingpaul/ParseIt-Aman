import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, ChevronLeft, Loader2, AlertCircle, CheckCircle, Check, HelpCircle, LogOut, RotateCcw, Plus, ExternalLink, ScanBarcode, Phone, Camera, Delete, Info, Trash2 } from 'lucide-react';
import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector/pure';
import { supabase, getAuthHeaders } from '../../lib/supabase';
import { TextField, NumberField, DateField, DateTimeField, PhoneField, ZipField, PostalCodeField, ProvinceField, StateField, DropdownField, TimeField } from '../form-fields';
import ApiLookupDropdown from '../form-fields/ApiLookupDropdown';
import SignaturePadModal from './SignaturePadModal';
import CustomDropdown from './CustomDropdown';
import { type FlowLanguage, FLOW_LANGUAGES, t, detectBrowserLanguage } from '../../lib/flowTranslations';

export interface ExecuteButtonGroup {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isArrayGroup: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  arrayFieldName: string;
  translations?: { fr?: { name?: string; description?: string }; es?: { name?: string; description?: string } };
}

export interface ExecuteButtonField {
  id: string;
  groupId: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  isRequired?: boolean;
  defaultValue?: string | null;
  options?: any[];
  dropdownDisplayMode?: 'description_only' | 'value_and_description';
  sortOrder?: number;
  placeholder?: string | null;
  helpText?: string | null;
  maxLength?: number | null;
  timeInputOnly?: boolean;
  conditionalRequiredFieldId?: string | null;
  conditionalRequiredOperator?: string | null;
  conditionalRequiredValue?: string | null;
  translations?: Record<string, { name?: string; placeholder?: string; helpText?: string }> | null;
  apiLookupEndpoint?: string | null;
  apiLookupSecondaryApiId?: string | null;
  apiLookupHttpMethod?: string | null;
  apiLookupSearchParam?: string | null;
  apiLookupValueField?: string | null;
  apiLookupDisplayColumns?: { field: string; label: string }[] | null;
  apiLookupFieldMappings?: { responseField: string; targetFieldName: string }[] | null;
  apiLookupRequestBody?: string | null;
  apiLookupRequestBodyMappings?: { fieldName: string; type: 'hardcoded' | 'variable' | 'search'; value: string; dataType?: string }[] | null;
  apiLookupWrapBodyInArray?: boolean;
}

export interface FlowNodeMapping {
  nodeId: string;
  groupId: string;
  fieldMappings: Record<string, { variablePath: string; applyCondition: string }>;
  headerContent?: string;
  displayWithPrevious?: boolean;
  headerCurrentLoopItemOnly?: boolean;
}

interface StepResult {
  node?: string;
  step?: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  requestUrl?: string;
  requestBody?: string;
  httpMethod?: string;
}

interface FlowExecutionModalProps {
  buttonId: string;
  buttonName: string;
  groups: ExecuteButtonGroup[];
  fields: ExecuteButtonField[];
  flowNodeMappings: FlowNodeMapping[];
  onClose: () => void;
  title?: string;
  userId?: string;
  hasWorkflowNodes?: boolean;
}

function NumberPadUI({ onSubmit, onCancel, onBack, inputLabel, responseMessage, isExecuting, lang = 'en' }: { onSubmit: (val: string) => void; onCancel: () => void; onBack?: () => void; inputLabel: string; responseMessage?: string; isExecuting: boolean; lang?: FlowLanguage }) {
  const [value, setValue] = useState('');

  const handleKey = (key: string) => {
    if (key === 'backspace') {
      setValue(prev => prev.slice(0, -1));
    } else if (key === '+') {
      if (value === '') setValue('+');
    } else {
      setValue(prev => prev + key);
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', 'backspace'];

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <Phone className="h-8 w-8 text-sky-600 dark:text-sky-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{inputLabel}</h3>
          {responseMessage && (
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center whitespace-pre-wrap max-w-md -mt-2">{responseMessage}</p>
          )}

          <div className="w-full max-w-xs">
            <div className="text-center text-2xl font-mono tracking-wider bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 mb-4 min-h-[52px] text-gray-900 dark:text-gray-100">
              {value || <span className="text-gray-400">---</span>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {keys.map((key) => (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  className={`h-14 rounded-lg text-lg font-medium transition-all active:scale-95 ${
                    key === 'backspace'
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                      : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {key === 'backspace' ? <Delete className="h-5 w-5 mx-auto" /> : key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        <button
          onClick={onBack || onCancel}
          className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {onBack ? t('back', lang) : t('cancel', lang)}
        </button>
        <button
          onClick={() => onSubmit(value)}
          disabled={!value || isExecuting}
          className="flex items-center px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('submit', lang)}
        </button>
      </div>
    </>
  );
}

function BarcodeScannerUI({ onSubmit, onCancel, onBack, inputLabel, responseMessage, isExecuting, allowMultipleScans = false, lang = 'en' }: { onSubmit: (val: string) => void; onCancel: () => void; onBack?: () => void; inputLabel: string; responseMessage?: string; isExecuting: boolean; allowMultipleScans?: boolean; lang?: FlowLanguage }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedValue, setScannedValue] = useState('');
  const [scannedValues, setScannedValues] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [manualEntry, setManualEntry] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const detectedByCameraRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    setScannedValue('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      setScanning(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError(t('camera_denied', lang));
      } else {
        setError(t('camera_error', lang));
      }
      setManualEntry(true);
    }
  }, [lang]);

  useEffect(() => {
    if (!scanning || !streamRef.current) return;

    const attachStream = async () => {
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        try {
          await videoRef.current.play();
        } catch {
          setError(t('video_error', lang));
          setManualEntry(true);
          stopCamera();
          return;
        }
      }

      const DetectorClass = ('BarcodeDetector' in window)
        ? (window as any).BarcodeDetector
        : BarcodeDetectorPolyfill;

      try {
        const detector = new DetectorClass({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e', 'itf', 'codabar']
        });

        scanIntervalRef.current = window.setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const detectedValue = barcodes[0].rawValue;
                detectedByCameraRef.current = true;
                setScannedValue(detectedValue);
                stopCamera();
              }
            } catch {}
          }
        }, 250);
      } catch {
        setError(t('barcode_not_supported', lang));
        setManualEntry(true);
        stopCamera();
      }
    };

    attachStream();
  }, [scanning, stopCamera, lang]);

  useEffect(() => {
    if (detectedByCameraRef.current && scannedValue && !isExecuting) {
      detectedByCameraRef.current = false;
      if (allowMultipleScans) {
        setScannedValues(prev => [...prev, scannedValue]);
        setScannedValue('');
      } else {
        onSubmit(scannedValue);
      }
    }
  }, [scannedValue, isExecuting, onSubmit, allowMultipleScans]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleMultiScanAdd = () => {
    if (scannedValue) {
      setScannedValues(prev => [...prev, scannedValue]);
      setScannedValue('');
    }
  };

  const handleMultiScanSubmit = () => {
    if (allowMultipleScans) {
      const allValues = scannedValue ? [...scannedValues, scannedValue] : scannedValues;
      if (allValues.length > 0) {
        onSubmit(JSON.stringify(allValues));
      }
    } else {
      onSubmit(scannedValue);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <ScanBarcode className="h-8 w-8 text-sky-600 dark:text-sky-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{inputLabel}</h3>
          {responseMessage && (
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center whitespace-pre-wrap max-w-md -mt-2">{responseMessage}</p>
          )}

          {error && (
            <div className="w-full p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {allowMultipleScans && scannedValues.length > 0 && (
            <div className="w-full max-w-sm">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Scanned ({scannedValues.length})
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {scannedValues.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm font-mono bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-green-800 dark:text-green-200">
                    <span className="text-xs text-green-500 dark:text-green-400 font-sans w-5 shrink-0">{idx + 1}.</span>
                    <span className="flex-1 truncate">{val}</span>
                    <button
                      onClick={() => setScannedValues(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 dark:hover:text-red-300 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!scanning && !scannedValue && (
            <button
              onClick={startCamera}
              className="flex items-center space-x-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
            >
              <Camera className="h-5 w-5" />
              <span>{allowMultipleScans && scannedValues.length > 0 ? t('scan_another', lang) : t('open_camera', lang)}</span>
            </button>
          )}

          {scanning && (
            <div className="w-full max-w-sm flex flex-col items-center gap-2">
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border-2 border-sky-400">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-3/4 h-1/3 border-2 border-sky-400 rounded-lg opacity-60" />
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t('point_camera_at_barcode', lang)}
              </p>
              <button
                onClick={stopCamera}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('stop_camera', lang)}
              </button>
            </div>
          )}

          {scannedValue && !allowMultipleScans && (
            <div className="w-full max-w-sm">
              <div className="text-center text-xl font-mono bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-green-800 dark:text-green-200">
                {scannedValue}
              </div>
              <button
                onClick={() => { setScannedValue(''); startCamera(); }}
                className="mt-2 w-full text-sm text-sky-600 dark:text-sky-400 hover:underline"
              >
                {t('scan_again', lang)}
              </button>
            </div>
          )}

          {!scanning && (
            <div className="w-full max-w-sm mt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('manual_entry', lang)}</label>
              <div className={allowMultipleScans ? 'flex gap-2' : ''}>
                <input
                  type="text"
                  value={scannedValue}
                  onChange={(e) => setScannedValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && scannedValue && !isExecuting) {
                      e.preventDefault();
                      if (allowMultipleScans) {
                        handleMultiScanAdd();
                      } else {
                        onSubmit(scannedValue);
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:text-gray-100"
                  placeholder={t('enter_barcode_value', lang)}
                  autoFocus
                />
                {allowMultipleScans && (
                  <button
                    onClick={handleMultiScanAdd}
                    disabled={!scannedValue}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        <button
          onClick={() => { stopCamera(); (onBack || onCancel)(); }}
          className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {onBack ? t('back', lang) : t('cancel', lang)}
        </button>
        <button
          onClick={handleMultiScanSubmit}
          disabled={allowMultipleScans ? (scannedValues.length === 0 && !scannedValue) || isExecuting : !scannedValue || isExecuting}
          className="flex items-center px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('submit', lang)}
        </button>
      </div>
    </>
  );
}

function CameraCaptureUI({ onSubmit, onCancel, onBack, inputLabel, responseMessage, isExecuting, lang = 'en' }: { onSubmit: (val: string) => void; onCancel: () => void; onBack?: () => void; inputLabel: string; responseMessage?: string; isExecuting: boolean; lang?: FlowLanguage }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [capturedImages, setCapturedImages] = useState<{ imageData: string; timestamp: string }[]>([]);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      setStreaming(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError(t('camera_denied_photo', lang));
      } else {
        setError(t('camera_generic_error', lang));
      }
    }
  }, [lang]);

  useEffect(() => {
    if (!streaming || !streamRef.current) return;
    const attachStream = async () => {
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        try {
          await videoRef.current.play();
        } catch {
          setError(t('video_generic_error', lang));
          stopCamera();
        }
      }
    };
    attachStream();
  }, [streaming, stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImages(prev => [...prev, { imageData: dataUrl, timestamp: new Date().toISOString() }]);
    }
  };

  const removePhoto = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (capturedImages.length === 0) return;
    if (capturedImages.length === 1) {
      onSubmit(JSON.stringify(capturedImages[0]));
    } else {
      onSubmit(JSON.stringify({
        imageData: capturedImages[0].imageData,
        timestamp: capturedImages[0].timestamp,
        images: capturedImages,
        count: capturedImages.length,
      }));
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <Camera className="h-8 w-8 text-sky-600 dark:text-sky-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{inputLabel}</h3>
          {responseMessage && (
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center whitespace-pre-wrap max-w-md -mt-2">{responseMessage}</p>
          )}

          {error && (
            <div className="w-full p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {capturedImages.length > 0 && (
            <div className="w-full max-w-sm space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('photos_taken', lang)}: {capturedImages.length}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {capturedImages.map((img, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border-2 border-green-400">
                    <img src={img.imageData} alt={`Photo ${idx + 1}`} className="w-full h-auto" />
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
                      {idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!streaming && (
            <button
              onClick={startCamera}
              className="flex items-center space-x-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
            >
              <Camera className="h-5 w-5" />
              <span>{capturedImages.length > 0 ? t('take_another_photo', lang) : t('open_camera', lang)}</span>
            </button>
          )}

          {streaming && (
            <div className="w-full max-w-sm flex flex-col items-center gap-3">
              <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border-2 border-sky-400">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
              </div>
              <button
                onClick={takePhoto}
                className="w-16 h-16 rounded-full bg-white border-4 border-sky-500 hover:border-sky-600 transition-colors flex items-center justify-center shadow-lg"
              >
                <div className="w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-600 transition-colors" />
              </button>
              <button
                onClick={stopCamera}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                {t('stop_camera', lang)}
              </button>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        <button
          onClick={() => { stopCamera(); (onBack || onCancel)(); }}
          className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {onBack ? t('back', lang) : t('cancel', lang)}
        </button>
        <button
          onClick={handleSubmit}
          disabled={capturedImages.length === 0 || isExecuting}
          className="flex items-center px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t('submit', lang)}
        </button>
      </div>
    </>
  );
}

function UserInputUI({ inputType, inputLabel, responseMessage, isExecuting, onSubmit, onCancel, onBack, lang = 'en', allowMultipleScans, signaturePopupEnabled, signaturePopupText, signaturePopupAcknowledged, onAcknowledgePopup }: { inputType: 'barcode_scanner' | 'number_pad' | 'signature_capture' | 'camera_capture'; inputLabel: string; responseMessage?: string; isExecuting: boolean; onSubmit: (val: string) => void; onCancel: () => void; onBack?: () => void; lang?: FlowLanguage; allowMultipleScans?: boolean; signaturePopupEnabled?: boolean; signaturePopupText?: string; signaturePopupAcknowledged?: boolean; onAcknowledgePopup?: () => void }) {
  if (inputType === 'number_pad') {
    return <NumberPadUI onSubmit={onSubmit} onCancel={onCancel} onBack={onBack} inputLabel={inputLabel} responseMessage={responseMessage} isExecuting={isExecuting} lang={lang} />;
  }
  if (inputType === 'signature_capture') {
    if (signaturePopupEnabled && signaturePopupText && !signaturePopupAcknowledged) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notice</h3>
            </div>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-6">{signaturePopupText}</p>
            <button
              onClick={onAcknowledgePopup}
              className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      );
    }
    return (
      <SignaturePadModal
        inputLabel={inputLabel}
        isExecuting={isExecuting}
        onSubmit={(data) => onSubmit(JSON.stringify(data))}
        onCancel={onCancel}
        onBack={onBack}
      />
    );
  }
  if (inputType === 'camera_capture') {
    return <CameraCaptureUI onSubmit={onSubmit} onCancel={onCancel} onBack={onBack} inputLabel={inputLabel} responseMessage={responseMessage} isExecuting={isExecuting} lang={lang} />;
  }
  return <BarcodeScannerUI onSubmit={onSubmit} onCancel={onCancel} onBack={onBack} inputLabel={inputLabel} responseMessage={responseMessage} isExecuting={isExecuting} allowMultipleScans={allowMultipleScans} lang={lang} />;
}

function renderSimpleMarkdown(md: string): string {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><h([123])>/g, '<h$1>');
  html = html.replace(/<\/h([123])><\/p>/g, '</h$1>');
  html = html.replace(/<p><ul>/g, '<ul>');
  html = html.replace(/<\/ul><\/p>/g, '</ul>');
  html = html.replace(/<p><\/p>/g, '');
  return html;
}

function combineTimeWithToday(timeStr: string): string {
  if (!timeStr) return '';
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function renderFormattedMessage(message: string): React.ReactNode {
  const lines = message.split('\n');
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    while (remaining.length > 0) {
      const patterns = [
        { regex: /\*\*(.+?)\*\*/, render: (text: string, key: number) => <strong key={key}>{text}</strong> },
        { regex: /__(.+?)__/, render: (text: string, key: number) => <u key={key}>{text}</u> },
        { regex: /==(.+?)==/, render: (text: string, key: number) => <mark key={key} className="bg-yellow-200 dark:bg-yellow-600 px-0.5 rounded">{text}</mark> },
        { regex: /##(.+?)##/, render: (text: string, key: number) => <span key={key} className="text-lg font-medium">{text}</span> },
      ];

      let earliestMatch: { index: number; length: number; node: React.ReactNode } | null = null;

      for (const pattern of patterns) {
        const match = remaining.match(pattern.regex);
        if (match && match.index !== undefined) {
          if (!earliestMatch || match.index < earliestMatch.index) {
            earliestMatch = {
              index: match.index,
              length: match[0].length,
              node: pattern.render(match[1], keyIndex++),
            };
          }
        }
      }

      if (earliestMatch) {
        if (earliestMatch.index > 0) {
          parts.push(<React.Fragment key={keyIndex++}>{remaining.slice(0, earliestMatch.index)}</React.Fragment>);
        }
        parts.push(earliestMatch.node);
        remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
      } else {
        parts.push(<React.Fragment key={keyIndex++}>{remaining}</React.Fragment>);
        remaining = '';
      }
    }

    return (
      <React.Fragment key={lineIndex}>
        {parts}
        {lineIndex < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function FlowExecutionModal({
  buttonId,
  buttonName,
  groups,
  fields,
  flowNodeMappings,
  onClose,
  title,
  userId = 'user',
  hasWorkflowNodes = false
}: FlowExecutionModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [arrayData, setArrayData] = useState<Record<string, Record<string, any>[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [executionResults, setExecutionResults] = useState<{
    success: boolean;
    results: StepResult[];
    error?: string;
    contextData?: any;
    message?: string;
  } | null>(null);
  const [confirmationPrompt, setConfirmationPrompt] = useState<{
    promptMessage: string;
    yesButtonLabel: string;
    noButtonLabel: string;
    options: Array<{ label: string }>;
    pendingContextData: any;
    showLocationMap?: boolean;
    latitude?: number | null;
    longitude?: number | null;
    imageSource?: string;
    customImageUrl?: string;
    imageMaxHeight?: number;
  } | null>(null);
  const [userInputPrompt, setUserInputPrompt] = useState<{
    inputType: 'barcode_scanner' | 'number_pad' | 'signature_capture' | 'camera_capture';
    inputLabel: string;
    userResponseMessage?: string;
    variableName: string;
    pendingContextData: any;
    translations?: { fr?: { inputLabel?: string }; es?: { inputLabel?: string } };
    allowMultipleScans?: boolean;
    signaturePopupEnabled?: boolean;
    signaturePopupText?: string;
  } | null>(null);
  const [signaturePopupAcknowledged, setSignaturePopupAcknowledged] = useState(false);
  const [userSelectionPrompt, setUserSelectionPrompt] = useState<{
    nodeId: string;
    promptText: string;
    itemVariable: string;
    options: Array<{ idx: number; item: any; label: string }>;
    pendingContextData: any;
  } | null>(null);
  const [userSelectionSubmitting, setUserSelectionSubmitting] = useState(false);
  const [exitData, setExitData] = useState<{
    exitMessage: string;
    showRestartButton: boolean;
    imageSource: string;
    customImageUrl: string;
    imageMaxHeight: number;
    translations?: { fr?: { exitMessage?: string }; es?: { exitMessage?: string } };
  } | null>(null);
  const [promptHistory, setPromptHistory] = useState<Array<{
    type: 'confirmation' | 'userInput' | 'userInformation';
    data: any;
    stepPathSnapshot: typeof stepPath;
    currentStepSnapshot: number;
    formDataSnapshot: Record<string, any>;
  }>>([]);
  const [userInformationData, setUserInformationData] = useState<{
    contentMarkdown: string;
    continueButtonLabel: string;
    imageSource: string;
    customImageUrl: string;
    imageMaxHeight: number;
    contentAlignment: 'left' | 'center' | 'right';
    pendingContextData: any;
    enableLanguageSelection?: boolean;
    enabledLanguages?: string[];
    translations?: {
      fr?: { contentMarkdown?: string; continueButtonLabel?: string };
      es?: { contentMarkdown?: string; continueButtonLabel?: string };
    };
  } | null>(null);
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [contextData, setContextData] = useState<any>(null);
  const [stepPath, setStepPath] = useState<ExecuteButtonGroup[][]>([]);
  const [flowLanguage, setFlowLanguage] = useState<FlowLanguage>(detectBrowserLanguage());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('company_branding')
        .select('logo_url')
        .maybeSingle();
      if (data?.logo_url) {
        setBrandingLogoUrl(data.logo_url);
      }
    })();
  }, []);

  const getCombinedStepForGroup = useCallback((groupId: string): ExecuteButtonGroup[] => {
    console.log('[getCombinedStepForGroup] Looking for groupId:', groupId);
    console.log('[getCombinedStepForGroup] Available groups:', groups.map(g => ({ id: g.id, name: g.name })));
    const groupIndex = groups.findIndex(g => g.id === groupId);
    console.log('[getCombinedStepForGroup] groupIndex:', groupIndex);
    if (groupIndex === -1) {
      console.warn('[getCombinedStepForGroup] GROUP NOT FOUND - groupId:', groupId, 'does not match any group in:', groups.map(g => g.id));
      return [];
    }

    const result: ExecuteButtonGroup[] = [groups[groupIndex]];

    for (let i = groupIndex + 1; i < groups.length; i++) {
      const nodeMapping = flowNodeMappings.find(m => m.groupId === groups[i].id);
      if (nodeMapping?.displayWithPrevious) {
        result.push(groups[i]);
      } else {
        break;
      }
    }

    console.log('[getCombinedStepForGroup] Result groups:', result.map(g => ({ id: g.id, name: g.name })));
    return result;
  }, [groups, flowNodeMappings]);

  const currentStepGroups = stepPath[currentStep] || [];
  const totalSteps = stepPath.length;
  const canGoBack = currentStep > 0 || promptHistory.length > 0;
  const isFirstStep = !canGoBack;
  const isLastStep = currentStep === totalSteps - 1;

  const resolveVariable = useCallback((template: string, ctx: any): string => {
    if (!template || typeof template !== 'string' || !ctx) return template;

    const ctxLoopIdx = ctx?.forEach?._index;
    const resolvePathValue = (pathStr: string): any => {
      let effective = pathStr.trim();
      effective = effective.replace(/\[([^\]]+)\]/g, '.$1');
      if (typeof ctxLoopIdx === 'number') {
        effective = effective.replace(/@loopIndex/g, String(ctxLoopIdx));
      }
      const parts = effective.split('.').filter(p => p.length > 0);
      let value: any = ctx;
      for (const part of parts) {
        if (value == null) return undefined;
        if (typeof value === 'object' && !Array.isArray(value) && part in value) {
          value = value[part];
        } else if (Array.isArray(value) && /^\d+$/.test(part)) {
          value = value[Number(part)];
        } else if (typeof value === 'object' && part in (value as any)) {
          value = (value as any)[part];
        } else {
          return undefined;
        }
      }
      return value;
    };

    const lines = template.split('\n');
    const resolvedLines: string[] = [];

    // When rendering inside an active For Each iteration, an array variable that
    // contains the current loop item should collapse to that single item rather
    // than expanding into one line per element.
    const forEachCtx = ctx.forEach && typeof ctx.forEach === 'object' ? ctx.forEach : null;
    const currentLoopItem = forEachCtx
      ? Object.entries(forEachCtx).find(([k]) => !k.startsWith('_'))?.[1]
      : undefined;

    for (const line of lines) {
      const varMatches = [...line.matchAll(/\{\{([^}]+)\}\}/g)];
      const arrayVar = varMatches.find(m => {
        const val = resolvePathValue(m[1]);
        if (!Array.isArray(val)) return false;
        if (currentLoopItem !== undefined && val.includes(currentLoopItem)) return false;
        return true;
      });

      if (arrayVar) {
        const arrayValues = resolvePathValue(arrayVar[1]) as any[];
        for (const item of arrayValues) {
          let expandedLine = line;
          expandedLine = expandedLine.replace(new RegExp(`\\{\\{\\s*${arrayVar[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`), String(item));
          expandedLine = expandedLine.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const val = resolvePathValue(path);
            if (val === undefined || val === null) return match;
            if (Array.isArray(val)) return val.join(', ');
            return String(val);
          });
          resolvedLines.push(expandedLine);
        }
      } else {
        resolvedLines.push(line.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
          const val = resolvePathValue(path);
          if (val === undefined || val === null) return match;
          if (Array.isArray(val) && currentLoopItem !== undefined && val.includes(currentLoopItem)) {
            return String(currentLoopItem);
          }
          return String(val);
        }));
      }
    }

    return resolvedLines.join('\n');
  }, []);

  useEffect(() => {
    if (groups.length > 0 && stepPath.length === 0 && !hasWorkflowNodes) {
      console.log('[FlowExecutionModal] Initializing first step - groups:', groups.map(g => ({ id: g.id, name: g.name })));
      console.log('[FlowExecutionModal] First group (groups[0]):', { id: groups[0].id, name: groups[0].name });
      console.log('[FlowExecutionModal] flowNodeMappings:', flowNodeMappings.map(m => ({ nodeId: m.nodeId, groupId: m.groupId, displayWithPrevious: m.displayWithPrevious })));
      const firstStep = getCombinedStepForGroup(groups[0].id);
      console.log('[FlowExecutionModal] firstStep combined groups:', firstStep.map(g => ({ id: g.id, name: g.name })));
      if (firstStep.length > 0) {
        setStepPath([firstStep]);
      }
    }
  }, [groups, stepPath.length, getCombinedStepForGroup, hasWorkflowNodes]);

  const autoExecuteTriggeredRef = useRef(false);
  useEffect(() => {
    if (hasWorkflowNodes && !autoExecuteTriggeredRef.current && !isExecuting && !executionComplete) {
      console.log('[FlowExecutionModal] Auto-executing workflow nodes - hasWorkflowNodes:', hasWorkflowNodes);
      autoExecuteTriggeredRef.current = true;
      handleExecute();
    }
  }, [hasWorkflowNodes, isExecuting, executionComplete]);

  useEffect(() => {
    const initialData: Record<string, any> = {};
    const initialArrayData: Record<string, Record<string, any>[]> = {};

    groups.forEach(group => {
      if (group.isArrayGroup && group.arrayFieldName) {
        const groupFields = fields.filter(f => f.groupId === group.id);
        const initialRows: Record<string, any>[] = [];
        for (let i = 0; i < group.arrayMinRows; i++) {
          const row: Record<string, any> = {};
          groupFields.forEach(field => {
            if (field.defaultValue) {
              row[field.fieldKey] = field.defaultValue;
            } else if (field.fieldType === 'checkbox') {
              row[field.fieldKey] = 'False';
            } else {
              row[field.fieldKey] = '';
            }
          });
          initialRows.push(row);
        }
        initialArrayData[group.arrayFieldName] = initialRows;
      }
    });

    fields.forEach(field => {
      const group = groups.find(g => g.id === field.groupId);
      if (group?.isArrayGroup) return;

      if (field.defaultValue) {
        initialData[field.fieldKey] = field.defaultValue;
      } else if (field.fieldType === 'checkbox') {
        initialData[field.fieldKey] = 'False';
      }
    });

    setFormData(initialData);
    setArrayData(initialArrayData);
  }, [fields, groups]);

  const applyFieldMappings = useCallback((groupId: string, ctx: any, edgeHandleTaken?: string) => {
    const nodeMapping = flowNodeMappings.find(m => m.groupId === groupId);

    if (!nodeMapping || !nodeMapping.fieldMappings || Object.keys(nodeMapping.fieldMappings).length === 0) {
      return;
    }

    const newFormData: Record<string, any> = {};
    let hasChanges = false;

    Object.entries(nodeMapping.fieldMappings).forEach(([fieldKey, mapping]) => {
      const variablePath = typeof mapping === 'string' ? mapping : mapping.variablePath;
      const applyCondition = typeof mapping === 'string' ? 'always' : (mapping.applyCondition || 'always');

      const shouldApply =
        applyCondition === 'always' ||
        (applyCondition === 'on_success' && edgeHandleTaken === 'success') ||
        (applyCondition === 'on_failure' && edgeHandleTaken === 'failure');

      if (!shouldApply) {
        return;
      }

      if (variablePath && ctx) {
        const parts = variablePath.split('.');
        let value: any = ctx;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = undefined;
            break;
          }
        }
        if (value !== undefined && value !== null) {
          newFormData[fieldKey] = Array.isArray(value) ? value.join(', ') : String(value);
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setFormData(prev => ({ ...prev, ...newFormData }));
    }
  }, [flowNodeMappings]);

  useEffect(() => {
    if (currentStepGroups.length > 0 && contextData) {
      const edgeHandleTaken = contextData.lastEdgeHandle || contextData.edgeHandleTaken;
      currentStepGroups.forEach(group => {
        applyFieldMappings(group.id, contextData, edgeHandleTaken);
      });
    }
  }, [currentStep, currentStepGroups, contextData, applyFieldMappings]);

  const checkConditionalRequired = (field: ExecuteButtonField, allFieldValues: Record<string, any>): boolean => {
    if (!field.conditionalRequiredFieldId || !field.conditionalRequiredOperator) return false;
    const depField = fields.find(f => f.id === field.conditionalRequiredFieldId);
    if (!depField) return false;
    const depValue = allFieldValues[depField.fieldKey];
    const hasValue = depValue !== undefined && depValue !== null && depValue !== '';
    switch (field.conditionalRequiredOperator) {
      case 'not_null': return hasValue;
      case 'null': return !hasValue;
      case 'starts_with': return hasValue && typeof depValue === 'string' && depValue.startsWith(field.conditionalRequiredValue || '');
      case 'contains': return hasValue && typeof depValue === 'string' && depValue.includes(field.conditionalRequiredValue || '');
      default: return false;
    }
  };

  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    currentStepGroups.forEach(group => {
      const groupFields = fields.filter(f => f.groupId === group.id);

      if (group.isArrayGroup && group.arrayFieldName) {
        const rows = arrayData[group.arrayFieldName] || [];
        rows.forEach((row, rowIndex) => {
          groupFields.forEach(field => {
            const value = row[field.fieldKey];
            const errorKey = `${group.arrayFieldName}[${rowIndex}].${field.fieldKey}`;

            const isEffectivelyRequired = field.isRequired || checkConditionalRequired(field, row);
            if (isEffectivelyRequired) {
              if (value === undefined || value === null || value === '') {
                const resolvedFieldName = (flowLanguage !== 'en' && field.translations?.[flowLanguage]?.name) || field.name;
                newErrors[errorKey] = `${resolvedFieldName} ${t('is_required', flowLanguage)}`;
                return;
              }
            }

            if (field.fieldType === 'email' && value) {
              if (!emailRegex.test(value)) {
                newErrors[errorKey] = t('valid_email', flowLanguage);
              }
            }
          });
        });
      } else {
        groupFields.forEach(field => {
          const value = formData[field.fieldKey];

          const isEffectivelyRequired = field.isRequired || checkConditionalRequired(field, formData);
          if (isEffectivelyRequired) {
            if (value === undefined || value === null || value === '') {
              const resolvedFieldName = (flowLanguage !== 'en' && field.translations?.[flowLanguage]?.name) || field.name;
              newErrors[field.fieldKey] = `${resolvedFieldName} ${t('is_required', flowLanguage)}`;
              return;
            }
          }

          if (field.fieldType === 'email' && value) {
            if (!emailRegex.test(value)) {
              newErrors[field.fieldKey] = t('valid_email', flowLanguage);
            }
          }
        });
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBack = () => {
    if (promptHistory.length > 0) {
      const lastPrompt = promptHistory[promptHistory.length - 1];
      setPromptHistory(prev => prev.slice(0, -1));
      setConfirmationPrompt(null);
      setUserInputPrompt(null);
      setUserInformationData(null);
      setUserSelectionPrompt(null);

      setStepPath(lastPrompt.stepPathSnapshot);
      setCurrentStep(lastPrompt.currentStepSnapshot);
      setFormData(lastPrompt.formDataSnapshot);

      if (lastPrompt.type === 'confirmation') {
        setConfirmationPrompt(lastPrompt.data);
      } else if (lastPrompt.type === 'userInput') {
        setUserInputPrompt(lastPrompt.data);
      } else if (lastPrompt.type === 'userInformation') {
        setUserInformationData(lastPrompt.data);
      }
    } else {
      setConfirmationPrompt(null);
      setUserInputPrompt(null);
      setUserInformationData(null);
      setUserSelectionPrompt(null);
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldKey]: value }));
    if (errors[fieldKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
  };

  const handleExecute = async () => {
    if (!validateCurrentStep()) return;

    setIsExecuting(true);
    setExecutionResults(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const currentGroup = currentStepGroups[0];
      const currentGroupNodeId = currentGroup
        ? flowNodeMappings.find(m => m.groupId === currentGroup.id)?.nodeId
        : undefined;

      console.log('[FlowExecutionModal] handleExecute - currentStep:', currentStep);
      console.log('[FlowExecutionModal] handleExecute - currentStepGroups:', currentStepGroups.map(g => ({ id: g.id, name: g.name })));
      console.log('[FlowExecutionModal] handleExecute - currentGroup:', currentGroup ? { id: currentGroup.id, name: currentGroup.name } : 'NONE');
      console.log('[FlowExecutionModal] handleExecute - currentGroupNodeId sent to backend:', currentGroupNodeId);

      const processedFormData = { ...formData };
      fields.forEach(f => {
        if (f.fieldType === 'datetime' && f.timeInputOnly && processedFormData[f.fieldKey]) {
          processedFormData[f.fieldKey] = combineTimeWithToday(processedFormData[f.fieldKey]);
        }
      });
      const executeParameters = { ...processedFormData, ...arrayData };

      const headers = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          buttonId,
          executeParameters,
          userId,
          currentGroupNodeId,
          existingContextData: contextData,
          flowLanguage,
        }),
      });

      const result = await response.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          options: result.confirmationData.options || [
            { label: result.confirmationData.yesButtonLabel || 'Yes' },
            { label: result.confirmationData.noButtonLabel || 'No' },
          ],
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
          imageSource: result.confirmationData.confirmationImageSource,
          customImageUrl: result.confirmationData.confirmationCustomImageUrl,
          imageMaxHeight: result.confirmationData.confirmationImageMaxHeight,
        });
        return;
      }

      if (result.requiresInput && result.inputData) {
        setSignaturePopupAcknowledged(false);
        setUserInputPrompt({
          inputType: result.inputData.inputType,
          inputLabel: result.inputData.inputLabel,
          userResponseMessage: result.inputData.userResponseMessage || '',
          variableName: result.inputData.variableName,
          pendingContextData: result.pendingContextData,
          translations: result.inputData.translations || undefined,
          allowMultipleScans: result.inputData.allowMultipleScans || false,
          signaturePopupEnabled: result.inputData.signaturePopupEnabled || false,
          signaturePopupText: result.inputData.signaturePopupText || '',
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          contentAlignment: result.userInformationData.contentAlignment || 'left',
          pendingContextData: result.pendingContextData,
          enableLanguageSelection: result.userInformationData.enableLanguageSelection || false,
          enabledLanguages: result.userInformationData.enabledLanguages || ['fr', 'es'],
          translations: result.userInformationData.translations || undefined,
        });
        return;
      }

      if (result.requiresUserSelection && result.userSelectionData) {
        setUserSelectionPrompt({
          nodeId: result.userSelectionData.nodeId,
          promptText: result.userSelectionData.promptText || '',
          itemVariable: result.userSelectionData.itemVariable || 'item',
          options: result.userSelectionData.options || [],
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setStepPath([]);
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
          imageSource: result.exitData.imageSource || 'none',
          customImageUrl: result.exitData.customImageUrl || '',
          imageMaxHeight: result.exitData.imageMaxHeight || 80,
          translations: result.exitData.translations || undefined,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
      }

      if (result.nextGroupNode) {
        const nextStep = getCombinedStepForGroup(result.nextGroupNode.groupId);
        if (nextStep.length > 0) {
          const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
          const newFormData: Record<string, any> = { ...formData };
          nextGroupFields.forEach(field => {
            if (field.fieldType === 'checkbox') {
              newFormData[field.fieldKey] = 'False';
            } else {
              newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
            }
          });
          setFormData(newFormData);
          setStepPath(prev => {
            if (prev.length === 0) return [nextStep];
            return [...prev, nextStep];
          });
          setCurrentStep(prev => {
            if (stepPath.length === 0) return 0;
            return prev + 1;
          });
          return;
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReset = () => {
    setExecutionComplete(false);
    setExecutionResults(null);
    setConfirmationPrompt(null);
    setUserInputPrompt(null);
    setUserInformationData(null);
    setUserSelectionPrompt(null);
    setExitData(null);
    setCurrentStep(0);
    setContextData(null);
    setPromptHistory([]);

    if (hasWorkflowNodes) {
      setStepPath([]);
      autoExecuteTriggeredRef.current = false;
    } else if (groups.length > 0) {
      const firstStep = getCombinedStepForGroup(groups[0].id);
      setStepPath(firstStep.length > 0 ? [firstStep] : []);
    } else {
      setStepPath([]);
      autoExecuteTriggeredRef.current = false;
    }

    const initialData: Record<string, any> = {};
    const initialArrayData: Record<string, Record<string, any>[]> = {};

    groups.forEach(group => {
      if (group.isArrayGroup && group.arrayFieldName) {
        const groupFields = fields.filter(f => f.groupId === group.id);
        const initialRows: Record<string, any>[] = [];
        for (let i = 0; i < group.arrayMinRows; i++) {
          const row: Record<string, any> = {};
          groupFields.forEach(field => {
            if (field.defaultValue) {
              row[field.fieldKey] = field.defaultValue;
            } else if (field.fieldType === 'checkbox') {
              row[field.fieldKey] = 'False';
            } else {
              row[field.fieldKey] = '';
            }
          });
          initialRows.push(row);
        }
        initialArrayData[group.arrayFieldName] = initialRows;
      }
    });

    fields.forEach(field => {
      const group = groups.find(g => g.id === field.groupId);
      if (group?.isArrayGroup) return;

      if (field.defaultValue) {
        initialData[field.fieldKey] = field.defaultValue;
      } else if (field.fieldType === 'checkbox') {
        initialData[field.fieldKey] = 'False';
      }
    });

    setFormData(initialData);
    setArrayData(initialArrayData);
    setErrors({});
  };

  const handleConfirmationResponse = async (optionIndex: number) => {
    if (!confirmationPrompt) return;

    setIsExecuting(true);
    setPromptHistory(prev => [...prev, {
      type: 'confirmation',
      data: confirmationPrompt,
      stepPathSnapshot: [...stepPath],
      currentStepSnapshot: currentStep,
      formDataSnapshot: { ...formData },
    }]);
    setConfirmationPrompt(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const processedFormData = { ...formData };
      fields.forEach(f => {
        if (f.fieldType === 'datetime' && f.timeInputOnly && processedFormData[f.fieldKey]) {
          processedFormData[f.fieldKey] = combineTimeWithToday(processedFormData[f.fieldKey]);
        }
      });

      const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          buttonId,
          executeParameters: processedFormData,
          userId,
          userConfirmationResponse: optionIndex === 0 ? true : false,
          userConfirmationOptionIndex: optionIndex,
          pendingContextData: confirmationPrompt.pendingContextData,
          flowLanguage,
        }),
      });

      const result = await fetchResponse.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          options: result.confirmationData.options || [
            { label: result.confirmationData.yesButtonLabel || 'Yes' },
            { label: result.confirmationData.noButtonLabel || 'No' },
          ],
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
          imageSource: result.confirmationData.confirmationImageSource,
          customImageUrl: result.confirmationData.confirmationCustomImageUrl,
          imageMaxHeight: result.confirmationData.confirmationImageMaxHeight,
        });
        return;
      }

      if (result.requiresInput && result.inputData) {
        setSignaturePopupAcknowledged(false);
        setUserInputPrompt({
          inputType: result.inputData.inputType,
          inputLabel: result.inputData.inputLabel,
          userResponseMessage: result.inputData.userResponseMessage || '',
          variableName: result.inputData.variableName,
          pendingContextData: result.pendingContextData,
          translations: result.inputData.translations || undefined,
          allowMultipleScans: result.inputData.allowMultipleScans || false,
          signaturePopupEnabled: result.inputData.signaturePopupEnabled || false,
          signaturePopupText: result.inputData.signaturePopupText || '',
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          contentAlignment: result.userInformationData.contentAlignment || 'left',
          pendingContextData: result.pendingContextData,
          enableLanguageSelection: result.userInformationData.enableLanguageSelection || false,
          enabledLanguages: result.userInformationData.enabledLanguages || ['fr', 'es'],
          translations: result.userInformationData.translations || undefined,
        });
        return;
      }

      if (result.requiresUserSelection && result.userSelectionData) {
        setUserSelectionPrompt({
          nodeId: result.userSelectionData.nodeId,
          promptText: result.userSelectionData.promptText || '',
          itemVariable: result.userSelectionData.itemVariable || 'item',
          options: result.userSelectionData.options || [],
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setStepPath([]);
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
          imageSource: result.exitData.imageSource || 'none',
          customImageUrl: result.exitData.customImageUrl || '',
          imageMaxHeight: result.exitData.imageMaxHeight || 80,
          translations: result.exitData.translations || undefined,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
        if (result.nextGroupNode) {
          const nextStep = getCombinedStepForGroup(result.nextGroupNode.groupId);
          if (nextStep.length > 0) {
            const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
            const newFormData: Record<string, any> = {};

            nextGroupFields.forEach(field => {
              if (field.fieldType === 'checkbox') {
                newFormData[field.fieldKey] = 'False';
              } else {
                newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
              }
            });

            setFormData(newFormData);
            setArrayData({});
            setStepPath([nextStep]);
            setCurrentStep(0);
            return;
          }
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
        message: result.message,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUserInputSubmit = async (value: string) => {
    if (!userInputPrompt) return;

    setIsExecuting(true);
    setPromptHistory(prev => [...prev, {
      type: 'userInput',
      data: userInputPrompt,
      stepPathSnapshot: [...stepPath],
      currentStepSnapshot: currentStep,
      formDataSnapshot: { ...formData },
    }]);
    setUserInputPrompt(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const processedFormData = { ...formData };
      fields.forEach(f => {
        if (f.fieldType === 'datetime' && f.timeInputOnly && processedFormData[f.fieldKey]) {
          processedFormData[f.fieldKey] = combineTimeWithToday(processedFormData[f.fieldKey]);
        }
      });

      const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          buttonId,
          executeParameters: processedFormData,
          userId,
          userInputResponse: {
            variableName: userInputPrompt.variableName,
            value,
          },
          pendingContextData: userInputPrompt.pendingContextData,
          flowLanguage,
        }),
      });

      const result = await fetchResponse.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          options: result.confirmationData.options || [
            { label: result.confirmationData.yesButtonLabel || 'Yes' },
            { label: result.confirmationData.noButtonLabel || 'No' },
          ],
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
          imageSource: result.confirmationData.confirmationImageSource,
          customImageUrl: result.confirmationData.confirmationCustomImageUrl,
          imageMaxHeight: result.confirmationData.confirmationImageMaxHeight,
        });
        return;
      }

      if (result.requiresInput && result.inputData) {
        setSignaturePopupAcknowledged(false);
        setUserInputPrompt({
          inputType: result.inputData.inputType,
          inputLabel: result.inputData.inputLabel,
          userResponseMessage: result.inputData.userResponseMessage || '',
          variableName: result.inputData.variableName,
          pendingContextData: result.pendingContextData,
          translations: result.inputData.translations || undefined,
          allowMultipleScans: result.inputData.allowMultipleScans || false,
          signaturePopupEnabled: result.inputData.signaturePopupEnabled || false,
          signaturePopupText: result.inputData.signaturePopupText || '',
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          contentAlignment: result.userInformationData.contentAlignment || 'left',
          pendingContextData: result.pendingContextData,
          enableLanguageSelection: result.userInformationData.enableLanguageSelection || false,
          enabledLanguages: result.userInformationData.enabledLanguages || ['fr', 'es'],
          translations: result.userInformationData.translations || undefined,
        });
        return;
      }

      if (result.requiresUserSelection && result.userSelectionData) {
        setUserSelectionPrompt({
          nodeId: result.userSelectionData.nodeId,
          promptText: result.userSelectionData.promptText || '',
          itemVariable: result.userSelectionData.itemVariable || 'item',
          options: result.userSelectionData.options || [],
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setStepPath([]);
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
          imageSource: result.exitData.imageSource || 'none',
          customImageUrl: result.exitData.customImageUrl || '',
          imageMaxHeight: result.exitData.imageMaxHeight || 80,
          translations: result.exitData.translations || undefined,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
        if (result.nextGroupNode) {
          const nextStep = getCombinedStepForGroup(result.nextGroupNode.groupId);
          if (nextStep.length > 0) {
            const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
            const newFormData: Record<string, any> = { ...formData };
            nextGroupFields.forEach(field => {
              if (field.fieldType === 'checkbox') {
                newFormData[field.fieldKey] = 'False';
              } else {
                newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
              }
            });
            setFormData(newFormData);
            setStepPath(prev => {
              if (prev.length === 0) return [nextStep];
              return [...prev, nextStep];
            });
            setCurrentStep(prev => {
              if (stepPath.length === 0) return 0;
              return prev + 1;
            });
            return;
          }
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
        message: result.message,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUserInformationContinue = async () => {
    if (!userInformationData) return;

    setIsExecuting(true);
    setPromptHistory(prev => [...prev, {
      type: 'userInformation',
      data: userInformationData,
      stepPathSnapshot: [...stepPath],
      currentStepSnapshot: currentStep,
      formDataSnapshot: { ...formData },
    }]);
    setUserInformationData(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const processedFormData = { ...formData };
      fields.forEach(f => {
        if (f.fieldType === 'datetime' && f.timeInputOnly && processedFormData[f.fieldKey]) {
          processedFormData[f.fieldKey] = combineTimeWithToday(processedFormData[f.fieldKey]);
        }
      });

      const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          buttonId,
          executeParameters: processedFormData,
          userId,
          userInformationAcknowledged: true,
          pendingContextData: userInformationData.pendingContextData,
          flowLanguage,
        }),
      });

      const result = await fetchResponse.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          options: result.confirmationData.options || [
            { label: result.confirmationData.yesButtonLabel || 'Yes' },
            { label: result.confirmationData.noButtonLabel || 'No' },
          ],
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
          imageSource: result.confirmationData.confirmationImageSource,
          customImageUrl: result.confirmationData.confirmationCustomImageUrl,
          imageMaxHeight: result.confirmationData.confirmationImageMaxHeight,
        });
        return;
      }

      if (result.requiresInput && result.inputData) {
        setSignaturePopupAcknowledged(false);
        setUserInputPrompt({
          inputType: result.inputData.inputType,
          inputLabel: result.inputData.inputLabel,
          userResponseMessage: result.inputData.userResponseMessage || '',
          variableName: result.inputData.variableName,
          pendingContextData: result.pendingContextData,
          translations: result.inputData.translations || undefined,
          allowMultipleScans: result.inputData.allowMultipleScans || false,
          signaturePopupEnabled: result.inputData.signaturePopupEnabled || false,
          signaturePopupText: result.inputData.signaturePopupText || '',
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          contentAlignment: result.userInformationData.contentAlignment || 'left',
          pendingContextData: result.pendingContextData,
          enableLanguageSelection: result.userInformationData.enableLanguageSelection || false,
          enabledLanguages: result.userInformationData.enabledLanguages || ['fr', 'es'],
          translations: result.userInformationData.translations || undefined,
        });
        return;
      }

      if (result.requiresUserSelection && result.userSelectionData) {
        setUserSelectionPrompt({
          nodeId: result.userSelectionData.nodeId,
          promptText: result.userSelectionData.promptText || '',
          itemVariable: result.userSelectionData.itemVariable || 'item',
          options: result.userSelectionData.options || [],
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setStepPath([]);
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
          imageSource: result.exitData.imageSource || 'none',
          customImageUrl: result.exitData.customImageUrl || '',
          imageMaxHeight: result.exitData.imageMaxHeight || 80,
          translations: result.exitData.translations || undefined,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
        if (result.nextGroupNode) {
          const nextStep = getCombinedStepForGroup(result.nextGroupNode.groupId);
          if (nextStep.length > 0) {
            const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
            const newFormData: Record<string, any> = { ...formData };
            nextGroupFields.forEach(field => {
              if (field.fieldType === 'checkbox') {
                newFormData[field.fieldKey] = 'False';
              } else {
                newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
              }
            });
            setFormData(newFormData);
            setStepPath(prev => {
              if (prev.length === 0) return [nextStep];
              return [...prev, nextStep];
            });
            setCurrentStep(prev => {
              if (stepPath.length === 0) return 0;
              return prev + 1;
            });
            return;
          }
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
        message: result.message,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUserSelectionPick = async (choice: { idx: number; item: any }) => {
    if (!userSelectionPrompt || userSelectionSubmitting) return;

    setUserSelectionSubmitting(true);
    setIsExecuting(true);

    const pending = userSelectionPrompt.pendingContextData;
    setUserSelectionPrompt(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const processedFormData = { ...formData };
      fields.forEach(f => {
        if (f.fieldType === 'datetime' && f.timeInputOnly && processedFormData[f.fieldKey]) {
          processedFormData[f.fieldKey] = combineTimeWithToday(processedFormData[f.fieldKey]);
        }
      });

      const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          buttonId,
          executeParameters: processedFormData,
          userId,
          userSelectionChoice: { idx: choice.idx, item: choice.item },
          pendingContextData: pending,
          flowLanguage,
        }),
      });

      const result = await fetchResponse.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          options: result.confirmationData.options || [
            { label: result.confirmationData.yesButtonLabel || 'Yes' },
            { label: result.confirmationData.noButtonLabel || 'No' },
          ],
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
          imageSource: result.confirmationData.confirmationImageSource,
          customImageUrl: result.confirmationData.confirmationCustomImageUrl,
          imageMaxHeight: result.confirmationData.confirmationImageMaxHeight,
        });
        return;
      }

      if (result.requiresInput && result.inputData) {
        setSignaturePopupAcknowledged(false);
        setUserInputPrompt({
          inputType: result.inputData.inputType,
          inputLabel: result.inputData.inputLabel,
          userResponseMessage: result.inputData.userResponseMessage || '',
          variableName: result.inputData.variableName,
          pendingContextData: result.pendingContextData,
          translations: result.inputData.translations || undefined,
          allowMultipleScans: result.inputData.allowMultipleScans || false,
          signaturePopupEnabled: result.inputData.signaturePopupEnabled || false,
          signaturePopupText: result.inputData.signaturePopupText || '',
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          contentAlignment: result.userInformationData.contentAlignment || 'left',
          pendingContextData: result.pendingContextData,
          enableLanguageSelection: result.userInformationData.enableLanguageSelection || false,
          enabledLanguages: result.userInformationData.enabledLanguages || ['fr', 'es'],
          translations: result.userInformationData.translations || undefined,
        });
        return;
      }

      if (result.requiresUserSelection && result.userSelectionData) {
        setUserSelectionPrompt({
          nodeId: result.userSelectionData.nodeId,
          promptText: result.userSelectionData.promptText || '',
          itemVariable: result.userSelectionData.itemVariable || 'item',
          options: result.userSelectionData.options || [],
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setStepPath([]);
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
          imageSource: result.exitData.imageSource || 'none',
          customImageUrl: result.exitData.customImageUrl || '',
          imageMaxHeight: result.exitData.imageMaxHeight || 80,
          translations: result.exitData.translations || undefined,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
      }

      if (result.nextGroupNode) {
        const nextStep = getCombinedStepForGroup(result.nextGroupNode.groupId);
        if (nextStep.length > 0) {
          const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
          const newFormData: Record<string, any> = { ...formData };
          nextGroupFields.forEach(field => {
            if (field.fieldType === 'checkbox') {
              newFormData[field.fieldKey] = 'False';
            } else {
              newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
            }
          });
          setFormData(newFormData);
          setStepPath(prev => {
            if (prev.length === 0) return [nextStep];
            return [...prev, nextStep];
          });
          setCurrentStep(prev => {
            if (stepPath.length === 0) return 0;
            return prev + 1;
          });
          return;
        }
      }

      setExecutionResults({
        success: result.success !== false,
        results: result.results || [],
        error: result.error,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
      setUserSelectionSubmitting(false);
    }
  };

  const renderField = (buttonField: ExecuteButtonField) => {
    console.log(`[renderField] Rendering field "${buttonField.fieldKey}" - type: ${buttonField.fieldType}, groupId: ${buttonField.groupId}, options:`, buttonField.options, 'translations:', buttonField.translations);
    const value = formData[buttonField.fieldKey] ?? '';
    const error = errors[buttonField.fieldKey];
    const isEffectivelyRequired = buttonField.isRequired || checkConditionalRequired(buttonField, formData);

    const resolvedName = (flowLanguage !== 'en' && buttonField.translations?.[flowLanguage]?.name) || buttonField.name;
    const resolvedPlaceholder = (flowLanguage !== 'en' && buttonField.translations?.[flowLanguage]?.placeholder) || buttonField.placeholder || '';
    const resolvedHelpText = (flowLanguage !== 'en' && buttonField.translations?.[flowLanguage]?.helpText) || buttonField.helpText || '';

    const fieldObj = {
      id: buttonField.id,
      fieldLabel: resolvedName,
      fieldType: buttonField.fieldType,
      isRequired: isEffectivelyRequired,
      placeholder: resolvedPlaceholder,
      helpText: resolvedHelpText,
      maxLength: buttonField.maxLength || 0,
      dropdownOptions: buttonField.options || [],
      dropdownDisplayMode: buttonField.dropdownDisplayMode || 'description_only'
    };
    if (buttonField.fieldType === 'dropdown') {
      console.log(`[renderField] DROPDOWN "${buttonField.fieldKey}" - fieldObj.dropdownOptions:`, fieldObj.dropdownOptions, 'count:', fieldObj.dropdownOptions.length, 'displayMode:', fieldObj.dropdownDisplayMode);
    }

    const commonProps = {
      field: fieldObj,
      value,
      onChange: (val: any) => handleFieldChange(buttonField.fieldKey, val),
      error,
      showIcon: false
    };

    switch (buttonField.fieldType) {
      case 'number':
      case 'decimal':
        return <NumberField key={buttonField.id} {...commonProps} />;
      case 'date':
        return <DateField key={buttonField.id} {...commonProps} />;
      case 'datetime':
        if (buttonField.timeInputOnly) {
          return <TimeField key={buttonField.id} {...commonProps} />;
        }
        return <DateTimeField key={buttonField.id} {...commonProps} />;
      case 'phone':
        return <PhoneField key={buttonField.id} {...commonProps} />;
      case 'zip':
        return <ZipField key={buttonField.id} {...commonProps} />;
      case 'postal_code':
        return <PostalCodeField key={buttonField.id} {...commonProps} />;
      case 'province':
        return <ProvinceField key={buttonField.id} {...commonProps} />;
      case 'state':
        return <StateField key={buttonField.id} {...commonProps} />;
      case 'time':
        return <TimeField key={buttonField.id} {...commonProps} />;
      case 'dropdown':
        return <DropdownField key={buttonField.id} {...commonProps} formData={formData} />;
      case 'email':
        return <TextField key={buttonField.id} {...commonProps} />;
      case 'checkbox':
        return (
          <div key={buttonField.id} className="space-y-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={value === 'True'}
                onChange={(e) => handleFieldChange(buttonField.fieldKey, e.target.checked ? 'True' : 'False')}
                className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {resolvedName}
                {isEffectivelyRequired && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
            {resolvedHelpText && (
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-8">{resolvedHelpText}</p>
            )}
            {error && <p className="text-xs text-red-500 ml-8">{error}</p>}
          </div>
        );
      case 'api_lookup':
        return (
          <div key={buttonField.id} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {resolvedName}
              {isEffectivelyRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <ApiLookupDropdown
              fieldKey={buttonField.fieldKey}
              value={value}
              placeholder={resolvedPlaceholder || 'Select...'}
              error={error}
              buttonId={buttonId}
              apiLookupEndpoint={buttonField.apiLookupEndpoint}
              apiLookupSecondaryApiId={buttonField.apiLookupSecondaryApiId}
              apiLookupHttpMethod={buttonField.apiLookupHttpMethod}
              apiLookupValueField={buttonField.apiLookupValueField}
              apiLookupDisplayColumns={buttonField.apiLookupDisplayColumns}
              apiLookupFieldMappings={buttonField.apiLookupFieldMappings}
              apiLookupRequestBody={buttonField.apiLookupRequestBody}
              apiLookupRequestBodyMappings={buttonField.apiLookupRequestBodyMappings}
              apiLookupWrapBodyInArray={buttonField.apiLookupWrapBodyInArray}
              formData={formData}
              onChange={(val) => handleFieldChange(buttonField.fieldKey, val)}
              onMappings={(mappings) => setFormData(prev => ({ ...prev, ...mappings }))}
            />
            {resolvedHelpText && <p className="text-xs text-gray-500 dark:text-gray-400">{resolvedHelpText}</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        );
      default:
        return <TextField key={buttonField.id} {...commonProps} />;
    }
  };

  const renderArrayGroup = (group: ExecuteButtonGroup) => {
    const rows = arrayData[group.arrayFieldName] || [];
    const canAddRow = rows.length < group.arrayMaxRows;
    const canRemoveRow = rows.length > group.arrayMinRows;
    const groupFields = fields.filter(f => f.groupId === group.id);

    const handleArrayFieldChange = (rowIndex: number, fieldKey: string, value: any) => {
      setArrayData(prev => {
        const updatedRows = [...(prev[group.arrayFieldName] || [])];
        updatedRows[rowIndex] = { ...updatedRows[rowIndex], [fieldKey]: value };
        return { ...prev, [group.arrayFieldName]: updatedRows };
      });
    };

    const addRow = () => {
      if (rows.length >= group.arrayMaxRows) return;
      const newRow: Record<string, any> = {};
      groupFields.forEach(field => {
        if (field.defaultValue) {
          newRow[field.fieldKey] = field.defaultValue;
        } else if (field.fieldType === 'checkbox') {
          newRow[field.fieldKey] = 'False';
        } else {
          newRow[field.fieldKey] = '';
        }
      });
      setArrayData(prev => ({
        ...prev,
        [group.arrayFieldName]: [...rows, newRow]
      }));
    };

    const removeRow = (rowIndex: number) => {
      if (rows.length <= group.arrayMinRows) return;
      setArrayData(prev => ({
        ...prev,
        [group.arrayFieldName]: rows.filter((_, i) => i !== rowIndex)
      }));
    };

    const formatPhoneNumber = (input: string): string => {
      const digits = input.replace(/\D/g, '');
      if (digits.length <= 3) {
        return digits;
      } else if (digits.length <= 6) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      } else {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {rows.length} / {group.arrayMaxRows} rows
          </span>
          {canAddRow && (
            <button
              type="button"
              onClick={addRow}
              className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('add_row', flowLanguage)}
            </button>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {groupFields.map(field => (
                    <th key={field.id} className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      {(flowLanguage !== 'en' && field.translations?.[flowLanguage]?.name) || field.name}
                      {(field.isRequired || field.conditionalRequiredFieldId) && <span className="text-red-500 ml-1">*</span>}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">
                    {t('actions', flowLanguage)}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    {groupFields.map(field => {
                      const value = row[field.fieldKey] ?? '';
                      const errorKey = `${group.arrayFieldName}[${rowIndex}].${field.fieldKey}`;
                      const error = errors[errorKey];

                      return (
                        <td key={field.id} className="px-4 py-3 whitespace-nowrap">
                          {field.fieldType === 'checkbox' ? (
                            <input
                              type="checkbox"
                              checked={value === 'True'}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, e.target.checked ? 'True' : 'False')}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                            />
                          ) : field.fieldType === 'dropdown' ? (
                            <CustomDropdown
                              value={value}
                              onChange={(val) => handleArrayFieldChange(rowIndex, field.fieldKey, val)}
                              options={(field.options || []).map((option: any) => {
                                const optValue = typeof option === 'string' ? option : option.value;
                                const optLabel = typeof option === 'string' ? option : (
                                  field.dropdownDisplayMode === 'value_and_description'
                                    ? `${option.value} - ${option.description}`
                                    : option.description || option.value
                                );
                                return { value: optValue, label: optLabel };
                              })}
                              placeholder={t('select_option', flowLanguage)}
                              size="sm"
                              error={!!error}
                            />
                          ) : field.fieldType === 'phone' ? (
                            <input
                              type="tel"
                              inputMode="tel"
                              value={value}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, formatPhoneNumber(e.target.value))}
                              placeholder="(555) 123-4567"
                              maxLength={14}
                              className={`w-full px-2 py-1.5 text-sm border rounded ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500`}
                            />
                          ) : field.fieldType === 'api_lookup' ? (
                            <ApiLookupDropdown
                              fieldKey={field.fieldKey}
                              value={value}
                              placeholder={(flowLanguage !== 'en' && field.translations?.[flowLanguage]?.placeholder) || field.placeholder || 'Select...'}
                              buttonId={buttonId}
                              apiLookupEndpoint={field.apiLookupEndpoint}
                              apiLookupSecondaryApiId={field.apiLookupSecondaryApiId}
                              apiLookupHttpMethod={field.apiLookupHttpMethod}
                              apiLookupValueField={field.apiLookupValueField}
                              apiLookupDisplayColumns={field.apiLookupDisplayColumns}
                              apiLookupFieldMappings={field.apiLookupFieldMappings}
                              apiLookupRequestBody={field.apiLookupRequestBody}
                              apiLookupRequestBodyMappings={field.apiLookupRequestBodyMappings}
                              apiLookupWrapBodyInArray={field.apiLookupWrapBodyInArray}
                              formData={formData}
                              onChange={(val) => handleArrayFieldChange(rowIndex, field.fieldKey, val)}
                              onMappings={(mappings) => {
                                const rows = [...(arrayData[group.arrayFieldName] || [])];
                                rows[rowIndex] = { ...rows[rowIndex], ...mappings };
                                setArrayData(prev => ({ ...prev, [group.arrayFieldName]: rows }));
                              }}
                            />
                          ) : (
                            <input
                              type={field.fieldType === 'number' || field.fieldType === 'decimal' ? 'number' : field.fieldType === 'email' ? 'email' : 'text'}
                              step={field.fieldType === 'decimal' ? 'any' : undefined}
                              inputMode={field.fieldType === 'decimal' ? 'decimal' : field.fieldType === 'number' ? 'numeric' : undefined}
                              value={value}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, e.target.value)}
                              placeholder={(flowLanguage !== 'en' && field.translations?.[flowLanguage]?.placeholder) || field.placeholder || ''}
                              maxLength={field.maxLength || undefined}
                              className={`w-full px-2 py-1.5 text-sm border rounded ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500`}
                            />
                          )}
                          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {canRemoveRow && (
                        <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderResults = () => {
    if (!executionResults) return null;

    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-lg ${executionResults.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center space-x-2">
            {executionResults.success ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <span className={`font-medium ${executionResults.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
              {executionResults.success ? t('execution_successful', flowLanguage) : t('execution_failed', flowLanguage)}
            </span>
          </div>
          {executionResults.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{executionResults.error}</p>
          )}
        </div>

        {executionResults.results.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('step_results', flowLanguage)}</h4>
            {executionResults.results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  result.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                    : result.status === 'skipped'
                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {result.node || result.step || `Step ${index + 1}`}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      result.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
                        : result.status === 'skipped'
                        ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
                {result.error && (
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2">{result.error}</p>
                )}
                {result.requestUrl && (
                  <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Request URL {result.httpMethod && <span className="text-blue-600 dark:text-blue-400">({result.httpMethod})</span>}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 break-all font-mono">{result.requestUrl}</p>
                  </div>
                )}
                {result.requestBody && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                      {t('view_request_body', flowLanguage)}
                    </summary>
                    <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(result.requestBody), null, 2);
                        } catch {
                          return result.requestBody;
                        }
                      })()}
                    </pre>
                  </details>
                )}
                {result.output && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                      {t('view_output', flowLanguage)}
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
                      {(() => {
                        const { _responseDataMappings, ...rest } = result.output || {};
                        return JSON.stringify(rest, null, 2);
                      })()}
                    </pre>
                  </details>
                )}
                {result.output?._responseDataMappings && Object.keys(result.output._responseDataMappings).length > 0 && (
                  <details className="mt-2" open>
                    <summary className="text-xs text-teal-700 dark:text-teal-400 cursor-pointer hover:text-teal-900 dark:hover:text-teal-200 font-medium">
                      {t('response_data_mappings', flowLanguage)}
                    </summary>
                    <pre className="mt-1 p-2 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
                      {JSON.stringify(result.output._responseDataMappings, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {executionResults.contextData && (
          <details className="mt-4">
            <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">
              {t('view_full_context_data', flowLanguage)}
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(executionResults.contextData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  };

  const modalTitle = title || buttonName;
  const hasArrayGroup = groups.some(g => g.isArrayGroup);

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col ${hasArrayGroup ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {modalTitle}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {confirmationPrompt ? t('user_confirmation_required', flowLanguage) : userInputPrompt ? t('user_input_required', flowLanguage) : userSelectionPrompt ? 'Select Record' : userInformationData ? t('information', flowLanguage) : exitData ? t('flow_complete', flowLanguage) : executionComplete ? t('execution_results', flowLanguage) : t('enter_parameters', flowLanguage)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmationPrompt ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center justify-center text-center py-8">
                {confirmationPrompt.imageSource === 'branding_logo' && brandingLogoUrl ? (
                  <img
                    src={brandingLogoUrl}
                    alt="Company Logo"
                    style={{ maxHeight: `${confirmationPrompt.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : confirmationPrompt.imageSource === 'custom_url' && confirmationPrompt.customImageUrl ? (
                  <img
                    src={confirmationPrompt.customImageUrl}
                    alt=""
                    style={{ maxHeight: `${confirmationPrompt.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : (!confirmationPrompt.imageSource || confirmationPrompt.imageSource === 'none') ? (
                  <div className="w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-6">
                    <HelpCircle className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                  </div>
                ) : null}
                {confirmationPrompt.promptMessage && (
                  <div className="text-gray-700 dark:text-gray-300 max-w-md mb-6">
                    {renderFormattedMessage(confirmationPrompt.promptMessage)}
                  </div>
                )}
                {confirmationPrompt.showLocationMap && confirmationPrompt.latitude && confirmationPrompt.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${confirmationPrompt.latitude},${confirmationPrompt.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full max-w-lg mb-6 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-cyan-500 transition-colors group relative"
                  >
                    <img
                      src={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/static-map-proxy?center=${confirmationPrompt.latitude},${confirmationPrompt.longitude}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${confirmationPrompt.latitude},${confirmationPrompt.longitude}`}
                      alt="Location Map"
                      className="w-full h-[200px] object-cover"
                      onError={(e) => {
                        const link = (e.target as HTMLElement).closest('a');
                        if (link) link.style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 shadow-lg flex items-center gap-1.5">
                        <ExternalLink className="h-4 w-4" />
                        {t('open_in_google_maps', flowLanguage)}
                      </span>
                    </div>
                  </a>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                  {confirmationPrompt.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleConfirmationResponse(idx)}
                      disabled={isExecuting}
                      className="px-6 py-2.5 rounded-lg transition-colors font-medium disabled:opacity-50 bg-cyan-600 text-white hover:bg-cyan-700"
                    >
                      {isExecuting ? (
                        <span className="flex items-center">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {t('processing', flowLanguage)}
                        </span>
                      ) : (
                        option.label
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={isFirstStep ? onClose : handleBack}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {isFirstStep ? t('cancel', flowLanguage) : t('back', flowLanguage)}
              </button>
            </div>
          </>
        ) : userInputPrompt ? (
          <UserInputUI
            inputType={userInputPrompt.inputType}
            inputLabel={
              (flowLanguage !== 'en' && userInputPrompt.translations?.[flowLanguage]?.inputLabel)
                ? userInputPrompt.translations[flowLanguage]!.inputLabel!
                : userInputPrompt.inputLabel
            }
            responseMessage={userInputPrompt.userResponseMessage}
            isExecuting={isExecuting}
            onSubmit={handleUserInputSubmit}
            onCancel={onClose}
            onBack={!isFirstStep ? handleBack : undefined}
            lang={flowLanguage}
            allowMultipleScans={userInputPrompt.allowMultipleScans}
            signaturePopupEnabled={userInputPrompt.signaturePopupEnabled}
            signaturePopupText={userInputPrompt.signaturePopupText}
            signaturePopupAcknowledged={signaturePopupAcknowledged}
            onAcknowledgePopup={() => setSignaturePopupAcknowledged(true)}
          />
        ) : userSelectionPrompt ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-stretch py-4 max-w-md mx-auto w-full">
                {userSelectionPrompt.promptText && (
                  <p className="text-center text-gray-700 dark:text-gray-300 mb-6 text-base">
                    {userSelectionPrompt.promptText}
                  </p>
                )}
                <div className="flex flex-col gap-3">
                  {userSelectionPrompt.options.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm italic">
                      No remaining items to select.
                    </p>
                  ) : (
                    userSelectionPrompt.options.map((opt) => (
                      <button
                        key={opt.idx}
                        onClick={() => handleUserSelectionPick({ idx: opt.idx, item: opt.item })}
                        disabled={userSelectionSubmitting || isExecuting}
                        className="w-full px-6 py-4 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-left shadow-sm"
                      >
                        {opt.label}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={isFirstStep ? onClose : handleBack}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {isFirstStep ? t('cancel', flowLanguage) : t('back', flowLanguage)}
              </button>
            </div>
          </>
        ) : userInformationData ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center text-center py-8 max-w-lg mx-auto">
                {userInformationData.enableLanguageSelection && (
                  <div className="w-full mb-6">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      {t('select_language', flowLanguage)}
                    </label>
                    <div className="flex items-center justify-center gap-2">
                      {FLOW_LANGUAGES.filter((langOption) => langOption.code === 'en' || (userInformationData.enabledLanguages || ['fr', 'es']).includes(langOption.code)).map((langOption) => (
                        <button
                          key={langOption.code}
                          onClick={() => setFlowLanguage(langOption.code)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            flowLanguage === langOption.code
                              ? 'bg-slate-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {langOption.nativeLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {userInformationData.imageSource === 'branding_logo' && brandingLogoUrl ? (
                  <img
                    src={brandingLogoUrl}
                    alt="Company Logo"
                    style={{ maxHeight: `${userInformationData.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : userInformationData.imageSource === 'custom_url' && userInformationData.customImageUrl ? (
                  <img
                    src={userInformationData.customImageUrl}
                    alt=""
                    style={{ maxHeight: `${userInformationData.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : null}
                <div
                  className={`prose prose-sm dark:prose-invert max-w-none w-full mb-6 ${
                    userInformationData.contentAlignment === 'center' ? 'text-center' :
                    userInformationData.contentAlignment === 'right' ? 'text-right' : 'text-left'
                  }`}
                  dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(
                    (flowLanguage !== 'en' && userInformationData.translations?.[flowLanguage]?.contentMarkdown)
                      ? userInformationData.translations[flowLanguage]!.contentMarkdown!
                      : userInformationData.contentMarkdown
                  ) }}
                />
                <button
                  onClick={handleUserInformationContinue}
                  disabled={isExecuting}
                  className="px-8 py-2.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium disabled:opacity-50"
                >
                  {isExecuting ? (
                    <span className="flex items-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('processing', flowLanguage)}
                    </span>
                  ) : (
                    (flowLanguage !== 'en' && userInformationData.translations?.[flowLanguage]?.continueButtonLabel)
                      ? userInformationData.translations[flowLanguage]!.continueButtonLabel!
                      : (userInformationData.continueButtonLabel || t('continue', flowLanguage))
                  )}
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={isFirstStep ? onClose : handleBack}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {isFirstStep ? t('cancel', flowLanguage) : t('back', flowLanguage)}
              </button>
            </div>
          </>
        ) : exitData ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center justify-center text-center py-8">
                {exitData.imageSource === 'branding_logo' && brandingLogoUrl ? (
                  <img
                    src={brandingLogoUrl}
                    alt="Company Logo"
                    style={{ maxHeight: `${exitData.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : exitData.imageSource === 'custom_url' && exitData.customImageUrl ? (
                  <img
                    src={exitData.customImageUrl}
                    alt=""
                    style={{ maxHeight: `${exitData.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : null}
                {(!exitData.imageSource || exitData.imageSource === 'none') && (
                  <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-6">
                    <LogOut className="h-8 w-8 text-rose-600 dark:text-rose-400" />
                  </div>
                )}
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  {t('flow_complete', flowLanguage)}
                </h4>
                <p className="text-gray-700 dark:text-gray-300 max-w-md mb-8 whitespace-pre-wrap">
                  {(flowLanguage !== 'en' && exitData.translations?.[flowLanguage]?.exitMessage)
                    ? exitData.translations[flowLanguage]!.exitMessage!
                    : exitData.exitMessage}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              {exitData.showRestartButton ? (
                <button
                  onClick={handleReset}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('restart', flowLanguage)}
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                className="flex items-center px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('close', flowLanguage)}
              </button>
            </div>
          </>
        ) : executionComplete ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {renderResults()}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={handleReset}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {t('run_again', flowLanguage)}
              </button>
              <button
                onClick={onClose}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('close', flowLanguage)}
              </button>
            </div>
          </>
        ) : groups.length === 0 && !hasWorkflowNodes ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {t('no_parameter_groups', flowLanguage)}
              </p>
            </div>
          </div>
        ) : hasWorkflowNodes && stepPath.length === 0 && !userInformationData && !userInputPrompt && !confirmationPrompt && !exitData ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {t('starting_flow', flowLanguage)}
              </p>
            </div>
          </div>
        ) : (
          <>
            {totalSteps > 1 && (
              <div className="px-6 pt-4">
                <div className="flex items-center justify-center space-x-2">
                  {stepPath.map((stepGroups, index) => (
                    <div key={stepGroups.map(g => g.id).join('-')} className="flex items-center">
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                          index < currentStep
                            ? 'bg-green-500 text-white'
                            : index === currentStep
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                        title={stepGroups.map(g => g.name).join(' + ')}
                      >
                        {index < currentStep ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      {index < stepPath.length - 1 && (
                        <div
                          className={`w-12 h-1 mx-1 rounded ${
                            index < currentStep
                              ? 'bg-green-500'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              {currentStepGroups.length > 0 && (
                <div className="space-y-8">
                  {currentStepGroups.map((group, groupIndex) => {
                    const groupFields = fields.filter(f => f.groupId === group.id);
                    console.log(`[Render] Group "${group.name}" (id: ${group.id}) - matched ${groupFields.length} fields:`, groupFields.map(f => ({ id: f.id, fieldKey: f.fieldKey, fieldType: f.fieldType, groupId: f.groupId, optionsCount: (f.options || []).length })));
                    if (groupFields.length === 0) {
                      console.warn(`[Render] NO FIELDS for group "${group.name}" (id: ${group.id}). All field groupIds:`, fields.map(f => ({ fieldKey: f.fieldKey, groupId: f.groupId })));
                    }
                    const nodeMapping = flowNodeMappings.find(m => m.groupId === group.id);
                    const headerContent = nodeMapping?.headerContent;
                    let headerCtx: any = contextData || {};
                    const headerLoopIdx = headerCtx?.forEach?._index;
                    const headerUsesLoopIndex = typeof headerContent === 'string' && /@loopIndex/.test(headerContent);
                    if (nodeMapping?.headerCurrentLoopItemOnly === true && typeof headerLoopIdx === 'number' && headerCtx.response && !headerUsesLoopIndex) {
                      const indexedResponse: Record<string, any> = {};
                      for (const k of Object.keys(headerCtx.response)) {
                        const v = headerCtx.response[k];
                        indexedResponse[k] = Array.isArray(v) && headerLoopIdx >= 0 && headerLoopIdx < v.length ? v[headerLoopIdx] : v;
                      }
                      headerCtx = { ...headerCtx, response: indexedResponse };
                    }
                    const resolvedHeader = headerContent ? resolveVariable(headerContent, headerCtx) : null;

                    return (
                      <div key={group.id} className={groupIndex > 0 ? 'pt-6 border-t border-gray-200 dark:border-gray-700' : ''}>
                        <div className="mb-6">
                          <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            {(flowLanguage !== 'en' && group.translations?.[flowLanguage]?.name) || group.name}
                          </h4>
                          {(group.description || (flowLanguage !== 'en' && group.translations?.[flowLanguage]?.description)) && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {(flowLanguage !== 'en' && group.translations?.[flowLanguage]?.description) || group.description}
                            </p>
                          )}
                        </div>

                        {resolvedHeader && (
                          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                              {resolvedHeader}
                            </p>
                          </div>
                        )}

                        {group.isArrayGroup && group.arrayFieldName ? (
                          renderArrayGroup(group)
                        ) : (
                          <div className="space-y-4">
                            {groupFields.map(field => renderField(field))}
                            {groupFields.length === 0 && (
                              <p className="text-gray-500 dark:text-gray-400 italic">
                                {t('no_fields_in_group', flowLanguage)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={isFirstStep ? onClose : handleBack}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {isFirstStep ? t('cancel', flowLanguage) : t('back', flowLanguage)}
              </button>

              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isExecuting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isLastStep ? t('execute', flowLanguage) : t('continue', flowLanguage)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
