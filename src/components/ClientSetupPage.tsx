import React, { useState } from 'react';
import { Users, Building2, ClipboardList, FileText, Search, Receipt } from 'lucide-react';
import type { User, ExtractionType, TransformationType, Client } from '../types';
import ClientManagementSettings from './settings/ClientManagementSettings';
import ClientUsersManagementSettings from './settings/ClientUsersManagementSettings';
import OrderEntryConfigSettings from './settings/OrderEntryConfigSettings';
import OrderEntrySubmissionsPage from './OrderEntrySubmissionsPage';
import TrackTraceTemplatesSettings from './settings/TrackTraceTemplatesSettings';
import InvoiceConfigSettings from './settings/InvoiceConfigSettings';

interface ClientSetupPageProps {
  currentUser: User;
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  getAllUsers: () => Promise<User[]>;
  createUser: (username: string, password: string, isAdmin: boolean, role: 'admin' | 'user' | 'vendor' | 'client', email?: string) => Promise<{ success: boolean; message: string }>;
  updateUser: (userId: string, updates: { isAdmin?: boolean; isActive?: boolean; permissions?: any; role?: 'admin' | 'user' | 'vendor' | 'client'; currentZone?: string; clientId?: string; isClientAdmin?: boolean; hasOrderEntryAccess?: boolean; hasRateQuoteAccess?: boolean; hasTrackTraceAccess?: boolean; hasInvoiceAccess?: boolean; email?: string }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

type ClientSetupTab = 'clients' | 'users' | 'orderEntry' | 'submissions' | 'trackTrace' | 'invoices';

export default function ClientSetupPage({
  currentUser,
  extractionTypes,
  transformationTypes,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserPassword
}: ClientSetupPageProps) {
  const isClientUser = currentUser.role === 'client';
  const isClientAdmin = isClientUser && currentUser.isClientAdmin === true;
  const hasSystemUserManagement = currentUser.permissions.userManagement === true;

  const defaultTab: ClientSetupTab = isClientUser ? 'users' : 'clients';
  const [activeTab, setActiveTab] = useState<ClientSetupTab>(defaultTab);
  const [preselectedClientId, setPreselectedClientId] = useState<string | null>(null);

  const handleManageClientUsers = (clientId: string) => {
    setPreselectedClientId(clientId);
    setActiveTab('users');
  };

  const tabs = [
    ...(!isClientUser && hasSystemUserManagement ? [{ id: 'clients' as ClientSetupTab, label: 'Client Management', icon: Building2, description: 'Manage client companies and access' }] : []),
    ...(isClientAdmin || hasSystemUserManagement ? [{ id: 'users' as ClientSetupTab, label: 'User Management', icon: Users, description: 'Manage client users and permissions' }] : []),
    ...(!isClientUser && hasSystemUserManagement ? [{ id: 'orderEntry' as ClientSetupTab, label: 'Order Entry', icon: ClipboardList, description: 'Configure order entry forms and API' }] : []),
    ...(!isClientUser && hasSystemUserManagement ? [{ id: 'submissions' as ClientSetupTab, label: 'Submissions', icon: FileText, description: 'View order entry submissions' }] : []),
    ...(!isClientUser && hasSystemUserManagement ? [{ id: 'trackTrace' as ClientSetupTab, label: 'Track & Trace', icon: Search, description: 'Manage Track & Trace templates' }] : []),
    ...(!isClientUser && hasSystemUserManagement ? [{ id: 'invoices' as ClientSetupTab, label: 'Invoices', icon: Receipt, description: 'Configure invoice API and display' }] : [])
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'clients':
        return (!isClientUser && hasSystemUserManagement) ? (
          <ClientManagementSettings
            currentUser={currentUser}
            getAllUsers={getAllUsers}
            onManageUsers={handleManageClientUsers}
          />
        ) : <PermissionDenied />;
      case 'users':
        return (isClientAdmin || hasSystemUserManagement) ? (
          <ClientUsersManagementSettings
            currentUser={currentUser}
            getAllUsers={getAllUsers}
            createUser={createUser}
            updateUser={updateUser}
            deleteUser={deleteUser}
            updateUserPassword={updateUserPassword}
            preselectedClientId={preselectedClientId}
            onPreselectedClientHandled={() => setPreselectedClientId(null)}
          />
        ) : <PermissionDenied />;
      case 'orderEntry':
        return (!isClientUser && hasSystemUserManagement) ? (
          <OrderEntryConfigSettings
            currentUser={currentUser}
          />
        ) : <PermissionDenied />;
      case 'submissions':
        return (!isClientUser && hasSystemUserManagement) ? (
          <OrderEntrySubmissionsPage currentUser={currentUser} />
        ) : <PermissionDenied />;
      case 'trackTrace':
        return (!isClientUser && hasSystemUserManagement) ? (
          <TrackTraceTemplatesSettings currentUser={currentUser} />
        ) : <PermissionDenied />;
      case 'invoices':
        return (!isClientUser && hasSystemUserManagement) ? (
          <InvoiceConfigSettings currentUser={currentUser} />
        ) : <PermissionDenied />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-purple-700 dark:text-purple-300 shadow-sm font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 hover:ring-2 hover:ring-purple-400 dark:hover:ring-purple-500'
              }`}
            >
              <Icon className={`h-4 w-4 ${
                activeTab === tab.id ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'
              }`} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl border border-purple-100 dark:border-gray-700 p-6">
        {renderTabContent()}
      </div>
    </div>
  );
}

function PermissionDenied() {
  return (
    <div className="text-center py-12">
      <div className="bg-red-100 dark:bg-red-900/50 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
        <Users className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Access Denied</h3>
      <p className="text-gray-600 dark:text-gray-400">You don't have permission to access this section.</p>
      <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">Contact your administrator to request access.</p>
    </div>
  );
}
