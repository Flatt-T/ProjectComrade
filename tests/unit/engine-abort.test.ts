import { describe, expect, it } from 'vitest';
import { engineAbortLine } from '../../packages/client-runtime/src/engine';

describe('classic engine abort copy', () => {
  it('turns an abort reason into a player-facing line', () => {
    expect(engineAbortLine('out of memory')).toBe('The original engine stopped: out of memory');
  });

  it('does not leak a blank reason', () => {
    expect(engineAbortLine('  ')).toBe('The original engine stopped: unknown error');
    expect(engineAbortLine(undefined)).toBe('The original engine stopped: unknown error');
  });
});
