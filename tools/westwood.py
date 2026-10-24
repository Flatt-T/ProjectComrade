"""Readers for Westwood MIX archives and AUD sound headers, used to pull sound files from the
pinned freeware Tiberian Dawn and Red Alert packs.

Red Alert MIX headers are Blowfish-encrypted with a key that is itself RSA-encrypted with
Westwood's public key, published in the Red Alert source release (redalert/const.cpp).
Blowfish's initial tables are the hexadecimal digits of pi, so they are computed here.
"""
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
