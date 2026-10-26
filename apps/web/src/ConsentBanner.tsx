// The advertising choice, asked once.
//
// There is nothing to consent to for the site to work: no analytics, no tracking cookies of
// our own. The only question is whether the pre-match advertisement may be personalised, and
// the honest default is no — so "not now" is a real answer and the slot simply runs
// non-personalised advertisements. Subscribers never see an advertisement at all, so they are
// never asked.
import React, { useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { Link } from './router';

export default function ConsentBanner() {
  const { ready, entitlements, localConsent, setLocalConsent, signedIn, reload } = useAuth();
  const [saving, setSaving] = useState(false);

  // Only ask people who will actually see an advertisement, and only once.
  if (!ready || localConsent.decided || !entitlements?.ads) return null;

  const choose = async (personalisedAds: boolean) => {
    setSaving(true);
    setLocalConsent({ decided: true, personalisedAds });
    if (signedIn) {
      // Registered players have their choice stored against the account as well.
      try { await api.setConsent({ personalisedAds }); await reload(); } catch { /* local choice still applies */ }
    }
    setSaving(false);
  };

  return <aside className="consent-banner" role="region" aria-label="Advertising choice">
    <div>
      <p className="eyebrow">ADVERTISING</p>
      <p>Free matches are paid for by one short advertisement before the battle. May we let the
        advertiser personalise it? Saying no changes nothing except how the advertisement is chosen
        — same length, no profiling. <Link to="/legal/cookies">How this works</Link>.</p>
    </div>
    <div className="consent-actions">
      <button className="deploy" disabled={saving} onClick={() => void choose(true)}>YES, PERSONALISE</button>
      <button disabled={saving} onClick={() => void choose(false)}>NO, KEEP IT GENERIC</button>
      <Link to="/tiers" className="consent-upgrade">Or remove advertisements →</Link>
    </div>
  </aside>;
}
