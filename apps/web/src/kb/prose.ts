import { esc } from './escape';

export const DISCLAIMER = `<p class="kb-note">Project Comrade is an unofficial community project. It is not affiliated with Electronic Arts, Westwood Studios or any other rights holder. Trade marks belong to their owners and are used only to describe what a game style replicates. Fusion Engine values approximate the classics and are tuned over time.</p>`;

export function p(text: string): string {
  return `<p>${esc(text)}</p>`;
}

export function h2(text: string): string {
  return `<h2>${esc(text)}</h2>`;
}

export const HOW_TO_PLAY = [
  h2('Start in the war room'),
  p('Open Project Comrade in your browser. Type a callsign of 1 to 24 characters. You do not need an account to play as a guest.'),
  p('The war room lists public games. Create a game and share the invite link, or join with a room code. Hosts pick the game style, the battlefield, how many humans can sit, optional AI opponents, starting credits, tech level, and other match options.'),
  h2('Pick a style and a side'),
  p('Classic C&C and Classic Red Alert run the original engines. Each commander fights the built-in enemy on the chosen map. Fusion styles run the Comrade Fusion Engine with synchronized multiplayer: you fight other humans, optional AI, or both.'),
  p('Each player picks a side. In Red Alert 2 Style and Leviathan Isles you pick a country. GDI and Nod play Tiberian Dawn. Allies and Soviets play Red Alert. House Atreides, Harkonnen and Ordos play Dune.'),
  h2('Deploy'),
  p('When everyone is ready, the host starts the match. Guests and free accounts may see a short advertisement while the simulation is already running. Subscribers go straight in.'),
  p('Build a base, harvest, and destroy the enemy construction yards. Press F1 in a Fusion match for controls, and F2 for the tech tree.'),
  h2('Lobby settings'),
  p('Starting credits: low, standard or high, from the rule pack. Tech level 3, 6, 10 or 15 caps what you can build. Sandworm activity, resource renewal, superweapon recharge, bonus crates and game speed are host sliders on Fusion matches.'),
  p('Keep silos and refineries up. Credits that will not fit in storage are lost on delivery. A second factory of the same kind doubles that queue\'s build rate. Low power halves production and shuts down powered defences and superweapons.'),
].join('\n');

export const CONTROLS = [
  h2('Mouse and keyboard'),
  p('Left click selects. Left click also orders move, attack or harvest. Right click deselects or cancels. Drag a box to select many units. Shift plus click or drag adds or removes. Double-click selects every unit of that type on screen.'),
  p('Ctrl plus click force-fires at any target or the ground. Alt plus click force-moves. Ctrl plus 1 to 9 creates a team. 1 to 9 selects that team; press twice to centre on it. Shift plus 1 to 9 adds a team to the selection. Alt plus 1 to 9 adds the selection to a team.'),
  p('T selects the same type (twice: the whole map). P selects all combat units. G guard. X scatter. S stop. D deploy. A attack-move. H jumps home. Space jumps to the last alert. Esc cancels. F1 opens this help. F2 opens the tech tree. M mutes.'),
  p('Click a selected MCV to deploy it. The mouse wheel zooms. Arrow keys and the screen edge scroll the map.'),
  h2('Special orders'),
  p('An Engineer on a building captures an enemy structure or repairs one of yours. A Spy infiltrates. Park a damaged vehicle on a repair pad. Aircraft rearm at an airfield. Units on your transport board it; D unloads.'),
  p('D also digs in G.I.s, sets up Desolators and starts Thumpers. The Chronosphere is two steps: pick the area, then the destination.'),
  h2('Touch'),
  p('Tap to select. Tap again to order move, attack or harvest. Drag to move the map. Pinch to zoom. Hold then drag to box-select. Hold or double-tap a unit to select all of that type on screen. Two-finger tap deselects. Buildings: tap a ready item in the drawer, tap the map to place the outline, tap the outline to build.'),
].join('\n');

