import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES } from '../../../../packages/contracts/src/index';
import { EXTRA_SITEMAP_PATHS, PAGES, pageByPath } from './catalog';
import { esc } from './escape';
import {
  countrySectionsHtml, creditsHtml, fidelityHtml, mapsHtml, packById, PACKS, sideRoster,
  structuresHtml, superweaponsHtml, unitsHtml, upgradesHtml, type SideFilter,
} from './fromPacks';
import { renderDocument, robotsTxt, sitemapXml, type RenderedPage } from './html';
import {
  CLASSIC_CNC, CLASSIC_RA, CONTROLS, GAME_OVERVIEWS, HOW_TO_PLAY, INDEX_INTRO, SIDE_INTRO, h2, p,
} from './prose';

const here = dirname(fileURLToPath(import.meta.url));
const tdClassicMaps = JSON.parse(readFileSync(resolve(here, '../../../../packs/td/comrade/maps.json'), 'utf8')) as { name: string; description: string }[];
const raClassicMaps = JSON.parse(readFileSync(resolve(here, '../../../../packs/ra1/comrade/maps.json'), 'utf8')) as { name: string; description: string }[];

export const SIDE_PAGES: { path: string; filter: SideFilter }[] = [
  { path: '/kb/tiberian-dawn/gdi', filter: { packId: 'td', factionId: 'gdi', displayName: 'GDI' } },
  { path: '/kb/tiberian-dawn/nod', filter: { packId: 'td', factionId: 'nod', displayName: 'Nod' } },
  { path: '/kb/red-alert/allies', filter: { packId: 'ra1', factionId: 'allies', displayName: 'Allies' } },
  { path: '/kb/red-alert/soviets', filter: { packId: 'ra1', factionId: 'soviet', displayName: 'Soviets' } },
  { path: '/kb/dune/atreides', filter: { packId: 'dune', factionId: 'atreides', displayName: 'Atreides' } },
  { path: '/kb/dune/harkonnen', filter: { packId: 'dune', factionId: 'harkonnen', displayName: 'Harkonnen' } },
  { path: '/kb/dune/ordos', filter: { packId: 'dune', factionId: 'ordos', displayName: 'Ordos' } },
  { path: '/kb/red-alert-2/allies', filter: { packId: 'ra2', side: 'allies', displayName: 'Allies' } },
  { path: '/kb/red-alert-2/soviets', filter: { packId: 'ra2', side: 'soviets', displayName: 'Soviets' } },
];

function meta(path: string) {
  const found = pageByPath(path);
  if (!found) throw new Error(`Unknown page ${path}`);
  return found;
}

function sideLinks(paths: { href: string; name: string }[]): string {
  return `<ul>${paths.map(s => `<li><a href="${esc(s.href)}">${esc(s.name)}</a></li>`).join('')}</ul>`;
}

function classicMaps(maps: { name: string; description: string }[]): string {
  return `<ul>${maps.map(m => `<li><p><b>${esc(m.name)}</b> — ${esc(m.description)}</p></li>`).join('')}</ul>`;
}

const STYLE_HREF: Record<string, string> = {
  'td-classic': '/kb/classic-cnc',
  ra1: '/kb/classic-red-alert',
  'td-fusion': '/kb/tiberian-dawn',
  'ra1-fusion': '/kb/red-alert',
  dune2k: '/kb/dune',
  ra2: '/kb/red-alert-2',
  'fusion-leviathan': '/kb/leviathan-isles',
};

function gameListHtml(): { html: string; items: { name: string; path: string }[] } {
  const items = STYLES.map(style => ({ name: style.name, path: STYLE_HREF[style.id] ?? '/kb' }));
  const rows = STYLES.map(style => {
    const href = STYLE_HREF[style.id] ?? '/kb';
    const mp = style.lockstep
      ? 'Synchronized lockstep with optional AI.'
      : 'Lobby presence. Each commander fights the built-in enemy.';
    return `<h2><a href="${esc(href)}">${esc(style.name)}</a></h2><p>${esc(style.blurb)}</p><p>${esc(mp)}</p>`;
  }).join('\n');
  return { html: rows, items };
}

function sidePage(path: string, filter: SideFilter): RenderedPage {
  const pack = packById(filter.packId);
  const intro = SIDE_INTRO[path] ?? '';
  const countries = filter.side ? countrySectionsHtml(pack, filter.side) : '';
  const body = [
    intro,
    fidelityHtml(pack),
    h2('Upgrade progression'),
    upgradesHtml(pack, filter),
    h2('Superweapons'),
    superweaponsHtml(pack, filter),
    h2('Units'),
    unitsHtml(pack, filter),
    h2('Buildings'),
    structuresHtml(pack, filter),
    countries,
    `<p><a href="/kb/units">All units</a> · <a href="/kb/upgrades">All upgrades</a> · <a href="/kb/controls">Controls</a></p>`,
  ].join('\n');
  return { meta: meta(path), body };
}

function fusionOverview(path: string, packId: string, sides: { href: string; name: string }[]): RenderedPage {
  const pack = packById(packId);
  const body = [
    GAME_OVERVIEWS[path] ?? '',
    creditsHtml(pack),
    fidelityHtml(pack),
    h2('Sides'),
    sideLinks(sides),
    h2('Battlefields'),
    mapsHtml(pack),
    `<p><a href="/kb/how-to-play">How to play</a> · <a href="/kb/controls">Controls</a></p>`,
  ].join('\n');
  return { meta: meta(path), body, itemList: sides.map(s => ({ name: s.name, path: s.href })) };
}

