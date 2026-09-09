import React from 'react';
import { CheckCircle } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function CompleteExampleSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={CheckCircle}
        title="Complete Example: Invoice Processing"
        iconBgColor="bg-purple-100"
        iconColor="text-purple-600"
      />
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <h3 className="font-semibold text-purple-800 mb-4">Scenario: 2-Page Invoice Documents</h3>
        <p className="text-purple-700 mb-6">
          You have a PDF with multiple 2-page invoices. Page 1 has "INVOICE / FACTURE" header and customer data.
          Page 2 has detailed line items. You want to extract customer info from page 1 for API calls,
          but only send page 2 to customers via SFTP.
        </p>

        <div className="space-y-6">
          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h4 className="font-semibold text-purple-800 mb-4">Step 1: Configure Transformation Type</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-purple-800 mb-2">Basic Settings:</h5>
                <ul className="text-purple-700 space-y-1 text-sm">
                  <li>• <strong>Name:</strong> "Invoice Processing"</li>
                  <li>• <strong>Pages Per Group:</strong> 2</li>
                  <li>• <strong>Document Start Detection:</strong> ✓ Enabled</li>
                  <li>• <strong>Start Pattern:</strong> "INVOICE / FACTURE"</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium text-purple-800 mb-2">Field Mappings:</h5>
                <ul className="text-purple-700 space-y-1 text-sm">
                  <li>• <strong>customerName:</strong> Page in Group = 1</li>
                  <li>• <strong>invoiceNumber:</strong> Page in Group = 1</li>
                  <li>• <strong>customerEmail:</strong> Page in Group = 1</li>
                  <li>• <strong>totalAmount:</strong> Page in Group = 2</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h4 className="font-semibold text-purple-800 mb-4">Step 2: Create Workflow</h4>
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h5 className="font-medium text-blue-800 mb-2">Step 1: API Call</h5>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• <strong>URL:</strong> https://api.company.com/customers</li>
                  <li>• <strong>Body:</strong> {`{customerName: "{{customerName}}", email: "{{customerEmail}}"}`}</li>
                  <li>• <strong>Purpose:</strong> Register customer in system using page 1 data</li>
                </ul>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h5 className="font-medium text-green-800 mb-2">Step 2: SFTP Upload</h5>
                <ul className="text-green-700 text-sm space-y-1">
                  <li>• <strong>Upload Strategy:</strong> Upload Specific Page</li>
                  <li>• <strong>Specific Page:</strong> 2</li>
                  <li>• <strong>Purpose:</strong> Send only page 2 (line items) to customer</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h4 className="font-semibold text-purple-800 mb-4">Step 3: Processing Result</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-purple-800 mb-2">What Happens:</h5>
                <ol className="text-purple-700 space-y-1 text-sm list-decimal list-inside">
                  <li>PDF split into 2-page groups at "INVOICE / FACTURE"</li>
                  <li>Customer data extracted from page 1 of each group</li>
                  <li>API called with customer information</li>
                  <li>Only page 2 uploaded to SFTP for each group</li>
                </ol>
              </div>
              <div>
                <h5 className="font-medium text-purple-800 mb-2">Benefits:</h5>
                <ul className="text-purple-700 space-y-1 text-sm">
                  <li>• Automatic document boundary detection</li>
                  <li>• Selective page processing and upload</li>
                  <li>• Reduced storage and bandwidth usage</li>
                  <li>• Customer receives only relevant pages</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
