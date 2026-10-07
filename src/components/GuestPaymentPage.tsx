import { useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, Loader2, Search, AlertCircle, ArrowRight, Info, FileText, Download, X } from 'lucide-react';
import GuestPaymentBrandingHeader, { parseCompanyBranding, type GuestPaymentCompanyBrandingOverrides } from './GuestPaymentBrandingHeader';

interface SearchBox {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  help_text?: string;
}

function SearchBoxInfo({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle ml-1.5"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More information"
        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-64 max-w-[75vw] rounded-lg bg-slate-900 text-white text-xs leading-relaxed px-3 py-2 shadow-lg whitespace-pre-line"
        >
          {text}
        </span>
      )}
    </span>
  );
}

interface GridColumn {
  key: string;
  label: string;
  format?: 'text' | 'currency' | 'date' | 'datetime';
  is_amount?: boolean;
  is_bill_number?: boolean;
}

interface DocumentButtonConfig {
  enabled: boolean;
  label: string;
}

const DEFAULT_RECEIPT_NOTE = 'Your receipt will be sent here after payment.';

interface DisplayConfig {
  use_company_logo: boolean;
  logo_size: string;
  header_text: string;
  header_size: string;
  sub_header_text: string;
  sub_header_size: string;
  receipt_note_text?: string;
  search_boxes: SearchBox[];
  routing_search_box_key?: string;
  stripe_currency: string;
  surcharge_enabled?: boolean;
  surcharge_percent?: number;
  surcharge_label?: string;
}

interface CompanyBranding {
  logoUrl?: string;
  clientLoginLogoUrl?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function formatCell(value: unknown, format?: GridColumn['format'], currency = 'usd'): string {
  if (value == null || value === '') return '';
  if (format === 'currency') {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(n);
  }
  if (format === 'date') {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }
  if (format === 'datetime') {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }
  return String(value);
}

async function callFunction(name: string, payload: unknown): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload ?? {}),
  });
}

function makeRowId(row: Record<string, unknown>, idx: number, billKey: string): string {
  if (billKey && row[billKey] != null) return String(row[billKey]);
  return `row-${idx}`;
}

