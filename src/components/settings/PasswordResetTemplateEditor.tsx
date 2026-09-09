import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PasswordResetTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  templateType: 'admin_forgot_username' | 'admin_reset_password' | 'client_forgot_username' | 'client_reset_password';
}

export default function PasswordResetTemplateEditor({
  isOpen,
  onClose,
  templateType,
}: PasswordResetTemplateEditorProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplate();
    }
  }, [isOpen, templateType]);

  const loadTemplate = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('password_reset_templates')
        .select('subject, body')
        .eq('template_type', templateType)
        .single();

      if (fetchError) throw fetchError;

      if (data) {
        setSubject(data.subject);
        setBody(data.body);
      }
    } catch (err) {
      setError('Failed to load template');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('password_reset_templates')
        .update({
          subject,
          body,
          updated_at: new Date().toISOString(),
        })
        .eq('template_type', templateType);

      if (updateError) throw updateError;

      onClose();
    } catch (err) {
      setError('Failed to save template');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const getTitle = () => {
    switch (templateType) {
      case 'admin_forgot_username':
        return 'Admin - Forgot Username Email';
      case 'admin_reset_password':
        return 'Admin - Reset Password Email';
      case 'client_forgot_username':
        return 'Client - Forgot Username Email';
      case 'client_reset_password':
        return 'Client - Reset Password Email';
    }
  };

  const getAvailableVariables = () => {
    if (templateType.includes('forgot_username')) {
      return ['{{username}}'];
    } else {
      return ['{{reset_link}}'];
    }
  };

  const renderPreview = (html: string) => {
    return html
      .replace(/\{\{username\}\}/g, 'JohnDoe123')
      .replace(/\{\{reset_link\}\}/g, 'https://example.com/reset-password?token=abc123');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{getTitle()}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500 dark:text-gray-400">Loading template...</div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Available Variables:
                </h3>
                <div className="flex flex-wrap gap-2">
                  {getAvailableVariables().map((variable) => (
                    <code
                      key={variable}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
                    >
                      {variable}
                    </code>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Email subject line"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Body (HTML)
                  </label>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <Eye className="h-4 w-4" />
                    <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
                  </button>
                </div>

                {showPreview ? (
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Preview</span>
                    </div>
                    <div
                      className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: renderPreview(body) }}
                    />
                  </div>
                ) : (
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={15}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                    placeholder="Email body with HTML"
                  />
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
