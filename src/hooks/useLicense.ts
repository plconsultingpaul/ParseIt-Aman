import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { ParseItLicense } from '../types';
import { fetchActiveLicense, validateAndStoreLicense } from '../services/licenseService';
import { supabase } from '../lib/supabase';

export type LicenseFeatureKey =
  | 'extract'
  | 'transform'
  | 'execute'
  | 'clientSetup'
  | 'vendorSetup'
  | 'imaging';

interface LicenseContextValue {
  license: ParseItLicense | null;
  loading: boolean;
  hasFeature: (key: LicenseFeatureKey) => boolean;
  isExpired: boolean;
  uploadLicense: (fileContent: string) => Promise<{ success: boolean; error?: string }>;
  refreshLicense: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export { LicenseContext };

export function useLicenseProvider() {
  const [license, setLicense] = useState<ParseItLicense | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLicense = useCallback(async () => {
    try {
      const activeLicense = await fetchActiveLicense();
      setLicense(activeLicense);
    } catch (error) {
      console.error('Error loading license:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        loadLicense();
      }
      if (event === 'SIGNED_OUT') {
        setLicense(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadLicense]);

  const hasFeature = useCallback(
    (key: LicenseFeatureKey): boolean => {
      if (!license) return false;
      return license[key] === true;
    },
    [license]
  );

  const isExpired = (() => {
    if (!license?.expiryDate) return false;
    return new Date(license.expiryDate) < new Date();
  })();

  const uploadLicense = useCallback(
    async (fileContent: string): Promise<{ success: boolean; error?: string }> => {
      const result = await validateAndStoreLicense(fileContent);
      if (result.success && result.license) {
        setLicense(result.license);
      }
      return { success: result.success, error: result.error };
    },
    []
  );

  const refreshLicense = useCallback(async () => {
    await loadLicense();
  }, [loadLicense]);

  return {
    license,
    loading,
    hasFeature,
    isExpired,
    uploadLicense,
    refreshLicense,
  };
}

export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}
