import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TABLES, UNIT_VOICES, VOICES, decodeAud, parseBank } from '../../packages/fusion/src/audio';
import { PACKS } from '../../packages/fusion/src/index';

/** A minimal AUD file: 12-byte header, then one chunk (size, output size, 0x0000DEAF, data). */
function aud(data: number[]): Uint8Array {
  const out = new Uint8Array(12 + 8 + data.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, 22050, true); v.setUint32(2, 8 + data.length, true); v.setUint32(6, data.length * 4, true);
  out[10] = 2; out[11] = 99;
  v.setUint16(12, data.length, true); v.setUint16(14, data.length * 4, true); v.setUint32(16, 0xdeaf, true);
  out.set(data, 20);
  return out;
}

describe('Westwood AUD decoding', () => {
  it('decodes IMA ADPCM nibbles low-first with carried state', () => {
    // 0x77: two nibbles of 7. From step 7: +11 (index 8); then step 16: +30.
    const { rate, samples } = decodeAud(aud([0x77]));
    expect(rate).toBe(22050);
    expect(Array.from(samples, s => Math.round(s * 32768))).toEqual([11, 41]);
    // Nibble 15 subtracts: from 0 at step 7 it goes to -11.
    expect(Math.round(decodeAud(aud([0x0f])).samples[0] * 32768)).toBe(-11);
  });

  it('refuses codecs it does not know', () => {
    const file = aud([0x00]); file[11] = 1;
    expect(() => decodeAud(file)).toThrow();
  });

  for (const bank of ['td', 'ra']) {
    const path = `apps/web/public/content/audio/${bank}.bank`;
    it.skipIf(!existsSync(path))(`${bank}: every sound in the built bank decodes to real audio`, () => {
      const file = readFileSync(path);
      const { notice, sounds } = parseBank(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
      expect(notice).toMatch(/Westwood/);
      expect(sounds.size).toBeGreaterThan(100);
      for (const [name, raw] of sounds) {
        const { samples } = decodeAud(raw);
        const rms = Math.sqrt(samples.reduce((n, s) => n + s * s, 0) / samples.length);
        expect(samples.length, name).toBeGreaterThan(200); // Some are short ticks (CASHUP1 is 30 ms).
        expect(rms, name).toBeGreaterThan(0.005);
        expect(Math.max(...samples.map(Math.abs)), name).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('faction voices', () => {
  // Both original modern packs are ortho, so they draw on the Tiberian Dawn bank.
  const vocabulary = (bank: 'td' | 'ra') => {
    const t = TABLES[bank];
    return new Set([
      ...t.replies.select, ...t.replies.order, ...t.replies.vehicleSelect,
      ...Object.values(t.special).flatMap(s => [...s.select, ...s.order]),
    ]);
  };
  const bankOf = (packId: string) => (PACKS[packId].projection === 'iso' ? 'ra' : 'td') as 'td' | 'ra';

  it('names a pack and a faction that exist', () => {
    for (const [packId, factions] of Object.entries(VOICES)) {
      const pack = PACKS[packId];
      expect(pack, `${packId} is a registered pack`).toBeTruthy();
      const known = new Set([...pack.factions.map(f => f.id), ...pack.factions.map(f => f.side)]);
      for (const id of Object.keys(factions)) expect(known.has(id), `${packId}/${id}`).toBe(true);
    }
  });

  it('names a unit that exists, in the pack it is keyed to', () => {
    for (const key of Object.keys(UNIT_VOICES)) {
      const [packId, unitId] = key.split(':');
      expect(PACKS[packId], `${key} names a pack`).toBeTruthy();
      expect(PACKS[packId].units[unitId], `${key} names a unit`).toBeTruthy();
    }
  });

  it('only asks the bank for replies it actually holds', () => {
    // A sample name that is not in the bank plays nothing at all, silently, forever.
    for (const [packId, factions] of Object.entries(VOICES)) {
      const words = vocabulary(bankOf(packId));
      for (const [id, voice] of Object.entries(factions)) {
        for (const name of [...(voice.select ?? []), ...(voice.order ?? [])]) {
          expect(words.has(name), `${packId}/${id} asks for ${name}`).toBe(true);
        }
      }
    }
    for (const [key, voice] of Object.entries(UNIT_VOICES)) {
      const words = vocabulary(bankOf(key.split(':')[0]));
      for (const name of [...(voice.select ?? []), ...(voice.order ?? [])]) {
        expect(words.has(name), `${key} asks for ${name}`).toBe(true);
      }
    }
  });

  it('shifts the pitch only as far as a sample still sounds like a person', () => {
    const rates = [...Object.values(VOICES).flatMap(f => Object.values(f)), ...Object.values(UNIT_VOICES)]
      .map(v => v.rate).filter((r): r is number => r !== undefined);
    expect(rates.length).toBeGreaterThan(0);
    for (const rate of rates) {
      expect(rate).toBeGreaterThanOrEqual(0.85);
      expect(rate).toBeLessThanOrEqual(1.2);
    }
  });

  it('gives every faction of both original modern packs a voice of its own', () => {
    for (const packId of ['irregular', 'holdout']) {
      const voices = VOICES[packId];
      expect(voices, `${packId} has voices`).toBeTruthy();
      for (const faction of PACKS[packId].factions) {
        expect(voices[faction.id], `${faction.id} has a voice`).toBeTruthy();
      }
      // The whole point is that they sound different from each other.
      const rates = PACKS[packId].factions.map(f => voices[f.id].rate);
      expect(new Set(rates).size, `${packId} factions sound alike`).toBe(rates.length);
    }
  });

  it('keeps the script and the stand-ins in the same place', () => {
    // The script is the thing a voice artist reads; if it goes missing the table is orphaned.
    expect(existsSync('docs/fusions/VOICE-SCRIPT.md'), 'the voice script is checked in').toBe(true);
    const script = readFileSync('docs/fusions/VOICE-SCRIPT.md', 'utf8');
    for (const packId of ['irregular', 'holdout']) {
      for (const faction of PACKS[packId].factions) {
        expect(script, `${faction.name} is scripted`).toContain(faction.name);
      }
    }
  });
});
