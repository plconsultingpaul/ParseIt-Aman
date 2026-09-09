import { useState, useEffect } from 'react';
import { Upload, FileText, Download, Eye, AlertTriangle, Trash2, CheckCircle, XCircle, X, Loader2 } from 'lucide-react';
import type { ApiSpec, ApiSpecEndpoint, ApiEndpointField, ApiConfig, SecondaryApiConfig } from '../../types';
import {
  fetchApiSpecs,
  uploadApiSpec,
  deleteApiSpec,
  fetchSpecEndpoints,
  fetchEndpointFields,
  parseAndSaveEndpoints,
  parseYamlToJson
} from '../../services/apiSpecService';

interface ApiSpecsSettingsProps {
  apiConfig: ApiConfig;
  secondaryApis: SecondaryApiConfig[];
}

interface ApiOption {
  type: 'base' | 'secondary';
  id: string;
  name: string;
  url: string;
}

export default function ApiSpecsSettings({ apiConfig, secondaryApis }: ApiSpecsSettingsProps) {
  const [specs, setSpecs] = useState<ApiSpec[]>([]);
  const [viewingSpec, setViewingSpec] = useState<ApiSpec | null>(null);
  const [viewingEndpoints, setViewingEndpoints] = useState<ApiSpecEndpoint[]>([]);
  const [selectedSpecEndpointId, setSelectedSpecEndpointId] = useState<string | null>(null);
  const [selectedEndpointFields, setSelectedEndpointFields] = useState<ApiEndpointField[]>([]);
  const [selectedApiOption, setSelectedApiOption] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  const [fieldTypeFilter, setFieldTypeFilter] = useState<string>('ALL');
  const [deletingSpec, setDeletingSpec] = useState<ApiSpec | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  const apiOptions: ApiOption[] = [
    ...(apiConfig.path ? [{
      type: 'base' as const,
      id: 'base',
      name: 'Base API',
      url: apiConfig.path
    }] : []),
    ...secondaryApis
      .filter(api => api.isActive)
      .map(api => ({
        type: 'secondary' as const,
        id: api.id!,
        name: api.name,
        url: api.baseUrl
      }))
  ];

  useEffect(() => {
    loadSpecs();
  }, []);

  useEffect(() => {
    if (notification?.type === 'success') {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadSpecs = async () => {
    try {
      const data = await fetchApiSpecs();
      setSpecs(data);
    } catch (error) {
      console.error('Error loading specs:', error);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string, details?: string) => {
    setNotification({ type, message, details });
  };

  const dismissNotification = () => {
    setNotification(null);
  };

  const validateFile = (file: File): { valid: boolean; error?: string; details?: string } => {
    const validExtensions = ['.json', '.yaml', '.yml'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: `Invalid file type: ${file.name}`,
        details: 'Please upload a JSON (.json) or YAML (.yaml, .yml) file containing a valid Swagger 2.0 or OpenAPI 3.0+ specification.'
      };
    }

    const maxSizeMB = 10;
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      return {
        valid: false,
        error: `File too large: ${fileSizeMB.toFixed(2)}MB`,
        details: `Maximum file size is ${maxSizeMB}MB. Please upload a smaller specification file.`
      };
    }

    return { valid: true };
  };

  const validateSpecContent = (specContent: any, fileName: string): { valid: boolean; error?: string; details?: string } => {
    if (!specContent || typeof specContent !== 'object') {
      return {
        valid: false,
        error: 'Invalid specification format',
        details: 'The file does not contain a valid JSON or YAML object.'
      };
    }

    if (!specContent.info) {
      return {
        valid: false,
        error: 'Missing required field: info',
        details: 'A valid Swagger/OpenAPI specification must include an "info" section with title and version.'
      };
    }

    if (!specContent.paths && !specContent.components) {
      return {
        valid: false,
        error: 'Missing required field: paths',
        details: 'A valid Swagger/OpenAPI specification must include a "paths" section defining at least one endpoint.'
      };
    }

    if (!specContent.info.title) {
      return {
        valid: false,
        error: 'Missing required field: info.title',
        details: 'The "info" section must include a "title" field.'
      };
    }

    return { valid: true };
  };

  const getApiNameForSpec = (spec: ApiSpec): string => {
    if (spec.api_endpoint_id === 'base') {
      return `Base API: ${apiConfig.path}`;
    }

    if (spec.secondary_api_id) {
      const api = secondaryApis.find(a => a.id === spec.secondary_api_id);
      return api ? `${api.name}: ${api.baseUrl}` : 'Unknown API';
    }

    return 'Unknown API';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    dismissNotification();

    if (!selectedApiOption) {
      showNotification('error', 'No API endpoint selected', 'Please select an API endpoint before uploading a specification.');
      return;
    }

    const fileValidation = validateFile(file);
    if (!fileValidation.valid) {
      showNotification('error', fileValidation.error!, fileValidation.details);
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress('Reading file...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        let specContent: any;

        setUploadProgress('Parsing specification...');

        const isYaml = file.name.endsWith('.yaml') || file.name.endsWith('.yml');

        try {
          if (isYaml) {
            specContent = await parseYamlToJson(content);
          } else {
            specContent = JSON.parse(content);
          }
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
          showNotification(
            'error',
            isYaml ? 'Invalid YAML syntax' : 'Invalid JSON syntax',
            `Unable to parse ${file.name}: ${errorMessage}`
          );
          setIsUploading(false);
          setUploadProgress('');
          e.target.value = '';
          return;
        }

        const contentValidation = validateSpecContent(specContent, file.name);
        if (!contentValidation.valid) {
          showNotification('error', contentValidation.error!, contentValidation.details);
          setIsUploading(false);
          setUploadProgress('');
          e.target.value = '';
          return;
        }

        setUploadProgress('Uploading specification...');

        const autoName = specContent.info?.title || file.name.replace(/\.[^/.]+$/, '');
        const autoVersion = specContent.info?.version || '1.0.0';
        const autoDescription = specContent.info?.description || '';

        const selectedOption = apiOptions.find(opt => opt.type === 'base' ? 'base' === selectedApiOption : opt.id === selectedApiOption);

        const apiEndpointId = selectedOption?.type === 'base' ? 'base' : null;
        const secondaryApiId = selectedOption?.type === 'secondary' ? selectedOption.id : null;

        const specData = await uploadApiSpec(
          apiEndpointId,
          secondaryApiId,
          autoName,
          file.name,
          specContent,
          autoVersion,
          autoDescription
        );

        setUploadProgress('Extracting endpoints...');
        await parseAndSaveEndpoints(specData.id, specContent);

        setUploadProgress('Finalizing...');
        await loadSpecs();
        setSelectedApiOption('');
        e.target.value = '';

        showNotification(
          'success',
          'API specification uploaded successfully!',
          `${autoName} (v${autoVersion}) has been processed and is ready to use.`
        );
      } catch (error) {
        console.error('Error uploading spec:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        showNotification(
          'error',
          'Failed to upload specification',
          errorMessage
        );
        e.target.value = '';
      } finally {
        setIsUploading(false);
        setUploadProgress('');
      }
    };

    reader.onerror = () => {
      showNotification('error', 'Failed to read file', 'An error occurred while reading the file. Please try again.');
      setIsUploading(false);
      setUploadProgress('');
      e.target.value = '';
    };

    reader.readAsText(file);
  };

  const handleDeleteSpec = async () => {
    if (!deletingSpec) return;

    try {
      await deleteApiSpec(deletingSpec.id);
      await loadSpecs();
      setDeletingSpec(null);
      showNotification('success', 'Specification deleted successfully', `${deletingSpec.name} has been removed.`);
    } catch (error) {
      console.error('Error deleting spec:', error);
      setDeletingSpec(null);
      showNotification('error', 'Failed to delete specification', 'An error occurred while deleting the specification. Please try again.');
    }
  };

  const handleDownloadSpec = (spec: ApiSpec) => {
    const blob = new Blob([JSON.stringify(spec.spec_content, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = spec.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleViewSpec = async (spec: ApiSpec) => {
    try {
      const endpoints = await fetchSpecEndpoints(spec.id);
      setViewingEndpoints(endpoints);
      setViewingSpec(spec);
    } catch (error) {
      console.error('Error loading endpoints:', error);
      showNotification('error', 'Failed to load spec endpoints', 'An error occurred while loading the specification endpoints. Please try again.');
    }
  };

  const handleSelectEndpoint = async (endpoint: ApiSpecEndpoint) => {
    try {
      setSelectedSpecEndpointId(endpoint.id);
      setFieldSearchQuery('');
      setFieldTypeFilter('ALL');
      const fields = await fetchEndpointFields(endpoint.id);
      setSelectedEndpointFields(fields);
    } catch (error) {
      console.error('Error loading fields:', error);
      showNotification('error', 'Failed to load endpoint fields', 'An error occurred while loading the field information. Please try again.');
    }
  };

  const closeViewer = () => {
    setViewingSpec(null);
    setViewingEndpoints([]);
    setSelectedSpecEndpointId(null);
    setSelectedEndpointFields([]);
    setMethodFilter('ALL');
    setSearchQuery('');
    setFieldSearchQuery('');
    setFieldTypeFilter('ALL');
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Upload and manage Swagger/OpenAPI specifications (JSON or YAML)
          </p>
          <div className="flex items-center gap-3">
            <select
              value={selectedApiOption}
              onChange={(e) => setSelectedApiOption(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select API Endpoint...</option>
              {apiOptions.map((option) => (
                <option key={option.type === 'base' ? 'base' : option.id} value={option.type === 'base' ? 'base' : option.id}>
                  {option.name} - {option.url}
                </option>
              ))}
            </select>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              selectedApiOption && !isUploading
                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}>
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadProgress || 'Uploading...'}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Spec
                </>
              )}
              <input
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileUpload}
                className="hidden"
                disabled={!selectedApiOption || isUploading}
              />
            </label>
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className={`mt-4 rounded-lg border p-4 ${
            notification.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
          }`}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {notification.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${
                  notification.type === 'success'
                    ? 'text-green-800 dark:text-green-300'
                    : 'text-red-800 dark:text-red-300'
                }`}>
                  {notification.message}
                </p>
                {notification.details && (
                  <p className={`mt-1 text-sm ${
                    notification.type === 'success'
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}>
                    {notification.details}
                  </p>
                )}
              </div>
              <button
                onClick={dismissNotification}
                className={`flex-shrink-0 p-1 rounded-lg transition-colors ${
                  notification.type === 'success'
                    ? 'hover:bg-green-100 dark:hover:bg-green-800'
                    : 'hover:bg-red-100 dark:hover:bg-red-800'
                }`}
              >
                <X className={`w-4 h-4 ${
                  notification.type === 'success'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {specs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
            <div className="text-lg font-medium mb-2">No API specifications uploaded</div>
            <div className="text-sm">Upload a Swagger/OpenAPI JSON or YAML file to get started</div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-4">
            {specs.map((spec) => {
              const endpointCount = (spec as any).endpoint_count?.[0]?.count || 0;

              return (
                <div key={spec.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{spec.name}</h3>
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                          v{spec.version}
                        </span>
                      </div>
                      <div className="mb-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg inline-block">
                        <span className="text-xs font-medium text-green-800 dark:text-green-300">
                          {getApiNameForSpec(spec)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>File: {spec.file_name}</span>
                        <span>Uploaded: {new Date(spec.uploaded_at).toLocaleDateString()}</span>
                        <span>{endpointCount} endpoints</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewSpec(spec)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadSpec(spec)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingSpec(spec)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {endpointCount > 0 && spec.description && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">{spec.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewingSpec && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{viewingSpec.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Version {viewingSpec.version}</p>
              </div>
              <button
                onClick={closeViewer}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <span className="text-2xl leading-none text-gray-600 dark:text-gray-400">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-6 flex flex-col">
              <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="mb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Available Endpoints</h4>
                    </div>
                    <input
                      type="text"
                      placeholder="Search endpoints..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2 flex-wrap">
                      {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                        <button
                          key={method}
                          onClick={() => setMethodFilter(method)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                            methodFilter === method
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {viewingEndpoints
                      .filter((endpoint) => {
                        const matchesMethod = methodFilter === 'ALL' || endpoint.method === methodFilter;
                        const matchesSearch = !searchQuery ||
                          endpoint.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          endpoint.summary?.toLowerCase().includes(searchQuery.toLowerCase());
                        return matchesMethod && matchesSearch;
                      })
                      .map((endpoint) => (
                      <button
                        key={endpoint.id}
                        onClick={() => handleSelectEndpoint(endpoint)}
                        className={`w-full text-left bg-gray-50 dark:bg-gray-700 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${
                          selectedSpecEndpointId === endpoint.id ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            endpoint.method === 'GET' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                            endpoint.method === 'POST' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                            endpoint.method === 'PUT' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                            endpoint.method === 'PATCH' ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' :
                            'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                          }`}>
                            {endpoint.method}
                          </span>
                          <code className="text-sm text-gray-700 dark:text-gray-300 font-mono">{endpoint.path}</code>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 ml-14">{endpoint.summary}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                  <div className="mb-3 space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Fields {selectedEndpointFields.length > 0 && (() => {
                        const filteredCount = selectedEndpointFields.filter((field) => {
                          const matchesSearch = !fieldSearchQuery ||
                            field.field_path.toLowerCase().includes(fieldSearchQuery.toLowerCase()) ||
                            field.description?.toLowerCase().includes(fieldSearchQuery.toLowerCase());
                          const matchesType = fieldTypeFilter === 'ALL' ||
                            (fieldTypeFilter === 'PARAMS' && (field.field_path.startsWith('[query]') || field.field_path.startsWith('[path]') || field.field_path.startsWith('[header]'))) ||
                            (fieldTypeFilter === 'BODY' && field.field_path.startsWith('[body]')) ||
                            (fieldTypeFilter === 'RESPONSE' && field.field_path.startsWith('[response]'));
                          return matchesSearch && matchesType;
                        }).length;
                        return filteredCount !== selectedEndpointFields.length
                          ? `(${filteredCount} of ${selectedEndpointFields.length})`
                          : `(${selectedEndpointFields.length})`;
                      })()}
                    </h4>
                    <input
                      type="text"
                      placeholder="Search fields..."
                      value={fieldSearchQuery}
                      onChange={(e) => setFieldSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2 flex-wrap">
                      {['ALL', 'PARAMS', 'BODY', 'RESPONSE'].map((type) => (
                        <button
                          key={type}
                          onClick={() => setFieldTypeFilter(type)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                            fieldTypeFilter === type
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedSpecEndpointId ? (
                    selectedEndpointFields.filter((field) => {
                      const matchesSearch = !fieldSearchQuery ||
                        field.field_path.toLowerCase().includes(fieldSearchQuery.toLowerCase()) ||
                        field.description?.toLowerCase().includes(fieldSearchQuery.toLowerCase());
                      const matchesType = fieldTypeFilter === 'ALL' ||
                        (fieldTypeFilter === 'PARAMS' && (field.field_path.startsWith('[query]') || field.field_path.startsWith('[path]') || field.field_path.startsWith('[header]'))) ||
                        (fieldTypeFilter === 'BODY' && field.field_path.startsWith('[body]')) ||
                        (fieldTypeFilter === 'RESPONSE' && field.field_path.startsWith('[response]'));
                      return matchesSearch && matchesType;
                    }).length > 0 ? (
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {selectedEndpointFields.filter((field) => {
                          const matchesSearch = !fieldSearchQuery ||
                            field.field_path.toLowerCase().includes(fieldSearchQuery.toLowerCase()) ||
                            field.description?.toLowerCase().includes(fieldSearchQuery.toLowerCase());
                          const matchesType = fieldTypeFilter === 'ALL' ||
                            (fieldTypeFilter === 'PARAMS' && (field.field_path.startsWith('[query]') || field.field_path.startsWith('[path]') || field.field_path.startsWith('[header]'))) ||
                            (fieldTypeFilter === 'BODY' && field.field_path.startsWith('[body]')) ||
                            (fieldTypeFilter === 'RESPONSE' && field.field_path.startsWith('[response]'));
                          return matchesSearch && matchesType;
                        }).map((field) => (
                          <div
                            key={field.id}
                            className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <code className="text-sm font-mono text-gray-800 dark:text-gray-200 font-medium break-all">
                                {field.field_path}
                              </code>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded whitespace-nowrap ${
                                  field.field_type === 'string' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                                  field.field_type === 'number' || field.field_type === 'integer' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                                  field.field_type === 'boolean' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' :
                                  field.field_type === 'array' ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' :
                                  field.field_type === 'object' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                                  'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                }`}>
                                  {field.field_type}
                                </span>
                                {field.is_required && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 whitespace-nowrap">
                                    required
                                  </span>
                                )}
                              </div>
                            </div>
                            {field.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 break-words">{field.description}</p>
                            )}
                            {field.format && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 break-words">Format: {field.format}</p>
                            )}
                            {field.example && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 break-words">Example: {field.example}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {selectedEndpointFields.length > 0
                            ? 'No fields match your search or filter'
                            : 'No fields found for this endpoint'}
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Click an endpoint to view its fields</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <button
                onClick={() => handleDownloadSpec(viewingSpec)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={closeViewer}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingSpec && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-start gap-4 px-6 py-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Delete API Specification?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Are you sure you want to delete this specification? This action cannot be undone.
                </p>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{deletingSpec.name}</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                      v{deletingSpec.version}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">File: {deletingSpec.file_name}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <button
                onClick={() => setDeletingSpec(null)}
                className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSpec}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
