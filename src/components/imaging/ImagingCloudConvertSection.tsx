import React, { useState } from 'react';
import { Cpu, Loader2, CheckCircle, XCircle, Shield, ShieldOff } from 'lucide-react';

interface ImagingCloudConvertSectionProps {
  isAdmin: boolean;
}

interface TestResult {
  success: boolean;
  configured?: boolean;
  error?: string;
  account?: {
    username: string;
    email: string;
    credits: number | null;
  };
  webhook?: {
    url: string;
    signing_secret_configured: boolean;
  };
}

export default function ImagingCloudConvertSection({ isAdmin }: ImagingCloudConvertSectionProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-cloudconvert`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || 'Failed to reach the test endpoint',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Cpu className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          CloudConvert Connection
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Test the CloudConvert API key and webhook configuration used for ePDF processing.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">API Connection Test</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Verifies the API key by calling CloudConvert's user endpoint.
            </p>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={testing || !isAdmin}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </button>
        </div>

        {result && (
          <div className="space-y-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            {result.success ? (
              <>
                <div className="flex items-start gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                      Connection Successful
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      The CloudConvert API key is valid and working.
                    </p>
                  </div>
                </div>

                {result.account && (
                  <div className="inline-block">
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">Credits</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                        {result.account.credits !== null ? result.account.credits.toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                )}

                {result.webhook && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Webhook Configuration</h4>

                    <div className="flex items-center gap-2 text-sm">
                      {result.webhook.signing_secret_configured ? (
                        <>
                          <Shield className="h-4 w-4 text-emerald-500" />
                          <span className="text-emerald-700 dark:text-emerald-400">Webhook signing secret is configured</span>
                        </>
                      ) : (
                        <>
                          <ShieldOff className="h-4 w-4 text-amber-500" />
                          <span className="text-amber-700 dark:text-amber-400">Webhook signing secret is not configured (recommended for security)</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    {result.configured === false ? 'API Key Not Configured' : 'Connection Failed'}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    {result.error}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
