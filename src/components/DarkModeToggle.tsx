import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

interface DarkModeToggleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function DarkModeToggle({ className = '', size = 'md' }: DarkModeToggleProps) {
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const sizeClasses = {
    sm: 'w-10 h-6',
    md: 'w-12 h-7',
    lg: 'w-14 h-8'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <button
      onClick={toggleDarkMode}
      className={`
        relative inline-flex items-center justify-center
        ${sizeClasses[size]}
        bg-gray-200 dark:bg-gray-700
        rounded-full
        transition-all duration-300 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
        dark:focus:ring-offset-gray-800
        hover:bg-gray-300 dark:hover:bg-gray-600
        ${className}
      `}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      role="switch"
      aria-checked={isDarkMode}
    >
      {/* Toggle Track */}
      <div
        className={`
          absolute inset-0 rounded-full
          bg-gradient-to-r transition-all duration-300 ease-in-out
          ${isDarkMode 
            ? 'from-indigo-600 to-purple-600' 
            : 'from-yellow-400 to-orange-500'
          }
        `}
      />
      
      {/* Toggle Thumb */}
      <div
        className={`
          relative z-10
          ${size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6'}
          bg-white dark:bg-gray-100
          rounded-full
          shadow-lg
          transform transition-all duration-300 ease-in-out
          flex items-center justify-center
          ${isDarkMode 
            ? `translate-x-${size === 'sm' ? '4' : size === 'md' ? '5' : '6'}` 
            : 'translate-x-1'
          }
        `}
      >
        {/* Icon */}
        <div className="transition-all duration-300 ease-in-out">
          {isDarkMode ? (
            <Moon className={`${iconSizes[size]} text-indigo-600`} />
          ) : (
            <Sun className={`${iconSizes[size]} text-orange-500`} />
          )}
        </div>
      </div>
      
      {/* Screen reader text */}
      <span className="sr-only">
        {isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      </span>
    </button>
  );
}