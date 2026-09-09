import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, User as UserIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ConfigChangeLog {
  id: string;
  config_type: string;
  item_name: string;
  changed_by_username: string;
  created_at: string;
}

interface ConfigChangeLogsModalProps {
  configType: 'extraction' | 'transformation' | 'execute' | 'workflow_v2';
  title: string;
  onClose: () => void;
  itemFilter?: string;
}

export async function logConfigChange(
  configType: 'extraction' | 'transformation' | 'execute' | 'workflow_v2',
  itemName: string,
  userId: string,
  username: string
) {
  try {
    await supabase.from('config_change_logs').insert({
      config_type: configType,
      item_name: itemName,
      changed_by: userId,
      changed_by_username: username,
    });
  } catch (err) {
    console.error('Failed to log config change:', err);
  }
}

export default function ConfigChangeLogsModal({ configType, title, onClose, itemFilter }: ConfigChangeLogsModalProps) {
  const [logs, setLogs] = useState<ConfigChangeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      let query = supabase
        .from('config_change_logs')
        .select('*')
        .eq('config_type', configType);

      if (itemFilter) {
        query = query.ilike('item_name', `%${itemFilter}%`);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setLogs(data);
      }
      setLoading(false);
    };
    fetchLogs();
  }, [configType, itemFilter]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No changes recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {log.changed_by_username}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                    {log.item_name && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                        {log.item_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
