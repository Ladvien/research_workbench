import React, { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
  requireAuth?: boolean;
  permission?: string;
  showLoading?: boolean;
  loadingComponent?: ReactNode;
}

/**
 * ProtectedRoute component that handles authentication and authorization guards.
 *
 * This component wraps content that requires authentication or specific permissions,
 * providing a consistent way to protect routes and components throughout the app.
 *
 * @param children - The content to render when authentication/authorization passes
 * @param fallback - Custom component to show when access is denied (default: login prompt)
 * @param redirectTo - URL to redirect to when access is denied (not implemented yet)
 * @param requireAuth - Whether authentication is required (default: true)
 * @param permission - Specific permission required to access the content
 * @param showLoading - Whether to show loading state during auth check (default: true)
 * @param loadingComponent - Custom loading component (default: spinner)
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallback,
  redirectTo,
  requireAuth = true,
  permission,
  showLoading = true,
  loadingComponent,
}) => {
  const { user, isAuthenticated, isLoading, error } = useAuth();

  // Show loading state while checking authentication
  if (isLoading && showLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Check authentication requirement
  if (requireAuth && !isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white shadow-lg rounded-lg p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Required
            </h2>
            <p className="text-gray-600 mb-4">
              Please log in to access this content.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check permission requirement
  if (permission && user) {
    // Basic permission check - can be extended for role-based access
    const hasPermission = checkUserPermission(user, permission);

    if (!hasPermission) {
      if (fallback) {
        return <>{fallback}</>;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white shadow-lg rounded-lg p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Access Denied
              </h2>
              <p className="text-gray-600">
                You don't have permission to access this content.
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  // Authentication and authorization passed, render children
  return <>{children}</>;
};

/**
 * Simple auth guard component for inline use.
 *
 * @example
 * ```tsx
 * <AuthGuard>
 *   <AdminPanel />
 * </AuthGuard>
 * ```
 */
export const AuthGuard: React.FC<{ children: ReactNode; permission?: string }> = ({
  children,
  permission,
}) => {
  return (
    <ProtectedRoute permission={permission} showLoading={false}>
      {children}
    </ProtectedRoute>
  );
};

/**
 * Component that renders content only for authenticated users.
 */
export const AuthenticatedOnly: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};

/**
 * Component that renders content only for unauthenticated users.
 */
export const UnauthenticatedOnly: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};

// Helper function to check user permissions
function checkUserPermission(user: any, permission: string): boolean {
  // Basic implementation - can be extended for role-based access control
  switch (permission) {
    case 'create_conversations':
    case 'delete_conversations':
    case 'edit_messages':
    case 'view_analytics':
    case 'upload_files':
      // All authenticated users have these permissions for now
      return true;
    case 'admin_access':
      // Check if user has admin role (extend this based on your user model)
      return user.role === 'admin' || user.email?.endsWith('@lolzlab.com');
    default:
      return false;
  }
}