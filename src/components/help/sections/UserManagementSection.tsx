import React from 'react';
import { Users } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function UserManagementSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Users}
        title="User Management & Permissions"
        iconBgColor="bg-pink-100"
        iconColor="text-pink-600"
      />
      <div className="bg-pink-50 border border-pink-200 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-pink-800 mb-4">User Types:</h3>
            <ul className="text-pink-700 space-y-2">
              <li>• <strong>Administrator:</strong> Full access to all settings and features</li>
              <li>• <strong>Regular User:</strong> Access only to extraction features by default</li>
              <li>• <strong>Custom Permissions:</strong> Granular control over specific settings sections</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-pink-800 mb-4">Permission Categories:</h3>
            <ul className="text-pink-700 space-y-2">
              <li>• Extraction Types, SFTP, API Settings</li>
              <li>• Email Monitoring, Rules, Processed Emails</li>
              <li>• Extraction Logs, User Management</li>
              <li>• Workflow Management</li>
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
