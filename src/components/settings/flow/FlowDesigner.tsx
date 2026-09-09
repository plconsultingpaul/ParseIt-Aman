import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, Save, Plus, Trash2, Users, Globe, GitBranch, Mail, Loader2, AlertTriangle, Play, ChevronLeft, ChevronRight, Check, AlertCircle, CheckCircle, HelpCircle, LogOut, RotateCcw, Sparkles, MapPin, ExternalLink, Signpost, TextCursorInput, Info, Wand2, Repeat, MousePointerClick } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase, getAuthHeaders } from '../../../lib/supabase';
import { nodeTypes } from './FlowNodes';
import StepConfigForm from '../workflow/StepConfigForm';
import { TextField, NumberField, DateField, DateTimeField, PhoneField, ZipField, PostalCodeField, ProvinceField, StateField, DropdownField } from '../../form-fields';
import FlowExecutionModal, { ExecuteButtonGroup as FlowExecutionGroup, ExecuteButtonField as FlowExecutionField, FlowNodeMapping } from '../../common/FlowExecutionModal';

interface ExecuteButtonGroup {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isArrayGroup: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  arrayFieldName: string;
}

interface ExecuteButtonField {
  id: string;
  groupId: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  isRequired?: boolean;
  defaultValue?: string | null;
  options?: any[];
  dropdownDisplayMode?: 'description_only' | 'value_and_description';
  sortOrder?: number;
  placeholder?: string | null;
  helpText?: string | null;
  maxLength?: number | null;
  conditionalRequiredFieldId?: string | null;
  conditionalRequiredOperator?: string | null;
  conditionalRequiredValue?: string | null;
  apiLookupEndpoint?: string | null;
  apiLookupSecondaryApiId?: string | null;
  apiLookupHttpMethod?: string | null;
  apiLookupSearchParam?: string | null;
  apiLookupValueField?: string | null;
  apiLookupDisplayColumns?: { field: string; label: string }[] | null;
  apiLookupFieldMappings?: { responseField: string; targetFieldName: string }[] | null;
  apiLookupRequestBody?: string | null;
  apiLookupRequestBodyMappings?: { fieldName: string; type: 'hardcoded' | 'variable' | 'search'; value: string; dataType?: string }[] | null;
  apiLookupWrapBodyInArray?: boolean;
}

interface StepResult {
  node?: string;
  step?: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: any;
  error?: string;
  requestUrl?: string;
  requestBody?: string;
  httpMethod?: string;
}

interface FieldMappingsModalProps {
  groupName: string;
  fields: { fieldKey: string; name: string }[];
  availableVariables: { path: string; label: string; source: string }[];
  currentMappings: Record<string, { variablePath: string; applyCondition: string }>;
  currentHeaderContent: string;
  currentDisplayWithPrevious: boolean;
  currentHeaderCurrentLoopItemOnly: boolean;
  isInsideForEachLoop: boolean;
  isFirstGroup: boolean;
  onSave: (mappings: Record<string, { variablePath: string; applyCondition: string }>, headerContent: string, displayWithPrevious: boolean, headerCurrentLoopItemOnly: boolean) => void;
  onClose: () => void;
}

