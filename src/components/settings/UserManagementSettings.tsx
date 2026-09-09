import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Save, Users, Shield, User as UserIcon, Settings, FileText, Server, Key, Mail, Filter, Database, GitBranch, Brain, RefreshCw, Send, Clock, Play, Package, Building2, ClipboardCheck, BarChart3, Bell, Building, Truck, MapPin, ClipboardList, ScrollText, CheckCircle, Inbox, FileImage, RotateCcw } from 'lucide-react';
import type { User, ExtractionType, TransformationType } from '../../types';
import Select from '../common/Select';
import InvitationEmailTemplateEditor from './InvitationEmailTemplateEditor';
import PasswordResetTemplateEditor from './PasswordResetTemplateEditor';
import { supabase } from '../../lib/supabase';

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

interface ExecuteCategory {
  id: string;
  name: string;
  displayOrder: number;
}

interface UserManagementSettingsProps {
  currentUser: User;
  getAllUsers: () => Promise<User[]>;
  createUser: (username: string, password: string | undefined, isAdmin: boolean, role: 'admin' | 'user' | 'vendor', email?: string, name?: string) => Promise<{ success: boolean; message: string }>;
  updateUser: (userId: string, updates: { isAdmin?: boolean; isActive?: boolean; permissions?: any }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
  extractionTypes: ExtractionType[];
  getUserExtractionTypes: (userId: string) => Promise<string[]>;
  updateUserExtractionTypes: (userId: string, extractionTypeIds: string[]) => Promise<{ success: boolean; message: string }>;
  transformationTypes: TransformationType[];
  getUserTransformationTypes: (userId: string) => Promise<string[]>;
  updateUserTransformationTypes: (userId: string, transformationTypeIds: string[]) => Promise<{ success: boolean; message: string }>;
  getUserExecuteCategories: (userId: string) => Promise<string[]>;
  updateUserExecuteCategories: (userId: string, categoryIds: string[]) => Promise<{ success: boolean; message: string }>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

export default function UserManagementSettings({
  currentUser,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  extractionTypes = [],
  getUserExtractionTypes,
  updateUserExtractionTypes,
  transformationTypes = [],
  getUserTransformationTypes,
  updateUserTransformationTypes,
  getUserExecuteCategories,
  updateUserExecuteCategories,
  updateUserPassword
}: UserManagementSettingsProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState('');
  const [createdUserEmail, setCreatedUserEmail] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [newUserPermissions, setNewUserPermissions] = useState<Record<string, boolean>>({});
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [activePermCategory, setActivePermCategory] = useState('pages');
  const [newUserActivePermCategory, setNewUserActivePermCategory] = useState('pages');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    name: '',
    isAdmin: false,
    role: 'user' as 'admin' | 'user' | 'vendor'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showUploadModeModal, setShowUploadModeModal] = useState(false);
  const [userForUploadMode, setUserForUploadMode] = useState<User | null>(null);
  const [isUpdatingUploadMode, setIsUpdatingUploadMode] = useState(false);
  const [showCurrentZoneModal, setShowCurrentZoneModal] = useState(false);
  const [userForCurrentZone, setUserForCurrentZone] = useState<User | null>(null);
  const [isUpdatingCurrentZone, setIsUpdatingCurrentZone] = useState(false);
  const [newCurrentZone, setNewCurrentZone] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [userForEmail, setUserForEmail] = useState<User | null>(null);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [userForName, setUserForName] = useState<User | null>(null);
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedExtractionTypeIds, setSelectedExtractionTypeIds] = useState<string[]>([]);
  const [selectedTransformationTypeIds, setSelectedTransformationTypeIds] = useState<string[]>([]);
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);
  const [showForgotUsernameTemplateModal, setShowForgotUsernameTemplateModal] = useState(false);
  const [showResetPasswordTemplateModal, setShowResetPasswordTemplateModal] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [userForResetPassword, setUserForResetPassword] = useState<User | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [selectedExecuteCategoryIds, setSelectedExecuteCategoryIds] = useState<string[]>([]);
  const [executeCategories, setExecuteCategories] = useState<ExecuteCategory[]>([]);
  const [newUserExtractionTypeIds, setNewUserExtractionTypeIds] = useState<string[]>([]);
  const [newUserTransformationTypeIds, setNewUserTransformationTypeIds] = useState<string[]>([]);
  const [newUserExecuteCategoryIds, setNewUserExecuteCategoryIds] = useState<string[]>([]);

  const permissionCategories = [
    {
      id: 'pages', label: 'Pages', icon: FileText,
      permissions: [
        { key: 'extractPage', label: 'Extract Page', icon: FileText, description: 'Access the Extract page' },
        { key: 'transformPage', label: 'Transform Page', icon: RefreshCw, description: 'Access the Transform page' },
        { key: 'executePage', label: 'Execute Page', icon: Play, description: 'Access the Execute page' },
        { key: 'inboxPage', label: 'Inbox Page', icon: Inbox, description: 'Access the Inbox page' },
      ]
    },
    {
      id: 'typeSetup', label: 'Type Setup', icon: Database,
      permissions: [
        { key: 'extractionTypes', label: 'Extraction Types', icon: FileText, description: 'Manage extraction types' },
        { key: 'transformationTypes', label: 'Transformation Types', icon: RefreshCw, description: 'Manage transformation types' },
        { key: 'executeSetup', label: 'Execute Setup', icon: Play, description: 'Configure execute buttons' },
        { key: 'workflowManagement', label: 'Workflows Setup', icon: GitBranch, description: 'Create and manage workflows' },
      ]
    },
    {
      id: 'vendorSetup', label: 'Vendor Setup', icon: Package,
      permissions: [
        { key: 'vendorSetup', label: 'Vendor Management', icon: Package, description: 'Manage vendor accounts' },
        { key: 'ordersConfiguration', label: 'Orders Configuration', icon: ClipboardList, description: 'Configure orders display settings' },
      ]
    },
    {
      id: 'clientSetup', label: 'Client Setup', icon: Building2,
      permissions: [
        { key: 'clientManagement', label: 'Client Management', icon: Building2, description: 'Manage client companies' },
        { key: 'clientUserManagement', label: 'User Management', icon: Users, description: 'Manage client users' },
        { key: 'orderEntry', label: 'Order Entry', icon: FileText, description: 'Order entry configuration' },
        { key: 'submissions', label: 'Submissions', icon: ScrollText, description: 'View order submissions' },
        { key: 'trackTrace', label: 'Track & Trace', icon: MapPin, description: 'Track & Trace configuration' },
      ]
    },
    {
      id: 'logs', label: 'Logs', icon: BarChart3,
      permissions: [
        { key: 'extractionLogs', label: 'Processing Logs', icon: FileText, description: 'View extraction and transformation logs' },
        { key: 'workflowLogs', label: 'Workflow Logs', icon: GitBranch, description: 'View workflow execution logs' },
        { key: 'emailPolling', label: 'Email Polling', icon: Clock, description: 'View email monitoring activity' },
        { key: 'processedEmails', label: 'Processed Emails', icon: Mail, description: 'View processed email history' },
        { key: 'sftpPolling', label: 'SFTP Polling', icon: Server, description: 'View SFTP polling logs' },
      ]
    },
    {
      id: 'settings', label: 'Settings', icon: Settings,
      permissions: [
        { key: 'sftp', label: 'SFTP Settings', icon: Server, description: 'Configure SFTP connection' },
        { key: 'api', label: 'API Settings', icon: Key, description: 'Manage API keys and endpoints' },
        { key: 'emailMonitoring', label: 'Email Monitoring', icon: Mail, description: 'Configure email monitoring' },
        { key: 'emailRules', label: 'Email Rules', icon: Filter, description: 'Manage email processing rules' },
        { key: 'notificationTemplates', label: 'Notification Templates', icon: Bell, description: 'Manage notification templates' },
        { key: 'userManagement', label: 'User Management', icon: Users, description: 'Manage users and permissions' },
        { key: 'companyBranding', label: 'Company Branding', icon: Building, description: 'Customize company branding' },
      ]
    },
    {
      id: 'imaging', label: 'Imaging', icon: FileImage,
      permissions: [
        { key: 'imagingDelete', label: 'Imaging Delete', icon: Trash2, description: 'Allow deleting documents from the Imaging Indexed and Unindexed queues' },
        { key: 'imagingRerunWorkflow', label: 'Rerun Imaging Workflow', icon: RefreshCw, description: 'Allow selecting multiple indexed documents and running an Imaging Workflow v2 across them' },
        { key: 'imagingRetryEpdf', label: 'Retry ePDF Conversion', icon: RotateCcw, description: 'Allow retrying failed CloudConvert ePDF conversions on Indexed documents' },
      ]
    },
  ];

  const allPermissionOptions = permissionCategories.flatMap(cat => cat.permissions);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const userList = await getAllUsers();
      setUsers(userList);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username.trim() || !newUser.email.trim()) {
      setError('Username and email are required');
      return;
    }

    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const result = await createUser(newUser.username.trim(), undefined, newUser.isAdmin, newUser.role, newUser.email.trim(), newUser.name.trim() || undefined);

      if (result.success) {
        await loadUsers();
        const refreshedUsers = await getAllUsers();
        const created = refreshedUsers.find(u => u.username === newUser.username.trim());
        if (created) {
          setCreatedUserId(created.id);
          setCreatedUsername(created.username);
          setCreatedUserEmail(newUser.email.trim());
          const defaultPerms: Record<string, boolean> = {};
          allPermissionOptions.forEach(opt => {
            defaultPerms[opt.key] = newUser.isAdmin;
          });
          setNewUserPermissions(defaultPerms);
          setNewUserExtractionTypeIds(newUser.isAdmin ? extractionTypes.map(t => t.id) : []);
          setNewUserTransformationTypeIds(newUser.isAdmin ? transformationTypes.map(t => t.id) : []);
          try {
            const { data: categoriesData } = await supabase
              .from('execute_button_categories')
              .select('*')
              .order('display_order', { ascending: true });
            const cats = (categoriesData || []).map(c => ({
              id: c.id, name: c.name, displayOrder: c.display_order
            }));
            setExecuteCategories(cats);
            setNewUserExecuteCategoryIds(newUser.isAdmin ? cats.map(c => c.id) : []);
          } catch { setExecuteCategories([]); setNewUserExecuteCategoryIds([]); }
          setCreateStep(2);
          setError('');
        } else {
          setSuccess(result.message);
          setShowAddModal(false);
          setNewUser({ username: '', email: '', name: '', isAdmin: false, role: 'user' });
          setTimeout(() => setSuccess(''), 3000);
        }
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to create user. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveNewUserPermissions = async () => {
    if (!createdUserId) return;

    const selectedCount = Object.values(newUserPermissions).filter(Boolean).length;
    if (selectedCount === 0) {
      setError('At least one permission must be selected');
      return;
    }

    setIsUpdatingPermissions(true);
    setError('');

    try {
      const result = await updateUser(createdUserId, { permissions: newUserPermissions });
      if (result.success) {
        if (newUserPermissions.extractPage) {
          await updateUserExtractionTypes(createdUserId, newUserExtractionTypeIds);
        }
        if (newUserPermissions.transformPage) {
          await updateUserTransformationTypes(createdUserId, newUserTransformationTypeIds);
        }
        if (newUserPermissions.executePage) {
          await updateUserExecuteCategories(createdUserId, newUserExecuteCategoryIds);
        }
        setCreateStep(3);
        setError('');
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to update permissions. Please try again.');
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  const handleSendInviteAndClose = async () => {
    if (!createdUserId || !createdUserEmail) return;

    setIsSendingInvite(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('send-registration-email', {
        body: {
          userId: createdUserId,
          templateType: 'admin'
        }
      });

      if (error) throw error;

      if (data.success) {
        setSuccess(`User "${createdUsername}" created and registration email sent to ${createdUserEmail}`);
      } else {
        setSuccess(`User "${createdUsername}" created but email failed: ${data.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      setSuccess(`User "${createdUsername}" created but email failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSendingInvite(false);
      setShowAddModal(false);
      setCreateStep(1);
      setCreatedUserId(null);
      setCreatedUsername('');
      setCreatedUserEmail('');
      setNewUserPermissions({});
      setNewUserExtractionTypeIds([]);
      setNewUserTransformationTypeIds([]);
      setNewUserExecuteCategoryIds([]);
      setNewUser({ username: '', email: '', isAdmin: false, role: 'user' });
      await loadUsers();
      setTimeout(() => setSuccess(''), 5000);
    }
  };

  const handleSkipInviteAndClose = async () => {
    setSuccess(`User "${createdUsername}" created successfully`);
    setShowAddModal(false);
    setCreateStep(1);
    setCreatedUserId(null);
    setCreatedUsername('');
    setCreatedUserEmail('');
    setNewUserPermissions({});
    setNewUserExtractionTypeIds([]);
    setNewUserTransformationTypeIds([]);
    setNewUserExecuteCategoryIds([]);
    setNewUser({ username: '', email: '', isAdmin: false, role: 'user' });
    await loadUsers();
    setTimeout(() => setSuccess(''), 3000);
  };

  const toggleNewUserPermission = (key: string) => {
    setNewUserPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const newUserPermissionCount = Object.values(newUserPermissions).filter(Boolean).length;

  const handleToggleAdmin = async (user: User) => {
    // Prevent removing admin from the current user or the default admin user
    if ((user.id === currentUser.id && user.isAdmin) || (user.username === 'admin' && user.isAdmin)) {
      const message = user.username === 'admin' 
        ? 'You cannot remove admin privileges from the default admin account'
        : 'You cannot remove admin privileges from your own account';
      setError(message);
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      const newRole = !user.isAdmin ? 'admin' : 'user';
      const result = await updateUser(user.id, { 
        isAdmin: !user.isAdmin,
        role: newRole
      });
      
      if (result.success) {
        setSuccess(result.message);
        await loadUsers(); // Refresh the user list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update user. Please try again.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleToggleActive = async (user: User) => {
    // Prevent deactivating the current user or the default admin user
    if (user.id === currentUser.id) {
      setError('You cannot deactivate your own account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (user.username === 'admin') {
      setError('You cannot deactivate the default admin account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      const result = await updateUser(user.id, { isActive: !user.isActive });
      
      if (result.success) {
        setSuccess(result.message);
        await loadUsers(); // Refresh the user list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update user. Please try again.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDeleteUser = (user: User) => {
    // Prevent deleting the current user or the default admin user
    if (user.id === currentUser.id) {
      setError('You cannot delete your own account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    if (user.username === 'admin') {
      setError('You cannot delete the default admin account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteUser(userToDelete.id);
      
      if (result.success) {
        setSuccess(`User "${userToDelete.username}" has been deleted successfully`);
        setShowDeleteModal(false);
        setUserToDelete(null);
        await loadUsers(); // Refresh the user list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to delete user. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleManagePermissions = async (user: User) => {
    setSelectedUser(user);
    setActivePermCategory('pages');
    setShowPermissionsModal(true);

    try {
      const extTypes = await getUserExtractionTypes(user.id);
      setSelectedExtractionTypeIds(extTypes);
    } catch { setSelectedExtractionTypeIds([]); }

    try {
      const transTypes = await getUserTransformationTypes(user.id);
      setSelectedTransformationTypeIds(transTypes);
    } catch { setSelectedTransformationTypeIds([]); }

    try {
      const { data: categoriesData } = await supabase
        .from('execute_button_categories')
        .select('*')
        .order('display_order', { ascending: true });
      setExecuteCategories((categoriesData || []).map(c => ({
        id: c.id, name: c.name, displayOrder: c.display_order
      })));
    } catch { setExecuteCategories([]); }

    try {
      const catIds = await getUserExecuteCategories(user.id);
      setSelectedExecuteCategoryIds(catIds);
    } catch { setSelectedExecuteCategoryIds([]); }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedUser) return;

    setIsUpdatingPermissions(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateUser(selectedUser.id, {
        permissions: selectedUser.permissions,
        isAdmin: selectedUser.isAdmin,
        role: selectedUser.isAdmin ? 'admin' : 'user'
      } as any);

      if (!result.success) {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
        setIsUpdatingPermissions(false);
        return;
      }

      if (selectedUser.permissions.extractPage) {
        await updateUserExtractionTypes(selectedUser.id, selectedExtractionTypeIds);
      }
      if (selectedUser.permissions.transformPage) {
        await updateUserTransformationTypes(selectedUser.id, selectedTransformationTypeIds);
      }
      if (selectedUser.permissions.executePage) {
        await updateUserExecuteCategories(selectedUser.id, selectedExecuteCategoryIds);
      }

      setSuccess('Permissions updated successfully');
      setShowPermissionsModal(false);
      setSelectedUser(null);
      setSelectedExtractionTypeIds([]);
      setSelectedTransformationTypeIds([]);
      setSelectedExecuteCategoryIds([]);
      await loadUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Failed to update permissions. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  const handleManageUploadMode = (user: User) => {
    setUserForUploadMode(user);
    setShowUploadModeModal(true);
  };

  const handleUpdateUploadMode = async (uploadMode: 'manual' | 'auto') => {
    if (!userForUploadMode) return;

    setIsUpdatingUploadMode(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateUser(userForUploadMode.id, { 
        preferredUploadMode: uploadMode 
      });
      
      if (result.success) {
        setSuccess(`Upload mode updated to ${uploadMode === 'manual' ? 'Manual Selection' : 'AI Auto-Detect'}`);
        setShowUploadModeModal(false);
        setUserForUploadMode(null);
        await loadUsers(); // Refresh the user list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update upload mode. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsUpdatingUploadMode(false);
    }
  };

  const handleManageCurrentZone = (user: User) => {
    setUserForCurrentZone(user);
    setNewCurrentZone(user.currentZone || '');
    setShowCurrentZoneModal(true);
  };

  const handleUpdateCurrentZone = async () => {
    if (!userForCurrentZone) return;

    setIsUpdatingCurrentZone(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateUser(userForCurrentZone.id, {
        currentZone: newCurrentZone.trim()
      });

      if (result.success) {
        setSuccess(`Current zone updated to "${newCurrentZone.trim() || 'None'}"`);
        setShowCurrentZoneModal(false);
        setUserForCurrentZone(null);
        setNewCurrentZone('');
        await loadUsers(); // Refresh the user list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update current zone. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsUpdatingCurrentZone(false);
    }
  };

  const handleManageEmail = (user: User) => {
    setUserForEmail(user);
    setNewEmail(user.email || '');
    setShowEmailModal(true);
  };

  const handleUpdateEmail = async () => {
    if (!userForEmail) return;

    setIsUpdatingEmail(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateUser(userForEmail.id, {
        email: newEmail.trim() || undefined
      });

      if (result.success) {
        setSuccess(`Email updated successfully`);
        setShowEmailModal(false);
        setUserForEmail(null);
        setNewEmail('');
        await loadUsers(); // Refresh the user list
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update email. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleManageName = (user: User) => {
    setUserForName(user);
    setNewName(user.name || '');
    setShowNameModal(true);
  };

  const handleUpdateName = async () => {
    if (!userForName) return;

    setIsUpdatingName(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateUser(userForName.id, {
        name: newName.trim() || undefined
      });

      if (result.success) {
        setSuccess(`Name updated successfully`);
        setShowNameModal(false);
        setUserForName(null);
        setNewName('');
        await loadUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update name. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleResetPassword = (user: User) => {
    setUserForResetPassword(user);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetPasswordModal(true);
  };

  const handleSubmitResetPassword = async () => {
    if (!userForResetPassword) return;
    if (resetNewPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setIsResettingPassword(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateUserPassword(userForResetPassword.id, resetNewPassword);
      if (result.success) {
        setSuccess(`Password reset successfully for ${userForResetPassword.username}`);
        setShowResetPasswordModal(false);
        setUserForResetPassword(null);
        setResetNewPassword('');
        setResetConfirmPassword('');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to reset password. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const toggleExtractionType = (extractionTypeId: string) => {
    setSelectedExtractionTypeIds(prev => {
      if (prev.includes(extractionTypeId)) {
        return prev.filter(id => id !== extractionTypeId);
      } else {
        return [...prev, extractionTypeId];
      }
    });
  };


  const toggleTransformationType = (transformationTypeId: string) => {
    setSelectedTransformationTypeIds(prev => {
      if (prev.includes(transformationTypeId)) {
        return prev.filter(id => id !== transformationTypeId);
      } else {
        return [...prev, transformationTypeId];
      }
    });
  };

  const selectAllTransformationTypes = () => {
    setSelectedTransformationTypeIds(transformationTypes.map(type => type.id));
  };

  const deselectAllTransformationTypes = () => {
    setSelectedTransformationTypeIds([]);
  };


  const toggleExecuteCategory = (categoryId: string) => {
    setSelectedExecuteCategoryIds(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const selectAllExecuteCategories = () => {
    setSelectedExecuteCategoryIds(executeCategories.map(cat => cat.id));
  };

  const deselectAllExecuteCategories = () => {
    setSelectedExecuteCategoryIds([]);
  };

  const togglePermission = (permissionKey: string) => {
    if (!selectedUser) return;
    
    setSelectedUser({
      ...selectedUser,
      permissions: {
        ...selectedUser.permissions,
        [permissionKey]: !selectedUser.permissions[permissionKey as keyof typeof selectedUser.permissions]
      }
    });
  };

  const getPermissionCount = (user: User) => {
    return Object.values(user.permissions).filter(Boolean).length;
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
          templateType: 'admin'
        }
      });

      if (error) throw error;

      if (data.success) {
        setSuccess(`Registration email sent to ${user.email}`);
        await loadUsers();
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

  return (
    <div className="space-y-6">
      {/* Current Zone Modal */}
      {showCurrentZoneModal && userForCurrentZone && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Settings className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Current Zone Settings</h3>
              <p className="text-gray-600 dark:text-gray-400">Configure current zone for <strong>{userForCurrentZone.username}</strong></p>
            </div>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Zone
                </label>
                <input
                  type="text"
                  value={newCurrentZone}
                  onChange={(e) => setNewCurrentZone(e.target.value)}
                  placeholder="e.g., AT GARDEN, DOCK 5, ZONE A"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This zone will be used to filter orders in the Orders dashboard
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            <div className="flex space-x-3">
              <button
                onClick={handleUpdateCurrentZone}
                disabled={isUpdatingCurrentZone}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isUpdatingCurrentZone ? 'Updating...' : 'Update Zone'}
              </button>
              <button
                onClick={() => {
                  setShowCurrentZoneModal(false);
                  setUserForCurrentZone(null);
                  setNewCurrentZone('');
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Edit Modal */}
      {showEmailModal && userForEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Update Email Address</h3>
              <p className="text-gray-600 dark:text-gray-400">Update email for <strong>{userForEmail.username}</strong></p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave blank to remove email address
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleUpdateEmail}
                disabled={isUpdatingEmail}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isUpdatingEmail ? 'Updating...' : 'Update Email'}
              </button>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setUserForEmail(null);
                  setNewEmail('');
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name Edit Modal */}
      {showNameModal && userForName && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <UserIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Update Name</h3>
              <p className="text-gray-600 dark:text-gray-400">Update display name for <strong>{userForName.username}</strong></p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="First and Last Name"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleUpdateName}
                disabled={isUpdatingName}
                className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isUpdatingName ? 'Updating...' : 'Update Name'}
              </button>
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setUserForName(null);
                  setNewName('');
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && userForResetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-amber-100 dark:bg-amber-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Key className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Reset Password</h3>
              <p className="text-gray-600 dark:text-gray-400">Set a new password for <strong>{userForResetPassword.username}</strong></p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              {resetNewPassword && resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleSubmitResetPassword}
                disabled={isResettingPassword || !resetNewPassword || !resetConfirmPassword || resetNewPassword !== resetConfirmPassword}
                className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isResettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
              <button
                onClick={() => {
                  setShowResetPasswordModal(false);
                  setUserForResetPassword(null);
                  setResetNewPassword('');
                  setResetConfirmPassword('');
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Mode Modal */}
      {showUploadModeModal && userForUploadMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Brain className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Upload Mode Settings</h3>
              <p className="text-gray-600 dark:text-gray-400">Configure upload mode for <strong>{userForUploadMode.username}</strong></p>
            </div>

            <div className="space-y-4 mb-6">
              <div
                onClick={() => handleUpdateUploadMode('manual')}
                className="p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gray-100 dark:bg-gray-600 p-2 rounded-lg">
                      <Settings className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 dark:text-gray-200">Manual Selection</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">User manually selects extraction type for each PDF</p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    userForUploadMode?.preferredUploadMode === 'manual'
                      ? 'border-purple-500 bg-purple-500'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                  }`}>
                    {userForUploadMode?.preferredUploadMode === 'manual' && (
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleUpdateUploadMode('auto')}
                className="p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gray-100 dark:bg-gray-600 p-2 rounded-lg">
                      <Brain className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-700 dark:text-gray-200">AI Auto-Detect</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">AI automatically detects and selects the best extraction type</p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    userForUploadMode?.preferredUploadMode === 'auto'
                      ? 'border-purple-500 bg-purple-500'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                  }`}>
                    {userForUploadMode?.preferredUploadMode === 'auto' && (
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowUploadModeModal(false);
                  setUserForUploadMode(null);
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete User</h3>
              <p className="text-gray-600">
                Are you sure you want to permanently delete the user <strong>"{userToDelete.username}"</strong>?
              </p>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span className="font-semibold text-red-800">Warning</span>
              </div>
              <p className="text-red-700 text-sm">
                This action cannot be undone. All user data and permissions will be permanently removed.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
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
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedUser && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 dark:bg-blue-900/50 p-2.5 rounded-lg">
                    <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Manage Permissions</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Configure access for <strong>{selectedUser.username}</strong></p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`text-sm font-semibold ${selectedUser.isAdmin ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>Admin</span>
                  <button
                    onClick={() => {
                      const cannotRemove = (selectedUser.id === currentUser.id && selectedUser.isAdmin) || (selectedUser.username === 'admin' && selectedUser.isAdmin);
                      if (cannotRemove) return;
                      const newIsAdmin = !selectedUser.isAdmin;
                      const updatedPerms = { ...selectedUser.permissions };
                      if (newIsAdmin) {
                        allPermissionOptions.forEach(opt => {
                          (updatedPerms as Record<string, boolean>)[opt.key] = true;
                        });
                      }
                      setSelectedUser({ ...selectedUser, isAdmin: newIsAdmin, permissions: updatedPerms });
                    }}
                    disabled={(selectedUser.id === currentUser.id && selectedUser.isAdmin) || (selectedUser.username === 'admin' && selectedUser.isAdmin)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                      selectedUser.isAdmin ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                    } ${((selectedUser.id === currentUser.id && selectedUser.isAdmin) || (selectedUser.username === 'admin' && selectedUser.isAdmin)) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${selectedUser.isAdmin ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="w-52 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto flex-shrink-0">
                <nav className="p-2 space-y-1">
                  {permissionCategories.map((cat) => {
                    const CatIcon = cat.icon;
                    const enabledCount = cat.permissions.filter(
                      p => selectedUser.permissions[p.key as keyof typeof selectedUser.permissions]
                    ).length;
                    const isActive = activePermCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActivePermCategory(cat.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 flex items-center space-x-2.5 ${
                          isActive
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <CatIcon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className="text-sm font-medium flex-1 truncate">{cat.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          enabledCount === cat.permissions.length
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                            : enabledCount > 0
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {enabledCount}/{cat.permissions.length}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {permissionCategories
                  .filter(cat => cat.id === activePermCategory)
                  .map(cat => (
                    <div key={cat.id} className="space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{cat.label}</h4>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              const updated = { ...selectedUser };
                              cat.permissions.forEach(p => {
                                (updated.permissions as any)[p.key] = true;
                              });
                              setSelectedUser({ ...updated });
                            }}
                            className="text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            Select All
                          </button>
                          <button
                            onClick={() => {
                              const updated = { ...selectedUser };
                              cat.permissions.forEach(p => {
                                (updated.permissions as any)[p.key] = false;
                              });
                              setSelectedUser({ ...updated });
                            }}
                            className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      {cat.permissions.map((option) => {
                        const Icon = option.icon;
                        const isEnabled = selectedUser.permissions[option.key as keyof typeof selectedUser.permissions];
                        const hasTypeSelector = cat.id === 'pages' && ['extractPage', 'transformPage', 'executePage'].includes(option.key);
                        return (
                          <div key={option.key} className="space-y-0">
                            <div
                              className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                                isEnabled
                                  ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                              } ${isEnabled && hasTypeSelector ? 'rounded-b-none' : ''}`}
                              onClick={() => togglePermission(option.key)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className={`p-2 rounded-lg ${isEnabled ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-600'}`}>
                                    <Icon className={`h-4 w-4 ${isEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                                  </div>
                                  <div>
                                    <h4 className={`font-semibold text-sm ${isEnabled ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}`}>
                                      {option.label}
                                    </h4>
                                    <p className={`text-xs ${isEnabled ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                      {option.description}
                                    </p>
                                  </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  isEnabled ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                                }`}>
                                  {isEnabled && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                              </div>
                            </div>

                            {isEnabled && option.key === 'extractPage' && (
                              <div className="border-2 border-t-0 border-blue-300 dark:border-blue-600 rounded-b-lg bg-blue-50/50 dark:bg-blue-900/10 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Extraction Types</span>
                                  <div className="flex space-x-1.5">
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedExtractionTypeIds(extractionTypes.map(t => t.id)); }} className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">All</button>
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedExtractionTypeIds([]); }} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">None</button>
                                  </div>
                                </div>
                                {extractionTypes.length === 0 ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">No extraction types available</p>
                                ) : (
                                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                    {extractionTypes.map(type => {
                                      const isSel = selectedExtractionTypeIds.includes(type.id);
                                      return (
                                        <div key={type.id} onClick={(e) => { e.stopPropagation(); toggleExtractionType(type.id); }} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-green-100 dark:bg-green-900/30' : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                                          <div className="flex items-center space-x-2">
                                            <FileText className={`h-3.5 w-3.5 ${isSel ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                            <span className={`text-sm ${isSel ? 'text-green-800 dark:text-green-200 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{type.name}</span>
                                          </div>
                                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                            {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{selectedExtractionTypeIds.length} of {extractionTypes.length} selected</p>
                              </div>
                            )}

                            {isEnabled && option.key === 'transformPage' && (
                              <div className="border-2 border-t-0 border-blue-300 dark:border-blue-600 rounded-b-lg bg-blue-50/50 dark:bg-blue-900/10 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transformation Types</span>
                                  <div className="flex space-x-1.5">
                                    <button onClick={(e) => { e.stopPropagation(); selectAllTransformationTypes(); }} className="text-xs px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">All</button>
                                    <button onClick={(e) => { e.stopPropagation(); deselectAllTransformationTypes(); }} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">None</button>
                                  </div>
                                </div>
                                {transformationTypes.length === 0 ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">No transformation types available</p>
                                ) : (
                                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                    {transformationTypes.map(type => {
                                      const isSel = selectedTransformationTypeIds.includes(type.id);
                                      return (
                                        <div key={type.id} onClick={(e) => { e.stopPropagation(); toggleTransformationType(type.id); }} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                                          <div className="flex items-center space-x-2">
                                            <RefreshCw className={`h-3.5 w-3.5 ${isSel ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                            <span className={`text-sm ${isSel ? 'text-orange-800 dark:text-orange-200 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{type.name}</span>
                                          </div>
                                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? 'border-orange-500 bg-orange-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                            {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{selectedTransformationTypeIds.length} of {transformationTypes.length} selected</p>
                              </div>
                            )}

                            {isEnabled && option.key === 'executePage' && (
                              <div className="border-2 border-t-0 border-blue-300 dark:border-blue-600 rounded-b-lg bg-blue-50/50 dark:bg-blue-900/10 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Execute Categories</span>
                                  <div className="flex space-x-1.5">
                                    <button onClick={(e) => { e.stopPropagation(); selectAllExecuteCategories(); }} className="text-xs px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 rounded hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors">All</button>
                                    <button onClick={(e) => { e.stopPropagation(); deselectAllExecuteCategories(); }} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">None</button>
                                  </div>
                                </div>
                                {executeCategories.length === 0 ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">No execute categories available</p>
                                ) : (
                                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                    {executeCategories.map(cat => {
                                      const isSel = selectedExecuteCategoryIds.includes(cat.id);
                                      return (
                                        <div key={cat.id} onClick={(e) => { e.stopPropagation(); toggleExecuteCategory(cat.id); }} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-cyan-100 dark:bg-cyan-900/30' : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                                          <div className="flex items-center space-x-2">
                                            <Play className={`h-3.5 w-3.5 ${isSel ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                            <span className={`text-sm ${isSel ? 'text-cyan-800 dark:text-cyan-200 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{cat.name}</span>
                                          </div>
                                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                            {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{selectedExecuteCategoryIds.length} of {executeCategories.length} selected</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            </div>

            {error && (
              <div className="px-6 pt-3">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex space-x-3">
              <button
                onClick={handleUpdatePermissions}
                disabled={isUpdatingPermissions}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isUpdatingPermissions ? 'Updating...' : 'Update Permissions'}
              </button>
              <button
                onClick={() => {
                  setShowPermissionsModal(false);
                  setSelectedUser(null);
                  setActivePermCategory('pages');
                  setSelectedExtractionTypeIds([]);
                  setSelectedTransformationTypeIds([]);
                  setSelectedExecuteCategoryIds([]);
                  setError('');
                }}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add User Modal - 2 Step Wizard */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`bg-white dark:bg-gray-800 rounded-2xl p-8 w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto ${createStep === 2 ? 'max-w-4xl' : 'max-w-2xl'}`}>
            {/* Step Indicator */}
            <div className="flex items-center justify-center mb-6">
              <div className="flex items-center space-x-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  createStep >= 1 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                }`}>
                  {createStep > 1 ? '\u2713' : '1'}
                </div>
                <span className={`text-sm font-medium ${createStep === 1 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>User Details</span>
                <div className={`w-12 h-0.5 ${createStep >= 2 ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  createStep >= 2 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                }`}>
                  {createStep > 2 ? '\u2713' : '2'}
                </div>
                <span className={`text-sm font-medium ${createStep === 2 ? 'text-gray-900 dark:text-gray-100' : createStep > 2 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>Permissions</span>
                <div className={`w-12 h-0.5 ${createStep >= 3 ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  createStep === 3 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                }`}>
                  3
                </div>
                <span className={`text-sm font-medium ${createStep === 3 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>Invite</span>
              </div>
            </div>

            {createStep === 1 && (
              <>
                <div className="text-center mb-6">
                  <div className="bg-green-100 dark:bg-green-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Plus className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Add New User</h3>
                  <p className="text-gray-600 dark:text-gray-400">Step 1: Create user account</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="Enter username"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newUser.name}
                      onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="First and Last Name"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email address"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <Select
                      label="Role"
                      value={newUser.role}
                      onValueChange={(value) => setNewUser(prev => ({
                        ...prev,
                        role: value as 'admin' | 'user' | 'vendor',
                        isAdmin: value === 'admin'
                      }))}
                      options={[
                        { value: 'user', label: 'User' },
                        { value: 'vendor', label: 'Vendor' },
                        { value: 'admin', label: 'Administrator' }
                      ]}
                      searchable={false}
                    />
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="isAdmin"
                      checked={newUser.isAdmin}
                      onChange={(e) => setNewUser(prev => ({
                        ...prev,
                        isAdmin: e.target.checked,
                        role: e.target.checked ? 'admin' : 'user'
                      }))}
                      disabled={newUser.role === 'vendor'}
                      className="w-4 h-4 text-green-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-green-500"
                    />
                    <label htmlFor="isAdmin" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Administrator {newUser.role === 'vendor' && '(Not available for vendors)'}
                    </label>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                      <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddUser}
                      disabled={isCreating}
                      className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                    >
                      {isCreating ? 'Creating...' : 'Next: Set Permissions'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        setCreateStep(1);
                        setNewUser({ username: '', email: '', name: '', isAdmin: false, role: 'user' });
                        setError('');
                      }}
                      className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}

            {createStep === 2 && (
              <>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-green-100 dark:bg-green-900/50 p-2.5 rounded-lg">
                    <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Set Permissions</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Step 2: Configure access for <strong>{createdUsername}</strong></p>
                  </div>
                </div>

                <div className="flex border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4" style={{ minHeight: '380px' }}>
                  <div className="w-48 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto flex-shrink-0">
                    <nav className="p-2 space-y-1">
                      {permissionCategories.map((cat) => {
                        const CatIcon = cat.icon;
                        const enabledCount = cat.permissions.filter(p => newUserPermissions[p.key]).length;
                        const isActive = newUserActivePermCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setNewUserActivePermCategory(cat.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 flex items-center space-x-2 ${
                              isActive
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          >
                            <CatIcon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                            <span className="text-xs font-medium flex-1 truncate">{cat.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              enabledCount === cat.permissions.length
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                : enabledCount > 0
                                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}>
                              {enabledCount}/{cat.permissions.length}
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    {permissionCategories
                      .filter(cat => cat.id === newUserActivePermCategory)
                      .map(cat => (
                        <div key={cat.id} className="space-y-2.5">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{cat.label}</h4>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => {
                                  const updated = { ...newUserPermissions };
                                  cat.permissions.forEach(p => { updated[p.key] = true; });
                                  setNewUserPermissions(updated);
                                }}
                                className="text-xs px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                              >
                                Select All
                              </button>
                              <button
                                onClick={() => {
                                  const updated = { ...newUserPermissions };
                                  cat.permissions.forEach(p => { updated[p.key] = false; });
                                  setNewUserPermissions(updated);
                                }}
                                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              >
                                Clear All
                              </button>
                            </div>
                          </div>
                          {cat.permissions.map((option) => {
                            const Icon = option.icon;
                            const isEnabled = newUserPermissions[option.key] || false;
                            const hasTypeSelector = cat.id === 'pages' && ['extractPage', 'transformPage', 'executePage'].includes(option.key);
                            return (
                              <div key={option.key} className="space-y-0">
                                <div
                                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                                    isEnabled
                                      ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                                  } ${isEnabled && hasTypeSelector ? 'rounded-b-none' : ''}`}
                                  onClick={() => toggleNewUserPermission(option.key)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className={`p-1.5 rounded-lg ${isEnabled ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-100 dark:bg-gray-600'}`}>
                                        <Icon className={`h-4 w-4 ${isEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
                                      </div>
                                      <div>
                                        <h4 className={`font-semibold text-sm ${isEnabled ? 'text-green-900 dark:text-green-200' : 'text-gray-700 dark:text-gray-200'}`}>
                                          {option.label}
                                        </h4>
                                        <p className={`text-xs ${isEnabled ? 'text-green-600 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                          {option.description}
                                        </p>
                                      </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                      isEnabled ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                                    }`}>
                                      {isEnabled && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                    </div>
                                  </div>
                                </div>

                                {isEnabled && option.key === 'extractPage' && (
                                  <div className="border-2 border-t-0 border-green-300 dark:border-green-600 rounded-b-lg bg-green-50/50 dark:bg-green-900/10 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Extraction Types</span>
                                      <div className="flex space-x-1.5">
                                        <button onClick={(e) => { e.stopPropagation(); setNewUserExtractionTypeIds(extractionTypes.map(t => t.id)); }} className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">All</button>
                                        <button onClick={(e) => { e.stopPropagation(); setNewUserExtractionTypeIds([]); }} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">None</button>
                                      </div>
                                    </div>
                                    {extractionTypes.length === 0 ? (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">No extraction types available</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {extractionTypes.map(type => {
                                          const isSel = newUserExtractionTypeIds.includes(type.id);
                                          return (
                                            <div key={type.id} onClick={(e) => { e.stopPropagation(); setNewUserExtractionTypeIds(prev => prev.includes(type.id) ? prev.filter(id => id !== type.id) : [...prev, type.id]); }} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-green-100 dark:bg-green-900/30' : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                                              <div className="flex items-center space-x-2">
                                                <FileText className={`h-3.5 w-3.5 ${isSel ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                                <span className={`text-sm ${isSel ? 'text-green-800 dark:text-green-200 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{type.name}</span>
                                              </div>
                                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                                {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{newUserExtractionTypeIds.length} of {extractionTypes.length} selected</p>
                                  </div>
                                )}

                                {isEnabled && option.key === 'transformPage' && (
                                  <div className="border-2 border-t-0 border-green-300 dark:border-green-600 rounded-b-lg bg-green-50/50 dark:bg-green-900/10 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transformation Types</span>
                                      <div className="flex space-x-1.5">
                                        <button onClick={(e) => { e.stopPropagation(); setNewUserTransformationTypeIds(transformationTypes.map(t => t.id)); }} className="text-xs px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">All</button>
                                        <button onClick={(e) => { e.stopPropagation(); setNewUserTransformationTypeIds([]); }} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">None</button>
                                      </div>
                                    </div>
                                    {transformationTypes.length === 0 ? (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">No transformation types available</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {transformationTypes.map(type => {
                                          const isSel = newUserTransformationTypeIds.includes(type.id);
                                          return (
                                            <div key={type.id} onClick={(e) => { e.stopPropagation(); setNewUserTransformationTypeIds(prev => prev.includes(type.id) ? prev.filter(id => id !== type.id) : [...prev, type.id]); }} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                                              <div className="flex items-center space-x-2">
                                                <RefreshCw className={`h-3.5 w-3.5 ${isSel ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                                <span className={`text-sm ${isSel ? 'text-orange-800 dark:text-orange-200 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{type.name}</span>
                                              </div>
                                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? 'border-orange-500 bg-orange-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                                {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{newUserTransformationTypeIds.length} of {transformationTypes.length} selected</p>
                                  </div>
                                )}

                                {isEnabled && option.key === 'executePage' && (
                                  <div className="border-2 border-t-0 border-green-300 dark:border-green-600 rounded-b-lg bg-green-50/50 dark:bg-green-900/10 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Execute Categories</span>
                                      <div className="flex space-x-1.5">
                                        <button onClick={(e) => { e.stopPropagation(); setNewUserExecuteCategoryIds(executeCategories.map(c => c.id)); }} className="text-xs px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 rounded hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors">All</button>
                                        <button onClick={(e) => { e.stopPropagation(); setNewUserExecuteCategoryIds([]); }} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">None</button>
                                      </div>
                                    </div>
                                    {executeCategories.length === 0 ? (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">No execute categories available</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                        {executeCategories.map(cat => {
                                          const isSel = newUserExecuteCategoryIds.includes(cat.id);
                                          return (
                                            <div key={cat.id} onClick={(e) => { e.stopPropagation(); setNewUserExecuteCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]); }} className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${isSel ? 'bg-cyan-100 dark:bg-cyan-900/30' : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
                                              <div className="flex items-center space-x-2">
                                                <Play className={`h-3.5 w-3.5 ${isSel ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                                <span className={`text-sm ${isSel ? 'text-cyan-800 dark:text-cyan-200 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{cat.name}</span>
                                              </div>
                                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                                {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{newUserExecuteCategoryIds.length} of {executeCategories.length} selected</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                </div>

                <div className={`rounded-lg p-3 mb-4 ${
                  newUserPermissionCount === 0
                    ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700'
                    : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                }`}>
                  <p className={`text-sm font-medium ${
                    newUserPermissionCount === 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-green-700 dark:text-green-400'
                  }`}>
                    {newUserPermissionCount === 0
                      ? 'At least one permission must be selected'
                      : `${newUserPermissionCount} permission${newUserPermissionCount !== 1 ? 's' : ''} selected`
                    }
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                    <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={async () => {
                      if (createdUserId) {
                        try {
                          await deleteUser(createdUserId);
                        } catch {}
                      }
                      setCreatedUserId(null);
                      setCreatedUsername('');
                      setCreatedUserEmail('');
                      setNewUserPermissions({});
                      setNewUserExtractionTypeIds([]);
                      setNewUserTransformationTypeIds([]);
                      setNewUserExecuteCategoryIds([]);
                      setCreateStep(1);
                      setError('');
                    }}
                    disabled={isUpdatingPermissions}
                    className="px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                  >
                    Previous
                  </button>
                  <button
                    onClick={handleSaveNewUserPermissions}
                    disabled={isUpdatingPermissions || newUserPermissionCount === 0}
                    className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                  >
                    {isUpdatingPermissions ? 'Saving...' : 'Next: Send Invite'}
                  </button>
                  <button
                    onClick={async () => {
                      if (createdUserId) {
                        try {
                          await deleteUser(createdUserId);
                        } catch {}
                      }
                      setShowAddModal(false);
                      setCreateStep(1);
                      setCreatedUserId(null);
                      setCreatedUsername('');
                      setCreatedUserEmail('');
                      setNewUserPermissions({});
                      setNewUserExtractionTypeIds([]);
                      setNewUserTransformationTypeIds([]);
                      setNewUserExecuteCategoryIds([]);
                      setNewUser({ username: '', email: '', name: '', isAdmin: false, role: 'user' });
                      setError('');
                      await loadUsers();
                    }}
                    disabled={isUpdatingPermissions}
                    className="px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {createStep === 3 && (
              <>
                <div className="text-center mb-8">
                  <div className="bg-green-100 dark:bg-green-900/50 p-4 rounded-full w-20 h-20 mx-auto mb-5 flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">User Created</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    <strong>{createdUsername}</strong> has been created successfully.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-5 mb-6">
                  <div className="flex items-start space-x-3">
                    <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-1">Send Registration Email?</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        A registration email will be sent to <strong>{createdUserEmail}</strong> with a link to set up their password.
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
                    <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={handleSendInviteAndClose}
                    disabled={isSendingInvite}
                    className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    {isSendingInvite ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Yes, Send Email</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleSkipInviteAndClose}
                    disabled={isSendingInvite}
                    className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                  >
                    No, Skip
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">User Management</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage user accounts and permissions</p>
        </div>
        <div className="flex items-center space-x-3">
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
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add User</span>
          </button>
        </div>
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

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {users.map((user) => (
          <div key={user.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-full ${
                  user.isAdmin ? 'bg-purple-100 dark:bg-purple-900/50' : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  {user.isAdmin ? (
                    <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  ) : (
                    <UserIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{user.username}</h4>
                    {user.id === currentUser.id && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                        You
                      </span>
                    )}
                  </div>
                  {user.name && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">{user.name}</p>
                  )}
                  {user.email && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                      <Mail className="h-3 w-3 mr-1" />
                      {user.email}
                    </p>
                  )}
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span className={`text-sm ${
                      user.role === 'admin' ? 'text-purple-600 dark:text-purple-400 font-medium' :
                      user.role === 'vendor' ? 'text-orange-600 dark:text-orange-400 font-medium' :
                      'text-gray-500 dark:text-gray-400'
                    }`}>
                      {user.role === 'admin' ? 'Administrator' :
                       user.role === 'vendor' ? 'Vendor' : 'User'}
                    </span>
                    <span className={`text-sm ${
                      user.isActive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-sm text-blue-600 dark:text-blue-400">
                      {getPermissionCount(user)} permissions
                    </span>
                    <span className={`text-sm font-medium ${
                      user.preferredUploadMode === 'auto' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {user.preferredUploadMode === 'auto' ? 'AI Auto-Detect' : 'Manual Selection'}
                    </span>
                    {user.role === 'vendor' && (
                      <span className="text-sm text-purple-600 dark:text-purple-400">
                        Zone: {user.currentZone || 'Not Set'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                      <Mail className="h-3 w-3 mr-1" />
                      Invite: {formatInvitationSent(user.invitationSentAt, user.invitationSentCount)}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      Last Login: {formatLastLogin(user.lastLogin)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {user.email && (
                  <button
                    onClick={() => handleSendRegistrationEmail(user)}
                    disabled={sendingEmail === user.id}
                    className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 hover:bg-green-200 transition-colors duration-200 flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Send registration email"
                  >
                    {sendingEmail === user.id ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600"></div>
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    <span>Send Invite</span>
                  </button>
                )}
                <button
                  onClick={() => handleManageEmail(user)}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors duration-200 flex items-center space-x-1"
                >
                  <Mail className="h-3 w-3" />
                  <span>Email</span>
                </button>
                <button
                  onClick={() => handleManageName(user)}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors duration-200 flex items-center space-x-1"
                >
                  <UserIcon className="h-3 w-3" />
                  <span>Name</span>
                </button>
                {user.id !== currentUser.id && user.username !== 'admin' && (
                  <button
                    onClick={() => handleResetPassword(user)}
                    className="px-3 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors duration-200 flex items-center space-x-1"
                  >
                    <Key className="h-3 w-3" />
                    <span>Reset Password</span>
                  </button>
                )}
                {user.role === 'vendor' && (
                  <button
                    onClick={() => handleManageCurrentZone(user)}
                    className="px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors duration-200 flex items-center space-x-1"
                  >
                    <Settings className="h-3 w-3" />
                    <span>Zone</span>
                  </button>
                )}
                <button
                  onClick={() => handleManageUploadMode(user)}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition-colors duration-200 flex items-center space-x-1"
                >
                  <Settings className="h-3 w-3" />
                  <span>Upload Mode</span>
                </button>
                <button
                  onClick={() => handleManagePermissions(user)}
                  className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors duration-200 flex items-center space-x-1"
                >
                  <Settings className="h-3 w-3" />
                  <span>Permissions</span>
                </button>
                <button
                  onClick={() => handleToggleActive(user)}
                  disabled={user.id === currentUser.id || user.username === 'admin'}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
                    user.isActive
                      ? 'bg-red-100 text-red-800 hover:bg-red-200'
                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                  } ${(user.id === currentUser.id || user.username === 'admin') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {user.isActive ? 'Deactivate' : 'Activate'}
                </button>
                {!user.isActive && (
                  <button
                    onClick={() => handleDeleteUser(user)}
                    disabled={user.id === currentUser.id || user.username === 'admin'}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-200 bg-red-100 text-red-800 hover:bg-red-200 ${
                      (user.id === currentUser.id || user.username === 'admin') ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Users Found</h3>
          <p className="text-gray-600 dark:text-gray-400">There are no users in the system.</p>
        </div>
      )}

      {showEmailTemplateModal && (
        <InvitationEmailTemplateEditor
          onClose={() => setShowEmailTemplateModal(false)}
          templateType="admin"
        />
      )}

      <PasswordResetTemplateEditor
        isOpen={showForgotUsernameTemplateModal}
        onClose={() => setShowForgotUsernameTemplateModal(false)}
        templateType="admin_forgot_username"
      />

      <PasswordResetTemplateEditor
        isOpen={showResetPasswordTemplateModal}
        onClose={() => setShowResetPasswordTemplateModal(false)}
        templateType="admin_reset_password"
      />
    </div>
  );
}