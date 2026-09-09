import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  iconBgColor: string;
  iconColor: string;
}

export default function SectionHeader({ icon: Icon, title, iconBgColor, iconColor }: SectionHeaderProps) {
  return (
    <div className="flex items-center space-x-3 mb-6">
      <div className={`${iconBgColor} p-3 rounded-lg`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    </div>
  );
}
