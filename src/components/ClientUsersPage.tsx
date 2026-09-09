import React from 'react';
import type { User } from '../types';
import ClientUsersManagementSettings from './settings/ClientUsersManagementSettings';

interface ClientUsersPageProps {
  currentUser: User;
  getAllUsers: () => Promise<User[]>;
  createUser: (username: string, password: string, isAdmin: boolean, role: 'admin' | 'user' | 'vendor' | 'client', email?: string, name?: string) => Promise<{ success: boolean; message: string }>;
  updateUser: (userId: string, updates: {
    isAdmin?: boolean;
    isActive?: boolean;
    permissions?: any;
    role?: 'admin' | 'user' | 'vendor' | 'client';
    currentZone?: string;
    clientId?: string;
    isClientAdmin?: boolean;
    hasOrderEntryAccess?: boolean;
    hasRateQuoteAccess?: boolean;
    hasAddressBookAccess?: boolean;
    hasTrackTraceAccess?: boolean;
    hasInvoiceAccess?: boolean;
    email?: string;
    name?: string;
  }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

export default function ClientUsersPage({
  currentUser,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserPassword
}: ClientUsersPageProps) {
  return (
    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl border border-blue-100 dark:border-gray-700 p-6">
      <ClientUsersManagementSettings
        currentUser={currentUser}
        getAllUsers={getAllUsers}
        createUser={createUser}
        updateUser={updateUser}
        deleteUser={deleteUser}
        updateUserPassword={updateUserPassword}
      />
    </div>
  );
}
