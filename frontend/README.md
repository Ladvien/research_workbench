# Workbench Frontend

React + TypeScript frontend for the Workbench LLM Chat Application.

## Tech Stack

- **React 18+** with TypeScript for type safety
- **Vite** for fast development and building
- **Tailwind CSS** for styling with responsive design
- **assistant-ui** for composable AI chat components
- **Zustand** for state management
- **react-markdown** + **react-syntax-highlighter** for rich content rendering
- **Recharts** for analytics visualizations

## Environment Configuration

The frontend reads configuration from environment variables defined in the parent directory's `.env` file.

### Port Configuration

The development server port is configurable via environment variables:

```bash
# In ../.env file
FRONTEND_PORT=451          # Port to run development server (default: 5173)
FRONTEND_HOST=0.0.0.0      # Host to bind to (default: localhost)
```

### Vite Configuration

The `vite.config.ts` automatically reads these environment variables:

```typescript
// Loads environment variables from parent directory
config({ path: '../.env' })

const frontendPort = parseInt(process.env.FRONTEND_PORT || '5173', 10)
const frontendHost = process.env.FRONTEND_HOST || 'localhost'
```

## Development

### Setup

```bash
# Install dependencies
npm install

# Start development server (uses FRONTEND_PORT from .env)
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Build for production
npm run build

# Preview production build
npm run preview
```

### Running on Different Ports

#### Method 1: Environment Variable (Recommended)
```bash
# Update ../.env
FRONTEND_PORT=3000
FRONTEND_HOST=localhost

# Then start normally
npm run dev
```

#### Method 2: Command Line Override
```bash
FRONTEND_PORT=8000 npm run dev
```

#### Method 3: Multiple Environment Files
```bash
# Create different env files
cp ../.env ../.env.dev
cp ../.env ../.env.staging

# Edit ports in each file, then:
# (Note: You'd need to modify vite.config.ts to support this)
```

## Project Structure

```
src/
├── components/          # React components
│   ├── Chat.tsx        # Main chat interface
│   ├── Message.tsx     # Individual message display
│   ├── ConversationSidebar.tsx  # Conversation management
│   ├── SearchBar.tsx   # Semantic search
│   ├── AnalyticsDashboard.tsx   # Usage analytics
│   └── ...
├── hooks/              # Custom React hooks
│   ├── useConversationStore.ts  # Conversation state management
│   ├── useSearchStore.ts        # Search state management
│   └── ...
├── services/           # API clients
│   ├── api.ts         # Main API client
│   ├── searchApi.ts   # Search API client
│   └── ...
├── types/             # TypeScript type definitions
│   ├── chat.ts       # Chat-related types
│   ├── analytics.ts  # Analytics types
│   └── ...
├── utils/            # Utility functions
└── App.tsx           # Main application component
```

## Key Features

### Chat Interface
- Real-time streaming responses
- Markdown and syntax highlighting
- Message editing and branching
- Conversation management

### State Management
- Zustand for lightweight state management
- Persistent storage for conversations
- Real-time updates across components

### Responsive Design
- Mobile-first approach with Tailwind CSS
- Sidebar that adapts to screen size
- Touch-friendly interface

## Environment Variables Reference

The frontend indirectly uses these environment variables (via the backend API):

- `FRONTEND_PORT` - Development server port (default: 5173, configured as 451)
- `FRONTEND_HOST` - Development server host (default: localhost)

Backend-related variables (used by API calls):
- Backend automatically uses `BIND_ADDRESS` for API endpoints
- All AI provider configurations are handled server-side

## Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run coverage

# Run tests with UI
npm run test:ui
```

Test files are located alongside their corresponding source files with `.test.tsx` or `.spec.tsx` extensions.

## Building for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

The build output will be in the `dist/` directory.

## Deployment

### Development
The frontend runs on the port specified in `FRONTEND_PORT` (default: 451) and connects to the backend API on the port specified in `BIND_ADDRESS`.

### Production
For production deployment, build the static assets and serve them with a web server (nginx, caddy, etc.) or use the systemd service configuration in the main README.

### Environment Variables in Production
Ensure the production environment has access to the `.env` file or equivalent environment variable configuration.

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :451

# Change port in ../.env
FRONTEND_PORT=3000

# Restart development server
npm run dev
```

### Environment Variables Not Loading
1. Ensure `../.env` file exists in the parent directory
2. Check `vite.config.ts` is correctly loading the env file
3. Restart the development server after environment changes

### Build Issues
1. Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Check TypeScript errors: `npm run type-check`