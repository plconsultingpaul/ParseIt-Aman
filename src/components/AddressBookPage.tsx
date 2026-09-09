import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil as Edit, Trash2, BookUser, Search, CheckCircle, XCircle, Truck, Building, Calendar, Eye, EyeOff } from 'lucide-react';
import type { User, ClientAddress } from '../types';
import {
  fetchClientAddresses,
  createClientAddress,
  updateClientAddress,
  deleteClientAddress,
  formatPhoneNumber,
  unformatPhoneNumber,
  validateEmail,
  validatePhoneNumber,
  US_STATES,
  CANADIAN_PROVINCES,
  COUNTRIES
} from '../services/addressBookService';
import Select from './common/Select';

interface AddressBookPageProps {
  user: User;
}

export default function AddressBookPage({ user }: AddressBookPageProps) {
  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [filteredAddresses, setFilteredAddresses] = useState<ClientAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [addressToEdit, setAddressToEdit] = useState<ClientAddress | null>(null);
  const [addressToDelete, setAddressToDelete] = useState<ClientAddress | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [filterShipper, setFilterShipper] = useState<boolean | null>(null);
  const [filterConsignee, setFilterConsignee] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    address1: '',
    address2: '',
    city: '',
    stateProv: '',
    postalCode: '',
    country: 'US',
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
    if (user.clientId) {
      loadAddresses();
    }
  }, [user.clientId]);

  useEffect(() => {
    applyFilters();
  }, [addresses, searchTerm, filterActive, filterShipper, filterConsignee]);

  const loadAddresses = async () => {
    if (!user.clientId) return;

    setLoading(true);
    try {
      const data = await fetchClientAddresses(user.clientId);
      setAddresses(data);
    } catch (error) {
      console.error('Failed to load addresses:', error);
      setError('Failed to load addresses. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...addresses];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        addr =>
          addr.name.toLowerCase().includes(term) ||
          addr.city.toLowerCase().includes(term) ||
          (addr.contactName && addr.contactName.toLowerCase().includes(term)) ||
          (addr.contactEmail && addr.contactEmail.toLowerCase().includes(term))
      );
    }

    if (filterActive !== null) {
      filtered = filtered.filter(addr => addr.active === filterActive);
    }

    if (filterShipper !== null) {
      filtered = filtered.filter(addr => addr.isShipper === filterShipper);
    }

    if (filterConsignee !== null) {
      filtered = filtered.filter(addr => addr.isConsignee === filterConsignee);
    }

    setFilteredAddresses(filtered);
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

  const handleAddAddress = () => {
    resetForm();
    setError('');
    setShowAddModal(true);
  };

  const handleEditAddress = (address: ClientAddress) => {
    setAddressToEdit(address);
    setFormData({
      name: address.name,
      address1: address.address1,
      address2: address.address2 || '',
      city: address.city,
      stateProv: address.stateProv,
      postalCode: address.postalCode || '',
      country: address.country,
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
    setShowEditModal(true);
  };

  const handleDeleteAddress = (address: ClientAddress) => {
    setAddressToDelete(address);
    setShowDeleteModal(true);
  };

  const handleSaveAddress = async () => {
    if (!user.clientId) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const result = await createClientAddress(user.clientId, formData);

      if (result.success) {
        setSuccess('Address created successfully');
        setShowAddModal(false);
        resetForm();
        await loadAddresses();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Failed to save address:', error);
      setError('Failed to save address. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateAddress = async () => {
    if (!addressToEdit) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const result = await updateClientAddress(addressToEdit.id, formData);

      if (result.success) {
        setSuccess('Address updated successfully');
        setShowEditModal(false);
        setAddressToEdit(null);
        resetForm();
        await loadAddresses();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Failed to update address:', error);
      setError('Failed to update address. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteAddress = async () => {
    if (!addressToDelete) return;

    setIsDeleting(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteClientAddress(addressToDelete.id);

      if (result.success) {
        setSuccess(`Address "${addressToDelete.name}" deleted successfully`);
        setShowDeleteModal(false);
        setAddressToDelete(null);
        await loadAddresses();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Failed to delete address:', error);
      setError('Failed to delete address. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setFormData(prev => ({ ...prev, contactPhone: formatted }));
  };

  const getStateProvOptions = () => {
    if (formData.country === 'US') {
      return US_STATES;
    } else if (formData.country === 'CA') {
      return CANADIAN_PROVINCES;
    }
    return [];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading addresses...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="font-semibold text-green-800 dark:text-green-300">Success!</span>
          </div>
          <p className="text-green-700 dark:text-green-400 text-sm mt-1">{success}</p>
        </div>
      )}

      {error && !showAddModal && !showEditModal && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="font-semibold text-red-800 dark:text-red-300">Error</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, city, or contact..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterActive(filterActive === true ? null : true)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
              filterActive === true
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterShipper(filterShipper === true ? null : true)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center space-x-1 ${
              filterShipper === true
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Shipper</span>
          </button>
          <button
            onClick={() => setFilterConsignee(filterConsignee === true ? null : true)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center space-x-1 ${
              filterConsignee === true
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            <Building className="h-4 w-4" />
            <span>Consignee</span>
          </button>

          <button
            onClick={handleAddAddress}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Address</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Address Book</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {filteredAddresses.length} address{filteredAddresses.length !== 1 ? 'es' : ''} found
            </p>
          </div>
        </div>

        {filteredAddresses.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <BookUser className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              {addresses.length === 0 ? 'No Addresses Yet' : 'No Matching Addresses'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {addresses.length === 0
                ? 'Add your first customer address to get started.'
                : 'Try adjusting your search or filters.'}
            </p>
            {addresses.length === 0 && (
              <button
                onClick={handleAddAddress}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Address</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Name</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Address</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">City</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">State</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Postal Code</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Contact</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Flags</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAddresses.map((address) => (
                  <tr key={address.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{address.name}</div>
                      {address.appointmentReq && (
                        <div className="flex items-center space-x-1 text-xs text-orange-600 dark:text-orange-400 mt-1">
                          <Calendar className="h-3 w-3" />
                          <span>Appt Required</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      <div>{address.address1}</div>
                      {address.address2 && <div className="text-xs">{address.address2}</div>}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{address.city}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {address.stateProv}, {address.country}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {address.postalCode || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {address.contactName && <div>{address.contactName}</div>}
                      {address.contactPhone && <div className="text-xs">{address.contactPhone}</div>}
                      {address.contactEmail && <div className="text-xs">{address.contactEmail}</div>}
                      {!address.contactName && !address.contactPhone && !address.contactEmail && (
                        <span className="text-gray-400 dark:text-gray-500">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {address.isShipper && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs rounded-full flex items-center space-x-1">
                            <Truck className="h-3 w-3" />
                            <span>Ship</span>
                          </span>
                        )}
                        {address.isConsignee && (
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 text-xs rounded-full flex items-center space-x-1">
                            <Building className="h-3 w-3" />
                            <span>Cons</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          address.active
                            ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {address.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditAddress(address)}
                          className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors duration-200"
                          title="Edit address"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAddress(address)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors duration-200"
                          title="Delete address"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {(showAddModal || showEditModal) && (
        <AddressModal
          isEdit={showEditModal}
          formData={formData}
          setFormData={setFormData}
          onSave={showEditModal ? handleUpdateAddress : handleSaveAddress}
          onClose={() => {
            showAddModal && setShowAddModal(false);
            showEditModal && setShowEditModal(false);
            resetForm();
            setError('');
          }}
          isSaving={isSaving}
          error={error}
          getStateProvOptions={getStateProvOptions}
          handlePhoneChange={handlePhoneChange}
        />
      )}

      {showDeleteModal && addressToDelete && (
        <DeleteModal
          address={addressToDelete}
          onConfirm={confirmDeleteAddress}
          onClose={() => {
            setShowDeleteModal(false);
            setAddressToDelete(null);
          }}
          isDeleting={isDeleting}
        />
      )}

      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">Address Book Information</h4>
        <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-1">
          <li>• Manage all shipping and receiving addresses for your organization</li>
          <li>• Mark addresses as Shipper, Consignee, or both based on their purpose</li>
          <li>• Set appointment requirements for locations that need scheduled deliveries</li>
          <li>• Use Active/Inactive status to control which addresses appear in selection lists</li>
        </ul>
      </div>
    </div>
  );
}

interface AddressModalProps {
  isEdit: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  error: string;
  getStateProvOptions: () => Array<{ code: string; name: string }>;
  handlePhoneChange: (value: string) => void;
}

function AddressModal({
  isEdit,
  formData,
  setFormData,
  onSave,
  onClose,
  isSaving,
  error,
  getStateProvOptions,
  handlePhoneChange
}: AddressModalProps) {
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-10 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 my-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            {isEdit ? <Edit className="h-8 w-8 text-purple-600 dark:text-purple-400" /> : <Plus className="h-8 w-8 text-purple-600 dark:text-purple-400" />}
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {isEdit ? 'Edit Address' : 'Add New Address'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {isEdit ? 'Update address information' : 'Create a new customer address'}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-4 max-h-[60vh] overflow-y-auto pr-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 ml-2">({formData.name.length}/40)</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.substring(0, 40) })}
                placeholder="Enter address name"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Address 1 <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 ml-2">({formData.address1.length}/40)</span>
              </label>
              <input
                type="text"
                value={formData.address1}
                onChange={(e) => setFormData({ ...formData, address1: e.target.value.substring(0, 40) })}
                placeholder="Street address"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Address 2
                <span className="text-xs text-gray-500 ml-2">({formData.address2.length}/40)</span>
              </label>
              <input
                type="text"
                value={formData.address2}
                onChange={(e) => setFormData({ ...formData, address2: e.target.value.substring(0, 40) })}
                placeholder="Apt, suite, unit, etc."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                City <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 ml-2">({formData.city.length}/30)</span>
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value.substring(0, 30) })}
                placeholder="City"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <Select
                label="Country"
                value={formData.country}
                onValueChange={(value) => setFormData({ ...formData, country: value, stateProv: '' })}
                options={COUNTRIES.map((country) => ({
                  value: country.code,
                  label: country.name
                }))}
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
                  ...getStateProvOptions().map((option) => ({
                    value: option.code,
                    label: `${option.name} (${option.code})`
                  }))
                ]}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Zip / Postal Code
                <span className="text-xs text-gray-500 ml-2">({formData.postalCode.length}/10)</span>
              </label>
              <input
                type="text"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value.substring(0, 10) })}
                placeholder={formData.country === 'US' ? 'e.g., 90210' : 'e.g., V2R 5S4'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-600 pt-4 mt-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Contact Information</h4>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Name
                <span className="text-xs text-gray-500 ml-2">({formData.contactName.length}/128)</span>
              </label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value.substring(0, 128) })}
                placeholder="Contact person"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Email
                <span className="text-xs text-gray-500 ml-2">({formData.contactEmail.length}/40)</span>
              </label>
              <input
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value.substring(0, 40) })}
                placeholder="email@example.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Phone
                <span className="text-xs text-gray-500 ml-2">(111-111-1111)</span>
              </label>
              <input
                type="text"
                value={formData.contactPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="123-456-7890"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Extension
                <span className="text-xs text-gray-500 ml-2">({formData.contactPhoneExt.length}/5)</span>
              </label>
              <input
                type="text"
                value={formData.contactPhoneExt}
                onChange={(e) => setFormData({ ...formData, contactPhoneExt: e.target.value.substring(0, 5) })}
                placeholder="Ext."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-600 pt-4 mt-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Address Settings</h4>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="appointmentReq"
                  checked={formData.appointmentReq}
                  onChange={(e) => setFormData({ ...formData, appointmentReq: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="appointmentReq" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <span>Appointment Required</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="active" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-purple-600" />
                  <span>Active</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isShipper"
                  checked={formData.isShipper}
                  onChange={(e) => setFormData({ ...formData, isShipper: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="isShipper" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <Truck className="h-4 w-4 text-purple-600" />
                  <span>Is Shipper</span>
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isConsignee"
                  checked={formData.isConsignee}
                  onChange={(e) => setFormData({ ...formData, isConsignee: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="isConsignee" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <Building className="h-4 w-4 text-purple-600" />
                  <span>Is Consignee</span>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {isSaving ? 'Saving...' : isEdit ? 'Update Address' : 'Create Address'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

interface DeleteModalProps {
  address: ClientAddress;
  onConfirm: () => void;
  onClose: () => void;
  isDeleting: boolean;
}

function DeleteModal({ address, onConfirm, onClose, isDeleting }: DeleteModalProps) {
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-20">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Trash2 className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Address</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete <strong>"{address.name}"</strong>?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            {address.city}, {address.stateProv} {address.country}
          </p>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="font-semibold text-red-800 dark:text-red-300">Warning</span>
          </div>
          <p className="text-red-700 dark:text-red-400 text-sm">
            This action cannot be undone. The address will be permanently deleted.
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200"
          >
            {isDeleting ? 'Deleting...' : 'Delete Address'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
