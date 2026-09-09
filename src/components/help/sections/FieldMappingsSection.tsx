import React from 'react';
import { Database } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function FieldMappingsSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Database}
        title="Field Mappings (JSON Only)"
        iconBgColor="bg-orange-100"
        iconColor="text-orange-600"
      />
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
        <p className="text-orange-700 mb-6 text-lg">
          Field mappings allow you to precisely control how data is extracted and formatted for JSON extraction types.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-orange-300 rounded-lg p-6">
            <h3 className="font-semibold text-orange-800 mb-3">AI Type</h3>
            <p className="text-orange-700">
              Let the AI determine what to extract based on your description. Most flexible option.
            </p>
          </div>
          <div className="bg-white border border-blue-300 rounded-lg p-6">
            <h3 className="font-semibold text-blue-800 mb-3">Mapped Type</h3>
            <p className="text-blue-700">
              Extract data from specific PDF coordinates. Use the Mapping tool to get precise coordinates.
            </p>
          </div>
          <div className="bg-white border border-green-300 rounded-lg p-6">
            <h3 className="font-semibold text-green-800 mb-3">Hardcoded Type</h3>
            <p className="text-green-700">
              Always use the same fixed value. Perfect for constants like company codes or status flags.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
