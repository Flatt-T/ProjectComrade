# Player knowledgebase (`/kb`) and HelpDot indexing

The public game guide lives at `https://projectcomrade.thunderchildcreativetechnologies.com/kb`.
Each article is a real HTML file (not the React shell) so search engines and the HelpDot.me
widget can index headings and body text.

Unit and upgrade facts are generated from Fusion rule packs at web build time
(`apps/web/src/kb/`). How-to-play copy is hand-written in `prose.ts`.

## After every production deploy

1. Open the HelpDot dashboard for the **Project Comrade** site.
2. Knowledge Base tab → Documentation Sources.
3. Add a source if it is not already there:
   - Type: **sitemap**
   - URL: `https://projectcomrade.thunderchildcreativetechnologies.com/sitemap.xml`
   - Label: `Project Comrade guide`
4. Click **Sync**. Wait until the job finishes.
5. Indexed Pages should list `/kb`, `/kb/how-to-play`, each game and side article, `/kb/units`
   and `/kb/upgrades`. Spot-check a side page (for example Atreides) and confirm chunks exist.
6. Ask the in-game widget a question the guide covers (“How do I play House Atreides?”). The
   answer should cite the guide, not invent pack stats.

Re-sync after a release that changes packs or guide copy. The widget API key in `index.html`
only loads the chat; sitemap registration needs the HelpDot admin session (or a Cognito JWT to
`POST /api/sites/{siteId}/kb/sources` and `.../sync`).

## Local check

`pnpm --filter @comrade/web prebuild` (vite-node) writes `apps/web/public/kb/`, `robots.txt` and
`sitemap.xml`. With the service’s `STATIC_ROOT` pointing at `apps/web/dist` (production) or
Vite serving `public/` (dev), `GET /kb/dune/atreides` must return that article’s HTML, not
`index.html`.