export default function GuestPaymentPage({ companyBranding }: { companyBranding?: CompanyBranding }) {
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [grid1Rows, setGrid1Rows] = useState<Array<Record<string, unknown>> | null>(null);
  const [grid2Rows, setGrid2Rows] = useState<Array<Record<string, unknown>> | null>(null);
  const [grid1Cols, setGrid1Cols] = useState<GridColumn[]>([]);
  const [grid2Cols, setGrid2Cols] = useState<GridColumn[]>([]);
  const [selected1, setSelected1] = useState<Set<string>>(new Set());
  const [selected2, setSelected2] = useState<Set<string>>(new Set());

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyBrand, setCompanyBrand] = useState<GuestPaymentCompanyBrandingOverrides | null>(null);
  const [companyStripeMode, setCompanyStripeMode] = useState<'live' | 'test' | null>(null);
  const [documentButton, setDocumentButton] = useState<DocumentButtonConfig | null>(null);
  const [docView, setDocView] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    blobUrl: string | null;
    filename: string;
    title: string;
  }>({ open: false, loading: false, error: null, blobUrl: null, filename: 'document.pdf', title: '' });

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await callFunction('get-guest-payment-config', {});
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to load configuration (${res.status})`);
        }
        const data: DisplayConfig = await res.json();
        if (cancelled) return;
        setConfig(data);
        const seed: Record<string, string> = {};
        for (const b of data.search_boxes) seed[b.key] = '';
        setInputs(seed);
      } catch (err) {
        if (!cancelled) setConfigError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const canSearch =
    !!config &&
    config.search_boxes.every((b) => !b.required || (inputs[b.key] ?? '').trim().length > 0);

  const grid1BillKey = useMemo(
    () => grid1Cols.find((c) => c.is_bill_number)?.key ?? '',
    [grid1Cols]
  );
  const grid1AmountKey = useMemo(
    () => grid1Cols.find((c) => c.is_amount)?.key ?? '',
    [grid1Cols]
  );
  const grid2BillKey = useMemo(
    () => grid2Cols.find((c) => c.is_bill_number)?.key ?? '',
    [grid2Cols]
  );
  const grid2AmountKey = useMemo(
    () => grid2Cols.find((c) => c.is_amount)?.key ?? '',
    [grid2Cols]
  );

  const grid1EffectiveBillKey = useMemo(() => {
    if (grid1BillKey) return grid1BillKey;
    if (grid2BillKey && grid1Cols.some((c) => c.key === grid2BillKey)) return grid2BillKey;
    return '';
  }, [grid1BillKey, grid2BillKey, grid1Cols]);
  const grid1EffectiveAmountKey = useMemo(() => {
    if (grid1AmountKey) return grid1AmountKey;
    if (grid2AmountKey && grid1Cols.some((c) => c.key === grid2AmountKey)) return grid2AmountKey;
    return '';
  }, [grid1AmountKey, grid2AmountKey, grid1Cols]);

  const selectedGrid1Rows = useMemo(() => {
    if (!grid1Rows) return [];
    return grid1Rows.filter((r, i) => selected1.has(makeRowId(r, i, grid1EffectiveBillKey)));
  }, [grid1Rows, selected1, grid1EffectiveBillKey]);

  const selectedGrid2Rows = useMemo(() => {
    if (!grid2Rows) return [];
    return grid2Rows.filter((r, i) => selected2.has(makeRowId(r, i, grid2BillKey)));
  }, [grid2Rows, selected2, grid2BillKey]);

  const totalSelectedCount = selectedGrid1Rows.length + selectedGrid2Rows.length;

  const total = useMemo(() => {
    let sum = 0;
    if (grid1EffectiveAmountKey) {
      for (const r of selectedGrid1Rows) {
        const n = Number(r[grid1EffectiveAmountKey]);
        if (Number.isFinite(n)) sum += n;
      }
    }
    if (grid2AmountKey) {
      for (const r of selectedGrid2Rows) {
        const n = Number(r[grid2AmountKey]);
        if (Number.isFinite(n)) sum += n;
      }
    }
    return sum;
  }, [selectedGrid1Rows, selectedGrid2Rows, grid1EffectiveAmountKey, grid2AmountKey]);

  const surchargePercent = config?.surcharge_enabled ? Number(config.surcharge_percent) || 0 : 0;
  const surchargeAmount = Math.round(total * surchargePercent) / 100;
  const grandTotal = Math.round((total + surchargeAmount) * 100) / 100;
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (config?.stripe_currency || 'usd').toUpperCase(),
    }).format(n);

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setGrid1Rows(null);
    setGrid2Rows(null);
    setGrid1Cols([]);
    setGrid2Cols([]);
    setSelected1(new Set());
    setSelected2(new Set());
    setCompanyId(null);
    setCompanyBrand(null);
    setCompanyStripeMode(null);
    setDocumentButton(null);
    try {
      const res = await callFunction('guest-payment-search', {
        inputs: { ...inputs },
        website,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Search failed (${res.status})`);
      }
      const data = await res.json();
      const g1Rows: Array<Record<string, unknown>> = Array.isArray(data.grid1Rows) ? data.grid1Rows : [];
      const g2Rows: Array<Record<string, unknown>> = Array.isArray(data.grid2Rows) ? data.grid2Rows : [];
      const g1Cols: GridColumn[] = Array.isArray(data.grid_1_columns) ? data.grid_1_columns : [];
      const g2Cols: GridColumn[] = Array.isArray(data.grid_2_columns) ? data.grid_2_columns : [];
      setGrid1Rows(g1Rows);
      setGrid2Rows(g2Rows);
      setGrid1Cols(g1Cols);
      setGrid2Cols(g2Cols);
      setCompanyId(typeof data.company_id === 'string' ? data.company_id : null);
      setCompanyBrand(parseCompanyBranding(data.branding));
      setCompanyStripeMode(data.stripe_mode === 'live' ? 'live' : data.stripe_mode === 'test' ? 'test' : null);
      const rawDoc = data.document_button;
      if (rawDoc && typeof rawDoc === 'object' && rawDoc.enabled === true) {
        setDocumentButton({
          enabled: true,
          label: typeof rawDoc.label === 'string' && rawDoc.label.trim().length > 0 ? rawDoc.label : 'View Document',
        });
      } else {
        setDocumentButton(null);
      }
      const g1BillKey = g1Cols.find((c) => c.is_bill_number)?.key ?? '';
      const g2BillKey = g2Cols.find((c) => c.is_bill_number)?.key ?? '';
      const g1EffBillKey =
        g1BillKey || (g2BillKey && g1Cols.some((c) => c.key === g2BillKey) ? g2BillKey : '');
      setSelected1(new Set(g1Rows.map((r, i) => makeRowId(r, i, g1EffBillKey))));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handlePay = async () => {
    if (totalSelectedCount === 0 || !emailValid) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const fromGrid1 = selectedGrid1Rows.map((r) => ({
        bill_number: grid1EffectiveBillKey ? r[grid1EffectiveBillKey] : null,
        amount: grid1EffectiveAmountKey ? Number(r[grid1EffectiveAmountKey]) : 0,
        row: r,
      }));
      const fromGrid2 = selectedGrid2Rows.map((r) => ({
        bill_number: grid2BillKey ? r[grid2BillKey] : null,
        amount: grid2AmountKey ? Number(r[grid2AmountKey]) : 0,
        row: r,
      }));
      const seen = new Set<string>();
      const selectedBills = [...fromGrid1, ...fromGrid2].filter((b) => {
        const key = b.bill_number == null ? '' : String(b.bill_number);
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const res = await callFunction('create-guest-checkout', {
        guest_email: email.trim(),
        search_inputs: inputs,
        selected_bills: selectedBills,
        website,
        return_origin: window.location.origin,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Unable to start checkout (${res.status})`);
      }
      const data = await res.json();
      if (!data.url) throw new Error('Checkout session did not return a URL');
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to start checkout');
      setCheckoutLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (docView.blobUrl) URL.revokeObjectURL(docView.blobUrl);
    };
  }, [docView.blobUrl]);

  const closeDocView = () => {
    setDocView((prev) => {
      if (prev.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return { open: false, loading: false, error: null, blobUrl: null, filename: 'document.pdf', title: '' };
    });
  };

  const openDocument = async (
    row: Record<string, unknown>,
    grid: 'grid1' | 'grid2',
    billKey: string,
    idx: number,
  ) => {
    if (!documentButton || !documentButton.enabled || !companyId) return;
    const rowLabel = billKey && row[billKey] != null && String(row[billKey]).trim().length > 0
      ? String(row[billKey])
      : `Row ${idx + 1}`;
    setDocView({
      open: true,
      loading: true,
      error: null,
      blobUrl: null,
      filename: 'document.pdf',
      title: rowLabel,
    });
    try {
      const res = await callFunction('guest-payment-document', {
        company_id: companyId,
        grid,
        row,
        inputs,
      });
      if (!res.ok) {
        let msg = `Document request failed (${res.status})`;
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch { /* body not JSON */ }
        throw new Error(msg);
      }
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1]?.trim() || `document-${rowLabel}.pdf`;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setDocView((prev) => (prev.open ? { ...prev, loading: false, blobUrl, filename } : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load the document.';
      setDocView((prev) => (prev.open ? { ...prev, loading: false, error: message } : prev));
    }
  };

  if (configLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading payment page...</span>
        </div>
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Payment page unavailable</h1>
          <p className="text-slate-500">{configError ?? 'This page has not been configured yet.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {companyStripeMode === 'test' && (
          <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              TEST MODE
            </span>
            <span>No real payments will be processed. Use a Stripe test card such as 4242 4242 4242 4242.</span>
          </div>
        )}
        <GuestPaymentBrandingHeader global={config} company={companyBrand} appLogo={companyBranding} />

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-5">Find your bills</h2>

          <div className="flex flex-wrap items-end gap-4">
            {config.search_boxes.map((box) => (
              <div key={box.key} className="flex-1 min-w-[220px]">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {box.label}
                  {box.required && <span className="text-red-500 ml-1">*</span>}
                  {box.help_text && box.help_text.trim() && <SearchBoxInfo text={box.help_text} />}
                </label>
                <input
                  type="text"
                  value={inputs[box.key] ?? ''}
                  onChange={(e) => setInputs({ ...inputs, [box.key]: e.target.value })}
                  placeholder={box.placeholder}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                />
              </div>
            ))}
            <button
              onClick={handleSearch}
              disabled={!canSearch || searching}
              className="shrink-0 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold transition"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>{searching ? 'Searching...' : 'Search'}</span>
            </button>
          </div>

          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
            <label>
              Website
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

          {searchError && (
            <p className="mt-4 text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> {searchError}
            </p>
          )}
        </section>

        {grid1Rows && (
          <SelectableGrid
            title="Results"
            columns={grid1Cols}
            rows={grid1Rows}
            currency={config.stripe_currency}
            billKey={grid1EffectiveBillKey}
            selected={selected1}
            onChange={setSelected1}
            documentButton={documentButton}
            onOpenDocument={(row, idx) => openDocument(row, 'grid1', grid1EffectiveBillKey, idx)}
          />
        )}

        {grid2Rows && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Outstanding bills</h2>
              <span className="text-sm text-slate-500">{grid2Rows.length} item{grid2Rows.length === 1 ? '' : 's'}</span>
            </div>
            {grid2Rows.length === 0 ? (
              <p className="text-slate-500 text-sm py-6 text-center">No outstanding bills found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                      <th className="py-3 pr-4 text-left w-10">
                        <input
                          type="checkbox"
                          checked={grid2Rows.length > 0 && selected2.size === grid2Rows.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelected2(new Set(grid2Rows.map((r, i) => makeRowId(r, i, grid2BillKey))));
                            } else {
                              setSelected2(new Set());
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </th>
                      {grid2Cols.map((col) => (
                        <th key={col.key} className="py-3 pr-4 text-left font-medium">{col.label}</th>
                      ))}
                      {documentButton && (
                        <th className="py-3 pr-4 text-right font-medium w-1">Document</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {grid2Rows.map((row, i) => {
                      const id = makeRowId(row, i, grid2BillKey);
                      const isChecked = selected2.has(id);
                      return (
                        <tr key={id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 pr-4">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(selected2);
                                if (e.target.checked) next.add(id);
                                else next.delete(id);
                                setSelected2(next);
                              }}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          {grid2Cols.map((col) => (
                            <td key={col.key} className="py-3 pr-4 text-slate-700">
                              {formatCell(row[col.key], col.format, config.stripe_currency)}
                            </td>
                          ))}
                          {documentButton && (
                            <td className="py-3 pr-4 text-right">
                              <button
                                type="button"
                                onClick={() => openDocument(row, 'grid2', grid2BillKey, i)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {documentButton.label}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="min-w-[240px]">
                  {surchargePercent > 0 && (
                    <div className="space-y-1 mb-3 text-sm text-slate-600">
                      <div className="flex justify-between gap-6">
                        <span>Selected Payment:</span>
                        <span className="font-medium text-slate-800">{formatCurrency(total)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span>{config.surcharge_label || 'Surcharge'} {surchargePercent}%:</span>
                        <span className="font-medium text-slate-800">{formatCurrency(surchargeAmount)}</span>
                      </div>
                    </div>
                  )}
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {surchargePercent > 0 ? 'Total Payment' : 'Total to pay'}
                  </div>
                  <div className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(grandTotal)}</div>
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto sm:min-w-[320px]">
                  <label className="block text-sm font-medium text-slate-700">
                    Email address<span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 outline-none transition"
                  />
                  {(config.receipt_note_text ?? DEFAULT_RECEIPT_NOTE).trim() && (
                    <p className="text-xs text-slate-500 sm:text-right">{config.receipt_note_text ?? DEFAULT_RECEIPT_NOTE}</p>
                  )}
                  {checkoutError && (
                    <p className="text-sm text-red-600 flex items-center gap-1.5 sm:justify-end">
                      <AlertCircle className="h-4 w-4" /> {checkoutError}
                    </p>
                  )}
                  <button
                    onClick={handlePay}
                    disabled={totalSelectedCount === 0 || !emailValid || checkoutLoading}
                    className="mt-1 inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold transition shadow-lg shadow-emerald-600/20"
                  >
                    {checkoutLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CreditCard className="h-5 w-5" />
                    )}
                    <span>{checkoutLoading ? 'Starting checkout...' : 'Make Payment'}</span>
                    {!checkoutLoading && <ArrowRight className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {docView.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {documentButton?.label ?? 'Document'}
                  {docView.title && <span className="text-slate-400 font-normal ml-2">— {docView.title}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {docView.blobUrl && (
                  <a
                    href={docView.blobUrl}
                    download={docView.filename}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeDocView}
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 relative">
              {docView.loading && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-500 text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading document...</span>
                </div>
              )}
              {docView.error && !docView.loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-600 text-sm px-6 text-center">
                  <AlertCircle className="h-6 w-6" />
                  <span>{docView.error}</span>
                </div>
              )}
              {docView.blobUrl && !docView.error && (
                <iframe
                  src={docView.blobUrl}
                  title="Document viewer"
                  className="absolute inset-0 w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectableGrid({
  title,
  columns,
  rows,
  currency,
  billKey,
  selected,
  onChange,
  documentButton,
  onOpenDocument,
}: {
  title: string;
  columns: GridColumn[];
  rows: Array<Record<string, unknown>>;
  currency: string;
  billKey: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  documentButton?: DocumentButtonConfig | null;
  onOpenDocument?: (row: Record<string, unknown>, idx: number) => void;
}) {
  if (columns.length === 0) return null;
  const allChecked = rows.length > 0 && selected.size === rows.length;
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-sm text-slate-500">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm py-6 text-center">No results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                <th className="py-3 pr-4 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange(new Set(rows.map((r, i) => makeRowId(r, i, billKey))));
                      } else {
                        onChange(new Set());
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                {columns.map((col) => (
                  <th key={col.key} className="py-3 pr-4 text-left font-medium">{col.label}</th>
                ))}
                {documentButton && (
                  <th className="py-3 pr-4 text-right font-medium w-1">Document</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const id = makeRowId(row, i, billKey);
                const isChecked = selected.has(id);
                return (
                  <tr key={id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(id);
                          else next.delete(id);
                          onChange(next);
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="py-3 pr-4 text-slate-700">
                        {formatCell(row[col.key], col.format, currency)}
                      </td>
                    ))}
                    {documentButton && (
                      <td className="py-3 pr-4 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenDocument?.(row, i)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {documentButton.label}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
