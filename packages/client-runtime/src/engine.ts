export interface EngineModule {
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

export async function loadEngine(game: 'td' | 'ra', canvas: HTMLCanvasElement, print: (line: string) => void): Promise<EngineModule> {
  const name = game === 'td' ? 'vanillatd' : 'vanillara';
  const url = `/engines/${name}.js`;
  const { default: factory } = await import(/* @vite-ignore */ url);
  const engine = await factory({
    canvas, noInitialRun: true, thisProgram: '/comrade/data/engine',
    locateFile: (file: string) => `/engines/${file}`,
    print, printErr: print,
    onAbort: (reason: string) => print(`Engine aborted: ${reason}`),
  });
  if (!engine.FS || typeof engine.callMain !== 'function') throw new Error('Engine is missing required filesystem or launch exports');
  return engine;
}
