import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import type { ApiConfig, OrderDisplayMapping } from '../../types';
import { getAuthHeaders } from '../../lib/supabase';

interface OrdersPreviewProps {
  apiConfig: ApiConfig;
  displayFields: string[];
  customDisplayFields: OrderDisplayMapping[];
}

export default function OrdersPreview({ apiConfig, displayFields, customDisplayFields }: OrdersPreviewProps) {
  const [ordersTestResult, setOrdersTestResult] = useState<{ success: boolean; message: string; orders?: any[]; displayFields?: string[] } | null>(null);
  const [isTestingOrders, setIsTestingOrders] = useState(false);

  const handleTestOrdersDisplay = async () => {
    setIsTestingOrders(true);
    setOrdersTestResult(null);

    try {
      if (!apiConfig.path) {
        setOrdersTestResult({
          success: false,
          message: 'Please enter a Base API Path first'
        });
        return;
      }

      const hasNestedFields = displayFields.some(field => field.includes('.'));
      let selectParam = '';

      if (!hasNestedFields) {
        selectParam = `$select=${displayFields.join(',')}&`;
      }

      const queryParams = [
        'limit=5',
        'offset=0',
        'expand=consignee,shipper',
        'type=T',
        `$filter=status eq 'AGTDOCKED'`
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

      if (response.ok) {
        const data = await response.json();

        let ordersArray: any[] = [];
        if (Array.isArray(data)) {
          ordersArray = data;
        } else if (data.orders && Array.isArray(data.orders)) {
          ordersArray = data.orders;
        } else if (data.data && Array.isArray(data.data)) {
          ordersArray = data.data;
        } else if (data.value && Array.isArray(data.value)) {
          ordersArray = data.value;
        }

        setOrdersTestResult({
          success: true,
          message: `Successfully fetched ${ordersArray.length} sample orders`,
          orders: ordersArray.slice(0, 5),
          displayFields
        });
      } else {
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
        setOrdersTestResult({
          success: false,
          message: errorMessage
        });
      }
    } catch (error) {
      setOrdersTestResult({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsTestingOrders(false);
    }
  };

  const formatFieldValue = (order: any, field: string): string => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      const parentObj = order[parent];
      if (parentObj && typeof parentObj === 'object') {
        return parentObj[child] || 'N/A';
      }
      return 'N/A';
    }

    const value = order[field];
    if (value === null || value === undefined) {
      return 'N/A';
    }

    return String(value);
  };

  const getFieldDisplayName = (field: string): string => {
    const customMapping = customDisplayFields.find(mapping => mapping.fieldName === field);
    if (customMapping && customMapping.displayLabel) {
      return customMapping.displayLabel;
    }

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

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Preview Orders Display</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">Test the Orders page configuration with live data</p>
        </div>
        <button
          onClick={handleTestOrdersDisplay}
          disabled={isTestingOrders}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          <Eye className="h-4 w-4" />
          <span>{isTestingOrders ? 'Testing...' : 'Preview Orders Display'}</span>
        </button>
      </div>

      {ordersTestResult && (
        <div className={`border rounded-lg p-4 ${
          ordersTestResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-4 h-4 rounded-full ${
              ordersTestResult.success ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-semibold ${
              ordersTestResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
            }`}>
              {ordersTestResult.success ? 'Orders Preview Test Passed' : 'Orders Preview Test Failed'}
            </span>
          </div>
          <p className={`text-sm mt-1 ${
            ordersTestResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
          }`}>
            {ordersTestResult.message}
          </p>

          {ordersTestResult.success && ordersTestResult.orders && ordersTestResult.orders.length > 0 && (
            <div className="mt-4">
              <h5 className="font-medium text-green-800 dark:text-green-300 mb-3">Preview of Orders Display:</h5>
              <div className="bg-white dark:bg-gray-700 rounded-lg border border-green-200 dark:border-green-600 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-50 dark:bg-gray-600">
                    <tr>
                      {ordersTestResult.displayFields?.map((field) => (
                        <th
                          key={field}
                          className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                        >
                          {getFieldDisplayName(field)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                    {ordersTestResult.orders.slice(0, 3).map((order, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                        {ordersTestResult.displayFields?.map((field) => (
                          <td key={field} className="px-4 py-2 whitespace-nowrap">
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
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Showing first 3 orders. Vendors will see orders filtered by their assigned zone.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
