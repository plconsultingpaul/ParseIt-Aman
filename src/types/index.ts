export type FunctionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty';

export interface FunctionConditionClause {
  field: string;
  operator: FunctionOperator;
  value: any;
}

export interface FunctionCondition {
  if: FunctionConditionClause;
  additionalConditions?: FunctionConditionClause[];
  then: any;
}

export interface ConditionalFunctionLogic {
  conditions: FunctionCondition[];
  default?: any;
}

export interface DateFunctionLogic {
  type: 'date';
  source: 'field' | 'current_date';
  fieldName?: string;
  operation: 'add' | 'subtract';
  days: number;
  outputFormat?: string;
}

export interface AddressLookupFunctionLogic {
  type: 'address_lookup';
  inputFields: string[];
  lookupType: 'postal_code' | 'city' | 'province' | 'country' | 'full_address';
  countryContext?: string;
  defaultValue?: string;
}

export type DateTimeMergeOutputFormat =
  | 'YYYY-MM-DDTHH:mm:ss'
  | 'YYYY-MM-DD HH:mm:ss'
  | 'YYYY-MM-DDTHH:mm:ssZ'
  | 'MM/DD/YYYY HH:mm:ss'
  | 'MM/DD/YYYY HH:mm'
  | 'DD/MM/YYYY HH:mm:ss'
  | 'DD/MM/YYYY HH:mm';

export interface DateTimeMergeFunctionLogic {
  type: 'datetime_merge';
  dateFieldName: string;
  timeFieldName: string;
  outputFormat: DateTimeMergeOutputFormat;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  emptyTimeDefault?: string;
}

export type FunctionType = 'conditional' | 'date' | 'address_lookup' | 'datetime_merge';

export interface FieldMappingFunction {
  id: string;
  extraction_type_id?: string;
  workflow_v2_node_id?: string;
  flow_node_id?: string;
  function_name: string;
  description?: string;
  function_type: FunctionType;
  function_logic: ConditionalFunctionLogic | DateFunctionLogic | AddressLookupFunctionLogic | DateTimeMergeFunctionLogic;
  created_at: string;
  updated_at: string;
}

export interface FieldMapping {
  fieldName: string;
  type: 'ai' | 'mapped' | 'hardcoded' | 'function' | 'order_entry' | 'variable';
  value: string;
  dataType?: 'string' | 'number' | 'integer' | 'datetime' | 'date' | 'time' | 'phone' | 'boolean' | 'zip_postal';
  maxLength?: number;
  dateOnly?: boolean;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  removeIfNull?: boolean;
  isWorkflowOnly?: boolean;
  functionId?: string;
}

