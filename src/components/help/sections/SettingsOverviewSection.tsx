import React from 'react';
import { Settings, FileText, Server, Key, Mail, Filter, Users } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function SettingsOverviewSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Settings}
        title="Settings Overview"
        iconBgColor="bg-gray-100"
        iconColor="text-gray-600"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <FileText className="h-6 w-6 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Extraction Types</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Create and manage templates for different document types. Define extraction instructions, output formats, and field mappings.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <Server className="h-6 w-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">SFTP Settings</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Configure your SFTP server connection for uploading extracted XML files and PDF documents.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <Key className="h-6 w-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">API Settings</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Set up API endpoints for JSON data transmission and configure your Google Gemini API key for AI processing.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <Mail className="h-6 w-6 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Email Monitoring</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Configure Office 365 or Gmail monitoring to automatically process PDF attachments from incoming emails.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <Filter className="h-6 w-6 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Email Rules</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Create rules to automatically match incoming emails to specific extraction types based on sender and subject patterns.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <Users className="h-6 w-6 text-pink-600" />
            <h3 className="font-semibold text-gray-900">User Management</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Manage user accounts, permissions, and access levels. Control who can access different parts of the application.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
