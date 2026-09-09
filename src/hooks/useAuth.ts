import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User, AuthState, UserPermissions } from '../types';

async function invokeEdgeFunction(functionName: string, body: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
  console.log(`[invokeEdgeFunction] Calling ${functionName} with:`, JSON.stringify(body, null, 2));
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  console.log(`[invokeEdgeFunction] Response from ${functionName}:`, { data, error: error ? { message: error.message, name: error.name, context: (error as any).context } : null });
  if (error) {
    let errorMessage = error.message || 'Edge function call failed';
    if (data && typeof data === 'object' && data.error) {
      errorMessage = data.error;
      console.log(`[invokeEdgeFunction] Extracted error from response body:`, errorMessage);
    }
    console.error(`[invokeEdgeFunction] Error calling ${functionName}:`, errorMessage);
    return { data: null, error: errorMessage };
  }
  if (data?.error) {
    console.error(`[invokeEdgeFunction] Data error from ${functionName}:`, data.error);
    return { data: null, error: data.error };
  }
  return { data, error: null };
}

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

function getDefaultPermissions(isAdmin: boolean): UserPermissions {
  if (isAdmin) {
    return {
      extractPage: true, extractionTypes: true, transformPage: true, transformationTypes: true,
      executePage: true, executeSetup: true, sftp: true, api: true,
      emailMonitoring: true, emailRules: true, processedEmails: true,
      extractionLogs: true, userManagement: true, workflowManagement: true,
      vendorSetup: true, clientSetup: true,
      ordersConfiguration: true, clientManagement: true, clientUserManagement: true,
      orderEntry: true, submissions: true, trackTrace: true,
      workflowLogs: true, emailPolling: true, sftpPolling: true,
      notificationTemplates: true, companyBranding: true,
      imagingDelete: true, imagingRerunWorkflow: true, imagingRetryEpdf: true
    };
  }
  return {
    extractPage: false, extractionTypes: false, transformPage: false, transformationTypes: false,
    executePage: false, executeSetup: false, sftp: false, api: false,
    emailMonitoring: false, emailRules: false, processedEmails: false,
    extractionLogs: false, userManagement: false, workflowManagement: false,
    vendorSetup: false, clientSetup: false,
    ordersConfiguration: false, clientManagement: false, clientUserManagement: false,
    orderEntry: false, submissions: false, trackTrace: false,
    workflowLogs: false, emailPolling: false, sftpPolling: false,
    notificationTemplates: false, companyBranding: false,
    imagingDelete: false, imagingRerunWorkflow: false, imagingRetryEpdf: false
  };
}

function migratePermissions(perms: any): UserPermissions {
  const defaults = getDefaultPermissions(false);
  const migrated = { ...defaults, ...perms };
  if (perms.extractPage === undefined && perms.extractionTypes !== undefined) {
    migrated.extractPage = perms.extractionTypes;
  }
  if (perms.transformPage === undefined && perms.transformationTypes !== undefined) {
    migrated.transformPage = perms.transformationTypes;
  }
  if (perms.executePage === undefined && perms.executeSetup !== undefined) {
    migrated.executePage = perms.executeSetup;
  }
  if (perms.executeSetup === undefined && perms.workflowManagement !== undefined) {
    migrated.executeSetup = perms.workflowManagement;
  }
  if (perms.vendorSetup === undefined && perms.userManagement !== undefined) {
    migrated.vendorSetup = perms.userManagement;
  }
  if (perms.clientSetup === undefined && perms.userManagement !== undefined) {
    migrated.clientSetup = perms.userManagement;
  }
  if (perms.ordersConfiguration === undefined) {
    migrated.ordersConfiguration = perms.vendorSetup ?? false;
  }
  if (perms.clientManagement === undefined) {
    migrated.clientManagement = perms.clientSetup ?? false;
  }
  if (perms.clientUserManagement === undefined) {
    migrated.clientUserManagement = perms.clientSetup ?? false;
  }
  if (perms.orderEntry === undefined) {
    migrated.orderEntry = perms.clientSetup ?? false;
  }
  if (perms.submissions === undefined) {
    migrated.submissions = perms.clientSetup ?? false;
  }
  if (perms.trackTrace === undefined) {
    migrated.trackTrace = perms.clientSetup ?? false;
  }
  if (perms.workflowLogs === undefined) {
    migrated.workflowLogs = perms.extractionLogs ?? false;
  }
  if (perms.emailPolling === undefined) {
    migrated.emailPolling = perms.extractionLogs ?? false;
  }
  if (perms.sftpPolling === undefined) {
    migrated.sftpPolling = perms.extractionLogs ?? false;
  }
  if (perms.notificationTemplates === undefined) {
    migrated.notificationTemplates = perms.emailMonitoring ?? false;
  }
  if (perms.companyBranding === undefined) {
    migrated.companyBranding = perms.userManagement ?? false;
  }
  if (perms.imagingDelete === undefined) {
    migrated.imagingDelete = false;
  }
  if (perms.imagingRerunWorkflow === undefined) {
    migrated.imagingRerunWorkflow = false;
  }
  if (perms.imagingRetryEpdf === undefined) {
    migrated.imagingRetryEpdf = false;
  }
  return migrated;
}

