import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Routes placeholder
app.get('/s/:shopCode', (_req, res) => {
  res.send('<h1>PrintNath Shop</h1><p>Shop landing page coming soon</p>');
});

// HTTP server
const httpServer = createServer(app);

// WebSocket server (gateway connections)
const wss = new WebSocketServer({ server: httpServer, path: '/ws/gateway' });

wss.on('connection', (ws, req) => {
  console.log('Gateway connected:', req.socket.remoteAddress);

  ws.on('message', (data) => {
    console.log('WS message:', data.toString());
  });

  ws.on('close', () => {
    console.log('Gateway disconnected');
  });

  ws.send(JSON.stringify({ type: 'CAPABILITY_QUERY' }));
});

// Start
const PORT = config.port;
httpServer.listen(PORT, () => {
  console.log(`PrintNath server running on port ${PORT}`);
});

export { app, httpServer, wss };