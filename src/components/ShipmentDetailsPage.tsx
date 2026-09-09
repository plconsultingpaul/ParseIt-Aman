import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Route, Hash, Box, FileText, Clock, Loader2, Eye, Download, X, AlertCircle, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Mail, Plus, Users, Check, Thermometer, AlertTriangle } from 'lucide-react';
import * as UTIF from 'utif2';
import { PDFDocument } from 'pdf-lib';
import type { User, TraceNumbersSectionConfig, TrackTraceTemplateSection, TrackTraceDocumentConfig, FetchedDocument, TrackTraceTimelineStatus, TimelineSectionConfig, BarcodeDetailsSectionConfig, BarcodeDetailsFieldMapping, BarcodeDetailsImageConfig, RouteSummaryGroup, ShipmentSummaryConfig, ShipmentSummaryGroup } from '../types';
import { supabase, getAuthHeaders } from '../lib/supabase';

interface TraceNumberCard {
  headerLabel: string;
  headerValue: string;
  headerColor: string;
  detailLabel: string;
  detailValue: string;
}

interface ShipmentDetailsPageProps {
  currentUser: User | null;
}

export default function ShipmentDetailsPage({ currentUser }: ShipmentDetailsPageProps) {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('templateId');
  const navigate = useNavigate();
  const location = useLocation();

  const initialShipmentData = (location.state as { shipmentData?: Record<string, any> })?.shipmentData || {};

  const [traceNumbers, setTraceNumbers] = useState<TraceNumberCard[]>([]);
  const [traceNumbersLoading, setTraceNumbersLoading] = useState(false);
  const [traceNumbersSection, setTraceNumbersSection] = useState<TrackTraceTemplateSection | null>(null);
  const [enabledSections, setEnabledSections] = useState<TrackTraceTemplateSection[]>([]);

  const [documents, setDocuments] = useState<FetchedDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [shipmentData, setShipmentData] = useState<Record<string, any>>(initialShipmentData);

  const [timelineStatuses, setTimelineStatuses] = useState<TrackTraceTimelineStatus[]>([]);
  const [timelineSection, setTimelineSection] = useState<TrackTraceTemplateSection | null>(null);

  const [barcodeDetails, setBarcodeDetails] = useState<Record<string, any>[]>([]);
  const [barcodeDetailsLoading, setBarcodeDetailsLoading] = useState(false);
  const [barcodeConfig, setBarcodeConfig] = useState<{
    fieldMappings: BarcodeDetailsFieldMapping[];
    imageConfig?: BarcodeDetailsImageConfig;
  } | null>(null);

  const [routeSummaryGroups, setRouteSummaryGroups] = useState<RouteSummaryGroup[]>([]);
  const [routeSummaryLoading, setRouteSummaryLoading] = useState(false);
  const [routeSummaryGroupData, setRouteSummaryGroupData] = useState<Record<string, Record<string, any>>>({});

  const [shipmentSummaryConfig, setShipmentSummaryConfig] = useState<ShipmentSummaryConfig | null>(null);
  const [shipmentSummaryGroups, setShipmentSummaryGroups] = useState<ShipmentSummaryGroup[]>([]);

  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean;
    loading: boolean;
    document: FetchedDocument | null;
    blobUrl: string | null;
    contentType: string | null;
    error: string | null;
    tiffDecoded: boolean;
    isFullscreen: boolean;
    zoom: number;
    canvasWidth: number;
    canvasHeight: number;
  }>({
    isOpen: false,
    loading: false,
    document: null,
    blobUrl: null,
    contentType: null,
    error: null,
    tiffDecoded: false,
    isFullscreen: true,
    zoom: 100,
    canvasWidth: 0,
    canvasHeight: 0
  });

  const tiffCanvasRef = useRef<HTMLCanvasElement>(null);

  const [emailModal, setEmailModal] = useState<{
    isOpen: boolean;
    document: FetchedDocument | null;
    recipients: string[];
    sending: boolean;
    error: string | null;
    success: boolean;
  }>({
    isOpen: false,
    document: null,
    recipients: [],
    sending: false,
    error: null,
    success: false
  });

  const [companyUsers, setCompanyUsers] = useState<{ id: string; email: string; name: string }[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);

  const toggleFullscreen = () => {
    setViewerModal(prev => ({ ...prev, isFullscreen: !prev.isFullscreen }));
  };

  const handleZoomIn = () => {
    setViewerModal(prev => ({ ...prev, zoom: Math.min(prev.zoom + 25, 300) }));
  };

  const handleZoomOut = () => {
    setViewerModal(prev => ({ ...prev, zoom: Math.max(prev.zoom - 25, 25) }));
  };

  const handleZoomReset = () => {
    setViewerModal(prev => ({ ...prev, zoom: 100 }));
  };

  const handleBack = () => {
    if (currentUser?.role === 'client') {
      navigate('/client/track-trace');
    } else {
      navigate('/track-trace');
    }
  };

  const loadCompanyUsers = async () => {
    if (!currentUser?.clientId) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('client_id', currentUser.clientId)
        .neq('id', currentUser.id)
        .order('name');

      if (error) throw error;
      setCompanyUsers(data || []);
    } catch (err) {
      console.error('Failed to load company users:', err);
    }
  };

  const handleOpenEmailModal = (doc: FetchedDocument) => {
    const userEmail = currentUser?.email || '';
    setEmailModal({
      isOpen: true,
      document: doc,
      recipients: userEmail ? [userEmail] : [''],
      sending: false,
      error: null,
      success: false
    });
    loadCompanyUsers();
  };

  const handleCloseEmailModal = () => {
    setEmailModal({
      isOpen: false,
      document: null,
      recipients: [],
      sending: false,
      error: null,
      success: false
    });
    setShowUserPicker(false);
  };

  const handleAddRecipient = () => {
    setEmailModal(prev => ({
      ...prev,
      recipients: [...prev.recipients, '']
    }));
  };

  const handleRemoveRecipient = (index: number) => {
    setEmailModal(prev => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== index)
    }));
  };

  const handleRecipientChange = (index: number, value: string) => {
    setEmailModal(prev => ({
      ...prev,
      recipients: prev.recipients.map((r, i) => i === index ? value : r)
    }));
  };

  const handleAddCompanyUser = (email: string) => {
    if (!emailModal.recipients.includes(email)) {
      setEmailModal(prev => ({
        ...prev,
        recipients: [...prev.recipients.filter(r => r !== ''), email]
      }));
    }
    setShowUserPicker(false);
  };

  const handleSendEmail = async () => {
    if (!emailModal.document) return;

    const validRecipients = emailModal.recipients.filter(r => r && r.includes('@'));
    if (validRecipients.length === 0) {
      setEmailModal(prev => ({ ...prev, error: 'Please add at least one valid email address' }));
      return;
    }

    setEmailModal(prev => ({ ...prev, sending: true, error: null }));

    const maxRetries = 3;
    const retryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 5000);

    const attemptSendEmail = async (attempt: number): Promise<void> => {
      const { data: result, error } = await supabase.functions.invoke('send-document-email', {
        body: {
          documentConfigId: emailModal.document!.configId,
          documentId: emailModal.document!.id,
          documentName: emailModal.document!.name,
          recipients: validRecipients,
        },
      });

      if (error || !result?.success) {
        const errorMsg = result?.message || error?.message || 'Failed to send email';
        const isRetryable = errorMsg.includes('compute resources') || errorMsg.includes('500');

        if (attempt < maxRetries - 1 && isRetryable) {
          console.log(`Email send attempt ${attempt + 1} failed, retrying in ${retryDelay(attempt)}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay(attempt)));
          return attemptSendEmail(attempt + 1);
        }
        throw new Error(errorMsg);
      }
    };

    try {
      await attemptSendEmail(0);
      setEmailModal(prev => ({ ...prev, sending: false, success: true }));
      setTimeout(() => {
        handleCloseEmailModal();
      }, 2000);
    } catch (err: any) {
      setEmailModal(prev => ({ ...prev, sending: false, error: err.message || 'Failed to send email' }));
    }
  };

  useEffect(() => {
    if (templateId && orderId) {
      loadTemplateSections();
    }
  }, [templateId, orderId]);

  const loadTemplateSections = async () => {
    if (!templateId) {
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();

    try {
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('track_trace_template_sections')
        .select('*')
        .eq('template_id', templateId)
        .eq('is_enabled', true)
        .order('display_order');

      if (sectionsError) throw sectionsError;

      const mappedSections: TrackTraceTemplateSection[] = (sectionsData || []).map((s: any) => ({
        id: s.id,
        templateId: s.template_id,
        sectionType: s.section_type,
        displayOrder: s.display_order,
        isEnabled: s.is_enabled,
        config: s.config || {},
        createdAt: s.created_at,
        updatedAt: s.updated_at
      }));

      setEnabledSections(mappedSections);

      const traceNumbersSection = mappedSections.find(s => s.sectionType === 'trace_numbers');
      if (traceNumbersSection) {
        setTraceNumbersSection(traceNumbersSection);
        const config = traceNumbersSection.config as TraceNumbersSectionConfig;
        if (config.apiSpecEndpointId && config.fieldMappings && config.fieldMappings.length > 0) {
          await fetchTraceNumbers(config);
        }
      }

      const timelineSectionData = mappedSections.find(s => s.sectionType === 'shipment_timeline');
      if (timelineSectionData) {
        setTimelineSection(timelineSectionData);
        await loadTimelineStatuses(templateId);
      }

      const barcodeDetailsSection = mappedSections.find(s => s.sectionType === 'barcode_details');
      if (barcodeDetailsSection) {
        await loadBarcodeConfig(templateId);
      }

      const routeSummarySection = mappedSections.find(s => s.sectionType === 'route_summary');
      if (routeSummarySection) {
        await loadRouteSummaryGroups(templateId);
        await fetchFullShipmentData();
      }

      const shipmentSummarySection = mappedSections.find(s => s.sectionType === 'shipment_summary');
      if (shipmentSummarySection) {
        await loadShipmentSummaryConfig(templateId);
      }
    } catch (err) {
    }
  };

  const loadTimelineStatuses = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('track_trace_timeline_statuses')
        .select(`
          *,
          childStatuses:track_trace_timeline_child_statuses(*)
        `)
        .eq('template_id', templateId)
        .order('display_order');

      if (error) throw error;

      const mappedStatuses: TrackTraceTimelineStatus[] = (data || []).map((s: any) => ({
        id: s.id,
        templateId: s.template_id,
        name: s.name,
        displayOrder: s.display_order,
        locationField: s.location_field,
        dateField: s.date_field,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        childStatuses: (s.childStatuses || []).map((c: any) => ({
          id: c.id,
          timelineStatusId: c.timeline_status_id,
          statusValue: c.status_value,
          displayOrder: c.display_order,
          createdAt: c.created_at
        })).sort((a: any, b: any) => a.displayOrder - b.displayOrder)
      }));

      setTimelineStatuses(mappedStatuses);
    } catch (err) {
    }
  };

  const loadBarcodeConfig = async (templateId: string) => {
    try {
      const { data: configData, error: configError } = await supabase
        .from('track_trace_barcode_configs')
        .select(`
          *,
          fields:track_trace_barcode_fields(*),
          imageConfig:track_trace_barcode_image_configs(*)
        `)
        .eq('template_id', templateId)
        .maybeSingle();

      if (configError) throw configError;

      if (configData) {
        const mappedConfig = {
          fieldMappings: (configData.fields || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((f: any) => ({
              id: f.id,
              label: f.label,
              apiField: f.api_field,
              showTotal: f.show_total,
              isRequired: f.is_required || false,
              displayOrder: f.display_order,
              groupId: f.group_id || undefined,
              groupSeparator: f.group_separator || undefined,
              valueSuffix: f.value_suffix || undefined
            })),
          imageConfig: configData.imageConfig?.[0] ? {
            id: configData.imageConfig[0].id,
            apiUrl: configData.imageConfig[0].api_url,
            authConfigId: configData.imageConfig[0].auth_config_id,
            sourceField: configData.imageConfig[0].source_field
          } : undefined
        };

        setBarcodeConfig(mappedConfig);

        if (configData.api_spec_endpoint_id && mappedConfig.fieldMappings.length > 0) {
          await fetchBarcodeDetails(configData);
        }
      }
    } catch (err) {
    }
  };

  const fetchBarcodeDetails = async (config: any) => {
    if (!orderId) {
      return;
    }

    setBarcodeDetailsLoading(true);
    try {
      const { data: endpointData, error: endpointError } = await supabase
        .from('api_spec_endpoints')
        .select('path, api_spec_id')
        .eq('id', config.api_spec_endpoint_id)
        .maybeSingle();

      if (endpointError || !endpointData) {
        return;
      }

      let apiPath = endpointData.path || '';

      apiPath = apiPath.replace(/{[^}]+}/g, (match: string) => {
        const varName = match.slice(1, -1);
        if (varName.toLowerCase() === 'orderid' || varName.toLowerCase() === 'id') {
          return orderId;
        }
        return shipmentData[varName] || match;
      });

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      let queryString = '';
      if (config.nested_array_path) {
        queryString = `expand=${config.nested_array_path}`;
      }

      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          apiSourceType: config.api_source_type || 'main',
          secondaryApiId: config.secondary_api_id || '',
          apiPath,
          httpMethod: 'GET',
          queryString
        })
      });

      if (!proxyResponse.ok) {
        throw new Error(`Proxy returned ${proxyResponse.status}`);
      }

      let responseData = await proxyResponse.json();

      if (config.response_array_path) {
        const pathParts = config.response_array_path.split('.');
        for (const part of pathParts) {
          responseData = responseData?.[part];
        }
      }

      let api1Items = Array.isArray(responseData) ? responseData : [];

      if (config.nested_array_path && api1Items.length > 0) {
        const flattenedItems: any[] = [];
        for (const parentItem of api1Items) {
          const nestedArray = parentItem[config.nested_array_path];

          if (Array.isArray(nestedArray) && nestedArray.length > 0) {
            for (const childItem of nestedArray) {
              const { [config.nested_array_path]: _, ...parentFields } = parentItem;
              const prefixedChild: Record<string, any> = {};
              for (const [key, value] of Object.entries(childItem)) {
                prefixedChild[`${config.nested_array_path}.${key}`] = value;
              }
              const flattenedItem = { ...parentFields, ...prefixedChild };
              flattenedItems.push(flattenedItem);
            }
          } else {
            const { [config.nested_array_path]: _, ...parentFields } = parentItem;
            flattenedItems.push(parentFields);
          }
        }
        api1Items = flattenedItems;
      }

      if (config.secondary_endpoint_id && config.secondary_param_field && api1Items.length > 0) {
        const { data: secondaryEndpointData } = await supabase
          .from('api_spec_endpoints')
          .select('path')
          .eq('id', config.secondary_endpoint_id)
          .maybeSingle();

        if (secondaryEndpointData) {
          const allSecondaryItems: any[] = [];

          for (const item of api1Items) {
            const paramValue = item[config.secondary_param_field];
            if (!paramValue) {
              continue;
            }

            let secondaryPath = secondaryEndpointData.path || '';
            secondaryPath = secondaryPath.replace(/{[^}]+}/g, (match: string) => {
              const varName = match.slice(1, -1);
              if (varName.toLowerCase() === 'orderid' || varName.toLowerCase() === 'id') {
                return orderId;
              }
              if (varName.toLowerCase() === config.secondary_param_field.toLowerCase()) {
                return paramValue;
              }
              return item[varName] || shipmentData[varName] || match;
            });

            try {
              const secondaryProxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                  apiSourceType: config.api_source_type || 'main',
                  secondaryApiId: config.secondary_api_id || '',
                  apiPath: secondaryPath,
                  httpMethod: 'GET',
                  queryString: ''
                })
              });

              if (secondaryProxyResponse.ok) {
                const secondaryData = await secondaryProxyResponse.json();
                const secondaryItems = Array.isArray(secondaryData) ? secondaryData : [secondaryData];
                allSecondaryItems.push(...secondaryItems);
              }
            } catch (err) {
            }
          }

          setBarcodeDetails(allSecondaryItems);
        } else {
          setBarcodeDetails(api1Items);
        }
      } else {
        setBarcodeDetails(api1Items);
      }
    } catch (err) {
      setBarcodeDetails([]);
    } finally {
      setBarcodeDetailsLoading(false);
    }
  };

  const loadRouteSummaryGroups = async (templateId: string) => {
    setRouteSummaryLoading(true);
    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from('track_trace_route_summary_groups')
        .select('*')
        .eq('template_id', templateId)
        .order('row_index')
        .order('display_order');

      if (groupsError) throw groupsError;

      const groupsWithFields: RouteSummaryGroup[] = [];
      for (const g of groupsData || []) {
        const { data: fieldsData, error: fieldsError } = await supabase
          .from('track_trace_route_summary_fields')
          .select('*')
          .eq('group_id', g.id)
          .order('display_order');

        if (fieldsError) throw fieldsError;

        groupsWithFields.push({
          id: g.id,
          templateId: g.template_id,
          name: g.name,
          rowIndex: g.row_index,
          displayOrder: g.display_order,
          apiSpecEndpointId: g.api_spec_endpoint_id || undefined,
          apiSourceType: g.api_source_type || 'main',
          secondaryApiId: g.secondary_api_id || undefined,
          authConfigId: g.auth_config_id || undefined,
          fields: (fieldsData || []).map((f: any) => ({
            id: f.id,
            groupId: f.group_id,
            label: f.label,
            apiField: f.api_field,
            displayOrder: f.display_order,
            gridColumn: f.grid_column || 1,
            displayFormat: f.display_format || undefined
          }))
        });
      }

      setRouteSummaryGroups(groupsWithFields);

      await fetchRouteSummaryGroupData(groupsWithFields);
    } catch (err) {
    } finally {
      setRouteSummaryLoading(false);
    }
  };

  const loadShipmentSummaryConfig = async (templateId: string) => {
    try {
      const { data: configData, error: configError } = await supabase
        .from('track_trace_shipment_summary_config')
        .select('*')
        .eq('template_id', templateId)
        .maybeSingle();

      if (configError) throw configError;

      if (configData) {
        setShipmentSummaryConfig({
          id: configData.id,
          templateId: configData.template_id,
          headerFieldName: configData.header_field_name || 'billNumber',
          showTimelineStatus: configData.show_timeline_status ?? true,
          tempControlledField: configData.temp_controlled_field || 'temperatureControlled',
          tempControlledLabel: configData.temp_controlled_label || 'Temp Controlled',
          hazardousField: configData.hazardous_field || 'isDangerousGoods',
          hazardousLabel: configData.hazardous_label || 'Hazardous'
        });
      }

      const { data: groupsData, error: groupsError } = await supabase
        .from('track_trace_shipment_summary_groups')
        .select('*')
        .eq('template_id', templateId)
        .order('display_order');

      if (groupsError) throw groupsError;

      const groupsWithFields: ShipmentSummaryGroup[] = [];
      for (const g of groupsData || []) {
        const { data: fieldsData, error: fieldsError } = await supabase
          .from('track_trace_shipment_summary_fields')
          .select('*')
          .eq('group_id', g.id)
          .order('display_order');

        if (fieldsError) throw fieldsError;

        groupsWithFields.push({
          id: g.id,
          templateId: g.template_id,
          name: g.name,
          displayOrder: g.display_order,
          fields: (fieldsData || []).map((f: any) => ({
            id: f.id,
            groupId: f.group_id,
            label: f.label,
            apiField: f.api_field,
            displayOrder: f.display_order
          }))
        });
      }

      setShipmentSummaryGroups(groupsWithFields);
    } catch (err) {
    }
  };

  const fetchFullShipmentData = async () => {
    if (!orderId) {
      return;
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          apiSourceType: 'main',
          apiPath: `orders/${orderId}`,
          httpMethod: 'GET',
          queryString: '$expand=shipper,consignee,pods'
        })
      });

      if (!proxyResponse.ok) {
        return;
      }

      const fullData = await proxyResponse.json();

      if (fullData && typeof fullData === 'object') {
        setShipmentData(prev => ({ ...prev, ...fullData }));
      }
    } catch (err) {
    }
  };

  const fetchRouteSummaryGroupData = async (groups: RouteSummaryGroup[]) => {
    if (!orderId) return;

    const groupsWithEndpoints = groups.filter(g => g.apiSpecEndpointId);
    if (groupsWithEndpoints.length === 0) {
      console.log('[RouteSummary] No groups with custom API endpoints');
      return;
    }

    console.log('[RouteSummary] Fetching data for groups with custom endpoints:', groupsWithEndpoints.length);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authHeaders = await getAuthHeaders();

    const groupDataMap: Record<string, Record<string, any>> = {};

    for (const group of groupsWithEndpoints) {
      if (!group.id || !group.apiSpecEndpointId) continue;

      try {
        const { data: endpointData, error: endpointError } = await supabase
          .from('api_spec_endpoints')
          .select('path')
          .eq('id', group.apiSpecEndpointId)
          .maybeSingle();

        if (endpointError || !endpointData) {
          console.error('[RouteSummary] Failed to load endpoint for group:', group.name, endpointError);
          continue;
        }

        let apiPath = endpointData.path || '';
        apiPath = apiPath.replace(/{[^}]+}/g, (match: string) => {
          const varName = match.slice(1, -1);
          if (varName.toLowerCase() === 'orderid' || varName.toLowerCase() === 'id') {
            return orderId;
          }
          return shipmentData[varName] || match;
        });

        console.log('[RouteSummary] Fetching data for group:', group.name, 'from path:', apiPath);

        const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            apiSourceType: group.apiSourceType || 'main',
            secondaryApiId: group.secondaryApiId || '',
            apiPath,
            httpMethod: 'GET',
            authConfigId: group.authConfigId || ''
          })
        });

        if (!proxyResponse.ok) {
          const errorText = await proxyResponse.text();
          console.error('[RouteSummary] Failed to fetch data for group:', group.name, proxyResponse.status, errorText);
          continue;
        }

        const data = await proxyResponse.json();
        console.log('[RouteSummary] Data received for group:', group.name, data);

        if (data && typeof data === 'object') {
          if (Array.isArray(data)) {
            groupDataMap[group.id] = data[0] || {};
          } else {
            groupDataMap[group.id] = data;
          }
        }
      } catch (err) {
        console.error('[RouteSummary] Error fetching data for group:', group.name, err);
      }
    }

    console.log('[RouteSummary] Group data map:', groupDataMap);
    setRouteSummaryGroupData(groupDataMap);
  };

  const fetchTraceNumbers = async (config: TraceNumbersSectionConfig) => {
    if (!orderId) {
      return;
    }

    try {
      setTraceNumbersLoading(true);

      const { data: endpointData, error: endpointError } = await supabase
        .from('api_spec_endpoints')
        .select('path, api_spec_id')
        .eq('id', config.apiSpecEndpointId)
        .maybeSingle();

      if (endpointError || !endpointData) {
        console.error('Failed to load endpoint:', endpointError);
        return;
      }

      let apiPath = endpointData.path;
      apiPath = apiPath.replace(/{[^}]+}/g, orderId);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          apiSourceType: config.apiSourceType || 'main',
          secondaryApiId: config.secondaryApiId || '',
          apiPath,
          httpMethod: 'GET',
          queryString: ''
        })
      });

      if (!proxyResponse.ok) {
        return;
      }

      const data = await proxyResponse.json();

      const traceNumbersArray = data.traceNumbers || [];

      const fieldMappings = config.fieldMappings || [];
      const headerMapping = fieldMappings.find(m => m.displayType === 'header');
      const detailMapping = fieldMappings.find(m => m.displayType === 'detail' || !m.displayType);

      const mappedTraceNumbers: TraceNumberCard[] = [];
      const hasHeaderValueMappings = headerMapping && headerMapping.valueMappings && headerMapping.valueMappings.length > 0;

      for (const traceItem of traceNumbersArray) {
        const rawHeaderValue = headerMapping ? (traceItem?.[headerMapping.valueField] || '') : '';
        let headerValue = rawHeaderValue;
        let headerColor = 'gray';
        let headerLabel = headerMapping?.label || '';
        let headerMappingFound = false;

        if (headerMapping && rawHeaderValue && headerMapping.valueMappings?.length > 0) {
          const matchedMapping = headerMapping.valueMappings.find(
            vm => vm.sourceValue === rawHeaderValue || vm.sourceValue === String(rawHeaderValue)
          );
          if (matchedMapping) {
            headerValue = matchedMapping.displayValue;
            headerColor = matchedMapping.color || 'gray';
            headerMappingFound = true;
          }
        }

        if (hasHeaderValueMappings && !headerMappingFound) {
          continue;
        }

        const detailValue = detailMapping ? (traceItem?.[detailMapping.valueField] || '') : '';
        const detailLabel = detailMapping?.label || '';

        if (headerValue || detailValue) {
          mappedTraceNumbers.push({
            headerLabel,
            headerValue,
            headerColor,
            detailLabel,
            detailValue
          });
        }
      }

      setTraceNumbers(mappedTraceNumbers);
    } catch (err) {
      console.error('Failed to fetch trace numbers:', err);
    } finally {
      setTraceNumbersLoading(false);
    }
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-700 border-blue-200',
      purple: 'bg-purple-100 text-purple-700 border-purple-200',
      red: 'bg-red-100 text-red-700 border-red-200',
      green: 'bg-green-100 text-green-700 border-green-200',
      yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      orange: 'bg-orange-100 text-orange-700 border-orange-200',
      teal: 'bg-teal-100 text-teal-700 border-teal-200',
      gray: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colorMap[color] || colorMap.gray;
  };

  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    initialDelay: number = 500
  ): Promise<Response> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.ok || response.status < 500) {
          return response;
        }
        console.log(`[fetchWithRetry] Attempt ${attempt + 1} failed with status ${response.status}, retrying...`);
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        console.log(`[fetchWithRetry] Attempt ${attempt + 1} failed with error:`, err);
        lastError = err as Error;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`[fetchWithRetry] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Max retries exceeded');
  };

  const loadDocuments = async () => {
    console.log('[loadDocuments] Called with:', { templateId, orderId, shipmentData });

    if (!templateId || !orderId) {
      console.log('[loadDocuments] Missing templateId or orderId, returning early');
      return;
    }

    try {
      setDocumentsLoading(true);

      const { data: configsData, error: configsError } = await supabase
        .from('track_trace_document_configs')
        .select(`
          *,
          filters:track_trace_document_filters(*)
        `)
        .eq('template_id', templateId)
        .eq('is_enabled', true)
        .order('sort_order');

      console.log('[loadDocuments] Document configs query result:', { configsData, configsError });

      if (configsError) throw configsError;

      if (!configsData || configsData.length === 0) {
        console.log('[loadDocuments] No document configs found for this template');
        setDocuments([]);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const allDocuments: FetchedDocument[] = [];

      for (const config of configsData) {
        console.log('[loadDocuments] Processing config:', config.name, config);

        if (config.vendor_type === 'parseit') {
          try {
            const searchField = config.parseit_search_field || 'bill_number';
            const searchValue = searchField === 'bill_number'
              ? (shipmentData?.billNumber || shipmentData?.bill_number || orderId)
              : (shipmentData?.detailLineId || shipmentData?.detail_line_id || orderId);

            console.log('[loadDocuments] Parse-It query:', { bucket: config.parseit_bucket_id, field: searchField, value: searchValue });

            const { data: imagingDocs, error: imgError } = await supabase
              .from('imaging_documents')
              .select('id, original_filename, file_size, storage_path, bucket:imaging_buckets(url, supabase_storage_slug)')
              .eq('bucket_id', config.parseit_bucket_id)
              .ilike(searchField, searchValue)
              .limit(50);

            if (imgError) {
              console.error('[loadDocuments] Parse-It query error:', imgError);
              continue;
            }

            for (const doc of (imagingDocs || [])) {
              const bucket = doc.bucket as any;
              let docUrl = doc.storage_path || '';
              if (!docUrl.startsWith('http') && bucket?.url) {
                docUrl = `${bucket.url.replace(/\/$/, '')}/${doc.storage_path}`;
              }

              const ext = doc.original_filename?.split('.').pop() || '';

              allDocuments.push({
                id: doc.id,
                name: config.name,
                type: ext,
                size: formatFileSize(doc.file_size || 0),
                configId: config.id,
                getDocumentUrl: docUrl,
                authConfigId: undefined,
                emailEnabled: config.email_enabled || false,
                emailSubject: config.email_subject,
                emailTemplate: config.email_template
              });
            }
          } catch (err) {
            console.error('[loadDocuments] Parse-It fetch error:', err);
          }
          continue;
        }

        const filters = (config.filters || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
        console.log('[loadDocuments] Filters for config:', filters);

        const filterParts: string[] = [];
        for (const filter of filters) {
          let value = '';
          if (filter.value_type === 'variable') {
            const variableValue = shipmentData[filter.variable_name];
            console.log('[loadDocuments] Variable filter:', {
              variable_name: filter.variable_name,
              shipmentDataKeys: Object.keys(shipmentData),
              shipmentDataValue: variableValue,
              fallbackOrderId: orderId
            });
            value = variableValue || orderId;
          } else {
            value = filter.static_value || '';
          }

          console.log('[loadDocuments] Filter resolved:', {
            field_name: filter.field_name,
            value_type: filter.value_type,
            resolved_value: value
          });

          if (value) {
            filterParts.push(`${filter.field_name} eq '${value}'`);
          }
        }

        let searchUrl = config.search_api_url;
        if (filterParts.length > 0) {
          const filterQuery = filterParts.join(' and ');
          searchUrl += `?$filter=${encodeURIComponent(filterQuery)}`;
        }

        console.log('[loadDocuments] Final search URL:', searchUrl);

        try {
          const proxyResponse = await fetchWithRetry(
            `${supabaseUrl}/functions/v1/track-trace-proxy`,
            {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                apiSourceType: 'main',
                fullUrl: searchUrl,
                httpMethod: 'GET',
                authConfigId: config.auth_config_id || null
              })
            },
            3,
            500
          );

          console.log('[loadDocuments] Proxy response status:', proxyResponse.status);

          if (proxyResponse.ok) {
            const data = await proxyResponse.json();
            console.log('[loadDocuments] Proxy response data:', data);

            let items: any[] = [];
            if (data.value) {
              items = data.value;
            } else if (data.items) {
              items = data.items;
            } else if (data.results) {
              items = data.results;
            } else if (Array.isArray(data)) {
              items = data;
            } else if (typeof data === 'object' && data !== null) {
              const numericKeys = Object.keys(data).filter(key => !isNaN(Number(key)));
              if (numericKeys.length > 0) {
                items = numericKeys.map(key => data[key]);
                console.log('[loadDocuments] Extracted from numeric keys:', numericKeys);
              }
            }
            console.log('[loadDocuments] Extracted items:', items.length, 'documents', items);

            for (const item of items) {
              const docId = item[config.doc_id_field] || '';
              const docType = item[config.doc_type_field] || '';
              const docSize = item[config.doc_size_field] || '';

              console.log('[loadDocuments] Processing item:', {
                docId,
                docType,
                docIdField: config.doc_id_field,
                rawItem: item
              });

              if (docId) {
                const originalTemplate = config.get_document_api_url;
                const docIdPattern = new RegExp(`\\{\\{${config.doc_id_field}\\}\\}`, 'g');
                let getUrl = originalTemplate.replace(docIdPattern, docId);

                console.log('[loadDocuments] Building getDocumentUrl:', {
                  originalTemplate,
                  docId,
                  afterDocIdReplace: getUrl,
                  hasRemainingVariables: getUrl.includes('{'),
                  remainingVariables: getUrl.match(/{[^}]+}/g)
                });

                allDocuments.push({
                  id: docId,
                  name: config.name,
                  type: docType,
                  size: formatFileSize(docSize),
                  configId: config.id,
                  getDocumentUrl: getUrl,
                  authConfigId: config.auth_config_id || undefined,
                  emailEnabled: config.email_enabled || false,
                  emailSubject: config.email_subject,
                  emailTemplate: config.email_template
                });
              }
            }
          } else {
            const errorText = await proxyResponse.text();
            console.error('[loadDocuments] Proxy request failed:', proxyResponse.status, errorText);
          }
        } catch (err) {
          console.error('Failed to fetch documents for config:', config.name, err);
        }
      }

      console.log('[loadDocuments] Total documents found:', allDocuments.length);
      setDocuments(allDocuments);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const formatFileSize = (size: string | number): string => {
    if (!size) return '';
    const bytes = typeof size === 'string' ? parseInt(size, 10) : size;
    if (isNaN(bytes)) return String(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileTypeFromName = (name: string, type: string): string => {
    if (type) return type.toUpperCase().replace('.', '');
    const ext = name.split('.').pop()?.toUpperCase() || '';
    return ext;
  };

  const closeViewerModal = () => {
    if (viewerModal.blobUrl) {
      URL.revokeObjectURL(viewerModal.blobUrl);
    }
    setViewerModal({
      isOpen: false,
      loading: false,
      document: null,
      blobUrl: null,
      contentType: null,
      error: null,
      tiffDecoded: false,
      isFullscreen: true,
      zoom: 100,
      canvasWidth: 0,
      canvasHeight: 0
    });
  };

  const decodeTiffToCanvas = async (blob: Blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const ifds = UTIF.decode(arrayBuffer);
      if (ifds.length === 0) {
        throw new Error('No pages found in TIFF file');
      }
      UTIF.decodeImage(arrayBuffer, ifds[0]);
      const rgba = UTIF.toRGBA8(ifds[0]);
      const width = ifds[0].width;
      const height = ifds[0].height;

      const canvas = tiffCanvasRef.current;
      if (!canvas) return;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imageData = ctx.createImageData(width, height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);

      const availableWidth = window.innerWidth - 80;
      const fitWidthZoom = Math.min(100, Math.floor((availableWidth / width) * 100));

      setViewerModal(prev => ({
        ...prev,
        tiffDecoded: true,
        zoom: fitWidthZoom,
        canvasWidth: width,
        canvasHeight: height
      }));
    } catch (err) {
      console.error('[decodeTiffToCanvas] Failed to decode TIFF:', err);
      setViewerModal(prev => ({
        ...prev,
        error: 'Failed to decode TIFF image'
      }));
    }
  };

  const isViewableContentType = (contentType: string | null): boolean => {
    if (!contentType) return false;
    const viewable = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/tiff'
    ];
    return viewable.some(type => contentType.toLowerCase().includes(type));
  };

  const isTiffContentType = (contentType: string | null): boolean => {
    if (!contentType) return false;
    return contentType.toLowerCase().includes('image/tiff');
  };

  const convertTiffToPdf = async (tiffBlob: Blob): Promise<Blob> => {
    const arrayBuffer = await tiffBlob.arrayBuffer();
    const ifds = UTIF.decode(arrayBuffer);
    if (ifds.length === 0) {
      throw new Error('No pages found in TIFF');
    }

    UTIF.decodeImage(arrayBuffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const width = ifds[0].width;
    const height = ifds[0].height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(new Uint8ClampedArray(rgba.buffer));
    ctx.putImageData(imageData, 0, 0);

    const pngDataUrl = canvas.toDataURL('image/png');
    const pngBase64 = pngDataUrl.split(',')[1];
    const pngBytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));

    const pdfDoc = await PDFDocument.create();
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  };

  const handleViewDocument = async (doc: FetchedDocument) => {
    console.log('[handleViewDocument] Called with doc:', {
      id: doc.id,
      name: doc.name,
      getDocumentUrl: doc.getDocumentUrl,
      authConfigId: doc.authConfigId,
      hasUnresolvedVariables: doc.getDocumentUrl?.includes('{')
    });

    setViewerModal({
      isOpen: true,
      loading: true,
      document: doc,
      blobUrl: null,
      contentType: null,
      error: null,
      tiffDecoded: false,
      isFullscreen: true,
      zoom: 100,
      canvasWidth: 0,
      canvasHeight: 0
    });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authHeaders = await getAuthHeaders();

    const requestBody = {
      apiSourceType: 'main',
      fullUrl: doc.getDocumentUrl,
      httpMethod: 'GET',
      responseType: 'blob',
      authConfigId: doc.authConfigId || null
    };
    console.log('[handleViewDocument] Sending to proxy:', JSON.stringify(requestBody, null, 2));

    try {
      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          apiSourceType: 'main',
          fullUrl: doc.getDocumentUrl,
          httpMethod: 'GET',
          responseType: 'blob',
          authConfigId: doc.authConfigId || null
        })
      });

      console.log('[handleViewDocument] Proxy response status:', proxyResponse.status, proxyResponse.statusText);

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text();
        console.error('[handleViewDocument] Proxy error response:', errorText);
        setViewerModal(prev => ({
          ...prev,
          loading: false,
          error: `Failed to load document: ${proxyResponse.statusText}`
        }));
        return;
      }

      const blob = await proxyResponse.blob();
      console.log('[handleViewDocument] Received blob:', blob.type, blob.size, 'bytes');
      const url = URL.createObjectURL(blob);

      const contentType = blob.type;
      setViewerModal(prev => ({
        ...prev,
        loading: false,
        blobUrl: url,
        contentType
      }));

      if (contentType.toLowerCase().includes('image/tiff')) {
        setTimeout(() => decodeTiffToCanvas(blob), 50);
      }
    } catch (err) {
      console.error('[handleViewDocument] Failed to view document:', err);
      setViewerModal(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load document. Please try again.'
      }));
    }
  };

  const handleDownloadDocument = async (doc: FetchedDocument) => {
    console.log('[handleDownloadDocument] Called with doc:', {
      id: doc.id,
      name: doc.name,
      getDocumentUrl: doc.getDocumentUrl,
      authConfigId: doc.authConfigId,
      hasUnresolvedVariables: doc.getDocumentUrl?.includes('{')
    });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authHeaders = await getAuthHeaders();

    const requestBody = {
      apiSourceType: 'main',
      fullUrl: doc.getDocumentUrl,
      httpMethod: 'GET',
      responseType: 'blob',
      authConfigId: doc.authConfigId || null
    };
    console.log('[handleDownloadDocument] Sending to proxy:', JSON.stringify(requestBody, null, 2));

    try {
      const proxyResponse = await fetch(`${supabaseUrl}/functions/v1/track-trace-proxy`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(requestBody)
      });

      console.log('[handleDownloadDocument] Proxy response status:', proxyResponse.status, proxyResponse.statusText);

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text();
        console.error('[handleDownloadDocument] Proxy error response:', errorText);
        return;
      }

      const blob = await proxyResponse.blob();
      console.log('[handleDownloadDocument] Received blob:', blob.type, blob.size, 'bytes');

      let downloadBlob = blob;
      let downloadName = doc.name;

      if (isTiffContentType(blob.type)) {
        console.log('[handleDownloadDocument] Converting TIFF to PDF...');
        try {
          downloadBlob = await convertTiffToPdf(blob);
          downloadName = doc.name.replace(/\.(tiff?|tif)$/i, '.pdf');
          if (!downloadName.toLowerCase().endsWith('.pdf')) {
            downloadName = downloadName + '.pdf';
          }
          console.log('[handleDownloadDocument] Converted to PDF:', downloadBlob.size, 'bytes');
        } catch (convErr) {
          console.error('[handleDownloadDocument] Failed to convert TIFF to PDF:', convErr);
        }
      }

      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[handleDownloadDocument] Failed to download document:', err);
    }
  };

  useEffect(() => {
    if (templateId && orderId) {
      loadDocuments();
    }
  }, [templateId, orderId, shipmentData]);

  const getStatusBadgeClasses = (value: string): string => {
    const lowerValue = value?.toLowerCase() || '';
    if (lowerValue.includes('pending') || lowerValue.includes('waiting') || lowerValue.includes('hold')) {
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
    }
    if (lowerValue.includes('transit') || lowerValue.includes('progress') || lowerValue.includes('shipping') || lowerValue.includes('shipped')) {
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
    }
    if (lowerValue.includes('delivered') || lowerValue.includes('complete') || lowerValue.includes('success')) {
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
    }
    if (lowerValue.includes('exception') || lowerValue.includes('error') || lowerValue.includes('failed') || lowerValue.includes('cancelled')) {
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
  };

  const renderSection = (section: TrackTraceTemplateSection) => {
    switch (section.sectionType) {
      case 'shipment_summary':
        const summaryHeaderField = shipmentSummaryConfig?.headerFieldName || 'billNumber';
        const summaryHeaderValue = shipmentData[summaryHeaderField] || orderId || 'Loading...';

        const tempControlledField = shipmentSummaryConfig?.tempControlledField || 'temperatureControlled';
        const isTempControlled = shipmentData[tempControlledField] === true || shipmentData[tempControlledField] === 'True';

        const hazardousField = shipmentSummaryConfig?.hazardousField || 'isDangerousGoods';
        const isHazardous = shipmentData[hazardousField] === true || shipmentData[hazardousField] === 'True';

        const summaryTimelineConfig = enabledSections.find(s => s.sectionType === 'shipment_timeline')?.config as TimelineSectionConfig | undefined;
        const summaryStatusFieldName = summaryTimelineConfig?.statusField || '';
        const summaryCurrentStatusValue = summaryStatusFieldName ? shipmentData[summaryStatusFieldName] : '';

        let currentTimelineStatusName = '';
        if (summaryCurrentStatusValue && timelineStatuses.length > 0 && shipmentSummaryConfig?.showTimelineStatus) {
          for (const status of timelineStatuses) {
            const matchesChild = status.childStatuses?.some(
              child => child.statusValue.toLowerCase() === String(summaryCurrentStatusValue).toLowerCase()
            );
            if (matchesChild) {
              currentTimelineStatusName = status.name;
            }
          }
        }

        const getShipmentSummaryFieldValue = (fieldPath: string): string => {
          if (!fieldPath || !shipmentData) return '';
          const parts = fieldPath.split('.');
          let value: any = shipmentData;
          for (const part of parts) {
            if (value === null || value === undefined) return '';
            value = value[part];
          }
          return value !== null && value !== undefined ? String(value) : '';
        };

        const allSummaryFields = shipmentSummaryGroups.flatMap(g => g.fields);
        const fieldCount = allSummaryFields.length;
        const gridColClass = fieldCount <= 4 ? 'lg:grid-cols-4' : fieldCount <= 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-8';

        return (
          <div key={section.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl shadow-lg p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">{summaryHeaderValue}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  {shipmentSummaryConfig?.showTimelineStatus && currentTimelineStatusName && (
                    <span className={`inline-flex px-4 py-2 rounded-full border font-semibold ${getStatusBadgeClasses(currentTimelineStatusName)}`}>
                      {currentTimelineStatusName}
                    </span>
                  )}
                  {isTempControlled && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800 text-sm">
                      <Thermometer className="h-3.5 w-3.5" />
                      {shipmentSummaryConfig?.tempControlledLabel || 'Temp Controlled'}
                    </span>
                  )}
                  {isHazardous && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {shipmentSummaryConfig?.hazardousLabel || 'Hazardous'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {allSummaryFields.length > 0 && (
              <div className={`grid grid-cols-2 md:grid-cols-4 ${gridColClass} gap-4`}>
                {allSummaryFields.map((field) => {
                  const value = getShipmentSummaryFieldValue(field.apiField);
                  return (
                    <div key={field.id || field.apiField}>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">{field.label}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value || '\u2014'}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'shipment_timeline':
        const timelineConfig = section.config as TimelineSectionConfig;
        const statusFieldName = timelineConfig?.statusField || '';
        const currentStatusValue = statusFieldName ? shipmentData[statusFieldName] : '';

        let completedUpToOrder = 0;
        if (currentStatusValue && timelineStatuses.length > 0) {
          for (const status of timelineStatuses) {
            const matchesChild = status.childStatuses?.some(
              child => child.statusValue.toLowerCase() === String(currentStatusValue).toLowerCase()
            );
            if (matchesChild && status.displayOrder > completedUpToOrder) {
              completedUpToOrder = status.displayOrder;
            }
          }
        }

        return (
          <div key={section.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Shipment Timeline</h2>
            </div>

            {timelineStatuses.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Timeline not configured
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-start justify-between">
                  {timelineStatuses.map((status, index) => {
                    const isComplete = status.displayOrder <= completedUpToOrder;
                    const isLast = index === timelineStatuses.length - 1;
                    const locationValue = status.locationField ? shipmentData[status.locationField] : null;
                    const dateValue = status.dateField ? shipmentData[status.dateField] : null;

                    let formattedDate = '';
                    if (dateValue) {
                      try {
                        const date = new Date(dateValue);
                        formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      } catch {
                        formattedDate = String(dateValue);
                      }
                    }

                    const nextStatus = timelineStatuses[index + 1];
                    const isNextComplete = nextStatus ? nextStatus.displayOrder <= completedUpToOrder : false;

                    return (
                      <div key={status.id} className="flex flex-col items-center flex-1 relative">
                        {!isLast && (
                          <div
                            className={`absolute top-5 left-1/2 w-full h-0.5 ${
                              isNextComplete ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                        )}

                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                            isComplete
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {isComplete ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <span className="text-sm font-medium">{status.displayOrder}</span>
                          )}
                        </div>

                        <div className="mt-3 text-center">
                          <p className={`text-sm font-medium ${
                            isComplete
                              ? 'text-gray-900 dark:text-gray-100'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {status.name}
                          </p>
                          {locationValue && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {locationValue}
                            </p>
                          )}
                          {formattedDate && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {formattedDate}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );

      case 'route_summary':
        const formatFieldValue = (value: string, format?: string): string => {
          if (!value || !format) return value;
          try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            switch (format) {
              case 'date':
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              case 'datetime':
                return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2') + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              case 'date_short':
                return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
              case 'time':
                return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              default:
                return value;
            }
          } catch {
            return value;
          }
        };

        const getRouteSummaryFieldValue = (fieldPath: string, groupId?: string): string => {
          if (!fieldPath) {
            console.log('[RouteSummary] Missing fieldPath');
            return '';
          }

          let dataSource: Record<string, any> | null = null;

          if (groupId && routeSummaryGroupData[groupId]) {
            dataSource = routeSummaryGroupData[groupId];
            console.log('[RouteSummary] Using group-specific data for group:', groupId);
          } else {
            dataSource = shipmentData;
            console.log('[RouteSummary] Using main shipmentData');
          }

          if (!dataSource) {
            console.log('[RouteSummary] No data source available');
            return '';
          }

          console.log('[RouteSummary] Extracting value for fieldPath:', fieldPath);
          console.log('[RouteSummary] dataSource keys:', Object.keys(dataSource));

          const parts = fieldPath.split('.');

          let value: any = dataSource;
          for (const part of parts) {
            if (value === null || value === undefined) {
              console.log('[RouteSummary] Value became null/undefined at part:', part);
              return '';
            }
            value = value[part];
          }
          const result = value !== null && value !== undefined ? String(value) : '';
          console.log('[RouteSummary] Final result for', fieldPath, ':', result);
          return result;
        };

        const groupedByRowIndex = routeSummaryGroups.reduce((acc, group) => {
          const row = group.rowIndex;
          if (!acc[row]) acc[row] = [];
          acc[row].push(group);
          return acc;
        }, {} as Record<number, RouteSummaryGroup[]>);

        const sortedRowIndices = Object.keys(groupedByRowIndex).map(Number).sort((a, b) => a - b);

        return (
          <div key={section.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                <Route className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Route Summary</h2>
            </div>

            {routeSummaryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-500 dark:text-gray-400">Loading route summary...</span>
              </div>
            ) : routeSummaryGroups.length > 0 ? (
              <div className="space-y-6">
                {sortedRowIndices.map(rowIndex => {
                  const rowGroups = groupedByRowIndex[rowIndex];
                  const groupCount = rowGroups.length;
                  return (
                  <div key={rowIndex} className={`grid gap-6 ${groupCount === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {rowGroups
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map(group => {
                        const maxColumn = Math.max(...group.fields.map(f => f.gridColumn || 1), 1);
                        const columnCount = Math.min(maxColumn, 4);
                        const fieldsByColumn: Record<number, typeof group.fields> = {};
                        group.fields.forEach(field => {
                          const col = field.gridColumn || 1;
                          if (!fieldsByColumn[col]) fieldsByColumn[col] = [];
                          fieldsByColumn[col].push(field);
                        });

                        return (
                        <div key={group.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
                            {group.name}
                          </h3>
                          <div className={`grid gap-x-6 gap-y-2 ${
                            columnCount === 1 ? 'grid-cols-1' :
                            columnCount === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                            columnCount === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                          }`}>
                            {Array.from({ length: columnCount }, (_, colIndex) => {
                              const colFields = fieldsByColumn[colIndex + 1] || [];
                              return (
                                <div key={colIndex} className="space-y-2">
                                  {colFields.sort((a, b) => a.displayOrder - b.displayOrder).map(field => {
                                    const rawValue = getRouteSummaryFieldValue(field.apiField, group.id);
                                    const value = formatFieldValue(rawValue, field.displayFormat);
                                    return (
                                      <div key={field.id}>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 block">{field.label}</span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                          {value || '\u2014'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );})}
                  </div>
                );})}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No route summary configured. Configure groups in the admin settings.
              </div>
            )}
          </div>
        );

      case 'trace_numbers':
        return (
          <div key={section.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
                <Hash className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Trace Numbers</h2>
            </div>

            {traceNumbersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-500 dark:text-gray-400">Loading trace numbers...</span>
              </div>
            ) : traceNumbers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {traceNumbers.map((trace, index) => (
                  <div
                    key={index}
                    className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
                  >
                    {trace.headerValue && (
                      <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full border mb-2 ${getColorClasses(trace.headerColor)}`}>
                        {trace.headerValue}
                      </span>
                    )}
                    {trace.detailLabel && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{trace.detailLabel}</p>
                    )}
                    {trace.detailValue && (
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {trace.detailValue}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {traceNumbersSection?.config && Object.keys(traceNumbersSection.config).length > 0
                  ? 'No trace numbers found for this shipment'
                  : 'Trace number details will be displayed here'}
              </div>
            )}
          </div>
        );

      case 'barcode_details':
        const getFieldValue = (item: Record<string, any>, fieldPath: string): any => {
          if (item.hasOwnProperty(fieldPath)) {
            return item[fieldPath];
          }
          const parts = fieldPath.split('.');
          let value = item;
          for (const part of parts) {
            value = value?.[part];
          }
          return value;
        };

        const requiredFields = barcodeConfig?.fieldMappings?.filter(f => f.isRequired) || [];
        const filteredBarcodeDetails = requiredFields.length > 0
          ? barcodeDetails.filter(item => {
              return requiredFields.every(field => {
                const value = getFieldValue(item, field.apiField);
                return value !== null && value !== undefined && value !== '' && value !== '-';
              });
            })
          : barcodeDetails;

        const getColumnGroups = () => {
          if (!barcodeConfig?.fieldMappings) return [];
          const groups: { id: string; label: string; fields: typeof barcodeConfig.fieldMappings; isGroup: boolean }[] = [];
          const processedGroupIds = new Set<string>();

          for (const field of barcodeConfig.fieldMappings) {
            if (field.groupId) {
              if (!processedGroupIds.has(field.groupId)) {
                processedGroupIds.add(field.groupId);
                const groupFields = barcodeConfig.fieldMappings.filter(f => f.groupId === field.groupId);
                groups.push({
                  id: field.groupId,
                  label: groupFields[0].label,
                  fields: groupFields,
                  isGroup: true
                });
              }
            } else {
              groups.push({
                id: field.apiField,
                label: field.label,
                fields: [field],
                isGroup: false
              });
            }
          }
          return groups;
        };

        const columnGroups = getColumnGroups();

        const getGroupedValue = (item: Record<string, any>, group: typeof columnGroups[0]): string => {
          if (!group.isGroup) {
            const value = getFieldValue(item, group.fields[0].apiField);
            return value !== undefined && value !== null ? String(value) : '-';
          }

          const values: string[] = [];
          let separator = ' ';

          for (let i = 0; i < group.fields.length; i++) {
            const field = group.fields[i];
            const value = getFieldValue(item, field.apiField);
            if (value !== undefined && value !== null && value !== '') {
              let displayValue = String(value);
              if (field.valueSuffix) {
                displayValue += field.valueSuffix;
              }
              values.push(displayValue);
            }
            if (field.groupSeparator && i < group.fields.length - 1) {
              separator = field.groupSeparator;
            }
          }

          return values.length > 0 ? values.join(separator) : '-';
        };

        const calculateTotals = () => {
          if (!barcodeConfig?.fieldMappings || filteredBarcodeDetails.length === 0) return {};
          const totals: Record<string, number> = {};
          for (const field of barcodeConfig.fieldMappings) {
            if (field.showTotal) {
              totals[field.apiField] = filteredBarcodeDetails.reduce((sum, item) => {
                const val = getFieldValue(item, field.apiField);
                const num = parseFloat(val);
                return sum + (isNaN(num) ? 0 : num);
              }, 0);
            }
          }
          return totals;
        };

        const getGroupTotal = (group: typeof columnGroups[0], totals: Record<string, number>): string => {
          const totalFields = group.fields.filter(f => f.showTotal && totals[f.apiField] !== undefined);
          if (totalFields.length === 0) return '';

          if (!group.isGroup) {
            return totals[group.fields[0].apiField]?.toLocaleString() || '';
          }

          const values: string[] = [];
          let separator = ' ';

          for (let i = 0; i < group.fields.length; i++) {
            const field = group.fields[i];
            if (field.showTotal && totals[field.apiField] !== undefined) {
              let displayValue = totals[field.apiField].toLocaleString();
              if (field.valueSuffix) {
                displayValue += field.valueSuffix;
              }
              values.push(displayValue);
            }
            if (field.groupSeparator && i < group.fields.length - 1) {
              separator = field.groupSeparator;
            }
          }

          return values.join(separator);
        };

        const totals = calculateTotals();
        const hasImageConfig = barcodeConfig?.imageConfig?.apiUrl;
        const hasTotals = columnGroups.some(g => g.fields.some(f => f.showTotal && totals[f.apiField] !== undefined));

        return (
          <div key={section.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                <Box className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Barcode Details</h2>
              {filteredBarcodeDetails.length > 0 && (
                <span className="px-2.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                  {filteredBarcodeDetails.length} items
                </span>
              )}
            </div>

            {barcodeDetailsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : barcodeConfig?.fieldMappings && barcodeConfig.fieldMappings.length > 0 && filteredBarcodeDetails.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      {columnGroups.map((group) => (
                        <th
                          key={group.id}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          {group.label}
                        </th>
                      ))}
                      {hasImageConfig && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Images
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredBarcodeDetails.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        {columnGroups.map((group) => (
                          <td
                            key={group.id}
                            className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap"
                          >
                            {getGroupedValue(item, group)}
                          </td>
                        ))}
                        {hasImageConfig && (
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                const sourceValue = barcodeConfig.imageConfig?.sourceField
                                  ? getFieldValue(item, barcodeConfig.imageConfig.sourceField)
                                  : '';
                              }}
                              className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {hasTotals && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30">
                        {columnGroups.map((group, idx) => (
                          <td
                            key={group.id}
                            className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap"
                          >
                            {idx === 0 ? 'Totals' : getGroupTotal(group, totals)}
                          </td>
                        ))}
                        {hasImageConfig && <td className="px-4 py-3"></td>}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {barcodeConfig?.fieldMappings && barcodeConfig.fieldMappings.length > 0
                  ? 'No barcode details found for this shipment'
                  : 'Barcode details section not configured'}
              </div>
            )}
          </div>
        );

      case 'documents':
        return (
          <div key={section.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-gradient-to-br from-white/90 via-slate-50/40 to-white/80 dark:from-gray-800/90 dark:via-gray-800/40 dark:to-gray-800/80 backdrop-blur-xl shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Documents</h2>
            </div>

            {documentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No documents available
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate" title={doc.name}>
                          {doc.name}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {getFileTypeFromName(doc.name, doc.type)}
                          {doc.size && ` \u2022 ${doc.size}`}
                        </p>
                      </div>
                    </div>
                    <div className={`grid gap-2 ${doc.emailEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button
                        onClick={() => handleViewDocument(doc)}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors text-sm font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => handleDownloadDocument(doc)}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      {doc.emailEnabled && (
                        <button
                          onClick={() => handleOpenEmailModal(doc)}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm font-medium"
                        >
                          <Mail className="w-4 h-4" />
                          Email
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-orange-500 hover:text-orange-600 font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Shipments
      </button>

      {enabledSections.map(section => renderSection(section))}

      {viewerModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={closeViewerModal}
        >
          <div
            className={`relative bg-white dark:bg-gray-900 shadow-2xl flex flex-col transition-all duration-300 ${
              viewerModal.isFullscreen
                ? 'w-full h-full rounded-none'
                : 'max-w-4xl w-full mx-4 max-h-[90vh] rounded-xl'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    {viewerModal.document?.name || 'Document'}
                  </h3>
                  {viewerModal.contentType && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {viewerModal.contentType}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {viewerModal.document && !viewerModal.loading && !viewerModal.error && isViewableContentType(viewerModal.contentType) && !viewerModal.contentType?.includes('pdf') && (
                  <div className="flex items-center gap-1 mr-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <button
                      onClick={handleZoomOut}
                      disabled={viewerModal.zoom <= 25}
                      className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 min-w-[3rem] text-center">
                      {viewerModal.zoom}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      disabled={viewerModal.zoom >= 300}
                      className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleZoomReset}
                      className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors ml-1"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={viewerModal.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {viewerModal.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                {viewerModal.document && !viewerModal.loading && !viewerModal.error && (
                  <button
                    onClick={() => viewerModal.document && handleDownloadDocument(viewerModal.document)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
                <button
                  onClick={closeViewerModal}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 ${viewerModal.isFullscreen ? '' : 'p-4'}`}>
              <div className={`${viewerModal.isFullscreen ? 'h-full' : 'min-h-[400px]'} flex items-center justify-center p-4`}>
                {viewerModal.loading && (
                  <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p>Loading document...</p>
                  </div>
                )}

                {viewerModal.error && (
                  <div className="flex flex-col items-center gap-3 text-red-500">
                    <AlertCircle className="w-12 h-12" />
                    <p className="font-medium">{viewerModal.error}</p>
                  </div>
                )}

                {!viewerModal.loading && !viewerModal.error && viewerModal.blobUrl && (
                  <>
                    {isViewableContentType(viewerModal.contentType) ? (
                      viewerModal.contentType?.includes('pdf') ? (
                        <iframe
                          src={viewerModal.blobUrl}
                          className="w-full h-full min-h-[600px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
                          title={viewerModal.document?.name || 'Document'}
                        />
                      ) : isTiffContentType(viewerModal.contentType) ? (
                        <div className="flex flex-col items-center justify-start overflow-auto max-w-full max-h-full w-full h-full">
                          {!viewerModal.tiffDecoded && (
                            <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400 w-full pt-8">
                              <Loader2 className="w-8 h-8 animate-spin" />
                              <p>Decoding TIFF image...</p>
                            </div>
                          )}
                          <canvas
                            ref={tiffCanvasRef}
                            style={{
                              width: viewerModal.canvasWidth > 0 ? `${viewerModal.canvasWidth * (viewerModal.zoom / 100)}px` : 'auto',
                              height: viewerModal.canvasHeight > 0 ? `${viewerModal.canvasHeight * (viewerModal.zoom / 100)}px` : 'auto'
                            }}
                            className={`object-contain rounded-lg shadow-lg mx-auto ${viewerModal.tiffDecoded ? '' : 'hidden'}`}
                          />
                        </div>
                      ) : (
                        <div className="overflow-auto max-w-full max-h-full w-full h-full flex items-start justify-center">
                          <img
                            src={viewerModal.blobUrl}
                            alt={viewerModal.document?.name || 'Document'}
                            style={{ transform: `scale(${viewerModal.zoom / 100})`, transformOrigin: 'top center' }}
                            className="object-contain rounded-lg shadow-lg transition-transform"
                          />
                        </div>
                      )
                  ) : (
                      <div className="flex flex-col items-center gap-4 text-gray-500 dark:text-gray-400 py-12">
                        <AlertCircle className="w-16 h-16 text-gray-400 dark:text-gray-500" />
                        <div className="text-center">
                          <p className="font-medium text-lg text-gray-700 dark:text-gray-300">
                            Preview not available
                          </p>
                          <p className="mt-1 text-sm">
                            This file type ({viewerModal.contentType || 'unknown'}) cannot be previewed in the browser.
                          </p>
                          <p className="text-sm">Please download the file to view it.</p>
                        </div>
                        {viewerModal.document && (
                          <button
                            onClick={() => viewerModal.document && handleDownloadDocument(viewerModal.document)}
                            className="mt-4 flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                          >
                            <Download className="w-5 h-5" />
                            Download File
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {emailModal.isOpen && emailModal.document && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Email Document
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {emailModal.document.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseEmailModal}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {emailModal.error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">{emailModal.error}</span>
                </div>
              )}

              {emailModal.success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Email sent successfully!</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Recipients
                  </label>
                  <div className="flex gap-2">
                    {companyUsers.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowUserPicker(!showUserPicker)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          <Users className="h-3 w-3" />
                          Add User
                        </button>
                        {showUserPicker && (
                          <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10 max-h-48 overflow-y-auto">
                            {companyUsers.map(user => (
                              <button
                                key={user.id}
                                onClick={() => handleAddCompanyUser(user.email)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex flex-col"
                              >
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {user.name || user.email}
                                </span>
                                {user.name && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {user.email}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={handleAddRecipient}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                    >
                      <Plus className="h-3 w-3" />
                      Add Email
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {emailModal.recipients.map((recipient, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="email"
                        value={recipient}
                        onChange={(e) => handleRecipientChange(index, e.target.value)}
                        placeholder="email@example.com"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      {emailModal.recipients.length > 1 && (
                        <button
                          onClick={() => handleRemoveRecipient(index)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={handleCloseEmailModal}
                disabled={emailModal.sending}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailModal.sending || emailModal.success}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailModal.sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
