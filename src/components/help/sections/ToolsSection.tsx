import React from 'react';
import { Copy } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function ToolsSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Copy}
        title="Tools & Features"
        iconBgColor="bg-blue-100"
        iconColor="text-blue-600"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-800 mb-3">Interactive PDF Mapping</h3>
          <p className="text-blue-700 mb-4">
            Use the Mapping tool to visually select fields on your PDF and get exact coordinates for field mappings.
          </p>
          <ul className="text-blue-700 space-y-2">
            <li>• Click and drag to select field areas</li>
            <li>• Label each selection for easy identification</li>
            <li>• Copy coordinates for use in extraction instructions</li>
          </ul>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
          <h3 className="font-semibold text-indigo-800 mb-3">Extraction Logs</h3>
          <p className="text-indigo-700 mb-4">
            Monitor all extraction activities, view success/failure rates, and troubleshoot issues.
          </p>
          <ul className="text-indigo-700 space-y-2">
            <li>• Filter by status, user, type, or date range</li>
            <li>• View extracted data and API responses</li>
            <li>• Copy data for testing or debugging</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
