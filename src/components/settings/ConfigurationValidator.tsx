import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface ValidationResult {
  type: 'error' | 'warning' | 'success';
  message: string;
  field?: string;
}

interface ConfigurationValidatorProps {
  config: any;
  fields: any[];
  fieldGroups: any[];
}

export default function ConfigurationValidator({ config, fields, fieldGroups }: ConfigurationValidatorProps) {
  const validate = (): ValidationResult[] => {
    const results: ValidationResult[] = [];

    if (!config?.formName || config.formName.trim() === '') {
      results.push({
        type: 'error',
        message: 'Form name is required',
        field: 'formName'
      });
    }

    if (!config?.apiEndpoint || config.apiEndpoint.trim() === '') {
      results.push({
        type: 'error',
        message: 'API endpoint is required',
        field: 'apiEndpoint'
      });
    }

    if (!config?.httpMethod || config.httpMethod.trim() === '') {
      results.push({
        type: 'error',
        message: 'HTTP method is required',
        field: 'httpMethod'
      });
    }

    if (fields.length === 0) {
      results.push({
        type: 'error',
        message: 'At least one field must be configured'
      });
    }

    const fieldNames = new Set();
    fields.forEach((field) => {
      if (!field.fieldName || field.fieldName.trim() === '') {
        results.push({
          type: 'error',
          message: 'Field name is required for all fields',
          field: field.id
        });
      } else if (fieldNames.has(field.fieldName)) {
        results.push({
          type: 'error',
          message: `Duplicate field name: ${field.fieldName}`,
          field: field.fieldName
        });
      } else {
        fieldNames.add(field.fieldName);
      }

      if (!field.fieldType || field.fieldType.trim() === '') {
        results.push({
          type: 'error',
          message: `Field type is required for field: ${field.fieldName || 'unnamed'}`,
          field: field.fieldName
        });
      }

      if (!field.fieldLabel || field.fieldLabel.trim() === '') {
        results.push({
          type: 'warning',
          message: `Field label is recommended for field: ${field.fieldName}`,
          field: field.fieldName
        });
      }

      if (field.validationRegex) {
        try {
          new RegExp(field.validationRegex);
        } catch (e) {
          results.push({
            type: 'error',
            message: `Invalid regex pattern for field: ${field.fieldName}`,
            field: field.fieldName
          });
        }
      }

      if (field.fieldType === 'dropdown' && (!field.options || field.options.length === 0)) {
        results.push({
          type: 'error',
          message: `Dropdown field requires at least one option: ${field.fieldName}`,
          field: field.fieldName
        });
      }

      if (field.isRequired && !field.validationRegex && field.fieldType === 'text') {
        results.push({
          type: 'warning',
          message: `Required field without validation: ${field.fieldName}`,
          field: field.fieldName
        });
      }

      if (field.isArrayField) {
        if (!field.arrayMinRows || field.arrayMinRows < 1) {
          results.push({
            type: 'warning',
            message: `Array field should have minimum rows configured: ${field.fieldName}`,
            field: field.fieldName
          });
        }
      }

      if (field.fieldType === 'file' && (!field.allowedExtensions || field.allowedExtensions.length === 0)) {
        results.push({
          type: 'warning',
          message: `File field should specify allowed extensions: ${field.fieldName}`,
          field: field.fieldName
        });
      }
    });

    if (fieldGroups.length === 0) {
      results.push({
        type: 'warning',
        message: 'No field groups configured. Fields will appear ungrouped.'
      });
    }

    if (config?.authType && !config?.authValue) {
      results.push({
        type: 'warning',
        message: 'Authentication type is configured but auth value is empty',
        field: 'authValue'
      });
    }

    if (results.length === 0) {
      results.push({
        type: 'success',
        message: 'Configuration is valid! All checks passed.'
      });
    }

    return results;
  };

  const validationResults = validate();
  const errors = validationResults.filter(r => r.type === 'error');
  const warnings = validationResults.filter(r => r.type === 'warning');
  const successes = validationResults.filter(r => r.type === 'success');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Configuration Validation
        </h3>
        <div className="flex items-center space-x-4">
          {errors.length > 0 && (
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              {errors.length} {errors.length === 1 ? 'error' : 'errors'}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
            </span>
          )}
          {successes.length > 0 && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Valid
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {errors.map((result, index) => (
          <div
            key={`error-${index}`}
            className="flex items-start space-x-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-200">
                {result.message}
              </p>
              {result.field && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Field: {result.field}
                </p>
              )}
            </div>
          </div>
        ))}

        {warnings.map((result, index) => (
          <div
            key={`warning-${index}`}
            className="flex items-start space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
          >
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {result.message}
              </p>
              {result.field && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  Field: {result.field}
                </p>
              )}
            </div>
          </div>
        ))}

        {successes.map((result, index) => (
          <div
            key={`success-${index}`}
            className="flex items-start space-x-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
          >
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800 dark:text-green-200">
              {result.message}
            </p>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-semibold">Note:</span> Please fix all errors before saving the configuration.
            The form may not work correctly with configuration errors.
          </p>
        </div>
      )}
    </div>
  );
}
