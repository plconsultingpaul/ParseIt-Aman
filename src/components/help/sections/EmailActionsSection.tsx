import React from 'react';
import { Mail } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function EmailActionsSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Mail}
        title="Email Actions in Workflows"
        iconBgColor="bg-pink-100"
        iconColor="text-pink-600"
      />
      <div className="space-y-6">
        <div className="bg-pink-50 border border-pink-200 rounded-lg p-6">
          <h3 className="font-semibold text-pink-800 mb-4">What are Email Actions?</h3>
          <p className="text-pink-700 mb-4">
            Email Actions are workflow steps that automatically send emails with extracted data and PDF attachments.
            They're perfect for notifying customers, suppliers, or internal teams when documents are processed.
          </p>

          <h4 className="font-semibold text-pink-800 mb-3">Common Use Cases:</h4>
          <ul className="text-pink-700 space-y-2">
            <li>• <strong>Customer Notifications:</strong> Send invoices or receipts to customers automatically</li>
            <li>• <strong>Supplier Communications:</strong> Forward purchase orders or delivery confirmations</li>
            <li>• <strong>Internal Alerts:</strong> Notify accounting teams when new invoices are processed</li>
            <li>• <strong>Document Delivery:</strong> Send renamed PDFs with proper filenames to recipients</li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-800 mb-4">Setting Up Email Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-blue-800 mb-3">Prerequisites:</h4>
              <ol className="text-blue-700 space-y-2 list-decimal list-inside">
                <li>Configure Email Monitoring in Settings (Office 365 or Gmail)</li>
                <li>Create a workflow in Settings → Type Setup → Workflows</li>
                <li>Add an Email Action step to your workflow</li>
                <li>Assign the workflow to an extraction type</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium text-blue-800 mb-3">Configuration Options:</h4>
              <ul className="text-blue-700 space-y-2">
                <li>• <strong>To/From:</strong> Email addresses (supports dynamic data)</li>
                <li>• <strong>Subject/Body:</strong> Email content with placeholders</li>
                <li>• <strong>Attachments:</strong> Include original or renamed PDF</li>
                <li>• <strong>Templates:</strong> Use {'{{'}fieldName{'}}'} for extracted data</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="font-semibold text-green-800 mb-4">Template Variables in Emails</h3>
          <p className="text-green-700 mb-4">
            Use template variables to insert extracted data into your emails. Simply wrap field names in double curly braces.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-green-800 mb-3">Example Email Template:</h4>
              <div className="bg-white border border-green-300 rounded-lg p-4">
                <p className="text-sm text-green-800 mb-2"><strong>To:</strong> {'{{'}customerEmail{'}}'}</p>
                <p className="text-sm text-green-800 mb-2"><strong>Subject:</strong> Invoice {'{{'}invoiceNumber{'}} '}- Payment Due</p>
                <div className="text-sm text-green-800">
                  <strong>Body:</strong><br />
                  Dear {'{{'}customerName{'}}'},{'\n\n'}
                  Your invoice {'{{'}invoiceNumber{'}} '}for {'{{'}totalAmount{'}} '}is now available.{'\n\n'}
                  Payment is due by {'{{'}dueDate{'}}'}.{'\n\n'}
                  Please find the attached PDF for your records.{'\n\n'}
                  Best regards,<br />
                  Accounts Receivable
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-green-800 mb-3">Available Variables:</h4>
              <ul className="text-green-700 space-y-1 text-sm">
                <li>• Any field extracted from your PDF</li>
                <li>• Customer information (name, email, address)</li>
                <li>• Invoice details (number, amount, date)</li>
                <li>• Order information (PO number, items)</li>
                <li>• Custom fields from your extraction templates</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h3 className="font-semibold text-amber-800 mb-4">Email Workflow Examples</h3>

          <div className="space-y-4">
            <div className="bg-white border border-amber-300 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-3">Example 1: Invoice Processing</h4>
              <ol className="text-amber-700 space-y-1 list-decimal list-inside text-sm">
                <li><strong>Step 1:</strong> Extract invoice data (customer email, invoice number, amount)</li>
                <li><strong>Step 2:</strong> Send to accounting API for processing</li>
                <li><strong>Step 3:</strong> Rename PDF to "Invoice_{'{{'}invoiceNumber{'}}'}.pdf"</li>
                <li><strong>Step 4:</strong> Email renamed PDF to customer at {'{{'}customerEmail{'}}'}</li>
              </ol>
            </div>

            <div className="bg-white border border-amber-300 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-3">Example 2: Purchase Order Workflow</h4>
              <ol className="text-amber-700 space-y-1 list-decimal list-inside text-sm">
                <li><strong>Step 1:</strong> Extract PO data (supplier email, PO number, items)</li>
                <li><strong>Step 2:</strong> Check if total amount &gt; $1000 (conditional step)</li>
                <li><strong>Step 3a:</strong> If &gt; $1000: Email manager for approval</li>
                <li><strong>Step 3b:</strong> If ≤ $1000: Email supplier with PO confirmation</li>
              </ol>
            </div>

            <div className="bg-white border border-amber-300 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-3">Example 3: Multi-Recipient Notification</h4>
              <ol className="text-amber-700 space-y-1 list-decimal list-inside text-sm">
                <li><strong>Step 1:</strong> Extract document data</li>
                <li><strong>Step 2:</strong> Upload to SFTP for archival</li>
                <li><strong>Step 3:</strong> Email customer with confirmation</li>
                <li><strong>Step 4:</strong> Email internal team with processing notification</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="font-semibold text-red-800 mb-4">Important Notes & Limitations</h3>
          <ul className="text-red-700 space-y-2 text-sm">
            <li>• <strong>Email Provider Required:</strong> You must configure Office 365 or Gmail in Email Monitoring settings</li>
            <li>• <strong>Template Variables:</strong> Use exact field names from your extraction templates</li>
            <li>• <strong>PDF Attachments:</strong> Large PDFs may be rejected by email providers (check size limits)</li>
            <li>• <strong>Rate Limits:</strong> Be mindful of email provider rate limits for bulk processing</li>
            <li>• <strong>Error Handling:</strong> Failed email steps will halt the workflow - check logs for details</li>
            <li>• <strong>Testing:</strong> Always test email workflows with sample data before production use</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
