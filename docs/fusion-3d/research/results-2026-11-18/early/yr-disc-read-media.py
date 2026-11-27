"""Read the eight verified installer files from either preserved YR1 Mode 1 CD image."""
import argparse
import hashlib
import json
from pathlib import Path


SECTOR = 2352
PAYLOAD = 2048
SYNC = b'\x00' + b'\xff' * 10 + b'\x00'


def sectors(track, lba, size):
    track.seek(lba * SECTOR)
    remaining = size
    while remaining:
        block = track.read(SECTOR)
        if len(block) != SECTOR or block[:12] != SYNC or block[15] != 1:
            raise ValueError(f'Invalid Mode 1 sector at LBA {lba}')
        length = min(PAYLOAD, remaining)
        yield block[16:16 + length]
        remaining -= length
        lba += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('track', type=Path)
    parser.add_argument('private_output', type=Path)
    args = parser.parse_args()
    baseline = json.loads(Path(__file__).with_name('yr-disc-verification.json').read_text())
    files = list(baseline['cabinet_directory'])
    for key, name, size in [('game_version_strings', 'GAMEMD.EXE', 4808976),
                            ('readme_version', 'README.TXT', 26449)]:
        meta = baseline[key]
        files.append({'file': name, 'lba': meta['lba'], 'bytes': size, 'sha256': meta['sha256']})
    args.private_output.mkdir(parents=True, exist_ok=True)
    with args.track.open('rb') as track:
        descriptor = b''.join(sectors(track, 16, PAYLOAD))
        if descriptor[:7] != b'\x01CD001\x01' or descriptor[40:72].rstrip() != b'YR1':
            raise ValueError('Expected the documented YR1 ISO9660 volume')
        for item in files:
            data = b''.join(sectors(track, item['lba'], item['bytes']))
            if hashlib.sha256(data).hexdigest() != item['sha256']:
                raise ValueError(f'Unexpected version of {item["file"]}')
            path = args.private_output / item['file']
            if path.exists() and path.read_bytes() != data:
                raise FileExistsError(path)
            if not path.exists():
                path.write_bytes(data)
            print(f'{path.name} {item["sha256"]}')


if __name__ == '__main__':
    main()
