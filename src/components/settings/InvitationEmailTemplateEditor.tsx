import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Save, Eye, X, RefreshCw, Variable } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface InvitationTemplate {
  id: string;
  templateName: string;
  subject: string;
  bodyHtml: string;
  isDefault: boolean;
}

interface InvitationEmailTemplateEditorProps {
  onClose: () => void;
  templateType?: 'admin' | 'client';
}

const availableVariables = [
  { name: 'name', description: 'The user\'s name (falls back to username if empty)' },
  { name: 'username', description: 'The user\'s username' },
  { name: 'reset_link', description: 'Password setup URL' },
  { name: 'company_name', description: 'Your company name' },
  { name: 'expiration_hours', description: 'Link expiration time (48 hours)' },
];

export default function InvitationEmailTemplateEditor({ onClose, templateType = 'admin' }: InvitationEmailTemplateEditorProps) {
  const [template, setTemplate] = useState<InvitationTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadTemplate();
  }, [templateType]);

  const loadTemplate = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('invitation_email_templates')
        .select('*')
        .eq('is_default', true)
        .eq('template_type', templateType)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setTemplate({
          id: data.id,
          templateName: data.template_name,
          subject: data.subject,
          bodyHtml: data.body_html,
          isDefault: data.is_default,
        });
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      setError('Failed to load template');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!template) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('invitation_email_templates')
        .update({
          template_name: template.templateName,
          subject: template.subject,
          body_html: template.bodyHtml,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id);

      if (error) throw error;

      setSuccess('Template saved successfully');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error: any) {
      console.error('Failed to save template:', error);
      console.error('Error details:', error.message, error.details);
      setError(error.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const insertVariable = (variableName: string) => {
    if (!template) return;
    const textarea = document.getElementById('bodyHtmlTextarea') as HTMLTextAreaElement;
    const cursorPos = textarea?.selectionStart || template.bodyHtml.length;
    const newBody =
      template.bodyHtml.slice(0, cursorPos) +
      `{{${variableName}}}` +
      template.bodyHtml.slice(cursorPos);
    setTemplate({ ...template, bodyHtml: newBody });
  };

  const renderPreview = (text: string) => {
    return text
      .replace(/\{\{name\}\}/g, 'John Doe')
      .replace(/\{\{username\}\}/g, 'JohnDoe123')
      .replace(/\{\{reset_link\}\}/g, 'https://example.com/password-setup?token=abc123')
      .replace(/\{\{company_name\}\}/g, 'Acme Corporation')
      .replace(/\{\{expiration_hours\}\}/g, '48');
  };

  if (isLoading) {
    return createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-4xl w-full mx-4">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading template...</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto py-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full mx-4 my-4">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {templateType === 'client' ? 'Client' : 'Admin'} Invitation Email Template
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Customize the email sent to new {templateType === 'client' ? 'client portal' : 'admin'} users
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
              <p className="text-green-700 dark:text-green-400 text-sm">{success}</p>
            </div>
          )}

          {template && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={template.templateName}
                  onChange={(e) => setTemplate({ ...template, templateName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={template.subject}
                  onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                  placeholder="e.g., Complete Your Account Registration"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      dangerouslySetInnerHTML={{ __html: renderPreview(template.bodyHtml) }}
                    />
                  </div>
                ) : (
                  <textarea
                    id="bodyHtmlTextarea"
                    value={template.bodyHtml}
                    onChange={(e) => setTemplate({ ...template, bodyHtml: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={16}
                  />
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Variable className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Available Variables</h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {availableVariables.map((variable) => (
                    <button
                      key={variable.name}
                      onClick={() => insertVariable(variable.name)}
                      className="text-left px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                    >
                      <div className="font-mono text-xs text-blue-600 dark:text-blue-400">
                        {`{{${variable.name}}}`}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {variable.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button
            onClick={loadTemplate}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reset</span>
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Saving...' : 'Save Template'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
