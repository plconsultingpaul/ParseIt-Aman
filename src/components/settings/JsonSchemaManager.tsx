import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileJson, Check, X, ChevronRight, ChevronDown, Search, AlertCircle, Copy, ClipboardCheck } from 'lucide-react';
import type { OrderEntryJsonSchema } from '../../types';
import { supabase } from '../../lib/supabase';

interface JsonSchemaManagerProps {
  onSchemaSelect?: (schema: OrderEntryJsonSchema) => void;
}

export default function JsonSchemaManager({ onSchemaSelect }: JsonSchemaManagerProps) {
  const [schemas, setSchemas] = useState<OrderEntryJsonSchema[]>([]);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [schemaVersion, setSchemaVersion] = useState('1.0');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [viewJsonSchema, setViewJsonSchema] = useState<OrderEntryJsonSchema | null>(null);
  const [jsonCopied, setJsonCopied] = useState(false);

  useEffect(() => {
    loadSchemas();
  }, []);

  const loadSchemas = async () => {
    try {
      const { data, error } = await supabase
        .from('order_entry_json_schemas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const transformedSchemas: OrderEntryJsonSchema[] = (data || []).map(item => ({
        id: item.id,
        schemaName: item.schema_name,
        schemaVersion: item.schema_version,
        schemaContent: item.schema_content,
        fieldPaths: Array.isArray(item.field_paths) ? item.field_paths : [],
        isActive: item.is_active,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));

      setSchemas(transformedSchemas);

      if (transformedSchemas.length > 0 && !selectedSchemaId) {
        const activeSchema = transformedSchemas.find(s => s.isActive) || transformedSchemas[0];
        setSelectedSchemaId(activeSchema.id);
        onSchemaSelect?.(activeSchema);
      }
    } catch (err: any) {
      console.error('Failed to load schemas:', err);
    }
  };

  const extractFieldPaths = (obj: any, prefix = ''): string[] => {
    const paths: string[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return paths;
    }

    for (const key in obj) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key]) && obj[key].length > 0) {
          paths.push(`${path}[]`);
          const subPaths = extractFieldPaths(obj[key][0], `${path}[]`);
          paths.push(...subPaths);
        } else {
          const subPaths = extractFieldPaths(obj[key], path);
          paths.push(...subPaths);
        }
      }
    }

    return paths;
  };

  const validateJson = (jsonString: string): { valid: boolean; error?: string; parsed?: any } => {
    try {
      const parsed = JSON.parse(jsonString);
      return { valid: true, parsed };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  };

  const handleUpload = async () => {
    if (!jsonInput.trim()) {
      setError('Please enter JSON content');
      return;
    }

    if (!schemaName.trim()) {
      setError('Please enter a schema name');
      return;
    }

    const validation = validateJson(jsonInput);
    if (!validation.valid) {
      setError(`Invalid JSON: ${validation.error}`);
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      const fieldPaths = extractFieldPaths(validation.parsed);

      const { data, error } = await supabase
        .from('order_entry_json_schemas')
        .insert([{
          schema_name: schemaName,
          schema_version: schemaVersion,
          schema_content: validation.parsed,
          field_paths: fieldPaths,
          is_active: schemas.length === 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      setSuccess('JSON schema uploaded successfully');
      setJsonInput('');
      setSchemaName('');
      setSchemaVersion('1.0');
      await loadSchemas();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to upload schema');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonInput(content);

      if (!schemaName && file.name) {
        setSchemaName(file.name.replace('.json', ''));
      }
    };
    reader.readAsText(file);
  };

  const handleSchemaSelect = (schema: OrderEntryJsonSchema) => {
    setSelectedSchemaId(schema.id);
    onSchemaSelect?.(schema);
  };

  const toggleActive = async (schemaId: string) => {
    try {
      await supabase
        .from('order_entry_json_schemas')
        .update({ is_active: false })
        .neq('id', schemaId);

      await supabase
        .from('order_entry_json_schemas')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', schemaId);

      await loadSchemas();
    } catch (err: any) {
      setError(err.message || 'Failed to update schema');
    }
  };

  const deleteSchema = async (schemaId: string) => {
    if (!confirm('Are you sure you want to delete this schema?')) return;

    try {
      const { error } = await supabase
        .from('order_entry_json_schemas')
        .delete()
        .eq('id', schemaId);

      if (error) throw error;

      setSuccess('Schema deleted successfully');
      await loadSchemas();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete schema');
    }
  };

  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const toggleAllPaths = (expand: boolean) => {
    if (expand && selectedSchema) {
      const allParentPaths = selectedSchema.fieldPaths.filter(path => {
        const hasChildren = selectedSchema.fieldPaths.some(p => p !== path && p.startsWith(path + '.'));
        return hasChildren;
      });
      setExpandedPaths(new Set(allParentPaths));
    } else {
      setExpandedPaths(new Set());
    }
  };

  const buildTreeStructure = (paths: string[]) => {
    const tree: { path: string; children: string[]; hasChildren: boolean }[] = [];
    const pathMap = new Map<string, string[]>();

    paths.forEach(path => {
      const parts = path.split('.');
      if (parts.length === 1) {
        tree.push({ path, children: [], hasChildren: false });
      }

      for (let i = 0; i < parts.length - 1; i++) {
        const parentPath = parts.slice(0, i + 1).join('.');
        const childPath = parts.slice(0, i + 2).join('.');

        if (!pathMap.has(parentPath)) {
          pathMap.set(parentPath, []);
        }
        if (paths.includes(childPath) && !pathMap.get(parentPath)!.includes(childPath)) {
          pathMap.get(parentPath)!.push(childPath);
        }
      }
    });

    paths.forEach(path => {
      const children = pathMap.get(path) || [];
      const existingItem = tree.find(t => t.path === path);
      if (existingItem) {
        existingItem.children = children;
        existingItem.hasChildren = children.length > 0;
      } else if (!path.includes('.') || path.split('.').length === 1) {
        tree.push({ path, children, hasChildren: children.length > 0 });
      }
    });

    return { tree, pathMap };
  };

  const getVisiblePaths = (paths: string[], pathMap: Map<string, string[]>): string[] => {
    const visible: string[] = [];
    const rootPaths = paths.filter(p => !p.includes('.') || p.split('.').length === 1);

    const addPathAndChildren = (path: string) => {
      visible.push(path);
      if (expandedPaths.has(path)) {
        const children = pathMap.get(path) || [];
        children.forEach(child => {
          if (paths.includes(child)) {
            addPathAndChildren(child);
          }
        });
      }
    };

    rootPaths.forEach(addPathAndChildren);
    return visible;
  };

  const selectedSchema = schemas.find(s => s.id === selectedSchemaId);
  const filteredPaths = selectedSchema?.fieldPaths.filter(path =>
    path.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const { pathMap } = buildTreeStructure(filteredPaths);
  const displayPaths = viewMode === 'tree' && !searchQuery ? getVisiblePaths(filteredPaths, pathMap) : filteredPaths;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">JSON Schema Management</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Upload JSON schemas to auto-populate field paths for API mapping
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h4>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <p className="text-sm text-purple-800 dark:text-purple-300">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Upload New Schema</h4>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Schema Name
                </label>
                <input
                  type="text"
                  value={schemaName}
                  onChange={(e) => setSchemaName(e.target.value)}
                  placeholder="e.g., Order Schema"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Version
                </label>
                <input
                  type="text"
                  value={schemaVersion}
                  onChange={(e) => setSchemaVersion(e.target.value)}
                  placeholder="1.0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload JSON File or Paste Content
                </label>
                <div className="flex items-center space-x-2 mb-2">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors">
                      <Upload className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Choose File</span>
                    </div>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='{"order": {"id": "123", "customer": {"name": "John", "email": "john@example.com"}}}'
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-mono focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading || !jsonInput.trim() || !schemaName.trim()}
                className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {uploading ? 'Uploading...' : 'Upload Schema'}
              </button>
            </div>
          </div>

          {schemas.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Existing Schemas</h4>
              <div className="space-y-2">
                {schemas.map(schema => (
                  <div
                    key={schema.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedSchemaId === schema.id
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                    onClick={() => handleSchemaSelect(schema)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileJson className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {schema.schemaName}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            v{schema.schemaVersion} • {schema.fieldPaths.length} paths
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {schema.isActive && (
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded">
                            Active
                          </span>
                        )}
                        {!schema.isActive && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActive(schema.id);
                            }}
                            className="text-xs text-gray-500 hover:text-purple-600 dark:hover:text-purple-400"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewJsonSchema(schema);
                            setJsonCopied(false);
                          }}
                          className="p-1 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                          title="View JSON"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSchema(schema.id);
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Field Paths</h4>
            {selectedSchema && (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {filteredPaths.length} paths
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => toggleAllPaths(true)}
                    className="text-xs px-2 py-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                    title="Expand All"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={() => toggleAllPaths(false)}
                    className="text-xs px-2 py-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                    title="Collapse All"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedSchema ? (
            <>
              <div className="mb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search paths..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-1">
                {displayPaths.map((path, index) => {
                  const isArrayPath = path.includes('[]');
                  const depth = path.split('.').length - 1;
                  const paddingLeft = depth * 16;
                  const hasChildren = (pathMap.get(path) || []).length > 0;
                  const isExpanded = expandedPaths.has(path);

                  return (
                    <div
                      key={index}
                      className="flex items-center text-sm font-mono text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-2 py-1.5 group"
                      style={{ paddingLeft: `${paddingLeft + 8}px` }}
                    >
                      {viewMode === 'tree' && !searchQuery && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasChildren) {
                              togglePath(path);
                            }
                          }}
                          className={`mr-1 ${hasChildren ? 'cursor-pointer' : 'invisible'}`}
                        >
                          {hasChildren && (
                            isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                            )
                          )}
                        </button>
                      )}
                      {isArrayPath && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded mr-2">
                          array
                        </span>
                      )}
                      <span
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(path);
                          setSuccess(`Copied: ${path}`);
                          setTimeout(() => setSuccess(null), 2000);
                        }}
                      >
                        {path}
                      </span>
                      <Check className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <FileJson className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload or select a schema to view field paths
              </p>
            </div>
          )}
        </div>
      </div>

      {viewJsonSchema && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {viewJsonSchema.schemaName}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  v{viewJsonSchema.schemaVersion} — JSON Schema Content
                </p>
              </div>
              <button
                onClick={() => setViewJsonSchema(null)}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(viewJsonSchema.schemaContent, null, 2)}
              </pre>
            </div>
            <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(viewJsonSchema.schemaContent, null, 2));
                  setJsonCopied(true);
                  setTimeout(() => setJsonCopied(false), 2000);
                }}
                className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  jsonCopied
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {jsonCopied ? (
                  <>
                    <ClipboardCheck className="h-4 w-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
