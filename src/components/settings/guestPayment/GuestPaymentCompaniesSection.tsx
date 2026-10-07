import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, ArrowLeft, Save, Mail, Zap, LayoutGrid, ListTree, FileText, Palette, CreditCard } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';
import { supabase } from '../../../lib/supabase';
import {
  createGuestPaymentCompany,
  deleteGuestPaymentCompany,
  deleteRoutingRule,
  duplicateGuestPaymentCompany,
  emptyApiEndpoint,
  emptyDocumentButton,
  type GuestPaymentDocumentButton,
  listGuestPaymentCompanies,
  listRoutingRulesForCompany,
  saveGuestPaymentCompany,
  saveRoutingRule,
  getGuestPaymentConfig,
  type GuestPaymentCompany,
  type GuestPaymentRoutingRule,
  type GuestPaymentRoutingMatchType,
} from '../../../services/guestPaymentConfigService';
import { ApiEndpointSection, GridColumnsSection, LabeledInput, LabeledTextarea } from './GuestPaymentEditors';
import GuestPaymentCompanyBrandingSection from './GuestPaymentCompanyBrandingSection';
import GuestPaymentCompanyStripeSection from './GuestPaymentCompanyStripeSection';

const MATCH_TYPE_OPTIONS = [
  { value: 'prefix', label: 'Starts with' },
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
];

type CompanySubSection =
  | 'branding'
  | 'stripe'
  | 'search_api_1'
  | 'search_api_2'
  | 'success_api_call'
  | 'grid_1'
  | 'grid_2'
  | 'document_button'
  | 'receipt'
  | 'routing';

const COMPANY_SUB_SECTIONS: { key: CompanySubSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'stripe', label: 'Stripe', icon: CreditCard },
  { key: 'search_api_1', label: 'Search API #1', icon: Zap },
  { key: 'search_api_2', label: 'Search API #2', icon: Zap },
  { key: 'success_api_call', label: 'Success API Call', icon: Zap },
  { key: 'grid_1', label: 'Grid 1 Columns', icon: LayoutGrid },
  { key: 'grid_2', label: 'Grid 2 Columns', icon: LayoutGrid },
  { key: 'document_button', label: 'Row Document Button', icon: FileText },
  { key: 'receipt', label: 'Receipt Email', icon: Mail },
  { key: 'routing', label: 'Routing Rules', icon: ListTree },
];

