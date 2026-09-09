import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function useUnsavedChanges(hasUnsavedChanges: boolean) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const confirmNavigation = useCallback(() => {
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
    setShowDialog(false);
  }, [pendingNavigation, navigate]);

  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
    setShowDialog(false);
  }, []);

  const handleNavigation = useCallback((path: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      setShowDialog(true);
      return false;
    }
    navigate(path);
    return true;
  }, [hasUnsavedChanges, navigate]);

  return {
    showDialog,
    confirmNavigation,
    cancelNavigation,
    handleNavigation
  };
}
