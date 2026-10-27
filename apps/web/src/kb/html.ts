import { PAGES, SITE_ORIGIN, HELPDOT_API_KEY, canonicalUrl, type PageMeta } from './catalog';
import { DISCLAIMER } from './prose';
import { esc } from './escape';

export interface RenderedPage {
  meta: PageMeta;
  body: string;
  itemList?: { name: string; path: string }[];
}

function nav(current: string): string {
  const parts = ['<nav class="kb-nav" aria-label="Guide">'];
  let last = '';
  for (const page of PAGES) {
    if (page.group !== last) {
      if (last) parts.push('</div>');
      parts.push(`<p class="eyebrow">${esc(page.group)}</p><div>`);
      last = page.group;
    }
    const on = page.path === current ? ' class="on"' : '';
    parts.push(`<a href="${esc(page.path)}"${on}>${esc(page.navLabel)}</a>`);
  }
  parts.push('</div></nav>');
  return parts.join('\n');
}

function jsonLd(page: RenderedPage): string {
  const url = canonicalUrl(page.meta.path);
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.meta.title,
    description: page.meta.description,
    mainEntityOfPage: url,
    url,
    author: { '@type': 'Organization', name: 'ThunderChild Creative Technologies Ltd' },
    publisher: { '@type': 'Organization', name: 'ThunderChild Creative Technologies Ltd' },
  };
  const graphs: unknown[] = [article];
  if (page.itemList?.length) {
    graphs.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: page.meta.title,
      itemListElement: page.itemList.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: canonicalUrl(item.path),
      })),
    });
  }
  return `<script type="application/ld+json">${JSON.stringify(graphs.length === 1 ? graphs[0] : graphs)}</script>`;
}

export function renderDocument(page: RenderedPage): string {
  const url = canonicalUrl(page.meta.path);
  const title = `${page.meta.title} · Project Comrade Guide`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(page.meta.description)}" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(page.meta.description)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:site_name" content="Project Comrade" />
  <link rel="stylesheet" href="/kb.css" />
  ${jsonLd(page)}
</head>
<body>
  <main class="kb-shell">
    <header>
      <a href="/" class="brand"><b class="mark">C</b>
        <div><strong>PROJECT COMRADE</strong><small>BROWSER RTS CLASSICS · TIBERIAN DAWN · RED ALERT · DUNE · RED ALERT 2</small></div>
      </a>
      <nav class="site-nav" aria-label="Site">
        <a href="/">War room</a>
        <a href="/kb" class="on">Guide</a>
        <a href="/tiers">Tiers</a>
        <a href="/vote">Vote</a>
      </nav>
    </header>
    <section class="kb-page">
      ${nav(page.meta.path)}
      <article class="kb-body">
        <p class="eyebrow">GAME GUIDE</p>
        <h1>${esc(page.meta.title)}</h1>
        ${page.body}
        ${DISCLAIMER}
      </article>
    </section>
    <footer>
      <span>VANILLA CONQUER · COMRADE FUSION ENGINE</span>
      <span>Classic C&amp;C runs the original GPL engine with freeware artwork. The Fusion Engine styles are independent gameplay replications with original procedural art.</span>
      <a href="/kb">Game guide</a>
      <a href="/legal/terms">Terms</a>
      <a href="/legal/privacy">Privacy</a>
      <a href="/legal/cookies">Cookies &amp; advertising</a>
      <a href="/legal/refunds">Refunds</a>
    </footer>
  </main>
  <script src="https://helpdot.me/api/widget/embed.js" data-api-key="${HELPDOT_API_KEY}" defer></script>
</body>
</html>
`;
}

export function robotsTxt(): string {
  return `User-agent: *
Allow: /
Allow: /kb
Allow: /tiers
Allow: /legal
Disallow: /account
Disallow: /signin
Disallow: /register
Disallow: /match
Disallow: /commanders

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

export function sitemapXml(paths: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = paths.map(path => `  <url>
    <loc>${esc(canonicalUrl(path))}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
