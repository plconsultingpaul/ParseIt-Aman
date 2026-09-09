import React from 'react';
import { LucideIcon, PackageX, Search, FileQuestion, Inbox, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const DefaultIcon = Icon || Inbox;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
        <DefaultIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md mb-6">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white rounded-lg transition-colors font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function NoFieldsEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={PackageX}
      title="No fields created yet"
      description="Get started by creating your first form field. Fields define the data you want to collect from users."
      action={{
        label: "Create First Field",
        onClick: onCreate
      }}
    />
  );
}

export function NoSubmissionsEmptyState() {
  return (
    <EmptyState
      icon={Inbox}
      title="No submissions yet"
      description="When users submit orders through the form, they will appear here. You can view details, track status, and manage all submissions from this page."
    />
  );
}

export function NoSearchResultsEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description="We couldn't find any submissions matching your search criteria. Try adjusting your filters or search terms."
      action={{
        label: "Clear Filters",
        onClick: onClear
      }}
    />
  );
}

export function NoPdfEmptyState() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="No PDF uploaded"
      description="Upload a PDF document to extract data automatically using AI. The extracted information will populate the form fields."
    />
  );
}

export function NoWorkflowEmptyState() {
  return (
    <EmptyState
      icon={AlertCircle}
      title="No workflow configured"
      description="A workflow can be configured to automate actions after form submission, such as sending notifications or updating external systems."
    />
  );
}
