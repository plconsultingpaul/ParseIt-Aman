import React, { useState, useEffect, useMemo } from 'react';
import { Play, GitBranch, Calendar, MapPin, X, Combine } from 'lucide-react';
import { FieldMappingFunction, FunctionType, ConditionalFunctionLogic, DateFunctionLogic, AddressLookupFunctionLogic, DateTimeMergeFunctionLogic, FunctionCondition } from '../../types';
import { ConditionBuilder } from './ConditionBuilder';
import { DateFunctionBuilder } from './DateFunctionBuilder';
import { fieldMappingFunctionService } from '../../services/fieldMappingFunctionService';
import Modal from '../common/Modal';
import CustomDropdown from '../common/CustomDropdown';

interface AvailableField {
  fieldName: string;
  dataType?: string;
}

interface FunctionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  functionData: FieldMappingFunction | null;
  extractionTypeId?: string;
  workflowNodeId?: string;
  flowNodeId?: string;
  availableFields: AvailableField[];
  onSave: () => void;
}

const DEFAULT_DATE_LOGIC: DateFunctionLogic = {
  type: 'date',
  source: 'current_date',
  operation: 'add',
  days: 0,
  outputFormat: 'YYYY-MM-DD',
};

const DEFAULT_ADDRESS_LOOKUP_LOGIC: AddressLookupFunctionLogic = {
  type: 'address_lookup',
  inputFields: [],
  lookupType: 'postal_code',
  countryContext: 'Canada',
};

const DEFAULT_DATETIME_MERGE_LOGIC: DateTimeMergeFunctionLogic = {
  type: 'datetime_merge',
  dateFieldName: '',
  timeFieldName: '',
  outputFormat: 'YYYY-MM-DDTHH:mm:ss',
};

