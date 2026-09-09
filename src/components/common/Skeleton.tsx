import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  circle?: boolean;
}

export function Skeleton({ className = '', width, height, circle = false }: SkeletonProps) {
  const circleClass = circle ? 'rounded-full' : 'rounded';
  const style = {
    width: width || '100%',
    height: height || '1rem'
  };

  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 ${circleClass} ${className}`}
      style={style}
    />
  );
}

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} height="2rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} height="1.5rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={`field-${i}`} className="space-y-2">
          <Skeleton width="30%" height="1rem" />
          <Skeleton height="2.5rem" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton width="40%" height="1.5rem" />
        <Skeleton width="20%" height="1.5rem" />
      </div>
      <div className="space-y-3">
        <Skeleton height="1rem" />
        <Skeleton width="80%" height="1rem" />
        <Skeleton width="60%" height="1rem" />
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={`stat-${i}`} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton width="60%" height="0.875rem" />
              <Skeleton width="40%" height="2rem" />
            </div>
            <Skeleton circle width="3rem" height="3rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function JsonSkeleton({ depth = 3 }: { depth?: number }) {
  const renderLevel = (level: number) => {
    if (level === 0) return null;

    return (
      <div className="ml-4 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
        {Array.from({ length: Math.max(1, 4 - level) }).map((_, i) => (
          <div key={`level-${level}-${i}`}>
            <Skeleton width={`${60 + Math.random() * 20}%`} height="1rem" />
            {Math.random() > 0.5 && renderLevel(level - 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
      <div className="space-y-2">
        <Skeleton width="30%" height="0.75rem" />
        {renderLevel(depth)}
      </div>
    </div>
  );
}
