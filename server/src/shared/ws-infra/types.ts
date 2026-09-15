export type ConnectionId = string;
export type ConnectionObject = { readonly id: ConnectionId };

export type WebSocketMessage =
  | { readonly type: 'text'; readonly data: string }
  | { readonly type: 'binary'; readonly data: Uint8Array };

// connection + URL from the WS upgrade request (contains deviceId, token query params)
export type OnNewConnection = (connection: ConnectionObject, upgradeUrl: string) => void;

export type OnConnectionClosed = (connection: ConnectionObject) => void;

export type PathRegistration = {
  path: string;
  onNewConnection: OnNewConnection;
  onConnectionClosed: OnConnectionClosed;
};