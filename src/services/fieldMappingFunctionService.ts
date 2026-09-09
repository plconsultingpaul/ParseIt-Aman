import { supabase } from '../lib/supabase';
import { FieldMappingFunction, ConditionalFunctionLogic, DateFunctionLogic, AddressLookupFunctionLogic, DateTimeMergeFunctionLogic } from '../types';
import { evaluateFunction, evaluateAddressLookup } from '../lib/functionEvaluator';

export const fieldMappingFunctionService = {
  async getFunctionsByExtractionType(extractionTypeId: string): Promise<FieldMappingFunction[]> {
    const { data, error } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('extraction_type_id', extractionTypeId)
      .order('function_name');

    if (error) {
      throw new Error(`Failed to fetch functions: ${error.message}`);
    }

    return data || [];
  },

  async getFunctionsByWorkflowNode(workflowNodeId: string): Promise<FieldMappingFunction[]> {
    const { data, error } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('workflow_v2_node_id', workflowNodeId)
      .order('function_name');

    if (error) {
      throw new Error(`Failed to fetch functions: ${error.message}`);
    }

    return data || [];
  },

  async getFunctionById(id: string): Promise<FieldMappingFunction> {
    const { data, error } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch function: ${error.message}`);
    }

    return data;
  },

  async createFunction(functionData: Omit<FieldMappingFunction, 'id' | 'created_at' | 'updated_at'>): Promise<FieldMappingFunction> {
    const { data, error } = await supabase
      .from('field_mapping_functions')
      .insert([functionData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create function: ${error.message}`);
    }

    return data;
  },

  async updateFunction(id: string, functionData: Partial<Omit<FieldMappingFunction, 'id' | 'created_at' | 'updated_at'>>): Promise<FieldMappingFunction> {
    const { data, error } = await supabase
      .from('field_mapping_functions')
      .update(functionData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update function: ${error.message}`);
    }

    return data;
  },

  async deleteFunction(id: string): Promise<void> {
    const { error } = await supabase
      .from('field_mapping_functions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete function: ${error.message}`);
    }
  },

  async copyFunction(sourceFunctionId: string, targetExtractionTypeId: string, newName: string): Promise<FieldMappingFunction> {
    console.log('[copyFunction] Source ID:', sourceFunctionId, 'Target extraction type:', targetExtractionTypeId, 'New name:', newName);
    const sourceFunction = await this.getFunctionById(sourceFunctionId);
    console.log('[copyFunction] Source function loaded:', sourceFunction.function_name, 'Type:', sourceFunction.function_type, 'Logic keys:', Object.keys(sourceFunction.function_logic || {}));

    const newFunction: Omit<FieldMappingFunction, 'id' | 'created_at' | 'updated_at'> = {
      extraction_type_id: targetExtractionTypeId,
      function_name: newName,
      description: sourceFunction.description,
      function_type: sourceFunction.function_type || 'conditional',
      function_logic: sourceFunction.function_logic
    };

    console.log('[copyFunction] Creating new function with data:', JSON.stringify(newFunction, null, 2));
    const result = await this.createFunction(newFunction);
    console.log('[copyFunction] Created successfully. New ID:', result.id);
    return result;
  },

  async copyFunctionToWorkflowNode(sourceFunctionId: string, targetWorkflowNodeId: string, newName: string): Promise<FieldMappingFunction> {
    const sourceFunction = await this.getFunctionById(sourceFunctionId);

    const newFunction: Omit<FieldMappingFunction, 'id' | 'created_at' | 'updated_at'> = {
      workflow_v2_node_id: targetWorkflowNodeId,
      function_name: newName,
      description: sourceFunction.description,
      function_type: sourceFunction.function_type || 'conditional',
      function_logic: sourceFunction.function_logic
    };

    return this.createFunction(newFunction);
  },

  async getFunctionsByFlowNode(flowNodeId: string): Promise<FieldMappingFunction[]> {
    const { data, error } = await supabase
      .from('field_mapping_functions')
      .select('*')
      .eq('flow_node_id', flowNodeId)
      .order('function_name');

    if (error) {
      throw new Error(`Failed to fetch functions: ${error.message}`);
    }

    return data || [];
  },

  async copyFunctionToFlowNode(sourceFunctionId: string, targetFlowNodeId: string, newName: string): Promise<FieldMappingFunction> {
    const sourceFunction = await this.getFunctionById(sourceFunctionId);

    const newFunction: Omit<FieldMappingFunction, 'id' | 'created_at' | 'updated_at'> = {
      flow_node_id: targetFlowNodeId,
      function_name: newName,
      description: sourceFunction.description,
      function_type: sourceFunction.function_type || 'conditional',
      function_logic: sourceFunction.function_logic
    };

    return this.createFunction(newFunction);
  },

  testFunction(functionLogic: ConditionalFunctionLogic | DateFunctionLogic | DateTimeMergeFunctionLogic, testData: Record<string, any>): any {
    return evaluateFunction(functionLogic, testData);
  },

  async testAddressLookup(addressLookupLogic: AddressLookupFunctionLogic, testData: Record<string, any>): Promise<string> {
    return evaluateAddressLookup(addressLookupLogic, testData);
  }
};
