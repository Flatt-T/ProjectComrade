import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAud, parseBank } from '../../packages/fusion/src/audio';

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
