// Registering a callsign, signing in, and getting back in when the password is forgotten.
//
// Registration claims the callsign against the email address: the service reserves the name
// before it creates the account, so two people racing for the same one cannot both have it.
// The password is posted to our own service over TLS, which exchanges it with Cognito and
// returns a short-lived access token plus an httpOnly refresh cookie — the page never stores
// a credential and never holds a long-lived token where a script could read it.
import React, { useEffect, useRef, useState } from 'react';
import { HANDLE_MAX, HANDLE_MIN, handleValid } from '@comrade/contracts';
import { api } from '../api';
import { errorText, useAuth } from '../auth';
import { Link, useRoute } from '../router';
import { Field, Notice } from '../ui';

function useNext(): string {
  const { search } = useRoute();
  const next = search.get('next') ?? '/';
  // Only ever return to a path on this site.
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

type Stage = 'details' | 'confirm';

export function Register() {
  const { applyMe, tiers, setLocalConsent } = useAuth();
  const { navigate } = useRoute();
  const next = useNext();
  const [stage, setStage] = useState<Stage>('details');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [terms, setTerms] = useState(false);
  const [ads, setAds] = useState(false);
  const [mail, setMail] = useState(false);
  const [code, setCode] = useState('');
  const [available, setAvailable] = useState<{ ok: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const checking = useRef(0);

  // Check the callsign as it is typed, but only the last thing typed.
  useEffect(() => {
    setAvailable(null);
    if (!handleValid(handle)) return;
    const ticket = ++checking.current;
    const timer = setTimeout(() => {
      api.handleAvailable(handle)
        .then(result => { if (checking.current === ticket) setAvailable({ ok: result.available, reason: result.reason }); })
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [handle]);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!handleValid(handle)) { setError(`A callsign is ${HANDLE_MIN}–${HANDLE_MAX} letters or numbers.`); return; }
    if (!terms) { setError('You need to accept the terms to register.'); return; }
    setBusy(true);
    try {
      const result = await api.register({ handle, email, password: secret, terms, personalisedAds: ads, marketingEmail: mail });
      // Remember the advertising choice locally too, so the banner stops asking.
      setLocalConsent({ decided: true, personalisedAds: ads });
      if (result.confirmRequired) setStage('confirm');
      else await finish();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const me = await api.signIn(email, secret);
    applyMe(me);
    setSecret('');
    navigate(next);
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.confirm(email, code);
      await finish();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  if (tiers && !tiers.authEnabled) return <section className="page auth-page">
    <h1>Accounts are not open yet</h1>
    <Notice>Registration is not switched on for this deployment. Play is free and unmetered in the meantime.</Notice>
    <Link to="/" className="deploy">BACK TO THE WAR ROOM →</Link>
  </section>;

  if (stage === 'confirm') return <section className="page auth-page">
    <p className="eyebrow">ONE MORE STEP</p>
    <h1>Confirm your email</h1>
    <p>We have sent a code to <b>{email}</b>. Enter it to finish claiming <b>{handle}</b>.</p>
    <form onSubmit={confirm}>
      <Field label="Confirmation code">
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
          autoComplete="one-time-code" maxLength={10} required aria-label="Confirmation code" />
      </Field>
      {error && <Notice kind="bad">{error}</Notice>}
      <button className="deploy" disabled={busy}>{busy ? 'CONFIRMING…' : 'CONFIRM AND DEPLOY →'}</button>
      <button type="button" className="link-button" onClick={() => api.resend(email).catch(() => undefined)}>
        Send the code again
      </button>
    </form>
  </section>;

  return <section className="page auth-page">
    <p className="eyebrow">COMMANDER REGISTRATION</p>
    <h1>Claim your callsign</h1>
    <p>Your callsign is how other commanders see you, and it is yours alone. Registering is free:
      three Classic matches and one Fusion match every week, plus your record and match history.</p>
    <form onSubmit={register}>
      <Field label="Callsign"
        hint="3–20 letters or numbers. Dots, dashes and underscores allowed inside."
        error={available && !available.ok ? (available.reason ?? 'That callsign is taken') : undefined}>
        <input value={handle} onChange={e => setHandle(e.target.value.trim())} maxLength={HANDLE_MAX}
          autoComplete="username" required aria-label="Callsign" />
      </Field>
      {available?.ok && <p className="field-good">{handle} is available ✓</p>}
      <Field label="Email address" hint="Used to sign in, and for receipts. We do not sell it.">
        <input type="email" value={email} onChange={e => setEmail(e.target.value.trim())}
          autoComplete="email" required aria-label="Email address" />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
          autoComplete="new-password" minLength={8} required aria-label="Password" />
      </Field>
      <label className="check">
        <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} required />
        <span>I accept the <Link to="/legal/terms">terms</Link> and the <Link to="/legal/privacy">privacy policy</Link>.</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={ads} onChange={e => setAds(e.target.checked)} />
        <span>Show me personalised advertisements. Leave this off and the pre-match slot runs
          non-personalised advertisements instead — same length, no profiling.</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={mail} onChange={e => setMail(e.target.checked)} />
        <span>Email me when new maps and fusions launch. No more than that.</span>
      </label>
      {error && <Notice kind="bad">{error}</Notice>}
      <button className="deploy" disabled={busy || (available ? !available.ok : false)}>
        {busy ? 'REGISTERING…' : 'CLAIM CALLSIGN →'}
      </button>
    </form>
    <p className="auth-alt">Already have a callsign? <Link to={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link>.</p>
  </section>;
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export function SignIn() {
  const { signIn } = useAuth();
  const { navigate } = useRoute();
  const next = useNext();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email, secret);
      setSecret('');
      navigate(next);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return <section className="page auth-page">
    <p className="eyebrow">COMMANDER SIGN-IN</p>
    <h1>Welcome back</h1>
    <form onSubmit={submit}>
      <Field label="Email address">
        <input type="email" value={email} onChange={e => setEmail(e.target.value.trim())}
          autoComplete="email" required aria-label="Email address" />
      </Field>
      <Field label="Password">
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
          autoComplete="current-password" required aria-label="Password" />
      </Field>
      {error && <Notice kind="bad">{error}</Notice>}
      <button className="deploy" disabled={busy}>{busy ? 'SIGNING IN…' : 'SIGN IN →'}</button>
    </form>
    <p className="auth-alt">
      <Link to="/signin/forgot">Forgotten your password?</Link>
      {' · '}
      <Link to={`/register?next=${encodeURIComponent(next)}`}>Register a callsign</Link>
    </p>
  </section>;
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export function Forgot() {
  const { navigate } = useRoute();
  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.forgot(email);
      setStage('reset');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.reset(email, code, secret);
      navigate('/signin');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'reset') return <section className="page auth-page">
    <p className="eyebrow">PASSWORD RESET</p>
    <h1>Enter your code</h1>
    <p>If <b>{email}</b> has an account, a reset code is on its way.</p>
    <form onSubmit={reset}>
      <Field label="Reset code">
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
          autoComplete="one-time-code" maxLength={10} required aria-label="Reset code" />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
          autoComplete="new-password" minLength={8} required aria-label="New password" />
      </Field>
      {error && <Notice kind="bad">{error}</Notice>}
      <button className="deploy" disabled={busy}>{busy ? 'RESETTING…' : 'SET NEW PASSWORD →'}</button>
    </form>
  </section>;

  return <section className="page auth-page">
    <p className="eyebrow">PASSWORD RESET</p>
    <h1>Forgotten your password?</h1>
    <p>Tell us the email address on the account and we will send a reset code.</p>
    <form onSubmit={sendCode}>
      <Field label="Email address">
        <input type="email" value={email} onChange={e => setEmail(e.target.value.trim())}
          autoComplete="email" required aria-label="Email address" />
      </Field>
      {error && <Notice kind="bad">{error}</Notice>}
      <button className="deploy" disabled={busy}>{busy ? 'SENDING…' : 'SEND RESET CODE →'}</button>
    </form>
    <p className="auth-alt"><Link to="/signin">Back to sign in</Link></p>
  </section>;
}
