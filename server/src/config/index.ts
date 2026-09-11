import path from 'path';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  s3Endpoint: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  otpExpirySeconds: number;
  sessionExpiryMinutes: number;
}

function envStr(key: string, def: string): string {
  return process.env[key] ?? def;
}

function envInt(key: string, def: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : def;
}

export const config: AppConfig = {
  port: envInt('PORT', 3000),
  databaseUrl: envStr('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/printnath'),
  jwtSecret: envStr('JWT_SECRET', 'dev-secret-change-in-production'),
  s3Endpoint: envStr('S3_ENDPOINT', 'http://localhost:9000'),
  s3Bucket: envStr('S3_BUCKET', 'printnath-docs'),
  s3AccessKey: envStr('S3_ACCESS_KEY', 'minioadmin'),
  s3SecretKey: envStr('S3_SECRET_KEY', 'minioadmin'),
  razorpayKeyId: envStr('RAZORPAY_KEY_ID', ''),
  razorpayKeySecret: envStr('RAZORPAY_KEY_SECRET', ''),
  otpExpirySeconds: envInt('OTP_EXPIRY_SECONDS', 300),
  sessionExpiryMinutes: envInt('SESSION_EXPIRY_MINUTES', 30),
};