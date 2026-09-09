import React, { useState, useEffect } from 'react';
import { RefreshCw, Package, AlertCircle, Search, Filter, Calendar, MapPin, Truck, User as UserIcon, Building } from 'lucide-react';
import type { User, ApiConfig } from '../types';
import { getAuthHeaders } from '../lib/supabase';

interface OrdersPageProps {
  user: User;
  apiConfig: ApiConfig;
}

interface Order {
  orderId: string;
  opCode: string;
  consignee?: {
    name?: string;
    city?: string;
    state?: string;
  };
  shipper?: {
    name?: string;
    city?: string;
    state?: string;
  };
  status?: string;
  currentZone?: string;
  [key: string]: any; // Allow for additional dynamic fields
}

export default function OrdersPage({ user, apiConfig }: OrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [displayFields, setDisplayFields] = useState<string[]>(['orderId', 'opCode']);
  const [isInitialized, setIsInitialized] = useState(false);

  // Parse display fields from API config and mark as initialized
  useEffect(() => {
    console.log('OrdersPage - Parsing display fields from API config:', apiConfig.orderDisplayFields);
    if (apiConfig.orderDisplayFields) {
      try {
        const fields = JSON.parse(apiConfig.orderDisplayFields);
        if (Array.isArray(fields) && fields.length > 0) {
          console.log('OrdersPage - Setting display fields:', fields);
          setDisplayFields(fields);
        }
      } catch (error) {
        console.error('Failed to parse order display fields:', error);
        // Keep default fields
      }
    }
    setIsInitialized(true);
  }, [apiConfig.orderDisplayFields]);

  const fetchOrders = async () => {
    if (!apiConfig.path || !user.currentZone) {
      setError('API configuration or current zone not set. Please contact your administrator.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const hasNestedFields = displayFields.some(field => field.includes('.'));
      let selectParam = '';

      if (!hasNestedFields) {
        selectParam = `$select=${displayFields.join(',')}&`;
      }

      const queryParams = [
        'limit=20',
        'offset=0',
        'expand=consignee,shipper',
        'type=T',
        `$filter=currentZone eq '${encodeURIComponent(user.currentZone)}' and status eq 'AGTDOCKED'`
      ];

      const queryString = `${selectParam}${queryParams.join('&')}`;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = await getAuthHeaders();

      const response = await fetch(`${supabaseUrl}/functions/v1/api-proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          apiPath: '/orders',
          httpMethod: 'GET',
          queryString,
        }),
      });

      if (!response.ok) {
        let errorMessage = `API call failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Orders API response:', data);

      // Handle different response formats
      let ordersArray: Order[] = [];
      if (Array.isArray(data)) {
        ordersArray = data;
      } else if (data.orders && Array.isArray(data.orders)) {
        ordersArray = data.orders;
      } else if (data.data && Array.isArray(data.data)) {
        ordersArray = data.data;
      } else if (data.value && Array.isArray(data.value)) {
        ordersArray = data.value;
      } else {
        console.warn('Unexpected API response format:', data);
        ordersArray = [];
      }

      setOrders(ordersArray);
      setLastRefresh(new Date());

    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch orders only after initialization and when all required data is available
  useEffect(() => {
    console.log('OrdersPage - Checking if should auto-fetch:', {
      isInitialized,
      currentZone: user.currentZone,
      apiPath: apiConfig.path,
      displayFieldsLength: displayFields.length
    });
    
    // Only fetch if initialized and we have all required data and it's not empty/placeholder values
    if (isInitialized &&
        user.currentZone && 
        apiConfig.path && 
        apiConfig.path !== '' && 
        !apiConfig.path.includes('placeholder') &&
        user.currentZone !== '' &&
        displayFields.length > 0) {
      console.log('OrdersPage - Auto-fetching orders with all required data available');
      fetchOrders();
    } else {
      console.log('OrdersPage - Skipping initial fetch - missing required data:', {
        isInitialized,
        currentZone: user.currentZone,
        apiPath: apiConfig.path,
        displayFieldsLength: displayFields.length
      });
    }
  }, [isInitialized, user.currentZone, apiConfig.path, displayFields]);

  const handleRefresh = () => {
    fetchOrders();
  };

  const formatFieldValue = (order: Order, field: string): string => {
    // Handle nested fields like consignee.name, shipper.city
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      const parentObj = order[parent];
      if (parentObj && typeof parentObj === 'object') {
        return parentObj[child] || 'N/A';
      }
      return 'N/A';
    }
    
    // Handle direct fields
    const value = order[field];
    if (value === null || value === undefined) {
      return 'N/A';
    }
    
    return String(value);
  };

  const getFieldDisplayName = (field: string): string => {
    // Check for custom display labels first
    if (apiConfig.customOrderDisplayFields) {
      const customMapping = apiConfig.customOrderDisplayFields.find(mapping => mapping.fieldName === field);
      if (customMapping && customMapping.displayLabel) {
        return customMapping.displayLabel;
      }
    }
    
    // Fall back to default field names
    const fieldNames: Record<string, string> = {
      'orderId': 'Order ID',
      'opCode': 'Op Code',
      'consignee.name': 'Consignee',
      'consignee.city': 'Consignee City',
      'consignee.state': 'Consignee State',
      'shipper.name': 'Shipper',
      'shipper.city': 'Shipper City',
      'shipper.state': 'Shipper State',
      'status': 'Status',
      'currentZone': 'Current Zone'
    };
    
    return fieldNames[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const getFieldIcon = (field: string) => {
    if (field.includes('consignee')) return <Building className="h-4 w-4 text-blue-600" />;
    if (field.includes('shipper')) return <Truck className="h-4 w-4 text-green-600" />;
    if (field.includes('Zone')) return <MapPin className="h-4 w-4 text-purple-600" />;
    if (field.includes('status')) return <Package className="h-4 w-4 text-orange-600" />;
    return <Package className="h-4 w-4 text-gray-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl">
              <Package className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Orders Dashboard</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Current Zone: <span className="font-semibold text-blue-600 dark:text-blue-400">{user.currentZone || 'Not Set'}</span>
              </p>
              {lastRefresh && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Loading...' : 'Refresh Orders'}</span>
          </button>
        </div>
      </div>

      {/* Configuration Warning */}
      {(!user.currentZone || !apiConfig.path) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-300">Configuration Required</h3>
              <p className="text-amber-700 dark:text-amber-400 mt-1">
                {!user.currentZone && 'Your current zone is not configured. '}
                {!apiConfig.path && 'The API base path is not configured. '}
                Please contact your administrator to set up your account.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-300">Error Loading Orders</h3>
              <p className="text-red-700 dark:text-red-400 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Orders Grid */}
      {orders.length > 0 && (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Current Orders</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {orders.length} order{orders.length !== 1 ? 's' : ''} found in zone "{user.currentZone}"
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Status: AGTDOCKED
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {displayFields.map((field) => (
                    <th
                      key={field}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      <div className="flex items-center space-x-2">
                        {getFieldIcon(field)}
                        <span>{getFieldDisplayName(field)}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {orders.map((order, index) => (
                  <tr key={order.orderId || index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    {displayFields.map((field) => (
                      <td key={field} className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {formatFieldValue(order, field)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Orders State */}
      {!loading && !error && orders.length === 0 && user.currentZone && apiConfig.path && (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-100 dark:border-gray-700 p-12 text-center">
          <div className="bg-blue-100 dark:bg-blue-900/50 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Package className="h-10 w-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">No Orders Found</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            No orders were found in zone "{user.currentZone}" with status "AGTDOCKED". 
            Try refreshing or contact your administrator if you expect to see orders here.
          </p>
          <button
            onClick={handleRefresh}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
          >
            <RefreshCw className="h-5 w-5" />
            <span>Refresh Orders</span>
          </button>
        </div>
      )}

      {/* Information Panel */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-6">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">Orders Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700 dark:text-blue-400">
          <div>
            <h5 className="font-medium mb-2">Current Filters:</h5>
            <ul className="space-y-1">
              <li>• <strong>Zone:</strong> {user.currentZone || 'Not configured'}</li>
              <li>• <strong>Status:</strong> AGTDOCKED</li>
              <li>• <strong>Type:</strong> T</li>
              <li>• <strong>Limit:</strong> 20 orders</li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium mb-2">Display Fields:</h5>
            <ul className="space-y-1">
              {displayFields.map(field => (
                <li key={field}>• {getFieldDisplayName(field)}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-600">
          <p className="text-xs text-blue-600 dark:text-blue-300">
            <strong>Note:</strong> Display fields and API settings can be configured by administrators in the Settings page.
            Your current zone can be updated by an administrator in User Management.
          </p>
        </div>
      </div>
    </div>
  );
}