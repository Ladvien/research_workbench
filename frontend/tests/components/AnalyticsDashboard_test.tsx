import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsDashboard from '../../src/components/AnalyticsDashboard';
import { analyticsApi } from '../../src/services/analyticsApi';

// Mock the analytics API
vi.mock('../../src/services/analyticsApi', () => ({
  analyticsApi: {
    getOverview: vi.fn(),
    getCostBreakdown: vi.fn(),
    getUsageTrends: vi.fn(),
    getConversationUsage: vi.fn(),
    downloadUsageData: vi.fn(),
  },
}));

// Mock recharts components to avoid SVG rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const mockAnalyticsData = {
  overview: {
    stats: {
      total_prompt_tokens: 10000,
      total_completion_tokens: 8000,
      total_tokens: 18000,
      total_cost_cents: 500,
      total_requests: 100,
    },
    cost_breakdown: [
      {
        model: 'gpt-4',
        provider: 'openai',
        prompt_tokens: 5000,
        completion_tokens: 4000,
        total_tokens: 9000,
        cost_cents: 300,
        requests: 50,
      },
      {
        model: 'gpt-3.5-turbo',
        provider: 'openai',
        prompt_tokens: 5000,
        completion_tokens: 4000,
        total_tokens: 9000,
        cost_cents: 200,
        requests: 50,
      },
    ],
    recent_usage: [
      {
        date: '2024-09-14',
        prompt_tokens: 1000,
        completion_tokens: 800,
        total_tokens: 1800,
        cost_cents: 50,
        requests: 10,
      },
    ],
  },
  costBreakdown: {
    by_model: [
      {
        model: 'gpt-4',
        provider: 'openai',
        prompt_tokens: 5000,
        completion_tokens: 4000,
        total_tokens: 9000,
        cost_cents: 300,
        requests: 50,
      },
    ],
    by_provider: [
      {
        provider: 'openai',
        models: ['gpt-4', 'gpt-3.5-turbo'],
        total_tokens: 18000,
        cost_cents: 500,
        cost_usd: 5.0,
        requests: 100,
      },
    ],
    total_cost_usd: 5.0,
  },
  usageTrends: {
    daily: [
      {
        date: '2024-09-14',
        prompt_tokens: 1000,
        completion_tokens: 800,
        total_tokens: 1800,
        cost_cents: 50,
        requests: 10,
      },
    ],
    total_days: 30,
    average_daily_tokens: 600,
    average_daily_cost_cents: 17,
  },
  conversationUsage: [
    {
      conversation_id: 'conv-1',
      title: 'Test Conversation',
      model: 'gpt-4',
      provider: 'openai',
      prompt_tokens: 500,
      completion_tokens: 400,
      total_tokens: 900,
      cost_cents: 30,
      requests: 5,
    },
  ],
};

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsApi.getOverview).mockResolvedValue(mockAnalyticsData.overview);
    vi.mocked(analyticsApi.getCostBreakdown).mockResolvedValue(mockAnalyticsData.costBreakdown);
    vi.mocked(analyticsApi.getUsageTrends).mockResolvedValue(mockAnalyticsData.usageTrends);
    vi.mocked(analyticsApi.getConversationUsage).mockResolvedValue(mockAnalyticsData.conversationUsage);
  });

  it('renders loading state initially', () => {
    vi.mocked(analyticsApi.getOverview).mockImplementation(() => new Promise(() => {}));

    render(<AnalyticsDashboard />);

    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
    expect(screen.getByTestId('activity-icon')).toBeInTheDocument();
  });

  it('renders analytics data after loading', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
    });

    // Check key metrics
    expect(screen.getByText('18K')).toBeInTheDocument(); // Total tokens
    expect(screen.getByText('$5.00')).toBeInTheDocument(); // Total cost
    expect(screen.getByText('100')).toBeInTheDocument(); // API requests
    expect(screen.getByText('600')).toBeInTheDocument(); // Avg daily tokens

    // Check charts are rendered
    expect(screen.getByTestId('area-chart')).toBeInTheDocument(); // Usage trends
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument(); // Cost by provider
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument(); // Token usage by model
    expect(screen.getByTestId('line-chart')).toBeInTheDocument(); // Daily cost trends
  });

  it('handles time range changes', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
    });

    // Click on 7 Days button
    const sevenDaysButton = screen.getByText('7 Days');
    fireEvent.click(sevenDaysButton);

    await waitFor(() => {
      expect(analyticsApi.getOverview).toHaveBeenCalledWith({ days: 7 });
      expect(analyticsApi.getCostBreakdown).toHaveBeenCalledWith({ days: 7 });
      expect(analyticsApi.getUsageTrends).toHaveBeenCalledWith({ days: 7 });
      expect(analyticsApi.getConversationUsage).toHaveBeenCalledWith({ days: 7 });
    });
  });

  it('handles export data functionality', async () => {
    vi.mocked(analyticsApi.downloadUsageData).mockResolvedValue();

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
    });

    // Click export button
    const exportButton = screen.getByText('Export CSV');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(analyticsApi.downloadUsageData).toHaveBeenCalledWith({ days: 30 });
    });
  });

  it('renders conversation usage table', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
    });

    // Check conversation table
    expect(screen.getByText('Top Conversations by Usage')).toBeInTheDocument();
    expect(screen.getByText('Test Conversation')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument(); // tokens
    expect(screen.getByText('$0.30')).toBeInTheDocument(); // cost
    expect(screen.getByText('5')).toBeInTheDocument(); // requests
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(analyticsApi.getOverview).mockRejectedValue(new Error('API Error'));

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Analytics')).toBeInTheDocument();
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });

    // Test retry functionality
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    expect(analyticsApi.getOverview).toHaveBeenCalledTimes(2);
  });

  it('handles empty data state', async () => {
    vi.mocked(analyticsApi.getOverview).mockResolvedValue(null as any);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('No analytics data available')).toBeInTheDocument();
    });
  });

  it('formats numbers correctly', async () => {
    const largeNumbersData = {
      ...mockAnalyticsData.overview,
      stats: {
        ...mockAnalyticsData.overview.stats,
        total_tokens: 1500000, // 1.5M
        total_requests: 15000, // 15K
      },
    };

    vi.mocked(analyticsApi.getOverview).mockResolvedValue(largeNumbersData);

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('1.5M')).toBeInTheDocument(); // Formatted large number
      expect(screen.getByText('15K')).toBeInTheDocument(); // Formatted thousands
    });
  });

  it('displays correct time range selection', async () => {
    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
    });

    // Check default selection (30d)
    const thirtyDaysButton = screen.getByText('30 Days');
    expect(thirtyDaysButton).toHaveClass('bg-white'); // Active class

    // Check inactive buttons
    const sevenDaysButton = screen.getByText('7 Days');
    const ninetyDaysButton = screen.getByText('90 Days');
    expect(sevenDaysButton).not.toHaveClass('bg-white');
    expect(ninetyDaysButton).not.toHaveClass('bg-white');
  });
});