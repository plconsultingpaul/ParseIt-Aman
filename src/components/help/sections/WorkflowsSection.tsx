import React from 'react';
import { GitBranch } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function WorkflowsSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={GitBranch}
        title="Workflows"
        iconBgColor="bg-purple-100"
        iconColor="text-purple-600"
      />
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <p className="text-purple-700 mb-6 text-lg">
          Workflows allow you to create multi-step processes that execute after data extraction. Perfect for complex business logic.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h3 className="font-semibold text-purple-800 mb-3">API Call Steps</h3>
            <p className="text-purple-700">
              Send extracted data to external APIs, update records, or trigger other systems.
            </p>
          </div>
          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h3 className="font-semibold text-purple-800 mb-3">Conditional Checks</h3>
            <p className="text-purple-700">
              Branch workflow execution based on data values or conditions in the extracted content.
            </p>
          </div>
          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h3 className="font-semibold text-purple-800 mb-3">Data Transforms</h3>
            <p className="text-purple-700">
              Modify, copy, or restructure extracted data before sending to subsequent steps.
            </p>
          </div>
          <div className="bg-white border border-purple-300 rounded-lg p-6">
            <h3 className="font-semibold text-purple-800 mb-3">Email Actions</h3>
            <p className="text-purple-700">
              Send automated emails with extracted data and PDF attachments to customers or stakeholders.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
