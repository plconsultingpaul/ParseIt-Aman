import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Pencil as Edit, Users, Shield, Eye, EyeOff, FileText, DollarSign, AlertCircle, BookUser, Mail, Send, Clock, MapPin, Receipt, ClipboardList } from 'lucide-react';
import type { User, Client } from '../../types';
import { supabase } from '../../lib/supabase';
import Select from '../common/Select';
import InvitationEmailTemplateEditor from './InvitationEmailTemplateEditor';
import PasswordResetTemplateEditor from './PasswordResetTemplateEditor';

const formatLastLogin = (lastLogin: string | undefined): string => {
  if (!lastLogin) return 'Never';

  const loginDate = new Date(lastLogin);
  const now = new Date();
  const diffMs = now.getTime() - loginDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return loginDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: loginDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

const formatInvitationSent = (sentAt: string | undefined, count: number | undefined): string => {
  if (!sentAt) return 'Never';

  const sentDate = new Date(sentAt);
  const now = new Date();
  const diffMs = now.getTime() - sentDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let timeStr: string;
  if (diffMins < 1) timeStr = 'Just now';
  else if (diffMins < 60) timeStr = `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  else if (diffHours < 24) timeStr = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  else if (diffDays < 7) timeStr = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  else {
    timeStr = sentDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: sentDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  if (count && count > 1) {
    return `${timeStr} (x${count})`;
  }
  return timeStr;
};

interface ClientUsersManagementSettingsProps {
  currentUser: User;
  getAllUsers: () => Promise<User[]>;
  createUser: (username: string, password: string, isAdmin: boolean, role: 'admin' | 'user' | 'vendor' | 'client', email?: string, name?: string) => Promise<{ success: boolean; message: string }>;
  updateUser: (userId: string, updates: { isAdmin?: boolean; isActive?: boolean; permissions?: any; role?: 'admin' | 'user' | 'vendor' | 'client'; currentZone?: string; clientId?: string; isClientAdmin?: boolean; hasOrderEntryAccess?: boolean; hasRateQuoteAccess?: boolean; hasTrackTraceAccess?: boolean; hasInvoiceAccess?: boolean; email?: string; name?: string }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  preselectedClientId?: string | null;
  onPreselectedClientHandled?: () => void;
}

export default function ClientUsersManagementSettings({
  currentUser,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserPassword,
  preselectedClientId,
  onPreselectedClientHandled
}: ClientUsersManagementSettingsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientUsers, setClientUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);
  const [showForgotUsernameTemplateModal, setShowForgotUsernameTemplateModal] = useState(false);
  const [showResetPasswordTemplateModal, setShowResetPasswordTemplateModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    password: '',
    email: '',
    isClientAdmin: false,
    hasOrderEntryAccess: false,
    hasRateQuoteAccess: false,
    hasAddressBookAccess: false,
    hasTrackTraceAccess: false,
    hasInvoiceAccess: false,
    hasSubmissionsAccess: false
  });
  const [editUser, setEditUser] = useState({
    password: '',
    name: '',
    email: '',
    isClientAdmin: false,
    hasOrderEntryAccess: false,
    hasRateQuoteAccess: false,
    hasAddressBookAccess: false,
    hasTrackTraceAccess: false,
    hasInvoiceAccess: false,
    hasSubmissionsAccess: false,
    isActive: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser.role === 'client' && currentUser.clientId) {
      setSelectedClientId(currentUser.clientId);
      loadOwnClient();
    } else {
      loadClients();
    }
  }, []);

  const loadOwnClient = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', currentUser.clientId!)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setClients([{
          id: data.id,
          clientName: data.client_name,
          clientId: data.client_id,
          isActive: data.is_active,
          hasOrderEntryAccess: data.has_order_entry_access,
          hasRateQuoteAccess: data.has_rate_quote_access,
          hasAddressBookAccess: data.has_address_book_access,
          hasTrackTraceAccess: data.has_track_trace_access,
          hasInvoiceAccess: data.has_invoice_access,
          hasSubmissionsAccess: data.has_submissions_access,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        }]);
      }
    } catch (error) {
      console.error('Failed to load client:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (preselectedClientId && clients.length > 0) {
      const clientExists = clients.some(c => c.id === preselectedClientId);
      if (clientExists) {
        setSelectedClientId(preselectedClientId);
        onPreselectedClientHandled?.();
      }
    }
  }, [preselectedClientId, clients]);

  useEffect(() => {
    if (selectedClientId) {
      loadClientUsers();
    }
  }, [selectedClientId]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('client_name', { ascending: true });

      if (error) throw error;

      const clientsData: Client[] = (data || []).map(client => ({
        id: client.id,
        clientName: client.client_name,
        clientId: client.client_id,
        isActive: client.is_active,
        hasOrderEntryAccess: client.has_order_entry_access,
        hasRateQuoteAccess: client.has_rate_quote_access,
        hasAddressBookAccess: client.has_address_book_access,
        hasTrackTraceAccess: client.has_track_trace_access,
        hasInvoiceAccess: client.has_invoice_access,
        hasSubmissionsAccess: client.has_submissions_access,
        createdAt: client.created_at,
        updatedAt: client.updated_at
      }));

      setClients(clientsData);
      if (clientsData.length > 0 && !selectedClientId) {
        setSelectedClientId(clientsData[0].id);
      }
    } catch (error) {
      console.error('Failed to load clients:', error);
      setError('Failed to load clients. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadClientUsers = async () => {
    if (!selectedClientId) return;

    try {
      const allUsers = await getAllUsers();
      const filteredUsers = allUsers.filter(u => u.clientId === selectedClientId);
      setClientUsers(filteredUsers);
    } catch (error) {
      console.error('Failed to load client users:', error);
      setError('Failed to load users. Please try again.');
    }
  };

  const handleAddUser = async () => {
    if (!selectedClientId) {
      setError('Please select a client first');
      return;
    }

    if (!newUser.username.trim() || !newUser.password.trim()) {
      setError('Username and password are required');
      return;
    }

    const selectedClient = clients.find(c => c.id === selectedClientId);
    if (!selectedClient) {
      setError('Invalid client selected');
      return;
    }

    if (newUser.hasOrderEntryAccess && !selectedClient.hasOrderEntryAccess) {
      setError('Cannot grant Order Entry access - client does not have this feature enabled');
      return;
    }

    if (newUser.hasRateQuoteAccess && !selectedClient.hasRateQuoteAccess) {
      setError('Cannot grant Rate Quote access - client does not have this feature enabled');
      return;
    }

    if (newUser.hasAddressBookAccess && !selectedClient.hasAddressBookAccess && !newUser.isClientAdmin) {
      setError('Cannot grant Address Book access - client does not have this feature enabled');
      return;
    }

    if (newUser.hasTrackTraceAccess && !selectedClient.hasTrackTraceAccess) {
      setError('Cannot grant Track & Trace access - client does not have this feature enabled');
      return;
    }

    if (newUser.hasInvoiceAccess && !selectedClient.hasInvoiceAccess) {
      setError('Cannot grant Invoice access - client does not have this feature enabled');
      return;
    }

    if (newUser.hasSubmissionsAccess && !selectedClient.hasSubmissionsAccess) {
      setError('Cannot grant Submissions access - client does not have this feature enabled');
      return;
    }

    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const result = await createUser(
        newUser.username.trim(),
        newUser.password,
        false,
        'client',
        newUser.email.trim() || undefined,
        newUser.name.trim() || undefined
      );

      if (result.success) {
        const allUsers = await getAllUsers();
        const createdUser = allUsers.find(u => u.username === newUser.username.trim());

        if (createdUser) {
          await updateUser(createdUser.id, {
            clientId: selectedClientId,
            isClientAdmin: newUser.isClientAdmin,
            hasOrderEntryAccess: newUser.hasOrderEntryAccess,
            hasRateQuoteAccess: newUser.hasRateQuoteAccess,
            hasAddressBookAccess: newUser.isClientAdmin ? true : newUser.hasAddressBookAccess,
            hasTrackTraceAccess: newUser.hasTrackTraceAccess,
            hasInvoiceAccess: newUser.hasInvoiceAccess,
            hasSubmissionsAccess: newUser.hasSubmissionsAccess,
            role: 'client'
          });
        }

        setSuccess('User created successfully');
        setShowAddUserModal(false);
        setNewUser({
          username: '',
          name: '',
          password: '',
          email: '',
          isClientAdmin: false,
          hasOrderEntryAccess: false,
          hasRateQuoteAccess: false,
          hasAddressBookAccess: false,
          hasTrackTraceAccess: false,
          hasInvoiceAccess: false,
          hasSubmissionsAccess: false
        });
        await loadClientUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      setError('Failed to create user. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditUser = (user: User) => {
    setUserToEdit(user);
    setEditUser({
      password: '',
      name: user.name || '',
      email: user.email || '',
      isClientAdmin: user.isClientAdmin || false,
      hasOrderEntryAccess: user.hasOrderEntryAccess || false,
      hasRateQuoteAccess: user.hasRateQuoteAccess || false,
      hasAddressBookAccess: user.hasAddressBookAccess || false,
      hasTrackTraceAccess: user.hasTrackTraceAccess || false,
      hasInvoiceAccess: user.hasInvoiceAccess || false,
      hasSubmissionsAccess: user.hasSubmissionsAccess || false,
      isActive: user.isActive
    });
    setShowEditUserModal(true);
    setError('');
  };

  const handleUpdateUser = async () => {
    if (!userToEdit) return;

    const selectedClient = clients.find(c => c.id === selectedClientId);
    if (!selectedClient) {
      setError('Invalid client selected');
      return;
    }

    if (editUser.hasOrderEntryAccess && !selectedClient.hasOrderEntryAccess) {
      setError('Cannot grant Order Entry access - client does not have this feature enabled');
      return;
    }

    if (editUser.hasRateQuoteAccess && !selectedClient.hasRateQuoteAccess) {
      setError('Cannot grant Rate Quote access - client does not have this feature enabled');
      return;
    }

    if (editUser.hasAddressBookAccess && !selectedClient.hasAddressBookAccess && !editUser.isClientAdmin) {
      setError('Cannot grant Address Book access - client does not have this feature enabled');
      return;
    }

    if (editUser.hasTrackTraceAccess && !selectedClient.hasTrackTraceAccess) {
      setError('Cannot grant Track & Trace access - client does not have this feature enabled');
      return;
    }

    if (editUser.hasInvoiceAccess && !selectedClient.hasInvoiceAccess) {
      setError('Cannot grant Invoice access - client does not have this feature enabled');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      let passwordUpdateSuccess = true;
      if (editUser.password.trim()) {
        const passwordResult = await updateUserPassword(userToEdit.id, editUser.password);
        passwordUpdateSuccess = passwordResult.success;
        if (!passwordUpdateSuccess) {
          setError(passwordResult.message);
          setIsSaving(false);
          return;
        }
      }

      const updateResult = await updateUser(userToEdit.id, {
        name: editUser.name.trim() || undefined,
        email: editUser.email.trim() || undefined,
        isClientAdmin: editUser.isClientAdmin,
        hasOrderEntryAccess: editUser.hasOrderEntryAccess,
        hasRateQuoteAccess: editUser.hasRateQuoteAccess,
        hasAddressBookAccess: editUser.isClientAdmin ? true : editUser.hasAddressBookAccess,
        hasTrackTraceAccess: editUser.hasTrackTraceAccess,
        hasInvoiceAccess: editUser.hasInvoiceAccess,
        hasSubmissionsAccess: editUser.hasSubmissionsAccess,
        isActive: editUser.isActive
      });

      if (updateResult.success) {
        setSuccess(`User "${userToEdit.username}" updated successfully`);
        setShowEditUserModal(false);
        setUserToEdit(null);
        await loadClientUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(updateResult.message);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      setError('Failed to update user. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setShowDeleteUserModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteUser(userToDelete.id);

      if (result.success) {
        setSuccess(`User "${userToDelete.username}" deleted successfully`);
        setShowDeleteUserModal(false);
        setUserToDelete(null);
        await loadClientUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      setError('Failed to delete user. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSendRegistrationEmail = async (user: User) => {
    if (!user.email) {
      setError('Cannot send registration email - user has no email address');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setSendingEmail(user.id);
    setError('');
    setSuccess('');

    try {
      const { data, error } = await supabase.functions.invoke('send-registration-email', {
        body: {
          userId: user.id,
          templateType: 'client'
        }
      });

      if (error) {
        let errorMessage = 'Failed to send registration email';
        try {
          if (error.context && error.context instanceof Response) {
            const errorBody = await error.context.json();
            errorMessage = errorBody.message || errorMessage;
          }
        } catch {}
        setError(errorMessage);
        setTimeout(() => setError(''), 5000);
        return;
      }

      if (data.success) {
        setSuccess(`Registration email sent to ${user.email}`);
        await loadClientUsers();
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(data.message || 'Failed to send registration email');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error: any) {
      console.error('Failed to send registration email:', error);
      setError(error.message || 'Failed to send registration email');
      setTimeout(() => setError(''), 5000);
    } finally {
      setSendingEmail(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600">Loading users...</span>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Clients Available</h3>
        <p className="text-gray-600 dark:text-gray-400">Please create a client first before adding users.</p>
      </div>
    );
  }

  const selectedClient = clients.find(c => c.id === selectedClientId);

  return (
    <div className="space-y-6">
      {showAddUserModal && selectedClient && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 my-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Plus className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Add User</h3>
              <p className="text-gray-600 dark:text-gray-400">Create a new user for {selectedClient.clientName}</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddUser(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter username"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name (Optional)
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter full name"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter password"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="newUserClientAdmin"
                  checked={newUser.isClientAdmin}
                  onChange={(e) => {
                    const isAdmin = e.target.checked;
                    setNewUser(prev => ({
                      ...prev,
                      isClientAdmin: isAdmin,
                      hasAddressBookAccess: isAdmin ? true : prev.hasAddressBookAccess
                    }));
                  }}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="newUserClientAdmin" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <span>Client Admin</span>
                </label>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Feature Access</h4>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newUserOrderEntry"
                      checked={newUser.hasOrderEntryAccess}
                      onChange={(e) => setNewUser(prev => ({ ...prev, hasOrderEntryAccess: e.target.checked }))}
                      disabled={!selectedClient.hasOrderEntryAccess}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <label htmlFor="newUserOrderEntry" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasOrderEntryAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <FileText className="h-4 w-4" />
                      <span>Order Entry Access</span>
                      {!selectedClient.hasOrderEntryAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newUserRateQuote"
                      checked={newUser.hasRateQuoteAccess}
                      onChange={(e) => setNewUser(prev => ({ ...prev, hasRateQuoteAccess: e.target.checked }))}
                      disabled={!selectedClient.hasRateQuoteAccess}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <label htmlFor="newUserRateQuote" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasRateQuoteAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <DollarSign className="h-4 w-4" />
                      <span>Rate Quote Access</span>
                      {!selectedClient.hasRateQuoteAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newUserAddressBook"
                      checked={newUser.hasAddressBookAccess || newUser.isClientAdmin}
                      onChange={(e) => setNewUser(prev => ({ ...prev, hasAddressBookAccess: e.target.checked }))}
                      disabled={!selectedClient.hasAddressBookAccess || newUser.isClientAdmin}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                      title={newUser.isClientAdmin ? "Client Admins automatically have Address Book access" : ""}
                    />
                    <label htmlFor="newUserAddressBook" className={`text-sm flex items-center space-x-2 ${(!selectedClient.hasAddressBookAccess && !newUser.isClientAdmin) ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <BookUser className="h-4 w-4" />
                      <span>Address Book Access</span>
                      {newUser.isClientAdmin && <span className="text-xs text-purple-600 dark:text-purple-400">(Auto-granted for Client Admins)</span>}
                      {!newUser.isClientAdmin && !selectedClient.hasAddressBookAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newUserTrackTrace"
                      checked={newUser.hasTrackTraceAccess}
                      onChange={(e) => setNewUser(prev => ({ ...prev, hasTrackTraceAccess: e.target.checked }))}
                      disabled={!selectedClient.hasTrackTraceAccess}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <label htmlFor="newUserTrackTrace" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasTrackTraceAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <MapPin className="h-4 w-4" />
                      <span>Track & Trace Access</span>
                      {!selectedClient.hasTrackTraceAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newUserInvoice"
                      checked={newUser.hasInvoiceAccess}
                      onChange={(e) => setNewUser(prev => ({ ...prev, hasInvoiceAccess: e.target.checked }))}
                      disabled={!selectedClient.hasInvoiceAccess}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <label htmlFor="newUserInvoice" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasInvoiceAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <Receipt className="h-4 w-4" />
                      <span>Invoice Access</span>
                      {!selectedClient.hasInvoiceAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="newUserSubmissions"
                      checked={newUser.hasSubmissionsAccess}
                      onChange={(e) => setNewUser(prev => ({ ...prev, hasSubmissionsAccess: e.target.checked }))}
                      disabled={!selectedClient.hasSubmissionsAccess}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <label htmlFor="newUserSubmissions" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasSubmissionsAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <ClipboardList className="h-4 w-4" />
                      <span>Submissions Access</span>
                      {!selectedClient.hasSubmissionsAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isCreating ? 'Creating...' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setNewUser({
                      username: '',
                      name: '',
                      password: '',
                      email: '',
                      isClientAdmin: false,
                      hasOrderEntryAccess: false,
                      hasRateQuoteAccess: false,
                      hasAddressBookAccess: false,
                      hasTrackTraceAccess: false,
                      hasInvoiceAccess: false,
                      hasSubmissionsAccess: false
                    });
                    setError('');
                    setShowPassword(false);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {showEditUserModal && userToEdit && selectedClient && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 my-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Edit className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Edit User</h3>
              <p className="text-gray-600 dark:text-gray-400">Update user "{userToEdit.username}"</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Password (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editUser.password}
                    onChange={(e) => setEditUser(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Leave blank to keep current"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showEditPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={editUser.name}
                  onChange={(e) => setEditUser(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter full name"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editUser.email}
                  onChange={(e) => setEditUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="editUserActive"
                  checked={editUser.isActive}
                  onChange={(e) => setEditUser(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="editUserActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Active
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="editUserClientAdmin"
                  checked={editUser.isClientAdmin}
                  onChange={(e) => {
                    const isAdmin = e.target.checked;
                    setEditUser(prev => ({
                      ...prev,
                      isClientAdmin: isAdmin,
                      hasAddressBookAccess: isAdmin ? true : prev.hasAddressBookAccess
                    }));
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="editUserClientAdmin" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span>Client Admin</span>
                </label>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Feature Access</h4>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="editUserOrderEntry"
                      checked={editUser.hasOrderEntryAccess}
                      onChange={(e) => setEditUser(prev => ({ ...prev, hasOrderEntryAccess: e.target.checked }))}
                      disabled={!selectedClient.hasOrderEntryAccess}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor="editUserOrderEntry" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasOrderEntryAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <FileText className="h-4 w-4" />
                      <span>Order Entry Access</span>
                      {!selectedClient.hasOrderEntryAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="editUserRateQuote"
                      checked={editUser.hasRateQuoteAccess}
                      onChange={(e) => setEditUser(prev => ({ ...prev, hasRateQuoteAccess: e.target.checked }))}
                      disabled={!selectedClient.hasRateQuoteAccess}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor="editUserRateQuote" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasRateQuoteAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <DollarSign className="h-4 w-4" />
                      <span>Rate Quote Access</span>
                      {!selectedClient.hasRateQuoteAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="editUserAddressBook"
                      checked={editUser.hasAddressBookAccess || editUser.isClientAdmin}
                      onChange={(e) => setEditUser(prev => ({ ...prev, hasAddressBookAccess: e.target.checked }))}
                      disabled={!selectedClient.hasAddressBookAccess || editUser.isClientAdmin}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                      title={editUser.isClientAdmin ? "Client Admins automatically have Address Book access" : ""}
                    />
                    <label htmlFor="editUserAddressBook" className={`text-sm flex items-center space-x-2 ${(!selectedClient.hasAddressBookAccess && !editUser.isClientAdmin) ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <BookUser className="h-4 w-4" />
                      <span>Address Book Access</span>
                      {editUser.isClientAdmin && <span className="text-xs text-blue-600 dark:text-blue-400">(Auto-granted for Client Admins)</span>}
                      {!editUser.isClientAdmin && !selectedClient.hasAddressBookAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="editUserTrackTrace"
                      checked={editUser.hasTrackTraceAccess}
                      onChange={(e) => setEditUser(prev => ({ ...prev, hasTrackTraceAccess: e.target.checked }))}
                      disabled={!selectedClient.hasTrackTraceAccess}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor="editUserTrackTrace" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasTrackTraceAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <MapPin className="h-4 w-4" />
                      <span>Track & Trace Access</span>
                      {!selectedClient.hasTrackTraceAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="editUserInvoice"
                      checked={editUser.hasInvoiceAccess}
                      onChange={(e) => setEditUser(prev => ({ ...prev, hasInvoiceAccess: e.target.checked }))}
                      disabled={!selectedClient.hasInvoiceAccess}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor="editUserInvoice" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasInvoiceAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <Receipt className="h-4 w-4" />
                      <span>Invoice Access</span>
                      {!selectedClient.hasInvoiceAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="editUserSubmissions"
                      checked={editUser.hasSubmissionsAccess}
                      onChange={(e) => setEditUser(prev => ({ ...prev, hasSubmissionsAccess: e.target.checked }))}
                      disabled={!selectedClient.hasSubmissionsAccess}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor="editUserSubmissions" className={`text-sm flex items-center space-x-2 ${!selectedClient.hasSubmissionsAccess ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      <ClipboardList className="h-4 w-4" />
                      <span>Submissions Access</span>
                      {!selectedClient.hasSubmissionsAccess && <span className="text-xs">(Not available for client)</span>}
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handleUpdateUser}
                  disabled={isSaving}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isSaving ? 'Updating...' : 'Update User'}
                </button>
                <button
                  onClick={() => {
                    setShowEditUserModal(false);
                    setUserToEdit(null);
                    setError('');
                    setShowEditPassword(false);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showDeleteUserModal && userToDelete && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete User</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to delete user <strong>"{userToDelete.username}"</strong>?
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span className="font-semibold text-red-800 dark:text-red-300">Warning</span>
              </div>
              <p className="text-red-700 dark:text-red-400 text-sm">This action cannot be undone. The user will lose access immediately.</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={confirmDeleteUser}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isDeleting ? 'Deleting...' : 'Delete User'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteUserModal(false);
                  setUserToDelete(null);
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">User Management</h3>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Manage client users and their access permissions</p>
      </div>

      <div className="w-full md:w-96">
        {currentUser.role === 'client' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</label>
            <div className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
              {clients.length > 0
                ? `${clients.find(c => c.id === selectedClientId)?.clientName || ''} (${clients.find(c => c.id === selectedClientId)?.clientId || ''})`
                : selectedClientId
                  ? 'Loading...'
                  : 'No client assigned'}
            </div>
          </div>
        ) : (
          <Select
            label="Select Client"
            value={selectedClientId || ''}
            onValueChange={(value) => setSelectedClientId(value)}
            options={clients.map((client) => ({
              value: client.id,
              label: `${client.clientName} (${client.clientId})`
            }))}
          />
        )}
      </div>

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">{success}</p>
        </div>
      )}

      {error && !showAddUserModal && !showEditUserModal && !showDeleteUserModal && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {selectedClient && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Users for {selectedClient.clientName}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{clientUsers.length} user{clientUsers.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center space-x-3">
              {currentUser.role === 'admin' && (
                <>
                  <button
                    onClick={() => setShowEmailTemplateModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Edit Invite Email</span>
                  </button>
                  <button
                    onClick={() => setShowForgotUsernameTemplateModal(true)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Edit Forgot Username Email</span>
                  </button>
                  <button
                    onClick={() => setShowResetPasswordTemplateModal(true)}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Edit Reset Password Email</span>
                  </button>
                </>
              )}
              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add User</span>
              </button>
            </div>
          </div>

          {clientUsers.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Users className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Users Yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Add the first user for this client.</p>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Add First User</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Username</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Access</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Invite Sent</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Last Login</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {clientUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">{user.username}</td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{user.email || '-'}</td>
                      <td className="py-3 px-4">
                        {user.isClientAdmin && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-200 text-xs font-medium rounded-full flex items-center space-x-1 w-fit">
                            <Shield className="h-3 w-3" />
                            <span>Admin</span>
                          </span>
                        )}
                        {!user.isClientAdmin && (
                          <span className="text-sm text-gray-600 dark:text-gray-400">User</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {user.hasOrderEntryAccess && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs rounded-full">OE</span>
                          )}
                          {user.hasRateQuoteAccess && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs rounded-full">RQ</span>
                          )}
                          {user.hasAddressBookAccess && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-xs rounded-full">AB</span>
                          )}
                          {user.hasTrackTraceAccess && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs rounded-full">TT</span>
                          )}
                          {user.hasInvoiceAccess && (
                            <span className="px-2 py-1 bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 text-xs rounded-full">INV</span>
                          )}
                          {user.hasSubmissionsAccess && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200 text-xs rounded-full">SUB</span>
                          )}
                          {!user.hasOrderEntryAccess && !user.hasRateQuoteAccess && !user.hasAddressBookAccess && !user.hasTrackTraceAccess && !user.hasInvoiceAccess && !user.hasSubmissionsAccess && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">None</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.isActive
                            ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Mail className="h-4 w-4 flex-shrink-0" />
                          <span>{formatInvitationSent(user.invitationSentAt, user.invitationSentCount)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="h-4 w-4 flex-shrink-0" />
                          <span>{formatLastLogin(user.lastLogin)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {user.email && (
                            <button
                              onClick={() => handleSendRegistrationEmail(user)}
                              disabled={sendingEmail === user.id}
                              className="p-1 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Send registration email"
                            >
                              {sendingEmail === user.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors duration-200"
                            title="Edit user"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                            title="Delete user"
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
        </div>
      )}

      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">User Management Information</h4>
        <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-1">
          <li>• Each user belongs to one client company and has individual credentials</li>
          <li>• Client Admins can manage users within their organization</li>
          <li>• Users can only be granted access to features enabled at the client level</li>
          <li>• Order Entry (OE) and Rate Quote (RQ) access are controlled individually per user</li>
          <li>• Click the send icon next to a user to send an invitation email with password setup link</li>
        </ul>
      </div>

      {showEmailTemplateModal && (
        <InvitationEmailTemplateEditor
          onClose={() => setShowEmailTemplateModal(false)}
          templateType="client"
        />
      )}

      <PasswordResetTemplateEditor
        isOpen={showForgotUsernameTemplateModal}
        onClose={() => setShowForgotUsernameTemplateModal(false)}
        templateType="client_forgot_username"
      />

      <PasswordResetTemplateEditor
        isOpen={showResetPasswordTemplateModal}
        onClose={() => setShowResetPasswordTemplateModal(false)}
        templateType="client_reset_password"
      />
    </div>
  );
}
