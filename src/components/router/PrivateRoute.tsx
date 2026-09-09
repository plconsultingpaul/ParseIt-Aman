import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { User } from '../../types';

interface PrivateRouteProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  user: User | null;
}

export default function PrivateRoute({ children, isAuthenticated, user }: PrivateRouteProps) {
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
