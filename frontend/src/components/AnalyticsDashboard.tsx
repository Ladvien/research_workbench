import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Download, TrendingUp, DollarSign, MessageSquare, Activity } from 'lucide-react';

import { analyticsApi } from '../services/analyticsApi';
import {
  AnalyticsOverview,
  CostBreakdown,
  UsageTrends,
  ConversationUsage,
  AnalyticsQuery,
} from '../types';

interface AnalyticsDashboardProps {
  className?: string;
}

// Color palette for charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ className = '' }) => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(null);
  const [usageTrends, setUsageTrends] = useState<UsageTrends | null>(null);
  const [conversationUsage, setConversationUsage] = useState<ConversationUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  const fetchData = async (days: number) => {
    try {
      setLoading(true);
      setError(null);

      const query: AnalyticsQuery = { days };

      const [overviewData, costData, trendsData, conversationsData] = await Promise.all([
        analyticsApi.getOverview(query),
        analyticsApi.getCostBreakdown(query),
        analyticsApi.getUsageTrends(query),
        analyticsApi.getConversationUsage(query),
      ]);

      setOverview(overviewData);
      setCostBreakdown(costData);
      setUsageTrends(trendsData);
      setConversationUsage(conversationsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    fetchData(days);
  }, [timeRange]);

  const handleExportData = async () => {
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      await analyticsApi.downloadUsageData({ days });
    } catch (err) {
      setError('Failed to export data');
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-96 ${className}`}>
        <div className="text-center">
          <Activity className="h-12 w-12 animate-spin mx-auto text-blue-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center min-h-96 ${className}`}>
        <div className="text-center text-red-600 dark:text-red-400">
          <p className="text-lg font-semibold mb-2">Error Loading Analytics</p>
          <p>{error}</p>
          <button
            onClick={() => fetchData(timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!overview || !costBreakdown || !usageTrends) {
    return (
      <div className={`flex items-center justify-center min-h-96 ${className}`}>
        <p className="text-gray-600 dark:text-gray-400">No analytics data available</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 p-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Usage Analytics</h1>
        <div className="flex items-center space-x-4">
          {/* Time Range Selector */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>

          {/* Export Button */}
          <button
            onClick={handleExportData}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Tokens"
          value={formatNumber(overview.stats.total_tokens)}
          icon={MessageSquare}
          color="blue"
        />
        <MetricCard
          title="Total Cost"
          value={formatCurrency(overview.stats.total_cost_cents)}
          icon={DollarSign}
          color="green"
        />
        <MetricCard
          title="API Requests"
          value={formatNumber(overview.stats.total_requests)}
          icon={Activity}
          color="purple"
        />
        <MetricCard
          title="Avg Daily Tokens"
          value={formatNumber(usageTrends.average_daily_tokens)}
          icon={TrendingUp}
          color="orange"
        />
      </div>

      {/* Usage Trends Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Usage Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={usageTrends.daily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number) => [formatNumber(value), 'Tokens']}
            />
            <Area
              type="monotone"
              dataKey="total_tokens"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown by Provider */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Cost by Provider</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={costBreakdown.by_provider}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ provider, cost_usd }) => `${provider} (${formatCurrency(cost_usd * 100)})`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="cost_usd"
              >
                {costBreakdown.by_provider.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value * 100)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Token Usage by Model */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Token Usage by Model</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costBreakdown.by_model}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatNumber(value)} />
              <Bar dataKey="total_tokens" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily Cost Trends */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Daily Cost Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={usageTrends.daily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number) => [formatCurrency(value), 'Cost']}
            />
            <Line
              type="monotone"
              dataKey="cost_cents"
              stroke="#10b981"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Conversations */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Top Conversations by Usage</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 text-gray-600 dark:text-gray-400">Conversation</th>
                <th className="pb-2 text-gray-600 dark:text-gray-400">Model</th>
                <th className="pb-2 text-gray-600 dark:text-gray-400">Tokens</th>
                <th className="pb-2 text-gray-600 dark:text-gray-400">Cost</th>
                <th className="pb-2 text-gray-600 dark:text-gray-400">Requests</th>
              </tr>
            </thead>
            <tbody>
              {conversationUsage.slice(0, 10).map((conv) => (
                <tr key={conv.conversation_id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {conv.title || 'Untitled Conversation'}
                    </div>
                  </td>
                  <td className="py-2">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {conv.model}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {formatNumber(conv.total_tokens)}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {formatCurrency(conv.cost_cents)}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {conv.requests}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Metric Card Component
interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, color }) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-400',
    green: 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-400',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900 dark:text-purple-400',
    orange: 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;