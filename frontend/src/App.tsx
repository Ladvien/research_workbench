import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BranchingChat } from './components/BranchingChat';
import { ConversationSidebar } from './components/ConversationSidebar';
import { SearchBar } from './components/SearchBar';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { BarChart3, MessageSquare, LogOut, User } from 'lucide-react';
import { useConversationStore } from './hooks/useConversationStore';
import { useAuth, useUser } from './hooks/useAuth';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';

type CurrentView = 'chat' | 'analytics';

// Main app component wrapped with authentication
const AuthenticatedApp: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<CurrentView>('chat');
  const [showRegister, setShowRegister] = useState(false);

  const { setCurrentConversation, loadConversation } = useConversationStore();
  const { login, register, logout, isAuthenticated } = useAuth();
  const { user, displayName, initials } = useUser();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const handleSearchResultClick = async (conversationId: string, messageId: string) => {
    // Switch to chat view if not already there
    if (currentView !== 'chat') {
      setCurrentView('chat');
    }

    // Load the conversation and navigate to it
    await loadConversation(conversationId);
    setCurrentConversation(conversationId);

    // Scroll to the specific message
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

  // Show login/register form if not authenticated
  if (!isAuthenticated) {
    if (showRegister) {
      return (
        <Register
          onSubmit={async (data) => {
            await register({ email: data.email, username: data.username, password: data.password });
          }}
          onSwitchToLogin={() => setShowRegister(false)}
        />
      );
    }

    return (
      <Login
        onSubmit={async (data) => {
          // Now frontend and backend both use 'email' field directly
          await login({ email: data.email, password: data.password });
        }}
        onSwitchToRegister={() => setShowRegister(true)}
      />
    );
  }

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

              {/* User menu */}
              <div className="flex items-center space-x-2">
                {/* User avatar */}
                <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-medium text-white">
                    {initials}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline">
                    {displayName}
                  </span>
                </div>

                {/* Logout button */}
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>

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
            <ProtectedRoute permission="create_conversations">
              <ErrorBoundary>
                <BranchingChat />
              </ErrorBoundary>
            </ProtectedRoute>
          ) : (
            <ProtectedRoute permission="view_analytics">
              <ErrorBoundary>
                <div className="h-full overflow-y-auto">
                  <AnalyticsDashboard />
                </div>
              </ErrorBoundary>
            </ProtectedRoute>
          )}
        </div>
      </div>
    </div>
  );
};

// Main App component with AuthProvider
function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Application error:', error, errorInfo);
        // Could send error to monitoring service here
      }}
    >
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;