export const SIDE_INTRO: Record<string, string> = {
  '/kb/tiberian-dawn/gdi': [
    p('GDI wins with armour and firepower. Expand to Tiberium, put a second Weapons Factory down, and upgrade it before you roll Mammoths. The Ion Cannon and Dropship Bay close games. Keep power up or the Advanced Guard Towers go dark.'),
    p('Start with an MCV, three Minigunners and a Hum-vee. Open the tech tree with F2 to see what the Construction Yard and Weapons Factory upgrades unlock.'),
  ].join('\n'),
  '/kb/tiberian-dawn/nod': [
    p('Nod wins with speed, stealth and pressure. Buggies and bikes scout. Stealth Tanks and the Obelisk punish slow GDI pushes. The Temple upgrade opens the Chemical Missile. A Stealth Field hides your base while you set the nuclear strike.'),
    p('Start with an MCV, three Minigunners and a Buggy. Upgrade the Airstrip before you call in bombers, Stealth Tanks and SSM Launchers.'),
  ].join('\n'),
  '/kb/red-alert/allies': [
    p('The Allies are mobile and they own the water. Rangers and a navy hold the early map. Tanya and the Chronosphere decide the late game. Upgrade the War Factory so Allied artillery and the Mobile Gap Generator come online. The Weather Control Device is your storm.'),
    p('Start with an MCV, three Rifle Infantry and a Ranger. Build an Allied Airbase for your own helicopters and paratroopers. Do not skip the navy on water maps.'),
  ].join('\n'),
  '/kb/red-alert/soviets': [
    p('The Soviets grind. Heavy tanks, Tesla coils, dogs and numbers. The Iron Curtain saves a push. The Missile Silo ends a base. Upgrade the War Factory on the way to Mammoths. The Airfield sends Badger paratroopers.'),
    p('Start with an MCV, three Conscripts and an Attack Dog. Keep Tesla coils powered. A second War Factory doubles the tank line.'),
  ].join('\n'),
  '/kb/dune/atreides': [
    p('House Atreides fights with honour, Grenadiers and sound. Build only on rock. Lay concrete or new buildings start at half health. Spice blooms and sandworms make every harvest a risk. The Palace calls a Fremen war party with worm riders. After the Palace upgrade, the Sonic Array walks a barrage across the target.'),
    p('The Construction Yard upgrades three times. That ladder opens advanced windtraps, the Starport, IX and the Palace. Upgrade the Heavy Factory twice for siege tanks and the Heavy Harvester. The Sonic Tank is yours alone.'),
  ].join('\n'),
  '/kb/dune/harkonnen': [
    p('House Harkonnen is brute force. Sardaukar, Devastators and the Death Hand. Same rock-and-concrete rules as the other houses. Upgrade factories on the same ladder, then the Palace. After the Palace upgrade, the Drop Platform delivers Devastators to your base.'),
    p('Keep Carryalls on the spice. Worms eat harvesters that linger on open sand. A second Heavy Factory doubles the armour queue.'),
  ].join('\n'),
  '/kb/dune/ordos': [
    p('House Ordos buys time and tricks. Raiders are fast. The Deviator turns enemy vehicles. The Palace sends a Saboteur cell to your base. After the Palace upgrade, the CHOAM Observation Post reveals the map. The Starport sells units at a drifting price. The Scrambler Field hides your base.'),
    p('Watch the CHOAM price. Sometimes the Starport is cheaper than the factory. Upgrade Light Factory for the Quad, and High Tech Factory for assault ornithopters.'),
  ].join('\n'),
  '/kb/red-alert-2/allies': [
    p('The Allied nations share one arsenal and each country adds one special. America drops paratroopers from Airforce Command HQ. Britain trains the Sniper. France builds the Grand Cannon. Germany builds the Tank Destroyer. Korea flies the Black Eagle.'),
    p('Chrono Miners teleport home with ore. Prism Towers and Prism Tanks reward good power. Upgrade the War Factory and Battle Lab. The Chronosphere, Weather Control Device and Prism Array are the late Allied powers.'),
  ].join('\n'),
  '/kb/red-alert-2/soviets': [
    p('The Soviet countries share one arsenal and each adds one special. Russia builds the Tesla Tank. Cuba trains the Terrorist. Iraq trains the Desolator. Libya builds the Demolition Truck.'),
    p('Rhino Tanks and Conscripts hold the line. Kirovs and Apocalypse Tanks finish. Upgrade the War Factory and Battle Lab. The Iron Curtain, Nuclear Missile and Airlift Command (Apocalypse and Rhino at your base) are the late Soviet powers.'),
  ].join('\n'),
};

