import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { writeKnowledgebase } from './build';

/** Emit `/kb` HTML, robots.txt and sitemap.xml into `public/` before Vite copies it. */
export function kbPlugin(root = process.cwd()): Plugin {
  const emit = () => writeKnowledgebase(resolve(root, 'public'));
  return {
    name: 'comrade-kb',
    buildStart() { emit(); },
    configureServer() { emit(); },
  };
}
