import { useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';
import { uploadCompanyLogo } from '../../../services/configService';
import type { GuestPaymentCompanyBranding } from '../../../services/guestPaymentConfigService';
import { HEADER_SIZE_OPTIONS, LabeledInput, LOGO_SIZE_OPTIONS, SUB_HEADER_SIZE_OPTIONS } from './GuestPaymentEditors';

const USE_GLOBAL = { value: '', label: 'Use global setting' };

export default function GuestPaymentCompanyBrandingSection({
  value,
  onChange,
}: {
  value: GuestPaymentCompanyBranding;
  onChange: (v: GuestPaymentCompanyBranding) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const set = <K extends keyof GuestPaymentCompanyBranding>(key: K, v: GuestPaymentCompanyBranding[K]) =>
    onChange({ ...value, [key]: v });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const { publicUrl } = await uploadCompanyLogo(file);
      set('logo_url', publicUrl);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Company Branding</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Shown to guests once their search is matched to this company, and on the payment success and cancel pages.
          Anything left blank uses the Global Branding settings. Remember to save the company after uploading.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <div className="md:col-span-2">
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Logo</span>
          <div className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
            <div className="h-16 w-32 flex items-center justify-center rounded bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 overflow-hidden">
              {value.logo_url ? (
                <img src={value.logo_url} alt="Company logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-gray-400" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploading ? 'Uploading...' : value.logo_url ? 'Replace logo' : 'Upload logo'}
              </button>
              {value.logo_url && (
                <button
                  type="button"
                  onClick={() => set('logo_url', '')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            PNG, JPG, SVG or WebP up to 2MB. Without a logo here, the global logo is used.
          </p>
          {uploadErr && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{uploadErr}</p>}
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Logo size</span>
          <CustomDropdown
            value={value.logo_size}
            onChange={(v) => set('logo_size', v)}
            options={[USE_GLOBAL, ...LOGO_SIZE_OPTIONS]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <LabeledInput
            label="Company Name"
            value={value.company_name}
            onChange={(v) => set('company_name', v)}
            placeholder="Shown between the logo and the header text"
          />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Company name size</span>
          <CustomDropdown
            value={value.company_name_size || 'lg'}
            onChange={(v) => set('company_name_size', v)}
            options={SUB_HEADER_SIZE_OPTIONS}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <LabeledInput
            label="Header text"
            value={value.header_text}
            onChange={(v) => set('header_text', v)}
            placeholder="Leave blank to use global"
          />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Header size</span>
          <CustomDropdown
            value={value.header_size}
            onChange={(v) => set('header_size', v)}
            options={[USE_GLOBAL, ...HEADER_SIZE_OPTIONS]}
          />
        </div>
        <div className="md:col-span-2">
          <LabeledInput
            label="Sub-header text"
            value={value.sub_header_text}
            onChange={(v) => set('sub_header_text', v)}
            placeholder="Leave blank to use global"
          />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Sub-header size</span>
          <CustomDropdown
            value={value.sub_header_size}
            onChange={(v) => set('sub_header_size', v)}
            options={[USE_GLOBAL, ...SUB_HEADER_SIZE_OPTIONS]}
          />
        </div>
      </div>
    </div>
  );
}
