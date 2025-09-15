const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4510;

// Proxy API requests to backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:4512',
  changeOrigin: true,
  logLevel: 'debug'
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on http://0.0.0.0:${PORT}`);
  console.log(`Proxying /api/* to http://localhost:4512`);
});