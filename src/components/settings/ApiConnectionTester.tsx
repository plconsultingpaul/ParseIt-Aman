import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, Loader, Clock, AlertTriangle } from 'lucide-react';
import JsonViewer from '../common/JsonViewer';
import StatusBadge from '../common/StatusBadge';

interface ApiConnectionTesterProps {
  apiEndpoint: string;
  httpMethod: string;
  authType: string;
  authValue: string;
  fields: any[];
}

interface TestResult {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  response?: any;
  error?: string;
  errorType?: string;
}

export default function ApiConnectionTester({
  apiEndpoint,
  httpMethod,
  authType,
  authValue,
  fields
}: ApiConnectionTesterProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [samplePayload, setSamplePayload] = useState<any>(null);

  const generateSamplePayload = () => {
    const payload: Record<string, any> = {};

    fields.forEach((field) => {
      let value;
      switch (field.fieldType) {
        case 'text':
          value = field.defaultValue || `Sample ${field.fieldLabel || field.fieldName}`;
          break;
        case 'number':
          value = field.defaultValue || 100;
          break;
        case 'date':
          value = field.defaultValue || new Date().toISOString().split('T')[0];
          break;
        case 'datetime':
          value = field.defaultValue || new Date().toISOString().slice(0, 16);
          break;
        case 'phone':
          value = field.defaultValue || '555-123-4567';
          break;
        case 'boolean':
          value = field.defaultValue !== undefined ? field.defaultValue : true;
          break;
        case 'dropdown':
          value = field.options?.[0]?.value || field.defaultValue || 'option1';
          break;
        case 'file':
          value = [];
          break;
        default:
          value = field.defaultValue || '';
      }

      if (field.jsonPath) {
        const parts = field.jsonPath.split('.');
        let current = payload;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        payload[field.fieldName] = value;
      }
    });

    return payload;
  };

  const testConnection = async () => {
    if (!apiEndpoint) {
      setTestResult({
        success: false,
        error: 'API endpoint is required',
        errorType: 'Configuration Error'
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setShowResponse(false);

    const payload = generateSamplePayload();
    setSamplePayload(payload);

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (authType && authValue) {
        switch (authType) {
          case 'bearer':
            headers['Authorization'] = `Bearer ${authValue}`;
            break;
          case 'basic':
            headers['Authorization'] = `Basic ${btoa(authValue)}`;
            break;
          case 'apikey':
            headers['X-API-Key'] = authValue;
            break;
        }
      }

      const options: RequestInit = {
        method: httpMethod || 'POST',
        headers
      };

      if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
        options.body = JSON.stringify(payload);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(apiEndpoint, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      let responseData;

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      setTestResult({
        success: response.ok,
        statusCode: response.status,
        responseTime,
        response: responseData
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      let errorType = 'Unknown Error';
      let errorMessage = error.message;

      if (error.name === 'AbortError') {
        errorType = 'Timeout Error';
        errorMessage = 'Request timed out after 30 seconds';
      } else if (error.message.includes('Failed to fetch')) {
        errorType = 'Network Error';
        errorMessage = 'Unable to connect to the API endpoint. Check the URL and network connection.';
      }

      setTestResult({
        success: false,
        responseTime,
        error: errorMessage,
        errorType
      });
    } finally {
      setTesting(false);
    }
  };

  const canTest = apiEndpoint && httpMethod;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          API Connection Test
        </h3>
        <button
          onClick={testConnection}
          disabled={!canTest || testing}
          className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? (
            <>
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Testing Connection...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Test Connection
            </>
          )}
        </button>
      </div>

      {!canTest && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                Configuration Required
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Please configure the API endpoint and HTTP method before testing the connection.
              </p>
            </div>
          </div>
        </div>
      )}

      {testResult && (
        <div className={`rounded-lg border p-6 ${
          testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-start space-x-4">
            {testResult.success ? (
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <div className="flex-1 space-y-3">
              <div>
                <h4 className={`text-lg font-semibold mb-1 ${
                  testResult.success
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                }`}>
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </h4>
                {testResult.errorType && (
                  <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                    {testResult.errorType}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {testResult.statusCode && (
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status Code</p>
                    <StatusBadge status={String(testResult.statusCode)} type="api" size="md" />
                  </div>
                )}
                {testResult.responseTime && (
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Response Time</p>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {testResult.responseTime}ms
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {testResult.error && (
                <div className="bg-white dark:bg-gray-900/50 rounded p-3 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {testResult.error}
                  </p>
                </div>
              )}

              {testResult.response && (
                <div>
                  <button
                    onClick={() => setShowResponse(!showResponse)}
                    className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                  >
                    {showResponse ? 'Hide' : 'Show'} Response
                  </button>
                  {showResponse && (
                    <div className="mt-3">
                      <JsonViewer data={testResult.response} name="response" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {samplePayload && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Sample Request Payload
          </h4>
          <JsonViewer data={samplePayload} name="request_payload" />
        </div>
      )}
    </div>
  );
}
