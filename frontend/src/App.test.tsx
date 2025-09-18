import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useAuth } from './hooks/useAuth';
import { useConversationStore } from './hooks/useConversationStore';

// Mock all the hooks and components
vi.mock('./hooks/useAuth');
vi.mock('./hooks/useConversationStore');
vi.mock('./components/BranchingChat', () => ({
  BranchingChat: () => <div data-testid="branching-chat">Branching Chat Component</div>
}));
vi.mock('./components/ConversationSidebar', () => ({
  ConversationSidebar: ({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => (
    <div data-testid="conversation-sidebar">
      <div>Sidebar: {isOpen ? 'Open' : 'Closed'}</div>
      <button onClick={onToggle} data-testid="sidebar-toggle">
        Toggle Sidebar
      </button>
    </div>
  )
}));
vi.mock('./components/SearchBar', () => ({
  SearchBar: ({ onResultClick }: { onResultClick: (convId: string, msgId: string) => void }) => (
    <div data-testid="search-bar">
      <button
        onClick={() => onResultClick('test-conv', 'test-msg')}
        data-testid="search-result-button"
      >
        Search Result
      </button>
    </div>
  )
}));
vi.mock('./components/Navigation', () => ({
  Navigation: ({
    currentView,
    onViewChange,
    onToggleSidebar,
    searchComponent
  }: {
    currentView: string;
    onViewChange: (view: string) => void;
    onToggleSidebar?: () => void;
    searchComponent?: React.ReactNode;
  }) => (
    <div data-testid="navigation">
      <div>Current View: {currentView}</div>
      <button onClick={() => onViewChange('chat')} data-testid="nav-chat">Chat</button>
      <button onClick={() => onViewChange('analytics')} data-testid="nav-analytics">Analytics</button>
      {onToggleSidebar && (
        <button onClick={onToggleSidebar} data-testid="nav-sidebar-toggle">
          Nav Toggle Sidebar
        </button>
      )}
      {searchComponent}
    </div>
  )
}));
vi.mock('./components/AnalyticsDashboard', () => ({
  default: () => <div data-testid="analytics-dashboard">Analytics Dashboard</div>
}));
vi.mock('./components/Auth/Login', () => ({
  Login: ({ onSubmit, onSwitchToRegister }: {
    onSubmit: (data: { email: string; password: string }) => void;
    onSwitchToRegister: () => void;
  }) => (
    <div data-testid="login-form">
      <button
        onClick={() => onSubmit({ email: 'test@example.com', password: 'password' })}
        data-testid="login-submit"
      >
        Login
      </button>
      <button onClick={onSwitchToRegister} data-testid="switch-to-register">
        Switch to Register
      </button>
    </div>
  )
}));
vi.mock('./components/Auth/Register', () => ({
  Register: ({ onSubmit, onSwitchToLogin }: {
    onSubmit: (data: { email: string; username: string; password: string }) => void;
    onSwitchToLogin: () => void;
  }) => (
    <div data-testid="register-form">
      <button
        onClick={() => onSubmit({
          email: 'test@example.com',
          username: 'testuser',
          password: 'password'
        })}
        data-testid="register-submit"
      >
        Register
      </button>
      <button onClick={onSwitchToLogin} data-testid="switch-to-login">
        Switch to Login
      </button>
    </div>
  )
}));
vi.mock('./components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock('./components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseConversationStore = vi.mocked(useConversationStore);

const mockConversationStore = {
  setCurrentConversation: vi.fn(),
  loadConversation: vi.fn(),
  currentConversationId: null,
  conversations: [],
  currentMessages: [],
  streamingMessage: null,
  selectedModel: 'claude-code-opus',
  isLoading: false,
  isStreaming: false,
  error: null,
  abortController: null,
  loadConversations: vi.fn(),
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  sendStreamingMessage: vi.fn(),
  stopStreaming: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
  clearError: vi.fn(),
  setSelectedModel: vi.fn()
};

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConversationStore.mockReturnValue(mockConversationStore);

    // Mock window.innerWidth for responsive behavior
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    // Clean up any event listeners
    vi.restoreAllMocks();
  });

  describe('Authentication Flow', () => {
    it('shows login form when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: null,
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });

      render(<App />);

      expect(screen.getByTestId('login-form')).toBeInTheDocument();
      expect(screen.queryByTestId('navigation')).not.toBeInTheDocument();
    });

    it('shows register form when switching from login', async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: null,
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });

      render(<App />);

      await userEvent.click(screen.getByTestId('switch-to-register'));

      expect(screen.getByTestId('register-form')).toBeInTheDocument();
      expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
    });

    it('shows app interface when authenticated', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });

      render(<App />);

      expect(screen.getByTestId('navigation')).toBeInTheDocument();
      expect(screen.getByTestId('branching-chat')).toBeInTheDocument();
      expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
    });

    it('handles login submission', async () => {
      const mockLogin = vi.fn();
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        login: mockLogin,
        register: vi.fn(),
        logout: vi.fn(),
        user: null,
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });

      render(<App />);

      await userEvent.click(screen.getByTestId('login-submit'));

      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password'
      });
    });

    it('handles register submission', async () => {
      const mockRegister = vi.fn();
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        login: vi.fn(),
        register: mockRegister,
        logout: vi.fn(),
        user: null,
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });

      render(<App />);

      // Switch to register form first
      await userEvent.click(screen.getByTestId('switch-to-register'));
      await userEvent.click(screen.getByTestId('register-submit'));

      expect(mockRegister).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password'
      });
    });
  });

  describe('Sidebar Functionality', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });
    });

    it('starts with sidebar open on desktop', () => {
      render(<App />);

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();
    });

    it('starts with sidebar closed on mobile', () => {
      // Mock mobile width
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600,
      });

      render(<App />);

      expect(screen.getByText('Sidebar: Closed')).toBeInTheDocument();
    });

    it('toggles sidebar when clicking toggle button', async () => {
      render(<App />);

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('sidebar-toggle'));

      expect(screen.getByText('Sidebar: Closed')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('sidebar-toggle'));

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();
    });

    it('toggles sidebar from navigation', async () => {
      render(<App />);

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('nav-sidebar-toggle'));

      expect(screen.getByText('Sidebar: Closed')).toBeInTheDocument();
    });

    it('hides sidebar when switching to analytics view', async () => {
      render(<App />);

      expect(screen.getByTestId('conversation-sidebar')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('nav-analytics'));

      expect(screen.queryByTestId('conversation-sidebar')).not.toBeInTheDocument();
      expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument();
    });

    it('shows sidebar when switching back to chat view', async () => {
      render(<App />);

      // Go to analytics
      await userEvent.click(screen.getByTestId('nav-analytics'));
      expect(screen.queryByTestId('conversation-sidebar')).not.toBeInTheDocument();

      // Go back to chat
      await userEvent.click(screen.getByTestId('nav-chat'));
      expect(screen.getByTestId('conversation-sidebar')).toBeInTheDocument();
    });
  });

  describe('Keyboard Shortcuts', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });
    });

    it('toggles sidebar with Cmd+B on Mac', async () => {
      render(<App />);

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();

      // Simulate Cmd+B
      fireEvent.keyDown(window, { key: 'b', metaKey: true });

      expect(screen.getByText('Sidebar: Closed')).toBeInTheDocument();

      // Toggle again
      fireEvent.keyDown(window, { key: 'b', metaKey: true });

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();
    });

    it('toggles sidebar with Ctrl+B on Windows/Linux', async () => {
      render(<App />);

      expect(screen.getByText('Sidebar: Open')).toBeInTheDocument();

      // Simulate Ctrl+B
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

      expect(screen.getByText('Sidebar: Closed')).toBeInTheDocument();
    });

    it('does not toggle sidebar when not in chat view', async () => {
      render(<App />);

      // Switch to analytics
      await userEvent.click(screen.getByTestId('nav-analytics'));

      // Try keyboard shortcut
      fireEvent.keyDown(window, { key: 'b', metaKey: true });

      // Sidebar should not appear in analytics view
      expect(screen.queryByTestId('conversation-sidebar')).not.toBeInTheDocument();
    });

    it('does not toggle sidebar when not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: null,
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });

      render(<App />);

      // Try keyboard shortcut
      fireEvent.keyDown(window, { key: 'b', metaKey: true });

      // Should still show login form
      expect(screen.getByTestId('login-form')).toBeInTheDocument();
    });

    it('prevents default behavior for Cmd/Ctrl+B', async () => {
      render(<App />);

      const event = new KeyboardEvent('keydown', { key: 'b', metaKey: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      fireEvent.keyDown(window, event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('View Switching', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });
    });

    it('starts in chat view by default', () => {
      render(<App />);

      expect(screen.getByText('Current View: chat')).toBeInTheDocument();
      expect(screen.getByTestId('branching-chat')).toBeInTheDocument();
    });

    it('switches to analytics view', async () => {
      render(<App />);

      await userEvent.click(screen.getByTestId('nav-analytics'));

      expect(screen.getByText('Current View: analytics')).toBeInTheDocument();
      expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('branching-chat')).not.toBeInTheDocument();
    });

    it('switches back to chat view', async () => {
      render(<App />);

      // Go to analytics first
      await userEvent.click(screen.getByTestId('nav-analytics'));
      expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument();

      // Switch back to chat
      await userEvent.click(screen.getByTestId('nav-chat'));

      expect(screen.getByText('Current View: chat')).toBeInTheDocument();
      expect(screen.getByTestId('branching-chat')).toBeInTheDocument();
      expect(screen.queryByTestId('analytics-dashboard')).not.toBeInTheDocument();
    });

    it('shows search bar only in chat view', async () => {
      render(<App />);

      // In chat view
      expect(screen.getByTestId('search-bar')).toBeInTheDocument();

      // Switch to analytics
      await userEvent.click(screen.getByTestId('nav-analytics'));
      expect(screen.queryByTestId('search-bar')).not.toBeInTheDocument();

      // Back to chat
      await userEvent.click(screen.getByTestId('nav-chat'));
      expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });
    });

    it('handles search result click', async () => {
      const mockLoadConversation = vi.fn().mockResolvedValue(undefined);
      const mockSetCurrentConversation = vi.fn();

      mockUseConversationStore.mockReturnValue({
        ...mockConversationStore,
        loadConversation: mockLoadConversation,
        setCurrentConversation: mockSetCurrentConversation
      });

      // Mock getElementById for message scrolling
      const mockScrollIntoView = vi.fn();
      const mockElement = {
        scrollIntoView: mockScrollIntoView,
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      } as HTMLElement;
      vi.spyOn(document, 'getElementById').mockReturnValue(mockElement);

      render(<App />);

      await userEvent.click(screen.getByTestId('search-result-button'));

      expect(mockLoadConversation).toHaveBeenCalledWith('test-conv');
      expect(mockSetCurrentConversation).toHaveBeenCalledWith('test-conv');

      // Wait for timeout to trigger scrolling behavior
      await waitFor(() => {
        expect(document.getElementById).toHaveBeenCalledWith('message-test-msg');
      }, { timeout: 200 });

      await waitFor(() => {
        expect(mockScrollIntoView).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'center'
        });
      });
    });

    it('switches to chat view when clicking search result from analytics', async () => {
      const mockLoadConversation = vi.fn().mockResolvedValue(undefined);
      const mockSetCurrentConversation = vi.fn();

      mockUseConversationStore.mockReturnValue({
        ...mockConversationStore,
        loadConversation: mockLoadConversation,
        setCurrentConversation: mockSetCurrentConversation
      });

      render(<App />);

      // Go to analytics first
      await userEvent.click(screen.getByTestId('nav-analytics'));
      expect(screen.getByText('Current View: analytics')).toBeInTheDocument();

      // Go back to chat and click search result
      await userEvent.click(screen.getByTestId('nav-chat'));
      await userEvent.click(screen.getByTestId('search-result-button'));

      expect(screen.getByText('Current View: chat')).toBeInTheDocument();
      expect(mockLoadConversation).toHaveBeenCalledWith('test-conv');
    });
  });

  describe('Responsive Layout', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });
    });

    it('applies correct layout classes when sidebar is open', () => {
      render(<App />);

      const mainContent = screen.getByTestId('branching-chat').closest('.md\\:ml-80');
      expect(mainContent).toBeInTheDocument();
    });

    it('removes layout classes when sidebar is closed', async () => {
      render(<App />);

      await userEvent.click(screen.getByTestId('sidebar-toggle'));

      const mainContent = screen.getByTestId('branching-chat').closest('.md\\:ml-80');
      expect(mainContent).not.toBeInTheDocument();
    });

    it('removes layout classes in analytics view', async () => {
      render(<App />);

      await userEvent.click(screen.getByTestId('nav-analytics'));

      const mainContent = screen.getByTestId('analytics-dashboard').closest('.md\\:ml-80');
      expect(mainContent).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        user: { id: '1', email: 'test@example.com', username: 'testuser', created_at: '', updated_at: '' },
        isLoading: false,
        error: null,
        clearError: vi.fn()
      });
    });

    it('wraps application in error boundary', () => {
      render(<App />);

      // Should render without crashing
      expect(screen.getByTestId('navigation')).toBeInTheDocument();
    });

    it('handles search result click with missing element gracefully', async () => {
      const mockLoadConversation = vi.fn().mockResolvedValue(undefined);
      const mockSetCurrentConversation = vi.fn();

      mockUseConversationStore.mockReturnValue({
        ...mockConversationStore,
        loadConversation: mockLoadConversation,
        setCurrentConversation: mockSetCurrentConversation
      });

      // Mock getElementById to return null (element not found)
      vi.spyOn(document, 'getElementById').mockReturnValue(null);

      render(<App />);

      await userEvent.click(screen.getByTestId('search-result-button'));

      // Should not crash when element is not found
      expect(mockLoadConversation).toHaveBeenCalledWith('test-conv');
      expect(mockSetCurrentConversation).toHaveBeenCalledWith('test-conv');
    });
  });
});