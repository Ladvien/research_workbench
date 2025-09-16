import React, { useEffect, useState } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';
import { Model, Provider } from '../types';
import { useConversationStore } from '../hooks/useConversationStore';

interface ModelSelectorProps {
  disabled?: boolean;
  className?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  disabled = false,
  className = '',
}) => {
  const { selectedModel, setSelectedModel } = useConversationStore();
  const [models, setModels] = useState<Model[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);

        // Log current selected model from store
        console.log('[ModelSelector] Current selected model from store:', selectedModel);

        // Also check localStorage directly
        const storedData = localStorage.getItem('workbench-conversation-store');
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            console.log('[ModelSelector] LocalStorage state:', parsed);
          } catch (e) {
            console.error('[ModelSelector] Failed to parse localStorage:', e);
          }
        }

        const response = await fetch('/api/models');

        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
        }

        const data = await response.json();
        setModels(data.models || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching models:', err);
        setError(err instanceof Error ? err.message : 'Failed to load models');
        // Set fallback models if API fails
        setModels([
          {
            id: 'gpt-4',
            name: 'GPT-4',
            provider: 'open_a_i',
            max_tokens: 4096,
            supports_streaming: true,
            cost_per_token: 0.03,
          },
          {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            provider: 'open_a_i',
            max_tokens: 4096,
            supports_streaming: true,
            cost_per_token: 0.002,
          },
          {
            id: 'claude-3-sonnet-20240229',
            name: 'Claude 3 Sonnet',
            provider: 'anthropic',
            max_tokens: 4096,
            supports_streaming: true,
            cost_per_token: 0.015,
          },
          {
            id: 'claude-code-sonnet',
            name: 'Claude 3.5 Sonnet (via Claude Code)',
            provider: 'claude_code',
            max_tokens: 8192,
            supports_streaming: true,
            cost_per_token: undefined,
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  const selectedModelInfo = models.find(model => model.id === selectedModel);

  const getProviderColor = (provider: Provider) => {
    switch (provider) {
      case 'open_a_i':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'anthropic':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'claude_code':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getProviderBadge = (provider: Provider) => {
    switch (provider) {
      case 'open_a_i':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'claude_code':
        return 'Claude Code';
      default:
        return provider;
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 p-2 bg-gray-50 rounded-lg ${className}`}>
        <Cpu className="h-4 w-4 animate-pulse text-gray-400" />
        <span className="text-sm text-gray-500">Loading models...</span>
      </div>
    );
  }

  if (error && models.length === 0) {
    return (
      <div className={`flex items-center gap-2 p-2 bg-red-50 rounded-lg ${className}`}>
        <Cpu className="h-4 w-4 text-red-400" />
        <span className="text-sm text-red-600">Failed to load models</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        className={`
          flex items-center justify-between w-full px-3 py-2 text-left
          bg-white border border-gray-300 rounded-lg shadow-sm
          hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Cpu className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            {selectedModelInfo ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  {selectedModelInfo.name}
                </span>
                <span className={`
                  px-1.5 py-0.5 text-xs rounded-full border flex-shrink-0
                  ${getProviderColor(selectedModelInfo.provider)}
                `}>
                  {getProviderBadge(selectedModelInfo.provider)}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-500">Select a model</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Click outside to close overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`
                w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2
                ${selectedModel === model.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
              `}
              onClick={() => {
                console.log('[ModelSelector] User selected model:', {
                  modelId: model.id,
                  modelName: model.name,
                  provider: model.provider,
                  previousModel: selectedModel
                });
                setSelectedModel(model.id);
                setIsOpen(false);
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate">
                    {model.name}
                  </span>
                  <span className={`
                    px-1.5 py-0.5 text-xs rounded-full border flex-shrink-0
                    ${getProviderColor(model.provider)}
                  `}>
                    {getProviderBadge(model.provider)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{model.max_tokens.toLocaleString()} tokens</span>
                  {model.cost_per_token ? (
                    <span>${model.cost_per_token.toFixed(4)}/1k tokens</span>
                  ) : (
                    <span className="text-purple-600">Subscription</span>
                  )}
                  {model.supports_streaming && (
                    <span className="text-green-600">Streaming</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        </>
      )}

      {error && (
        <div className="mt-1 text-xs text-amber-600">
          Warning: Using fallback models due to API error
        </div>
      )}
    </div>
  );
};

export default ModelSelector;