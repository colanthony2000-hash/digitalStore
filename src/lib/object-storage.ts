import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';

type StorageMethod = 'GET' | 'HEAD' | 'PUT' | 'DELETE';

const LOCAL_PUBLIC_DIR = path.resolve(process.cwd(), 'storage', 'public_uploads');
const LOCAL_PROTECTED_DIR = path.resolve(process.cwd(), 'storage', 'protected_products');
const DEFAULT_URL_TTL_SECONDS = 600;
const MAX_FREE_PLAN_STORAGE_BYTES = 4_000_000_000;
const DEFAULT_STORAGE_CAP_BYTES = MAX_FREE_PLAN_STORAGE_BYTES;

function backend(): 'local' | 'neon' {
  const configured = (process.env.OBJECT_STORAGE_BACKEND || '').trim().toLowerCase();
  if (configured === 'neon') return 'neon';
  if (configured === 'local' && process.env.NODE_ENV !== 'production') return 'local';
  if (!configured && process.env.NODE_ENV !== 'production') return 'local';
  throw new Error('Production requires OBJECT_STORAGE_BACKEND=neon; local disk storage is development-only.');
}

export function isObjectStorageConfigured(): boolean {
  try {
    if (backend() === 'local') return true;
    storageConfig();
    return true;
  } catch {
    return false;
  }
}

export function isNeonObjectStorage(): boolean {
  return backend() === 'neon';
}

function storageConfig() {
  const endpointText = process.env.AWS_ENDPOINT_URL_S3?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_REGION?.trim();
  if (!endpointText || !bucket || !accessKeyId || !secretAccessKey || !region) {
    throw new Error('Neon Object Storage is not fully configured.');
  }
  const endpoint = new URL(endpointText);
  if (endpoint.protocol !== 'https:') throw new Error('Object storage endpoint must use HTTPS.');
  endpoint.search = '';
  endpoint.hash = '';
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodedPath(endpoint: URL, bucket: string, key: string): string {
  const prefix = endpoint.pathname.replace(/\/$/, '');
  const encodedKey = key.split('/').map(awsEncode).join('/');
  return `${prefix}/${awsEncode(bucket)}/${encodedKey}` || '/';
}

function canonicalQuery(entries: Array<[string, string]>): string {
  return entries
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey < bKey ? -1 : aKey > bKey ? 1 : aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function signedRequest(
  method: StorageMethod,
  key: string,
  body?: Buffer,
  contentType?: string
): { url: URL; headers: Record<string, string> } {
  const config = storageConfig();
  const url = new URL(config.endpoint);
  url.pathname = encodedPath(config.endpoint, config.bucket, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = body ? sha256(body) : sha256('');
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = hmac(signingKey(config.secretAccessKey, date, config.region), stringToSign).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, headers };
}

function signedListRequest(continuationToken?: string): { url: URL; headers: Record<string, string> } {
  const config = storageConfig();
  const url = new URL(config.endpoint);
  const endpointPrefix = config.endpoint.pathname.replace(/\/$/, '');
  url.pathname = `${endpointPrefix}/${awsEncode(config.bucket)}`;
  const query: Array<[string, string]> = [
    ['list-type', '2'],
    ['max-keys', '1000'],
  ];
  if (continuationToken) query.push(['continuation-token', continuationToken]);
  const canonicalQueryString = canonicalQuery(query);
  url.search = canonicalQueryString;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256('');
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    'GET',
    url.pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = hmac(
    signingKey(config.secretAccessKey, date, config.region),
    stringToSign
  ).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, headers };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export async function getObjectStorageUsage(): Promise<{ objectCount: number; totalBytes: number }> {
  if (backend() !== 'neon') return { objectCount: 0, totalBytes: 0 };
  let continuationToken: string | undefined;
  let objectCount = 0;
  let totalBytes = 0;
  do {
    const { url, headers } = signedListRequest(continuationToken);
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const responseText = (await response.text()).slice(0, 300);
      throw new Error(`Object storage list failed (${response.status}): ${responseText}`);
    }
    const xml = await response.text();
    for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const sizeText = match[1].match(/<Size>(\d+)<\/Size>/)?.[1];
      if (!sizeText || !Number.isSafeInteger(Number(sizeText))) {
        throw new Error('Object storage returned an invalid object size.');
      }
      objectCount += 1;
      totalBytes += Number(sizeText);
      if (!Number.isSafeInteger(totalBytes)) throw new Error('Object storage usage exceeds the supported limit.');
    }
    const truncated = xml.match(/<IsTruncated>(true|false)<\/IsTruncated>/)?.[1] === 'true';
    const nextToken = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
    if (truncated && !nextToken) throw new Error('Object storage pagination response is incomplete.');
    continuationToken = truncated && nextToken ? decodeXml(nextToken) : undefined;
  } while (continuationToken);
  return { objectCount, totalBytes };
}

