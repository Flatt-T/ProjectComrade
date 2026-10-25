export interface EngineModule {
  comradePointerInside?: boolean;
  UTF8ToString(pointer: number): string;
  _comrade_snapshot?(): number;
  _comrade_audio?(): void;
  ccall?(name: string, result: string, types: string[], values: (number | string)[]): number;
  /** Emscripten's loop control, exported by engine builds from 2026-10-25 onward. */
  pauseMainLoop?(): void;
  /** Audio contexts the engine holds, if its build exposes them. */
  SDL2?: { audioContext?: { close(): Promise<void>; state: string } };
  AL?: { currentCtx?: { audioCtx?: { close(): Promise<void>; state: string } } };
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, bytes: Uint8Array): void;
    readFile(path: string): Uint8Array;
    chdir(path: string): void;
  };
  callMain(args: string[]): void;
}

/**
 * Stop a running classic engine: pause its main loop and silence it. Returns false when the
 * loaded build exports no way to stop, in which case the caller has to reload the page -
 * an Emscripten module started with callMain owns the main loop until the document goes.
 */
export function stopEngine(engine: EngineModule | null | undefined): boolean {
  if (!engine) return true;
  let stopped = false;
  try { if (typeof engine.pauseMainLoop === 'function') { engine.pauseMainLoop(); stopped = true; } } catch { /* already gone */ }
  for (const ctx of [engine.SDL2?.audioContext, engine.AL?.currentCtx?.audioCtx]) {
    try { if (ctx && ctx.state !== 'closed') void ctx.close(); } catch { /* already closed */ }
  }
  return stopped;
}

export interface LocalGameFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

// Files stay in the browser's volatile MEMFS. Nothing is uploaded or persisted.
export async function mountGameFiles(engine: EngineModule, files: LocalGameFile[]) {
  if (!files.length) throw new Error('Select your original game data first.');
  const names = new Set<string>();
  let total = 0;
  const entries = files.map(file => {
    const name = file.name.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_.-]{0,127}$/.test(name) || name.includes('..')) {
      throw new Error(`Unsupported game filename: ${file.name}`);
    }
    if (names.has(name)) throw new Error(`Duplicate game filename: ${name}`);
    names.add(name);
    total += file.size;
    if (total > 512 * 1024 * 1024) throw new Error('Import limit is 512 MiB per session.');
    return { file, name };
  });
  engine.FS.mkdirTree('/comrade/data');
  for (const { file, name } of entries) {
    engine.FS.writeFile(`/comrade/data/${name}`, new Uint8Array(await file.arrayBuffer()));
  }
  for (const name of ['CONQUER.INI', 'REDALERT.INI']) {
    const original = names.has(name) ? new TextDecoder().decode(engine.FS.readFile(`/comrade/data/${name}`)) : '';
    const configured = original.replace(/^\s*(DataPath|UserPath)\s*=.*$/gmi, '') + '\n[Paths]\nDataPath=/comrade/data\nUserPath=/comrade/data\n';
    engine.FS.writeFile(`/comrade/data/${name}`, new TextEncoder().encode(configured));
  }
  engine.FS.chdir('/comrade/data');
  return entries.map(entry => entry.name);
}

export async function loadEngine(game: 'td' | 'ra', canvas: HTMLCanvasElement, print: (line: string) => void, faction: Faction = 'gdi'): Promise<EngineModule> {
  const name = game === 'td' ? 'vanillatd' : 'vanillara';
  return loadNamedEngine(name, canvas, print, faction);
}

async function loadNamedEngine(name: 'vanillatd' | 'vanillara', canvas: HTMLCanvasElement, print: (line: string) => void, faction: Faction): Promise<EngineModule> {
  const healthResponse = await fetch('/health', { cache: 'no-store' });
  if (!healthResponse.ok) throw new Error('Cannot resolve the deployed engine version');
  const { commit } = await healthResponse.json();
  if (typeof commit !== 'string' || !/^(development|[a-f0-9]{40})$/.test(commit)) throw new Error('Invalid deployed engine version');
  // The public edge caches JS/WASM independently of the hashed application bundle.
  const version = encodeURIComponent(commit);
  const url = `/engines/${name}.js?release=${version}`;
  const { default: factory } = await import(/* @vite-ignore */ url);
  const engine = await factory({
    canvas, noInitialRun: true, thisProgram: '/comrade/data/engine', comradeFaction: faction, comradePointerInside: false,
    locateFile: (file: string) => `/engines/${file}?release=${version}`,
    print, printErr: print,
    onAbort: (reason: string) => print(`Engine aborted: ${reason}`),
  });
  if (!engine.FS || typeof engine.callMain !== 'function') throw new Error('Engine is missing required filesystem or launch exports');
  canvas.addEventListener('pointermove', () => { engine.comradePointerInside = true; });
  canvas.addEventListener('pointerenter', () => { engine.comradePointerInside = true; });
  canvas.addEventListener('pointerleave', () => { engine.comradePointerInside = false; });
  return engine;
}
import { CREDITS_VALUES, Faction, MatchSettings, MAP_ID, parseContentManifest, DEFAULT_SETTINGS } from '@comrade/contracts';

