import React, { useState, useEffect } from 'react';
import { ClipboardList, AlertCircle, Loader, CheckCircle2, Package, RefreshCw, X, BookUser, Save, FolderOpen, Trash2, Search } from 'lucide-react';
import type { User, OrderEntryField, ClientAddress } from '../types';
import { useOrderEntryForm } from '../hooks/useOrderEntryForm';
import { TextField, NumberField, DateField, DateTimeField, PhoneField, ZipField, PostalCodeField, ZipPostalField, ProvinceField, StateField, DropdownField, FileField, BooleanField, ApiLookupField } from './form-fields';
import { validateZipPostal } from './form-fields/ZipPostalField';
import ArrayFieldSection from './form-fields/ArrayFieldSection';
import GroupedArrayTable from './form-fields/GroupedArrayTable';
import type { ChildGroupInfo } from './form-fields/GroupedArrayTable';
import ChildGroupModal from './order-entry/ChildGroupModal';
import PdfUploadSection from './order-entry/PdfUploadSection';
import DocumentUploadSection from './order-entry/DocumentUploadSection';
import ApiLookupModal from './order-entry/ApiLookupModal';
import SubmissionSuccessModal from './order-entry/SubmissionSuccessModal';
import SubmissionLoadingOverlay from './order-entry/SubmissionLoadingOverlay';
import { loadSubmissionConfig, submitOrderEntry } from '../services/submissionService';
import { fetchClientAddresses, updateClientAddress } from '../services/addressBookService';
import { fetchClientOrderTemplates, saveClientOrderTemplate, updateClientOrderTemplate, deleteClientOrderTemplate, type ClientOrderTemplate } from '../services/clientOrderTemplateService';
import { fetchCompanyBranding } from '../services/configService';
import FieldTypeIcon from './common/FieldTypeIcon';
import { useToast } from '../hooks/useToast';
import ToastContainer from './common/ToastContainer';
import { FormSkeleton } from './common/Skeleton';
import Modal from './common/Modal';
import { supabase } from '../lib/supabase';

interface OrderEntryPageProps {
  currentUser: User;
}