function FieldMappingsModal({
  groupName,
  fields,
  availableVariables,
  currentMappings,
  currentHeaderContent,
  currentDisplayWithPrevious,
  currentHeaderCurrentLoopItemOnly,
  isInsideForEachLoop,
  isFirstGroup,
  onSave,
  onClose,
}: FieldMappingsModalProps) {
  const [mappings, setMappings] = useState<Record<string, { variablePath: string; applyCondition: string }>>(currentMappings);
  const [headerContent, setHeaderContent] = useState(currentHeaderContent);
  const [displayWithPrevious, setDisplayWithPrevious] = useState(currentDisplayWithPrevious);
  const [headerCurrentLoopItemOnly, setHeaderCurrentLoopItemOnly] = useState(currentHeaderCurrentLoopItemOnly);
  const headerTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleMappingChange = (fieldKey: string, variablePath: string) => {
    setMappings((prev) => {
      if (variablePath === '') {
        const newMappings = { ...prev };
        delete newMappings[fieldKey];
        return newMappings;
      }
      return {
        ...prev,
        [fieldKey]: {
          variablePath,
          applyCondition: prev[fieldKey]?.applyCondition || 'always'
        }
      };
    });
  };

  const handleConditionChange = (fieldKey: string, applyCondition: string) => {
    setMappings((prev) => {
      if (!prev[fieldKey]) return prev;
      return {
        ...prev,
        [fieldKey]: {
          ...prev[fieldKey],
          applyCondition
        }
      };
    });
  };

  const handleSave = () => {
    onSave(mappings, headerContent, displayWithPrevious, headerCurrentLoopItemOnly);
  };

  const insertVariable = (variablePath: string) => {
    const textarea = headerTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = headerContent.slice(0, start) + `{{${variablePath}}}` + headerContent.slice(end);
    setHeaderContent(newValue);
    setTimeout(() => {
      textarea.focus();
      const newPos = start + variablePath.length + 4;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const groupedVariables = availableVariables.reduce((acc, variable) => {
    if (!acc[variable.source]) {
      acc[variable.source] = [];
    }
    acc[variable.source].push(variable);
    return acc;
  }, {} as Record<string, typeof availableVariables>);

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Field Mappings - {groupName}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Map workflow variables to pre-populate form fields
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Header Content (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Add instructions or notes that will appear above the form fields. Use variables to display dynamic values.
              </p>
            </div>
            <textarea
              ref={headerTextareaRef}
              value={headerContent}
              onChange={(e) => setHeaderContent(e.target.value)}
              placeholder="e.g., Please enter contacts for {{response.clientName}}..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            {isInsideForEachLoop && (
              <label className="mt-3 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={headerCurrentLoopItemOnly}
                  onChange={(e) => setHeaderCurrentLoopItemOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Show current loop iteration only
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    When on, array variables in the header (e.g. {'{{response.fbBarcode}}'}) resolve to the current iteration's value instead of expanding to one line per element.
                  </span>
                </span>
              </label>
            )}
            {availableVariables.length > 0 && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400">Insert variable:</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      insertVariable(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select variable...</option>
                  {Object.entries(groupedVariables).map(([source, vars]) => (
                    <optgroup key={source} label={source}>
                      {vars.map((v) => (
                        <option key={v.path} value={v.path}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No fields in this group
            </div>
          ) : availableVariables.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                No variables available yet. Add AI Lookup or API Endpoint steps before this group to create variables.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => (
                <div key={field.fieldKey} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="mb-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {field.name}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{field.fieldKey}</p>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Variable to map</label>
                      <select
                        value={mappings[field.fieldKey]?.variablePath || ''}
                        onChange={(e) => handleMappingChange(field.fieldKey, e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">-- Leave empty (user enters value) --</option>
                        {Object.entries(groupedVariables).map(([source, vars]) => (
                          <optgroup key={source} label={source}>
                            {vars.map((v) => (
                              <option key={v.path} value={v.path}>
                                {v.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    {mappings[field.fieldKey]?.variablePath && (
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Apply condition</label>
                        <select
                          value={mappings[field.fieldKey]?.applyCondition || 'always'}
                          onChange={(e) => handleConditionChange(field.fieldKey, e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="always">Always apply (any path)</option>
                          <option value="on_success">Only on Success/Yes path</option>
                          <option value="on_failure">Only on Failure/No path</option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {mappings[field.fieldKey]?.applyCondition === 'on_success' && 'Field will only pre-populate when reaching this group via a success/yes edge'}
                          {mappings[field.fieldKey]?.applyCondition === 'on_failure' && 'Field will only pre-populate when reaching this group via a failure/no edge'}
                          {mappings[field.fieldKey]?.applyCondition === 'always' && 'Field will pre-populate regardless of which path was taken'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isFirstGroup && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={displayWithPrevious}
                  onChange={(e) => setDisplayWithPrevious(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Display with previous group
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    When enabled, this group will be shown on the same page as the previous group
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Mappings
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

interface FlowNodeMapping {
  nodeId: string;
  groupId: string;
  fieldMappings: Record<string, { variablePath: string; applyCondition: string }>;
  headerContent?: string;
  displayWithPrevious?: boolean;
  headerCurrentLoopItemOnly?: boolean;
}

interface TestFlowModalProps {
  buttonId: string;
  buttonName: string;
  groups: ExecuteButtonGroup[];
  fields: ExecuteButtonField[];
  flowNodeMappings: FlowNodeMapping[];
  onClose: () => void;
}

function renderSimpleMarkdown(md: string): string {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><h([123])>/g, '<h$1>');
  html = html.replace(/<\/h([123])><\/p>/g, '</h$1>');
  html = html.replace(/<p><ul>/g, '<ul>');
  html = html.replace(/<\/ul><\/p>/g, '</ul>');
  html = html.replace(/<p><\/p>/g, '');
  return html;
}

function BrandingLogoImage({ maxHeight }: { maxHeight: number }) {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('company_branding')
        .select('logo_storage_path')
        .maybeSingle();
      if (data?.logo_storage_path) {
        const { data: urlData } = supabase.storage
          .from('pdfs')
          .getPublicUrl(data.logo_storage_path);
        if (urlData?.publicUrl) setLogoUrl(urlData.publicUrl);
      }
    })();
  }, []);

  if (!logoUrl) return null;
  return (
    <img
      src={logoUrl}
      alt="Company Logo"
      style={{ maxHeight: `${maxHeight}px` }}
      className="w-auto object-contain mb-6"
    />
  );
}

function TestFlowModal({ buttonId, buttonName, groups, fields, flowNodeMappings, onClose }: TestFlowModalProps) {
  console.log('[TestFlowModal] Received fields prop:', fields.map(f => ({ id: f.id, name: f.name, fieldType: f.fieldType, options: f.options })));
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [arrayData, setArrayData] = useState<Record<string, Record<string, any>[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionComplete, setExecutionComplete] = useState(false);
  const [executionResults, setExecutionResults] = useState<{
    success: boolean;
    results: StepResult[];
    error?: string;
    contextData?: any;
  } | null>(null);
  const [confirmationPrompt, setConfirmationPrompt] = useState<{
    promptMessage: string;
    yesButtonLabel: string;
    noButtonLabel: string;
    pendingContextData: any;
    showLocationMap?: boolean;
    latitude?: number | null;
    longitude?: number | null;
  } | null>(null);
  const [exitData, setExitData] = useState<{
    exitMessage: string;
    showRestartButton: boolean;
  } | null>(null);
  const [userInformationData, setUserInformationData] = useState<{
    contentMarkdown: string;
    continueButtonLabel: string;
    imageSource: string;
    customImageUrl: string;
    imageMaxHeight: number;
    pendingContextData: any;
  } | null>(null);
  const [contextData, setContextData] = useState<any>(null);

  const combinedSteps = React.useMemo(() => {
    const steps: ExecuteButtonGroup[][] = [];
    groups.forEach((group, index) => {
      const nodeMapping = flowNodeMappings.find(m => m.groupId === group.id);
      const displayWithPrevious = nodeMapping?.displayWithPrevious || false;
      if (index === 0 || !displayWithPrevious) {
        steps.push([group]);
      } else {
        steps[steps.length - 1].push(group);
      }
    });
    return steps;
  }, [groups, flowNodeMappings]);

  const currentStepGroups = combinedSteps[currentStep] || [];
  const totalSteps = combinedSteps.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  const resolveVariable = useCallback((template: string, ctx: any): string => {
    if (!template || typeof template !== 'string' || !ctx) return template;

    const resolvePathValue = (pathStr: string): any => {
      const parts = pathStr.trim().split('.');
      let value: any = ctx;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          return undefined;
        }
      }
      return value;
    };

    const lines = template.split('\n');
    const resolvedLines: string[] = [];

    for (const line of lines) {
      const varMatches = [...line.matchAll(/\{\{([^}]+)\}\}/g)];
      const arrayVar = varMatches.find(m => {
        const val = resolvePathValue(m[1]);
        return Array.isArray(val);
      });

      if (arrayVar) {
        const arrayValues = resolvePathValue(arrayVar[1]) as any[];
        for (const item of arrayValues) {
          let expandedLine = line;
          expandedLine = expandedLine.replace(new RegExp(`\\{\\{\\s*${arrayVar[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`), String(item));
          expandedLine = expandedLine.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const val = resolvePathValue(path);
            if (val === undefined || val === null) return match;
            if (Array.isArray(val)) return val.join(', ');
            return String(val);
          });
          resolvedLines.push(expandedLine);
        }
      } else {
        resolvedLines.push(line.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
          const val = resolvePathValue(path);
          if (val === undefined || val === null) return match;
          return String(val);
        }));
      }
    }

    return resolvedLines.join('\n');
  }, []);

  useEffect(() => {
    const initialData: Record<string, any> = {};
    const initialArrayData: Record<string, Record<string, any>[]> = {};

    groups.forEach(group => {
      if (group.isArrayGroup && group.arrayFieldName) {
        const groupFields = fields.filter(f => f.groupId === group.id);
        const initialRows: Record<string, any>[] = [];
        for (let i = 0; i < group.arrayMinRows; i++) {
          const row: Record<string, any> = {};
          groupFields.forEach(field => {
            if (field.defaultValue) {
              row[field.fieldKey] = field.defaultValue;
            } else if (field.fieldType === 'checkbox') {
              row[field.fieldKey] = 'False';
            } else {
              row[field.fieldKey] = '';
            }
          });
          initialRows.push(row);
        }
        initialArrayData[group.arrayFieldName] = initialRows;
      }
    });

    fields.forEach(field => {
      const group = groups.find(g => g.id === field.groupId);
      if (group?.isArrayGroup) return;

      if (field.defaultValue) {
        initialData[field.fieldKey] = field.defaultValue;
      } else if (field.fieldType === 'checkbox') {
        initialData[field.fieldKey] = 'False';
      }
    });

    setFormData(initialData);
    setArrayData(initialArrayData);
  }, [fields, groups]);

  const applyFieldMappings = useCallback((groupId: string, ctx: any, edgeHandleTaken?: string) => {
    console.log('[applyFieldMappings] Called with:', { groupId, edgeHandleTaken, contextDataKeys: ctx ? Object.keys(ctx) : null });
    console.log('[applyFieldMappings] Full contextData:', JSON.stringify(ctx, null, 2));

    const nodeMapping = flowNodeMappings.find(m => m.groupId === groupId);
    console.log('[applyFieldMappings] Found nodeMapping:', nodeMapping ? { groupId: nodeMapping.groupId, fieldMappings: nodeMapping.fieldMappings } : null);

    if (!nodeMapping || !nodeMapping.fieldMappings || Object.keys(nodeMapping.fieldMappings).length === 0) {
      console.log('[applyFieldMappings] No field mappings found, returning early');
      return;
    }

    const newFormData: Record<string, any> = {};
    let hasChanges = false;

    Object.entries(nodeMapping.fieldMappings).forEach(([fieldKey, mapping]) => {
      const variablePath = typeof mapping === 'string' ? mapping : mapping.variablePath;
      const applyCondition = typeof mapping === 'string' ? 'always' : (mapping.applyCondition || 'always');

      const shouldApply =
        applyCondition === 'always' ||
        (applyCondition === 'on_success' && edgeHandleTaken === 'success') ||
        (applyCondition === 'on_failure' && edgeHandleTaken === 'failure');

      console.log(`[applyFieldMappings] Field "${fieldKey}": condition="${applyCondition}", edgeHandle="${edgeHandleTaken}", shouldApply=${shouldApply}`);

      if (!shouldApply) {
        console.log(`[applyFieldMappings] SKIPPING field "${fieldKey}" due to condition mismatch`);
        return;
      }

      if (variablePath && ctx) {
        const parts = variablePath.split('.');
        let value: any = ctx;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = undefined;
            break;
          }
        }
        if (value !== undefined && value !== null) {
          const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
          console.log(`[applyFieldMappings] APPLYING field "${fieldKey}" = "${displayValue}"`);
          newFormData[fieldKey] = displayValue;
          hasChanges = true;
        }
      }
    });

    console.log('[applyFieldMappings] Final newFormData:', newFormData, 'hasChanges:', hasChanges);
    if (hasChanges) {
      setFormData(prev => ({ ...prev, ...newFormData }));
    }
  }, [flowNodeMappings]);

  useEffect(() => {
    console.log('[useEffect applyFieldMappings] Triggered - currentStep:', currentStep, 'currentStepGroups:', currentStepGroups.map(g => g.id), 'contextData:', contextData ? 'exists' : 'null');
    if (currentStepGroups.length > 0 && contextData) {
      const edgeHandleTaken = contextData.lastEdgeHandle || contextData.edgeHandleTaken;
      currentStepGroups.forEach(group => {
        console.log('[useEffect applyFieldMappings] Calling applyFieldMappings for group:', group.id, 'with edgeHandleTaken:', edgeHandleTaken);
        applyFieldMappings(group.id, contextData, edgeHandleTaken);
      });
    }
  }, [currentStep, currentStepGroups, contextData, applyFieldMappings]);

  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    currentStepGroups.forEach(group => {
      const groupFields = fields.filter(f => f.groupId === group.id);

      if (group.isArrayGroup && group.arrayFieldName) {
        const rows = arrayData[group.arrayFieldName] || [];
        rows.forEach((row, rowIndex) => {
          groupFields.forEach(field => {
            const value = row[field.fieldKey];
            const errorKey = `${group.arrayFieldName}[${rowIndex}].${field.fieldKey}`;

            if (field.isRequired) {
              if (value === undefined || value === null || value === '') {
                newErrors[errorKey] = `${field.name} is required`;
                return;
              }
            }

            if (field.fieldType === 'email' && value) {
              if (!emailRegex.test(value)) {
                newErrors[errorKey] = 'Please enter a valid email address';
              }
            }
          });
        });
      } else {
        groupFields.forEach(field => {
          const value = formData[field.fieldKey];

          if (field.isRequired) {
            if (value === undefined || value === null || value === '') {
              newErrors[field.fieldKey] = `${field.name} is required`;
              return;
            }
          }

          if (field.fieldType === 'email' && value) {
            if (!emailRegex.test(value)) {
              newErrors[field.fieldKey] = 'Please enter a valid email address';
            }
          }
        });
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleFieldChange = (fieldKey: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldKey]: value }));
    if (errors[fieldKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
  };

  const handleExecute = async () => {
    if (!validateCurrentStep()) return;

    setIsExecuting(true);
    setExecutionResults(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const currentGroup = currentStepGroups[0];
      const currentGroupNodeId = currentGroup
        ? flowNodeMappings.find(m => m.groupId === currentGroup.id)?.nodeId
        : undefined;

      const executeParameters = { ...formData, ...arrayData };

      const response = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          buttonId,
          executeParameters,
          userId: currentUserId,
          currentGroupNodeId,
          existingContextData: contextData,
        }),
      });

      const result = await response.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
      }

      if (result.nextGroupNode) {
        const nextGroupIndex = groups.findIndex(g => g.id === result.nextGroupNode.groupId);
        if (nextGroupIndex !== -1) {
          const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
          const newFormData: Record<string, any> = { ...formData };
          nextGroupFields.forEach(field => {
            if (field.fieldType === 'checkbox') {
              newFormData[field.fieldKey] = 'False';
            } else {
              newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
            }
          });
          setFormData(newFormData);
          setCurrentStep(nextGroupIndex);
          return;
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReset = () => {
    setExecutionComplete(false);
    setExecutionResults(null);
    setConfirmationPrompt(null);
    setExitData(null);
    setUserInformationData(null);
    setCurrentStep(0);
    setContextData(null);

    const initialData: Record<string, any> = {};
    const initialArrayData: Record<string, Record<string, any>[]> = {};

    groups.forEach(group => {
      if (group.isArrayGroup && group.arrayFieldName) {
        const groupFields = fields.filter(f => f.groupId === group.id);
        const initialRows: Record<string, any>[] = [];
        for (let i = 0; i < group.arrayMinRows; i++) {
          const row: Record<string, any> = {};
          groupFields.forEach(field => {
            if (field.defaultValue) {
              row[field.fieldKey] = field.defaultValue;
            } else if (field.fieldType === 'checkbox') {
              row[field.fieldKey] = 'False';
            } else {
              row[field.fieldKey] = '';
            }
          });
          initialRows.push(row);
        }
        initialArrayData[group.arrayFieldName] = initialRows;
      }
    });

    fields.forEach(field => {
      const group = groups.find(g => g.id === field.groupId);
      if (group?.isArrayGroup) return;

      if (field.defaultValue) {
        initialData[field.fieldKey] = field.defaultValue;
      } else if (field.fieldType === 'checkbox') {
        initialData[field.fieldKey] = 'False';
      }
    });

    setFormData(initialData);
    setArrayData(initialArrayData);
    setErrors({});
  };

  const handleConfirmationResponse = async (response: boolean) => {
    console.log('[handleConfirmationResponse] Called with response:', response, response ? 'YES' : 'NO');
    if (!confirmationPrompt) return;

    setIsExecuting(true);
    setConfirmationPrompt(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      console.log('[handleConfirmationResponse] Calling edge function with userConfirmationResponse:', response);

      const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          buttonId,
          executeParameters: formData,
          userId: currentUserId,
          userConfirmationResponse: response,
          pendingContextData: confirmationPrompt.pendingContextData,
        }),
      });

      const result = await fetchResponse.json();
      console.log('[handleConfirmationResponse] Edge function result:', JSON.stringify(result, null, 2));

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        console.log('[handleConfirmationResponse] Setting contextData:', JSON.stringify(result.contextData, null, 2));
        console.log('[handleConfirmationResponse] lastEdgeHandle in contextData:', result.contextData.lastEdgeHandle);
        setContextData(result.contextData);
        if (result.nextGroupNode) {
          console.log('[handleConfirmationResponse] Next group node:', result.nextGroupNode);
          const nextGroupIndex = groups.findIndex(g => g.id === result.nextGroupNode.groupId);
          console.log('[handleConfirmationResponse] Next group index:', nextGroupIndex);
          if (nextGroupIndex !== -1) {
            const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
            console.log('[handleConfirmationResponse] Next group fields:', nextGroupFields.map(f => ({ key: f.fieldKey, defaultValue: f.defaultValue })));
            const newFormData: Record<string, any> = { ...formData };

            nextGroupFields.forEach(field => {
              if (field.fieldType === 'checkbox') {
                newFormData[field.fieldKey] = 'False';
              } else {
                newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
              }
            });

            console.log('[handleConfirmationResponse] Cleared newFormData for next group:', newFormData);
            console.log('[handleConfirmationResponse] About to setFormData then setCurrentStep to:', nextGroupIndex);
            setFormData(newFormData);
            setCurrentStep(nextGroupIndex);
            return;
          }
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
        message: result.message,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUserInformationContinue = async () => {
    if (!userInformationData) return;

    setIsExecuting(true);
    setUserInformationData(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const fetchResponse = await fetch(`${supabaseUrl}/functions/v1/execute-button-processor`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          buttonId,
          executeParameters: formData,
          userId: currentUserId,
          userInformationAcknowledged: true,
          pendingContextData: userInformationData.pendingContextData,
        }),
      });

      const result = await fetchResponse.json();

      if (result.requiresConfirmation && result.confirmationData) {
        setConfirmationPrompt({
          promptMessage: result.confirmationData.promptMessage,
          yesButtonLabel: result.confirmationData.yesButtonLabel,
          noButtonLabel: result.confirmationData.noButtonLabel,
          pendingContextData: result.pendingContextData,
          showLocationMap: result.confirmationData.showLocationMap,
          latitude: result.confirmationData.latitude,
          longitude: result.confirmationData.longitude,
        });
        return;
      }

      if (result.requiresUserInformation && result.userInformationData) {
        setUserInformationData({
          contentMarkdown: result.userInformationData.contentMarkdown,
          continueButtonLabel: result.userInformationData.continueButtonLabel,
          imageSource: result.userInformationData.imageSource,
          customImageUrl: result.userInformationData.customImageUrl,
          imageMaxHeight: result.userInformationData.imageMaxHeight,
          pendingContextData: result.pendingContextData,
        });
        return;
      }

      if (result.exitData) {
        setExitData({
          exitMessage: result.exitData.exitMessage,
          showRestartButton: result.exitData.showRestartButton,
        });
        setExecutionComplete(true);
        return;
      }

      if (result.contextData) {
        setContextData(result.contextData);
        if (result.nextGroupNode) {
          const nextGroupIndex = groups.findIndex(g => g.id === result.nextGroupNode.groupId);
          if (nextGroupIndex !== -1) {
            const nextGroupFields = fields.filter(f => f.groupId === result.nextGroupNode.groupId);
            const newFormData: Record<string, any> = { ...formData };
            nextGroupFields.forEach(field => {
              if (field.fieldType === 'checkbox') {
                newFormData[field.fieldKey] = 'False';
              } else {
                newFormData[field.fieldKey] = field.defaultValue && !field.defaultValue.includes('{{') ? field.defaultValue : '';
              }
            });
            setFormData(newFormData);
            setCurrentStep(nextGroupIndex);
            return;
          }
        }
      }

      setExecutionResults({
        success: result.success,
        results: result.results || [],
        error: result.error,
        contextData: result.contextData,
      });
      setExecutionComplete(true);
    } catch (err: any) {
      setExecutionResults({
        success: false,
        results: [],
        error: err.message || 'Unknown error occurred',
      });
      setExecutionComplete(true);
    } finally {
      setIsExecuting(false);
    }
  };

  const renderField = (buttonField: ExecuteButtonField) => {
    const value = formData[buttonField.fieldKey] ?? '';
    const error = errors[buttonField.fieldKey];

    if (buttonField.fieldType === 'dropdown') {
      console.log('[renderField] Dropdown field:', {
        id: buttonField.id,
        name: buttonField.name,
        options: buttonField.options,
        optionsType: typeof buttonField.options,
        optionsIsArray: Array.isArray(buttonField.options)
      });
    }

    const fieldObj = {
      id: buttonField.id,
      fieldLabel: buttonField.name,
      fieldType: buttonField.fieldType,
      isRequired: buttonField.isRequired || false,
      placeholder: buttonField.placeholder || '',
      helpText: buttonField.helpText || '',
      maxLength: buttonField.maxLength || 0,
      dropdownOptions: buttonField.options || [],
      dropdownDisplayMode: buttonField.dropdownDisplayMode || 'description_only'
    };

    if (buttonField.fieldType === 'dropdown') {
      console.log('[renderField] Created fieldObj for dropdown:', { dropdownOptions: fieldObj.dropdownOptions });
    }

    const commonProps = {
      field: fieldObj,
      value,
      onChange: (val: any) => handleFieldChange(buttonField.fieldKey, val),
      error,
      showIcon: false
    };

    switch (buttonField.fieldType) {
      case 'number':
        return <NumberField key={buttonField.id} {...commonProps} />;
      case 'date':
        return <DateField key={buttonField.id} {...commonProps} />;
      case 'datetime':
        return <DateTimeField key={buttonField.id} {...commonProps} />;
      case 'phone':
        return <PhoneField key={buttonField.id} {...commonProps} />;
      case 'zip':
        return <ZipField key={buttonField.id} {...commonProps} />;
      case 'postal_code':
        return <PostalCodeField key={buttonField.id} {...commonProps} />;
      case 'province':
        return <ProvinceField key={buttonField.id} {...commonProps} />;
      case 'state':
        return <StateField key={buttonField.id} {...commonProps} />;
      case 'dropdown':
        return <DropdownField key={buttonField.id} {...commonProps} />;
      case 'email':
        return <TextField key={buttonField.id} {...commonProps} />;
      case 'checkbox':
        return (
          <div key={buttonField.id} className="space-y-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={value === 'True'}
                onChange={(e) => handleFieldChange(buttonField.fieldKey, e.target.checked ? 'True' : 'False')}
                className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {buttonField.name}
                {buttonField.isRequired && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
            {buttonField.helpText && (
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-8">{buttonField.helpText}</p>
            )}
            {error && <p className="text-xs text-red-500 ml-8">{error}</p>}
          </div>
        );
      default:
        return <TextField key={buttonField.id} {...commonProps} />;
    }
  };

  const renderArrayGroup = (group: ExecuteButtonGroup) => {
    const rows = arrayData[group.arrayFieldName] || [];
    const canAddRow = rows.length < group.arrayMaxRows;
    const canRemoveRow = rows.length > group.arrayMinRows;
    const groupFields = fields.filter(f => f.groupId === group.id);

    const handleArrayFieldChange = (rowIndex: number, fieldKey: string, value: any) => {
      setArrayData(prev => {
        const updatedRows = [...(prev[group.arrayFieldName] || [])];
        updatedRows[rowIndex] = { ...updatedRows[rowIndex], [fieldKey]: value };
        return { ...prev, [group.arrayFieldName]: updatedRows };
      });
    };

    const addRow = () => {
      if (rows.length >= group.arrayMaxRows) return;
      const newRow: Record<string, any> = {};
      groupFields.forEach(field => {
        if (field.defaultValue) {
          newRow[field.fieldKey] = field.defaultValue;
        } else if (field.fieldType === 'checkbox') {
          newRow[field.fieldKey] = 'False';
        } else {
          newRow[field.fieldKey] = '';
        }
      });
      setArrayData(prev => ({
        ...prev,
        [group.arrayFieldName]: [...rows, newRow]
      }));
    };

    const removeRow = (rowIndex: number) => {
      if (rows.length <= group.arrayMinRows) return;
      setArrayData(prev => ({
        ...prev,
        [group.arrayFieldName]: rows.filter((_, i) => i !== rowIndex)
      }));
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {rows.length} / {group.arrayMaxRows} rows
          </span>
          {canAddRow && (
            <button
              type="button"
              onClick={addRow}
              className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Row
            </button>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {groupFields.map(field => (
                    <th key={field.id} className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      {field.name}
                      {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    {groupFields.map(field => {
                      const value = row[field.fieldKey] ?? '';
                      const errorKey = `${group.arrayFieldName}[${rowIndex}].${field.fieldKey}`;
                      const error = errors[errorKey];

                      const formatPhoneNumber = (input: string): string => {
                        const digits = input.replace(/\D/g, '');
                        if (digits.length <= 3) {
                          return digits;
                        } else if (digits.length <= 6) {
                          return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
                        } else {
                          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
                        }
                      };

                      return (
                        <td key={field.id} className="px-4 py-3 whitespace-nowrap">
                          {field.fieldType === 'checkbox' ? (
                            <input
                              type="checkbox"
                              checked={value === 'True'}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, e.target.checked ? 'True' : 'False')}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                            />
                          ) : field.fieldType === 'dropdown' ? (
                            <select
                              value={value}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, e.target.value)}
                              className={`w-full px-2 py-1.5 text-sm border rounded ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500`}
                            >
                              <option value="">Select an option...</option>
                              {(field.options || []).map((option, i) => (
                                <option key={i} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : field.fieldType === 'phone' ? (
                            <input
                              type="tel"
                              inputMode="tel"
                              value={value}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, formatPhoneNumber(e.target.value))}
                              placeholder="(555) 123-4567"
                              maxLength={14}
                              className={`w-full px-2 py-1.5 text-sm border rounded ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500`}
                            />
                          ) : (
                            <input
                              type={field.fieldType === 'number' ? 'number' : field.fieldType === 'email' ? 'email' : 'text'}
                              value={value}
                              onChange={(e) => handleArrayFieldChange(rowIndex, field.fieldKey, e.target.value)}
                              placeholder={field.placeholder || ''}
                              maxLength={field.maxLength || undefined}
                              className={`w-full px-2 py-1.5 text-sm border rounded ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500`}
                            />
                          )}
                          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {canRemoveRow && (
                        <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderResults = () => {
    if (!executionResults) return null;

    return (
      <div className="space-y-4">
        <div className={`p-4 rounded-lg ${executionResults.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center space-x-2">
            {executionResults.success ? (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <span className={`font-medium ${executionResults.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
              {executionResults.success ? 'Execution Successful' : 'Execution Failed'}
            </span>
          </div>
          {executionResults.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{executionResults.error}</p>
          )}
        </div>

        {executionResults.results.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Step Results</h4>
            {executionResults.results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  result.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                    : result.status === 'skipped'
                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {result.node || result.step || `Step ${index + 1}`}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      result.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
                        : result.status === 'skipped'
                        ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
                {result.error && (
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2">{result.error}</p>
                )}
                {result.requestUrl && (
                  <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Request URL {result.httpMethod && <span className="text-blue-600 dark:text-blue-400">({result.httpMethod})</span>}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 break-all font-mono">{result.requestUrl}</p>
                  </div>
                )}
                {result.requestBody && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                      View Request Body
                    </summary>
                    <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(result.requestBody), null, 2);
                        } catch {
                          return result.requestBody;
                        }
                      })()}
                    </pre>
                  </details>
                )}
                {result.output && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                      View Output
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {executionResults.contextData && (
          <details className="mt-4">
            <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">
              View Full Context Data
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(executionResults.contextData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Test Flow - {buttonName}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {confirmationPrompt ? 'User confirmation required' : userInformationData ? 'Information' : exitData ? 'Flow Complete' : executionComplete ? 'Execution Results' : 'Enter test parameters'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmationPrompt ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-6">
                  <HelpCircle className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Confirmation Required
                </h4>
                <p className="text-gray-700 dark:text-gray-300 max-w-md mb-6 whitespace-pre-wrap">
                  {confirmationPrompt.promptMessage}
                </p>
                {confirmationPrompt.showLocationMap && confirmationPrompt.latitude && confirmationPrompt.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${confirmationPrompt.latitude},${confirmationPrompt.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full max-w-lg mb-6 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-cyan-500 transition-colors group relative"
                  >
                    <img
                      src={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/static-map-proxy?center=${confirmationPrompt.latitude},${confirmationPrompt.longitude}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${confirmationPrompt.latitude},${confirmationPrompt.longitude}`}
                      alt="Location Map"
                      className="w-full h-[200px] object-cover"
                      onError={(e) => {
                        const link = (e.target as HTMLElement).closest('a');
                        if (link) link.style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 shadow-lg flex items-center gap-1.5">
                        <ExternalLink className="h-4 w-4" />
                        Open in Google Maps
                      </span>
                    </div>
                  </a>
                )}
                <div className="flex space-x-4">
                  <button
                    onClick={() => handleConfirmationResponse(false)}
                    disabled={isExecuting}
                    className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {confirmationPrompt.noButtonLabel}
                  </button>
                  <button
                    onClick={() => handleConfirmationResponse(true)}
                    disabled={isExecuting}
                    className="px-6 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {isExecuting ? (
                      <span className="flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processing...
                      </span>
                    ) : (
                      confirmationPrompt.yesButtonLabel
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end">
              <button
                onClick={handleReset}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : userInformationData ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center text-center py-8 max-w-lg mx-auto">
                {userInformationData.imageSource === 'branding_logo' ? (
                  <BrandingLogoImage maxHeight={userInformationData.imageMaxHeight || 80} />
                ) : userInformationData.imageSource === 'custom_url' && userInformationData.customImageUrl ? (
                  <img
                    src={userInformationData.customImageUrl}
                    alt=""
                    style={{ maxHeight: `${userInformationData.imageMaxHeight || 80}px` }}
                    className="w-auto object-contain mb-6"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                ) : null}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-left w-full mb-6"
                  dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(userInformationData.contentMarkdown) }}
                />
                <button
                  onClick={handleUserInformationContinue}
                  disabled={isExecuting}
                  className="px-8 py-2.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium disabled:opacity-50"
                >
                  {isExecuting ? (
                    <span className="flex items-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </span>
                  ) : (
                    userInformationData.continueButtonLabel || 'Continue'
                  )}
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end">
              <button
                onClick={handleReset}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : exitData ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-6">
                  <LogOut className="h-8 w-8 text-rose-600 dark:text-rose-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Flow Complete
                </h4>
                <p className="text-gray-700 dark:text-gray-300 max-w-md mb-8 whitespace-pre-wrap">
                  {exitData.exitMessage}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              {exitData.showRestartButton ? (
                <button
                  onClick={handleReset}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restart
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                className="flex items-center px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : executionComplete ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              {renderResults()}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={handleReset}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Run Another Test
              </button>
              <button
                onClick={onClose}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : groups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                This button has no parameter groups configured.
              </p>
            </div>
          </div>
        ) : (
          <>
            {totalSteps > 1 && (
              <div className="px-6 pt-4">
                <div className="flex items-center justify-center space-x-2">
                  {combinedSteps.map((stepGroups, index) => (
                    <div key={stepGroups.map(g => g.id).join('-')} className="flex items-center">
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                          index < currentStep
                            ? 'bg-green-500 text-white'
                            : index === currentStep
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                        title={stepGroups.map(g => g.name).join(' + ')}
                      >
                        {index < currentStep ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      {index < totalSteps - 1 && (
                        <div
                          className={`w-12 h-1 mx-1 rounded ${
                            index < currentStep
                              ? 'bg-green-500'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              {currentStepGroups.length > 0 && (
                <div className="space-y-8">
                  {currentStepGroups.map((group, groupIndex) => {
                    const groupFields = fields.filter(f => f.groupId === group.id);
                    const nodeMapping = flowNodeMappings.find(m => m.groupId === group.id);
                    const headerContent = nodeMapping?.headerContent;
                    let headerCtx: any = contextData || {};
                    const headerLoopIdx = headerCtx?.forEach?._index;
                    if (nodeMapping?.headerCurrentLoopItemOnly === true && typeof headerLoopIdx === 'number' && headerCtx.response) {
                      const indexedResponse: Record<string, any> = {};
                      for (const k of Object.keys(headerCtx.response)) {
                        const v = headerCtx.response[k];
                        indexedResponse[k] = Array.isArray(v) && headerLoopIdx >= 0 && headerLoopIdx < v.length ? v[headerLoopIdx] : v;
                      }
                      headerCtx = { ...headerCtx, response: indexedResponse };
                    }
                    const resolvedHeader = headerContent ? resolveVariable(headerContent, headerCtx) : null;

                    return (
                      <div key={group.id} className={groupIndex > 0 ? 'pt-6 border-t border-gray-200 dark:border-gray-700' : ''}>
                        <div className="mb-6">
                          <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            {group.name}
                          </h4>
                          {group.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {group.description}
                            </p>
                          )}
                        </div>

                        {resolvedHeader && (
                          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
                              {resolvedHeader}
                            </p>
                          </div>
                        )}

                        {group.isArrayGroup && group.arrayFieldName ? (
                          renderArrayGroup(group)
                        ) : (
                          <div className="space-y-4">
                            {groupFields.map(field => renderField(field))}
                            {groupFields.length === 0 && (
                              <p className="text-gray-500 dark:text-gray-400 italic">
                                No fields in this group
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <button
                onClick={isFirstStep ? onClose : handleBack}
                className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {isFirstStep ? 'Cancel' : 'Back'}
              </button>

              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="flex items-center px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isExecuting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isLastStep ? 'Run Test' : 'Continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

interface FlowDesignerProps {
  buttonId: string;
  buttonName: string;
  groups: ExecuteButtonGroup[];
  fields: ExecuteButtonField[];
  defaultZoom?: number;
  onClose: () => void;
  onSave: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

interface DbFlowNode {
  id: string;
  button_id: string;
  node_type: 'group' | 'workflow';
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  label: string;
  group_id?: string;
  step_type?: string;
  config_json?: any;
  field_mappings?: Record<string, string>;
  header_content?: string;
  display_with_previous?: boolean;
  header_current_loop_item_only?: boolean;
  workflow_version?: string;
  workflow_v2_id?: string;
}

interface DbFlowEdge {
  id: string;
  button_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string;
  target_handle?: string;
  label?: string;
  edge_type?: string;
  animated?: boolean;
}

const workflowStepTypes = [
  { type: 'api_endpoint', label: 'API Endpoint', icon: Globe, color: 'green' },
  { type: 'ai_lookup', label: 'AI Lookup', icon: Sparkles, color: 'amber' },
  { type: 'google_places_lookup', label: 'Google Places Lookup', icon: MapPin, color: 'blue' },
  { type: 'conditional_check', label: 'Decision', icon: GitBranch, color: 'orange' },
  { type: 'user_confirmation', label: 'User Confirmation', icon: HelpCircle, color: 'cyan' },
  { type: 'branch', label: 'Branch', icon: GitBranch, color: 'yellow' },
  { type: 'route', label: 'Route', icon: Signpost, color: 'teal' },
  { type: 'email_action', label: 'Email', icon: Mail, color: 'purple' },
  { type: 'exit', label: 'Exit', icon: LogOut, color: 'rose' },
  { type: 'user_input', label: 'User Input', icon: TextCursorInput, color: 'sky' },
  { type: 'user_information', label: 'User Information', icon: Info, color: 'slate' },
  { type: 'data_transform', label: 'Data Transform', icon: Wand2, color: 'fuchsia' },
  { type: 'for_each', label: 'For Each Loop', icon: Repeat, color: 'lime' },
  { type: 'user_selection', label: 'User Selection', icon: MousePointerClick, color: 'pink' },
];

function FlowDesignerInner({
  buttonId,
  buttonName,
  groups,
  fields,
  defaultZoom = 75,
  onClose,
  onSave,
  onError,
  onSuccess,
}: FlowDesignerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ nodeId: string; nodeName: string } | null>(null);
  const [copySourceNode, setCopySourceNode] = useState<Node | null>(null);
  const [copyName, setCopyName] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const [fullFields, setFullFields] = useState<ExecuteButtonField[]>([]);
  const [editingGroupNode, setEditingGroupNode] = useState<Node | null>(null);
  const [showFieldMappingsModal, setShowFieldMappingsModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const { project } = useReactFlow();
  const nodesRef = useRef<Node[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentUserId(data.user.id);
    });
  }, []);

  const getGroupFieldCount = useCallback((groupId: string) => {
    return fields.filter(f => f.groupId === groupId).length;
  }, [fields]);

  const handleEditNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node && node.type === 'workflow') {
      setEditingNode(node);
      setShowStepForm(true);
    }
  }, []);

  const handleEditGroupNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node && node.type === 'group') {
      setEditingGroupNode(node);
      setShowFieldMappingsModal(true);
    }
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    const nodeName = node?.data?.label || 'this node';
    setDeleteConfirm({ nodeId, nodeName });
  }, []);

  const handleCopyNode = useCallback((nodeId: string) => {
    const sourceNode = nodesRef.current.find(n => n.id === nodeId);
    if (!sourceNode || sourceNode.type !== 'workflow') return;
    setCopySourceNode(sourceNode);
    setCopyName(`Copy of ${sourceNode.data.label}`);
  }, []);

  const loadFlow = useCallback(async () => {
    try {
      setLoading(true);

      const [nodesRes, edgesRes] = await Promise.all([
        supabase
          .from('execute_button_flow_nodes')
          .select('*')
          .eq('button_id', buttonId),
        supabase
          .from('execute_button_flow_edges')
          .select('*')
          .eq('button_id', buttonId),
      ]);

      if (nodesRes.error) throw nodesRes.error;
      if (edgesRes.error) throw edgesRes.error;

      const dbNodes: DbFlowNode[] = nodesRes.data || [];
      const dbEdges: DbFlowEdge[] = edgesRes.data || [];

      const flowNodes: Node[] = dbNodes.map((n) => ({
        id: n.id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: {
          label: n.label,
          groupId: n.group_id,
          groupName: n.group_id ? groups.find(g => g.id === n.group_id)?.name : undefined,
          fieldCount: n.group_id ? getGroupFieldCount(n.group_id) : undefined,
          stepType: n.step_type || '',
          config: n.config_json || {},
          fieldMappings: n.field_mappings || {},
          headerContent: n.header_content || '',
          displayWithPrevious: n.display_with_previous || false,
          headerCurrentLoopItemOnly: n.header_current_loop_item_only || false,
          workflowVersion: n.workflow_version || 'v1',
          workflowV2Id: n.workflow_v2_id || undefined,
          onEdit: n.node_type === 'workflow' ? () => handleEditNode(n.id) : () => handleEditGroupNode(n.id),
          onCopy: n.node_type === 'workflow' ? () => handleCopyNode(n.id) : undefined,
          onDelete: () => handleDeleteNode(n.id),
        },
        ...(n.width && n.height ? { width: n.width, height: n.height } : {}),
      }));

      const flowEdges: Edge[] = dbEdges.map((e) => {
        const isLoopBack = e.target_handle === 'loop_back';
        const isLoopOut = e.source_handle === 'loop';
        return {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle: e.source_handle || undefined,
          targetHandle: e.target_handle || undefined,
          label: e.label || (isLoopBack ? 'Loop Back' : isLoopOut ? 'Loop' : undefined),
          type: e.edge_type || 'default',
          animated: isLoopBack || isLoopOut ? true : (e.animated || false),
          style: isLoopBack || isLoopOut ? { strokeDasharray: '6 3', stroke: '#f97316', strokeWidth: 2 } : undefined,
          labelStyle: isLoopBack || isLoopOut ? { fill: '#f97316', fontWeight: 500, fontSize: 12 } : undefined,
        };
      });

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err: any) {
      onError('Failed to load flow: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [buttonId, groups, fields, getGroupFieldCount, setNodes, setEdges, onError, handleEditNode, handleEditGroupNode, handleDeleteNode, handleCopyNode]);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  const loadFullFields = useCallback(async () => {
    try {
      const groupIds = groups.map(g => g.id);
      if (groupIds.length === 0) return;

      const { data, error } = await supabase
        .from('execute_button_fields')
        .select('*')
        .in('group_id', groupIds)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      console.log('[loadFullFields] Raw data from DB:', data);
      const mappedFields: ExecuteButtonField[] = (data || []).map((f: any) => ({
        id: f.id,
        groupId: f.group_id,
        name: f.name,
        fieldKey: f.field_key,
        fieldType: f.field_type,
        isRequired: f.is_required,
        defaultValue: f.default_value,
        options: f.options || [],
        sortOrder: f.sort_order,
        placeholder: f.placeholder,
        helpText: f.help_text,
        maxLength: f.max_length,
        conditionalRequiredFieldId: f.conditional_required_field_id || null,
        conditionalRequiredOperator: f.conditional_required_operator || null,
        conditionalRequiredValue: f.conditional_required_value || null,
        apiLookupEndpoint: f.api_lookup_endpoint || null,
        apiLookupSecondaryApiId: f.api_lookup_secondary_api_id || null,
        apiLookupHttpMethod: f.api_lookup_http_method || 'GET',
        apiLookupSearchParam: f.api_lookup_search_param || null,
        apiLookupValueField: f.api_lookup_value_field || null,
        apiLookupDisplayColumns: f.api_lookup_display_columns || null,
        apiLookupFieldMappings: f.api_lookup_field_mappings || null,
        apiLookupRequestBody: f.api_lookup_request_body || null,
        apiLookupRequestBodyMappings: f.api_lookup_request_body_mappings || null,
        apiLookupWrapBodyInArray: f.api_lookup_wrap_body_in_array || false,
      }));

      console.log('[loadFullFields] Mapped fields with options:', mappedFields.map(f => ({ id: f.id, name: f.name, fieldType: f.fieldType, options: f.options })));
      setFullFields(mappedFields);
    } catch (err) {
      console.error('Failed to load full fields:', err);
    }
  }, [groups]);

  const getFlowGroups = useCallback(() => {
    const connectedNodeIds = new Set<string>();
    edges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    const groupNodeIds = nodes
      .filter(n => n.type === 'group' && n.data.groupId && connectedNodeIds.has(n.id))
      .map(n => n.data.groupId);
    const filteredGroups = groups.filter(g => groupNodeIds.includes(g.id));
    return filteredGroups.sort((a, b) => {
      const indexA = groupNodeIds.indexOf(a.id);
      const indexB = groupNodeIds.indexOf(b.id);
      return indexA - indexB;
    });
  }, [nodes, edges, groups]);

  const handleTestFlow = useCallback(async () => {
    await loadFullFields();
    setShowTestModal(true);
  }, [loadFullFields]);

  const confirmDeleteNode = useCallback(async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await supabase
        .from('execute_button_flow_nodes')
        .delete()
        .eq('id', deleteConfirm.nodeId);

      if (error) throw error;

      setNodes((nds) => nds.filter((n) => n.id !== deleteConfirm.nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== deleteConfirm.nodeId && e.target !== deleteConfirm.nodeId));
      setDeleteConfirm(null);
    } catch (err: any) {
      onError('Failed to delete node: ' + err.message);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, setNodes, setEdges, onError]);

  const handleConfirmCopy = useCallback(async () => {
    if (!copySourceNode || !copyName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('execute_button_flow_nodes')
        .insert([{
          button_id: buttonId,
          node_type: 'workflow',
          position_x: copySourceNode.position.x + 50,
          position_y: copySourceNode.position.y + 120,
          label: copyName.trim(),
          step_type: copySourceNode.data.stepType || null,
          config_json: copySourceNode.data.config
            ? JSON.parse(JSON.stringify(copySourceNode.data.config))
            : {},
        }])
        .select()
        .single();

      if (error) throw error;

      const newNode: Node = {
        id: data.id,
        type: 'workflow',
        position: { x: data.position_x, y: data.position_y },
        data: {
          label: copyName.trim(),
          stepType: copySourceNode.data.stepType || '',
          config: data.config_json || {},
          onEdit: () => handleEditNode(data.id),
          onCopy: () => handleCopyNode(data.id),
          onDelete: () => handleDeleteNode(data.id),
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setCopySourceNode(null);
      setCopyName('');
    } catch (err: any) {
      onError('Failed to copy step: ' + err.message);
      setCopySourceNode(null);
      setCopyName('');
    }
  }, [copySourceNode, copyName, buttonId, setNodes, onError, handleEditNode, handleCopyNode, handleDeleteNode]);

  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target) return;

      const isLoopBack = params.targetHandle === 'loop_back';
      const isLoopOut = params.sourceHandle === 'loop';

      try {
        const { data, error } = await supabase
          .from('execute_button_flow_edges')
          .insert([{
            button_id: buttonId,
            source_node_id: params.source,
            target_node_id: params.target,
            source_handle: params.sourceHandle || 'default',
            target_handle: params.targetHandle || 'default',
          }])
          .select()
          .single();

        if (error) throw error;

        const edgeProps: any = {
          ...params,
          id: data.id,
        };

        if (isLoopBack || isLoopOut) {
          edgeProps.label = isLoopBack ? 'Loop Back' : 'Loop';
          edgeProps.animated = true;
          edgeProps.style = { strokeDasharray: '6 3', stroke: '#f97316', strokeWidth: 2 };
          edgeProps.labelStyle = { fill: '#f97316', fontWeight: 500, fontSize: 12 };
        }

        setEdges((eds) => addEdge(edgeProps, eds));
      } catch (err: any) {
        onError('Failed to create connection: ' + err.message);
      }
    },
    [buttonId, setEdges, onError]
  );

  const onEdgeDelete = useCallback(
    async (edgesToDelete: Edge[]) => {
      for (const edge of edgesToDelete) {
        try {
          await supabase.from('execute_button_flow_edges').delete().eq('id', edge.id);
        } catch (err: any) {
          onError('Failed to delete connection: ' + err.message);
        }
      }
    },
    [onError]
  );

  const onNodeDragStop = useCallback(
    async (_: any, node: Node) => {
      try {
        await supabase
          .from('execute_button_flow_nodes')
          .update({
            position_x: node.position.x,
            position_y: node.position.y,
            updated_at: new Date().toISOString(),
          })
          .eq('id', node.id);
      } catch (err: any) {
        console.error('Failed to save node position:', err);
      }
    },
    []
  );

  const addGroupNode = useCallback(
    async (group: ExecuteButtonGroup) => {
      const existingGroupNode = nodes.find(
        (n) => n.type === 'group' && n.data.groupId === group.id
      );
      if (existingGroupNode) {
        onError('This group is already on the canvas');
        return;
      }

      const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : -50;
      const position = project({ x: 250, y: maxY + 150 });

      try {
        const { data, error } = await supabase
          .from('execute_button_flow_nodes')
          .insert([{
            button_id: buttonId,
            node_type: 'group',
            position_x: position.x,
            position_y: position.y,
            label: group.name,
            group_id: group.id,
          }])
          .select()
          .single();

        if (error) throw error;

        const newNode: Node = {
          id: data.id,
          type: 'group',
          position: { x: data.position_x, y: data.position_y },
          data: {
            label: group.name,
            groupId: group.id,
            groupName: group.name,
            fieldCount: getGroupFieldCount(group.id),
            onDelete: () => handleDeleteNode(data.id),
          },
        };

        setNodes((nds) => [...nds, newNode]);
        setShowAddPanel(false);
      } catch (err: any) {
        onError('Failed to add group: ' + err.message);
      }
    },
    [buttonId, nodes, project, getGroupFieldCount, setNodes, onError, handleDeleteNode]
  );

  const addWorkflowNode = useCallback(
    async (stepType: string, label: string) => {
      const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) : -50;
      const position = project({ x: 250, y: maxY + 150 });

      try {
        const { data, error } = await supabase
          .from('execute_button_flow_nodes')
          .insert([{
            button_id: buttonId,
            node_type: 'workflow',
            position_x: position.x,
            position_y: position.y,
            label: label,
            step_type: stepType,
            config_json: {},
          }])
          .select()
          .single();

        if (error) throw error;

        const newNode: Node = {
          id: data.id,
          type: 'workflow',
          position: { x: data.position_x, y: data.position_y },
          data: {
            label: label,
            stepType: stepType,
            config: {},
            onEdit: () => handleEditNode(data.id),
            onCopy: () => handleCopyNode(data.id),
            onDelete: () => handleDeleteNode(data.id),
          },
        };

        setNodes((nds) => [...nds, newNode]);
        setShowAddPanel(false);

        setEditingNode(newNode);
        setShowStepForm(true);
      } catch (err: any) {
        onError('Failed to add workflow step: ' + err.message);
      }
    },
    [buttonId, nodes, project, setNodes, onError, handleEditNode, handleCopyNode, handleDeleteNode]
  );

  const handleSaveStepConfig = useCallback(
    async (stepData: any) => {
      if (!editingNode) return;

      try {
        const mergedConfig = {
          ...(stepData.configJson || stepData.config_json || {}),
          userResponseTemplate: stepData.userResponseTemplate || undefined,
        };

        const { error } = await supabase
          .from('execute_button_flow_nodes')
          .update({
            label: stepData.stepName || stepData.step_name || editingNode.data.label,
            config_json: mergedConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingNode.id);

        if (error) throw error;

        setNodes((nds) =>
          nds.map((n) =>
            n.id === editingNode.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    label: stepData.stepName || stepData.step_name || n.data.label,
                    config: mergedConfig,
                  },
                }
              : n
          )
        );

        setShowStepForm(false);
        setEditingNode(null);
        onSuccess('Step configuration saved');
      } catch (err: any) {
        onError('Failed to save step configuration: ' + err.message);
      }
    },
    [editingNode, setNodes, onError, onSuccess]
  );

  const handleSaveFieldMappings = useCallback(
    async (mappings: Record<string, string>, headerContent: string, displayWithPrevious: boolean, headerCurrentLoopItemOnly: boolean) => {
      if (!editingGroupNode) return;

      try {
        const { error } = await supabase
          .from('execute_button_flow_nodes')
          .update({
            field_mappings: mappings,
            header_content: headerContent || null,
            display_with_previous: displayWithPrevious,
            header_current_loop_item_only: headerCurrentLoopItemOnly,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingGroupNode.id);

        if (error) throw error;

        setNodes((nds) =>
          nds.map((n) =>
            n.id === editingGroupNode.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    fieldMappings: mappings,
                    headerContent: headerContent || '',
                    displayWithPrevious: displayWithPrevious,
                    headerCurrentLoopItemOnly: headerCurrentLoopItemOnly,
                  },
                }
              : n
          )
        );

        setShowFieldMappingsModal(false);
        setEditingGroupNode(null);
        onSuccess('Field mappings saved');
      } catch (err: any) {
        onError('Failed to save field mappings: ' + err.message);
      }
    },
    [editingGroupNode, setNodes, onError, onSuccess]
  );

  const getAvailableVariables = useCallback(() => {
    const variables: { path: string; label: string; source: string }[] = [
      { path: 'user.username', label: 'Logged-In Username', source: 'Session' },
      { path: 'user.email', label: 'Logged-In User Email', source: 'Session' },
    ];

    nodes.forEach((node) => {
      if (node.type === 'group' && node.data.groupId) {
        const groupFields = fields.filter((f) => f.groupId === node.data.groupId);
        groupFields.forEach((field) => {
          variables.push({
            path: `form.${field.fieldKey}`,
            label: `${field.name} (${node.data.label})`,
            source: 'Form Field',
          });
        });
      } else if (node.type === 'workflow') {
        const config = node.data.config || {};
        if (node.data.stepType === 'ai_lookup' && config.aiResponseMappings) {
          config.aiResponseMappings.forEach((mapping: any) => {
            if (mapping.fieldName) {
              variables.push({
                path: `execute.ai.${mapping.fieldName}`,
                label: `${mapping.fieldName} (${node.data.label})`,
                source: 'AI Lookup',
              });
            }
          });
        } else if (node.data.stepType === 'google_places_lookup' && config.placesResponseMappings) {
          config.placesResponseMappings.forEach((mapping: any) => {
            if (mapping.fieldName) {
              variables.push({
                path: `execute.places.${mapping.fieldName}`,
                label: `${mapping.fieldName} (${node.data.label})`,
                source: 'Google Places',
              });
            }
          });
        } else if (node.data.stepType === 'api_endpoint' && config.responseDataMappings) {
          config.responseDataMappings.forEach((mapping: any) => {
            if (mapping.updatePath) {
              variables.push({
                path: `response.${mapping.updatePath}`,
                label: `${mapping.updatePath} (${node.data.label})`,
                source: 'API Response',
              });
            }
          });
        } else if (node.data.stepType === 'data_transform' && config.transformations) {
          config.transformations.forEach((t: any) => {
            if (t.outputVariable) {
              variables.push({
                path: `transform.${t.outputVariable}`,
                label: `${t.outputVariable} (${node.data.label})`,
                source: 'Data Transform',
              });
            }
          });
        } else if (node.data.stepType === 'user_selection') {
          const itemVariable = config.itemVariable || 'item';
          const basePath = `forEach.${itemVariable}`;
          variables.push({
            path: basePath,
            label: `Selected item (${node.data.label})`,
            source: 'User Selection',
          });

          const seenFields = new Set<string>();
          const template: string = config.displayTemplate || '';
          const tokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
          let match: RegExpExecArray | null;
          while ((match = tokenRegex.exec(template)) !== null) {
            const raw = match[1].trim();
            let fieldPath: string | null = null;
            if (raw.startsWith(`${itemVariable}.`)) {
              fieldPath = raw.substring(itemVariable.length + 1);
            } else if (raw.startsWith(`forEach.${itemVariable}.`)) {
              fieldPath = raw.substring(`forEach.${itemVariable}.`.length);
            }
            if (fieldPath && !seenFields.has(fieldPath)) {
              seenFields.add(fieldPath);
              variables.push({
                path: `${basePath}.${fieldPath}`,
                label: `${fieldPath} (${node.data.label})`,
                source: 'User Selection',
              });
            }
          }
        } else if (node.data.stepType === 'user_input' && config.variableName) {
          if (config.inputType === 'signature_capture') {
            const varName = config.variableName;
            variables.push(
              { path: `input.${varName}.signeeName`, label: `${varName}.signeeName (${node.data.label})`, source: 'User Input' },
              { path: `input.${varName}.signedTime`, label: `${varName}.signedTime (${node.data.label})`, source: 'User Input' },
              { path: `input.${varName}.imageData`, label: `${varName}.imageData (${node.data.label})`, source: 'User Input' },
            );
          } else if (config.inputType === 'camera_capture') {
            const varName = config.variableName;
            variables.push(
              { path: `input.${varName}.imageData`, label: `${varName}.imageData (${node.data.label})`, source: 'User Input' },
              { path: `input.${varName}.timestamp`, label: `${varName}.timestamp (${node.data.label})`, source: 'User Input' },
            );
          } else {
            variables.push({
              path: `input.${config.variableName}`,
              label: `${config.variableName} (${node.data.label})`,
              source: 'User Input',
            });
          }
        }
      }
    });

    return variables;
  }, [nodes, fields]);

  const handleSaveFlow = useCallback(async () => {
    setSaving(true);
    try {
      await supabase
        .from('execute_buttons')
        .update({ has_flow: true, updated_at: new Date().toISOString() })
        .eq('id', buttonId);

      onSave();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      onError('Failed to save flow: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [buttonId, onSave, onError]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-100 dark:bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading flow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-100 dark:bg-gray-900 z-50 flex flex-col">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Flow Designer - {buttonName}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Connect groups and workflow steps to create execution flows
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Node
          </button>
          <button
            onClick={handleTestFlow}
            disabled={nodes.length === 0}
            className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="h-4 w-4 mr-2" />
            Test Flow
          </button>
          <button
            onClick={handleSaveFlow}
            disabled={saving}
            className={`flex items-center px-4 py-2 text-white rounded-lg disabled:opacity-50 transition-all ${
              saveSuccess
                ? 'bg-green-600'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : saveSuccess ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Flow'}
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgeDelete}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ maxZoom: defaultZoom / 100 }}
          defaultViewport={{ x: 0, y: 0, zoom: defaultZoom / 100 }}
          snapToGrid
          snapGrid={[15, 15]}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'group') return '#3b82f6';
              if (node.data?.stepType === 'api_endpoint') return '#22c55e';
              if (node.data?.stepType === 'conditional_check') return '#f97316';
              if (node.data?.stepType === 'branch') return '#eab308';
              if (node.data?.stepType === 'route') return '#14b8a6';
              if (node.data?.stepType === 'user_input') return '#0ea5e9';
              if (node.data?.stepType === 'user_information') return '#64748b';
              if (node.data?.stepType === 'for_each') return '#84cc16';
              return '#6b7280';
            }}
          />

          {showAddPanel && (
            <Panel position="top-left" className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-64">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Add Node</h3>

              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Form Groups
                </h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {groups.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No groups created yet
                    </p>
                  ) : (
                    groups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => addGroupNode(group)}
                        className="w-full flex items-center px-3 py-2 text-left text-sm rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <Users className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="text-gray-900 dark:text-gray-100">{group.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Workflow Steps
                </h4>
                <div className="space-y-1">
                  {workflowStepTypes.map((step) => (
                    <button
                      key={step.type}
                      onClick={() => addWorkflowNode(step.type, `New ${step.label}`)}
                      className="w-full flex items-center px-3 py-2 text-left text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <step.icon className={`h-4 w-4 mr-2 text-${step.color}-600`} />
                      <span className="text-gray-900 dark:text-gray-100">{step.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowAddPanel(false)}
                className="mt-4 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {showStepForm && editingNode && (() => {
        const getAncestorNodeIds = (nodeId: string): Set<string> => {
          const ancestors = new Set<string>();
          const queue = [nodeId];
          while (queue.length > 0) {
            const current = queue.shift()!;
            for (const edge of edges) {
              if (edge.target === current && !ancestors.has(edge.source)) {
                ancestors.add(edge.source);
                queue.push(edge.source);
              }
            }
          }
          return ancestors;
        };

        const ancestorIds = getAncestorNodeIds(editingNode.id);

        const allStepsForForm = nodes
          .filter(n => n.type === 'workflow' && n.id !== editingNode.id && ancestorIds.has(n.id))
          .map(n => ({
            id: n.id,
            stepOrder: -1,
            stepType: n.data.stepType,
            stepName: n.data.label,
            configJson: n.data.config || {},
          }));
        const connectedGroupIds = new Set(
          nodes
            .filter(n => n.type === 'group' && ancestorIds.has(n.id))
            .map(n => n.data.groupId)
        );

        return (
        <StepConfigForm
          step={{
            id: editingNode.id,
            workflowId: buttonId,
            stepOrder: 0,
            stepType: editingNode.data.stepType,
            stepName: editingNode.data.label,
            configJson: editingNode.data.config || {},
          }}
          allSteps={allStepsForForm}
          apiConfig={{ id: '', baseUrl: '', authType: 'none', username: '', password: '', authToken: '', description: '', isActive: false }}
          onSave={handleSaveStepConfig}
          onCancel={() => {
            setShowStepForm(false);
            setEditingNode(null);
          }}
          executeButtonFields={fields
            .filter(f => connectedGroupIds.has(f.groupId))
            .map((f) => ({ fieldKey: f.fieldKey, name: f.name }))}
          arrayGroups={groups
            .filter(g => g.isArrayGroup && connectedGroupIds.has(g.id))
            .map(g => ({ id: g.id, name: g.name, arrayFieldName: g.arrayFieldName }))}
        />
        );
      })()}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Delete Node
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This action cannot be undone
                  </p>
                </div>
              </div>
              <p className="mt-4 text-gray-600 dark:text-gray-300">
                Are you sure you want to delete <span className="font-medium text-gray-900 dark:text-gray-100">"{deleteConfirm.nodeName}"</span>? Any connections to this node will also be removed.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteNode}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Node
              </button>
            </div>
          </div>
        </div>
      )}

      {copySourceNode && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Copy Step</h3>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Step Name
            </label>
            <input
              type="text"
              value={copyName}
              onChange={(e) => setCopyName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && copyName.trim()) handleConfirmCopy(); }}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <div className="flex justify-end space-x-2 mt-5">
              <button
                onClick={() => { setCopySourceNode(null); setCopyName(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCopy}
                disabled={!copyName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {showFieldMappingsModal && editingGroupNode && (() => {
        const groupFields = fields.filter(f => f.groupId === editingGroupNode.data.groupId);
        const availableVars = getAvailableVariables();
        const currentMappings = editingGroupNode.data.fieldMappings || {};
        const currentHeaderContent = editingGroupNode.data.headerContent || '';
        const currentDisplayWithPrevious = editingGroupNode.data.displayWithPrevious || false;
        const currentHeaderCurrentLoopItemOnly = editingGroupNode.data.headerCurrentLoopItemOnly || false;
        const groupNodes = nodes.filter(n => n.type === 'group');
        const isFirstGroup = groupNodes.length === 0 || groupNodes[0]?.id === editingGroupNode.id;
        const isInsideForEachLoop = nodes.some(n => n.data?.stepType === 'for_each');

        return (
          <FieldMappingsModal
            groupName={editingGroupNode.data.label}
            fields={groupFields}
            availableVariables={availableVars}
            currentMappings={currentMappings}
            currentHeaderContent={currentHeaderContent}
            currentDisplayWithPrevious={currentDisplayWithPrevious}
            currentHeaderCurrentLoopItemOnly={currentHeaderCurrentLoopItemOnly}
            isInsideForEachLoop={isInsideForEachLoop}
            isFirstGroup={isFirstGroup}
            onSave={handleSaveFieldMappings}
            onClose={() => {
              setShowFieldMappingsModal(false);
              setEditingGroupNode(null);
            }}
          />
        );
      })()}

      {showTestModal && (() => {
        const flowGroups = getFlowGroups();
        const flowGroupIds = flowGroups.map(g => g.id);
        const flowFields = (fullFields.length > 0 ? fullFields : fields.map(f => ({ ...f, isRequired: f.isRequired || false, defaultValue: f.defaultValue || null, options: f.options || [], sortOrder: f.sortOrder || 0, placeholder: f.placeholder || null, helpText: f.helpText || null, maxLength: f.maxLength || null })))
          .filter(f => flowGroupIds.includes(f.groupId));
        const flowNodeMappingsData: FlowNodeMapping[] = nodes
          .filter(n => n.type === 'group' && n.data.groupId)
          .map(n => ({
            nodeId: n.id,
            groupId: n.data.groupId,
            fieldMappings: n.data.fieldMappings || {},
            headerContent: n.data.headerContent || '',
            displayWithPrevious: n.data.displayWithPrevious || false,
            headerCurrentLoopItemOnly: n.data.headerCurrentLoopItemOnly || false,
          }));
        return (
          <FlowExecutionModal
            buttonId={buttonId}
            buttonName={buttonName}
            groups={flowGroups as FlowExecutionGroup[]}
            fields={flowFields as FlowExecutionField[]}
            flowNodeMappings={flowNodeMappingsData}
            onClose={() => setShowTestModal(false)}
            title={`Test Flow - ${buttonName}`}
            userId={currentUserId}
            hasWorkflowNodes={nodes.some(n => n.type !== 'group')}
          />
        );
      })()}
    </div>
  );
}

export default function FlowDesigner(props: FlowDesignerProps) {
  return (
    <ReactFlowProvider>
      <FlowDesignerInner {...props} />
    </ReactFlowProvider>
  );
}
