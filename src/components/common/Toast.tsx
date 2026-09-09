import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
}

export default function Toast({ id, type, message, duration = 5000, onClose }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  const getToastConfig = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50 dark:bg-green-900/30 border-green-500',
          icon: CheckCircle2,
          iconColor: 'text-green-500 dark:text-green-400',
          textColor: 'text-green-800 dark:text-green-200'
        };
      case 'error':
        return {
          bg: 'bg-red-50 dark:bg-red-900/30 border-red-500',
          icon: XCircle,
          iconColor: 'text-red-500 dark:text-red-400',
          textColor: 'text-red-800 dark:text-red-200'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-500',
          icon: AlertTriangle,
          iconColor: 'text-yellow-500 dark:text-yellow-400',
          textColor: 'text-yellow-800 dark:text-yellow-200'
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/30 border-blue-500',
          icon: Info,
          iconColor: 'text-blue-500 dark:text-blue-400',
          textColor: 'text-blue-800 dark:text-blue-200'
        };
    }
  };

  const config = getToastConfig();
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start space-x-3 p-4 rounded-lg border-l-4 shadow-lg ${config.bg} animate-in slide-in-from-right-full duration-300`}
      style={{ minWidth: '300px', maxWidth: '500px' }}
    >
      <Icon className={`h-5 w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
      <p className={`flex-1 text-sm font-medium ${config.textColor}`}>{message}</p>
      <button
        onClick={() => onClose(id)}
        className={`${config.textColor} hover:opacity-70 transition-opacity flex-shrink-0`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
