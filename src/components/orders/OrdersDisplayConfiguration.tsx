import React from 'react';
import { Database } from 'lucide-react';

interface OrdersDisplayConfigurationProps {
  orderDisplayFields: string;
  onUpdateOrderDisplayFields: (fields: string) => void;
}

export default function OrdersDisplayConfiguration({
  orderDisplayFields,
  onUpdateOrderDisplayFields
}: OrdersDisplayConfigurationProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
      <div className="flex items-center space-x-3 mb-6">
        <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg">
          <Database className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">Orders Display Configuration</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configure which fields vendors see in the Orders dashboard</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Order Display Fields (JSON Array)
        </label>
        <textarea
          value={orderDisplayFields || ''}
          onChange={(e) => onUpdateOrderDisplayFields(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
          rows={6}
          placeholder='["orderId", "opCode", "consignee.name", "consignee.city", "shipper.name", "status"]'
        />
        <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <p><strong>Available Fields:</strong></p>
          <p>• <code>orderId</code>, <code>opCode</code>, <code>status</code>, <code>currentZone</code></p>
          <p>• <code>consignee.name</code>, <code>consignee.city</code>, <code>consignee.state</code></p>
          <p>• <code>shipper.name</code>, <code>shipper.city</code>, <code>shipper.state</code></p>
          <p><strong>Example:</strong> <code>["orderId", "opCode", "consignee.name", "shipper.name", "status"]</code></p>
        </div>
      </div>
    </div>
  );
}
