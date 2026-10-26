"""Bake the freeware Tiberian Dawn and Red Alert sprites and theatre tiles into atlases
for the Fusion Engine's browser renderer.

The Fusion Engine normally draws everything procedurally (packages/fusion/src/art). Two of
its rule packs, `td` and `ra1`, replicate games whose own art is freeware, so those two can
be drawn with the originals instead. Everything here comes from the same checksum-pinned
packs the rest of the content pipeline uses (rights ledger entry ledger-019); Dune 2000
and Red Alert 2 art is not freeware and stays procedural.

Output, per pack, into apps/web/public/content/art/:
  <pack>.png        sprite atlas, RGBA, house-coloured pixels left transparent
  <pack>-remap.png  greyscale mask, 1..16 = the house colour ramp step for that pixel
  <pack>-tiles.png  theatre tile atlas, RGBA
  <pack>.json       the index: cell size, sprite frames, tile lists, the house ramp

House colouring is how Westwood did it: the sprites carry a 16-entry ramp of one house's
colour, remapped per player at draw time. The atlas keeps that ramp out of the base image
and records its luminance, so the renderer can rebuild it in any player colour.
"""
from pathlib import Path
import hashlib
import json
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from westwood import Mix, read_pal, read_shp, read_tmp, write_png  # noqa: E402
from fetch import fetch  # noqa: E402

TD_ZIP = ROOT / 'build/cnc-packages.zip'
RA_ZIP = ROOT / 'build/ra-packages.zip'
RA_URL = 'https://openra.ppmsite.com/ra-packages.zip'
RA_ZIP_SHA = 'de3697903497d3d40db2f17d9b1aabbb3ef0b3bfccd9097a0b93836dc7343ab1'
OUT = ROOT / 'apps/web/public/content/art'

CELL = 24          # Both games draw one map cell as 24x24 pixels.
THEATRE_EXT = {'TEMPERAT': 'tem', 'WINTER': 'win', 'DESERT': 'des', 'SNOW': 'sno', 'INTERIOR': 'int'}
SHADOW_INDEX = 4   # The palette slot Westwood sprites use for their own cast shadow.
ATLAS_WIDTH = 1024

# Infantry sheets share one frame layout: eight facings per pose, poses back to back.
INFANTRY_STAND = (0, 1)    # start, frames per facing
INFANTRY_WALK = (8, 6)

# (shape file, facings, has a separately rotating turret)
TD_UNITS = {
    'minigunner': ('E1', 8, False), 'grenadier': ('E2', 8, False), 'rocketsoldier': ('E3', 8, False),
    'flamethrower': ('E4', 8, False), 'chemwarrior': ('E5', 8, False), 'engineer': ('E6', 8, False),
    'commando': ('RMBO', 8, False),
    'humvee': ('JEEP', 32, True), 'buggy': ('BGGY', 32, True), 'bike': ('BIKE', 32, False),
    'apc': ('APC', 32, False), 'lighttank': ('LTNK', 32, True), 'mediumtank': ('MTNK', 32, True),
    'flametank': ('FTNK', 32, False), 'stealthtank': ('STNK', 32, False), 'artillery': ('ARTY', 32, False),
    'mlrs': ('MSAM', 32, False), 'ssm': ('MLRS', 32, False), 'mammoth': ('HTNK', 32, True),
    'harvester': ('HARV', 32, False), 'mcv': ('MCV', 32, False),
    'orca': ('ORCA', 32, False), 'apache': ('HELI', 32, False), 'chinook': ('TRAN', 32, False),
}
# Structures: the shape file, and how many frames the renderer may index (walls use 16).
TD_STRUCTURES = {
    'fact': ('FACT', 1), 'nuke': ('NUKE', 1), 'nuk2': ('NUK2', 1), 'proc': ('PROC', 1), 'silo': ('SILO', 1),
    'pyle': ('PYLE', 1), 'hand': ('HAND', 1), 'weap': ('WEAP', 1), 'afld': ('AFLD', 1), 'aflight': ('AFLD', 1),
    'hq': ('HQ', 1), 'fix': ('FIX', 1), 'hpad': ('HPAD', 1), 'eye': ('EYE', 1), 'tmpl': ('TMPL', 1),
    'gtwr': ('GTWR', 1), 'atwr': ('ATWR', 1), 'obli': ('OBLI', 1), 'sam': ('SAM', 1),
    'sbag': ('SBAG', 16), 'brik': ('BRIK', 16),
}
TD_TURRET_STRUCTURES = {'gun': ('GUN', 32)}

