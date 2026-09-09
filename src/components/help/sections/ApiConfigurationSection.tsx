import React from 'react';
import { Key } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function ApiConfigurationSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Key}
        title="API Keys & Configuration"
        iconBgColor="bg-yellow-100"
        iconColor="text-yellow-600"
      />
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-yellow-800 mb-3">Google Gemini API Key</h3>
            <p className="text-yellow-700 mb-3">
              Required for AI-powered PDF data extraction. Get your key from Google AI Studio.
            </p>
            <a
              href="https://makersuite.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-800 hover:text-yellow-900 underline font-medium"
            >
              → Get Google Gemini API Key
            </a>
          </div>
          <div>
            <h3 className="font-semibold text-yellow-800 mb-3">API Endpoint Configuration</h3>
            <p className="text-yellow-700">
              For JSON extraction types, configure your API base URL and authentication token.
              The system will combine this with the JSON Path from each extraction type to form the complete endpoint URL.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