function buildUserFromData(userData: any): User {
  let userPermissions: UserPermissions;
  try {
    const raw = userData.permissions ? JSON.parse(userData.permissions) : null;
    userPermissions = raw ? migratePermissions(raw) : getDefaultPermissions(userData.is_admin);
  } catch {
    userPermissions = getDefaultPermissions(userData.is_admin);
  }

  return {
    id: userData.id,
    username: userData.username,
    name: userData.name || undefined,
    email: userData.email || undefined,
    isAdmin: userData.is_admin,
    isActive: userData.is_active,
    role: userData.role || (userData.is_admin ? 'admin' : 'user'),
    permissions: userPermissions,
    preferredUploadMode: userData.preferred_upload_mode || 'manual',
    currentZone: userData.current_zone || '',
    clientId: userData.client_id || undefined,
    isClientAdmin: userData.is_client_admin || false,
    hasOrderEntryAccess: userData.has_order_entry_access || false,
    hasRateQuoteAccess: userData.has_rate_quote_access || false,
    hasAddressBookAccess: userData.has_address_book_access || false,
    hasTrackTraceAccess: userData.has_track_trace_access || false,
    hasInvoiceAccess: userData.has_invoice_access || false,
    hasSubmissionsAccess: userData.has_submissions_access || false,
    hasExecuteSetupAccess: userData.has_execute_setup_access || false
  };
}

const USER_SELECT_FIELDS = 'id, username, name, email, is_admin, is_active, permissions, role, preferred_upload_mode, current_zone, client_id, is_client_admin, has_order_entry_access, has_rate_quote_access, has_address_book_access, has_track_trace_access, has_invoice_access, has_submissions_access, has_execute_setup_access';

