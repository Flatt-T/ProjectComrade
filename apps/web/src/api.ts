// The browser's side of the API.
//
// The access token is held in memory only — never in localStorage, where any script on the
// page could read it. The long-lived refresh token lives in an httpOnly cookie the page
// cannot touch, so a reload calls /api/auth/refresh to get a new access token and carries on.
import type {
  AdBreak, ConsentState, Entitlements, HistoryPage, InvoiceSummary, MatchRecord, Me, PackPrice, PlanPrice, PlayDecision,
  PlayKind, PlayerRecord, ProposalPage, ReleaseInfo, SubscriptionState, Tier, TierPlan,
} from '@comrade/contracts';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

let accessToken = '';
let expiresAt = 0;
const tokenListeners = new Set<(token: string) => void>();

export function currentToken(): string { return accessToken; }

/** Tell interested parties (the room socket) that who we are has changed. */
export function onToken(listener: (token: string) => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function setToken(token: string, expiresIn = 0) {
  accessToken = token;
  // Refresh a minute early so a request never goes out with a token about to expire.
  expiresAt = token ? Date.now() + Math.max(0, expiresIn - 60) * 1000 : 0;
  for (const listener of tokenListeners) listener(token);
}

interface Options { method?: string; body?: unknown; raw?: Blob; auth?: boolean; retry?: boolean }

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, raw, auth = true, retry = true } = options;
  if (auth && accessToken && expiresAt && Date.now() > expiresAt) await refresh().catch(() => undefined);
  const headers: Record<string, string> = {};
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (raw) headers['Content-Type'] = raw.type;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    credentials: 'same-origin',
  });

  if (response.status === 401 && auth && retry && accessToken) {
    // The token expired mid-flight: refresh once, then replay the request.
    const refreshed = await refresh().catch(() => false);
    if (refreshed) return request<T>(path, { ...options, retry: false });
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = payload as { error?: string; code?: string };
    throw new ApiError(response.status, error.error || `Request failed (${response.status})`, error.code);
  }
  return payload as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
const patchJson = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body });
const remove = <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body });

export interface SessionResponse { accessToken: string; idToken: string; expiresIn: number; me: Me }

/** Exchange the session cookie for an access token. Resolves false when there is no session. */
export async function refresh(): Promise<boolean> {
  try {
    const session = await request<SessionResponse>('/api/auth/refresh', { method: 'POST', auth: false, retry: false });
    setToken(session.accessToken, session.expiresIn);
    return true;
  } catch {
    // A failed cookie refresh must not wipe a still-valid access token — that is what
    // dumped signed-in commanders onto the login screen while they clicked around.
    if (!accessToken || (expiresAt && Date.now() > expiresAt)) setToken('');
    return false;
  }
}

export interface TierTable {
  tiers: TierPlan[];
  termsVersion: string;
  authEnabled: boolean;
  billingEnabled: boolean;
  /** True once a third-party advertising tag is configured; drives the legal pages' wording. */
  adsConfigured: boolean;
}

export interface MeResponse {
  profile: Me['profile'] | null;
  entitlements: Entitlements;
  consent: ConsentState | null;
  open?: boolean;
}

