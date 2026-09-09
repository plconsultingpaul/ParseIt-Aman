import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, X } from 'lucide-react';

export default function SsoCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [userNotFound, setUserNotFound] = useState(false);

  useEffect(() => {
    const ticket = searchParams.get('ticket');
    if (!ticket) {
      setError('No SSO ticket provided');
      return;
    }

    async function verifyTicket(ticket: string) {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/verify-sso-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({ ticket }),
        });

        const data = await response.json();

        if (response.status === 404) {
          setUserNotFound(true);
          return;
        }

        if (!response.ok || !data?.tokenHash) {
          setError(data?.error || 'SSO verification failed');
          return;
        }

        const { data: sessionData, error: otpError } = await supabase.auth.verifyOtp({
          token_hash: data.tokenHash,
          type: data.type || 'magiclink',
        });

        if (otpError) {
          setError(otpError.message);
          return;
        }

        if (sessionData?.session) {
          navigate('/', { replace: true });
        } else {
          setError('Failed to establish session');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'SSO verification failed');
      }
    }

    verifyTicket(ticket);
  }, [searchParams]);

  if (userNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center max-w-sm mx-4">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <X className="w-6 h-6 text-red-500 dark:text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Account Not Found</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Your account does not exist in this application. Please contact your administrator to get access.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center max-w-sm mx-4">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="text-red-600 dark:text-red-400 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">SSO Login Failed</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Logging you in...</p>
      </div>
    </div>
  );
}
