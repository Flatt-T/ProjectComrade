"""Readers for Westwood MIX archives and AUD sound headers, used to pull sound files from the
pinned freeware Tiberian Dawn and Red Alert packs.

Red Alert MIX headers are Blowfish-encrypted with a key that is itself RSA-encrypted with
Westwood's public key, published in the Red Alert source release (redalert/const.cpp).
Blowfish's initial tables are the hexadecimal digits of pi, so they are computed here.
"""
import base64
import base64
import struct

PUBLIC_KEY = 'AihRvNoIbTn85FZRYNZRcT+i6KpU+maCsEqr3Q5q+LDB5tH7Tz2qQ38V'
EXPONENT = 0x10001

def file_id(name: str) -> int:
    """Classic Westwood CRC: rotate left one bit, then add the next four characters."""
    data = name.upper().encode('ascii')
    h = 0
    for i in range(0, len(data), 4):
        chunk = data[i:i + 4].ljust(4, b'\0')
        h = ((h << 1) | (h >> 31)) & 0xFFFFFFFF
        h = (h + struct.unpack('<I', chunk)[0]) & 0xFFFFFFFF
    return h


def _pi_hex_words(count: int) -> list[int]:
    """The first `count` 32-bit words of pi's fractional hex digits (Blowfish's tables)."""
    digits = count * 8 + 16
    one = 1 << (4 * digits + 64)

    def arctan_inv(x: int) -> int:
        total, term, k, x2 = 0, one // x, 1, x * x
        while term:
            total += term // k if k % 4 == 1 else -(term // k)
            term //= x2
            k += 2
        return total

    frac = 4 * (4 * arctan_inv(5) - arctan_inv(239)) - 3 * one
    hexstr = format(frac >> 64, 'x').zfill(digits)
    return [int(hexstr[i * 8:i * 8 + 8], 16) for i in range(count)]


class Blowfish:
    """Standard Blowfish (big-endian blocks) in ECB mode."""

    def __init__(self, key: bytes):
        words = _pi_hex_words(18 + 4 * 256)
        self.p = words[:18]
        self.s = [words[18 + i * 256:18 + (i + 1) * 256] for i in range(4)]
        j = 0
        for i in range(18):
            k = 0
            for _ in range(4):
                k = (k << 8) | key[j % len(key)]
                j += 1
            self.p[i] ^= k
        left = right = 0
        for i in range(0, 18, 2):
            left, right = self._encrypt(left, right)
            self.p[i], self.p[i + 1] = left, right
        for box in self.s:
            for i in range(0, 256, 2):
                left, right = self._encrypt(left, right)
                box[i], box[i + 1] = left, right

    def _f(self, x: int) -> int:
        s = self.s
        h = (s[0][x >> 24] + s[1][(x >> 16) & 255]) & 0xFFFFFFFF
        return ((h ^ s[2][(x >> 8) & 255]) + s[3][x & 255]) & 0xFFFFFFFF

    def _encrypt(self, left: int, right: int):
        for i in range(16):
            left ^= self.p[i]
            right ^= self._f(left)
            left, right = right, left
        left, right = right, left
        return left ^ self.p[17], right ^ self.p[16]

    def _decrypt(self, left: int, right: int):
        for i in range(17, 1, -1):
            left ^= self.p[i]
            right ^= self._f(left)
            left, right = right, left
        left, right = right, left
        return left ^ self.p[0], right ^ self.p[1]

    def decrypt(self, data: bytes) -> bytes:
        out = bytearray()
        for i in range(0, len(data) - len(data) % 8, 8):
            left, right = struct.unpack('>II', data[i:i + 8])
            out += struct.pack('>II', *self._decrypt(left, right))
        return bytes(out)


