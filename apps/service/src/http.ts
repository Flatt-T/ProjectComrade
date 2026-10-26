// A very small HTTP layer: route table, JSON bodies, cookies, rate limits and errors.
//
// The service deliberately has no web framework. These few helpers are all the API needs,
// and they keep every handler down to the shape `(ctx) => payload`.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { cookieSecure } from './config.js';
import { log } from './ops.js';

export const BODY_LIMIT = 64 * 1024;
/** Avatar uploads are the only large body the API accepts. */
export const UPLOAD_LIMIT = 512 * 1024;

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}
export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const unauthorised = (message = 'Sign in to continue') => new HttpError(401, message);
export const forbidden = (message = 'Not available on your tier') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message: string, code?: string) => new HttpError(409, message, code);
export const unavailable = (message = 'Not configured') => new HttpError(503, message);

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  cookies: Record<string, string>;
  /** Parsed JSON body, read at most once. */
  body<T = Record<string, unknown>>(limit?: number): Promise<T>;
  /** Exact bytes as received — required for Stripe signature verification. */
  raw(limit?: number): Promise<Buffer>;
  /** Stable, non-reversible caller key for rate limiting; never logged. */
  callerKey(): string;
  setCookie(name: string, value: string, options?: CookieOptions): void;
  clearCookie(name: string): void;
  /** Set when a handler wants to control the response itself. */
  handled: boolean;
}

export interface CookieOptions { maxAge?: number; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; path?: string }

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
interface Route { method: string; segments: string[]; handler: Handler; raw?: boolean }

const routes: Route[] = [];

/** Register a route. `:name` segments become `ctx.params.name`. */
export function route(method: string, path: string, handler: Handler) {
  routes.push({ method, segments: path.split('/').filter(Boolean), handler });
}
export const get = (path: string, handler: Handler) => route('GET', path, handler);
export const post = (path: string, handler: Handler) => route('POST', path, handler);
export const put = (path: string, handler: Handler) => route('PUT', path, handler);
export const patch = (path: string, handler: Handler) => route('PATCH', path, handler);
export const del = (path: string, handler: Handler) => route('DELETE', path, handler);

function match(method: string, pathname: string): { route: Route; params: Record<string, string> } | undefined {
  const parts = pathname.split('/').filter(Boolean);
  for (const candidate of routes) {
    if (candidate.method !== method || candidate.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const segment = candidate.segments[i];
      if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(parts[i]);
      else if (segment !== parts[i]) { ok = false; break; }
    }
    if (ok) return { route: candidate, params };
  }
  return undefined;
}

export function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readRaw(req: IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name && rest.length) { try { out[name] = decodeURIComponent(rest.join('=')); } catch { /* skip */ } }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const buckets = new Map<string, number[]>();

/**
 * Allow `max` calls per `windowMs` for this caller and bucket. The caller key is a hash of
 * the forwarded address, so no IP address is ever stored or logged.
 */
export function limit(ctx: Ctx, bucket: string, max: number, windowMs: number) {
  const key = `${bucket}:${ctx.callerKey()}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    log('rate-limited', { bucket });
    throw new HttpError(429, 'Too many attempts — try again shortly');
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 20_000) for (const [k, times] of buckets) if (!times.some(t => now - t < windowMs)) buckets.delete(k);
}

/** Constant-time comparison for secrets passed in headers. */
export function secretEquals(given: string, want: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function randomToken(bytes = 16): string { return randomBytes(bytes).toString('base64url'); }

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function context(req: IncomingMessage, res: ServerResponse, url: URL, params: Record<string, string>): Ctx {
  let raw: Promise<Buffer> | undefined;
  const ctx: Ctx = {
    req, res, url, params, handled: false,
    cookies: parseCookies(req.headers.cookie),
    raw(bodyLimit = BODY_LIMIT) { raw ??= readRaw(req, bodyLimit); return raw; },
    async body<T>(bodyLimit = BODY_LIMIT): Promise<T> {
      const text = (await ctx.raw(bodyLimit)).toString('utf8');
      if (!text) return {} as T;
      try { return JSON.parse(text) as T; } catch { throw badRequest('Invalid JSON body'); }
    },
    callerKey() {
      const forwarded = String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
      return createHash('sha256').update(forwarded || req.socket.remoteAddress || 'unknown').digest('hex').slice(0, 24);
    },
    setCookie(name, value, options = {}) {
      const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`,
        `SameSite=${options.sameSite ?? 'Lax'}`];
      if (options.httpOnly !== false) parts.push('HttpOnly');
      if (cookieSecure()) parts.push('Secure');
      if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
      const existing = res.getHeader('Set-Cookie');
      const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
      res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
    },
    clearCookie(name) { ctx.setCookie(name, '', { maxAge: 0 }); },
  };
  return ctx;
}

/** Dispatch an /api request. Returns false when no route matches. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const found = match(req.method ?? 'GET', url.pathname);
  if (!found) return false;
  const ctx = context(req, res, url, found.params);
  try {
    const payload = await found.route.handler(ctx);
    if (ctx.handled || res.writableEnded) return true;
    if (payload === undefined) json(res, 204, {});
    else json(res, 200, payload);
  } catch (error) {
    if (error instanceof HttpError) {
      // Client mistakes are not operational events, and nor is 503: that is a deployment
      // saying a feature is not configured, which is a normal state, not a fault.
      if (error.status >= 500 && error.status !== 503) {
        log('api-error', { path: url.pathname, status: error.status, message: error.message.slice(0, 200) });
      }
      json(res, error.status, { error: error.message, code: error.code });
    } else {
      log('api-crash', { path: url.pathname, message: String(error).slice(0, 300) });
      json(res, 500, { error: 'Something went wrong on our side' });
    }
  }
  return true;
}
