import React from 'react';
import { FileText, Settings, Upload, Code, Database, Map, Copy, Wand2 } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';
import InfoCard from '../shared/InfoCard';

export default function ExtractionTypesSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={FileText}
        title="Extraction Types"
        iconBgColor="bg-purple-100"
        iconColor="text-purple-600"
      />
      <div className="space-y-6">

        {/* Overview */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="font-semibold text-purple-800 mb-3">Overview</h3>
          <p className="text-purple-700">
            Extraction Types define how PDF documents are processed and converted into structured data formats (CSV, JSON, XML).
            Each type includes AI instructions, output templates, field mappings, and processing options.
          </p>
        </div>

        {/* Basic Configuration */}
        <InfoCard title="Basic Configuration" icon={Settings} color="purple">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-purple-800 mb-2">Name (Required)</h4>
              <p className="text-purple-700">
                A descriptive identifier for the extraction type (e.g., "Bill of Lading", "Invoice", "Purchase Order").
                This name appears in dropdowns and throughout the application.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-purple-800 mb-2">Filename (Required)</h4>
              <p className="text-purple-700">
                Base filename for generated output files. The system automatically appends timestamps and extensions.
              </p>
              <p className="text-purple-600 text-sm mt-1">
                Example: Setting "bol_export" generates files like "bol_export_2024-12-05_143022.csv"
              </p>
            </div>

            <div>
              <h4 className="font-medium text-purple-800 mb-2">Format Type (Required)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                <div className="bg-purple-100 p-3 rounded">
                  <strong className="text-purple-800">CSV</strong>
                  <p className="text-sm text-purple-700 mt-1">Tabular data, spreadsheet-ready</p>
                </div>
                <div className="bg-purple-100 p-3 rounded">
                  <strong className="text-purple-800">JSON</strong>
                  <p className="text-sm text-purple-700 mt-1">API integration, structured objects</p>
                </div>
                <div className="bg-purple-100 p-3 rounded">
                  <strong className="text-purple-800">XML</strong>
                  <p className="text-sm text-purple-700 mt-1">Legacy systems, SFTP upload</p>
                </div>
              </div>
            </div>
          </div>
        </InfoCard>

        {/* Format-Specific Settings */}
        <InfoCard title="Format-Specific Settings" icon={Code} color="blue">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-blue-800 mb-2">CSV Configuration</h4>
              <ul className="text-blue-700 space-y-2">
                <li>• <strong>Headers:</strong> Define column names in the output CSV file</li>
                <li>• <strong>Row Structure:</strong> Each extracted item becomes one row</li>
                <li>• <strong>Delimiter:</strong> Automatically uses comma separation</li>
                <li>• <strong>Use Case:</strong> Best for simple tabular data like line items, inventory lists</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-blue-800 mb-2">JSON Configuration</h4>
              <ul className="text-blue-700 space-y-2">
                <li>• <strong>Template:</strong> Define the JSON structure with nested objects and arrays</li>
                <li>• <strong>Field Types:</strong> Supports all data types (text, number, boolean, date, phone, etc.)</li>
                <li>• <strong>Advanced Features:</strong> Array splits, conditional logic, field transformations</li>
                <li>• <strong>Use Case:</strong> API integrations, complex hierarchical data structures</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-blue-800 mb-2">XML Configuration</h4>
              <ul className="text-blue-700 space-y-2">
                <li>• <strong>Template:</strong> Define XML structure with tags and attributes</li>
                <li>• <strong>Parse-It ID:</strong> Use {'{{'} PARSE_IT_ID_PLACEHOLDER {'}}'} for unique identifiers</li>
                <li>• <strong>SFTP Upload:</strong> Automatically uploads to configured SFTP server</li>
                <li>• <strong>Use Case:</strong> Legacy system integration, EDI processing</li>
              </ul>
            </div>
          </div>
        </InfoCard>

        {/* Multi-Page Processing */}
        <InfoCard title="Multi-Page Processing" icon={FileText} color="green">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-green-800 mb-2">JSON Multi-Page Processing</h4>
              <p className="text-green-700 mb-2">
                Process multi-page PDFs by defining page groups with specific patterns and extraction rules.
              </p>
              <ul className="text-green-700 space-y-2">
                <li>• <strong>Page Group Configs:</strong> Define multiple document sections within one PDF</li>
                <li>• <strong>Regex Patterns:</strong> Automatically detect page types using text patterns</li>
                <li>• <strong>Field Mappings:</strong> Different field rules for each page group</li>
                <li>• <strong>Array Groups:</strong> Collect multiple pages of same type into arrays</li>
                <li>• <strong>Cross-Group References:</strong> Access fields from other page groups</li>
              </ul>
              <div className="bg-green-100 p-3 rounded mt-3">
                <p className="text-sm text-green-800">
                  <strong>Example:</strong> A shipment document with 1 BOL page + multiple item detail pages →
                  Extract BOL data once, collect all item pages into an items array
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-green-800 mb-2">CSV Multi-Page Processing</h4>
              <p className="text-green-700 mb-2">
                Automatically processes all pages and combines extracted rows into a single CSV file.
              </p>
              <ul className="text-green-700 space-y-2">
                <li>• <strong>Automatic Concatenation:</strong> All pages processed with same extraction rules</li>
                <li>• <strong>Single Output:</strong> One CSV file with all rows from all pages</li>
                <li>• <strong>Use Case:</strong> Multi-page invoices, inventory lists spanning several pages</li>
              </ul>
            </div>
          </div>
        </InfoCard>

        {/* Page Processing Options */}
        <InfoCard title="Page Processing Options" icon={FileText} color="amber">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded">
                <h4 className="font-medium text-amber-800 mb-2">All Pages</h4>
                <p className="text-amber-700 text-sm">
                  Process every page in the PDF. Each page is extracted using the same instructions.
                  Results are combined into final output.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded">
                <h4 className="font-medium text-amber-800 mb-2">Single Page</h4>
                <p className="text-amber-700 text-sm">
                  Extract only one page (specify page number). Useful for documents where only the first page
                  or a specific page contains relevant data.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded">
                <h4 className="font-medium text-amber-800 mb-2">Page Range</h4>
                <p className="text-amber-700 text-sm">
                  Process a specific range of pages (e.g., pages 2-5). Ideal when header/footer pages
                  should be excluded.
                </p>
              </div>
            </div>
          </div>
        </InfoCard>

        {/* Upload Mode Configuration */}
        <InfoCard title="Upload Mode Configuration" icon={Upload} color="indigo">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-indigo-800 mb-2">Default Upload Mode</h4>
              <p className="text-indigo-700 mb-2">
                Controls whether the original PDF is uploaded alongside extracted data:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-indigo-50 p-3 rounded">
                  <strong className="text-indigo-800">Data Only</strong>
                  <p className="text-sm text-indigo-700 mt-1">
                    Send only extracted JSON/XML data to the API or SFTP. No PDF upload.
                  </p>
                </div>
                <div className="bg-indigo-50 p-3 rounded">
                  <strong className="text-indigo-800">Data + PDF</strong>
                  <p className="text-sm text-indigo-700 mt-1">
                    Upload both the extracted data and the original PDF file.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-indigo-800 mb-2">Lock Upload Mode</h4>
              <p className="text-indigo-700">
                When enabled, prevents users from changing the upload mode during extraction.
                Ensures consistency and prevents accidental PDF uploads when not desired.
              </p>
            </div>
          </div>
        </InfoCard>

        {/* AI Instructions */}
        <InfoCard title="AI Instructions" icon={Wand2} color="purple">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-purple-800 mb-2">Default Instructions (Required)</h4>
              <p className="text-purple-700 mb-2">
                Clear, specific instructions that tell the AI what data to extract from the PDF.
                These instructions guide the AI in identifying and extracting the correct information.
              </p>
              <div className="bg-purple-100 p-4 rounded mt-2">
                <p className="text-sm text-purple-800 mb-2"><strong>Best Practices:</strong></p>
                <ul className="text-sm text-purple-700 space-y-1">
                  <li>• Be specific about field locations (e.g., "shipper address in top-left corner")</li>
                  <li>• Mention expected formats (e.g., "date in MM/DD/YYYY format")</li>
                  <li>• Describe how to handle missing data (e.g., "use empty string if not found")</li>
                  <li>• Include examples when helpful (e.g., "PO number like PO-12345")</li>
                </ul>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-purple-800 mb-2">Auto-Detection Instructions</h4>
              <p className="text-purple-700">
                Instructions that help the AI identify if a PDF matches this extraction type.
                Used when the system needs to automatically detect document types.
              </p>
              <div className="bg-purple-100 p-3 rounded mt-2">
                <p className="text-sm text-purple-800">
                  <strong>Example:</strong> "This is a Bill of Lading if it contains the words 'BILL OF LADING'
                  in the header and has shipper/consignee information"
                </p>
              </div>
            </div>
          </div>
        </InfoCard>

        {/* Array Split Configuration */}
        <InfoCard title="Array Split Configuration (JSON Only)" icon={Database} color="emerald">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-emerald-800 mb-2">Purpose</h4>
              <p className="text-emerald-700">
                When the AI returns an array of objects, array splits automatically create separate API calls
                or files for each item in the array. This is useful for processing line items, shipments,
                or any repeating data structures.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-emerald-800 mb-2">Configuration</h4>
              <ul className="text-emerald-700 space-y-2">
                <li>• <strong>Field Name:</strong> JSON path to the array field (e.g., "items", "shipments")</li>
                <li>• <strong>Dot Notation:</strong> Use periods for nested arrays (e.g., "order.lineItems")</li>
                <li>• <strong>Processing:</strong> Each array element becomes a separate workflow execution</li>
                <li>• <strong>Parent Data:</strong> Non-array fields are included with each split item</li>
              </ul>
            </div>

            <div className="bg-emerald-100 p-4 rounded">
              <p className="text-sm text-emerald-800 mb-2"><strong>Example Scenario:</strong></p>
              <p className="text-sm text-emerald-700 mb-2">
                JSON contains: <code className="bg-emerald-200 px-1 rounded">{`{ "poNumber": "PO-123", "items": [{...}, {...}, {...}] }`}</code>
              </p>
              <p className="text-sm text-emerald-700">
                With array split on "items": Creates 3 separate API calls, each containing one item plus the poNumber
              </p>
            </div>

            <div>
              <h4 className="font-medium text-emerald-800 mb-2">Use Cases</h4>
              <ul className="text-emerald-700 space-y-1">
                <li>• Process each order line item separately</li>
                <li>• Create individual shipment records</li>
                <li>• Split multi-item invoices into separate transactions</li>
                <li>• Handle variable-length data sets</li>
              </ul>
            </div>
          </div>
        </InfoCard>

        {/* Field Mappings */}
        <InfoCard title="Field Mappings" icon={Map} color="blue">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Overview</h4>
              <p className="text-blue-700">
                Field mappings define how data is extracted and transformed. Each field in your output template
                can have specific extraction rules, data types, and transformation options.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-blue-800 mb-2">Field Types</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                  <strong className="text-blue-800">AI</strong>
                  <p className="text-sm text-blue-700 mt-1">
                    AI extracts the value based on instructions and field name
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                  <strong className="text-blue-800">Mapped</strong>
                  <p className="text-sm text-blue-700 mt-1">
                    Extract from specific PDF coordinates (uses visual mapping)
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                  <strong className="text-blue-800">Hardcoded</strong>
                  <p className="text-sm text-blue-700 mt-1">
                    Always use a fixed value (useful for identifiers, constants)
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-blue-800 mb-2">Data Types</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="bg-blue-50 p-2 rounded">
                  <strong className="text-blue-800 text-sm">Text</strong>
                  <p className="text-xs text-blue-700">Any string value</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                  <strong className="text-blue-800 text-sm">Number</strong>
                  <p className="text-xs text-blue-700">Numeric values, decimals</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                  <strong className="text-blue-800 text-sm">Boolean</strong>
                  <p className="text-xs text-blue-700">True/false values</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                  <strong className="text-blue-800 text-sm">Date</strong>
                  <p className="text-xs text-blue-700">Date only (YYYY-MM-DD)</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                  <strong className="text-blue-800 text-sm">DateTime</strong>
                  <p className="text-xs text-blue-700">Date with time</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                  <strong className="text-blue-800 text-sm">Phone</strong>
                  <p className="text-xs text-blue-700">Phone number formatting</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-blue-800 mb-2">Field Options</h4>
              <ul className="text-blue-700 space-y-2">
                <li>
                  <strong>Max Length:</strong> Limit the number of characters in the extracted value
                </li>
                <li>
                  <strong>RIN (Remove if Null):</strong> Exclude this field from output if value is empty/null
                </li>
                <li>
                  <strong>WFO (Workflow Only):</strong> Field is used internally in workflow logic but not included in final output
                </li>
                <li>
                  <strong>Map JSON:</strong> For JSON format types, opens visual mapping tool to select exact PDF coordinates
                </li>
              </ul>
            </div>

            <div className="bg-blue-100 p-4 rounded">
              <p className="text-sm text-blue-800 mb-2"><strong>Pro Tip:</strong></p>
              <p className="text-sm text-blue-700">
                Use "AI" type for most fields where document layouts vary. Use "Mapped" type when documents
                have consistent layouts and you need precise coordinate-based extraction. Use "Hardcoded"
                for static values like company IDs or API keys.
              </p>
            </div>
          </div>
        </InfoCard>

        {/* Additional Features */}
        <InfoCard title="Additional Features" icon={Copy} color="slate">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-slate-800 mb-2">Copy Extraction Type</h4>
              <p className="text-slate-700">
                Create a duplicate of an existing extraction type as a starting point. Useful for creating
                variants or similar document types without building from scratch.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-slate-800 mb-2">Mapping Page Integration</h4>
              <p className="text-slate-700">
                The Mapping page provides a visual interface for defining coordinate-based field mappings.
                Draw boxes on a PDF preview to specify exact extraction regions for each field.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-slate-800 mb-2">Workflow Assignment</h4>
              <p className="text-slate-700">
                Link extraction types to workflows for automated multi-step processing. Workflows can include
                API calls, file uploads, data transformations, and conditional logic.
              </p>
            </div>
          </div>
        </InfoCard>

        {/* Best Practices */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <h3 className="font-semibold text-purple-800 mb-4">Best Practices</h3>
          <ul className="text-purple-700 space-y-2">
            <li>• <strong>Start Simple:</strong> Begin with basic AI extraction, add mappings only when needed</li>
            <li>• <strong>Clear Instructions:</strong> Provide detailed, specific AI instructions for best results</li>
            <li>• <strong>Test Thoroughly:</strong> Use the Extract page to test with real PDFs before deploying</li>
            <li>• <strong>Use Data Types:</strong> Always specify correct data types for proper validation</li>
            <li>• <strong>Consider Workflows:</strong> Use workflows for complex processing, multi-step operations</li>
            <li>• <strong>Document Patterns:</strong> For multi-page PDFs, use regex patterns to identify page types</li>
            <li>• <strong>Review Logs:</strong> Check extraction logs regularly to identify and fix issues</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