async function fetchUserProfile(userId: string, loginType?: 'admin' | 'client'): Promise<User | null> {
  let query = supabase.from('users').select(USER_SELECT_FIELDS).eq('id', userId).eq('is_active', true);
  if (loginType === 'client') query = query.eq('role', 'client');
  else if (loginType === 'admin') query = query.neq('role', 'client');
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return buildUserFromData(data);
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [loading, setLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activityThrottleRef = useRef<number>(0);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
  }, []);

  const handleLogout = useCallback(async (reason?: string) => {
    clearIdleTimer();
    localStorage.removeItem('parseit_session');
    localStorage.removeItem('parseit_user');
    await supabase.auth.signOut();
    setAuthState({ isAuthenticated: false, user: null });
    if (reason) setSessionExpiredMessage(reason);
  }, [clearIdleTimer]);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      handleLogout('Session timed out due to inactivity. Please log in again.');
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimer, handleLogout]);

  const updateLastActivity = useCallback(() => {
    const now = Date.now();
    if (now - activityThrottleRef.current < 30000) return;
    activityThrottleRef.current = now;
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => { if (authState.isAuthenticated) updateLastActivity(); };
    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      clearIdleTimer();
    };
  }, [authState.isAuthenticated, updateLastActivity, clearIdleTimer]);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile && mounted) {
          setAuthState({ isAuthenticated: true, user: profile });
          resetIdleTimer();
        }
      }
      if (mounted) setLoading(false);
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthState({ isAuthenticated: false, user: null });
        clearIdleTimer();
      }
      if (event === 'SIGNED_IN' && session?.user) {
        (async () => {
          const profile = await fetchUserProfile(session.user.id);
          if (profile && mounted) {
            setAuthState({ isAuthenticated: true, user: profile });
            resetIdleTimer();
          }
        })();
      }
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        (async () => {
          const profile = await fetchUserProfile(session.user.id);
          if (profile && mounted) setAuthState({ isAuthenticated: true, user: profile });
        })();
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [resetIdleTimer, clearIdleTimer]);

  const login = async (emailOrUsername: string, password: string, loginType?: 'admin' | 'client'): Promise<{ success: boolean; message?: string }> => {
    try {
      let authUser: any;

      if (!emailOrUsername.includes('@')) {
        const { data, error } = await invokeEdgeFunction('login-with-username', {
          username: emailOrUsername,
          password,
          login_type: loginType || null,
        });
        if (error || !data?.access_token) return { success: false, message: 'Invalid credentials' };

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) return { success: false, message: 'Invalid credentials' };
        authUser = data.user;
      } else {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: emailOrUsername, password });
        if (authError) return { success: false, message: 'Invalid credentials' };
        authUser = authData.user;
      }

      const profile = await fetchUserProfile(authUser.id, loginType);
      if (!profile) { await supabase.auth.signOut(); return { success: false, message: 'User profile not found or inactive' }; }
      if (loginType === 'client' && profile.role !== 'client') { await supabase.auth.signOut(); return { success: false, message: 'This login is for client users only.' }; }
      if (loginType === 'admin' && profile.role === 'client') { await supabase.auth.signOut(); return { success: false, message: 'Please use the client portal to log in.' }; }

      await supabase.rpc('update_own_last_login');
      setAuthState({ isAuthenticated: true, user: profile });
      setSessionExpiredMessage(null);
      resetIdleTimer();
      return { success: true };
    } catch (error) {
      return { success: false, message: 'Login failed. Please try again.' };
    }
  };

  const logout = () => { handleLogout(); };
  const clearSessionExpiredMessage = () => { setSessionExpiredMessage(null); };

  const createUser = async (username: string, password: string | undefined, isAdmin: boolean = false, role: 'admin' | 'user' | 'vendor' | 'client' = 'user', email?: string, name?: string): Promise<{ success: boolean; message: string }> => {
    try {
      console.log('[createUser] Starting user creation:', { username, isAdmin, role, email, name, hasPassword: !!password });
      if (!email) return { success: false, message: 'Email is required for new users' };
      const body: Record<string, unknown> = { action: 'create', email, username, isAdmin, role, name };
      if (password) body.password = password;
      const { data, error } = await invokeEdgeFunction('manage-auth-user', body);
      console.log('[createUser] Result:', { data, error });
      if (error) return { success: false, message: error };
      if (data?.error) return { success: false, message: data.error };
      return { success: true, message: 'User created successfully' };
    } catch (error) {
      console.error('[createUser] Unexpected error:', error);
      return { success: false, message: 'Failed to create user. Please try again.' };
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, email, is_admin, is_active, permissions, preferred_upload_mode, role, current_zone, client_id, is_client_admin, has_order_entry_access, has_rate_quote_access, has_address_book_access, has_track_trace_access, has_invoice_access, has_submissions_access, last_login, invitation_sent_at, invitation_sent_count')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(user => ({
        id: user.id, username: user.username, name: user.name || undefined, email: user.email || undefined,
        isAdmin: user.is_admin, isActive: user.is_active, role: user.role || 'user',
        permissions: user.permissions ? migratePermissions(JSON.parse(user.permissions)) : getDefaultPermissions(user.is_admin),
        preferredUploadMode: user.preferred_upload_mode || 'manual', currentZone: user.current_zone || '',
        clientId: user.client_id || undefined, isClientAdmin: user.is_client_admin || false,
        hasOrderEntryAccess: user.has_order_entry_access || false, hasRateQuoteAccess: user.has_rate_quote_access || false,
        hasAddressBookAccess: user.has_address_book_access || false, hasTrackTraceAccess: user.has_track_trace_access || false,
        hasInvoiceAccess: user.has_invoice_access || false, hasSubmissionsAccess: user.has_submissions_access || false,
        lastLogin: user.last_login || undefined,
        invitationSentAt: user.invitation_sent_at || undefined, invitationSentCount: user.invitation_sent_count || 0
      }));
    } catch (error) {
      return [];
    }
  };

  const updateUser = async (userId: string, updates: { isAdmin?: boolean; isActive?: boolean; permissions?: UserPermissions; preferredUploadMode?: 'manual' | 'auto'; role?: 'admin' | 'user' | 'vendor' | 'client'; currentZone?: string; email?: string; name?: string; clientId?: string; isClientAdmin?: boolean; hasOrderEntryAccess?: boolean; hasRateQuoteAccess?: boolean; hasAddressBookAccess?: boolean; hasTrackTraceAccess?: boolean; hasInvoiceAccess?: boolean; hasSubmissionsAccess?: boolean }): Promise<{ success: boolean; message: string }> => {
    try {
      const updateData: any = {};
      if (updates.isAdmin !== undefined) updateData.is_admin = updates.isAdmin;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.permissions !== undefined) updateData.permissions = JSON.stringify(updates.permissions);
      if (updates.preferredUploadMode !== undefined) updateData.preferred_upload_mode = updates.preferredUploadMode;
      if (updates.role !== undefined) updateData.role = updates.role;
      if (updates.currentZone !== undefined) updateData.current_zone = updates.currentZone;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.clientId !== undefined) updateData.client_id = updates.clientId;
      if (updates.isClientAdmin !== undefined) updateData.is_client_admin = updates.isClientAdmin;
      if (updates.hasOrderEntryAccess !== undefined) updateData.has_order_entry_access = updates.hasOrderEntryAccess;
      if (updates.hasRateQuoteAccess !== undefined) updateData.has_rate_quote_access = updates.hasRateQuoteAccess;
      if (updates.hasAddressBookAccess !== undefined) updateData.has_address_book_access = updates.hasAddressBookAccess;
      if (updates.hasTrackTraceAccess !== undefined) updateData.has_track_trace_access = updates.hasTrackTraceAccess;
      if (updates.hasInvoiceAccess !== undefined) updateData.has_invoice_access = updates.hasInvoiceAccess;
      if (updates.hasSubmissionsAccess !== undefined) updateData.has_submissions_access = updates.hasSubmissionsAccess;
      updateData.updated_at = new Date().toISOString();
      const { error } = await supabase.from('users').update(updateData).eq('id', userId);
      if (error) throw error;
      return { success: true, message: 'User updated successfully' };
    } catch (error) {
      return { success: false, message: 'Failed to update user. Please try again.' };
    }
  };

  const deleteUser = async (userId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await invokeEdgeFunction('manage-auth-user', { action: 'delete', userId });
      if (error) return { success: false, message: error };
      if (data?.error) return { success: false, message: data.error };
      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      return { success: false, message: 'Failed to delete user. Please try again.' };
    }
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await invokeEdgeFunction('manage-auth-user', { action: 'change_own_password', currentPassword, newPassword });
      if (error) return { success: false, message: error };
      if (data?.error) return { success: false, message: data.error };
      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      return { success: false, message: 'Failed to change password. Please try again.' };
    }
  };

  const updateUserPassword = async (userId: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await invokeEdgeFunction('manage-auth-user', { action: 'update_password', userId, password: newPassword });
      if (error) return { success: false, message: error };
      if (data?.error) return { success: false, message: data.error };
      return { success: true, message: 'Password updated successfully' };
    } catch (error) {
      return { success: false, message: 'Failed to update password. Please try again.' };
    }
  };

  const getUserExtractionTypes = async (userId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase.from('user_extraction_types').select('extraction_type_id').eq('user_id', userId);
      if (error) throw error;
      return (data || []).map(item => item.extraction_type_id);
    } catch { return []; }
  };

  const updateUserExtractionTypes = async (userId: string, extractionTypeIds: string[]): Promise<{ success: boolean; message: string }> => {
    try {
      await supabase.from('user_extraction_types').delete().eq('user_id', userId);
      if (extractionTypeIds.length > 0) {
        const { error } = await supabase.from('user_extraction_types').insert(extractionTypeIds.map(typeId => ({ user_id: userId, extraction_type_id: typeId })));
        if (error) throw error;
      }
      return { success: true, message: 'Extraction type permissions updated successfully' };
    } catch { return { success: false, message: 'Failed to update extraction type permissions' }; }
  };

  const getUserTransformationTypes = async (userId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase.from('user_transformation_types').select('transformation_type_id').eq('user_id', userId);
      if (error) throw error;
      return (data || []).map(item => item.transformation_type_id);
    } catch { return []; }
  };

  const updateUserTransformationTypes = async (userId: string, transformationTypeIds: string[]): Promise<{ success: boolean; message: string }> => {
    try {
      await supabase.from('user_transformation_types').delete().eq('user_id', userId);
      if (transformationTypeIds.length > 0) {
        const { error } = await supabase.from('user_transformation_types').insert(transformationTypeIds.map(typeId => ({ user_id: userId, transformation_type_id: typeId })));
        if (error) throw error;
      }
      return { success: true, message: 'Transformation type permissions updated successfully' };
    } catch { return { success: false, message: 'Failed to update transformation type permissions' }; }
  };

  const getUserExecuteCategories = async (userId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase.from('user_execute_category_access').select('category_id').eq('user_id', userId);
      if (error) throw error;
      return (data || []).map(item => item.category_id);
    } catch { return []; }
  };

  const updateUserExecuteCategories = async (userId: string, categoryIds: string[]): Promise<{ success: boolean; message: string }> => {
    try {
      await supabase.from('user_execute_category_access').delete().eq('user_id', userId);
      if (categoryIds.length > 0) {
        const { error } = await supabase.from('user_execute_category_access').insert(categoryIds.map(categoryId => ({ user_id: userId, category_id: categoryId })));
        if (error) throw error;
      }
      return { success: true, message: 'Execute category permissions updated successfully' };
    } catch { return { success: false, message: 'Failed to update execute category permissions' }; }
  };

  return {
    ...authState, loading, sessionExpiredMessage,
    login, logout, clearSessionExpiredMessage,
    createUser, getAllUsers, updateUser, deleteUser, updateUserPassword, changeOwnPassword,
    getUserExtractionTypes, updateUserExtractionTypes,
    getUserTransformationTypes, updateUserTransformationTypes,
    getUserExecuteCategories, updateUserExecuteCategories
  };
}
