// ===== Domain types =====

export type SessionMode = 'ANONYMOUS' | 'OTP_AUTHENTICATED';

export type GatewayLifecycleState = 'PRE_ACTIVATION' | 'ACTIVATED' | 'OPERATIONAL';

export type PrinterState =
  | 'UNKNOWN' | 'IDLE' | 'PRINTING'
  | 'JAMMED' | 'PAPER_OUT' | 'OFFLINE' | 'ERROR';

export type PrinterType = 'B_W' | 'COLOR' | 'MULTIFUNCTION';

export type PaymentProvider = 'RAZORPAY' | 'PHONEPE';

export type PaymentStatus =
  | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export type DocumentSource =
  | 'WHATSAPP' | 'DIRECT_UPLOAD' | 'API';

export type PageType =
  | 'B_W_A4' | 'COLOR_A4'
  | 'B_W_A3' | 'COLOR_A3';

// ===== Print requirements =====

export interface PrintRequirements {
  pageCount: number;
  color: boolean;
  duplex: boolean;
  copies: number;
  paperSize?: 'A4' | 'A3' | 'A5';
}

// ===== Printer capabilities =====

export interface PrinterCapabilities {
  color: boolean;
  duplex: boolean;
  sizes: string[];
  formats: string[];
}

// ===== Pricing =====

export interface PriceBreakdown {
  totalPaise: number;
  platformFeePaise: number;
  shopEarningsPaise: number;
  items: PriceItem[];
}

export interface PriceItem {
  documentId: string;
  documentName: string;
  pageCount: number;
  pricePaise: number;
}

// ===== WebSocket connection state =====

export type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';