// Two optional choices, asked once each: analytics cookies, and (for free play) personalised ads.
//
// The site works with both left off. Analytics stays cookieless until the viewer says yes.
// The advertising default is non-personalised, so "not now" is a real answer and the slot
// still runs. Subscribers never see an advertisement, so they are never asked that one.
import React, { useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { Link } from './router';

export default function ConsentBanner() {
  const { ready, entitlements, localConsent, setLocalConsent, signedIn, reload } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!ready) return null;
  const askAnalytics = !localConsent.analyticsDecided;
  const askAds = !!entitlements?.ads && !localConsent.decided;
  if (!askAnalytics && !askAds) return null;

  const chooseAnalytics = (analytics: boolean) => {
    setLocalConsent({ analyticsDecided: true, analytics });
  };

  const chooseAds = async (personalisedAds: boolean) => {
    setSaving(true);
    setLocalConsent({ decided: true, personalisedAds });
    if (signedIn) {
      try { await api.setConsent({ personalisedAds }); await reload(); } catch { /* local choice still applies */ }
    }
    setSaving(false);
  };

  return <aside className="consent-banner" role="region" aria-label="Privacy choices">
    {askAnalytics && <div>
      <p className="eyebrow">ANALYTICS</p>
      <p>May we use Google Analytics to count visits? Saying no leaves the site unchanged.
        {' '}<Link to="/legal/cookies">How this works</Link>.</p>
      <div className="consent-actions">
        <button className="deploy" onClick={() => chooseAnalytics(true)}>YES, MEASURE VISITS</button>
        <button onClick={() => chooseAnalytics(false)}>NO ANALYTICS</button>
      </div>
    </div>}
    {askAds && <div>
      <p className="eyebrow">ADVERTISING</p>
      <p>Free matches are paid for by one short advertisement before the battle. May we let the
        advertiser personalise it? Saying no changes nothing except how the advertisement is chosen
        — same length, no profiling. <Link to="/legal/cookies">How this works</Link>.</p>
      <div className="consent-actions">
        <button className="deploy" disabled={saving} onClick={() => void chooseAds(true)}>YES, PERSONALISE</button>
        <button disabled={saving} onClick={() => void chooseAds(false)}>NO, KEEP IT GENERIC</button>
        <Link to="/tiers" className="consent-upgrade">Or remove advertisements →</Link>
      </div>
    </div>}
  </aside>;
}
