import React, { useState } from 'react';
import { BranchingChat } from './components/BranchingChat';
import { ConversationSidebar } from './components/ConversationSidebar';
import { SearchBar } from './components/SearchBar';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import { BarChart3, MessageSquare } from 'lucide-react';
import { useConversationStore } from './hooks/useConversationStore';

type CurrentView = 'chat' | 'analytics';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<CurrentView>('chat');

  const { setCurrentConversation, loadConversation } = useConversationStore();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const handleSearchResultClick = async (conversationId: string, messageId: string) => {
    // Switch to chat view if not already there
    if (currentView !== 'chat') {
      setCurrentView('chat');
    }

    // Load the conversation and navigate to it
    await loadConversation(conversationId);
    setCurrentConversation(conversationId);

    // Scroll to the specific message (implementation would depend on how messages are rendered)
    // For now, we'll just navigate to the conversation
    setTimeout(() => {
      const messageElement = document.getElementById(`message-${messageId}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('bg-yellow-100', 'dark:bg-yellow-900');
        setTimeout(() => {
          messageElement.classList.remove('bg-yellow-100', 'dark:bg-yellow-900');
        }, 3000);
      }
    }, 100);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - only show for chat view */}
      {currentView === 'chat' && (
        <ConversationSidebar
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Navigation Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentView('chat')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'chat'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                <span>Chat</span>
              </button>
              <button
                onClick={() => setCurrentView('analytics')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'analytics'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Analytics</span>
              </button>
            </div>

            {/* Search Bar - only show for chat view */}
            {currentView === 'chat' && (
              <div className="flex-1 max-w-lg mx-4 hidden md:block">
                <SearchBar
                  placeholder="Search conversations..."
                  onResultClick={handleSearchResultClick}
                />
              </div>
            )}

            {/* Right side controls */}
            <div className="flex items-center space-x-2">
              {/* Mobile search for chat view */}
              {currentView === 'chat' && (
                <div className="md:hidden w-64">
                  <SearchBar
                    placeholder="Search..."
                    onResultClick={handleSearchResultClick}
                  />
                </div>
              )}

              {/* Sidebar toggle for chat view */}
              {currentView === 'chat' && (
                <button
                  onClick={toggleSidebar}
                  className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  title="Toggle sidebar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'chat' ? (
            <BranchingChat />
          ) : (
            <div className="h-full overflow-y-auto">
              <AnalyticsDashboard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