RA_UNITS = {
    'rifleinf': ('E1', 8, False), 'conscript': ('E1', 8, False), 'grenadier': ('E2', 8, False),
    'rocketsoldier': ('E3', 8, False), 'flamethrower': ('E4', 8, False), 'engineer': ('E6', 8, False),
    'tanya': ('E7', 8, False), 'spy': ('SPY', 8, False), 'thief': ('THF', 8, False), 'medic': ('MEDI', 8, False),
    'dog': ('DOG', 8, False),
    'ranger': ('JEEP', 32, True), 'apc': ('APC', 32, False), 'lighttank': ('1TNK', 32, True),
    'mediumtank': ('2TNK', 32, True), 'heavytank': ('3TNK', 32, True), 'mammoth': ('4TNK', 32, True),
    'artillery': ('ARTY', 32, False), 'v2': ('V2RL', 32, False), 'minelayer': ('MNLY', 32, False),
    'mgg': ('MGG', 32, False), 'supplytruck': ('TRUK', 32, False), 'harvester': ('HARV', 32, False),
    'mcv': ('MCV', 32, False),
    'longbow': ('HELI', 32, False), 'hind': ('HIND', 32, False), 'yak': ('YAK', 32, False),
    'mig': ('MIG', 32, False), 'badger': ('BADR', 32, False), 'chinook': ('TRAN', 32, False),
    'transport': ('LST', 32, False), 'destroyer': ('DD', 32, True), 'cruiser': ('CA', 32, True),
    'submarine': ('SS', 32, False),
}
RA_STRUCTURES = {
    'fact': ('FACT', 1), 'powr': ('POWR', 1), 'apwr': ('APWR', 1), 'proc': ('PROC', 1), 'silo': ('SILO', 1),
    'tent': ('TENT', 1), 'barr': ('BARR', 1), 'weap': ('WEAP', 1), 'dome': ('DOME', 1), 'fix': ('FIX', 1),
    'hpad': ('HPAD', 1), 'afld': ('AFLD', 1), 'abase': ('AFLD', 1), 'syrd': ('SYRD', 1), 'spen': ('SPEN', 1),
    'atek': ('ATEK', 1), 'stek': ('STEK', 1), 'pdox': ('PDOX', 1), 'iron': ('IRON', 1), 'mslo': ('MSLO', 1),
    'gap': ('GAP', 1), 'pbox': ('PBOX', 1), 'hbox': ('HBOX', 1), 'ftur': ('FTUR', 1), 'tsla': ('TSLA', 1),
    'sam': ('SAM', 1), 'sbag': ('SBAG', 16), 'brik': ('BRIK', 16),
}
RA_TURRET_STRUCTURES = {'gun': ('GUN', 32), 'agun': ('AGUN', 32)}

