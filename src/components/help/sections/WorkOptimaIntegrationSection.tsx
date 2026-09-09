import React from 'react';
import { Image } from 'lucide-react';
import SectionCard from '../shared/SectionCard';
import SectionHeader from '../shared/SectionHeader';

export default function WorkOptimaIntegrationSection() {
  return (
    <SectionCard>
      <SectionHeader
        icon={Image}
        title="WorkOptima Imaging Integration"
        iconBgColor="bg-teal-100"
        iconColor="text-teal-600"
      />
      <div className="space-y-6">
        {/* Overview */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
          <h3 className="font-semibold text-teal-800 mb-3">Overview</h3>
          <p className="text-teal-700 mb-3">
            Parse-It can send extracted documents and metadata directly to WorkOptima's imaging system.
            This integration uses a V2 Workflow with three steps: an API Call to authenticate with
            WorkOptima, followed by a Multipart Form Upload to send your files, and an optional
            Imaging step if you also store documents in Parse-It's built-in imaging module.
          </p>
          <p className="text-teal-700">
            Before you begin, make sure you have your WorkOptima API credentials (base URL, username,
            and password) and know which WorkOptima document queue and metadata fields you need to target.
          </p>
        </div>

        {/* Step 1 – API Authentication */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-800 mb-4 flex items-center">
            <span className="bg-blue-200 text-blue-800 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold mr-3 shrink-0">1</span>
            Set Up API Authentication
          </h3>
          <div className="text-blue-700 space-y-4">
            <p>
              WorkOptima uses token-based authentication. You need to configure an Auth Config so
              Parse-It can log in and retrieve a session token before each upload.
            </p>
            <div className="bg-white/60 border border-blue-100 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">Navigate to Settings &rarr; API Authentication</h4>
              <ol className="space-y-2 list-decimal list-inside">
                <li>Click <strong>Add New Config</strong></li>
                <li>Enter a name (e.g. "WorkOptima Production")</li>
                <li>
                  Set the <strong>Login Endpoint</strong> to your WorkOptima login URL
                  <br />
                  <span className="text-xs text-blue-600 font-mono ml-4">Example: https://your-company.workoptima.com/api/auth/login</span>
                </li>
                <li>Enter your <strong>Username</strong> and <strong>Password</strong></li>
                <li>
                  Set the <strong>Token Field Name</strong> to the path where the token appears in WorkOptima's login response.
                  <br />
                  <span className="text-xs text-blue-600 ml-4">
                    If the response looks like <code className="bg-blue-100 px-1 rounded">{'{ "token": { "access_token": "abc123" } }'}</code>,
                    enter <strong>token.access_token</strong>
                  </span>
                  <br />
                  <span className="text-xs text-blue-600 ml-4">
                    If the token is at the top level like <code className="bg-blue-100 px-1 rounded">{'{ "access_token": "abc123" }'}</code>,
                    just enter <strong>access_token</strong>
                  </span>
                </li>
                <li>Optionally set a <strong>Ping Endpoint</strong> for connection testing</li>
                <li>Click <strong>Save</strong>, then use <strong>Test Connection</strong> to verify it works</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Step 2 – V2 Workflow: API Call step */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
          <h3 className="font-semibold text-emerald-800 mb-4 flex items-center">
            <span className="bg-emerald-200 text-emerald-800 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold mr-3 shrink-0">2</span>
            Create the V2 Workflow &mdash; Authentication Step
          </h3>
          <div className="text-emerald-700 space-y-4">
            <p>
              In the Workflow V2 designer, create a new workflow (or edit an existing one) and add
              an <strong>API Call</strong> step as the first step after the Start node.
            </p>
            <div className="bg-white/60 border border-emerald-100 rounded-lg p-4">
              <h4 className="font-medium text-emerald-800 mb-2">API Call Step Configuration</h4>
              <ul className="space-y-2">
                <li>
                  <strong>URL:</strong> Your WorkOptima login endpoint
                  <br />
                  <span className="text-xs text-emerald-600 font-mono ml-4">Example: https://your-company.workoptima.com/api/auth/login</span>
                </li>
                <li><strong>Method:</strong> POST</li>
                <li>
                  <strong>Headers:</strong>
                  <br />
                  <code className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded block mt-1 ml-4 font-mono whitespace-pre">
                    {'{ "Content-Type": "application/json" }'}
                  </code>
                </li>
                <li>
                  <strong>Request Body:</strong>
                  <br />
                  <code className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded block mt-1 ml-4 font-mono whitespace-pre">
                    {'{ "username": "your_user", "password": "your_pass" }'}
                  </code>
                </li>
              </ul>
              <p className="text-xs text-emerald-600 mt-3">
                The response from this step (including the token) will be available as
                variables in subsequent steps using the <code className="bg-emerald-100 px-1 rounded">{'{{variable}}'}</code> syntax.
              </p>
            </div>
          </div>
        </div>

        {/* Step 3 – V2 Workflow: Multipart Upload step */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h3 className="font-semibold text-amber-800 mb-4 flex items-center">
            <span className="bg-amber-200 text-amber-800 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold mr-3 shrink-0">3</span>
            Add the Multipart Form Upload Step
          </h3>
          <div className="text-amber-700 space-y-4">
            <p>
              Connect a <strong>Multipart Form Upload</strong> step after the API Call step.
              This is the step that actually sends the document to WorkOptima.
            </p>
            <div className="bg-white/60 border border-amber-100 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">Multipart Step Configuration</h4>
              <ul className="space-y-3">
                <li>
                  <strong>API Source:</strong> Select "Auth Config" and choose the Auth Config you created in Step 1.
                  This will automatically handle login and token retrieval.
                </li>
                <li>
                  <strong>Upload URL:</strong> The WorkOptima document upload endpoint
                  <br />
                  <span className="text-xs text-amber-600 font-mono ml-4">Example: https://your-company.workoptima.com/api/documents/upload</span>
                </li>
              </ul>
            </div>

            <div className="bg-white/60 border border-amber-100 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">Custom Headers</h4>
              <p className="mb-2">
                Use the <strong>Custom Headers</strong> section to pass the authentication token
                from the login step. Click "Add Header" and configure:
              </p>
              <div className="bg-amber-100/50 rounded p-3 space-y-1">
                <div className="flex items-center space-x-3 text-sm">
                  <span className="font-medium w-28 shrink-0">Header Name:</span>
                  <code className="bg-white px-2 py-0.5 rounded text-amber-800 font-mono">Access-Token</code>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <span className="font-medium w-28 shrink-0">Header Value:</span>
                  <code className="bg-white px-2 py-0.5 rounded text-amber-800 font-mono">{'{{response.token.access_token}}'}</code>
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-2">
                The exact header name and token path depend on your WorkOptima environment.
                Check your WorkOptima API documentation for the correct values.
              </p>
            </div>

            <div className="bg-white/60 border border-amber-100 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">Form Parts</h4>
              <p className="mb-2">Configure the form parts that WorkOptima expects:</p>
              <ul className="space-y-2">
                <li>
                  <strong>File Part:</strong> Set the type to "File (from extracted data)" and
                  choose the variable that holds the PDF file from the extraction step.
                </li>
                <li>
                  <strong>Metadata Parts:</strong> Add text parts for each metadata field
                  WorkOptima requires (e.g. document type, reference number, date).
                  Use field mappings with the "Variable" type to pull values from your extracted data.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 4 – Optional: Imaging step */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
            <span className="bg-gray-200 text-gray-800 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold mr-3 shrink-0">4</span>
            Optional: Add an Imaging Step
          </h3>
          <div className="text-gray-700 space-y-3">
            <p>
              If you also want to store the document in Parse-It's built-in imaging module alongside
              WorkOptima, add an <strong>Imaging</strong> step after the Multipart Upload step. This
              gives your team a local copy with searchable metadata.
            </p>
            <p>
              The Imaging step uses the buckets, document types, and metadata fields configured in
              <strong> Settings &rarr; Imaging</strong>. Map extracted data to imaging metadata fields
              using variable references.
            </p>
          </div>
        </div>

        {/* Workflow Diagram */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Complete Workflow Flow</h3>
          <div className="flex items-center justify-center flex-wrap gap-3 text-sm">
            <div className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium">Start</div>
            <span className="text-slate-400 text-lg">&rarr;</span>
            <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-medium">API Call (Login)</div>
            <span className="text-slate-400 text-lg">&rarr;</span>
            <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-lg font-medium">Multipart Upload</div>
            <span className="text-slate-400 text-lg">&rarr;</span>
            <div className="bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-medium border border-dashed border-gray-400">Imaging (Optional)</div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="font-semibold text-red-800 mb-4">Troubleshooting</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-red-800 mb-1">"Login response missing token field"</h4>
              <p className="text-red-700 text-sm">
                The Token Field Name in your Auth Config does not match the actual response from
                WorkOptima. Check the login response structure and update the field name.
                Remember that nested paths are supported (e.g. <code className="bg-red-100 px-1 rounded">token.access_token</code>).
                Use the <strong>Test Connection</strong> button to verify.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-red-800 mb-1">"Authentication login failed: 401"</h4>
              <p className="text-red-700 text-sm">
                Your WorkOptima username or password is incorrect, or the login endpoint URL is wrong.
                Double-check your credentials and endpoint.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-red-800 mb-1">Upload returns 403 or "Access Denied"</h4>
              <p className="text-red-700 text-sm">
                The authentication token is not being sent correctly in the upload request. Verify
                that the Custom Headers on the Multipart Upload step have the correct header name
                (check your WorkOptima docs) and that the variable path matches the login response
                structure.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-red-800 mb-1">Document uploads but metadata is missing</h4>
              <p className="text-red-700 text-sm">
                Check that each metadata field in the Form Parts section has the correct field name
                (must match what WorkOptima expects) and that the field mappings are pointing to
                valid variables from your extraction data.
              </p>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-6">
          <h3 className="font-semibold text-cyan-800 mb-3">Tips</h3>
          <ul className="text-cyan-700 space-y-2">
            <li>
              <strong>Test incrementally:</strong> First get the authentication step working with
              Test Connection, then add the upload step. This makes it easier to isolate issues.
            </li>
            <li>
              <strong>Check execution logs:</strong> When a workflow runs, each step logs its input
              and output data. Go to <strong>Settings &rarr; Workflow V2 Execution Logs</strong> to
              inspect what was sent and what came back.
            </li>
            <li>
              <strong>Variable syntax:</strong> Use <code className="bg-cyan-100 px-1 rounded">{'{{response.field_name}}'}</code> to
              reference data from the previous step's response. This works in the upload URL,
              custom header values, and form part field mappings.
            </li>
            <li>
              <strong>Multiple environments:</strong> Create separate Auth Configs for
              staging vs. production WorkOptima environments. Then swap the Auth Config on the
              Multipart Upload step when you are ready to go live.
            </li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
