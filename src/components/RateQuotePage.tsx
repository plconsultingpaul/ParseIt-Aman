import React from 'react';
import { DollarSign, Info } from 'lucide-react';

export default function RateQuotePage() {
  return (
    <div className="space-y-6">
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl border border-purple-100 dark:border-gray-700 p-8">
        <div className="text-center max-w-2xl mx-auto">
          <div className="bg-green-100 dark:bg-green-900/50 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <DollarSign className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>

          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Rate Quote
          </h2>

          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Rate quote functionality will be implemented here. This page will allow you to request, view, and manage pricing quotes for your services.
          </p>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-6 text-left">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900 dark:text-green-300 mb-2">
                  Planned Features
                </h3>
                <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
                  <li>• Request price quotes for services</li>
                  <li>• View quote history and details</li>
                  <li>• Compare multiple quotes</li>
                  <li>• Accept or decline quotes</li>
                  <li>• Export quote information</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
