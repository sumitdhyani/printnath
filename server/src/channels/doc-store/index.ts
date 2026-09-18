import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { In_Req, Out_Resp } from './types';
import { Methods } from '../../shared/contracts/protocol';

export type DocStoreChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};

export type DocStoreDeps = {
  config: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Optional mock S3 client for testing. Created from config if omitted. */
  s3Client?: S3Client;
};

export async function initDocStore(deps: DocStoreDeps): Promise<DocStoreChannel> {
  const s3 = deps.s3Client ?? new S3Client({
    endpoint: deps.config.endpoint,
    region: deps.config.region,
    credentials: {
      accessKeyId: deps.config.accessKeyId,
      secretAccessKey: deps.config.secretAccessKey,
    },
    forcePathStyle: true, // required for MinIO
  });

  const bucket = deps.config.bucket;

  async function execute(req: In_Req): Promise<Out_Resp> {
    const r = req as any;
    try {
      switch (r.method) {
        // ── Store ──
        case Methods.StoreArtifact: {
          const storageKey = `artifacts/${r.args.jobId}`;
          await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: storageKey,
            Body: r.args.body,
            ContentType: r.args.contentType,
            ContentLength: r.args.contentLength,
          }));
          return { method: Methods.StoreArtifact, ok: true, result: { storageKey } };
        }

        // ── Get Stream ──
        case Methods.GetArtifactStream: {
          const obj = await s3.send(new GetObjectCommand({
            Bucket: bucket,
            Key: r.args.storageKey,
          }));
          return {
            method: Methods.GetArtifactStream,
            ok: true,
            result: {
              stream: obj.Body!,
              contentType: obj.ContentType ?? 'application/octet-stream',
              contentLength: obj.ContentLength ?? undefined,
            },
          };
        }

        // ── Delete ──
        case Methods.DeleteArtifact: {
          await s3.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: r.args.storageKey,
          }));
          return { method: Methods.DeleteArtifact, ok: true, result: {} };
        }

        // ── Exists ──
        case Methods.ArtifactExists: {
          try {
            await s3.send(new HeadObjectCommand({
              Bucket: bucket,
              Key: r.args.storageKey,
            }));
            return { method: Methods.ArtifactExists, ok: true, result: { exists: true } };
          } catch (err: any) {
            if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
              return { method: Methods.ArtifactExists, ok: true, result: { exists: false } };
            }
            throw err;
          }
        }

        default: {
          throw new Error(`Unhandled method: ${(r as any).method}`);
        }
      }
    } catch (err) {
      return { method: r.method, ok: false, error: { reason: err instanceof Error ? err.message : String(err) } };
    }
  }

  return {
    execute,
    stop: async () => { s3.destroy(); },
  };
}
