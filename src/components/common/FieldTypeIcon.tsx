import React from 'react';
import { Type, Hash, Calendar, Clock, Phone, ChevronDown, Upload, CheckSquare, List, MapPin, Mail, Search, Video as LucideIcon } from 'lucide-react';

interface FieldTypeIconProps {
  fieldType: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6'
};

const iconColorClasses = {
  text: 'text-blue-500 dark:text-blue-400',
  email: 'text-sky-500 dark:text-sky-400',
  number: 'text-green-500 dark:text-green-400',
  date: 'text-purple-500 dark:text-purple-400',
  datetime: 'text-amber-500 dark:text-amber-400',
  phone: 'text-purple-500 dark:text-purple-400',
  zip: 'text-cyan-500 dark:text-cyan-400',
  postal_code: 'text-teal-500 dark:text-teal-400',
  zip_postal: 'text-emerald-500 dark:text-emerald-400',
  province: 'text-blue-600 dark:text-blue-500',
  state: 'text-green-600 dark:text-green-500',
  dropdown: 'text-orange-500 dark:text-orange-400',
  file: 'text-pink-500 dark:text-pink-400',
  boolean: 'text-indigo-500 dark:text-indigo-400',
  array: 'text-red-500 dark:text-red-400'
};

export default function FieldTypeIcon({ fieldType, className = '', size = 'md' }: FieldTypeIconProps) {
  const getIcon = (): { Icon: LucideIcon; colorClass: string; label: string } => {
    switch (fieldType.toLowerCase()) {
      case 'text':
        return { Icon: Type, colorClass: iconColorClasses.text, label: 'Text Field' };
      case 'email':
        return { Icon: Mail, colorClass: iconColorClasses.email, label: 'Email Field' };
      case 'number':
        return { Icon: Hash, colorClass: iconColorClasses.number, label: 'Number Field' };
      case 'date':
        return { Icon: Calendar, colorClass: iconColorClasses.date, label: 'Date Field' };
      case 'datetime':
        return { Icon: Clock, colorClass: iconColorClasses.datetime, label: 'Date & Time Field' };
      case 'phone':
        return { Icon: Phone, colorClass: iconColorClasses.phone, label: 'Phone Field' };
      case 'zip':
        return { Icon: MapPin, colorClass: iconColorClasses.zip, label: 'Zip Code Field' };
      case 'postal_code':
        return { Icon: MapPin, colorClass: iconColorClasses.postal_code, label: 'Postal Code Field' };
      case 'zip_postal':
        return { Icon: MapPin, colorClass: iconColorClasses.zip_postal, label: 'Zip/Postal Code Field' };
      case 'province':
        return { Icon: MapPin, colorClass: iconColorClasses.province, label: 'Province Field' };
      case 'state':
        return { Icon: MapPin, colorClass: iconColorClasses.state, label: 'State Field' };
      case 'dropdown':
        return { Icon: ChevronDown, colorClass: iconColorClasses.dropdown, label: 'Dropdown Field' };
      case 'api_lookup':
        return { Icon: Search, colorClass: iconColorClasses.dropdown, label: 'API Lookup Field' };
      case 'file':
        return { Icon: Upload, colorClass: iconColorClasses.file, label: 'File Upload Field' };
      case 'boolean':
        return { Icon: CheckSquare, colorClass: iconColorClasses.boolean, label: 'Boolean Field' };
      case 'array':
        return { Icon: List, colorClass: iconColorClasses.array, label: 'Array Field' };
      default:
        return { Icon: Type, colorClass: 'text-gray-500 dark:text-gray-400', label: 'Unknown Field' };
    }
  };

  const { Icon, colorClass, label } = getIcon();
  const sizeClass = sizeClasses[size];

  return (
    <Icon
      className={`${sizeClass} ${colorClass} ${className}`}
      title={label}
      aria-label={label}
    />
  );
}

export function FieldTypeBadge({ fieldType }: { fieldType: string }) {
  const getLabel = () => {
    switch (fieldType.toLowerCase()) {
      case 'text':
        return 'Text';
      case 'email':
        return 'Email';
      case 'number':
        return 'Number';
      case 'date':
        return 'Date';
      case 'datetime':
        return 'Date & Time';
      case 'phone':
        return 'Phone';
      case 'zip':
        return 'Zip Code';
      case 'postal_code':
        return 'Postal Code';
      case 'zip_postal':
        return 'Zip/Postal';
      case 'province':
        return 'Province';
      case 'state':
        return 'State';
      case 'dropdown':
        return 'Dropdown';
      case 'api_lookup':
        return 'API Lookup';
      case 'file':
        return 'File';
      case 'boolean':
        return 'Boolean';
      case 'array':
        return 'Array';
      default:
        return fieldType;
    }
  };

  const getBadgeClasses = () => {
    switch (fieldType.toLowerCase()) {
      case 'text':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'email':
        return 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300';
      case 'number':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'date':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'datetime':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'phone':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'zip':
        return 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300';
      case 'postal_code':
        return 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300';
      case 'zip_postal':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
      case 'province':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'state':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'dropdown':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      case 'api_lookup':
        return 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300';
      case 'file':
        return 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300';
      case 'boolean':
        return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300';
      case 'array':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBadgeClasses()}`}>
      <FieldTypeIcon fieldType={fieldType} size="sm" className="mr-1" />
      {getLabel()}
    </span>
  );
}
