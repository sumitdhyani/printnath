import { Readable } from 'stream';

export type ConnectionId = string;
export type ConnectionObject = { readonly id: ConnectionId };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type HttpHeaders = Record<string, string>;

export type HttpRequest = {
  readonly method: string;
  readonly url: string;
  readonly headers: HttpHeaders;
  readonly body: unknown;
};

export type HttpResponse = {
  readonly status: number;
  readonly headers: HttpHeaders;
  readonly body: string | Buffer | Readable;
};

// Functions provided by the init method
export type CloseConnection = (connectionObject: ConnectionObject) => Promise<void>;
export type ShutDown        = () => Promise<void>

export type InteractionFunctions = {
    closeConnection: CloseConnection,
    shutDown: ShutDown
};

export type Respond = (response: HttpResponse) => Promise<void>;

// Callbacks to be passed by the application
export type OnRequest = (
  connection: ConnectionObject,
  path: string,
  request: HttpRequest,
  respond: Respond
) => void;

export type OnNewConnection = (
    connectionObject: ConnectionObject
) => void

// Called when the connection is closed gracefully from server side
export type OnConnectionClosing = (
    connectionObject: ConnectionObject,
    reason: string
) => void

// Called when the connection is abruptly closed dues to factors outside
// application like internet down, client disconnected etc
export type OnConnectionClosed = (
    connectionObject: ConnectionObject
) => void

// WebSocket upgrade — called when HTTP client requests WS upgrade.
// Channel passes this from ws-infra, http-infra calls it internally.
// Channel never touches the raw socket or http.Server.
export type OnWsUpgrade = (
  req: import('http').IncomingMessage,
  socket: import('net').Socket,
  head: Buffer
) => void;