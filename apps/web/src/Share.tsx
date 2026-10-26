// Sharing a result.
//
// Every share is a link to a public match or commander page, so what gets posted is a real
// page anyone can open rather than a screenshot. The native share sheet is used where the
// browser has one; otherwise the per-network links and a copy button are shown.
import React, { useState } from 'react';
import type { MatchRecord } from '@comrade/contracts';

interface Target { id: string; label: string; href(url: string, text: string): string }

const TARGETS: Target[] = [
  { id: 'x', label: 'X', href: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { id: 'facebook', label: 'Facebook', href: url => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: 'reddit', label: 'Reddit', href: (url, text) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}` },
  { id: 'whatsapp', label: 'WhatsApp', href: (url, text) => `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${url}`)}` },
  { id: 'bluesky', label: 'Bluesky', href: (url, text) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}` },
];

export function shareTextFor(match: MatchRecord): string {
  const you = match.you;
  const opponents = match.participants.filter(p => p !== you && !p.ai).map(p => p.name);
  const against = opponents.length ? ` against ${opponents.join(' and ')}` : match.participants.some(p => p.ai) ? ' against the computer' : '';
  const verb = you?.outcome === 'won' ? 'Won' : you?.outcome === 'lost' ? 'Lost' : 'Fought';
  const score = you ? ` · ${you.score.toLocaleString('en-GB')} points` : '';
  return `${verb} a ${match.mapName} match${against} on Project Comrade${score}`;
}

export default function Share({ url, text, compact }: { url: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const absolute = url.startsWith('http') ? url : `${location.origin}${url}`;

  async function native() {
    try {
      await navigator.share?.({ title: 'Project Comrade', text, url: absolute });
    } catch {
      // The sheet was dismissed, or sharing is not allowed here; the links still work.
    }
  }

  function copy() {
    navigator.clipboard?.writeText(absolute)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
      .catch(() => undefined);
  }

  return <div className={`share${compact ? ' compact' : ''}`}>
    <span className="eyebrow">SHARE</span>
    {'share' in navigator && <button onClick={native}>SHARE…</button>}
    {TARGETS.map(target => <a key={target.id} className={`share-${target.id}`} href={target.href(absolute, text)}
      target="_blank" rel="noreferrer noopener">{target.label}</a>)}
    <button onClick={copy}>{copied ? 'LINK COPIED ✓' : 'COPY LINK'}</button>
  </div>;
}
