import React from 'react';
import { Server } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function ConditionalUploadSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Server}
        title="Conditional PDF Upload"
        iconBgColor="bg-indigo-100"
        iconColor="text-indigo-600"
      />
      <div className="space-y-6">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
          <h3 className="font-semibold text-indigo-800 mb-4">SFTP Upload Strategies</h3>
          <p className="text-indigo-700 mb-4">
            Control exactly which pages get uploaded to your SFTP server using workflow steps.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-indigo-300 rounded-lg p-6">
              <h4 className="font-semibold text-indigo-800 mb-3">Upload All Pages</h4>
              <ul className="text-indigo-700 space-y-2">
                <li>• Uploads the entire grouped PDF as one file</li>
                <li>• Best for complete document archival</li>
                <li>• Maintains all pages and formatting</li>
                <li>• Default behavior for most workflows</li>
              </ul>
            </div>
            <div className="bg-white border border-indigo-300 rounded-lg p-6">
              <h4 className="font-semibold text-indigo-800 mb-3">Upload Specific Page</h4>
              <ul className="text-indigo-700 space-y-2">
                <li>• Uploads only one page from the grouped PDF</li>
                <li>• Perfect for sending only relevant pages</li>
                <li>• Reduces file sizes and storage costs</li>
                <li>• Ideal for customer-facing documents</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="font-semibold text-green-800 mb-4">Setting Up Conditional Upload</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-green-800 mb-3">Workflow Configuration:</h4>
              <ol className="text-green-700 space-y-2 list-decimal list-inside">
                <li>Create a workflow in Type Setup → Workflows</li>
                <li>Add an "SFTP Upload" step</li>
                <li>Set "Upload Strategy" to "Upload Specific Page"</li>
                <li>Specify which page number to upload</li>
                <li>Assign workflow to your transformation type</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-green-800 mb-3">Example Workflow:</h4>
              <div className="bg-white border border-green-300 rounded-lg p-4">
                <p className="text-sm text-green-800 mb-2"><strong>Step 1:</strong> API Call</p>
                <p className="text-xs text-green-700 mb-3">Extract data from page 1, send to API</p>
                <p className="text-sm text-green-800 mb-2"><strong>Step 2:</strong> SFTP Upload</p>
                <p className="text-xs text-green-700">Upload only page 2 to SFTP server</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
