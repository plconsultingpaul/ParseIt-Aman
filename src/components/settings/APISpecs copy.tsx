import { useState, useEffect } from 'react';
import { Plus, Trash2, Upload, FileText, Download, Eye, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface APISpec {
  id: string;
  trading_partner_id: string;
  name: string;
  file_name: string;
  spec_content: any;
  version: string;
  description: string;
  uploaded_at: string;
}

interface APISpecsProps {
  partnerId: string;
}

export default function APISpecs({ partnerId }: APISpecsProps) {
  const [specs, setSpecs] = useState<APISpec[]>([]);
  const [apiEndpoints, setApiEndpoints] = useState<any[]>([]);
  const [uploadingSpec, setUploadingSpec] = useState(false);
  const [viewingSpec, setViewingSpec] = useState<APISpec | null>(null);
  const [viewingEndpoints, setViewingEndpoints] = useState<any[]>([]);
  const [selectedSpecEndpointId, setSelectedSpecEndpointId] = useState<string | null>(null);
  const [selectedEndpointFields, setSelectedEndpointFields] = useState<any[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [newSpec, setNewSpec] = useState({
    name: '',
    version: '1.0.0',
    description: '',
  });
  const [deletingSpec, setDeletingSpec] = useState<APISpec | null>(null);

  useEffect(() => {
    loadSpecs();
    loadApiEndpoints();
  }, [partnerId]);

  const loadApiEndpoints = async () => {
    const { data, error } = await supabase
      .from('api_endpoints')
      .select('*')
      .eq('trading_partner_id', partnerId)
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setApiEndpoints(data);
    }
  };

  const loadSpecs = async () => {
    const { data, error } = await supabase
      .from('api_specs')
      .select(`
        *,
        api_endpoint:api_endpoints(id, name, base_url),
        endpoint_count:api_spec_endpoints(count)
      `)
      .eq('trading_partner_id', partnerId)
      .order('uploaded_at', { ascending: false });

    if (!error && data) {
      setSpecs(data);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedEndpointId) {
      alert('Please select an API endpoint first');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const specContent = JSON.parse(content);

        const autoName = specContent.info?.title || file.name.replace(/\.[^/.]+$/, '');
        const autoVersion = specContent.info?.version || '1.0.0';
        const autoDescription = specContent.info?.description || '';

        setNewSpec({
          name: autoName,
          version: autoVersion,
          description: autoDescription,
        });

        const { data: specData, error: specError } = await supabase
          .from('api_specs')
          .insert([{
            trading_partner_id: partnerId,
            api_endpoint_id: selectedEndpointId,
            name: autoName,
            file_name: file.name,
            spec_content: specContent,
            version: autoVersion,
            description: autoDescription,
            uploaded_at: new Date().toISOString(),
          }])
          .select()
          .single();

        if (!specError && specData) {
          // Parse and save endpoints
          await parseAndSaveEndpoints(specData.id, selectedEndpointId, specContent);

          loadSpecs();
          setUploadingSpec(false);
          setSelectedEndpointId('');
          setNewSpec({ name: '', version: '1.0.0', description: '' });
        } else {
          alert('Failed to upload spec: ' + specError.message);
        }
      } catch (error) {
        alert('Invalid JSON file. Please upload a valid Swagger/OpenAPI specification.');
      }
    };
    reader.readAsText(file);
  };

  const parseAndSaveEndpoints = async (specId: string, endpointId: string, specContent: any) => {
    const endpoints: any[] = [];

    if (specContent.paths) {
      Object.entries(specContent.paths).forEach(([path, methods]: [string, any]) => {
        Object.entries(methods).forEach(([method, details]: [string, any]) => {
          // Skip internal OpenAPI fields
          if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method.toLowerCase())) {
            // Remove leading slash from path for consistency
            const cleanPath = path.startsWith('/') ? path.substring(1) : path;

            endpoints.push({
              api_spec_id: specId,
              api_endpoint_id: endpointId,
              path: cleanPath,
              method: method.toUpperCase(),
              summary: details.summary || details.description || '',
              parameters: details.parameters || [],
              request_body: details.requestBody || null,
              responses: details.responses || {},
            });
          }
        });
      });
    }

    console.log(`Parsed ${endpoints.length} endpoints from spec`);

    if (endpoints.length > 0) {
      // Insert in batches to avoid payload size limits
      const batchSize = 100;
      for (let i = 0; i < endpoints.length; i += batchSize) {
        const batch = endpoints.slice(i, i + batchSize);
        const { data: insertedEndpoints, error } = await supabase
          .from('api_spec_endpoints')
          .insert(batch)
          .select();

        if (error) {
          console.error('Error inserting batch:', error);
          alert(`Error saving endpoints: ${error.message}`);
        } else if (insertedEndpoints) {
          // Parse and save fields for each endpoint
          await parseAndSaveFields(insertedEndpoints, specContent);
        }
      }
    }
  };

  const parseAndSaveFields = async (endpoints: any[], specContent: any) => {
    const allFields: any[] = [];

    for (const endpoint of endpoints) {
      const fields = extractFieldsFromEndpoint(endpoint, specContent);
      allFields.push(...fields);
    }

    if (allFields.length > 0) {
      const { error } = await supabase
        .from('api_endpoint_fields')
        .insert(allFields);

      if (error) {
        console.error('Error saving fields:', error);
      } else {
        console.log(`Saved ${allFields.length} fields`);
      }
    }
  };

  const resolveReference = (ref: string, specContent: any): any => {
    if (!ref || !ref.startsWith('#/')) return null;

    const parts = ref.substring(2).split('/');
    let current = specContent;

    for (const part of parts) {
      if (!current || typeof current !== 'object') return null;
      current = current[part];
    }

    return current;
  };

  const extractFieldsFromEndpoint = (endpoint: any, specContent: any) => {
    const fields: any[] = [];

    // Extract parameters (query, path, header parameters)
    if (endpoint.parameters && Array.isArray(endpoint.parameters)) {
      endpoint.parameters.forEach((paramRef: any) => {
        let param = paramRef;

        if (paramRef.$ref) {
          const resolved = resolveReference(paramRef.$ref, specContent);
          if (resolved) {
            param = { ...resolved, ...paramRef };
            delete param.$ref;
          } else {
            console.warn(`Could not resolve reference: ${paramRef.$ref}`);
            return;
          }
        }
        const paramSchema = param.schema || {};
        const paramType = paramSchema.type || 'string';
        const paramIn = param.in || 'query';

        let description = param.description || '';
        if (paramSchema.enum) {
          description += description ? ' ' : '';
          description += `Allowed values: ${paramSchema.enum.join(', ')}`;
        }
        if (paramSchema.default !== undefined) {
          description += description ? ' ' : '';
          description += `Default: ${paramSchema.default}`;
        }
        if (paramSchema.minimum !== undefined || paramSchema.maximum !== undefined) {
          const constraints = [];
          if (paramSchema.minimum !== undefined) constraints.push(`min: ${paramSchema.minimum}`);
          if (paramSchema.maximum !== undefined) constraints.push(`max: ${paramSchema.maximum}`);
          description += description ? ' ' : '';
          description += `(${constraints.join(', ')})`;
        }
        if (paramSchema.pattern) {
          description += description ? ' ' : '';
          description += `Pattern: ${paramSchema.pattern}`;
        }

        fields.push({
          api_spec_endpoint_id: endpoint.id,
          field_name: param.name,
          field_path: `[${paramIn}] ${param.name}`,
          field_type: paramType,
          is_required: param.required || false,
          description: description,
          example: param.example ? String(param.example) : (paramSchema.example ? String(paramSchema.example) : null),
          format: paramSchema.format || param.format || null,
          parent_field_id: null,
        });

        // Handle array parameters with items
        if (paramType === 'array' && paramSchema.items) {
          const itemType = paramSchema.items.type || 'string';
          if (paramSchema.items.enum) {
            description += description ? ' ' : '';
            description += `Item values: ${paramSchema.items.enum.join(', ')}`;
          }
        }
      });
    }

    // Get the schema from request body
    const requestBody = endpoint.request_body;
    if (!requestBody) return fields;

    const schema = requestBody.content?.['application/json']?.schema;
    if (!schema) return fields;

    // Resolve schema reference if it exists
    const resolvedSchema = schema.$ref
      ? resolveSchemaRef(schema.$ref, specContent)
      : schema;

    if (!resolvedSchema) return fields;

    // Extract fields recursively
    const extractFields = (properties: any, requiredFields: string[] = [], parentPath = '') => {
      if (!properties) return;

      Object.entries(properties).forEach(([fieldName, fieldDef]: [string, any]) => {
        const fieldPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;

        fields.push({
          api_spec_endpoint_id: endpoint.id,
          field_name: fieldName,
          field_path: fieldPath,
          field_type: fieldDef.type || 'string',
          is_required: requiredFields.includes(fieldName),
          description: fieldDef.description || '',
          example: fieldDef.example ? String(fieldDef.example) : null,
          format: fieldDef.format || null,
          parent_field_id: null,
        });

        // Handle nested objects
        if (fieldDef.type === 'object' && fieldDef.properties) {
          extractFields(fieldDef.properties, fieldDef.required || [], fieldPath);
        }

        // Handle arrays of objects
        if (fieldDef.type === 'array' && fieldDef.items?.properties) {
          extractFields(fieldDef.items.properties, fieldDef.items.required || [], `${fieldPath}[]`);
        }

        // Handle array items with $ref
        if (fieldDef.type === 'array' && fieldDef.items?.$ref) {
          const itemSchema = resolveSchemaRef(fieldDef.items.$ref, specContent);
          if (itemSchema?.properties) {
            extractFields(itemSchema.properties, itemSchema.required || [], `${fieldPath}[]`);
          }
        }
      });
    };

    extractFields(resolvedSchema.properties, resolvedSchema.required || []);

    return fields;
  };

  const resolveSchemaRef = (ref: string, specContent: any) => {
    // Handle $ref like "#/components/schemas/Customer"
    const parts = ref.split('/').filter(p => p !== '#');
    let schema = specContent;

    for (const part of parts) {
      schema = schema?.[part];
    }

    return schema;
  };

  const handleDeleteSpec = async () => {
    if (!deletingSpec) return;

    const { error } = await supabase
      .from('api_specs')
      .delete()
      .eq('id', deletingSpec.id);

    if (!error) {
      loadSpecs();
      setDeletingSpec(null);
    } else {
      alert('Failed to delete specification: ' + error.message);
    }
  };

  const handleDownloadSpec = (spec: APISpec) => {
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

  const extractEndpoints = (spec: any) => {
    const endpoints: Array<{ method: string; path: string; summary: string }> = [];

    if (spec.paths) {
      Object.entries(spec.paths).forEach(([path, methods]: [string, any]) => {
        Object.entries(methods).forEach(([method, details]: [string, any]) => {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
            endpoints.push({
              method: method.toUpperCase(),
              path,
              summary: details.summary || details.description || 'No description',
            });
          }
        });
      });
    }

    return endpoints;
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            Upload and manage Swagger/OpenAPI specifications
          </p>
          <div className="flex items-center gap-3">
            <select
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select API Endpoint...</option>
              {apiEndpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name} - {endpoint.base_url}
                </option>
              ))}
            </select>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              selectedEndpointId
                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}>
              <Upload className="w-4 h-4" />
              Upload Spec
              <input
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileUpload}
                className="hidden"
                disabled={!selectedEndpointId}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {specs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <div className="text-lg font-medium mb-2">No API specifications uploaded</div>
            <div className="text-sm">Upload a Swagger/OpenAPI JSON file to get started</div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-4">
            {specs.map((spec) => {
              const endpointCount = (spec as any).endpoint_count?.[0]?.count || 0;

              return (
                <div key={spec.id} className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-slate-800">{spec.name}</h3>
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                          v{spec.version}
                        </span>
                      </div>
                      {(spec as any).api_endpoint && (
                        <div className="mb-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg inline-block">
                          <span className="text-xs font-medium text-green-800">
                            {(spec as any).api_endpoint.name}: {(spec as any).api_endpoint.base_url}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>File: {spec.file_name}</span>
                        <span>Uploaded: {new Date(spec.uploaded_at).toLocaleDateString()}</span>
                        <span>{endpointCount} endpoints</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingSpec(spec)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadSpec(spec)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingSpec(spec)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {endpointCount > 0 && (
                    <div className="border-t border-slate-200 pt-4">
                      <button
                        onClick={async () => {
                          const { data } = await supabase
                            .from('api_spec_endpoints')
                            .select('*')
                            .eq('api_spec_id', spec.id)
                            .order('path');

                          if (data) {
                            setViewingEndpoints(data);
                            setViewingSpec(spec);
                          }
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View {endpointCount} available endpoints →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewingSpec && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">{viewingSpec.name}</h3>
                <p className="text-sm text-slate-600">Version {viewingSpec.version}</p>
              </div>
              <button
                onClick={() => {
                  setViewingSpec(null);
                  setViewingEndpoints([]);
                  setSelectedSpecEndpointId(null);
                  setSelectedEndpointFields([]);
                  setMethodFilter('ALL');
                  setSearchQuery('');
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-6 flex flex-col">
              <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                  <div className="mb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-700">Available Endpoints</h4>
                    </div>
                    <input
                      type="text"
                      placeholder="Search endpoints..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                        <button
                          key={method}
                          onClick={() => setMethodFilter(method)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                            methodFilter === method
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {viewingEndpoints
                      .filter((endpoint) => {
                        const matchesMethod = methodFilter === 'ALL' || endpoint.method === methodFilter;
                        const matchesSearch = !searchQuery ||
                          endpoint.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          endpoint.summary?.toLowerCase().includes(searchQuery.toLowerCase());
                        return matchesMethod && matchesSearch;
                      })
                      .map((endpoint, index) => (
                      <button
                        key={index}
                        onClick={async () => {
                          setSelectedSpecEndpointId(endpoint.id);
                          const { data: fields } = await supabase
                            .from('api_endpoint_fields')
                            .select('*')
                            .eq('api_spec_endpoint_id', endpoint.id)
                            .order('field_path');

                          if (fields) {
                            setSelectedEndpointFields(fields);
                          }
                        }}
                        className={`w-full text-left bg-slate-50 rounded-lg p-3 hover:bg-slate-100 transition-colors ${
                          selectedSpecEndpointId === endpoint.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            endpoint.method === 'GET' ? 'bg-blue-100 text-blue-700' :
                            endpoint.method === 'POST' ? 'bg-green-100 text-green-700' :
                            endpoint.method === 'PUT' ? 'bg-yellow-100 text-yellow-700' :
                            endpoint.method === 'PATCH' ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {endpoint.method}
                          </span>
                          <code className="text-sm text-slate-700 font-mono">{endpoint.path}</code>
                        </div>
                        <p className="text-sm text-slate-600 ml-14">{endpoint.summary}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">
                    Fields {selectedEndpointFields.length > 0 && `(${selectedEndpointFields.length})`}
                  </h4>
                  {selectedSpecEndpointId ? (
                    selectedEndpointFields.length > 0 ? (
                      <div className="flex-1 overflow-y-auto space-y-2">
                        {selectedEndpointFields.map((field) => (
                          <div
                            key={field.id}
                            className="bg-white border border-slate-200 rounded-lg p-3"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <code className="text-sm font-mono text-slate-800 font-medium break-all">
                                {field.field_path}
                              </code>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className={`px-1.5 py-0.5 text-xs font-medium rounded whitespace-nowrap ${
                                  field.field_type === 'string' ? 'bg-blue-100 text-blue-700' :
                                  field.field_type === 'number' || field.field_type === 'integer' ? 'bg-green-100 text-green-700' :
                                  field.field_type === 'boolean' ? 'bg-purple-100 text-purple-700' :
                                  field.field_type === 'array' ? 'bg-orange-100 text-orange-700' :
                                  field.field_type === 'object' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {field.field_type}
                                </span>
                                {field.is_required && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 whitespace-nowrap">
                                    required
                                  </span>
                                )}
                              </div>
                            </div>
                            {field.description && (
                              <p className="text-xs text-slate-600 mb-1 break-words">{field.description}</p>
                            )}
                            {field.format && (
                              <p className="text-xs text-slate-500 break-words">Format: {field.format}</p>
                            )}
                            {field.example && (
                              <p className="text-xs text-slate-500 break-words">Example: {field.example}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500">No fields found for this endpoint</p>
                      </div>
                    )
                  ) : (
                    <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-lg">
                      <p className="text-sm text-slate-500">Click an endpoint to view its fields</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => handleDownloadSpec(viewingSpec)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={() => {
                  setViewingSpec(null);
                  setViewingEndpoints([]);
                  setSelectedSpecEndpointId(null);
                  setSelectedEndpointFields([]);
                  setMethodFilter('ALL');
                  setSearchQuery('');
                }}
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-start gap-4 px-6 py-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Delete API Specification?
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Are you sure you want to delete this specification? This action cannot be undone.
                </p>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">{deletingSpec.name}</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                      v{deletingSpec.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 ml-6">File: {deletingSpec.file_name}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setDeletingSpec(null)}
                className="flex-1 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
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
