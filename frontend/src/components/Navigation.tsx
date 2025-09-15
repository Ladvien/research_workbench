import React, { useState } from 'react';
import { BarChart3, MessageSquare, LogOut, User, Loader2 } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { useConversationStore } from '../hooks/useConversationStore';
import { useSearchStore } from '../hooks/useSearchStore';

interface NavigationProps {
  currentView: 'chat' | 'analytics';
  onViewChange: (view: 'chat' | 'analytics') => void;
  onToggleSidebar?: () => void;
  searchComponent?: React.ReactNode;
}

interface LogoutConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const LogoutConfirmationModal: React.FC<LogoutConfirmationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  isLoading
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 w-full">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Confirm Logout
        </h3>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Are you sure you want to logout? This will clear your current session and you'll need to sign in again.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Logging out...</span>
              </>
            ) : (
              <span>Logout</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Navigation: React.FC<NavigationProps> = ({
  currentView,
  onViewChange,
  onToggleSidebar,
  searchComponent
}) => {
  const { isAuthenticated, user, logout, isLoading } = useAuthStore();
  const {
    setCurrentConversation,
    // Reset conversation state on logout
    loadConversations
  } = useConversationStore();
  const { clearSearch } = useSearchStore();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      setIsLoggingOut(true);

      // Call logout function which clears server session and local auth state
      await logout();

      // Clear application state
      setCurrentConversation(''); // Clear current conversation
      clearSearch(); // Clear search state

      // Reset conversation store by clearing local storage
      localStorage.removeItem('workbench-conversation-store');
      localStorage.removeItem('workbench-search-store');

      // Redirect to login page
      // In a real app, you'd use React Router here
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if server logout fails, still clear client state and redirect
      setCurrentConversation('');
      clearSearch();
      localStorage.removeItem('workbench-conversation-store');
      localStorage.removeItem('workbench-search-store');
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };

  if (!isAuthenticated) {
    return null; // Don't render navigation if not authenticated
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - View navigation */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => onViewChange('chat')}
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
              onClick={() => onViewChange('analytics')}
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

          {/* Center - Search component (passed as prop) */}
          {searchComponent && (
            <div className="flex-1 max-w-lg mx-4 hidden md:block">
              {searchComponent}
            </div>
          )}

          {/* Right side - User info and controls */}
          <div className="flex items-center space-x-2">
            {/* Mobile search */}
            {searchComponent && (
              <div className="md:hidden w-64">
                {searchComponent}
              </div>
            )}

            {/* User info */}
            <div className="hidden sm:flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700">
              <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {user?.username || user?.email || 'User'}
              </span>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogoutClick}
              disabled={isLoading || isLoggingOut}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Logout"
            >
              {isLoading || isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Logout</span>
            </button>

            {/* Sidebar toggle for mobile */}
            {onToggleSidebar && currentView === 'chat' && (
              <button
                onClick={onToggleSidebar}
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

      {/* Logout confirmation modal */}
      <LogoutConfirmationModal
        isOpen={showLogoutModal}
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        isLoading={isLoggingOut}
      />
    </>
  );
};

export default Navigation;