def _blowfish_key(key_source: bytes) -> bytes:
    """RSA-decrypt the 80-byte key source into the 56-byte Blowfish key."""
    raw = base64.b64decode(PUBLIC_KEY)
    assert raw[0] == 2, 'public key is a DER INTEGER'
    modulus = int.from_bytes(raw[2:2 + raw[1]], 'big')
    block = (modulus.bit_length() - 1) // 8
    out = bytearray()
    for i in range(0, len(key_source) - block, block + 1):
        value = int.from_bytes(key_source[i:i + block + 1], 'little')
        out += pow(value, EXPONENT, modulus).to_bytes(block + 1, 'little')[:block]
    return bytes(out[:56])


class Mix:
    """An opened MIX archive: look entries up by name or by ID."""

    def __init__(self, data: bytes):
        self.data = data
        first = struct.unpack('<H', data[:2])[0]
        if first != 0:  # Tiberian Dawn style: count first.
            count, _size = struct.unpack('<HI', data[:6])
            self.entries = self._index(data[6:6 + count * 12], count)
            self.base = 6 + count * 12
            return
        flags = struct.unpack('<I', data[:4])[0]
        if not flags & 0x20000:
            count, _size = struct.unpack('<HI', data[4:10])
            self.entries = self._index(data[10:10 + count * 12], count)
            self.base = 10 + count * 12
            return
        fish = Blowfish(_blowfish_key(data[4:84]))
        count = struct.unpack('<H', fish.decrypt(data[84:92])[:2])[0]
        padded = (6 + count * 12 + 7) & ~7
        header = fish.decrypt(data[84:84 + padded])
        self.entries = self._index(header[6:6 + count * 12], count)
        self.base = 84 + padded

    @staticmethod
    def _index(raw: bytes, count: int) -> dict[int, tuple[int, int]]:
        entries = {}
        for i in range(count):
            fid, offset, size = struct.unpack('<III', raw[i * 12:i * 12 + 12])
            entries[fid] = (offset, size)
        return entries

    def get(self, name: str) -> bytes | None:
        entry = self.entries.get(file_id(name))
        if not entry:
            return None
        offset, size = entry
        return self.data[self.base + offset:self.base + offset + size]


def aud_info(data: bytes) -> dict:
    """Header of a Westwood AUD sound: rate, sizes, flags and codec (1 = WS ADPCM, 99 = IMA)."""
    rate, size, out_size, flags, codec = struct.unpack('<HIIBB', data[:12])
    return {'rate': rate, 'size': size, 'outSize': out_size, 'stereo': bool(flags & 1), 'bits16': bool(flags & 2), 'codec': codec}


# ---------------------------------------------------------------------------- map packs

def format80_compress(data: bytes) -> bytes:
    """Westwood's Format80 (LCW), written with literal runs only.

    A decompressor cannot tell how the stream was produced, so a literal-only encoder is a
    valid Format80 stream: command 0b10000000 | count copies `count` (1..63) bytes that
    follow it, and 0x80 ends the stream. Red Alert's map packs are mostly runs of distinct
    cells, so the saving from a full matcher would be small and the format is what matters.
    """
    out = bytearray()
    i = 0
    while i < len(data):
        run = min(63, len(data) - i)
        out.append(0x80 | run)
        out += data[i:i + run]
        i += run
    out.append(0x80)
    return bytes(out)


def format80_decompress(data: bytes) -> bytes:
    """The matching decoder, used by the tests to prove a pack round-trips."""
    out = bytearray()
    i = 0
    while i < len(data):
        cmd = data[i]
        i += 1
        if cmd == 0x80:
            break
        if cmd & 0x80 == 0:
            # 0cccpppp pppppppp: copy (cmd >> 4) + 3 bytes from back pointer.
            count = (cmd >> 4) + 3
            pos = ((cmd & 0x0F) << 8) | data[i]
            i += 1
            start = len(out) - pos
            for k in range(count):
                out.append(out[start + k])
        elif cmd & 0x40 == 0:
            count = cmd & 0x3F
            out += data[i:i + count]
            i += count
        elif cmd == 0xFE:
            count = int.from_bytes(data[i:i + 2], 'little')
            value = data[i + 2]
            i += 3
            out += bytes([value]) * count
        elif cmd == 0xFF:
            count = int.from_bytes(data[i:i + 2], 'little')
            start = int.from_bytes(data[i + 2:i + 4], 'little')
            i += 4
            for k in range(count):
                out.append(out[start + k])
        else:
            count = (cmd & 0x3F) + 3
            start = int.from_bytes(data[i:i + 2], 'little')
            i += 2
            for k in range(count):
                out.append(out[start + k])
    return bytes(out)


