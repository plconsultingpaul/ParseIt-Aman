import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Users, Globe, GitBranch, Mail, Upload, FileText, Cog, Pencil, Trash2, HelpCircle, LogOut, Sparkles, Signpost, ScanBarcode, Phone, TextCursorInput, Info, Copy, Wand2, Repeat, MousePointerClick } from 'lucide-react';

interface GroupNodeData {
  label: string;
  groupId?: string;
  groupName?: string;
  fieldCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

interface WorkflowNodeData {
  label: string;
  stepType: string;
  config?: any;
  onEdit?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
}

export const GroupNode = memo(({ data, selected }: NodeProps<GroupNodeData>) => {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 min-w-[200px] shadow-md transition-all ${
        selected
          ? 'border-blue-500 shadow-blue-200 dark:shadow-blue-900/50'
          : 'border-blue-300 dark:border-blue-600'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Form Group
            </div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">{data.label}</div>
            {data.fieldCount !== undefined && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {data.fieldCount} {data.fieldCount === 1 ? 'field' : 'fields'}
              </div>
            )}
          </div>
        </div>
        {(data.onEdit || data.onDelete) && (
          <div className="flex items-center space-x-1 ml-3">
            {data.onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit?.();
                }}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {data.onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDelete?.();
                }}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
});

GroupNode.displayName = 'GroupNode';

const getWorkflowIcon = (stepType: string) => {
  switch (stepType) {
    case 'api_call':
    case 'api_endpoint':
      return <Globe className="h-4 w-4" />;
    case 'conditional_check':
    case 'branch':
      return <GitBranch className="h-4 w-4" />;
    case 'email_action':
      return <Mail className="h-4 w-4" />;
    case 'sftp_upload':
      return <Upload className="h-4 w-4" />;
    case 'rename_file':
      return <FileText className="h-4 w-4" />;
    case 'user_confirmation':
      return <HelpCircle className="h-4 w-4" />;
    case 'exit':
      return <LogOut className="h-4 w-4" />;
    case 'ai_lookup':
      return <Sparkles className="h-4 w-4" />;
    case 'route':
      return <Signpost className="h-4 w-4" />;
    case 'user_input':
      return <TextCursorInput className="h-4 w-4" />;
    case 'user_information':
      return <Info className="h-4 w-4" />;
    case 'data_transform':
      return <Wand2 className="h-4 w-4" />;
    case 'for_each':
      return <Repeat className="h-4 w-4" />;
    case 'user_selection':
      return <MousePointerClick className="h-4 w-4" />;
    default:
      return <Cog className="h-4 w-4" />;
  }
};

const getWorkflowLabel = (stepType: string) => {
  switch (stepType) {
    case 'api_call': return 'API Call';
    case 'api_endpoint': return 'API Endpoint';
    case 'conditional_check': return 'Decision';
    case 'branch': return 'Branch';
    case 'email_action': return 'Email';
    case 'sftp_upload': return 'SFTP Upload';
    case 'rename_file': return 'Rename File';
    case 'data_transform': return 'Transform';
    case 'user_confirmation': return 'User Confirmation';
    case 'exit': return 'Exit';
    case 'ai_lookup': return 'AI Lookup';
    case 'route': return 'Route';
    case 'user_input': return 'User Input';
    case 'user_information': return 'User Information';
    case 'for_each': return 'For Each Loop';
    case 'user_selection': return 'User Selection';
    default: return 'Workflow';
  }
};

const getWorkflowColor = (stepType: string) => {
  switch (stepType) {
    case 'api_call':
    case 'api_endpoint':
      return {
        bg: 'bg-green-100 dark:bg-green-900/50',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-300 dark:border-green-600',
        selectedBorder: 'border-green-500',
        shadow: 'shadow-green-200 dark:shadow-green-900/50',
        handle: '!bg-green-500'
      };
    case 'conditional_check':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/50',
        text: 'text-orange-600 dark:text-orange-400',
        border: 'border-orange-300 dark:border-orange-600',
        selectedBorder: 'border-orange-500',
        shadow: 'shadow-orange-200 dark:shadow-orange-900/50',
        handle: '!bg-orange-500'
      };
    case 'branch':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/50',
        text: 'text-yellow-600 dark:text-yellow-400',
        border: 'border-yellow-300 dark:border-yellow-600',
        selectedBorder: 'border-yellow-500',
        shadow: 'shadow-yellow-200 dark:shadow-yellow-900/50',
        handle: '!bg-yellow-500'
      };
    case 'email_action':
      return {
        bg: 'bg-purple-100 dark:bg-purple-900/50',
        text: 'text-purple-600 dark:text-purple-400',
        border: 'border-purple-300 dark:border-purple-600',
        selectedBorder: 'border-purple-500',
        shadow: 'shadow-purple-200 dark:shadow-purple-900/50',
        handle: '!bg-purple-500'
      };
    case 'user_confirmation':
      return {
        bg: 'bg-cyan-100 dark:bg-cyan-900/50',
        text: 'text-cyan-600 dark:text-cyan-400',
        border: 'border-cyan-300 dark:border-cyan-600',
        selectedBorder: 'border-cyan-500',
        shadow: 'shadow-cyan-200 dark:shadow-cyan-900/50',
        handle: '!bg-cyan-500'
      };
    case 'exit':
      return {
        bg: 'bg-rose-100 dark:bg-rose-900/50',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-300 dark:border-rose-600',
        selectedBorder: 'border-rose-500',
        shadow: 'shadow-rose-200 dark:shadow-rose-900/50',
        handle: '!bg-rose-500'
      };
    case 'ai_lookup':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/50',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-300 dark:border-amber-600',
        selectedBorder: 'border-amber-500',
        shadow: 'shadow-amber-200 dark:shadow-amber-900/50',
        handle: '!bg-amber-500'
      };
    case 'route':
      return {
        bg: 'bg-teal-100 dark:bg-teal-900/50',
        text: 'text-teal-600 dark:text-teal-400',
        border: 'border-teal-300 dark:border-teal-600',
        selectedBorder: 'border-teal-500',
        shadow: 'shadow-teal-200 dark:shadow-teal-900/50',
        handle: '!bg-teal-500'
      };
    case 'user_input':
      return {
        bg: 'bg-sky-100 dark:bg-sky-900/50',
        text: 'text-sky-600 dark:text-sky-400',
        border: 'border-sky-300 dark:border-sky-600',
        selectedBorder: 'border-sky-500',
        shadow: 'shadow-sky-200 dark:shadow-sky-900/50',
        handle: '!bg-sky-500'
      };
    case 'user_information':
      return {
        bg: 'bg-slate-100 dark:bg-slate-900/50',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-300 dark:border-slate-600',
        selectedBorder: 'border-slate-500',
        shadow: 'shadow-slate-200 dark:shadow-slate-900/50',
        handle: '!bg-slate-500'
      };
    case 'data_transform':
      return {
        bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/50',
        text: 'text-fuchsia-600 dark:text-fuchsia-400',
        border: 'border-fuchsia-300 dark:border-fuchsia-600',
        selectedBorder: 'border-fuchsia-500',
        shadow: 'shadow-fuchsia-200 dark:shadow-fuchsia-900/50',
        handle: '!bg-fuchsia-500'
      };
    case 'for_each':
      return {
        bg: 'bg-lime-100 dark:bg-lime-900/50',
        text: 'text-lime-600 dark:text-lime-400',
        border: 'border-lime-300 dark:border-lime-600',
        selectedBorder: 'border-lime-500',
        shadow: 'shadow-lime-200 dark:shadow-lime-900/50',
        handle: '!bg-lime-500'
      };
    case 'user_selection':
      return {
        bg: 'bg-pink-100 dark:bg-pink-900/50',
        text: 'text-pink-600 dark:text-pink-400',
        border: 'border-pink-300 dark:border-pink-600',
        selectedBorder: 'border-pink-500',
        shadow: 'shadow-pink-200 dark:shadow-pink-900/50',
        handle: '!bg-pink-500'
      };
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-600 dark:text-gray-400',
        border: 'border-gray-300 dark:border-gray-600',
        selectedBorder: 'border-gray-500',
        shadow: 'shadow-gray-200 dark:shadow-gray-900/50',
        handle: '!bg-gray-500'
      };
  }
};

