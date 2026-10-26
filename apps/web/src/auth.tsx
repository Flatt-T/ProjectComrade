// Who is signed in, what they are entitled to, and the consent they have given.
//
// One provider holds all of it so the lobby, the battle and the account pages agree. The
// entitlements come from the service, never from the page's own reading of the tier table:
// the client decides what to *show*, the service decides what is *allowed*.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ConsentState, Entitlements, Me, PlayKind, QuotaState, Tier } from '@comrade/contracts';
import { ApiError, MeResponse, TierTable, api, currentToken, refresh } from './api';

/** The viewer's local advertising choice, kept per browser for guests. */
const CONSENT_KEY = 'comrade-consent';
export interface LocalConsent { decided: boolean; personalisedAds: boolean }

export function readLocalConsent(): LocalConsent {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return { decided: false, personalisedAds: false };
    const parsed = JSON.parse(raw) as LocalConsent;
    return { decided: !!parsed.decided, personalisedAds: !!parsed.personalisedAds };
  } catch {
    // Private mode or blocked storage: treat it as undecided and non-personalised.
    return { decided: false, personalisedAds: false };
  }
}

function writeLocalConsent(consent: LocalConsent) {
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(consent)); } catch { /* nothing we can do */ }
}

interface AuthValue {
  /** Null until the first load finishes. */
  ready: boolean;
  profile: Me['profile'] | null;
  entitlements: Entitlements | null;
  consent: ConsentState | null;
  localConsent: LocalConsent;
  tiers: TierTable | null;
  /** True when the deployment has no accounts configured at all. */
  open: boolean;
  signedIn: boolean;
  tier: Tier;
  token: string;
  quota(kind: PlayKind): QuotaState | undefined;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  applyMe(me: Me): void;
  setLocalConsent(consent: LocalConsent): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth used outside AuthProvider');
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<MeResponse | null>(null);
  const [tiers, setTiers] = useState<TierTable | null>(null);
  const [token, setToken] = useState('');
  const [localConsent, setLocal] = useState<LocalConsent>(readLocalConsent);

  const load = useCallback(async () => {
    try { setState(await api.me()); } catch { setState(null); }
    setToken(currentToken());
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      // Ask what this deployment offers first: with no identity provider there is no session
      // to restore, so the refresh is skipped entirely rather than failing on every page load.
      const table = await api.tiers().catch(() => null);
      if (!live) return;
      if (table?.authEnabled !== false) await refresh().catch(() => false);
      if (!live) return;
      await load();
      if (!live) return;
      setTiers(table);
      setReady(true);
    })();
    return () => { live = false; };
  }, [load]);

  const applyMe = useCallback((me: Me) => {
    setState({ profile: me.profile, entitlements: me.entitlements, consent: me.consent });
    setToken(currentToken());
  }, []);

  const value = useMemo<AuthValue>(() => ({
    ready,
    profile: state?.profile ?? null,
    entitlements: state?.entitlements ?? null,
    consent: state?.consent ?? null,
    localConsent,
    tiers,
    open: !!state?.open,
    signedIn: !!state?.profile,
    tier: state?.entitlements?.tier ?? 'guest',
    token,
    quota: (kind: PlayKind) => state?.entitlements?.quotas.find(q => q.kind === kind),
    async signIn(email, password) {
      const me = await api.signIn(email, password);
      applyMe(me);
    },
    async signOut() {
      await api.signOut();
      setToken('');
      await load();
    },
    reload: load,
    applyMe,
    setLocalConsent(consent) { writeLocalConsent(consent); setLocal(consent); },
  }), [ready, state, tiers, token, localConsent, load, applyMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Friendly text for an API failure, for forms to show straight to the player. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong — try again';
}

/** "2 of 3 left" / "Unlimited", for the lobby and the account page. */
export function quotaText(quota: QuotaState | undefined): string {
  if (!quota) return '';
  if (quota.limit === null) return 'Unlimited';
  const weekly = Math.max(0, quota.limit - quota.used);
  const bonus = quota.bonus ?? 0;
  if (bonus) return `${weekly} of ${quota.limit} this week · ${bonus} extra`;
  return `${quota.remaining ?? 0} of ${quota.limit} left`;
}

export function resetText(quota: QuotaState | undefined): string {
  if (!quota?.resetsAt) return '';
  const when = new Date(quota.resetsAt);
  const days = Math.max(0, Math.ceil((when.getTime() - Date.now()) / 86_400_000));
  if (days <= 1) return 'renews within a day';
  return `renews in ${days} days`;
}
