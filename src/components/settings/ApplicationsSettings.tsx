import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, GripVertical, ToggleLeft, ToggleRight, Smartphone } from 'lucide-react';
import MobileConnectionModal from './MobileConnectionModal';
import {
  fetchSsoApplications,
  createSsoApplication,
  updateSsoApplication,
  deleteSsoApplication,
} from '../../services/ssoApplicationService';
import type { SsoApplication, SsoApplicationFormData } from '../../services/ssoApplicationService';

interface ApplicationsSettingsProps {
  isAdmin: boolean;
}

export default function ApplicationsSettings({ isAdmin }: ApplicationsSettingsProps) {
  const [applications, setApplications] = useState<SsoApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<SsoApplication | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showMobileConnection, setShowMobileConnection] = useState(false);

  const [formData, setFormData] = useState<SsoApplicationFormData>({
    name: '',
    url: '',
    appIdentifier: '',
    iconUrl: '',
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    try {
      setLoading(true);
      const data = await fetchSsoApplications();
      setApplications(data);
      setError(null);
    } catch (err) {
      setError('Failed to load applications');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(app: SsoApplication) {
    setEditingApp(app);
    setFormData({
      name: app.name,
      url: app.url,
      appIdentifier: app.appIdentifier,
      iconUrl: app.iconUrl || '',
      sortOrder: app.sortOrder,
      isActive: app.isActive,
    });
    setShowForm(true);
  }

  function handleAdd() {
    setEditingApp(null);
    setFormData({
      name: '',
      url: '',
      appIdentifier: '',
      iconUrl: '',
      sortOrder: applications.length,
      isActive: true,
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingApp(null);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.url.trim()) {
      setError('Name and URL are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingApp) {
        await updateSsoApplication(editingApp.id, formData);
      } else {
        await createSsoApplication(formData);
      }
      await loadApplications();
      setShowForm(false);
      setEditingApp(null);
      window.dispatchEvent(new Event('sso-applications-changed'));
    } catch (err: any) {
      setError(err?.message || 'Failed to save application');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSsoApplication(id);
      await loadApplications();
      setDeleteConfirmId(null);
      window.dispatchEvent(new Event('sso-applications-changed'));
    } catch (err: any) {
      setError(err?.message || 'Failed to delete application');
    }
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        You do not have permission to manage applications.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Applications (Quick Switch)
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure applications that appear in the Quick Switch menu. Apps with an identifier use SSO; apps without open the URL directly.
          </p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileConnection(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              <Smartphone className="h-4 w-4" />
              Mobile App Connection
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Add Application
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {editingApp ? 'Edit Application' : 'New Application'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Parse-It"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                App Identifier (optional)
              </label>
              <input
                type="text"
                value={formData.appIdentifier}
                onChange={(e) => setFormData({ ...formData, appIdentifier: e.target.value })}
                placeholder="e.g. Parse-It"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                If set, enables SSO. Leave blank to open URL directly.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://app.example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Icon URL (optional)
              </label>
              <input
                type="text"
                value={formData.iconUrl}
                onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                placeholder="https://example.com/icon.png"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sort Order
              </label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
              className="text-gray-600 dark:text-gray-400"
            >
              {formData.isActive ? (
                <ToggleRight className="h-6 w-6 text-green-500" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-gray-400" />
              )}
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {formData.isActive ? 'Active (visible in Quick Switch)' : 'Inactive (hidden from Quick Switch)'}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingApp ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Applications List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Loading applications...
        </div>
      ) : applications.length === 0 && !showForm ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <ExternalLink className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No applications configured yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Add an application to enable Quick Switch SSO.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {applications.map((app) => (
            <div
              key={app.id}
              className={`flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors ${
                !app.isActive ? 'opacity-60' : ''
              }`}
            >
              <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />

              {app.iconUrl ? (
                <img src={app.iconUrl} alt={app.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                  <ExternalLink className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {app.name}
                  </p>
                  {!app.isActive && (
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {app.url}
                </p>
              </div>

              <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                ID: {app.appIdentifier}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleEdit(app)}
                  className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {deleteConfirmId === app.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(app.id)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(app.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <MobileConnectionModal
        isOpen={showMobileConnection}
        onClose={() => setShowMobileConnection(false)}
      />
    </div>
  );
}
