import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  minDate?: string;
  disableWeekends?: boolean;
  disabledDates?: string[];
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateValue(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseDate(value: string) {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  return { year: parseInt(parts[0]), month: parseInt(parts[1]) - 1, day: parseInt(parts[2]) };
}

export default function DatePicker({ value, onChange, placeholder, error, disabled, minDate, disableWeekends, disabledDates }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const parsed = parseDate(value);
  const [viewYear, setViewYear] = useState(parsed?.year ?? todayYear);
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? todayMonth);

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const calHeight = 360;
    const calWidth = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < calHeight && rect.top > calHeight;
    const left = Math.min(rect.left, window.innerWidth - calWidth - 8);

    setPos({
      top: showAbove ? rect.top - calHeight - 4 : rect.bottom + 4,
      left: Math.max(8, left),
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (open) {
      const p = parseDate(value);
      setViewYear(p?.year ?? todayYear);
      setViewMonth(p?.month ?? todayMonth);
      updatePosition();
      const handle = () => updatePosition();
      window.addEventListener('scroll', handle, true);
      window.addEventListener('resize', handle);
      return () => {
        window.removeEventListener('scroll', handle, true);
        window.removeEventListener('resize', handle);
      };
    }
  }, [open, value, todayYear, todayMonth, updatePosition]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || calRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const prevMonthDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);

  const parsedMinDate = parseDate(minDate || '');
  const isBeforeMinDate = (year: number, month: number, day: number): boolean => {
    if (!parsedMinDate) return false;
    const cellDate = new Date(year, month, day);
    const min = new Date(parsedMinDate.year, parsedMinDate.month, parsedMinDate.day);
    return cellDate < min;
  };

  const disabledDatesSet = new Set(disabledDates || []);

  const isDateRestricted = (year: number, month: number, day: number): boolean => {
    if (isBeforeMinDate(year, month, day)) return true;
    if (disableWeekends) {
      const dow = new Date(year, month, day).getDay();
      if (dow === 0 || dow === 6) return true;
    }
    if (disabledDatesSet.size > 0) {
      const dateStr = formatDateValue(year, month, day);
      if (disabledDatesSet.has(dateStr)) return true;
    }
    return false;
  };

  const isTodayDisabled = isDateRestricted(todayYear, todayMonth, todayDay);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const selectDate = (day: number) => {
    onChange(formatDateValue(viewYear, viewMonth, day));
    setOpen(false);
  };

  const cells: { day: number; type: 'prev' | 'current' | 'next' }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, type: 'prev' });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, type: 'current' });
  }
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, type: 'next' });
  }

  const displayValue = parsed
    ? `${MONTHS[parsed.month].slice(0, 3)} ${parsed.day}, ${parsed.year}`
    : '';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(prev => !prev)}
        className={`flex items-center justify-between w-full rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm px-3 py-2 ${
          disabled ? 'opacity-50 cursor-not-allowed ' : ''
        }${
          error
            ? 'border border-red-500 dark:border-red-400 bg-white dark:bg-slate-900/50 text-slate-700 dark:text-slate-200'
            : 'bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/70'
        }`}
      >
        <span className={displayValue ? 'text-slate-900 dark:text-slate-100 truncate' : 'text-slate-400 dark:text-slate-500 truncate'}>
          {displayValue || placeholder || 'Select date...'}
        </span>
        <Calendar className="text-slate-400 dark:text-slate-500 w-4 h-4 flex-shrink-0 ml-2" />
      </button>

      {open && createPortal(
        <div
          ref={calRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 280 }}
          className="rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border p-4 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={prevMonth} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-slate-700">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (cell.type !== 'current') {
                return (
                  <div key={i} className="flex items-center justify-center w-8 h-8 text-sm text-slate-300 dark:text-slate-600 cursor-default">
                    {cell.day}
                  </div>
                );
              }

              const isSelected = parsed && parsed.year === viewYear && parsed.month === viewMonth && parsed.day === cell.day;
              const isToday = todayYear === viewYear && todayMonth === viewMonth && todayDay === cell.day && !isSelected;
              const isDisabled = isDateRestricted(viewYear, viewMonth, cell.day);

              if (isDisabled) {
                return (
                  <div key={i} className="flex items-center justify-center w-8 h-8 text-sm text-slate-300 dark:text-slate-600 cursor-not-allowed">
                    {cell.day}
                  </div>
                );
              }

              let cls = 'flex items-center justify-center w-8 h-8 text-sm font-medium rounded-full transition-colors cursor-pointer ';
              if (isSelected) {
                cls += 'bg-blue-600 text-white shadow-md hover:bg-blue-500 font-bold';
              } else if (isToday) {
                cls += 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20';
              } else {
                cls += 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
              }

              return (
                <button key={i} type="button" onClick={() => selectDate(cell.day)} className={cls}>
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(formatDateValue(todayYear, todayMonth, todayDay));
                setOpen(false);
              }}
              disabled={isTodayDisabled}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                isTodayDisabled
                  ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10'
              }`}
            >
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