export function buildPages(): RenderedPage[] {
  const games = gameListHtml();
  const pages: RenderedPage[] = [
    {
      meta: meta('/kb'),
      body: [
        INDEX_INTRO,
        h2('In this guide'),
        sideLinks(PAGES.filter(p => p.path !== '/kb').map(p => ({ href: p.path, name: p.navLabel }))),
      ].join('\n'),
      itemList: PAGES.filter(p => p.path !== '/kb').map(p => ({ name: p.title, path: p.path })),
    },
    { meta: meta('/kb/how-to-play'), body: HOW_TO_PLAY + `<p><a href="/kb/games">Games</a> · <a href="/kb/controls">Controls</a></p>` },
    { meta: meta('/kb/games'), body: games.html, itemList: games.items },
    { meta: meta('/kb/controls'), body: CONTROLS },
    {
      meta: meta('/kb/classic-cnc'),
      body: CLASSIC_CNC + classicMaps(tdClassicMaps)
        + p('For lockstep multiplayer on the same ground, play Tiberian Dawn Style.')
        + `<p><a href="/kb/tiberian-dawn">Tiberian Dawn Style</a> · <a href="/kb/tiberian-dawn/gdi">GDI</a> · <a href="/kb/tiberian-dawn/nod">Nod</a></p>`,
    },
    {
      meta: meta('/kb/classic-red-alert'),
      body: CLASSIC_RA + classicMaps(raClassicMaps)
        + p('For lockstep multiplayer with navies and superweapons, play Red Alert Style.')
        + `<p><a href="/kb/red-alert">Red Alert Style</a> · <a href="/kb/red-alert/allies">Allies</a> · <a href="/kb/red-alert/soviets">Soviets</a></p>`,
    },
    fusionOverview('/kb/tiberian-dawn', 'td', [
      { href: '/kb/tiberian-dawn/gdi', name: 'GDI' },
      { href: '/kb/tiberian-dawn/nod', name: 'Nod' },
    ]),
    fusionOverview('/kb/red-alert', 'ra1', [
      { href: '/kb/red-alert/allies', name: 'Allies' },
      { href: '/kb/red-alert/soviets', name: 'Soviets' },
    ]),
    fusionOverview('/kb/dune', 'dune', [
      { href: '/kb/dune/atreides', name: 'Atreides' },
      { href: '/kb/dune/harkonnen', name: 'Harkonnen' },
      { href: '/kb/dune/ordos', name: 'Ordos' },
    ]),
    fusionOverview('/kb/red-alert-2', 'ra2', [
      { href: '/kb/red-alert-2/allies', name: 'Allies' },
      { href: '/kb/red-alert-2/soviets', name: 'Soviets' },
    ]),
    {
      meta: meta('/kb/leviathan-isles'),
      body: [
        GAME_OVERVIEWS['/kb/leviathan-isles'],
        creditsHtml(packById('leviathan')),
        fidelityHtml(packById('leviathan')),
        h2('Battlefields'),
        mapsHtml(packById('leviathan')),
        h2('Armies'),
        p('Countries and units are the Red Alert 2 roster. Use those side guides for upgrades and units.'),
        sideLinks([
          { href: '/kb/red-alert-2/allies', name: 'Allies (Red Alert 2)' },
          { href: '/kb/red-alert-2/soviets', name: 'Soviets (Red Alert 2)' },
        ]),
      ].join('\n'),
    },
    ...SIDE_PAGES.map(s => sidePage(s.path, s.filter)),
    upgradesIndex(),
    unitsIndex(),
  ];
  const expected = new Set(PAGES.map(p => p.path));
  const got = new Set(pages.map(p => p.meta.path));
  for (const path of expected) if (!got.has(path)) throw new Error(`Missing page ${path}`);
  if (pages.length !== PAGES.length) throw new Error('Page count mismatch');
  return pages;
}

function upgradesIndex(): RenderedPage {
  const sections = SIDE_PAGES.map(({ path, filter }) => {
    const pack = packById(filter.packId);
    return `<h2><a href="${esc(path)}">${esc(filter.displayName)}</a> · ${esc(pack.name)}</h2>${upgradesHtml(pack, filter)}`;
  }).join('\n');
  return {
    meta: meta('/kb/upgrades'),
    body: p('Every Fusion building upgrade, grouped by side. Open a side page for the units each upgrade unlocks.') + sections,
    itemList: SIDE_PAGES.map(s => ({ name: s.filter.displayName, path: s.path })),
  };
}

function unitsIndex(): RenderedPage {
  const parts = [p('Every Fusion Engine unit, grouped by game and side. Classic C&C and Classic Red Alert use the original engines and are not listed here.')];
  const items: { name: string; path: string }[] = [];
  for (const { path, filter } of SIDE_PAGES) {
    const pack = packById(filter.packId);
    const { units } = sideRoster(filter);
    parts.push(`<h2><a href="${esc(path)}">${esc(filter.displayName)}</a> · ${esc(pack.name)}</h2>`);
    parts.push('<ul>');
    for (const unit of units.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      parts.push(`<li><a href="${esc(path)}#${esc(unit.id)}">${esc(unit.name)}</a> — ${unit.cost} credits</li>`);
    }
    parts.push('</ul>');
    items.push({ name: `${filter.displayName} units`, path });
  }
  return { meta: meta('/kb/units'), body: parts.join('\n'), itemList: items };
}

export function fileForPath(path: string): string {
  if (path === '/kb') return 'kb/index.html';
  return `${path.replace(/^\//, '')}.html`;
}

export function sitemapPaths(): string[] {
  return [...PAGES.map(p => p.path), ...EXTRA_SITEMAP_PATHS];
}

export function renderedDocuments(): { file: string; html: string }[] {
  return buildPages().map(page => ({ file: fileForPath(page.meta.path), html: renderDocument(page) }));
}

export { robotsTxt, sitemapXml, PACKS, sideRoster };
