import { randomUUID } from 'crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { OnWsUpgrade } from '../http-infra/types';
import type {
  ConnectionId,
  ConnectionObject,
  WebSocketMessage,
  OnNewConnection,
  OnConnectionClosed,
} from './types';

export type WsServerParams = {
  path: string;
  onNewConnection: OnNewConnection;
  onConnectionClosed: OnConnectionClosed;
  onMessage: (connection: ConnectionObject, message: WebSocketMessage) => void;
};

export type WsInteractionFunctions = {
  onWsUpgrade: OnWsUpgrade;
  closeConnection: (connection: ConnectionObject) => Promise<void>;
  shutdown: () => Promise<void>;
};

export function start(params: WsServerParams): WsInteractionFunctions {
  const wss = new WebSocketServer({ noServer: true });
  const connections = new Map<ConnectionId, { conn: ConnectionObject; ws: WebSocket }>();

  // ── Handle upgrade from HTTP → WS ──
  const onWsUpgrade: OnWsUpgrade = (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const connId = randomUUID() as ConnectionId;
      const connection: ConnectionObject = { id: connId };
      connections.set(connId, { conn: connection, ws });
      params.onNewConnection(connection);

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        const msg: WebSocketMessage = isBinary
          ? { type: 'binary', data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
          : { type: 'text', data: data.toString('utf-8') };
        params.onMessage(connection, msg);
      });

      ws.on('close', () => {
        params.onConnectionClosed(connection);
        connections.delete(connId);
      });

      ws.on('error', (err) => {
        console.error(`WS error on ${connId}:`, err.message);
      });
    });
  };

  // ── Close a specific connection ──
  const closeConnection = async (connection: ConnectionObject): Promise<void> => {
    const entry = connections.get(connection.id);
    if (entry) {
      entry.ws.close();
      connections.delete(connection.id);
    }
  };

  // ── Shutdown all connections ──
  const shutdown = async (): Promise<void> => {
    for (const [, entry] of connections) {
      entry.ws.close();
    }
    connections.clear();
    wss.close();
  };

  return { onWsUpgrade, closeConnection, shutdown };
}