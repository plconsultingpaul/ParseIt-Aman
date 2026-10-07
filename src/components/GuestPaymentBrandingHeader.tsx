export interface GuestPaymentGlobalBranding {
  use_company_logo: boolean;
  logo_size: string;
  header_text: string;
  header_size: string;
  sub_header_text: string;
  sub_header_size: string;
}

export interface GuestPaymentCompanyBrandingOverrides {
  logo_url?: string;
  logo_size?: string;
  company_name?: string;
  company_name_size?: string;
  header_text?: string;
  header_size?: string;
  sub_header_text?: string;
  sub_header_size?: string;
}

export interface AppLogoBranding {
  logoUrl?: string;
  clientLoginLogoUrl?: string;
}

const HEADER_SIZE_MAP: Record<string, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
  '2xl': 'text-4xl',
  '3xl': 'text-5xl',
  '4xl': 'text-6xl',
};

const SUB_SIZE_MAP: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

const LOGO_SIZE_MAP: Record<string, string> = {
  xs: 'h-10',
  sm: 'h-14',
  md: 'h-20',
  lg: 'h-28',
  xl: 'h-40',
  '2xl': 'h-56',
};

export function parseCompanyBranding(input: unknown): GuestPaymentCompanyBrandingOverrides | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const out: GuestPaymentCompanyBrandingOverrides = {};
  for (const key of ['logo_url', 'logo_size', 'company_name', 'company_name_size', 'header_text', 'header_size', 'sub_header_text', 'sub_header_size'] as const) {
    if (typeof raw[key] === 'string') out[key] = (raw[key] as string).trim();
  }
  return out;
}

export function parseGlobalBranding(input: unknown): GuestPaymentGlobalBranding | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  return {
    use_company_logo: raw.use_company_logo !== false,
    logo_size: str(raw.logo_size, 'md'),
    header_text: str(raw.header_text, ''),
    header_size: str(raw.header_size, '3xl'),
    sub_header_text: str(raw.sub_header_text, ''),
    sub_header_size: str(raw.sub_header_size, 'lg'),
  };
}

export default function GuestPaymentBrandingHeader({
  global,
  company,
  appLogo,
  showHeaderText = true,
  adaptiveDark = false,
  className = 'text-center mb-10',
}: {
  global: GuestPaymentGlobalBranding | null;
  company?: GuestPaymentCompanyBrandingOverrides | null;
  appLogo?: AppLogoBranding;
  showHeaderText?: boolean;
  adaptiveDark?: boolean;
  className?: string;
}) {
  const globalLogo = global?.use_company_logo ? appLogo?.clientLoginLogoUrl || appLogo?.logoUrl : undefined;
  const logoUrl = company?.logo_url || globalLogo;
  const logoSize = company?.logo_size || global?.logo_size || 'md';
  const companyName = company?.company_name || '';
  const companyNameSize = company?.company_name_size || 'lg';
  const headerText = company?.header_text || global?.header_text || '';
  const headerSize = company?.header_size || global?.header_size || '3xl';
  const subText = company?.sub_header_text || global?.sub_header_text || '';
  const subSize = company?.sub_header_size || global?.sub_header_size || 'lg';

  if (!logoUrl && !companyName && (!showHeaderText || (!headerText && !subText))) return null;

  return (
    <header className={className}>
      {logoUrl && (
        <img
          key={logoUrl}
          src={logoUrl}
          alt={companyName || 'Company logo'}
          className={`${LOGO_SIZE_MAP[logoSize] ?? 'h-20'} w-auto mx-auto mb-4 object-contain transition-opacity duration-300`}
        />
      )}
      {companyName && (
        <p className={`font-semibold uppercase tracking-[0.18em] text-slate-600${adaptiveDark ? ' dark:text-slate-300' : ''} mb-3 ${SUB_SIZE_MAP[companyNameSize] ?? 'text-lg'}`}>
          {companyName}
        </p>
      )}
      {showHeaderText && headerText && (
        <h1 className={`font-bold text-slate-900${adaptiveDark ? ' dark:text-slate-100' : ''} leading-tight ${HEADER_SIZE_MAP[headerSize] ?? 'text-4xl'}`}>
          {headerText}
        </h1>
      )}
      {showHeaderText && subText && (
        <p className={`mt-3 text-slate-500${adaptiveDark ? ' dark:text-slate-400' : ''} ${SUB_SIZE_MAP[subSize] ?? 'text-lg'}`}>
          {subText}
        </p>
      )}
    </header>
  );
}