export const FunctionEditorModal: React.FC<FunctionEditorModalProps> = ({
  isOpen,
  onClose,
  functionData,
  extractionTypeId,
  workflowNodeId,
  flowNodeId,
  availableFields,
  onSave,
}) => {
  const [functionName, setFunctionName] = useState('');
  const [description, setDescription] = useState('');
  const [functionType, setFunctionType] = useState<FunctionType>('conditional');
  const [conditions, setConditions] = useState<FunctionCondition[]>([]);
  const [defaultValue, setDefaultValue] = useState('');
  const [dateLogic, setDateLogic] = useState<DateFunctionLogic>(DEFAULT_DATE_LOGIC);
  const [addressLookupLogic, setAddressLookupLogic] = useState<AddressLookupFunctionLogic>(DEFAULT_ADDRESS_LOOKUP_LOGIC);
  const [dateTimeMergeLogic, setDateTimeMergeLogic] = useState<DateTimeMergeFunctionLogic>(DEFAULT_DATETIME_MERGE_LOGIC);
  const [testData, setTestData] = useState('');
  const [testValue, setTestValue] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const fieldNames = useMemo(() => availableFields.map(f => f.fieldName), [availableFields]);

  const generateTestDataFromConditions = (conds: FunctionCondition[]) => {
    const testObj: Record<string, any> = {};

    conds.forEach(condition => {
      if (condition.if?.field && condition.if?.value !== undefined) {
        const parts = condition.if.field.split('.');
        let current = testObj;

        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        const lastPart = parts[parts.length - 1];
        if (current[lastPart] === undefined) {
          const value = Array.isArray(condition.if.value) ? condition.if.value[0] : condition.if.value;
          current[lastPart] = value;
        }
      }
    });

    return Object.keys(testObj).length > 0 ? JSON.stringify(testObj, null, 2) : '';
  };

  const isDateFunctionLogic = (logic: any): logic is DateFunctionLogic => {
    return logic && logic.type === 'date';
  };

  const isAddressLookupFunctionLogic = (logic: any): logic is AddressLookupFunctionLogic => {
    return logic && logic.type === 'address_lookup';
  };

  const isDateTimeMergeFunctionLogic = (logic: any): logic is DateTimeMergeFunctionLogic => {
    return logic && logic.type === 'datetime_merge';
  };

  useEffect(() => {
    if (functionData) {
      setFunctionName(functionData.function_name);
      setDescription(functionData.description || '');
      setFunctionType(functionData.function_type || 'conditional');

      if (isDateFunctionLogic(functionData.function_logic)) {
        setDateLogic(functionData.function_logic);
        setConditions([]);
        setDefaultValue('');
        setAddressLookupLogic(DEFAULT_ADDRESS_LOOKUP_LOGIC);
        setDateTimeMergeLogic(DEFAULT_DATETIME_MERGE_LOGIC);
        setTestData('');
      } else if (isAddressLookupFunctionLogic(functionData.function_logic)) {
        setAddressLookupLogic(functionData.function_logic);
        setConditions([]);
        setDefaultValue(functionData.function_logic.defaultValue || '');
        setDateLogic(DEFAULT_DATE_LOGIC);
        setDateTimeMergeLogic(DEFAULT_DATETIME_MERGE_LOGIC);
        setTestData('');
      } else if (isDateTimeMergeFunctionLogic(functionData.function_logic)) {
        setDateTimeMergeLogic(functionData.function_logic);
        setConditions([]);
        setDefaultValue('');
        setDateLogic(DEFAULT_DATE_LOGIC);
        setAddressLookupLogic(DEFAULT_ADDRESS_LOOKUP_LOGIC);
        setTestData('');
      } else {
        const conditionalLogic = functionData.function_logic as ConditionalFunctionLogic;
        setConditions(conditionalLogic.conditions || []);
        setDefaultValue(conditionalLogic.default || '');
        setTestData(generateTestDataFromConditions(conditionalLogic.conditions || []));
        setDateLogic(DEFAULT_DATE_LOGIC);
        setAddressLookupLogic(DEFAULT_ADDRESS_LOOKUP_LOGIC);
        setDateTimeMergeLogic(DEFAULT_DATETIME_MERGE_LOGIC);
      }
    } else {
      setFunctionName('');
      setDescription('');
      setFunctionType('conditional');
      setConditions([]);
      setDefaultValue('');
      setDateLogic(DEFAULT_DATE_LOGIC);
      setAddressLookupLogic(DEFAULT_ADDRESS_LOOKUP_LOGIC);
      setDateTimeMergeLogic(DEFAULT_DATETIME_MERGE_LOGIC);
      setTestData('');
      setTestValue('');
    }
    setTestResult(null);
    setError('');
  }, [functionData, isOpen]);

  useEffect(() => {
    const generatedData = generateTestDataFromConditions(conditions);
    if (generatedData) {
      setTestData(generatedData);
    }
  }, [conditions]);

  const handleTestFunction = async () => {
    try {
      if (functionType === 'date') {
        let parsedTestData: Record<string, any> = {};

        if (dateLogic.source === 'field' && testValue.trim()) {
          if (dateLogic.fieldName) {
            const parts = dateLogic.fieldName.split('.');
            let current = parsedTestData;
            for (let i = 0; i < parts.length - 1; i++) {
              current[parts[i]] = {};
              current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = testValue.trim();
          } else {
            parsedTestData = { date: testValue.trim() };
          }
        } else if (testData.trim()) {
          parsedTestData = JSON.parse(testData);
        }

        const result = fieldMappingFunctionService.testFunction(dateLogic, parsedTestData);
        setTestResult({
          input: dateLogic.source === 'current_date' ? 'Current Date' : (testValue.trim() || parsedTestData),
          output: result
        });
        setError('');
        return;
      }

      if (functionType === 'datetime_merge') {
        let parsedTestData: Record<string, any> = {};
        if (testData.trim()) {
          parsedTestData = JSON.parse(testData);
        } else {
          setError(`Please enter JSON test data containing "${dateTimeMergeLogic.dateFieldName}" and "${dateTimeMergeLogic.timeFieldName}"`);
          setTestResult(null);
          return;
        }
        const result = fieldMappingFunctionService.testFunction(dateTimeMergeLogic, parsedTestData);
        setTestResult({ input: parsedTestData, output: result });
        setError('');
        return;
      }

      if (functionType === 'address_lookup') {
        if (addressLookupLogic.inputFields.length === 0) {
          setError('Please select at least one input field');
          setTestResult(null);
          return;
        }

        let parsedTestData: Record<string, any> = {};
        if (testData.trim()) {
          parsedTestData = JSON.parse(testData);
        } else {
          setError('Please enter test data with address fields');
          setTestResult(null);
          return;
        }

        const result = await fieldMappingFunctionService.testAddressLookup(addressLookupLogic, parsedTestData);
        setTestResult({
          input: parsedTestData,
          output: result
        });
        setError('');
        return;
      }

      let parsedTestData: Record<string, any>;

      if (testValue.trim()) {
        if (conditions.length > 0 && conditions[0]?.if?.field) {
          const fieldPath = conditions[0].if.field;
          const parts = fieldPath.split('.');
          parsedTestData = {};
          let current = parsedTestData;

          for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = {};
            current = current[parts[i]];
          }

          current[parts[parts.length - 1]] = testValue.trim();
        } else {
          parsedTestData = { value: testValue.trim() };
        }
      } else if (testData.trim()) {
        parsedTestData = JSON.parse(testData);
      } else {
        setError('Please enter a test value or test data');
        setTestResult(null);
        return;
      }

      const functionLogic: ConditionalFunctionLogic = { conditions, default: defaultValue };
      const result = fieldMappingFunctionService.testFunction(functionLogic, parsedTestData);
      setTestResult({ input: testValue.trim() || parsedTestData, output: result });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid test data');
      setTestResult(null);
    }
  };

  const handleSave = async () => {
    if (!functionName.trim()) {
      setError('Function name is required');
      return;
    }

    if (functionType === 'date' && dateLogic.source === 'field' && !dateLogic.fieldName) {
      setError('Please select a source field for the date calculation');
      return;
    }

    if (functionType === 'address_lookup' && addressLookupLogic.inputFields.length === 0) {
      setError('Please select at least one input field for the address lookup');
      return;
    }

    if (functionType === 'datetime_merge') {
      if (!dateTimeMergeLogic.dateFieldName) {
        setError('Please select a Date field');
        return;
      }
      if (!dateTimeMergeLogic.timeFieldName) {
        setError('Please select a Time field');
        return;
      }
    }

    setIsSaving(true);
    setError('');

    try {
      let functionLogic;
      if (functionType === 'date') {
        functionLogic = dateLogic;
      } else if (functionType === 'address_lookup') {
        functionLogic = addressLookupLogic;
      } else if (functionType === 'datetime_merge') {
        functionLogic = dateTimeMergeLogic;
      } else {
        functionLogic = { conditions, default: defaultValue || null };
      }

      if (functionData) {
        await fieldMappingFunctionService.updateFunction(functionData.id, {
          function_name: functionName,
          description: description || undefined,
          function_type: functionType,
          function_logic: functionLogic,
        });
      } else {
        await fieldMappingFunctionService.createFunction({
          ...(extractionTypeId ? { extraction_type_id: extractionTypeId } : {}),
          ...(workflowNodeId ? { workflow_v2_node_id: workflowNodeId } : {}),
          ...(flowNodeId ? { flow_node_id: flowNodeId } : {}),
          function_name: functionName,
          description: description || undefined,
          function_type: functionType,
          function_logic: functionLogic,
        });
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save function');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={functionData ? 'Edit Function' : 'Create Function'} zIndex={80}>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Function Name *
          </label>
          <input
            type="text"
            value={functionName}
            onChange={(e) => setFunctionName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., province_to_code"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Optional description of what this function does"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Function Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setFunctionType('conditional')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                functionType === 'conditional'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <GitBranch className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Conditional (IF/THEN)</div>
                <div className="text-xs opacity-75">Map values based on conditions</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFunctionType('date')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                functionType === 'date'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Calendar className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Date Calculation</div>
                <div className="text-xs opacity-75">Add/subtract days from dates</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFunctionType('address_lookup')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                functionType === 'address_lookup'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <MapPin className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Address Lookup</div>
                <div className="text-xs opacity-75">AI-powered address field lookup</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFunctionType('datetime_merge')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                functionType === 'datetime_merge'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Combine className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Merge Date + Time</div>
                <div className="text-xs opacity-75">Combine a Date and Time into one DateTime</div>
              </div>
            </button>
          </div>
        </div>

        {functionType === 'conditional' && (
          <>
            <ConditionBuilder
              conditions={conditions}
              availableFields={fieldNames}
              onChange={setConditions}
              onSave={handleSave}
              isSaving={isSaving}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Value
              </label>
              <input
                type="text"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Value to return if no conditions match"
              />
            </div>
          </>
        )}

        {functionType === 'date' && (
          <DateFunctionBuilder
            dateLogic={dateLogic}
            availableFields={availableFields}
            onChange={setDateLogic}
          />
        )}

        {functionType === 'address_lookup' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Input Fields (Address Components)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Select the fields that contain the address information to use for lookup
              </p>
              <div className="space-y-2">
                <CustomDropdown
                  value=""
                  onChange={(value) => {
                    if (value && !addressLookupLogic.inputFields.includes(value)) {
                      setAddressLookupLogic({
                        ...addressLookupLogic,
                        inputFields: [...addressLookupLogic.inputFields, value]
                      });
                    }
                  }}
                  options={fieldNames
                    .filter(f => !addressLookupLogic.inputFields.includes(f))
                    .map(field => ({ value: field, label: field }))
                  }
                  placeholder="Add a field..."
                />
                {addressLookupLogic.inputFields.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {addressLookupLogic.inputFields.map((field, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm"
                      >
                        <span>{field}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAddressLookupLogic({
                              ...addressLookupLogic,
                              inputFields: addressLookupLogic.inputFields.filter((_, i) => i !== index)
                            });
                          }}
                          className="hover:text-blue-600 dark:hover:text-blue-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Lookup Type (What to Return)
              </label>
              <CustomDropdown
                value={addressLookupLogic.lookupType}
                onChange={(value) => setAddressLookupLogic({
                  ...addressLookupLogic,
                  lookupType: value as AddressLookupFunctionLogic['lookupType']
                })}
                options={[
                  { value: 'postal_code', label: 'Postal Code / ZIP Code' },
                  { value: 'city', label: 'City' },
                  { value: 'province', label: 'Province / State' },
                  { value: 'country', label: 'Country' },
                  { value: 'full_address', label: 'Full Formatted Address' },
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Country Context (Optional)
              </label>
              <CustomDropdown
                value={addressLookupLogic.countryContext || ''}
                onChange={(value) => setAddressLookupLogic({
                  ...addressLookupLogic,
                  countryContext: value || undefined
                })}
                options={[
                  { value: '', label: 'Auto-detect' },
                  { value: 'Canada', label: 'Canada' },
                  { value: 'United States', label: 'United States' },
                  { value: 'Mexico', label: 'Mexico' },
                ]}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Helps AI provide more accurate results for the specified country
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Value (Fallback)
              </label>
              <input
                type="text"
                value={addressLookupLogic.defaultValue || ''}
                onChange={(e) => setAddressLookupLogic({
                  ...addressLookupLogic,
                  defaultValue: e.target.value || undefined
                })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Value to return if lookup fails or returns empty"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                If the AI cannot determine a value, this fallback will be used instead
              </p>
            </div>
          </div>
        )}

        {functionType === 'datetime_merge' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date Field *
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Select the WFO field that contains the date portion.
              </p>
              <CustomDropdown
                value={dateTimeMergeLogic.dateFieldName}
                onChange={(value) => setDateTimeMergeLogic({ ...dateTimeMergeLogic, dateFieldName: value })}
                options={availableFields
                  .filter(f => !f.dataType || f.dataType === 'date' || f.dataType === 'datetime' || f.dataType === 'string')
                  .map(f => ({ value: f.fieldName, label: f.dataType ? `${f.fieldName} (${f.dataType})` : f.fieldName }))}
                placeholder="Select a date field..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Time Field *
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Select the WFO field that contains the time portion.
              </p>
              <CustomDropdown
                value={dateTimeMergeLogic.timeFieldName}
                onChange={(value) => setDateTimeMergeLogic({ ...dateTimeMergeLogic, timeFieldName: value })}
                options={availableFields
                  .filter(f => !f.dataType || f.dataType === 'time' || f.dataType === 'datetime' || f.dataType === 'string')
                  .map(f => ({ value: f.fieldName, label: f.dataType ? `${f.fieldName} (${f.dataType})` : f.fieldName }))}
                placeholder="Select a time field..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Input Date Format (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Only needed to disambiguate numeric dates like 03/04/2026.
              </p>
              <CustomDropdown
                value={dateTimeMergeLogic.inputDateFormat || ''}
                onChange={(value) => setDateTimeMergeLogic({
                  ...dateTimeMergeLogic,
                  inputDateFormat: (value || undefined) as DateTimeMergeFunctionLogic['inputDateFormat'],
                })}
                options={[
                  { value: '', label: 'Auto-detect' },
                  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU)' },
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
                  { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY' },
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default Time When Empty (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Used when the time field is blank or unparseable. Use 00:00:00 for "start of day" fields and 23:59:59 for "end of day" fields. Leave blank to default to 00:00:00.
              </p>
              <input
                type="text"
                value={dateTimeMergeLogic.emptyTimeDefault || ''}
                onChange={(e) => setDateTimeMergeLogic({
                  ...dateTimeMergeLogic,
                  emptyTimeDefault: e.target.value || undefined,
                })}
                placeholder="e.g., 23:59:59"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Output Format *
              </label>
              <CustomDropdown
                value={dateTimeMergeLogic.outputFormat}
                onChange={(value) => setDateTimeMergeLogic({
                  ...dateTimeMergeLogic,
                  outputFormat: value as DateTimeMergeFunctionLogic['outputFormat'],
                })}
                options={[
                  { value: 'YYYY-MM-DDTHH:mm:ss', label: 'YYYY-MM-DDTHH:mm:ss (ISO, no TZ)' },
                  { value: 'YYYY-MM-DDTHH:mm:ssZ', label: 'YYYY-MM-DDTHH:mm:ssZ (ISO, UTC)' },
                  { value: 'YYYY-MM-DD HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss' },
                  { value: 'MM/DD/YYYY HH:mm:ss', label: 'MM/DD/YYYY HH:mm:ss' },
                  { value: 'MM/DD/YYYY HH:mm', label: 'MM/DD/YYYY HH:mm' },
                  { value: 'DD/MM/YYYY HH:mm:ss', label: 'DD/MM/YYYY HH:mm:ss' },
                  { value: 'DD/MM/YYYY HH:mm', label: 'DD/MM/YYYY HH:mm' },
                ]}
              />
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Test Function</h4>
          <div className="space-y-3">
            {functionType === 'date' && dateLogic.source === 'current_date' ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Click "Test Function" to see the calculated date using the current date.
              </p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Test Value
                </label>
                <input
                  type="text"
                  value={testValue}
                  onChange={(e) => setTestValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={functionType === 'date' ? 'Enter a date value (e.g., 2025-12-18)' : 'Enter a test value (e.g., SITE2, BC, 123)'}
                />
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                Advanced: Test with JSON Data
              </summary>
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Test Data (auto-generated from conditions)
                </label>
                <textarea
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                  placeholder="Add conditions above to generate test data"
                />
              </div>
            </details>

            <button
              type="button"
              onClick={handleTestFunction}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Test Function
            </button>

            {testResult !== null && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="space-y-2">
                  <div>
                    <div className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">Input:</div>
                    <div className="text-sm text-green-900 dark:text-green-200 font-mono bg-white dark:bg-gray-800 p-2 rounded">
                      {typeof testResult.input === 'string'
                        ? testResult.input
                        : JSON.stringify(testResult.input, null, 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">Output:</div>
                    <div className="text-sm text-green-900 dark:text-green-200 font-mono bg-white dark:bg-gray-800 p-2 rounded">
                      {typeof testResult.output === 'string'
                        ? testResult.output
                        : JSON.stringify(testResult.output, null, 2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Function'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
