import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable, PassThrough } from 'node:stream';
import { initDocStore, type DocStoreChannel, type DocStoreDeps } from '../../server/src/channels/doc-store/index';
import { Methods } from '../../server/src/channels/doc-store/types';
import { S3Client } from '@aws-sdk/client-s3';
import { Contract } from '../../server/src/shared/contracts/protocol';

// ── Helpers ──

const TEST_BUCKET = 'printnath-test';
const TEST_JOB_ID = 'job-123';
const TEST_STORAGE_KEY = `artifacts/${TEST_JOB_ID}`;

function createMockS3(): { client: S3Client; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  const client = { send, destroy: vi.fn() } as unknown as S3Client;
  return { client, send };
}

function makeChannel(mockS3: S3Client): Promise<DocStoreChannel> {
  return initDocStore({
    config: {
      endpoint: 'http://localhost:9000',
      bucket: TEST_BUCKET,
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    s3Client: mockS3,
  });
}

// ── Tests ──

describe('DocStore channel', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let channel: DocStoreChannel;

  beforeEach(async () => {
    const { client, send } = createMockS3();
    mockSend = send;
    channel = await makeChannel(client);
  });

  afterEach(async () => {
    await channel.stop();
  });

  // ══════════════════════════════════════════════════════════════
  // StoreArtifact
  // ══════════════════════════════════════════════════════════════

  describe('StoreArtifact', () => {
    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(StoreArtifact)              │
     *   │ { jobId, body, contentType,         │
     *   │   contentLength }                   │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  PutObjectCommand                  │
     *   │  { Bucket, Key, Body,              │
     *   │    ContentType, ContentLength }     │
     *   │                                    │
     *   │ ← { ok: true,                     │
     *   │     data: { storageKey } }          │
     *   │←───────────────────────────────────│
     */
    test('uploads stream and returns storageKey', async () => {
      const body = Readable.from([Buffer.from('print-ready-content')]);
      mockSend.mockResolvedValueOnce({});

      const result = await channel.execute({
        method: Methods.StoreArtifact,
        args: { jobId: TEST_JOB_ID, body, contentType: 'application/pdf', contentLength: 19 },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.storageKey).toBe(TEST_STORAGE_KEY);

      // Verify PutObjectCommand was called with correct params
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.constructor.name).toBe('PutObjectCommand');
      expect(command.input.Bucket).toBe(TEST_BUCKET);
      expect(command.input.Key).toBe(TEST_STORAGE_KEY);
      expect(command.input.ContentType).toBe('application/pdf');
      expect(command.input.ContentLength).toBe(19);
    });

    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(StoreArtifact)              │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  S3 put fails                       │
     *   │                                    │
     *   │ ← { ok: false,                     │
     *   │     error: "..." }                  │
     *   │←───────────────────────────────────│
     */
    test('S3 failure returns error', async () => {
      const body = Readable.from([Buffer.from('content')]);
      mockSend.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await channel.execute({
        method: Methods.StoreArtifact,
        args: { jobId: TEST_JOB_ID, body, contentType: 'text/plain', contentLength: 7 },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('Connection refused');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // GetArtifactStream
  // ══════════════════════════════════════════════════════════════

  describe('GetArtifactStream', () => {
    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(GetArtifactStream)          │
     *   │ { storageKey }                      │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  GetObjectCommand                  │
     *   │  { Bucket, Key }                   │
     *   │                                    │
     *   │  ← Body, ContentType, ContentLength│
     *   │                                    │
     *   │ ← { ok: true,                     │
     *   │     data: { stream, contentType,   │
     *   │            contentLength } }        │
     *   │←───────────────────────────────────│
     */
    test('returns stream with metadata', async () => {
      const fakeStream = Readable.from([Buffer.from('pdf-bytes')]);
      mockSend.mockResolvedValueOnce({
        Body: fakeStream,
        ContentType: 'application/pdf',
        ContentLength: 8,
      });

      const result = await channel.execute({
        method: Methods.GetArtifactStream,
        args: { storageKey: TEST_STORAGE_KEY },
      });

      expect(result.ok).toBe(true);
      //const res = result as Contract[typeof Methods.GetArtifactStream][""]; 
      expect(result.data.stream).toBe(fakeStream);
      expect(result.data.contentType).toBe('application/pdf');
      expect(result.data.contentLength).toBe(8);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.constructor.name).toBe('GetObjectCommand');
      expect(command.input.Bucket).toBe(TEST_BUCKET);
      expect(command.input.Key).toBe(TEST_STORAGE_KEY);
    });

    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(GetArtifactStream)          │
     *   │ { storageKey: "nonexistent" }       │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  S3 returns 404                     │
     *   │                                    │
     *   │ ← { ok: false, error: "..." }      │
     *   │←───────────────────────────────────│
     */
    test('missing artifact returns error', async () => {
      const err = new Error('NoSuchKey');
      (err as any).name = 'NoSuchKey';
      mockSend.mockRejectedValueOnce(err);

      const result = await channel.execute({
        method: Methods.GetArtifactStream,
        args: { storageKey: 'nonexistent' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('NoSuchKey');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // DeleteArtifact
  // ══════════════════════════════════════════════════════════════

  describe('DeleteArtifact', () => {
    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(DeleteArtifact)             │
     *   │ { storageKey }                      │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  DeleteObjectCommand               │
     *   │  { Bucket, Key }                   │
     *   │                                    │
     *   │ ← { ok: true, data: {} }            │
     *   │←───────────────────────────────────│
     */
    test('deletes artifact and returns ok', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await channel.execute({
        method: Methods.DeleteArtifact,
        args: { storageKey: TEST_STORAGE_KEY },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({});

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.constructor.name).toBe('DeleteObjectCommand');
      expect(command.input.Bucket).toBe(TEST_BUCKET);
      expect(command.input.Key).toBe(TEST_STORAGE_KEY);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // ArtifactExists
  // ══════════════════════════════════════════════════════════════

  describe('ArtifactExists', () => {
    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(ArtifactExists)             │
     *   │ { storageKey }                      │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  HeadObjectCommand                 │
     *   │  { Bucket, Key }                   │
     *   │  ← success                         │
     *   │                                    │
     *   │ ← { ok: true,                     │
     *   │     data: { exists: true } }        │
     *   │←───────────────────────────────────│
     */
    test('returns exists:true when S3 has the key', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await channel.execute({
        method: Methods.ArtifactExists,
        args: { storageKey: TEST_STORAGE_KEY },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.exists).toBe(true);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.constructor.name).toBe('HeadObjectCommand');
      expect(command.input.Bucket).toBe(TEST_BUCKET);
      expect(command.input.Key).toBe(TEST_STORAGE_KEY);
    });

    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(ArtifactExists)             │
     *   │ { storageKey }                      │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  HeadObjectCommand                 │
     *   │  ← NotFound (404)                   │
     *   │                                    │
     *   │ ← { ok: true,                     │
     *   │     data: { exists: false } }       │
     *   │←───────────────────────────────────│
     */
    test('returns exists:false when S3 returns 404', async () => {
      const err = new Error('Not Found');
      (err as any).name = 'NotFound';
      mockSend.mockRejectedValueOnce(err);

      const result = await channel.execute({
        method: Methods.ArtifactExists,
        args: { storageKey: 'nonexistent' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.exists).toBe(false);
    });

    /*
     * Router                          Doc-Store Channel
     *   │                                    │
     *   │ execute(ArtifactExists)             │
     *   │ { storageKey }                      │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  HeadObjectCommand                 │
     *   │  ← Forbidden (403) — unexpected     │
     *   │                                    │
     *   │ ← { ok: false, error: "..." }      │
     *   │←───────────────────────────────────│
     */
    test('non-404 errors are propagated', async () => {
      mockSend.mockRejectedValueOnce(new Error('Forbidden'));

      const result = await channel.execute({
        method: Methods.ArtifactExists,
        args: { storageKey: TEST_STORAGE_KEY },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('Forbidden');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Unhandled method
  // ══════════════════════════════════════════════════════════════

  describe('unhandled method', () => {
    test('returns error for unknown method', async () => {
      const result = await channel.execute({
        method: 'unknownMethod' as any,
        args: {},
      } as any);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('Unhandled');
    });
  });
});