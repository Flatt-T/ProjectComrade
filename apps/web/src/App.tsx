import React, { useEffect, useMemo, useState } from 'react';
import { LaunchRequest, styleInfo } from '@comrade/contracts';
import Lobby from './Lobby';
import Battle from './Battle';
import FusionBattle from './FusionBattle';
import FusionRequests from './FusionRequests';
import ConsentBanner from './ConsentBanner';
import { RoomConnection } from './net';
import { currentToken, onToken } from './api';
import { AuthProvider, useAuth } from './auth';
import { Link, RouterProvider, useRoute } from './router';
import { Avatar, TierBadge } from './ui';
import Tiers from './pages/Tiers';
import { Forgot, Register, SignIn } from './pages/Auth';
import Account from './pages/Account';
import Billing from './pages/Billing';
import { Commander, History, Match } from './pages/Record';
import Vote from './pages/Vote';
import Legal from './pages/Legal';
import './style.css';
import './platform.css';

export default function App() {
  return <AuthProvider><RouterProvider><Shell /></RouterProvider></AuthProvider>;
}

/** The account corner of the header: who you are, your tier, and the way out. */
function AccountMenu() {
  const { ready, signedIn, profile, tier, open } = useAuth();
  const { path } = useRoute();
  const [menu, setMenu] = useState(false);
  if (!ready || open) return null;
  if (!signedIn || !profile) return <span className="account-menu">
    <Link to={`/signin?next=${encodeURIComponent(path)}`}>Sign in</Link>
    <Link to="/register" className="register-link">Register</Link>
  </span>;
  return <span className={`account-menu signed-in${menu ? ' open' : ''}`}>
    <button onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Your account">
      <Avatar handle={profile.handle} version={profile.avatarVersion} hasAvatar={profile.hasAvatar} size={28} name={profile.displayName} />
      <b>{profile.displayName || profile.handle}</b>
      <TierBadge tier={tier} small />
    </button>
    {menu && <div className="account-dropdown" onClick={() => setMenu(false)}>
      <Link to="/account">Your account</Link>
      <Link to="/account/billing">Subscription and invoices</Link>
      <Link to="/account/history">Match history</Link>
      <Link to={`/commanders/${profile.handle}`}>Your commander page</Link>
      <Link to="/vote">Vote on features</Link>
      <SignOut />
    </div>}
  </span>;
}

function SignOut() {
  const { signOut } = useAuth();
  return <button className="link-button" onClick={() => void signOut()}>Sign out</button>;
}

