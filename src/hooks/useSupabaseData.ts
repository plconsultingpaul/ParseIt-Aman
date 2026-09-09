import { useState, useEffect, useRef } from 'react';
import type { ExtractionType, TransformationType, SftpConfig, SettingsConfig, ApiConfig, EmailMonitoringConfig, EmailProcessingRule, ProcessedEmail, ExtractionLog, User, ExtractionWorkflow, WorkflowStep, EmailPollingLog, WorkflowExecutionLog, SftpPollingLog, CompanyBranding } from '../types';
import {
  fetchApiConfig,
  updateApiConfig,
  fetchSftpConfig,
  updateSftpConfig,
  fetchSettingsConfig,
  updateSettingsConfig,
  fetchCompanyBranding,
  updateCompanyBranding,
  fetchExtractionTypes,
  updateExtractionTypes,
  deleteExtractionType,
  fetchTransformationTypes,
  updateTransformationTypes,
  deleteTransformationType,
  fetchWorkflows,
  updateWorkflows,
  deleteWorkflow,
  fetchWorkflowSteps,
  updateWorkflowSteps,
  deleteWorkflowStep,
  fetchExtractionLogs,
  refreshLogsWithFilters,
  logExtraction,
  fetchEmailPollingLogs,
  stopRunningPollingLogs,
  fetchWorkflowExecutionLogs,
  fetchSftpPollingLogs,
  fetchProcessedEmails,
  fetchEmailConfig,
  updateEmailConfig,
  fetchEmailRules,
  updateEmailRules,
} from '../services';
import { supabase } from '../lib/supabase';

