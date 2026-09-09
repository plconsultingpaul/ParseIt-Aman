import React, { useState, useEffect, useCallback } from 'react';
import { Server, Loader2, Save, Zap, ToggleLeft, ToggleRight, AlertCircle, CheckCircle, X } from 'lucide-react';
import type { ImagingSftpConnection } from '../../types';
import { fetchImagingSftpConnection, saveImagingSftpConnection } from '../../services/imagingService';
import { supabase } from '../../lib/supabase';

interface ImagingSftpConnectionSectionProps {
  isAdmin: boolean;
}

export default function ImagingSftpConnectionSection({ isAdmin }: ImagingSftpConnectionSectionProps) {
  const [connection, setConnection] = useState<ImagingSftpConnection>({
    host: '',
    port: 22,
    username: '',
    password: '',
    isEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = useCallback(async () => {
    try {
      const conn = await fetchImagingSftpConnection();
      if (conn) setConnection(conn);
    } catch (err: any) {
      setError(err.message || 'Failed to load SFTP connection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await saveImagingSftpConnection(connection);
      setConnection(saved);
      setSuccess('SFTP connection saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setSuccess('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/imaging-sftp-monitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ action: 'test_connection' }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || result.details || 'Connection test failed');
      setSuccess('SFTP connection test successful.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

  return (
    <section className="space-y-4">
      <div className="flex items-center space-x-2">
        <Server className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">SFTP Connection</h3>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Configure the shared SFTP server connection. All monitored folders will use these credentials.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Host</label>
            <input type="text" className={inputCls} value={connection.host}
              onChange={(e) => setConnection(prev => ({ ...prev, host: e.target.value }))}
              placeholder="sftp.example.com" disabled={!isAdmin} />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input type="number" className={inputCls} value={connection.port}
              onChange={(e) => setConnection(prev => ({ ...prev, port: parseInt(e.target.value) || 22 }))}
              min={1} max={65535} disabled={!isAdmin} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Username</label>
            <input type="text" className={inputCls} value={connection.username}
              onChange={(e) => setConnection(prev => ({ ...prev, username: e.target.value }))}
              disabled={!isAdmin} />
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <input type="password" className={inputCls} value={connection.password}
              onChange={(e) => setConnection(prev => ({ ...prev, password: e.target.value }))}
              disabled={!isAdmin} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable SFTP Monitoring</span>
          <button onClick={() => setConnection(prev => ({ ...prev, isEnabled: !prev.isEnabled }))} disabled={!isAdmin}>
            {connection.isEnabled
              ? <ToggleRight className="h-6 w-6 text-green-500" />
              : <ToggleLeft className="h-6 w-6 text-gray-400" />}
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center space-x-2 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save</span>
            </button>
            <button onClick={handleTest} disabled={testing || !connection.host}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              <span>Test Connection</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