def pack_section(raw: bytes, chunk: int = 8192) -> str:
    """Red Alert's [MapPack] / [OverlayPack] encoding.

    The payload is split into `chunk`-byte blocks, each Format80-compressed and prefixed
    with a little-endian 32-bit header (low 16 bits compressed size, high 16 bits
    uncompressed size), then the whole thing is base64'd into 70-character INI lines
    numbered from 1.
    """
    blob = bytearray()
    for start in range(0, len(raw), chunk):
        block = raw[start:start + chunk]
        packed = format80_compress(block)
        blob += struct.pack('<HH', len(packed), len(block))
        blob += packed
    text = base64.b64encode(bytes(blob)).decode('ascii')
    return '\n'.join(f'{n + 1}={text[i:i + 70]}' for n, i in enumerate(range(0, len(text), 70)))


def unpack_section(lines: str) -> bytes:
    """Decode a packed section back to its payload (used by the tests)."""
    text = ''.join(line.split('=', 1)[1] for line in lines.splitlines() if '=' in line)
    blob = base64.b64decode(text)
    out = bytearray()
    i = 0
    while i + 4 <= len(blob):
        packed_size, raw_size = struct.unpack('<HH', blob[i:i + 4])
        i += 4
        block = format80_decompress(blob[i:i + packed_size])
        if len(block) != raw_size:
            raise ValueError('Block size mismatch')
        out += block
        i += packed_size
    return bytes(out)


# Red Alert maps are always 128x128 cells; a scenario works a window inside that.
RA_MAP_W = RA_MAP_H = 128
CLEAR_TEMPLATE = 0xFFFF


def map_pack(templates: dict[int, int] | None = None, icons: dict[int, int] | None = None) -> str:
    """[MapPack] for a 128x128 map: 2-byte template per cell, then 1-byte icon per cell."""
    cells = RA_MAP_W * RA_MAP_H
    raw = bytearray()
    for cell in range(cells):
        raw += struct.pack('<H', (templates or {}).get(cell, CLEAR_TEMPLATE))
    for cell in range(cells):
        raw.append((icons or {}).get(cell, 0))
    return pack_section(bytes(raw))


def overlay_pack(overlays: dict[int, int]) -> str:
    """[OverlayPack]: one byte per cell, 0xFF meaning no overlay."""
    raw = bytearray([0xFF]) * (RA_MAP_W * RA_MAP_H)
    for cell, value in overlays.items():
        raw[cell] = value
    return pack_section(bytes(raw))


# ---------------------------------------------------------------------------- art

