import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Mail, Bell, Copy, Eye, Send, X, Variable, Download, Upload } from 'lucide-react';
import type { NotificationTemplate, NotificationTemplateCustomField } from '../../types';
import { supabase } from '../../lib/supabase';
import CustomDropdown from '../common/CustomDropdown';
import NotificationTemplateImportModal from './NotificationTemplateImportModal';

export default function NotificationTemplatesSettings({ isAdmin = true }: { isAdmin?: boolean }) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'failure' | 'success'>('all');
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<NotificationTemplate | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .order('template_type', { ascending: true })
        .order('is_global_default', { ascending: false })
        .order('template_name', { ascending: true });

      if (error) throw error;

      const formattedTemplates: NotificationTemplate[] = (data || []).map((t: any) => ({
        id: t.id,
        templateType: t.template_type,
        templateName: t.template_name,
        recipientEmail: t.recipient_email,
        subjectTemplate: t.subject_template,
        bodyTemplate: t.body_template,
        attachPdf: t.attach_pdf,
        ccEmails: t.cc_emails,
        bccEmails: t.bcc_emails,
        isGlobalDefault: t.is_global_default,
        customFields: t.custom_fields || [],
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));

      setTemplates(formattedTemplates);
    } catch (error) {
      console.error('Error loading notification templates:', error);
      alert('Failed to load notification templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    const newTemplate: NotificationTemplate = {
      id: '',
      templateType: 'failure',
      templateName: '',
      recipientEmail: '{{sender_email}}',
      subjectTemplate: '',
      bodyTemplate: '',
      attachPdf: false,
      ccEmails: '',
      bccEmails: '',
      isGlobalDefault: false,
      customFields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingTemplate(newTemplate);
    setShowEditor(true);
  };

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleDuplicate = (template: NotificationTemplate) => {
    const duplicated: NotificationTemplate = {
      ...template,
      id: '',
      templateName: `${template.templateName} (Copy)`,
      isGlobalDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingTemplate(duplicated);
    setShowEditor(true);
  };

  const handleSave = async (template: NotificationTemplate) => {
    try {
      if (!template.templateName.trim()) {
        alert('Template name is required');
        return;
      }

      if (!template.subjectTemplate.trim()) {
        alert('Subject template is required');
        return;
      }

      if (!template.bodyTemplate.trim()) {
        alert('Body template is required');
        return;
      }

      const dbTemplate = {
        template_type: template.templateType,
        template_name: template.templateName,
        recipient_email: template.recipientEmail,
        subject_template: template.subjectTemplate,
        body_template: template.bodyTemplate,
        attach_pdf: template.attachPdf,
        cc_emails: template.ccEmails,
        bcc_emails: template.bccEmails,
        is_global_default: template.isGlobalDefault,
        custom_fields: template.customFields || [],
        updated_at: new Date().toISOString(),
      };

      if (template.id) {
        const { error } = await supabase
          .from('notification_templates')
          .update(dbTemplate)
          .eq('id', template.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('notification_templates')
          .insert([dbTemplate]);

        if (error) throw error;
      }

      await loadTemplates();
      setShowEditor(false);
      setEditingTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    }
  };

  const handleDelete = async (template: NotificationTemplate) => {
    if (template.isGlobalDefault) {
      const globalDefaultCount = templates.filter(
        t => t.templateType === template.templateType && t.isGlobalDefault
      ).length;

      if (globalDefaultCount <= 1) {
        alert(`Cannot delete the only global default ${template.templateType} template. Please create another global default template first.`);
        return;
      }
    }

    setTemplateToDelete(template);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;

    try {
      const { error } = await supabase
        .from('notification_templates')
        .delete()
        .eq('id', templateToDelete.id);

      if (error) throw error;

      await loadTemplates();
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const handlePreview = (template: NotificationTemplate) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handleExportAll = () => {
    const exportData = {
      version: '1.0',
      type: 'notification_templates',
      exportedAt: new Date().toISOString(),
      templates: templates.map(t => ({
        templateType: t.templateType,
        templateName: t.templateName,
        recipientEmail: t.recipientEmail,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        attachPdf: t.attachPdf,
        ccEmails: t.ccEmails,
        bccEmails: t.bccEmails,
        isGlobalDefault: t.isGlobalDefault,
        customFields: t.customFields || [],
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notification-templates-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSingle = (template: NotificationTemplate) => {
    const exportData = {
      version: '1.0',
      type: 'notification_templates',
      exportedAt: new Date().toISOString(),
      templates: [{
        templateType: template.templateType,
        templateName: template.templateName,
        recipientEmail: template.recipientEmail,
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
        attachPdf: template.attachPdf,
        ccEmails: template.ccEmails,
        bccEmails: template.bccEmails,
        isGlobalDefault: template.isGlobalDefault,
        customFields: template.customFields || [],
      }],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notification-template-${template.templateName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.templateName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || template.templateType === filterType;
    return matchesSearch && matchesType;
  });

  const insertVariable = (variable: string) => {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      bodyTemplate: editingTemplate.bodyTemplate + `{{${variable}}}`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notification Templates</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage email notification templates for workflow notifications</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowImportModal(true)}
            disabled={!isAdmin}
            title={!isAdmin ? 'Admin access required' : 'Import templates from JSON'}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>Import</span>
          </button>
          <button
            onClick={handleExportAll}
            disabled={templates.length === 0}
            title={templates.length === 0 ? 'No templates to export' : 'Export all templates as JSON'}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export All</span>
          </button>
          <button
            onClick={handleCreateNew}
            disabled={!isAdmin}
            title={!isAdmin ? 'Admin access required' : undefined}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <CustomDropdown
          value={filterType}
          onChange={(val) => setFilterType(val as 'all' | 'failure' | 'success')}
          options={[
            { value: 'all', label: 'All Types' },
            { value: 'failure', label: 'Failure' },
            { value: 'success', label: 'Success' },
          ]}
        />
      </div>

      <div className="space-y-4">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No templates found</p>
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <div key={template.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      template.templateType === 'failure'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                    }`}>
                      {template.templateType.toUpperCase()}
                    </div>
                    {template.isGlobalDefault && (
                      <div className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        GLOBAL DEFAULT
                      </div>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                    {template.templateName}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    To: {template.recipientEmail || 'Not specified'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                    Subject: {template.subjectTemplate}
                  </p>
                  {template.attachPdf && (
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                      PDF attachment enabled
                    </p>
                  )}
                  {template.customFields && template.customFields.length > 0 && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1 flex items-center">
                      <Variable className="h-3 w-3 mr-1" />
                      {template.customFields.length} custom field{template.customFields.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePreview(template)}
                    className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleEdit(template)}
                        className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                        title="Edit"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(template)}
                        className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleExportSingle(template)}
                        className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                        title="Export"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        className="p-2 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showEditor && editingTemplate && (
        <TemplateEditorModal
          template={editingTemplate}
          onSave={handleSave}
          onCancel={() => {
            setShowEditor(false);
            setEditingTemplate(null);
          }}
          onChange={setEditingTemplate}
        />
      )}

      {showPreview && previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => {
            setShowPreview(false);
            setPreviewTemplate(null);
          }}
        />
      )}

      {showDeleteConfirm && templateToDelete && (
        <DeleteConfirmModal
          template={templateToDelete}
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setTemplateToDelete(null);
          }}
        />
      )}

      {showImportModal && (
        <NotificationTemplateImportModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditorModal({
  template,
  onSave,
  onCancel,
  onChange,
}: {
  template: NotificationTemplate;
  onSave: (template: NotificationTemplate) => void;
  onCancel: () => void;
  onChange: (template: NotificationTemplate) => void;
}) {
  const [showBodyPreview, setShowBodyPreview] = useState(false);

  const availableVariables = [
    { name: 'extraction_type_name', description: 'Name of the extraction type' },
    { name: 'pdf_filename', description: 'Original PDF filename' },
    { name: 'sender_email', description: 'Email address of sender' },
    { name: 'timestamp', description: 'Processing timestamp' },
    { name: 'error_message', description: 'Error details (failure only)' },
    { name: 'response.billNumber', description: 'Bill number from API response' },
    { name: 'response.orderNumber', description: 'Order number from API response' },
    { name: 'response.*', description: 'Any field from API response' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {template.id ? 'Edit Template' : 'Create Template'}
          </h3>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Name
            </label>
            <input
              type="text"
              value={template.templateName}
              onChange={(e) => onChange({ ...template, templateName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="e.g., Default Failure Notification"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="failure"
                  checked={template.templateType === 'failure'}
                  onChange={(e) => onChange({ ...template, templateType: e.target.value as 'failure' | 'success' })}
                  className="text-blue-600"
                />
                <span className="text-gray-900 dark:text-gray-100">Failure</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="success"
                  checked={template.templateType === 'success'}
                  onChange={(e) => onChange({ ...template, templateType: e.target.value as 'failure' | 'success' })}
                  className="text-blue-600"
                />
                <span className="text-gray-900 dark:text-gray-100">Success</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Recipient Email
            </label>
            <input
              type="text"
              value={template.recipientEmail}
              onChange={(e) => onChange({ ...template, recipientEmail: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="e.g., {{sender_email}} or admin@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                CC Emails (optional)
              </label>
              <input
                type="text"
                value={template.ccEmails}
                onChange={(e) => onChange({ ...template, ccEmails: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="email1@example.com, email2@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                BCC Emails (optional)
              </label>
              <input
                type="text"
                value={template.bccEmails}
                onChange={(e) => onChange({ ...template, bccEmails: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="email1@example.com, email2@example.com"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={template.attachPdf}
                onChange={(e) => onChange({ ...template, attachPdf: e.target.checked })}
                className="rounded text-blue-600"
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">Attach PDF to email</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={template.isGlobalDefault}
                onChange={(e) => onChange({ ...template, isGlobalDefault: e.target.checked })}
                className="rounded text-blue-600"
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">Set as global default</span>
            </label>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Fields</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Define custom variables that can be mapped from workflow response data
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newField: NotificationTemplateCustomField = { name: '', label: '' };
                  onChange({ ...template, customFields: [...(template.customFields || []), newField] });
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center space-x-1"
              >
                <Plus className="h-4 w-4" />
                <span>Add Field</span>
              </button>
            </div>

            {template.customFields && template.customFields.length > 0 ? (
              <div className="space-y-3">
                {template.customFields.map((field, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Variable Name
                        </label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => {
                            const updated = [...(template.customFields || [])];
                            updated[index] = { ...updated[index], name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') };
                            onChange({ ...template, customFields: updated });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono"
                          placeholder="order_number"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Display Label
                        </label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => {
                            const updated = [...(template.customFields || [])];
                            updated[index] = { ...updated[index], label: e.target.value };
                            onChange({ ...template, customFields: updated });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          placeholder="Order Number"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Description (Optional)
                        </label>
                        <input
                          type="text"
                          value={field.description || ''}
                          onChange={(e) => {
                            const updated = [...(template.customFields || [])];
                            updated[index] = { ...updated[index], description: e.target.value };
                            onChange({ ...template, customFields: updated });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          placeholder="From API response"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (template.customFields || []).filter((_, i) => i !== index);
                        onChange({ ...template, customFields: updated });
                      }}
                      className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Remove field"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Use these variables in your Subject/Body templates as <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{`{{variable_name}}`}</code>.
                  Map values in the workflow step configuration.
                </p>
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                <Variable className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">No custom fields defined</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Add custom fields to use response data from workflow steps
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subject Template
            </label>
            <input
              type="text"
              value={template.subjectTemplate}
              onChange={(e) => onChange({ ...template, subjectTemplate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="e.g., Processing Failed - {{extraction_type_name}}"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Body Template (HTML)
              </label>
              <button
                type="button"
                onClick={() => setShowBodyPreview(!showBodyPreview)}
                className="flex items-center space-x-1 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                <Eye className="h-4 w-4" />
                <span>{showBodyPreview ? 'Hide Preview' : 'Show Preview'}</span>
              </button>
            </div>
            {showBodyPreview ? (
              <div className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-h-[288px] overflow-auto">
                <div dangerouslySetInnerHTML={{ __html: template.bodyTemplate }} />
              </div>
            ) : (
              <textarea
                id="bodyTemplateTextarea"
                value={template.bodyTemplate}
                onChange={(e) => onChange({ ...template, bodyTemplate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                rows={12}
                placeholder="<p>Hello,</p><br><p>Your document &quot;{{pdf_filename}}&quot; has been processed.</p><br><p>Thank you for using Parse-It!</p>"
              />
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Available Variables</h4>
            <div className="grid grid-cols-2 gap-2">
              {availableVariables.map((variable) => (
                <button
                  key={variable.name}
                  onClick={() => {
                    const textarea = document.getElementById('bodyTemplateTextarea') as HTMLTextAreaElement;
                    const cursorPos = textarea?.selectionStart || template.bodyTemplate.length;
                    const newBody =
                      template.bodyTemplate.slice(0, cursorPos) +
                      `{{${variable.name}}}` +
                      template.bodyTemplate.slice(cursorPos);
                    onChange({ ...template, bodyTemplate: newBody });

                    setTimeout(() => {
                      if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(cursorPos + variable.name.length + 4, cursorPos + variable.name.length + 4);
                      }
                    }, 0);
                  }}
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
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(template)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>Save Template</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewModal({
  template,
  onClose,
}: {
  template: NotificationTemplate;
  onClose: () => void;
}) {
  const sampleData = {
    extraction_type_name: 'TruckMate API Order',
    pdf_filename: 'order_12345.pdf',
    sender_email: 'sender@example.com',
    timestamp: new Date().toLocaleString(),
    error_message: 'API connection timeout',
    response: {
      billNumber: 'BILL-12345',
      orderNumber: 'ORD-67890',
      status: 'Completed',
    },
  };

  const renderTemplate = (text: string) => {
    let rendered = text;
    rendered = rendered.replace(/\{\{extraction_type_name\}\}/g, sampleData.extraction_type_name);
    rendered = rendered.replace(/\{\{pdf_filename\}\}/g, sampleData.pdf_filename);
    rendered = rendered.replace(/\{\{sender_email\}\}/g, sampleData.sender_email);
    rendered = rendered.replace(/\{\{timestamp\}\}/g, sampleData.timestamp);
    rendered = rendered.replace(/\{\{error_message\}\}/g, sampleData.error_message);
    rendered = rendered.replace(/\{\{response\.billNumber\}\}/g, sampleData.response.billNumber);
    rendered = rendered.replace(/\{\{response\.orderNumber\}\}/g, sampleData.response.orderNumber);
    rendered = rendered.replace(/\{\{response\.status\}\}/g, sampleData.response.status);
    return rendered;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Template Preview</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Sample Data Used</h4>
            <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono overflow-x-auto">
              {JSON.stringify(sampleData, null, 2)}
            </pre>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm">
                <span className="font-semibold text-gray-700 dark:text-gray-300">To:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{renderTemplate(template.recipientEmail || '')}</span>
              </div>
              {template.ccEmails && (
                <div className="text-sm mt-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">CC:</span>{' '}
                  <span className="text-gray-900 dark:text-gray-100">{template.ccEmails}</span>
                </div>
              )}
              <div className="text-sm mt-2">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Subject:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{renderTemplate(template.subjectTemplate)}</span>
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-gray-800">
              <div
                className="text-sm text-gray-900 dark:text-gray-100"
                dangerouslySetInnerHTML={{ __html: renderTemplate(template.bodyTemplate) }}
              />
              {template.attachPdf && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    📎 Attachment: {sampleData.pdf_filename}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  template,
  onConfirm,
  onCancel,
}: {
  template: NotificationTemplate;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Delete Template</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Are you sure you want to delete the template <strong>{template.templateName}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