export function useSupabaseData() {
  const [extractionTypes, setExtractionTypes] = useState<ExtractionType[]>([]);
  const [transformationTypes, setTransformationTypes] = useState<TransformationType[]>([]);
  const [sftpConfig, setSftpConfig] = useState<SftpConfig>({
    host: '',
    port: 22,
    username: '',
    password: '',
    xmlPath: '/uploads/xml/',
    pdfPath: '/uploads/pdf/',
    jsonPath: '/uploads/json/'
  });
  const [settingsConfig, setSettingsConfig] = useState<SettingsConfig>({
    password: ''
  });
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    path: '',
    password: '',
    googleApiKey: '',
    orderDisplayFields: '',
    customOrderDisplayFields: []
  });
  const [emailConfig, setEmailConfig] = useState<EmailMonitoringConfig>({
    provider: 'office365',
    tenantId: '',
    clientId: '',
    clientSecret: '',
    monitoredEmail: '',
    defaultSendFromEmail: '',
    gmailClientId: '',
    gmailClientSecret: '',
    gmailRefreshToken: '',
    gmailMonitoredLabel: 'INBOX',
    pollingInterval: 5,
    isEnabled: false,
    enableAutoDetect: false
  });
  const [emailRules, setEmailRules] = useState<EmailProcessingRule[]>([]);
  const [processedEmails, setProcessedEmails] = useState<ProcessedEmail[]>([]);
  const [extractionLogs, setExtractionLogs] = useState<ExtractionLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workflows, setWorkflows] = useState<ExtractionWorkflow[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [emailPollingLogs, setEmailPollingLogs] = useState<EmailPollingLog[]>([]);
  const [workflowExecutionLogs, setWorkflowExecutionLogs] = useState<WorkflowExecutionLog[]>([]);
  const [sftpPollingLogs, setSftpPollingLogs] = useState<SftpPollingLog[]>([]);
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding>({
    id: '',
    companyName: '',
    logoUrl: '',
    showCompanyName: false
  });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    console.log('[useSupabaseData] loadData() called - Starting data load');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[useSupabaseData] Current auth session:', {
        hasSession: !!session,
        userId: session?.user?.id,
        role: session?.user?.role
      });

      console.log('[useSupabaseData] Loading extraction and transformation types...');
      const [extractionTypesData, transformationTypesData] = await Promise.all([
        fetchExtractionTypes(),
        fetchTransformationTypes()
      ]);
      console.log('[useSupabaseData] Types loaded:', {
        extractionTypes: extractionTypesData.length,
        transformationTypes: transformationTypesData.length
      });
      setExtractionTypes(extractionTypesData);
      setTransformationTypes(transformationTypesData);

      console.log('[useSupabaseData] Loading configs (SFTP, Settings, API, Company)...');
      const [sftpConfigData, settingsConfigData, apiConfigData, companyBrandingData] = await Promise.all([
        fetchSftpConfig(),
        fetchSettingsConfig(),
        fetchApiConfig(),
        fetchCompanyBranding()
      ]);
      console.log('[useSupabaseData] Configs loaded successfully');
      setSftpConfig(sftpConfigData);
      setSettingsConfig(settingsConfigData);
      setApiConfig(apiConfigData);
      setCompanyBranding(companyBrandingData);

      console.log('[useSupabaseData] Loading email config and rules...');
      const [emailConfigData, emailRulesData] = await Promise.all([
        fetchEmailConfig(),
        fetchEmailRules()
      ]);
      console.log('[useSupabaseData] Email config loaded from DB:', {
        ...emailConfigData,
        clientSecret: emailConfigData.clientSecret ? '***HIDDEN***' : '(empty)',
        gmailClientSecret: emailConfigData.gmailClientSecret ? '***HIDDEN***' : '(empty)',
        gmailRefreshToken: emailConfigData.gmailRefreshToken ? '***HIDDEN***' : '(empty)'
      });
      setEmailConfig(emailConfigData);
      setEmailRules(emailRulesData);

      console.log('[useSupabaseData] Loading workflows and steps...');
      const [workflowsData, workflowStepsData] = await Promise.all([
        fetchWorkflows(),
        fetchWorkflowSteps()
      ]);
      console.log('[useSupabaseData] Workflows loaded successfully');
      setWorkflows(workflowsData);
      setWorkflowSteps(workflowStepsData);

      console.log('[useSupabaseData] Loading users and extraction logs...');
      const [usersData, extractionLogsData] = await Promise.all([
        loadUsers(),
        fetchExtractionLogs()
      ]);
      console.log('[useSupabaseData] Users and logs loaded successfully');
      setUsers(usersData);
      setExtractionLogs(extractionLogsData);

      console.log('[useSupabaseData] Loading processed emails and polling logs...');
      const [processedEmailsData, emailPollingLogsData, workflowExecutionLogsData, sftpPollingLogsData] = await Promise.all([
        fetchProcessedEmails(),
        fetchEmailPollingLogs(),
        fetchWorkflowExecutionLogs(),
        fetchSftpPollingLogs()
      ]);
      console.log('[useSupabaseData] All data loaded successfully');
      setProcessedEmails(processedEmailsData);
      setEmailPollingLogs(emailPollingLogsData);
      setWorkflowExecutionLogs(workflowExecutionLogsData);
      setSftpPollingLogs(sftpPollingLogsData);
    } catch (error) {
      console.error('[useSupabaseData] ERROR loading data:', error);
    } finally {
      console.log('[useSupabaseData] loadData() complete - setting loading to false');
      setLoading(false);
    }
  };

  const hasLoadedRef = useRef(false);

  const loadBrandingOnly = async () => {
    console.log('[useSupabaseData] loadBrandingOnly() - fetching company branding (no auth required)');
    try {
      const brandingData = await fetchCompanyBranding();
      console.log('[useSupabaseData] Branding loaded pre-auth:', {
        hasLogo: !!brandingData.logoUrl,
        logoUrl: brandingData.logoUrl ? brandingData.logoUrl.substring(0, 60) + '...' : '(empty)',
        companyName: brandingData.companyName || '(empty)',
        showCompanyName: brandingData.showCompanyName
      });
      setCompanyBranding(brandingData);
    } catch (error) {
      console.error('[useSupabaseData] ERROR loading branding pre-auth:', error);
    }
  };

  useEffect(() => {
    console.log('[useSupabaseData] useEffect mounted - waiting for auth session');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[useSupabaseData] onAuthStateChange:', { event, hasSession: !!session, hasLoaded: hasLoadedRef.current });

      if (event === 'SIGNED_OUT') {
        hasLoadedRef.current = false;
        return;
      }

      if (event === 'INITIAL_SESSION' && !session) {
        console.log('[useSupabaseData] No session on init - loading branding only for login page');
        loadBrandingOnly().finally(() => setLoading(false));
        return;
      }

      if (session && !hasLoadedRef.current) {
        hasLoadedRef.current = true;
        console.log('[useSupabaseData] Auth session ready, loading data. Event:', event);
        loadData();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUsers = async (): Promise<User[]> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(user => ({
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        role: user.role,
        permissions: user.permissions ? JSON.parse(user.permissions) : {},
        preferredUploadMode: user.preferred_upload_mode,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }));
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  };

  const updateSftpPollingConfigs = async (configs: any[]): Promise<void> => {
    try {
      // Get existing configs to determine which to update vs insert
      const { data: existingConfigs } = await supabase
        .from('sftp_polling_configs')
        .select('id');

      const existingIds = new Set((existingConfigs || []).map(c => c.id));
      const configsToUpdate = configs.filter(config => existingIds.has(config.id) && !config.id.startsWith('temp-'));
      const configsToInsert = configs.filter(config => !existingIds.has(config.id) || config.id.startsWith('temp-'));

      // Update existing configs
      for (const config of configsToUpdate) {
        const { error } = await supabase
          .from('sftp_polling_configs')
          .update({
            name: config.name,
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            monitored_path: config.monitoredPath,
            processed_path: config.processedPath,
            is_enabled: config.isEnabled,
            default_extraction_type_id: config.defaultExtractionTypeId,
            processing_mode: config.processingMode || 'extraction',
            imaging_bucket_id: config.imagingBucketId || null,
            workflow_id: config.workflowId,
            updated_at: new Date().toISOString()
          })
          .eq('id', config.id);

        if (error) throw error;
      }

      // Insert new configs
      if (configsToInsert.length > 0) {
        const { error } = await supabase
          .from('sftp_polling_configs')
          .insert(
            configsToInsert.map(config => ({
              name: config.name,
              host: config.host,
              port: config.port,
              username: config.username,
              password: config.password,
              monitored_path: config.monitoredPath,
              processed_path: config.processedPath,
              is_enabled: config.isEnabled,
              default_extraction_type_id: config.defaultExtractionTypeId,
              processing_mode: config.processingMode || 'extraction',
              imaging_bucket_id: config.imagingBucketId || null,
              workflow_id: config.workflowId
            }))
          );

        if (error) throw error;
      }

      // Delete configs that are no longer in the list
      const currentIds = configs.filter(config => !config.id.startsWith('temp-')).map(config => config.id);
      if (currentIds.length > 0) {
        const { error } = await supabase
          .from('sftp_polling_configs')
          .delete()
          .not('id', 'in', `(${currentIds.map(id => `'${id}'`).join(',')})`);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error updating SFTP polling configs:', error);
      throw error;
    }
  };

  // Wrapper functions that call services and update local state
  const handleUpdateExtractionTypes = async (types: ExtractionType[]): Promise<void> => {
    console.log('=== useSupabaseData handleUpdateExtractionTypes START ===');
    console.log('Hook received types count:', types.length);
    console.log('Hook input types:', types.map(t => ({ id: t.id, name: t.name, isTemp: t.id.startsWith('temp-') })));
    
    console.log('Calling service updateExtractionTypes...');
    await updateExtractionTypes(types);
    console.log('Service updateExtractionTypes completed, fetching updated types...');
    
    const updatedTypes = await fetchExtractionTypes();
    console.log('Fetched updated types count:', updatedTypes.length);
    console.log('Updated types from database:', updatedTypes.map(t => ({ id: t.id, name: t.name })));
    
    setExtractionTypes(updatedTypes);
    console.log('Local state updated with fetched types');
    console.log('=== useSupabaseData handleUpdateExtractionTypes COMPLETE ===');
  };

  const handleDeleteExtractionType = async (id: string): Promise<void> => {
    await deleteExtractionType(id);
    const updatedTypes = await fetchExtractionTypes();
    setExtractionTypes(updatedTypes);
  };

  const handleUpdateTransformationTypes = async (types: TransformationType[]): Promise<void> => {
    console.log('=== useSupabaseData handleUpdateTransformationTypes START ===');
    console.log('Hook received types count:', types.length);
    console.log('Hook input types:', types.map(t => ({ id: t.id, name: t.name, isTemp: t.id.startsWith('temp-') })));
    
    await updateTransformationTypes(types);
    console.log('Service updateTransformationTypes completed, fetching updated types...');
    
    const updatedTypes = await fetchTransformationTypes();
    console.log('Fetched updated types count:', updatedTypes.length);
    console.log('Updated types from database:', updatedTypes.map(t => ({ id: t.id, name: t.name })));
    
    setTransformationTypes(updatedTypes);
    console.log('Local state updated with fetched types');
    
    console.log('=== useSupabaseData handleUpdateTransformationTypes COMPLETE ===');
  };

  const handleDeleteTransformationType = async (id: string): Promise<void> => {
    await deleteTransformationType(id);
    const updatedTypes = await fetchTransformationTypes();
    setTransformationTypes(updatedTypes);
  };

  const handleUpdateSftpConfig = async (config: SftpConfig): Promise<void> => {
    await updateSftpConfig(config);
    const updatedConfig = await fetchSftpConfig();
    setSftpConfig(updatedConfig);
  };

  const handleUpdateSettingsConfig = async (config: SettingsConfig): Promise<void> => {
    await updateSettingsConfig(config);
    const updatedConfig = await fetchSettingsConfig();
    setSettingsConfig(updatedConfig);
  };

  const handleUpdateApiConfig = async (config: ApiConfig): Promise<void> => {
    await updateApiConfig(config);
    const updatedConfig = await fetchApiConfig();
    setApiConfig(updatedConfig);
  };

  const handleUpdateEmailConfig = async (config: EmailMonitoringConfig): Promise<void> => {
    await updateEmailConfig(config);
    const updatedConfig = await fetchEmailConfig();
    setEmailConfig(updatedConfig);
  };

  const handleUpdateEmailRules = async (rules: EmailProcessingRule[]): Promise<void> => {
    await updateEmailRules(rules);
    const updatedRules = await fetchEmailRules();
    setEmailRules(updatedRules);
  };

  const handleUpdateWorkflows = async (workflows: ExtractionWorkflow[]): Promise<void> => {
    await updateWorkflows(workflows);
    const updatedWorkflows = await fetchWorkflows();
    setWorkflows(updatedWorkflows);
  };

  const handleUpdateWorkflowSteps = async (workflowId: string, steps: WorkflowStep[]): Promise<void> => {
    await updateWorkflowSteps(workflowId, steps);
    const updatedSteps = await fetchWorkflowSteps();
    setWorkflowSteps(updatedSteps);
  };

  const handleUpdateCompanyBranding = async (branding: CompanyBranding): Promise<void> => {
    await updateCompanyBranding(branding);
    const updatedBranding = await fetchCompanyBranding();
    setCompanyBranding(updatedBranding);
  };

  const refreshCompanyBranding = async (): Promise<void> => {
    try {
      const updatedBranding = await fetchCompanyBranding();
      setCompanyBranding(updatedBranding);
    } catch (error) {
      console.error('Error refreshing company branding:', error);
      throw error;
    }
  };

  const refreshLogs = async (): Promise<void> => {
    try {
      const updatedLogs = await fetchExtractionLogs();
      setExtractionLogs(updatedLogs);
    } catch (error) {
      console.error('Error refreshing logs:', error);
      throw error;
    }
  };

  const handleRefreshLogsWithFilters = async (filters: any): Promise<ExtractionLog[]> => {
    const logs = await refreshLogsWithFilters(filters);
    setExtractionLogs(logs);
    return logs;
  };

  const refreshPollingLogs = async (): Promise<EmailPollingLog[]> => {
    try {
      const updatedLogs = await fetchEmailPollingLogs();
      setEmailPollingLogs(updatedLogs);
      return updatedLogs;
    } catch (error) {
      console.error('Error refreshing polling logs:', error);
      throw error;
    }
  };

  const handleStopRunningPollingLogs = async (): Promise<void> => {
    await stopRunningPollingLogs();
    await refreshPollingLogs();
  };

  const refreshWorkflowExecutionLogs = async (): Promise<WorkflowExecutionLog[]> => {
    try {
      const updatedLogs = await fetchWorkflowExecutionLogs();
      setWorkflowExecutionLogs(updatedLogs);
      return updatedLogs;
    } catch (error) {
      console.error('Error refreshing workflow execution logs:', error);
      throw error;
    }
  };

  const refreshSftpPollingLogs = async (): Promise<SftpPollingLog[]> => {
    try {
      const updatedLogs = await fetchSftpPollingLogs();
      setSftpPollingLogs(updatedLogs);
      return updatedLogs;
    } catch (error) {
      console.error('Error refreshing SFTP polling logs:', error);
      throw error;
    }
  };

  const refreshProcessedEmails = async (startDate?: string, endDate?: string): Promise<ProcessedEmail[]> => {
    try {
      const updatedEmails = await fetchProcessedEmails(startDate, endDate);
      setProcessedEmails(updatedEmails);
      return updatedEmails;
    } catch (error) {
      console.error('Error refreshing processed emails:', error);
      throw error;
    }
  };

  const refreshWorkflowSteps = async (): Promise<void> => {
    try {
      const updatedSteps = await fetchWorkflowSteps();
      setWorkflowSteps(updatedSteps);
    } catch (error) {
      console.error('Error refreshing workflow steps:', error);
      throw error;
    }
  };

  return {
    extractionTypes,
    transformationTypes,
    sftpConfig,
    settingsConfig,
    apiConfig,
    emailConfig,
    emailRules,
    processedEmails,
    extractionLogs,
    users,
    workflows,
    workflowSteps,
    emailPollingLogs,
    workflowExecutionLogs,
    sftpPollingLogs,
    companyBranding,
    loading,
    refreshData: loadData,
    updateExtractionTypes: handleUpdateExtractionTypes,
    updateTransformationTypes: handleUpdateTransformationTypes,
    updateSftpConfig: handleUpdateSftpConfig,
    updateSettingsConfig: handleUpdateSettingsConfig,
    updateApiConfig: handleUpdateApiConfig,
    updateEmailConfig: handleUpdateEmailConfig,
    updateEmailRules: handleUpdateEmailRules,
    updateSftpPollingConfigs,
    updateWorkflows: handleUpdateWorkflows,
    updateWorkflowSteps: handleUpdateWorkflowSteps,
    updateCompanyBranding: handleUpdateCompanyBranding,
    deleteExtractionType: handleDeleteExtractionType,
    deleteTransformationType: handleDeleteTransformationType,
    refreshLogs,
    refreshLogsWithFilters: handleRefreshLogsWithFilters,
    refreshPollingLogs,
    stopRunningPollingLogs: handleStopRunningPollingLogs,
    refreshWorkflowExecutionLogs,
    refreshSftpPollingLogs,
    refreshProcessedEmails,
    refreshWorkflowSteps,
    refreshCompanyBranding,
    logExtraction
  };
}