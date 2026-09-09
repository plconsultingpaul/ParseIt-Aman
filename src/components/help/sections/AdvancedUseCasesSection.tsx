import React from 'react';
import { Brain } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function AdvancedUseCasesSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Brain}
        title="Advanced Use Cases"
        iconBgColor="bg-pink-100"
        iconColor="text-pink-600"
      />
      <div className="space-y-6">
        <div className="bg-pink-50 border border-pink-200 rounded-lg p-6">
          <h3 className="font-semibold text-pink-800 mb-4">Real-World Scenarios</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-pink-300 rounded-lg p-6">
              <h4 className="font-semibold text-pink-800 mb-3">Multi-Page Invoices</h4>
              <div className="space-y-3">
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Setup:</h5>
                  <ul className="text-pink-700 text-sm space-y-1">
                    <li>• Pattern: "INVOICE / FACTURE"</li>
                    <li>• Pages Per Group: 2</li>
                    <li>• Extract customer data from page 1</li>
                    <li>• Upload only page 2 to customer portal</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Result:</h5>
                  <p className="text-pink-700 text-sm">
                    Customers receive clean detail pages without internal headers
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-pink-300 rounded-lg p-6">
              <h4 className="font-semibold text-pink-800 mb-3">Bill of Lading Processing</h4>
              <div className="space-y-3">
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Setup:</h5>
                  <ul className="text-pink-700 text-sm space-y-1">
                    <li>• Pattern: "BILL OF LADING"</li>
                    <li>• Pages Per Group: 3</li>
                    <li>• Extract shipping data from page 1</li>
                    <li>• Upload pages 2-3 to carrier system</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Result:</h5>
                  <p className="text-pink-700 text-sm">
                    Automated carrier notifications with relevant documentation
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-pink-300 rounded-lg p-6">
              <h4 className="font-semibold text-pink-800 mb-3">Purchase Order Batches</h4>
              <div className="space-y-3">
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Setup:</h5>
                  <ul className="text-pink-700 text-sm space-y-1">
                    <li>• Pattern: "PURCHASE ORDER"</li>
                    <li>• Pages Per Group: 4 (maximum)</li>
                    <li>• Extract PO data from page 1</li>
                    <li>• Upload all pages to supplier</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Result:</h5>
                  <p className="text-pink-700 text-sm">
                    Variable-length POs processed with complete documentation
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-pink-300 rounded-lg p-6">
              <h4 className="font-semibold text-pink-800 mb-3">Mixed Document Types</h4>
              <div className="space-y-3">
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Setup:</h5>
                  <ul className="text-pink-700 text-sm space-y-1">
                    <li>• Multiple transformation types</li>
                    <li>• Different patterns for each type</li>
                    <li>• AI auto-detection enabled</li>
                    <li>• Vendor-specific rules</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-pink-800 mb-1">Result:</h5>
                  <p className="text-pink-700 text-sm">
                    Intelligent processing of mixed document batches
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
