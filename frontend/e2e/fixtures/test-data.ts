// Test data fixtures for E2E tests

export const testUsers = {
  default: {
    email: 'test@workbench.com',
    password: 'testpassword123'
  },
  admin: {
    email: 'admin@workbench.com',
    password: 'adminpassword123'
  },
  newUser: {
    email: `test${Date.now()}@workbench.com`,
    password: 'newuserpassword123'
  }
};

export const testMessages = {
  simple: 'Hello, how are you?',
  complex: 'Can you explain the difference between machine learning and artificial intelligence?',
  multiline: 'This is line 1\nThis is line 2\nThis is line 3',
  withCode: 'Here is some code:\n```javascript\nconsole.log("Hello World");\n```',
  withEmojis: 'Testing with emojis: 😀🎉🔥',
  specialChars: 'Testing special chars: !@#$%^&*()[]{}|\\:;",.<>?',
  long: 'A'.repeat(5000),
  empty: ''
};

export const testConversations = [
  {
    title: 'AI and Machine Learning Discussion',
    messages: [
      'What is artificial intelligence?',
      'How does machine learning work?',
      'Explain neural networks'
    ]
  },
  {
    title: 'Science and Technology',
    messages: [
      'Tell me about quantum computing',
      'How does quantum entanglement work?',
      'What are the applications of quantum technology?'
    ]
  },
  {
    title: 'Climate and Environment',
    messages: [
      'Discuss climate change solutions',
      'What are renewable energy sources?',
      'How can we reduce carbon emissions?'
    ]
  }
];

export const testFiles = {
  text: {
    name: 'test.txt',
    content: 'This is a test file for upload testing.',
    type: 'text/plain'
  },
  json: {
    name: 'test.json',
    content: JSON.stringify({ test: 'data', number: 42 }),
    type: 'application/json'
  },
  csv: {
    name: 'test.csv',
    content: 'name,age,city\nJohn,30,New York\nJane,25,Los Angeles',
    type: 'text/csv'
  },
  markdown: {
    name: 'test.md',
    content: '# Test Document\n\nThis is a **test** markdown file.',
    type: 'text/markdown'
  },
  large: {
    name: 'large-file.txt',
    content: 'Large file content\n'.repeat(50000), // ~1MB
    type: 'text/plain'
  },
  oversized: {
    name: 'oversized.txt',
    content: 'A'.repeat(11 * 1024 * 1024), // 11MB - exceeds 10MB limit
    type: 'text/plain'
  },
  invalidType: {
    name: 'malicious.exe',
    content: 'fake executable content',
    type: 'application/x-msdownload'
  }
};

export const testAnalytics = {
  mockOverview: {
    stats: {
      total_tokens: 150000,
      total_cost_cents: 15000,
      total_requests: 2500
    },
    period: '30d'
  },
  mockUsageTrends: {
    daily: [
      { date: '2024-01-01', total_tokens: 5000, cost_cents: 500 },
      { date: '2024-01-02', total_tokens: 7500, cost_cents: 750 },
      { date: '2024-01-03', total_tokens: 6000, cost_cents: 600 }
    ],
    average_daily_tokens: 6167
  },
  mockCostBreakdown: {
    by_provider: [
      { provider: 'OpenAI', cost_usd: 100.50 },
      { provider: 'Anthropic', cost_usd: 49.50 }
    ],
    by_model: [
      { model: 'gpt-4', total_tokens: 50000 },
      { model: 'claude-3', total_tokens: 100000 }
    ]
  }
};

export const testSearchQueries = {
  simple: 'artificial intelligence',
  complex: 'machine learning algorithms neural networks',
  quoted: '"quantum computing"',
  boolean: 'artificial AND intelligence',
  special: 'test "quoted text" & special * chars',
  emoji: 'test emoji 🔍',
  unicode: 'test unicode ñáéíóú',
  empty: '',
  long: 'a'.repeat(1000),
  noResults: 'nonexistent query that should return no results xyz123'
};

export const testBranching = {
  scenarios: [
    {
      name: 'Simple Branch',
      original: 'What is AI?',
      edit: 'What is machine learning?'
    },
    {
      name: 'Multiple Branches',
      original: 'Tell me about programming',
      edits: [
        'Tell me about Python programming',
        'Tell me about JavaScript programming',
        'Tell me about machine learning programming'
      ]
    },
    {
      name: 'Nested Branching',
      steps: [
        { action: 'send', content: 'Initial message' },
        { action: 'edit', index: 0, content: 'First branch' },
        { action: 'send', content: 'Follow-up to first branch' },
        { action: 'edit', index: 1, content: 'Nested branch' }
      ]
    }
  ]
};

export const testErrorScenarios = {
  networkErrors: [
    { status: 500, message: 'Internal Server Error' },
    { status: 429, message: 'Rate limit exceeded' },
    { status: 403, message: 'Forbidden' },
    { status: 404, message: 'Not Found' }
  ],
  timeouts: {
    short: 1000,
    medium: 5000,
    long: 30000
  },
  offline: {
    simulation: true,
    duration: 5000
  }
};

export const testViewports = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 },
  ultrawide: { width: 3440, height: 1440 }
};
