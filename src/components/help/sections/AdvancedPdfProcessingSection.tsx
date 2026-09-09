import React from 'react';
import { FileText } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function AdvancedPdfProcessingSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={FileText}
        title="Advanced PDF Processing"
        iconBgColor="bg-purple-100"
        iconColor="text-purple-600"
      />
      <div className="space-y-6">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="font-semibold text-purple-800 mb-4">PDF Document Grouping</h3>
          <p className="text-purple-700 mb-4 text-lg">
            Parse-It can intelligently group PDF pages into logical documents for processing. This is perfect for multi-document PDFs where each document spans multiple pages.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-purple-300 rounded-lg p-6">
              <h4 className="font-semibold text-purple-800 mb-3">Fixed Page Grouping</h4>
              <ul className="text-purple-700 space-y-2">
                <li>• Set "Pages Per Group" to group consecutive pages</li>
                <li>• Example: Pages Per Group = 2 creates groups [1-2], [3-4], [5-6]</li>
                <li>• Perfect for consistent document layouts</li>
                <li>• Simple and reliable for predictable formats</li>
              </ul>
            </div>
            <div className="bg-white border border-purple-300 rounded-lg p-6">
              <h4 className="font-semibold text-purple-800 mb-3">Smart Pattern Detection</h4>
              <ul className="text-purple-700 space-y-2">
                <li>• Enable "Document Start Detection"</li>
                <li>• Set pattern like "INVOICE / FACTURE" to detect document starts</li>
                <li>• AI finds pattern and creates logical document boundaries</li>
                <li>• Handles variable-length documents automatically</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-3">Combined Mode (Recommended)</h4>
            <p className="text-blue-700 mb-3">
              Use both pattern detection AND pages per group for maximum flexibility:
            </p>
            <ul className="text-blue-700 space-y-2">
              <li>• <strong>Pattern Detection:</strong> Finds document start boundaries intelligently</li>
              <li>• <strong>Pages Per Group:</strong> Acts as maximum limit to prevent oversized groups</li>
              <li>• <strong>Example:</strong> Pattern "INVOICE" + Pages Per Group = 3</li>
              <li>• <strong>Result:</strong> Each invoice gets up to 3 pages, starting from pattern detection</li>
            </ul>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h3 className="font-semibold text-amber-800 mb-4">Page-Specific Field Extraction</h3>
          <p className="text-amber-700 mb-4">
            When working with grouped PDFs, you can specify which page within each group to extract specific data from.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-amber-800 mb-3">Setting Up Page-Specific Extraction:</h4>
              <ol className="text-amber-700 space-y-2 list-decimal list-inside">
                <li>Go to Type Setup → Transformation Types</li>
                <li>Edit your transformation type</li>
                <li>In Field Mappings, set "Page in Group" number</li>
                <li>Example: Set "Page in Group" = 1 for invoice header data</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-amber-800 mb-3">Common Use Cases:</h4>
              <ul className="text-amber-700 space-y-2">
                <li>• <strong>Page 1:</strong> Extract invoice number, customer info</li>
                <li>• <strong>Page 2:</strong> Extract detailed line items</li>
                <li>• <strong>Any Page:</strong> Leave blank to search all pages</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
