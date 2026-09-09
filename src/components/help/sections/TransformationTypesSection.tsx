import React from 'react';
import { RefreshCw, FileText, Settings, Brain, Map, Code, Copy, Upload, Lock, Unlock } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';
import InfoCard from '../shared/InfoCard';

export default function TransformationTypesSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={RefreshCw}
        title="Transformation Types"
        iconBgColor="bg-orange-100"
        iconColor="text-orange-600"
      />

      <div className="prose max-w-none space-y-8">
        <InfoCard
          title="What are Transformation Types?"
          icon={RefreshCw}
          iconBgColor="bg-orange-100"
          iconColor="text-orange-600"
        >
          <p className="text-gray-700 mb-3">
            Transformation Types are configurations that extract data from PDFs to automatically rename and reorganize files.
            Unlike Extraction Types (which output CSV/JSON/XML data), Transformation Types focus on intelligent PDF file management.
          </p>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
            <h4 className="font-semibold text-orange-800 mb-2">Key Differences</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-orange-900 mb-1">Extraction Types:</p>
                <ul className="text-orange-700 space-y-1">
                  <li>• Extract data to CSV/JSON/XML</li>
                  <li>• Send to APIs or databases</li>
                  <li>• Structured data output</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-orange-900 mb-1">Transformation Types:</p>
                <ul className="text-orange-700 space-y-1">
                  <li>• Rename PDF files intelligently</li>
                  <li>• Split multi-page documents</li>
                  <li>• Reorganize file structure</li>
                </ul>
              </div>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Basic Configuration"
          icon={Settings}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Name</h4>
              <p className="text-gray-700 mb-2">
                A descriptive name for your transformation type (e.g., "Invoice Renaming", "Purchase Order Processing")
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Filename Template</h4>
              <p className="text-gray-700 mb-2">
                Define how renamed files should be named using placeholders that get replaced with extracted data.
              </p>
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 font-mono text-sm">
                <p className="text-gray-600 mb-2">Template Syntax:</p>
                <code className="text-blue-600">{`{{fieldName}}`}</code>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">Examples:</p>
                <ul className="text-sm text-gray-600 space-y-1 font-mono bg-gray-50 p-3 rounded">
                  <li>• {`{{invoiceNumber}}-{{customerName}}.pdf`}</li>
                  <li>• {`PO-{{poNumber}}-{{date}}.pdf`}</li>
                  <li>• {`{{year}}-{{month}}-{{vendor}}-Invoice.pdf`}</li>
                </ul>
              </div>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Upload Mode Configuration"
          icon={Upload}
          iconBgColor="bg-indigo-100"
          iconColor="text-indigo-600"
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              Control how users interact with this transformation type in the Transform page.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Default Upload Mode</h4>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• <strong>Manual Selection:</strong> User chooses extraction type</li>
                  <li>• <strong>AI Auto-Detect:</strong> AI suggests best type</li>
                  <li>• <strong>No Default:</strong> Uses user's last preference</li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-800 mb-2 flex items-center space-x-2">
                  <Lock className="h-4 w-4" />
                  <span>Lock Upload Mode</span>
                </h4>
                <ul className="text-amber-700 text-sm space-y-1">
                  <li>• Prevents users from changing mode</li>
                  <li>• Enforces consistent workflow</li>
                  <li>• Useful for standardized processes</li>
                </ul>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-indigo-700 text-sm">
                <strong>Use Case:</strong> Lock AI Auto-Detect for variable document types, or lock Manual Selection
                when you have specific extraction type requirements.
              </p>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="PDF Document Grouping"
          icon={FileText}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
        >
          <p className="text-gray-700 mb-4">
            Control how multi-page PDFs are split and processed as separate documents.
          </p>

          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-2">Pages Per Group</h4>
              <p className="text-green-700 text-sm mb-2">
                Maximum number of pages to group together as one document.
              </p>
              <div className="bg-white border border-green-300 rounded p-3 text-sm">
                <p className="text-gray-700 mb-2"><strong>Example with 3 pages per group:</strong></p>
                <ul className="text-gray-600 space-y-1">
                  <li>• Pages 1-3 → Document 1</li>
                  <li>• Pages 4-6 → Document 2</li>
                  <li>• Pages 7-9 → Document 3</li>
                </ul>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h4 className="font-semibold text-emerald-800 mb-2">Smart Document Detection</h4>
              <p className="text-emerald-700 text-sm mb-3">
                Automatically detect document boundaries using text patterns (regex).
              </p>
              <div className="bg-white border border-emerald-300 rounded p-3 space-y-2">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Pattern Examples:</p>
                  <ul className="text-sm text-gray-600 space-y-1 font-mono">
                    <li>• <code>INVOICE</code> - Simple text match</li>
                    <li>• <code>INVOICE / FACTURE</code> - Multiple languages</li>
                    <li>• <code>Invoice #\d+</code> - Pattern with numbers</li>
                    <li>• <code>PO-\d{6}</code> - Specific format</li>
                  </ul>
                </div>
                <div className="mt-3 bg-emerald-50 p-2 rounded">
                  <p className="text-xs text-emerald-700">
                    When pattern is found, a new document starts. Groups up to "Pages Per Group" from that point.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-2">Combined Mode</h4>
              <p className="text-blue-700 text-sm">
                When both Pages Per Group and Smart Detection are enabled:
              </p>
              <ul className="text-blue-600 text-sm space-y-1 mt-2">
                <li>• Pattern detection takes priority</li>
                <li>• Pages Per Group acts as maximum limit</li>
                <li>• Best for variable-length documents with identifiers</li>
              </ul>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Page Group Configuration"
          icon={Map}
          iconBgColor="bg-violet-100"
          iconColor="text-violet-600"
        >
          <p className="text-gray-700 mb-4">
            For multi-page documents, configure how each page group is processed with specific rules and workflows.
          </p>

          <div className="space-y-4">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
              <h4 className="font-semibold text-violet-800 mb-2">Features</h4>
              <ul className="text-violet-700 text-sm space-y-2">
                <li>• <strong>Page-Specific Rules:</strong> Different extraction per page</li>
                <li>• <strong>Regex Patterns:</strong> Match specific page content</li>
                <li>• <strong>Field Mappings:</strong> Extract different data from each page</li>
                <li>• <strong>Cross-Page References:</strong> Use data from previous pages</li>
                <li>• <strong>Workflows:</strong> Execute different actions per page group</li>
              </ul>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-indigo-700 text-sm">
                <strong>Example:</strong> A 3-page invoice where page 1 has header info, page 2 has line items,
                and page 3 has payment terms - each can be processed differently.
              </p>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="AI Instructions"
          icon={Brain}
          iconBgColor="bg-purple-100"
          iconColor="text-purple-600"
        >
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-2">Default Instructions</h4>
              <p className="text-blue-700 text-sm mb-3">
                Tell the AI what data to extract from the PDF for generating the new filename.
              </p>
              <div className="bg-white border border-blue-300 rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Good Example:</p>
                <p className="text-sm text-gray-700 italic">
                  "Extract the invoice number from the header and the customer company name from the billing section.
                  Format the invoice number without spaces or special characters."
                </p>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-semibold text-purple-800 mb-2">Auto-Detection Instructions</h4>
              <p className="text-purple-700 text-sm mb-3">
                Help the AI identify when this transformation type should be used (for AI Auto-Detect mode).
              </p>
              <div className="bg-white border border-purple-300 rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Good Example:</p>
                <p className="text-sm text-gray-700 italic">
                  "This is for vendor invoices that need to be renamed with the invoice number and customer name.
                  Documents typically have 'INVOICE' in the header and include invoice numbers in the format INV-123456."
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h5 className="font-semibold text-amber-800 text-sm mb-2">Best Practices</h5>
              <ul className="text-amber-700 text-xs space-y-1">
                <li>• Be specific about field locations (e.g., "in the header", "top-right corner")</li>
                <li>• Describe expected formats (e.g., "INV-123456", "MM/DD/YYYY")</li>
                <li>• Mention any data cleanup needed (e.g., "remove spaces", "convert to uppercase")</li>
                <li>• Keep instructions concise but complete</li>
              </ul>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Field Mappings"
          icon={Map}
          iconBgColor="bg-cyan-100"
          iconColor="text-cyan-600"
        >
          <p className="text-gray-700 mb-4">
            Define exactly what data to extract and how to extract it for use in the filename template.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-semibold text-orange-800 mb-2 text-sm">AI Extraction</h4>
                <p className="text-orange-700 text-xs mb-2">
                  AI reads the PDF and extracts based on your description
                </p>
                <div className="bg-white border border-orange-300 rounded p-2 text-xs">
                  <p className="font-mono text-gray-600">invoiceNumber</p>
                  <p className="text-gray-500 mt-1">Type: AI</p>
                  <p className="text-gray-700 mt-1">"Extract invoice number from header"</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2 text-sm">Mapped (Coordinates)</h4>
                <p className="text-blue-700 text-xs mb-2">
                  Extract text from specific PDF coordinates
                </p>
                <div className="bg-white border border-blue-300 rounded p-2 text-xs">
                  <p className="font-mono text-gray-600">customerName</p>
                  <p className="text-gray-500 mt-1">Type: Mapped</p>
                  <p className="text-gray-700 mt-1 font-mono">(100, 200, 150, 30)</p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-800 mb-2 text-sm">Hardcoded Value</h4>
                <p className="text-green-700 text-xs mb-2">
                  Use a fixed value in the filename
                </p>
                <div className="bg-white border border-green-300 rounded p-2 text-xs">
                  <p className="font-mono text-gray-600">documentType</p>
                  <p className="text-gray-500 mt-1">Type: Hardcoded</p>
                  <p className="text-gray-700 mt-1">"INVOICE"</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-slate-800 mb-2">Data Types</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div className="bg-white border border-slate-300 rounded p-2">
                  <p className="font-semibold text-slate-700">String</p>
                  <p className="text-xs text-slate-600">Text values</p>
                </div>
                <div className="bg-white border border-slate-300 rounded p-2">
                  <p className="font-semibold text-slate-700">Number</p>
                  <p className="text-xs text-slate-600">Decimal values</p>
                </div>
                <div className="bg-white border border-slate-300 rounded p-2">
                  <p className="font-semibold text-slate-700">Integer</p>
                  <p className="text-xs text-slate-600">Whole numbers</p>
                </div>
                <div className="bg-white border border-slate-300 rounded p-2">
                  <p className="font-semibold text-slate-700">DateTime</p>
                  <p className="text-xs text-slate-600">Dates and times</p>
                </div>
                <div className="bg-white border border-slate-300 rounded p-2">
                  <p className="font-semibold text-slate-700">Phone</p>
                  <p className="text-xs text-slate-600">Phone numbers</p>
                </div>
                <div className="bg-white border border-slate-300 rounded p-2">
                  <p className="font-semibold text-slate-700">Boolean</p>
                  <p className="text-xs text-slate-600">True/False</p>
                </div>
              </div>
            </div>

            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
              <h4 className="font-semibold text-cyan-800 mb-2">Additional Options</h4>
              <ul className="text-cyan-700 text-sm space-y-1">
                <li>• <strong>Page in Group:</strong> For multi-page groups, specify which page to extract from (1, 2, 3, etc.)</li>
                <li>• <strong>Max Length:</strong> Limit string length (useful for file naming constraints)</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h5 className="font-semibold text-blue-800 text-sm mb-2 flex items-center space-x-2">
                <Code className="h-4 w-4" />
                <span>Generate from Template</span>
              </h5>
              <p className="text-blue-700 text-xs">
                Click "Map Template" to automatically generate field mappings from your filename template.
                The system will create AI fields for each placeholder in your template.
              </p>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Workflow Integration"
          icon={Settings}
          iconBgColor="bg-teal-100"
          iconColor="text-teal-600"
        >
          <p className="text-gray-700 mb-4">
            Execute additional processing steps after PDF transformation by assigning workflows.
          </p>

          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <h4 className="font-semibold text-teal-800 mb-2">Workflow Assignment</h4>
              <p className="text-teal-700 text-sm mb-3">
                Select an active workflow to run after the PDF is renamed and extracted.
              </p>
              <ul className="text-teal-600 text-sm space-y-1">
                <li>• Upload renamed PDFs to SFTP</li>
                <li>• Send data to API endpoints</li>
                <li>• Generate additional output files (CSV, JSON)</li>
                <li>• Execute multi-step processing chains</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-700 text-sm">
                <strong>Example:</strong> After renaming invoices, automatically upload them to your accounting system's
                SFTP server and send invoice details to your ERP API.
              </p>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Copy Transformation Type"
          icon={Copy}
          iconBgColor="bg-indigo-100"
          iconColor="text-indigo-600"
        >
          <p className="text-gray-700 mb-4">
            Quickly create new transformation types by copying existing configurations.
          </p>

          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <h4 className="font-semibold text-indigo-800 mb-2">What Gets Copied</h4>
              <ul className="text-indigo-700 text-sm space-y-1">
                <li>• Name (with "- Copy" suffix)</li>
                <li>• All settings and instructions</li>
                <li>• Filename template</li>
                <li>• All field mappings</li>
                <li>• Document grouping configuration</li>
                <li>• Page group configurations</li>
                <li>• Workflow assignment</li>
                <li>• Upload mode settings</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h5 className="font-semibold text-amber-800 text-sm mb-2">When to Copy</h5>
              <ul className="text-amber-700 text-xs space-y-1">
                <li>• Creating variations of existing types (e.g., different vendors)</li>
                <li>• Testing new configurations without affecting production</li>
                <li>• Duplicating complex setups to save time</li>
                <li>• Creating templates for different clients</li>
              </ul>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Visual Mapping Tool"
          icon={Map}
          iconBgColor="bg-pink-100"
          iconColor="text-pink-600"
        >
          <p className="text-gray-700 mb-4">
            Use the Mapping page to visually select regions on your PDF for coordinate-based extraction.
          </p>

          <div className="space-y-4">
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
              <h4 className="font-semibold text-pink-800 mb-2">How to Use</h4>
              <ol className="text-pink-700 text-sm space-y-2 list-decimal list-inside">
                <li>Click the "Mapping" button in Transformation Types settings</li>
                <li>Upload a sample PDF</li>
                <li>Draw rectangles around the fields you want to extract</li>
                <li>The system generates coordinate mappings automatically</li>
                <li>Copy coordinates to your mapped field configurations</li>
              </ol>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-700 text-sm">
                <strong>Best for:</strong> Fixed-format documents where fields are always in the same location
                (e.g., standardized forms, consistent invoice layouts).
              </p>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Complete Example: Invoice Renaming"
          icon={FileText}
          iconBgColor="bg-emerald-100"
          iconColor="text-emerald-600"
        >
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h4 className="font-semibold text-emerald-800 mb-3">Scenario</h4>
              <p className="text-emerald-700 text-sm mb-3">
                You receive multi-page vendor invoices that need to be renamed with invoice number and customer name,
                then uploaded to your SFTP server.
              </p>

              <div className="bg-white border border-emerald-300 rounded p-4 space-y-3 text-sm">
                <div>
                  <p className="font-semibold text-gray-800">Name:</p>
                  <p className="text-gray-600 font-mono">Vendor Invoice Processing</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-800">Filename Template:</p>
                  <p className="text-gray-600 font-mono">{`INV-{{invoiceNumber}}-{{customerName}}.pdf`}</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-800">Document Grouping:</p>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Pages Per Group: <span className="font-mono">3</span></li>
                    <li>• Smart Detection: <span className="font-mono">Enabled</span></li>
                    <li>• Pattern: <span className="font-mono">INVOICE|FACTURE</span></li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-gray-800">Default Instructions:</p>
                  <p className="text-gray-600 italic">
                    "Extract the invoice number from the document header (format: INV-123456) and the customer
                    company name from the billing information section."
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-gray-800">Field Mappings:</p>
                  <div className="space-y-2 ml-4">
                    <div className="bg-orange-50 border border-orange-200 rounded p-2">
                      <p className="font-mono text-xs text-gray-700">invoiceNumber</p>
                      <p className="text-xs text-gray-600">Type: AI | Data Type: String | Max Length: 20</p>
                      <p className="text-xs text-gray-600 italic">"Extract invoice number from header"</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded p-2">
                      <p className="font-mono text-xs text-gray-700">customerName</p>
                      <p className="text-xs text-gray-600">Type: AI | Data Type: String | Max Length: 40</p>
                      <p className="text-xs text-gray-600 italic">"Extract customer company name"</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-gray-800">Workflow:</p>
                  <p className="text-gray-600">SFTP Upload Workflow</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-800">Result:</p>
                  <p className="text-gray-600">
                    A 9-page PDF is split into 3 invoices, each renamed (e.g., "INV-123456-Acme-Corp.pdf"),
                    and automatically uploaded to SFTP.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </InfoCard>

        <InfoCard
          title="Best Practices"
          icon={Settings}
          iconBgColor="bg-slate-100"
          iconColor="text-slate-600"
        >
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-slate-800 mb-3">Configuration Tips</h4>
              <ul className="text-slate-700 text-sm space-y-2">
                <li>• <strong>Start Simple:</strong> Begin with single-page processing, add grouping later if needed</li>
                <li>• <strong>Test Thoroughly:</strong> Use real PDFs to validate extraction accuracy</li>
                <li>• <strong>Clear Instructions:</strong> Be specific about field locations and expected formats</li>
                <li>• <strong>Appropriate Data Types:</strong> Use correct types for validation and formatting</li>
                <li>• <strong>Max Length Limits:</strong> Prevent filename issues by setting reasonable limits</li>
                <li>• <strong>Descriptive Names:</strong> Use clear names that indicate the document type</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-3">Document Grouping Strategy</h4>
              <ul className="text-blue-700 text-sm space-y-2">
                <li>• Use fixed Pages Per Group for consistent multi-page documents</li>
                <li>• Use Smart Detection for batched documents with identifiers</li>
                <li>• Combine both for variable-length documents with clear boundaries</li>
                <li>• Test pattern matching with actual document samples</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-semibold text-amber-800 mb-3">Field Mapping Strategy</h4>
              <ul className="text-amber-700 text-sm space-y-2">
                <li>• Use AI extraction for flexible, intelligent field detection</li>
                <li>• Use coordinate mapping for fixed-format, standardized documents</li>
                <li>• Use hardcoded values for constant metadata (e.g., document type, department)</li>
                <li>• Generate from template to quickly create initial field mappings</li>
              </ul>
            </div>
          </div>
        </InfoCard>
      </div>
    </SectionCard>
  );
}
