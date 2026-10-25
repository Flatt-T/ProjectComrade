// The Red Alert slice on the original engine: the authored scenarios carry their own
// terrain, which is what kept this style unplayable until the map-pack codec landed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseContentManifest } from '../../packages/contracts/src/index';

// The authoring script writes with the platform's line endings, as the TD one does.
const CR = String.fromCharCode(13);
const read = (path: string) => readFileSync(path, 'utf8').split(CR).join('');
const ini = read('packs/ra1/comrade/COMRADE.INI');
const maps: { id: string; name: string; file: string; theater: string }[] =
  JSON.parse(readFileSync('packs/ra1/comrade/maps.json', 'utf8'));

/** The body of one INI section. */
function section(name: string): string {
  const head = `[${name}]\n`;
  const from = ini.indexOf(head);
  expect(from, `[${name}] is present`).toBeGreaterThanOrEqual(0);
  const body = ini.slice(from + head.length);
  const next = body.indexOf('\n[');
  return next < 0 ? body : body.slice(0, next);
}

/** Total uncompressed bytes a packed section claims, from its block headers. */
function packedBytes(packed: string): number {
  const text = packed.split('\n').filter(line => line.includes('=')).map(line => line.split('=')[1]).join('');
  const blob = Buffer.from(text, 'base64');
  let at = 0, total = 0;
  while (at + 4 <= blob.length) {
    const size = blob.readUInt16LE(at), raw = blob.readUInt16LE(at + 2);
    expect(size, 'a block carries data').toBeGreaterThan(0);
    total += raw;
    at += 4 + size;
  }
  expect(at, 'the blocks fill the payload exactly').toBe(blob.length);
  return total;
}

describe('authored Red Alert scenarios', () => {
  it('describes a battlefield the engine can boot', () => {
    expect(ini).toContain('[Basic]');
    expect(ini).toMatch(/^Player=Greece$/m);
    expect(ini).toMatch(/^Theater=(TEMPERATE|SNOW|INTERIOR)$/m);
    // The camera opens on the player's base; the client swaps in the Soviet one.
    expect(section('Waypoints')).toMatch(/^98=\d+$/m);
    expect(ini).toMatch(/^SovietHome=\d+$/m);
  });

  it('gives both houses a base, an army and ore to mine', () => {
    for (const name of ['Structures', 'Units', 'Infantry']) {
      const lines = section(name).trim().split('\n');
      expect(lines.length, `${name} has entries`).toBeGreaterThan(3);
      // index=House,Type,Strength,Cell,...
      for (const line of lines) expect(line).toMatch(/^\d{3}=(Greece|USSR),[A-Z0-9]+,\d+,\d+,/);
      expect(lines.some(l => l.includes('Greece')), `${name} for the Allies`).toBe(true);
      expect(lines.some(l => l.includes('USSR')), `${name} for the Soviets`).toBe(true);
    }
  });

  it('packs terrain and ore the way Red Alert expects', () => {
    // 128x128 cells: two bytes of template each, then one byte of icon each.
    expect(packedBytes(section('MapPack'))).toBe(128 * 128 * 3);
    // One overlay byte a cell, holding the ore fields.
    expect(packedBytes(section('OverlayPack'))).toBe(128 * 128);
  });

  it('offers more than one battlefield, each with its own file', () => {
    expect(maps.length).toBeGreaterThan(1);
    for (const m of maps) {
      expect(m.id).toMatch(/^[a-z0-9-]{3,40}$/);
      const text = read(`packs/ra1/comrade/${m.file}.INI`);
      expect(text).toContain('[MapPack]');
      expect(text).toContain(`Name=Comrade - ${m.name}`);
    }
  });
});

describe('content manifests', () => {
  const files = (names: string[]) => names.map(name => ({ name, bytes: 10, sha256: 'a'.repeat(64) }));

  it('accepts a Red Alert pack whose maps carry no .BIN', () => {
    const manifest = parseContentManifest({
      version: 1, id: 'comrade-ra-pack-v1', engine: 'vanilla-ra', notice: 'x', source: 'x',
      files: files(['CONQUER.MIX', 'COMRADE.INI', 'WINTER.INI']),
      maps: [{ id: 'ore-crossing', name: 'Ore Crossing', theater: 'TEMPERATE', maxPlayers: 2, description: 'x', ini: 'COMRADE.INI' }],
    });
    expect(manifest.engine).toBe('vanilla-ra');
  });

  it('still demands the .BIN from a Tiberian Dawn pack', () => {
    expect(() => parseContentManifest({
      version: 1, id: 'comrade-td-pack-v2', engine: 'vanilla-td', notice: 'x', source: 'x',
      files: files(['CONQUER.MIX', 'COMRADE.INI']),
      maps: [{ id: 'tiberium-crossing', name: 'x', theater: 'TEMPERATE', maxPlayers: 2, description: 'x', ini: 'COMRADE.INI' }],
    })).toThrow();
  });
});