export const GAME_OVERVIEWS: Record<string, string> = {
  '/kb/tiberian-dawn': [
    p('Tiberian Dawn Style is GDI versus Nod on the Comrade Fusion Engine. The two-player battlefields match the Classic C&C maps cell for cell. You also get Fusion-only maps. Multiplayer is lockstep. You may add up to three AI opponents.'),
    p('Tiberium spreads. Upgrade the Construction Yard, then the Weapons Factory (GDI) or Airstrip (Nod). Superweapons are the Ion Cannon, Dropship reinforcements, Satellite Sweep, nuclear strike, Chemical Missile and Stealth Field.'),
  ].join('\n'),
  '/kb/red-alert': [
    p('Red Alert Style is Allies versus Soviets on land, sea and air. Ore and gems fund the war. Navies matter on water maps. Building upgrades unlock artillery, gap generators, Mammoths and the late powers.'),
    p('Allied late game: Chronosphere, GPS, Weather Control. Soviet late game: Iron Curtain, nuclear missile, Tesla storm. Each side has its own air facility and paratroopers.'),
  ].join('\n'),
  '/kb/dune': [
    p('Dune Style is House Atreides, Harkonnen and Ordos. You may only build on rock. Concrete slabs keep new buildings at full health. Spice blooms seed new fields. Sandworms hunt open sand. The Starport sells units at a changing CHOAM price. Units can earn veteran and elite ranks.'),
    p('The Construction Yard upgrades three times. Barracks, Light Factory, Heavy Factory, High Tech Factory and Palace each unlock a rung of the house. Every house has a Palace power and a second power after the Palace upgrade.'),
  ].join('\n'),
  '/kb/red-alert-2': [
    p('Red Alert 2 Style is isometric. You pick a country, not only a side. Nine countries sit on two sides. Each country brings one national special. Ore regrows. Chrono Miners teleport. Units earn veteran and elite ranks.'),
    p('Upgrade the Construction Yard, the War Factory and the Battle Lab. Labs also unlock ore purifiers, spy satellites, industrial plants, cloning vats and psychic sensors. Superweapons are balanced by class with the other Fusion packs.'),
  ].join('\n'),
  '/kb/leviathan-isles': [
    p('Leviathan Isles is a community fusion. The armies, countries and superweapons are Red Alert 2. The map is an archipelago. Each home island has too little ore to win. The real wealth sits on the central island. Dune sandworms hunt water and sand, especially near resource fields.'),
    p('Play it like Red Alert 2, but respect the worms. Short harvester runs, navy as a gamble, and a fight for the centre. Pick the same countries as Red Alert 2 Style.'),
  ].join('\n'),
};

export const INDEX_INTRO = [
  p('Project Comrade is a browser RTS. Enter a callsign, create or join a game, pick a style and a side, and deploy. Nothing to install.'),
  p('This guide is the player knowledgebase: how to play, every game on the roster, every side, the upgrade ladders, and the units. Open the in-game help chat if something is broken.'),
  p('Classic C&C and Classic Red Alert run original GPL engines with freeware art. The Fusion styles are independent replications with original procedural art.'),
].join('\n');

export const CLASSIC_CNC = [
  p('Classic C&C is Tiberian Dawn on the original GPL engine (Vanilla Conquer compiled to WebAssembly) with freeware artwork. Each commander fights the built-in enemy on the map the host chose. You share a lobby, not a lockstep match against other humans.'),
  p('Sides are GDI and Nod. The authentic 640×400 framebuffer can use an optional Enhanced view; that is a render filter, not redrawn HD art.'),
  h2('Battlefields'),
].join('\n');

export const CLASSIC_RA = [
  p('Classic Red Alert runs the original GPL engine with freeware content. Each commander fights the built-in enemy. Allies (Greece) and Soviets (USSR) are the sides.'),
  h2('Battlefields'),
].join('\n');
