export interface EngineModule {
  comradePointerInside?: boolean;
  UTF8ToString(pointer: number): string;
  _comrade_snapshot?(): number;
  _comrade_audio?(): void;
  ccall?(name: string, result: string, types: string[], values: (number | string)[]): number;
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, bytes: Uint8Array): void;
    readFile(path: string): Uint8Array;
    chdir(path: string): void;
  };
  callMain(args: string[]): void;
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
import { Faction, parseContentManifest } from '@comrade/contracts';

export async function mountBundledContent(engine: EngineModule, faction: Faction, progress: (message: string) => void) {
  const response = await fetch('/content/td/manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Content pack unavailable');
  const manifest = parseContentManifest(await response.json());
  const files: LocalGameFile[] = [];
  for (const file of manifest.files) {
    progress(`Preparing ${file.name}`);
    const response = await fetch(`/content/td/${file.name}?sha256=${file.sha256}`);
    if (!response.ok) throw new Error(`Cannot load ${file.name}`);
    let buffer = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
    if (buffer.byteLength !== file.bytes || hash !== file.sha256) throw new Error(`Content integrity failed: ${file.name}`);
    if (file.name === 'COMRADE.INI' && faction === 'nod') {
      buffer = new TextEncoder().encode(new TextDecoder().decode(buffer)
        .replace('Player=GoodGuy', 'Player=BadGuy').replace('26=454', '26=2602')
        .replace('WIN=All Destr.,Win,0,BadGuy', 'WIN=All Destr.,Win,0,GoodGuy')
        .replace('LOSE=All Destr.,Lose,0,GoodGuy', 'LOSE=All Destr.,Lose,0,BadGuy')
        .replace('RAID=Time,Reinforce.,10,BadGuy', 'RAID=Time,Reinforce.,10,GoodGuy')
        .replace('RAID=BadGuy,', 'RAID=GoodGuy,')).buffer as ArrayBuffer;
    }
    const bytes = buffer;
    files.push({ name: file.name, size: bytes.byteLength, arrayBuffer: async () => bytes });
  }
  await mountGameFiles(engine, files);
  engine.FS.writeFile('/comrade/data/CONQUER.INI', new TextEncoder().encode('[Paths]\nDataPath=/comrade/data\nUserPath=/comrade/data\n[Intro]\nPlayIntro=no\n[Video]\nWindowed=yes\nWindowWidth=640\nWindowHeight=400\nFrameLimit=60\nHardwareCursor=no\n[Mouse]\nRawInput=no\n[Options]\nGameSpeed=3\nScoreVolume=0\nVolume=220\n'));
  return manifest;
}
