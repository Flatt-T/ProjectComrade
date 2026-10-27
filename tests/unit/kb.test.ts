import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../apps/web/src/kb/catalog';
import { writeKnowledgebase } from '../../apps/web/src/kb/build';
import { buildPages, fileForPath, SIDE_PAGES, sitemapPaths } from '../../apps/web/src/kb/pages';
import { describeSuperweapon, packById, sideRoster } from '../../apps/web/src/kb/fromPacks';
import { PACKS } from '../../packages/fusion/src/index';
import { renderDocument } from '../../apps/web/src/kb/html';
import { esc } from '../../apps/web/src/kb/escape';

describe('player knowledgebase', () => {
  const pages = buildPages();

  it('emits every catalog path with a unique title and description', () => {
    expect(pages.map(p => p.meta.path).sort()).toEqual(PAGES.map(p => p.path).sort());
    const titles = pages.map(p => p.meta.title);
    const descriptions = pages.map(p => p.meta.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('renders crawlable HTML with one h1 and a meta description', () => {
    for (const page of pages) {
      const html = renderDocument(page);
      expect(html).toContain('<html lang="en">');
      expect(html.match(/<h1>/g)?.length).toBe(1);
      expect(html).toContain(`<h1>${esc(page.meta.title)}</h1>`);
      expect(html).toContain(`<meta name="description" content="${esc(page.meta.description)}"`);
      expect(html).toContain(`<link rel="canonical" href="https://projectcomrade.thunderchildcreativetechnologies.com${page.meta.path}"`);
      expect(html).toContain('helpdot.me/api/widget/embed.js');
    }
  });

  it('lists every Fusion unit and upgradeable building on the matching side page', () => {
    const htmlByPath = Object.fromEntries(pages.map(p => [p.meta.path, p.body]));
    for (const { path, filter } of SIDE_PAGES) {
      const body = htmlByPath[path];
      expect(body, path).toBeTruthy();
      const { units, upgradeable } = sideRoster(filter);
      expect(units.length, `${path} units`).toBeGreaterThan(0);
      for (const unit of units) {
        expect(body, `${path} missing ${unit.name}`).toContain(unit.name);
      }
      for (const building of upgradeable) {
        expect(body, `${path} missing upgrade ${building.name}`).toContain(building.name);
      }
    }
  });

  it('covers Leviathan units on the Red Alert 2 side pages', () => {
    const ra2 = pages.filter(p => p.meta.path.startsWith('/kb/red-alert-2/')).map(p => p.body).join('\n');
    for (const unit of Object.values(PACKS.leviathan.units)) {
      expect(ra2, `Leviathan unit ${unit.name}`).toContain(unit.name);
    }
    for (const building of Object.values(PACKS.leviathan.structures).filter(s => (s.upgrades ?? 0) > 0)) {
      expect(ra2, `Leviathan upgrade ${building.name}`).toContain(building.name);
    }
  });

  it('puts every catalog slug in the sitemap and writes real HTML files', () => {
    const listed = sitemapPaths();
    for (const page of PAGES) expect(listed).toContain(page.path);
    expect(listed).toContain('/');
    expect(listed).toContain('/tiers');
    expect(listed).toContain('/legal/terms');

    const dir = mkdtempSync(join(tmpdir(), 'comrade-kb-'));
    try {
      writeKnowledgebase(dir);
      const sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
      const robots = readFileSync(join(dir, 'robots.txt'), 'utf8');
      expect(robots).toContain('Sitemap: https://projectcomrade.thunderchildcreativetechnologies.com/sitemap.xml');
      expect(robots).toContain('Disallow: /account');
      for (const page of PAGES) {
        expect(sitemap).toContain(`https://projectcomrade.thunderchildcreativetechnologies.com${page.path}`);
        const html = readFileSync(join(dir, fileForPath(page.path)), 'utf8');
        expect(html).toContain('<h1>');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves pack names for prerequisite copy', () => {
    const td = packById('td');
    expect(td.units.mammoth.name).toBe('Mammoth Tank');
  });

  it('describes Conquer superweapons by the action they perform', () => {
    const pack = PACKS.conquer;
    const dish = pack.structures['d-superlaser'];
    const laser = Array.isArray(dish.superweapon) ? dish.superweapon[0] : dish.superweapon!;
    const laserCopy = describeSuperweapon(pack, dish, laser).toLowerCase();
    expect(laserCopy).toContain('laser');
    expect(laserCopy).not.toContain('missile');

    const array = pack.structures['d-tractor'];
    const tractor = Array.isArray(array.superweapon) ? array.superweapon[0] : array.superweapon!;
    expect(describeSuperweapon(pack, array, tractor).toLowerCase()).toContain('pull');

    const gen = pack.structures['l-shield'];
    const shield = Array.isArray(gen.superweapon) ? gen.superweapon[0] : gen.superweapon!;
    const shieldCopy = describeSuperweapon(pack, gen, shield).toLowerCase();
    expect(shieldCopy).toContain('shield');
    expect(shieldCopy).toContain('infantry');
  });
});