function configuredStorageCapBytes(): number {
  const raw = process.env.OBJECT_STORAGE_MAX_BYTES?.trim();
  const value = raw ? Number(raw) : DEFAULT_STORAGE_CAP_BYTES;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_FREE_PLAN_STORAGE_BYTES) {
    throw new Error(`OBJECT_STORAGE_MAX_BYTES must be an integer between 1 and ${MAX_FREE_PLAN_STORAGE_BYTES}.`);
  }
  return value;
}

export async function assertObjectStorageCapacity(incomingBytes: number): Promise<void> {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) {
    throw new Error('Invalid object size for storage capacity check.');
  }
  if (backend() !== 'neon') return;
  const maximum = configuredStorageCapBytes();
  const usage = await getObjectStorageUsage();
  if (usage.totalBytes + incomingBytes > maximum) {
    throw new Error('Free storage safety cap reached. Remove unused uploads before adding more files.');
  }
}

export function objectKeyForUpload(kind: 'public' | 'protected', filename: string): string {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName || safeName === '.' || safeName === '..') throw new Error('Invalid object filename.');
  return `${kind}/${safeName}`;
}

export function objectKeyFromProductPath(filePath: string): string {
  return objectKeyForUpload('protected', path.basename(filePath));
}

function localPath(key: string): string {
  const [kind, ...parts] = key.split('/');
  const base = kind === 'public' ? LOCAL_PUBLIC_DIR : kind === 'protected' ? LOCAL_PROTECTED_DIR : null;
  if (!base || parts.length !== 1 || !parts[0]) throw new Error('Invalid object key.');
  const target = path.resolve(base, parts[0]);
  if (!target.startsWith(base + path.sep)) throw new Error('Invalid object key.');
  return target;
}

async function requestObject(method: StorageMethod, key: string, body?: Buffer, contentType?: string): Promise<Response> {
  const { url, headers } = signedRequest(method, key, body, contentType);
  const response = await fetch(url, {
    method,
    headers,
    ...(method === 'PUT' && body ? { body: Uint8Array.from(body) } : {}),
    signal: AbortSignal.timeout(120000),
  });
  if (
    !response.ok &&
    !(method === 'DELETE' && response.status === 404) &&
    !(method === 'HEAD' && response.status === 404)
  ) {
    const responseText = (await response.text()).slice(0, 300);
    throw new Error(`Object storage ${method} failed (${response.status}): ${responseText}`);
  }
  return response;
}

export async function putObject(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
  if (backend() === 'local') {
    const target = localPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body, { flag: 'wx' });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('jeneconk.digitalstore.object-storage-capacity'), 1)`);
    await assertObjectStorageCapacity(body.length);
    await requestObject('PUT', key, body, contentType);
  });
}

export async function objectExists(key: string): Promise<boolean> {
  if (backend() === 'local') {
    try {
      return (await fs.stat(localPath(key))).isFile();
    } catch {
      return false;
    }
  }
  const response = await requestObject('HEAD', key);
  return response.ok;
}

export async function deleteObject(key: string): Promise<void> {
  if (backend() === 'local') {
    await fs.rm(localPath(key), { force: true });
    return;
  }
  await requestObject('DELETE', key);
}

export async function getObject(key: string): Promise<Response> {
  if (backend() !== 'neon') throw new Error('Remote object reads require Neon Object Storage.');
  return requestObject('GET', key);
}

export async function signedObjectUrl(
  key: string,
  options: { method?: 'GET' | 'PUT'; expiresIn?: number; responseContentDisposition?: string } = {}
): Promise<string> {
  if (backend() !== 'neon') {
    throw new Error('Signed object URLs require Neon Object Storage.');
  }
  const config = storageConfig();
  const method = options.method || 'GET';
  const expires = Math.max(1, Math.min(options.expiresIn || DEFAULT_URL_TTL_SECONDS, 604800));
  const url = new URL(config.endpoint);
  url.pathname = encodedPath(config.endpoint, config.bucket, key);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const params: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (options.responseContentDisposition) {
    params.push(['response-content-disposition', options.responseContentDisposition]);
  }
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery(params),
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = hmac(signingKey(config.secretAccessKey, date, config.region), stringToSign).toString('hex');
  params.push(['X-Amz-Signature', signature]);
  url.search = canonicalQuery(params);
  return url.toString();
}

export async function localObjectPath(key: string): Promise<string> {
  return localPath(key);
}
