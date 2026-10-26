"""Package the freeware Tiberian Dawn and Red Alert sound effects, unit replies and EVA
speech into one compact bank per game for the Fusion Engine's browser sound player.

Sources are the same checksum-pinned freeware packs the rest of the content pipeline uses
(rights ledger entries ledger-017 and ledger-018). Sounds stay in their original Westwood
AUD form (IMA ADPCM) and are decoded in the browser.

Bank layout: u32 little-endian JSON length, the JSON index
{"notice": ..., "sounds": {NAME: [offset, length]}}, then the AUD files back to back.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from fetch import fetch  # noqa: E402
from westwood import Mix, aud_info  # noqa: E402

TD_ZIP = ROOT / 'build/cnc-packages.zip'
RA_ZIP = ROOT / 'build/ra-packages.zip'
RA_URL = 'https://openra.ppmsite.com/ra-packages.zip'
RA_ZIP_SHA = 'de3697903497d3d40db2f17d9b1aabbb3ef0b3bfccd9097a0b93836dc7343ab1'
OUT = ROOT / 'apps/web/public/content/audio'

# Unit replies vary by side in the originals (.V00, .V01, ...); keep every variant found.
VARIANTS = ['.AUD', '.V00', '.V01', '.V02', '.V03']

TD = {
    'effects': ['BAZOOK1', 'BUTTON', 'CONSTRU2', 'CRUMBLE', 'FLAMER2', 'GUN18', 'GUN20', 'GUN8',
                'ION1', 'MGUN11', 'MGUN2', 'NUKEMISL', 'NUKEXPLO', 'OBELRAY1', 'OBELPOWR', 'RAMGUN2', 'ROCKET1',
                'ROCKET2', 'SCOLD2', 'SQUISH2', 'TNKFIRE2', 'TNKFIRE3', 'TNKFIRE4', 'TNKFIRE6',
                'XPLOBIG4', 'XPLOBIG6', 'XPLOS', 'XPLOSML2', 'NUYELL1', 'NUYELL3', 'NUYELL4',
                'NUYELL5', 'YELL1', 'HVYDOOR1', 'POWRDN1',
                'COMCNTR1', 'BLEEP2'],
    'voices': ['ACKNO', 'AFFIRM1', 'AWAIT1', 'MOVOUT1', 'NOPROB', 'READY', 'REPORT1', 'RITAWAY', 'ROGER', 'UGOTIT',
               'UNIT1', 'VEHIC1', 'YESSIR1', 'GUYOKAY1', 'GUYYEAH1'],
    'eva': ['ACCOM1', 'FAIL1', 'BLDG1', 'CONSTRU1', 'UNITREDY', 'NEWOPT1', 'DEPLOY1', 'REINFOR1', 'CANCEL1',
            'BLDGING1', 'LOPOWER1', 'NOPOWER1', 'BASEATK1', 'NUKE1', 'PRIBLDG1', 'IONCHRG1', 'IONREDY1',
            'NUKAVAIL', 'NUKLNCH1', 'UNITLOST', 'STRCLOST', 'SELECT1', 'ONHOLD1', 'SILOS1',
            'NODCAPT1', 'GDICAPT1', 'ESTRUCX', 'ENMYUNIT', 'AIRREDY1'],
}

RA = {
    'effects': ['CANNON1', 'CANNON2', 'CHRONO2', 'IRONCUR9', 'SONPULSE', 'SANDBAG2', 'CHUTE1', 'DOGY1', 'DOGW5', 'DOGG5P',
                'DOGW3PX', 'DOGW7', 'FIREBL3', 'FIRETRT1', 'GRENADE1', 'GUN11', 'GUN13', 'GUN27', 'HEAL2', 'HYDROD1',
                'INVUL2', 'KABOOM1', 'KABOOM12', 'KABOOM15', 'SPLASH9', 'KABOOM22', 'MGUNINF1', 'MISSILE1', 'MISSILE6',
                'MISSILE7', 'PILLBOX1', 'RABEEP1', 'RAMENU1', 'SILENCER', 'TANK5', 'TANK6', 'TORPEDO1', 'TURRET1',
                'TSLACHG2', 'TESLA1', 'SQUISHY2', 'SCOLDY1', 'RADARON2', 'RADARDN1', 'PLACBLDG', 'KABOOM30', 'KABOOM25',
                'CRMBLE2', 'CASHUP1', 'CASHDN1', 'BUILD5', 'CASHTURN', 'H2OBOMB2', 'WALLKIL2', 'GUN5', 'SUBSHOW1', 'MINE1',
                'BEEPSLCT', 'DEDMAN1', 'DEDMAN2', 'DEDMAN3', 'DEDMAN4', 'DEDMAN5', 'DEDMAN6', 'DEDMAN7', 'DEDMAN8',
                'DEDMAN10', 'EAFFIRM1', 'EENGIN1', 'EMOVOUT1', 'EYESSIR1', 'TUFFGUY1', 'ROKROLL1', 'LAUGH1', 'CMON1',
                'BOMBIT1', 'GOTIT1', 'KEEPEM1', 'ONIT1', 'LEFTY1', 'YEAH1', 'YES1', 'YO1', 'SCOMND1', 'SYESSIR1',
                'SINDEED1', 'SONWAY1', 'SKING1', 'GIRLOKAY', 'GUYOKAY1'],
    'voices': ['ACKNO', 'AFFIRM1', 'AWAIT1', 'NOPROB', 'READY', 'REPORT1', 'RITAWAY', 'ROGER', 'UGOTIT', 'VEHIC1',
               'YESSIR1'],
    'eva': ['MISNWON1', 'MISNLST1', 'PROGRES1', 'CONSCMP1', 'UNITRDY1', 'NEWOPT1', 'NODEPLY1', 'STRCKIL1', 'NOPOWR1',
            'NOFUNDS1', 'REINFOR1', 'CANCLD1', 'ABLDGIN1', 'LOPOWER1', 'BASEATK1', 'NOBUILD1', 'PRIBLDG1', 'UNITLST1',
            'SLCTTGT1', 'ENMYAPP1', 'SILOND1', 'ONHOLD1', 'REPAIR1', 'AUNITL1', 'BLDGINF1', 'CHROCHR1', 'CHRORDY1',
            'CHROYES1', 'XPLOPLC1', 'CREDIT1', 'NAVYLST1', 'SATLNCH1', 'TRAIN1', 'IRONCHG1', 'IRONRDY1', 'UNITREP1',
            'UNITSLD1', 'STRUSLD1', 'ATPREP1', 'APREP1', 'ATLNCH1', 'AAVAIL1', 'AREADY1', 'ALAUNCH1', 'AARRIVE1',
            'SOVREIN1', 'SPYPLN1', 'OBJMET1', 'BCT1', 'CMDCNTR1'],
}


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


def open_mixes(archive: zipfile.ZipFile, names: list[str], approved: dict) -> dict[str, bytes]:
    out = {}
    for name in names:
        data = archive.read(name)
        if approved.get(name.upper()) != hashlib.sha256(data).hexdigest():
            raise RuntimeError(f'{name} is outside the pinned freeware pack decision')
        out[name.upper()] = data
    return out


def build_bank(mixes: list[Mix], plan: dict, notice: str) -> tuple[bytes, list[str]]:
    sounds, blobs, missing, offset = {}, [], [], 0
    for group, names in plan.items():
        for name in names:
            found = False
            for ext in (VARIANTS if group == 'voices' else ['.AUD']):
                data = next((d for m in mixes if (d := m.get(name + ext))), None)
                if data is None:
                    continue
                info = aud_info(data)
                if info['codec'] not in (1, 99) or info['stereo']:
                    raise RuntimeError(f'{name}{ext}: unsupported AUD format {info}')
                key = name if ext == '.AUD' else name + ext
                sounds[key] = [offset, len(data)]
                blobs.append(data)
                offset += len(data)
                found = True
            if not found:
                missing.append(name)
    index = json.dumps({'notice': notice, 'sounds': sounds}, separators=(',', ':')).encode()
    return struct.pack('<I', len(index)) + index + b''.join(blobs), missing


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    notice = 'Electronic Arts / Westwood Studios freeware game audio. Not GPL; not project-original.'

    td_zip = zipfile.ZipFile(TD_ZIP)
    td = open_mixes(td_zip, ['sounds.mix', 'speech.mix'], ledger_hashes('ledger-017'))
    bank, missing = build_bank([Mix(td['SOUNDS.MIX']), Mix(td['SPEECH.MIX'])], TD, 'Tiberian Dawn: ' + notice)
    (OUT / 'td.bank').write_bytes(bank)
    if missing:
        raise RuntimeError(f'td.bank: sounds missing from the pinned pack: {missing}')
    print(f'td.bank {len(bank):,} bytes')

    pinned(RA_ZIP, RA_URL, RA_ZIP_SHA)
    ra_zip = zipfile.ZipFile(RA_ZIP)
    ra = open_mixes(ra_zip, ['sounds.mix', 'redalert.mix', 'allies.mix', 'russian.mix'], ledger_hashes('ledger-018'))
    speech = Mix(Mix(ra['REDALERT.MIX']).get('SPEECH.MIX'))
    mixes = [Mix(ra['SOUNDS.MIX']), speech, Mix(ra['ALLIES.MIX']), Mix(ra['RUSSIAN.MIX'])]
    bank, missing = build_bank(mixes, RA, 'Red Alert: ' + notice)
    (OUT / 'ra.bank').write_bytes(bank)
    if missing:
        raise RuntimeError(f'ra.bank: sounds missing from the pinned pack: {missing}')
    print(f'ra.bank {len(bank):,} bytes')

    banks = sorted(OUT.glob('*.bank'))
    (OUT / 'manifest.json').write_text(json.dumps({
        'version': 1,
        'notice': 'Sound effects, unit replies and EVA speech: Electronic Arts / Westwood Studios freeware game audio from '
                  'Command & Conquer (Tiberian Dawn) and Red Alert. Not GPL and not project-original. Dune and Red Alert 2 '
                  'style games use them as stand-ins; extra effects (Prism, sonic, chrono, psychic, sandworms, thunder) are '
                  'synthesised by the Fusion Engine. No EA endorsement is implied.',
        'sources': [{'pack': 'td', 'url': 'https://openra.ppmsite.com/cnc-packages.zip', 'rightsLedger': 'ledger-017'},
                    {'pack': 'ra', 'url': RA_URL, 'rightsLedger': 'ledger-018'}],
        'files': [{'name': b.name, 'bytes': b.stat().st_size, 'sha256': hashlib.sha256(b.read_bytes()).hexdigest()} for b in banks],
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
