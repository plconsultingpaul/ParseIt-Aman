import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Save, CreditCard, Search, LayoutGrid, ListChecks, RefreshCw, X, Building2, Route } from 'lucide-react';
import CustomDropdown from '../common/CustomDropdown';
import { supabase } from '../../lib/supabase';
import {
  getOrCreateGuestPaymentConfig,
  saveGuestPaymentConfig,
  type GuestPaymentConfig,
  type GuestPaymentSearchBox,
} from '../../services/guestPaymentConfigService';
import GuestPaymentCompaniesSection from './guestPayment/GuestPaymentCompaniesSection';
import {
  HEADER_SIZE_OPTIONS,
  LabeledInput,
  LabeledTextarea,
  LOGO_SIZE_OPTIONS,
  SUB_HEADER_SIZE_OPTIONS,
} from './guestPayment/GuestPaymentEditors';

const CURRENCY_OPTIONS = [
  { value: 'usd', label: 'USD - US Dollar' },
  { value: 'cad', label: 'CAD - Canadian Dollar' },
  { value: 'eur', label: 'EUR - Euro' },
  { value: 'gbp', label: 'GBP - British Pound' },
  { value: 'mxn', label: 'MXN - Mexican Peso' },
];

type TopSection = 'global' | 'companies' | 'transactions';
type GlobalSubSection = 'branding' | 'search' | 'routing' | 'stripe';

const TOP_SECTIONS: { key: TopSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'global', label: 'Global Settings', icon: LayoutGrid },
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'transactions', label: 'Transactions', icon: ListChecks },
];

const GLOBAL_SUBS: { key: GlobalSubSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'branding', label: 'Branding', icon: LayoutGrid },
  { key: 'search', label: 'Search Boxes', icon: Search },
  { key: 'routing', label: 'Routing', icon: Route },
  { key: 'stripe', label: 'Stripe Settings', icon: CreditCard },
];

