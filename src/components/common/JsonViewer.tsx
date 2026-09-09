import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  name?: string;
  defaultExpanded?: boolean;
}

export default function JsonViewer({ data, name = 'root', defaultExpanded = true }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-600 dark:text-gray-400 text-xs uppercase font-semibold">
          {name}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <JsonNode data={data} level={0} defaultExpanded={defaultExpanded} />
    </div>
  );
}

interface JsonNodeProps {
  data: any;
  level: number;
  defaultExpanded?: boolean;
  propertyName?: string;
}

function JsonNode({ data, level, defaultExpanded = true, propertyName }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || level < 2);

  if (data === null) {
    return <span className="text-gray-500 dark:text-gray-400">null</span>;
  }

  if (data === undefined) {
    return <span className="text-gray-500 dark:text-gray-400">undefined</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-600 dark:text-purple-400">{data.toString()}</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-blue-600 dark:text-blue-400">{data}</span>;
  }

  if (typeof data === 'string') {
    return <span className="text-green-600 dark:text-green-400">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">[]</span>;
    }

    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="ml-1">[{data.length}]</span>
        </button>
        {isExpanded && (
          <div className="ml-4 border-l border-gray-300 dark:border-gray-600 pl-4 mt-1">
            {data.map((item, index) => (
              <div key={index} className="my-1">
                <span className="text-gray-500 dark:text-gray-400">{index}: </span>
                <JsonNode data={item} level={level + 1} defaultExpanded={false} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">{'{}'}</span>;
    }

    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="ml-1">{'{'}{keys.length}{'}'}</span>
        </button>
        {isExpanded && (
          <div className="ml-4 border-l border-gray-300 dark:border-gray-600 pl-4 mt-1">
            {keys.map((key) => (
              <div key={key} className="my-1">
                <span className="text-orange-600 dark:text-orange-400">"{key}"</span>
                <span className="text-gray-600 dark:text-gray-400">: </span>
                <JsonNode data={data[key]} level={level + 1} defaultExpanded={false} propertyName={key} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span className="text-gray-600 dark:text-gray-400">{String(data)}</span>;
}
