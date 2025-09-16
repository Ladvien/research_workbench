import { AnalyticsOverview, CostBreakdown, UsageTrends, ConversationUsage, AnalyticsQuery } from '../types';

const API_BASE_URL = '/api';

// Helper function to build query string
const buildQueryString = (params: Record<string, any>): string => {
  const validParams = Object.entries(params).filter(([_, value]) => value != null);
  if (validParams.length === 0) return '';

  const searchParams = new URLSearchParams();
  validParams.forEach(([key, value]) => {
    searchParams.append(key, String(value));
  });

  return `?${searchParams.toString()}`;
};

// Helper function for authenticated requests
const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Include cookies for authentication
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response;
};

export const analyticsApi = {
  /**
   * Get analytics overview with stats, cost breakdown, and recent usage
   */
  async getOverview(query: AnalyticsQuery = {}): Promise<AnalyticsOverview> {
    const queryString = buildQueryString(query);
    const response = await authFetch(`${API_BASE_URL}/analytics/overview${queryString}`);
    return response.json();
  },

  /**
   * Get detailed cost breakdown by provider and model
   */
  async getCostBreakdown(query: AnalyticsQuery = {}): Promise<CostBreakdown> {
    const queryString = buildQueryString(query);
    const response = await authFetch(`${API_BASE_URL}/analytics/cost-breakdown${queryString}`);
    return response.json();
  },

  /**
   * Get usage trends over time
   */
  async getUsageTrends(query: AnalyticsQuery = {}): Promise<UsageTrends> {
    const queryString = buildQueryString(query);
    const response = await authFetch(`${API_BASE_URL}/analytics/usage-trends${queryString}`);
    return response.json();
  },

  /**
   * Get per-conversation usage statistics
   */
  async getConversationUsage(query: AnalyticsQuery = {}): Promise<ConversationUsage[]> {
    const queryString = buildQueryString(query);
    const response = await authFetch(`${API_BASE_URL}/analytics/conversations${queryString}`);
    return response.json();
  },

  /**
   * Export usage data as CSV
   */
  async exportUsageData(query: AnalyticsQuery = {}): Promise<Blob> {
    const queryString = buildQueryString(query);
    const response = await authFetch(`${API_BASE_URL}/analytics/export${queryString}`, {
      headers: {
        'Accept': 'text/csv',
      },
    });
    return response.blob();
  },

  /**
   * Download CSV export
   */
  async downloadUsageData(query: AnalyticsQuery = {}, filename?: string): Promise<void> {
    const blob = await this.exportUsageData(query);

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `usage_export_${new Date().toISOString().split('T')[0]}.csv`;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Check analytics service health
   */
  async healthCheck(): Promise<{ service: string; status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE_URL}/analytics/health`);
    return response.json();
  },
};

export default analyticsApi;