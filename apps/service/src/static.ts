import { extname } from 'node:path';

/**
 * Paths the single-page app owns. A deep link to one of these is served index.html so the
 * router can take over. `/kb` is not listed: those URLs are real HTML files for crawlers.
 */
export const APP_ROUTES = /^\/(?:account|billing|tiers|legal|signin|register|commanders|match|vote)(?:\/|$)/;

/**
 * Relative file paths to try, in order, for a GET of `pathname`.
 * Extensionless `/kb/dune/atreides` becomes `.../atreides.html` then `.../atreides/index.html`.
 */
export function publicFileCandidates(pathname: string): string[] {
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('..')) return [];
  const clean = pathname.replace(/\\/g, '/');
  const ext = extname(clean);
  if (ext) return [clean];
  const trimmed = clean.replace(/\/+$/, '') || '/';
  if (trimmed === '/') return ['/index.html'];
  if (APP_ROUTES.test(trimmed)) return ['/index.html'];
  return [`${trimmed}.html`, `${trimmed}/index.html`];
}