/** Put the human on the Soviet side of an authored Red Alert scenario. */
function applyRaScenario(ini: string, faction: Faction, settings: MatchSettings): string {
  let text = ini;
  if (faction === 'soviet') {
    text = text.replace('Player=Greece', 'Player=USSR');
    // Open the camera on the Soviet base instead of the Allied one.
    const home = /^SovietHome=(\d+)$/m.exec(text)?.[1];
    if (home) text = text.replace(/^98=\d+$/m, `98=${home}`);
  }
  const credits = CREDITS_VALUES[settings.credits];
  text = text.replace(/^Credits=60$/gm, `Credits=${credits}`);
  text = text.replace(/^BuildLevel=\d+$/m, `BuildLevel=${settings.techLevel}`);
  return text;
}

// Flip the authored scenario so the human commands Nod, and apply the lobby's
// economy/tech settings. Every authored map shares this structure, so the swap is generic.
function applyScenario(ini: string, faction: Faction, settings: MatchSettings): string {
  let text = ini;
  if (faction === 'nod') {
    text = text
      .replace('Player=GoodGuy', 'Player=BadGuy')
      .replace('WIN=All Destr.,Win,0,BadGuy', 'WIN=All Destr.,Win,0,GoodGuy')
      .replace('LOSE=All Destr.,Lose,0,GoodGuy', 'LOSE=All Destr.,Lose,0,BadGuy')
      .replace('RAID=Time,Reinforce.,10,BadGuy', 'RAID=Time,Reinforce.,10,GoodGuy')
      .replace('RAID=BadGuy,', 'RAID=GoodGuy,');
    // Open the camera on the Nod base rather than the GDI one.
    const nodHome = /^NodHome=(\d+)$/m.exec(text)?.[1];
    if (nodHome) text = text.replace(/^26=\d+$/m, `26=${nodHome}`);
  }
  const credits = CREDITS_VALUES[settings.credits];
  text = text.replace(/^Credits=60$/gm, `Credits=${credits}`);
  text = text.replace(/^BuildLevel=\d+$/m, `BuildLevel=${settings.techLevel}`);
  return text;
}

export interface ContentSelection { faction: Faction; mapId?: string; settings?: MatchSettings; engine?: 'td' | 'ra' }

export async function mountBundledContent(engine: EngineModule, selection: ContentSelection, progress: (message: string) => void) {
  const faction = selection.faction;
  const settings = selection.settings ?? DEFAULT_SETTINGS;
  const pack = selection.engine ?? 'td';
  const response = await fetch(`/content/${pack}/manifest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Content pack unavailable');
  const manifest = parseContentManifest(await response.json());
  const chosen = manifest.maps.find(m => m.id === (selection.mapId ?? MAP_ID)) ?? manifest.maps[0];
  const bytesByName = new Map<string, ArrayBuffer>();
  for (const file of manifest.files) {
    progress(`Preparing ${file.name}`);
    const fileResponse = await fetch(`/content/${pack}/${file.name}?sha256=${file.sha256}`);
    if (!fileResponse.ok) throw new Error(`Cannot load ${file.name}`);
    const buffer = await fileResponse.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
    if (buffer.byteLength !== file.bytes || hash !== file.sha256) throw new Error(`Content integrity failed: ${file.name}`);
    bytesByName.set(file.name, buffer);
  }
  // Mount the shared resources, then the chosen scenario as the active COMRADE pair.
  const files: LocalGameFile[] = [];
  for (const [name, buffer] of bytesByName) {
    if (name.endsWith('.INI') || name.endsWith('.BIN')) continue;
    files.push({ name, size: buffer.byteLength, arrayBuffer: async () => buffer });
  }
  const apply = pack === 'ra' ? applyRaScenario : applyScenario;
  const scenarioIni = new TextEncoder().encode(apply(new TextDecoder().decode(bytesByName.get(chosen.ini)!), faction, settings)).buffer as ArrayBuffer;
  files.push({ name: 'COMRADE.INI', size: scenarioIni.byteLength, arrayBuffer: async () => scenarioIni });
  // Red Alert carries its terrain inside the scenario; Tiberian Dawn needs the .BIN beside it.
  if (chosen.bin) {
    const scenarioBin = bytesByName.get(chosen.bin)!;
    files.push({ name: 'COMRADE.BIN', size: scenarioBin.byteLength, arrayBuffer: async () => scenarioBin });
  }
  await mountGameFiles(engine, files);
  const options = '[Paths]\nDataPath=/comrade/data\nUserPath=/comrade/data\n[Intro]\nPlayIntro=no\n[Video]\nWindowed=yes\nWindowWidth=640\nWindowHeight=400\nFrameLimit=60\nHardwareCursor=no\n[Mouse]\nRawInput=no\n[Options]\nGameSpeed=3\nScoreVolume=0\nVolume=220\n';
  engine.FS.writeFile(`/comrade/data/${pack === 'ra' ? 'REDALERT' : 'CONQUER'}.INI`, new TextEncoder().encode(options));
  return { manifest, map: chosen };
}
