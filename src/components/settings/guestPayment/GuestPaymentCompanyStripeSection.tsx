import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, KeyRound, Loader2, Pencil, Trash2, X } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';
import {
  getCompanyStripeSecretsStatus,
  saveCompanyStripeSecrets,
  type GuestPaymentCompany,
  type GuestPaymentStripeMode,
  type GuestPaymentStripeSecretField,
  type GuestPaymentStripeSecretsStatus,
} from '../../../services/guestPaymentConfigService';
import { LabeledInput } from './GuestPaymentEditors';

const SECRET_FIELDS: { key: GuestPaymentStripeSecretField; label: string; prefix: string }[] = [
  { key: 'live_secret_key', label: 'Live Secret Key', prefix: 'sk_live_' },
  { key: 'live_webhook_secret', label: 'Live Webhook Signing Secret', prefix: 'whsec_' },
  { key: 'test_secret_key', label: 'Test Secret Key', prefix: 'sk_test_' },
  { key: 'test_webhook_secret', label: 'Test Webhook Signing Secret', prefix: 'whsec_' },
];

type StripeFields = Pick<GuestPaymentCompany, 'stripe_mode' | 'stripe_publishable_key' | 'stripe_test_publishable_key'>;

export default function GuestPaymentCompanyStripeSection({
  companyId,
  value,
  onChange,
}: {
  companyId: string;
  value: StripeFields;
  onChange: <K extends keyof StripeFields>(key: K, v: StripeFields[K]) => void;
}) {
  const [secrets, setSecrets] = useState<GuestPaymentStripeSecretsStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<GuestPaymentStripeSecretField | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setSecrets(null);
    setLoadErr(null);
    getCompanyStripeSecretsStatus(companyId)
      .then((s) => { if (active) setSecrets(s); })
      .catch((e) => { if (active) setLoadErr(e instanceof Error ? e.message : 'Failed to load Stripe keys'); });
    return () => { active = false; };
  }, [companyId]);

  const isTest = value.stripe_mode === 'test';
  const activePk = (isTest ? value.stripe_test_publishable_key : value.stripe_publishable_key).trim();
  const pkMismatch = activePk.length > 0 && !activePk.startsWith(isTest ? 'pk_test_' : 'pk_live_');
  const activeSecretSet = secrets?.status[isTest ? 'test_secret_key' : 'live_secret_key']?.set === true;

  const startEdit = (key: GuestPaymentStripeSecretField) => {
    setEditing(key);
    setDraft('');
    setSaveErr(null);
  };

  const persist = async (key: GuestPaymentStripeSecretField, v: string) => {
    setSaving(true);
    setSaveErr(null);
    try {
      const next = await saveCompanyStripeSecrets(companyId, { [key]: v });
      setSecrets(next);
      setEditing(null);
      setDraft('');
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = async () => {
    if (!secrets?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(secrets.webhook_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Stripe</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Payments for guests routed to this company go to this company's Stripe account. Currency, redirect URLs and the
          line item name stay in the global Stripe Settings.
        </p>
      </div>

      <div
        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-xs ${
          isTest
            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
        }`}
      >
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            isTest
              ? 'bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
              : 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100'
          }`}
        >
          {isTest ? 'TEST MODE' : 'LIVE MODE'}
        </span>
        <span>
          {isTest
            ? 'No real charges. Guests see a test banner and can use Stripe test cards (e.g. 4242 4242 4242 4242).'
            : 'Real credit cards will be charged when guests complete checkout.'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Mode</span>
          <CustomDropdown
            value={value.stripe_mode}
            onChange={(v) => onChange('stripe_mode', (v === 'live' ? 'live' : 'test') as GuestPaymentStripeMode)}
            options={[
              { value: 'live', label: 'Live (real charges)' },
              { value: 'test', label: 'Test (no real charges)' },
            ]}
          />
        </div>
        <div className="hidden md:block" />
        <LabeledInput label="Live Publishable Key" value={value.stripe_publishable_key} onChange={(v) => onChange('stripe_publishable_key', v)} placeholder="pk_live_..." />
        <LabeledInput label="Test Publishable Key" value={value.stripe_test_publishable_key} onChange={(v) => onChange('stripe_test_publishable_key', v)} placeholder="pk_test_..." />
      </div>
      {pkMismatch && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          The {isTest ? 'test' : 'live'} publishable key should start with{' '}
          <code className="font-mono">{isTest ? 'pk_test_' : 'pk_live_'}</code>.
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Secret Keys</h4>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Stored securely on the server and never shown again after saving. Changes here save immediately. Only administrators can change them.
        </p>

        {loadErr && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {loadErr}
          </div>
        )}
        {!secrets && !loadErr && (
          <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</div>
        )}

        {secrets && (
          <>
            {!activeSecretSet && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  No {isTest ? 'Test' : 'Live'} Secret Key is set. Guests routed to this company cannot pay until it is added.
                </span>
              </div>
            )}
            <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {SECRET_FIELDS.map(({ key, label, prefix }) => {
                const st = secrets.status[key];
                const isEditing = editing === key;
                return (
                  <div key={key} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {st?.set ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> Set, ending in <span className="font-mono">{st.last4}</span>
                            </span>
                          ) : (
                            'Not set'
                          )}
                        </div>
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(key)}
                            title={`Edit ${label}`}
                            className="p-1.5 rounded-md text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {st?.set && (
                            <button
                              type="button"
                              onClick={() => persist(key, '')}
                              disabled={saving}
                              title={`Remove ${label}`}
                              className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="password"
                          autoComplete="off"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={`${prefix}...`}
                          className="flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => persist(key, draft)}
                          disabled={saving || !draft.trim()}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditing(null); setSaveErr(null); }}
                          className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {isEditing && saveErr && <div className="mt-1 text-[11px] text-red-600">{saveErr}</div>}
                  </div>
                );
              })}
            </div>
            {saveErr && !editing && <div className="text-[11px] text-red-600">{saveErr}</div>}

            <div>
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Webhook URL for this company</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs font-mono text-gray-800 dark:text-gray-200">
                  {secrets.webhook_url}
                </code>
                <button
                  type="button"
                  onClick={copyWebhook}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                In this company's Stripe dashboard (live and test), add a webhook endpoint with this URL for the events
                checkout.session.completed, checkout.session.expired and payment_intent.payment_failed, then paste its signing secret above.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
