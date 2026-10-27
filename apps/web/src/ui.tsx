// Small shared pieces: avatars, tier badges, quota meters and form scaffolding.
import React, { useState } from 'react';
import type { PlayKind, QuotaState, Tier } from '@comrade/contracts';
import { avatarUrl } from './api';
import { quotaText, resetText, useAuth } from './auth';
import { Link } from './router';

const TIER_LABEL: Record<Tier, string> = { guest: 'Guest', free: 'Free', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  return <span className={`tier-badge ${tier}${small ? ' small' : ''}`}>{TIER_LABEL[tier] ?? tier}</span>;
}

export function Avatar({ handle, version, hasAvatar, size = 40, name }: {
  handle: string; version: number; hasAvatar: boolean; size?: number; name?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = name || handle;
  if (!hasAvatar || failed) {
    // Initials are a dependable fallback: no request, no layout shift.
    const initials = label.replace(/[^\p{L}\p{N}]/gu, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    return <span className="avatar placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>{initials}</span>;
  }
  return <img className="avatar" src={avatarUrl(handle, version)} width={size} height={size}
    alt={`${label}'s avatar`} loading="lazy" onError={() => setFailed(true)} />;
}

/** One allowance, as a bar with the plain-English state beside it. */
export function QuotaMeter({ quota, label }: { quota: QuotaState | undefined; label: string }) {
  if (!quota) return null;
  const unlimited = quota.limit === null;
  const used = unlimited ? 0 : Math.min(quota.used, quota.limit!);
  const pct = unlimited ? 100 : Math.round((used / Math.max(1, quota.limit!)) * 100);
  return <div className={`quota ${unlimited ? 'unlimited' : quota.remaining ? '' : 'spent'}`}>
    <span className="quota-label">{label}</span>
    <div className="quota-bar"><i style={{ width: `${unlimited ? 100 : 100 - pct}%` }} /></div>
    <span className="quota-state">{quotaText(quota)}{!unlimited && quota.resetsAt ? ` · ${resetText(quota)}` : ''}</span>
  </div>;
}

/** The two allowances together, for the lobby sidebar and the account page. */
export function Allowances() {
  const { entitlements } = useAuth();
  if (!entitlements) return null;
  const find = (kind: PlayKind) => entitlements.quotas.find(q => q.kind === kind);
  return <div className="allowances">
    <QuotaMeter quota={find('classic')} label="Classic" />
    <QuotaMeter quota={find('fusion')} label="Fusion" />
  </div>;
}

export function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return <label className={`field${error ? ' has-error' : ''}`}>
    <span className="field-label">{label}</span>
    {children}
    {error ? <small className="field-error">{error}</small> : hint ? <small className="field-hint">{hint}</small> : null}
  </label>;
}

/** Optional Stripe promotion code, applied to Checkout when the player has one. */
export function VoucherField({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <div className="voucher-field">
    <Field label="Voucher code" hint="Optional. Gold 100% vouchers apply to the first Gold invoice only.">
      <input
        type="text"
        name="voucher"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
        placeholder="CG100-XXXX-XXXX"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value.toUpperCase())}
      />
    </Field>
  </div>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'good' | 'bad'; children: React.ReactNode }) {
  return <p className={`notice ${kind}`}>{children}</p>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <p className="spinner" role="status">{label}</p>;
}

/** Shown wherever a feature needs a signed-in account. */
export function SignInWall({ what }: { what: string }) {
  return <div className="signin-wall">
    <p className="eyebrow">ACCOUNT REQUIRED</p>
    <h2>Register a callsign</h2>
    <p>{what} needs an account. Registering claims your callsign, keeps your record and gives you three Classic matches and two Fusion matches every day, free.</p>
    <div className="wall-actions">
      <Link to="/register" className="deploy">REGISTER A CALLSIGN →</Link>
      <Link to="/signin">I already have one</Link>
    </div>
  </div>;
}

/** A confirm-before-you-do-it button, for anything that cannot be undone. */
export function DangerButton({ label, confirmLabel, onConfirm, busy }: {
  label: string; confirmLabel: string; onConfirm: () => void; busy?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button className="danger" onClick={() => setArmed(true)}>{label}</button>;
  return <span className="danger-confirm">
    <button className="danger" disabled={busy} onClick={onConfirm}>{busy ? 'WORKING…' : confirmLabel}</button>
    <button onClick={() => setArmed(false)}>Cancel</button>
  </span>;
}
