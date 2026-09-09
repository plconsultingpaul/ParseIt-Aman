import { supabase } from '../lib/supabase';
import type { FeatureFlag, FeatureFlags } from '../types';

export async function fetchFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('category', { ascending: true })
      .order('feature_name', { ascending: true });

    if (error) throw error;

    return (data || []).map(flag => ({
      id: flag.id,
      featureKey: flag.feature_key,
      featureName: flag.feature_name,
      isEnabled: flag.is_enabled,
      description: flag.description,
      category: flag.category,
      createdAt: flag.created_at,
      updatedAt: flag.updated_at
    }));
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    throw error;
  }
}

export async function getFeatureFlagsMap(): Promise<FeatureFlags> {
  try {
    const flags = await fetchFeatureFlags();

    const flagsMap: any = {
      extractionTypes: true,
      transformationTypes: true,
      sftpUpload: true,
      sftpPolling: true,
      apiIntegration: true,
      emailMonitoring: true,
      emailRules: true,
      workflowManagement: true,
      userManagement: true,
      vendorManagement: true,

      companyBranding: true,
      extractionLogs: true,
      workflowExecutionLogs: true,
      emailPollingLogs: true,
      sftpPollingLogs: true
    };

    flags.forEach(flag => {
      const camelCaseKey = flag.featureKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      flagsMap[camelCaseKey] = flag.isEnabled;
    });

    return flagsMap as FeatureFlags;
  } catch (error) {
    console.error('Error getting feature flags map:', error);
    return {
      extractionTypes: true,
      transformationTypes: true,
      sftpUpload: true,
      sftpPolling: true,
      apiIntegration: true,
      emailMonitoring: true,
      emailRules: true,
      workflowManagement: true,
      userManagement: true,
      vendorManagement: true,

      companyBranding: true,
      extractionLogs: true,
      workflowExecutionLogs: true,
      emailPollingLogs: true,
      sftpPollingLogs: true
    };
  }
}

export async function updateFeatureFlag(featureKey: string, isEnabled: boolean): Promise<void> {
  try {
    const { error } = await supabase
      .from('feature_flags')
      .update({
        is_enabled: isEnabled,
        updated_at: new Date().toISOString()
      })
      .eq('feature_key', featureKey);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating feature flag:', error);
    throw error;
  }
}

export async function updateMultipleFeatureFlags(updates: { featureKey: string; isEnabled: boolean }[]): Promise<void> {
  try {
    const promises = updates.map(update =>
      updateFeatureFlag(update.featureKey, update.isEnabled)
    );

    await Promise.all(promises);
  } catch (error) {
    console.error('Error updating multiple feature flags:', error);
    throw error;
  }
}
