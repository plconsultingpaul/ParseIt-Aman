import React, { useState, useEffect, useRef } from 'react';
import { Settings, FileText, LogOut, User, HelpCircle, Menu, X, BarChart3, RefreshCw, Database, Building, Package, Building2, DollarSign, Users as UsersIcon, BookUser, Brain, MapPin, Receipt, Play, Camera, ChevronsLeft, ChevronsRight, Video, Moon, Sun, ExternalLink, Inbox } from 'lucide-react';
import type { User as UserType } from '../types';
import type { CompanyBranding } from '../types';
import PermissionDeniedModal from './common/PermissionDeniedModal';
import { geminiConfigService } from '../services/geminiConfigService';
import { useLicense } from '../hooks/useLicense';
import { useDarkMode } from '../hooks/useDarkMode';
import { fetchActiveSsoApplications } from '../services/ssoApplicationService';
import type { SsoApplication } from '../services/ssoApplicationService';
import { supabase } from '../lib/supabase';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: 'extract' | 'vendor-setup' | 'client-setup' | 'transform' | 'execute' | 'types' | 'settings' | 'logs' | 'order-entry' | 'order-submissions' | 'order-submission-detail' | 'rate-quote' | 'client-users' | 'address-book' | 'track-trace' | 'invoices' | 'imaging';
  onNavigate: (page: 'extract' | 'vendor-setup' | 'client-setup' | 'transform' | 'execute' | 'types' | 'settings' | 'logs' | 'order-entry' | 'order-submissions' | 'rate-quote' | 'client-users' | 'address-book' | 'track-trace' | 'invoices' | 'imaging' | 'inbox') => void;
  user: UserType;
  companyBranding?: CompanyBranding;
  onLogout: () => void;
}

