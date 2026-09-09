import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play, Globe, GitBranch, Mail, Upload, FileText, RefreshCw, Cog, Pencil as Edit2, Trash2, Send, BrainCircuit, Camera, BookOpen, Copy, ScanBarcode, MessageSquareText, Inbox, File as FileEdit } from 'lucide-react';

interface StartNodeData {
  label: string;
}

interface WorkflowStepNodeData {
  label: string;
  stepType: string;
  configJson?: any;
  onEdit?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
}

const getStepIcon = (stepType: string) => {
  switch (stepType) {
    case 'api_call':
    case 'api_endpoint':
      return <Globe className="h-4 w-4" />;
    case 'conditional_check':
      return <GitBranch className="h-4 w-4" />;
    case 'data_transform':
      return <RefreshCw className="h-4 w-4" />;
    case 'sftp_upload':
      return <Upload className="h-4 w-4" />;
    case 'email_action':
      return <Mail className="h-4 w-4" />;
    case 'rename_file':
      return <FileText className="h-4 w-4" />;
    case 'multipart_form_upload':
      return <Send className="h-4 w-4" />;
    case 'ai_decision':
      return <BrainCircuit className="h-4 w-4" />;
    case 'imaging':
      return <Camera className="h-4 w-4" />;
    case 'read_email':
      return <BookOpen className="h-4 w-4" />;
    case 'read_barcode':
      return <ScanBarcode className="h-4 w-4" />;
    case 'user_message':
      return <MessageSquareText className="h-4 w-4" />;
    case 'inbox':
      return <Inbox className="h-4 w-4" />;
    case 'update_imaging_document':
      return <FileEdit className="h-4 w-4" />;
    default:
      return <Cog className="h-4 w-4" />;
  }
};

const getStepLabel = (stepType: string) => {
  switch (stepType) {
    case 'api_call': return 'API Call';
    case 'api_endpoint': return 'API Endpoint';
    case 'conditional_check': return 'Condition';
    case 'data_transform': return 'Transform';
    case 'sftp_upload': return 'SFTP Upload';
    case 'email_action': return 'Email';
    case 'rename_file': return 'Rename File';
    case 'multipart_form_upload': return 'Multipart Upload';
    case 'ai_decision': return 'AI Decision';
    case 'imaging': return 'Imaging';
    case 'read_email': return 'Read Email';
    case 'read_barcode': return 'Read Barcode';
    case 'user_message': return 'User Message';
    case 'inbox': return 'Inbox Review';
    case 'update_imaging_document': return 'Update Imaging Document';
    default: return 'Step';
  }
};

