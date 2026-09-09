import React from 'react';
import { Upload } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function ExtractionProcessSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Upload}
        title="Extraction Process"
        iconBgColor="bg-purple-100"
        iconColor="text-purple-600"
      />
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-purple-800 mb-3">For XML Types:</h3>
            <ol className="text-purple-700 space-y-2 list-decimal list-inside">
              <li>AI extracts data according to your instructions</li>
              <li>Data is formatted as XML using your template</li>
              <li>Parse-It ID is automatically assigned</li>
              <li>Both XML and PDF files are uploaded to SFTP server</li>
              <li>Multi-page PDFs are split into individual files</li>
            </ol>
          </div>
          <div>
            <h3 className="font-semibold text-purple-800 mb-3">For JSON Types:</h3>
            <ol className="text-purple-700 space-y-2 list-decimal list-inside">
              <li>AI extracts data according to your instructions</li>
              <li>Data is formatted as JSON using your template</li>
              <li>Parse-It ID is automatically assigned</li>
              <li>JSON data is sent to your configured API endpoint</li>
              <li>PDF is also uploaded to SFTP for backup</li>
            </ol>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
