import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TABLES, UNIT_VOICES, VOICES, decodeAud, parseBank } from '../../packages/fusion/src/audio';
import { PACKS } from '../../packages/fusion/src/index';
import { SPEECH_LINES, SPEECH_VOICES, Speaker, packHasSpeech } from '../../packages/fusion/src/speech';

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

describe('spoken lines', () => {
  const PACK_IDS = ['irregular', 'holdout'];
  const factionKeys = (packId: string) => PACKS[packId].factions.map(f => `${packId}:${f.id}`);

  it('gives every faction of both packs a voice and a fallback line set', () => {
    for (const packId of PACK_IDS) {
      expect(packHasSpeech(packId), `${packId} is scripted`).toBe(true);
      for (const key of factionKeys(packId)) {
        expect(SPEECH_VOICES[key], `${key} has a voice`).toBeTruthy();
        // Anything without its own entry falls back to the faction's, so it must exist.
        expect(SPEECH_LINES[key]?.select.length, `${key} has select lines`).toBeGreaterThan(0);
        expect(SPEECH_LINES[key]?.order.length, `${key} has order lines`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every soldier and vehicle type in both packs its own lines', () => {
    // The point of the script: no unit falls back to its faction's generic reply.
    for (const packId of PACK_IDS) {
      for (const unitId of Object.keys(PACKS[packId].units)) {
        const lines = SPEECH_LINES[`${packId}:${unitId}`];
        expect(lines, `${packId}:${unitId} is scripted`).toBeTruthy();
        expect(lines.select.length, `${packId}:${unitId} select`).toBeGreaterThan(0);
        expect(lines.order.length, `${packId}:${unitId} order`).toBeGreaterThan(0);
      }
    }
  });

  it('names a pack, and a faction or unit, that exists', () => {
    for (const key of Object.keys(SPEECH_VOICES)) {
      const [packId, id] = key.split(':');
      expect(PACKS[packId], `${key} names a pack`).toBeTruthy();
      const known = new Set([...PACKS[packId].factions.map(f => f.id), ...PACKS[packId].factions.map(f => f.side)]);
      expect(known.has(id), `${key} names a faction or side`).toBe(true);
    }
    for (const key of Object.keys(SPEECH_LINES)) {
      const [packId, id] = key.split(':');
      expect(PACKS[packId], `${key} names a pack`).toBeTruthy();
      const known = new Set([
        ...PACKS[packId].factions.map(f => f.id), ...PACKS[packId].factions.map(f => f.side),
        ...Object.keys(PACKS[packId].units),
      ]);
      expect(known.has(id), `${key} names a faction or unit`).toBe(true);
    }
  });

  it('stays inside the Web Speech ranges, and gives each faction its own setting', () => {
    for (const [key, v] of Object.entries(SPEECH_VOICES)) {
      expect(v.pitch, `${key} pitch`).toBeGreaterThanOrEqual(0.5);
      expect(v.pitch, `${key} pitch`).toBeLessThanOrEqual(2);
      expect(v.rate, `${key} rate`).toBeGreaterThanOrEqual(0.5);
      expect(v.rate, `${key} rate`).toBeLessThanOrEqual(2);
      expect(v.lang, `${key} lang`).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
    // Two factions on the same pitch and rate are the same voice saying different words.
    for (const packId of PACK_IDS) {
      const pairs = factionKeys(packId).map(k => `${SPEECH_VOICES[k].pitch}/${SPEECH_VOICES[k].rate}`);
      expect(new Set(pairs).size, `${packId} factions sound alike`).toBe(pairs.length);
    }
  });

  it('keeps every line short enough to finish before the next one', () => {
    // Replies are throttled at 600ms; a long line still gets cancelled, but it should be rare.
    for (const [key, lines] of Object.entries(SPEECH_LINES)) {
      for (const line of [...lines.select, ...lines.order]) {
        expect(line.length, `${key}: "${line}"`).toBeLessThanOrEqual(60);
        expect(line.trim(), `${key} has no empty line`).not.toBe('');
        // The packs are cast in one language; a stray non-Latin glyph is a mistake, not a choice.
        expect(line, `${key}: "${line}" is Latin script`).toMatch(/^[\x20-\x7E\u2018\u2019\u201C\u201D\u2014\u00e9]+$/);
      }
    }
  });

  it('speaks nothing, rather than throwing, where the browser has no synthesiser', () => {
    // Node has no speechSynthesis, which is exactly the unsupported case.
    expect(Speaker.supported).toBe(false);
    const speaker = new Speaker();
    expect(speaker.ready).toBe(false);
    expect(speaker.speak('Yes, hello.', 'holdout:hoa', SPEECH_VOICES['holdout:hoa'], 1)).toBe(false);
    expect(() => { speaker.silence(); speaker.dispose(); }).not.toThrow();
  });
});