# Theatre templates to draw each Fusion terrain from. The renderer picks one per cell.
TD_TERRAIN = {
    'clear': ('TEMPERAT', ['CLEAR1']),
    'snow': ('WINTER', ['CLEAR1']),
    'sand': ('DESERT', ['CLEAR1']),
    'water': ('TEMPERAT', ['W1', 'W2']),
    'rough': ('TEMPERAT', ['P01', 'P02', 'P03', 'P04', 'P07', 'P08', 'P13', 'P14', 'B1', 'B2', 'B3']),
    'road': ('TEMPERAT', ['D01', 'D02', 'D03', 'D04']),
    'cliff': ('TEMPERAT', ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08']),
}
RA_TERRAIN = {
    'clear': ('TEMPERAT', ['CLEAR1']),
    'snow': ('SNOW', ['CLEAR1']),
    'sand': ('TEMPERAT', ['CLEAR1']),
    'water': ('TEMPERAT', ['W1', 'W2']),
    'rough': ('TEMPERAT', ['P01', 'P02', 'P03', 'P04', 'P07', 'P08', 'P13', 'P14', 'B1', 'B2', 'B3']),
    'road': ('TEMPERAT', ['D01', 'D02', 'D03', 'D04']),
    'cliff': ('TEMPERAT', ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08']),
}
# Trees are terrain objects, not templates: one shape file each, drawn over clear ground.
TREES = ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08', 'T10', 'T11', 'T12']
# Resource overlays by density step, from sparse to rich.
TD_RESOURCE = ('tiberium', ['TI1', 'TI3', 'TI6', 'TI10'])
RA_RESOURCE = ('ore', ['GOLD01', 'GOLD02', 'GOLD03', 'GOLD04'])


def pinned(path: Path, url: str, sha: str) -> bytes:
    """Hash-pinned download with retries and an optional mirror; see tools/fetch.py."""
    return fetch(url, path, sha).read_bytes()


def ledger_hashes(entry_id: str) -> dict:
    for line in (ROOT / 'rights/ledger.jsonl').read_text(encoding='utf-8').splitlines():
        if line.strip():
            entry = json.loads(line)
            if entry['id'] == entry_id:
                return entry['assetHashes']
    raise RuntimeError(f'Rights ledger entry {entry_id} is missing')


def open_mixes(archive: zipfile.ZipFile, prefix: str, names: list[str], approved: dict) -> dict[str, Mix]:
    out = {}
    for name in names:
        data = archive.read(name)
        if approved.get(f'{prefix}/{name.upper()}') != hashlib.sha256(data).hexdigest():
            raise RuntimeError(f'{prefix}/{name} is outside the pinned freeware pack decision')
        out[name.upper().removesuffix('.MIX')] = Mix(data)
    return out


class Atlas:
    """A shelf-packed RGBA atlas, with a parallel greyscale house-colour mask."""

    def __init__(self, width: int = ATLAS_WIDTH):
        self.width = width
        self.rows: list[list[int]] = []  # [y, height, used width] per shelf
        self.pixels: dict[tuple[int, int], tuple[int, int, int, int]] = {}
        self.mask: dict[tuple[int, int], int] = {}
        self.height = 0

    def _place(self, w: int, h: int) -> tuple[int, int]:
        for row in self.rows:
            if row[1] >= h and row[2] + w <= self.width:
                x = row[2]
                row[2] += w
                return x, row[0]
        row = [self.height, h, w]
        self.rows.append(row)
        self.height += h
        return 0, row[0]

    def add(self, w: int, h: int, rgba: list[tuple[int, int, int, int]], mask: list[int] | None = None) -> tuple[int, int]:
        x0, y0 = self._place(w, h)
        for i, px in enumerate(rgba):
            if px[3]:
                self.pixels[(x0 + i % w, y0 + i // w)] = px
        if mask:
            for i, m in enumerate(mask):
                if m:
                    self.mask[(x0 + i % w, y0 + i // w)] = m
        return x0, y0

    def rgba_bytes(self) -> bytes:
        out = bytearray(self.width * self.height * 4)
        for (x, y), (r, g, b, a) in self.pixels.items():
            o = (y * self.width + x) * 4
            out[o:o + 4] = bytes((r, g, b, a))
        return bytes(out)

    def mask_bytes(self) -> bytes:
        out = bytearray(self.width * self.height)
        for (x, y), m in self.mask.items():
            out[y * self.width + x] = m
        return bytes(out)


def convert(indices: bytes, w: int, h: int, pal, remap: range | None):
    """Palette indices to RGBA plus a house-colour mask, cropped to the drawn pixels.

    Index 0 is transparent and index 4 is the shadow Westwood bakes into the sprite, kept
    as translucent black. Pixels inside `remap` are left out of the colour image and
    recorded in the mask instead, as the ramp step 1..16.
    """
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        row = indices[y * w:(y + 1) * w]
        for x, idx in enumerate(row):
            if idx:
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    if maxx < 0:
        return None
    cw, ch = maxx - minx + 1, maxy - miny + 1
    rgba: list[tuple[int, int, int, int]] = []
    mask: list[int] = []
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            idx = indices[y * w + x]
            if idx == 0:
                rgba.append((0, 0, 0, 0)); mask.append(0)
            elif idx == SHADOW_INDEX:
                rgba.append((0, 0, 0, 110)); mask.append(0)
            elif remap and idx in remap:
                rgba.append((0, 0, 0, 0)); mask.append(idx - remap.start + 1)
            else:
                r, g, b = pal[idx]
                rgba.append((r, g, b, 255)); mask.append(0)
    return cw, ch, rgba, mask, minx, miny


def add_frames(atlas: Atlas, frames, w, h, pal, remap, indices):
    """Pack the named frames of a shape; each entry is [x, y, w, h, offX, offY] or null.

    offX/offY place the cropped image relative to the shape's own top-left, so the
    renderer can centre a sprite on its cell the way the original did.
    """
    out = []
    for i in indices:
        if i >= len(frames):
            out.append(None)
            continue
        conv = convert(frames[i], w, h, pal, remap)
        if conv is None:
            out.append(None)
            continue
        cw, ch, rgba, mask, ox, oy = conv
        x0, y0 = atlas.add(cw, ch, rgba, mask)
        out.append([x0, y0, cw, ch, ox, oy])
    return out


def shape_entry(atlas: Atlas, data: bytes, pal, remap, facings: int, turret: bool):
    w, h, frames = read_shp(data)
    entry: dict = {'w': w, 'h': h, 'facings': facings}
    if facings == 8:  # Infantry: a standing pose and a six-frame walk cycle per facing.
        entry['body'] = add_frames(atlas, frames, w, h, pal, remap, [INFANTRY_STAND[0] + f for f in range(8)])
        walk = []
        for f in range(8):
            walk += [INFANTRY_WALK[0] + f * INFANTRY_WALK[1] + k for k in range(INFANTRY_WALK[1])]
        entry['walk'] = add_frames(atlas, frames, w, h, pal, remap, walk)
        entry['walkFrames'] = INFANTRY_WALK[1]
    else:
        entry['body'] = add_frames(atlas, frames, w, h, pal, remap, list(range(facings)))
        if turret:
            entry['turret'] = add_frames(atlas, frames, w, h, pal, remap, [facings + f for f in range(facings)])
    return entry


def tile_entries(atlas: Atlas, mix: Mix, names: list[str], pal, red_alert: bool, ext: str):
    """Every non-empty 24x24 cell of the named templates, as one flat pool."""
    out = []
    for name in names:
        data = mix.get(name + ext)
        if not data:
            continue
        tw, th, tiles = read_tmp(data, red_alert)
        for tile in tiles:
            if tile is None or len(tile) < tw * th:
                continue
            conv = convert(tile, tw, th, pal, None)
            if conv is None or conv[0] != CELL or conv[1] != CELL:
                continue
            x0, y0 = atlas.add(CELL, CELL, conv[2])
            out.append([x0, y0])
    return out


def build(pack: str, mixes: dict[str, Mix], pal, remap: range, units, structures, turret_structures,
          terrain, resource, tree_ext: str, red_alert: bool):
    sprites = Atlas()
    tiles = Atlas()
    index: dict = {'cell': CELL, 'units': {}, 'structures': {}, 'tiles': {}, 'trees': []}
    missing: list[str] = []

    def find(name: str) -> bytes | None:
        # Most shapes are theatre-independent .SHP; a few structures ship per theatre.
        for ext in ('.SHP', '.' + tree_ext.upper()):
            for mix in mixes.values():
                data = mix.get(name + ext)
                if data:
                    return data
        return None

    for kind, table in (('units', units), ('structures', structures)):
        for key, spec in table.items():
            name, second = spec[0], spec[1]
            data = find(name)
            if not data:
                missing.append(name)
                continue
            if kind == 'units':
                index['units'][key] = shape_entry(sprites, data, pal, remap, second, spec[2])
            else:
                w, h, frames = read_shp(data)
                index['structures'][key] = {
                    'w': w, 'h': h, 'facings': 0,
                    'body': add_frames(sprites, frames, w, h, pal, remap, list(range(min(second, len(frames))))),
                }
    for key, (name, facings) in turret_structures.items():
        data = find(name)
        if not data:
            missing.append(name)
            continue
        w, h, frames = read_shp(data)
        index['structures'][key] = {
            'w': w, 'h': h, 'facings': facings,
            'body': add_frames(sprites, frames, w, h, pal, remap, list(range(facings))),
        }

    for terrain_id, (theatre, names) in terrain.items():
        mix = mixes.get(theatre)
        if not mix:
            continue
        theatre_pal = read_pal(mix.get(f'{theatre.lower()}.pal') or pal_bytes(mixes, theatre))
        index['tiles'][terrain_id] = tile_entries(tiles, mix, names, theatre_pal, red_alert, '.' + THEATRE_EXT[theatre])

    # Trees sit on top of a clear tile, so they keep their own transparency.
    theatre = terrain['clear'][0]
    mix = mixes[theatre]
    theatre_pal = read_pal(mix.get(f'{theatre.lower()}.pal') or pal_bytes(mixes, theatre))
    for name in TREES:
        data = mix.get(f'{name}.{tree_ext}')
        if not data:
            continue
        w, h, frames = read_shp(data)
        placed = add_frames(tiles, frames, w, h, theatre_pal, None, [0])
        if placed[0]:
            index['trees'].append(placed[0])

    res_id, res_names = resource
    if red_alert:
        index['tiles'][res_id] = [tile_entries(tiles, mix, [n], theatre_pal, red_alert, '.' + tree_ext) for n in res_names]
    else:
        steps = []
        for name in res_names:
            data = mix.get(f'{name}.{tree_ext}')
            if not data:
                steps.append([])
                continue
            w, h, frames = read_shp(data)
            steps.append([f for f in add_frames(tiles, frames, w, h, theatre_pal, None, list(range(len(frames)))) if f])
        index['tiles'][res_id] = steps

    index['remapLuma'] = [round((0.299 * pal[i][0] + 0.587 * pal[i][1] + 0.114 * pal[i][2]) / 255, 4) for i in remap]
    index['atlas'] = {'w': sprites.width, 'h': sprites.height}
    index['tileAtlas'] = {'w': tiles.width, 'h': tiles.height}
    if missing:
        raise RuntimeError(f'{pack}: shapes missing from the pinned pack: {sorted(set(missing))}')
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / f'{pack}.png', sprites.width, sprites.height, sprites.rgba_bytes())
    write_png(OUT / f'{pack}-remap.png', sprites.width, sprites.height, sprites.mask_bytes(), grey=True)
    write_png(OUT / f'{pack}-tiles.png', tiles.width, tiles.height, tiles.rgba_bytes())
    (OUT / f'{pack}.json').write_text(json.dumps(index, separators=(',', ':')) + '\n')
    print(f'{pack}: {len(index["units"])} units, {len(index["structures"])} structures, '
          f'atlas {sprites.width}x{sprites.height}, tiles {tiles.width}x{tiles.height}')


def pal_bytes(mixes: dict[str, Mix], theatre: str) -> bytes:
    """Red Alert keeps its theatre palettes in REDALERT.MIX/LOCAL.MIX, not the theatre mix."""
    local = mixes.get('LOCAL')
    data = local.get(f'{theatre.lower()}.pal') if local else None
    if not data:
        raise RuntimeError(f'No palette for theatre {theatre}')
    return data


def main():
    td_zip = zipfile.ZipFile(TD_ZIP)
    approved = ledger_hashes('ledger-019')
    td = open_mixes(td_zip, 'TD', ['conquer.mix', 'temperat.mix', 'winter.mix', 'desert.mix'], approved)
    build('td', td, read_pal(td['TEMPERAT'].get('temperat.pal')), range(176, 192),
          TD_UNITS, TD_STRUCTURES, TD_TURRET_STRUCTURES, TD_TERRAIN, TD_RESOURCE, 'tem', red_alert=False)

    pinned(RA_ZIP, RA_URL, RA_ZIP_SHA)
    ra_zip = zipfile.ZipFile(RA_ZIP)
    ra = open_mixes(ra_zip, 'RA', ['conquer.mix', 'temperat.mix', 'snow.mix', 'redalert.mix'], approved)
    ra['LOCAL'] = Mix(ra['REDALERT'].get('local.mix'))
    ra['HIRES'] = Mix(ra['REDALERT'].get('hires.mix'))
    build('ra', ra, read_pal(ra['LOCAL'].get('temperat.pal')), range(80, 96),
          RA_UNITS, RA_STRUCTURES, RA_TURRET_STRUCTURES, RA_TERRAIN, RA_RESOURCE, 'tem', red_alert=True)

    files = sorted(p for p in OUT.iterdir() if p.name != 'manifest.json')
    (OUT / 'manifest.json').write_text(json.dumps({
        'version': 1,
        'notice': 'Unit, structure and terrain art baked from Electronic Arts / Westwood Studios freeware game '
                  'content for Command & Conquer (Tiberian Dawn) and Red Alert. Not GPL and not project-original. '
                  'Used only by the Fusion Engine rule packs that replicate those two games; Dune 2000 and Red '
                  'Alert 2 style games keep the engine\'s own procedural art. No EA endorsement is implied.',
        'sources': [{'pack': 'td', 'url': 'https://openra.ppmsite.com/cnc-packages.zip', 'rightsLedger': 'ledger-019'},
                    {'pack': 'ra', 'url': RA_URL, 'rightsLedger': 'ledger-019'}],
        'files': [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
