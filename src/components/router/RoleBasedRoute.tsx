import React, { useState } from 'react';
import type { User } from '../../types';
import PermissionDeniedModal from '../common/PermissionDeniedModal';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  user: User;
  requireRole?: 'admin' | 'user' | 'vendor' | 'client';
  requirePermission?: keyof User['permissions'];
  requireClientAccess?: 'orderEntry' | 'rateQuote' | 'addressBook' | 'trackTrace' | 'invoice' | 'clientAdmin';
  customCheck?: (user: User) => boolean;
  deniedTitle?: string;
  deniedMessage?: string;
}

export default function RoleBasedRoute({
  children,
  user,
  requireRole,
  requirePermission,
  requireClientAccess,
  customCheck,
  deniedTitle = 'Access Denied',
  deniedMessage = 'You do not have permission to access this page.'
}: RoleBasedRouteProps) {
  const [showDenied, setShowDenied] = useState(false);

  const checkAccess = (): boolean => {
    if (customCheck) {
      return customCheck(user);
    }

    if (requireRole && user.role !== requireRole) {
      return false;
    }

    if (requirePermission && !user.permissions[requirePermission]) {
      return false;
    }

    if (requireClientAccess) {
      if (user.role !== 'client') {
        return false;
      }

      switch (requireClientAccess) {
        case 'orderEntry':
          return user.hasOrderEntryAccess === true;
        case 'rateQuote':
          return user.hasRateQuoteAccess === true;
        case 'addressBook':
          return user.hasAddressBookAccess === true || user.isClientAdmin === true;
        case 'trackTrace':
          return user.hasTrackTraceAccess === true;
        case 'invoice':
          return user.hasInvoiceAccess === true;
        case 'clientAdmin':
          return user.isClientAdmin === true;
        default:
          return false;
      }
    }

    return true;
  };

  const hasAccess = checkAccess();

  if (!hasAccess) {
    if (!showDenied) {
      setShowDenied(true);
    }

    return (
      <>
        <PermissionDeniedModal
          isOpen={showDenied}
          onClose={() => setShowDenied(false)}
          title={deniedTitle}
          message={deniedMessage}
        />
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              403
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {deniedMessage}
            </p>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
