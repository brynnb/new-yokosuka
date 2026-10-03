#!/usr/bin/env python3
"""Extract the capsule atlas omitted by the broad D000 viewer texture pack."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

from tools.worlds.build_vending_assets import texture_entries, write_texture_pack


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scene-root', type=Path, required=True, help='Extracted SCENE/01 directory')
    parser.add_argument('--output', type=Path, default=Path('play/assets/dobuita'))
    args = parser.parse_args()
    source = args.scene_root / 'D000' / 'OMG.PKF'
    packed = source.read_bytes()
    decoded = gzip.decompress(packed) if packed[:2] == b'\x1f\x8b' else packed
    texture_id = bytes.fromhex('d591cfa8ab78425f')  # NAME in all five CAPS5 models.
    entries = [(key, data) for key, data in texture_entries(decoded) if key == texture_id]
    if len(entries) != 1:
        raise ValueError(f'Expected one capsule atlas in {source}, found {len(entries)}')
    args.output.mkdir(parents=True, exist_ok=True)
    output = args.output / 'GACHA_textures.bin'
    write_texture_pack(output, entries)
    report = {
        'source': 'SCENE/01/D000/OMG.PKF',
        'sourceSha256': hashlib.sha256(packed).hexdigest(),
        'textureIdHex': texture_id.hex(),
        'textureSha256': hashlib.sha256(entries[0][1]).hexdigest(),
        'output': output.as_posix(),
        'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'byteLength': output.stat().st_size,
    }
    Path('tools/evidence/capsule-shell-textures.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Extracted {output} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
