import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import LoginPage from './components/LoginPage';
import Layout from './components/Layout';
import ExtractPage from './components/ExtractPage';
import TransformPage from './components/TransformPage';
import SettingsPage from './components/SettingsPage';
import LogsPage from './components/LogsPage';
import TypeSetupPage from './components/TypeSetupPage';
import VendorSetupPage from './components/VendorSetupPage';
import CheckInSetupPage from './components/CheckInSetupPage';
import ClientSetupPage from './components/ClientSetupPage';
import OrderEntryPage from './components/OrderEntryPage';
import OrderEntrySubmissionsPage from './components/OrderEntrySubmissionsPage';
import OrderEntrySubmissionDetailPage from './components/OrderEntrySubmissionDetailPage';
import RateQuotePage from './components/RateQuotePage';
import AddressBookPage from './components/AddressBookPage';
import DriverCheckinPage from './components/DriverCheckinPage';
import ImagingPage from './components/ImagingPage';
import PermissionDeniedModal from './components/common/PermissionDeniedModal';
import { useSupabaseData } from './hooks/useSupabaseData';
import { LicenseProvider } from './contexts/LicenseContext';
import { Loader2 } from 'lucide-react';
import type { ExtractionType, TransformationType, SftpConfig, SettingsConfig, ApiConfig, EmailMonitoringConfig, EmailProcessingRule, User, SecuritySettings, CompanyBranding } from './types';

