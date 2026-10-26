// The account page: profile, avatar, a secure email change, password, consent and erasure.
//
// We keep as little as possible: a callsign, an email address, and three optional fields a
// player may fill in or clear whenever they like. The email change goes through Cognito, so
// the new address has to be confirmed with a code before it replaces the old one — an
// intercepted session cannot quietly move an account to somebody else's inbox.
import React, { useRef, useState } from 'react';
import { AVATAR_DIMENSION, AVATAR_MAX_BYTES, DISPLAY_NAME_MAX, STYLES } from '@comrade/contracts';
import { api } from '../api';
import { errorText, useAuth } from '../auth';
import { Link } from '../router';
import { Allowances, Avatar, DangerButton, Field, Notice, SignInWall, TierBadge } from '../ui';

/** Shrink an image to a square avatar in the browser, so only a small file is uploaded. */
async function toAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_DIMENSION;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot resize images');
  // Centre crop, then draw at the target size.
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, AVATAR_DIMENSION, AVATAR_DIMENSION);
  bitmap.close?.();
  for (const quality of [0.9, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error('That image could not be made small enough — try a simpler picture');
}

export default function Account() {
  const { ready, signedIn, profile, entitlements, consent, applyMe, reload, signOut, setLocalConsent } = useAuth();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [faction, setFaction] = useState(profile?.favouriteFaction ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [previous, setPrevious] = useState('');
  const [proposed, setProposed] = useState('');

  if (!ready) return <section className="page"><p className="spinner">Loading…</p></section>;
  if (!signedIn || !profile) return <section className="page"><SignInWall what="Your account" /></section>;

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label); setError(''); setDone('');
    try { await work(); } catch (caught) { setError(errorText(caught)); } finally { setBusy(''); }
  };

  const factions = [...new Map(STYLES.flatMap(s => s.factions.map(f => [f.id, f] as const))).values()];

  return <section className="page account-page">
    <header className="page-head">
      <p className="eyebrow">COMMANDER</p>
      <h1>{profile.displayName || profile.handle}</h1>
      <p className="account-sub">
        <TierBadge tier={entitlements?.tier ?? 'free'} /> · callsign <b>{profile.handle}</b> ·
        commanding since {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
      </p>
    </header>

    {error && <Notice kind="bad">{error}</Notice>}
    {done && <Notice kind="good">{done}</Notice>}

    <div className="account-grid">
      <article className="card">
        <h2>This week</h2>
        <Allowances />
        <p className="card-note">Your week renews on your own registration day, not on a Monday.</p>
        <Link to="/account/billing" className="deploy">MANAGE SUBSCRIPTION →</Link>
      </article>

      <article className="card">
        <h2>Avatar</h2>
        <div className="avatar-row">
          <Avatar handle={profile.handle} version={profile.avatarVersion} hasAvatar={profile.hasAvatar} size={96} name={profile.displayName} />
          <div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden
              onChange={event => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (!chosen) return;
                void run('avatar', async () => {
                  const image = await toAvatar(chosen);
                  applyMe(await api.uploadAvatar(image));
                  setDone('Avatar updated.');
                });
              }} />
            <button disabled={!!busy} onClick={() => file.current?.click()}>
              {busy === 'avatar' ? 'UPLOADING…' : 'CHOOSE AN IMAGE'}
            </button>
            {profile.hasAvatar && <button className="link-button" disabled={!!busy}
              onClick={() => run('avatar', async () => { applyMe(await api.removeAvatar()); setDone('Avatar removed.'); })}>
              Remove
            </button>}
            <small>Cropped square and resized to {AVATAR_DIMENSION}×{AVATAR_DIMENSION} in your browser before it is sent.</small>
          </div>
        </div>
      </article>

      <article className="card">
        <h2>Profile</h2>
        <form onSubmit={event => {
          event.preventDefault();
          void run('profile', async () => {
            applyMe(await api.updateProfile({ displayName, country, favouriteFaction: faction }));
            setDone('Profile saved.');
          });
        }}>
          <Field label="Display name" hint="Shown instead of your callsign. Leave it empty to use the callsign.">
            <input value={displayName} maxLength={DISPLAY_NAME_MAX} onChange={e => setDisplayName(e.target.value)} aria-label="Display name" />
          </Field>
          <Field label="Country" hint="Optional, two-letter code. Used only for a flag beside your name.">
            <input value={country} maxLength={2} onChange={e => setCountry(e.target.value.toUpperCase())} aria-label="Country code" />
          </Field>
          <Field label="Preferred side" hint="Pre-selected when you join a lobby.">
            <select value={faction} onChange={e => setFaction(e.target.value)} aria-label="Preferred side">
              <option value="">No preference</option>
              {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <button className="deploy" disabled={busy === 'profile'}>{busy === 'profile' ? 'SAVING…' : 'SAVE PROFILE'}</button>
        </form>
      </article>

      <article className="card">
        <h2>Email address</h2>
        <p className="card-note">Signing in uses <b>{profile.email}</b>{profile.emailVerified ? '' : ' (unconfirmed)'}.</p>
        {profile.pendingEmail
          ? <form onSubmit={event => {
              event.preventDefault();
              void run('email-confirm', async () => {
                applyMe(await api.confirmEmail(emailCode));
                setEmailCode('');
                setDone('Email address changed.');
              });
            }}>
              <Notice>A confirmation code has gone to <b>{profile.pendingEmail}</b>. The change takes effect once you enter it.</Notice>
              <Field label="Confirmation code">
                <input value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" maxLength={10} autoComplete="one-time-code" required aria-label="Email confirmation code" />
              </Field>
              <button className="deploy" disabled={busy === 'email-confirm'}>
                {busy === 'email-confirm' ? 'CONFIRMING…' : 'CONFIRM NEW ADDRESS'}
              </button>
              <button type="button" className="link-button" disabled={!!busy}
                onClick={() => run('email-cancel', async () => { await api.cancelEmailChange(); await reload(); setDone('Email change cancelled.'); })}>
                Cancel the change
              </button>
            </form>
          : <form onSubmit={event => {
              event.preventDefault();
              void run('email', async () => {
                await api.changeEmail(newEmail);
                await reload();
                setNewEmail('');
                setDone('Check the new address for a confirmation code.');
              });
            }}>
              <Field label="New email address" hint="We send a code there to confirm it before anything changes.">
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value.trim())} required aria-label="New email address" />
              </Field>
              <button className="deploy" disabled={busy === 'email'}>{busy === 'email' ? 'SENDING…' : 'CHANGE EMAIL'}</button>
            </form>}
      </article>

      <article className="card">
        <h2>Password</h2>
        <form onSubmit={event => {
          event.preventDefault();
          void run('password', async () => {
            await api.changePassword(previous, proposed);
            setPrevious(''); setProposed('');
            setDone('Password changed.');
          });
        }}>
          <Field label="Current password">
            <input type="password" value={previous} onChange={e => setPrevious(e.target.value)}
              autoComplete="current-password" required aria-label="Current password" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input type="password" value={proposed} onChange={e => setProposed(e.target.value)}
              autoComplete="new-password" minLength={8} required aria-label="New password" />
          </Field>
          <button className="deploy" disabled={busy === 'password'}>{busy === 'password' ? 'CHANGING…' : 'CHANGE PASSWORD'}</button>
        </form>
      </article>

      <article className="card">
        <h2>Advertising and email</h2>
        <label className="check">
          <input type="checkbox" checked={!!consent?.personalisedAds} disabled={!!busy}
            onChange={event => {
              const personalisedAds = event.target.checked;
              void run('consent', async () => {
                await api.setConsent({ personalisedAds });
                setLocalConsent({ decided: true, personalisedAds });
                await reload();
              });
            }} />
          <span>Personalised advertisements. Off means the pre-match slot runs non-personalised
            advertisements instead — the same thirty seconds, without profiling.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!consent?.marketingEmail} disabled={!!busy}
            onChange={event => {
              const marketingEmail = event.target.checked;
              void run('consent', async () => { await api.setConsent({ marketingEmail }); await reload(); });
            }} />
          <span>Email me when new maps and fusions launch.</span>
        </label>
        <p className="card-note">
          Subscribers see no advertisements at all. <Link to="/legal/cookies">How advertising works here</Link>.
        </p>
      </article>

      <article className="card danger-card">
        <h2>Leave</h2>
        <p>Signing out ends your session on every device.</p>
        <button onClick={() => void signOut()}>SIGN OUT</button>
        <hr />
        <h3>Delete your account</h3>
        <p>Your callsign is released, your profile and avatar are erased and any subscription is
          cancelled at the end of the period you have paid for. Matches you played stay in the other
          commanders' history with your name removed. This cannot be undone.</p>
        <DangerButton label="DELETE MY ACCOUNT" confirmLabel="YES, DELETE EVERYTHING"
          busy={busy === 'erase'}
          onConfirm={() => run('erase', async () => {
            await api.eraseAccount();
            await reload();
            window.location.assign('/');
          })} />
      </article>
    </div>

    <p className="account-foot">
      Your record, match history and head-to-head results live on
      {' '}<Link to={`/commanders/${profile.handle}`}>your commander page</Link>.
    </p>
  </section>;
}
