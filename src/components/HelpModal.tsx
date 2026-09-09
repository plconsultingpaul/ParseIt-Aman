import React from 'react';
import { X, FileText, Settings, Upload, Brain, Server, Key, Mail, Filter, Database, Users, GitBranch, CheckCircle, AlertCircle, Copy, Download } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-20">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-white">Parse-It Help Center</h2>
            <p className="text-purple-100 mt-1">Complete guide to using Parse-It for PDF data extraction</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors duration-200 p-2 rounded-lg hover:bg-white/10 flex-shrink-0"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-8">
            {/* Getting Started */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Getting Started</h3>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h4 className="font-semibold text-green-800 mb-3">What is Parse-It?</h4>
                <p className="text-green-700 mb-4">
                  Parse-It is an AI-powered PDF data extraction application that converts unstructured PDF documents into structured XML or JSON data.
                  It uses Google's Gemini AI to intelligently extract information from your PDFs based on customizable templates and instructions.
                </p>
                <h4 className="font-semibold text-green-800 mb-3">Quick Start (3 Steps)</h4>
                <ol className="text-green-700 space-y-2 list-decimal list-inside">
                  <li><strong>Upload a PDF:</strong> Click "Upload & Extract" and select your PDF file</li>
                  <li><strong>Choose Extraction Type:</strong> Select from pre-configured templates or use AI auto-detection</li>
                  <li><strong>Extract & Process:</strong> Click "Extract & Send to API" or "Extract & Upload via SFTP" to process your document</li>
                </ol>
              </div>
            </section>

            {/* Upload Modes */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Brain className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Upload Modes</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2 flex items-center space-x-2">
                    <Settings className="h-4 w-4" />
                    <span>Manual Selection</span>
                  </h4>
                  <ul className="text-blue-700 text-sm space-y-1">
                    <li>• You manually choose which extraction type to use</li>
                    <li>• Best when you know exactly what type of document you're processing</li>
                    <li>• Gives you full control over the extraction process</li>
                    <li>• Recommended for consistent document types</li>
                  </ul>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-800 mb-2 flex items-center space-x-2">
                    <Brain className="h-4 w-4" />
                    <span>AI Auto-Detect</span>
                  </h4>
                  <ul className="text-purple-700 text-sm space-y-1">
                    <li>• AI analyzes your PDF and suggests the best extraction type</li>
                    <li>• Perfect for mixed document types or unknown formats</li>
                    <li>• Shows confidence level and reasoning for the suggestion</li>
                    <li>• You can still override the AI's choice if needed</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Extraction Process */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Upload className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Extraction Process</h3>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-purple-800 mb-3">For XML Types:</h4>
                    <ol className="text-purple-700 text-sm space-y-1 list-decimal list-inside">
                      <li>AI extracts data according to your instructions</li>
                      <li>Data is formatted as XML using your template</li>
                      <li>Parse-It ID is automatically assigned</li>
                      <li>Both XML and PDF files are uploaded to SFTP server</li>
                      <li>Multi-page PDFs are split into individual files</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-semibold text-purple-800 mb-3">For JSON Types:</h4>
                    <ol className="text-purple-700 text-sm space-y-1 list-decimal list-inside">
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
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <Settings className="h-6 w-6 text-gray-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Settings Overview</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    <h4 className="font-semibold text-gray-900">Extraction Types</h4>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Create and manage templates for different document types. Define extraction instructions, output formats, and field mappings.
                  </p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Server className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-900">SFTP Settings</h4>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Configure your SFTP server connection for uploading extracted XML files and PDF documents.
                  </p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Key className="h-5 w-5 text-green-600" />
                    <h4 className="font-semibold text-gray-900">API Settings</h4>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Set up API endpoints for JSON data transmission and configure your Google Gemini API key for AI processing.
                  </p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Mail className="h-5 w-5 text-indigo-600" />
                    <h4 className="font-semibold text-gray-900">Email Monitoring</h4>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Configure Office 365 or Gmail monitoring to automatically process PDF attachments from incoming emails.
                  </p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Filter className="h-5 w-5 text-orange-600" />
                    <h4 className="font-semibold text-gray-900">Email Rules</h4>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Create rules to automatically match incoming emails to specific extraction types based on sender and subject patterns.
                  </p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Users className="h-5 w-5 text-pink-600" />
                    <h4 className="font-semibold text-gray-900">User Management</h4>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Manage user accounts, permissions, and access levels. Control who can access different parts of the application.
                  </p>
                </div>
              </div>
            </section>

            {/* Email Monitoring Details */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <Mail className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Email Monitoring</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
                  <h4 className="font-semibold text-indigo-800 mb-3">How Email Monitoring Works</h4>
                  <ol className="text-indigo-700 space-y-2 list-decimal list-inside">
                    <li><strong>Email Scanning:</strong> Parse-It periodically checks your configured email account for new messages with PDF attachments</li>
                    <li><strong>Rule Matching:</strong> Each email is matched against your processing rules based on sender and subject patterns</li>
                    <li><strong>AI Detection (Optional):</strong> If enabled, AI analyzes the PDF to automatically detect the best extraction type</li>
                    <li><strong>Data Extraction:</strong> The PDF is processed using the matched or detected extraction type</li>
                    <li><strong>File Upload:</strong> Extracted data and PDF files are uploaded to your SFTP server</li>
                    <li><strong>Email Archiving:</strong> Processed emails are moved to archive to prevent reprocessing</li>
                  </ol>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 mb-2">Office 365 Setup</h4>
                    <ul className="text-blue-700 text-sm space-y-1">
                      <li>• Register app in Azure AD</li>
                      <li>• Grant Mail.Read permissions</li>
                      <li>• Create client secret</li>
                      <li>• Configure tenant ID and client credentials</li>
                    </ul>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-green-800 mb-2">Gmail Setup</h4>
                    <ul className="text-green-700 text-sm space-y-1">
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
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <FileText className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Extraction Types</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <h4 className="font-semibold text-purple-800 mb-3">Creating Extraction Types</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h5 className="font-medium text-purple-800 mb-2">Required Fields:</h5>
                      <ul className="text-purple-700 text-sm space-y-1">
                        <li>• <strong>Name:</strong> Descriptive name for the extraction type</li>
                        <li>• <strong>Default Instructions:</strong> Tell the AI what data to extract</li>
                        <li>• <strong>Template:</strong> XML or JSON structure for output format</li>
                        <li>• <strong>Filename:</strong> Base name for generated files</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-purple-800 mb-2">Optional Features:</h5>
                      <ul className="text-purple-700 text-sm space-y-1">
                        <li>• <strong>Field Mappings:</strong> Map specific PDF coordinates to JSON fields</li>
                        <li>• <strong>Parse-It ID Mapping:</strong> Automatically inject unique IDs</li>
                        <li>• <strong>Auto-Detection:</strong> Instructions for AI to identify document type</li>
                        <li>• <strong>Workflow Assignment:</strong> Link to multi-step processing workflows</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-800 mb-2">XML vs JSON Formats</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-amber-800">XML Format:</h5>
                      <ul className="text-amber-700 space-y-1">
                        <li>• Files uploaded to SFTP server</li>
                        <li>• Use &lbrace;&lbrace;PARSE_IT_ID_PLACEHOLDER&rbrace;&rbrace; in templates</li>
                        <li>• Best for legacy systems</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-amber-800">JSON Format:</h5>
                      <ul className="text-amber-700 space-y-1">
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
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <Database className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Field Mappings (JSON Only)</h3>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                <p className="text-orange-700 mb-4">
                  Field mappings allow you to precisely control how data is extracted and formatted for JSON extraction types.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white border border-orange-300 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-800 mb-2">AI Type</h4>
                    <p className="text-orange-700 text-sm">
                      Let the AI determine what to extract based on your description. Most flexible option.
                    </p>
                  </div>
                  <div className="bg-white border border-blue-300 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 mb-2">Mapped Type</h4>
                    <p className="text-blue-700 text-sm">
                      Extract data from specific PDF coordinates. Use the Mapping tool to get precise coordinates.
                    </p>
                  </div>
                  <div className="bg-white border border-green-300 rounded-lg p-4">
                    <h4 className="font-semibold text-green-800 mb-2">Hardcoded Type</h4>
                    <p className="text-green-700 text-sm">
                      Always use the same fixed value. Perfect for constants like company codes or status flags.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Workflows */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <GitBranch className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Workflows</h3>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <p className="text-purple-700 mb-4">
                  Workflows allow you to create multi-step processes that execute after data extraction. Perfect for complex business logic.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-purple-300 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-800 mb-2">API Call Steps</h4>
                    <p className="text-purple-700 text-sm">
                      Send extracted data to external APIs, update records, or trigger other systems.
                    </p>
                  </div>
                  <div className="bg-white border border-purple-300 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-800 mb-2">Conditional Checks</h4>
                    <p className="text-purple-700 text-sm">
                      Branch workflow execution based on data values or conditions in the extracted content.
                    </p>
                  </div>
                  <div className="bg-white border border-purple-300 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-800 mb-2">Data Transforms</h4>
                    <p className="text-purple-700 text-sm">
                      Modify, copy, or restructure extracted data before sending to subsequent steps.
                    </p>
                  </div>
                  <div className="bg-white border border-purple-300 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-800 mb-2">Email Actions</h4>
                    <p className="text-purple-700 text-sm">
                      Send automated emails with extracted data and PDF attachments to customers or stakeholders.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* User Permissions */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-pink-100 p-2 rounded-lg">
                  <Users className="h-6 w-6 text-pink-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">User Management & Permissions</h3>
              </div>
              <div className="bg-pink-50 border border-pink-200 rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-pink-800 mb-3">User Types:</h4>
                    <ul className="text-pink-700 text-sm space-y-1">
                      <li>• <strong>Administrator:</strong> Full access to all settings and features</li>
                      <li>• <strong>Regular User:</strong> Access only to extraction features by default</li>
                      <li>• <strong>Custom Permissions:</strong> Granular control over specific settings sections</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-pink-800 mb-3">Permission Categories:</h4>
                    <ul className="text-pink-700 text-sm space-y-1">
                      <li>• Extraction Types, SFTP, API Settings</li>
                      <li>• Email Monitoring, Rules, Processed Emails</li>
                      <li>• Extraction Logs, User Management</li>
                      <li>• Workflow Management</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Troubleshooting */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-red-100 p-2 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Troubleshooting</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h4 className="font-semibold text-red-800 mb-3">Common Issues & Solutions</h4>
                  <div className="space-y-4">
                    <div>
                      <h5 className="font-medium text-red-800">AI Extraction Fails:</h5>
                      <ul className="text-red-700 text-sm space-y-1 ml-4">
                        <li>• Check that your Google Gemini API key is configured in API Settings</li>
                        <li>• Ensure your extraction instructions are clear and specific</li>
                        <li>• Verify the PDF is not corrupted or password-protected</li>
                        <li>• Try simplifying your extraction template</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-red-800">SFTP Upload Fails:</h5>
                      <ul className="text-red-700 text-sm space-y-1 ml-4">
                        <li>• Test your SFTP connection in SFTP Settings</li>
                        <li>• Verify server credentials and paths are correct</li>
                        <li>• Check that the remote directories exist and are writable</li>
                        <li>• Ensure firewall allows connections on the specified port</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-red-800">API Calls Fail:</h5>
                      <ul className="text-red-700 text-sm space-y-1 ml-4">
                        <li>• Test your API connection using the "Test TruckMate API" button</li>
                        <li>• Verify the API endpoint URL and authentication token</li>
                        <li>• Check that your JSON template matches the API's expected format</li>
                        <li>• Review API error details in the extraction logs</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-red-800">Email Monitoring Issues:</h5>
                      <ul className="text-red-700 text-sm space-y-1 ml-4">
                        <li>• Test your email connection before enabling monitoring</li>
                        <li>• Ensure your app has proper permissions (Mail.Read for Office 365)</li>
                        <li>• Check that processing rules are enabled and properly configured</li>
                        <li>• Verify the monitored email address is correct</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Best Practices */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Best Practices</h3>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-green-800 mb-3">Extraction Instructions:</h4>
                    <ul className="text-green-700 text-sm space-y-1">
                      <li>• Be specific about what data to extract</li>
                      <li>• Mention field locations when possible</li>
                      <li>• Include data format requirements (dates, numbers)</li>
                      <li>• Test with sample PDFs before deploying</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-800 mb-3">Template Design:</h4>
                    <ul className="text-green-700 text-sm space-y-1">
                      <li>• Keep templates simple and focused</li>
                      <li>• Use consistent field naming conventions</li>
                      <li>• Include all required fields for your downstream systems</li>
                      <li>• Test JSON syntax before saving</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-6">
                  <h4 className="font-semibold text-green-800 mb-3">Security & Performance:</h4>
                  <ul className="text-green-700 text-sm space-y-1">
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
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Copy className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Tools & Features</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">Interactive PDF Mapping</h4>
                  <p className="text-blue-700 text-sm mb-2">
                    Use the Mapping tool to visually select fields on your PDF and get exact coordinates for field mappings.
                  </p>
                  <ul className="text-blue-700 text-sm space-y-1">
                    <li>• Click and drag to select field areas</li>
                    <li>• Label each selection for easy identification</li>
                    <li>• Copy coordinates for use in extraction instructions</li>
                  </ul>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h4 className="font-semibold text-indigo-800 mb-2">Extraction Logs</h4>
                  <p className="text-indigo-700 text-sm mb-2">
                    Monitor all extraction activities, view success/failure rates, and troubleshoot issues.
                  </p>
                  <ul className="text-indigo-700 text-sm space-y-1">
                    <li>• Filter by status, user, type, or date range</li>
                    <li>• View extracted data and API responses</li>
                    <li>• Copy data for testing or debugging</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* API Keys & Configuration */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-yellow-100 p-2 rounded-lg">
                  <Key className="h-6 w-6 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">API Keys & Configuration</h3>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-yellow-800 mb-2">Google Gemini API Key</h4>
                    <p className="text-yellow-700 text-sm mb-2">
                      Required for AI-powered PDF data extraction. Get your key from Google AI Studio.
                    </p>
                    <a 
                      href="https://makersuite.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-yellow-800 hover:text-yellow-900 underline text-sm font-medium"
                    >
                      → Get Google Gemini API Key
                    </a>
                  </div>
                  <div>
                    <h4 className="font-semibold text-yellow-800 mb-2">API Endpoint Configuration</h4>
                    <p className="text-yellow-700 text-sm">
                      For JSON extraction types, configure your API base URL and authentication token. 
                      The system will combine this with the JSON Path from each extraction type to form the complete endpoint URL.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Support */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <Mail className="h-6 w-6 text-gray-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Support & Resources</h3>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-3">Getting Help:</h4>
                    <ul className="text-gray-700 text-sm space-y-1">
                      <li>• Check the Extraction Logs for detailed error messages</li>
                      <li>• Use the test buttons in settings to verify configurations</li>
                      <li>• Start with simple extraction types before creating complex ones</li>
                      <li>• Review the AI's extracted data before sending to production systems</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-3">Tips for Success:</h4>
                    <ul className="text-gray-700 text-sm space-y-1">
                      <li>• Use clear, descriptive names for extraction types</li>
                      <li>• Test extraction types with various PDF samples</li>
                      <li>• Keep extraction instructions concise but detailed</li>
                      <li>• Regularly backup your extraction type configurations</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Email Actions in Workflows */}
            <section>
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-pink-100 p-2 rounded-lg">
                  <Mail className="h-6 w-6 text-pink-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Email Actions in Workflows</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-6">
                  <h4 className="font-semibold text-pink-800 mb-3">What are Email Actions?</h4>
                  <p className="text-pink-700 mb-4 text-sm">
                    Email Actions are workflow steps that automatically send emails with extracted data and PDF attachments. 
                    They're perfect for notifying customers, suppliers, or internal teams when documents are processed.
                  </p>
                  
                  <h5 className="font-semibold text-pink-800 mb-2">Common Use Cases:</h5>
                  <ul className="text-pink-700 space-y-1 text-sm">
                    <li>• <strong>Customer Notifications:</strong> Send invoices or receipts to customers automatically</li>
                    <li>• <strong>Supplier Communications:</strong> Forward purchase orders or delivery confirmations</li>
                    <li>• <strong>Internal Alerts:</strong> Notify accounting teams when new invoices are processed</li>
                    <li>• <strong>Document Delivery:</strong> Send renamed PDFs with proper filenames to recipients</li>
                  </ul>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">Setting Up Email Actions</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-blue-800 mb-2">Prerequisites:</h5>
                      <ol className="text-blue-700 space-y-1 list-decimal list-inside">
                        <li>Configure Email Monitoring in Settings (Office 365 or Gmail)</li>
                        <li>Create a workflow in Settings → Type Setup → Workflows</li>
                        <li>Add an Email Action step to your workflow</li>
                        <li>Assign the workflow to an extraction type</li>
                      </ol>
                    </div>
                    <div>
                      <h5 className="font-medium text-blue-800 mb-2">Configuration Options:</h5>
                      <ul className="text-blue-700 space-y-1">
                        <li>• <strong>To/From:</strong> Email addresses (supports dynamic data)</li>
                        <li>• <strong>Subject/Body:</strong> Email content with placeholders</li>
                        <li>• <strong>Attachments:</strong> Include original or renamed PDF</li>
                        <li>• <strong>Templates:</strong> Use {`{{fieldName}}`} for extracted data</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 mb-2">Template Variables</h4>
                  <p className="text-green-700 text-sm mb-2">
                    Use template variables to insert extracted data into your emails. Simply wrap field names in double curly braces.
                  </p>
                  <div className="bg-white border border-green-300 rounded-lg p-3">
                    <p className="text-xs text-green-800 mb-1"><strong>Example:</strong></p>
                    <p className="text-xs text-green-800">Subject: Invoice {`{{invoiceNumber}}`} - Payment Due</p>
                    <p className="text-xs text-green-800">To: {`{{customerEmail}}`}</p>
                    <p className="text-xs text-green-800">Body: Dear {`{{customerName}}`}, your invoice for ${`{{totalAmount}}`} is ready.</p>
                  </div>
                </div>
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-800 mb-2">Workflow Examples</h4>
                  <div className="space-y-3 text-sm">
                    <div className="bg-white border border-amber-300 rounded-lg p-3">
                      <h5 className="font-medium text-amber-800 mb-1">Invoice Processing:</h5>
                      <p className="text-amber-700 text-xs">Extract → API Call → Rename PDF → Email Customer</p>
                    </div>
                    <div className="bg-white border border-amber-300 rounded-lg p-3">
                      <h5 className="font-medium text-amber-800 mb-1">Purchase Order:</h5>
                      <p className="text-amber-700 text-xs">Extract → Conditional Check → Email Manager/Supplier</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}