import React, { useState } from 'react';
import { Users, Database } from 'lucide-react';
import type { User, ApiConfig, ExtractionType, TransformationType } from '../types';
import VendorManagementSettings from './settings/VendorManagementSettings';
import OrdersDisplayConfiguration from './orders/OrdersDisplayConfiguration';
import CustomDisplayLabels from './orders/CustomDisplayLabels';
import OrdersPreview from './orders/OrdersPreview';
import { Save } from 'lucide-react';

interface VendorSetupPageProps {
  currentUser: User;
  apiConfig: ApiConfig;
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  getAllUsers: () => Promise<User[]>;
  createUser: (username: string, password: string, isAdmin: boolean, role: 'admin' | 'user' | 'vendor') => Promise<{ success: boolean; message: string }>;
  updateUser: (userId: string, updates: { isAdmin?: boolean; isActive?: boolean; permissions?: any; role?: 'admin' | 'user' | 'vendor'; currentZone?: string }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  onUpdateApiConfig: (config: ApiConfig) => Promise<void>;
}

type VendorSetupTab = 'vendors' | 'orders';

export default function VendorSetupPage({
  currentUser,
  apiConfig,
  extractionTypes,
  transformationTypes,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserPassword,
  onUpdateApiConfig
}: VendorSetupPageProps) {
  const [activeTab, setActiveTab] = useState<VendorSetupTab>('vendors');
  const [localOrderDisplayFields, setLocalOrderDisplayFields] = useState(apiConfig.orderDisplayFields || '');
  const [localCustomOrderDisplayFields, setLocalCustomOrderDisplayFields] = useState(apiConfig.customOrderDisplayFields || []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const tabs = [
    { id: 'vendors' as VendorSetupTab, label: 'Vendor Management', icon: Users, description: 'Manage vendor accounts and rules' },
    { id: 'orders' as VendorSetupTab, label: 'Orders Configuration', icon: Database, description: 'Configure orders display settings' }
  ];

  const handleSaveOrdersConfiguration = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const updatedConfig = {
        ...apiConfig,
        orderDisplayFields: localOrderDisplayFields,
        customOrderDisplayFields: localCustomOrderDisplayFields
      };
      await onUpdateApiConfig(updatedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save orders configuration:', error);
      alert('Failed to save orders configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const parseDisplayFields = (): string[] => {
    try {
      if (localOrderDisplayFields) {
        const parsed = JSON.parse(localOrderDisplayFields);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to parse display fields:', error);
    }
    return ['orderId', 'opCode'];
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'vendors':
        return currentUser.permissions.userManagement ? (
          <VendorManagementSettings
            currentUser={currentUser}
            extractionTypes={extractionTypes}
            transformationTypes={transformationTypes}
            getAllUsers={getAllUsers}
            createUser={createUser}
            updateUser={updateUser}
            deleteUser={deleteUser}
            updateUserPassword={updateUserPassword}
          />
        ) : <PermissionDenied />;
      case 'orders':
        return currentUser.permissions.userManagement ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Orders Display Configuration</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Configure display fields and labels for the Orders dashboard</p>
              </div>
              <button
                onClick={handleSaveOrdersConfiguration}
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>

            {saveSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                  <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
                </div>
                <p className="text-green-700 dark:text-green-400 text-sm mt-1">Orders configuration saved successfully!</p>
              </div>
            )}

            <OrdersDisplayConfiguration
              orderDisplayFields={localOrderDisplayFields}
              onUpdateOrderDisplayFields={setLocalOrderDisplayFields}
            />

            <CustomDisplayLabels
              customOrderDisplayFields={localCustomOrderDisplayFields}
              onUpdateCustomOrderDisplayFields={setLocalCustomOrderDisplayFields}
            />

            <OrdersPreview
              apiConfig={apiConfig}
              displayFields={parseDisplayFields()}
              customDisplayFields={localCustomOrderDisplayFields}
            />
          </div>
        ) : <PermissionDenied />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Horizontal Tab Navigation */}
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

      {/* Tab Content */}
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
