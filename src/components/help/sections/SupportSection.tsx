import React from 'react';
import { Mail } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function SupportSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Mail}
        title="Support & Resources"
        iconBgColor="bg-gray-100"
        iconColor="text-gray-600"
      />
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Getting Help:</h3>
            <ul className="text-gray-700 space-y-2">
              <li>• Check the Extraction Logs for detailed error messages</li>
              <li>• Use the test buttons in settings to verify configurations</li>
              <li>• Start with simple extraction types before creating complex ones</li>
              <li>• Review the AI's extracted data before sending to production systems</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 mb-4">Tips for Success:</h3>
            <ul className="text-gray-700 space-y-2">
              <li>• Use clear, descriptive names for extraction types</li>
              <li>• Test extraction types with various PDF samples</li>
              <li>• Keep extraction instructions concise but detailed</li>
              <li>• Regularly backup your extraction type configurations</li>
            </ul>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
