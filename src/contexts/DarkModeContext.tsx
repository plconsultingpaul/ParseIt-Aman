import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

interface DarkModeProviderProps {
  children: ReactNode;
}

export function DarkModeProvider({ children }: DarkModeProviderProps) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const hasEarlyDark = document.documentElement.classList.contains('dark');
      if (hasEarlyDark) {
        return true;
      }

      const stored = localStorage.getItem('darkMode');
      if (stored !== null) {
        return JSON.parse(stored);
      }

      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (error) {
      console.error('Error initializing dark mode:', error);
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    const hasClass = root.classList.contains('dark');

    console.log('[DarkMode] State changed:', { isDarkMode, hasClass });

    if (isDarkMode && !hasClass) {
      console.log('[DarkMode] Adding dark class to document');
      root.classList.add('dark');
    } else if (!isDarkMode && hasClass) {
      console.log('[DarkMode] Removing dark class from document');
      root.classList.remove('dark');
    }

    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    console.log('[DarkMode] Saved to localStorage:', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'darkMode' && e.newValue !== null) {
        try {
          const newValue = JSON.parse(e.newValue);
          setIsDarkMode(newValue);
        } catch (error) {
          console.error('Error parsing darkMode from storage:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('darkMode');
      if (stored === null) {
        setIsDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkModeContext() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    throw new Error('useDarkModeContext must be used within a DarkModeProvider');
  }
  return context;
}
