import React from 'react';
import { Brain, Settings } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function UploadModesSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Brain}
        title="Upload Modes"
        iconBgColor="bg-blue-100"
        iconColor="text-blue-600"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-800 mb-3 flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Manual Selection</span>
          </h3>
          <ul className="text-blue-700 space-y-2">
            <li>• You manually choose which extraction type to use</li>
            <li>• Best when you know exactly what type of document you're processing</li>
            <li>• Gives you full control over the extraction process</li>
            <li>• Recommended for consistent document types</li>
          </ul>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="font-semibold text-purple-800 mb-3 flex items-center space-x-2">
            <Brain className="h-5 w-5" />
            <span>AI Auto-Detect</span>
          </h3>
          <ul className="text-purple-700 space-y-2">
            <li>• AI analyzes your PDF and suggests the best extraction type</li>
            <li>• Perfect for mixed document types or unknown formats</li>
            <li>• Shows confidence level and reasoning for the suggestion</li>
            <li>• You can still override the AI's choice if needed</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
