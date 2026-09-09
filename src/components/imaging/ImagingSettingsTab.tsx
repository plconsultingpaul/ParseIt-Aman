import React, { useState } from 'react';
import { Database, FileType, Tags, ScanBarcode, Mail, Filter, AlertCircle, Cpu, Server, FolderOpen, Layers, Webhook } from 'lucide-react';
import ImagingBucketsSection from './ImagingBucketsSection';
import ImagingBarcodePatternsSection from './ImagingBarcodePatternsSection';
import ImagingDocumentTypesSection from './ImagingDocumentTypesSection';
import ImagingMetadataFieldsSection from './ImagingMetadataFieldsSection';
import ImagingEmailMonitoringSection from './ImagingEmailMonitoringSection';
import ImagingEmailRulesSection from './ImagingEmailRulesSection';
import ImagingCloudConvertSection from './ImagingCloudConvertSection';
import ImagingSftpConnectionSection from './ImagingSftpConnectionSection';
import ImagingSftpFoldersSection from './ImagingSftpFoldersSection';
import ImagingSftpRulesSection from './ImagingSftpRulesSection';
import ImagingQueuesSection from './ImagingQueuesSection';
import ImagingIngestLogsSection from './ImagingIngestLogsSection';
import ImagingDocumentTypeRulesSection from './ImagingDocumentTypeRulesSection';

interface ImagingSettingsTabProps {
  isAdmin: boolean;
}

type SettingsSection =
  | 'buckets'
  | 'queues'
  | 'barcode-patterns'
  | 'document-types'
  | 'metadata-fields'
  | 'email-provider'
  | 'email-rules'
  | 'sftp-connection'
  | 'sftp-folders'
  | 'sftp-rules'
  | 'document-type-rules'
  | 'cloudconvert'
  | 'ingest-logs';

interface SidebarGroup {
  label: string;
  items: {
    id: SettingsSection;
    label: string;
    icon: React.ElementType;
  }[];
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Storage',
    items: [
      { id: 'buckets', label: 'Storage Buckets', icon: Database },
      { id: 'queues', label: 'Queues', icon: Layers },
      { id: 'barcode-patterns', label: 'Barcode Patterns', icon: ScanBarcode },
    ],
  },
  {
    label: 'Types',
    items: [
      { id: 'document-types', label: 'Document Types', icon: FileType },
      { id: 'metadata-fields', label: 'Meta Fields', icon: Tags },
      { id: 'document-type-rules', label: 'Processing Rules', icon: Filter },
    ],
  },
  {
    label: 'Email Monitoring',
    items: [
      { id: 'email-provider', label: 'Provider Configuration', icon: Mail },
      { id: 'email-rules', label: 'Processing Rules', icon: Filter },
    ],
  },
  {
    label: 'SFTP Monitoring',
    items: [
      { id: 'sftp-connection', label: 'Connection Settings', icon: Server },
      { id: 'sftp-folders', label: 'Folder Configuration', icon: FolderOpen },
      { id: 'sftp-rules', label: 'Processing Rules', icon: Filter },
    ],
  },
  {
    label: 'Processing',
    items: [
      { id: 'cloudconvert', label: 'CloudConvert', icon: Cpu },
    ],
  },
  {
    label: 'API Access',
    items: [
      { id: 'ingest-logs', label: 'Ingest Logs', icon: Webhook },
    ],
  },
];

export default function ImagingSettingsTab({ isAdmin }: ImagingSettingsTabProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('buckets');

  const renderContent = () => {
    switch (activeSection) {
      case 'buckets':
        return <ImagingBucketsSection isAdmin={isAdmin} />;
      case 'queues':
        return <ImagingQueuesSection isAdmin={isAdmin} />;
      case 'barcode-patterns':
        return <ImagingBarcodePatternsSection isAdmin={isAdmin} />;
      case 'document-types':
        return <ImagingDocumentTypesSection isAdmin={isAdmin} />;
      case 'metadata-fields':
        return <ImagingMetadataFieldsSection isAdmin={isAdmin} />;
      case 'email-provider':
        return <ImagingEmailMonitoringSection isAdmin={isAdmin} />;
      case 'email-rules':
        return <ImagingEmailRulesSection isAdmin={isAdmin} />;
      case 'sftp-connection':
        return <ImagingSftpConnectionSection isAdmin={isAdmin} />;
      case 'sftp-folders':
        return <ImagingSftpFoldersSection isAdmin={isAdmin} />;
      case 'sftp-rules':
        return <ImagingSftpRulesSection isAdmin={isAdmin} />;
      case 'document-type-rules':
        return <ImagingDocumentTypeRulesSection isAdmin={isAdmin} />;
      case 'cloudconvert':
        return <ImagingCloudConvertSection isAdmin={isAdmin} />;
      case 'ingest-logs':
        return <ImagingIngestLogsSection isAdmin={isAdmin} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[500px]">
      <nav className="lg:w-56 flex-shrink-0">
        <div className="space-y-5">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 px-3">
                {group.label}
              </h4>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${
                        isActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!isAdmin && (
          <div className="mt-6 flex items-center space-x-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Admin access required to manage settings.</span>
          </div>
        )}
      </nav>

      <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  );
}
