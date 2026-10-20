import { describe, expect, it } from 'vitest';
import { mountGameFiles, EngineModule } from '../../packages/client-runtime/src/engine';

function fixture() {
  const data = new Map<string, Uint8Array>();
  let cwd = '';
  const engine: EngineModule = { UTF8ToString: () => '', FS: {
    mkdirTree() {}, writeFile(path, bytes) { data.set(path, bytes); },
    readFile(path) { return data.get(path)!; }, chdir(path) { cwd = path; },
  }, callMain() { throw new Error('Mount must not start main'); } };
  return { engine, data, cwd: () => cwd };
}
const file = (name: string, size = 3) => ({ name, size, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
describe('local MEMFS imports', () => {
  it('mounts original bytes and sets engine paths without starting main', async () => {
    const f = fixture();
    expect(await mountGameFiles(f.engine, [file('conquer.mix')])).toEqual(['CONQUER.MIX']);
    expect([...f.data.get('/comrade/data/CONQUER.MIX')!]).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(f.data.get('/comrade/data/CONQUER.INI'))).toContain('DataPath=/comrade/data');
    expect(f.cwd()).toBe('/comrade/data');
  });
  it.each([['../secret'], ['foo/bar.mix'], ['..'], ['bad name.mix']])('rejects unsafe name %s before writing', async name => {
    const f = fixture();
    await expect(mountGameFiles(f.engine, [file(name)])).rejects.toThrow('filename');
    expect(f.data.size).toBe(0);
  });
  it('rejects case collisions and excessive memory use', async () => {
    const f = fixture();
    await expect(mountGameFiles(f.engine, [file('A.mix'), file('a.MIX')])).rejects.toThrow('Duplicate');
    await expect(mountGameFiles(f.engine, [file('A.mix', 513 * 1024 * 1024)])).rejects.toThrow('limit');
  });
});
