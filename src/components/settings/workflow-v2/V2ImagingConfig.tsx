import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Plus, X, Braces } from 'lucide-react';
import CustomDropdown from '../../common/CustomDropdown';
import { fetchBuckets, fetchDocumentTypes, fetchMetadataFields } from '../../../services/imagingService';
import type { ImagingBucket, ImagingDocumentType, ImagingMetadataField } from '../../../types';
import VariableDropdown from '../workflow/VariableDropdown';

interface V2ImagingConfigProps {
  config: any;
  updateConfig: (key: string, value: any) => void;
  allNodes?: any[];
  currentNodeId?: string;
  workflowInputVariables?: Array<{ name: string; stepName: string; source: 'workflow_input'; dataType?: string }>;
}

export default function V2ImagingConfig({ config, updateConfig, allNodes = [], currentNodeId = '', workflowInputVariables = [] }: V2ImagingConfigProps) {
  const [buckets, setBuckets] = useState<ImagingBucket[]>([]);
  const [docTypes, setDocTypes] = useState<ImagingDocumentType[]>([]);
  const [metadataFields, setMetadataFields] = useState<ImagingMetadataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [openVariableDropdown, setOpenVariableDropdown] = useState<string | null>(null);
  const buttonRefs = useRef<Record<string, React.RefObject<HTMLButtonElement>>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [b, d, m] = await Promise.all([fetchBuckets(), fetchDocumentTypes(), fetchMetadataFields()]);
        setBuckets(b.filter(x => x.isActive));
        setDocTypes(d.filter(x => x.isActive));
        setMetadataFields(m.filter(x => x.isActive));
      } catch (err) {
        console.error('Failed to load imaging config:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getButtonRef = (key: string): React.RefObject<HTMLButtonElement> => {
    if (!buttonRefs.current[key]) {
      buttonRefs.current[key] = React.createRef<HTMLButtonElement>();
    }
    return buttonRefs.current[key];
  };

  const getAvailableVariables = () => {
    const variables: { name: string; stepName: string; source: 'extraction' | 'workflow' | 'source_record' | 'workflow_input'; dataType?: string }[] = [];
    workflowInputVariables.forEach(v => variables.push(v));
    allNodes.forEach((node) => {
      if (node.id === currentNodeId || node.type === 'start') return;
      const nodeConfig = node.data?.configJson || {};
      const nodeName = node.data?.label || 'Step';
      if (nodeConfig.responseDataMappings && Array.isArray(nodeConfig.responseDataMappings)) {
        nodeConfig.responseDataMappings.forEach((m: any) => {
          if (m.updatePath) {
            variables.push({ name: `response.${m.updatePath}`, stepName: nodeName, source: 'workflow' });
          }
        });
      }
      if (node.data?.stepType === 'read_email' && Array.isArray(nodeConfig.emailFieldMappings)) {
        nodeConfig.emailFieldMappings.forEach((m: any) => {
          if (m.fieldName) {
            variables.push({ name: m.fieldName, stepName: nodeName, source: 'workflow' });
          }
        });
      }
      if (node.data?.stepType === 'data_transform' && Array.isArray(nodeConfig.transformations)) {
        nodeConfig.transformations.forEach((t: any) => {
          if (t.outputVariable) {
            variables.push({ name: `transform.${t.outputVariable}`, stepName: nodeName, source: 'workflow' });
          }
        });
      }
      if (node.data?.stepType === 'read_barcode' && Array.isArray(nodeConfig.barcodeFieldMappings)) {
        nodeConfig.barcodeFieldMappings.forEach((m: any) => {
          if (m.fieldName) {
            variables.push({ name: m.fieldName, stepName: nodeName, source: 'workflow' });
          }
        });
      }
    });
    return variables;
  };

  const handleInsertVariable = (configKey: string, varName: string) => {
    const current = config[configKey] || '';
    updateConfig(configKey, `${current}{{${varName}}}`);
    setOpenVariableDropdown(null);
  };

  const handleInsertMetadataVariable = (index: number, varName: string) => {
    const current = (config.metadataMappings || [])[index]?.value || '';
    const updated = (config.metadataMappings || []).map((m: any, i: number) =>
      i === index ? { ...m, value: `${current}{{${varName}}}` } : m
    );
    updateConfig('metadataMappings', updated);
    setOpenVariableDropdown(null);
  };

  const metadataMappings: { fieldId: string; value: string }[] = config.metadataMappings || [];

  const addMetadataMapping = () => {
    const updated = [...metadataMappings, { fieldId: '', value: '' }];
    updateConfig('metadataMappings', updated);
  };

  const updateMetadataMapping = (index: number, key: 'fieldId' | 'value', val: string) => {
    const updated = metadataMappings.map((m, i) => i === index ? { ...m, [key]: val } : m);
    updateConfig('metadataMappings', updated);
  };

  const removeMetadataMapping = (index: number) => {
    const updated = metadataMappings.filter((_, i) => i !== index);
    updateConfig('metadataMappings', updated);
  };

  const usedFieldIds = new Set(metadataMappings.map(m => m.fieldId));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const isPutMode = (config.imagingMode || 'put') === 'put';
  const isGetMode = !isPutMode;
  const getRetrievalMode = config.getRetrievalMode || 'single';
  const variables = getAvailableVariables();

  const renderVariableButton = (fieldKey: string, openAbove: boolean = false) => (
    <>
      <button
        ref={getButtonRef(fieldKey)}
        type="button"
        onClick={() => setOpenVariableDropdown(openVariableDropdown === fieldKey ? null : fieldKey)}
        className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
        title="Insert variable"
      >
        <Braces className="w-3.5 h-3.5" />
      </button>
      <VariableDropdown
        isOpen={openVariableDropdown === fieldKey}
        onClose={() => setOpenVariableDropdown(null)}
        triggerRef={getButtonRef(fieldKey)}
        variables={variables}
        onSelect={(varName) => handleInsertVariable(fieldKey, varName)}
        openAbove={openAbove}
      />
    </>
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mode</label>
        <CustomDropdown
          value={config.imagingMode || 'put'}
          onChange={(val) => updateConfig('imagingMode', val)}
          options={[
            { value: 'put', label: 'PUT - Upload to Imaging' },
            { value: 'get', label: 'GET - Retrieve from Imaging' },
          ]}
          size="sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Storage Bucket</label>
        <CustomDropdown
          value={config.bucketId || ''}
          onChange={(val) => updateConfig('bucketId', val)}
          options={[
            { value: '', label: 'Select a bucket...' },
            ...buckets.map(b => ({ value: b.id, label: b.name })),
          ]}
          size="sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Document Type</label>
        <CustomDropdown
          value={config.documentTypeId || ''}
          onChange={(val) => updateConfig('documentTypeId', val)}
          options={[
            { value: '', label: 'Select a document type...' },
            ...docTypes.map(d => ({ value: d.id, label: d.name })),
          ]}
          size="sm"
        />
      </div>

      {isGetMode && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Retrieve</label>
            <CustomDropdown
              value={getRetrievalMode}
              onChange={(val) => updateConfig('getRetrievalMode', val)}
              options={[
                { value: 'single', label: 'Single document (latest match)' },
                { value: 'all', label: 'All documents matching Detail Line ID / Bill Number' },
              ]}
              size="sm"
            />
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Choose "All documents" to fetch every document (Invoice, POD, BOL, etc.) for the same shipment. The results are stored on the workflow context as <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">imagingDocuments</code>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Detail Line ID
              <span className="ml-1 text-gray-400 font-normal">(supports {'{{variable}}'})</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={config.detailLineId || ''}
                onChange={(e) => updateConfig('detailLineId', e.target.value)}
                placeholder="e.g. {{detailLineId}}"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              {renderVariableButton('detailLineId', true)}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Bill Number
              <span className="ml-1 text-gray-400 font-normal">(supports {'{{variable}}'})</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={config.billNumber || ''}
                onChange={(e) => updateConfig('billNumber', e.target.value)}
                placeholder="e.g. {{billNumber}}"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              {renderVariableButton('billNumber', true)}
            </div>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Provide at least one of Detail Line ID or Bill Number. If both are filled, Detail Line ID is used first.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Attachment Filename
              <span className="ml-1 text-gray-400 font-normal">(supports {'{{variable}}'}, optional)</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={config.attachmentFilenameTemplate || ''}
                onChange={(e) => updateConfig('attachmentFilenameTemplate', e.target.value)}
                placeholder="e.g. Invoice_{{billNumber}}.pdf"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              {renderVariableButton('attachmentFilenameTemplate', true)}
            </div>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              Sets the filename each retrieved document uses when attached to a later Email step. Leave blank to keep the original filename. This lets you name Invoice and POD attachments differently when multiple Imaging steps run in the same workflow.
            </p>
          </div>
        </>
      )}

      {isPutMode && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Filename Template
              <span className="ml-1 text-gray-400 font-normal">(supports {'{{variable}}'}, optional)</span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={config.filenameTemplate || ''}
                onChange={(e) => updateConfig('filenameTemplate', e.target.value)}
                placeholder="e.g. {{response.orderNumber}}_document.pdf"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              {renderVariableButton('filenameTemplate')}
            </div>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              If set, the file will be renamed before uploading. Leave empty to use the original filename.
            </p>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
            <input
              type="checkbox"
              id="sendToCloudConvert"
              checked={config.sendToCloudConvert || false}
              onChange={(e) => updateConfig('sendToCloudConvert', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="sendToCloudConvert" className="text-sm text-gray-700 dark:text-gray-300">
              Send to CloudConvert (OCR + optimize)
            </label>
          </div>

          {metadataFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Metadata Fields
                  <span className="ml-1 text-gray-400 font-normal">(values support {'{{variable}}'})</span>
                </label>
                <button
                  type="button"
                  onClick={addMetadataMapping}
                  disabled={metadataMappings.length >= metadataFields.length}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>

              {metadataMappings.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  No metadata mappings configured. Add mappings here for Detail Line ID, Bill Number, or other metadata fields.
                </p>
              )}

              <div className="space-y-2">
                {metadataMappings.map((mapping, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CustomDropdown
                      value={mapping.fieldId}
                      onChange={(val) => updateMetadataMapping(idx, 'fieldId', val)}
                      options={[
                        { value: '', label: 'Select field...' },
                        ...metadataFields
                          .filter(f => f.id === mapping.fieldId || !usedFieldIds.has(f.id))
                          .map(f => ({ value: f.id, label: f.displayLabel })),
                      ]}
                      size="sm"
                      className="flex-1"
                    />
                    <input
                      type="text"
                      value={mapping.value}
                      onChange={(e) => updateMetadataMapping(idx, 'value', e.target.value)}
                      placeholder="Value or {{variable}}"
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      ref={getButtonRef(`metadata_value_${idx}`)}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === `metadata_value_${idx}` ? null : `metadata_value_${idx}`)}
                      className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
                      title="Insert variable"
                    >
                      <Braces className="w-3.5 h-3.5" />
                    </button>
                    <VariableDropdown
                      isOpen={openVariableDropdown === `metadata_value_${idx}`}
                      onClose={() => setOpenVariableDropdown(null)}
                      triggerRef={getButtonRef(`metadata_value_${idx}`)}
                      variables={variables}
                      onSelect={(varName) => handleInsertMetadataVariable(idx, varName)}
                    />
                    <button
                      type="button"
                      onClick={() => removeMetadataMapping(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Response Data Mappings</label>
          <button
            type="button"
            onClick={() => updateConfig('responseDataMappings', [...(config.responseDataMappings || []), { responsePath: '', updatePath: '' }])}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
          >
            <Plus className="h-3 w-3" />
            Add Mapping
          </button>
        </div>

        {(config.responseDataMappings || []).length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            No response data mappings configured.
          </p>
        )}

        {(config.responseDataMappings || []).length > 0 && (
          <div className="space-y-2">
            {(config.responseDataMappings || []).map((mapping: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={mapping.responsePath || ''}
                  onChange={(e) => {
                    const updated = [...(config.responseDataMappings || [])];
                    updated[index] = { ...updated[index], responsePath: e.target.value };
                    updateConfig('responseDataMappings', updated);
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Response path (e.g., data.id)"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="text"
                  value={mapping.updatePath || ''}
                  onChange={(e) => {
                    const updated = [...(config.responseDataMappings || [])];
                    updated[index] = { ...updated[index], updatePath: e.target.value };
                    updateConfig('responseDataMappings', updated);
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Context path (e.g., documentId)"
                />
                <button
                  type="button"
                  onClick={() => {
                    const updated = (config.responseDataMappings || []).filter((_: any, i: number) => i !== index);
                    updateConfig('responseDataMappings', updated);
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Map values from the imaging response to context variables for use in subsequent steps.
        </p>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">Detail Line ID and Bill Number</p>
        {isPutMode ? (
          <p>On PUT, these are configured as metadata mappings above. Add them in the Metadata Fields section by selecting the appropriate field and providing a variable template value.</p>
        ) : (
          <p>On GET, use the Detail Line ID and Bill Number inputs above. Inside an Imaging workflow you can insert <code className="px-1 rounded bg-blue-100 dark:bg-blue-800/40">{'{{detailLineId}}'}</code> or <code className="px-1 rounded bg-blue-100 dark:bg-blue-800/40">{'{{billNumber}}'}</code> to reuse the values from the document that triggered the workflow.</p>
        )}
      </div>

      <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-xs text-gray-500 dark:text-gray-400">
        {isPutMode ? (
          <p>PUT mode: uploads the current PDF to the selected bucket and document type. Optionally renames the file, sets metadata, and sends to CloudConvert for OCR processing.</p>
        ) : getRetrievalMode === 'all' ? (
          <p>GET (all) mode: fetches every document matching the Detail Line ID or Bill Number. Results are stored on the context as <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">imagingDocuments</code> (an array of {'{documentUrl, documentTypeName, originalFilename, ...}'}), plus <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">imagingDocumentUrls</code> (comma-separated URLs) for downstream steps.</p>
        ) : (
          <p>GET mode: retrieves a single document from the selected bucket using the document type. The document URL will be stored in the workflow context as <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">imagingDocumentUrl</code>.</p>
        )}
      </div>
    </div>
  );
}
