import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, Send, Star, StarOff, Cloud, Globe, Zap, CheckCircle, XCircle } from 'lucide-react';
import CustomDropdown from '../common/CustomDropdown';
import { supabase, getAuthHeaders } from '../../lib/supabase';

export interface EmailSendingAccount {
  id: string;
  account_name: string;
  provider: 'office365' | 'gmail';
  from_email: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  gmail_client_id: string;
  gmail_client_secret: string;
  gmail_refresh_token: string;
  is_default: boolean;
}

type EditableAccount = Omit<EmailSendingAccount, 'id'> & { id?: string };

const emptyAccount = (): EditableAccount => ({
  account_name: '',
  provider: 'office365',
  from_email: '',
  tenant_id: '',
  client_id: '',
  client_secret: '',
  gmail_client_id: '',
  gmail_client_secret: '',
  gmail_refresh_token: '',
  is_default: false,
});

export default function EmailSendingAccountsSection() {
  const [accounts, setAccounts] = useState<EmailSendingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditableAccount | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EmailSendingAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('email_sending_accounts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('account_name', { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setAccounts((data || []) as EmailSendingAccount[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const startCreate = () => {
    setTestResult(null);
    setEditing(emptyAccount());
  };

  const startEdit = (account: EmailSendingAccount) => {
    setTestResult(null);
    setEditing({ ...account });
  };

  const closeEditor = () => {
    setEditing(null);
    setTestResult(null);
  };

  const updateField = <K extends keyof EditableAccount>(field: K, value: EditableAccount[K]) => {
    setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const validate = (a: EditableAccount): string | null => {
    if (!a.account_name.trim()) return 'Account name is required.';
    if (!a.from_email.trim()) return 'From email is required.';
    if (a.provider === 'office365') {
      if (!a.tenant_id.trim() || !a.client_id.trim() || !a.client_secret.trim()) {
        return 'Office 365 tenant ID, client ID and client secret are required.';
      }
    } else if (a.provider === 'gmail') {
      if (!a.gmail_client_id.trim() || !a.gmail_client_secret.trim() || !a.gmail_refresh_token.trim()) {
        return 'Gmail client ID, client secret and refresh token are required.';
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!editing) return;
    const validationError = validate(editing);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      if (editing.is_default) {
        const clearQuery = supabase.from('email_sending_accounts').update({ is_default: false });
        if (editing.id) {
          await clearQuery.neq('id', editing.id);
        } else {
          await clearQuery.eq('is_default', true);
        }
      }

      const payload = {
        account_name: editing.account_name.trim(),
        provider: editing.provider,
        from_email: editing.from_email.trim(),
        tenant_id: editing.provider === 'office365' ? editing.tenant_id.trim() : '',
        client_id: editing.provider === 'office365' ? editing.client_id.trim() : '',
        client_secret: editing.provider === 'office365' ? editing.client_secret : '',
        gmail_client_id: editing.provider === 'gmail' ? editing.gmail_client_id.trim() : '',
        gmail_client_secret: editing.provider === 'gmail' ? editing.gmail_client_secret : '',
        gmail_refresh_token: editing.provider === 'gmail' ? editing.gmail_refresh_token : '',
        is_default: editing.is_default,
      };

      if (editing.id) {
        const { error } = await supabase
          .from('email_sending_accounts')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_sending_accounts')
          .insert(payload);
        if (error) throw error;
      }
      await loadAccounts();
      closeEditor();
    } catch (err: any) {
      setError(err.message || 'Failed to save account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('email_sending_accounts')
        .delete()
        .eq('id', confirmDelete.id);
      if (error) throw error;
      await loadAccounts();
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (account: EmailSendingAccount) => {
    setIsSaving(true);
    try {
      await supabase.from('email_sending_accounts').update({ is_default: false }).neq('id', account.id);
      await supabase.from('email_sending_accounts').update({ is_default: true }).eq('id', account.id);
      await loadAccounts();
    } catch (err: any) {
      setError(err.message || 'Failed to update default account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDefault = async (account: EmailSendingAccount) => {
    setIsSaving(true);
    try {
      await supabase.from('email_sending_accounts').update({ is_default: false }).eq('id', account.id);
      await loadAccounts();
    } catch (err: any) {
      setError(err.message || 'Failed to update default account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!editing) return;
    const validationError = validate(editing);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsTesting(true);
    setTestResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${supabaseUrl}/functions/v1/test-office365`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          mode: 'send',
          provider: editing.provider,
          tenantId: editing.tenant_id,
          clientId: editing.client_id,
          clientSecret: editing.client_secret,
          defaultSendFromEmail: editing.from_email,
          gmailClientId: editing.gmail_client_id,
          gmailClientSecret: editing.gmail_client_secret,
          gmailRefreshToken: editing.gmail_refresh_token,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setTestResult({ success: true, message: result.message || 'Send credentials verified successfully.' });
      } else {
        setTestResult({ success: false, message: result.details || result.error || 'Send credentials test failed.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Send credentials test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sending Accounts</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Add one or more sending email accounts. Workflow v2 email steps can pick which one to send from.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Sending Account</span>
        </button>
      </div>

      {error && !editing && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading sending accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
          <Send className="h-8 w-8 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            No sending accounts yet. Add one to let Workflow v2 email steps choose a specific sender.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            When no account is set on a step, workflows continue to use the default provider from Email Provider Configuration.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/60 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">From Email</th>
                <th className="px-4 py-3">Default</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{account.account_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {account.provider === 'office365' ? <Cloud className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      {account.provider === 'office365' ? 'Office 365' : 'Gmail'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{account.from_email}</td>
                  <td className="px-4 py-3">
                    {account.is_default ? (
                      <button
                        onClick={() => handleClearDefault(account)}
                        disabled={isSaving}
                        title="Remove default"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                      >
                        <Star className="h-3 w-3 fill-current" /> Default
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(account)}
                        disabled={isSaving}
                        title="Set as default"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <StarOff className="h-3 w-3" /> Set default
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(account)}
                        title="Edit account"
                        className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(account)}
                        title="Delete account"
                        className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                    <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {editing.id ? 'Edit Sending Account' : 'Add Sending Account'}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Configure the mailbox and credentials used for outbound email.
                    </p>
                  </div>
                </div>
                <button onClick={closeEditor} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              {testResult && (
                <div className={`mb-4 border rounded-lg p-3 flex items-start gap-2 text-sm ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
                }`}>
                  {testResult.success ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Account Name *
                    </label>
                    <input
                      type="text"
                      value={editing.account_name}
                      onChange={(e) => updateField('account_name', e.target.value)}
                      placeholder="e.g. Billing, Support, No-Reply"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Provider *
                    </label>
                    <CustomDropdown
                      value={editing.provider}
                      onChange={(val) => updateField('provider', val as 'office365' | 'gmail')}
                      options={[
                        { value: 'office365', label: 'Office 365' },
                        { value: 'gmail', label: 'Gmail' },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    From Email *
                  </label>
                  <input
                    type="email"
                    value={editing.from_email}
                    onChange={(e) => updateField('from_email', e.target.value)}
                    placeholder="sender@company.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Address that appears in the "From" field of outbound emails.
                  </p>
                </div>

                {editing.provider === 'office365' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tenant ID *
                      </label>
                      <input
                        type="text"
                        value={editing.tenant_id}
                        onChange={(e) => updateField('tenant_id', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Client ID *
                      </label>
                      <input
                        type="text"
                        value={editing.client_id}
                        onChange={(e) => updateField('client_id', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Client Secret *
                      </label>
                      <input
                        type="password"
                        value={editing.client_secret}
                        onChange={(e) => updateField('client_secret', e.target.value)}
                        placeholder="Client secret value"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Gmail Client ID *
                      </label>
                      <input
                        type="text"
                        value={editing.gmail_client_id}
                        onChange={(e) => updateField('gmail_client_id', e.target.value)}
                        placeholder="xxxxxxxxxx.apps.googleusercontent.com"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Gmail Client Secret *
                      </label>
                      <input
                        type="password"
                        value={editing.gmail_client_secret}
                        onChange={(e) => updateField('gmail_client_secret', e.target.value)}
                        placeholder="Gmail OAuth client secret"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Gmail Refresh Token *
                      </label>
                      <input
                        type="password"
                        value={editing.gmail_refresh_token}
                        onChange={(e) => updateField('gmail_refresh_token', e.target.value)}
                        placeholder="OAuth refresh token"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.is_default}
                    onChange={(e) => updateField('is_default', e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Use this account as the default when a Workflow v2 email step does not pick one
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleTest}
                  disabled={isTesting}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <Zap className="h-4 w-4" />
                  <span>{isTesting ? 'Testing...' : 'Test Credentials'}</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={closeEditor}
                    disabled={isSaving}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isSaving ? 'Saving...' : 'Save Account'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded-lg">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Delete sending account?</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This can't be undone.</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                Any Workflow v2 email step referencing <span className="font-semibold">{confirmDelete.account_name}</span> will
                fall back to the default provider on the next run.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={isSaving}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isSaving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
