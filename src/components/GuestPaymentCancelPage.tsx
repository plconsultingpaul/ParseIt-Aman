import { useEffect, useState } from 'react';
import { XCircle, Search, ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import GuestPaymentBrandingHeader, {
  parseCompanyBranding,
  parseGlobalBranding,
  type AppLogoBranding,
  type GuestPaymentCompanyBrandingOverrides,
  type GuestPaymentGlobalBranding,
} from './GuestPaymentBrandingHeader';

export default function GuestPaymentCancelPage({ companyBranding }: { companyBranding?: AppLogoBranding }) {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') ?? '';
  const [brand, setBrand] = useState<{
    global: GuestPaymentGlobalBranding | null;
    company: GuestPaymentCompanyBrandingOverrides | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (sessionId) {
          const { data, error } = await supabase.functions.invoke('get-guest-payment-status', {
            body: { session_id: sessionId },
          });
          if (!cancelled && !error && data) {
            setBrand({
              global: parseGlobalBranding(data.global_branding),
              company: parseCompanyBranding(data.company_branding),
            });
            return;
          }
        }
        const { data, error } = await supabase.functions.invoke('get-guest-payment-config', { body: {} });
        if (!cancelled && !error && data) setBrand({ global: parseGlobalBranding(data), company: null });
      } catch {
        // Branding is decorative; the cancel message still renders without it.
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-10 text-center">
        {brand && (
          <GuestPaymentBrandingHeader
            global={brand.global}
            company={brand.company}
            appLogo={companyBranding}
            showHeaderText={false}
            adaptiveDark
            className="text-center mb-8 pb-6 border-b border-slate-200 dark:border-slate-700"
          />
        )}
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
          <XCircle className="h-8 w-8 text-amber-500 dark:text-amber-300" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-3">
          Payment Cancelled
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-2">
          No charge was made to your card.
        </p>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          You can safely try again — nothing was processed.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/guest-payment"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors"
          >
            <Search className="h-4 w-4" />
            Start another search
          </Link>
          <Link
            to="/guest-payment"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 font-semibold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to payment
          </Link>
        </div>
      </div>
    </div>
  );
}