export default function App() {
  const [isDriverCheckin, setIsDriverCheckin] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    message: ''
  });

  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/driver-checkin' || path === '/checkin') {
      setIsDriverCheckin(true);
    }
  }, []);

  const {
    isAuthenticated,
    user,
    loading: authLoading,
    sessionExpiredMessage,
    login,
    logout,
    clearSessionExpiredMessage,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    updateUserPassword,
    getUserExtractionTypes,
    updateUserExtractionTypes,
    getUserTransformationTypes,
    updateUserTransformationTypes,
    getUserExecuteCategories,
    updateUserExecuteCategories
  } = useAuth();
  const [currentPage, setCurrentPage] = useState<'extract' | 'vendor-setup' | 'checkin-setup' | 'client-setup' | 'transform' | 'types' | 'settings' | 'logs' | 'order-entry' | 'order-submissions' | 'order-submission-detail' | 'rate-quote' | 'client-users' | 'address-book' | 'imaging'>('extract');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
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

  // Navigate to appropriate page when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      // Client users start on order-entry or rate-quote if they have access
      if (user.role === 'client') {
        if (user.hasOrderEntryAccess) {
          setCurrentPage('order-entry');
        } else if (user.hasRateQuoteAccess) {
          setCurrentPage('rate-quote');
        } else if (user.isClientAdmin) {
          setCurrentPage('client-users');
        }
      } else {
        // All other users start on the extract page
        setCurrentPage('extract');
      }
    }
  }, [isAuthenticated, user]);

  if (isDriverCheckin) {
    return <DriverCheckinPage />;
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <span className="text-lg font-medium text-purple-600">
            {authLoading ? 'Checking authentication...' : 'Loading your data...'}
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <LoginPage
        companyBranding={companyBranding}
        onLogin={login}
        sessionExpiredMessage={sessionExpiredMessage}
        onClearSessionExpiredMessage={clearSessionExpiredMessage}
      />
    );
  }

  const handleNavigate = (page: 'extract' | 'vendor-setup' | 'checkin-setup' | 'client-setup' | 'transform' | 'types' | 'settings' | 'logs' | 'order-entry' | 'order-submissions' | 'rate-quote' | 'client-users' | 'imaging') => {
    // Check for settings permission
    if (page === 'settings') {
      const nonTypePermissions = {
        sftp: user.permissions.sftp,
        api: user.permissions.api,
        emailMonitoring: user.permissions.emailMonitoring,
        emailRules: user.permissions.emailRules,
        processedEmails: user.permissions.processedEmails,
        extractionLogs: user.permissions.extractionLogs,
        userManagement: user.permissions.userManagement
      };
      const hasAnyPermission = Object.values(nonTypePermissions).some(permission => permission === true);

      if (!hasAnyPermission) {
        setPermissionDenied({
          isOpen: true,
          message: 'You do not have permission to access the Settings page. This section requires administrative privileges to configure system settings, manage users, or adjust integrations.',
          title: 'Settings Access Denied'
        });
        return;
      }
    }

    // Check for vendor-setup permission (requires userManagement)
    if (page === 'vendor-setup' && !user.permissions.userManagement) {
      setPermissionDenied({
        isOpen: true,
        message: 'You do not have permission to access Vendor Setup. This section requires user management privileges.',
        title: 'Vendor Setup Access Denied'
      });
      return;
    }

    // Check for checkin-setup permission (requires admin)
    if (page === 'checkin-setup' && !user.isAdmin) {
      setPermissionDenied({
        isOpen: true,
        message: 'You do not have permission to access Check-In Setup. This section requires administrator privileges.',
        title: 'Check-In Setup Access Denied'
      });
      return;
    }

    // Check for client-setup permission (requires userManagement)
    if (page === 'client-setup' && !user.permissions.userManagement) {
      setPermissionDenied({
        isOpen: true,
        message: 'You do not have permission to access Client Setup. This section requires user management privileges.',
        title: 'Client Setup Access Denied'
      });
      return;
    }

    // Check for order-entry permission (requires client role with access)
    if (page === 'order-entry') {
      if (user.role !== 'client' || !user.hasOrderEntryAccess) {
        setPermissionDenied({
          isOpen: true,
          message: 'You do not have permission to access Order Entry. This feature is only available to client users with appropriate access.',
          title: 'Order Entry Access Denied'
        });
        return;
      }
    }

    // Check for rate-quote permission (requires client role with access)
    if (page === 'rate-quote') {
      if (user.role !== 'client' || !user.hasRateQuoteAccess) {
        setPermissionDenied({
          isOpen: true,
          message: 'You do not have permission to access Rate Quote. This feature is only available to client users with appropriate access.',
          title: 'Rate Quote Access Denied'
        });
        return;
      }
    }

    // Check for address-book permission (requires client role with access or Client Admin)
    if (page === 'address-book') {
      if (user.role !== 'client' || (!user.hasAddressBookAccess && !user.isClientAdmin)) {
        setPermissionDenied({
          isOpen: true,
          message: 'You do not have permission to access Address Book. This feature is only available to client users with appropriate access.',
          title: 'Address Book Access Denied'
        });
        return;
      }
    }

    // Check for client-users permission (requires client admin)
    if (page === 'client-users') {
      if (user.role !== 'client' || !user.isClientAdmin) {
        setPermissionDenied({
          isOpen: true,
          message: 'You do not have permission to access User Management. This feature is only available to client administrators.',
          title: 'User Management Access Denied'
        });
        return;
      }
    }

    // Prevent vendors from accessing admin/user pages
    if ((page === 'types' || page === 'logs' || page === 'settings' || page === 'transform' || page === 'vendor-setup' || page === 'checkin-setup' || page === 'client-setup') && user.role === 'vendor') {
      setPermissionDenied({
        isOpen: true,
        message: 'You do not have permission to access this section. Your account is configured with vendor-only access.',
        title: 'Access Denied'
      });
      return;
    }

    // Prevent client users from accessing admin/user pages
    if ((page === 'extract' || page === 'types' || page === 'logs' || page === 'settings' || page === 'transform' || page === 'vendor-setup' || page === 'checkin-setup' || page === 'client-setup') && user.role === 'client') {
      setPermissionDenied({
        isOpen: true,
        message: 'You do not have permission to access this section. Your account is configured with vendor-only access.',
        title: 'Access Denied'
      });
      return;
    }

    setCurrentPage(page);
  };

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

  const handleUpdateCompanyBranding = async (branding: CompanyBranding) => {
    try {
      await updateCompanyBranding(branding);
    } catch (error) {
      console.error('Failed to update company branding:', error);
      alert('Failed to save company branding. Please try again.');
    }
  };

  return (
    <LicenseProvider>
      <PermissionDeniedModal
        isOpen={permissionDenied.isOpen}
        onClose={() => setPermissionDenied({ isOpen: false, message: '' })}
        message={permissionDenied.message}
        title={permissionDenied.title}
      />
      <Layout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        user={user}
        companyBranding={companyBranding}
        onLogout={logout}
      >
        {currentPage === 'extract' && (
        <ExtractPage
          extractionTypes={extractionTypes}
          transformationTypes={transformationTypes}
          sftpConfig={sftpConfig}
          settingsConfig={settingsConfig}
          apiConfig={apiConfig}
          onNavigateToSettings={() => setCurrentPage('settings')}
        />
      )}
      {currentPage === 'vendor-setup' && (
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
      )}
      {currentPage === 'checkin-setup' && (
        <CheckInSetupPage
          workflows={workflows}
        />
      )}
      {currentPage === 'client-setup' && (
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
      )}
      {currentPage === 'order-entry' && (
        <OrderEntryPage currentUser={user} />
      )}
      {currentPage === 'order-submissions' && (
        <OrderEntrySubmissionsPage
          currentUser={user}
          onViewDetail={(id) => {
            setSelectedSubmissionId(id);
            setCurrentPage('order-submission-detail');
          }}
        />
      )}
      {currentPage === 'order-submission-detail' && selectedSubmissionId && (
        <OrderEntrySubmissionDetailPage
          currentUser={user}
          submissionId={selectedSubmissionId}
          onBack={() => setCurrentPage('order-submissions')}
        />
      )}
      {currentPage === 'rate-quote' && (
        <RateQuotePage />
      )}
      {currentPage === 'address-book' && (
        <AddressBookPage user={user} />
      )}
      {currentPage === 'client-users' && (
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
      )}
      {currentPage === 'imaging' && (
        <ImagingPage isAdmin={user.isAdmin} />
      )}
      {currentPage === 'transform' && (
        <TransformPage
          transformationTypes={transformationTypes}
          sftpConfig={sftpConfig}
          settingsConfig={settingsConfig}
          apiConfig={apiConfig}
          onNavigateToSettings={() => setCurrentPage('settings')}
          getUserTransformationTypes={getUserTransformationTypes}
        />
      )}
      {currentPage === 'logs' && (
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
      )}
      {currentPage === 'types' && (
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
      )}
      {currentPage === 'settings' && (
        <SettingsPage
          extractionTypes={extractionTypes}
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
          onUpdateCompanyBranding={handleUpdateCompanyBranding}
        />
      )}
      </Layout>
    </LicenseProvider>
  );
}