def read_pal(data: bytes) -> list[tuple[int, int, int]]:
    """A Westwood PAL: 256 VGA triples of 6-bit components, widened to 8 bits."""
    if len(data) < 768:
        raise ValueError('Palette is shorter than 256 triples')
    return [(data[i * 3] * 255 // 63, data[i * 3 + 1] * 255 // 63, data[i * 3 + 2] * 255 // 63) for i in range(256)]


def format40_apply(src: bytes, base: bytearray) -> bytearray:
    """Format40 (XOR delta): patch `base` in place with the differences in `src`."""
    out = bytearray(base)
    pos = i = 0
    while i < len(src):
        cmd = src[i]
        i += 1
        if cmd == 0:  # 0, count, value: XOR a run with one value.
            count, value = src[i], src[i + 1]
            i += 2
            for _ in range(count):
                out[pos] ^= value
                pos += 1
        elif cmd & 0x80 == 0:  # Short XOR against the following bytes.
            for _ in range(cmd):
                out[pos] ^= src[i]
                i += 1
                pos += 1
        elif cmd == 0x80:  # Long form in the next word.
            word = int.from_bytes(src[i:i + 2], 'little')
            i += 2
            if word == 0:
                break
            if word & 0x8000 == 0:
                pos += word
            elif word & 0x4000:
                count, value = word & 0x3FFF, src[i]
                i += 1
                for _ in range(count):
                    out[pos] ^= value
                    pos += 1
            else:
                count = word & 0x3FFF
                for _ in range(count):
                    out[pos] ^= src[i]
                    i += 1
                    pos += 1
        else:  # Skip.
            pos += cmd & 0x7F
    return out


def read_shp(data: bytes) -> tuple[int, int, list[bytes]]:
    """A Tiberian Dawn / Red Alert SHP: returns (width, height, frames of palette indices).

    Frames are stored either whole (Format80) or as an XOR delta (Format40) against an
    earlier frame, named by the offset in the frame's second word.
    """
    count, _a, _b, width, height, _c = struct.unpack('<HHHHHI', data[:14])
    offsets = []
    for i in range(count + 2):
        value, ref = struct.unpack('<II', data[14 + i * 8:22 + i * 8])
        offsets.append((value & 0xFFFFFF, value >> 24, ref & 0xFFFFFF))
    size = width * height
    frames: list[bytes] = []
    by_offset: dict[int, bytes] = {}
    for i in range(count):
        start, fmt, ref = offsets[i]
        end = offsets[i + 1][0] or len(data)
        chunk = data[start:end]
        if fmt == 0x80:
            frame = format80_decompress(chunk)[:size]
        elif fmt in (0x40, 0x20):
            # Format40 names its reference by file offset; Format20 by frame number.
            base = by_offset.get(ref) if fmt == 0x40 else (frames[ref] if ref < len(frames) else None)
            if base is None and ref < len(frames):
                base = frames[ref]
            if base is None:
                raise ValueError(f'Frame {i} references an unknown frame at {ref}')
            frame = bytes(format40_apply(chunk, bytearray(base)))[:size]
        else:
            raise ValueError(f'Frame {i} uses unknown format {fmt:#x}')
        frame = frame.ljust(size, b'\0')
        by_offset[start] = frame
        frames.append(frame)
    return width, height, frames


def read_tmp(data: bytes, red_alert: bool) -> tuple[int, int, list[bytes | None]]:
    """A theatre template (terrain tile set): returns (width, height, tiles).

    Tiles are plain palette indices; an entry is None where the template leaves that cell
    of its rectangle empty. Red Alert moved the index table further down the header.
    """
    width, height, _count = struct.unpack('<HHH', data[:6])
    # Red Alert added two words to the header, pushing everything after the size down.
    img_start = struct.unpack('<I', data[16:20] if red_alert else data[12:16])[0]
    if red_alert:
        index_start = struct.unpack('<i', data[28:32])[0]
        index_end = struct.unpack('<i', data[32:36])[0]
    else:
        index_end = struct.unpack('<i', data[24:28])[0]
        index_start = struct.unpack('<i', data[28:32])[0]
    size = width * height
    tiles: list[bytes | None] = []
    for i in range(max(0, index_end - index_start)):
        slot = data[index_start + i]
        if slot == 0xFF:
            tiles.append(None)
        else:
            tiles.append(data[img_start + slot * size:img_start + (slot + 1) * size])
    return width, height, tiles


# ---------------------------------------------------------------------------- PNG

def write_png(path, width: int, height: int, pixels: bytes, grey: bool = False):
    """Minimal PNG writer, so the art pipeline needs nothing outside the standard library.

    `pixels` is RGBA rows (or one byte per pixel when `grey`), top to bottom.
    """
    import zlib
    stride = width * (1 if grey else 4)
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter: none
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', width, height, 8, 0 if grey else 6, 0, 0, 0)
    blob = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    path.write_bytes(blob)
