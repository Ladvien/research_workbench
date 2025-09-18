import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ConversationSidebar } from './components/ConversationSidebar';
import { SearchBar } from './components/SearchBar';
import { Navigation } from './components/Navigation';
import ErrorBoundary from './components/ErrorBoundary';
import { useConversationStore } from './hooks/useConversationStore';
import { useAuth } from './hooks/useAuth';
import { Login, Register } from './pages/auth';
import { Chat } from './pages/chat';
import { Dashboard } from './pages/dashboard';

type CurrentView = 'chat' | 'analytics';

// Main app component wrapped with authentication
const AuthenticatedApp: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [currentView, setCurrentView] = useState<CurrentView>('chat');
  const [showRegister, setShowRegister] = useState(false);

  const { setCurrentConversation, loadConversation } = useConversationStore();
  const { login, register, isAuthenticated } = useAuth();

  const toggleSidebar = useCallback(() => setSidebarOpen(!sidebarOpen), [sidebarOpen]);

  // Add keyboard shortcut for toggling sidebar (Cmd+B or Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+B (Mac) or Ctrl+B (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        // Only toggle if we're in chat view and authenticated
        if (currentView === 'chat' && isAuthenticated) {
          toggleSidebar();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, isAuthenticated, toggleSidebar]);

  const handleSearchResultClick = useCallback(async (conversationId: string, messageId: string) => {
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
  }, [currentView, loadConversation, setCurrentConversation]);

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
    <div className="relative h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - only show for chat view */}
      {currentView === 'chat' && (
        <ConversationSidebar
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
        />
      )}

      {/* Main Content */}
      <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${
        currentView === 'chat' && sidebarOpen ? 'md:ml-80' : ''
      }`}>
        {/* Navigation Header */}
        <Navigation
          currentView={currentView}
          onViewChange={setCurrentView}
          onToggleSidebar={currentView === 'chat' ? toggleSidebar : undefined}
          searchComponent={
            currentView === 'chat' ? (
              <SearchBar
                placeholder="Search conversations..."
                onResultClick={handleSearchResultClick}
              />
            ) : undefined
          }
        />

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'chat' ? (
            <ProtectedRoute permission="create_conversations">
              <ErrorBoundary>
                <Chat />
              </ErrorBoundary>
            </ProtectedRoute>
          ) : (
            <ProtectedRoute permission="view_analytics">
              <ErrorBoundary>
                <Dashboard />
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