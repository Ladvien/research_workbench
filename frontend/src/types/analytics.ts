export interface UsageStats {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_cents: number;
  total_requests: number;
}

export interface ModelUsage {
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_cents: number;
  requests: number;
}

export interface DailyUsage {
  date: string; // ISO date string
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_cents: number;
  requests: number;
}

export interface ConversationUsage {
  conversation_id: string;
  title?: string;
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_cents: number;
  requests: number;
}

export interface AnalyticsOverview {
  stats: UsageStats;
  cost_breakdown: ModelUsage[];
  recent_usage: DailyUsage[];
}

export interface CostBreakdown {
  by_model: ModelUsage[];
  by_provider: ProviderUsage[];
  total_cost_usd: number;
}

export interface ProviderUsage {
  provider: string;
  models: string[];
  total_tokens: number;
  cost_cents: number;
  cost_usd: number;
  requests: number;
}

export interface UsageTrends {
  daily: DailyUsage[];
  total_days: number;
  average_daily_tokens: number;
  average_daily_cost_cents: number;
}

export interface AnalyticsQuery {
  start_date?: number; // Unix timestamp
  end_date?: number;
  days?: number;
  limit?: number;
  conversation_id?: string;
}