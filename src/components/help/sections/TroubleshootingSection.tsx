import React from 'react';
import { AlertCircle } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function TroubleshootingSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={AlertCircle}
        title="Troubleshooting"
        iconBgColor="bg-red-100"
        iconColor="text-red-600"
      />
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="font-semibold text-red-800 mb-4">Common Issues & Solutions</h3>
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-red-800 mb-2">AI Extraction Fails:</h4>
            <ul className="text-red-700 space-y-2 ml-4">
              <li>• Check that your Google Gemini API key is configured in API Settings</li>
              <li>• Ensure your extraction instructions are clear and specific</li>
              <li>• Verify the PDF is not corrupted or password-protected</li>
              <li>• Try simplifying your extraction template</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-red-800 mb-2">SFTP Upload Fails:</h4>
            <ul className="text-red-700 space-y-2 ml-4">
              <li>• Test your SFTP connection in SFTP Settings</li>
              <li>• Verify server credentials and paths are correct</li>
              <li>• Check that the remote directories exist and are writable</li>
              <li>• Ensure firewall allows connections on the specified port</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-red-800 mb-2">API Calls Fail:</h4>
            <ul className="text-red-700 space-y-2 ml-4">
              <li>• Test your API connection using the "Test TruckMate API" button</li>
              <li>• Verify the API endpoint URL and authentication token</li>
              <li>• Check that your JSON template matches the API's expected format</li>
              <li>• Review API error details in the extraction logs</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-red-800 mb-2">Email Monitoring Issues:</h4>
            <ul className="text-red-700 space-y-2 ml-4">
              <li>• Test your email connection before enabling monitoring</li>
              <li>• Ensure your app has proper permissions (Mail.Read for Office 365)</li>
              <li>• Check that processing rules are enabled and properly configured</li>
              <li>• Verify the monitored email address is correct</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-red-800 mb-2">Advanced Processing Issues:</h4>
            <ul className="text-red-700 space-y-2 ml-4">
              <li>• <strong>Pattern Not Detected:</strong> Check text extraction and pattern spelling</li>
              <li>• <strong>Wrong Page Grouping:</strong> Verify pattern appears consistently</li>
              <li>• <strong>Missing Field Data:</strong> Ensure correct "Page in Group" numbers</li>
              <li>• <strong>Upload Failures:</strong> Check SFTP upload strategy configuration</li>
              <li>• <strong>Large File Processing:</strong> Consider reducing pages per group</li>
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
