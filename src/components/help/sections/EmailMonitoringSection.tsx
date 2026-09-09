import React from 'react';
import { Mail } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function EmailMonitoringSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Mail}
        title="Email Monitoring"
        iconBgColor="bg-indigo-100"
        iconColor="text-indigo-600"
      />
      <div className="space-y-6">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
          <h3 className="font-semibold text-indigo-800 mb-4">How Email Monitoring Works</h3>
          <ol className="text-indigo-700 space-y-3 list-decimal list-inside">
            <li><strong>Email Scanning:</strong> Parse-It periodically checks your configured email account for new messages with PDF attachments</li>
            <li><strong>Rule Matching:</strong> Each email is matched against your processing rules based on sender and subject patterns</li>
            <li><strong>AI Detection (Optional):</strong> If enabled, AI analyzes the PDF to automatically detect the best extraction type</li>
            <li><strong>Data Extraction:</strong> The PDF is processed using the matched or detected extraction type</li>
            <li><strong>File Upload:</strong> Extracted data and PDF files are uploaded to your SFTP server</li>
            <li><strong>Email Archiving:</strong> Processed emails are moved to archive to prevent reprocessing</li>
          </ol>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-800 mb-3">Office 365 Setup</h3>
            <ul className="text-blue-700 space-y-2">
              <li>• Register app in Azure AD</li>
              <li>• Grant Mail.Read permissions</li>
              <li>• Create client secret</li>
              <li>• Configure tenant ID and client credentials</li>
            </ul>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="font-semibold text-green-800 mb-3">Gmail Setup</h3>
            <ul className="text-green-700 space-y-2">
              <li>• Create Google Cloud project</li>
              <li>• Enable Gmail API</li>
              <li>• Configure OAuth consent screen</li>
              <li>• Generate refresh token</li>
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