const getStepColor = (stepType: string) => {
  switch (stepType) {
    case 'api_call':
    case 'api_endpoint':
      return {
        bg: 'bg-green-100 dark:bg-green-900/50',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-300 dark:border-green-600',
        selectedBorder: 'border-green-500',
        shadow: 'shadow-green-200 dark:shadow-green-900/50',
        handle: '!bg-green-500',
      };
    case 'conditional_check':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/50',
        text: 'text-orange-600 dark:text-orange-400',
        border: 'border-orange-300 dark:border-orange-600',
        selectedBorder: 'border-orange-500',
        shadow: 'shadow-orange-200 dark:shadow-orange-900/50',
        handle: '!bg-orange-500',
      };
    case 'data_transform':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/50',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-300 dark:border-blue-600',
        selectedBorder: 'border-blue-500',
        shadow: 'shadow-blue-200 dark:shadow-blue-900/50',
        handle: '!bg-blue-500',
      };
    case 'sftp_upload':
      return {
        bg: 'bg-teal-100 dark:bg-teal-900/50',
        text: 'text-teal-600 dark:text-teal-400',
        border: 'border-teal-300 dark:border-teal-600',
        selectedBorder: 'border-teal-500',
        shadow: 'shadow-teal-200 dark:shadow-teal-900/50',
        handle: '!bg-teal-500',
      };
    case 'email_action':
      return {
        bg: 'bg-rose-100 dark:bg-rose-900/50',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-300 dark:border-rose-600',
        selectedBorder: 'border-rose-500',
        shadow: 'shadow-rose-200 dark:shadow-rose-900/50',
        handle: '!bg-rose-500',
      };
    case 'rename_file':
      return {
        bg: 'bg-slate-100 dark:bg-slate-700/50',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-300 dark:border-slate-600',
        selectedBorder: 'border-slate-500',
        shadow: 'shadow-slate-200 dark:shadow-slate-900/50',
        handle: '!bg-slate-500',
      };
    case 'multipart_form_upload':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/50',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-300 dark:border-amber-600',
        selectedBorder: 'border-amber-500',
        shadow: 'shadow-amber-200 dark:shadow-amber-900/50',
        handle: '!bg-amber-500',
      };
    case 'ai_decision':
      return {
        bg: 'bg-cyan-100 dark:bg-cyan-900/50',
        text: 'text-cyan-600 dark:text-cyan-400',
        border: 'border-cyan-300 dark:border-cyan-600',
        selectedBorder: 'border-cyan-500',
        shadow: 'shadow-cyan-200 dark:shadow-cyan-900/50',
        handle: '!bg-cyan-500',
      };
    case 'imaging':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/50',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-300 dark:border-amber-600',
        selectedBorder: 'border-amber-500',
        shadow: 'shadow-amber-200 dark:shadow-amber-900/50',
        handle: '!bg-amber-500',
      };
    case 'read_email':
      return {
        bg: 'bg-sky-100 dark:bg-sky-900/50',
        text: 'text-sky-600 dark:text-sky-400',
        border: 'border-sky-300 dark:border-sky-600',
        selectedBorder: 'border-sky-500',
        shadow: 'shadow-sky-200 dark:shadow-sky-900/50',
        handle: '!bg-sky-500',
      };
    case 'read_barcode':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/50',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-300 dark:border-emerald-600',
        selectedBorder: 'border-emerald-500',
        shadow: 'shadow-emerald-200 dark:shadow-emerald-900/50',
        handle: '!bg-emerald-500',
      };
    case 'user_message':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/50',
        text: 'text-yellow-600 dark:text-yellow-400',
        border: 'border-yellow-300 dark:border-yellow-600',
        selectedBorder: 'border-yellow-500',
        shadow: 'shadow-yellow-200 dark:shadow-yellow-900/50',
        handle: '!bg-yellow-500',
      };
    case 'inbox':
      return {
        bg: 'bg-amber-50 dark:bg-amber-900/50',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-400 dark:border-amber-600',
        selectedBorder: 'border-amber-500',
        shadow: 'shadow-amber-200 dark:shadow-amber-900/50',
        handle: '!bg-amber-500',
      };
    case 'update_imaging_document':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/50',
        text: 'text-orange-700 dark:text-orange-400',
        border: 'border-orange-300 dark:border-orange-600',
        selectedBorder: 'border-orange-500',
        shadow: 'shadow-orange-200 dark:shadow-orange-900/50',
        handle: '!bg-orange-500',
      };
    default:
      return {
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-600 dark:text-gray-400',
        border: 'border-gray-300 dark:border-gray-600',
        selectedBorder: 'border-gray-500',
        shadow: 'shadow-gray-200 dark:shadow-gray-900/50',
        handle: '!bg-gray-500',
      };
  }
};

export const StartNode = memo(({ selected }: NodeProps<StartNodeData>) => {
  return (
    <div
      className={`px-5 py-3 rounded-full border-2 bg-white dark:bg-gray-800 shadow-md transition-all ${
        selected
          ? 'border-emerald-500 shadow-emerald-200 dark:shadow-emerald-900/50'
          : 'border-emerald-300 dark:border-emerald-600'
      }`}
    >
      <div className="flex items-center space-x-2">
        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-full">
          <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm">Start</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
      />
    </div>
  );
});

StartNode.displayName = 'StartNode';

export const WorkflowStepNode = memo(({ data, selected }: NodeProps<WorkflowStepNodeData>) => {
  const colors = getStepColor(data.stepType);
  const isBranching = data.stepType === 'conditional_check';
  const isInbox = data.stepType === 'inbox';

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 min-w-[200px] shadow-md transition-all ${
        selected ? `${colors.selectedBorder} ${colors.shadow}` : colors.border
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 ${colors.handle} !border-2 !border-white`}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-2 ${colors.bg} rounded-lg ${colors.text}`}>
            {getStepIcon(data.stepType)}
          </div>
          <div>
            <div className={`text-xs font-medium ${colors.text} uppercase tracking-wide`}>
              {getStepLabel(data.stepType)}
            </div>
            <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{data.label}</div>
          </div>
        </div>
        {(data.onEdit || data.onCopy || data.onDelete) && (
          <div className="flex items-center space-x-1 ml-3">
            {data.onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); data.onEdit?.(); }}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
            {data.onCopy && (
              <button
                onClick={(e) => { e.stopPropagation(); data.onCopy?.(); }}
                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {data.onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {isBranching ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="success"
            style={{ left: '30%' }}
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="failure"
            style={{ left: '70%' }}
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
          />
          <div className="flex justify-between text-xs mt-2 text-gray-500 dark:text-gray-400">
            <span className="text-green-600">Yes</span>
            <span className="text-red-600">No</span>
          </div>
        </>
      ) : isInbox ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="accept"
            style={{ left: '30%' }}
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="reject"
            style={{ left: '70%' }}
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
          />
          <div className="flex justify-between text-xs mt-2 text-gray-500 dark:text-gray-400">
            <span className="text-green-600">Accept</span>
            <span className="text-red-600">Reject</span>
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

WorkflowStepNode.displayName = 'WorkflowStepNode';

export const workflowV2NodeTypes = {
  start: StartNode,
  workflow: WorkflowStepNode,
};
