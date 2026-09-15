import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type {
  ConnectionId,
  ConnectionObject,
  HttpRequest,
  HttpResponse,
  Respond,
  OnRequest,
  OnNewConnection,
  OnConnectionClosing,
  OnConnectionClosed,
  OnWsUpgrade,
  InteractionFunctions,
  CloseConnection,
  ShutDown,
} from './types';

export type HttpServerParams = {
  config: { port: number };
  onRequest: OnRequest;
  onNewConnection: OnNewConnection;
  onConnectionClosing: OnConnectionClosing;
  onConnectionClosed: OnConnectionClosed;
  onWsUpgrade: OnWsUpgrade;
};

const connBySocket = new WeakMap<import('net').Socket, ConnectionObject>();

export async function start(params: HttpServerParams): Promise<InteractionFunctions> {
  const server = createServer();
  const connections = new Map<ConnectionId, ConnectionObject>();

  const closeConnection: CloseConnection = async (conn) => {
    connections.delete(conn.id);
  };

  const shutDown: ShutDown = async () => {
    for (const [id] of connections) {
      connections.delete(id);
    }
    return new Promise((resolve) => server.close(() => resolve()));
  };

  // ── Track each TCP connection once ──
  server.on('connection', (socket: import('net').Socket) => {
    const connId = randomUUID() as ConnectionId;
    const connection: ConnectionObject = { id: connId };
    connections.set(connId, connection);
    connBySocket.set(socket, connection);
    params.onNewConnection(connection);

    socket.on('close', () => {
      params.onConnectionClosed(connection);
      connections.delete(connId);
    });
  });

  // ── WebSocket upgrade ──
  server.on('upgrade', (req: IncomingMessage, socket: import('net').Socket, head: Buffer) => {
    params.onWsUpgrade(req, socket, head);
  });

  // ── HTTP request (may fire many times per TCP connection) ──
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const connection = connBySocket.get(req.socket) ?? { id: randomUUID() as ConnectionId };

    // Parse body
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      let body: unknown = rawBody;
      const contentType = req.headers['content-type'] ?? '';
      if (contentType.includes('application/json') && rawBody.length > 0) {
        try { body = JSON.parse(rawBody.toString()); }
        catch { body = rawBody.toString(); }
      } else if (rawBody.length > 0) {
        body = rawBody.toString();
      }

      const httpRequest: HttpRequest = {
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers as Record<string, string>,
        body,
      };

      const respond: Respond = async (response: HttpResponse) => {
        res.writeHead(response.status, response.headers as Record<string, string>);
        if (response.body instanceof Readable) {
          response.body.on('error', (err) => {
            res.end(`{"error":"Stream error: ${err.message}"}`);
          });
          response.body.pipe(res);
        } else {
          const responseBody =
            typeof response.body === 'string' || response.body instanceof Buffer
              ? response.body
              : JSON.stringify(response.body);
          res.end(responseBody);
        }
      };

      params.onRequest(connection, req.url ?? '/', httpRequest, respond);
    });
  });

  // ── Start listening ──
  return new Promise((resolve) => {
    server.listen(params.config.port, () => {
      resolve({ closeConnection, shutDown });
    });
  });
}