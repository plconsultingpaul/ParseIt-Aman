import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Braces, HelpCircle, LogOut, Sparkles, FileText, AlertCircle, TextCursorInput, Info, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import Select from '../../common/Select';
import ApiEndpointConfigSection from './ApiEndpointConfigSection';
import VariableDropdown from './VariableDropdown';
import { supabase } from '../../../lib/supabase';

interface ExecuteButtonField {
  fieldKey: string;
  name: string;
}

interface ArrayGroup {
  id: string;
  name: string;
  arrayFieldName: string;
}

interface StepConfigFormProps {
  step: any;
  allSteps: any[];
  apiConfig: any;
  onSave: (stepData: any) => void;
  onCancel: () => void;
  extractionType?: any;
  executeButtonFields?: ExecuteButtonField[];
  arrayGroups?: ArrayGroup[];
}

interface TransformationRule {
  field_name: string;
  transformation: string;
  sourceVariable?: string;
  function?: string;
  outputVariable?: string;
  leftCount?: number;
  removeLeftCount?: number;
}

export default function StepConfigForm({ step, allSteps, apiConfig, onSave, onCancel, extractionType, executeButtonFields, arrayGroups = [] }: StepConfigFormProps) {
  const flowHasLanguageSelection = allSteps?.some(s => {
    const cfg = s.configJson || s.config_json;
    return (s.stepType === 'user_information' || s.step_type === 'user_information') && cfg?.enableLanguageSelection;
  }) || false;

  const [stepName, setStepName] = useState(step?.stepName || step?.step_name || 'New Step');
  const [stepType, setStepType] = useState(step?.stepType || step?.step_type || 'api_call');
  const [method, setMethod] = useState('POST');
  const [url, setUrl] = useState('https://api.example.com/endpoint');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer YOUR_TOKEN_HERE"\n}');
  const [requestBody, setRequestBody] = useState('');
  const [transformations, setTransformations] = useState<TransformationRule[]>([
    { field_name: '', transformation: '' }
  ]);
  const [sftpPath, setSftpPath] = useState('/uploads/xml/');
  const [conditionalField, setConditionalField] = useState('');
  const [conditionalOperator, setConditionalOperator] = useState('equals');
  const [conditionalValue, setConditionalValue] = useState('');
  const [additionalConditions, setAdditionalConditions] = useState<Array<{ jsonPath: string; operator: string; expectedValue: string }>>([]);
  const [logicalOperator, setLogicalOperator] = useState<'AND' | 'OR'>('AND');
  const [emailActionType, setEmailActionType] = useState('send_email');
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [includeAttachment, setIncludeAttachment] = useState(true);
  const [attachmentSource, setAttachmentSource] = useState('original_pdf');
  const [attachmentBase64Variable, setAttachmentBase64Variable] = useState('');
  const [attachmentFilename, setAttachmentFilename] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [pdfEmailStrategy, setPdfEmailStrategy] = useState<'all_pages_in_group' | 'specific_page_in_group'>('all_pages_in_group');
  const [specificPageToEmail, setSpecificPageToEmail] = useState(1);
  const [ccUser, setCcUser] = useState(false);
  const [isNotificationEmail, setIsNotificationEmail] = useState(false);
  const [notificationTemplateId, setNotificationTemplateId] = useState('');
  const [recipientEmailOverride, setRecipientEmailOverride] = useState('');
  const [notificationTemplates, setNotificationTemplates] = useState<any[]>([]);
  const [customFieldMappings, setCustomFieldMappings] = useState<Record<string, string>>({});
  const [selectedTemplateCustomFields, setSelectedTemplateCustomFields] = useState<Array<{name: string; label: string; description?: string}>>([]);
  const [nextStepOnSuccess, setNextStepOnSuccess] = useState('');
  const [nextStepOnFailure, setNextStepOnFailure] = useState('');
  const [responseDataMappings, setResponseDataMappings] = useState<Array<{ responsePath: string; updatePath: string }>>([
    { responsePath: '', updatePath: '' }
  ]);
  const [useApiResponseForFilename, setUseApiResponseForFilename] = useState(false);
  const [filenameSourcePath, setFilenameSourcePath] = useState('');
  const [fallbackFilename, setFallbackFilename] = useState('');
  const [sftpPathOverride, setSftpPathOverride] = useState('');
  const [renamePdfTemplate, setRenamePdfTemplate] = useState('');
  const [useExtractedDataForRename, setUseExtractedDataForRename] = useState(true);
  const [renameFallbackFilename, setRenameFallbackFilename] = useState('');
  const [appendTimestamp, setAppendTimestamp] = useState(false);
  const [timestampFormat, setTimestampFormat] = useState('YYYYMMDD');
  const [renameFileTypes, setRenameFileTypes] = useState({
    pdf: true,
    csv: false,
    json: false,
    xml: false
  });
  const [pdfUploadStrategy, setPdfUploadStrategy] = useState<'all_pages_in_group' | 'specific_page_in_group'>('all_pages_in_group');
  const [specificPageToUpload, setSpecificPageToUpload] = useState(1);
  const [uploadFileTypes, setUploadFileTypes] = useState({
    json: true,
    pdf: true,
    xml: true,
    csv: true
  });
  const [uploadType, setUploadType] = useState('csv');
  const [escapeSingleQuotesInBody, setEscapeSingleQuotesInBody] = useState(false);
  const [responseReturnsArray, setResponseReturnsArray] = useState(false);
  const [userResponseTemplate, setUserResponseTemplate] = useState('');
  const [apiEndpointConfig, setApiEndpointConfig] = useState<any>({});
  const [openVariableDropdown, setOpenVariableDropdown] = useState<string | null>(null);
  const buttonRefs = useRef<Record<string, React.RefObject<HTMLButtonElement>>>({});
  const promptMessageRef = useRef<HTMLTextAreaElement>(null);
  const [promptMessageCursorPos, setPromptMessageCursorPos] = useState<number | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const [emailBodyCursorPos, setEmailBodyCursorPos] = useState<number | null>(null);
  const signaturePopupTextRef = useRef<HTMLTextAreaElement>(null);
  const [signaturePopupTextCursorPos, setSignaturePopupTextCursorPos] = useState<number | null>(null);
  const [promptMessage, setPromptMessage] = useState('');
  const [yesButtonLabel, setYesButtonLabel] = useState('Yes');
  const [noButtonLabel, setNoButtonLabel] = useState('No');
  const [confirmationOptions, setConfirmationOptions] = useState<Array<{ label: string }>>([
    { label: 'Yes' },
    { label: 'No' },
  ]);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [latitudeVariable, setLatitudeVariable] = useState('');
  const [longitudeVariable, setLongitudeVariable] = useState('');
  const [confirmationImageSource, setConfirmationImageSource] = useState<'none' | 'branding_logo' | 'custom_url'>('none');
  const [confirmationCustomImageUrl, setConfirmationCustomImageUrl] = useState('');
  const [confirmationImageMaxHeight, setConfirmationImageMaxHeight] = useState(80);
  const [exitMessage, setExitMessage] = useState('');
  const [exitMessageFr, setExitMessageFr] = useState('');
  const [exitMessageEs, setExitMessageEs] = useState('');
  const [showRestartButton, setShowRestartButton] = useState(false);
  const [exitImageSource, setExitImageSource] = useState<'none' | 'branding_logo' | 'custom_url'>('none');
  const [exitCustomImageUrl, setExitCustomImageUrl] = useState('');
  const [exitImageMaxHeight, setExitImageMaxHeight] = useState(80);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponseMappings, setAiResponseMappings] = useState<Array<{ fieldName: string; aiInstruction: string }>>([
    { fieldName: '', aiInstruction: '' }
  ]);
  const [placesSearchQuery, setPlacesSearchQuery] = useState('');
  const [placesFieldsToReturn, setPlacesFieldsToReturn] = useState({
    name: true,
    address: true,
    phone: false,
    website: false,
    rating: false,
    hours: false,
    placeId: false
  });
  const [placesResponseMappings, setPlacesResponseMappings] = useState<Array<{ fieldName: string; placesField: string }>>([
    { fieldName: '', placesField: '' }
  ]);
  const [multipartUrl, setMultipartUrl] = useState('');
  const [multipartApiSourceType, setMultipartApiSourceType] = useState<'main' | 'secondary' | 'auth_config'>('main');
  const [multipartSecondaryApiId, setMultipartSecondaryApiId] = useState('');
  const [multipartAuthConfigId, setMultipartAuthConfigId] = useState('');
  const [multipartFormParts, setMultipartFormParts] = useState<Array<{
    name: string;
    type: 'text' | 'file';
    value: string;
    contentType: string;
    fieldMappings?: Array<{ fieldName: string; type: 'hardcoded' | 'variable'; value: string; dataType: string }>;
  }>>([
    { name: 'file', type: 'file', value: '', contentType: '' }
  ]);
  const [multipartJsonParseError, setMultipartJsonParseError] = useState<{ [key: number]: string }>({});
  const [multipartFilenameTemplate, setMultipartFilenameTemplate] = useState('');
  const [multipartResponseMappings, setMultipartResponseMappings] = useState<Array<{ responsePath: string; updatePath: string }>>([]);
  const [secondaryApis, setSecondaryApis] = useState<any[]>([]);
  const [authConfigs, setAuthConfigs] = useState<any[]>([]);
  const [routeFieldPath, setRouteFieldPath] = useState('');
  const [routes, setRoutes] = useState<Array<{ label: string; operator: string; expectedValue: string }>>([
    { label: '', operator: 'equals', expectedValue: '' },
    { label: '', operator: 'equals', expectedValue: '' },
  ]);
  const [routeDefaultIndex, setRouteDefaultIndex] = useState<number | null>(null);
  const [userInputType, setUserInputType] = useState<'barcode_scanner' | 'number_pad' | 'signature_capture' | 'camera_capture'>('barcode_scanner');
  const [userInputLabel, setUserInputLabel] = useState('');
  const [userInputLabelFr, setUserInputLabelFr] = useState('');
  const [userInputLabelEs, setUserInputLabelEs] = useState('');
  const [userInputVariableName, setUserInputVariableName] = useState('');
  const [allowMultipleScans, setAllowMultipleScans] = useState(false);
  const [currentLoopItemOnly, setCurrentLoopItemOnly] = useState(false);
  const [signaturePopupEnabled, setSignaturePopupEnabled] = useState(false);
  const [signaturePopupText, setSignaturePopupText] = useState('');
  const [infoImageSource, setInfoImageSource] = useState<'none' | 'branding_logo' | 'custom_url'>('none');
  const [infoCustomImageUrl, setInfoCustomImageUrl] = useState('');
  const [infoImageMaxHeight, setInfoImageMaxHeight] = useState(80);
  const [infoContentMarkdown, setInfoContentMarkdown] = useState('');
  const [infoContinueButtonLabel, setInfoContinueButtonLabel] = useState('Continue');
  const [infoContentAlignment, setInfoContentAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [infoEnableLanguageSelection, setInfoEnableLanguageSelection] = useState(false);
  const [infoEnabledLanguages, setInfoEnabledLanguages] = useState<string[]>(['fr', 'es']);
  const [infoContentMarkdownFr, setInfoContentMarkdownFr] = useState('');
  const [infoContentMarkdownEs, setInfoContentMarkdownEs] = useState('');
  const [infoContinueButtonLabelFr, setInfoContinueButtonLabelFr] = useState('');
  const [infoContinueButtonLabelEs, setInfoContinueButtonLabelEs] = useState('');
  const [forEachSourceArray, setForEachSourceArray] = useState('');
  const [forEachItemVariable, setForEachItemVariable] = useState('item');
  const [userSelectionSourceArray, setUserSelectionSourceArray] = useState('');
  const [userSelectionItemVariable, setUserSelectionItemVariable] = useState('item');
  const [userSelectionDisplayTemplate, setUserSelectionDisplayTemplate] = useState('');
  const [userSelectionPromptText, setUserSelectionPromptText] = useState('');

  useEffect(() => {
    const loadNotificationTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('notification_templates')
          .select('*, custom_fields')
          .order('template_name');

        if (error) {
          console.error('Failed to load notification templates:', error);
          return;
        }

        setNotificationTemplates(data || []);
      } catch (err) {
        console.error('Error loading notification templates:', err);
      }
    };

    loadNotificationTemplates();
  }, []);

  useEffect(() => {
    const loadApiConfigs = async () => {
      try {
        const { data: secondaryData } = await supabase
          .from('secondary_api_configs')
          .select('id, name')
          .order('name');
        setSecondaryApis(secondaryData || []);

        const { data: authData } = await supabase
          .from('api_auth_config')
          .select('id, name')
          .order('name');
        setAuthConfigs(authData || []);
      } catch (err) {
        console.error('Error loading API configs:', err);
      }
    };
    loadApiConfigs();
  }, []);

  useEffect(() => {
    if (notificationTemplateId && notificationTemplates.length > 0) {
      const template = notificationTemplates.find(t => t.id === notificationTemplateId);
      if (template && template.custom_fields) {
        setSelectedTemplateCustomFields(template.custom_fields);
      } else {
        setSelectedTemplateCustomFields([]);
      }
    } else {
      setSelectedTemplateCustomFields([]);
    }
  }, [notificationTemplateId, notificationTemplates]);

  useEffect(() => {
    console.log('StepConfigForm useEffect - step data:', step);

    // Set basic step properties
    if (step) {
      setStepName(step.stepName || step.step_name || 'New Step');
      setStepType(step.stepType || step.step_type || 'api_call');
      setNextStepOnSuccess(step.nextStepOnSuccessId || step.next_step_on_success_id || '');
      setNextStepOnFailure(step.nextStepOnFailureId || step.next_step_on_failure_id || '');
      setUserResponseTemplate(
        step.userResponseTemplate
        || step.user_response_template
        || (step.configJson || step.config_json || {}).userResponseTemplate
        || ''
      );

      // Load configuration from step.configJson or step.config_json
      const config = step.configJson || step.config_json;
      console.log('Loading config from step:', config);

      if (config) {
        // API Call configuration
        setMethod(config.method || 'POST');
        setUrl(config.url || 'https://api.example.com/endpoint');

        // Pre-fill headers with API config token if available
        if (config.headers) {
          setHeaders(JSON.stringify(config.headers, null, 2));
        } else {
          // Create default headers with actual API token if available
          const defaultHeaders = {
            "Content-Type": "application/json",
            "Authorization": "Bearer YOUR_TOKEN_HERE"
          };
          setHeaders(JSON.stringify(defaultHeaders, null, 2));
        }

        setRequestBody(config.requestBody || config.request_body || '');
        setEscapeSingleQuotesInBody(config.escapeSingleQuotesInBody || false);
        setResponseReturnsArray(config.responseReturnsArray || false);

        // API Call response handling configuration - support both old and new formats
        if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
          setResponseDataMappings(config.responseDataMappings);
        } else if (config.responseDataPath || config.updateJsonPath) {
          setResponseDataMappings([{
            responsePath: config.responseDataPath || '',
            updatePath: config.updateJsonPath || ''
          }]);
        } else {
          setResponseDataMappings([{ responsePath: '', updatePath: '' }]);
        }

        // SFTP Upload configuration
        setUseApiResponseForFilename(config.useApiResponseForFilename || false);
        setFilenameSourcePath(config.filenameSourcePath || '');
        setFallbackFilename(config.fallbackFilename || '');
        setSftpPathOverride(config.sftpPathOverride || '');
        setPdfUploadStrategy(config.pdfUploadStrategy || 'all_pages_in_group');
        setSpecificPageToUpload(config.specificPageToUpload || 1);
        setUploadFileTypes(config.uploadFileTypes || { json: true, pdf: true, xml: true, csv: true });
        setUploadType(config.uploadType || 'csv');

        // Rename File configuration
        setRenamePdfTemplate(config.filenameTemplate || config.template || '');
        setUseExtractedDataForRename(config.useExtractedData !== false);
        setRenameFallbackFilename(config.fallbackFilename || '');
        setAppendTimestamp(config.appendTimestamp || false);
        setTimestampFormat(config.timestampFormat || 'YYYYMMDD');
        setRenameFileTypes({
          pdf: config.renamePdf !== false,
          csv: config.renameCsv === true,
          json: config.renameJson === true,
          xml: config.renameXml === true
        });

        // Data Transform configuration
        setTransformations((config.transformations || [{ field_name: '', transformation: '' }]).map((t: any) => ({
          field_name: t.field_name || t.sourceVariable || '',
          transformation: t.transformation || t.function || '',
          sourceVariable: t.sourceVariable || t.field_name || '',
          function: t.function || t.transformation || '',
          outputVariable: t.outputVariable || t.field_name || '',
          leftCount: t.leftCount,
          removeLeftCount: t.removeLeftCount,
          mathFactor: t.mathFactor,
          mathDecimals: t.mathDecimals,
          overwriteSource: t.overwriteSource,
        })));

        // SFTP Upload configuration
        setSftpPath(config.sftpPath || config.sftp_path || '/uploads/xml/');

        // Conditional Check configuration - support both old and new field names
        setConditionalField(config.jsonPath || config.fieldPath || config.checkField || config.conditional_field || '');
        setConditionalOperator(config.conditionType || config.operator || config.conditional_operator || 'equals');
        setConditionalValue(config.expectedValue || config.conditional_value || '');
        setAdditionalConditions(config.additionalConditions || []);
        setLogicalOperator(config.logicalOperator || 'AND');

        // Email Action configuration
        setEmailActionType(config.actionType || 'send_email');
        setEmailTo(config.to || '');
        setEmailCc(config.cc || '');
        setEmailBcc(config.bcc || '');
        setEmailSubject(config.subject || '');
        setEmailBody(config.body || '');
        setIncludeAttachment(config.includeAttachment !== false);
        setAttachmentSource(config.attachmentSource || 'original_pdf');
        setAttachmentBase64Variable(config.attachmentBase64Variable || '');
        setAttachmentFilename(config.attachmentFilename || '');
        setEmailFrom(config.from || '');
        setPdfEmailStrategy(config.pdfEmailStrategy || 'all_pages_in_group');
        setSpecificPageToEmail(config.specificPageToEmail || 1);
        setCcUser(config.ccUser || false);
        setIsNotificationEmail(config.isNotificationEmail || false);
        setNotificationTemplateId(config.notificationTemplateId || '');
        setRecipientEmailOverride(config.recipientEmailOverride || '');
        setCustomFieldMappings(config.customFieldMappings || {});

        // API Endpoint configuration
        if (step?.stepType === 'api_endpoint' || step?.step_type === 'api_endpoint') {
          setApiEndpointConfig(config);
        }

        // User Confirmation configuration
        setPromptMessage(config.promptMessage || '');
        setYesButtonLabel(config.yesButtonLabel || 'Yes');
        setNoButtonLabel(config.noButtonLabel || 'No');
        if (config.options && Array.isArray(config.options) && config.options.length >= 2) {
          setConfirmationOptions(config.options);
        } else {
          setConfirmationOptions([
            { label: config.yesButtonLabel || 'Yes' },
            { label: config.noButtonLabel || 'No' },
          ]);
        }
        setShowLocationMap(config.showLocationMap || false);
        setLatitudeVariable(config.latitudeVariable || '');
        setLongitudeVariable(config.longitudeVariable || '');
        setConfirmationImageSource(config.confirmationImageSource || 'none');
        setConfirmationCustomImageUrl(config.confirmationCustomImageUrl || '');
        setConfirmationImageMaxHeight(config.confirmationImageMaxHeight || 80);

        // Exit configuration
        setExitMessage(config.exitMessage || '');
        setExitMessageFr(config.translations?.fr?.exitMessage || '');
        setExitMessageEs(config.translations?.es?.exitMessage || '');
        setShowRestartButton(config.showRestartButton || false);
        setExitImageSource(config.imageSource || 'none');
        setExitCustomImageUrl(config.customImageUrl || '');
        setExitImageMaxHeight(config.imageMaxHeight || 80);

        // AI Lookup configuration
        setAiPrompt(config.aiPrompt || '');
        if (config.aiResponseMappings && Array.isArray(config.aiResponseMappings)) {
          setAiResponseMappings(config.aiResponseMappings);
        } else {
          setAiResponseMappings([{ fieldName: '', aiInstruction: '' }]);
        }

        // Google Places Lookup configuration
        setPlacesSearchQuery(config.placesSearchQuery || '');
        if (config.placesFieldsToReturn) {
          setPlacesFieldsToReturn(config.placesFieldsToReturn);
        } else {
          setPlacesFieldsToReturn({ name: true, address: true, phone: false, website: false, rating: false, hours: false, placeId: false });
        }
        if (config.placesResponseMappings && Array.isArray(config.placesResponseMappings)) {
          setPlacesResponseMappings(config.placesResponseMappings);
        } else {
          setPlacesResponseMappings([{ fieldName: '', placesField: '' }]);
        }

        setMultipartUrl(config.url || '');
        setMultipartApiSourceType(config.apiSourceType || 'main');
        setMultipartSecondaryApiId(config.secondaryApiId || '');
        setMultipartAuthConfigId(config.authConfigId || '');
        if (config.formParts && Array.isArray(config.formParts)) {
          setMultipartFormParts(config.formParts);
        } else {
          setMultipartFormParts([{ name: 'file', type: 'file', value: '', contentType: '' }]);
        }
        setMultipartFilenameTemplate(config.filenameTemplate || '');
        if (config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
          setMultipartResponseMappings(config.responseDataMappings);
        } else {
          setMultipartResponseMappings([]);
        }

        setRouteFieldPath(config.routeFieldPath || '');
        if (config.routes && Array.isArray(config.routes) && config.routes.length >= 2) {
          setRoutes(config.routes);
        } else {
          setRoutes([
            { label: '', operator: 'equals', expectedValue: '' },
            { label: '', operator: 'equals', expectedValue: '' },
          ]);
        }
        setRouteDefaultIndex(config.routeDefaultIndex ?? null);

        setUserInputType(config.inputType || 'barcode_scanner');
        setUserInputLabel(config.inputLabel || '');
        setUserInputLabelFr(config.translations?.fr?.inputLabel || '');
        setUserInputLabelEs(config.translations?.es?.inputLabel || '');
        setUserInputVariableName(config.variableName || '');
        setAllowMultipleScans(config.allowMultipleScans || false);
        setCurrentLoopItemOnly(config.currentLoopItemOnly || false);
        setSignaturePopupEnabled(config.signaturePopupEnabled || false);
        setSignaturePopupText(config.signaturePopupText || '');

        setInfoImageSource(config.imageSource || 'none');
        setInfoCustomImageUrl(config.customImageUrl || '');
        setInfoImageMaxHeight(config.imageMaxHeight || 80);
        setInfoContentMarkdown(config.contentMarkdown || '');
        setInfoContinueButtonLabel(config.continueButtonLabel || 'Continue');
        setInfoContentAlignment(config.contentAlignment || 'left');
        setInfoEnableLanguageSelection(config.enableLanguageSelection || false);
        setInfoEnabledLanguages(config.enabledLanguages || ['fr', 'es']);
        setInfoContentMarkdownFr(config.translations?.fr?.contentMarkdown || '');
        setInfoContentMarkdownEs(config.translations?.es?.contentMarkdown || '');
        setInfoContinueButtonLabelFr(config.translations?.fr?.continueButtonLabel || '');
        setInfoContinueButtonLabelEs(config.translations?.es?.continueButtonLabel || '');

        setForEachSourceArray(config.sourceArray || '');
        setForEachItemVariable(config.itemVariable || 'item');

        setUserSelectionSourceArray(config.sourceArray || '');
        setUserSelectionItemVariable(config.itemVariable || 'item');
        setUserSelectionDisplayTemplate(config.displayTemplate || '');
        setUserSelectionPromptText(config.promptText || '');
      } else {
        console.log('No configJson found in step, using defaults');

        // Set default headers for new API call steps
        if (step?.stepType === 'api_call' || step?.step_type === 'api_call') {
          const defaultHeaders = {
            "Content-Type": "application/json",
            "Authorization": "Bearer YOUR_TOKEN_HERE"
          };
          setHeaders(JSON.stringify(defaultHeaders, null, 2));
        }
      }
    }
  }, [step]);


  const addTransformation = () => {
    setTransformations([...transformations, { field_name: '', transformation: '' }]);
  };

  const removeTransformation = (index: number) => {
    setTransformations(transformations.filter((_, i) => i !== index));
  };

  const updateTransformation = (index: number, field: keyof TransformationRule, value: string) => {
    const updated = [...transformations];
    updated[index][field] = value;
    setTransformations(updated);
  };

  const addResponseMapping = () => {
    setResponseDataMappings([...responseDataMappings, { responsePath: '', updatePath: '' }]);
  };

  const removeResponseMapping = (index: number) => {
    if (responseDataMappings.length > 1) {
      setResponseDataMappings(responseDataMappings.filter((_, i) => i !== index));
    }
  };

  const updateResponseMapping = (index: number, field: 'responsePath' | 'updatePath', value: string) => {
    const updated = [...responseDataMappings];
    updated[index][field] = value;
    setResponseDataMappings(updated);
  };

  const getAvailableVariables = (): Array<{ name: string; stepName: string; source: 'extraction' | 'workflow' | 'execute'; dataType?: string }> => {
    const variables: Array<{ name: string; stepName: string; source: 'extraction' | 'workflow' | 'execute'; dataType?: string }> = [
      { name: 'user.username', stepName: 'Logged-In Username', source: 'execute' },
      { name: 'user.email', stepName: 'Logged-In User Email', source: 'execute' },
    ];

    if (executeButtonFields && executeButtonFields.length > 0) {
      executeButtonFields.forEach((field) => {
        variables.push({
          name: `execute.${field.fieldKey}`,
          stepName: field.name,
          source: 'execute'
        });
      });
    }

    if (extractionType && extractionType.fieldMappings) {
      extractionType.fieldMappings.forEach((mapping: any) => {
        if (mapping.fieldName) {
          variables.push({
            name: mapping.fieldName,
            stepName: 'PDF Extraction',
            source: 'extraction',
            dataType: mapping.dataType || 'string'
          });
        }
      });
    }

    if (allSteps && step) {
      const currentStepOrder = step.stepOrder ?? step.step_order ?? 999;
      const previousSteps = allSteps.filter(s => {
        const sOrder = s.stepOrder ?? s.step_order ?? 0;
        return sOrder < currentStepOrder && s.id !== step.id;
      });
      previousSteps.forEach(s => {
        const stepName = s.stepName || s.step_name || 'Unknown Step';
        const config = s.configJson || s.config_json;

        if (config && config.responseDataMappings && Array.isArray(config.responseDataMappings)) {
          config.responseDataMappings.forEach((mapping: any) => {
            if (mapping.updatePath) {
              variables.push({
                name: mapping.updatePath,
                stepName: stepName,
                source: 'workflow'
              });
            }
          });
        }

        if (config && config.aiResponseMappings && Array.isArray(config.aiResponseMappings)) {
          config.aiResponseMappings.forEach((mapping: any) => {
            if (mapping.fieldName) {
              variables.push({
                name: `execute.ai.${mapping.fieldName}`,
                stepName: stepName,
                source: 'workflow'
              });
            }
          });
        }

        if (config && config.placesResponseMappings && Array.isArray(config.placesResponseMappings)) {
          config.placesResponseMappings.forEach((mapping: any) => {
            if (mapping.fieldName) {
              variables.push({
                name: `execute.places.${mapping.fieldName}`,
                stepName: stepName,
                source: 'workflow'
              });
            }
          });
        }

        const sStepType = s.stepType || s.step_type;
        if (sStepType === 'user_input' && config?.variableName) {
          if (config.inputType === 'signature_capture') {
            variables.push(
              { name: `execute.input.${config.variableName}.signeeName`, stepName, source: 'workflow' },
              { name: `execute.input.${config.variableName}.signedTime`, stepName, source: 'workflow' },
              { name: `execute.input.${config.variableName}.imageData`, stepName, source: 'workflow' },
            );
          } else if (config.inputType === 'camera_capture') {
            variables.push(
              { name: `execute.input.${config.variableName}.imageData`, stepName, source: 'workflow' },
              { name: `execute.input.${config.variableName}.timestamp`, stepName, source: 'workflow' },
              { name: `execute.input.${config.variableName}.images`, stepName, source: 'workflow' },
              { name: `execute.input.${config.variableName}.count`, stepName, source: 'workflow' },
            );
          } else {
            variables.push({
              name: `execute.input.${config.variableName}`,
              stepName,
              source: 'workflow'
            });
          }
        }

        if (sStepType === 'user_selection') {
          const itemVariable = config?.itemVariable || 'item';
          const basePath = `forEach.${itemVariable}`;
          variables.push({
            name: basePath,
            stepName: `Selected item from "${stepName}"`,
            source: 'workflow'
          });

          const seenFields = new Set<string>();
          const template: string = config?.displayTemplate || '';
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
                name: `${basePath}.${fieldPath}`,
                stepName: `Selected item field from "${stepName}"`,
                source: 'workflow'
              });
            }
          }
        }

        if (sStepType === 'data_transform' && config?.transformations && Array.isArray(config.transformations)) {
          config.transformations.forEach((t: any) => {
            if (t.outputVariable) {
              variables.push({
                name: `transform.${t.outputVariable}`,
                stepName,
                source: 'workflow'
              });
            }
          });
        }
      });
    }

    return variables;
  };

  const getForEachArrayVariables = (): Array<{ name: string; stepName: string; source: 'workflow' | 'execute'; dataType?: string }> => {
    const variables: Array<{ name: string; stepName: string; source: 'workflow' | 'execute'; dataType?: string }> = [];

    if (!allSteps || !step) return variables;

    const currentStepOrder = step.stepOrder ?? step.step_order ?? 999;
    const previousSteps = allSteps.filter(s => {
      const sOrder = s.stepOrder ?? s.step_order ?? 0;
      return sOrder < currentStepOrder && s.id !== step.id;
    });

    previousSteps.forEach(s => {
      const stepName = s.stepName || s.step_name || 'Unknown Step';
      const config = s.configJson || s.config_json;
      const sStepType = s.stepType || s.step_type;

      if (
        (sStepType === 'api_endpoint' || sStepType === 'api_call') &&
        config?.responseReturnsArray === true &&
        Array.isArray(config.responseDataMappings)
      ) {
        config.responseDataMappings.forEach((mapping: any) => {
          if (mapping.updatePath) {
            variables.push({
              name: mapping.updatePath,
              stepName: stepName,
              source: 'workflow'
            });
          }
        });
      }

      if (sStepType === 'user_input' && config?.variableName) {
        variables.push({
          name: `execute.input.${config.variableName}`,
          stepName,
          source: 'execute'
        });
      }
    });

    return variables;
  };

  const getEnclosingForEachLoops = (): Array<{ name: string; stepName: string; source: 'loop_item'; dataType?: string }> => {
    if (!allSteps || !step) return [];
    const loops: Array<{ name: string; stepName: string; source: 'loop_item'; dataType?: string }> = [];
    allSteps.forEach(s => {
      if (s.id === step.id) return;
      const sStepType = s.stepType || s.step_type;
      if (sStepType !== 'for_each') return;
      const config = s.configJson || s.config_json || {};
      const itemVariable = config.itemVariable || 'item';
      const loopName = s.stepName || s.step_name || 'For Each Loop';
      const sourceArray = config.sourceArray || '';
      loops.push({
        name: `forEach.${itemVariable}`,
        stepName: `Current iteration from "${loopName}"${sourceArray ? ` (over ${sourceArray})` : ''}`,
        source: 'loop_item',
        dataType: 'current loop item'
      });
    });
    return loops;
  };

  const getIndexedArrayLoopVariables = (): Array<{ name: string; stepName: string; source: 'loop_item'; dataType?: string }> => {
    if (!allSteps || !step) return [];
    const hasEnclosingLoop = allSteps.some(s => (s.stepType || s.step_type) === 'for_each' && s.id !== step.id);
    if (!hasEnclosingLoop) return [];
    const entries: Array<{ name: string; stepName: string; source: 'loop_item'; dataType?: string }> = [];
    allSteps.forEach(s => {
      if (s.id === step.id) return;
      const sStepType = s.stepType || s.step_type;
      if (sStepType !== 'api_endpoint' && sStepType !== 'api_call') return;
      const config = s.configJson || s.config_json || {};
      if (config.responseReturnsArray !== true || !Array.isArray(config.responseDataMappings)) return;
      const stepName = s.stepName || s.step_name || 'Step';
      config.responseDataMappings.forEach((m: any) => {
        if (!m?.updatePath || String(m.updatePath).trim() === '') return;
        entries.push({
          name: `response.${m.updatePath}[@loopIndex]`,
          stepName: `Current iteration value from "${stepName}"`,
          source: 'loop_item',
          dataType: 'indexed by current loop'
        });
      });
    });
    return entries;
  };

  const getButtonRef = (key: string): React.RefObject<HTMLButtonElement> => {
    if (!buttonRefs.current[key]) {
      buttonRefs.current[key] = React.createRef<HTMLButtonElement>();
    }
    return buttonRefs.current[key];
  };

  const handleInsertConditionalVariable = (variableName: string) => {
    const currentValue = conditionalField || '';
    const newValue = currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}`;
    setConditionalField(newValue);
    setOpenVariableDropdown(null);
  };

  const generateMultipartFieldMappings = (partIndex: number) => {
    const part = multipartFormParts[partIndex];
    if (!part || part.type !== 'text' || !part.value.trim()) return;

    try {
      const template = JSON.parse(part.value);
      const fieldMappings: Array<{ fieldName: string; type: 'hardcoded' | 'variable'; value: string; dataType: string }> = [];

      const extractFields = (obj: any, prefix: string = '') => {
        for (const key of Object.keys(obj)) {
          const fullPath = prefix ? `${prefix}.${key}` : key;
          const value = obj[key];

          if (value === null || value === undefined) {
            fieldMappings.push({ fieldName: fullPath, type: 'hardcoded', value: '', dataType: 'string' });
          } else if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object') {
              extractFields(value[0], `${fullPath}[0]`);
            }
          } else if (typeof value === 'object') {
            extractFields(value, fullPath);
          } else {
            let dataType = 'string';
            if (typeof value === 'number') {
              dataType = Number.isInteger(value) ? 'integer' : 'number';
            } else if (typeof value === 'boolean') {
              dataType = 'boolean';
            }
            fieldMappings.push({
              fieldName: fullPath,
              type: 'hardcoded',
              value: String(value),
              dataType
            });
          }
        }
      };

      extractFields(template);

      const existingFieldNames = new Set((part.fieldMappings || []).map(m => m.fieldName));
      const newMappings = fieldMappings.filter(m => !existingFieldNames.has(m.fieldName));
      const updated = [...multipartFormParts];
      updated[partIndex] = {
        ...updated[partIndex],
        fieldMappings: [...(part.fieldMappings || []), ...newMappings]
      };
      setMultipartFormParts(updated);
      setMultipartJsonParseError(prev => ({ ...prev, [partIndex]: '' }));
    } catch (error: any) {
      setMultipartJsonParseError(prev => ({
        ...prev,
        [partIndex]: error.message || 'Invalid JSON format'
      }));
    }
  };

  const updateMultipartFieldMapping = (partIndex: number, mappingIndex: number, field: string, value: any) => {
    const updated = [...multipartFormParts];
    const mappings = [...(updated[partIndex].fieldMappings || [])];
    mappings[mappingIndex] = { ...mappings[mappingIndex], [field]: value };
    updated[partIndex] = { ...updated[partIndex], fieldMappings: mappings };
    setMultipartFormParts(updated);
  };

  const removeMultipartFieldMapping = (partIndex: number, mappingIndex: number) => {
    const updated = [...multipartFormParts];
    const mappings = (updated[partIndex].fieldMappings || []).filter((_, i) => i !== mappingIndex);
    updated[partIndex] = { ...updated[partIndex], fieldMappings: mappings };
    setMultipartFormParts(updated);
  };

  const addMultipartFieldMapping = (partIndex: number) => {
    const updated = [...multipartFormParts];
    const mappings = [...(updated[partIndex].fieldMappings || []), { fieldName: '', type: 'hardcoded' as const, value: '', dataType: 'string' }];
    updated[partIndex] = { ...updated[partIndex], fieldMappings: mappings };
    setMultipartFormParts(updated);
  };

  const handleSave = () => {
    let config: any = {};

    switch (stepType) {
      case 'api_call':
        let parsedHeaders = {};
        try {
          parsedHeaders = JSON.parse(headers);
        } catch (e) {
          console.error('Invalid JSON in headers:', e);
          parsedHeaders = {};
        }
        config = {
          method,
          url,
          headers: parsedHeaders,
          requestBody: method === 'GET' ? '' : requestBody,
          responseDataMappings: responseDataMappings.filter(m => m.responsePath || m.updatePath).length > 0
            ? responseDataMappings.filter(m => m.responsePath && m.updatePath)
            : undefined,
          responseReturnsArray: responseReturnsArray || undefined,
          escapeSingleQuotesInBody: escapeSingleQuotesInBody
        };
        console.log('Saving API call config:', config);
        break;
      case 'api_endpoint':
        config = apiEndpointConfig;
        console.log('Saving API endpoint config:', config);
        break;
      case 'data_transform':
        config = {
          transformations: transformations
            .filter(t => (t.sourceVariable && t.function && t.outputVariable) || (t.field_name && t.transformation))
            .map(t => ({
              sourceVariable: t.sourceVariable || t.field_name || '',
              function: t.function || t.transformation || '',
              outputVariable: t.outputVariable || t.field_name || '',
              field_name: t.field_name || t.sourceVariable || '',
              transformation: t.transformation || t.function || '',
              ...(t.function === 'left' && t.leftCount ? { leftCount: t.leftCount } : {}),
              ...(t.function === 'remove_left' && t.removeLeftCount ? { removeLeftCount: t.removeLeftCount } : {}),
              ...((t.function === 'multiply' || t.function === 'divide') && t.mathFactor ? { mathFactor: t.mathFactor } : {}),
              ...((t.function === 'multiply' || t.function === 'divide' || t.function === 'round') && t.mathDecimals !== undefined ? { mathDecimals: t.mathDecimals } : {}),
              ...(t.overwriteSource ? { overwriteSource: true } : {}),
            }))
        };
        break;
      case 'sftp_upload':
        config = {
          uploadType: uploadType,
          useApiResponseForFilename: useApiResponseForFilename,
          filenameSourcePath: filenameSourcePath.trim() || undefined,
          fallbackFilename: fallbackFilename.trim() || undefined,
          sftpPathOverride: sftpPathOverride.trim() || undefined,
          pdfUploadStrategy: pdfUploadStrategy,
          specificPageToUpload: pdfUploadStrategy === 'specific_page_in_group' ? specificPageToUpload : undefined,
          uploadFileTypes: uploadFileTypes
        };
        break;
      case 'conditional_check':
        config = {
          jsonPath: conditionalField,
          fieldPath: conditionalField,
          conditionType: conditionalOperator,
          operator: conditionalOperator,
          expectedValue: conditionalValue,
          additionalConditions: additionalConditions.filter(c => c.jsonPath.trim() !== ''),
          logicalOperator: additionalConditions.length > 0 ? logicalOperator : undefined
        };
        break;
      case 'rename_file':
      case 'rename_pdf':
        config = {
          filenameTemplate: renamePdfTemplate,
          useExtractedData: useExtractedDataForRename,
          fallbackFilename: renameFallbackFilename.trim() || undefined,
          appendTimestamp: appendTimestamp,
          timestampFormat: appendTimestamp ? timestampFormat : undefined,
          renamePdf: renameFileTypes.pdf,
          renameCsv: renameFileTypes.csv,
          renameJson: renameFileTypes.json,
          renameXml: renameFileTypes.xml
        };
        break;
      case 'email_action':
        const hasCustomFieldMappings = Object.keys(customFieldMappings).some(k => customFieldMappings[k]?.trim());
        config = {
          actionType: emailActionType,
          to: emailTo,
          cc: emailCc,
          bcc: emailBcc,
          subject: emailSubject,
          body: emailBody,
          includeAttachment: includeAttachment,
          attachmentSource: attachmentSource,
          attachmentBase64Variable: attachmentSource === 'variable_base64' ? attachmentBase64Variable : undefined,
          attachmentFilename: attachmentSource === 'variable_base64' ? attachmentFilename : undefined,
          from: emailFrom,
          pdfEmailStrategy: pdfEmailStrategy,
          specificPageToEmail: pdfEmailStrategy === 'specific_page_in_group' ? specificPageToEmail : undefined,
          ccUser: ccUser,
          isNotificationEmail: isNotificationEmail,
          notificationTemplateId: isNotificationEmail ? notificationTemplateId : undefined,
          recipientEmailOverride: isNotificationEmail && recipientEmailOverride.trim() ? recipientEmailOverride.trim() : undefined,
          customFieldMappings: isNotificationEmail && hasCustomFieldMappings ? customFieldMappings : undefined
        };
        break;
      case 'user_confirmation':
        config = {
          promptMessage: promptMessage,
          options: confirmationOptions.filter(o => o.label.trim() !== ''),
          yesButtonLabel: confirmationOptions[0]?.label || 'Yes',
          noButtonLabel: confirmationOptions[1]?.label || 'No',
          showLocationMap: showLocationMap,
          latitudeVariable: showLocationMap ? latitudeVariable : '',
          longitudeVariable: showLocationMap ? longitudeVariable : '',
          confirmationImageSource: confirmationImageSource,
          confirmationCustomImageUrl: confirmationImageSource === 'custom_url' ? confirmationCustomImageUrl : '',
          confirmationImageMaxHeight: confirmationImageMaxHeight,
        };
        break;
      case 'exit':
        config = {
          exitMessage: exitMessage,
          showRestartButton: showRestartButton,
          imageSource: exitImageSource,
          customImageUrl: exitImageSource === 'custom_url' ? exitCustomImageUrl : '',
          imageMaxHeight: exitImageMaxHeight,
          ...((exitMessageFr || exitMessageEs) && {
            translations: {
              fr: { exitMessage: exitMessageFr },
              es: { exitMessage: exitMessageEs },
            },
          }),
        };
        break;
      case 'ai_lookup':
        config = {
          aiPrompt: aiPrompt,
          aiResponseMappings: aiResponseMappings.filter(m => m.fieldName && m.aiInstruction)
        };
        break;
      case 'google_places_lookup':
        config = {
          placesSearchQuery: placesSearchQuery,
          placesFieldsToReturn: placesFieldsToReturn,
          placesResponseMappings: placesResponseMappings.filter(m => m.fieldName && m.placesField)
        };
        break;
      case 'multipart_form_upload':
        config = {
          url: multipartUrl,
          apiSourceType: multipartApiSourceType,
          secondaryApiId: multipartApiSourceType === 'secondary' ? multipartSecondaryApiId : undefined,
          authConfigId: multipartAuthConfigId || undefined,
          formParts: multipartFormParts.filter(p => p.name.trim() !== ''),
          filenameTemplate: multipartFilenameTemplate || undefined,
          responseDataMappings: multipartResponseMappings.filter(m => m.responsePath && m.updatePath)
        };
        break;
      case 'for_each':
        config = {
          sourceArray: forEachSourceArray,
          itemVariable: forEachItemVariable || 'item',
        };
        break;
      case 'user_selection':
        config = {
          sourceArray: userSelectionSourceArray,
          itemVariable: userSelectionItemVariable || 'item',
          displayTemplate: userSelectionDisplayTemplate,
          promptText: userSelectionPromptText,
        };
        break;
      case 'route':
        config = {
          routeFieldPath: routeFieldPath,
          routes: routes.filter(r => r.label.trim() !== ''),
          routeDefaultIndex: routeDefaultIndex
        };
        break;
      case 'user_input':
        config = {
          inputType: userInputType,
          inputLabel: userInputLabel || (userInputType === 'barcode_scanner' ? 'Scan Barcode' : userInputType === 'number_pad' ? 'Enter Number' : userInputType === 'camera_capture' ? 'Take Photo' : 'Capture Signature'),
          variableName: userInputVariableName || (userInputType === 'signature_capture' ? 'signatureData' : userInputType === 'camera_capture' ? 'capturedPhoto' : 'userInputValue'),
          ...((userInputLabelFr || userInputLabelEs) && {
            translations: {
              fr: { inputLabel: userInputLabelFr },
              es: { inputLabel: userInputLabelEs },
            },
          }),
          ...(userInputType === 'barcode_scanner' && allowMultipleScans && {
            allowMultipleScans: true,
          }),
          ...(currentLoopItemOnly && {
            currentLoopItemOnly: true,
          }),
          ...(userInputType === 'signature_capture' && signaturePopupEnabled && {
            signaturePopupEnabled: true,
            signaturePopupText: signaturePopupText,
          }),
        };
        break;
      case 'user_information':
        config = {
          imageSource: infoImageSource,
          customImageUrl: infoImageSource === 'custom_url' ? infoCustomImageUrl : '',
          imageMaxHeight: infoImageMaxHeight,
          contentMarkdown: infoContentMarkdown,
          contentAlignment: infoContentAlignment,
          continueButtonLabel: infoContinueButtonLabel || 'Continue',
          enableLanguageSelection: infoEnableLanguageSelection,
          enabledLanguages: infoEnabledLanguages,
          translations: {
            ...(infoEnabledLanguages.includes('fr') && {
              fr: {
                contentMarkdown: infoContentMarkdownFr,
                continueButtonLabel: infoContinueButtonLabelFr || 'Continuer',
              },
            }),
            ...(infoEnabledLanguages.includes('es') && {
              es: {
                contentMarkdown: infoContentMarkdownEs,
                continueButtonLabel: infoContinueButtonLabelEs || 'Continuar',
              },
            }),
          },
        };
        break;
    }

    const stepData = {
      id: step?.id || `temp-${Date.now()}`, // Preserve existing ID or create new one
      workflowId: step?.workflowId || '',
      stepOrder: step?.stepOrder || 1,
      stepName: stepName,
      stepType: stepType,
      configJson: config,
      nextStepOnSuccessId: nextStepOnSuccess || undefined,
      nextStepOnFailureId: nextStepOnFailure || undefined,
      escapeSingleQuotesInBody: escapeSingleQuotesInBody,
      userResponseTemplate: userResponseTemplate || undefined
    };

    onSave(stepData);
  };

  const availableSteps = allSteps.filter(s => s.id !== step?.id);

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Add New Step</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure step behavior and parameters</p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Step Name
              </label>
              <input
                type="text"
                value={stepName}
                onChange={(e) => setStepName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="New Step"
              />
            </div>

            <div>
              <Select
                label="Step Type"
                value={stepType}
                onValueChange={setStepType}
                options={[
                  { value: 'api_call', label: 'API Call' },
                  { value: 'api_endpoint', label: 'API Endpoint' },
                  { value: 'conditional_check', label: 'Conditional Check' },
                  { value: 'data_transform', label: 'Data Transform' },
                  { value: 'email_action', label: 'Email Action' },
                  { value: 'multipart_form_upload', label: 'Multipart Form Upload' },
                  { value: 'rename_file', label: 'Rename File' },
                  { value: 'route', label: 'Route' },
                  { value: 'sftp_upload', label: 'SFTP Upload' },
                  { value: 'for_each', label: 'For Each Loop' },
                  { value: 'user_confirmation', label: 'User Confirmation' },
                  { value: 'user_information', label: 'User Information' },
                  { value: 'user_input', label: 'User Input' },
                  { value: 'user_selection', label: 'User Selection' }
                ]}
                searchable={false}
              />
            </div>
          </div>

          {/* Method field for API calls - shown in top row */}
          {stepType === 'api_call' && (
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-6">
              <div>
                <Select
                  label="HTTP Method"
                  value={method}
                  onValueChange={setMethod}
                  options={[
                    { value: 'POST', label: 'POST' },
                    { value: 'PUT', label: 'PUT' },
                    { value: 'PATCH', label: 'PATCH' },
                    { value: 'GET', label: 'GET' }
                  ]}
                  searchable={false}
                />
              </div>
            </div>
          )}

          {/* PDF Upload Strategy - Show for SFTP Upload steps */}
          {stepType === 'sftp_upload' && (
            <div className="mb-6">
              <h6 className="font-medium text-gray-700 dark:text-gray-300 mb-4">PDF Upload Strategy</h6>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Select
                    label="Upload Strategy"
                    value={pdfUploadStrategy}
                    onValueChange={(value) => setPdfUploadStrategy(value as 'all_pages_in_group' | 'specific_page_in_group')}
                    options={[
                      { value: 'all_pages_in_group', label: 'Upload All Pages in Group' },
                      { value: 'specific_page_in_group', label: 'Upload Specific Page Only' }
                    ]}
                    searchable={false}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Choose whether to upload the entire grouped PDF or just a specific page from the group
                  </p>
                </div>

                {pdfUploadStrategy === 'specific_page_in_group' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Specific Page to Upload
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={specificPageToUpload}
                      onChange={(e) => setSpecificPageToUpload(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="2"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Page number within the group to upload (e.g., 2 for the second page in a 2-page group)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">Step Configuration</h4>
            
            {stepType === 'api_call' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    URL
                  </label>
                  <textarea
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
                    placeholder="https://api.example.com/endpoint"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Headers (JSON format)
                  </label>
                  <textarea
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Request Body Template
                  </label>
                  <textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Leave empty for GET requests, or enter JSON for POST/PUT requests"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Use {`{{field_name}}`} to reference extracted data. Leave empty for GET requests.
                  </p>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                  <input
                    type="checkbox"
                    id="escapeSingleQuotesInBody"
                    checked={escapeSingleQuotesInBody}
                    onChange={(e) => setEscapeSingleQuotesInBody(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="escapeSingleQuotesInBody" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                      Escape Single Quotes for OData Filters
                    </label>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Enable this when using OData $filter syntax. Converts single quotes to double quotes (e.g., "O'Hare" becomes "O''Hare") in all placeholder values in the URL and request body.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Response Data Mappings
                    </label>
                    <button
                      type="button"
                      onClick={addResponseMapping}
                      className="flex items-center px-3 py-1 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Mapping
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Extract multiple values from API response and store them in different locations in your extracted JSON data
                  </p>

                  <div className="flex items-start space-x-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                    <input
                      type="checkbox"
                      id="responseReturnsArrayApiCall"
                      checked={responseReturnsArray}
                      onChange={(e) => setResponseReturnsArray(e.target.checked)}
                      className="w-4 h-4 text-amber-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-amber-500 mt-0.5"
                    />
                    <div className="flex-1">
                      <label htmlFor="responseReturnsArrayApiCall" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        Response Returns Multiple Records
                      </label>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Enable when the API returns an array of records. Each mapping will extract the value from every record and store them as an array, instead of only using the first record.
                      </p>
                    </div>
                  </div>

                  {responseDataMappings.map((mapping, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                      <div className="flex-1 space-y-2">
                        <div>
                          <input
                            type="text"
                            value={mapping.responsePath}
                            onChange={(e) => updateResponseMapping(index, 'responsePath', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm dark:bg-gray-600 dark:text-gray-100"
                            placeholder="Response path (e.g., clients[0].clientId)"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            JSON path to extract from API response
                          </p>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={mapping.updatePath}
                            onChange={(e) => updateResponseMapping(index, 'updatePath', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm dark:bg-gray-600 dark:text-gray-100"
                            placeholder="Update path (e.g., orders.0.consignee.clientId)"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Where to store in extracted JSON
                          </p>
                        </div>
                      </div>
                      {responseDataMappings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeResponseMapping(index)}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md flex-shrink-0 mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stepType === 'api_endpoint' && (
              <ApiEndpointConfigSection
                config={apiEndpointConfig}
                onChange={setApiEndpointConfig}
                allSteps={allSteps}
                currentStepOrder={step?.stepOrder ?? step?.step_order}
                extractionType={extractionType}
                executeButtonFields={executeButtonFields}
                arrayGroups={arrayGroups}
                flowNodeId={step?.id}
              />
            )}

            {stepType === 'for_each' && (
              <div className="space-y-4">
                <div className="p-4 bg-lime-50 dark:bg-lime-900/20 rounded-lg border border-lime-200 dark:border-lime-800">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-lime-100 dark:bg-lime-900/40 rounded-lg">
                      <Plus className="h-4 w-4 text-lime-600 dark:text-lime-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-lime-900 dark:text-lime-200">For Each Loop</h4>
                      <p className="text-xs text-lime-700 dark:text-lime-300 mt-0.5">
                        Iterate over an array from a previous API step's response. Connect the <strong>Loop</strong> handle to the steps
                        that should run for each item, and the <strong>Done</strong> handle to the step that should run after all iterations complete.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source Array Path
                  </label>
                  <div className="relative flex items-center space-x-2">
                    <input
                      type="text"
                      value={forEachSourceArray}
                      onChange={(e) => setForEachSourceArray(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-lime-500 focus:border-lime-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                      placeholder="response.data.trips"
                    />
                    <button
                      ref={getButtonRef('foreach-source-array')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'foreach-source-array' ? null : 'foreach-source-array')}
                      className="px-3 py-2 bg-lime-600 hover:bg-lime-700 text-white rounded-md transition-colors"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'foreach-source-array'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('foreach-source-array')}
                    variables={getForEachArrayVariables()}
                    onSelect={(variableName) => {
                      setForEachSourceArray(variableName);
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Path to the array in the context data (e.g., <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">response.data.trips</code>)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Item Variable Name
                  </label>
                  <input
                    type="text"
                    value={forEachItemVariable}
                    onChange={(e) => setForEachItemVariable(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-lime-500 focus:border-lime-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                    placeholder="item"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Each array element will be accessible as <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{`{{forEach.${forEachItemVariable || 'item'}.fieldName}}`}</code> in child steps
                  </p>
                </div>
              </div>
            )}

            {stepType === 'user_selection' && (
              <div className="space-y-4">
                <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-pink-100 dark:bg-pink-900/40 rounded-lg">
                      <Plus className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-pink-900 dark:text-pink-200">User Selection</h4>
                      <p className="text-xs text-pink-700 dark:text-pink-300 mt-0.5">
                        Place inside a <strong>For Each Loop</strong>. At runtime, the user sees the remaining items as stacked buttons and picks which one to process next. The chosen item replaces <code className="px-1 py-0.5 bg-pink-100 dark:bg-pink-900/40 rounded text-xs">{`{{forEach.<itemVariable>}}`}</code> for downstream steps on that iteration.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source Array Path
                  </label>
                  <div className="relative flex items-center space-x-2">
                    <input
                      type="text"
                      value={userSelectionSourceArray}
                      onChange={(e) => setUserSelectionSourceArray(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                      placeholder="response.data.trips"
                    />
                    <button
                      ref={getButtonRef('user-selection-source-array')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'user-selection-source-array' ? null : 'user-selection-source-array')}
                      className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md transition-colors"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'user-selection-source-array'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('user-selection-source-array')}
                    variables={getForEachArrayVariables()}
                    onSelect={(variableName) => {
                      setUserSelectionSourceArray(variableName);
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Should match the Source Array Path of the enclosing For Each Loop.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Item Variable Name
                  </label>
                  <input
                    type="text"
                    value={userSelectionItemVariable}
                    onChange={(e) => setUserSelectionItemVariable(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                    placeholder="item"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Must match the For Each Loop's Item Variable Name. Chosen value is exposed as <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{`{{forEach.${userSelectionItemVariable || 'item'}}}`}</code>.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Button Label Template (Optional)
                  </label>
                  <div className="relative flex items-center space-x-2">
                    <input
                      type="text"
                      value={userSelectionDisplayTemplate}
                      onChange={(e) => setUserSelectionDisplayTemplate(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                      placeholder="{{item}} or {{response.fbBarcode.@loopIndex}}"
                    />
                    <button
                      ref={getButtonRef('user-selection-display-template')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'user-selection-display-template' ? null : 'user-selection-display-template')}
                      className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md transition-colors"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'user-selection-display-template'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('user-selection-display-template')}
                    variables={getForEachArrayVariables()}
                    onSelect={(variableName) => {
                      const insert = `{{${variableName}.@loopIndex}}`;
                      setUserSelectionDisplayTemplate(
                        (userSelectionDisplayTemplate || '') + insert
                      );
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Use <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{`{{item}}`}</code> for scalar arrays, <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{`{{item.fieldName}}`}</code> for arrays of objects, or <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{`{{response.otherArray.@loopIndex}}`}</code> to pull a parallel array by position. Defaults to the raw value if blank.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prompt Text (Optional)
                  </label>
                  <input
                    type="text"
                    value={userSelectionPromptText}
                    onChange={(e) => setUserSelectionPromptText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                    placeholder="Select which record to process"
                  />
                </div>
              </div>
            )}

            {stepType === 'data_transform' && (
              <div className="space-y-4">
                <div className="p-4 bg-fuchsia-50 dark:bg-fuchsia-900/20 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-fuchsia-100 dark:bg-fuchsia-900/40 rounded-lg">
                      <Plus className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">Data Transform Step</h4>
                      <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300 mt-0.5">
                        Apply functions to variables from previous steps. The transformed values are stored as new variables
                        accessible by downstream steps using the <code className="px-1 py-0.5 bg-fuchsia-100 dark:bg-fuchsia-900/40 rounded text-xs">{'{{transform.<outputName>}}'}</code> syntax.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Transform Rules
                  </label>
                  <button
                    onClick={addTransformation}
                    className="flex items-center px-3 py-1 text-sm bg-fuchsia-600 text-white rounded-md hover:bg-fuchsia-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Rule
                  </button>
                </div>

                {transformations.map((transformation, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rule {index + 1}</span>
                      {transformations.length > 1 && (
                        <button
                          onClick={() => removeTransformation(index)}
                          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Source Variable</label>
                      <div className="relative flex items-center space-x-2">
                        <input
                          type="text"
                          value={transformation.sourceVariable || ''}
                          onChange={(e) => {
                            const updated = [...transformations];
                            updated[index] = { ...updated[index], sourceVariable: e.target.value, field_name: e.target.value };
                            setTransformations(updated);
                          }}
                          placeholder="e.g. execute.input.barcode"
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100"
                        />
                        <button
                          ref={getButtonRef(`transform-source-${index}`)}
                          type="button"
                          onClick={() => setOpenVariableDropdown(openVariableDropdown === `transform-source-${index}` ? null : `transform-source-${index}`)}
                          className="px-3 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-md transition-colors"
                          title="Insert variable"
                        >
                          <Braces className="w-4 h-4" />
                        </button>
                      </div>
                      <VariableDropdown
                        isOpen={openVariableDropdown === `transform-source-${index}`}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef(`transform-source-${index}`)}
                        variables={getAvailableVariables()}
                        onSelect={(variableName) => {
                          const updated = [...transformations];
                          updated[index] = { ...updated[index], sourceVariable: variableName, field_name: variableName };
                          setTransformations(updated);
                          setOpenVariableDropdown(null);
                        }}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        The variable path to read from context (e.g. <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">execute.input.barcode</code>, <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">response.orderId</code>)
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Function</label>
                      <Select
                        value={transformation.function || ''}
                        onValueChange={(val) => {
                          const updated = [...transformations];
                          updated[index] = { ...updated[index], function: val, transformation: val };
                          setTransformations(updated);
                        }}
                        options={[
                          { value: 'trim', label: 'Trim - Remove leading/trailing whitespace' },
                          { value: 'uppercase', label: 'Uppercase - Convert to UPPER CASE' },
                          { value: 'lowercase', label: 'Lowercase - Convert to lower case' },
                          { value: 'trim_uppercase', label: 'Trim + Uppercase' },
                          { value: 'trim_lowercase', label: 'Trim + Lowercase' },
                          { value: 'remove_spaces', label: 'Remove Spaces - Strip all whitespace' },
                          { value: 'remove_leading_zeros', label: 'Remove Leading Zeros' },
                          { value: 'pad_left_10', label: 'Pad Left (10 chars with zeros)' },
                          { value: 'left', label: 'Left - Keep first N characters' },
                          { value: 'remove_left', label: 'Remove Left - Remove first N characters' },
                          { value: 'substring_0_10', label: 'Substring (first 10 chars)' },
                          { value: 'substring_0_20', label: 'Substring (first 20 chars)' },
                          { value: 'multiply', label: 'Multiply - Multiply by a factor' },
                          { value: 'divide', label: 'Divide - Divide by a factor' },
                          { value: 'round', label: 'Round - Round to N decimal places' },
                        ]}
                        placeholder="Select a function..."
                        searchable={false}
                      />
                      {transformation.function === 'left' && (
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Number of Characters to Keep</label>
                          <input
                            type="number"
                            min={1}
                            value={transformation.leftCount || ''}
                            onChange={(e) => {
                              const updated = [...transformations];
                              updated[index] = { ...updated[index], leftCount: parseInt(e.target.value) || undefined };
                              setTransformations(updated);
                            }}
                            placeholder="e.g. 9"
                            className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            How many characters to keep from the left side of the value
                          </p>
                        </div>
                      )}
                      {transformation.function === 'remove_left' && (
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Number of Characters to Remove</label>
                          <input
                            type="number"
                            min={1}
                            value={transformation.removeLeftCount || ''}
                            onChange={(e) => {
                              const updated = [...transformations];
                              updated[index] = { ...updated[index], removeLeftCount: parseInt(e.target.value) || undefined };
                              setTransformations(updated);
                            }}
                            placeholder="e.g. 3"
                            className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Characters to strip from the beginning (e.g. 3 removes "DR-" from "DR-12345678")
                          </p>
                        </div>
                      )}
                      {(transformation.function === 'multiply' || transformation.function === 'divide') && (
                        <div className="mt-2 space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              {transformation.function === 'multiply' ? 'Multiply By' : 'Divide By'}
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={transformation.mathFactor ?? ''}
                              onChange={(e) => {
                                const updated = [...transformations];
                                updated[index] = { ...updated[index], mathFactor: e.target.value };
                                setTransformations(updated);
                              }}
                              placeholder="e.g. 2.20462"
                              className="w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Decimal Places</label>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={transformation.mathDecimals ?? 2}
                              onChange={(e) => {
                                const updated = [...transformations];
                                updated[index] = { ...updated[index], mathDecimals: parseInt(e.target.value) || 0 };
                                setTransformations(updated);
                              }}
                              placeholder="2"
                              className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100"
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {transformation.function === 'multiply'
                              ? 'e.g. kg to lbs: multiply by 2.20462'
                              : 'e.g. lbs to kg: divide by 2.20462'}
                          </p>
                        </div>
                      )}
                      {transformation.function === 'round' && (
                        <div className="mt-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Decimal Places</label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={transformation.mathDecimals ?? 0}
                            onChange={(e) => {
                              const updated = [...transformations];
                              updated[index] = { ...updated[index], mathDecimals: parseInt(e.target.value) || 0 };
                              setTransformations(updated);
                            }}
                            placeholder="0"
                            className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Number of decimal places to round to (0 = whole number)
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center space-x-2 mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={transformation.overwriteSource || false}
                          onChange={(e) => {
                            const updated = [...transformations];
                            updated[index] = { ...updated[index], overwriteSource: e.target.checked };
                            setTransformations(updated);
                          }}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Overwrite source variable</span>
                      </label>
                      {transformation.overwriteSource ? (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          The transformed value will be written back to <code className="px-1 py-0.5 bg-green-100 dark:bg-green-900/30 rounded">{`{{${transformation.sourceVariable || transformation.field_name || 'source'}}}`}</code> so downstream steps use it automatically.
                        </p>
                      ) : (
                        <>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Output Variable Name</label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">transform.</span>
                            <input
                              type="text"
                              value={transformation.outputVariable || ''}
                              onChange={(e) => {
                                const sanitized = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                const updated = [...transformations];
                                updated[index] = { ...updated[index], outputVariable: sanitized };
                                setTransformations(updated);
                              }}
                              placeholder="e.g. barcode_trimmed"
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500 dark:bg-gray-600 dark:text-gray-100 font-mono"
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Access this value in later steps as <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-600 rounded">{'{{transform.' + (transformation.outputVariable || 'name') + '}}'}</code>
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stepType === 'sftp_upload' && (
              <div className="space-y-4">
                <div>
                  <Select
                    label="Upload Type"
                    value={uploadType}
                    onValueChange={setUploadType}
                    options={[
                      { value: 'csv', label: 'CSV File' },
                      { value: 'json', label: 'JSON File' },
                      { value: 'xml', label: 'XML File' },
                      { value: 'pdf', label: 'PDF File' }
                    ]}
                    required
                    searchable={false}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Select the type of file to upload to SFTP. The default SFTP configuration from Settings will be used.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    File Types to Upload
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="uploadJson"
                        checked={uploadFileTypes.json}
                        onChange={(e) => setUploadFileTypes({ ...uploadFileTypes, json: e.target.checked })}
                        className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="uploadJson" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        JSON
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="uploadPdf"
                        checked={uploadFileTypes.pdf}
                        onChange={(e) => setUploadFileTypes({ ...uploadFileTypes, pdf: e.target.checked })}
                        className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="uploadPdf" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        PDF
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="uploadXml"
                        checked={uploadFileTypes.xml}
                        onChange={(e) => setUploadFileTypes({ ...uploadFileTypes, xml: e.target.checked })}
                        className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="uploadXml" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        XML
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="uploadCsv"
                        checked={uploadFileTypes.csv}
                        onChange={(e) => setUploadFileTypes({ ...uploadFileTypes, csv: e.target.checked })}
                        className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="uploadCsv" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        CSV
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Select which file types to upload to the SFTP server. At least one type must be selected.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SFTP Path Override (Optional)
                  </label>
                  <input
                    type="text"
                    value={sftpPathOverride}
                    onChange={(e) => setSftpPathOverride(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., /custom/upload/path/ or leave empty for default"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Override the default SFTP upload path from settings. Leave empty to use default SFTP configuration.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="useApiResponseForFilename"
                    checked={useApiResponseForFilename}
                    onChange={(e) => setUseApiResponseForFilename(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="useApiResponseForFilename" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Use API response for filename
                  </label>
                </div>

                {useApiResponseForFilename && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Filename Source Path
                    </label>
                    <input
                      type="text"
                      value={filenameSourcePath}
                      onChange={(e) => setFilenameSourcePath(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., billNumber or orders.0.billNumber"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      JSON path to extract filename from API response or extracted data
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Fallback Filename
                  </label>
                  <input
                    type="text"
                    value={fallbackFilename}
                    onChange={(e) => setFallbackFilename(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., BL_ or document"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Default filename to use if custom filename cannot be determined
                  </p>
                </div>
              </div>
            )}

            {stepType === 'conditional_check' && (
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Condition 1</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        JSON Path to Check
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={conditionalField}
                          onChange={(e) => setConditionalField(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder="{{execute.isConsignee}}"
                        />
                        <button
                          ref={getButtonRef('conditional-field')}
                          type="button"
                          onClick={() => setOpenVariableDropdown(openVariableDropdown === 'conditional-field' ? null : 'conditional-field')}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                          title="Insert variable"
                        >
                          <Braces className="w-4 h-4" />
                        </button>
                      </div>
                      <VariableDropdown
                        isOpen={openVariableDropdown === 'conditional-field'}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef('conditional-field')}
                        variables={getAvailableVariables()}
                        onSelect={handleInsertConditionalVariable}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Select
                          label="Condition Type"
                          value={conditionalOperator}
                          onValueChange={setConditionalOperator}
                          options={[
                            { value: 'equals', label: 'Equals' },
                            { value: 'not_equals', label: 'Not Equals' },
                            { value: 'is_null', label: 'Is Null' },
                            { value: 'is_not_null', label: 'Is Not Null' },
                            { value: 'contains', label: 'Contains' },
                            { value: 'not_contains', label: 'Not Contains' },
                            { value: 'greater_than', label: 'Greater Than' },
                            { value: 'less_than', label: 'Less Than' }
                          ]}
                          searchable={false}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Expected Value
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={conditionalValue}
                            onChange={(e) => setConditionalValue(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="True"
                          />
                          <button
                            ref={getButtonRef('conditional-expected-value')}
                            type="button"
                            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'conditional-expected-value' ? null : 'conditional-expected-value')}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            title="Insert variable"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                        </div>
                        <VariableDropdown
                          isOpen={openVariableDropdown === 'conditional-expected-value'}
                          onClose={() => setOpenVariableDropdown(null)}
                          triggerRef={getButtonRef('conditional-expected-value')}
                          variables={getAvailableVariables()}
                          onSelect={(variableName) => {
                            const newValue = conditionalValue ? `${conditionalValue}{{${variableName}}}` : `{{${variableName}}}`;
                            setConditionalValue(newValue);
                            setOpenVariableDropdown(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {additionalConditions.length > 0 && (
                  <div className="flex items-center justify-center">
                    <div className="flex items-center space-x-2 px-4 py-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-800">
                      <span className="text-sm font-medium text-orange-800 dark:text-orange-200">Logical Operator:</span>
                      <select
                        value={logicalOperator}
                        onChange={(e) => setLogicalOperator(e.target.value as 'AND' | 'OR')}
                        className="px-3 py-1 text-sm font-semibold border border-orange-300 dark:border-orange-600 rounded bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-300 focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    </div>
                  </div>
                )}

                {additionalConditions.map((condition, index) => (
                  <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Condition {index + 2}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAdditionalConditions(prev => prev.filter((_, i) => i !== index));
                        }}
                        className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Remove condition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          JSON Path to Check
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={condition.jsonPath}
                            onChange={(e) => {
                              const newConditions = [...additionalConditions];
                              newConditions[index] = { ...newConditions[index], jsonPath: e.target.value };
                              setAdditionalConditions(newConditions);
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="{{execute.isShipper}}"
                          />
                          <button
                            ref={getButtonRef(`additional-condition-${index}`)}
                            type="button"
                            onClick={() => setOpenVariableDropdown(openVariableDropdown === `additional-condition-${index}` ? null : `additional-condition-${index}`)}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            title="Insert variable"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                        </div>
                        <VariableDropdown
                          isOpen={openVariableDropdown === `additional-condition-${index}`}
                          onClose={() => setOpenVariableDropdown(null)}
                          triggerRef={getButtonRef(`additional-condition-${index}`)}
                          variables={getAvailableVariables()}
                          onSelect={(variableName) => {
                            const newConditions = [...additionalConditions];
                            const currentValue = newConditions[index].jsonPath || '';
                            newConditions[index] = { ...newConditions[index], jsonPath: currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}` };
                            setAdditionalConditions(newConditions);
                            setOpenVariableDropdown(null);
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Select
                            label="Condition Type"
                            value={condition.operator}
                            onValueChange={(value) => {
                              const newConditions = [...additionalConditions];
                              newConditions[index] = { ...newConditions[index], operator: value };
                              setAdditionalConditions(newConditions);
                            }}
                            options={[
                              { value: 'equals', label: 'Equals' },
                              { value: 'not_equals', label: 'Not Equals' },
                              { value: 'is_null', label: 'Is Null' },
                              { value: 'is_not_null', label: 'Is Not Null' },
                              { value: 'contains', label: 'Contains' },
                              { value: 'not_contains', label: 'Not Contains' },
                              { value: 'greater_than', label: 'Greater Than' },
                              { value: 'less_than', label: 'Less Than' }
                            ]}
                            searchable={false}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Expected Value
                          </label>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={condition.expectedValue}
                              onChange={(e) => {
                                const newConditions = [...additionalConditions];
                                newConditions[index] = { ...newConditions[index], expectedValue: e.target.value };
                                setAdditionalConditions(newConditions);
                              }}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                              placeholder="True"
                            />
                            <button
                              ref={getButtonRef(`additional-condition-expected-${index}`)}
                              type="button"
                              onClick={() => setOpenVariableDropdown(openVariableDropdown === `additional-condition-expected-${index}` ? null : `additional-condition-expected-${index}`)}
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                              title="Insert variable"
                            >
                              <Braces className="w-4 h-4" />
                            </button>
                          </div>
                          <VariableDropdown
                            isOpen={openVariableDropdown === `additional-condition-expected-${index}`}
                            onClose={() => setOpenVariableDropdown(null)}
                            triggerRef={getButtonRef(`additional-condition-expected-${index}`)}
                            variables={getAvailableVariables()}
                            onSelect={(variableName) => {
                              const newConditions = [...additionalConditions];
                              const currentValue = newConditions[index].expectedValue || '';
                              newConditions[index] = { ...newConditions[index], expectedValue: currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}` };
                              setAdditionalConditions(newConditions);
                              setOpenVariableDropdown(null);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setAdditionalConditions(prev => [...prev, { jsonPath: '', operator: 'equals', expectedValue: '' }]);
                  }}
                  className="w-full py-2 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center justify-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Condition</span>
                </button>
              </div>
            )}

            {stepType === 'route' && (
              <div className="space-y-4">
                <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-teal-800 dark:text-teal-200">Route Step</h5>
                      <p className="text-sm text-teal-700 dark:text-teal-300 mt-1">
                        Routes the workflow down different paths based on a field value.
                        Each route checks the same field against its expected value.
                        The first matching route is followed.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Field to Evaluate
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={routeFieldPath}
                      onChange={(e) => setRouteFieldPath(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="{{execute.serviceType}}"
                    />
                    <button
                      ref={getButtonRef('route-field')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'route-field' ? null : 'route-field')}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'route-field'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('route-field')}
                    variables={getAvailableVariables()}
                    onSelect={(variableName) => {
                      const currentValue = routeFieldPath || '';
                      setRouteFieldPath(currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}`);
                      setOpenVariableDropdown(null);
                    }}
                  />
                </div>

                {routes.map((route, index) => (
                  <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Route {index + 1}</span>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="routeDefault"
                            checked={routeDefaultIndex === index}
                            onChange={() => setRouteDefaultIndex(routeDefaultIndex === index ? null : index)}
                            className="text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">Default</span>
                        </label>
                        {routes.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setRoutes(prev => prev.filter((_, i) => i !== index));
                              if (routeDefaultIndex === index) setRouteDefaultIndex(null);
                              else if (routeDefaultIndex !== null && routeDefaultIndex > index) setRouteDefaultIndex(routeDefaultIndex - 1);
                            }}
                            className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Remove route"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Route Label
                        </label>
                        <input
                          type="text"
                          value={route.label}
                          onChange={(e) => {
                            const updated = [...routes];
                            updated[index] = { ...updated[index], label: e.target.value };
                            setRoutes(updated);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder="e.g., LTL, TL, Intermodal"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Select
                            label="Operator"
                            value={route.operator}
                            onValueChange={(val) => {
                              const updated = [...routes];
                              updated[index] = { ...updated[index], operator: val };
                              setRoutes(updated);
                            }}
                            options={[
                              { value: 'equals', label: 'Equals' },
                              { value: 'not_equals', label: 'Not Equals' },
                              { value: 'is_null', label: 'Is Null' },
                              { value: 'is_not_null', label: 'Is Not Null' },
                              { value: 'contains', label: 'Contains' },
                              { value: 'not_contains', label: 'Not Contains' },
                              { value: 'greater_than', label: 'Greater Than' },
                              { value: 'less_than', label: 'Less Than' },
                            ]}
                            searchable={false}
                          />
                        </div>
                        {route.operator !== 'is_null' && route.operator !== 'is_not_null' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Expected Value
                          </label>
                          <input
                            type="text"
                            value={route.expectedValue}
                            onChange={(e) => {
                              const updated = [...routes];
                              updated[index] = { ...updated[index], expectedValue: e.target.value };
                              setRoutes(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="LTL"
                          />
                        </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setRoutes(prev => [...prev, { label: '', operator: 'equals', expectedValue: '' }])}
                  className="w-full py-2 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-400 dark:hover:text-teal-400 transition-colors flex items-center justify-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Route</span>
                </button>
              </div>
            )}

            {stepType === 'user_confirmation' && (
              <div className="space-y-4">
                <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                  <div className="flex items-start space-x-3">
                    <HelpCircle className="h-5 w-5 text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-cyan-800 dark:text-cyan-200">User Confirmation Step</h5>
                      <p className="text-sm text-cyan-700 dark:text-cyan-300 mt-1">
                        This step pauses the workflow and prompts the user with a question.
                        Add as many response options as needed. Use variables like {`{{clientId}}`} to include data from previous steps in your message.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Prompt Message
                  </label>
                  <div className="flex space-x-2">
                    <textarea
                      ref={promptMessageRef}
                      value={promptMessage}
                      onChange={(e) => setPromptMessage(e.target.value)}
                      rows={3}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., Client {{clientId}} already exists. Do you want to continue creating this client?"
                    />
                    <button
                      ref={getButtonRef('prompt-message')}
                      type="button"
                      onClick={() => {
                        if (promptMessageRef.current) {
                          setPromptMessageCursorPos(promptMessageRef.current.selectionStart);
                        }
                        setOpenVariableDropdown(openVariableDropdown === 'prompt-message' ? null : 'prompt-message');
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors h-fit"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'prompt-message'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('prompt-message')}
                    variables={getAvailableVariables()}
                    onSelect={(variableName) => {
                      const variable = `{{${variableName}}}`;
                      const cursorPos = promptMessageCursorPos ?? promptMessage.length;
                      const newValue = promptMessage.slice(0, cursorPos) + variable + promptMessage.slice(cursorPos);
                      setPromptMessage(newValue);
                      setPromptMessageCursorPos(null);
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The message shown to the user. Use {`{{variableName}}`} to insert values from previous steps.
                  </p>
                  <div className="mt-2 p-2.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Formatting Options:</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">**text**</code> &rarr; <strong>Bold</strong></span>
                      <span><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">__text__</code> &rarr; <u>Underline</u></span>
                      <span><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">==text==</code> &rarr; <mark className="bg-yellow-200 dark:bg-yellow-700 px-0.5 rounded">Highlight</mark></span>
                      <span><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">##text##</code> &rarr; <span className="text-sm">Large Text</span></span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Response Options
                  </label>
                  <div className="space-y-2">
                    {confirmationOptions.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-6 text-center">{index + 1}</span>
                        <input
                          type="text"
                          value={option.label}
                          onChange={(e) => {
                            const updated = [...confirmationOptions];
                            updated[index] = { label: e.target.value };
                            setConfirmationOptions(updated);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder={`Option ${index + 1}`}
                        />
                        {confirmationOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setConfirmationOptions(prev => prev.filter((_, i) => i !== index))}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmationOptions(prev => [...prev, { label: '' }])}
                    className="mt-2 flex items-center space-x-1 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Option</span>
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Each option creates a separate output handle on the node for branching.
                  </p>
                </div>

                <div>
                  <Select
                    label="Image Source"
                    value={confirmationImageSource}
                    onValueChange={(value) => setConfirmationImageSource(value as 'none' | 'branding_logo' | 'custom_url')}
                    options={[
                      { value: 'none', label: 'No Image' },
                      { value: 'branding_logo', label: 'Company Branding Logo' },
                      { value: 'custom_url', label: 'Custom Image URL' }
                    ]}
                    searchable={false}
                  />
                </div>

                {confirmationImageSource === 'custom_url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Custom Image URL
                    </label>
                    <input
                      type="text"
                      value={confirmationCustomImageUrl}
                      onChange={(e) => setConfirmationCustomImageUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                )}

                {confirmationImageSource !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Image Max Height: {confirmationImageMaxHeight}px
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      step={10}
                      value={confirmationImageMaxHeight}
                      onChange={(e) => setConfirmationImageMaxHeight(Number(e.target.value))}
                      className="w-full accent-cyan-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>20px</span>
                      <span>300px</span>
                    </div>
                  </div>
                )}

                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLocationMap}
                      onChange={(e) => setShowLocationMap(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-cyan-600 focus:ring-cyan-500 dark:bg-gray-700"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Show Location Map
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
                    Display an embedded map showing the location from Google Places lookup
                  </p>

                  {showLocationMap && (
                    <div className="mt-4 ml-7 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Latitude Variable
                        </label>
                        <select
                          value={latitudeVariable}
                          onChange={(e) => setLatitudeVariable(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="">Select variable...</option>
                          {getAvailableVariables().map((v) => (
                            <option key={v.name} value={v.name}>{v.stepName} ({v.name})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Longitude Variable
                        </label>
                        <select
                          value={longitudeVariable}
                          onChange={(e) => setLongitudeVariable(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="">Select variable...</option>
                          {getAvailableVariables().map((v) => (
                            <option key={v.name} value={v.name}>{v.stepName} ({v.name})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Branching Behavior</h6>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    {confirmationOptions.filter(o => o.label.trim() !== '').map((option, idx) => (
                      <li key={idx}>- <span className="font-medium text-gray-700 dark:text-gray-300">{option.label || `Option ${idx + 1}`}</span>: Continues to the step connected via its output handle</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {stepType === 'exit' && (
              <div className="space-y-4">
                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                  <div className="flex items-start space-x-3">
                    <LogOut className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-rose-800 dark:text-rose-200">Exit Step</h5>
                      <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
                        This step ends the workflow and displays a custom message to the user.
                        Use variables like {`{{clientId}}`} to include data from previous steps.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <Select
                    label="Image Source"
                    value={exitImageSource}
                    onValueChange={(value) => setExitImageSource(value as 'none' | 'branding_logo' | 'custom_url')}
                    options={[
                      { value: 'none', label: 'No Image' },
                      { value: 'branding_logo', label: 'Company Branding Logo' },
                      { value: 'custom_url', label: 'Custom Image URL' }
                    ]}
                    searchable={false}
                  />
                </div>

                {exitImageSource === 'custom_url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Custom Image URL
                    </label>
                    <input
                      type="text"
                      value={exitCustomImageUrl}
                      onChange={(e) => setExitCustomImageUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                )}

                {exitImageSource !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Image Max Height: {exitImageMaxHeight}px
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      step={10}
                      value={exitImageMaxHeight}
                      onChange={(e) => setExitImageMaxHeight(Number(e.target.value))}
                      className="w-full accent-rose-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>20px</span>
                      <span>300px</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Exit Message
                  </label>
                  <div className="flex space-x-2">
                    <textarea
                      value={exitMessage}
                      onChange={(e) => setExitMessage(e.target.value)}
                      rows={3}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., Order {{orderNumber}} has been successfully created!"
                    />
                    <button
                      ref={getButtonRef('exit-message')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'exit-message' ? null : 'exit-message')}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors h-fit"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'exit-message'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('exit-message')}
                    variables={getAvailableVariables()}
                    onSelect={(variableName) => {
                      const newValue = exitMessage + `{{${variableName}}}`;
                      setExitMessage(newValue);
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The message shown to the user when the flow ends. Use {`{{variableName}}`} to insert values.
                  </p>
                </div>

                {flowHasLanguageSelection && (
                  <div className="space-y-3 pl-4 border-l-2 border-slate-300 dark:border-slate-600">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Exit Message - French
                      </label>
                      <textarea
                        value={exitMessageFr}
                        onChange={(e) => setExitMessageFr(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="e.g. La commande {{orderNumber}} a ete creee avec succes!"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Exit Message - Spanish
                      </label>
                      <textarea
                        value={exitMessageEs}
                        onChange={(e) => setExitMessageEs(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="e.g. El pedido {{orderNumber}} se ha creado correctamente!"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="showRestartButton"
                    checked={showRestartButton}
                    onChange={(e) => setShowRestartButton(e.target.checked)}
                    className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showRestartButton" className="text-sm text-gray-700 dark:text-gray-300">
                    Show "Restart" button to allow running the flow again
                  </label>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Exit Behavior</h6>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>- This is a <span className="text-rose-600 dark:text-rose-400 font-medium">terminal step</span> - the flow ends here</li>
                    <li>- The exit message will be displayed to the user</li>
                    <li>- If "Restart" is enabled, user can run the flow again from the beginning</li>
                  </ul>
                </div>
              </div>
            )}

            {stepType === 'user_input' && (
              <div className="space-y-4">
                <div className="p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                  <div className="flex items-start space-x-3">
                    <TextCursorInput className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-sky-800 dark:text-sky-200">User Input Step</h5>
                      <p className="text-sm text-sky-700 dark:text-sky-300 mt-1">
                        Pauses the flow and prompts the user to provide input via a barcode scanner, number pad, signature capture, or camera capture.
                        The collected value is stored in <code className="bg-sky-100 dark:bg-sky-800 px-1 rounded">execute.input.*</code> for use in subsequent steps.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <Select
                    label="Input Type"
                    value={userInputType}
                    onValueChange={(value) => setUserInputType(value as 'barcode_scanner' | 'number_pad' | 'signature_capture' | 'camera_capture')}
                    options={[
                      { value: 'barcode_scanner', label: 'Barcode Scanner' },
                      { value: 'number_pad', label: 'Number Pad' },
                      { value: 'signature_capture', label: 'Signature Capture' },
                      { value: 'camera_capture', label: 'Camera Capture' }
                    ]}
                    searchable={false}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {userInputType === 'barcode_scanner'
                      ? 'Opens the device camera to scan a barcode or QR code.'
                      : userInputType === 'number_pad'
                      ? 'Displays a number pad for entering a phone number or numeric value.'
                      : userInputType === 'camera_capture'
                      ? 'Opens the device camera to take a photo. The captured image is stored as a base64 data URL.'
                      : 'Opens a full-screen signature pad for capturing a handwritten signature with signee name and timestamp.'}
                  </p>
                </div>

                {userInputType === 'barcode_scanner' && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowMultipleScans}
                      onChange={(e) => setAllowMultipleScans(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-sky-600 focus:ring-sky-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Multiple Scans</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        When enabled, the user can scan multiple barcodes before submitting. The values are stored as an array, which can be used with a For Each step.
                      </p>
                    </div>
                  </label>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Prompt Label
                  </label>
                  <input
                    type="text"
                    value={userInputLabel}
                    onChange={(e) => setUserInputLabel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder={userInputType === 'barcode_scanner' ? 'Scan Barcode' : userInputType === 'number_pad' ? 'Enter Phone Number' : userInputType === 'camera_capture' ? 'Take Photo' : 'Capture Signature'}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The label shown above the input UI.
                  </p>
                </div>

                {flowHasLanguageSelection && (
                  <div className="space-y-3 pl-4 border-l-2 border-slate-300 dark:border-slate-600">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prompt Label - French
                      </label>
                      <input
                        type="text"
                        value={userInputLabelFr}
                        onChange={(e) => setUserInputLabelFr(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="e.g. Scanner le code-barres"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Prompt Label - Spanish
                      </label>
                      <input
                        type="text"
                        value={userInputLabelEs}
                        onChange={(e) => setUserInputLabelEs(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="e.g. Escanear codigo de barras"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Variable Name
                  </label>
                  <div className="flex items-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">execute.input.</span>
                    <input
                      type="text"
                      value={userInputVariableName}
                      onChange={(e) => setUserInputVariableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="scannedValue"
                    />
                  </div>
                  {userInputType === 'signature_capture' ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Available variables:</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'signatureData'}.signeeName}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Signee Name</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'signatureData'}.signedTime}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Date & Time</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'signatureData'}.imageData}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Signature Image (base64 PNG)</span>
                        </div>
                      </div>
                    </div>
                  ) : userInputType === 'camera_capture' ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Available variables (single photo):</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'capturedPhoto'}.imageData}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Photo (base64 JPEG data URL)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'capturedPhoto'}.timestamp}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Capture Timestamp (ISO 8601)</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Multiple photos (for email attachments, use the images path):</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'capturedPhoto'}.images}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Array of photos (auto-attached to email)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'capturedPhoto'}.count}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Number of photos taken</span>
                        </div>
                      </div>
                    </div>
                  ) : allowMultipleScans && userInputType === 'barcode_scanner' ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        When multiple scans is enabled, the values are stored as an array. Available variables:
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'scannedValue'}[0]}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">First scanned value (for lookups)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{`{{input.${userInputVariableName || 'scannedValue'}}}`}</code>
                          <span className="text-xs text-gray-400 dark:text-gray-500">Full array (use with For Each loop)</span>
                        </div>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                        Use <code className="bg-amber-50 dark:bg-amber-900/30 px-1 rounded">[0]</code> to reference the first barcode for API lookups. Use a For Each step to iterate over all scanned values.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The variable name where the input value will be stored. Reference it in later steps as <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{`{{input.${userInputVariableName || 'scannedValue'}}}`}</code>
                    </p>
                  )}
                </div>

                {userInputType === 'signature_capture' && (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={signaturePopupEnabled}
                        onChange={(e) => setSignaturePopupEnabled(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Show pop-up message before signing
                      </span>
                    </label>
                    {signaturePopupEnabled && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Pop-up Message Text
                        </label>
                        <div className="flex space-x-2">
                          <textarea
                            ref={signaturePopupTextRef}
                            value={signaturePopupText}
                            onChange={(e) => setSignaturePopupText(e.target.value)}
                            rows={3}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Enter the message to display before the user signs..."
                          />
                          <button
                            ref={getButtonRef('signature-popup-text')}
                            type="button"
                            onClick={() => {
                              if (signaturePopupTextRef.current) {
                                setSignaturePopupTextCursorPos(signaturePopupTextRef.current.selectionStart);
                              }
                              setOpenVariableDropdown(openVariableDropdown === 'signature-popup-text' ? null : 'signature-popup-text');
                            }}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors h-fit"
                            title="Insert variable"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                        </div>
                        <VariableDropdown
                          isOpen={openVariableDropdown === 'signature-popup-text'}
                          onClose={() => setOpenVariableDropdown(null)}
                          triggerRef={getButtonRef('signature-popup-text')}
                          variables={getAvailableVariables()}
                          onSelect={(variableName) => {
                            const variable = `{{${variableName}}}`;
                            const cursorPos = signaturePopupTextCursorPos ?? signaturePopupText.length;
                            const newValue = signaturePopupText.slice(0, cursorPos) + variable + signaturePopupText.slice(cursorPos);
                            setSignaturePopupText(newValue);
                            setSignaturePopupTextCursorPos(null);
                            setOpenVariableDropdown(null);
                          }}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          This message will be shown in a pop-up dialog. The user must click OK before the signature pad opens.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Behavior</h6>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>- The flow pauses and waits for user input</li>
                    <li>- After the user provides a value, the flow continues to the next connected step</li>
                    <li>- The value is stored at <span className="text-sky-600 dark:text-sky-400 font-medium">execute.input.{userInputVariableName || 'scannedValue'}</span>{allowMultipleScans && userInputType === 'barcode_scanner' ? ' (as an array)' : ''}</li>
                    {allowMultipleScans && userInputType === 'barcode_scanner' && (
                      <>
                        <li>- First value: <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">{`{{input.${userInputVariableName || 'scannedValue'}[0]}}`}</code></li>
                        <li>- Use a <span className="text-sky-600 dark:text-sky-400 font-medium">For Each</span> step to loop over all values</li>
                      </>
                    )}
                    {userInputType === 'signature_capture' && (
                      <>
                        <li>- Signature data includes: <span className="text-sky-600 dark:text-sky-400 font-medium">signeeName</span>, <span className="text-sky-600 dark:text-sky-400 font-medium">signedTime</span>, <span className="text-sky-600 dark:text-sky-400 font-medium">imageData</span> (base64 PNG)</li>
                        <li>- Reference fields as <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">{`{{input.${userInputVariableName || 'signatureData'}.signeeName}}`}</code></li>
                      </>
                    )}
                    {userInputType === 'camera_capture' && (
                      <>
                        <li>- Photo data includes: <span className="text-sky-600 dark:text-sky-400 font-medium">imageData</span> (base64 JPEG data URL), <span className="text-sky-600 dark:text-sky-400 font-medium">timestamp</span> (ISO 8601)</li>
                        <li>- Reference fields as <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">{`{{input.${userInputVariableName || 'capturedPhoto'}.imageData}}`}</code></li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {stepType === 'user_information' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="flex items-start space-x-3">
                    <Info className="h-5 w-5 text-slate-600 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-slate-800 dark:text-slate-200">User Information Step</h5>
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                        Displays formatted content to the user (e.g. instructions after scanning a QR code). The flow pauses until the user clicks continue.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <Select
                    label="Image Source"
                    value={infoImageSource}
                    onValueChange={(value) => setInfoImageSource(value as 'none' | 'branding_logo' | 'custom_url')}
                    options={[
                      { value: 'none', label: 'No Image' },
                      { value: 'branding_logo', label: 'Company Branding Logo' },
                      { value: 'custom_url', label: 'Custom Image URL' }
                    ]}
                    searchable={false}
                  />
                </div>

                {infoImageSource === 'custom_url' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Custom Image URL
                    </label>
                    <input
                      type="text"
                      value={infoCustomImageUrl}
                      onChange={(e) => setInfoCustomImageUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                )}

                {infoImageSource !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Image Max Height: {infoImageMaxHeight}px
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      step={10}
                      value={infoImageMaxHeight}
                      onChange={(e) => setInfoImageMaxHeight(Number(e.target.value))}
                      className="w-full accent-slate-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>20px</span>
                      <span>300px</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Content (Markdown)
                  </label>
                  <textarea
                    value={infoContentMarkdown}
                    onChange={(e) => setInfoContentMarkdown(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                    placeholder={"## Welcome\n\nPlease follow these steps:\n\n1. **Step one** - do this first\n2. *Step two* - then do this\n\nThank you!"}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Supports headings (#, ##, ###), **bold**, *italic*, numbered lists, and bullet points (-).
                    Use {'{{variableName}}'} to insert values from earlier steps.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Content Alignment
                  </label>
                  <div className="flex items-center space-x-1">
                    {([
                      { value: 'left' as const, icon: AlignLeft, label: 'Left' },
                      { value: 'center' as const, icon: AlignCenter, label: 'Center' },
                      { value: 'right' as const, icon: AlignRight, label: 'Right' },
                    ]).map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setInfoContentAlignment(value)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          infoContentAlignment === value
                            ? 'bg-slate-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Continue Button Label
                  </label>
                  <input
                    type="text"
                    value={infoContinueButtonLabel}
                    onChange={(e) => setInfoContinueButtonLabel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Continue"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The text shown on the button the user clicks to proceed.
                  </p>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center space-x-3 mb-4">
                    <input
                      type="checkbox"
                      id="enableLanguageSelection"
                      checked={infoEnableLanguageSelection}
                      onChange={(e) => setInfoEnableLanguageSelection(e.target.checked)}
                      className="h-4 w-4 text-slate-600 focus:ring-slate-500 border-gray-300 rounded"
                    />
                    <label htmlFor="enableLanguageSelection" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enable Language Selection
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    When enabled, users will see a language picker on this step. The selected language applies to all subsequent steps in the flow. The user's browser language is auto-detected.
                  </p>

                  {infoEnableLanguageSelection && (
                    <div className="space-y-2 mb-2 pl-4 border-l-2 border-slate-300 dark:border-slate-600">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Languages to Display
                      </label>
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={infoEnabledLanguages.includes('fr')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setInfoEnabledLanguages(prev => [...prev, 'fr']);
                              } else {
                                setInfoEnabledLanguages(prev => prev.filter(l => l !== 'fr'));
                              }
                            }}
                            className="h-4 w-4 text-slate-600 focus:ring-slate-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">French (Fran&ccedil;ais)</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={infoEnabledLanguages.includes('es')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setInfoEnabledLanguages(prev => [...prev, 'es']);
                              } else {
                                setInfoEnabledLanguages(prev => prev.filter(l => l !== 'es'));
                              }
                            }}
                            className="h-4 w-4 text-slate-600 focus:ring-slate-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Spanish (Espa&ntilde;ol)</span>
                        </label>
                      </div>
                      {infoEnabledLanguages.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Select at least one language, or disable language selection.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-5 pl-4 border-l-2 border-slate-300 dark:border-slate-600">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Provide translated content below. If the user selects a language earlier in the flow, subsequent steps will display the matching translation automatically.
                    </p>

                    {infoEnabledLanguages.includes('fr') && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Content - French (Fran&ccedil;ais)
                          </label>
                          <textarea
                            value={infoContentMarkdownFr}
                            onChange={(e) => setInfoContentMarkdownFr(e.target.value)}
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                            placeholder="## Bienvenue&#10;&#10;Veuillez suivre ces &eacute;tapes..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Continue Button - French
                          </label>
                          <input
                            type="text"
                            value={infoContinueButtonLabelFr}
                            onChange={(e) => setInfoContinueButtonLabelFr(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Continuer"
                          />
                        </div>
                      </>
                    )}

                    {infoEnabledLanguages.includes('es') && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Content - Spanish (Espa&ntilde;ol)
                          </label>
                          <textarea
                            value={infoContentMarkdownEs}
                            onChange={(e) => setInfoContentMarkdownEs(e.target.value)}
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100 font-mono text-sm"
                            placeholder="## Bienvenido&#10;&#10;Siga estos pasos..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Continue Button - Spanish
                          </label>
                          <input
                            type="text"
                            value={infoContinueButtonLabelEs}
                            onChange={(e) => setInfoContinueButtonLabelEs(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Continuar"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Behavior</h6>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>- The flow pauses and shows the formatted content to the user</li>
                    <li>- After clicking the continue button, the flow proceeds to the next connected step</li>
                    <li>- This step does not collect any data -- it is display only</li>
                  </ul>
                </div>
              </div>
            )}

            {stepType === 'ai_lookup' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start space-x-3">
                    <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-amber-800 dark:text-amber-200">AI Lookup Step</h5>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Use AI to look up information based on form input. Results are stored in the <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">execute.ai.*</code> namespace for use in subsequent steps.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Instructions to AI
                  </label>
                  <div className="flex space-x-2">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={4}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., Look up the business using {{execute.billToName}} located in {{execute.billToCity}}. Find their full business information including address, phone, and contact details."
                    />
                    <button
                      ref={getButtonRef('ai-prompt')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'ai-prompt' ? null : 'ai-prompt')}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors h-fit"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'ai-prompt'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('ai-prompt')}
                    variables={getAvailableVariables()}
                    onSelect={(variableName) => {
                      const newValue = aiPrompt + `{{${variableName}}}`;
                      setAiPrompt(newValue);
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Provide instructions to the AI about what information to look up. Use {`{{execute.fieldKey}}`} to reference form field values.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Response Data Mappings
                    </label>
                    <button
                      type="button"
                      onClick={() => setAiResponseMappings([...aiResponseMappings, { fieldName: '', aiInstruction: '' }])}
                      className="flex items-center px-3 py-1 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Field
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Define what data you want the AI to extract and return. Each field will be stored in <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">execute.ai.fieldName</code>
                  </p>

                  {aiResponseMappings.map((mapping, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Field Name
                          </label>
                          <input
                            type="text"
                            value={mapping.fieldName}
                            onChange={(e) => {
                              const updated = [...aiResponseMappings];
                              updated[index].fieldName = e.target.value;
                              setAiResponseMappings(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 font-mono text-sm dark:bg-gray-600 dark:text-gray-100"
                            placeholder="e.g., name, address, city"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Stored as: execute.ai.{mapping.fieldName || 'fieldName'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            AI Instruction
                          </label>
                          <input
                            type="text"
                            value={mapping.aiInstruction}
                            onChange={(e) => {
                              const updated = [...aiResponseMappings];
                              updated[index].aiInstruction = e.target.value;
                              setAiResponseMappings(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 text-sm dark:bg-gray-600 dark:text-gray-100"
                            placeholder="e.g., business name, street address"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            What the AI should extract
                          </p>
                        </div>
                      </div>
                      {aiResponseMappings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (aiResponseMappings.length > 1) {
                              setAiResponseMappings(aiResponseMappings.filter((_, i) => i !== index));
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md flex-shrink-0 mt-5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Usage in Subsequent Steps</h6>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>- AI results are stored in <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">execute.ai.*</code> namespace</li>
                    <li>- Use with <span className="text-cyan-600 dark:text-cyan-400 font-medium">User Confirmation</span> step to let users verify results</li>
                    <li>- Reference in form field default values: <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">{`{{execute.ai.name}}`}</code></li>
                    <li>- Use <span className="text-orange-600 dark:text-orange-400 font-medium">Decision</span> step to branch based on AI results</li>
                  </ul>
                </div>
              </div>
            )}

            {stepType === 'google_places_lookup' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start space-x-3">
                    <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                      <h5 className="font-medium text-blue-800 dark:text-blue-200">Google Places Lookup Step</h5>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        Search for business information using Google Places API. Results are stored in the <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">execute.places.*</code> namespace for use in subsequent steps.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Search Query
                  </label>
                  <div className="flex space-x-2">
                    <textarea
                      value={placesSearchQuery}
                      onChange={(e) => setPlacesSearchQuery(e.target.value)}
                      rows={2}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., {{execute.billToName}} {{execute.billToCity}} {{execute.billToState}}"
                    />
                    <button
                      ref={getButtonRef('places-query')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'places-query' ? null : 'places-query')}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors h-fit"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                  </div>
                  <VariableDropdown
                    isOpen={openVariableDropdown === 'places-query'}
                    onClose={() => setOpenVariableDropdown(null)}
                    triggerRef={getButtonRef('places-query')}
                    variables={getAvailableVariables()}
                    onSelect={(variableName) => {
                      const newValue = placesSearchQuery + `{{${variableName}}}`;
                      setPlacesSearchQuery(newValue);
                      setOpenVariableDropdown(null);
                    }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Enter a search query to find business information. Use {`{{execute.fieldKey}}`} to include form field values.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Fields to Return
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: 'name', label: 'Business Name' },
                      { key: 'address', label: 'Address' },
                      { key: 'phone', label: 'Phone Number' },
                      { key: 'website', label: 'Website' },
                      { key: 'rating', label: 'Rating' },
                      { key: 'hours', label: 'Business Hours' },
                      { key: 'placeId', label: 'Place ID' },
                    ].map((field) => (
                      <label key={field.key} className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                        <input
                          type="checkbox"
                          checked={placesFieldsToReturn[field.key as keyof typeof placesFieldsToReturn]}
                          onChange={(e) => setPlacesFieldsToReturn({ ...placesFieldsToReturn, [field.key]: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Response Data Mappings
                    </label>
                    <button
                      type="button"
                      onClick={() => setPlacesResponseMappings([...placesResponseMappings, { fieldName: '', placesField: '' }])}
                      className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Mapping
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Map Google Places response fields to variables. Each mapping will be stored in <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">execute.places.fieldName</code>
                  </p>

                  {placesResponseMappings.map((mapping, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Variable Name
                          </label>
                          <input
                            type="text"
                            value={mapping.fieldName}
                            onChange={(e) => {
                              const updated = [...placesResponseMappings];
                              updated[index].fieldName = e.target.value;
                              setPlacesResponseMappings(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm dark:bg-gray-600 dark:text-gray-100"
                            placeholder="e.g., businessName, fullAddress"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Stored as: execute.places.{mapping.fieldName || 'fieldName'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Google Places Field
                          </label>
                          <select
                            value={mapping.placesField}
                            onChange={(e) => {
                              const updated = [...placesResponseMappings];
                              updated[index].placesField = e.target.value;
                              setPlacesResponseMappings(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm dark:bg-gray-600 dark:text-gray-100"
                          >
                            <option value="">Select field...</option>
                            <option value="name">Business Name</option>
                            <option value="formattedAddress">Full Address</option>
                            <option value="streetAddress">Street Address</option>
                            <option value="city">City</option>
                            <option value="state">State</option>
                            <option value="postalCode">Postal Code</option>
                            <option value="country">Country</option>
                            <option value="phone">Phone Number</option>
                            <option value="website">Website</option>
                            <option value="rating">Rating</option>
                            <option value="userRatingsTotal">Total Ratings</option>
                            <option value="hours">Business Hours</option>
                            <option value="placeId">Place ID</option>
                            <option value="latitude">Latitude</option>
                            <option value="longitude">Longitude</option>
                          </select>
                        </div>
                      </div>
                      {placesResponseMappings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (placesResponseMappings.length > 1) {
                              setPlacesResponseMappings(placesResponseMappings.filter((_, i) => i !== index));
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-md flex-shrink-0 mt-5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Usage in Subsequent Steps</h6>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <li>- Results are stored in <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">execute.places.*</code> namespace</li>
                    <li>- Use with <span className="text-cyan-600 dark:text-cyan-400 font-medium">User Confirmation</span> step to let users verify results</li>
                    <li>- Reference in form field default values: <code className="bg-gray-100 dark:bg-gray-600 px-1 rounded">{`{{execute.places.businessName}}`}</code></li>
                    <li>- Use <span className="text-orange-600 dark:text-orange-400 font-medium">Decision</span> step to branch based on lookup results</li>
                  </ul>
                </div>
              </div>
            )}

            {stepType === 'multipart_form_upload' && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-start space-x-3">
                    <Braces className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Multipart Form Upload</h5>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Upload PDF files via multipart/form-data with custom metadata fields.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <Select
                    label="API Source"
                    value={multipartApiSourceType}
                    onValueChange={(v) => setMultipartApiSourceType(v as 'main' | 'secondary' | 'auth_config')}
                    options={[
                      { value: 'main', label: 'Main API' },
                      { value: 'secondary', label: 'Secondary API' },
                      { value: 'auth_config', label: 'Auth Config Only' }
                    ]}
                  />
                </div>

                {multipartApiSourceType === 'secondary' && (
                  <div>
                    <Select
                      label="Secondary API"
                      value={multipartSecondaryApiId}
                      onValueChange={setMultipartSecondaryApiId}
                      options={secondaryApis.map(api => ({ value: api.id, label: api.name }))}
                      placeholder="Select secondary API..."
                    />
                  </div>
                )}

                {multipartApiSourceType === 'auth_config' && (
                  <div>
                    <Select
                      label="Authentication Config"
                      value={multipartAuthConfigId}
                      onValueChange={setMultipartAuthConfigId}
                      options={authConfigs.map(config => ({ value: config.id, label: config.name }))}
                      placeholder="Select auth config..."
                    />
                  </div>
                )}

                {(multipartApiSourceType === 'main' || multipartApiSourceType === 'secondary') && (
                  <div>
                    <Select
                      label="Authentication (Optional)"
                      value={multipartAuthConfigId || '__none__'}
                      onValueChange={(v) => setMultipartAuthConfigId(v === '__none__' ? '' : v)}
                      options={[
                        { value: '__none__', label: 'Use API source default' },
                        ...authConfigs.map(config => ({ value: config.id, label: config.name }))
                      ]}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Override authentication. Configure in Settings &gt; API Settings &gt; Authentication.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API URL
                  </label>
                  <input
                    type="text"
                    value={multipartUrl}
                    onChange={(e) => setMultipartUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="https://api.example.com/upload or /api/Documents"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Full URL or path appended to base URL. Use {`{{variable}}`} for dynamic values.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Upload Filename Template
                  </label>
                  <input
                    type="text"
                    value={multipartFilenameTemplate}
                    onChange={(e) => setMultipartFilenameTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., {{orders[0].detailLineId}}_document.pdf"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave empty to use original filename. Use {`{{variable}}`} for dynamic naming.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Form Parts
                    </label>
                    <button
                      type="button"
                      onClick={() => setMultipartFormParts([...multipartFormParts, { name: '', type: 'text', value: '', contentType: '' }])}
                      className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Part</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {multipartFormParts.map((part, index) => (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-3">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
                            <input
                              type="text"
                              value={part.name}
                              onChange={(e) => {
                                const updated = [...multipartFormParts];
                                updated[index].name = e.target.value;
                                setMultipartFormParts(updated);
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                              placeholder="e.g., properties"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
                            <select
                              value={part.type}
                              onChange={(e) => {
                                const updated = [...multipartFormParts];
                                updated[index].type = e.target.value as 'text' | 'file';
                                setMultipartFormParts(updated);
                              }}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                            >
                              <option value="text">Text</option>
                              <option value="file">File</option>
                            </select>
                          </div>
                          {part.type === 'text' && (
                            <>
                              <div className="col-span-4">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Value</label>
                                  {part.contentType.toLowerCase().includes('json') && (
                                    <button
                                      type="button"
                                      onClick={() => generateMultipartFieldMappings(index)}
                                      className="flex items-center px-2 py-0.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                    >
                                      <FileText className="w-3 h-3 mr-1" />
                                      Map JSON
                                    </button>
                                  )}
                                </div>
                                <textarea
                                  value={part.value}
                                  onChange={(e) => {
                                    const updated = [...multipartFormParts];
                                    updated[index].value = e.target.value;
                                    setMultipartFormParts(updated);
                                    if (multipartJsonParseError[index]) {
                                      setMultipartJsonParseError(prev => ({ ...prev, [index]: '' }));
                                    }
                                  }}
                                  rows={3}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100 font-mono"
                                  placeholder='{"key": "value", "In_DocName": "{{variable}}"}'
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Content-Type</label>
                                <input
                                  type="text"
                                  value={part.contentType}
                                  onChange={(e) => {
                                    const updated = [...multipartFormParts];
                                    updated[index].contentType = e.target.value;
                                    setMultipartFormParts(updated);
                                  }}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                                  placeholder="application/json"
                                />
                              </div>
                            </>
                          )}
                          {part.type === 'file' && (
                            <div className="col-span-6">
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">File Source</label>
                              <div className="px-2 py-1.5 text-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                                PDF from workflow context
                              </div>
                            </div>
                          )}
                          <div className="col-span-1 pt-5">
                            {multipartFormParts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setMultipartFormParts(multipartFormParts.filter((_, i) => i !== index))}
                                className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {multipartJsonParseError[index] && (
                          <div className="mt-2 flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600 dark:text-red-300 font-mono">{multipartJsonParseError[index]}</p>
                          </div>
                        )}

                        {part.type === 'text' && part.fieldMappings && part.fieldMappings.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Field Mappings</label>
                              <button
                                type="button"
                                onClick={() => addMultipartFieldMapping(index)}
                                className="flex items-center px-2 py-0.5 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add Field
                              </button>
                            </div>
                            <div className="space-y-2">
                              {part.fieldMappings.map((mapping, mappingIndex) => (
                                <div
                                  key={mappingIndex}
                                  className={`p-2 rounded border ${
                                    mapping.type === 'hardcoded'
                                      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                                  }`}
                                >
                                  <div className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-3">
                                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Field</label>
                                      <input
                                        type="text"
                                        value={mapping.fieldName}
                                        onChange={(e) => updateMultipartFieldMapping(index, mappingIndex, 'fieldName', e.target.value)}
                                        className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                        placeholder="fieldName"
                                      />
                                    </div>
                                    <div className="col-span-2">
                                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Type</label>
                                      <select
                                        value={mapping.type}
                                        onChange={(e) => updateMultipartFieldMapping(index, mappingIndex, 'type', e.target.value)}
                                        className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                      >
                                        <option value="hardcoded">Hardcoded</option>
                                        <option value="variable">Variable</option>
                                      </select>
                                    </div>
                                    <div className="col-span-4">
                                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Value</label>
                                      <div className="flex items-center space-x-1">
                                        <input
                                          type="text"
                                          value={mapping.value}
                                          onChange={(e) => updateMultipartFieldMapping(index, mappingIndex, 'value', e.target.value)}
                                          className="flex-1 px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                          placeholder={mapping.type === 'hardcoded' ? 'value' : '{{variable}}'}
                                        />
                                        {mapping.type === 'variable' && (
                                          <>
                                            <button
                                              ref={getButtonRef(`mp_${index}_${mappingIndex}`)}
                                              type="button"
                                              onClick={() => setOpenVariableDropdown(openVariableDropdown === `mp_${index}_${mappingIndex}` ? null : `mp_${index}_${mappingIndex}`)}
                                              className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                                            >
                                              <Braces className="w-3 h-3" />
                                            </button>
                                            <VariableDropdown
                                              isOpen={openVariableDropdown === `mp_${index}_${mappingIndex}`}
                                              onClose={() => setOpenVariableDropdown(null)}
                                              triggerRef={getButtonRef(`mp_${index}_${mappingIndex}`)}
                                              variables={getAvailableVariables()}
                                              onSelect={(varName) => {
                                                const current = mapping.value || '';
                                                updateMultipartFieldMapping(index, mappingIndex, 'value', current + `{{${varName}}}`);
                                                setOpenVariableDropdown(null);
                                              }}
                                            />
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="col-span-2">
                                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Data Type</label>
                                      <select
                                        value={mapping.dataType}
                                        onChange={(e) => updateMultipartFieldMapping(index, mappingIndex, 'dataType', e.target.value)}
                                        className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                      >
                                        <option value="string">String</option>
                                        <option value="integer">Integer</option>
                                        <option value="number">Number</option>
                                        <option value="decimal">Decimal</option>
                                        <option value="boolean">Boolean</option>
                                      </select>
                                    </div>
                                    <div className="col-span-1">
                                      <button
                                        type="button"
                                        onClick={() => removeMultipartFieldMapping(index, mappingIndex)}
                                        className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Configure form-data parts. The "file" type part will include the PDF from the workflow.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Response Data Mappings
                    </label>
                    <button
                      type="button"
                      onClick={() => setMultipartResponseMappings([...multipartResponseMappings, { responsePath: '', updatePath: '' }])}
                      className="flex items-center space-x-1 px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Mapping</span>
                    </button>
                  </div>

                  {multipartResponseMappings.length > 0 && (
                    <div className="space-y-2">
                      {multipartResponseMappings.map((mapping, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={mapping.responsePath}
                            onChange={(e) => {
                              const updated = [...multipartResponseMappings];
                              updated[index].responsePath = e.target.value;
                              setMultipartResponseMappings(updated);
                            }}
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Response path (e.g., data.id)"
                          />
                          <span className="text-gray-400">to</span>
                          <input
                            type="text"
                            value={mapping.updatePath}
                            onChange={(e) => {
                              const updated = [...multipartResponseMappings];
                              updated[index].updatePath = e.target.value;
                              setMultipartResponseMappings(updated);
                            }}
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Context path (e.g., documentId)"
                          />
                          <button
                            type="button"
                            onClick={() => setMultipartResponseMappings(multipartResponseMappings.filter((_, i) => i !== index))}
                            className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Map values from the API response to context variables for use in subsequent steps.
                  </p>
                </div>
              </div>
            )}

            {(stepType === 'rename_file' || stepType === 'rename_pdf') && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Filename Template
                  </label>
                  <input
                    type="text"
                    value={renamePdfTemplate}
                    onChange={(e) => setRenamePdfTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., {{invoiceNumber}}_{{customerName}} or BL_{{billNumber}}"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Use {`{{fieldName}}`} to reference extracted data. <strong>DO NOT include file extension</strong> - it will be added automatically based on selected file types (.pdf, .csv, .json, .xml).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    File Types to Rename
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <input
                        type="checkbox"
                        id="renamePdf"
                        checked={renameFileTypes.pdf}
                        onChange={(e) => setRenameFileTypes({ ...renameFileTypes, pdf: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="renamePdf" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        PDF (.pdf)
                      </label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <input
                        type="checkbox"
                        id="renameCsv"
                        checked={renameFileTypes.csv}
                        onChange={(e) => setRenameFileTypes({ ...renameFileTypes, csv: e.target.checked })}
                        className="w-4 h-4 text-green-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-green-500"
                      />
                      <label htmlFor="renameCsv" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        CSV (.csv)
                      </label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <input
                        type="checkbox"
                        id="renameJson"
                        checked={renameFileTypes.json}
                        onChange={(e) => setRenameFileTypes({ ...renameFileTypes, json: e.target.checked })}
                        className="w-4 h-4 text-orange-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-orange-500"
                      />
                      <label htmlFor="renameJson" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        JSON (.json)
                      </label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <input
                        type="checkbox"
                        id="renameXml"
                        checked={renameFileTypes.xml}
                        onChange={(e) => setRenameFileTypes({ ...renameFileTypes, xml: e.target.checked })}
                        className="w-4 h-4 text-red-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-red-500"
                      />
                      <label htmlFor="renameXml" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        XML (.xml)
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Select which file types to rename. The same template will be used for all selected types with the appropriate extension added automatically.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="useExtractedDataForRename"
                    checked={useExtractedDataForRename}
                    onChange={(e) => setUseExtractedDataForRename(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="useExtractedDataForRename" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Use extracted data for filename
                  </label>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="appendTimestamp"
                    checked={appendTimestamp}
                    onChange={(e) => setAppendTimestamp(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="appendTimestamp" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Append Timestamp to Filename
                  </label>
                </div>

                {appendTimestamp && (
                  <div>
                    <Select
                      label="Timestamp Format"
                      value={timestampFormat}
                      onValueChange={setTimestampFormat}
                      options={[
                        { value: 'YYYYMMDD', label: 'YYYYMMDD (e.g., 20250116)' },
                        { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g., 2025-01-16)' },
                        { value: 'YYYYMMDD_HHMMSS', label: 'YYYYMMDD_HHMMSS (e.g., 20250116_143022)' },
                        { value: 'YYYY-MM-DD_HH-MM-SS', label: 'YYYY-MM-DD_HH-MM-SS (e.g., 2025-01-16_14-30-22)' }
                      ]}
                      searchable={false}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Timestamp will be inserted before the file extension (e.g., invoice_20250116.pdf)
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Fallback Filename
                  </label>
                  <input
                    type="text"
                    value={renameFallbackFilename}
                    onChange={(e) => setRenameFallbackFilename(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="e.g., document or processed_file"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Default filename to use if template cannot be processed or extracted data is missing
                  </p>
                </div>
              </div>
            )}

            {stepType === 'email_action' && (
              <div className="space-y-4">
                <div>
                  <Select
                    label="Email Action Type"
                    value={emailActionType}
                    onValueChange={setEmailActionType}
                    options={[
                      { value: 'send_email', label: 'Send Email' },
                      { value: 'archive_email', label: 'Archive Email' }
                    ]}
                    searchable={false}
                  />
                </div>

                <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
                  <div className="flex items-center space-x-3 mb-4">
                    <input
                      type="checkbox"
                      id="isNotificationEmail"
                      checked={isNotificationEmail}
                      onChange={(e) => setIsNotificationEmail(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
                    />
                    <div>
                      <label htmlFor="isNotificationEmail" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Use Notification Template
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Use a notification template instead of direct email configuration
                      </p>
                    </div>
                  </div>

                  {isNotificationEmail && (
                    <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div>
                        <Select
                          label="Notification Template"
                          value={notificationTemplateId}
                          onValueChange={setNotificationTemplateId}
                          options={notificationTemplates.map(t => ({
                            value: t.id,
                            label: `${t.template_name} (${t.template_type})`
                          }))}
                          required
                        />
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Select a notification template to use for this email
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Recipient Override (Optional)
                        </label>
                        <input
                          type="email"
                          value={recipientEmailOverride}
                          onChange={(e) => setRecipientEmailOverride(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                          placeholder="custom@email.com or {{fieldName}}"
                        />
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Override the template's default recipient. Leave empty to use template's recipient. Supports {`{{fieldName}}`} variables.
                        </p>
                      </div>

                      {selectedTemplateCustomFields.length > 0 && (
                        <div className="border-t border-blue-200 dark:border-blue-700 pt-4 mt-4">
                          <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
                            <Braces className="w-4 h-4 mr-2" />
                            Custom Field Mappings
                          </h5>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                            Map response data from previous steps to the template's custom fields
                          </p>
                          <div className="space-y-3">
                            {selectedTemplateCustomFields.map((field) => (
                              <div key={field.name} className="flex items-center space-x-3">
                                <div className="w-1/3">
                                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    {field.label}
                                  </label>
                                  <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    {`{{${field.name}}}`}
                                  </code>
                                  {field.description && (
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{field.description}</p>
                                  )}
                                </div>
                                <div className="flex-1 flex space-x-2">
                                  <input
                                    type="text"
                                    value={customFieldMappings[field.name] || ''}
                                    onChange={(e) => setCustomFieldMappings({
                                      ...customFieldMappings,
                                      [field.name]: e.target.value
                                    })}
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-600 dark:text-gray-100 text-sm font-mono"
                                    placeholder="{{response.data.orderId}}"
                                  />
                                  <button
                                    ref={getButtonRef(`custom-field-${field.name}`)}
                                    type="button"
                                    onClick={() => setOpenVariableDropdown(openVariableDropdown === `custom-field-${field.name}` ? null : `custom-field-${field.name}`)}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                                    title="Insert variable"
                                  >
                                    <Braces className="w-4 h-4" />
                                  </button>
                                  <VariableDropdown
                                    isOpen={openVariableDropdown === `custom-field-${field.name}`}
                                    onClose={() => setOpenVariableDropdown(null)}
                                    triggerRef={getButtonRef(`custom-field-${field.name}`)}
                                    variables={getAvailableVariables()}
                                    onSelect={(variableName) => {
                                      const currentValue = customFieldMappings[field.name] || '';
                                      setCustomFieldMappings({
                                        ...customFieldMappings,
                                        [field.name]: currentValue ? `${currentValue}{{${variableName}}}` : `{{${variableName}}}`
                                      });
                                      setOpenVariableDropdown(null);
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center space-x-3 pt-2">
                        <input
                          type="checkbox"
                          id="includeAttachmentNotification"
                          checked={includeAttachment}
                          onChange={(e) => setIncludeAttachment(e.target.checked)}
                          className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                        />
                        <label htmlFor="includeAttachmentNotification" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Override attachment setting (leave unchecked to use template's setting)
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {!isNotificationEmail && (
                  <div className="space-y-4">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      To (Email Address)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="recipient@example.com, another@example.com or {{customerEmail}}"
                      />
                      <button
                        ref={getButtonRef('email-to')}
                        type="button"
                        onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-to' ? null : 'email-to')}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        title="Insert variable"
                      >
                        <Braces className="w-4 h-4" />
                      </button>
                      <VariableDropdown
                        isOpen={openVariableDropdown === 'email-to'}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef('email-to')}
                        variables={getAvailableVariables()}
                        onSelect={(variableName) => {
                          setEmailTo(emailTo ? `${emailTo}{{${variableName}}}` : `{{${variableName}}}`);
                          setOpenVariableDropdown(null);
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Separate multiple addresses with commas. Use {`{{fieldName}}`} to reference extracted data.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      From (Optional)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={emailFrom}
                        onChange={(e) => setEmailFrom(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="sender@example.com"
                      />
                      <button
                        ref={getButtonRef('email-from')}
                        type="button"
                        onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-from' ? null : 'email-from')}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        title="Insert variable"
                      >
                        <Braces className="w-4 h-4" />
                      </button>
                      <VariableDropdown
                        isOpen={openVariableDropdown === 'email-from'}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef('email-from')}
                        variables={getAvailableVariables()}
                        onSelect={(variableName) => {
                          setEmailFrom(emailFrom ? `${emailFrom}{{${variableName}}}` : `{{${variableName}}}`);
                          setOpenVariableDropdown(null);
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Leave empty to use default sender
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      CC (Optional)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={emailCc}
                        onChange={(e) => setEmailCc(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="cc1@example.com, cc2@example.com"
                      />
                      <button
                        ref={getButtonRef('email-cc')}
                        type="button"
                        onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-cc' ? null : 'email-cc')}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        title="Insert variable"
                      >
                        <Braces className="w-4 h-4" />
                      </button>
                      <VariableDropdown
                        isOpen={openVariableDropdown === 'email-cc'}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef('email-cc')}
                        variables={getAvailableVariables()}
                        onSelect={(variableName) => {
                          setEmailCc(emailCc ? `${emailCc}{{${variableName}}}` : `{{${variableName}}}`);
                          setOpenVariableDropdown(null);
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Separate multiple addresses with commas. Use {`{{fieldName}}`} for variables.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      BCC (Optional)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={emailBcc}
                        onChange={(e) => setEmailBcc(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="bcc1@example.com, bcc2@example.com"
                      />
                      <button
                        ref={getButtonRef('email-bcc')}
                        type="button"
                        onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-bcc' ? null : 'email-bcc')}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        title="Insert variable"
                      >
                        <Braces className="w-4 h-4" />
                      </button>
                      <VariableDropdown
                        isOpen={openVariableDropdown === 'email-bcc'}
                        onClose={() => setOpenVariableDropdown(null)}
                        triggerRef={getButtonRef('email-bcc')}
                        variables={getAvailableVariables()}
                        onSelect={(variableName) => {
                          setEmailBcc(emailBcc ? `${emailBcc}{{${variableName}}}` : `{{${variableName}}}`);
                          setOpenVariableDropdown(null);
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Recipients are hidden from other recipients. Comma-separated.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 mt-4">
                  <input
                    type="checkbox"
                    id="ccUser"
                    checked={ccUser}
                    onChange={(e) => setCcUser(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="ccUser" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    CC User
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
                  CC the current user who submitted the transform (requires email in Users table)
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Subject
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Your document has been processed - {{invoiceNumber}}"
                    />
                    <button
                      ref={getButtonRef('email-subject')}
                      type="button"
                      onClick={() => setOpenVariableDropdown(openVariableDropdown === 'email-subject' ? null : 'email-subject')}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                    <VariableDropdown
                      isOpen={openVariableDropdown === 'email-subject'}
                      onClose={() => setOpenVariableDropdown(null)}
                      triggerRef={getButtonRef('email-subject')}
                      variables={getAvailableVariables()}
                      onSelect={(variableName) => {
                        setEmailSubject(emailSubject ? `${emailSubject}{{${variableName}}}` : `{{${variableName}}}`);
                        setOpenVariableDropdown(null);
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Use {`{{fieldName}}`} to reference extracted data
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Body
                  </label>
                  <div className="flex space-x-2">
                    <textarea
                      ref={emailBodyRef}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={6}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Dear {{customerName}},&#10;&#10;Your document {{invoiceNumber}} has been processed successfully.&#10;&#10;Please find the attached PDF for your records.&#10;&#10;Best regards,&#10;Parse-It System"
                    />
                    <button
                      ref={getButtonRef('email-body')}
                      type="button"
                      onClick={() => {
                        if (emailBodyRef.current) {
                          setEmailBodyCursorPos(emailBodyRef.current.selectionStart);
                        }
                        setOpenVariableDropdown(openVariableDropdown === 'email-body' ? null : 'email-body');
                      }}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors h-fit"
                      title="Insert variable"
                    >
                      <Braces className="w-4 h-4" />
                    </button>
                    <VariableDropdown
                      isOpen={openVariableDropdown === 'email-body'}
                      onClose={() => setOpenVariableDropdown(null)}
                      triggerRef={getButtonRef('email-body')}
                      variables={getAvailableVariables()}
                      onSelect={(variableName) => {
                        const variable = `{{${variableName}}}`;
                        const cursorPos = emailBodyCursorPos ?? emailBody.length;
                        const newValue = emailBody.slice(0, cursorPos) + variable + emailBody.slice(cursorPos);
                        setEmailBody(newValue);
                        setEmailBodyCursorPos(null);
                        setOpenVariableDropdown(null);
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Use {`{{fieldName}}`} to reference extracted data. Use &#10; for line breaks.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="includeAttachment"
                      checked={includeAttachment}
                      onChange={(e) => setIncludeAttachment(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="includeAttachment" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Include PDF attachment
                    </label>
                  </div>

                  {includeAttachment && (
                    <div>
                      <Select
                        label="Attachment Source"
                        value={attachmentSource}
                        onValueChange={setAttachmentSource}
                        options={[
                          { value: 'original_pdf', label: 'Original PDF' },
                          { value: 'extraction_type_filename', label: 'Extraction Type Filename' },
                          { value: 'renamed_pdf', label: 'Renamed PDF (from previous step)' },
                          { value: 'variable_base64', label: 'Base64 from Variable (API Response or User Input)' }
                        ]}
                        searchable={false}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Choose whether to attach the original PDF, use the extraction type's filename template, a renamed version, or base64 data from a variable (e.g. API response or camera capture user input)
                      </p>
                    </div>
                  )}
                  {includeAttachment && attachmentSource === 'variable_base64' && (
                    <div className="space-y-3 mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Base64 Variable Path
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={attachmentBase64Variable}
                            onChange={(e) => setAttachmentBase64Variable(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                            placeholder="e.g. reportData or input.photo.imageData"
                          />
                          <button
                            ref={getButtonRef('attachment-base64-variable')}
                            type="button"
                            onClick={() => setOpenVariableDropdown(openVariableDropdown === 'attachment-base64-variable' ? null : 'attachment-base64-variable')}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            title="Insert variable"
                          >
                            <Braces className="w-4 h-4" />
                          </button>
                          <VariableDropdown
                            isOpen={openVariableDropdown === 'attachment-base64-variable'}
                            onClose={() => setOpenVariableDropdown(null)}
                            triggerRef={getButtonRef('attachment-base64-variable')}
                            variables={getAvailableVariables()}
                            onSelect={(variableName) => {
                              setAttachmentBase64Variable(variableName);
                              setOpenVariableDropdown(null);
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          The variable path that holds the base64-encoded content (e.g. reportData from an API response, or input.photo.imageData for a camera capture user input named "photo")
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Attachment Filename
                        </label>
                        <input
                          type="text"
                          value={attachmentFilename}
                          onChange={(e) => setAttachmentFilename(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                          placeholder="photo.jpg, report.pdf, or {{reportName}}.pdf"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          The filename for the attachment. Supports variables like {`{{reportName}}`}. If left blank, auto-detects extension (.jpg for camera photos, .pdf for PDFs).
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {includeAttachment && (
                  <div className="mt-4">
                    <h6 className="font-medium text-gray-700 dark:text-gray-300 mb-4">PDF Attachment Strategy</h6>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Select
                          label="Attachment Strategy"
                          value={pdfEmailStrategy}
                          onValueChange={(value) => setPdfEmailStrategy(value as 'all_pages_in_group' | 'specific_page_in_group')}
                          options={[
                            { value: 'all_pages_in_group', label: 'Attach All Pages in Group' },
                            { value: 'specific_page_in_group', label: 'Attach Specific Page Only' }
                          ]}
                          searchable={false}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Choose whether to attach the entire grouped PDF or just a specific page from the group
                        </p>
                      </div>

                      {pdfEmailStrategy === 'specific_page_in_group' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Specific Page to Attach
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={specificPageToEmail}
                            onChange={(e) => setSpecificPageToEmail(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                            placeholder="2"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Page number within the group to attach (e.g., 2 for the second page in a 2-page group)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Response Template - applies to all step types */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              User Response Message
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(Optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={userResponseTemplate}
                onChange={(e) => setUserResponseTemplate(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="e.g., Found Client ID: {{orders.0.consignee.clientId}}"
              />
              <button
                type="button"
                ref={(el) => {
                  if (!buttonRefs.current['userResponse']) {
                    buttonRefs.current['userResponse'] = React.createRef();
                  }
                  if (el) {
                    (buttonRefs.current['userResponse'] as any).current = el;
                  }
                }}
                onClick={() => setOpenVariableDropdown(openVariableDropdown === 'userResponse' ? null : 'userResponse')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded"
                title="Insert variable"
              >
                <Braces className="w-4 h-4" />
              </button>
              <VariableDropdown
                isOpen={openVariableDropdown === 'userResponse'}
                onClose={() => setOpenVariableDropdown(null)}
                onSelect={(variableName) => {
                  setUserResponseTemplate(prev => prev + `{{${variableName}}}`);
                  setOpenVariableDropdown(null);
                }}
                variables={[
                  ...getEnclosingForEachLoops(),
                  ...getIndexedArrayLoopVariables(),
                  ...responseDataMappings
                    .filter(m => m.updatePath && m.updatePath.trim() !== '')
                    .map(m => ({
                      name: m.updatePath,
                      stepName: `Stored at: ${m.updatePath} (full array)`,
                      source: 'workflow' as const,
                      dataType: 'response mapping' as const
                    })),
                  ...(allSteps || [])
                    .filter((s: any) => s.id !== step?.id && Array.isArray(s.configJson?.responseDataMappings))
                    .flatMap((s: any) => (s.configJson.responseDataMappings || [])
                      .filter((m: any) => m.updatePath && String(m.updatePath).trim() !== '')
                      .map((m: any) => ({
                        name: m.updatePath,
                        stepName: `from ${s.stepName || 'Step'} (full array)`,
                        source: 'workflow' as const,
                        dataType: 'response mapping' as const
                      }))
                    )
                ]}
                triggerRef={buttonRefs.current['userResponse']}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Message shown to users during workflow execution. Use {'{{variableName}}'} to include dynamic values.
            </p>
            {stepType === 'user_input' && getEnclosingForEachLoops().length > 0 && (
              <label className="mt-3 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentLoopItemOnly}
                  onChange={(e) => setCurrentLoopItemOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Show current loop iteration only
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    When on, array variables in the message (e.g. {'{{fbBarcode}}'}) resolve to the current iteration's value instead of the full array.
                  </span>
                </span>
              </label>
            )}
          </div>

          {!['user_information', 'user_confirmation', 'exit', 'user_input', 'route'].includes(stepType) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Select
                label="Next Step on Success"
                value={nextStepOnSuccess || '__none__'}
                onValueChange={(value) => setNextStepOnSuccess(value === '__none__' ? '' : value)}
                options={[
                  { value: '__none__', label: 'End workflow' },
                  ...availableSteps.map((s) => ({
                    value: s.id,
                    label: s.stepName || s.step_name
                  }))
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Step to execute if this step succeeds
              </p>
            </div>

            <div>
              <Select
                label="Next Step on Failure"
                value={nextStepOnFailure || '__none__'}
                onValueChange={(value) => setNextStepOnFailure(value === '__none__' ? '' : value)}
                options={[
                  { value: '__none__', label: 'End workflow' },
                  ...availableSteps.map((s) => ({
                    value: s.id,
                    label: s.stepName || s.step_name
                  }))
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Step to execute if this step fails
              </p>
            </div>
          </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Save Step
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}