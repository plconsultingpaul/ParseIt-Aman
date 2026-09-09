import React from 'react';
import { CheckCircle2, XCircle, Clock, Loader, AlertCircle, Minus } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  type?: 'submission' | 'workflow' | 'api';
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, type = 'submission', size = 'md' }: StatusBadgeProps) {
  const getStatusConfig = () => {
    const normalizedStatus = status?.toLowerCase() || '';

    if (type === 'workflow') {
      switch (normalizedStatus) {
        case 'completed':
          return {
            bg: 'bg-green-100 dark:bg-green-900/30',
            text: 'text-green-700 dark:text-green-400',
            icon: CheckCircle2,
            label: 'Completed'
          };
        case 'running':
        case 'processing':
          return {
            bg: 'bg-blue-100 dark:bg-blue-900/30',
            text: 'text-blue-700 dark:text-blue-400',
            icon: Loader,
            label: 'Running',
            animate: true
          };
        case 'failed':
          return {
            bg: 'bg-red-100 dark:bg-red-900/30',
            text: 'text-red-700 dark:text-red-400',
            icon: XCircle,
            label: 'Failed'
          };
        case 'pending':
          return {
            bg: 'bg-yellow-100 dark:bg-yellow-900/30',
            text: 'text-yellow-700 dark:text-yellow-400',
            icon: Clock,
            label: 'Pending'
          };
        default:
          return {
            bg: 'bg-gray-100 dark:bg-gray-700',
            text: 'text-gray-600 dark:text-gray-400',
            icon: Minus,
            label: 'N/A'
          };
      }
    }

    if (type === 'api') {
      const statusCode = parseInt(status) || 0;
      if (statusCode >= 200 && statusCode < 300) {
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-400',
          icon: CheckCircle2,
          label: `${statusCode}`
        };
      }
      if (statusCode >= 400 && statusCode < 500) {
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-700 dark:text-yellow-400',
          icon: AlertCircle,
          label: `${statusCode}`
        };
      }
      if (statusCode >= 500) {
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          icon: XCircle,
          label: `${statusCode}`
        };
      }
      return {
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-600 dark:text-gray-400',
        icon: Minus,
        label: statusCode > 0 ? `${statusCode}` : 'N/A'
      };
    }

    switch (normalizedStatus) {
      case 'completed':
      case 'success':
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-400',
          icon: CheckCircle2,
          label: 'Completed'
        };
      case 'failed':
      case 'error':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          icon: XCircle,
          label: 'Failed'
        };
      case 'pending':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-700 dark:text-yellow-400',
          icon: Clock,
          label: 'Pending'
        };
      case 'processing':
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-700 dark:text-blue-400',
          icon: Loader,
          label: 'Processing',
          animate: true
        };
      default:
        return {
          bg: 'bg-gray-100 dark:bg-gray-700',
          text: 'text-gray-600 dark:text-gray-400',
          icon: Minus,
          label: status || 'Unknown'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <span
      className={`inline-flex items-center space-x-1 rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses[size]}`}
    >
      <Icon className={`${iconSizes[size]} ${config.animate ? 'animate-spin' : ''}`} />
      <span>{config.label}</span>
    </span>
  );
}