export default function GuestPaymentCompaniesSection() {
  const [companies, setCompanies] = useState<GuestPaymentCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [copyFromId, setCopyFromId] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setCompanies(await listGuestPaymentCompanies());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load companies');
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const copyOptions = useMemo(
    () => [{ value: '', label: 'Start from blank' }, ...companies.map((c) => ({ value: c.id, label: c.name }))],
    [companies]
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      if (copyFromId) {
        await duplicateGuestPaymentCompany(copyFromId, newName.trim());
      } else {
        await createGuestPaymentCompany(newName.trim());
      }
      setNewName('');
      setCopyFromId('');
      setShowAdd(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create company');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this company? Its routing rules will also be removed.')) return;
    try {
      await deleteGuestPaymentCompany(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  if (loading) return <div className="text-sm text-gray-500 py-8 text-center">Loading companies...</div>;

  if (editingId) {
    const co = companies.find((c) => c.id === editingId);
    if (!co) {
      setEditingId(null);
      return null;
    }
    return (
      <CompanyEditor
        company={co}
        onBack={() => setEditingId(null)}
        onSaved={async () => { await load(true); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Companies</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Each company owns its own Search APIs, Grids, Success API, and receipt template.
            The routing rules on each company decide which company handles a given guest.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Company
        </button>
      </div>

      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

      {showAdd && (
        <div className="p-4 bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-md space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput label="Company name" value={newName} onChange={setNewName} placeholder="Company 1" />
            <div>
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Copy settings from (routing rules are NOT copied)
              </span>
              <CustomDropdown value={copyFromId} onChange={setCopyFromId} options={copyOptions} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAdd(false); setNewName(''); setCopyFromId(''); }}
              className="px-3 py-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-3 py-1.5 rounded-md text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
            >
              {copyFromId ? <span className="inline-flex items-center gap-1"><Copy className="h-3 w-3" /> Copy company</span> : 'Create company'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {companies.length === 0 && (
          <div className="text-xs italic text-gray-500 dark:text-gray-400">
            No companies yet. Add one to start configuring per-company APIs.
          </div>
        )}
        {companies.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
              {!c.enabled && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">Disabled</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingId(c.id)}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5 text-gray-500" />
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyEditor({
  company: initial,
  onBack,
  onSaved,
}: {
  company: GuestPaymentCompany;
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<GuestPaymentCompany>(initial);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [sub, setSub] = useState<CompanySubSection>('search_api_1');
  const [searchBoxVars, setSearchBoxVars] = useState<{ name: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getGuestPaymentConfig();
        if (cancelled) return;
        const boxes = cfg?.search_boxes ?? [];
        setSearchBoxVars(
          boxes
            .filter((b) => b.key && b.key.trim().length > 0)
            .map((b) => ({ name: b.key, label: b.label || b.key })),
        );
      } catch {
        if (!cancelled) setSearchBoxVars([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const patch = <K extends keyof GuestPaymentCompany>(key: K, value: GuestPaymentCompany[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveErr(null);
    setSaveOk(null);
    try {
      const saved = await saveGuestPaymentCompany({
        ...draft,
        search_api_1: draft.search_api_1 ?? emptyApiEndpoint(),
        search_api_2: draft.search_api_2 ?? emptyApiEndpoint(),
        success_api_call: draft.success_api_call ?? emptyApiEndpoint(),
        document_button: draft.document_button ?? emptyDocumentButton(),
      });
      setDraft(saved);
      await onSaved();
      setSaveOk('Company saved.');
      setTimeout(() => setSaveOk(null), 2000);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Companies
        </button>
        <div className="flex items-center gap-2">
          {saveOk && <span className="text-xs text-emerald-600">{saveOk}</span>}
          {saveErr && <span className="text-xs text-red-600">{saveErr}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Company'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LabeledInput label="Company name" value={draft.name} onChange={(v) => patch('name', v)} />
        <label className="flex items-center gap-2 mt-6">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => patch('enabled', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-200">Enabled (available for routing)</span>
        </label>
        <LabeledInput label="Sort order" value={String(draft.sort_order)} onChange={(v) => patch('sort_order', Number(v) || 0)} type="number" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
        {COMPANY_SUB_SECTIONS.map(({ key, label, icon: Icon }) => {
          const active = sub === key;
          return (
            <button
              key={key}
              onClick={() => setSub(key)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          );
        })}
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
        {sub === 'stripe' && (
          <GuestPaymentCompanyStripeSection
            companyId={draft.id}
            value={draft}
            onChange={(k, v) => patch(k, v)}
          />
        )}
        {sub === 'branding' && (
          <GuestPaymentCompanyBrandingSection value={draft.branding} onChange={(v) => patch('branding', v)} />
        )}
        {sub === 'search_api_1' && (
          <ApiEndpointSection
            title="Search API #1"
            description="Called with the guest's search inputs. Feeds Grid 1 and provides response mappings for Search API #2."
            value={draft.search_api_1 ?? emptyApiEndpoint()}
            onChange={(v) => patch('search_api_1', v)}
            variables={searchBoxVars}
          />
        )}
        {sub === 'search_api_2' && (
          <ApiEndpointSection
            title="Search API #2"
            description="Called using response mappings from Search API #1. Its response feeds Grid 2 (outstanding bills)."
            value={draft.search_api_2 ?? emptyApiEndpoint()}
            onChange={(v) => patch('search_api_2', v)}
            variables={(() => {
              const search1Vars = (draft.search_api_1?.response_mappings ?? [])
                .map((m) => (m.target_key ?? '').trim())
                .filter((k) => k.length > 0)
                .filter((k, i, arr) => arr.indexOf(k) === i)
                .map((k) => ({
                  name: `inputs.${k}`,
                  label: `Search API #1 → ${k}`,
                }));
              const seen = new Set(search1Vars.map((v) => v.name));
              const boxes = searchBoxVars.filter((v) => !seen.has(v.name));
              return [...boxes, ...search1Vars];
            })()}
          />
        )}
        {sub === 'success_api_call' && (
          <ApiEndpointSection
            title="Success Payment API Call"
            description="Called once per paid Bill Number after Stripe confirms payment. Variables: {bill_number}, {amount}, {guest_email}, {currency}, {transaction_id}."
            value={draft.success_api_call ?? emptyApiEndpoint()}
            onChange={(v) => patch('success_api_call', v)}
          />
        )}
        {sub === 'grid_1' && (
          <GridColumnsSection
            title="Grid 1 Columns"
            description="Columns rendered from Search API #1 results. Mark which column holds the amount and which holds the bill number so the row can be checked off and totalled at checkout."
            value={draft.grid_1_columns}
            onChange={(v) => patch('grid_1_columns', v)}
            withBillFlags
            availableKeys={(draft.search_api_1?.response_mappings ?? [])
              .filter((m) => m.target_key.trim())
              .map((m) => ({ target_key: m.target_key, source_path: m.source_path }))}
          />
        )}
        {sub === 'grid_2' && (
          <GridColumnsSection
            title="Grid 2 Columns"
            description="Columns rendered from Search API #2 results. Mark which column holds the amount and which holds the bill number."
            value={draft.grid_2_columns}
            onChange={(v) => patch('grid_2_columns', v)}
            withBillFlags
            availableKeys={(draft.search_api_2?.response_mappings ?? [])
              .filter((m) => m.target_key.trim())
              .map((m) => ({ target_key: m.target_key, source_path: m.source_path }))}
          />
        )}
        {sub === 'document_button' && (
          <DocumentButtonSection
            draft={draft}
            patch={patch}
            searchBoxVars={searchBoxVars}
          />
        )}
        {sub === 'receipt' && <CompanyReceiptSection draft={draft} patch={patch} />}
        {sub === 'routing' && <RoutingRulesEditor companyId={draft.id} />}
      </div>
    </div>
  );
}

function CompanyReceiptSection({
  draft,
  patch,
}: {
  draft: GuestPaymentCompany;
  patch: <K extends keyof GuestPaymentCompany>(key: K, value: GuestPaymentCompany[K]) => void;
}) {
  const [accounts, setAccounts] = useState<Array<{ id: string; account_name: string; provider: string; from_email: string }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('email_sending_accounts')
        .select('id, account_name, provider, from_email')
        .order('account_name', { ascending: true });
      if (cancelled) return;
      if (!error && data) setAccounts(data as typeof accounts);
      setLoadingAccounts(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const accountOptions = useMemo(
    () => [
      { value: '', label: loadingAccounts ? 'Loading...' : accounts.length === 0 ? 'No sending accounts configured' : 'Use default sending account' },
      ...accounts.map((a) => ({ value: a.id, label: `${a.account_name} (${a.provider}) — ${a.from_email}` })),
    ],
    [accounts, loadingAccounts]
  );

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Receipt Email</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Templates support {'{guest_email}'}, {'{total_amount}'}, {'{currency}'}, {'{transaction_id}'}.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sending Account</label>
        <CustomDropdown
          value={draft.receipt_sending_account_id ?? ''}
          options={accountOptions}
          onChange={(v) => patch('receipt_sending_account_id', v ? v : null)}
        />
      </div>
      <LabeledInput label="To Email" value={draft.receipt_to_email} onChange={(v) => patch('receipt_to_email', v)} placeholder="{guest_email}" />
      <LabeledInput label="From Email (optional override)" value={draft.receipt_from_email} onChange={(v) => patch('receipt_from_email', v)} />
      <LabeledInput label="Subject Template" value={draft.receipt_subject_template} onChange={(v) => patch('receipt_subject_template', v)} placeholder="Your payment receipt" />
      <LabeledTextarea label="Body Template" value={draft.receipt_body_template} onChange={(v) => patch('receipt_body_template', v)} rows={6} />
    </div>
  );
}

function RoutingRulesEditor({ companyId }: { companyId: string }) {
  const [rules, setRules] = useState<GuestPaymentRoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string; match_type: GuestPaymentRoutingMatchType; match_value: string; case_sensitive: boolean; sort_order: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRules(await listRoutingRulesForCompany(companyId));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const beginAdd = () =>
    setEditing({ match_type: 'prefix', match_value: '', case_sensitive: false, sort_order: rules.length });
  const beginEdit = (r: GuestPaymentRoutingRule) =>
    setEditing({ id: r.id, match_type: r.match_type, match_value: r.match_value, case_sensitive: r.case_sensitive, sort_order: r.sort_order });

  const save = async () => {
    if (!editing || !editing.match_value.trim()) return;
    try {
      await saveRoutingRule({
        id: editing.id,
        company_id: companyId,
        match_type: editing.match_type,
        match_value: editing.match_value.trim(),
        case_sensitive: editing.case_sensitive,
        sort_order: editing.sort_order,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save rule');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this routing rule?')) return;
    try {
      await deleteRoutingRule(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Routing Rules</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            When a guest enters a value into the routing search box, these rules decide whether this company handles the request.
            Example: <span className="font-mono">Starts with "XT"</span> → this company.
          </p>
        </div>
        <button
          onClick={beginAdd}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Rule
        </button>
      </div>

      {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}

      {loading ? (
        <div className="text-xs text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-2">
          {rules.length === 0 && editing === null && (
            <div className="text-xs italic text-gray-500 dark:text-gray-400">No routing rules yet.</div>
          )}
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
              <div className="text-sm">
                <span className="uppercase text-[10px] tracking-wide text-gray-500 mr-2">
                  {r.match_type === 'prefix' ? 'Starts with' : r.match_type === 'equals' ? 'Equals' : 'Contains'}
                </span>
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{r.match_value}</span>
                {r.case_sensitive && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">Case sensitive</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => beginEdit(r)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                </button>
                <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="p-4 bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-md space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Match type</span>
              <CustomDropdown
                value={editing.match_type}
                onChange={(v) => setEditing({ ...editing, match_type: v as GuestPaymentRoutingMatchType })}
                options={MATCH_TYPE_OPTIONS}
              />
            </div>
            <LabeledInput label="Match value" value={editing.match_value} onChange={(v) => setEditing({ ...editing, match_value: v })} placeholder="XT" />
            <LabeledInput label="Sort order" value={String(editing.sort_order)} onChange={(v) => setEditing({ ...editing, sort_order: Number(v) || 0 })} type="number" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={editing.case_sensitive}
              onChange={(e) => setEditing({ ...editing, case_sensitive: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            Case sensitive
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-md text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Cancel</button>
            <button onClick={save} disabled={!editing.match_value.trim()} className="px-3 py-1.5 rounded-md text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white">Save Rule</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentButtonSection({
  draft,
  patch,
  searchBoxVars,
}: {
  draft: GuestPaymentCompany;
  patch: <K extends keyof GuestPaymentCompany>(key: K, value: GuestPaymentCompany[K]) => void;
  searchBoxVars: { name: string; label: string }[];
}) {
  const docBtn = draft.document_button ?? emptyDocumentButton();

  const patchDoc = (p: Partial<GuestPaymentDocumentButton>) =>
    patch('document_button', { ...docBtn, ...p });

  const grid1Vars = (draft.search_api_1?.response_mappings ?? [])
    .map((m) => (m.target_key ?? '').trim())
    .filter((k) => k.length > 0)
    .map((k) => ({ name: k, label: `Row → ${k}` }));
  const grid2Vars = (draft.search_api_2?.response_mappings ?? [])
    .map((m) => (m.target_key ?? '').trim())
    .filter((k) => k.length > 0)
    .filter((k) => !grid1Vars.some((v) => v.name === k))
    .map((k) => ({ name: k, label: `Row → ${k}` }));
  const rowVars = [...grid1Vars, ...grid2Vars];
  const seen = new Set(rowVars.map((v) => v.name));
  const boxVars = searchBoxVars.filter((v) => !seen.has(v.name));
  const variables = [...boxVars, ...rowVars];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Row Document Button</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Adds a button to every row in Grid 1 and Grid 2. When clicked, the customer's row values are sent to this
          API endpoint and the returned PDF is opened in a viewer.
        </p>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={docBtn.enabled}
          onChange={(e) => patchDoc({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-200">
          Enable the row document button on Grid 1 and Grid 2
        </span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LabeledInput
          label="Button label"
          value={docBtn.label}
          onChange={(v) => patchDoc({ label: v })}
          placeholder="View Document"
        />
        <LabeledInput
          label="Downloaded filename (supports {variables})"
          value={docBtn.filename_template}
          onChange={(v) => patchDoc({ filename_template: v })}
          placeholder="invoice-{bill_number}.pdf"
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={docBtn.api_endpoint?.response_binary !== false}
          onChange={(e) =>
            patchDoc({
              api_endpoint: {
                ...(docBtn.api_endpoint ?? emptyApiEndpoint()),
                response_binary: e.target.checked,
              },
            })
          }
          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-200">
          Treat response as binary (PDF / file download)
        </span>
      </label>

      <ApiEndpointSection
        title="Document API Endpoint"
        description="Called with the row's values when the customer clicks the button. Any response mapping keys from Search API #1 or Search API #2 (like bill_number) can be inserted as {variables} into headers, path variables, or the request body."
        value={docBtn.api_endpoint ?? emptyApiEndpoint()}
        onChange={(v) => patchDoc({ api_endpoint: v })}
        variables={variables}
      />
    </div>
  );
}
