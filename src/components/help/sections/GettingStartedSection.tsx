import React from 'react';
import { FileText } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function GettingStartedSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={FileText}
        title="Getting Started"
        iconBgColor="bg-green-100"
        iconColor="text-green-600"
      />
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <h3 className="font-semibold text-green-800 mb-3">What is Parse-It?</h3>
        <p className="text-green-700 mb-4">
          Parse-It is an AI-powered PDF data extraction application that converts unstructured PDF documents into structured XML or JSON data.
          It uses Google's Gemini AI to intelligently extract information from your PDFs based on customizable templates and instructions.
        </p>
        <h3 className="font-semibold text-green-800 mb-3">Quick Start (3 Steps)</h3>
        <ol className="text-green-700 space-y-2 list-decimal list-inside">
          <li><strong>Upload a PDF:</strong> Click "Upload & Extract" and select your PDF file</li>
          <li><strong>Choose Extraction Type:</strong> Select from pre-configured templates or use AI auto-detection</li>
          <li><strong>Extract & Process:</strong> Click "Extract & Send to API" or "Extract & Upload via SFTP" to process your document</li>
        </ol>
      </div>
    </SectionCard>
  );
}
