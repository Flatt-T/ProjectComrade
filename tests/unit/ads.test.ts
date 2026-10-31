import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADS_TXT_LINE, interstitialType, placementFilled, placementMissed } from '../../apps/web/src/adsense';
import { adBreak } from '../../apps/service/src/ads';
import { AD_CREDIT_MAX_WAIT_MS, AD_CREDIT_MIN_WATCH_MS, adCreditWatchState } from '../../apps/service/src/credits';

describe('AdSense site verification files', () => {
  it('serves the exact ads.txt line Google issued', () => {
    const onDisk = readFileSync(resolve('apps/web/public/ads.txt'), 'utf8').trim();
    expect(onDisk).toBe('google.com, pub-3714156360561836, DIRECT, f08c47fec0942fa0');
    expect(ADS_TXT_LINE).toBe(onDisk);
  });

  it('loads the AdSense client and test-mode Ad Placement API in the site head', () => {
    const html = readFileSync(resolve('apps/web/index.html'), 'utf8');
    expect(html).toContain('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3714156360561836');
    expect(html).toContain('data-adbreak-test="on"');
    expect(html).toContain('window.adBreak');
  });
});

describe('Ad Placement API helpers', () => {
  it('uses preroll once per page, then start', () => {
    expect(interstitialType(false)).toBe('preroll');
    expect(interstitialType(true)).toBe('start');
  });

  it('treats only a viewed placement as filled, and empty statuses as a house miss', () => {
    expect(placementFilled('viewed')).toBe(true);
    expect(placementFilled('dismissed')).toBe(false);
    expect(placementMissed(null)).toBe(true);
    expect(placementMissed({ breakType: 'preroll', breakName: 'pre-match', breakFormat: 'interstitial', breakStatus: 'noAdPreloaded' })).toBe(true);
    expect(placementMissed({ breakType: 'preroll', breakName: 'pre-match', breakFormat: 'interstitial', breakStatus: 'viewed' })).toBe(false);
    expect(placementMissed({ breakType: 'preroll', breakName: 'pre-match', breakFormat: 'interstitial', breakStatus: 'dismissed' })).toBe(false);
  });
});

describe('pre-match slot contract', () => {
  it('issues a token, house creative and purpose without VAST tags', () => {
    const slot = adBreak(false, { purpose: 'delay' });
    expect(slot.token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(slot.personalised).toBe(false);
    expect(slot.purpose).toBe('delay');
    expect(slot.house.href).toBe('/tiers');
    expect(slot.seconds).toBeGreaterThan(0);
    expect(slot).not.toHaveProperty('tags');
    expect(slot).not.toHaveProperty('timeoutMs');
  });
});

describe('rewarded credit watch window', () => {
  it('rejects an instant complete and an abandoned token, and accepts a viewed placement', () => {
    const issued = new Date('2026-10-31T12:00:00.000Z');
    expect(adCreditWatchState(issued, new Date(issued.getTime() + AD_CREDIT_MIN_WATCH_MS - 1))).toBe('early');
    expect(adCreditWatchState(issued, new Date(issued.getTime() + AD_CREDIT_MIN_WATCH_MS))).toBe('ok');
    expect(adCreditWatchState(issued, new Date(issued.getTime() + AD_CREDIT_MAX_WAIT_MS + 1))).toBe('expired');
  });
});
