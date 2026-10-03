"""Extract the original capsule reveal reactions, retaining source provenance."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path

from tools.scripting.extract_dialogue_voice import find_voice_source, extract_member
from tools.scripting.build_dialogue_voice_pack import transcode_aac

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vgmstream-cli', required=True)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    inventory = json.loads((ROOT / '.disc-work/dialogue/inventory.json').read_text())
    output = ROOT / 'public/audio/capsule'
    output.mkdir(parents=True, exist_ok=True)

    def encode(voice_id):
        source = find_voice_source(inventory, voice_id, disc=1)
        payload = extract_member(source)
        target = output / f'{voice_id}.m4a'
        transcode_aac(payload, target, vgmstream_cli=args.vgmstream_cli,
                      ffmpeg='ffmpeg', bitrate=48, sample_rate=22050)
        return {'voiceId': voice_id, 'text': source['displayText'],
                'archive': 'data/SCENE/01/STREAM/E1066.AFS',
                'member': source['member'], 'nativeSha256': hashlib.sha256(payload).hexdigest(),
                'url': f'/audio/capsule/{target.name}',
                'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}

    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        voices = list(pool.map(encode, ['E1066A019', 'E1066A022']))
    evidence = {'schema': 'capsule-reveal-voices-v1', 'voices': voices}
    (ROOT / 'tools/evidence/capsule-reveal-voices.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(f'Extracted {len(voices)} original capsule reactions')


if __name__ == '__main__':
    main()
