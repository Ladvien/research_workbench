import React, { useState, useEffect } from 'react';
import type { Message, BranchInfo, ConversationTreeResponse } from '../types/chat';

interface BranchVisualizerProps {
  conversationId: string;
  treeData?: ConversationTreeResponse;
  onBranchSwitch?: (targetMessageId: string) => Promise<void>;
  isVisible?: boolean;
}

interface TreeNode {
  message: Message;
  children: TreeNode[];
  depth: number;
  isActive: boolean;
  hasBranches: boolean;
}

export const BranchVisualizer: React.FC<BranchVisualizerProps> = ({
  conversationId,
  treeData,
  onBranchSwitch,
  isVisible = false,
}) => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!treeData) return;

    // Build tree structure from flat message list
    const messageMap = new Map<string, Message>();
    const childrenMap = new Map<string, Message[]>();

    // Index all messages
    treeData.messages.forEach(message => {
      messageMap.set(message.id, message);

      const parentId = message.parentId || 'root';
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(message);
    });

    // Build tree recursively
    const buildTree = (parentId: string, depth: number = 0): TreeNode[] => {
      const children = childrenMap.get(parentId) || [];

      return children.map(message => {
        const messageChildren = buildTree(message.id, depth + 1);
        const isActive = treeData.activeThread.includes(message.id);
        const hasBranches = (childrenMap.get(message.id)?.length || 0) > 1;

        return {
          message,
          children: messageChildren,
          depth,
          isActive,
          hasBranches,
        };
      }).sort((a, b) => {
        // Sort by timestamp to maintain chronological order
        return new Date(a.message.timestamp).getTime() - new Date(b.message.timestamp).getTime();
      });
    };

    const rootNodes = buildTree('root');
    setTree(rootNodes);

    // Auto-expand active path
    const activeNodes = new Set<string>();
    treeData.activeThread.forEach(messageId => {
      const message = messageMap.get(messageId);
      if (message?.parentId) {
        activeNodes.add(message.parentId);
      }
    });
    setExpandedNodes(activeNodes);
  }, [treeData]);

  const toggleExpanded = (messageId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleNodeClick = async (node: TreeNode) => {
    if (!node.isActive && onBranchSwitch) {
      try {
        await onBranchSwitch(node.message.id);
      } catch (error) {
        console.error('Failed to switch branch:', error);
      }
    }
  };

  const renderNode = (node: TreeNode): React.ReactElement => {
    const { message, children, depth, isActive, hasBranches } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(message.id);

    return (
      <div key={message.id} className="select-none">
        <div
          className={`
            flex items-center py-1 px-2 rounded cursor-pointer transition-colors
            ${isActive
              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
          style={{ marginLeft: `${depth * 16}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {/* Expand/collapse button */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(message.id);
              }}
              className="mr-1 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <svg
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}

          {/* Node content */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {/* Role indicator */}
            <span
              className={`
                w-2 h-2 rounded-full flex-shrink-0
                ${message.role === 'user' ? 'bg-green-500' :
                  message.role === 'assistant' ? 'bg-blue-500' : 'bg-yellow-500'}
              `}
            />

            {/* Message preview */}
            <span className="text-xs truncate flex-1">
              {message.content.slice(0, 50)}
              {message.content.length > 50 ? '...' : ''}
            </span>

            {/* Branch indicator */}
            {hasBranches && (
              <span className="text-xs bg-orange-200 text-orange-800 px-1 rounded dark:bg-orange-800 dark:text-orange-200">
                {children.length}
              </span>
            )}

            {/* Active indicator */}
            {isActive && (
              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  if (!isVisible || !treeData) {
    return null;
  }

  return (
    <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          Conversation Tree
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {treeData.messages.length} messages, {treeData.branches.length} branches
        </p>
      </div>

      <div className="p-2 space-y-1">
        {tree.length > 0 ? (
          tree.map(renderNode)
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
            No messages yet
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-gray-600 dark:text-gray-400">User</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span className="text-gray-600 dark:text-gray-400">Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
            <span className="text-gray-600 dark:text-gray-400">System</span>
          </div>
        </div>
      </div>
    </div>
  );
};