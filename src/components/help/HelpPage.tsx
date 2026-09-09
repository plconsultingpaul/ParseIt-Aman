import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Search, ChevronRight, X } from 'lucide-react';
import GettingStartedSection from './sections/GettingStartedSection';
import UploadModesSection from './sections/UploadModesSection';
import ExtractionProcessSection from './sections/ExtractionProcessSection';
import SettingsOverviewSection from './sections/SettingsOverviewSection';
import EmailMonitoringSection from './sections/EmailMonitoringSection';
import ExtractionTypesSection from './sections/ExtractionTypesSection';
import TransformationTypesSection from './sections/TransformationTypesSection';
import FieldMappingsSection from './sections/FieldMappingsSection';
import WorkflowsSection from './sections/WorkflowsSection';
import UserManagementSection from './sections/UserManagementSection';
import AdvancedPdfProcessingSection from './sections/AdvancedPdfProcessingSection';
import ConditionalUploadSection from './sections/ConditionalUploadSection';
import CompleteExampleSection from './sections/CompleteExampleSection';
import ConfigurationGuideSection from './sections/ConfigurationGuideSection';
import AdvancedUseCasesSection from './sections/AdvancedUseCasesSection';
import TroubleshootingSection from './sections/TroubleshootingSection';
import BestPracticesSection from './sections/BestPracticesSection';
import ToolsSection from './sections/ToolsSection';
import ApiConfigurationSection from './sections/ApiConfigurationSection';
import SupportSection from './sections/SupportSection';
import EmailActionsSection from './sections/EmailActionsSection';
import WorkOptimaIntegrationSection from './sections/WorkOptimaIntegrationSection';

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started', category: 'Basics' },
  { id: 'upload-modes', label: 'Upload Modes', category: 'Basics' },
  { id: 'extraction-process', label: 'Extraction Process', category: 'Basics' },
  { id: 'settings-overview', label: 'Settings Overview', category: 'Configuration' },
  { id: 'email-monitoring', label: 'Email Monitoring', category: 'Configuration' },
  { id: 'extraction-types', label: 'Extraction Types', category: 'Configuration' },
  { id: 'transformation-types', label: 'Transformation Types', category: 'Configuration' },
  { id: 'field-mappings', label: 'Field Mappings', category: 'Configuration' },
  { id: 'workflows', label: 'Workflows', category: 'Configuration' },
  { id: 'user-management', label: 'User Management', category: 'Configuration' },
  { id: 'advanced-pdf', label: 'Advanced PDF Processing', category: 'Advanced' },
  { id: 'conditional-upload', label: 'Conditional Upload', category: 'Advanced' },
  { id: 'complete-example', label: 'Complete Example', category: 'Advanced' },
  { id: 'configuration-guide', label: 'Configuration Guide', category: 'Advanced' },
  { id: 'advanced-use-cases', label: 'Advanced Use Cases', category: 'Advanced' },
  { id: 'email-actions', label: 'Email Actions', category: 'Advanced' },
  { id: 'workoptima', label: 'WorkOptima Integration', category: 'Integrations' },
  { id: 'api-configuration', label: 'API Keys & Config', category: 'Reference' },
  { id: 'tools', label: 'Tools', category: 'Reference' },
  { id: 'best-practices', label: 'Best Practices', category: 'Reference' },
  { id: 'troubleshooting', label: 'Troubleshooting', category: 'Reference' },
  { id: 'support', label: 'Support', category: 'Reference' },
];

const CATEGORIES = ['Basics', 'Configuration', 'Advanced', 'Integrations', 'Reference'];

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isScrollingTo = useRef(false);

  const filteredSections = searchQuery.trim()
    ? SECTIONS.filter(s => s.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : SECTIONS;

  const handleNavClick = useCallback((sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el) {
      isScrollingTo.current = true;
      setActiveSection(sectionId);
      setSidebarOpen(false);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { isScrollingTo.current = false; }, 800);
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingTo.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const setRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
      </button>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-72 bg-white border-r border-gray-200 flex flex-col shrink-0
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2 mb-3">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Help Center</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {searchQuery.trim() ? (
            <div className="space-y-0.5">
              {filteredSections.length === 0 && (
                <p className="text-sm text-gray-500 px-3 py-4 text-center">No matching topics found</p>
              )}
              {filteredSections.map(section => (
                <NavItem
                  key={section.id}
                  section={section}
                  isActive={activeSection === section.id}
                  onClick={handleNavClick}
                />
              ))}
            </div>
          ) : (
            CATEGORIES.map(category => {
              const items = SECTIONS.filter(s => s.category === category);
              return (
                <div key={category} className="mb-3">
                  <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">
                    {category}
                  </h3>
                  <div className="space-y-0.5">
                    {items.map(section => (
                      <NavItem
                        key={section.id}
                        section={section}
                        isActive={activeSection === section.id}
                        onClick={handleNavClick}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Hero */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Parse-It Help Center</h1>
            <p className="text-blue-100 text-lg">
              Complete guide to using Parse-It for PDF data extraction
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          <div id="getting-started" ref={setRef('getting-started')}><GettingStartedSection /></div>
          <div id="upload-modes" ref={setRef('upload-modes')}><UploadModesSection /></div>
          <div id="extraction-process" ref={setRef('extraction-process')}><ExtractionProcessSection /></div>
          <div id="settings-overview" ref={setRef('settings-overview')}><SettingsOverviewSection /></div>
          <div id="email-monitoring" ref={setRef('email-monitoring')}><EmailMonitoringSection /></div>
          <div id="extraction-types" ref={setRef('extraction-types')}><ExtractionTypesSection /></div>
          <div id="transformation-types" ref={setRef('transformation-types')}><TransformationTypesSection /></div>
          <div id="field-mappings" ref={setRef('field-mappings')}><FieldMappingsSection /></div>
          <div id="workflows" ref={setRef('workflows')}><WorkflowsSection /></div>
          <div id="user-management" ref={setRef('user-management')}><UserManagementSection /></div>
          <div id="advanced-pdf" ref={setRef('advanced-pdf')}><AdvancedPdfProcessingSection /></div>
          <div id="conditional-upload" ref={setRef('conditional-upload')}><ConditionalUploadSection /></div>
          <div id="complete-example" ref={setRef('complete-example')}><CompleteExampleSection /></div>
          <div id="configuration-guide" ref={setRef('configuration-guide')}><ConfigurationGuideSection /></div>
          <div id="advanced-use-cases" ref={setRef('advanced-use-cases')}><AdvancedUseCasesSection /></div>
          <div id="email-actions" ref={setRef('email-actions')}><EmailActionsSection /></div>
          <div id="workoptima" ref={setRef('workoptima')}><WorkOptimaIntegrationSection /></div>
          <div id="api-configuration" ref={setRef('api-configuration')}><ApiConfigurationSection /></div>
          <div id="tools" ref={setRef('tools')}><ToolsSection /></div>
          <div id="best-practices" ref={setRef('best-practices')}><BestPracticesSection /></div>
          <div id="troubleshooting" ref={setRef('troubleshooting')}><TroubleshootingSection /></div>
          <div id="support" ref={setRef('support')}><SupportSection /></div>
        </div>
      </main>
    </div>
  );
}

function NavItem({
  section,
  isActive,
  onClick,
}: {
  section: { id: string; label: string };
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(section.id)}
      className={`
        w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-all duration-150
        ${isActive
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
      `}
    >
      <span className="truncate">{section.label}</span>
      {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
    </button>
  );
}
