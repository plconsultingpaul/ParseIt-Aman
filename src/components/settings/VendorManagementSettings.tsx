import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Users, Shield, User as UserIcon, Eye, EyeOff, Settings, FileText, Server, Key, Mail, Filter, Database, GitBranch, Brain, RefreshCw, ArrowUp, ArrowDown, Copy, Edit } from 'lucide-react';
import type { User, VendorExtractionRule, ExtractionType, TransformationType } from '../../types';
import Select from '../common/Select';
import { getAuthHeaders } from '../../lib/supabase';

interface VendorManagementSettingsProps {
  currentUser: User;
  extractionTypes: ExtractionType[];
  transformationTypes: TransformationType[];
  getAllUsers: () => Promise<User[]>;
  createUser: (username: string, password: string, isAdmin: boolean, role: 'admin' | 'user' | 'vendor') => Promise<{ success: boolean; message: string }>;
  updateUser: (userId: string, updates: { isAdmin?: boolean; isActive?: boolean; permissions?: any; role?: 'admin' | 'user' | 'vendor'; currentZone?: string }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
  updateUserPassword: (userId: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

export default function VendorManagementSettings({
  currentUser,
  extractionTypes,
  transformationTypes,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserPassword
}: VendorManagementSettingsProps) {
  const [vendors, setVendors] = useState<User[]>([]);
  const [vendorRules, setVendorRules] = useState<Record<string, VendorExtractionRule[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showEditVendorModal, setShowEditVendorModal] = useState(false);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [showDeleteVendorModal, setShowDeleteVendorModal] = useState(false);
  const [showDeleteRuleModal, setShowDeleteRuleModal] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<User | null>(null);
  const [vendorToEdit, setVendorToEdit] = useState<User | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<{ rule: VendorExtractionRule; vendorId: string } | null>(null);
  const [newVendor, setNewVendor] = useState({
    username: '',
    password: '',
    currentZone: ''
  });
  const [editVendor, setEditVendor] = useState({
    password: '',
    currentZone: ''
  });
  const [newRule, setNewRule] = useState({
    ruleName: '',
    autoDetectInstructions: '',
    processingMode: 'extraction' as 'extraction' | 'transformation',
    extractionTypeId: '',
    transformationTypeId: '',
    isEnabled: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const allUsers = await getAllUsers();
      const vendorUsers = allUsers.filter(user => user.role === 'vendor');
      setVendors(vendorUsers);
      
      // Load rules for each vendor
      for (const vendor of vendorUsers) {
        await loadVendorRules(vendor.id);
      }
    } catch (error) {
      console.error('Failed to load vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVendorRules = async (vendorId: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/rest/v1/vendor_extraction_rules?vendor_id=eq.${vendorId}&order=priority.asc`, {
        headers: authHeaders
      });

      if (response.ok) {
        const data = await response.json();
        const rules: VendorExtractionRule[] = data.map((rule: any) => ({
          id: rule.id,
          vendorId: rule.vendor_id,
          ruleName: rule.rule_name,
          autoDetectInstructions: rule.auto_detect_instructions,
          extractionTypeId: rule.extraction_type_id,
          transformationTypeId: rule.transformation_type_id,
          processingMode: rule.processing_mode,
          priority: rule.priority,
          isEnabled: rule.is_enabled,
          createdAt: rule.created_at,
          updatedAt: rule.updated_at
        }));
        
        setVendorRules(prev => ({ ...prev, [vendorId]: rules }));
      }
    } catch (error) {
      console.error('Failed to load vendor rules:', error);
    }
  };

  const handleAddVendor = async () => {
    if (!newVendor.username.trim() || !newVendor.password.trim()) {
      setError('Username and password are required');
      return;
    }

    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const result = await createUser(newVendor.username.trim(), newVendor.password, false, 'vendor');
      
      if (result.success) {
        // Update the vendor's current zone after creation
        const allUsers = await getAllUsers();
        const createdVendor = allUsers.find(u => u.username === newVendor.username.trim());
        
        if (createdVendor && newVendor.currentZone.trim()) {
          await updateUser(createdVendor.id, { currentZone: newVendor.currentZone.trim() });
        }
        
        setSuccess(result.message);
        setShowAddVendorModal(false);
        setNewVendor({ username: '', password: '', currentZone: '' });
        await loadVendors();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to create vendor. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditVendor = (vendor: User) => {
    if (vendor.id === currentUser.id) {
      setError('You cannot edit your own account here');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setVendorToEdit(vendor);
    setEditVendor({
      password: '',
      currentZone: vendor.currentZone || ''
    });
    setShowEditVendorModal(true);
    setError('');
  };

  const handleUpdateVendor = async () => {
    if (!vendorToEdit) return;

    if (!editVendor.password.trim() && editVendor.currentZone === vendorToEdit.currentZone) {
      setError('No changes to save');
      return;
    }

    if (editVendor.password.trim() && editVendor.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      let passwordUpdateSuccess = true;
      let passwordMessage = '';

      if (editVendor.password.trim()) {
        const passwordResult = await updateUserPassword(vendorToEdit.id, editVendor.password);
        passwordUpdateSuccess = passwordResult.success;
        passwordMessage = passwordResult.message;
      }

      let zoneUpdateSuccess = true;
      let zoneMessage = '';

      if (editVendor.currentZone !== vendorToEdit.currentZone) {
        const zoneResult = await updateUser(vendorToEdit.id, { currentZone: editVendor.currentZone });
        zoneUpdateSuccess = zoneResult.success;
        zoneMessage = zoneResult.message;
      }

      if (passwordUpdateSuccess && zoneUpdateSuccess) {
        setSuccess(`Vendor "${vendorToEdit.username}" has been updated successfully`);
        setShowEditVendorModal(false);
        setVendorToEdit(null);
        setEditVendor({ password: '', currentZone: '' });
        await loadVendors();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorMessages = [];
        if (!passwordUpdateSuccess) errorMessages.push(passwordMessage);
        if (!zoneUpdateSuccess) errorMessages.push(zoneMessage);
        setError(errorMessages.join('. '));
      }
    } catch (error) {
      setError('Failed to update vendor. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVendor = (vendor: User) => {
    if (vendor.id === currentUser.id) {
      setError('You cannot delete your own account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setVendorToDelete(vendor);
    setShowDeleteVendorModal(true);
  };

  const confirmDeleteVendor = async () => {
    if (!vendorToDelete) return;

    setIsDeleting(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteUser(vendorToDelete.id);
      
      if (result.success) {
        setSuccess(`Vendor "${vendorToDelete.username}" has been deleted successfully`);
        setShowDeleteVendorModal(false);
        setVendorToDelete(null);
        if (selectedVendorId === vendorToDelete.id) {
          setSelectedVendorId(null);
        }
        await loadVendors();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to delete vendor. Please try again.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddRule = async () => {
    if (!selectedVendorId || !newRule.ruleName.trim() || !newRule.autoDetectInstructions.trim()) {
      setError('Rule name and auto-detect instructions are required');
      return;
    }

    if (newRule.processingMode === 'extraction' && !newRule.extractionTypeId) {
      setError('Please select an extraction type for extraction mode');
      return;
    }

    if (newRule.processingMode === 'transformation' && !newRule.transformationTypeId) {
      setError('Please select a transformation type for transformation mode');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const currentRules = vendorRules[selectedVendorId] || [];
      const nextPriority = Math.max(0, ...currentRules.map(r => r.priority)) + 1;

      const response = await fetch(`${supabaseUrl}/rest/v1/vendor_extraction_rules`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          vendor_id: selectedVendorId,
          rule_name: newRule.ruleName.trim(),
          auto_detect_instructions: newRule.autoDetectInstructions.trim(),
          extraction_type_id: newRule.processingMode === 'extraction' ? newRule.extractionTypeId : null,
          transformation_type_id: newRule.processingMode === 'transformation' ? newRule.transformationTypeId : null,
          processing_mode: newRule.processingMode,
          priority: nextPriority,
          is_enabled: newRule.isEnabled
        })
      });

      if (response.ok) {
        setSuccess('Rule added successfully');
        setShowAddRuleModal(false);
        setNewRule({
          ruleName: '',
          autoDetectInstructions: '',
          processingMode: 'extraction',
          extractionTypeId: '',
          transformationTypeId: '',
          isEnabled: true
        });
        await loadVendorRules(selectedVendorId);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to add rule');
      }
    } catch (error) {
      setError('Failed to add rule. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = (rule: VendorExtractionRule, vendorId: string) => {
    setRuleToDelete({ rule, vendorId });
    setShowDeleteRuleModal(true);
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete) return;

    setIsDeleting(true);
    setError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/rest/v1/vendor_extraction_rules?id=eq.${ruleToDelete.rule.id}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      if (response.ok) {
        setSuccess('Rule deleted successfully');
        setShowDeleteRuleModal(false);
        await loadVendorRules(ruleToDelete.vendorId);
        setRuleToDelete(null);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to delete rule');
      }
    } catch (error) {
      setError('Failed to delete rule. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleRuleEnabled = async (rule: VendorExtractionRule, vendorId: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/rest/v1/vendor_extraction_rules?id=eq.${rule.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          is_enabled: !rule.isEnabled,
          updated_at: new Date().toISOString()
        })
      });

      if (response.ok) {
        await loadVendorRules(vendorId);
      } else {
        setError('Failed to update rule status');
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      setError('Failed to update rule. Please try again.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleMoveRule = async (rule: VendorExtractionRule, vendorId: string, direction: 'up' | 'down') => {
    const currentRules = vendorRules[vendorId] || [];
    const currentIndex = currentRules.findIndex(r => r.id === rule.id);
    
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentRules.length) return;

    // Swap priorities
    const updatedRules = [...currentRules];
    [updatedRules[currentIndex], updatedRules[newIndex]] = [updatedRules[newIndex], updatedRules[currentIndex]];
    
    // Update priorities
    updatedRules.forEach((r, index) => {
      r.priority = index + 1;
    });

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const authHeaders = await getAuthHeaders();

      for (const updatedRule of updatedRules) {
        await fetch(`${supabaseUrl}/rest/v1/vendor_extraction_rules?id=eq.${updatedRule.id}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({
            priority: updatedRule.priority,
            updated_at: new Date().toISOString()
          })
        });
      }
      
      await loadVendorRules(vendorId);
    } catch (error) {
      setError('Failed to reorder rules. Please try again.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const getExtractionTypeName = (typeId?: string) => {
    if (!typeId) return 'Unknown';
    const type = extractionTypes.find(t => t.id === typeId);
    return type?.name || 'Unknown';
  };

  const getTransformationTypeName = (typeId?: string) => {
    if (!typeId) return 'Unknown';
    const type = transformationTypes.find(t => t.id === typeId);
    return type?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600">Loading vendors...</span>
      </div>
    );
  }

  const selectedVendor = vendors.find(v => v.id === selectedVendorId);
  const selectedVendorRules = selectedVendorId ? (vendorRules[selectedVendorId] || []) : [];

  return (
    <div className="space-y-6">
      {/* Add Vendor Modal */}
      {showAddVendorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Plus className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Add New Vendor</h3>
              <p className="text-gray-600 dark:text-gray-400">Create a new vendor account with limited access</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={newVendor.username}
                  onChange={(e) => setNewVendor(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter vendor username"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newVendor.password}
                    onChange={(e) => setNewVendor(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter password"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Zone (Optional)
                </label>
                <input
                  type="text"
                  value={newVendor.currentZone}
                  onChange={(e) => setNewVendor(prev => ({ ...prev, currentZone: e.target.value }))}
                  placeholder="Enter current zone"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
                <p className="text-orange-700 dark:text-orange-400 text-sm">
                  <strong>Note:</strong> Vendors have limited access and can only upload PDFs for processing. They cannot access settings or other administrative features.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}
              
              <div className="flex space-x-3">
                <button
                  onClick={handleAddVendor}
                  disabled={isCreating}
                  className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isCreating ? 'Creating...' : 'Create Vendor'}
                </button>
                <button
                  onClick={() => {
                    setShowAddVendorModal(false);
                    setNewVendor({ username: '', password: '', currentZone: '' });
                    setError('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vendor Modal */}
      {showEditVendorModal && vendorToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Edit className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Edit Vendor</h3>
              <p className="text-gray-600 dark:text-gray-400">Update password or current zone for "{vendorToEdit.username}"</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Password (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editVendor.password}
                    onChange={(e) => setEditVendor(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Leave blank to keep current password"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showEditPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                    )}
                  </button>
                </div>
                {editVendor.password && editVendor.password.length < 8 && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Password must be at least 8 characters</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Zone
                </label>
                <input
                  type="text"
                  value={editVendor.currentZone}
                  onChange={(e) => setEditVendor(prev => ({ ...prev, currentZone: e.target.value }))}
                  placeholder="Enter current zone"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handleUpdateVendor}
                  disabled={isSaving}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isSaving ? 'Updating...' : 'Update Vendor'}
                </button>
                <button
                  onClick={() => {
                    setShowEditVendorModal(false);
                    setVendorToEdit(null);
                    setEditVendor({ password: '', currentZone: '' });
                    setError('');
                    setShowEditPassword(false);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddRuleModal && selectedVendorId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Brain className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Add Detection Rule</h3>
              <p className="text-gray-600 dark:text-gray-400">Create a new AI auto-detection rule for this vendor</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={newRule.ruleName}
                  onChange={(e) => setNewRule(prev => ({ ...prev, ruleName: e.target.value }))}
                  placeholder="e.g., Invoice Processing"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Processing Mode
                </label>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setNewRule(prev => ({ 
                      ...prev, 
                      processingMode: 'extraction',
                      transformationTypeId: ''
                    }))}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      newRule.processingMode === 'extraction'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    Extract Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRule(prev => ({ 
                      ...prev, 
                      processingMode: 'transformation',
                      extractionTypeId: ''
                    }))}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      newRule.processingMode === 'transformation'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    Transform & Rename
                  </button>
                </div>
              </div>

              <div>
                <Select
                  label={newRule.processingMode === 'transformation' ? 'Transformation Type' : 'Extraction Type'}
                  value={(newRule.processingMode === 'transformation' ? newRule.transformationTypeId : newRule.extractionTypeId) || '__none__'}
                  onValueChange={(value) => {
                    const actualValue = value === '__none__' ? '' : value;
                    if (newRule.processingMode === 'transformation') {
                      setNewRule(prev => ({ ...prev, transformationTypeId: actualValue }));
                    } else {
                      setNewRule(prev => ({ ...prev, extractionTypeId: actualValue }));
                    }
                  }}
                  options={[
                    { value: '__none__', label: `Select ${newRule.processingMode === 'transformation' ? 'transformation' : 'extraction'} type...` },
                    ...(newRule.processingMode === 'transformation'
                      ? transformationTypes.map(type => ({ value: type.id, label: type.name }))
                      : extractionTypes.map(type => ({ value: type.id, label: type.name })))
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Auto-Detection Instructions
                </label>
                <textarea
                  value={newRule.autoDetectInstructions}
                  onChange={(e) => setNewRule(prev => ({ ...prev, autoDetectInstructions: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe the characteristics that identify this document type (e.g., 'Invoice documents with company letterhead, contains invoice number, billing address, line items with quantities and prices')"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Be specific about document layout, key fields, headers, or unique characteristics that help AI identify this document type.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}
              
              <div className="flex space-x-3">
                <button
                  onClick={handleAddRule}
                  disabled={isSaving}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  {isSaving ? 'Adding...' : 'Add Rule'}
                </button>
                <button
                  onClick={() => {
                    setShowAddRuleModal(false);
                    setNewRule({
                      ruleName: '',
                      autoDetectInstructions: '',
                      processingMode: 'extraction',
                      extractionTypeId: '',
                      transformationTypeId: '',
                      isEnabled: true
                    });
                    setError('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Vendor Modal */}
      {showDeleteVendorModal && vendorToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Vendor</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to permanently delete the vendor <strong>"{vendorToDelete.username}"</strong>?
              </p>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span className="font-semibold text-red-800 dark:text-red-300">Warning</span>
              </div>
              <ul className="text-red-700 dark:text-red-400 text-sm space-y-1">
                <li>• This action cannot be undone</li>
                <li>• All vendor detection rules will be permanently deleted</li>
                <li>• The vendor will lose access to the system immediately</li>
              </ul>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={confirmDeleteVendor}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isDeleting ? 'Deleting...' : 'Delete Vendor'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteVendorModal(false);
                  setVendorToDelete(null);
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Rule Modal */}
      {showDeleteRuleModal && ruleToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Detection Rule</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Are you sure you want to delete the rule <strong>"{ruleToDelete.rule.ruleName}"</strong>?
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={confirmDeleteRule}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
              >
                {isDeleting ? 'Deleting...' : 'Delete Rule'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteRuleModal(false);
                  setRuleToDelete(null);
                  setError('');
                }}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Vendor Management</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage vendor accounts and their AI auto-detection rules</p>
        </div>
        <button
          onClick={() => setShowAddVendorModal(true)}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Vendor</span>
        </button>
      </div>

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vendor List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Vendors</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</p>
            </div>
            
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className={`p-4 cursor-pointer transition-colors duration-200 ${
                    selectedVendorId === vendor.id
                      ? 'bg-orange-50 dark:bg-orange-900/30 border-r-4 border-orange-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 group'
                  }`}
                  onClick={() => setSelectedVendorId(vendor.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg">
                        <UserIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {vendor.username}
                        </span>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {(vendorRules[vendor.id] || []).length} rule{(vendorRules[vendor.id] || []).length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditVendor(vendor);
                        }}
                        className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors duration-200 opacity-0 group-hover:opacity-100"
                        title="Edit vendor"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVendor(vendor);
                        }}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200 opacity-0 group-hover:opacity-100"
                        title="Delete vendor"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {vendors.length === 0 && (
                <div className="p-8 text-center">
                  <Users className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No vendors created yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vendor Rules Detail */}
        <div className="lg:col-span-2">
          {selectedVendor ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedVendor.username}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      AI Auto-Detection Rules ({selectedVendorRules.length} rule{selectedVendorRules.length !== 1 ? 's' : ''})
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddRuleModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Rule</span>
                  </button>
                </div>
              </div>

              <div className="p-6">
                {selectedVendorRules.length === 0 ? (
                  <div className="text-center py-8">
                    <Brain className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Detection Rules</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Add AI auto-detection rules to help this vendor process their documents automatically.</p>
                    <button
                      onClick={() => setShowAddRuleModal(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add First Rule</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedVendorRules.map((rule, index) => (
                      <div
                        key={rule.id}
                        className={`p-4 rounded-lg border-2 ${
                          rule.isEnabled 
                            ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' 
                            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-lg ${
                              rule.processingMode === 'transformation' 
                                ? 'bg-orange-100 dark:bg-orange-800' 
                                : 'bg-purple-100 dark:bg-purple-800'
                            }`}>
                              {rule.processingMode === 'transformation' ? (
                                <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                              ) : (
                                <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              )}
                            </div>
                            <div>
                              <h5 className="font-semibold text-gray-900 dark:text-gray-100">{rule.ruleName}</h5>
                              <div className="flex items-center space-x-2 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  rule.processingMode === 'transformation'
                                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-800 dark:text-orange-200'
                                    : 'bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-200'
                                }`}>
                                  {rule.processingMode === 'transformation' ? 'Transform' : 'Extract'}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">Priority: {rule.priority}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleMoveRule(rule, selectedVendorId!, 'up')}
                              disabled={index === 0}
                              className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors duration-200"
                              title="Move up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleMoveRule(rule, selectedVendorId!, 'down')}
                              disabled={index === selectedVendorRules.length - 1}
                              className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors duration-200"
                              title="Move down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleRuleEnabled(rule, selectedVendorId!)}
                              className={`px-2 py-1 text-xs font-medium rounded-full transition-colors duration-200 ${
                                rule.isEnabled
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                            >
                              {rule.isEnabled ? 'Enabled' : 'Disabled'}
                            </button>
                            <button
                              onClick={() => handleDeleteRule(rule, selectedVendorId!)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                              title="Delete rule"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</span>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {rule.processingMode === 'transformation' 
                                ? getTransformationTypeName(rule.transformationTypeId)
                                : getExtractionTypeName(rule.extractionTypeId)
                              }
                            </p>
                          </div>
                          
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Detection Instructions:</span>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600">
                              {rule.autoDetectInstructions}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center">
              <Users className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Vendor Selected</h3>
              <p className="text-gray-600 dark:text-gray-400">Select a vendor from the list to view and manage their AI auto-detection rules.</p>
            </div>
          )}
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h4 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">Vendor Management Information</h4>
        <ul className="text-sm text-orange-700 dark:text-orange-400 space-y-1">
          <li>• Vendors have limited access and can only upload PDFs for processing</li>
          <li>• Each vendor can have multiple AI auto-detection rules with different priorities</li>
          <li>• Rules are processed in priority order (top to bottom) until a match is found</li>
          <li>• Extract mode processes PDFs for data extraction and API/SFTP upload</li>
          <li>• Transform mode analyzes PDFs to generate new filenames and rename them</li>
          <li>• Vendors cannot access settings, logs, or other administrative features</li>
          <li>• AI auto-detection instructions should be specific to help identify document types accurately</li>
        </ul>
      </div>
    </div>
  );
}