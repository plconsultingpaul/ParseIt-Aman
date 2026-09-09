import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useSupabaseData } from './hooks/useSupabaseData';
import { DarkModeProvider } from './contexts/DarkModeContext';
import { LicenseProvider } from './contexts/LicenseContext';
import { Loader2 } from 'lucide-react';

import LoginPage from './components/LoginPage';
import ClientLoginPage from './components/ClientLoginPage';
import ClientLayout from './components/ClientLayout';
import ClientHelpPage from './components/ClientHelpPage';
import ClientUsersPage from './components/ClientUsersPage';
import PasswordSetupPage from './components/PasswordSetupPage';
import PasswordResetPage from './components/PasswordResetPage';
import PublicExecutePage from './components/PublicExecutePage';
import LayoutRouter from './components/LayoutRouter';
import PrivateRoute from './components/router/PrivateRoute';
import RoleBasedRoute from './components/router/RoleBasedRoute';
import NotFound from './components/router/NotFound';

import ExtractPage from './components/ExtractPage';
import TransformPage from './components/TransformPage';
import ExecutePage from './components/ExecutePage';
import SettingsPage from './components/SettingsPage';
import LogsPage from './components/LogsPage';
import TypeSetupPage from './components/TypeSetupPage';
import VendorSetupPage from './components/VendorSetupPage';
import ClientSetupPage from './components/ClientSetupPage';
import OrderEntryPage from './components/OrderEntryPage';
import OrderEntrySubmissionsPage from './components/OrderEntrySubmissionsPage';
import OrderEntrySubmissionDetailPage from './components/OrderEntrySubmissionDetailPage';
import RateQuotePage from './components/RateQuotePage';
import AddressBookPage from './components/AddressBookPage';
import TrackTracePage from './components/TrackTracePage';
import ShipmentDetailsPage from './components/ShipmentDetailsPage';
import InvoicePage from './components/InvoicePage';
import HelpPage from './components/help/HelpPage';
import ImagingPage from './components/ImagingPage';
import ImagingViewerPage from './components/imaging/ImagingViewerPage';
import SsoCallback from './components/SsoCallback';
import ClientSubmissionsPage from './components/ClientSubmissionsPage';
import InboxPage from './components/InboxPage';
import InboxReviewPage from './components/InboxReviewPage';

import type { ExtractionType, TransformationType, SftpConfig, SettingsConfig, ApiConfig, EmailMonitoringConfig, EmailProcessingRule } from './types';