const ROUTE_HANDLE_COLORS = [
  '!bg-blue-500',
  '!bg-green-500',
  '!bg-orange-500',
  '!bg-rose-500',
  '!bg-cyan-500',
  '!bg-amber-500',
  '!bg-emerald-500',
  '!bg-pink-500',
];

const ROUTE_LABEL_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-green-600 dark:text-green-400',
  'text-orange-600 dark:text-orange-400',
  'text-rose-600 dark:text-rose-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-amber-600 dark:text-amber-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-pink-600 dark:text-pink-400',
];

export const WorkflowNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const colors = getWorkflowColor(data.stepType);
  const isBranching = data.stepType === 'conditional_check' || data.stepType === 'branch';
  const isTerminal = data.stepType === 'exit';
  const isRoute = data.stepType === 'route';
  const isUserConfirmation = data.stepType === 'user_confirmation';
  const isForEach = data.stepType === 'for_each';
  const routes: Array<{ label: string }> = isRoute ? (data.config?.routes || []) : [];
  const confirmationOptions: Array<{ label: string }> = isUserConfirmation
    ? (data.config?.options || [{ label: data.config?.yesButtonLabel || 'Yes' }, { label: data.config?.noButtonLabel || 'No' }])
    : [];

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 min-w-[200px] shadow-md transition-all ${
        selected ? `${colors.selectedBorder} ${colors.shadow}` : colors.border
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id={isForEach ? 'default' : undefined}
        className={`!w-3 !h-3 ${colors.handle} !border-2 !border-white`}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-2 ${colors.bg} rounded-lg ${colors.text}`}>
            {getWorkflowIcon(data.stepType)}
          </div>
          <div>
            <div className={`text-xs font-medium ${colors.text} uppercase tracking-wide`}>
              {getWorkflowLabel(data.stepType)}
            </div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">{data.label}</div>
          </div>
        </div>
        {(data.onEdit || data.onCopy || data.onDelete) && (
          <div className="flex items-center space-x-1 ml-3">
            {data.onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onEdit?.();
                }}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {data.onCopy && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onCopy?.();
                }}
                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {data.onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDelete?.();
                }}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {isTerminal ? (
        <div className="text-xs mt-2 text-center text-rose-600 dark:text-rose-400 font-medium">
          End of Flow
        </div>
      ) : isForEach ? (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="loop_back"
            style={{ top: '50%' }}
            className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="loop"
            style={{ left: '30%' }}
            className="!w-3 !h-3 !bg-lime-500 !border-2 !border-white"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="done"
            style={{ left: '70%' }}
            className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
          />
          <div className="flex justify-between text-xs mt-2 text-gray-500 dark:text-gray-400">
            <span className="text-lime-600 dark:text-lime-400">Loop</span>
            <span className="text-blue-600 dark:text-blue-400">Done</span>
          </div>
        </>
      ) : isUserConfirmation && confirmationOptions.length > 0 ? (
        <>
          {confirmationOptions.map((option, idx) => {
            const pct = ((idx + 1) / (confirmationOptions.length + 1)) * 100;
            return (
              <Handle
                key={`option_${idx}`}
                type="source"
                position={Position.Bottom}
                id={`option_${idx}`}
                style={{ left: `${pct}%` }}
                className={`!w-3 !h-3 ${ROUTE_HANDLE_COLORS[idx % ROUTE_HANDLE_COLORS.length]} !border-2 !border-white`}
              />
            );
          })}
          <div className="flex justify-between text-xs mt-2 px-1 gap-1">
            {confirmationOptions.map((option, idx) => (
              <span key={idx} className={`${ROUTE_LABEL_COLORS[idx % ROUTE_LABEL_COLORS.length]} truncate text-center`} style={{ maxWidth: `${100 / confirmationOptions.length}%` }}>
                {option.label || `Option ${idx + 1}`}
              </span>
            ))}
          </div>
        </>
      ) : isRoute && routes.length > 0 ? (
        <>
          {routes.map((route, idx) => {
            const pct = ((idx + 1) / (routes.length + 1)) * 100;
            return (
              <Handle
                key={`route_${idx}`}
                type="source"
                position={Position.Bottom}
                id={`route_${idx}`}
                style={{ left: `${pct}%` }}
                className={`!w-3 !h-3 ${ROUTE_HANDLE_COLORS[idx % ROUTE_HANDLE_COLORS.length]} !border-2 !border-white`}
              />
            );
          })}
          <div className="flex justify-between text-xs mt-2 px-1 gap-1">
            {routes.map((route, idx) => (
              <span key={idx} className={`${ROUTE_LABEL_COLORS[idx % ROUTE_LABEL_COLORS.length]} truncate text-center`} style={{ maxWidth: `${100 / routes.length}%` }}>
                {route.label || `Route ${idx + 1}`}
              </span>
            ))}
          </div>
        </>
      ) : isRoute ? (
        <div className="text-xs mt-2 text-center text-gray-500 dark:text-gray-400 italic">
          No routes configured
        </div>
      ) : isBranching ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="success"
            style={{ left: '30%' }}
            className={`!w-3 !h-3 !bg-green-500 !border-2 !border-white`}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="failure"
            style={{ left: '70%' }}
            className={`!w-3 !h-3 !bg-red-500 !border-2 !border-white`}
          />
          <div className="flex justify-between text-xs mt-2 text-gray-500 dark:text-gray-400">
            <span className="text-green-600">Yes</span>
            <span className="text-red-600">No</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className={`!w-3 !h-3 ${colors.handle} !border-2 !border-white`}
        />
      )}
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';

export const nodeTypes = {
  group: GroupNode,
  workflow: WorkflowNode,
};
