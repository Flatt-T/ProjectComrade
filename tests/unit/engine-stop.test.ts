import { describe, expect, it } from 'vitest';
import { stopEngine } from '../../packages/client-runtime/src/engine';
import type { EngineModule } from '../../packages/client-runtime/src/engine';

const module = (extra: Partial<EngineModule>): EngineModule => ({
  UTF8ToString: () => '',
  FS: { mkdirTree() {}, writeFile() {}, readFile: () => new Uint8Array(), chdir() {} },
  callMain() {},
  ...extra,
});

describe('stopping a classic engine', () => {
  it('reports that an older build cannot be stopped', () => {
    // Builds before 2026-10-25 export no loop control, so the page has to start over.
    expect(stopEngine(module({}))).toBe(false);
  });

  it('pauses the main loop of a build that exports one', () => {
    let paused = 0;
    expect(stopEngine(module({ pauseMainLoop: () => { paused++; } }))).toBe(true);
    expect(paused).toBe(1);
  });

  it('closes whatever audio the engine still holds', () => {
    const closed: string[] = [];
    const ctx = (name: string) => ({ state: 'running', close: async () => { closed.push(name); } });
    stopEngine(module({
      pauseMainLoop: () => {},
      SDL2: { audioContext: ctx('sdl') },
      AL: { currentCtx: { audioCtx: ctx('al') } },
    }));
    expect(closed.sort()).toEqual(['al', 'sdl']);
  });

  it('is safe when there is no engine, or when it is already gone', () => {
    expect(stopEngine(null)).toBe(true);
    expect(stopEngine(module({ pauseMainLoop: () => { throw new Error('already aborted'); } }))).toBe(false);
  });
});