function AppContent() {
  const {
    isAuthenticated,
    user,
    loading: authLoading,
    login,
    logout,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    updateUserPassword,
    changeOwnPassword,
    getUserExtractionTypes,
    updateUserExtractionTypes,
    getUserTransformationTypes,
    updateUserTransformationTypes,
    getUserExecuteCategories,
    updateUserExecuteCategories
  } = useAuth();

  const {
    extractionTypes,
    transformationTypes,
    sftpConfig,
    settingsConfig,
    apiConfig,
    emailConfig,
    emailRules,
    processedEmails,
    extractionLogs,
    users,
    workflows,
    workflowSteps,
    emailPollingLogs,
    workflowExecutionLogs,
    sftpPollingLogs,
    loading,
    refreshData,
    companyBranding,
    refreshLogs,
    refreshLogsWithFilters,
    refreshProcessedEmails,
    refreshWorkflowExecutionLogs,
    refreshSftpPollingLogs,
    updateSftpPollingConfigs,
    updateExtractionTypes,
    updateSftpConfig,
    updateSettingsConfig,
    updateApiConfig,
    updateEmailConfig,
    updateEmailRules,
    refreshPollingLogs,
    stopRunningPollingLogs,
    logExtraction,
    updateCompanyBranding,
    deleteExtractionType,
    updateTransformationTypes,
    deleteTransformationType
  } = useSupabaseData();

  const location = useLocation();

  const handleUpdateExtractionTypes = async (types: ExtractionType[]) => {
    try {
      await updateExtractionTypes(types);
    } catch (error) {
      console.error('Failed to update extraction types:', error);
      alert('Failed to save extraction types. Please try again.');
    }
  };

  const handleUpdateSftpConfig = async (config: SftpConfig) => {
    try {
      await updateSftpConfig(config);
    } catch (error) {
      console.error('Failed to update SFTP config:', error);
      alert('Failed to save SFTP configuration. Please try again.');
    }
  };

  const handleUpdateSettingsConfig = async (config: SettingsConfig) => {
    try {
      await updateSettingsConfig(config);
    } catch (error) {
      console.error('Failed to update settings config:', error);
      alert('Failed to save settings configuration. Please try again.');
    }
  };

  const handleUpdateApiConfig = async (config: ApiConfig) => {
    try {
      await updateApiConfig(config);
    } catch (error) {
      console.error('Failed to update API config:', error);
      alert('Failed to save API configuration. Please try again.');
    }
  };

  const handleUpdateEmailConfig = async (config: EmailMonitoringConfig) => {
    try {
      await updateEmailConfig(config);
    } catch (error) {
      console.error('Failed to update email config:', error);
      alert('Failed to save email configuration. Please try again.');
    }
  };

  const handleUpdateEmailRules = async (rules: EmailProcessingRule[]) => {
    try {
      await updateEmailRules(rules);
    } catch (error) {
      console.error('Failed to update email rules:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Detailed error:', errorMessage);
      throw new Error(`Failed to save email processing rules: ${errorMessage}`);
    }
  };

  const handleDeleteExtractionType = async (id: string) => {
    try {
      await deleteExtractionType(id);
    } catch (error) {
      console.error('Failed to delete extraction type:', error);
      alert('Failed to delete extraction type. Please try again.');
    }
  };

  const handleUpdateTransformationTypes = async (types: TransformationType[]) => {
    try {
      await updateTransformationTypes(types);
    } catch (error) {
      console.error('Failed to update transformation types:', error);
      alert('Failed to save transformation types. Please try again.');
    }
  };

  const handleDeleteTransformationType = async (id: string) => {
    try {
      await deleteTransformationType(id);
    } catch (error) {
      console.error('Failed to delete transformation type:', error);
      alert('Failed to delete transformation type. Please try again.');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <span className="text-lg font-medium text-purple-600 dark:text-purple-400">
            {authLoading ? 'Checking authentication...' : 'Loading your data...'}
          </span>
        </div>
      </div>
    );
  }

  const publicPaths = ['/client/login', '/client', '/password-setup', '/reset-password', '/help', '/execute', '/imaging/view', '/auth/sso'];
  const isPublicPath = publicPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));

  if (!isAuthenticated || !user) {
    const handleAdminLogin = async (username: string, password: string) => {
      return login(username, password, 'admin');
    };

    if (isPublicPath) {
      return (
        <Routes>
          <Route path="/password-setup" element={<PasswordSetupPage />} />
          <Route path="/reset-password" element={<PasswordResetPage />} />
          <Route path="/auth/sso" element={<SsoCallback />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/execute/:slug" element={<PublicExecutePage />} />
          <Route path="/imaging/view" element={<ImagingViewerPage />} />
          <Route path="/client/login" element={
            <ClientPortalLogin
              companyBranding={companyBranding}
              onLogin={login}
              isAuthenticated={isAuthenticated}
              user={user}
            />
          } />
          <Route path="/client" element={
            <ClientPortalRedirect
              isAuthenticated={isAuthenticated}
              user={user}
            />
          } />
          <Route path="/client/*" element={<Navigate to="/client/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      );
    }
    return <LoginPage companyBranding={companyBranding} onLogin={handleAdminLogin} />;
  }

  return (
    <Routes>
      <Route path="/password-setup" element={<PasswordSetupPage />} />
      <Route path="/reset-password" element={<PasswordResetPage />} />
      <Route path="/auth/sso" element={<SsoCallback />} />
      <Route path="/execute/:slug" element={<PublicExecutePage />} />
      <Route path="/imaging/view" element={<ImagingViewerPage />} />
      <Route path="/inbox/:id" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access inbox items."
          >
            <InboxReviewPage currentUser={user} />
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
            {user.role === 'client' ? (
              user.hasOrderEntryAccess ? (
                <Navigate to="/order-entry" replace />
              ) : user.hasRateQuoteAccess ? (
                <Navigate to="/rate-quote" replace />
              ) : user.isClientAdmin ? (
                <Navigate to="/client-users" replace />
              ) : (
                <Navigate to="/order-entry" replace />
              )
            ) : (
              <Navigate to="/extract" replace />
            )}
          </LayoutRouter>
        </PrivateRoute>
      } />

      <Route path="/extract" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access the Extract page."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <ExtractPage
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                sftpConfig={sftpConfig}
                settingsConfig={settingsConfig}
                apiConfig={apiConfig}
                onNavigateToSettings={() => {}}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/transform" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access the Transform page."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <TransformPage
                transformationTypes={transformationTypes}
                sftpConfig={sftpConfig}
                settingsConfig={settingsConfig}
                apiConfig={apiConfig}
                onNavigateToSettings={() => {}}
                getUserTransformationTypes={getUserTransformationTypes}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/execute" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access the Execute page."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <ExecutePage user={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/types" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access the Type Setup page."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <TypeSetupPage
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                workflows={workflows}
                workflowSteps={workflowSteps}
                apiConfig={apiConfig}
                currentUser={user}
                refreshData={refreshData}
                onUpdateExtractionTypes={handleUpdateExtractionTypes}
                onDeleteExtractionType={handleDeleteExtractionType}
                onUpdateTransformationTypes={handleUpdateTransformationTypes}
                onDeleteTransformationType={handleDeleteTransformationType}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/vendor-setup" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requirePermission="userManagement"
            deniedTitle="Vendor Setup Access Denied"
            deniedMessage="You do not have permission to access Vendor Setup. This section requires user management privileges."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <VendorSetupPage
                currentUser={user}
                apiConfig={apiConfig}
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                getAllUsers={getAllUsers}
                createUser={createUser}
                updateUser={updateUser}
                deleteUser={deleteUser}
                updateUserPassword={updateUserPassword}
                onUpdateApiConfig={handleUpdateApiConfig}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/inbox" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access the Inbox."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <InboxPage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/imaging" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access the Imaging page."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <ImagingPage
                isAdmin={user?.isAdmin}
                canDeleteImaging={user?.isAdmin || user?.permissions?.imagingDelete}
                canRerunImagingWorkflow={user?.isAdmin || user?.permissions?.imagingRerunWorkflow}
                canRetryEpdf={user?.isAdmin || user?.permissions?.imagingRetryEpdf}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/client-setup" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requirePermission="userManagement"
            deniedTitle="Client Setup Access Denied"
            deniedMessage="You do not have permission to access Client Setup. This section requires user management privileges."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <ClientSetupPage
                currentUser={user}
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                getAllUsers={getAllUsers}
                createUser={createUser}
                updateUser={updateUser}
                deleteUser={deleteUser}
                updateUserPassword={updateUserPassword}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/order-entry" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="orderEntry"
            deniedTitle="Order Entry Access Denied"
            deniedMessage="You do not have permission to access Order Entry. This feature is only available to client users with appropriate access."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <OrderEntryPage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/order-entry/submissions" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access submissions."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <OrderEntrySubmissionsPage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/order-entry/submissions/:id" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to view submission details."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <OrderEntrySubmissionDetailPage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/rate-quote" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="rateQuote"
            deniedTitle="Rate Quote Access Denied"
            deniedMessage="You do not have permission to access Rate Quote. This feature is only available to client users with appropriate access."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <RateQuotePage />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/address-book" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="addressBook"
            deniedTitle="Address Book Access Denied"
            deniedMessage="You do not have permission to access Address Book. This feature is only available to client users with appropriate access."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <AddressBookPage user={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/track-trace" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="trackTrace"
            deniedTitle="Track & Trace Access Denied"
            deniedMessage="You do not have permission to access Track & Trace. This feature is only available to client users with appropriate access."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <TrackTracePage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/shipment/:orderId" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="trackTrace"
            deniedTitle="Shipment Details Access Denied"
            deniedMessage="You do not have permission to access shipment details."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <ShipmentDetailsPage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/invoices" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="invoice"
            deniedTitle="Invoice Access Denied"
            deniedMessage="You do not have permission to access Invoices. This feature is only available to client users with appropriate access."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <InvoicePage currentUser={user} />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/client-users" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            requireClientAccess="clientAdmin"
            deniedTitle="User Management Access Denied"
            deniedMessage="You do not have permission to access User Management. This feature is only available to client administrators."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <ClientSetupPage
                currentUser={user}
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                getAllUsers={getAllUsers}
                createUser={createUser}
                updateUser={updateUser}
                deleteUser={deleteUser}
                updateUserPassword={updateUserPassword}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/logs" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => u.role === 'admin' || u.role === 'user'}
            deniedMessage="You do not have permission to access logs."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <LogsPage
                extractionLogs={extractionLogs}
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                users={users}
                emailPollingLogs={emailPollingLogs}
                workflowExecutionLogs={workflowExecutionLogs}
                workflows={workflows}
                workflowSteps={workflowSteps}
                sftpPollingLogs={sftpPollingLogs}
                processedEmails={processedEmails}
                isAdmin={user?.isAdmin}
                userPermissions={user?.permissions}
                onRefreshLogs={refreshLogs}
                onRefreshLogsWithFilters={refreshLogsWithFilters}
                onRefreshPollingLogs={refreshPollingLogs}
                onStopRunningPollingLogs={stopRunningPollingLogs}
                onRefreshWorkflowLogs={refreshWorkflowExecutionLogs}
                onRefreshSftpPollingLogs={refreshSftpPollingLogs}
                onRefreshProcessedEmails={refreshProcessedEmails}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/settings" element={
        <PrivateRoute isAuthenticated={isAuthenticated} user={user}>
          <RoleBasedRoute
            user={user}
            customCheck={(u) => {
              const nonTypePermissions = {
                sftp: u.permissions.sftp,
                api: u.permissions.api,
                emailMonitoring: u.permissions.emailMonitoring,
                emailRules: u.permissions.emailRules,
                processedEmails: u.permissions.processedEmails,
                extractionLogs: u.permissions.extractionLogs,
                userManagement: u.permissions.userManagement
              };
              return Object.values(nonTypePermissions).some(permission => permission === true);
            }}
            deniedTitle="Settings Access Denied"
            deniedMessage="You do not have permission to access the Settings page. This section requires administrative privileges to configure system settings, manage users, or adjust integrations."
          >
            <LayoutRouter user={user} companyBranding={companyBranding} onLogout={logout} onChangePassword={changeOwnPassword}>
              <SettingsPage
                extractionTypes={extractionTypes}
                transformationTypes={transformationTypes}
                sftpConfig={sftpConfig}
                settingsConfig={settingsConfig}
                apiConfig={apiConfig}
                emailConfig={emailConfig}
                emailRules={emailRules}
                users={users}
                currentUser={user}
                workflows={workflows}
                workflowSteps={workflowSteps}
                companyBranding={companyBranding}
                processedEmails={processedEmails}
                getAllUsers={getAllUsers}
                createUser={createUser}
                updateUser={updateUser}
                deleteUser={deleteUser}
                updateUserPassword={updateUserPassword}
                getUserExtractionTypes={getUserExtractionTypes}
                updateUserExtractionTypes={updateUserExtractionTypes}
                getUserTransformationTypes={getUserTransformationTypes}
                updateUserTransformationTypes={updateUserTransformationTypes}
                getUserExecuteCategories={getUserExecuteCategories}
                updateUserExecuteCategories={updateUserExecuteCategories}
                onUpdateExtractionTypes={handleUpdateExtractionTypes}
                onDeleteExtractionType={handleDeleteExtractionType}
                onUpdateTransformationTypes={handleUpdateTransformationTypes}
                onDeleteTransformationType={handleDeleteTransformationType}
                onUpdateSftpConfig={handleUpdateSftpConfig}
                onUpdateSettingsConfig={handleUpdateSettingsConfig}
                onUpdateApiConfig={handleUpdateApiConfig}
                onUpdateEmailConfig={handleUpdateEmailConfig}
                onUpdateEmailRules={handleUpdateEmailRules}
                onUpdateSftpPollingConfigs={updateSftpPollingConfigs}
                onUpdateCompanyBranding={updateCompanyBranding}
              />
            </LayoutRouter>
          </RoleBasedRoute>
        </PrivateRoute>
      } />

      <Route path="/help" element={<HelpPage />} />

      <Route path="/client/login" element={
        <ClientPortalLogin
          companyBranding={companyBranding}
          onLogin={login}
          isAuthenticated={isAuthenticated}
          user={user}
        />
      } />

      <Route path="/client" element={
        <ClientPortalRedirect
          isAuthenticated={isAuthenticated}
          user={user}
        />
      } />

      <Route path="/client/track-trace" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="track-trace"
          requiredAccess="trackTrace"
        >
          <TrackTracePage currentUser={user} />
        </ClientPortalRoute>
      } />

      <Route path="/client/shipment/:orderId" element={
        <>
          {console.log('[AppRouter] /client/shipment/:orderId route matched!')}
          <ClientPortalRoute
            isAuthenticated={isAuthenticated}
            user={user}
            companyBranding={companyBranding}
            onLogout={logout}
            onChangePassword={changeOwnPassword}
            currentPage="shipment-details"
            requiredAccess="trackTrace"
          >
            <ShipmentDetailsPage currentUser={user} />
          </ClientPortalRoute>
        </>
      } />

      <Route path="/client/order-entry" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="order-entry"
          requiredAccess="orderEntry"
        >
          <OrderEntryPage currentUser={user!} />
        </ClientPortalRoute>
      } />

      <Route path="/client/submissions" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="submissions"
          requiredAccess="submissions"
        >
          <ClientSubmissionsPage currentUser={user!} />
        </ClientPortalRoute>
      } />

      <Route path="/client/rate-quotes" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="rate-quote"
          requiredAccess="rateQuote"
        >
          <RateQuotePage />
        </ClientPortalRoute>
      } />

      <Route path="/client/invoices" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="invoices"
          requiredAccess="invoice"
        >
          <InvoicePage currentUser={user} />
        </ClientPortalRoute>
      } />

      <Route path="/client/address-book" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="address-book"
          requiredAccess="addressBook"
        >
          <AddressBookPage user={user!} />
        </ClientPortalRoute>
      } />

      <Route path="/client/users" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="users"
          requiredAccess="clientAdmin"
        >
          <ClientUsersPage
            currentUser={user!}
            getAllUsers={getAllUsers}
            createUser={createUser}
            updateUser={updateUser}
            deleteUser={deleteUser}
            updateUserPassword={updateUserPassword}
          />
        </ClientPortalRoute>
      } />

      <Route path="/client/help" element={
        <ClientPortalRoute
          isAuthenticated={isAuthenticated}
          user={user}
          companyBranding={companyBranding}
          onLogout={logout}
          onChangePassword={changeOwnPassword}
          currentPage="help"
        >
          <ClientHelpPage />
        </ClientPortalRoute>
      } />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

