import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderedDocuments, sitemapPaths } from './pages';
import { robotsTxt, sitemapXml } from './html';

/** Write crawlable HTML, robots.txt and sitemap.xml into the Vite public directory. */
export function writeKnowledgebase(publicDir: string): void {
  mkdirSync(publicDir, { recursive: true });
  rmSync(join(publicDir, 'kb'), { recursive: true, force: true });
  for (const { file, html } of renderedDocuments()) {
    const full = join(publicDir, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, html, 'utf8');
  }
  writeFileSync(join(publicDir, 'robots.txt'), robotsTxt(), 'utf8');
  writeFileSync(join(publicDir, 'sitemap.xml'), sitemapXml(sitemapPaths()), 'utf8');
}
