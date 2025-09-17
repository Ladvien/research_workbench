import React, { PropsWithChildren } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';

// Custom render function that includes providers
const AllTheProviders = ({ children }: PropsWithChildren) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };

// Re-export userEvent
export { default as userEvent } from '@testing-library/user-event';

// Helper to create a minimal render without all providers
export const renderMinimal = (ui: React.ReactElement, options?: RenderOptions) => {
  return render(ui, options);
};

// Helper for rendering with just router
export const renderWithRouter = (ui: React.ReactElement, options?: RenderOptions) => {
  const Wrapper = ({ children }: PropsWithChildren) => (
    <BrowserRouter>{children}</BrowserRouter>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};

// Helper for rendering with query client only
export const renderWithQueryClient = (ui: React.ReactElement, options?: RenderOptions) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};