export default function OrderEntryPage({ currentUser }: OrderEntryPageProps) {
  const { loading, config, fieldGroups, fields, layouts, error: configError, templateId, templateName, extractionTypeId, confirmationNumberField, hidePdfAutofill, clientCode, documentTypes } = useOrderEntryForm({
    clientId: currentUser.clientId
  });
  const toast = useToast();

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, any>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiExtractedFields, setAiExtractedFields] = useState<Set<string>>(new Set());
  const [confidenceScores, setConfidenceScores] = useState<Record<string, number>>({});
  const [uploadedPdfId, setUploadedPdfId] = useState<string | null>(null);
  const [submissionStep, setSubmissionStep] = useState(0);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [pdfResetTrigger, setPdfResetTrigger] = useState(0);
  const [clientAddresses, setClientAddresses] = useState<ClientAddress[]>([]);
  const [addressBookOpen, setAddressBookOpen] = useState<Record<string, boolean>>({});
  const [addressSearchQuery, setAddressSearchQuery] = useState<Record<string, string>>({});
  const [apiLookupField, setApiLookupField] = useState<OrderEntryField | null>(null);
  const [apiLookupRowContext, setApiLookupRowContext] = useState<{ groupId: string; rowIndex: number } | null>(null);
  const [childGroupModal, setChildGroupModal] = useState<{ childGroup: ChildGroupInfo; parentGroupId: string; rowIndex: number } | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showLoadTemplateModal, setShowLoadTemplateModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<ClientOrderTemplate[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateToDelete, setTemplateToDelete] = useState<ClientOrderTemplate | null>(null);
  const [loadedSavedTemplate, setLoadedSavedTemplate] = useState<ClientOrderTemplate | null>(null);
  const [showUpdateTemplateConfirm, setShowUpdateTemplateConfirm] = useState(false);
  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  const [typeaheadField, setTypeaheadField] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, File>>({});
  const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});
  const [loadedAddressByGroup, setLoadedAddressByGroup] = useState<Record<string, { addressId: string; snapshot: Record<string, any> }>>({});
  const [updatingAddress, setUpdatingAddress] = useState<string | null>(null);
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const typeaheadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentUser.clientId) {
      const hasAddressBookGroup = fieldGroups.some(g => g.addressBookEnabled);
      if (hasAddressBookGroup) {
        fetchClientAddresses(currentUser.clientId).then(setClientAddresses).catch(() => {});
      }
    }
  }, [currentUser.clientId, fieldGroups]);

  useEffect(() => {
    fetchCompanyBranding().then(b => setCompanyName(b.companyName)).catch(() => {});
  }, []);

  useEffect(() => {
    const loadHolidays = async () => {
      try {
        const { data } = await supabase
          .from('order_entry_holidays')
          .select('date, recurring');
        if (!data) return;
        const today = new Date();
        const currentYear = today.getFullYear();
        const dates: string[] = [];
        for (const h of data) {
          if (h.recurring) {
            const md = h.date.slice(5);
            dates.push(`${currentYear}-${md}`);
            dates.push(`${currentYear + 1}-${md}`);
          } else {
            dates.push(h.date);
          }
        }
        setHolidayDates(dates);
      } catch {}
    };
    loadHolidays();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-address-book-dropdown]')) {
        setAddressBookOpen({});
      }
      if (!target.closest('[data-address-typeahead]')) {
        setTypeaheadField(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (fields.length > 0 && fieldGroups.length > 0) {
      const initialFormData: Record<string, any> = {};

      fieldGroups.forEach(group => {
        if (group.parentGroupId) return;
        if (group.isArrayGroup) {
          const groupFields = fields.filter(f => f.fieldGroupId === group.id);
          const minRows = group.arrayMinRows || 1;
          const childGroupsForThis = fieldGroups.filter(g => g.parentGroupId === group.id);
          const rowData = Array.from({ length: minRows }, () => {
            const row: Record<string, any> = {};
            groupFields.forEach(field => {
              if (field.useClientIdDefault && clientCode) {
                row[field.fieldName] = clientCode;
              } else if (field.defaultValue) {
                row[field.fieldName] = field.fieldType === 'boolean'
                  ? field.defaultValue.toLowerCase() === 'true'
                  : field.defaultValue;
              } else if (field.fieldType === 'boolean') {
                row[field.fieldName] = false;
              } else if (field.fieldType === 'file') {
                row[field.fieldName] = [];
              } else {
                row[field.fieldName] = '';
              }
            });
            childGroupsForThis.forEach(child => {
              row[`_child_${child.id}`] = [];
            });
            return row;
          });
          initialFormData[group.id] = rowData;
        }
      });

      fields.forEach((field: OrderEntryField) => {
        const group = fieldGroups.find(g => g.id === field.fieldGroupId);
        if (group?.isArrayGroup) {
          return;
        }

        if (field.useClientIdDefault && clientCode) {
          initialFormData[field.fieldName] = clientCode;
        } else if (field.defaultValue) {
          initialFormData[field.fieldName] = field.fieldType === 'boolean'
            ? field.defaultValue.toLowerCase() === 'true'
            : field.defaultValue;
        } else if (field.isArrayField) {
          initialFormData[field.fieldName] = Array.from({ length: field.arrayMinRows || 1 }, () => ({}));
        } else if (field.fieldType === 'boolean') {
          initialFormData[field.fieldName] = false;
        } else if (field.fieldType === 'file') {
          initialFormData[field.fieldName] = [];
        } else {
          initialFormData[field.fieldName] = '';
        }
      });
      setFormData(initialFormData);
    }
  }, [fields, fieldGroups, clientCode]);

  const handleExtractionComplete = (extractedData: Record<string, any>, scores: Record<string, number>) => {
    console.log('[handleExtractionComplete] Called with extractedData:', Object.keys(extractedData));
    console.log('[handleExtractionComplete] Fields with copyFromField:',
      fields.filter(f => f.copyFromField).map(f => ({ name: f.fieldName, copyFrom: f.copyFromField })));

    const newAiFields = new Set<string>();
    const newFormData = { ...formData };

    Object.entries(extractedData).forEach(([fieldName, value]) => {
      const confidence = scores[fieldName] || 0;
      console.log(`[handleExtractionComplete] Field "${fieldName}": value="${value}", confidence=${confidence}`);

      if (confidence >= 0.5) {
        const field = fields.find(f => f.fieldName === fieldName);
        let processedValue = value;
        if (field?.fieldType === 'zip_postal' && typeof value === 'string') {
          const cleaned = value.replace(/\s+/g, '').toUpperCase();
          if (/^\d{5}-\d{4}$/.test(cleaned)) {
            processedValue = cleaned.slice(0, 5);
            console.log(`[handleExtractionComplete] Truncated ZIP+4 "${value}" to "${processedValue}"`);
          }
        }
        newFormData[fieldName] = processedValue;
        newAiFields.add(fieldName);
      }
    });

    console.log('[handleExtractionComplete] After extraction, newFormData keys with values:',
      Object.entries(newFormData).filter(([_, v]) => v).map(([k, v]) => `${k}=${v}`));

    Object.entries(newFormData).forEach(([fieldName, value]) => {
      if (!value) return;
      const dependentFields = fields.filter(f => f.copyFromField === fieldName);
      if (dependentFields.length > 0) {
        console.log(`[handleExtractionComplete] Field "${fieldName}" has ${dependentFields.length} dependent fields:`,
          dependentFields.map(f => f.fieldName));
      }
      dependentFields.forEach(depField => {
        const depCurrentValue = newFormData[depField.fieldName];
        console.log(`[handleExtractionComplete] Dependent field "${depField.fieldName}" current value: "${depCurrentValue}"`);
        if (!depCurrentValue || depCurrentValue === '') {
          console.log(`[handleExtractionComplete] COPYING "${value}" to "${depField.fieldName}"`);
          newFormData[depField.fieldName] = value;
          newAiFields.add(depField.fieldName);
        } else {
          console.log(`[handleExtractionComplete] NOT copying - field already has value`);
        }
      });
    });

    console.log('[handleExtractionComplete] Final newFormData:', newFormData);
    console.log('[handleExtractionComplete] Final aiFields:', [...newAiFields]);

    setFormData(newFormData);
    setAiExtractedFields(newAiFields);
    setConfidenceScores(scores);
    toast.success('PDF extracted successfully');
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    console.log(`[OrderEntryPage] handleFieldChange called for "${fieldName}"`, {
      newValue: value,
      previousValue: formData[fieldName]
    });

    const dependentFields = fields.filter(f => f.copyFromField === fieldName);
    const updates: Record<string, any> = { [fieldName]: value };

    if (dependentFields.length > 0) {
      console.log(`[OrderEntryPage] Found ${dependentFields.length} dependent fields for "${fieldName}":`,
        dependentFields.map(f => f.fieldName));
    }

    dependentFields.forEach(depField => {
      if (!formData[depField.fieldName] || formData[depField.fieldName] === '') {
        console.log(`[OrderEntryPage] Copying value to dependent field "${depField.fieldName}"`);
        updates[depField.fieldName] = value;
      }
    });

    console.log(`[OrderEntryPage] Setting formData with updates:`, Object.keys(updates));
    setFormData(prev => ({
      ...prev,
      ...updates
    }));

    if (aiExtractedFields.has(fieldName)) {
      setAiExtractedFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
    }

    if (touched[fieldName]) {
      const field = fields.find(f => f.fieldName === fieldName);
      if (field) {
        const fieldError = validateField(field, value);
        setErrors(prev => {
          const newErrors = { ...prev };
          if (fieldError) {
            newErrors[fieldName] = fieldError;
          } else {
            delete newErrors[fieldName];
          }
          return newErrors;
        });
      }
    }
  };

  const handleFieldBlur = (fieldName: string) => {
    console.log(`[OrderEntryPage] handleFieldBlur called for "${fieldName}"`);
    setTouched(prev => ({ ...prev, [fieldName]: true }));

    const field = fields.find(f => f.fieldName === fieldName);
    if (field) {
      const fieldError = validateField(field, formData[fieldName]);
      setErrors(prev => {
        const newErrors = { ...prev };
        if (fieldError) {
          newErrors[fieldName] = fieldError;
        } else {
          delete newErrors[fieldName];
        }
        return newErrors;
      });
    }
  };

  const validateField = (field: OrderEntryField, value: any, contextData?: Record<string, any>): string | null => {
    const ctx = contextData || formData;
    const effectivelyRequired = field.isRequired || isFieldConditionallyRequired(field, ctx);
    if (effectivelyRequired && (!value || value === '' || (Array.isArray(value) && value.length === 0))) {
      return `${field.fieldLabel} is required`;
    }

    if (field.fieldType === 'text' && field.maxLength && value && value.length > field.maxLength) {
      return `${field.fieldLabel} must be ${field.maxLength} characters or less`;
    }

    if (field.fieldType === 'number') {
      const numValue = parseFloat(value);
      if (value && isNaN(numValue)) {
        return `${field.fieldLabel} must be a valid number`;
      }
      if (field.minValue !== undefined && numValue < field.minValue) {
        return `${field.fieldLabel} must be at least ${field.minValue}`;
      }
      if (field.maxValue !== undefined && numValue > field.maxValue) {
        return `${field.fieldLabel} must be at most ${field.maxValue}`;
      }
    }

    if (field.fieldType === 'zip_postal' && value) {
      const validation = validateZipPostal(value);
      if (!validation.isValid) {
        return `${field.fieldLabel} must be a valid US Zip (12345) or Canadian Postal Code (A1A 1A1)`;
      }
    }

    if (field.fieldType === 'zip' && value) {
      if (!/^\d{5}$/.test(value)) {
        return `${field.fieldLabel} must be a valid 5-digit US Zip Code`;
      }
    }

    if (field.fieldType === 'postal_code' && value) {
      if (!/^[A-Za-z]\d[A-Za-z] \d[A-Za-z]\d$/.test(value)) {
        return `${field.fieldLabel} must be a valid Canadian Postal Code (A1A 1A1)`;
      }
    }

    if ((field.fieldType === 'date' || field.fieldType === 'datetime') && value) {
      const dateStr = typeof value === 'string' ? value.slice(0, 10) : '';
      if (dateStr && field.allowWeekends === false) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const dow = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getDay();
          if (dow === 0 || dow === 6) {
            return `${field.fieldLabel} cannot be a weekend date`;
          }
        }
      }
      if (dateStr && field.allowHolidays === false && holidayDates.includes(dateStr)) {
        return `${field.fieldLabel} cannot be a holiday date`;
      }
    }

    if (field.validationRegex && value) {
      try {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test(value)) {
          return field.validationErrorMessage || `${field.fieldLabel} format is invalid`;
        }
      } catch (e) {
        console.error('Invalid regex:', field.validationRegex);
      }
    }

    if (field.isArrayField && Array.isArray(value)) {
      if (value.length < field.arrayMinRows) {
        return `${field.fieldLabel} must have at least ${field.arrayMinRows} rows`;
      }
      if (value.length > field.arrayMaxRows) {
        return `${field.fieldLabel} must have at most ${field.arrayMaxRows} rows`;
      }
    }

    return null;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, any> = {};
    const newTouched: Record<string, boolean> = {};

    fields.forEach(field => {
      const group = fieldGroups.find(g => g.id === field.fieldGroupId);
      if (group?.isArrayGroup) return;
      if (group?.isHidden) return;
      if (!isFieldVisible(field, formData)) return;

      newTouched[field.fieldName] = true;
      const value = formData[field.fieldName];
      const error = validateField(field, value);
      if (error) {
        newErrors[field.fieldName] = error;
      }
    });

    fieldGroups.forEach(group => {
      if (!group.isArrayGroup || group.isHidden || group.parentGroupId) return;
      const groupFields = fields.filter(f => f.fieldGroupId === group.id);
      const rows: Record<string, any>[] = formData[group.id] || [];
      const rowErrors: Record<string, string>[] = [];
      let hasGroupError = false;

      rows.forEach((rowData) => {
        const rowErr: Record<string, string> = {};
        groupFields.forEach(field => {
          if (!isFieldVisible(field, rowData)) return;
          const effectivelyRequired = field.isRequired || isFieldConditionallyRequired(field, rowData);
          const value = rowData[field.fieldName];
          if (effectivelyRequired && (!value || value === '')) {
            rowErr[field.fieldName] = `${field.fieldLabel} is required`;
            hasGroupError = true;
          }
        });
        rowErrors.push(rowErr);
      });

      if (hasGroupError) {
        newErrors[group.id] = rowErrors;
      }
    });

    setTouched(newTouched);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddressSelect = (groupId: string, address: ClientAddress) => {
    const groupFields = fields.filter(f => f.fieldGroupId === groupId);
    const newFormData = { ...formData };
    const snapshot: Record<string, any> = {};

    groupFields.forEach(field => {
      if (field.addressBookField) {
        const value = (address as any)[field.addressBookField];
        if (value !== undefined && value !== null) {
          const formValue = field.fieldType === 'boolean' ? value : String(value);
          newFormData[field.fieldName] = formValue;
          snapshot[field.fieldName] = formValue;
        } else {
          snapshot[field.fieldName] = formData[field.fieldName] || '';
        }
      }
    });

    setFormData(newFormData);
    setLoadedAddressByGroup(prev => ({ ...prev, [groupId]: { addressId: address.id, snapshot } }));
    setAddressBookOpen(prev => ({ ...prev, [groupId]: false }));
    setAddressSearchQuery(prev => ({ ...prev, [groupId]: '' }));
    toast.success(`Address "${address.name}" applied`);
  };

  const handleApiLookupSelect = (lookupField: OrderEntryField, result: Record<string, any>) => {
    if (apiLookupRowContext) {
      const { groupId, rowIndex } = apiLookupRowContext;
      const rows = [...(formData[groupId] || [])];
      const row = { ...rows[rowIndex] };

      if (lookupField.apiLookupFieldMappings?.length) {
        lookupField.apiLookupFieldMappings.forEach(mapping => {
          if (mapping.responseField && mapping.targetFieldName) {
            const responseValue = mapping.responseField.split('.').reduce((obj: any, key) => obj?.[key], result);
            if (responseValue !== undefined && responseValue !== null) {
              row[mapping.targetFieldName] = String(responseValue);
            }
          }
        });
      }

      rows[rowIndex] = row;
      setFormData(prev => ({ ...prev, [groupId]: rows }));
    } else {
      const newFormData = { ...formData };

      if (lookupField.apiLookupFieldMappings?.length) {
        lookupField.apiLookupFieldMappings.forEach(mapping => {
          if (mapping.responseField && mapping.targetFieldName) {
            const responseValue = mapping.responseField.split('.').reduce((obj: any, key) => obj?.[key], result);
            if (responseValue !== undefined && responseValue !== null) {
              newFormData[mapping.targetFieldName] = String(responseValue);
            }
          }
        });
      }

      setFormData(newFormData);
    }

    setApiLookupField(null);
    setApiLookupRowContext(null);
    toast.success('Selection applied');
  };

  const getFilteredAddresses = (groupId: string) => {
    const group = fieldGroups.find(g => g.id === groupId);
    if (!group) return [];

    let filtered = [...clientAddresses];

    if (group.addressBookType === 'shipper') {
      filtered = filtered.filter(a => a.isShipper);
    } else if (group.addressBookType === 'consignee') {
      filtered = filtered.filter(a => a.isConsignee);
    }

    const query = (addressSearchQuery[groupId] || '').toLowerCase();
    if (query) {
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.city.toLowerCase().includes(query) ||
        a.address1.toLowerCase().includes(query) ||
        (a.contactName || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const isAddressDirty = (groupId: string): boolean => {
    const loaded = loadedAddressByGroup[groupId];
    if (!loaded) return false;
    const groupFields = fields.filter(f => f.fieldGroupId === groupId && f.addressBookField);
    return groupFields.some(field => {
      const current = formData[field.fieldName] ?? '';
      const original = loaded.snapshot[field.fieldName] ?? '';
      return String(current) !== String(original);
    });
  };

  const handleUpdateAddress = async (groupId: string) => {
    const loaded = loadedAddressByGroup[groupId];
    if (!loaded) return;

    const address = clientAddresses.find(a => a.id === loaded.addressId);
    if (!address) return;

    const groupFields = fields.filter(f => f.fieldGroupId === groupId && f.addressBookField);
    const updatedAddress: any = { ...address };
    delete updatedAddress.id;
    delete updatedAddress.clientId;
    delete updatedAddress.createdAt;
    delete updatedAddress.updatedAt;

    groupFields.forEach(field => {
      if (field.addressBookField) {
        const value = formData[field.fieldName];
        if (field.fieldType === 'boolean') {
          updatedAddress[field.addressBookField] = value === true || value === 'true';
        } else {
          updatedAddress[field.addressBookField] = value ?? '';
        }
      }
    });

    setUpdatingAddress(groupId);
    const result = await updateClientAddress(loaded.addressId, updatedAddress);
    setUpdatingAddress(null);

    if (result.success) {
      const newSnapshot: Record<string, any> = {};
      groupFields.forEach(field => {
        newSnapshot[field.fieldName] = formData[field.fieldName] ?? '';
      });
      setLoadedAddressByGroup(prev => ({ ...prev, [groupId]: { ...prev[groupId], snapshot: newSnapshot } }));

      if (result.address) {
        setClientAddresses(prev => prev.map(a => a.id === loaded.addressId ? result.address! : a));
      }
      toast.success('Address updated successfully');
    } else {
      toast.error(result.message || 'Failed to update address');
    }
  };

  const getTypeaheadResults = (field: OrderEntryField) => {
    const query = (formData[field.fieldName] || '').toLowerCase().trim();
    if (query.length < 2) return [];

    const group = fieldGroups.find(g => g.id === field.fieldGroupId);
    if (!group) return [];

    let filtered = [...clientAddresses];
    if (group.addressBookType === 'shipper') {
      filtered = filtered.filter(a => a.isShipper);
    } else if (group.addressBookType === 'consignee') {
      filtered = filtered.filter(a => a.isConsignee);
    }

    filtered = filtered.filter(a => a.name.toLowerCase().includes(query));
    return filtered.slice(0, 7);
  };

  const handleTypeaheadChange = (field: OrderEntryField, value: string) => {
    handleFieldChange(field.fieldName, value);
    if (typeaheadTimeoutRef.current) clearTimeout(typeaheadTimeoutRef.current);
    typeaheadTimeoutRef.current = setTimeout(() => {
      if (value.trim().length >= 2) {
        setTypeaheadField(field.fieldName);
      } else {
        setTypeaheadField(null);
      }
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitSuccess(false);

    console.log('[OrderEntryPage] ========== SUBMIT BUTTON CLICKED ==========');
    console.log('[OrderEntryPage] Form data:', formData);
    console.log('[OrderEntryPage] User ID:', currentUser.id);
    console.log('[OrderEntryPage] PDF ID:', uploadedPdfId);

    if (!validateForm()) {
      const errorMsg = 'Please fix the errors in the form before submitting';
      console.log('[OrderEntryPage] Form validation failed');
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    const docErrors: Record<string, string> = {};
    for (const dt of documentTypes) {
      if (dt.isRequired && !uploadedDocuments[dt.id]) {
        docErrors[dt.id] = `${dt.name} is required`;
      }
    }
    if (Object.keys(docErrors).length > 0) {
      setDocumentErrors(docErrors);
      setError('Please upload all required documents');
      toast.error('Please upload all required documents');
      return;
    }

    console.log('[OrderEntryPage] Form validation passed');

    try {
      setSubmitting(true);
      setSubmissionStep(1);

      console.log('[OrderEntryPage] Loading submission config...');
      const submissionConfig = await loadSubmissionConfig();
      console.log('[OrderEntryPage] Submission config loaded:', submissionConfig);

      if (!submissionConfig) {
        throw new Error('Order submission is not configured. Please contact support.');
      }

      if (!submissionConfig.isEnabled) {
        throw new Error('Order submission is currently disabled. Please try again later.');
      }

      setSubmissionStep(2);

      console.log('[OrderEntryPage] Calling submitOrderEntry...');
      console.log('[OrderEntryPage] Extraction Type ID:', extractionTypeId);
      const result = await submitOrderEntry(
        formData,
        fields,
        currentUser.id,
        uploadedPdfId,
        submissionConfig,
        extractionTypeId,
        fieldGroups
      );

      console.log('[OrderEntryPage] submitOrderEntry result:', result);

      setSubmissionStep(3);

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit order');
      }

      if (Object.keys(uploadedDocuments).length > 0 && result.submissionId) {
        await processDocumentUploads(result.submissionId, result.apiResponse);
      }

      setSubmissionStep(4);

      setSubmissionResult(result);
      setShowSuccessModal(true);
      setSubmitSuccess(true);
      toast.success('Order submitted successfully');
      console.log('[OrderEntryPage] ========== SUBMISSION SUCCESS ==========');

    } catch (err: any) {
      console.error('[OrderEntryPage] ========== SUBMISSION ERROR ==========');
      console.error('[OrderEntryPage] Error:', err);
      console.error('[OrderEntryPage] Error message:', err.message);
      console.error('[OrderEntryPage] Error stack:', err.stack);
      const errorMsg = err.message || 'Failed to submit order';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
      setSubmissionStep(0);
    }
  };

  const processDocumentUploads = async (submissionId: string, workflowResponse?: any) => {
    console.log('[DocumentUpload] ========== PROCESSING DOCUMENT UPLOADS ==========');
    console.log('[DocumentUpload] Submission ID:', submissionId);
    console.log('[DocumentUpload] Uploaded documents:', Object.keys(uploadedDocuments));
    console.log('[DocumentUpload] Document types:', documentTypes.map(dt => ({ id: dt.id, name: dt.name, actionType: dt.actionType, emailRecipients: dt.emailRecipients })));
    console.log('[DocumentUpload] Workflow response data available:', workflowResponse ? Object.keys(workflowResponse) : 'none');

    for (const [docTypeId, file] of Object.entries(uploadedDocuments)) {
      const docType = documentTypes.find(dt => dt.id === docTypeId);
      if (!docType) {
        console.error(`[DocumentUpload] Document type not found for id: ${docTypeId}`);
        continue;
      }

      try {
        const renamedFileName = resolveRenameTemplate(docType.renameTemplate || '', docType.name, file.name, workflowResponse);
        const storagePath = `${submissionId}/${renamedFileName || file.name}`;

        console.log(`[DocumentUpload] --- Processing: ${docType.name} ---`);
        console.log(`[DocumentUpload] File: ${file.name} (${file.size} bytes)`);
        console.log(`[DocumentUpload] Renamed: ${renamedFileName}`);
        console.log(`[DocumentUpload] Storage path: ${storagePath}`);
        console.log(`[DocumentUpload] Action type: ${docType.actionType}`);

        const { error: uploadError } = await supabase.storage
          .from('order-entry-documents')
          .upload(storagePath, file);

        if (uploadError) {
          console.error(`[DocumentUpload] STORAGE UPLOAD FAILED for ${docType.name}:`, uploadError.message);
        } else {
          console.log(`[DocumentUpload] Storage upload SUCCESS for ${docType.name}`);
        }

        const { data: insertedDoc, error: insertError } = await supabase.from('order_entry_submission_documents').insert([{
          submission_id: submissionId,
          document_type_id: docType.id,
          document_type_name: docType.name,
          original_file_name: file.name,
          renamed_file_name: renamedFileName || null,
          storage_path: storagePath,
          file_size: file.size,
          action_type: docType.actionType,
          action_status: uploadError ? 'failed' : 'pending',
          action_error: uploadError ? uploadError.message : null
        }]).select('id').single();

        if (insertError) {
          console.error(`[DocumentUpload] DB INSERT FAILED for ${docType.name}:`, insertError.message);
        } else {
          console.log(`[DocumentUpload] DB insert SUCCESS, doc ID: ${insertedDoc?.id}`);
        }

        if (uploadError) {
          console.log(`[DocumentUpload] Skipping email because upload failed`);
          continue;
        }

        if (docType.actionType === 'email' || docType.actionType === 'both') {
          console.log(`[DocumentUpload] Action type is '${docType.actionType}', checking email recipients...`);
          console.log(`[DocumentUpload] emailRecipients value: "${docType.emailRecipients}"`);

          if (!docType.emailRecipients) {
            console.error(`[DocumentUpload] NO EMAIL RECIPIENTS configured for ${docType.name} - skipping email`);
          } else {

          const recipients = docType.emailRecipients.split(',').map(r => r.trim()).filter(Boolean);
          console.log(`[DocumentUpload] Parsed recipients:`, recipients);

          let emailSubject = docType.emailSubjectTemplate || `Document: ${docType.name}`;
          emailSubject = emailSubject
            .replace(/\{\{documentType\}\}/g, docType.name)
            .replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0])
            .replace(/\{\{timestamp\}\}/g, String(Math.floor(Date.now() / 1000)))
            .replace(/\{\{clientCode\}\}/g, clientCode || '')
            .replace(/\{\{submissionId\}\}/g, submissionId);

          if (workflowResponse && typeof workflowResponse === 'object') {
            for (const [key, value] of Object.entries(workflowResponse)) {
              if (typeof value === 'string' || typeof value === 'number') {
                emailSubject = emailSubject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
              }
            }
          }

          for (const [key, value] of Object.entries(formData)) {
            if (typeof value === 'string' || typeof value === 'number') {
              emailSubject = emailSubject.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
            }
          }

          console.log(`[DocumentUpload] Email subject: "${emailSubject}"`);
          console.log(`[DocumentUpload] Invoking send-order-entry-document-email edge function...`);

          const { data: { session } } = await supabase.auth.getSession();
          console.log(`[DocumentUpload] Session exists: ${!!session}, token length: ${session?.access_token?.length || 0}`);

          const invokeBody = {
            storagePath,
            fileName: renamedFileName || file.name,
            recipients,
            subject: emailSubject,
            submissionDocumentId: insertedDoc?.id || null,
          };
          console.log(`[DocumentUpload] Invoke body:`, JSON.stringify(invokeBody));

          const { data: emailResult, error: emailError } = await supabase.functions.invoke(
            'send-order-entry-document-email',
            {
              body: invokeBody,
              headers: {
                Authorization: `Bearer ${session?.access_token}`,
              },
            }
          );

          if (emailError) {
            console.error(`[DocumentUpload] EDGE FUNCTION ERROR for ${docType.name}:`, emailError);
            console.error(`[DocumentUpload] Error name: ${emailError.name}, message: ${emailError.message}`);
          } else {
            console.log(`[DocumentUpload] EDGE FUNCTION SUCCESS for ${docType.name}:`, emailResult);
          }
          }
        }

        if (docType.actionType === 'imaging' || docType.actionType === 'both') {
          console.log(`[DocumentUpload] Action type is '${docType.actionType}', sending to imaging...`);
          if (docType.imagingBucketId) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const { error: imagingError } = await supabase.functions.invoke(
                'imaging-proxy',
                {
                  body: {
                    action: 'upload',
                    bucketId: docType.imagingBucketId,
                    documentTypeId: docType.imagingDocumentTypeId || null,
                    storagePath,
                    fileName: renamedFileName || file.name,
                    submissionDocumentId: insertedDoc?.id || null,
                  },
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                  },
                }
              );
              if (imagingError) {
                console.error(`[DocumentUpload] IMAGING ERROR for ${docType.name}:`, imagingError);
              } else {
                console.log(`[DocumentUpload] IMAGING SUCCESS for ${docType.name}`);
              }
            } catch (imgErr: any) {
              console.error(`[DocumentUpload] IMAGING EXCEPTION for ${docType.name}:`, imgErr.message);
            }
          } else {
            console.error(`[DocumentUpload] No imaging bucket configured for ${docType.name} - skipping imaging`);
          }
        }
      } catch (err: any) {
        console.error(`[DocumentUpload] UNHANDLED ERROR processing ${docType.name}:`, err.message, err.stack);
      }
    }
    console.log('[DocumentUpload] ========== DOCUMENT UPLOADS COMPLETE ==========');
  };

  const resolveRenameTemplate = (template: string, documentTypeName: string, originalFileName: string, workflowResponse?: any): string => {
    if (!template) return originalFileName;
    const ext = originalFileName.split('.').pop() || 'pdf';
    const now = new Date();
    let result = template
      .replace(/\{\{documentType\}\}/g, documentTypeName.replace(/[^a-zA-Z0-9_-]/g, '_'))
      .replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
      .replace(/\{\{timestamp\}\}/g, String(Math.floor(now.getTime() / 1000)))
      .replace(/\{\{clientCode\}\}/g, (clientCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_'));

    if (workflowResponse && typeof workflowResponse === 'object') {
      for (const [key, value] of Object.entries(workflowResponse)) {
        if (typeof value === 'string' || typeof value === 'number') {
          result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value).replace(/[^a-zA-Z0-9_-]/g, '_'));
        }
      }
    }

    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === 'string' || typeof value === 'number') {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value).replace(/[^a-zA-Z0-9_-]/g, '_'));
      }
    }
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    if (!result.endsWith(`.${ext}`)) result += `.${ext}`;
    return result;
  };

  const handleSubmitAnother = () => {
    setShowSuccessModal(false);
    setSubmitSuccess(false);
    setSubmissionResult(null);
    setUploadedPdfId(null);
    setAiExtractedFields(new Set());
    setConfidenceScores({});
    setPdfResetTrigger(prev => prev + 1);
    setUploadedDocuments({});
    setDocumentErrors({});

    const initialFormData: Record<string, any> = {};

    fieldGroups.forEach(group => {
      if (group.parentGroupId) return;
      if (group.isArrayGroup) {
        const groupFields = fields.filter(f => f.fieldGroupId === group.id);
        const minRows = group.arrayMinRows || 1;
        const childGroupsForThis = fieldGroups.filter(g => g.parentGroupId === group.id);
        const rowData = Array.from({ length: minRows }, () => {
          const row: Record<string, any> = {};
          groupFields.forEach(field => {
            if (field.useClientIdDefault && clientCode) {
              row[field.fieldName] = clientCode;
            } else if (field.defaultValue) {
              row[field.fieldName] = field.fieldType === 'boolean'
                ? field.defaultValue.toLowerCase() === 'true'
                : field.defaultValue;
            } else if (field.fieldType === 'boolean') {
              row[field.fieldName] = false;
            } else if (field.fieldType === 'file') {
              row[field.fieldName] = [];
            } else {
              row[field.fieldName] = '';
            }
          });
          childGroupsForThis.forEach(child => {
            row[`_child_${child.id}`] = [];
          });
          return row;
        });
        initialFormData[group.id] = rowData;
      }
    });

    fields.forEach((field: OrderEntryField) => {
      const group = fieldGroups.find(g => g.id === field.fieldGroupId);
      if (group?.isArrayGroup) {
        return;
      }

      if (field.useClientIdDefault && clientCode) {
        initialFormData[field.fieldName] = clientCode;
      } else if (field.defaultValue) {
        initialFormData[field.fieldName] = field.fieldType === 'boolean'
          ? field.defaultValue.toLowerCase() === 'true'
          : field.defaultValue;
      } else if (field.isArrayField) {
        initialFormData[field.fieldName] = Array.from({ length: field.arrayMinRows || 1 }, () => ({}));
      } else if (field.fieldType === 'boolean') {
        initialFormData[field.fieldName] = false;
      } else if (field.fieldType === 'file') {
        initialFormData[field.fieldName] = [];
      } else {
        initialFormData[field.fieldName] = '';
      }
    });
    setFormData(initialFormData);
    setErrors({});
    setTouched({});
    setError(null);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 0);
  };

  const handleClearForm = () => {
    const initialFormData: Record<string, any> = {};

    fieldGroups.forEach(group => {
      if (group.parentGroupId) return;
      if (group.isArrayGroup) {
        const groupFields = fields.filter(f => f.fieldGroupId === group.id);
        const minRows = group.arrayMinRows || 1;
        const childGroupsForThis = fieldGroups.filter(g => g.parentGroupId === group.id);
        const rowData = Array.from({ length: minRows }, () => {
          const row: Record<string, any> = {};
          groupFields.forEach(field => {
            if (field.useClientIdDefault && clientCode) {
              row[field.fieldName] = clientCode;
            } else if (field.defaultValue) {
              row[field.fieldName] = field.fieldType === 'boolean'
                ? field.defaultValue.toLowerCase() === 'true'
                : field.defaultValue;
            } else if (field.fieldType === 'boolean') {
              row[field.fieldName] = false;
            } else if (field.fieldType === 'file') {
              row[field.fieldName] = [];
            } else {
              row[field.fieldName] = '';
            }
          });
          childGroupsForThis.forEach(child => {
            row[`_child_${child.id}`] = [];
          });
          return row;
        });
        initialFormData[group.id] = rowData;
      }
    });

    fields.forEach((field: OrderEntryField) => {
      const group = fieldGroups.find(g => g.id === field.fieldGroupId);
      if (group?.isArrayGroup) {
        return;
      }

      if (field.useClientIdDefault && clientCode) {
        initialFormData[field.fieldName] = clientCode;
      } else if (field.defaultValue) {
        initialFormData[field.fieldName] = field.fieldType === 'boolean'
          ? field.defaultValue.toLowerCase() === 'true'
          : field.defaultValue;
      } else if (field.isArrayField) {
        initialFormData[field.fieldName] = Array.from({ length: field.arrayMinRows || 1 }, () => ({}));
      } else if (field.fieldType === 'boolean') {
        initialFormData[field.fieldName] = false;
      } else if (field.fieldType === 'file') {
        initialFormData[field.fieldName] = [];
      } else {
        initialFormData[field.fieldName] = '';
      }
    });

    setFormData(initialFormData);
    setErrors({});
    setTouched({});
    setAiExtractedFields(new Set());
    setConfidenceScores({});
    setUploadedPdfId(null);
    setPdfResetTrigger(prev => prev + 1);
    setError(null);
    setShowClearConfirmModal(false);
    setLoadedSavedTemplate(null);
    setLoadedAddressByGroup({});
    setUploadedDocuments({});
    setDocumentErrors({});
    toast.success('Form has been cleared');
  };

  const handleOpenLoadTemplates = async () => {
    if (!currentUser.clientId) return;
    setShowLoadTemplateModal(true);
    setLoadingTemplates(true);
    try {
      const templates = await fetchClientOrderTemplates(currentUser.clientId);
      setSavedTemplates(templates);
    } catch (err: any) {
      toast.error('Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim() || !currentUser.clientId) return;
    setSavingTemplate(true);
    try {
      const saved = await saveClientOrderTemplate({
        clientId: currentUser.clientId,
        userId: currentUser.id,
        templateName: saveTemplateName.trim(),
        formData,
        orderEntryTemplateId: templateId || null,
      });
      toast.success(`Template saved as ${saved.templateNumber}`);
      setShowSaveTemplateModal(false);
      setSaveTemplateName('');
    } catch (err: any) {
      toast.error('Failed to save template: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleLoadTemplate = (template: ClientOrderTemplate) => {
    const newFormData: Record<string, any> = { ...formData };

    fields.forEach((field: OrderEntryField) => {
      const group = fieldGroups.find(g => g.id === field.fieldGroupId);
      if (group?.isArrayGroup) return;
      if (group?.resetOnTemplateLoad) return;
      if (field.fieldName in template.formData) {
        newFormData[field.fieldName] = template.formData[field.fieldName];
      }
    });

    fieldGroups.forEach(group => {
      if (group.isArrayGroup && group.id in template.formData) {
        if (group.resetOnTemplateLoad) return;
        newFormData[group.id] = template.formData[group.id];
      }
    });

    setFormData(newFormData);
    setShowLoadTemplateModal(false);
    setTemplateSearchQuery('');
    setLoadedSavedTemplate(template);
    toast.success(`Loaded template: ${template.templateName}`);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      await deleteClientOrderTemplate(templateToDelete.id);
      setSavedTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
      toast.success('Template deleted');
      setTemplateToDelete(null);
    } catch (err: any) {
      toast.error('Failed to delete template');
    }
  };

  const handleUpdateTemplate = async () => {
    if (!loadedSavedTemplate) return;
    setUpdatingTemplate(true);
    try {
      await updateClientOrderTemplate(loadedSavedTemplate.id, formData);
      toast.success(`Template ${loadedSavedTemplate.templateNumber} updated`);
      setShowUpdateTemplateConfirm(false);
    } catch (err: any) {
      toast.error('Failed to update template: ' + (err.message || 'Unknown error'));
    } finally {
      setUpdatingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <FormSkeleton fields={10} />
      </div>
    );
  }

  const evaluateCondition = (depFieldId: string | null | undefined, operator: string | null | undefined, condValue: string | null | undefined, contextData: Record<string, any>): boolean => {
    if (!depFieldId || !operator) return false;
    const depField = fields.find(f => f.id === depFieldId);
    if (!depField) return false;
    const fieldValue = String(contextData[depField.fieldName] ?? '');
    const isEmpty = fieldValue === '';

    switch (operator) {
      case 'equals':
        if ((condValue || '').includes(',')) {
          const values = (condValue || '').split(',').map(v => v.trim().toLowerCase());
          return values.includes(fieldValue.toLowerCase());
        }
        return fieldValue.toLowerCase() === (condValue || '').toLowerCase();
      case 'not_equals':
        if ((condValue || '').includes(',')) {
          const values = (condValue || '').split(',').map(v => v.trim().toLowerCase());
          return !values.includes(fieldValue.toLowerCase());
        }
        return fieldValue.toLowerCase() !== (condValue || '').toLowerCase();
      case 'in': {
        const values = (condValue || '').split(',').map(v => v.trim().toLowerCase());
        return values.includes(fieldValue.toLowerCase());
      }
      case 'not_in': {
        const values = (condValue || '').split(',').map(v => v.trim().toLowerCase());
        return !values.includes(fieldValue.toLowerCase());
      }
      case 'is_empty':
        return isEmpty;
      case 'is_not_empty':
        return !isEmpty;
      default:
        return false;
    }
  };

  const isFieldVisible = (field: OrderEntryField, contextData: Record<string, any>): boolean => {
    if (field.hiddenFromClient) return false;
    if (!field.conditionalVisibilityFieldId || !field.conditionalVisibilityOperator) return true;
    return evaluateCondition(field.conditionalVisibilityFieldId, field.conditionalVisibilityOperator, field.conditionalVisibilityValue, contextData);
  };

  const isFieldConditionallyRequired = (field: OrderEntryField, contextData: Record<string, any>): boolean => {
    if (!field.conditionalRequiredFieldId || !field.conditionalRequiredOperator) return false;
    return evaluateCondition(field.conditionalRequiredFieldId, field.conditionalRequiredOperator, field.conditionalRequiredValue, contextData);
  };

  const renderField = (field: OrderEntryField) => {
    if (field.apiLookupEndpoint || field.fieldType === 'api_lookup') {
    }
    const value = formData[field.fieldName];
    const error = touched[field.fieldName] ? errors[field.fieldName] : undefined;
    const effectiveField = isFieldConditionallyRequired(field, formData)
      ? { ...field, isRequired: true }
      : field;

    const commonProps = {
      field: effectiveField,
      error,
      onBlur: () => handleFieldBlur(field.fieldName)
    };

    if (field.isArrayField) {
      const arrayFields = fields.filter(f => f.fieldGroupId === field.fieldGroupId && !f.isArrayField);
      return (
        <ArrayFieldSection
          {...commonProps}
          arrayFields={arrayFields}
          values={value || []}
          errors={errors[field.fieldName]}
          onChange={(v) => handleFieldChange(field.fieldName, v)}
        />
      );
    }

    let fieldComponent;
    const isTypeaheadField = field.addressBookField === 'name' &&
      fieldGroups.find(g => g.id === field.fieldGroupId)?.addressBookEnabled &&
      clientAddresses.length > 0;

    switch (field.fieldType) {
      case 'text':
        if (isTypeaheadField) {
          const typeaheadResults = typeaheadField === field.fieldName ? getTypeaheadResults(field) : [];
          fieldComponent = (
            <div className="relative" data-address-typeahead>
              <TextField {...commonProps} value={value} onChange={(v) => handleTypeaheadChange(field, v)} />
              {typeaheadField === field.fieldName && typeaheadResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  {typeaheadResults.map(address => (
                    <button
                      key={address.id}
                      type="button"
                      onClick={() => {
                        handleAddressSelect(field.fieldGroupId, address);
                        setTypeaheadField(null);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{address.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {address.city}, {address.stateProv}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        } else {
          fieldComponent = <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        }
        break;
      case 'number':
        fieldComponent = <NumberField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'date':
        fieldComponent = <DateField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} disabledDates={holidayDates} />;
        break;
      case 'datetime':
        fieldComponent = <DateTimeField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'phone':
        fieldComponent = <PhoneField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'zip':
        fieldComponent = <ZipField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'postal_code':
        fieldComponent = <PostalCodeField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'zip_postal':
        fieldComponent = <ZipPostalField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'province':
        fieldComponent = <ProvinceField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'state':
        fieldComponent = <StateField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'dropdown':
        fieldComponent = <DropdownField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'file':
        fieldComponent = <FileField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'boolean':
        fieldComponent = <BooleanField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
        break;
      case 'api_lookup':
        fieldComponent = <ApiLookupField {...commonProps} onOpenLookup={() => { setApiLookupField(field); setApiLookupRowContext(null); }} />;
        break;
      default:
        fieldComponent = <TextField {...commonProps} value={value} onChange={(v) => handleFieldChange(field.fieldName, v)} />;
    }

    return fieldComponent;
  };

  const getFieldLayout = (fieldId: string) => {
    return layouts.find(l => l.fieldId === fieldId);
  };

  const groupFieldsByRow = (groupFields: OrderEntryField[]) => {
    const fieldsByRow = new Map<number, Array<{ field: OrderEntryField; layout: any }>>();

    groupFields.forEach(field => {
      const layout = getFieldLayout(field.id);
      const row = layout?.rowIndex ?? 999;

      if (!fieldsByRow.has(row)) {
        fieldsByRow.set(row, []);
      }

      fieldsByRow.get(row)!.push({ field, layout });
    });

    Array.from(fieldsByRow.keys()).forEach(row => {
      fieldsByRow.get(row)!.sort((a, b) => {
        const colA = a.layout?.columnIndex ?? 0;
        const colB = b.layout?.columnIndex ?? 0;
        return colA - colB;
      });
    });

    return fieldsByRow;
  };

  if (configError || !config?.isEnabled) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 flex items-start">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 mr-4 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-300 mb-2">
              Form Unavailable
            </h3>
            <p className="text-red-700 dark:text-red-400">
              {configError || 'The order entry form is currently unavailable.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (fieldGroups.length === 0 || fields.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 text-center">
          <ClipboardList className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
            No Form Configured
          </h3>
          <p className="text-yellow-700 dark:text-yellow-400">
            The form has not been set up yet. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const errorCount = Object.keys(errors).length;
  const isFormValid = errorCount === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 dark:text-gray-400">
              Fill out the form below or upload a document to autofill.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleOpenLoadTemplates}
              className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Load Template
            </button>
            {!hidePdfAutofill && (
            <PdfUploadSection
            userId={currentUser.id}
            fields={fields}
            onExtractionComplete={handleExtractionComplete}
            onPdfUpload={(pdfId) => setUploadedPdfId(pdfId)}
            onUploadStart={() => toast.info('Uploading PDF...')}
            onUploadError={(error) => toast.error(`Failed to upload PDF: ${error}`)}
            onExtractionStart={() => toast.info('Extracting data from PDF...')}
            onExtractionError={(error) => toast.error(`Failed to extract PDF data: ${error}`)}
            compact
            resetTrigger={pdfResetTrigger}
          />
            )}
          </div>
        </div>
      </div>

      {submitSuccess && (
        <div className="rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 flex items-start">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
              Success!
            </h4>
            <p className="text-sm text-green-700 dark:text-green-400">
              Your order has been submitted successfully.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
              Error
            </h4>
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {errorCount > 0 && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                Please fix {errorCount} error{errorCount !== 1 ? 's' : ''} before submitting:
              </h4>
              <ul className="space-y-2">
                {Object.entries(errors).slice(0, 5).map(([fieldName, error]) => {
                  const field = fields.find(f => f.fieldName === fieldName);
                  const group = !field ? fieldGroups.find(g => g.id === fieldName) : null;
                  const displayLabel = field?.fieldLabel || group?.groupLabel || fieldName;
                  const displayError = typeof error === 'string' ? error : (group ? 'Has validation errors in one or more rows' : 'Invalid value');
                  return (
                    <li key={fieldName} className="flex items-start space-x-2">
                      {field && <FieldTypeIcon fieldType={field.fieldType} size="sm" className="mt-0.5 flex-shrink-0" />}
                      <span className="text-sm text-red-700 dark:text-red-400">
                        <span className="font-medium">{displayLabel}:</span> {displayError}
                      </span>
                    </li>
                  );
                })}
                {errorCount > 5 && (
                  <li className="text-sm text-red-600 dark:text-red-400 font-medium ml-6">
                    ... and {errorCount - 5} more errors
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {fieldGroups.map(group => {
          if (group.isHidden) return null;
          if (group.parentGroupId) return null;
          const groupFields = fields.filter(f => f.fieldGroupId === group.id);
          if (groupFields.length === 0) return null;

          if (group.isArrayGroup) {
            const childGroupsForThis: ChildGroupInfo[] = fieldGroups
              .filter(g => g.parentGroupId === group.id && g.isArrayGroup)
              .map(childGroup => ({
                group: childGroup,
                fields: fields.filter(f => f.fieldGroupId === childGroup.id),
                layouts: layouts.filter(l => fields.find(f => f.id === l.fieldId && f.fieldGroupId === childGroup.id))
              }));

            return (
              <div
                key={group.id}
                className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg p-6 transition-all"
              >
                <GroupedArrayTable
                  group={group}
                  fields={groupFields}
                  layouts={layouts}
                  values={formData[group.id] || []}
                  errors={errors[group.id]}
                  onChange={(values) => handleFieldChange(group.id, values)}
                  onBlur={(rowIndex, fieldName) => {
                    setTouched(prev => ({ ...prev, [`${group.id}.${rowIndex}.${fieldName}`]: true }));
                  }}
                  onOpenLookup={(field, rowIndex) => {
                    setApiLookupField(field);
                    setApiLookupRowContext({ groupId: group.id, rowIndex });
                  }}
                  childGroups={childGroupsForThis}
                  onOpenChildGroup={(childGroup, rowIndex) => {
                    setChildGroupModal({ childGroup, parentGroupId: group.id, rowIndex });
                  }}
                />
              </div>
            );
          }

          const fieldsByRow = groupFieldsByRow(groupFields);
          const sortedRows = Array.from(fieldsByRow.keys()).sort((a, b) => a - b);

          return (
            <div
              key={group.id}
              className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg p-6 transition-all"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {group.groupName}
                    </h2>
                    {group.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {group.description}
                      </p>
                    )}
                  </div>
                </div>

                {group.addressBookEnabled && clientAddresses.length > 0 && (
                  <div className="flex flex-col items-end gap-2">
                    <div className="relative" data-address-book-dropdown>
                      <button
                        type="button"
                        onClick={() => setAddressBookOpen(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                      >
                        <BookUser className="h-4 w-4" />
                        Address Book
                      </button>

                      {addressBookOpen[group.id] && (
                        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                            <input
                              type="text"
                              placeholder="Search addresses..."
                              value={addressSearchQuery[group.id] || ''}
                              onChange={(e) => setAddressSearchQuery(prev => ({ ...prev, [group.id]: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                          </div>
                          <div className="max-h-60 overflow-y-auto">
                            {getFilteredAddresses(group.id).length === 0 ? (
                              <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                                No addresses found
                              </div>
                            ) : (
                              getFilteredAddresses(group.id).map(address => (
                                <button
                                  key={address.id}
                                  type="button"
                                  onClick={() => handleAddressSelect(group.id, address)}
                                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                                >
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{address.name}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {address.address1}, {address.city}, {address.stateProv}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {isAddressDirty(group.id) && (
                      <button
                        type="button"
                        onClick={() => handleUpdateAddress(group.id)}
                        disabled={updatingAddress === group.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                      >
                        {updatingAddress === group.id ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Update Address
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {sortedRows.map(rowIndex => {
                  const rowFields = fieldsByRow.get(rowIndex)!;

                  return (
                    <div key={rowIndex} className="grid grid-cols-12 gap-4">
                      {rowFields.map(({ field, layout }) => {
                        if (!isFieldVisible(field, formData)) return null;
                        const widthCols = layout?.widthColumns || 12;
                        const colSpanClass = `col-span-12 md:col-span-${widthCols}`;

                        return (
                          <div key={field.id} className={colSpanClass}>
                            {renderField(field)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {documentTypes.length > 0 && (
          <DocumentUploadSection
            documentTypes={documentTypes}
            uploadedFiles={uploadedDocuments}
            onFileSelect={(docTypeId, file) => {
              setUploadedDocuments(prev => ({ ...prev, [docTypeId]: file }));
              setDocumentErrors(prev => { const next = { ...prev }; delete next[docTypeId]; return next; });
            }}
            onFileRemove={(docTypeId) => {
              setUploadedDocuments(prev => { const next = { ...prev }; delete next[docTypeId]; return next; });
            }}
            errors={documentErrors}
          />
        )}

        <div className="flex items-center justify-end space-x-4 pt-6 border-t border-slate-200 dark:border-gray-700 rounded-2xl border border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg shadow-lg p-6 sticky bottom-0">
          <button
            type="button"
            onClick={() => setShowClearConfirmModal(true)}
            className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            Cancel
          </button>
          {loadedSavedTemplate && (
            <button
              type="button"
              onClick={() => setShowUpdateTemplateConfirm(true)}
              className="px-6 py-2.5 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors font-medium flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>Save Template</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSaveTemplateModal(true)}
            className="px-6 py-2.5 border border-teal-300 dark:border-teal-600 text-teal-700 dark:text-teal-300 rounded-full hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors font-medium flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>Save New Template</span>
          </button>
          <button
            type="submit"
            disabled={submitting || !isFormValid}
            className="px-6 py-2.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {submitting ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Submit BOL</span>
              </>
            )}
          </button>
        </div>
      </form>

      <SubmissionLoadingOverlay
        isVisible={submitting}
        currentStep={submissionStep}
        companyName={companyName}
      />

      <SubmissionSuccessModal
        isOpen={showSuccessModal}
        submissionId={submissionResult?.submissionId || ''}
        apiResponse={submissionResult?.apiResponse}
        workflowExecutionId={submissionResult?.workflowExecutionId}
        confirmationNumberField={confirmationNumberField}
        onClose={() => setShowSuccessModal(false)}
        onSubmitAnother={handleSubmitAnother}
      />

      {apiLookupField && (
        <ApiLookupModal
          field={apiLookupField}
          formData={formData}
          onSelect={(result) => handleApiLookupSelect(apiLookupField, result)}
          onClose={() => { setApiLookupField(null); setApiLookupRowContext(null); }}
        />
      )}

      {childGroupModal && (
        <ChildGroupModal
          group={childGroupModal.childGroup.group}
          fields={childGroupModal.childGroup.fields}
          layouts={childGroupModal.childGroup.layouts}
          values={(formData[childGroupModal.parentGroupId] || [])[childGroupModal.rowIndex]?.[`_child_${childGroupModal.childGroup.group.id}`] || []}
          parentRowIndex={childGroupModal.rowIndex}
          onSave={(childValues) => {
            const parentRows = [...(formData[childGroupModal.parentGroupId] || [])];
            parentRows[childGroupModal.rowIndex] = {
              ...parentRows[childGroupModal.rowIndex],
              [`_child_${childGroupModal.childGroup.group.id}`]: childValues
            };
            handleFieldChange(childGroupModal.parentGroupId, parentRows);
          }}
          onClose={() => setChildGroupModal(null)}
        />
      )}

      <Modal
        isOpen={showClearConfirmModal}
        onClose={() => setShowClearConfirmModal(false)}
        title="Clear Form"
        size="sm"
      >
        <div className="p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Start Over?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-1">
                Would you like to clear this form and start fresh?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                This will reset all fields including any AI-extracted data.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowClearConfirmModal(false)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={handleClearForm}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Clear Form</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showSaveTemplateModal}
        onClose={() => { setShowSaveTemplateModal(false); setSaveTemplateName(''); }}
        title="Save as New Template"
        size="sm"
      >
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Save the current form data as a reusable template. You'll receive a unique template number.
          </p>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Template Name *
          </label>
          <input
            type="text"
            value={saveTemplateName}
            onChange={(e) => setSaveTemplateName(e.target.value)}
            placeholder="e.g., Weekly Shipment to Toronto"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && saveTemplateName.trim()) handleSaveTemplate(); }}
          />
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => { setShowSaveTemplateModal(false); setSaveTemplateName(''); }}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!saveTemplateName.trim() || savingTemplate}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingTemplate ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{savingTemplate ? 'Saving...' : 'Save New Template'}</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showUpdateTemplateConfirm}
        onClose={() => setShowUpdateTemplateConfirm(false)}
        title="Update Existing Template"
        size="sm"
      >
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Are you sure you want to update template <span className="font-semibold text-gray-900 dark:text-gray-100">{loadedSavedTemplate?.templateNumber}</span> ({loadedSavedTemplate?.templateName})? This will overwrite the previously saved form data.
          </p>
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowUpdateTemplateConfirm(false)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdateTemplate}
              disabled={updatingTemplate}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updatingTemplate ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{updatingTemplate ? 'Updating...' : 'Update Template'}</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showLoadTemplateModal}
        onClose={() => { setShowLoadTemplateModal(false); setTemplateSearchQuery(''); }}
        title="Load Template"
        size="md"
      >
        <div className="p-6">
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading templates...</span>
            </div>
          ) : savedTemplates.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">No saved templates</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Fill out the form and click "Save Template" to create one.
              </p>
            </div>
          ) : (
            <>
              {savedTemplates.length > 5 && (
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                </div>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {savedTemplates
                  .filter(t => {
                    if (!templateSearchQuery.trim()) return true;
                    const q = templateSearchQuery.toLowerCase();
                    return t.templateName.toLowerCase().includes(q) || t.templateNumber.toLowerCase().includes(q);
                  })
                  .map(template => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors group"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadTemplate(template)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300">
                            {template.templateNumber}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {template.templateName}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-[52px]">
                          Created {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setTemplateToDelete(template); }}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        title="Delete Template"
        size="sm"
      >
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete template <span className="font-medium text-gray-900 dark:text-white">{templateToDelete?.templateName}</span> ({templateToDelete?.templateNumber})?
          </p>
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setTemplateToDelete(null)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteTemplate}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
    </div>
  );
}
