import React, { useState, useEffect } from 'react';
import { FileText, Inbox, AlertTriangle } from 'lucide-react';
import ImagingDocumentsTab from './imaging/ImagingDocumentsTab';
import ImagingUnindexedTab from './imaging/ImagingUnindexedTab';
import { supabase } from '../lib/supabase';

type ImagingTab = 'documents' | 'unindexed' | 'missing';

interface ImagingPageProps {
  isAdmin?: boolean;
  canDeleteImaging?: boolean;
  canRerunImagingWorkflow?: boolean;
  canRetryEpdf?: boolean;
}

export default function ImagingPage({ isAdmin = false, canDeleteImaging = false, canRerunImagingWorkflow = false, canRetryEpdf = false }: ImagingPageProps) {
  const [activeTab, setActiveTab] = useState<ImagingTab>('documents');
  const [unindexedCount, setUnindexedCount] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ count: queueCount }, { count: batchCount }] = await Promise.all([
        supabase.from('imaging_unindexed_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('imaging_batches').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      ]);
      setUnindexedCount((queueCount || 0) + (batchCount || 0));
    })();
  }, [activeTab]);

  const tabs = [
    { id: 'documents' as ImagingTab, label: 'Indexed', icon: FileText },
    { id: 'unindexed' as ImagingTab, label: 'Unindexed', icon: Inbox },
    { id: 'missing' as ImagingTab, label: 'Missing', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-md transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow-sm font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              <Icon className={`h-4 w-4 ${
                activeTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`} />
              <span className="text-sm font-medium">{tab.label}</span>
              {tab.id === 'unindexed' && unindexedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white min-w-[18px] text-center">
                  {unindexedCount > 99 ? '99+' : unindexedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
        {activeTab === 'documents' && <ImagingDocumentsTab isAdmin={isAdmin} canDeleteImaging={canDeleteImaging} canRerunImagingWorkflow={canRerunImagingWorkflow} canRetryEpdf={canRetryEpdf} />}
        {activeTab === 'unindexed' && <ImagingUnindexedTab isAdmin={isAdmin} canDeleteImaging={canDeleteImaging} />}
        {activeTab === 'missing' && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-amber-400" />
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Missing Documents</h3>
            <p className="text-sm">This queue is reserved for documents flagged as missing. Content coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
