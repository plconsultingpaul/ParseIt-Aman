import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isLightColor(color: string | null | undefined): boolean {
  if (!color) return false;

  let r = 0, g = 0, b = 0;

  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0]);
      g = parseInt(match[1]);
      b = parseInt(match[2]);
    }
  } else {
    return false;
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export function getContrastTextColor(backgroundColor: string | null | undefined, isDarkMode: boolean): string {
  if (!backgroundColor) {
    return isDarkMode ? 'text-gray-100' : 'text-gray-900';
  }

  const isLight = isLightColor(backgroundColor);

  if (isDarkMode) {
    return isLight ? 'text-gray-900' : 'text-gray-100';
  }

  return isLight ? 'text-gray-900' : 'text-white';
}

export function adaptBackgroundForDarkMode(backgroundColor: string | null | undefined, isDarkMode: boolean): string {
  if (!backgroundColor || !isDarkMode) {
    return backgroundColor || 'transparent';
  }

  const isLight = isLightColor(backgroundColor);

  if (isLight) {
    return `color-mix(in srgb, ${backgroundColor} 20%, rgb(31, 41, 55))`;
  }

  return backgroundColor;
}
