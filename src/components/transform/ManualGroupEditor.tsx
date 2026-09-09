import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import Modal from '../common/Modal';
import type { ManualGroupEdit, PageGroupConfig } from '../../types';

interface ManualGroupEditorProps {
  isOpen: boolean;
  onClose: () => void;
  totalPages: number;
  currentGroups: {
    groupIndex: number;
    pages: number[];
    pageGroupConfig: PageGroupConfig;
  }[];
  onSave: (editedGroups: ManualGroupEdit[]) => void;
}

export default function ManualGroupEditor({
  isOpen,
  onClose,
  totalPages,
  currentGroups,
  onSave
}: ManualGroupEditorProps) {
  const [groups, setGroups] = useState<ManualGroupEdit[]>([]);
  const [groupInputs, setGroupInputs] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const initialGroups: ManualGroupEdit[] = currentGroups.map((g, idx) => ({
        groupIndex: idx,
        groupOrder: g.pageGroupConfig.groupOrder,
        pages: g.pages,
        pageGroupConfig: g.pageGroupConfig
      }));
      setGroups(initialGroups);
      setGroupInputs({});
      validateGroups(initialGroups);
    }
  }, [isOpen, currentGroups]);

  const validateGroups = (groupsToValidate: ManualGroupEdit[]) => {
    const validationErrors: string[] = [];
    const allAssignedPages = new Set<number>();
    const duplicatePages = new Set<number>();

    groupsToValidate.forEach((group, idx) => {
      if (group.pages.length === 0) {
        validationErrors.push(`Group ${idx + 1} has no pages assigned`);
      }

      group.pages.forEach(page => {
        if (page < 1 || page > totalPages) {
          validationErrors.push(`Group ${idx + 1} contains invalid page number: ${page}`);
        }
        if (allAssignedPages.has(page)) {
          duplicatePages.add(page);
        }
        allAssignedPages.add(page);
      });
    });

    if (duplicatePages.size > 0) {
      validationErrors.push(`Pages assigned to multiple groups: ${Array.from(duplicatePages).join(', ')}`);
    }

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handlePageInput = (groupIndex: number, value: string) => {
    setGroupInputs(prev => ({ ...prev, [groupIndex]: value }));

    const updatedGroups = [...groups];
    const group = updatedGroups[groupIndex];

    const pageNumbers = value
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .flatMap(s => {
        if (s.includes('-')) {
          const parts = s.split('-');
          if (parts.length === 2) {
            const start = parseInt(parts[0].trim());
            const end = parseInt(parts[1].trim());
            if (!isNaN(start) && !isNaN(end) && start <= end) {
              return Array.from({ length: end - start + 1 }, (_, i) => start + i);
            }
            if (!isNaN(start) && parts[1].trim() === '') {
              return [];
            }
          }
          return [];
        }
        const num = parseInt(s);
        return isNaN(num) ? [] : [num];
      });

    group.pages = pageNumbers.sort((a, b) => a - b);
    setGroups(updatedGroups);
    validateGroups(updatedGroups);
  };

  const handleAddGroup = () => {
    const newGroupOrder = groups.length > 0 ? Math.max(...groups.map(g => g.groupOrder)) + 1 : 1;
    const newGroup: ManualGroupEdit = {
      groupIndex: groups.length,
      groupOrder: newGroupOrder,
      pages: [],
      pageGroupConfig: {
        ...groups[0]?.pageGroupConfig,
        id: `manual-${Date.now()}`,
        groupOrder: newGroupOrder,
        pagesPerGroup: 1
      }
    };

    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    validateGroups(updatedGroups);
  };

  const handleRemoveGroup = (groupIndex: number) => {
    const updatedGroups = groups.filter((_, idx) => idx !== groupIndex).map((group, idx) => ({
      ...group,
      groupIndex: idx,
      groupOrder: idx + 1
    }));
    setGroups(updatedGroups);
    validateGroups(updatedGroups);
  };

  const handleSave = () => {
    if (validateGroups(groups)) {
      onSave(groups);
      onClose();
    }
  };

  const getAssignedPages = () => {
    const assigned = new Set<number>();
    groups.forEach(group => {
      group.pages.forEach(page => assigned.add(page));
    });
    return assigned;
  };

  const getUnassignedPages = () => {
    const assigned = getAssignedPages();
    const unassigned: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (!assigned.has(i)) {
        unassigned.push(i);
      }
    }
    return unassigned;
  };

  const handleQuickAssign = (page: number, targetGroupIndex: number) => {
    const updatedGroups = groups.map((group, idx) => {
      if (idx === targetGroupIndex) {
        const newPages = [...group.pages, page].sort((a, b) => a - b);
        return { ...group, pages: newPages };
      }
      return group;
    });
    setGroups(updatedGroups);
    setGroupInputs({});
    validateGroups(updatedGroups);
  };

  const handleQuickAssignAllToGroup = (targetGroupIndex: number) => {
    const unassigned = getUnassignedPages();
    const updatedGroups = groups.map((group, idx) => {
      if (idx === targetGroupIndex) {
        const newPages = [...group.pages, ...unassigned].sort((a, b) => a - b);
        return { ...group, pages: newPages };
      }
      return group;
    });
    setGroups(updatedGroups);
    setGroupInputs({});
    validateGroups(updatedGroups);
  };

  const unassignedPages = getUnassignedPages();
  const hasErrors = errors.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Page Groups">
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">How to Edit Groups</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
            <li>- Enter page numbers separated by commas (e.g., "1, 2, 3")</li>
            <li>- Use ranges with dashes (e.g., "1-3" for pages 1, 2, and 3)</li>
            <li>- Combine both (e.g., "1-2, 5, 7-9")</li>
            <li>- Each page can only be in one group</li>
            <li>- Click a page number below to quickly assign it to a group</li>
          </ul>
        </div>

        {unassignedPages.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-orange-800 dark:text-orange-300">Unassigned Pages ({unassignedPages.length})</h4>
                  {groups.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-orange-600 dark:text-orange-400">Assign all to:</span>
                      {groups.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickAssignAllToGroup(idx)}
                          className="px-2 py-0.5 bg-orange-200 dark:bg-orange-800 hover:bg-orange-300 dark:hover:bg-orange-700 text-orange-800 dark:text-orange-200 text-xs font-medium rounded transition-colors duration-150"
                          title={`Assign all unassigned pages to Group ${idx + 1}${groups[idx]?.pageGroupConfig?.name ? ` (${groups[idx].pageGroupConfig.name})` : ''}`}
                        >
                          G{idx + 1}{groups[idx]?.pageGroupConfig?.name ? ` ${groups[idx].pageGroupConfig.name}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {unassignedPages.map(page => (
                    <div key={page} className="relative group/page">
                      <div className="flex items-center bg-white dark:bg-gray-800 border border-orange-300 dark:border-orange-600 rounded-lg overflow-hidden">
                        <span className="px-2 py-1 text-sm font-medium text-orange-800 dark:text-orange-300">
                          Page {page}
                        </span>
                        <div className="flex border-l border-orange-300 dark:border-orange-600">
                          {groups.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleQuickAssign(page, idx)}
                              className="px-1.5 py-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-300 transition-colors duration-150 border-r last:border-r-0 border-orange-200 dark:border-orange-700"
                              title={`Assign to Group ${idx + 1}${groups[idx]?.pageGroupConfig?.name ? ` (${groups[idx].pageGroupConfig.name})` : ''}`}
                            >
                              <ArrowRight className="h-3 w-3 inline" /> G{idx + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {hasErrors && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">Validation Errors</h4>
                <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
                  {errors.map((error, idx) => (
                    <li key={idx}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Page Groups</h4>
            <button
              onClick={handleAddGroup}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
            >
              <Plus className="h-4 w-4" />
              <span>Add Group</span>
            </button>
          </div>

          {groups.map((group, idx) => (
            <div
              key={group.groupIndex}
              className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="bg-blue-100 dark:bg-blue-900/50 px-3 py-1 rounded-lg">
                    <span className="text-blue-800 dark:text-blue-300 font-bold">
                      Group {idx + 1}{group.pageGroupConfig?.name ? ` - ${group.pageGroupConfig.name}` : ''}
                    </span>
                  </div>
                  {group.pages.length > 0 && (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      ({group.pages.length} page{group.pages.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveGroup(idx)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                  title="Remove group"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Pages (e.g., "1-2, 5")
                </label>
                <input
                  type="text"
                  value={groupInputs[idx] ?? group.pages.join(', ')}
                  onChange={(e) => handlePageInput(idx, e.target.value)}
                  onBlur={() => setGroupInputs(prev => {
                    const updated = { ...prev };
                    delete updated[idx];
                    return updated;
                  })}
                  placeholder="Enter page numbers..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {group.pageGroupConfig.workflowId && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Workflow: {group.pageGroupConfig.workflowId}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={hasErrors}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Apply Changes</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
