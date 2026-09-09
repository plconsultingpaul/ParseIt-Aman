import React, { useState } from 'react';
import {
  HelpCircle,
  FileText,
  MapPin,
  DollarSign,
  Receipt,
  BookUser,
  Users,
  ChevronDown,
  ChevronRight,
  Search,
  Mail,
  Phone,
  ExternalLink
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

export default function ClientHelpPage() {
  const [expandedSections, setExpandedSections] = useState<string[]>(['getting-started']);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const helpSections: HelpSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: HelpCircle,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Welcome to the Client Portal! This guide will help you navigate and use the available features.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Quick Overview</h4>
            <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400 text-sm">
              <li>Use the sidebar to navigate between different sections</li>
              <li>Your available features depend on your account permissions</li>
              <li>Contact your administrator if you need access to additional features</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'track-trace',
      title: 'Track & Trace',
      icon: MapPin,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            The Track & Trace feature allows you to monitor your shipments in real-time.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">How to Track a Shipment</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Navigate to the Track & Trace page from the sidebar</li>
                <li>Enter your tracking number or reference number</li>
                <li>View real-time status updates and location information</li>
                <li>Access delivery confirmation and proof of delivery when available</li>
              </ol>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Tracking Information Includes</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Current shipment status and location</li>
                <li>Estimated delivery date and time</li>
                <li>Complete shipment history and milestones</li>
                <li>Delivery confirmation details</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'order-entry',
      title: 'Order Entry',
      icon: FileText,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Create and manage shipping orders through the Order Entry system.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Creating a New Order</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Click on Order Entry in the sidebar</li>
                <li>Fill in the shipper and consignee information</li>
                <li>Add shipment details including weight and dimensions</li>
                <li>Select any special services required</li>
                <li>Review and submit your order</li>
              </ol>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">Tips for Faster Entry</h4>
              <ul className="list-disc list-inside space-y-1 text-green-700 dark:text-green-400 text-sm">
                <li>Use your Address Book to quickly populate shipper and consignee fields</li>
                <li>Upload PDF documents for automatic data extraction</li>
                <li>Save frequently used addresses for future orders</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'rate-quotes',
      title: 'Rate Quotes',
      icon: DollarSign,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Request and compare shipping rates before placing an order.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Getting a Quote</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Navigate to Rate Quotes from the sidebar</li>
                <li>Enter origin and destination information</li>
                <li>Specify shipment weight, dimensions, and class</li>
                <li>Select desired service level</li>
                <li>View available rates and transit times</li>
              </ol>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
              <h4 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Quote Information</h4>
              <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-400 text-sm">
                <li>Quotes are estimates and may vary based on actual shipment details</li>
                <li>Accessorial charges may apply for special services</li>
                <li>Contact your account representative for volume discounts</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'invoices',
      title: 'Invoices',
      icon: Receipt,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            View and manage your invoices and payment history.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Invoice Features</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>View all invoices and their payment status</li>
                <li>Download invoices in PDF format</li>
                <li>Filter invoices by date range or status</li>
                <li>View detailed line items for each invoice</li>
              </ul>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Payment Information</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Review payment terms and due dates</li>
                <li>Access payment history and receipts</li>
                <li>Contact billing support for invoice questions</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'address-book',
      title: 'Address Book',
      icon: BookUser,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Manage your saved addresses for quick and easy order entry.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Managing Addresses</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Add new shipper and consignee addresses</li>
                <li>Edit existing address information</li>
                <li>Mark addresses as active or inactive</li>
                <li>Search addresses by name, city, or other criteria</li>
              </ul>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Address Details</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Store contact information with each address</li>
                <li>Specify appointment requirements</li>
                <li>Designate addresses as shipper, consignee, or both</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'user-management',
      title: 'User Management (Admins)',
      icon: Users,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Client administrators can manage users within their organization.
          </p>
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Admin Capabilities</h4>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 text-sm">
                <li>Create new user accounts for your organization</li>
                <li>Enable or disable user access</li>
                <li>Assign feature permissions to users</li>
                <li>Reset user passwords</li>
              </ul>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Available Permissions</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400 text-sm">
                <li>Track & Trace Access</li>
                <li>Order Entry Access</li>
                <li>Rate Quote Access</li>
                <li>Invoice Access</li>
                <li>Address Book Access</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'support',
      title: 'Contact Support',
      icon: Mail,
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Need additional help? Contact our support team.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">Email Support</h4>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Send us an email for non-urgent inquiries.
              </p>
              <p className="text-blue-600 dark:text-blue-400 text-sm mt-2">
                support@example.com
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">Phone Support</h4>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Call us for immediate assistance.
              </p>
              <p className="text-blue-600 dark:text-blue-400 text-sm mt-2">
                1-800-XXX-XXXX
              </p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const filteredSections = helpSections.filter(section =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search help topics..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-4">
        {filteredSections.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSections.includes(section.id);

          return (
            <div
              key={section.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {section.title}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4">
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredSections.length === 0 && (
        <div className="text-center py-12">
          <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No help topics found matching "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  );
}
