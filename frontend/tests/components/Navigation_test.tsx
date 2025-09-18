import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Navigation } from '../../src/components/Navigation';
import { useAuthStore } from '../../src/hooks/useAuthStore';
import { useConversationStore } from '../../src/hooks/useConversationStore';
import { useSearchStore } from '../../src/hooks/useSearchStore';

// Mock the stores with proper types
vi.mock('../../src/hooks/useAuthStore');
vi.mock('../../src/hooks/useConversationStore');
vi.mock('../../src/hooks/useSearchStore');

const mockUseAuthStore = useAuthStore as ReturnType<typeof vi.fn>;
const mockUseConversationStore = useConversationStore as ReturnType<typeof vi.fn>;
const mockUseSearchStore = useSearchStore as ReturnType<typeof vi.fn>;

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BarChart3: () => <div data-testid="bar-chart-icon" />,
  MessageSquare: () => <div data-testid="message-square-icon" />,
  LogOut: () => <div data-testid="logout-icon" />,
  User: () => <div data-testid="user-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
}));

// Mock window.location
const mockLocation = {
  href: '',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('Navigation', () => {
  const mockLogout = vi.fn();
  const mockSetCurrentConversation = vi.fn();
  const mockClearSearch = vi.fn();
  const mockOnViewChange = vi.fn();
  const mockOnToggleSidebar = vi.fn();

  // Default auth store state
  const defaultAuthState = {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      created_at: '2023-01-01',
      updated_at: '2023-01-01',
    },
    logout: mockLogout,
    isLoading: false,
    tokens: null,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
    clearError: vi.fn(),
  };

  const defaultConversationState = {
    setCurrentConversation: mockSetCurrentConversation,
    currentConversationId: null,
    conversations: [],
    currentMessages: [],
    streamingMessage: null,
    isLoading: false,
    isStreaming: false,
    error: null,
    abortController: null,
    loadConversations: vi.fn(),
    loadConversation: vi.fn(),
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
    sendStreamingMessage: vi.fn(),
    stopStreaming: vi.fn(),
    updateConversationTitle: vi.fn(),
    deleteConversation: vi.fn(),
    clearError: vi.fn(),
  };

  const defaultSearchState = {
    clearSearch: mockClearSearch,
    isSearching: false,
    searchResults: [],
    searchQuery: '',
    error: null,
    search: vi.fn(),
    clearError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = '';

    // Setup default mock implementations
    mockUseAuthStore.mockReturnValue(defaultAuthState);
    mockUseConversationStore.mockReturnValue(defaultConversationState);
    mockUseSearchStore.mockReturnValue(defaultSearchState);

    // Mock localStorage
    const localStorageMock = {
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication States', () => {
    it('renders nothing when user is not authenticated', () => {
      mockUseAuthStore.mockReturnValue({
        ...defaultAuthState,
        isAuthenticated: false,
      });

      const { container } = render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders navigation when user is authenticated', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /analytics/i })).toBeInTheDocument();
      expect(screen.getByText('testuser')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
  });

  describe('View Navigation', () => {
    it('highlights the current view correctly', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      const chatButton = screen.getByRole('button', { name: /chat/i });
      const analyticsButton = screen.getByRole('button', { name: /analytics/i });

      expect(chatButton).toHaveClass('bg-blue-100');
      expect(analyticsButton).not.toHaveClass('bg-blue-100');
    });

    it('calls onViewChange when switching views', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /analytics/i }));

      expect(mockOnViewChange).toHaveBeenCalledWith('analytics');
    });
  });

  describe('User Display', () => {
    it('displays username when available', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('displays email when username is not available', () => {
      mockUseAuthStore.mockReturnValue({
        ...defaultAuthState,
        user: {
          ...defaultAuthState.user,
          username: '',
        },
      });

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('displays fallback text when neither username nor email available', () => {
      mockUseAuthStore.mockReturnValue({
        ...defaultAuthState,
        user: {
          ...defaultAuthState.user,
          username: '',
          email: '',
        },
      });

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(screen.getByText('User')).toBeInTheDocument();
    });
  });

  describe('Logout Functionality', () => {
    it('opens confirmation modal when logout button is clicked', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /logout/i }));

      expect(screen.getByText('Confirm Logout')).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to logout/i)).toBeInTheDocument();
    });

    it('closes modal when cancel is clicked', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: /logout/i }));
      expect(screen.getByText('Confirm Logout')).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      // Modal should be gone
      expect(screen.queryByText('Confirm Logout')).not.toBeInTheDocument();
    });

    it('performs complete logout process when confirmed', async () => {
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: { removeItem: mockRemoveItem },
        writable: true,
      });

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      // Open modal and confirm logout
      fireEvent.click(screen.getByRole('button', { name: /logout/i }));
      // Get the logout button in the modal specifically (not the navigation one)
      const modalLogoutButtons = screen.getAllByRole('button', { name: 'Logout' });
      const modalLogoutButton = modalLogoutButtons[1]; // Second one should be in the modal
      fireEvent.click(modalLogoutButton);

      await waitFor(() => {
        // Verify logout was called
        expect(mockLogout).toHaveBeenCalled();

        // Verify state clearing functions were called
        expect(mockSetCurrentConversation).toHaveBeenCalledWith('');
        expect(mockClearSearch).toHaveBeenCalled();

        // Verify localStorage was cleared
        expect(mockRemoveItem).toHaveBeenCalledWith('workbench-conversation-store');
        expect(mockRemoveItem).toHaveBeenCalledWith('workbench-search-store');

        // Verify redirect
        expect(mockLocation.href).toBe('/login');
      });
    });

    it('shows loading state during logout', async () => {
      // Make logout return a promise that we can control
      let resolveLogout: () => void;
      const logoutPromise = new Promise<void>((resolve) => {
        resolveLogout = resolve;
      });
      mockLogout.mockReturnValue(logoutPromise);

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      // Open modal and start logout
      fireEvent.click(screen.getByRole('button', { name: /logout/i }));
      // Get the logout button in the modal specifically
      const modalLogoutButtons = screen.getAllByRole('button', { name: 'Logout' });
      const modalLogoutButton = modalLogoutButtons[1]; // Second one should be in the modal
      fireEvent.click(modalLogoutButton);

      // Should show loading state in modal
      expect(screen.getByText('Logging out...')).toBeInTheDocument();
      expect(screen.getAllByTestId('loader-icon')).toHaveLength(2); // Both navigation and modal buttons show loading

      // Complete logout
      resolveLogout!();
      await waitFor(() => {
        expect(mockLocation.href).toBe('/login');
      });
    });

    it('still clears state and redirects even if logout API fails', async () => {
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: { removeItem: mockRemoveItem },
        writable: true,
      });

      // Mock logout to reject
      mockLogout.mockRejectedValue(new Error('Network error'));

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      // Open modal and confirm logout
      fireEvent.click(screen.getByRole('button', { name: /logout/i }));
      // Get the logout button in the modal specifically
      const modalLogoutButtons = screen.getAllByRole('button', { name: 'Logout' });
      const modalLogoutButton = modalLogoutButtons[1]; // Second one should be in the modal
      fireEvent.click(modalLogoutButton);

      await waitFor(() => {
        // State should still be cleared
        expect(mockSetCurrentConversation).toHaveBeenCalledWith('');
        expect(mockClearSearch).toHaveBeenCalled();
        expect(mockRemoveItem).toHaveBeenCalledWith('workbench-conversation-store');
        expect(mockRemoveItem).toHaveBeenCalledWith('workbench-search-store');

        // Should still redirect
        expect(mockLocation.href).toBe('/login');
      });
    });

    it('disables logout button when auth is loading', () => {
      mockUseAuthStore.mockReturnValue({
        ...defaultAuthState,
        isLoading: true,
      });

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      const logoutButton = screen.getByRole('button', { name: /logout/i });
      expect(logoutButton).toBeDisabled();
    });
  });

  describe('Search Component Integration', () => {
    it('renders search component when provided', () => {
      const MockSearchComponent = () => <div data-testid="search-component">Search</div>;

      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
          searchComponent={<MockSearchComponent />}
        />
      );

      expect(screen.getAllByTestId('search-component')).toHaveLength(2); // Desktop and mobile versions
    });

    it('does not render search component when not provided', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(screen.queryByTestId('search-component')).not.toBeInTheDocument();
    });
  });

  describe('Sidebar Toggle', () => {
    it('renders sidebar toggle when onToggleSidebar is provided', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
          onToggleSidebar={mockOnToggleSidebar}
        />
      );

      const toggleButton = screen.getByTitle('Toggle sidebar');
      expect(toggleButton).toBeInTheDocument();

      fireEvent.click(toggleButton);
      expect(mockOnToggleSidebar).toHaveBeenCalled();
    });

    it('does not render sidebar toggle when onToggleSidebar is not provided', () => {
      render(
        <Navigation
          currentView="chat"
          onViewChange={mockOnViewChange}
        />
      );

      expect(screen.queryByTitle('Toggle sidebar')).not.toBeInTheDocument();
    });
  });
});