function Shell() {
  // One connection for the whole visit: lockstep matches outlive the lobby view.
  const conn = useMemo(() => new RoomConnection(), []);
  const [session, setSession] = useState<{ launch: LaunchRequest; mapName: string } | null>(null);
  const [requests, setRequests] = useState(() => new URLSearchParams(location.search).get('view') === 'fusion-requests');
  const { path, navigate } = useRoute();
  const { ready, entitlements } = useAuth();
  const showRequests = (on: boolean) => { setRequests(on); history.replaceState(null, '', on ? '?view=fusion-requests' : location.pathname); };
  const fusion = session && styleInfo(session.launch.style).engine === 'fusion';

  // Keep the room socket's idea of who we are in step with the signed-in account, so the
  // service can count the right allowance and attribute the match to the right commander.
  useEffect(() => {
    conn.identify(currentToken());
    return onToken(token => conn.identify(token));
  }, [conn]);

  function exit() {
    conn.send({ type: 'leave' });
    conn.resetTurns();
    setSession(null);
    if (path === '/') history.replaceState(null, '', location.pathname);
  }

  // A match takes over the whole window, wherever in the site it was started from.
  if (session) {
    return <main className={`battle-shell ${fusion ? 'wide' : ''}`}>
      {fusion
        ? <FusionBattle launch={session.launch} mapName={session.mapName} conn={conn} onExit={exit} />
        : <Battle launch={session.launch} mapName={session.mapName} conn={conn} onExit={exit} />}
    </main>;
  }

  const warRoom = path === '/';
  return <main className={`battle-shell${warRoom ? '' : ' site'}`}>
    <header>
      <Link to="/" className="brand"><b className="mark">C</b>
        <div><strong>PROJECT COMRADE</strong><small>BROWSER RTS CLASSICS · TIBERIAN DAWN · RED ALERT · DUNE · RED ALERT 2</small></div>
      </Link>
      {warRoom && <span className="badge">WAR ROOM</span>}
      <nav className="site-nav">
        <Link to="/" className={warRoom ? 'on' : ''}>War room</Link>
        <Link to="/tiers" className={path === '/tiers' ? 'on' : ''}>Tiers</Link>
        <Link to="/vote" className={path === '/vote' ? 'on' : ''}>Vote</Link>
        {warRoom && <a href="?view=fusion-requests" onClick={e => { e.preventDefault(); showRequests(!requests); }}>
          {requests ? 'War room' : 'Fusion requests'}
        </a>}
      </nav>
      <AccountMenu />
      <a href="https://github.com/Flatt-T/ProjectComrade">Source ↗</a>
    </header>

    {warRoom && !requests && <div className="battle-top">
      <div><p className="eyebrow">{ready && entitlements?.registered ? 'YOUR WEEK · YOUR RECORD' : 'FREE TO PLAY · NO INSTALL'}</p>
        <h1>Command the classics, in your browser</h1></div>
      <p className="mission-objective">Pick a callsign. Create or join a game.<br />
        <span>Share the link. Choose your side and deploy.</span></p>
    </div>}

    <Routes conn={conn} onLaunch={(launch, mapName) => setSession({ launch, mapName })}
      requests={requests} showRequests={showRequests} navigate={navigate} />

    <ConsentBanner />

    <footer>
      <span>VANILLA CONQUER · COMRADE FUSION ENGINE</span>
      <span>Classic C&amp;C runs the original GPL engine with freeware artwork. The Fusion Engine styles — Tiberian Dawn, Red Alert, Dune and Red Alert 2 — are independent gameplay replications with original procedural art.</span>
      <a href="/content/td/manifest.json">Content credits ↗</a> <a href="/content/audio/manifest.json">Sound credits ↗</a>
      <a href="/engines/source.txt">Engine licence ↗</a>
      <Link to="/legal/terms">Terms</Link> <Link to="/legal/privacy">Privacy</Link>
      <Link to="/legal/cookies">Cookies &amp; advertising</Link> <Link to="/legal/refunds">Refunds</Link>
    </footer>
  </main>;
}

function Routes({ conn, onLaunch, requests, showRequests }: {
  conn: RoomConnection;
  onLaunch: (launch: LaunchRequest, mapName: string) => void;
  requests: boolean;
  showRequests: (on: boolean) => void;
  navigate: (to: string) => void;
}) {
  const { path, match } = useRoute();

  if (path === '/tiers') return <Tiers />;
  if (path === '/signin') return <SignIn />;
  if (path === '/signin/forgot') return <Forgot />;
  if (path === '/register') return <Register />;
  if (path === '/account') return <Account />;
  if (path === '/account/billing' || path === '/billing') return <Billing />;
  if (path === '/account/history') return <History />;
  if (match('/commanders/:handle')) return <Commander />;
  if (match('/match/:id')) return <Match />;
  if (path === '/vote') return <Vote />;
  if (path.startsWith('/legal')) return <Legal />;
  if (path !== '/') return <section className="page">
    <h1>Nothing here</h1>
    <p>That page does not exist. <Link to="/">Back to the war room</Link>.</p>
  </section>;

  return requests
    ? <FusionRequests onBack={() => showRequests(false)} />
    : <Lobby conn={conn} onLaunch={onLaunch} />;
}
