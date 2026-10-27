/** Public origin used in canonical URLs, Open Graph and the sitemap. */
export const SITE_ORIGIN = 'https://projectcomrade.thunderchildcreativetechnologies.com';

/** Same public widget key as apps/web/index.html — this is the site embed key, not a secret. */
export const HELPDOT_API_KEY = 'sh_03a26280997620149987f25eb65ab5d5da66ee4a9d3127fd';

export interface PageMeta {
  /** Absolute site path, no trailing slash except the guide home `/kb`. */
  path: string;
  title: string;
  description: string;
  group: string;
  navLabel: string;
}

export const PAGES: PageMeta[] = [
  {
    path: '/kb', title: 'Project Comrade game guide',
    description: 'How to play Project Comrade in the browser: games, sides, upgrades, units, controls and the war room.',
    group: 'Play', navLabel: 'Guide home',
  },
  {
    path: '/kb/how-to-play', title: 'How to play Project Comrade',
    description: 'Enter a callsign, create or join a war-room game, pick a style and a side, then deploy. No install.',
    group: 'Play', navLabel: 'How to play',
  },
  {
    path: '/kb/games', title: 'Games available in Project Comrade',
    description: 'Classic C&C, Classic Red Alert, Tiberian Dawn Style, Red Alert Style, Dune Style, Red Alert 2 Style and Leviathan Isles.',
    group: 'Play', navLabel: 'Games',
  },
  {
    path: '/kb/controls', title: 'Project Comrade controls',
    description: 'Mouse, keyboard and touch controls for Fusion Engine matches, including teams, attack-move and the tech tree.',
    group: 'Play', navLabel: 'Controls',
  },
  {
    path: '/kb/classic-cnc', title: 'Classic C&C in Project Comrade',
    description: 'Play Tiberian Dawn on the original GPL engine with freeware art. Each commander fights the built-in enemy.',
    group: 'Classic', navLabel: 'Classic C&C',
  },
  {
    path: '/kb/classic-red-alert', title: 'Classic Red Alert in Project Comrade',
    description: 'Play Red Alert on the original GPL engine. Greece and the USSR, freeware content, two authored battlefields.',
    group: 'Classic', navLabel: 'Classic Red Alert',
  },
  {
    path: '/kb/tiberian-dawn', title: 'Tiberian Dawn Style on the Fusion Engine',
    description: 'GDI versus Nod with spreading Tiberium, building upgrades, the Ion Cannon and the Temple of Nod.',
    group: 'Fusion', navLabel: 'Tiberian Dawn',
  },
  {
    path: '/kb/red-alert', title: 'Red Alert Style on the Fusion Engine',
    description: 'Allies versus Soviets with ore and gems, navies, the Chronosphere, the Iron Curtain and Tesla coils.',
    group: 'Fusion', navLabel: 'Red Alert',
  },
  {
    path: '/kb/dune', title: 'Dune Style on the Fusion Engine',
    description: 'House Atreides, Harkonnen and Ordos on Arrakis: spice, sandworms, rock-only building and Palace powers.',
    group: 'Fusion', navLabel: 'Dune',
  },
  {
    path: '/kb/red-alert-2', title: 'Red Alert 2 Style on the Fusion Engine',
    description: 'Nine countries on two sides. Prism and Tesla tech, Chrono Miners, country specials and battle-lab upgrades.',
    group: 'Fusion', navLabel: 'Red Alert 2',
  },
  {
    path: '/kb/leviathan-isles', title: 'Fusion: Leviathan Isles',
    description: 'Red Alert 2 armies on a worm-infested archipelago. Thin ore at home, riches in the centre, sandworms in the sea.',
    group: 'Fusion', navLabel: 'Leviathan Isles',
  },
  {
    path: '/kb/tiberian-dawn/gdi', title: 'GDI in Tiberian Dawn Style',
    description: 'How to play GDI in Project Comrade: Mammoth Tanks, the Ion Cannon, Dropship Bay, upgrades and the full unit list.',
    group: 'Sides', navLabel: 'GDI',
  },
  {
    path: '/kb/tiberian-dawn/nod', title: 'Nod in Tiberian Dawn Style',
    description: 'How to play the Brotherhood of Nod: stealth, the Obelisk, nuclear strike, chemical missiles and Nod units.',
    group: 'Sides', navLabel: 'Nod',
  },
  {
    path: '/kb/red-alert/allies', title: 'Allies in Red Alert Style',
    description: 'How to play the Allies in Project Comrade: Tanya, Chronosphere, navy, artillery upgrade and Allied units.',
    group: 'Sides', navLabel: 'Allies (Red Alert)',
  },
  {
    path: '/kb/red-alert/soviets', title: 'Soviets in Red Alert Style',
    description: 'How to play the Soviets in Project Comrade: heavy tanks, Tesla coils, Iron Curtain, nuke and Soviet units.',
    group: 'Sides', navLabel: 'Soviets (Red Alert)',
  },
  {
    path: '/kb/dune/atreides', title: 'House Atreides in Dune Style',
    description: 'How to play House Atreides: Fremen war parties, Sonic Tank, Grenadiers, Construction Yard upgrades and units.',
    group: 'Sides', navLabel: 'Atreides',
  },
  {
    path: '/kb/dune/harkonnen', title: 'House Harkonnen in Dune Style',
    description: 'How to play House Harkonnen: Sardaukar, Devastator, Death Hand, factory upgrades and Harkonnen units.',
    group: 'Sides', navLabel: 'Harkonnen',
  },
  {
    path: '/kb/dune/ordos', title: 'House Ordos in Dune Style',
    description: 'How to play House Ordos: Raiders, Deviator, Saboteur cell, CHOAM Starport prices and Ordos upgrades.',
    group: 'Sides', navLabel: 'Ordos',
  },
  {
    path: '/kb/red-alert-2/allies', title: 'Allies in Red Alert 2 Style',
    description: 'America, Britain, France, Germany and Korea: Prism Tanks, Chronosphere, Weather Control and Allied units.',
    group: 'Sides', navLabel: 'Allies (Red Alert 2)',
  },
  {
    path: '/kb/red-alert-2/soviets', title: 'Soviets in Red Alert 2 Style',
    description: 'Russia, Cuba, Iraq and Libya: Apocalypse Tanks, Iron Curtain, nuclear missile, Tesla and Soviet units.',
    group: 'Sides', navLabel: 'Soviets (Red Alert 2)',
  },
  {
    path: '/kb/upgrades', title: 'Upgrade progression for every side',
    description: 'Building upgrade ladders for GDI, Nod, Allies, Soviets, Atreides, Harkonnen, Ordos and Red Alert 2 countries.',
    group: 'Reference', navLabel: 'Upgrades',
  },
  {
    path: '/kb/units', title: 'Units in Project Comrade',
    description: 'Every Fusion Engine unit by game and side, with cost and what you need to build it. Linked to each side guide.',
    group: 'Reference', navLabel: 'Units',
  },
];

export function pageByPath(path: string): PageMeta | undefined {
  return PAGES.find(p => p.path === path);
}

export function canonicalUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

export const LEGAL_SITEMAP_PATHS = [
  '/legal/terms', '/legal/privacy', '/legal/refunds', '/legal/cookies', '/legal/acceptable-use',
];

export const EXTRA_SITEMAP_PATHS = ['/', '/tiers', ...LEGAL_SITEMAP_PATHS];
