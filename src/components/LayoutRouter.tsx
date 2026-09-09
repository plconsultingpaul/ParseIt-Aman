import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings, FileText, LogOut, User, HelpCircle, Menu, X, BarChart3, RefreshCw, Database, Building, Package, Building2, DollarSign, Users as UsersIcon, BookUser, Brain, MapPin, Receipt, Play, KeyRound, Camera, ChevronsLeft, ChevronsRight, Video, Moon, Sun, ExternalLink, Inbox } from 'lucide-react';
import type { User as UserType } from '../types';
import type { CompanyBranding } from '../types';
import ChangePasswordModal from './common/ChangePasswordModal';
import { geminiConfigService } from '../services/geminiConfigService';
import { useLicense } from '../hooks/useLicense';
import { useDarkMode } from '../hooks/useDarkMode';
import { fetchActiveSsoApplications } from '../services/ssoApplicationService';
import type { SsoApplication } from '../services/ssoApplicationService';
import { supabase } from '../lib/supabase';

import { fetchPendingInboxCount } from '../services/inboxService';
import { fetchEmailProcessingQueueFailedCount } from '../services/emailProcessingQueueService';

interface LayoutRouterProps {
  children: React.ReactNode;
  user: UserType;
  companyBranding?: CompanyBranding;
  onLogout: () => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

export default function LayoutRouter({ children, user, companyBranding, onLogout, onChangePassword }: LayoutRouterProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModelName, setActiveModelName] = useState<string>('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [ssoApps, setSsoApps] = useState<SsoApplication[]>([]);
  const [inboxPendingCount, setInboxPendingCount] = useState(0);
  const [inboxFailedCount, setInboxFailedCount] = useState(0);
  const [imagingUnindexedCount, setImagingUnindexedCount] = useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { hasFeature } = useLicense();
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const isSidebarExpanded = !isSidebarCollapsed;

  useEffect(() => {
    const fetchActiveModel = async () => {
      try {
        const config = await geminiConfigService.getActiveConfiguration();
        if (config && config.modelName) {
          const displayName = config.modelName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          setActiveModelName(displayName);
        } else {
          setActiveModelName('');
        }
      } catch (error) {
        console.error('Failed to fetch active Gemini model:', error);
        setActiveModelName('');
      }
    };

    fetchActiveModel();

    const interval = setInterval(fetchActiveModel, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchActiveSsoApplications().then(setSsoApps).catch(() => {});
    const handleChange = () => { fetchActiveSsoApplications().then(setSsoApps).catch(() => {}); };
    window.addEventListener('sso-applications-changed', handleChange);
    return () => window.removeEventListener('sso-applications-changed', handleChange);
  }, []);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'user')) return;
    const loadCount = () => {
      fetchPendingInboxCount().then(setInboxPendingCount).catch(() => {});
      fetchEmailProcessingQueueFailedCount().then(setInboxFailedCount).catch(() => {});
    };
    loadCount();
    const interval = setInterval(loadCount, 30000);
    window.addEventListener('inbox-changed', loadCount);
    return () => {
      clearInterval(interval);
      window.removeEventListener('inbox-changed', loadCount);
    };
  }, [user]);

  useEffect(() => {
    const load = async () => {
      const [{ count: queueCount }, { count: batchCount }] = await Promise.all([
        supabase.from('imaging_unindexed_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('imaging_batches').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      ]);
      setImagingUnindexedCount((queueCount || 0) + (batchCount || 0));
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickSwitch = (app: SsoApplication) => {
    if (!app.appIdentifier) {
      window.open(app.url, '_blank');
      setUserMenuOpen(false);
      return;
    }
    console.log('[QuickSwitch] Starting SSO for:', { name: app.name, url: app.url, appIdentifier: app.appIdentifier });
    const newTab = window.open('about:blank', '_blank');
    supabase.functions.invoke('create-sso-token', {
      body: { targetUrl: app.url, appIdentifier: app.appIdentifier },
    }).then(({ data, error }) => {
      console.log('[QuickSwitch] create-sso-token response:', { data, error: error ? { message: error.message, name: error.name, context: (error as any).context } : null });
      if (!error && data?.redirectUrl && newTab) {
        console.log('[QuickSwitch] Navigating new tab to:', data.redirectUrl);
        newTab.location.href = data.redirectUrl;
      } else if (newTab) {
        console.error('[QuickSwitch] Closing tab due to error or missing redirectUrl. error:', error, 'data:', data);
        newTab.close();
      }
    });
    setUserMenuOpen(false);
  };

  const navigationItems = React.useMemo(() => [
    {
      id: 'order-entry',
      label: 'Order Entry',
      icon: FileText,
      path: '/order-entry',
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'rate-quote',
      label: 'Rate Quote',
      icon: DollarSign,
      path: '/rate-quote',
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'address-book',
      label: 'Address Book',
      icon: BookUser,
      path: '/address-book',
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'track-trace',
      label: 'Track & Trace',
      icon: MapPin,
      path: '/track-trace',
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'invoices',
      label: 'Invoices',
      icon: Receipt,
      path: '/invoices',
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'client-users',
      label: 'Users',
      icon: UsersIcon,
      path: '/client-users',
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'extract',
      label: 'Extract',
      icon: FileText,
      path: '/extract',
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'transform',
      label: 'Transform',
      icon: RefreshCw,
      path: '/transform',
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'execute',
      label: 'Execute',
      icon: Play,
      path: '/execute',
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: Inbox,
      path: '/inbox',
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'types',
      label: 'Type Setup',
      icon: Database,
      path: '/types',
      requiresPermission: true,
      roles: ['admin', 'user']
    },
    {
      id: 'vendor-setup',
      label: 'Vendor Setup',
      icon: Package,
      path: '/vendor-setup',
      requiresPermission: true,
      roles: ['admin', 'user']
    },
    {
      id: 'client-setup',
      label: 'Client Setup',
      icon: Building2,
      path: '/client-setup',
      requiresPermission: true,
      roles: ['admin', 'user']
    },
    {
      id: 'imaging',
      label: 'Imaging',
      icon: Camera,
      path: '/imaging',
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: BarChart3,
      path: '/logs',
      requiresPermission: false,
      roles: ['admin', 'user']
    },
  ], []);

  const filteredNavigationItems = React.useMemo(() => {
    if (!user || !user.role) {
      return [];
    }

    return navigationItems.filter(item => {
      if (!item.roles.includes(user.role)) {
        return false;
      }

      if (item.id === 'extract' && !hasFeature('extract')) return false;
      if (item.id === 'transform' && !hasFeature('transform')) return false;
      if (item.id === 'execute' && !hasFeature('execute')) return false;
      if (item.id === 'client-setup' && !hasFeature('clientSetup')) return false;
      if (item.id === 'vendor-setup' && !hasFeature('vendorSetup')) return false;
      if (item.id === 'imaging' && !hasFeature('imaging')) return false;

      if (user.role === 'user' && !user.isAdmin) {
        if (item.id === 'extract' && !user.permissions.extractPage) {
          return false;
        }
        if (item.id === 'transform' && !user.permissions.transformPage) {
          return false;
        }
        if (item.id === 'execute' && !user.permissions.executePage) {
          return false;
        }
        if (item.id === 'types' && !user.permissions.extractionTypes && !user.permissions.transformationTypes && !user.permissions.executeSetup && !user.permissions.workflowManagement) {
          return false;
        }
        if (item.id === 'logs') {
          const hasAnyLogsPermission = user.permissions.extractionLogs || user.permissions.workflowLogs ||
            user.permissions.emailPolling || user.permissions.processedEmails ||
            user.permissions.sftpPolling;
          if (!hasAnyLogsPermission) return false;
        }
      }

      if (item.id === 'vendor-setup' && !user.permissions.vendorSetup && !user.permissions.ordersConfiguration) {
        return false;
      }

      if (item.id === 'client-setup' && !user.permissions.clientManagement && !user.permissions.clientUserManagement && !user.permissions.orderEntry && !user.permissions.submissions && !user.permissions.trackTrace) {
        return false;
      }

      if (item.id === 'settings') {
        const hasAnyPermission = user.permissions.sftp || user.permissions.api ||
          user.permissions.emailMonitoring || user.permissions.emailRules ||
          user.permissions.processedEmails || user.permissions.extractionLogs ||
          user.permissions.userManagement;
        if (!hasAnyPermission) {
          return false;
        }
      }

      if (item.id === 'order-entry' && (!user.hasOrderEntryAccess || user.role !== 'client')) {
        return false;
      }

      if (item.id === 'rate-quote' && (!user.hasRateQuoteAccess || user.role !== 'client')) {
        return false;
      }

      if (item.id === 'address-book' && user.role !== 'client') {
        return false;
      }
      if (item.id === 'address-book' && user.role === 'client' && !user.isClientAdmin && !user.hasAddressBookAccess) {
        return false;
      }

      if (item.id === 'track-trace' && (!user.hasTrackTraceAccess || user.role !== 'client')) {
        return false;
      }

      if (item.id === 'invoices' && (!user.hasInvoiceAccess || user.role !== 'client')) {
        return false;
      }

      if (item.id === 'client-users' && (!user.isClientAdmin || user.role !== 'client')) {
        return false;
      }

      return true;
    });
  }, [user, navigationItems]);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/extract') return 'Upload & Extract';
    if (path === '/vendor-setup') return 'Vendor Setup';
    if (path === '/client-setup') return 'Client Setup';
    if (path === '/transform') return 'Transform & Rename';
    if (path === '/execute') return 'Execute';
    if (path === '/types') return 'Type Setup';
    if (path === '/settings') return 'Settings';
    if (path === '/logs') return 'Activity Logs';
    if (path === '/order-entry') return 'Order Entry';
    if (path.startsWith('/order-entry/submissions')) return 'Order Submissions';
    if (path === '/rate-quote') return 'Rate Quote';
    if (path === '/address-book') return 'Address Book';
    if (path === '/track-trace') return 'Track & Trace';
    if (path === '/invoices') return 'Invoices';
    if (path === '/client-users') return 'User Management';
    if (path === '/imaging') return 'Imaging';
    return 'Parse-It';
  };

  const getPageDescription = () => {
    const path = location.pathname;
    if (path === '/extract') return user.role === 'vendor' ? 'Upload your PDF documents for automated processing' : 'Upload PDFs and extract structured data';
    if (path === '/vendor-setup') return 'Manage vendor accounts and configure orders display settings';
    if (path === '/client-setup') return 'Manage client companies and their users';
    if (path === '/transform') return 'Extract data from PDFs to intelligently rename files';
    if (path === '/execute') return 'Run configured actions with custom parameters';
    if (path === '/types') return 'Configure extraction types, transformation types, and workflows';
    if (path === '/settings') return 'Configure Parse-It settings and preferences';
    if (path === '/logs') return 'Monitor system activity and processing logs';
    if (path === '/order-entry') return 'Create and manage orders for your organization';
    if (path.startsWith('/order-entry/submissions')) return 'View and manage order submissions';
    if (path === '/rate-quote') return 'Request and manage pricing quotes';
    if (path === '/address-book') return 'Manage customer shipping and receiving addresses';
    if (path === '/track-trace') return 'Track and monitor your shipments in real-time';
    if (path === '/invoices') return 'View and manage your invoices';
    if (path === '/client-users') return 'Manage users in your organization';
    if (path === '/imaging') return 'Document imaging and scanning';
    return 'PDF Data Extraction';
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden transition-colors duration-300">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200 lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } ${isSidebarExpanded ? 'w-64' : 'w-[68px]'}`}>
        {/* Sidebar Header */}
        <div className={`flex h-16 items-center border-b border-gray-200 dark:border-gray-700 flex-shrink-0 ${isSidebarExpanded ? 'px-4' : 'justify-center px-2'}`}>
              {companyBranding?.companyName ? (
                isSidebarExpanded ? (
                  <div className="flex flex-col items-start min-w-0">
                    <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-full">
                      {companyBranding.companyName}
                    </h1>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Powered by Parse-It</p>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-2 rounded-lg flex-shrink-0">
                    <span className="text-white font-bold text-sm">{companyBranding.companyName.charAt(0)}</span>
                  </div>
                )
              ) : (
                <>
                  <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-2 rounded-lg flex-shrink-0">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  {isSidebarExpanded && (
                  <div className="min-w-0 ml-3">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-purple-600 bg-clip-text text-transparent truncate">
                      Parse-It
                    </h1>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      PDF Data Extraction
                    </p>
                  </div>
                  )}
                </>
              )}
        </div>

        {/* Navigation Menu */}
        <nav className={`flex-1 overflow-y-auto min-h-0 py-3 ${isSidebarExpanded ? 'px-3' : 'px-2'}`}>
          <div className="space-y-1">
            {filteredNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path && (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));

              if (item.externalUrl) {
                return (
                  <a
                    key={item.id}
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                      isSidebarExpanded ? 'gap-3 px-3' : 'justify-center px-2'
                    } text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700`}
                    title={!isSidebarExpanded ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                    {isSidebarExpanded && item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`relative w-full flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                    isSidebarExpanded ? 'gap-3 px-3' : 'justify-center px-2'
                  } ${
                    isActive
                      ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700'
                  }`}
                  title={!isSidebarExpanded ? item.label : undefined}
                >
                  <Icon className={`h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'
                  }`} />
                  {isSidebarExpanded && (
                    <span className="flex-1 flex items-center justify-between">
                      {item.label}
                      {item.id === 'inbox' && inboxPendingCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                          {inboxPendingCount > 99 ? '99+' : inboxPendingCount}
                        </span>
                      )}
                      {item.id === 'inbox' && inboxFailedCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                          {inboxFailedCount > 99 ? '99+' : inboxFailedCount}
                        </span>
                      )}
                      {item.id === 'imaging' && imagingUnindexedCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                          {imagingUnindexedCount > 99 ? '99+' : imagingUnindexedCount}
                        </span>
                      )}
                    </span>
                  )}
                  {!isSidebarExpanded && item.id === 'inbox' && (inboxPendingCount > 0 || inboxFailedCount > 0) && (
                    <span className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${inboxFailedCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
                  )}
                  {!isSidebarExpanded && item.id === 'imaging' && imagingUnindexedCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {activeModelName && (
          <div className={`border-t border-gray-200 dark:border-gray-700 flex-shrink-0 py-2 ${isSidebarExpanded ? 'px-3' : 'px-2'}`}>
            <div className={`flex items-center ${isSidebarExpanded ? 'gap-2 px-3 py-2' : 'justify-center py-2'} bg-blue-50 dark:bg-blue-900/20 rounded-lg`}>
              <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              {isSidebarExpanded && (
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
                  {activeModelName}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Bottom Icon Bar */}
        <div className={`border-t border-gray-200 dark:border-gray-700 flex-shrink-0 py-3 ${isSidebarExpanded ? 'px-4' : 'px-2'}`}>
          <div className={`flex items-center ${isSidebarExpanded ? 'justify-start gap-1' : 'flex-col gap-1'}`}>
            {/* User Avatar with Popover */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 dark:from-gray-500 dark:to-gray-600 text-white text-xs font-bold hover:ring-2 hover:ring-purple-400 transition-all"
                title={user.name || user.username}
              >
                {(user.name || user.username).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </button>

              {userMenuOpen && (
                <div className={`absolute bottom-full mb-2 ${isSidebarExpanded ? 'left-0' : 'left-1/2 -translate-x-1/2'} w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-3 px-4 z-50`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 dark:from-gray-500 dark:to-gray-600 text-white text-sm font-bold flex-shrink-0">
                      {(user.name || user.username).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {user.name || user.username}
                      </p>
                      {user.email && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>
                  {onChangePassword && (
                    <button
                      onClick={() => { setShowChangePassword(true); setUserMenuOpen(false); }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors mb-1"
                    >
                      <KeyRound className="h-4 w-4" />
                      Change Password
                    </button>
                  )}
                  {ssoApps.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 my-2 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 mb-1">Quick Switch</p>
                      {ssoApps.map((app) => (
                        <button
                          key={app.id}
                          onClick={() => handleQuickSwitch(app)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {app.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { onLogout(); setUserMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            {/* Settings Icon */}
            <Link
              to="/settings"
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                location.pathname === '/settings'
                  ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700'
              }`}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>

            {/* Videos Icon */}
            {companyBranding?.trainingVideoLink && (
              <button
                onClick={() => window.open(companyBranding.trainingVideoLink, '_blank')}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
                title="Videos"
              >
                <Video className="h-5 w-5" />
              </button>
            )}

            {/* Help Icon */}
            <button
              onClick={() => window.open('/help', '_blank')}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
              title="Help"
            >
              <HelpCircle className="h-5 w-5" />
            </button>

            {/* Dark/Light Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Collapse Toggle - pinned to very bottom, desktop only */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden border-t border-gray-200 dark:border-gray-700 p-3 text-gray-400 dark:text-gray-500 transition-colors hover:bg-purple-50 dark:hover:bg-gray-700 hover:text-purple-600 dark:hover:text-gray-300 lg:flex lg:items-center lg:justify-center flex-shrink-0"
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed
            ? <ChevronsRight className="h-4 w-4" />
            : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-14 items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {getPageTitle()}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{getPageDescription()}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      {onChangePassword && (
        <ChangePasswordModal
          isOpen={showChangePassword}
          onClose={() => setShowChangePassword(false)}
          onChangePassword={onChangePassword}
        />
      )}
    </div>
  );
}