export default function GuestPaymentSettings() {
  const [config, setConfig] = useState<GuestPaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [section, setSection] = useState<TopSection>('global');
  const [globalSub, setGlobalSub] = useState<GlobalSubSection>('branding');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const cfg = await getOrCreateGuestPaymentConfig();
        if (!cancelled) setConfig(cfg);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = <K extends keyof GuestPaymentConfig>(key: K, value: GuestPaymentConfig[K]) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const saved = await saveGuestPaymentConfig(config);
      setConfig(saved);
      setSuccess('Guest Payment settings saved.');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
        Loading Guest Payment configuration...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-16 text-red-600 dark:text-red-400 text-sm">
        {error ?? 'Configuration unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Guest Payment</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Global branding, search fields, and Stripe are shared across all companies. Per-company APIs and receipts live under each company.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {success && <span className="text-sm text-emerald-600 dark:text-emerald-400">{success}</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          {section === 'global' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Global Settings'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
        {TOP_SECTIONS.map(({ key, label, icon: Icon }) => {
          const active = section === key;
          return (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {section === 'global' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
            {GLOBAL_SUBS.map(({ key, label, icon: Icon }) => {
              const active = globalSub === key;
              return (
                <button
                  key={key}
                  onClick={() => setGlobalSub(key)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
            {globalSub === 'branding' && <BrandingSection config={config} update={update} />}
            {globalSub === 'search' && (
              <SearchBoxesSection value={config.search_boxes} onChange={(v) => update('search_boxes', v)} />
            )}
            {globalSub === 'routing' && <RoutingSection config={config} update={update} />}
            {globalSub === 'stripe' && <StripeSection config={config} update={update} />}
          </div>
        </div>
      )}

      {section === 'companies' && (
        <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <GuestPaymentCompaniesSection />
        </div>
      )}

      {section === 'transactions' && (
        <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <TransactionLogSection />
        </div>
      )}
    </div>
  );
}

function BrandingSection({
  config,
  update,
}: {
  config: GuestPaymentConfig;
  update: <K extends keyof GuestPaymentConfig>(key: K, value: GuestPaymentConfig[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Branding</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Used when a company has no branding of its own, and before a guest's search identifies their company.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <label className="md:col-span-2 flex items-center gap-3">
          <input
            type="checkbox"
            checked={config.use_company_logo}
            onChange={(e) => update('use_company_logo', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-200">Show company logo in the guest page header</span>
        </label>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Logo size</span>
          <CustomDropdown
            value={config.logo_size}
            onChange={(v) => update('logo_size', v)}
            options={LOGO_SIZE_OPTIONS}
            disabled={!config.use_company_logo}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <LabeledInput label="Header text" value={config.header_text} onChange={(v) => update('header_text', v)} placeholder="Make a Payment" />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Header size</span>
          <CustomDropdown value={config.header_size} onChange={(v) => update('header_size', v)} options={HEADER_SIZE_OPTIONS} />
        </div>
        <div className="md:col-span-2">
          <LabeledInput label="Sub-header text" value={config.sub_header_text} onChange={(v) => update('sub_header_text', v)} placeholder="Look up and pay your outstanding bills." />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Sub-header size</span>
          <CustomDropdown value={config.sub_header_size} onChange={(v) => update('sub_header_size', v)} options={SUB_HEADER_SIZE_OPTIONS} />
        </div>
        <div className="md:col-span-3">
          <LabeledInput label="Receipt note (below email field)" value={config.receipt_note_text} onChange={(v) => update('receipt_note_text', v)} placeholder="Leave blank to hide" />
        </div>
      </div>
    </div>
  );
}

function SearchBoxesSection({
  value,
  onChange,
}: {
  value: GuestPaymentSearchBox[];
  onChange: (v: GuestPaymentSearchBox[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<GuestPaymentSearchBox>({ key: '', label: '', placeholder: '', required: false, help_text: '' });

  const beginAdd = () => { setDraft({ key: '', label: '', placeholder: '', required: false, help_text: '' }); setEditing(value.length); };
  const beginEdit = (idx: number) => { setDraft({ help_text: '', ...value[idx] }); setEditing(idx); };
  const save = () => {
    if (editing === null) return;
    if (!draft.key.trim() || !draft.label.trim()) return;
    const next = [...value];
    next[editing] = draft;
    onChange(next);
    setEditing(null);
  };
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
    if (editing === idx) setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Search Boxes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Inputs shown to the guest above the search results.</p>
        </div>
        <button onClick={beginAdd} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium">
          <Plus className="h-3.5 w-3.5" /> Add Search Box
        </button>
      </div>

      <div className="space-y-2">
        {value.length === 0 && editing === null && (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic">No search boxes configured.</div>
        )}
        {value.map((box, idx) => (
          <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">{box.label}</span>
              <span className="text-gray-500 dark:text-gray-400 ml-2">({box.key})</span>
              {box.required && <span className="ml-2 text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400">Required</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => beginEdit(idx)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <Pencil className="h-3.5 w-3.5 text-gray-500" />
              </button>
              <button onClick={() => remove(idx)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40">
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <div className="p-4 bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-md space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput label="Key" value={draft.key} onChange={(v) => setDraft({ ...draft, key: v })} placeholder="customer_id" />
            <LabeledInput label="Label" value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} placeholder="Customer ID" />
            <LabeledInput label="Placeholder" value={draft.placeholder} onChange={(v) => setDraft({ ...draft, placeholder: v })} placeholder="Enter your Customer ID" />
            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">Required</span>
            </label>
          </div>
          <LabeledTextarea
            label="Help text (shown when the guest clicks the info icon)"
            value={draft.help_text ?? ''}
            onChange={(v) => setDraft({ ...draft, help_text: v })}
            placeholder="Explain what the guest should enter here, where to find it, or an example."
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 rounded-md text-xs bg-emerald-600 text-white">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoutingSection({
  config,
  update,
}: {
  config: GuestPaymentConfig;
  update: <K extends keyof GuestPaymentConfig>(key: K, value: GuestPaymentConfig[K]) => void;
}) {
  const options = useMemo(
    () => [
      { value: '', label: '— Not configured —' },
      ...config.search_boxes.map((s) => ({ value: s.key, label: `${s.label} (${s.key})` })),
    ],
    [config.search_boxes]
  );
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Routing</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pick which search box drives company routing. The value the guest enters here is matched against each company's Routing Rules
          (Companies → pick a company → Routing Rules). Matching is case-insensitive by default.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Routing search field</span>
          <CustomDropdown value={config.routing_search_box_key} onChange={(v) => update('routing_search_box_key', v)} options={options} />
        </div>
      </div>
      {!config.routing_search_box_key && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Until a routing field is set, requests will not be routed to any company and guests will see an error.
        </div>
      )}
    </div>
  );
}

function StripeSection({
  config,
  update,
}: {
  config: GuestPaymentConfig;
  update: <K extends keyof GuestPaymentConfig>(key: K, value: GuestPaymentConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Stripe Settings</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          These settings apply to every company. Each company's Stripe keys and Live/Test mode are set in Companies &rarr; Stripe.
          A company without Stripe keys cannot take payments.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Currency</span>
          <CustomDropdown value={config.stripe_currency} onChange={(v) => update('stripe_currency', v)} options={CURRENCY_OPTIONS} />
        </div>
        <div className="hidden md:block" />
        <LabeledInput label="Success Redirect URL" value={config.stripe_success_url} onChange={(v) => update('stripe_success_url', v)} placeholder="https://yourapp.com/guest-payment/success" />
        <LabeledInput label="Cancel Redirect URL" value={config.stripe_cancel_url} onChange={(v) => update('stripe_cancel_url', v)} placeholder="https://yourapp.com/guest-payment/cancel" />
      </div>
      <div>
        <LabeledInput
          label="Line Item Name Template"
          value={config.stripe_line_item_name_template}
          onChange={(v) => update('stripe_line_item_name_template', v)}
          placeholder="Freight Invoice {bill_number}"
        />
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          Shown on the Stripe checkout page for each selected bill. Supports <code>{'{bill_number}'}</code> and <code>{'{amount}'}</code>.
        </p>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Surcharge</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Adds a percentage on top of the selected payment. Calculated on the server and charged as a separate line item.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Surcharge</span>
            <CustomDropdown
              value={config.surcharge_enabled ? 'enabled' : 'disabled'}
              onChange={(v) => update('surcharge_enabled', v === 'enabled')}
              options={[
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ]}
            />
          </div>
          <LabeledInput
            label="Surcharge Percent (%)"
            value={String(config.surcharge_percent)}
            onChange={(v) => {
              const n = parseFloat(v);
              update('surcharge_percent', Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0);
            }}
            placeholder="3"
            type="number"
          />
          <LabeledInput
            label="Surcharge Label"
            value={config.surcharge_label}
            onChange={(v) => update('surcharge_label', v)}
            placeholder="Surcharge"
          />
        </div>
      </div>
    </div>
  );
}

type TransactionRow = {
  id: string;
  guest_email: string;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  selected_bills: Array<{ bill_number: string; amount: number; snapshot?: Record<string, unknown> }>;
  success_api_results: Array<Record<string, unknown>> | null;
  receipt_sent_at: string | null;
  subtotal_amount: number | null;
  surcharge_amount: number | null;
  surcharge_percent: number | null;
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
];

function formatMoney(n: number, ccy: string): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: (ccy || 'USD').toUpperCase() }).format(num);
}

function statusBadgeClass(status: string): string {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (status === 'failed') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function TransactionLogSection() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [billFilter, setBillFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    let q = supabase
      .from('guest_payment_transactions')
      .select('id, guest_email, total_amount, currency, status, created_at, stripe_session_id, stripe_payment_intent_id, selected_bills, success_api_results, receipt_sent_at, subtotal_amount, surcharge_amount, surcharge_percent')
      .order('created_at', { ascending: false })
      .limit(200);
    if (statusFilter) q = q.eq('status', statusFilter);
    if (emailFilter.trim()) q = q.ilike('guest_email', `%${emailFilter.trim()}%`);
    if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      q = q.lt('created_at', end.toISOString());
    }
    const { data, error } = await q;
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      let list = (data ?? []) as TransactionRow[];
      if (billFilter.trim()) {
        const needle = billFilter.trim().toLowerCase();
        list = list.filter((r) =>
          Array.isArray(r.selected_bills) &&
          r.selected_bills.some((b) => String(b.bill_number ?? '').toLowerCase().includes(needle))
        );
      }
      setRows(list);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleRetry = async (row: TransactionRow) => {
    setRetryingId(row.id);
    setRetryMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('retry-guest-payment-success-api', {
        body: { transaction_id: row.id, only_failed: true },
      });
      if (error) throw error;
      const results = ((data as { results?: Array<Record<string, unknown>> })?.results) ?? [];
      const failed = results.filter((r) => r.status !== 'ok').length;
      setRetryMessage(failed === 0 ? 'All Success API calls succeeded.' : `Retry finished. ${failed} still failing.`);
      await load();
      setSelected((prev) => (prev && prev.id === row.id ? { ...prev, success_api_results: results } : prev));
    } catch (e) {
      setRetryMessage(`Retry failed: ${(e as Error).message}`);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transactions</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Read-only log of guest payment attempts. Retry the Success API for paid transactions whose per-bill callbacks failed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Status</span>
          <CustomDropdown value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
        </div>
        <LabeledInput label="Email contains" value={emailFilter} onChange={setEmailFilter} placeholder="guest@example.com" />
        <LabeledInput label="Bill number" value={billFilter} onChange={setBillFilter} placeholder="INV-1234" />
        <LabeledInput label="From" value={dateFrom} onChange={setDateFrom} type="date" />
        <LabeledInput label="To" value={dateTo} onChange={setDateTo} type="date" />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
        >
          <Search className="h-3.5 w-3.5" /> Apply filters
        </button>
        <button
          onClick={() => { setStatusFilter(''); setEmailFilter(''); setBillFilter(''); setDateFrom(''); setDateTo(''); setTimeout(load, 0); }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium"
        >
          Reset
        </button>
        {retryMessage && <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{retryMessage}</span>}
      </div>

      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">Loading transactions...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No transactions match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Bills</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Callbacks</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r) => {
                  const bills = Array.isArray(r.selected_bills) ? r.selected_bills : [];
                  const results = Array.isArray(r.success_api_results) ? r.success_api_results : [];
                  const failed = results.filter((x) => x.status !== 'ok').length;
                  const callbackLabel = r.status === 'paid'
                    ? results.length === 0 ? 'Not called' : failed === 0 ? `${results.length} ok` : `${failed}/${results.length} failed`
                    : '—';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{r.guest_email}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{bills.map((b) => b.bill_number).join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">{formatMoney(r.total_amount, r.currency)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-semibold ${statusBadgeClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{callbackLabel}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setSelected(r)}
                            className="px-2 py-1 rounded text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                          >
                            Details
                          </button>
                          {r.status === 'paid' && (
                            <button
                              onClick={() => handleRetry(r)}
                              disabled={retryingId === r.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
                              title="Re-run failed per-bill Success API calls"
                            >
                              <RefreshCw className={`h-3 w-3 ${retryingId === r.id ? 'animate-spin' : ''}`} />
                              Retry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transaction details</h4>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-gray-700 dark:text-gray-200">
              <div><span className="text-gray-500">Transaction ID:</span> <span className="font-mono text-xs">{selected.id}</span></div>
              <div><span className="text-gray-500">Guest email:</span> {selected.guest_email}</div>
              {Number(selected.surcharge_amount) > 0 && (
                <>
                  <div><span className="text-gray-500">Selected payment:</span> {formatMoney(Number(selected.subtotal_amount ?? 0), selected.currency)}</div>
                  <div><span className="text-gray-500">Surcharge {Number(selected.surcharge_percent ?? 0)}%:</span> {formatMoney(Number(selected.surcharge_amount), selected.currency)}</div>
                </>
              )}
              <div><span className="text-gray-500">Total:</span> {formatMoney(selected.total_amount, selected.currency)}</div>
              <div><span className="text-gray-500">Status:</span> {selected.status}</div>
              <div><span className="text-gray-500">Receipt sent:</span> {selected.receipt_sent_at ? `Yes (${new Date(selected.receipt_sent_at).toLocaleString()})` : 'No'}</div>
              <div><span className="text-gray-500">Stripe session:</span> <span className="font-mono text-xs break-all">{selected.stripe_session_id ?? '—'}</span></div>
              <div><span className="text-gray-500">Payment intent:</span> <span className="font-mono text-xs break-all">{selected.stripe_payment_intent_id ?? '—'}</span></div>
              <div>
                <div className="text-gray-500 mb-1">Bills:</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {(selected.selected_bills ?? []).map((b, i) => (
                    <li key={i}>{b.bill_number} — {formatMoney(b.amount, selected.currency)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Success API results:</div>
                {(!selected.success_api_results || selected.success_api_results.length === 0) ? (
                  <div className="italic text-gray-500">No calls recorded.</div>
                ) : (
                  <ul className="space-y-1 font-mono text-xs">
                    {selected.success_api_results.map((r, i) => (
                      <li key={i} className={r.status === 'ok' ? 'text-emerald-600' : 'text-red-600'}>
                        {String(r.bill_number ?? '?')} — {String(r.status ?? 'unknown')}{r.http_status != null ? ` (HTTP ${String(r.http_status)})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {selected.status === 'paid' && (
              <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => handleRetry(selected)}
                  disabled={retryingId === selected.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${retryingId === selected.id ? 'animate-spin' : ''}`} />
                  Retry Success API
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
