import { useAuthContext, AuthContextType } from '../contexts/AuthContext';

/**
 * Custom hook for accessing authentication state and methods.
 *
 * This hook provides a clean interface to the auth context, making it easy
 * to access user authentication state and actions throughout the application.
 *
 * @returns {AuthContextType} The auth context containing user state and auth methods
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, login, logout, isLoading } = useAuth();
 *
 * // Check if user is authenticated
 * if (isAuthenticated) {
 *   return <Dashboard user={user} />;
 * }
 *
 * // Handle login
 * const handleLogin = async () => {
 *   const success = await login({ email, password });
 *   if (success) {
 *     // Redirect to dashboard
 *   }
 * };
 *
 * // Handle logout
 * const handleLogout = async () => {
 *   await logout();
 *   // Redirect to login
 * };
 * ```
 */
export const useAuth = (): AuthContextType => {
  return useAuthContext();
};

/**
 * Helper hook to check if the current user has specific permissions.
 * This can be extended in the future for role-based access control.
 *
 * @param permission - The permission to check
 * @returns {boolean} Whether the user has the permission
 *
 * @example
 * ```tsx
 * const canDelete = usePermission('delete_conversations');
 * ```
 */
export const usePermission = (permission: string): boolean => {
  const { user, isAuthenticated } = useAuth();

  // Basic permission logic - can be extended for role-based access
  if (!isAuthenticated || !user) {
    return false;
  }

  // For now, all authenticated users have all permissions
  // This can be extended based on user roles or specific permissions
  switch (permission) {
    case 'create_conversations':
    case 'delete_conversations':
    case 'edit_messages':
    case 'view_analytics':
    case 'upload_files':
      return true;
    default:
      return false;
  }
};

/**
 * Hook to get user information with additional helpers.
 *
 * @returns Object with user info and utility functions
 */
export const useUser = () => {
  const { user, isAuthenticated } = useAuth();

  return {
    user,
    isAuthenticated,
    isAnonymous: !isAuthenticated,
    displayName: user?.username || user?.email || 'Anonymous',
    initials: user?.username
      ? user.username.substring(0, 2).toUpperCase()
      : user?.email
      ? user.email.substring(0, 2).toUpperCase()
      : 'AN',
  };
};

/**
 * Hook for authentication state checks with loading states.
 * Useful for conditional rendering based on auth status.
 *
 * @returns Object with auth state booleans
 */
export const useAuthState = () => {
  const { isAuthenticated, isLoading, error } = useAuth();

  return {
    isAuthenticated,
    isLoading,
    isUnauthenticated: !isAuthenticated && !isLoading,
    hasError: !!error,
    error,
    // Utility states
    isAuthenticating: isLoading,
    isReady: !isLoading, // Auth check is complete
  };
};