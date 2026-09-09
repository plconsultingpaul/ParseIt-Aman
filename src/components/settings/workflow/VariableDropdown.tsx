import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Variable {
  name: string;
  stepName: string;
  source?: 'extraction' | 'workflow' | 'workflow_input' | 'execute' | 'source_record' | 'user_email' | 'loop_item' | 'context';
  dataType?: string;
}

interface VariableDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  variables: Variable[];
  onSelect: (variableName: string) => void;
  openAbove?: boolean;
}

export default function VariableDropdown({
  isOpen,
  onClose,
  triggerRef,
  variables,
  onSelect,
  openAbove = false,
}: VariableDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const dropdownMaxHeight = 320;

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const triggerRect = triggerRef.current!.getBoundingClientRect();
        const dropdownWidth = 380;

        let left = triggerRect.right - dropdownWidth;
        let top = openAbove
          ? triggerRect.top - dropdownMaxHeight - 4
          : triggerRect.bottom + 4;

        if (left < 8) {
          left = 8;
        }

        const viewportHeight = window.innerHeight;
        if (openAbove) {
          if (top < 8) {
            top = triggerRect.bottom + 4;
          }
        } else if (top + dropdownMaxHeight > viewportHeight - 8) {
          top = triggerRect.top - dropdownMaxHeight - 4;
          if (top < 8) {
            top = 8;
          }
        }

        setPosition({ top, left });
      };

      updatePosition();

      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, triggerRef, openAbove]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const loopItemVariables = variables.filter(v => v.source === 'loop_item');
  const sourceRecordVariables = variables.filter(v => v.source === 'source_record');
  const executeVariables = variables.filter(v => v.source === 'execute');
  const extractionVariables = variables.filter(v => v.source === 'extraction');
  const responseVariables = variables.filter(v => v.source === 'workflow' && v.name.startsWith('response.'));
  const workflowInputVariables = variables.filter(v => v.source === 'workflow_input');
  const workflowVariables = variables.filter(v => (v.source === 'workflow' && !v.name.startsWith('response.')) || (!v.source && !executeVariables.length));
  const userEmailVariables = variables.filter(v => v.source === 'user_email');
  const contextVariables = variables.filter(v => v.source === 'context');

  const dropdown = (
    <div
      ref={dropdownRef}
      data-dropdown-portal
      className="fixed w-[380px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-y-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        maxHeight: `${dropdownMaxHeight}px`,
        zIndex: 9999
      }}
    >
      {variables.length === 0 ? (
        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
          No variables available
        </div>
      ) : (
        <div>
          {loopItemVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-orange-50 dark:bg-orange-900/20">
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">
                  Current Loop Item
                </span>
              </div>
              <div>
                {loopItemVariables.map((variable, idx) => (
                  <button
                    key={`loop-item-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 dark:hover:bg-orange-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <span className="text-xs text-orange-600 dark:text-orange-400">
                      {variable.stepName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {sourceRecordVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                  Source Record Fields
                </span>
              </div>
              <div>
                {sourceRecordVariables.map((variable, idx) => (
                  <button
                    key={`source-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {variable.stepName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {userEmailVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-teal-50 dark:bg-teal-900/20">
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                  User Emails
                </span>
              </div>
              <div>
                {userEmailVariables.map((variable, idx) => (
                  <button
                    key={`user-email-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <span className="text-xs text-teal-600 dark:text-teal-400">
                      {variable.stepName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {contextVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                  Context Variables
                </span>
              </div>
              <div>
                {contextVariables.map((variable, idx) => (
                  <button
                    key={`context-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    {variable.dataType && (
                      <span className="text-xs text-indigo-600 dark:text-indigo-400">
                        {variable.dataType}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {executeVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20">
                <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                  Execute Button Fields
                </span>
              </div>
              <div>
                {executeVariables.map((variable, idx) => (
                  <button
                    key={`execute-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 dark:hover:bg-green-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {variable.stepName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {responseVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-cyan-50 dark:bg-cyan-900/20">
                <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">
                  API Response Data
                </span>
              </div>
              <div>
                {responseVariables.map((variable, idx) => (
                  <button
                    key={`response-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 dark:hover:bg-cyan-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <span className="text-xs text-cyan-600 dark:text-cyan-400">
                      from {variable.stepName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {extractionVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20">
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                  PDF Extracted Fields
                </span>
              </div>
              <div>
                {extractionVariables.map((variable, idx) => (
                  <button
                    key={`extraction-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-purple-600 dark:text-purple-400">
                        {variable.stepName}
                      </span>
                      {variable.dataType && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                          {variable.dataType}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {workflowInputVariables.length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                  Workflow Input
                </span>
              </div>
              <div>
                {workflowInputVariables.map((variable, idx) => (
                  <button
                    key={`input-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    {variable.dataType && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        {variable.dataType}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {workflowVariables.length > 0 && (
            <div>
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                  Previous Workflow Steps
                </span>
              </div>
              <div>
                {workflowVariables.map((variable, idx) => (
                  <button
                    key={`workflow-${idx}`}
                    type="button"
                    onClick={() => onSelect(variable.name)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 flex flex-col border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-mono text-gray-900 dark:text-gray-100">{variable.name}</span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      from {variable.stepName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(dropdown, document.body);
}
