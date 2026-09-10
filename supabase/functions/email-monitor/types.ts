export interface FieldMapping {
  fieldName: string;
  type: 'hardcoded' | 'mapped' | 'ai';
  value?: string;
  dataType?: string;
  maxLength?: number;
  dateOnly?: boolean;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  removeIfNull?: boolean;
  isWorkflowOnly?: boolean;
}

export interface ArraySplitConfig {
  targetArrayField: string;
  splitBasedOnField: string;
  splitStrategy: 'one_per_entry' | 'divide_evenly';
  defaultToOneIfMissing?: boolean;
}

export interface ArrayEntryField {
  fieldName: string;
  fieldType: 'hardcoded' | 'extracted' | 'mapped';
  hardcodedValue?: string;
  extractionInstruction?: string;
  dataType?: 'string' | 'number' | 'integer' | 'datetime';
  maxLength?: number;
  dateOnly?: boolean;
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY';
  removeIfNull?: boolean;
}

export interface ArrayEntryConfig {
  targetArrayField: string;
  entryOrder: number;
  isEnabled: boolean;
  fields: ArrayEntryField[];
  isRepeating?: boolean;
  repeatInstruction?: string;
  aiConditionInstruction?: string;
  removeEntryIfRinNull?: boolean;
  parentArrayField?: string;
}

export interface SplitPageResult {
  filename: string;
  base64: string;
  pageNumber: number;
  originalFilename: string;
}

export interface PdfAttachment {
  filename: string;
  base64: string;
  pageCount: number;
}

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  receivedDate: string;
}

export interface ProcessedEmailResult {
  id: string;
  from: string;
  subject: string;
  receivedDate: string;
  processedSuccessfully: boolean;
  errorMessage: string | null;
  extractionLogId: string | null;
  rule: string;
}

export interface TransformationType {
  id: string;
  name: string;
  default_instructions: string;
  filename_template: string;
  field_mappings?: string;
  auto_detect_instructions?: string;
  workflow_id?: string;
  workflow_version?: string;
  workflow_v2_id?: string;
  pages_per_group?: number;
}

export interface ProcessingRule {
  id: string;
  rule_name: string;
  sender_pattern: string | null;
  subject_pattern: string | null;
  extraction_type_id: string;
  transformation_type_id: string | null;
  is_enabled: boolean;
  priority: number;
  processing_mode: string | null;
  workflow_v2_id: string | null;
  extraction_types: ExtractionType | null;
  transformation_types: TransformationType | null;
}

export interface ExtractionType {
  id: string;
  name: string;
  default_instructions: string;
  xml_format: string;
  filename: string;
  format_type: 'JSON' | 'XML' | 'CSV';
  auto_detect_instructions?: string;
  json_path?: string;
  field_mappings?: FieldMapping[] | string;
  parseit_id_mapping?: string;
  trace_type_mapping?: string;
  trace_type_value?: string;
  workflow_id?: string;
  workflow_version?: string;
  workflow_v2_id?: string;
  json_multi_page_processing?: boolean;
  page_processing_mode?: 'all' | 'single' | 'range';
  page_processing_single_page?: number;
  page_processing_range_start?: number;
  page_processing_range_end?: number;
  extraction_type_array_splits?: ArraySplitConfig[];
  extraction_type_array_entries?: ArrayEntryConfig[];
}

export interface EmailMonitoringConfig {
  id: string;
  provider: 'gmail' | 'office365';
  is_enabled: boolean;
  last_check?: string;
  check_all_messages?: boolean;
  monitored_email?: string;
  gmail_client_id?: string;
  gmail_client_secret?: string;
  gmail_refresh_token?: string;
  gmail_monitoring_client_id?: string;
  gmail_monitoring_client_secret?: string;
  gmail_monitoring_refresh_token?: string;
  gmail_monitored_label?: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  monitoring_tenant_id?: string;
  monitoring_client_id?: string;
  monitoring_client_secret?: string;
  post_process_action?: string;
  post_process_action_on_failure?: string;
  post_process_action_no_rule_match?: string;
  processed_folder_path?: string;
  failure_folder_path?: string;
  no_rule_match_folder_path?: string;
}

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  path?: string;
  csv_path?: string;
}

export interface ApiConfig {
  path: string;
  password?: string;
}

export interface WorkflowResult {
  success: boolean;
  error?: string;
  lastApiResponse?: any;
  workflowExecutionLogId?: string;
}

export interface ProcessEmailResult {
  emailResult: ProcessedEmailResult;
  attachments: PdfAttachment[];
  matchingRule: ProcessingRule | null;
  parseitId: number | null;
}

export interface AttachmentProcessResult {
  success: boolean;
  extractionLogId: string | null;
  parseitId: number | null;
  error?: string;
}
