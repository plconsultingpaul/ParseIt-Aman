import React from 'react';
import { FileText, Settings, Upload, Brain, Server, Key, Mail, Filter, Database, Users, GitBranch, CheckCircle, AlertCircle, Copy, Download } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
        <div className="text-center">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <FileText className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Parse-It Help Center</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Complete guide to using Parse-It for PDF data extraction
          </p>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-8">
        {/* Getting Started */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-green-100 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Getting Started</h2>
          </div>
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
        </section>

        {/* Upload Modes */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Brain className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Upload Modes</h2>
          </div>
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
        </section>

        {/* Extraction Process */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Upload className="h-6 w-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Extraction Process</h2>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-purple-800 mb-3">For XML Types:</h3>
                <ol className="text-purple-700 space-y-2 list-decimal list-inside">
                  <li>AI extracts data according to your instructions</li>
                  <li>Data is formatted as XML using your template</li>
                  <li>Parse-It ID is automatically assigned</li>
                  <li>Both XML and PDF files are uploaded to SFTP server</li>
                  <li>Multi-page PDFs are split into individual files</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold text-purple-800 mb-3">For JSON Types:</h3>
                <ol className="text-purple-700 space-y-2 list-decimal list-inside">
                  <li>AI extracts data according to your instructions</li>
                  <li>Data is formatted as JSON using your template</li>
                  <li>Parse-It ID is automatically assigned</li>
                  <li>JSON data is sent to your configured API endpoint</li>
                  <li>PDF is also uploaded to SFTP for backup</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Settings Overview */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gray-100 p-3 rounded-lg">
              <Settings className="h-6 w-6 text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Settings Overview</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <FileText className="h-6 w-6 text-purple-600" />
                <h3 className="font-semibold text-gray-900">Extraction Types</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Create and manage templates for different document types. Define extraction instructions, output formats, and field mappings.
              </p>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <Server className="h-6 w-6 text-blue-600" />
                <h3 className="font-semibold text-gray-900">SFTP Settings</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Configure your SFTP server connection for uploading extracted XML files and PDF documents.
              </p>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <Key className="h-6 w-6 text-green-600" />
                <h3 className="font-semibold text-gray-900">API Settings</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Set up API endpoints for JSON data transmission and configure your Google Gemini API key for AI processing.
              </p>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <Mail className="h-6 w-6 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Email Monitoring</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Configure Office 365 or Gmail monitoring to automatically process PDF attachments from incoming emails.
              </p>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <Filter className="h-6 w-6 text-orange-600" />
                <h3 className="font-semibold text-gray-900">Email Rules</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Create rules to automatically match incoming emails to specific extraction types based on sender and subject patterns.
              </p>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <Users className="h-6 w-6 text-pink-600" />
                <h3 className="font-semibold text-gray-900">User Management</h3>
              </div>
              <p className="text-gray-600 text-sm">
                Manage user accounts, permissions, and access levels. Control who can access different parts of the application.
              </p>
            </div>
          </div>
        </section>

        {/* Email Monitoring Details */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-indigo-100 p-3 rounded-lg">
              <Mail className="h-6 w-6 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Email Monitoring</h2>
          </div>
          <div className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
              <h3 className="font-semibold text-indigo-800 mb-4">How Email Monitoring Works</h3>
              <ol className="text-indigo-700 space-y-3 list-decimal list-inside">
                <li><strong>Email Scanning:</strong> Parse-It periodically checks your configured email account for new messages with PDF attachments</li>
                <li><strong>Rule Matching:</strong> Each email is matched against your processing rules based on sender and subject patterns</li>
                <li><strong>AI Detection (Optional):</strong> If enabled, AI analyzes the PDF to automatically detect the best extraction type</li>
                <li><strong>Data Extraction:</strong> The PDF is processed using the matched or detected extraction type</li>
                <li><strong>File Upload:</strong> Extracted data and PDF files are uploaded to your SFTP server</li>
                <li><strong>Email Archiving:</strong> Processed emails are moved to archive to prevent reprocessing</li>
              </ol>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-800 mb-3">Office 365 Setup</h3>
                <ul className="text-blue-700 space-y-2">
                  <li>• Register app in Azure AD</li>
                  <li>• Grant Mail.Read permissions</li>
                  <li>• Create client secret</li>
                  <li>• Configure tenant ID and client credentials</li>
                </ul>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="font-semibold text-green-800 mb-3">Gmail Setup</h3>
                <ul className="text-green-700 space-y-2">
                  <li>• Create Google Cloud project</li>
                  <li>• Enable Gmail API</li>
                  <li>• Configure OAuth consent screen</li>
                  <li>• Generate refresh token</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Extraction Types */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Extraction Types</h2>
          </div>
          <div className="space-y-6">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <h3 className="font-semibold text-purple-800 mb-4">Creating Extraction Types</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-purple-800 mb-3">Required Fields:</h4>
                  <ul className="text-purple-700 space-y-2">
                    <li>• <strong>Name:</strong> Descriptive name for the extraction type</li>
                    <li>• <strong>Default Instructions:</strong> Tell the AI what data to extract</li>
                    <li>• <strong>Template:</strong> XML or JSON structure for output format</li>
                    <li>• <strong>Filename:</strong> Base name for generated files</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-purple-800 mb-3">Optional Features:</h4>
                  <ul className="text-purple-700 space-y-2">
                    <li>• <strong>Field Mappings:</strong> Map specific PDF coordinates to JSON fields</li>
                    <li>• <strong>Parse-It ID Mapping:</strong> Automatically inject unique IDs</li>
                    <li>• <strong>Auto-Detection:</strong> Instructions for AI to identify document type</li>
                    <li>• <strong>Workflow Assignment:</strong> Link to multi-step processing workflows</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <h3 className="font-semibold text-amber-800 mb-3">XML vs JSON Formats</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-amber-800 mb-2">XML Format:</h4>
                  <ul className="text-amber-700 space-y-2">
                    <li>• Files uploaded to SFTP server</li>
                    <li>• Use &lbrace;&lbrace;PARSE_IT_ID_PLACEHOLDER&rbrace;&rbrace; in templates</li>
                    <li>• Best for legacy systems</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-amber-800 mb-2">JSON Format:</h4>
                  <ul className="text-amber-700 space-y-2">
                    <li>• Data sent to API endpoints</li>
                    <li>• Advanced field mapping capabilities</li>
                    <li>• Modern REST API integration</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Field Mappings */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Database className="h-6 w-6 text-orange-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Field Mappings (JSON Only)</h2>
          </div>
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
        </section>

        {/* Workflows */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-3 rounded-lg">
              <GitBranch className="h-6 w-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Workflows</h2>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <p className="text-purple-700 mb-6 text-lg">
              Workflows allow you to create multi-step processes that execute after data extraction. Perfect for complex business logic.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h3 className="font-semibold text-purple-800 mb-3">API Call Steps</h3>
                <p className="text-purple-700">
                  Send extracted data to external APIs, update records, or trigger other systems.
                </p>
              </div>
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h3 className="font-semibold text-purple-800 mb-3">Conditional Checks</h3>
                <p className="text-purple-700">
                  Branch workflow execution based on data values or conditions in the extracted content.
                </p>
              </div>
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h3 className="font-semibold text-purple-800 mb-3">Data Transforms</h3>
                <p className="text-purple-700">
                  Modify, copy, or restructure extracted data before sending to subsequent steps.
                </p>
              </div>
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h3 className="font-semibold text-purple-800 mb-3">Email Actions</h3>
                <p className="text-purple-700">
                  Send automated emails with extracted data and PDF attachments to customers or stakeholders.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* User Permissions */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-pink-100 p-3 rounded-lg">
              <Users className="h-6 w-6 text-pink-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">User Management & Permissions</h2>
          </div>
          <div className="bg-pink-50 border border-pink-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-pink-800 mb-4">User Types:</h3>
                <ul className="text-pink-700 space-y-2">
                  <li>• <strong>Administrator:</strong> Full access to all settings and features</li>
                  <li>• <strong>Regular User:</strong> Access only to extraction features by default</li>
                  <li>• <strong>Custom Permissions:</strong> Granular control over specific settings sections</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-pink-800 mb-4">Permission Categories:</h3>
                <ul className="text-pink-700 space-y-2">
                  <li>• Extraction Types, SFTP, API Settings</li>
                  <li>• Email Monitoring, Rules, Processed Emails</li>
                  <li>• Extraction Logs, User Management</li>
                  <li>• Workflow Management</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced PDF Processing */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-3 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Advanced PDF Processing</h2>
          </div>
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
        </section>

        {/* Conditional PDF Upload */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-indigo-100 p-3 rounded-lg">
              <Server className="h-6 w-6 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Conditional PDF Upload</h2>
          </div>
          <div className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
              <h3 className="font-semibold text-indigo-800 mb-4">SFTP Upload Strategies</h3>
              <p className="text-indigo-700 mb-4">
                Control exactly which pages get uploaded to your SFTP server using workflow steps.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-indigo-300 rounded-lg p-6">
                  <h4 className="font-semibold text-indigo-800 mb-3">Upload All Pages</h4>
                  <ul className="text-indigo-700 space-y-2">
                    <li>• Uploads the entire grouped PDF as one file</li>
                    <li>• Best for complete document archival</li>
                    <li>• Maintains all pages and formatting</li>
                    <li>• Default behavior for most workflows</li>
                  </ul>
                </div>
                <div className="bg-white border border-indigo-300 rounded-lg p-6">
                  <h4 className="font-semibold text-indigo-800 mb-3">Upload Specific Page</h4>
                  <ul className="text-indigo-700 space-y-2">
                    <li>• Uploads only one page from the grouped PDF</li>
                    <li>• Perfect for sending only relevant pages</li>
                    <li>• Reduces file sizes and storage costs</li>
                    <li>• Ideal for customer-facing documents</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="font-semibold text-green-800 mb-4">Setting Up Conditional Upload</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-green-800 mb-3">Workflow Configuration:</h4>
                  <ol className="text-green-700 space-y-2 list-decimal list-inside">
                    <li>Create a workflow in Type Setup → Workflows</li>
                    <li>Add an "SFTP Upload" step</li>
                    <li>Set "Upload Strategy" to "Upload Specific Page"</li>
                    <li>Specify which page number to upload</li>
                    <li>Assign workflow to your transformation type</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-medium text-green-800 mb-3">Example Workflow:</h4>
                  <div className="bg-white border border-green-300 rounded-lg p-4">
                    <p className="text-sm text-green-800 mb-2"><strong>Step 1:</strong> API Call</p>
                    <p className="text-xs text-green-700 mb-3">Extract data from page 1, send to API</p>
                    <p className="text-sm text-green-800 mb-2"><strong>Step 2:</strong> SFTP Upload</p>
                    <p className="text-xs text-green-700">Upload only page 2 to SFTP server</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Complete Example Walkthrough */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-purple-100 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Complete Example: Invoice Processing</h2>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <h3 className="font-semibold text-purple-800 mb-4">Scenario: 2-Page Invoice Documents</h3>
            <p className="text-purple-700 mb-6">
              You have a PDF with multiple 2-page invoices. Page 1 has "INVOICE / FACTURE" header and customer data. 
              Page 2 has detailed line items. You want to extract customer info from page 1 for API calls, 
              but only send page 2 to customers via SFTP.
            </p>
            
            <div className="space-y-6">
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h4 className="font-semibold text-purple-800 mb-4">Step 1: Configure Transformation Type</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-purple-800 mb-2">Basic Settings:</h5>
                    <ul className="text-purple-700 space-y-1 text-sm">
                      <li>• <strong>Name:</strong> "Invoice Processing"</li>
                      <li>• <strong>Pages Per Group:</strong> 2</li>
                      <li>• <strong>Document Start Detection:</strong> ✓ Enabled</li>
                      <li>• <strong>Start Pattern:</strong> "INVOICE / FACTURE"</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-purple-800 mb-2">Field Mappings:</h5>
                    <ul className="text-purple-700 space-y-1 text-sm">
                      <li>• <strong>customerName:</strong> Page in Group = 1</li>
                      <li>• <strong>invoiceNumber:</strong> Page in Group = 1</li>
                      <li>• <strong>customerEmail:</strong> Page in Group = 1</li>
                      <li>• <strong>totalAmount:</strong> Page in Group = 2</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h4 className="font-semibold text-purple-800 mb-4">Step 2: Create Workflow</h4>
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 className="font-medium text-blue-800 mb-2">Step 1: API Call</h5>
                    <ul className="text-blue-700 text-sm space-y-1">
                      <li>• <strong>URL:</strong> https://api.company.com/customers</li>
                      <li>• <strong>Body:</strong> {"{"}"customerName": "{`{{customerName}}`}", "email": "{`{{customerEmail}}`}"{"}"}</li>
                      <li>• <strong>Purpose:</strong> Register customer in system using page 1 data</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h5 className="font-medium text-green-800 mb-2">Step 2: SFTP Upload</h5>
                    <ul className="text-green-700 text-sm space-y-1">
                      <li>• <strong>Upload Strategy:</strong> Upload Specific Page</li>
                      <li>• <strong>Specific Page:</strong> 2</li>
                      <li>• <strong>Purpose:</strong> Send only page 2 (line items) to customer</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="bg-white border border-purple-300 rounded-lg p-6">
                <h4 className="font-semibold text-purple-800 mb-4">Step 3: Processing Result</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="font-medium text-purple-800 mb-2">What Happens:</h5>
                    <ol className="text-purple-700 space-y-1 text-sm list-decimal list-inside">
                      <li>PDF split into 2-page groups at "INVOICE / FACTURE"</li>
                      <li>Customer data extracted from page 1 of each group</li>
                      <li>API called with customer information</li>
                      <li>Only page 2 uploaded to SFTP for each group</li>
                    </ol>
                  </div>
                  <div>
                    <h5 className="font-medium text-purple-800 mb-2">Benefits:</h5>
                    <ul className="text-purple-700 space-y-1 text-sm">
                      <li>• Automatic document boundary detection</li>
                      <li>• Selective page processing and upload</li>
                      <li>• Reduced storage and bandwidth usage</li>
                      <li>• Customer receives only relevant pages</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Guide */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Settings className="h-6 w-6 text-orange-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Configuration Guide</h2>
          </div>
          <div className="space-y-6">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
              <h3 className="font-semibold text-orange-800 mb-4">Setting Up Advanced PDF Processing</h3>
              
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-orange-800 mb-3">1. Configure Transformation Type</h4>
                  <div className="bg-white border border-orange-300 rounded-lg p-4">
                    <p className="text-orange-700 text-sm mb-3">
                      <strong>Location:</strong> Type Setup → Transformation Types → [Your Type]
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <h5 className="font-medium text-orange-800 mb-2">PDF Grouping Settings:</h5>
                        <ul className="text-orange-700 space-y-1">
                          <li>• <strong>Pages Per Group:</strong> Number of pages to group (e.g., 2)</li>
                          <li>• <strong>Document Start Detection:</strong> ✓ Enable checkbox</li>
                          <li>• <strong>Start Pattern:</strong> Text to detect (e.g., "INVOICE")</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="font-medium text-orange-800 mb-2">Field Mappings:</h5>
                        <ul className="text-orange-700 space-y-1">
                          <li>• <strong>Field Name:</strong> customerName</li>
                          <li>• <strong>Page in Group:</strong> 1 (extract from first page)</li>
                          <li>• <strong>Type:</strong> AI or Mapped coordinates</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-orange-800 mb-3">2. Create Workflow with Conditional Upload</h4>
                  <div className="bg-white border border-orange-300 rounded-lg p-4">
                    <p className="text-orange-700 text-sm mb-3">
                      <strong>Location:</strong> Type Setup → Workflows → [Create New]
                    </p>
                    <div className="space-y-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h5 className="font-medium text-blue-800 mb-2">Step 1: API Call (Optional)</h5>
                        <ul className="text-blue-700 text-xs space-y-1">
                          <li>• Extract and send data from page 1 to your API</li>
                          <li>• Use extracted customer info for registration/lookup</li>
                        </ul>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <h5 className="font-medium text-green-800 mb-2">Step 2: SFTP Upload</h5>
                        <ul className="text-green-700 text-xs space-y-1">
                          <li>• <strong>Upload Strategy:</strong> "Upload Specific Page"</li>
                          <li>• <strong>Specific Page:</strong> 2 (upload only page 2)</li>
                          <li>• <strong>Result:</strong> Customer gets only the detail page</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-orange-800 mb-3">3. Assign Workflow to Transformation Type</h4>
                  <div className="bg-white border border-orange-300 rounded-lg p-4">
                    <p className="text-orange-700 text-sm mb-2">
                      <strong>Location:</strong> Type Setup → Transformation Types → [Your Type] → Assigned Workflow
                    </p>
                    <p className="text-orange-700 text-sm">
                      Select your newly created workflow from the dropdown to link it to the transformation type.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Use Cases */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-pink-100 p-3 rounded-lg">
              <Brain className="h-6 w-6 text-pink-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Advanced Use Cases</h2>
          </div>
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
        </section>

        {/* Best Practices for Advanced Processing */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Best Practices for Advanced Processing</h2>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-green-800 mb-4">Pattern Detection Tips:</h3>
                <ul className="text-green-700 space-y-2">
                  <li>• Use unique, consistent text that appears on every document start</li>
                  <li>• Avoid common words that might appear elsewhere</li>
                  <li>• Test with sample PDFs to verify pattern detection accuracy</li>
                  <li>• Consider using partial matches (e.g., "INVOICE" instead of full headers)</li>
                  <li>• Set reasonable page limits to prevent oversized groups</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-green-800 mb-4">Workflow Design:</h3>
                <ul className="text-green-700 space-y-2">
                  <li>• Extract data from early pages for API calls</li>
                  <li>• Use conditional steps for complex business logic</li>
                  <li>• Upload specific pages to reduce file sizes</li>
                  <li>• Test workflows with sample documents first</li>
                  <li>• Monitor workflow execution logs for optimization</li>
                </ul>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="font-semibold text-green-800 mb-4">Performance Considerations:</h3>
              <ul className="text-green-700 space-y-2">
                <li>• Larger page groups require more processing time and memory</li>
                <li>• Pattern detection adds processing overhead but improves accuracy</li>
                <li>• Specific page uploads reduce bandwidth and storage costs</li>
                <li>• Monitor execution times and adjust grouping settings as needed</li>
                <li>• Consider using fallback grouping if pattern detection fails frequently</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-red-100 p-3 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Troubleshooting</h2>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="font-semibold text-red-800 mb-4">Common Issues & Solutions</h3>
            <div className="space-y-6">
              <div>
                <h4 className="font-medium text-red-800 mb-2">AI Extraction Fails:</h4>
                <ul className="text-red-700 space-y-2 ml-4">
                  <li>• Check that your Google Gemini API key is configured in API Settings</li>
                  <li>• Ensure your extraction instructions are clear and specific</li>
                  <li>• Verify the PDF is not corrupted or password-protected</li>
                  <li>• Try simplifying your extraction template</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-red-800 mb-2">SFTP Upload Fails:</h4>
                <ul className="text-red-700 space-y-2 ml-4">
                  <li>• Test your SFTP connection in SFTP Settings</li>
                  <li>• Verify server credentials and paths are correct</li>
                  <li>• Check that the remote directories exist and are writable</li>
                  <li>• Ensure firewall allows connections on the specified port</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-red-800 mb-2">API Calls Fail:</h4>
                <ul className="text-red-700 space-y-2 ml-4">
                  <li>• Test your API connection using the "Test TruckMate API" button</li>
                  <li>• Verify the API endpoint URL and authentication token</li>
                  <li>• Check that your JSON template matches the API's expected format</li>
                  <li>• Review API error details in the extraction logs</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-red-800 mb-2">Email Monitoring Issues:</h4>
                <ul className="text-red-700 space-y-2 ml-4">
                  <li>• Test your email connection before enabling monitoring</li>
                  <li>• Ensure your app has proper permissions (Mail.Read for Office 365)</li>
                  <li>• Check that processing rules are enabled and properly configured</li>
                  <li>• Verify the monitored email address is correct</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Best Practices</h2>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-green-800 mb-4">Extraction Instructions:</h3>
                <ul className="text-green-700 space-y-2">
                  <li>• Be specific about what data to extract</li>
                  <li>• Mention field locations when possible</li>
                  <li>• Include data format requirements (dates, numbers)</li>
                  <li>• Test with sample PDFs before deploying</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-green-800 mb-4">Template Design:</h3>
                <ul className="text-green-700 space-y-2">
                  <li>• Keep templates simple and focused</li>
                  <li>• Use consistent field naming conventions</li>
                  <li>• Include all required fields for your downstream systems</li>
                  <li>• Test JSON syntax before saving</li>
                </ul>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="font-semibold text-green-800 mb-4">Security & Performance:</h3>
              <ul className="text-green-700 space-y-2">
                <li>• Use strong passwords for SFTP and API authentication</li>
                <li>• Regularly review extraction logs for errors or issues</li>
                <li>• Set appropriate polling intervals for email monitoring (5-15 minutes recommended)</li>
                <li>• Monitor API rate limits and usage</li>
                <li>• Grant users only the permissions they need</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Tools & Features */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Copy className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Tools & Features</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-800 mb-3">Interactive PDF Mapping</h3>
              <p className="text-blue-700 mb-4">
                Use the Mapping tool to visually select fields on your PDF and get exact coordinates for field mappings.
              </p>
              <ul className="text-blue-700 space-y-2">
                <li>• Click and drag to select field areas</li>
                <li>• Label each selection for easy identification</li>
                <li>• Copy coordinates for use in extraction instructions</li>
              </ul>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
              <h3 className="font-semibold text-indigo-800 mb-3">Extraction Logs</h3>
              <p className="text-indigo-700 mb-4">
                Monitor all extraction activities, view success/failure rates, and troubleshoot issues.
              </p>
              <ul className="text-indigo-700 space-y-2">
                <li>• Filter by status, user, type, or date range</li>
                <li>• View extracted data and API responses</li>
                <li>• Copy data for testing or debugging</li>
              </ul>
            </div>
          </div>
        </section>

        {/* API Keys & Configuration */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Key className="h-6 w-6 text-yellow-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">API Keys & Configuration</h2>
          </div>
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
        </section>

        {/* Support */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gray-100 p-3 rounded-lg">
              <Mail className="h-6 w-6 text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Support & Resources</h2>
          </div>
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
                <h3 className="font-semibold text-gray-800 mb-4">Advanced Processing Issues:</h3>
                <ul className="text-gray-700 space-y-2">
                  <li>• <strong>Pattern Not Detected:</strong> Check text extraction and pattern spelling</li>
                  <li>• <strong>Wrong Page Grouping:</strong> Verify pattern appears consistently</li>
                  <li>• <strong>Missing Field Data:</strong> Ensure correct "Page in Group" numbers</li>
                  <li>• <strong>Upload Failures:</strong> Check SFTP upload strategy configuration</li>
                  <li>• <strong>Large File Processing:</strong> Consider reducing pages per group</li>
                </ul>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="font-semibold text-gray-800 mb-4">Tips for Success:</h3>
              <ul className="text-gray-700 space-y-2">
                <li>• Use clear, descriptive names for extraction types</li>
                <li>• Test extraction types with various PDF samples</li>
                <li>• Keep extraction instructions concise but detailed</li>
                <li>• Regularly backup your extraction type configurations</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Email Actions in Workflows */}
        <section className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-pink-100 p-3 rounded-lg">
              <Mail className="h-6 w-6 text-pink-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Email Actions in Workflows</h2>
          </div>
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
                    <li>• <strong>Templates:</strong> Use {`{{fieldName}}`} for extracted data</li>
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
                    <p className="text-sm text-green-800 mb-2"><strong>To:</strong> {`{{customerEmail}}`}</p>
                    <p className="text-sm text-green-800 mb-2"><strong>Subject:</strong> Invoice {`{{invoiceNumber}}`} - Payment Due</p>
                    <div className="text-sm text-green-800">
                      <strong>Body:</strong><br />
                      Dear {`{{customerName}}`},<br /><br />
                      Your invoice {`{{invoiceNumber}}`} for ${`{{totalAmount}}`} is now available.<br /><br />
                      Payment is due by {`{{dueDate}}`}.<br /><br />
                      Please find the attached PDF for your records.<br /><br />
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
                    <li><strong>Step 3:</strong> Rename PDF to "Invoice_{`{{invoiceNumber}}`}.pdf"</li>
                    <li><strong>Step 4:</strong> Email renamed PDF to customer at {`{{customerEmail}}`}</li>
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
        </section>
      </div>
    </div>
  );
}