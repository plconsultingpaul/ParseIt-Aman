import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  use24Hour?: boolean;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function parseTime(value: string, use24Hour: boolean): { hour: number; minute: number; period: 'AM' | 'PM' } | null {
  if (!value) return null;
  if (use24Hour) {
    // Tolerate an optional :SS on incoming values and drop the seconds.
    const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, period: 'AM' };
  }
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!match) return null;
  const hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return {
    hour,
    minute,
    period: match[3].toUpperCase() as 'AM' | 'PM',
  };
}

// Parse a free-typed entry into a normalized time string, or null if invalid.
function parseTypedTime(raw: string, use24Hour: boolean): string | null {
  const input = raw.trim();
  if (input === '') return '';

  if (use24Hour) {
    // Accept "1430", "930", "14:30", "14:30:00".
    let hour: number;
    let minute: number;
    const colon = input.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (colon) {
      hour = parseInt(colon[1]);
      minute = parseInt(colon[2]);
    } else if (/^\d{3,4}$/.test(input)) {
      const digits = input.padStart(4, '0');
      hour = parseInt(digits.slice(0, 2));
      minute = parseInt(digits.slice(2));
    } else {
      return null;
    }
    if (hour > 23 || minute > 59) return null;
    return formatTime(hour, minute, 'AM', true);
  }

  const match = input.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|A|P)?$/i);
  if (!match) return null;
  const hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const periodRaw = (match[3] || 'AM').toUpperCase();
  const period: 'AM' | 'PM' = periodRaw.startsWith('P') ? 'PM' : 'AM';
  return formatTime(hour, minute, period, false);
}

function formatTime(hour: number, minute: number, period: 'AM' | 'PM', use24Hour: boolean) {
  if (use24Hour) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default function TimePicker({ value, onChange, placeholder, error, disabled, use24Hour = false }: TimePickerProps) {
  const HOURS = use24Hour ? HOURS_24 : HOURS_12;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const parsed = parseTime(value, use24Hour);
  const [selHour, setSelHour] = useState(parsed?.hour ?? (use24Hour ? 0 : 12));
  const [selMinute, setSelMinute] = useState(parsed?.minute ?? 0);
  const [selPeriod, setSelPeriod] = useState<'AM' | 'PM'>(parsed?.period ?? 'AM');

  // Display without seconds: normalize a valid incoming value (e.g. "14:30:00" -> "14:30").
  const normalizedValue = parsed ? formatTime(parsed.hour, parsed.minute, parsed.period, use24Hour) : value;
  const [text, setText] = useState(normalizedValue);
  useEffect(() => { setText(normalizedValue); }, [normalizedValue]);

  const commitTyped = () => {
    const result = parseTypedTime(text, use24Hour);
    if (result === null) {
      setText(normalizedValue);
      return;
    }
    if (result !== value) onChange(result);
    setText(result);
  };

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dropHeight = 320;
    const dropWidth = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < dropHeight && rect.top > dropHeight;
    const left = Math.min(rect.left, window.innerWidth - dropWidth - 8);

    setPos({
      top: showAbove ? rect.top - dropHeight - 4 : rect.bottom + 4,
      left: Math.max(8, left),
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (open) {
      const p = parseTime(value, use24Hour);
      setSelHour(p?.hour ?? (use24Hour ? 0 : 12));
      setSelMinute(p?.minute ?? 0);
      setSelPeriod(p?.period ?? 'AM');
      updatePosition();

      const handle = () => updatePosition();
      window.addEventListener('scroll', handle, true);
      window.addEventListener('resize', handle);

      requestAnimationFrame(() => {
        const scrollToSelected = (container: HTMLDivElement | null, selectedIndex: number) => {
          if (!container) return;
          const items = container.querySelectorAll('[data-item]');
          const item = items[selectedIndex] as HTMLElement;
          if (item) {
            item.scrollIntoView({ block: 'center', behavior: 'instant' });
          }
        };

        const p2 = parseTime(value, use24Hour);
        if (p2) {
          const hourIdx = HOURS.indexOf(p2.hour);
          const minuteIdx = MINUTES.indexOf(p2.minute);
          scrollToSelected(hourListRef.current, hourIdx >= 0 ? hourIdx : 0);
          scrollToSelected(minuteListRef.current, minuteIdx >= 0 ? minuteIdx : 0);
        }
      });

      return () => {
        window.removeEventListener('scroll', handle, true);
        window.removeEventListener('resize', handle);
      };
    }
  }, [open, value, updatePosition, use24Hour]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (hour: number, minute: number, period: 'AM' | 'PM') => {
    onChange(formatTime(hour, minute, period, use24Hour));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center w-full rounded-lg shadow-sm transition-all text-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 ${
          disabled ? 'opacity-50 cursor-not-allowed ' : ''
        }${
          error
            ? 'border border-red-500 dark:border-red-400 bg-white dark:bg-slate-900/50'
            : 'bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
        }`}
      >
        <input
          type="text"
          value={text}
          disabled={disabled}
          placeholder={placeholder || 'Select time...'}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitTyped(); }
            else if (e.key === 'Escape') { setText(normalizedValue); }
          }}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={disabled}
          aria-label="Open time picker"
          onClick={() => !disabled && setOpen(prev => !prev)}
          className="flex-shrink-0 px-2.5 py-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:cursor-not-allowed"
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 280 }}
          className="rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 px-4 pt-4 pb-3">
            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {formatTime(selHour, selMinute, selPeriod, use24Hour)}
            </span>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700" />

          <div className="flex h-[200px]">
            <div
              ref={hourListRef}
              className="flex-1 overflow-y-auto border-r border-slate-100 dark:border-slate-700 py-1 scrollbar-thin"
            >
              <div className="px-2 pb-1 pt-0.5">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hr</span>
              </div>
              {HOURS.map(h => {
                const isSelected = h === selHour;
                return (
                  <button
                    key={h}
                    type="button"
                    data-item
                    onClick={() => setSelHour(h)}
                    className={`w-full text-center py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>

            <div
              ref={minuteListRef}
              className="flex-1 overflow-y-auto border-r border-slate-100 dark:border-slate-700 py-1 scrollbar-thin"
            >
              <div className="px-2 pb-1 pt-0.5">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Min</span>
              </div>
              {MINUTES.map(m => {
                const isSelected = m === selMinute;
                return (
                  <button
                    key={m}
                    type="button"
                    data-item
                    onClick={() => setSelMinute(m)}
                    className={`w-full text-center py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                );
              })}
            </div>

            {!use24Hour && (
            <div className="w-16 py-1">
              <div className="px-2 pb-1 pt-0.5">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">&nbsp;</span>
              </div>
              {(['AM', 'PM'] as const).map(p => {
                const isSelected = p === selPeriod;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelPeriod(p)}
                    className={`w-full text-center py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleSelect(selHour, selMinute, selPeriod)}
              className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg transition-colors shadow-sm"
            >
              Set Time
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}