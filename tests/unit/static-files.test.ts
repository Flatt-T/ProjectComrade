import { describe, expect, it } from 'vitest';
import { APP_ROUTES, publicFileCandidates } from '../../apps/service/src/static';

describe('static file candidates', () => {
  it('serves the SPA shell for app routes and real files for the guide', () => {
    expect(APP_ROUTES.test('/kb')).toBe(false);
    expect(APP_ROUTES.test('/kb/dune/atreides')).toBe(false);
    expect(APP_ROUTES.test('/legal/terms')).toBe(true);
    expect(publicFileCandidates('/')).toEqual(['/index.html']);
    expect(publicFileCandidates('/tiers')).toEqual(['/index.html']);
    expect(publicFileCandidates('/kb')).toEqual(['/kb.html', '/kb/index.html']);
    expect(publicFileCandidates('/kb/')).toEqual(['/kb.html', '/kb/index.html']);
    expect(publicFileCandidates('/kb/dune/atreides')).toEqual([
      '/kb/dune/atreides.html', '/kb/dune/atreides/index.html',
    ]);
    expect(publicFileCandidates('/sitemap.xml')).toEqual(['/sitemap.xml']);
    expect(publicFileCandidates('/robots.txt')).toEqual(['/robots.txt']);
    expect(publicFileCandidates('/ads.txt')).toEqual(['/ads.txt']);
  });

  it('rejects path traversal', () => {
    expect(publicFileCandidates('/kb/../../etc/passwd')).toEqual([]);
  });
});
