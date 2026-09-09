import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Smartphone, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';

interface MobileConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INSTANCE_NAME = 'Parse-It';
const APPLICATION = 'parse-it';

export default function MobileConnectionModal({ isOpen, onClose }: MobileConnectionModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      setError('Backend connection details are not available.');
      setQrDataUrl(null);
      return;
    }

    const payload = JSON.stringify({
      supabaseUrl,
      supabaseAnonKey,
      instanceName: INSTANCE_NAME,
      application: APPLICATION,
    });

    setError(null);
    QRCode.toDataURL(payload, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => setQrDataUrl(url))
      .catch(() => setError('Could not generate the QR code.'));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = 'parse-it-mobile-connection.png';
    link.click();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-y-auto z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full flex flex-col my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Mobile App Connection</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
            Open the Parse-It mobile app and scan this code to connect it to this workspace.
          </p>

          {error ? (
            <div className="w-full p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : qrDataUrl ? (
            <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <img src={qrDataUrl} alt="Parse-It mobile connection QR code" className="w-64 h-64" />
            </div>
          ) : (
            <div className="w-64 h-64 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download QR Code
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
