import { supabase } from '../lib/supabase';
import type { ApiSpec, ApiSpecEndpoint, ApiEndpointField } from '../types';

export const fetchApiSpecs = async (): Promise<ApiSpec[]> => {
  const { data, error } = await supabase
    .from('api_specs')
    .select(`
      *,
      endpoint_count:api_spec_endpoints(count)
    `)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Error fetching API specs:', error);
    throw error;
  }

  return data || [];
};

export const uploadApiSpec = async (
  apiEndpointId: string | null,
  secondaryApiId: string | null,
  name: string,
  fileName: string,
  specContent: any,
  version: string,
  description: string
): Promise<ApiSpec> => {
  const { data, error } = await supabase
    .from('api_specs')
    .insert([{
      api_endpoint_id: apiEndpointId,
      secondary_api_id: secondaryApiId,
      name,
      file_name: fileName,
      spec_content: specContent,
      version,
      description,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) {
    console.error('Error uploading API spec:', error);
    throw error;
  }

  return data;
};

export const deleteApiSpec = async (specId: string): Promise<void> => {
  const { error } = await supabase
    .from('api_specs')
    .delete()
    .eq('id', specId);

  if (error) {
    console.error('Error deleting API spec:', error);
    throw error;
  }
};

export const fetchSpecEndpoints = async (specId: string): Promise<ApiSpecEndpoint[]> => {
  const { data, error } = await supabase
    .from('api_spec_endpoints')
    .select('*')
    .eq('api_spec_id', specId)
    .order('path');

  if (error) {
    console.error('Error fetching spec endpoints:', error);
    throw error;
  }

  return data || [];
};

export const fetchEndpointFields = async (endpointId: string): Promise<ApiEndpointField[]> => {
  const { data, error } = await supabase
    .from('api_endpoint_fields')
    .select('*')
    .eq('api_spec_endpoint_id', endpointId)
    .order('field_path');

  if (error) {
    console.error('Error fetching endpoint fields:', error);
    throw error;
  }

  return data || [];
};

const resolveReference = (ref: string, specContent: any): any => {
  if (!ref || !ref.startsWith('#/')) return null;

  const parts = ref.substring(2).split('/');
  let current = specContent;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return null;
    current = current[part];
  }

  return current;
};

const resolveSchemaRef = (ref: string, specContent: any) => {
  const parts = ref.split('/').filter(p => p !== '#');
  let schema = specContent;

  for (const part of parts) {
    schema = schema?.[part];
  }

  return schema;
};

const extractFieldsFromEndpoint = (endpoint: any, specContent: any): any[] => {
  const fields: any[] = [];

  const extractSchemaFields = (properties: any, requiredFields: string[] = [], parentPath = '', prefix = '') => {
    if (!properties) return;

    Object.entries(properties).forEach(([fieldName, fieldDef]: [string, any]) => {
      const basePath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
      const fieldPath = prefix ? `${prefix} ${basePath}` : basePath;

      fields.push({
        api_spec_endpoint_id: endpoint.id,
        field_name: fieldName,
        field_path: fieldPath,
        field_type: fieldDef.type || 'string',
        is_required: requiredFields.includes(fieldName),
        description: fieldDef.description || '',
        example: fieldDef.example ? String(fieldDef.example) : null,
        format: fieldDef.format || null,
        parent_field_id: null,
      });

      if (fieldDef.type === 'object' && fieldDef.properties) {
        extractSchemaFields(fieldDef.properties, fieldDef.required || [], basePath, prefix);
      }

      if (fieldDef.type === 'array' && fieldDef.items?.properties) {
        extractSchemaFields(fieldDef.items.properties, fieldDef.items.required || [], `${basePath}[]`, prefix);
      }

      if (fieldDef.type === 'array' && fieldDef.items?.$ref) {
        const itemSchema = resolveSchemaRef(fieldDef.items.$ref, specContent);
        if (itemSchema?.properties) {
          extractSchemaFields(itemSchema.properties, itemSchema.required || [], `${basePath}[]`, prefix);
        }
      }
    });
  };

  if (endpoint.parameters && Array.isArray(endpoint.parameters)) {
    endpoint.parameters.forEach((paramRef: any) => {
      let param = paramRef;

      if (paramRef.$ref) {
        const resolved = resolveReference(paramRef.$ref, specContent);
        if (resolved) {
          param = { ...resolved, ...paramRef };
          delete param.$ref;
        } else {
          console.warn(`Could not resolve reference: ${paramRef.$ref}`);
          return;
        }
      }

      const paramSchema = param.schema || {};
      const paramType = paramSchema.type || 'string';
      const paramIn = param.in || 'query';

      let description = param.description || '';
      if (paramSchema.enum) {
        description += description ? ' ' : '';
        description += `Allowed values: ${paramSchema.enum.join(', ')}`;
      }
      if (paramSchema.default !== undefined) {
        description += description ? ' ' : '';
        description += `Default: ${paramSchema.default}`;
      }
      if (paramSchema.minimum !== undefined || paramSchema.maximum !== undefined) {
        const constraints = [];
        if (paramSchema.minimum !== undefined) constraints.push(`min: ${paramSchema.minimum}`);
        if (paramSchema.maximum !== undefined) constraints.push(`max: ${paramSchema.maximum}`);
        description += description ? ' ' : '';
        description += `(${constraints.join(', ')})`;
      }
      if (paramSchema.pattern) {
        description += description ? ' ' : '';
        description += `Pattern: ${paramSchema.pattern}`;
      }

      fields.push({
        api_spec_endpoint_id: endpoint.id,
        field_name: param.name,
        field_path: `[${paramIn}] ${param.name}`,
        field_type: paramType,
        is_required: param.required || false,
        description: description,
        example: param.example ? String(param.example) : (paramSchema.example ? String(paramSchema.example) : null),
        format: paramSchema.format || param.format || null,
        parent_field_id: null,
      });
    });
  }

  const requestBody = endpoint.request_body;
  if (requestBody) {
    const schema = requestBody.content?.['application/json']?.schema;
    if (schema) {
      const resolvedSchema = schema.$ref
        ? resolveSchemaRef(schema.$ref, specContent)
        : schema;

      if (resolvedSchema?.properties) {
        extractSchemaFields(resolvedSchema.properties, resolvedSchema.required || [], '', '[body]');
      }
    }
  }

  const responses = endpoint.responses;
  if (responses && typeof responses === 'object') {
    const successCodes = ['200', '201', '202', '204'];
    for (const statusCode of successCodes) {
      const response = responses[statusCode];
      if (!response) continue;

      const responseSchema = response.content?.['application/json']?.schema;
      if (!responseSchema) continue;

      const resolvedResponseSchema = responseSchema.$ref
        ? resolveSchemaRef(responseSchema.$ref, specContent)
        : responseSchema;

      if (resolvedResponseSchema?.properties) {
        extractSchemaFields(resolvedResponseSchema.properties, resolvedResponseSchema.required || [], '', '[response]');
        break;
      }

      if (resolvedResponseSchema?.type === 'array' && resolvedResponseSchema.items) {
        const itemSchema = resolvedResponseSchema.items.$ref
          ? resolveSchemaRef(resolvedResponseSchema.items.$ref, specContent)
          : resolvedResponseSchema.items;

        if (itemSchema?.properties) {
          extractSchemaFields(itemSchema.properties, itemSchema.required || [], '[]', '[response]');
          break;
        }
      }
    }
  }

  return fields;
};

export const parseAndSaveEndpoints = async (
  specId: string,
  specContent: any
): Promise<void> => {
  const endpoints: any[] = [];

  if (specContent.paths) {
    Object.entries(specContent.paths).forEach(([path, methods]: [string, any]) => {
      Object.entries(methods).forEach(([method, details]: [string, any]) => {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method.toLowerCase())) {
          const cleanPath = path.startsWith('/') ? path.substring(1) : path;

          endpoints.push({
            api_spec_id: specId,
            path: cleanPath,
            method: method.toUpperCase(),
            summary: details.summary || details.description || '',
            parameters: details.parameters || [],
            request_body: details.requestBody || null,
            responses: details.responses || {},
          });
        }
      });
    });
  }

  console.log(`Parsed ${endpoints.length} endpoints from spec`);

  if (endpoints.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < endpoints.length; i += batchSize) {
      const batch = endpoints.slice(i, i + batchSize);
      const { data: insertedEndpoints, error } = await supabase
        .from('api_spec_endpoints')
        .insert(batch)
        .select();

      if (error) {
        console.error('Error inserting batch:', error);
        throw new Error(`Error saving endpoints: ${error.message}`);
      } else if (insertedEndpoints) {
        await parseAndSaveFields(insertedEndpoints, specContent);
      }
    }
  }
};

const parseAndSaveFields = async (endpoints: any[], specContent: any): Promise<void> => {
  const allFields: any[] = [];

  for (const endpoint of endpoints) {
    const fields = extractFieldsFromEndpoint(endpoint, specContent);
    allFields.push(...fields);
  }

  if (allFields.length > 0) {
    const { error } = await supabase
      .from('api_endpoint_fields')
      .insert(allFields);

    if (error) {
      console.error('Error saving fields:', error);
      throw error;
    } else {
      console.log(`Saved ${allFields.length} fields`);
    }
  }
};

export const parseYamlToJson = async (yamlContent: string): Promise<any> => {
  try {
    const jsYaml = await import('js-yaml');
    return jsYaml.load(yamlContent);
  } catch (error) {
    console.error('Error parsing YAML:', error);
    throw new Error('Failed to parse YAML file. Please ensure it is valid YAML format.');
  }
};
