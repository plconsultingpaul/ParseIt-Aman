import React from 'react';
import { Settings } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function ConfigurationGuideSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Settings}
        title="Configuration Guide"
        iconBgColor="bg-orange-100"
        iconColor="text-orange-600"
      />
      <div className="space-y-6">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <h3 className="font-semibold text-orange-800 mb-4">Setting Up Advanced PDF Processing</h3>

          <div className="space-y-6">
            <div>
              <h4 className="font-medium text-orange-800 mb-3">1. Configure Transformation Type</h4>
              <div className="bg-white border border-orange-300 rounded-lg p-4">
                <p className="text-orange-700 text-sm mb-3">
                  <strong>Location:</strong> Type Setup → Transformation Types → [Your Type]
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h5 className="font-medium text-orange-800 mb-2">PDF Grouping Settings:</h5>
                    <ul className="text-orange-700 space-y-1">
                      <li>• <strong>Pages Per Group:</strong> Number of pages to group (e.g., 2)</li>
                      <li>• <strong>Document Start Detection:</strong> ✓ Enable checkbox</li>
                      <li>• <strong>Start Pattern:</strong> Text to detect (e.g., "INVOICE")</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-orange-800 mb-2">Field Mappings:</h5>
                    <ul className="text-orange-700 space-y-1">
                      <li>• <strong>Field Name:</strong> customerName</li>
                      <li>• <strong>Page in Group:</strong> 1 (extract from first page)</li>
                      <li>• <strong>Type:</strong> AI or Mapped coordinates</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-orange-800 mb-3">2. Create Workflow with Conditional Upload</h4>
              <div className="bg-white border border-orange-300 rounded-lg p-4">
                <p className="text-orange-700 text-sm mb-3">
                  <strong>Location:</strong> Type Setup → Workflows → [Create New]
                </p>
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h5 className="font-medium text-blue-800 mb-2">Step 1: API Call (Optional)</h5>
                    <ul className="text-blue-700 text-xs space-y-1">
                      <li>• Extract and send data from page 1 to your API</li>
                      <li>• Use extracted customer info for registration/lookup</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h5 className="font-medium text-green-800 mb-2">Step 2: SFTP Upload</h5>
                    <ul className="text-green-700 text-xs space-y-1">
                      <li>• <strong>Upload Strategy:</strong> "Upload Specific Page"</li>
                      <li>• <strong>Specific Page:</strong> 2 (upload only page 2)</li>
                      <li>• <strong>Result:</strong> Customer gets only the detail page</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-orange-800 mb-3">3. Assign Workflow to Transformation Type</h4>
              <div className="bg-white border border-orange-300 rounded-lg p-4">
                <p className="text-orange-700 text-sm mb-2">
                  <strong>Location:</strong> Type Setup → Transformation Types → [Your Type] → Assigned Workflow
                </p>
                <p className="text-orange-700 text-sm">
                  Select your newly created workflow from the dropdown to link it to the transformation type.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
