import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import GuestPaymentBrandingHeader, { parseCompanyBranding, parseGlobalBranding, type AppLogoBranding } from './GuestPaymentBrandingHeader';

type Bill = { bill_number: string; amount: number };
type StatusResponse = {
  status: 'pending' | 'paid' | 'failed' | string;
  guest_email: string;
  currency: string;
  total_amount: number;
  subtotal_amount?: number;
  surcharge_amount?: number;
  surcharge_percent?: number;
  bills: Bill[];
  receipt_sent: boolean;
  created_at: string;
  global_branding?: unknown;
  company_branding?: unknown;
};

export default function GuestPaymentSuccessPage({ companyBranding }: { companyBranding?: AppLogoBranding }) {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') ?? '';
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: StatusResponse | null }>({
    loading: true, error: null, data: null,
  });
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setState({ loading: false, error: 'Missing session information.', data: null });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-guest-payment-status', {
          body: { session_id: sessionId },
        });
        if (cancelled) return;
        if (error) {
          setState({ loading: false, error: error.message || 'Unable to load payment status.', data: null });
          return;
        }
        setState({ loading: false, error: null, data: data as StatusResponse });
        if ((data as StatusResponse)?.status === 'pending' && pollCount < 5) {
          setTimeout(() => setPollCount((c) => c + 1), 2000);
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: (e as Error).message, data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, pollCount]);

  const formatMoney = (n: number, ccy: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: (ccy || 'USD').toUpperCase() }).format(n);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-10">
        {state.data && (
          <GuestPaymentBrandingHeader
            global={parseGlobalBranding(state.data.global_branding)}
            company={parseCompanyBranding(state.data.company_branding)}
            appLogo={companyBranding}
            showHeaderText={false}
            adaptiveDark
            className="text-center mb-8 pb-6 border-b border-slate-200 dark:border-slate-700"
          />
        )}
        {state.loading ? (
          <div className="text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-slate-400" />
            <p className="mt-4 text-slate-500 dark:text-slate-400">Confirming your payment…</p>
          </div>
        ) : state.error ? (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">We couldn't load your receipt</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">{state.error}</p>
            <Link to="/guest-payment" className="inline-flex items-center px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors">
              Back to payment
            </Link>
          </div>
        ) : state.data && state.data.status === 'paid' ? (
          <>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Payment Received</h1>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                {state.data.receipt_sent
                  ? `A receipt has been emailed to ${state.data.guest_email}.`
                  : `Thank you. Your receipt will arrive at ${state.data.guest_email} shortly.`}
              </p>
            </div>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Bill</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {state.data.bills.map((b) => (
                    <tr key={b.bill_number}>
                      <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{b.bill_number}</td>
                      <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100">
                        {formatMoney(Number(b.amount), state.data!.currency)}
                      </td>
                    </tr>
                  ))}
                  {Number(state.data.surcharge_amount) > 0 && (
                    <>
                      <tr>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-300">Selected Payment</td>
                        <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100">
                          {formatMoney(Number(state.data.subtotal_amount), state.data.currency)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-300">Surcharge {Number(state.data.surcharge_percent)}%</td>
                        <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100">
                          {formatMoney(Number(state.data.surcharge_amount), state.data.currency)}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr className="bg-slate-50 dark:bg-slate-900/40 font-semibold">
                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">Total</td>
                    <td className="px-4 py-2 text-right text-slate-900 dark:text-slate-100">
                      {formatMoney(Number(state.data.total_amount), state.data.currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-center">
              <Link to="/guest-payment" className="inline-flex items-center px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors">
                Make another payment
              </Link>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Clock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">Payment is processing</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              This can take a few seconds. This page will refresh automatically.
            </p>
            <button
              onClick={() => setPollCount((c) => c + 1)}
              className="inline-flex items-center px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors"
            >
              Refresh now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
