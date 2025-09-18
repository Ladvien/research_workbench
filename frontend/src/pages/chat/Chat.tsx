import React from 'react';
import { BranchingChat } from '../../components/BranchingChat';

/**
 * Chat page component - provides the main chat interface
 * Uses the BranchingChat component for the actual chat functionality
 */
export const Chat: React.FC = () => {
  return (
    <div className="h-full">
      <BranchingChat />
    </div>
  );
};

export default Chat;