export interface ArraySplitConfig {
  id?: string;
  extractionTypeId?: string;
  targetArrayField: string;
  splitBasedOnField: string;
  splitStrategy: 'one_per_entry' | 'divide_evenly';
  defaultToOneIfMissing?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArrayEntryField {
  id?: string;
  arrayEntryId?: string;
  fieldName: string;
  fieldType: 'hardcoded' | 'extracted' | 'mapped';
  hardcodedValue?: string;
  extractionInstruction?: string;
  dataType?: 'string' | 'number' | 'integer' | 'boolean' | 'datetime' | 'date' | 'time';
  maxLength?: number;
  dateOnly?: boolean;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  removeIfNull?: boolean;
  fieldOrder: number;
  createdAt?: string;
}

export interface ArrayEntryConditionRule {
  fieldPath: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' | 'isEmpty' | 'isNotEmpty';
  value: string;
}

export interface ArrayEntryConditions {
  enabled: boolean;
  logic: 'AND' | 'OR';
  rules: ArrayEntryConditionRule[];
}

export interface ArrayEntryConfig {
  id?: string;
  extractionTypeId?: string;
  targetArrayField: string;
  entryOrder: number;
  isEnabled: boolean;
  fields: ArrayEntryField[];
  conditions?: ArrayEntryConditions;
  isRepeating?: boolean;
  repeatInstruction?: string;
  aiConditionInstruction?: string;
  removeEntryIfRinNull?: boolean;
  parentArrayField?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExtractionType {
  id: string;
  name: string;
  defaultInstructions: string;
  formatTemplate: string;
  filename: string;
  formatType: 'XML' | 'JSON' | 'CSV';
  jsonPath?: string;
  fieldMappings?: FieldMapping[];
  parseitIdMapping?: string;
  traceTypeMapping?: string;
  traceTypeValue?: string;
  workflowId?: string;
  workflowVersion?: 'v1' | 'v2';
  workflowV2Id?: string;
  autoDetectInstructions?: string;
  csvDelimiter?: string;
  csvIncludeHeaders?: boolean;
  csvRowDetectionInstructions?: string;
  csvMultiPageProcessing?: boolean;
  jsonMultiPageProcessing?: boolean;
  defaultUploadMode?: 'manual' | 'auto';
  lockUploadMode?: boolean;
  arraySplitConfigs?: ArraySplitConfig[];
  arrayEntryConfigs?: ArrayEntryConfig[];
  pageProcessingMode?: 'all' | 'single' | 'range';
  pageProcessingSinglePage?: number;
  pageProcessingRangeStart?: number;
  pageProcessingRangeEnd?: number;
  combinePagesAsSingleExtraction?: boolean;
  enableFailureNotifications?: boolean;
  enableSuccessNotifications?: boolean;
  failureNotificationTemplateId?: string;
  successNotificationTemplateId?: string;
  failureRecipientEmailOverride?: string;
  successRecipientEmailOverride?: string;
  enableReview?: boolean;
  enableConfidenceScoring?: boolean;
  inboxReviewTemplateId?: string;
}

export interface TransformationFieldMapping {
  fieldName: string;
  type: 'ai' | 'mapped' | 'hardcoded' | 'function';
  value: string;
  dataType?: 'string' | 'number' | 'integer' | 'datetime' | 'date' | 'time' | 'phone' | 'boolean' | 'zip_postal';
  maxLength?: number;
  pageNumberInGroup?: number;
  functionId?: string;
}

export interface PageGroupConfig {
  id: string;
  transformationTypeId: string;
  name?: string;
  groupOrder: number;
  pagesPerGroup: number;
  workflowId?: string;
  workflowVersion?: 'v1' | 'v2';
  workflowV2Id?: string;
  smartDetectionPattern?: string;
  processMode: 'single' | 'all';
  filenameTemplate?: string;
  fieldMappings?: TransformationFieldMapping[];
  useAiDetection?: boolean;
  fallbackBehavior?: 'skip' | 'fixed_position' | 'error';
  detectionConfidenceThreshold?: number;
  followsPreviousGroup?: boolean;
  detectionMode?: 'detect' | 'fixed_sequence';
  createdAt?: string;
  updatedAt?: string;
}

export interface ManualGroupEdit {
  groupIndex: number;
  groupOrder: number;
  pages: number[];
  pageGroupConfig: PageGroupConfig;
}

export interface TransformationType {
  id: string;
  name: string;
  defaultInstructions: string;
  filenameTemplate: string;
  fieldMappings?: TransformationFieldMapping[];
  autoDetectInstructions?: string;
  workflowId?: string;
  workflowVersion?: 'v1' | 'v2';
  workflowV2Id?: string;
  defaultUploadMode?: 'manual' | 'auto';
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  pagesPerGroup?: number;
  documentStartPattern?: string;
  documentStartDetectionEnabled?: boolean;
  pageGroupConfigs?: PageGroupConfig[];
  lockUploadMode?: boolean;
}

export interface SftpConfig {
  id?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  xmlPath: string;
  pdfPath: string;
  jsonPath: string;
  csvPath?: string;
}

export interface OrderDisplayMapping {
  fieldName: string;
  displayLabel: string;
}

export interface ApiConfig {
  id?: string;
  path: string;
  password?: string;
  googleApiKey: string;
  googlePlacesApiKey?: string;
  orderDisplayFields: string;
  customOrderDisplayFields: OrderDisplayMapping[];
  testEndpoint?: string;
}

export interface SecondaryApiConfig {
  id?: string;
  name: string;
  baseUrl: string;
  authToken: string;
  description: string;
  isActive: boolean;
  testEndpoint?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  stepType: 'api_call' | 'api_endpoint' | 'data_transform' | 'sftp_upload' | 'conditional_check' | 'email_action' | 'rename_pdf';
  stepName: string;
  configJson: any;
  nextStepOnSuccessId?: string;
  nextStepOnFailureId?: string;
  escapeSingleQuotesInBody?: boolean;
  userResponseTemplate?: string;
}

export type ExecuteButtonStepType = 'api_call' | 'api_endpoint' | 'data_transform' | 'sftp_upload' | 'conditional_check' | 'email_action' | 'rename_file';

export interface ExecuteButtonStep {
  id: string;
  buttonId: string;
  stepOrder: number;
  stepType: ExecuteButtonStepType;
  stepName: string;
  configJson: any;
  nextStepOnSuccessId?: string;
  nextStepOnFailureId?: string;
  escapeSingleQuotesInBody?: boolean;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiEndpointStepConfig {
  apiSourceType: 'main' | 'secondary';
  apiEndpointId?: string;
  secondaryApiId?: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiSpecEndpointId?: string;
  apiPath: string;
  queryParameterConfig: Record<string, { enabled: boolean; value: string }>;
  pathVariables?: Record<string, string>;
  responsePath?: string;
  updateJsonPath?: string;
  manualApiEntry?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  steps?: WorkflowStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PageRangeInfo {
  groupOrder: number;
  startPage: number;
  endPage: number;
  groupName?: string;
}

export interface ExtractionLog {
  id: string;
  userId?: string;
  extractionTypeId?: string;
  transformationTypeId?: string;
  pdfFilename: string;
  pdfPages: number;
  extractionStatus: 'success' | 'failed';
  errorMessage?: string;
  extractedData?: string;
  processingMode?: 'extraction' | 'transformation' | 'execute';
  parseitId?: number;
  executeButtonId?: string;
  executeButtonName?: string;
  createdAt: string;
  pageStart?: number;
  pageEnd?: number;
  pageRanges?: PageRangeInfo[];
  unusedPages?: number;
}

export interface WorkflowExecutionLog {
  id: string;
  workflowId: string;
  extractionLogId?: string;
  status: 'running' | 'completed' | 'failed';
  currentStepId?: string;
  currentStepName?: string;
  errorMessage?: string;
  contextData?: any;
  createdAt: string;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
  userId?: string;
  processingMode?: 'extraction' | 'transformation' | 'execute';
  extractionTypeId?: string;
  transformationTypeId?: string;
  senderEmail?: string;
  failureNotificationSent?: boolean;
  successNotificationSent?: boolean;
  notificationSentAt?: string;
}

export interface DetectionResult {
  detectedTypeId: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  reasoning: string;
  isVendorRule?: boolean;
  detectedRuleId?: string;
}

export interface VendorExtractionRule {
  id: string;
  vendorId: string;
  ruleName: string;
  autoDetectInstructions: string;
  extractionTypeId?: string;
  transformationTypeId?: string;
  processingMode: 'extraction' | 'transformation';
  priority: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissions {
  extractPage: boolean;
  extractionTypes: boolean;
  transformPage: boolean;
  transformationTypes: boolean;
  executePage: boolean;
  executeSetup: boolean;
  inboxPage: boolean;
  sftp: boolean;
  api: boolean;
  emailMonitoring: boolean;
  emailRules: boolean;
  processedEmails: boolean;
  extractionLogs: boolean;
  userManagement: boolean;
  workflowManagement: boolean;
  vendorSetup: boolean;
  clientSetup: boolean;
  ordersConfiguration: boolean;
  clientManagement: boolean;
  clientUserManagement: boolean;
  orderEntry: boolean;
  submissions: boolean;
  trackTrace: boolean;
  workflowLogs: boolean;
  emailPolling: boolean;
  sftpPolling: boolean;
  notificationTemplates: boolean;
  companyBranding: boolean;
  imagingDelete: boolean;
  imagingRerunWorkflow: boolean;
  imagingRetryEpdf: boolean;
}

export interface User {
  id: string;
  username: string;
  name?: string;
  email?: string;
  isAdmin: boolean;
  isActive: boolean;
  role: 'admin' | 'user' | 'vendor' | 'client';
  permissions: UserPermissions;
  preferredUploadMode: 'manual' | 'auto';
  currentZone?: string;
  clientId?: string;
  isClientAdmin?: boolean;
  hasOrderEntryAccess?: boolean;
  hasRateQuoteAccess?: boolean;
  hasAddressBookAccess?: boolean;
  hasTrackTraceAccess?: boolean;
  hasInvoiceAccess?: boolean;
  hasSubmissionsAccess?: boolean;
  hasExecuteSetupAccess?: boolean;
  createdAt?: string;
  lastLogin?: string;
  invitationSentAt?: string;
  invitationSentCount?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

export interface EmailConfig {
  id?: string;
  provider: 'office365' | 'gmail';
  office365TenantId?: string;
  office365ClientId?: string;
  office365ClientSecret?: string;
  office365SendFromEmail?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  gmailSendFromEmail?: string;
}

export type PostProcessAction = 'mark_read' | 'move' | 'archive' | 'delete' | 'none';

export interface EmailMonitoringConfig {
  provider: 'office365' | 'gmail';
  tenantId: string;
  clientId: string;
  clientSecret: string;
  monitoredEmail: string;
  defaultSendFromEmail: string;
  gmailClientId: string;
  gmailClientSecret: string;
  gmailRefreshToken: string;
  gmailMonitoredLabel: string;
  pollingInterval: number;
  isEnabled: boolean;
  enableAutoDetect: boolean;
  lastCheck?: string;
  monitoringTenantId?: string;
  monitoringClientId?: string;
  monitoringClientSecret?: string;
  gmailMonitoringClientId?: string;
  gmailMonitoringClientSecret?: string;
  gmailMonitoringRefreshToken?: string;
  cronEnabled?: boolean;
  cronJobId?: number;
  cronSchedule?: string;
  lastCronRun?: string;
  nextCronRun?: string;
  postProcessAction?: PostProcessAction;
  processedFolderPath?: string;
  postProcessActionNoRuleMatch?: PostProcessAction;
  noRuleMatchFolderPath?: string;
  enableFailureNotifications?: boolean;
  failureNotificationTemplateId?: string | null;
  failureRecipientEmailOverride?: string | null;
}

export interface CronStatus {
  configured: boolean;
  cronSettingsConfigured: boolean;
  supabaseUrlSet: boolean;
  supabaseAnonKeySet: boolean;
  enabled: boolean;
  jobExists: boolean;
  jobId?: number;
  schedule?: string;
  pollingInterval?: number;
  lastCronRun?: string;
  nextCronRun?: string;
  lastRunStatus?: string;
  lastRunTime?: string;
  lastRunEnd?: string;
  lastRunReturnMessage?: string;
  error?: string;
}

export interface CronSettings {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKeyMasked: string;
}

export interface EmailProcessingRule {
  id: string;
  ruleName: string;
  senderPattern?: string;
  subjectPattern?: string;
  extractionTypeId?: string;
  transformationTypeId?: string;
  processingMode: 'extraction' | 'transformation' | 'workflow_v2';
  workflowV2Id?: string;
  isEnabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export type WorkflowV2Type = 'extraction' | 'transformation' | 'imaging';

export interface WorkflowV2 {
  id: string;
  name: string;
  description?: string;
  workflowType: WorkflowV2Type;
  isActive: boolean;
  scheduleEnabled?: boolean;
  scheduleIntervalMinutes?: number | null;
  cronSchedule?: string | null;
  lastScheduledRun?: string | null;
  nextScheduledRun?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type WorkflowV2StepType = 'api_call' | 'api_endpoint' | 'conditional_check' | 'data_transform' | 'sftp_upload' | 'email_action' | 'rename_file' | 'multipart_form_upload' | 'ai_decision' | 'imaging' | 'read_email' | 'read_barcode' | 'user_message' | 'inbox' | 'update_imaging_document';

export interface WorkflowV2Node {
  id: string;
  workflowId: string;
  nodeType: 'start' | 'workflow';
  positionX: number;
  positionY: number;
  width?: number;
  height?: number;
  label: string;
  stepType?: WorkflowV2StepType;
  configJson: any;
  escapeSingleQuotesInBody?: boolean;
  userResponseTemplate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowV2Edge {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
  label?: string;
  edgeType: string;
  animated: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ExtractionWorkflow = Workflow;

export interface SettingsConfig {
  id?: string;
  password: string;
}

export interface ParseItLicense {
  id: string;
  customerName: string;
  issuedAt: string;
  expiryDate: string | null;
  extract: boolean;
  transform: boolean;
  execute: boolean;
  clientSetup: boolean;
  vendorSetup: boolean;
  imaging: boolean;
  rawPayload: Record<string, unknown>;
  uploadedAt: string;
}

export interface UserExtractionType {
  id: string;
  userId: string;
  extractionTypeId: string;
  createdAt: string;
}

export interface Client {
  id: string;
  clientName: string;
  clientId: string;
  isActive: boolean;
  hasOrderEntryAccess: boolean;
  hasRateQuoteAccess: boolean;
  hasAddressBookAccess: boolean;
  hasTrackTraceAccess: boolean;
  hasInvoiceAccess: boolean;
  hasSubmissionsAccess: boolean;
  trackTraceTemplateId?: string;
  orderEntryTemplateId?: string;
  invoiceTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSpec {
  id: string;
  api_endpoint_id?: string;
  secondary_api_id?: string;
  name: string;
  file_name: string;
  spec_content: any;
  version: string;
  description: string;
  uploaded_at: string;
  updated_at: string;
}

export interface ApiSpecEndpoint {
  id: string;
  api_spec_id: string;
  path: string;
  method: string;
  summary: string;
  parameters: any[];
  request_body?: any;
  responses: any;
  created_at: string;
}

export interface ApiEndpointField {
  id: string;
  api_spec_endpoint_id: string;
  field_name: string;
  field_path: string;
  field_type: string;
  is_required: boolean;
  description: string;
  example?: string;
  format?: string;
  parent_field_id?: string;
  created_at: string;
}

export interface ClientAddress {
  id: string;
  clientId: string;
  name: string;
  address1: string;
  address2?: string;
  city: string;
  stateProv: string;
  postalCode?: string;
  country: string;
  clientRefId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactPhoneExt?: string;
  appointmentReq: boolean;
  active: boolean;
  isShipper: boolean;
  isConsignee: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderEntryFieldType = 'text' | 'number' | 'date' | 'datetime' | 'phone' | 'dropdown' | 'file' | 'boolean' | 'zip' | 'postal_code' | 'zip_postal' | 'province' | 'state' | 'api_lookup';

export interface ApiLookupDisplayColumn {
  field: string;
  label: string;
}

export interface ApiLookupFieldMapping {
  responseField: string;
  targetFieldName: string;
}

export interface ApiLookupRequestBodyMapping {
  fieldName: string;
  type: 'hardcoded' | 'variable' | 'search';
  value: string;
  dataType?: 'string' | 'number' | 'integer' | 'datetime' | 'boolean';
}

export interface OrderEntryConfig {
  id: string;
  apiEndpoint: string;
  apiMethod: string;
  apiHeaders: Record<string, string>;
  apiAuthType: string;
  apiAuthToken: string;
  workflowId?: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryJsonSchema {
  id: string;
  schemaName: string;
  schemaVersion: string;
  schemaContent: any;
  fieldPaths: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryFieldGroup {
  id: string;
  groupName: string;
  groupOrder: number;
  description: string;
  isCollapsible: boolean;
  isExpandedByDefault: boolean;
  backgroundColor: string;
  borderColor: string;
  isArrayGroup: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  arrayJsonPath: string;
  hideAddRow: boolean;
  isHidden: boolean;
  addressBookEnabled?: boolean;
  addressBookType?: 'shipper' | 'consignee' | 'both' | null;
  parentGroupId?: string | null;
  childButtonLabel?: string | null;
  resetOnTemplateLoad?: boolean;
  removeIfEmpty?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DropdownOptionVisibilityRule {
  dependsOnField: string;
  showWhenValues: string[];
}

export interface DropdownOption {
  value: string;
  description: string;
  visibilityRules?: DropdownOptionVisibilityRule[];
}

export type DropdownDisplayMode = 'description_only' | 'value_and_description';

export interface OrderEntryField {
  id: string;
  fieldGroupId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: OrderEntryFieldType;
  placeholder: string;
  helpText: string;
  isRequired: boolean;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  defaultValue: string;
  dropdownOptions: string[] | DropdownOption[];
  dropdownDisplayMode?: DropdownDisplayMode;
  jsonPath: string;
  isArrayField: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  aiExtractionInstructions: string;
  validationRegex: string;
  validationErrorMessage: string;
  fieldOrder: number;
  copyFromField?: string;
  useClientIdDefault?: boolean;
  addressBookField?: string | null;
  exclusionGroups?: string[][];
  apiLookupEndpoint?: string | null;
  apiLookupSecondaryApiId?: string | null;
  apiLookupSpecId?: string | null;
  apiLookupDisplayColumns?: ApiLookupDisplayColumn[] | null;
  apiLookupValueField?: string | null;
  apiLookupFieldMappings?: ApiLookupFieldMapping[] | null;
  apiLookupSearchParam?: string | null;
  apiLookupHttpMethod?: string | null;
  apiLookupRequestBody?: string | null;
  apiLookupRequestBodyMappings?: ApiLookupRequestBodyMapping[] | null;
  apiLookupWrapBodyInArray?: boolean;
  futureDatesOnly?: boolean;
  allowWeekends?: boolean;
  allowHolidays?: boolean;
  hiddenFromClient?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryFieldLayout {
  id: string;
  fieldId: string;
  rowIndex: number;
  columnIndex: number;
  widthColumns: number;
  mobileWidthColumns: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryPdf {
  id: string;
  userId: string;
  originalFilename: string;
  storagePath: string;
  fileSize: number;
  pageCount: number;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  extractedData: Record<string, any>;
  extractionConfidence: Record<string, number>;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntrySubmission {
  id: string;
  userId: string;
  pdfId?: string;
  submissionData: Record<string, any>;
  apiResponse: Record<string, any>;
  apiStatusCode?: number;
  workflowExecutionLogId?: string;
  submissionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRegistrationToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string;
  createdAt: string;
}

export interface PdfExtractionResult {
  success: boolean;
  fieldData: Record<string, any>;
  confidence: Record<string, number>;
  errorMessage?: string;
}

export interface OrderEntryFormData {
  [key: string]: any;
}

export interface CompanyBranding {
  id: string;
  companyName: string;
  logoUrl: string;
  logoStoragePath?: string;
  showCompanyName: boolean;
  clientLoginLogoUrl?: string;
  clientLoginLogoSize?: number;
  clientLoginCompanyName?: string;
  loginLogoSize?: number;
  appBaseUrl?: string;
  trainingVideoLink?: string;
}

export interface ApiError {
  statusCode: number;
  statusText: string;
  details: any;
  url: string;
  headers: Record<string, string>;
}

export interface PageProcessingState {
  isProcessing: boolean;
  isExtracting: boolean;
  extractedData: string;
  workflowOnlyData?: string;
  extractionError: string;
  apiResponse: string;
  apiError: ApiError | null;
  success: boolean;
  workflowExecutionLogId?: string;
  workflowExecutionLog?: WorkflowExecutionLog | null;
  confidenceScores?: Record<string, number>;
  userMessage?: string;
}

export interface EmailPollingLog {
  id: string;
  timestamp: string;
  provider: string;
  status: string;
  emailsFound: number;
  emailsProcessed: number;
  emailsSkipped: number;
  emailsFailed: number;
  errorMessage?: string;
  executionTimeMs?: number;
  createdAt: string;
}

export interface SftpPollingConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  monitoredPath: string;
  processedPath: string;
  isEnabled: boolean;
  lastPolledAt?: string;
  defaultExtractionTypeId?: string;
  defaultTransformationTypeId?: string;
  processingMode: 'extraction' | 'transformation' | 'imaging';
  imagingBucketId?: string;
  workflowId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SftpPollingLog {
  id: string;
  configId?: string;
  timestamp: string;
  status: string;
  filesFound: number;
  filesProcessed: number;
  errorMessage?: string;
  executionTimeMs?: number;
  createdAt: string;
}

export interface ProcessedEmail {
  id: string;
  emailId: string;
  sender: string;
  subject: string;
  receivedDate: string;
  processingRuleId?: string;
  extractionTypeId?: string;
  processingMode?: 'extraction' | 'transformation' | 'workflow_v2';
  direction: 'inbound' | 'outbound';
  pdfFilename?: string;
  attachmentCount?: number;
  pdfFilenames?: string;
  attachmentPageCounts?: string;
  processingStatus: string;
  errorMessage?: string;
  parseitId?: number;
  processedAt: string;
  createdAt: string;
}

export interface NotificationTemplateCustomField {
  name: string;
  label: string;
  description?: string;
}

export interface NotificationTemplate {
  id: string;
  templateType: 'failure' | 'success';
  templateName: string;
  recipientEmail?: string;
  subjectTemplate: string;
  bodyTemplate: string;
  attachPdf: boolean;
  ccEmails?: string;
  bccEmails?: string;
  isGlobalDefault: boolean;
  customFields?: NotificationTemplateCustomField[];
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceOrderByOption {
  field: string;
  label: string;
  defaultDirection: 'asc' | 'desc';
}

export interface TrackTraceConfig {
  id: string;
  clientId: string;
  apiSourceType: 'main' | 'secondary';
  secondaryApiId?: string;
  apiSpecId?: string;
  apiSpecEndpointId?: string;
  apiPath: string;
  httpMethod: string;
  limitOptions: number[];
  orderByOptions: TrackTraceOrderByOption[];
  defaultLimit: number;
  defaultOrderBy?: string;
  defaultOrderDirection: 'asc' | 'desc';
  isEnabled: boolean;
  orderIdFieldName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceField {
  id: string;
  configId: string;
  fieldType: 'filter' | 'select';
  fieldName: string;
  displayLabel: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  filterOperator?: string;
  parameterType?: 'query' | 'path' | 'header' | 'body';
  apiFieldPath?: string;
  isRequired: boolean;
  fieldOrder: number;
  isEnabled: boolean;
  valueMappings?: TrackTraceValueMapping[];
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceTemplate {
  id: string;
  name: string;
  description?: string;
  apiSourceType: 'main' | 'secondary';
  secondaryApiId?: string;
  apiSpecId?: string;
  apiSpecEndpointId?: string;
  apiPath: string;
  httpMethod: string;
  limitOptions: number[];
  orderByOptions: TrackTraceOrderByOption[];
  defaultLimit: number;
  defaultOrderBy?: string;
  defaultOrderDirection: 'asc' | 'desc';
  isActive: boolean;
  showUrl: boolean;
  orderIdFieldName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceValueMapping {
  sourceValue: string;
  displayValue: string;
  color: string;
}

export interface TrackTraceTemplateField {
  id: string;
  templateId: string;
  fieldType: 'filter' | 'select';
  fieldName: string;
  displayLabel: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  filterOperator?: string;
  parameterType: 'query' | '$filter' | '$orderBy' | '$select' | 'path' | 'header' | 'body';
  apiFieldPath?: string;
  isRequired: boolean;
  fieldOrder: number;
  isEnabled: boolean;
  valueMappings?: TrackTraceValueMapping[];
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceTemplateDefaultField {
  id: string;
  templateId: string;
  fieldName: string;
  parameterType: 'query' | 'path' | 'header' | 'body';
  apiFieldPath?: string;
  valueType: 'static' | 'dynamic';
  staticValue?: string;
  dynamicValue?: string;
  operator?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceFilterValue {
  id: string;
  fieldName: string;
  operator: string;
  value: string;
}

export interface TrackTraceFilterPreset {
  id: string;
  templateId: string;
  name: string;
  displayOrder: number;
  filterValues: TrackTraceFilterValue[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrackTraceFilterPresetDefaultField {
  id: string;
  presetId: string;
  fieldName: string;
  parameterType: 'query' | 'path' | 'header' | 'body';
  apiFieldPath?: string;
  valueType: 'static' | 'dynamic';
  staticValue?: string;
  dynamicValue?: string;
  createdAt: string;
  updatedAt: string;
}

export type TrackTraceTemplateSectionType =
  | 'shipment_summary'
  | 'shipment_timeline'
  | 'route_summary'
  | 'trace_numbers'
  | 'barcode_details'
  | 'documents';

export interface TraceNumberFieldMapping {
  label: string;
  valueField: string;
  displayType: 'header' | 'detail';
  valueMappings?: TrackTraceValueMapping[];
}

export interface TraceNumbersSectionConfig {
  apiSourceType: 'main' | 'secondary';
  secondaryApiId?: string;
  apiSpecId?: string;
  apiSpecEndpointId?: string;
  fieldMappings: TraceNumberFieldMapping[];
}

export interface TrackTraceTimelineChildStatus {
  id: string;
  timelineStatusId: string;
  statusValue: string;
  displayOrder: number;
  createdAt: string;
}

export interface TrackTraceTimelineStatus {
  id: string;
  templateId: string;
  name: string;
  displayOrder: number;
  locationField?: string;
  dateField?: string;
  createdAt: string;
  updatedAt: string;
  childStatuses?: TrackTraceTimelineChildStatus[];
}

export interface TimelineSectionConfig {
  statusField: string;
}

export interface BarcodeDetailsFieldMapping {
  id?: string;
  label: string;
  apiField: string;
  showTotal: boolean;
  isRequired?: boolean;
  displayOrder: number;
  groupId?: string;
  groupSeparator?: string;
  valueSuffix?: string;
}

export interface BarcodeDetailsImageConfig {
  id?: string;
  apiUrl: string;
  authConfigId?: string;
  sourceField: string;
}

export interface BarcodeDetailsSectionConfig {
  apiSourceType: 'main' | 'secondary';
  secondaryApiId?: string;
  apiSpecId?: string;
  apiSpecEndpointId?: string;
  responseArrayPath?: string;
  nestedArrayPath?: string;
  secondaryEndpointId?: string;
  secondaryParamField?: string;
  fieldMappings: BarcodeDetailsFieldMapping[];
  imageConfig?: BarcodeDetailsImageConfig;
}

export interface RouteSummaryField {
  id?: string;
  groupId?: string;
  label: string;
  apiField: string;
  displayOrder: number;
  gridColumn?: number;
  displayFormat?: string;
}

export interface RouteSummaryGroup {
  id?: string;
  templateId?: string;
  name: string;
  rowIndex: number;
  displayOrder: number;
  apiSpecEndpointId?: string;
  apiSourceType?: 'main' | 'secondary';
  secondaryApiId?: string;
  authConfigId?: string;
  fields: RouteSummaryField[];
}

export interface RouteSummarySectionConfig {
  groups: RouteSummaryGroup[];
}

export interface ShipmentSummaryField {
  id?: string;
  groupId?: string;
  label: string;
  apiField: string;
  displayOrder: number;
}

export interface ShipmentSummaryGroup {
  id?: string;
  templateId?: string;
  name: string;
  displayOrder: number;
  fields: ShipmentSummaryField[];
}

export interface ShipmentSummaryConfig {
  id?: string;
  templateId: string;
  headerFieldName: string;
  showTimelineStatus: boolean;
  tempControlledField: string;
  tempControlledLabel: string;
  hazardousField: string;
  hazardousLabel: string;
}

export interface ShipmentSummarySectionConfig {
  config?: ShipmentSummaryConfig;
  groups: ShipmentSummaryGroup[];
}

export interface TrackTraceTemplateSection {
  id: string;
  templateId: string;
  sectionType: TrackTraceTemplateSectionType;
  displayOrder: number;
  isEnabled: boolean;
  config: Record<string, unknown> | TraceNumbersSectionConfig | TimelineSectionConfig | BarcodeDetailsSectionConfig | RouteSummarySectionConfig;
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceDocumentFilter {
  id: string;
  documentConfigId: string;
  fieldName: string;
  valueType: 'variable' | 'static';
  variableName?: string;
  staticValue?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrackTraceDocumentConfig {
  id: string;
  templateId: string;
  name: string;
  searchApiUrl: string;
  getDocumentApiUrl: string;
  docIdField: string;
  docNameField: string;
  docTypeField?: string;
  docSizeField?: string;
  authConfigId?: string;
  sortOrder: number;
  isEnabled: boolean;
  emailEnabled: boolean;
  emailSubject?: string;
  emailTemplate?: string;
  vendorType?: string;
  parseitBucketId?: string;
  parseitSearchField?: string;
  createdAt: string;
  updatedAt: string;
  filters?: TrackTraceDocumentFilter[];
}

export interface FetchedDocument {
  id: string;
  name: string;
  type: string;
  size: string;
  configId: string;
  getDocumentUrl: string;
  authConfigId?: string;
  emailEnabled?: boolean;
  emailSubject?: string;
  emailTemplate?: string;
}

export interface OrderEntryTemplate {
  id: string;
  name: string;
  description?: string;
  extractionTypeId?: string;
  confirmationNumberField?: string;
  hidePdfAutofill?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryDocumentType {
  id: string;
  templateId: string;
  name: string;
  sortOrder: number;
  isRequired: boolean;
  actionType: 'email' | 'imaging' | 'both';
  emailRecipients?: string;
  emailSubjectTemplate?: string;
  imagingBucketId?: string;
  imagingDocumentTypeId?: string;
  renameTemplate?: string;
  allowedFileTypes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntrySubmissionDocument {
  id: string;
  submissionId: string;
  documentTypeId?: string;
  documentTypeName: string;
  originalFileName: string;
  renamedFileName?: string;
  storagePath: string;
  fileSize?: number;
  actionType: 'email' | 'imaging' | 'both';
  actionStatus: 'pending' | 'success' | 'failed';
  actionError?: string;
  createdAt: string;
}

export interface OrderEntryTemplateFieldGroup {
  id: string;
  templateId: string;
  groupName: string;
  groupOrder: number;
  description?: string;
  isCollapsible: boolean;
  isExpandedByDefault: boolean;
  backgroundColor?: string;
  borderColor?: string;
  isArrayGroup: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  arrayJsonPath?: string;
  isHidden: boolean;
  addressBookEnabled?: boolean;
  addressBookType?: 'shipper' | 'consignee' | 'both';
  parentGroupId?: string | null;
  childButtonLabel?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryTemplateField {
  id: string;
  templateId: string;
  fieldGroupId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: OrderEntryFieldType;
  placeholder?: string;
  helpText?: string;
  isRequired: boolean;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string;
  dropdownOptions: string[] | DropdownOption[];
  dropdownDisplayMode?: DropdownDisplayMode;
  jsonPath?: string;
  isArrayField: boolean;
  arrayMinRows: number;
  arrayMaxRows: number;
  aiExtractionInstructions?: string;
  validationRegex?: string;
  validationErrorMessage?: string;
  fieldOrder: number;
  useClientIdDefault?: boolean;
  addressBookField?: string;
  conditionalVisibilityFieldId?: string | null;
  conditionalVisibilityOperator?: string | null;
  conditionalVisibilityValue?: string | null;
  conditionalRequiredFieldId?: string | null;
  conditionalRequiredOperator?: string | null;
  conditionalRequiredValue?: string | null;
  exclusionGroups?: string[][];
  futureDatesOnly?: boolean;
  allowWeekends?: boolean;
  allowHolidays?: boolean;
  hiddenFromClient?: boolean;
  countChildArrayRecords?: boolean;
  countChildArrayGroupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEntryTemplateFieldLayout {
  id: string;
  templateId: string;
  fieldId: string;
  rowIndex: number;
  columnIndex: number;
  widthColumns: number;
  mobileWidthColumns: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImagingBucket {
  id: string;
  name: string;
  url: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  supabaseStorageSlug: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ImagingDuplicateManualAction = 'keep_existing' | 'use_new' | 'prompt';
export type ImagingDuplicateEmailAction = 'keep_existing' | 'use_new';

export interface ImagingDocumentType {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  allowDuplicates: boolean;
  duplicateManualAction: ImagingDuplicateManualAction;
  duplicateEmailAction: ImagingDuplicateEmailAction;
  createdAt: string;
  updatedAt: string;
}

export interface ImagingDocument {
  id: string;
  bucketId: string;
  documentTypeId: string;
  detailLineId?: string;
  billNumber?: string;
  storagePath: string;
  originalFilename: string;
  fileSize: number;
  uploadedBy?: string;
  processingStatus: 'none' | 'processing' | 'completed' | 'failed';
  epdfJobId?: string;
  epdfStoragePath?: string;
  createdAt: string;
  updatedAt: string;
  bucketName?: string;
  documentTypeName?: string;
  bucketUrl?: string;
  metadata?: Record<string, string>;
}

export type ImagingMetadataFieldType = 'text' | 'number' | 'date' | 'boolean' | 'dropdown';

export interface ImagingMetadataField {
  id: string;
  fieldName: string;
  displayLabel: string;
  fieldType: ImagingMetadataFieldType;
  dropdownOptions: string[];
  sortOrder: number;
  isPinnedToHeader: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImagingDocumentTypeMetadataField {
  id: string;
  documentTypeId: string;
  metadataFieldId: string;
  isRequired: boolean;
  isHiddenFromIndexing: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ImagingDocumentMetadata {
  id: string;
  documentId: string;
  fieldId: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImagingQueue {
  id: string;
  bucketId: string;
  name: string;
  description: string;
  slug: string;
  isSystem: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  bucketName?: string;
}

export interface ImagingBarcodePattern {
  id: string;
  name: string;
  patternTemplate: string;
  separator: string;
  fixedDocumentType: string | null;
  bucketId: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  bucketName?: string;
}

export interface ImagingUnindexedItem {
  id: string;
  bucketId: string;
  storagePath: string;
  originalFilename: string;
  fileSize: number;
  detectedBarcodes: string[];
  sourceSftpConfigId: string | null;
  sourceEmailConfigId: string | null;
  sourceType: 'sftp' | 'email';
  status: 'pending' | 'indexed' | 'discarded';
  detailLineId: string | null;
  documentTypeId: string | null;
  billNumber: string | null;
  indexedBy: string | null;
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
  bucketName?: string;
  bucketUrl?: string;
  documentTypeName?: string;
}

export interface ImagingEmailProcessingRule {
  id: string;
  ruleName: string;
  matchType: 'subject' | 'barcode_pattern';
  matchPattern: string;
  workflowV2Id?: string;
  imagingBucketId?: string | null;
  emailConfigId?: string;
  isEnabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImagingDocumentTypeProcessingRule {
  id: string;
  ruleName: string;
  documentTypeId: string;
  imagingBucketId?: string | null;
  workflowV2Id?: string;
  triggerSources: Array<'manual' | 'api' | 'email' | 'sftp'>;
  isEnabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImagingEmailMonitoringConfig {
  id?: string;
  configName: string;
  provider: 'office365' | 'gmail';
  tenantId: string;
  clientId: string;
  clientSecret: string;
  gmailClientId: string;
  gmailClientSecret: string;
  gmailRefreshToken: string;
  monitoredEmail: string;
  gmailMonitoredLabel: string;
  imagingBucketId: string | null;
  pollingInterval: number;
  isEnabled: boolean;
  lastCheck?: string;
  checkAllMessages: boolean;
  forceToUnindexedQueue: boolean;
  postProcessAction: PostProcessAction;
  processedFolderPath: string;
  postProcessActionOnFailure: PostProcessAction;
  failureFolderPath: string;
  postProcessActionNoRuleMatch: PostProcessAction;
  noRuleMatchFolderPath: string;
  cronEnabled?: boolean;
  cronJobId?: number;
  cronSchedule?: string;
  lastCronRun?: string;
  nextCronRun?: string;
}

export interface ImagingSftpConnection {
  id?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImagingSftpFolderConfig {
  id?: string;
  folderName: string;
  monitoredPath: string;
  processedPath: string;
  imagingBucketId: string | null;
  isEnabled: boolean;
  pollingInterval: number;
  lastPolledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImagingSftpPollingLog {
  id: string;
  folderConfigId: string;
  timestamp: string;
  status: 'running' | 'success' | 'failed';
  filesFound: number;
  filesProcessed: number;
  errorMessage?: string;
  executionTimeMs?: number;
  createdAt: string;
}

export interface ImagingSftpProcessingRule {
  id: string;
  sftpFolderConfigId: string;
  ruleName: string;
  matchType: 'filename_pattern' | 'barcode_pattern';
  matchPattern: string;
  workflowV2Id?: string;
  imagingBucketId?: string | null;
  isEnabled: boolean;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceOrderByOption {
  field: string;
  label: string;
  defaultDirection: 'asc' | 'desc';
}

export interface InvoiceBodyMapping {
  fieldPath: string;
  sourceType: 'hardcoded' | 'variable';
  dataType: 'string' | 'number' | 'boolean';
  value: string;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  apiSourceType: 'main' | 'secondary';
  secondaryApiId?: string;
  apiSpecId?: string;
  apiSpecEndpointId?: string;
  apiPath: string;
  httpMethod: string;
  requestBody?: string;
  requestBodyMappings: InvoiceBodyMapping[];
  limitOptions: number[];
  orderByOptions: InvoiceOrderByOption[];
  defaultLimit: number;
  defaultOrderBy?: string;
  defaultOrderDirection: 'asc' | 'desc';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceConfig {
  id: string;
  clientId: string;
  apiSourceType: 'main' | 'secondary';
  secondaryApiId?: string;
  apiSpecId?: string;
  apiSpecEndpointId?: string;
  apiPath: string;
  httpMethod: string;
  requestBody?: string;
  requestBodyMappings: InvoiceBodyMapping[];
  limitOptions: number[];
  orderByOptions: InvoiceOrderByOption[];
  defaultLimit: number;
  defaultOrderBy?: string;
  defaultOrderDirection: 'asc' | 'desc';
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceField {
  id: string;
  configId: string;
  fieldType: 'filter' | 'select';
  fieldName: string;
  displayLabel: string;
  dataType: 'string' | 'number' | 'date' | 'boolean';
  filterOperator?: string;
  parameterType?: 'query' | 'path' | 'header' | 'body' | '$select';
  apiFieldPath?: string;
  isRequired: boolean;
  fieldOrder: number;
  isEnabled: boolean;
  valueMappings?: { sourceValue: string; displayValue: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDefaultField {
  id: string;
  configId: string;
  fieldName: string;
  parameterType: string;
  apiFieldPath?: string;
  valueType: 'static' | 'dynamic';
  staticValue?: string;
  dynamicValue?: string;
  operator: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceFilterValue {
  id: string;
  fieldName: string;
  operator: string;
  value: string;
}

export interface InvoiceFilterPreset {
  id: string;
  configId: string;
  name: string;
  displayOrder: number;
  filterValues: InvoiceFilterValue[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InboxItemStatus = 'pending' | 'accepted' | 'rejected';

export interface InboxItem {
  id: string;
  workflowId: string;
  workflowExecutionLogId: string | null;
  extractionLogId: string | null;
  extractionTypeId: string | null;
  inboxNodeId: string;
  status: InboxItemStatus;
  contextData: Record<string, any>;
  extractedData: Record<string, any>;
  originalExtractedData: Record<string, any> | null;
  pdfStoragePath: string | null;
  pdfFilename: string | null;
  originalPdfFilename: string | null;
  triggerSource: string | null;
  senderEmail: string | null;
  extractionTypeName: string | null;
  formatType: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  editedData: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

// Inbox Review Setup types
export type InboxReviewFieldType = 'text' | 'number' | 'date' | 'timestamp' | 'dropdown' | 'boolean' | 'readonly';

export interface InboxReviewTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sampleJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxReviewFieldGroup {
  id: string;
  templateId: string;
  groupName: string;
  groupOrder: number;
  description: string | null;
  isArrayGroup: boolean;
  arrayJsonPath: string | null;
  isCollapsedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InboxReviewField {
  id: string;
  groupId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: InboxReviewFieldType;
  jsonPath: string;
  fieldOrder: number;
  isRequired: boolean;
  isEditable: boolean;
  isVisible: boolean;
  placeholder: string | null;
  defaultValue: string | null;
  helpText: string | null;
  dropdownOptions: string[] | null;
  validationRegex: string | null;
  maxLength: number | null;
  timeFormat: '12h' | '24h';
  visibilityCondition: InboxReviewVisibilityCondition | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxReviewVisibilityCondition {
  fieldJsonPath: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_empty' | 'empty';
  value?: string;
}

export interface InboxReviewFieldLayout {
  id: string;
  fieldId: string;
  rowIndex: number;
  columnIndex: number;
  widthColumns: number;
  mobileWidthColumns: number;
  createdAt: string;
  updatedAt: string;
}
