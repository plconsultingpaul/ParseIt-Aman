import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export default function UnsavedChangesDialog({ isOpen, onStay, onLeave }: UnsavedChangesDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
            <div className="flex-1">
              <h3 id="unsaved-changes-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Unsaved Changes
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You have unsaved changes that will be lost if you leave this page. Are you sure you want to continue?
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end space-x-3">
          <button
            onClick={onStay}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Stay on Page
          </button>
          <button
            onClick={onLeave}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Leave Page
          </button>
        </div>
      </div>
    </div>
  );
}
