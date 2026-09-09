import { supabase } from '../lib/supabase';
import type { ClientAddress } from '../types';

export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }
];

export const CANADIAN_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' }
];

export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' }
];

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6, 10)}`;
  }
  return phone;
}

export function unformatPhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhoneNumber(phone: string): boolean {
  const cleaned = unformatPhoneNumber(phone);
  return cleaned.length === 10 || cleaned.length === 0;
}

function booleanToString(value: boolean): string {
  return value ? 'true' : 'false';
}

function stringToBoolean(value: string): boolean {
  return value?.trim() === 'true';
}

export async function fetchClientAddresses(clientId: string): Promise<ClientAddress[]> {
  try {
    const { data, error } = await supabase
      .from('client_addresses')
      .select('*')
      .eq('client_id', clientId)
      .order('name', { ascending: true });

    if (error) throw error;

    return (data || []).map(address => ({
      id: address.id,
      clientId: address.client_id,
      name: address.name,
      address1: address.address_1,
      address2: address.address_2 || '',
      city: address.city,
      stateProv: address.state_prov,
      postalCode: address.postal_code || '',
      country: address.country,
      clientRefId: address.client_ref_id || '',
      contactName: address.contact_name || '',
      contactEmail: address.contact_email || '',
      contactPhone: address.contact_phone || '',
      contactPhoneExt: address.contact_phone_ext || '',
      appointmentReq: stringToBoolean(address.appointment_req),
      active: stringToBoolean(address.active),
      isShipper: stringToBoolean(address.is_shipper),
      isConsignee: stringToBoolean(address.is_consignee),
      createdAt: address.created_at,
      updatedAt: address.updated_at
    }));
  } catch (error) {
    console.error('Failed to fetch client addresses:', error);
    throw new Error('Failed to load addresses. Please try again.');
  }
}

export async function createClientAddress(
  clientId: string,
  address: Omit<ClientAddress, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; message: string; address?: ClientAddress }> {
  try {
    if (!address.name.trim()) {
      return { success: false, message: 'Name is required' };
    }
    if (!address.address1.trim()) {
      return { success: false, message: 'Address 1 is required' };
    }
    if (!address.city.trim()) {
      return { success: false, message: 'City is required' };
    }
    if (!address.stateProv) {
      return { success: false, message: 'State/Province is required' };
    }
    if (!address.country) {
      return { success: false, message: 'Country is required' };
    }

    if (address.contactEmail && !validateEmail(address.contactEmail)) {
      return { success: false, message: 'Invalid email address format' };
    }

    if (address.contactPhone && !validatePhoneNumber(address.contactPhone)) {
      return { success: false, message: 'Invalid phone number format (must be 10 digits)' };
    }

    const { data, error } = await supabase
      .from('client_addresses')
      .insert({
        client_id: clientId,
        name: address.name.substring(0, 40),
        address_1: address.address1.substring(0, 40),
        address_2: (address.address2 || '').substring(0, 40),
        city: address.city.substring(0, 30),
        state_prov: address.stateProv,
        postal_code: (address.postalCode || '').substring(0, 10),
        country: address.country,
        client_ref_id: (address.clientRefId || '').substring(0, 20),
        contact_name: (address.contactName || '').substring(0, 128),
        contact_email: (address.contactEmail || '').substring(0, 40),
        contact_phone: (address.contactPhone || '').substring(0, 20),
        contact_phone_ext: (address.contactPhoneExt || '').substring(0, 5),
        appointment_req: booleanToString(address.appointmentReq),
        active: booleanToString(address.active),
        is_shipper: booleanToString(address.isShipper),
        is_consignee: booleanToString(address.isConsignee)
      })
      .select()
      .single();

    if (error) throw error;

    const newAddress: ClientAddress = {
      id: data.id,
      clientId: data.client_id,
      name: data.name,
      address1: data.address_1,
      address2: data.address_2 || '',
      city: data.city,
      stateProv: data.state_prov,
      postalCode: data.postal_code || '',
      country: data.country,
      clientRefId: data.client_ref_id || '',
      contactName: data.contact_name || '',
      contactEmail: data.contact_email || '',
      contactPhone: data.contact_phone || '',
      contactPhoneExt: data.contact_phone_ext || '',
      appointmentReq: stringToBoolean(data.appointment_req),
      active: stringToBoolean(data.active),
      isShipper: stringToBoolean(data.is_shipper),
      isConsignee: stringToBoolean(data.is_consignee),
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

    return {
      success: true,
      message: 'Address created successfully',
      address: newAddress
    };
  } catch (error) {
    console.error('Failed to create address:', error);
    return {
      success: false,
      message: 'Failed to create address. Please try again.'
    };
  }
}

export async function updateClientAddress(
  addressId: string,
  address: Omit<ClientAddress, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; message: string; address?: ClientAddress }> {
  try {
    if (!address.name.trim()) {
      return { success: false, message: 'Name is required' };
    }
    if (!address.address1.trim()) {
      return { success: false, message: 'Address 1 is required' };
    }
    if (!address.city.trim()) {
      return { success: false, message: 'City is required' };
    }
    if (!address.stateProv) {
      return { success: false, message: 'State/Province is required' };
    }
    if (!address.country) {
      return { success: false, message: 'Country is required' };
    }

    if (address.contactEmail && !validateEmail(address.contactEmail)) {
      return { success: false, message: 'Invalid email address format' };
    }

    if (address.contactPhone && !validatePhoneNumber(address.contactPhone)) {
      return { success: false, message: 'Invalid phone number format (must be 10 digits)' };
    }

    const { data, error } = await supabase
      .from('client_addresses')
      .update({
        name: address.name.substring(0, 40),
        address_1: address.address1.substring(0, 40),
        address_2: (address.address2 || '').substring(0, 40),
        city: address.city.substring(0, 30),
        state_prov: address.stateProv,
        postal_code: (address.postalCode || '').substring(0, 10),
        country: address.country,
        client_ref_id: (address.clientRefId || '').substring(0, 20),
        contact_name: (address.contactName || '').substring(0, 128),
        contact_email: (address.contactEmail || '').substring(0, 40),
        contact_phone: (address.contactPhone || '').substring(0, 20),
        contact_phone_ext: (address.contactPhoneExt || '').substring(0, 5),
        appointment_req: booleanToString(address.appointmentReq),
        active: booleanToString(address.active),
        is_shipper: booleanToString(address.isShipper),
        is_consignee: booleanToString(address.isConsignee),
        updated_at: new Date().toISOString()
      })
      .eq('id', addressId)
      .select()
      .single();

    if (error) throw error;

    const updatedAddress: ClientAddress = {
      id: data.id,
      clientId: data.client_id,
      name: data.name,
      address1: data.address_1,
      address2: data.address_2 || '',
      city: data.city,
      stateProv: data.state_prov,
      postalCode: data.postal_code || '',
      country: data.country,
      clientRefId: data.client_ref_id || '',
      contactName: data.contact_name || '',
      contactEmail: data.contact_email || '',
      contactPhone: data.contact_phone || '',
      contactPhoneExt: data.contact_phone_ext || '',
      appointmentReq: stringToBoolean(data.appointment_req),
      active: stringToBoolean(data.active),
      isShipper: stringToBoolean(data.is_shipper),
      isConsignee: stringToBoolean(data.is_consignee),
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

    return {
      success: true,
      message: 'Address updated successfully',
      address: updatedAddress
    };
  } catch (error) {
    console.error('Failed to update address:', error);
    return {
      success: false,
      message: 'Failed to update address. Please try again.'
    };
  }
}

export async function deleteClientAddress(addressId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('client_addresses')
      .delete()
      .eq('id', addressId);

    if (error) throw error;

    return {
      success: true,
      message: 'Address deleted successfully'
    };
  } catch (error) {
    console.error('Failed to delete address:', error);
    return {
      success: false,
      message: 'Failed to delete address. Please try again.'
    };
  }
}
