import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader, Eye, EyeOff, ChevronDown, ChevronRight, Check, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Client, ClientOrderEntryGroupOverride, ClientOrderEntryFieldOverride } from '../../types';

interface Props {
  client: Client;
  onClose: () => void;
}

interface TemplateGroup {
  id: string;
  group_name: string;
  group_order: number;
  is_array_group: boolean;
  is_hidden: boolean;
  parent_group_id: string | null;
}

interface TemplateField {
  id: string;
  field_group_id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  dropdown_options: any;
  field_order: number;
}

export default function ClientOrderEntryOverridesModal({ client, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>({});
  const [fieldRequiredOverrides, setFieldRequiredOverrides] = useState<Record<string, boolean | null>>({});
  const [fieldHiddenOptions, setFieldHiddenOptions] = useState<Record<string, string[]>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingFieldOptions, setEditingFieldOptions] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!client.orderEntryTemplateId) return;
    setLoading(true);

    const [groupsRes, fieldsRes, groupOvrRes, fieldOvrRes] = await Promise.all([
      supabase
        .from('order_entry_template_field_groups')
        .select('id, group_name, group_order, is_array_group, is_hidden, parent_group_id')
        .eq('template_id', client.orderEntryTemplateId)
        .order('group_order'),
      supabase
        .from('order_entry_template_fields')
        .select('id, field_group_id, field_name, field_label, field_type, is_required, dropdown_options, field_order')
        .eq('template_id', client.orderEntryTemplateId)
        .order('field_order'),
      supabase
        .from('client_order_entry_group_overrides')
        .select('*')
        .eq('client_id', client.id),
      supabase
        .from('client_order_entry_field_overrides')
        .select('*')
        .eq('client_id', client.id)
    ]);

    if (groupsRes.data) setGroups(groupsRes.data);
    if (fieldsRes.data) setFields(fieldsRes.data);

    const gOvr: Record<string, boolean> = {};
    (groupOvrRes.data || []).forEach((o: any) => {
      gOvr[o.field_group_id] = o.is_hidden;
    });
    setGroupOverrides(gOvr);

    const fReq: Record<string, boolean | null> = {};
    const fOpt: Record<string, string[]> = {};
    (fieldOvrRes.data || []).forEach((o: any) => {
      fReq[o.field_id] = o.is_required_override;
      fOpt[o.field_id] = o.hidden_dropdown_options || [];
    });
    setFieldRequiredOverrides(fReq);
    setFieldHiddenOptions(fOpt);

    setLoading(false);
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleGroupHidden = (groupId: string) => {
    setGroupOverrides(prev => {
      const next = { ...prev };
      if (next[groupId]) {
        delete next[groupId];
      } else {
        next[groupId] = true;
      }
      return next;
    });
  };

  const cycleRequired = (fieldId: string, templateDefault: boolean) => {
    setFieldRequiredOverrides(prev => {
      const current = prev[fieldId];
      const next = { ...prev };
      if (current === undefined || current === null) {
        next[fieldId] = !templateDefault;
      } else {
        delete next[fieldId];
      }
      return next;
    });
  };

  const toggleDropdownOption = (fieldId: string, optionValue: string) => {
    setFieldHiddenOptions(prev => {
      const current = prev[fieldId] || [];
      const next = { ...prev };
      if (current.includes(optionValue)) {
        next[fieldId] = current.filter(v => v !== optionValue);
      } else {
        next[fieldId] = [...current, optionValue];
      }
      if (next[fieldId].length === 0) delete next[fieldId];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await supabase
        .from('client_order_entry_group_overrides')
        .delete()
        .eq('client_id', client.id);

      const groupRows = Object.entries(groupOverrides)
        .filter(([_, isHidden]) => isHidden)
        .map(([fieldGroupId]) => ({
          client_id: client.id,
          field_group_id: fieldGroupId,
          is_hidden: true
        }));

      if (groupRows.length > 0) {
        const { error } = await supabase
          .from('client_order_entry_group_overrides')
          .insert(groupRows);
        if (error) throw error;
      }

      await supabase
        .from('client_order_entry_field_overrides')
        .delete()
        .eq('client_id', client.id);

      const fieldRows: any[] = [];
      const allFieldIds = new Set([
        ...Object.keys(fieldRequiredOverrides),
        ...Object.keys(fieldHiddenOptions)
      ]);

      allFieldIds.forEach(fieldId => {
        const reqOverride = fieldRequiredOverrides[fieldId];
        const hiddenOpts = fieldHiddenOptions[fieldId] || [];
        if (reqOverride !== undefined && reqOverride !== null || hiddenOpts.length > 0) {
          fieldRows.push({
            client_id: client.id,
            field_id: fieldId,
            is_required_override: reqOverride !== undefined ? reqOverride : null,
            hidden_dropdown_options: hiddenOpts
          });
        }
      });

      if (fieldRows.length > 0) {
        const { error } = await supabase
          .from('client_order_entry_field_overrides')
          .insert(fieldRows);
        if (error) throw error;
      }

      setSuccessMsg('Overrides saved successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error('Failed to save overrides:', err);
      setErrorMsg('Failed to save overrides. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getDropdownOptions = (field: TemplateField): { value: string; description: string }[] => {
    if (!field.dropdown_options) return [];
    let opts = field.dropdown_options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { return []; }
    }
    if (!Array.isArray(opts)) return [];
    return opts.map((o: any) =>
      typeof o === 'string' ? { value: o, description: o } : { value: o.value, description: o.description || o.value }
    );
  };

  const topLevelGroups = groups.filter(g => !g.parent_group_id && !g.is_hidden);
  const hasOverrides = Object.keys(groupOverrides).length > 0 ||
    Object.keys(fieldRequiredOverrides).length > 0 ||
    Object.keys(fieldHiddenOptions).length > 0;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-10 overflow-y-auto pb-10">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Order Entry Overrides
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Customize field groups and fields for <span className="font-medium text-gray-700 dark:text-gray-300">{client.clientName}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {topLevelGroups.map(group => {
              const isHidden = groupOverrides[group.id] === true;
              const groupFields = fields.filter(f => f.field_group_id === group.id);
              const isExpanded = expandedGroups.has(group.id);
              const dropdownFields = groupFields.filter(f => f.field_type === 'dropdown' && getDropdownOptions(f).length > 0);
              const hasFieldOverrides = groupFields.some(f =>
                fieldRequiredOverrides[f.id] !== undefined && fieldRequiredOverrides[f.id] !== null ||
                (fieldHiddenOptions[f.id] || []).length > 0
              );

              return (
                <div key={group.id} className={`border rounded-xl transition-all ${isHidden ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                  <div className="flex items-center p-3 gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpanded(group.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${isHidden ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                        {group.group_name}
                      </span>
                      {hasFieldOverrides && !isHidden && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                          field overrides
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleGroupHidden(group.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isHidden
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                      }`}
                    >
                      {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {isHidden ? 'Hidden' : 'Visible'}
                    </button>
                  </div>

                  {isExpanded && !isHidden && groupFields.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 space-y-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fields</p>
                      {groupFields.map(field => {
                        const reqOverride = fieldRequiredOverrides[field.id];
                        const hiddenOpts = fieldHiddenOptions[field.id] || [];
                        const opts = getDropdownOptions(field);
                        const isDropdown = field.field_type === 'dropdown' && opts.length > 0;
                        const isEditingOpts = editingFieldOptions === field.id;

                        let reqLabel: string;
                        let reqColor: string;
                        if (reqOverride === true) {
                          reqLabel = 'Required (override)';
                          reqColor = 'text-red-600 dark:text-red-400';
                        } else if (reqOverride === false) {
                          reqLabel = 'Optional (override)';
                          reqColor = 'text-blue-600 dark:text-blue-400';
                        } else {
                          reqLabel = field.is_required ? 'Required (default)' : 'Optional (default)';
                          reqColor = 'text-gray-500 dark:text-gray-400';
                        }

                        return (
                          <div key={field.id} className="rounded-lg bg-gray-50 dark:bg-gray-750 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">{field.field_label}</span>
                              <button
                                type="button"
                                onClick={() => cycleRequired(field.id, field.is_required)}
                                className={`text-xs px-2 py-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${reqColor}`}
                                title="Click to toggle required override"
                              >
                                {reqLabel}
                              </button>
                              {isDropdown && (
                                <button
                                  type="button"
                                  onClick={() => setEditingFieldOptions(isEditingOpts ? null : field.id)}
                                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                  title="Edit dropdown options"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                </button>
                              )}
                            </div>
                            {hiddenOpts.length > 0 && !isEditingOpts && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                {hiddenOpts.length} option{hiddenOpts.length !== 1 ? 's' : ''} hidden
                              </p>
                            )}
                            {isEditingOpts && (
                              <div className="mt-2 border-t border-gray-200 dark:border-gray-600 pt-2 space-y-1">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Uncheck to hide an option for this client:</p>
                                {opts.map(opt => {
                                  const isOptionHidden = hiddenOpts.includes(opt.value);
                                  return (
                                    <label key={opt.value} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                      <div
                                        onClick={() => toggleDropdownOption(field.id, opt.value)}
                                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                                          isOptionHidden
                                            ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
                                            : 'border-blue-500 bg-blue-500 dark:bg-blue-600'
                                        }`}
                                      >
                                        {!isOptionHidden && <Check className="h-3 w-3 text-white" />}
                                      </div>
                                      <span className={`text-xs ${isOptionHidden ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {opt.description || opt.value}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {topLevelGroups.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No field groups found for the assigned template.</p>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <p className="text-red-700 dark:text-red-400 text-sm">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
            <p className="text-green-700 dark:text-green-400 text-sm">{successMsg}</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {hasOverrides ? 'This client has custom overrides applied.' : 'No overrides configured — using template defaults.'}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {saving ? 'Saving...' : 'Save Overrides'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
