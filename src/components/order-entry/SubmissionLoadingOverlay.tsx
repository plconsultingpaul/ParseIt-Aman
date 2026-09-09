import React, { useState, useEffect } from 'react';
import { Loader, CheckCircle2, Clock } from 'lucide-react';

interface Step {
  id: number;
  label: string;
  status: 'pending' | 'active' | 'completed';
}

interface SubmissionLoadingOverlayProps {
  isVisible: boolean;
  currentStep: number;
  onCancel?: () => void;
  companyName?: string;
}

export default function SubmissionLoadingOverlay({
  isVisible,
  currentStep,
  onCancel,
  companyName
}: SubmissionLoadingOverlayProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setElapsedTime(0);
      setShowCancel(false);
      return;
    }

    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const cancelTimer = setTimeout(() => {
      setShowCancel(true);
    }, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(cancelTimer);
    };
  }, [isVisible]);

  const sendingLabel = companyName ? `Sending to ${companyName}` : 'Sending';

  const steps: Step[] = [
    {
      id: 1,
      label: 'Validating data',
      status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'active' : 'pending'
    },
    {
      id: 2,
      label: sendingLabel,
      status: currentStep > 4 ? 'completed' : currentStep >= 2 ? 'active' : 'pending'
    }
  ];

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-4">
            <Loader className="h-8 w-8 text-purple-600 dark:text-purple-400 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Submitting Your Order
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Please wait while we process your submission
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'completed' ? (
                  <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                ) : step.status === 'active' ? (
                  <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                    <Loader className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-spin" />
                  </div>
                ) : (
                  <div className="w-6 h-6 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  step.status === 'completed'
                    ? 'text-green-600 dark:text-green-400'
                    : step.status === 'active'
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {step.label}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 mb-4">
          <Clock className="h-3 w-3 mr-1" />
          <span>Elapsed time: {elapsedTime}s</span>
        </div>

        {showCancel && onCancel && (
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
          >
            Cancel Submission
          </button>
        )}

        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Please do not close this window
          </p>
        </div>
      </div>
    </div>
  );
}
