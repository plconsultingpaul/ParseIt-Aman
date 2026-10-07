import React, { useState, useEffect, useMemo } from 'react';
import { Play, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import Modal from '../../common/Modal';
import { supabase } from '../../../lib/supabase';
import { scanPlaceholders } from '../../../lib/workflowV2PlaceholderScanner';

interface V2ApiEndpointTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: any;
  stepId?: string;
}

interface TestResult {
  success: boolean;
  message?: string;
  apiSourceType?: string;
  resolvedRequestDetails?: any;
  resolvedRequestBody?: string;
  responseData?: any;
  stepOutput?: any;
  extractedValues?: Array<{ responsePath: string; updatePath: string; value: any; usedDefault: boolean }>;
}

export default function V2ApiEndpointTestModal({
  isOpen,
  onClose,
  config,
  stepId,
}: V2ApiEndpointTestModalProps) {
  const isAuthConfig = (config?.apiSourceType || 'main') === 'auth_config';
  const placeholders = useMemo(
    () => (isAuthConfig ? [] : scanPlaceholders(config)),
    [config, isAuthConfig]
  );

  const [phase, setPhase] = useState<'prompt' | 'running' | 'result'>(
    isAuthConfig || placeholders.length === 0 ? 'running' : 'prompt'
  );
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(true);
  const [showResponse, setShowResponse] = useState(true);
  const [showExtracted, setShowExtracted] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    setError(null);
    setShowRequest(true);
    setShowResponse(true);
    setShowExtracted(true);
    const startPhase: 'prompt' | 'running' = isAuthConfig || placeholders.length === 0 ? 'running' : 'prompt';
    setPhase(startPhase);

    (async () => {
      if (startPhase === 'prompt' && stepId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('workflow_v2_step_test_inputs')
          .select('inputs')
          .eq('user_id', user.id)
          .eq('step_id', stepId)
          .maybeSingle();
        if (data?.inputs && typeof data.inputs === 'object') {
          const filtered: Record<string, string> = {};
          for (const p of placeholders) {
            if (typeof (data.inputs as any)[p] === 'string') filtered[p] = (data.inputs as any)[p];
          }
          setInputs(filtered);
        }
      }
      if (startPhase === 'running') {
        void runTest({});
      }
    })();
  }, [isOpen]);

  const runTest = async (overrides: Record<string, string>) => {
    setPhase('running');
    setError(null);
    setResult(null);
    try {
      if (stepId && Object.keys(overrides).length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('workflow_v2_step_test_inputs')
            .upsert({
              user_id: user.id,
              step_id: stepId,
              inputs: overrides,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,step_id' });
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-workflow-v2-api-endpoint`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ stepConfig: config, variableOverrides: overrides }),
      });
      const json = await resp.json();
      setResult(json);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
      setPhase('result');
    }
  };

  const renderPrompt = () => (
    <div className="p-6 space-y-4">
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          This step references {placeholders.length} variable{placeholders.length === 1 ? '' : 's'}. Enter values to substitute before running the test. Values are saved for next time.
        </p>
      </div>
      <div className="space-y-3">
        {placeholders.map((name) => (
          <div key={name}>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 font-mono">
              {`{{${name}}}`}
            </label>
            <input
              type="text"
              value={inputs[name] || ''}
              onChange={(e) => setInputs((prev) => ({ ...prev, [name]: e.target.value }))}
              placeholder={`Value for ${name}`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end space-x-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={() => runTest(inputs)}
          className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center space-x-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Run Test</span>
        </button>
      </div>
    </div>
  );

  const renderRunning = () => (
    <div className="p-10 flex flex-col items-center justify-center space-y-3">
      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {isAuthConfig ? 'Calling Auth Config login...' : 'Sending test request...'}
      </p>
    </div>
  );

  const prettyJson = (v: any) => {
    try {
      return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  const renderResult = () => {
    if (error) {
      return (
        <div className="p-6">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-900 dark:text-red-100">
            <div className="flex items-center space-x-2 mb-1">
              <XCircle className="w-4 h-4" />
              <span className="font-medium">Request failed</span>
            </div>
            <p className="font-mono text-xs">{error}</p>
          </div>
        </div>
      );
    }
    if (!result) return null;
    const ok = result.success;
    return (
      <div className="p-6 space-y-3 overflow-y-auto max-h-[70vh]">
        <div className={`p-3 border rounded-lg text-sm flex items-center space-x-2 ${
          ok
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
        }`}>
          {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span className="font-medium">
            {ok ? (isAuthConfig ? 'Auth Config login succeeded' : 'Test completed') : (result.message || 'Test failed')}
          </span>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => setShowRequest((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
          >
            <span>Resolved Request</span>
            {showRequest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showRequest && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <pre className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-all overflow-x-auto">
{prettyJson(result.resolvedRequestDetails)}
              </pre>
              {result.resolvedRequestBody && (
                <>
                  <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Request Body</div>
                  <pre className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-all overflow-x-auto">
{result.resolvedRequestBody}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => setShowResponse((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
          >
            <span>{isAuthConfig ? 'Auth Login Response' : 'Response'}</span>
            {showResponse ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showResponse && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <pre className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-all overflow-x-auto max-h-96">
{prettyJson(result.responseData)}
              </pre>
            </div>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => setShowExtracted((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
          >
            <span>Response Data Mappings</span>
            {showExtracted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showExtracted && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              {(!result.extractedValues || result.extractedValues.length === 0) ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">No Response Data Mappings configured.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">From (path)</th>
                      <th className="py-1.5 pr-3 font-medium">To (context)</th>
                      <th className="py-1.5 pr-3 font-medium">Value</th>
                      <th className="py-1.5 font-medium">Default?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.extractedValues.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                        <td className="py-1.5 pr-3 font-mono text-gray-900 dark:text-gray-100">{row.responsePath}</td>
                        <td className="py-1.5 pr-3 font-mono text-gray-900 dark:text-gray-100">{row.updatePath}</td>
                        <td className="py-1.5 pr-3 font-mono text-gray-900 dark:text-gray-100 break-all">{row.value === null || row.value === undefined ? <span className="text-gray-400 italic">null</span> : typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value)}</td>
                        <td className="py-1.5">{row.usedDefault ? <span className="text-amber-700 dark:text-amber-300">yes</span> : <span className="text-gray-400">no</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-1">
          {placeholders.length > 0 && !isAuthConfig ? (
            <button
              onClick={() => setPhase('prompt')}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Change Inputs
            </button>
          ) : <span />}
          <div className="space-x-2">
            <button
              onClick={() => runTest(inputs)}
              className="px-4 py-2 text-sm rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 inline-flex items-center space-x-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Again</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-white hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Test API Endpoint" zIndex={70}>
      {phase === 'prompt' && renderPrompt()}
      {phase === 'running' && renderRunning()}
      {phase === 'result' && renderResult()}
    </Modal>
  );
}