export default function Layout({ children, currentPage, onNavigate, user, companyBranding, onLogout }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModelName, setActiveModelName] = useState<string>('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [ssoApps, setSsoApps] = useState<SsoApplication[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { hasFeature } = useLicense();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [imagingUnindexedCount, setImagingUnindexedCount] = useState(0);
  const [inboxFailedCount, setInboxFailedCount] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    message: ''
  });

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
    const fetchActiveModel = async () => {
      try {
        const config = await geminiConfigService.getActiveConfiguration();
        if (config && config.modelName) {
          const displayName = config.modelName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          setActiveModelName(displayName);
        }
      } catch (error) {
        console.error('Failed to fetch active Gemini model:', error);
      }
    };

    fetchActiveModel();
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    fetchActiveSsoApplications().then(setSsoApps).catch(() => {});
    const handleChange = () => { fetchActiveSsoApplications().then(setSsoApps).catch(() => {}); };
    window.addEventListener('sso-applications-changed', handleChange);
    return () => window.removeEventListener('sso-applications-changed', handleChange);
  }, []);

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

  useEffect(() => {
    const loadInboxFailed = async () => {
      const { count } = await supabase
        .from('email_processing_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed');
      setInboxFailedCount(count || 0);
    };
    loadInboxFailed();
    const interval = setInterval(loadInboxFailed, 60000);
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

  const isSidebarExpanded = !isSidebarCollapsed;

  const handleSettingsClick = React.useCallback(() => {
    const settingsPermissions = {
      sftp: user.permissions.sftp,
      api: user.permissions.api,
      emailMonitoring: user.permissions.emailMonitoring,
      emailRules: user.permissions.emailRules,
      notificationTemplates: user.permissions.notificationTemplates,
      userManagement: user.permissions.userManagement,
      companyBranding: user.permissions.companyBranding
    };
    const hasAnyPermission = Object.values(settingsPermissions).some(permission => permission === true);

    if (!hasAnyPermission) {
      setPermissionDenied({
        isOpen: true,
        message: 'You do not have permission to access the Settings page. This section requires administrative privileges to configure system settings, manage users, or adjust integrations.',
        title: 'Settings Access Denied'
      });
      return;
    }
    onNavigate('settings');
  }, [user, onNavigate, setPermissionDenied]);

  // Memoize navigation items to prevent recreation on every render
  const navigationItems = React.useMemo(() => [
    // Client user navigation items
    {
      id: 'order-entry',
      label: 'Order Entry',
      icon: FileText,
      onClick: () => onNavigate('order-entry'),
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'rate-quote',
      label: 'Rate Quote',
      icon: DollarSign,
      onClick: () => onNavigate('rate-quote'),
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'address-book',
      label: 'Address Book',
      icon: BookUser,
      onClick: () => onNavigate('address-book'),
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'track-trace',
      label: 'Track & Trace',
      icon: MapPin,
      onClick: () => onNavigate('track-trace'),
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'invoices',
      label: 'Invoices',
      icon: Receipt,
      onClick: () => onNavigate('invoices'),
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'client-users',
      label: 'Users',
      icon: UsersIcon,
      onClick: () => onNavigate('client-users'),
      requiresPermission: true,
      roles: ['client']
    },
    {
      id: 'extract',
      label: 'Extract',
      icon: FileText,
      onClick: () => onNavigate('extract'),
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'transform',
      label: 'Transform',
      icon: RefreshCw,
      onClick: () => onNavigate('transform'),
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'execute',
      label: 'Execute',
      icon: Play,
      onClick: () => onNavigate('execute'),
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: Inbox,
      onClick: () => onNavigate('inbox'),
      requiresPermission: false,
      roles: ['admin', 'user']
    },
    {
      id: 'types',
      label: 'Type Setup',
      icon: Database,
      onClick: () => onNavigate('types'),
      requiresPermission: true,
      roles: ['admin', 'user']
    },
    {
      id: 'vendor-setup',
      label: 'Vendor Setup',
      icon: Package,
      onClick: () => onNavigate('vendor-setup'),
      requiresPermission: true,
      roles: ['admin', 'user']
    },
    {
      id: 'client-setup',
      label: 'Client Setup',
      icon: Building2,
      onClick: () => onNavigate('client-setup'),
      requiresPermission: true,
      roles: ['admin', 'user']
    },
    {
      id: 'imaging',
      label: 'Imaging',
      icon: Camera,
      onClick: () => onNavigate('imaging'),
      requiresPermission: false,
      roles: ['admin', 'user'],
      autoCollapse: true
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: BarChart3,
      onClick: () => onNavigate('logs'),
      requiresPermission: false,
      roles: ['admin', 'user']
    },
  ], [user.role, handleSettingsClick]);

  // Filter navigation items based on user role and permissions
  const filteredNavigationItems = React.useMemo(() => {
    // Wait for user to be fully loaded with role
    if (!user || !user.role) {
      return [];
    }

    const filteredItems = navigationItems.filter(item => {
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
        if (item.id === 'inbox' && !user.permissions.inboxPage) {
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
        if (item.id === 'settings') {
          const hasAnySettingsPermission = user.permissions.sftp || user.permissions.api ||
            user.permissions.emailMonitoring || user.permissions.emailRules ||
            user.permissions.notificationTemplates || user.permissions.userManagement ||
            user.permissions.companyBranding;
          if (!hasAnySettingsPermission) {
            return false;
          }
        }
      }

      if (item.id === 'vendor-setup' && !user.permissions.vendorSetup && !user.permissions.ordersConfiguration) {
        return false;
      }

      if (item.id === 'client-setup' && !user.permissions.clientManagement && !user.permissions.clientUserManagement && !user.permissions.orderEntry && !user.permissions.submissions && !user.permissions.trackTrace) {
        return false;
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

    return filteredItems;
  }, [user, navigationItems]);

  return (
    <>
      <PermissionDeniedModal
        isOpen={permissionDenied.isOpen}
        onClose={() => setPermissionDenied({ isOpen: false, message: '' })}
        message={permissionDenied.message}
        title={permissionDenied.title}
      />
      <div className="h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex overflow-hidden transition-colors duration-300">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-white/90 backdrop-blur-sm border-r border-purple-100 dark:bg-gray-800/90 dark:border-gray-700 transition-all duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isSidebarExpanded ? 'w-64' : 'w-[68px]'}`}>
        {/* Sidebar Header */}
        <div className={`flex h-16 items-center border-b border-purple-100 dark:border-gray-700 flex-shrink-0 ${isSidebarExpanded ? 'px-4' : 'justify-center px-2'}`}>
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
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent truncate">
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
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.onClick();
                    setSidebarOpen(false);
                    if (item.autoCollapse) setIsSidebarCollapsed(true);
                  }}
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
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.id === 'imaging' && imagingUnindexedCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white min-w-[18px] text-center">
                          {imagingUnindexedCount > 99 ? '99+' : imagingUnindexedCount}
                        </span>
                      )}
                      {item.id === 'inbox' && inboxFailedCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white min-w-[18px] text-center">
                          {inboxFailedCount > 99 ? '99+' : inboxFailedCount}
                        </span>
                      )}
                    </>
                  )}
                  {!isSidebarExpanded && item.id === 'imaging' && imagingUnindexedCount > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
                  )}
                  {!isSidebarExpanded && item.id === 'inbox' && inboxFailedCount > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {activeModelName && (
          <div className={`border-t border-purple-100 dark:border-gray-700 flex-shrink-0 py-2 ${isSidebarExpanded ? 'px-3' : 'px-2'}`}>
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
        <div className={`border-t border-purple-100 dark:border-gray-700 flex-shrink-0 py-3 ${isSidebarExpanded ? 'px-4' : 'px-2'}`}>
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
            <button
              onClick={handleSettingsClick}
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                currentPage === 'settings'
                  ? 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700'
              }`}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>

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
          className="hidden border-t border-purple-100 dark:border-gray-700 p-3 text-gray-400 dark:text-gray-500 transition-colors hover:bg-purple-50 dark:hover:bg-gray-700 hover:text-purple-600 dark:hover:text-gray-300 lg:flex lg:items-center lg:justify-center flex-shrink-0"
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
        <header className="flex h-14 items-center border-b border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:block bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-b border-purple-100 dark:border-gray-700 p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {currentPage === 'extract' && 'Upload & Extract'}
                    {currentPage === 'vendor-setup' && 'Vendor Setup'}
                    {currentPage === 'client-setup' && 'Client Setup'}
                    {currentPage === 'transform' && 'Transform & Rename'}
                    {currentPage === 'execute' && 'Execute'}
                    {currentPage === 'types' && 'Type Setup'}
                    {currentPage === 'settings' && 'Settings'}
                    {currentPage === 'logs' && 'Activity Logs'}
                    {currentPage === 'order-entry' && 'Order Entry'}
                    {currentPage === 'rate-quote' && 'Rate Quote'}
                    {currentPage === 'address-book' && 'Address Book'}
                    {currentPage === 'track-trace' && 'Track & Trace'}
                    {currentPage === 'invoices' && 'Invoices'}
                    {currentPage === 'client-users' && 'User Management'}
                    {currentPage === 'imaging' && 'Imaging'}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    {currentPage === 'extract' && (user.role === 'vendor' ? 'Upload your PDF documents for automated processing' : 'Upload PDFs and extract structured data')}
                    {currentPage === 'vendor-setup' && 'Manage vendor accounts and configure orders display settings'}
                    {currentPage === 'client-setup' && 'Manage client companies and their users'}
                    {currentPage === 'transform' && 'Extract data from PDFs to intelligently rename files'}
                    {currentPage === 'execute' && 'Run configured actions with custom parameters'}
                    {currentPage === 'types' && 'Configure extraction types, transformation types, and workflows'}
                    {currentPage === 'settings' && 'Configure Parse-It settings and preferences'}
                    {currentPage === 'logs' && 'Monitor system activity and processing logs'}
                    {currentPage === 'order-entry' && 'Create and manage orders for your organization'}
                    {currentPage === 'rate-quote' && 'Request and manage pricing quotes'}
                    {currentPage === 'address-book' && 'Manage customer shipping and receiving addresses'}
                    {currentPage === 'track-trace' && 'Track and monitor your shipments in real-time'}
                    {currentPage === 'invoices' && 'View and manage your invoices'}
                    {currentPage === 'client-users' && 'Manage users in your organization'}
                    {currentPage === 'imaging' && 'Document imaging and scanning'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      </div>
    </>
  );
}