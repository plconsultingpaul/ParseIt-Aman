import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil as Edit, Trash2, BookUser, Search, X, CheckCircle, XCircle, Truck, Building, Download, Settings, Loader2, AlertCircle, Upload, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { ClientAddress, Client } from '../../types';
import {
  fetchClientAddresses,
  createClientAddress,
  updateClientAddress,
  deleteClientAddress,
  formatPhoneNumber,
  unformatPhoneNumber,
  US_STATES,
  CANADIAN_PROVINCES,
  COUNTRIES
} from '../../services/addressBookService';
import { supabase } from '../../lib/supabase';
import { getAuthHeaders } from '../../lib/supabase';
import Select from '../common/Select';

interface ClientAddressBookModalProps {
  client: Client;
  onClose: () => void;
}

export default function ClientAddressBookModal({ client, onClose }: ClientAddressBookModalProps) {
  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [addressToEdit, setAddressToEdit] = useState<ClientAddress | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<ClientAddress | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportConfig, setShowImportConfig] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [formData, setFormData] = useState({
    name: '',
    address1: '',
    address2: '',
    city: '',
    stateProv: '',
    postalCode: '',
    country: 'US',
    clientRefId: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactPhoneExt: '',
    appointmentReq: false,
    active: true,
    isShipper: false,
    isConsignee: false
  });

  useEffect(() => {
    loadAddresses();
  }, [client.id]);

  const loadAddresses = async () => {
    setLoading(true);
    try {
      const data = await fetchClientAddresses(client.id);
      setAddresses(data);
    } catch (err) {
      setError('Failed to load addresses.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address1: '',
      address2: '',
      city: '',
      stateProv: '',
      postalCode: '',
      country: 'US',
      clientRefId: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      contactPhoneExt: '',
      appointmentReq: false,
      active: true,
      isShipper: false,
      isConsignee: false
    });
  };

  const handleAdd = () => {
    resetForm();
    setError('');
    setView('add');
  };

  const handleEdit = (address: ClientAddress) => {
    setAddressToEdit(address);
    setFormData({
      name: address.name,
      address1: address.address1,
      address2: address.address2 || '',
      city: address.city,
      stateProv: address.stateProv,
      postalCode: address.postalCode || '',
      country: address.country,
      clientRefId: address.clientRefId || '',
      contactName: address.contactName || '',
      contactEmail: address.contactEmail || '',
      contactPhone: address.contactPhone || '',
      contactPhoneExt: address.contactPhoneExt || '',
      appointmentReq: address.appointmentReq,
      active: address.active,
      isShipper: address.isShipper,
      isConsignee: address.isConsignee
    });
    setError('');
    setView('edit');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');

    try {
      const result = await createClientAddress(client.id, formData);
      if (result.success) {
        setSuccess('Address created successfully');
        setView('list');
        resetForm();
        await loadAddresses();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Failed to save address.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!addressToEdit) return;

    setIsSaving(true);
    setError('');

    try {
      const result = await updateClientAddress(addressToEdit.id, formData);
      if (result.success) {
        setSuccess('Address updated successfully');
        setView('list');
        setAddressToEdit(null);
        resetForm();
        await loadAddresses();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Failed to update address.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;

    setIsDeleting(true);
    setError('');

    try {
      const result = await deleteClientAddress(showDeleteConfirm.id);
      if (result.success) {
        setSuccess(`Address "${showDeleteConfirm.name}" deleted`);
        setShowDeleteConfirm(null);
        await loadAddresses();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Failed to delete address.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStateProvOptions = () => {
    if (formData.country === 'US') return US_STATES;
    if (formData.country === 'CA') return CANADIAN_PROVINCES;
    return [];
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setFormData(prev => ({ ...prev, contactPhone: formatted }));
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const filteredAddresses = addresses
    .filter(addr => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return addr.name.toLowerCase().includes(term) ||
        addr.city.toLowerCase().includes(term) ||
        (addr.clientRefId && addr.clientRefId.toLowerCase().includes(term)) ||
        (addr.contactName && addr.contactName.toLowerCase().includes(term));
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      let aVal = '';
      let bVal = '';
      switch (sortColumn) {
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'clientRefId': aVal = a.clientRefId || ''; bVal = b.clientRefId || ''; break;
        case 'address1': aVal = a.address1; bVal = b.address1; break;
        case 'city': aVal = a.city; bVal = b.city; break;
        case 'stateProv': aVal = a.stateProv; bVal = b.stateProv; break;
        case 'status': aVal = a.active ? 'active' : 'inactive'; bVal = b.active ? 'active' : 'inactive'; break;
        default: aVal = a.name; bVal = b.name;
      }
      return aVal.localeCompare(bVal, undefined, { numeric: true }) * dir;
    });

  const renderForm = () => (
    <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name <span className="text-red-500">*</span>
            <span className="text-xs text-gray-500 ml-1">({formData.name.length}/40)</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value.substring(0, 40) })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Client ID
            <span className="text-xs text-gray-500 ml-1">({formData.clientRefId.length}/20)</span>
          </label>
          <input
            type="text"
            value={formData.clientRefId}
            onChange={(e) => setFormData({ ...formData, clientRefId: e.target.value.substring(0, 20) })}
            placeholder="For API calls"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address 1 <span className="text-red-500">*</span>
            <span className="text-xs text-gray-500 ml-1">({formData.address1.length}/40)</span>
          </label>
          <input
            type="text"
            value={formData.address1}
            onChange={(e) => setFormData({ ...formData, address1: e.target.value.substring(0, 40) })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address 2
            <span className="text-xs text-gray-500 ml-1">({formData.address2.length}/40)</span>
          </label>
          <input
            type="text"
            value={formData.address2}
            onChange={(e) => setFormData({ ...formData, address2: e.target.value.substring(0, 40) })}
            placeholder="Apt, suite, unit, etc."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            City <span className="text-red-500">*</span>
            <span className="text-xs text-gray-500 ml-1">({formData.city.length}/30)</span>
          </label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value.substring(0, 30) })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
        </div>

        <div>
          <Select
            label="Country"
            value={formData.country}
            onValueChange={(value) => setFormData({ ...formData, country: value, stateProv: '' })}
            options={COUNTRIES.map(c => ({ value: c.code, label: c.name }))}
            required
            searchable={false}
          />
        </div>

        <div>
          <Select
            label="State/Province"
            value={formData.stateProv || '__none__'}
            onValueChange={(value) => setFormData({ ...formData, stateProv: value === '__none__' ? '' : value })}
            options={[
              { value: '__none__', label: 'Select...' },
              ...getStateProvOptions().map(o => ({ value: o.code, label: `${o.name} (${o.code})` }))
            ]}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Zip / Postal Code
            <span className="text-xs text-gray-500 ml-1">({formData.postalCode.length}/10)</span>
          </label>
          <input
            type="text"
            value={formData.postalCode}
            onChange={(e) => setFormData({ ...formData, postalCode: e.target.value.substring(0, 10) })}
            placeholder={formData.country === 'US' ? 'e.g., 90210' : 'e.g., V2R 5S4'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-600 pt-3 mt-1">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Contact Information</h4>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Contact Name
            <span className="text-xs text-gray-500 ml-1">({formData.contactName.length}/128)</span>
          </label>
          <input
            type="text"
            value={formData.contactName}
            onChange={(e) => setFormData({ ...formData, contactName: e.target.value.substring(0, 128) })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Contact Email
            <span className="text-xs text-gray-500 ml-1">({formData.contactEmail.length}/40)</span>
          </label>
          <input
            type="email"
            value={formData.contactEmail}
            onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value.substring(0, 40) })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Contact Phone
          </label>
          <input
            type="text"
            value={formData.contactPhone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="(555) 555-5555"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone Ext
            <span className="text-xs text-gray-500 ml-1">({formData.contactPhoneExt.length}/5)</span>
          </label>
          <input
            type="text"
            value={formData.contactPhoneExt}
            onChange={(e) => setFormData({ ...formData, contactPhoneExt: e.target.value.substring(0, 5) })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-600 pt-3 mt-1">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Options</h4>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isShipper}
                onChange={(e) => setFormData({ ...formData, isShipper: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Shipper</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isConsignee}
                onChange={(e) => setFormData({ ...formData, isConsignee: e.target.checked })}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Consignee</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.appointmentReq}
                onChange={(e) => setFormData({ ...formData, appointmentReq: e.target.checked })}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Appointment Required</span>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex space-x-3 pt-2">
        <button
          onClick={view === 'add' ? handleSave : handleUpdate}
          disabled={isSaving}
          className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
        >
          {isSaving ? 'Saving...' : view === 'add' ? 'Create Address' : 'Update Address'}
        </button>
        <button
          onClick={() => { setView('list'); setError(''); }}
          className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderList = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, city, client ID..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
          />
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
          title="Import from API"
        >
          <Download className="h-4 w-4" />
          <span>Import</span>
        </button>
        <button
          onClick={handleAdd}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Add</span>
        </button>
      </div>

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-2.5">
          <p className="text-green-700 dark:text-green-400 text-sm">{success}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading addresses...</div>
      ) : filteredAddresses.length === 0 ? (
        <div className="text-center py-8">
          <BookUser className="h-10 w-10 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {searchTerm ? 'No addresses match your search' : 'No addresses yet'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[50vh] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
              <tr>
                <th onClick={() => handleSort('name')} className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none">
                  <span className="inline-flex items-center gap-1">Name {getSortIcon('name')}</span>
                </th>
                <th onClick={() => handleSort('clientRefId')} className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none">
                  <span className="inline-flex items-center gap-1">Client ID {getSortIcon('clientRefId')}</span>
                </th>
                <th onClick={() => handleSort('address1')} className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none">
                  <span className="inline-flex items-center gap-1">Address 1 {getSortIcon('address1')}</span>
                </th>
                <th onClick={() => handleSort('city')} className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none">
                  <span className="inline-flex items-center gap-1">City {getSortIcon('city')}</span>
                </th>
                <th onClick={() => handleSort('stateProv')} className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none">
                  <span className="inline-flex items-center gap-1">State {getSortIcon('stateProv')}</span>
                </th>
                <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Type</th>
                <th onClick={() => handleSort('status')} className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none">
                  <span className="inline-flex items-center gap-1">Status {getSortIcon('status')}</span>
                </th>
                <th className="text-right py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAddresses.map(addr => (
                <tr key={addr.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="py-2 px-3 text-gray-900 dark:text-gray-100 font-medium">{addr.name}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{addr.clientRefId || '-'}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{addr.address1}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{addr.city}</td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{addr.stateProv}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center space-x-1">
                      {addr.isShipper && (
                        <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                          <Truck className="h-3 w-3 inline mr-0.5" />S
                        </span>
                      )}
                      {addr.isConsignee && (
                        <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded">
                          <Building className="h-3 w-3 inline mr-0.5" />C
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    {addr.active ? (
                      <span className="flex items-center space-x-1 text-green-600 dark:text-green-400 text-xs">
                        <CheckCircle className="h-3 w-3" /><span>Active</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-gray-500 text-xs">
                        <XCircle className="h-3 w-3" /><span>Inactive</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={() => handleEdit(addr)}
                        className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        title="Edit"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(addr)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-10 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-6xl w-full mx-4 shadow-2xl mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-rose-100 dark:bg-rose-900/50 p-2.5 rounded-full">
              <BookUser className="h-6 w-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {view === 'list' ? 'Address Book' : view === 'add' ? 'Add Address' : 'Edit Address'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{client.clientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {view === 'list' ? renderList() : renderForm()}
      </div>

      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-4">
              <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-14 h-14 mx-auto mb-3 flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">Delete Address</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Delete <strong>"{showDeleteConfirm.name}"</strong>? This cannot be undone.
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showImportModal && (
        <AddressBookImportModal
          clientId={client.id}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            loadAddresses();
            setSuccess('Address imported from API successfully');
            setTimeout(() => setSuccess(''), 3000);
          }}
          onOpenConfig={() => {
            setShowImportModal(false);
            setShowImportConfig(true);
          }}
        />
      )}

      {showImportConfig && (
        <AddressBookImportConfigModal
          onClose={() => setShowImportConfig(false)}
          onSaved={() => {
            setShowImportConfig(false);
            setSuccess('Import configuration saved');
            setTimeout(() => setSuccess(''), 3000);
          }}
        />
      )}
    </div>,
    document.body
  );
}

interface ImportConfig {
  id: string;
  api_endpoint: string;
  api_parameter_name: string;
  api_parameter_type: string;
  api_source_type: string;
  secondary_api_id: string | null;
  api_spec_id: string | null;
  api_spec_endpoint_id: string | null;
  http_method: string;
  field_mappings: Array<{ apiField: string; addressField: string }>;
}

const ADDRESS_BOOK_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'address1', label: 'Address 1' },
  { value: 'address2', label: 'Address 2' },
  { value: 'city', label: 'City' },
  { value: 'stateProv', label: 'State/Province' },
  { value: 'postalCode', label: 'Postal Code' },
  { value: 'country', label: 'Country' },
  { value: 'clientRefId', label: 'Client Ref ID' },
  { value: 'contactName', label: 'Contact Name' },
  { value: 'contactEmail', label: 'Contact Email' },
  { value: 'contactPhone', label: 'Contact Phone' },
  { value: 'contactPhoneExt', label: 'Phone Extension' },
];

function AddressBookImportModal({
  clientId,
  onClose,
  onImported,
  onOpenConfig,
}: {
  clientId: string;
  onClose: () => void;
  onImported: () => void;
  onOpenConfig: () => void;
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [step, setStep] = useState<'input' | 'preview' | 'saving'>('input');
  const [lookupId, setLookupId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<ImportConfig | null>(null);
  const [mappedData, setMappedData] = useState<Record<string, string>>({});
  const [isShipper, setIsShipper] = useState(false);
  const [isConsignee, setIsConsignee] = useState(false);
  const [appointmentReq, setAppointmentReq] = useState(false);

  // Bulk import state
  const [bulkStep, setBulkStep] = useState<'upload' | 'processing' | 'results'>('upload');
  const [csvClientIds, setCsvClientIds] = useState<string[]>([]);
  const [bulkIsShipper, setBulkIsShipper] = useState(false);
  const [bulkIsConsignee, setBulkIsConsignee] = useState(false);
  const [bulkAppointmentReq, setBulkAppointmentReq] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState<Array<{ clientId: string; success: boolean; message: string }>>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const { data, error } = await supabase
      .from('address_book_import_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setConfig(data);
    }
  };

  const resolveJsonPath = (obj: any, path: string): string => {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return '';
      current = current[part];
    }
    return current != null ? String(current) : '';
  };

  const fetchAndMapAddress = async (id: string): Promise<{ success: boolean; data?: Record<string, string>; error?: string }> => {
    if (!config) return { success: false, error: 'Import not configured' };

    try {
      let apiPath = config.api_endpoint;
      let queryString = '';

      if (config.api_parameter_type === 'path') {
        apiPath = apiPath.replace(`{${config.api_parameter_name}}`, encodeURIComponent(id.trim()));
      } else {
        queryString = `${encodeURIComponent(config.api_parameter_name)}=${encodeURIComponent(id.trim())}`;
      }

      const headers = await getAuthHeaders();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const proxyBody: any = {
        apiPath,
        httpMethod: config.http_method || 'GET',
        queryString: queryString || undefined,
      };

      if (config.api_source_type === 'secondary' && config.secondary_api_id) {
        proxyBody.secondaryApiId = config.secondary_api_id;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/api-proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify(proxyBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `API returned ${response.status}: ${errText}` };
      }

      const data = await response.json();

      const mapped: Record<string, string> = {};
      for (const mapping of config.field_mappings) {
        if (mapping.apiField && mapping.addressField) {
          mapped[mapping.addressField] = resolveJsonPath(data, mapping.apiField);
        }
      }
      return { success: true, data: mapped };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch from API' };
    }
  };

  const checkDuplicateClientId = async (refId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('client_addresses')
      .select('id')
      .eq('client_id', clientId)
      .eq('client_ref_id', refId.trim())
      .limit(1);
    return (data && data.length > 0) || false;
  };

  const handleFetch = async () => {
    if (!lookupId.trim()) {
      setError('Please enter a Client ID');
      return;
    }
    if (!config) {
      setError('Import not configured. Please set up the API configuration first.');
      return;
    }

    setLoading(true);
    setError('');

    const isDuplicate = await checkDuplicateClientId(lookupId.trim());
    if (isDuplicate) {
      setError(`Client ID "${lookupId.trim()}" already exists in this address book.`);
      setLoading(false);
      return;
    }

    const result = await fetchAndMapAddress(lookupId.trim());
    if (result.success && result.data) {
      setMappedData(result.data);
      setStep('preview');
    } else {
      setError(result.error || 'Failed to fetch from API');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setStep('saving');
    setError('');

    try {
      const addressData = {
        name: mappedData.name || '',
        address1: mappedData.address1 || '',
        address2: mappedData.address2 || '',
        city: mappedData.city || '',
        stateProv: mappedData.stateProv || '',
        postalCode: mappedData.postalCode || '',
        country: mappedData.country || 'US',
        clientRefId: mappedData.clientRefId || lookupId.trim(),
        contactName: mappedData.contactName || '',
        contactEmail: mappedData.contactEmail || '',
        contactPhone: mappedData.contactPhone || '',
        contactPhoneExt: mappedData.contactPhoneExt || '',
        appointmentReq: appointmentReq,
        active: true,
        isShipper: isShipper,
        isConsignee: isConsignee,
      };

      const result = await createClientAddress(clientId, addressData);
      if (result.success) {
        onImported();
      } else {
        setError(result.message);
        setStep('preview');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save address');
      setStep('preview');
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const ids: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = line.includes(',') ? line.split(',') : line.split('\t');
        const value = columns[0].trim().replace(/^["']|["']$/g, '');
        if (i === 0 && /^(client.?id|id|code|customer)/i.test(value)) continue;
        if (value) ids.push(value);
      }

      setCsvClientIds(ids);
      setError('');
    };
    reader.readAsText(file);
  };

  const handleBulkImport = async () => {
    if (!config || csvClientIds.length === 0) return;

    setBulkProcessing(true);
    setBulkStep('processing');
    setBulkProgress({ current: 0, total: csvClientIds.length });
    const results: Array<{ clientId: string; success: boolean; message: string }> = [];

    // Pre-fetch existing client ref IDs to check for duplicates
    const { data: existingAddresses } = await supabase
      .from('client_addresses')
      .select('client_ref_id')
      .eq('client_id', clientId);
    const existingRefIds = new Set(
      (existingAddresses || []).map(a => (a.client_ref_id || '').toLowerCase())
    );

    for (let i = 0; i < csvClientIds.length; i++) {
      const id = csvClientIds[i];
      setBulkProgress({ current: i + 1, total: csvClientIds.length });

      if (existingRefIds.has(id.trim().toLowerCase())) {
        results.push({ clientId: id, success: false, message: 'Duplicate - already exists' });
        continue;
      }

      const fetchResult = await fetchAndMapAddress(id);
      if (!fetchResult.success || !fetchResult.data) {
        results.push({ clientId: id, success: false, message: fetchResult.error || 'API fetch failed' });
        continue;
      }

      const addressData = {
        name: fetchResult.data.name || '',
        address1: fetchResult.data.address1 || '',
        address2: fetchResult.data.address2 || '',
        city: fetchResult.data.city || '',
        stateProv: fetchResult.data.stateProv || '',
        postalCode: fetchResult.data.postalCode || '',
        country: fetchResult.data.country || 'US',
        clientRefId: fetchResult.data.clientRefId || id,
        contactName: fetchResult.data.contactName || '',
        contactEmail: fetchResult.data.contactEmail || '',
        contactPhone: fetchResult.data.contactPhone || '',
        contactPhoneExt: fetchResult.data.contactPhoneExt || '',
        appointmentReq: bulkAppointmentReq,
        active: true,
        isShipper: bulkIsShipper,
        isConsignee: bulkIsConsignee,
      };

      const saveResult = await createClientAddress(clientId, addressData);
      if (saveResult.success) {
        results.push({ clientId: id, success: true, message: 'Imported successfully' });
        existingRefIds.add(id.trim().toLowerCase());
      } else {
        results.push({ clientId: id, success: false, message: saveResult.message });
      }

      if (i < csvClientIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    setBulkResults(results);
    setBulkStep('results');
    setBulkProcessing(false);
    if (results.some(r => r.success)) {
      onImported();
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Import Address from API</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenConfig}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Configure Import Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {!config && (
            <div className="text-center py-6">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">Import Not Configured</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Set up the API endpoint and field mappings before importing.
              </p>
              <button
                onClick={onOpenConfig}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Configure Import
              </button>
            </div>
          )}

          {config && mode === 'single' && step === 'input' && (
            <div className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setMode('single')}
                  className="flex-1 px-3 py-2 text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-r border-gray-200 dark:border-gray-700"
                >
                  Single Import
                </button>
                <button
                  onClick={() => { setMode('bulk'); setError(''); }}
                  className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Bulk CSV Import
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enter Client ID to look up
                </label>
                <input
                  type="text"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                  placeholder="e.g., SURA01"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This will be passed as the <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{config.api_parameter_name}</code> parameter to <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{config.api_endpoint}</code>
                </p>
              </div>

              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {config && mode === 'bulk' && bulkStep === 'upload' && (
            <div className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => { setMode('single'); setError(''); setCsvClientIds([]); }}
                  className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-r border-gray-200 dark:border-gray-700"
                >
                  Single Import
                </button>
                <button
                  onClick={() => setMode('bulk')}
                  className="flex-1 px-3 py-2 text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                >
                  Bulk CSV Import
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload CSV File
                </label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-blue-600 dark:text-blue-400">Click to upload</span> a CSV file
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Column A should contain Client IDs</p>
                  </div>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {csvClientIds.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {csvClientIds.length} Client ID{csvClientIds.length !== 1 ? 's' : ''} found
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 max-h-32 overflow-y-auto">
                    <div className="px-3 py-2 space-y-1">
                      {csvClientIds.slice(0, 20).map((id, idx) => (
                        <div key={idx} className="text-xs font-mono text-gray-700 dark:text-gray-300">{id}</div>
                      ))}
                      {csvClientIds.length > 20 && (
                        <div className="text-xs text-gray-500 italic">...and {csvClientIds.length - 20} more</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Options (applied to all)</label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkIsShipper}
                          onChange={(e) => setBulkIsShipper(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Shipper</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkIsConsignee}
                          onChange={(e) => setBulkIsConsignee(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Consignee</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkAppointmentReq}
                          onChange={(e) => setBulkAppointmentReq(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Appointment Required</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {config && mode === 'bulk' && bulkStep === 'processing' && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Processing {bulkProgress.current} of {bulkProgress.total}...
                </p>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Do not close this window while importing
              </p>
            </div>
          )}

          {config && mode === 'bulk' && bulkStep === 'results' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    {bulkResults.filter(r => r.success).length} succeeded
                  </span>
                </div>
                {bulkResults.filter(r => !r.success).length > 0 && (
                  <div className="flex items-center space-x-1.5">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">
                      {bulkResults.filter(r => !r.success).length} failed
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
                {bulkResults.map((result, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{result.clientId}</span>
                    <span className={`text-xs ${result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {result.success ? 'Imported' : result.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config && mode === 'single' && step === 'preview' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Review the mapped data below. Click Save to create the address.
              </p>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                {ADDRESS_BOOK_FIELDS.map(field => {
                  const value = mappedData[field.value];
                  if (!value && field.value !== 'name' && field.value !== 'address1' && field.value !== 'city') return null;
                  return (
                    <div key={field.value} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{field.label}</span>
                      <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                        {value || <span className="text-gray-400 italic">empty</span>}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Options</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isShipper}
                      onChange={(e) => setIsShipper(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Shipper</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isConsignee}
                      onChange={(e) => setIsConsignee(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Consignee</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appointmentReq}
                      onChange={(e) => setAppointmentReq(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Appointment Required</span>
                  </label>
                </div>
              </div>

              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}

          {mode === 'single' && step === 'saving' && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Creating address...</p>
            </div>
          )}
        </div>

        {config && (
          <div className="flex justify-end space-x-3 p-5 border-t border-gray-200 dark:border-gray-700">
            {mode === 'single' && step === 'input' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFetch}
                  disabled={loading || !lookupId.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{loading ? 'Fetching...' : 'Fetch from API'}</span>
                </button>
              </>
            )}
            {mode === 'single' && step === 'preview' && (
              <>
                <button
                  onClick={() => { setStep('input'); setError(''); }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                >
                  Save Address
                </button>
              </>
            )}
            {mode === 'bulk' && bulkStep === 'upload' && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={csvClientIds.length === 0 || bulkProcessing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Import {csvClientIds.length} Record{csvClientIds.length !== 1 ? 's' : ''}</span>
                </button>
              </>
            )}
            {mode === 'bulk' && bulkStep === 'results' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface SecondaryApi {
  id: string;
  name: string;
  base_url: string;
}

interface SpecOption {
  id: string;
  name: string;
  version: string;
}

interface EndpointOption {
  id: string;
  path: string;
  method: string;
  summary: string;
}

interface ResponseField {
  field_name: string;
  field_path: string;
}

function AddressBookImportConfigModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [apiSourceType, setApiSourceType] = useState<'main' | 'secondary'>('main');
  const [secondaryApiId, setSecondaryApiId] = useState<string>('');
  const [secondaryApis, setSecondaryApis] = useState<SecondaryApi[]>([]);
  const [apiSpecs, setApiSpecs] = useState<SpecOption[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState<string>('');
  const [endpoints, setEndpoints] = useState<EndpointOption[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('');
  const [httpMethod, setHttpMethod] = useState<string>('GET');
  const [endpoint, setEndpoint] = useState('/clients/{clientId}');
  const [paramName, setParamName] = useState('clientId');
  const [paramType, setParamType] = useState<'path' | 'query'>('path');
  const [manualEntry, setManualEntry] = useState(false);
  const [responseFields, setResponseFields] = useState<ResponseField[]>([]);
  const [mappings, setMappings] = useState<Array<{ apiField: string; addressField: string }>>([
    { apiField: '', addressField: 'name' },
    { apiField: '', addressField: 'address1' },
    { apiField: '', addressField: 'city' },
    { apiField: '', addressField: 'stateProv' },
    { apiField: '', addressField: 'postalCode' },
    { apiField: '', addressField: 'country' },
  ]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadSpecs();
  }, [apiSourceType, secondaryApiId]);

  useEffect(() => {
    loadEndpoints();
  }, [selectedSpecId, httpMethod]);

  useEffect(() => {
    loadResponseFields();
  }, [selectedEndpointId]);

  const loadInitialData = async () => {
    try {
      const [{ data: secApis }, { data: existingConfig }] = await Promise.all([
        supabase.from('secondary_api_configs').select('id, name, base_url').eq('is_active', true).order('name'),
        supabase.from('address_book_import_config').select('*').limit(1).maybeSingle(),
      ]);

      setSecondaryApis(secApis || []);

      if (existingConfig) {
        setConfigId(existingConfig.id);
        setEndpoint(existingConfig.api_endpoint);
        setParamName(existingConfig.api_parameter_name);
        setParamType(existingConfig.api_parameter_type as 'path' | 'query');
        setApiSourceType((existingConfig.api_source_type || 'main') as 'main' | 'secondary');
        setSecondaryApiId(existingConfig.secondary_api_id || '');
        setSelectedSpecId(existingConfig.api_spec_id || '');
        setSelectedEndpointId(existingConfig.api_spec_endpoint_id || '');
        setHttpMethod(existingConfig.http_method || 'GET');
        if (Array.isArray(existingConfig.field_mappings) && existingConfig.field_mappings.length > 0) {
          setMappings(existingConfig.field_mappings);
        }
        if (!existingConfig.api_spec_id && !existingConfig.api_spec_endpoint_id) {
          setManualEntry(true);
        }
      }
    } catch (err) {
      console.error('Failed to load import config:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSpecs = async () => {
    let query = supabase.from('api_specs').select('id, name, version');
    if (apiSourceType === 'main') {
      query = query.not('api_endpoint_id', 'is', null);
    } else if (apiSourceType === 'secondary' && secondaryApiId) {
      query = query.eq('secondary_api_id', secondaryApiId);
    } else {
      setApiSpecs([]);
      return;
    }
    const { data } = await query.order('name');
    setApiSpecs(data || []);
  };

  const loadEndpoints = async () => {
    if (!selectedSpecId) {
      setEndpoints([]);
      return;
    }
    const { data } = await supabase
      .from('api_spec_endpoints')
      .select('id, path, method, summary')
      .eq('api_spec_id', selectedSpecId)
      .eq('method', httpMethod)
      .order('path');
    setEndpoints(data || []);
  };

  const loadResponseFields = async () => {
    if (!selectedEndpointId) {
      setResponseFields([]);
      return;
    }
    const { data } = await supabase
      .from('api_endpoint_fields')
      .select('field_name, field_path')
      .eq('api_spec_endpoint_id', selectedEndpointId)
      .like('field_path', '[response]%')
      .order('field_path');
    setResponseFields(data || []);
  };

  const handleEndpointSelect = (endpointId: string) => {
    setSelectedEndpointId(endpointId);
    const ep = endpoints.find(e => e.id === endpointId);
    if (ep) {
      setEndpoint(ep.path);
    }
  };

  const handleSave = async () => {
    if (!endpoint.trim()) {
      setError('API endpoint path is required');
      return;
    }
    if (!paramName.trim()) {
      setError('Parameter name is required');
      return;
    }
    if (apiSourceType === 'secondary' && !secondaryApiId) {
      setError('Please select a Secondary API');
      return;
    }

    const validMappings = mappings.filter(m => m.apiField.trim() && m.addressField.trim());
    if (validMappings.length === 0) {
      setError('At least one field mapping is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const record = {
        api_endpoint: endpoint.trim(),
        api_parameter_name: paramName.trim(),
        api_parameter_type: paramType,
        api_source_type: apiSourceType,
        secondary_api_id: apiSourceType === 'secondary' ? secondaryApiId : null,
        api_spec_id: selectedSpecId || null,
        api_spec_endpoint_id: selectedEndpointId || null,
        http_method: httpMethod,
        field_mappings: validMappings,
        updated_at: new Date().toISOString(),
      };

      if (configId) {
        const { error: updateError } = await supabase
          .from('address_book_import_config')
          .update(record)
          .eq('id', configId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('address_book_import_config')
          .insert([record]);
        if (insertError) throw insertError;
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const addMapping = () => {
    setMappings(prev => [...prev, { apiField: '', addressField: '' }]);
  };

  const removeMapping = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  const updateMapping = (index: number, field: 'apiField' | 'addressField', value: string) => {
    setMappings(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-2xl">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Configure Address Import</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* API Source Selection */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="API Source"
              value={apiSourceType}
              onValueChange={(val) => {
                setApiSourceType(val as 'main' | 'secondary');
                setSelectedSpecId('');
                setSelectedEndpointId('');
                setEndpoints([]);
                setResponseFields([]);
              }}
              options={[
                { value: 'main', label: 'Main API' },
                { value: 'secondary', label: 'Secondary API' },
              ]}
              searchable={false}
            />

            {apiSourceType === 'secondary' && (
              <Select
                label="Secondary API"
                value={secondaryApiId || '__none__'}
                onValueChange={(val) => {
                  setSecondaryApiId(val === '__none__' ? '' : val);
                  setSelectedSpecId('');
                  setSelectedEndpointId('');
                  setEndpoints([]);
                  setResponseFields([]);
                }}
                options={[
                  { value: '__none__', label: 'Select...' },
                  ...secondaryApis.map(api => ({ value: api.id, label: api.name })),
                ]}
                searchable={false}
              />
            )}

            {apiSourceType === 'main' && (
              <Select
                label="HTTP Method"
                value={httpMethod}
                onValueChange={(val) => {
                  setHttpMethod(val);
                  setSelectedEndpointId('');
                }}
                options={[
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                ]}
                searchable={false}
              />
            )}
          </div>

          {apiSourceType === 'secondary' && (
            <Select
              label="HTTP Method"
              value={httpMethod}
              onValueChange={(val) => {
                setHttpMethod(val);
                setSelectedEndpointId('');
              }}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
              ]}
              searchable={false}
            />
          )}

          {/* API Spec Selection */}
          {apiSpecs.length > 0 && (
            <Select
              label="API Specification"
              value={selectedSpecId || '__none__'}
              onValueChange={(val) => {
                setSelectedSpecId(val === '__none__' ? '' : val);
                setSelectedEndpointId('');
                setResponseFields([]);
              }}
              options={[
                { value: '__none__', label: 'Select specification...' },
                ...apiSpecs.map(spec => ({ value: spec.id, label: `${spec.name} (v${spec.version})` })),
              ]}
              searchable={false}
            />
          )}

          {/* Endpoint Selection or Manual Entry */}
          {apiSpecs.length > 0 && selectedSpecId && (
            <div className="flex items-center space-x-2 mb-1">
              <input
                type="checkbox"
                checked={manualEntry}
                onChange={(e) => setManualEntry(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <label className="text-xs text-gray-600 dark:text-gray-400">Enter path manually</label>
            </div>
          )}

          {(!selectedSpecId || apiSpecs.length === 0 || manualEntry) ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Endpoint Path
              </label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/clients/{clientId}"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{paramName}'}</code> for path parameters.
              </p>
            </div>
          ) : (
            <div>
              <Select
                label="API Endpoint"
                value={selectedEndpointId || '__none__'}
                onValueChange={(val) => handleEndpointSelect(val === '__none__' ? '' : val)}
                options={[
                  { value: '__none__', label: endpoints.length === 0 ? `No ${httpMethod} endpoints in this spec` : 'Select endpoint...' },
                  ...endpoints.map(ep => ({ value: ep.id, label: `${ep.path}${ep.summary ? ` - ${ep.summary}` : ''}` })),
                ]}
                searchable={false}
              />
              {selectedEndpointId && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                  Path: {endpoint}
                </p>
              )}
            </div>
          )}

          {/* Parameter Config */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Parameter Name
              </label>
              <input
                type="text"
                value={paramName}
                onChange={(e) => setParamName(e.target.value)}
                placeholder="clientId"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <Select
              label="Parameter Type"
              value={paramType}
              onValueChange={(val) => setParamType(val as 'path' | 'query')}
              options={[
                { value: 'path', label: 'Path Parameter (in URL)' },
                { value: 'query', label: 'Query Parameter (?key=value)' },
              ]}
              searchable={false}
            />
          </div>

          {/* Field Mappings */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Field Mappings
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Map API response fields to address book fields
                </p>
              </div>
              <button
                onClick={addMapping}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
                <span>API Response Field</span>
                <span>Address Book Field</span>
                <span></span>
              </div>
              {mappings.map((mapping, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                  {responseFields.length > 0 ? (
                    <Select
                      value={mapping.apiField || '__none__'}
                      onValueChange={(val) => updateMapping(index, 'apiField', val === '__none__' ? '' : val)}
                      options={[
                        { value: '__none__', label: '-- Select field --' },
                        ...responseFields.map(f => ({ value: f.field_name, label: f.field_name })),
                      ]}
                      searchable={false}
                    />
                  ) : (
                    <input
                      type="text"
                      value={mapping.apiField}
                      onChange={(e) => updateMapping(index, 'apiField', e.target.value)}
                      placeholder="e.g., companyName"
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                    />
                  )}
                  <Select
                    value={mapping.addressField || '__none__'}
                    onValueChange={(val) => updateMapping(index, 'addressField', val === '__none__' ? '' : val)}
                    options={[
                      { value: '__none__', label: '-- Select --' },
                      ...ADDRESS_BOOK_FIELDS.map(f => ({ value: f.value, label: f.label })),
                    ]}
                    searchable={false}
                  />
                  <button
                    onClick={() => removeMapping(index)}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