interface ClientPortalLoginProps {
  companyBranding?: any;
  onLogin: (username: string, password: string, loginType?: 'admin' | 'client') => Promise<{ success: boolean; message?: string }>;
  isAuthenticated: boolean;
  user: any;
}

function ClientPortalLogin({ companyBranding, onLogin, isAuthenticated, user }: ClientPortalLoginProps) {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'client') {
        const defaultPage = getClientDefaultPage(user);
        navigate(`/client/${defaultPage}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleClientLogin = async (username: string, password: string) => {
    const result = await onLogin(username, password, 'client');
    return {
      ...result,
      isClientUser: result.success
    };
  };

  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return <ClientLoginPage companyBranding={companyBranding} onLogin={handleClientLogin} />;
}

interface ClientPortalRedirectProps {
  isAuthenticated: boolean;
  user: any;
}

function ClientPortalRedirect({ isAuthenticated, user }: ClientPortalRedirectProps) {
  if (!isAuthenticated || !user) {
    return <Navigate to="/client/login" replace />;
  }

  if (user.role !== 'client') {
    return <Navigate to="/" replace />;
  }

  const defaultPage = getClientDefaultPage(user);
  return <Navigate to={`/client/${defaultPage}`} replace />;
}

function getClientDefaultPage(user: any): string {
  if (user.hasTrackTraceAccess) return 'track-trace';
  if (user.hasOrderEntryAccess) return 'order-entry';
  if (user.hasSubmissionsAccess) return 'submissions';
  if (user.hasRateQuoteAccess) return 'rate-quotes';
  if (user.hasInvoiceAccess) return 'invoices';
  if (user.hasAddressBookAccess || user.isClientAdmin) return 'address-book';
  if (user.isClientAdmin) return 'users';
  return 'help';
}

interface ClientPortalRouteProps {
  isAuthenticated: boolean;
  user: any;
  companyBranding?: any;
  onLogout: () => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  currentPage: 'order-entry' | 'rate-quote' | 'address-book' | 'track-trace' | 'invoices' | 'users' | 'submissions' | 'help';
  requiredAccess?: 'orderEntry' | 'rateQuote' | 'addressBook' | 'trackTrace' | 'invoice' | 'clientAdmin' | 'submissions';
  children: React.ReactNode;
}

function ClientPortalRoute({
  isAuthenticated,
  user,
  companyBranding,
  onLogout,
  onChangePassword,
  currentPage,
  requiredAccess,
  children
}: ClientPortalRouteProps) {
  const navigate = useNavigate();

  console.log(`[ClientPortalRoute] Rendering ${currentPage} - user object:`, {
    id: user?.id,
    username: user?.username,
    clientId: user?.clientId,
    role: user?.role,
    hasTrackTraceAccess: user?.hasTrackTraceAccess
  });

  if (!isAuthenticated || !user) {
    return <Navigate to="/client/login" replace />;
  }

  if (user.role !== 'client') {
    return <Navigate to="/" replace />;
  }

  if (requiredAccess) {
    let hasAccess = false;
    switch (requiredAccess) {
      case 'orderEntry':
        hasAccess = user.hasOrderEntryAccess === true;
        break;
      case 'rateQuote':
        hasAccess = user.hasRateQuoteAccess === true;
        break;
      case 'addressBook':
        hasAccess = user.hasAddressBookAccess === true || user.isClientAdmin === true;
        break;
      case 'trackTrace':
        hasAccess = user.hasTrackTraceAccess === true;
        break;
      case 'invoice':
        hasAccess = user.hasInvoiceAccess === true;
        break;
      case 'clientAdmin':
        hasAccess = user.isClientAdmin === true;
        break;
      case 'submissions':
        hasAccess = user.hasSubmissionsAccess === true;
        break;
    }

    if (!hasAccess) {
      const defaultPage = getClientDefaultPage(user);
      return <Navigate to={`/client/${defaultPage}`} replace />;
    }
  }

  const handleNavigate = (page: 'order-entry' | 'rate-quote' | 'address-book' | 'track-trace' | 'invoices' | 'users' | 'submissions' | 'help') => {
    const routeMap: Record<string, string> = {
      'order-entry': '/client/order-entry',
      'rate-quote': '/client/rate-quotes',
      'address-book': '/client/address-book',
      'track-trace': '/client/track-trace',
      'invoices': '/client/invoices',
      'submissions': '/client/submissions',
      'users': '/client/users',
      'help': '/client/help'
    };
    navigate(routeMap[page] || '/client/help');
  };

  const handleClientLogout = () => {
    onLogout();
    navigate('/client/login');
  };

  return (
    <ClientLayout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      user={user}
      companyBranding={companyBranding}
      onLogout={handleClientLogout}
      onChangePassword={onChangePassword}
    >
      {children}
    </ClientLayout>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <DarkModeProvider>
        <LicenseProvider>
          <AppContent />
        </LicenseProvider>
      </DarkModeProvider>
    </BrowserRouter>
  );
}
