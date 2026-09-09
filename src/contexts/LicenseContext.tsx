import React from 'react';
import { LicenseContext, useLicenseProvider } from '../hooks/useLicense';

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const licenseValue = useLicenseProvider();

  return (
    <LicenseContext.Provider value={licenseValue}>
      {children}
    </LicenseContext.Provider>
  );
}
