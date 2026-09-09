import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: () => void;
  description?: string;
}

export function useKeyboardShortcut(shortcut: KeyboardShortcut, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrMeta = (event.ctrlKey || event.metaKey);

      const matches =
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        (shortcut.ctrlKey === undefined || isCtrlOrMeta === shortcut.ctrlKey) &&
        (shortcut.shiftKey === undefined || event.shiftKey === shortcut.shiftKey) &&
        (shortcut.altKey === undefined || event.altKey === shortcut.altKey);

      if (matches) {
        event.preventDefault();
        shortcut.callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcut, enabled]);
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (!(event.ctrlKey || event.metaKey)) {
          return;
        }
      }

      const isCtrlOrMeta = (event.ctrlKey || event.metaKey);

      for (const shortcut of shortcuts) {
        const matches =
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (shortcut.ctrlKey === undefined || isCtrlOrMeta === shortcut.ctrlKey) &&
          (shortcut.shiftKey === undefined || event.shiftKey === shortcut.shiftKey) &&
          (shortcut.altKey === undefined || event.altKey === shortcut.altKey);

        if (matches) {
          event.preventDefault();
          shortcut.callback();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

export function getShortcutDisplay(shortcut: KeyboardShortcut): string {
  const keys: string[] = [];
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrlKey) {
    keys.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.shiftKey) {
    keys.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.altKey) {
    keys.push(isMac ? '⌥' : 'Alt');
  }
  keys.push(shortcut.key.toUpperCase());

  return keys.join(isMac ? '' : '+');
}
