import React, { useState } from 'react';
import { CheckCircle2, X, FileText, Hash, Copy, Check } from 'lucide-react';

interface SubmissionSuccessModalProps {
  isOpen: boolean;
  submissionId: string;
  apiResponse: any;
  workflowExecutionId?: string;
  confirmationNumberField?: string | null;
  onClose: () => void;
  onSubmitAnother: () => void;
}

function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return null;
  const parts = path.split(/[.\[\]]/).filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = current[part];
  }
  return current ?? null;
}

function getConfirmationValue(apiResponse: any, configuredField?: string | null): { value: string | null; label: string } {
  if (!apiResponse) return { value: null, label: 'Confirmation Number' };

  if (configuredField) {
    const value = getValueByPath(apiResponse, configuredField);
    if (value !== null && value !== undefined && value !== '') {
      return { value: String(value), label: configuredField === 'billNumber' ? 'Bill #' : 'Confirmation Number' };
    }
  }

  // Fallback: try common bill number paths
  try {
    if (apiResponse.billNumber) return { value: apiResponse.billNumber, label: 'Bill #' };
    if (apiResponse.orders && Array.isArray(apiResponse.orders) && apiResponse.orders.length > 0) {
      if (apiResponse.orders[0].billNumber) return { value: apiResponse.orders[0].billNumber, label: 'Bill #' };
    }
    if (apiResponse.data?.orders && Array.isArray(apiResponse.data.orders) && apiResponse.data.orders.length > 0) {
      if (apiResponse.data.orders[0].billNumber) return { value: apiResponse.data.orders[0].billNumber, label: 'Bill #' };
    }
    if (apiResponse.result?.billNumber) return { value: apiResponse.result.billNumber, label: 'Bill #' };
  } catch {
    // ignore
  }

  return { value: null, label: 'Confirmation Number' };
}

export default function SubmissionSuccessModal({
  isOpen,
  submissionId,
  apiResponse,
  workflowExecutionId,
  confirmationNumberField,
  onClose,
  onSubmitAnother
}: SubmissionSuccessModalProps) {

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const { value: confirmationValue, label: confirmationLabel } = getConfirmationValue(apiResponse, confirmationNumberField);
  const displayValue = confirmationValue || apiResponse?.confirmationNumber || apiResponse?.orderId || apiResponse?.id || submissionId.slice(0, 8);
  const isBillNumber = confirmationValue !== null && (confirmationLabel === 'Bill #');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = displayValue;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Order Submitted Successfully!
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your order has been received and is being processed
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {isBillNumber ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{confirmationLabel}</span>
                <Hash className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-mono font-bold text-blue-600 dark:text-blue-400">
                  {displayValue}
                </p>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Confirmation Number</span>
                <FileText className="h-4 w-4 text-gray-400" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-mono font-semibold text-gray-900 dark:text-gray-100">
                  {displayValue}
                </p>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          )}


          {apiResponse?.message && (
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {apiResponse.message}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={onSubmitAnother}
            className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white font-medium rounded-lg transition-colors"
          >
            Submit Another Order
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
