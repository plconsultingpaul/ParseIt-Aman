import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface InfoCardProps {
  title: string;
  children: ReactNode;
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon?: LucideIcon;
}

export default function InfoCard({ title, children, bgColor, borderColor, textColor, icon: Icon }: InfoCardProps) {
  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-6`}>
      <h3 className={`font-semibold ${textColor} mb-3 flex items-center space-x-2`}>
        {Icon && <Icon className="h-5 w-5" />}
        <span>{title}</span>
      </h3>
      <div className={textColor}>
        {children}
      </div>
    </div>
  );
}
