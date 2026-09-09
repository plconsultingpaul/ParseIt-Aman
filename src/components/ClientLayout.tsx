import React, { useState, useEffect, useRef } from 'react';
import { FileText, LogOut, User, HelpCircle, Menu, X, DollarSign, Users as UsersIcon, BookUser, MapPin, Receipt, Building2, KeyRound, ChevronsLeft, ChevronsRight, Video, Moon, Sun, Settings, ClipboardList } from 'lucide-react';
import type { User as UserType } from '../types';
import type { CompanyBranding } from '../types';
import ChangePasswordModal from './common/ChangePasswordModal';
import { useDarkMode } from '../hooks/useDarkMode';

interface ClientLayoutProps {
  children: React.ReactNode;
  currentPage: 'order-entry' | 'rate-quote' | 'address-book' | 'track-trace' | 'invoices' | 'users' | 'submissions' | 'help';
  onNavigate: (page: 'order-entry' | 'rate-quote' | 'address-book' | 'track-trace' | 'invoices' | 'users' | 'submissions' | 'help') => void;
  user: UserType;
  companyBranding?: CompanyBranding;
  onLogout: () => void;
  onChangePassword?: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

export default function ClientLayout({ children, currentPage, onNavigate, user, companyBranding, onLogout, onChangePassword }: ClientLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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

  const navigationItems = React.useMemo(() => {
    const items: Array<{
      id: 'order-entry' | 'rate-quote' | 'address-book' | 'track-trace' | 'invoices' | 'users' | 'submissions' | 'help';
      label: string;
      icon: React.ElementType;
      visible: boolean;
    }> = [
      {
        id: 'track-trace',
        label: 'Track & Trace',
        icon: MapPin,
        visible: user.hasTrackTraceAccess === true
      },
      {
        id: 'invoices',
        label: 'Invoices',
        icon: Receipt,
        visible: user.hasInvoiceAccess === true
      },
      {
        id: 'order-entry',
        label: 'BOL Entry',
        icon: FileText,
        visible: user.hasOrderEntryAccess === true
      },
      {
        id: 'submissions',
        label: 'Submissions',
        icon: ClipboardList,
        visible: user.hasSubmissionsAccess === true
      },
      {
        id: 'rate-quote',
        label: 'Rate Quotes',
        icon: DollarSign,
        visible: user.hasRateQuoteAccess === true
      },
      {
        id: 'address-book',
        label: 'Address Book',
        icon: BookUser,
        visible: user.hasAddressBookAccess === true || user.isClientAdmin === true
      },
      {
        id: 'users',
        label: 'Users',
        icon: UsersIcon,
        visible: user.isClientAdmin === true
      }
    ];

    return items.filter(item => item.visible);
  }, [user]);

  const getPageTitle = () => {
    switch (currentPage) {
      case 'order-entry': return 'BOL Entry';
      case 'rate-quote': return 'Rate Quotes';
      case 'address-book': return 'Address Book';
      case 'track-trace': return 'Track & Trace';
      case 'invoices': return 'Invoices';
      case 'submissions': return 'Submissions';
      case 'users': return 'User Management';
      case 'help': return 'Help';
      default: return '';
    }
  };

  const getPageDescription = () => {
    switch (currentPage) {
      case 'order-entry': return 'Create and manage BOLs for your organization';
      case 'rate-quote': return 'Request and manage pricing quotes';
      case 'address-book': return 'Manage customer shipping and receiving addresses';
      case 'track-trace': return 'Track and monitor your shipments in real-time';
      case 'invoices': return 'View and manage your invoices';
      case 'submissions': return 'View and track your order submissions';
      case 'users': return 'Manage users in your organization';
      case 'help': return 'Get help and support for the client portal';
      default: return '';
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex overflow-hidden transition-colors duration-300">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-white/90 backdrop-blur-sm border-r border-orange-100 dark:bg-gray-800/90 dark:border-gray-700 transition-all duration-200 lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } ${isSidebarExpanded ? 'w-64' : 'w-[68px]'}`}>
        <div className={`flex border-b border-orange-100 dark:border-gray-700 flex-shrink-0 ${isSidebarExpanded ? 'px-4' : 'justify-center px-2'} h-16 items-center gap-3`}>
              {companyBranding?.companyName ? (
                isSidebarExpanded ? (
                  <div className="flex flex-col items-start min-w-0">
                    <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-full">
                      {companyBranding.companyName}
                    </h1>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Client Portal</p>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-2 rounded-lg flex-shrink-0">
                    <span className="text-white font-bold text-sm">{companyBranding.companyName.charAt(0)}</span>
                  </div>
                )
              ) : (
                <>
                  <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-2 rounded-lg flex-shrink-0">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  {isSidebarExpanded && (
                    <div className="min-w-0">
                      <h1 className="text-xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent truncate">
                        Client Portal
                      </h1>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        Secure Access
                      </p>
                    </div>
                  )}
                </>
              )}
        </div>

        <nav className={`flex-1 overflow-y-auto min-h-0 py-3 ${isSidebarExpanded ? 'px-3' : 'px-2'}`}>
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                    isSidebarExpanded ? 'gap-3 px-3' : 'justify-center px-2'
                  } ${
                    isActive
                      ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-gray-700'
                  }`}
                  title={!isSidebarExpanded ? item.label : undefined}
                >
                  <Icon className={`h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
                  }`} />
                  {isSidebarExpanded && item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className={`border-t border-orange-100 dark:border-gray-700 flex-shrink-0 py-3 ${isSidebarExpanded ? 'px-4' : 'px-2'}`}>
          <div className={`flex items-center ${isSidebarExpanded ? 'justify-start gap-1' : 'flex-col gap-1'}`}>
            {/* User Avatar with Popover */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 dark:from-gray-500 dark:to-gray-600 text-white text-xs font-bold hover:ring-2 hover:ring-orange-400 transition-all"
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

            {/* Videos Icon */}
            {companyBranding?.trainingVideoLink && (
              <button
                onClick={() => window.open(companyBranding.trainingVideoLink, '_blank')}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors"
                title="Videos"
              >
                <Video className="h-5 w-5" />
              </button>
            )}

            {/* Help Icon */}
            <button
              onClick={() => window.open('/help', '_blank')}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors"
              title="Help"
            >
              <HelpCircle className="h-5 w-5" />
            </button>

            {/* Dark/Light Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden border-t border-orange-100 dark:border-gray-700 p-3 text-gray-400 dark:text-gray-500 transition-colors hover:bg-orange-50 dark:hover:bg-gray-700 hover:text-orange-600 dark:hover:text-gray-300 lg:flex lg:items-center lg:justify-center flex-shrink-0"
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed
            ? <ChevronsRight className="h-4 w-4" />
            : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-blue-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 text-gray-600 dark:text-gray-400 hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        <header className="hidden lg:block bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-b border-blue-100 dark:border-gray-700 p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {getPageTitle()}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {getPageDescription()}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
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
