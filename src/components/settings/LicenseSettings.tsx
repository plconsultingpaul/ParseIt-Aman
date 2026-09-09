import { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, Clock, Shield, FileText, RefreshCw, Camera, Building2, Package, Play, AlertTriangle } from 'lucide-react';
import { useLicense } from '../../hooks/useLicense';
import type { LicenseFeatureKey } from '../../hooks/useLicense';

const FEATURE_CONFIG: {
  key: LicenseFeatureKey;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { key: 'extract', label: 'Extractions', description: 'Extract sidebar & Extraction Types settings', icon: FileText },
  { key: 'transform', label: 'Transformations', description: 'Transform sidebar & Transformation Types settings', icon: RefreshCw },
  { key: 'execute', label: 'Execute Flows', description: 'Execute sidebar & Execute Setup settings', icon: Play },
  { key: 'clientSetup', label: 'Client Portal', description: 'Client Setup sidebar', icon: Building2 },
  { key: 'vendorSetup', label: 'Vendor Portal', description: 'Vendor Setup sidebar', icon: Package },
  { key: 'imaging', label: 'Imaging', description: 'Imaging module (Coming Soon)', icon: Camera },
];

export default function LicenseSettings() {
  const { license, isExpired, uploadLicense } = useLicense();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccessMessage(null);
    setUploading(true);

    try {
      const content = await file.text();
      const result = await uploadLicense(content);

      if (result.success) {
        setSuccessMessage('License uploaded and validated successfully.');
      } else {
        setError(result.error || 'Failed to validate license file.');
      }
    } catch (err) {
      setError('An unexpected error occurred while uploading the license.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">License Management</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Upload and manage your Parse-It license to control feature access.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
            Select a <code className="bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">.license</code> file to validate and activate.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".license"
            onChange={handleFileUpload}
            className="hidden"
            id="license-upload"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            {uploading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload License
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700 dark:text-green-300">{successMessage}</p>
          </div>
        )}
      </div>

      {license ? (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
            <div className="px-6 py-3 flex items-center flex-wrap gap-x-6 gap-y-1">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mr-auto">License Details</h4>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Customer:</span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{license.customerName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Issued:</span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{formatDate(license.issuedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Expiry:</span>
                {license.expiryDate ? (
                  <span className={`text-xs font-medium ${isExpired ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {formatDate(license.expiryDate)}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-100">No expiry</span>
                )}
                {isExpired && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    Expired
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Uploaded:</span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{formatDate(license.uploadedAt)}</span>
              </div>
            </div>
          </div>

          {isExpired && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">License has expired</p>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                  Your license expired on {formatDate(license.expiryDate)}. Please contact your administrator for a renewed license.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Licensed Features</h4>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURE_CONFIG.map((feature) => {
                const enabled = license[feature.key];
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.key}
                    className={`relative p-4 rounded-lg border transition-colors ${
                      enabled
                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                        : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          enabled
                            ? 'bg-green-100 dark:bg-green-900/30'
                            : 'bg-gray-100 dark:bg-gray-600'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            enabled
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              enabled
                                ? 'text-green-900 dark:text-green-100'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {feature.label}
                          </span>
                          {feature.key === 'imaging' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              Coming Soon
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-xs mt-0.5 ${
                            enabled
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {feature.description}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {enabled ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-gray-300 dark:text-gray-500" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <Shield className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No License Uploaded</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Upload a valid license file to enable features. All licensed features will remain locked until a license is activated.
          </p>
        </div>
      )}
    </div>
  );
}
