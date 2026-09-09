import React from 'react';
import { CheckCircle } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function BestPracticesSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={CheckCircle}
        title="Best Practices"
        iconBgColor="bg-green-100"
        iconColor="text-green-600"
      />
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-green-800 mb-4">Extraction Instructions:</h3>
            <ul className="text-green-700 space-y-2">
              <li>• Be specific about what data to extract</li>
              <li>• Mention field locations when possible</li>
              <li>• Include data format requirements (dates, numbers)</li>
              <li>• Test with sample PDFs before deploying</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-green-800 mb-4">Template Design:</h3>
            <ul className="text-green-700 space-y-2">
              <li>• Keep templates simple and focused</li>
              <li>• Use consistent field naming conventions</li>
              <li>• Include all required fields for your downstream systems</li>
              <li>• Test JSON syntax before saving</li>
            </ul>
          </div>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-green-800 mb-4">Security & Performance:</h3>
          <ul className="text-green-700 space-y-2">
            <li>• Use strong passwords for SFTP and API authentication</li>
            <li>• Regularly review extraction logs for errors or issues</li>
            <li>• Set appropriate polling intervals for email monitoring (5-15 minutes recommended)</li>
            <li>• Monitor API rate limits and usage</li>
            <li>• Grant users only the permissions they need</li>
          </ul>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-green-800 mb-4">Pattern Detection Tips:</h3>
          <ul className="text-green-700 space-y-2">
            <li>• Use unique, consistent text that appears on every document start</li>
            <li>• Avoid common words that might appear elsewhere</li>
            <li>• Test with sample PDFs to verify pattern detection accuracy</li>
            <li>• Consider using partial matches (e.g., "INVOICE" instead of full headers)</li>
            <li>• Set reasonable page limits to prevent oversized groups</li>
          </ul>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-green-800 mb-4">Workflow Design:</h3>
          <ul className="text-green-700 space-y-2">
            <li>• Extract data from early pages for API calls</li>
            <li>• Use conditional steps for complex business logic</li>
            <li>• Upload specific pages to reduce file sizes</li>
            <li>• Test workflows with sample documents first</li>
            <li>• Monitor workflow execution logs for optimization</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