export const api = {
  tiers: () => get<TierTable>('/api/tiers'),
  me: () => get<MeResponse>('/api/me'),

  handleAvailable: (handle: string) => post<{ available: boolean; reason: string | null }>('/api/auth/handle', { handle }),
  register: (body: { handle: string; email: string; password: string; terms: boolean; personalisedAds: boolean; marketingEmail: boolean }) =>
    post<{ confirmRequired: boolean; handle: string }>('/api/auth/register', body),
  confirm: (email: string, code: string) => post<{ confirmed: boolean }>('/api/auth/confirm', { email, code }),
  resend: (email: string) => post<{ sent: boolean }>('/api/auth/resend', { email }),
  async signIn(email: string, password: string): Promise<Me> {
    const session = await request<SessionResponse>('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setToken(session.accessToken, session.expiresIn);
    return session.me;
  },
  async signOut(): Promise<void> {
    await post('/api/auth/logout').catch(() => undefined);
    setToken('');
  },
  forgot: (email: string) => post<{ sent: boolean }>('/api/auth/forgot', { email }),
  reset: (email: string, code: string, password: string) => post<{ reset: boolean }>('/api/auth/reset', { email, code, password }),

  updateProfile: (body: { displayName?: string; country?: string; favouriteFaction?: string }) => patchJson<Me>('/api/me', body),
  setConsent: (body: Partial<Pick<ConsentState, 'terms' | 'personalisedAds' | 'marketingEmail'>>) => post<ConsentState>('/api/me/consent', body),
  changePassword: (previous: string, proposed: string) => post<{ changed: boolean }>('/api/me/password', { previous, proposed }),
  changeEmail: (email: string) => post<{ pendingEmail: string }>('/api/me/email', { email }),
  confirmEmail: (code: string) => post<Me>('/api/me/email/confirm', { code }),
  cancelEmailChange: () => post<{ cancelled: boolean }>('/api/me/email/cancel'),
  uploadAvatar: (image: Blob) => request<Me>('/api/me/avatar', { method: 'PUT', raw: image }),
  removeAvatar: () => remove<Me>('/api/me/avatar'),
  eraseAccount: () => remove<{ erased: boolean }>('/api/me', { confirm: 'DELETE' }),

  plans: () => get<{ prices: PlanPrice[]; packs: PackPrice[]; currency: string; configured: boolean }>('/api/billing/plans'),
  checkout: (tier: Tier, voucher?: string) =>
    post<{ url: string }>('/api/billing/checkout', { tier, voucher: voucher || undefined }),
  checkoutPack: (returnPath?: string, voucher?: string) =>
    post<{ url: string }>('/api/billing/checkout', { pack: 'battle', returnPath, voucher: voucher || undefined }),
  portal: (returnPath?: string) => post<{ url: string }>('/api/billing/portal', { returnPath }),
  subscription: () => get<{ subscription: SubscriptionState | null; tier: Tier }>('/api/billing/subscription'),
  previewChange: (tier: Tier) => post<{ tier: Tier; amountDue: number | null; currency: string | null; immediate: boolean; nextRenewal: string | null }>('/api/billing/preview', { tier }),
  changeTier: (tier: Tier) => post<{ subscription: SubscriptionState | null; tier: Tier; direction: 'up' | 'down' }>('/api/billing/change', { tier }),
  cancelSubscription: (cancel: boolean) => post<{ subscription: SubscriptionState | null }>('/api/billing/cancel', { cancel }),
  invoices: () => get<{ invoices: InvoiceSummary[] }>('/api/billing/invoices'),
  syncBilling: (session?: string) => post<Me>('/api/billing/sync', session ? { session } : {}),

  playCheck: (style: string, map: string, personalised: boolean) =>
    get<PlayDecision>(`/api/play/check?style=${encodeURIComponent(style)}&map=${encodeURIComponent(map)}&personalised=${personalised}`),
  adImpression: (body: { token: string; provider: string; filled: boolean; seconds: number }) =>
    post<{ recorded: boolean }>('/api/ads/impression', body),
  startAdCredit: (kind: PlayKind, personalised: boolean) =>
    post<{ ad: AdBreak; kind: PlayKind; seconds: number }>('/api/play/ad-credit', { kind, personalised }),
  completeAdCredit: (token: string) =>
    post<{ granted: boolean; kind: PlayKind; entitlements: Entitlements }>('/api/play/ad-credit/complete', { token }),

  history: (cursor?: string) => get<HistoryPage>(`/api/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  commander: (handle: string) => get<CommanderResponse>(`/api/players/${encodeURIComponent(handle)}`),
  match: (id: string) => get<MatchRecord>(`/api/matches/${encodeURIComponent(id)}`),
  reportResult: (id: string, body: Record<string, unknown>) =>
    post<MatchRecord>(`/api/matches/${encodeURIComponent(id)}/result`, body),

  proposals: () => get<ProposalPage>('/api/proposals'),
  vote: (id: string, value: 1 | -1) => post<ProposalPage>(`/api/proposals/${encodeURIComponent(id)}/vote`, { value }),
  unvote: (id: string) => remove<ProposalPage>(`/api/proposals/${encodeURIComponent(id)}/vote`),

  earlyAccess: () => get<{ items: Record<string, ReleaseInfo> }>('/api/content/early-access'),
};

export interface CommanderResponse extends PlayerRecord {
  profile: {
    handle: string; displayName?: string; country?: string;
    hasAvatar: boolean; avatarVersion: number; memberSince: string;
  };
}

/** Money as Stripe reports it: minor units plus a currency code. */
export function money(minor: number | null | undefined, currency = 'gbp'): string {
  if (minor === null || minor === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function avatarUrl(handle: string, version: number): string {
  return `/api/avatars/${encodeURIComponent(handle)}?v=${version}`;
}
