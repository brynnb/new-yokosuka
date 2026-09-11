"""Render one source-verified AICA music sequence without rewriting catalogs.

Reuses the archive renderer's DTPK/DSF and deterministic encoding primitives.
Suitable for standalone Shenmue I or II banks that fit in Dreamcast sound RAM.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile
import wave

from tools.audio.render_shenmue2_audio import digest, encode, make_dsf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', type=Path, required=True)
    parser.add_argument('--bank-sha256', required=True)
    parser.add_argument('--driver', type=Path, required=True)
    parser.add_argument('--driver-sha256', required=True)
    parser.add_argument('--renderer', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--group', type=int, default=0)
    parser.add_argument('--track', type=int, default=0)
    parser.add_argument('--seconds', type=int, default=180)
    args = parser.parse_args()
    if args.seconds <= 0 or args.output.suffix != '.ogg':
        parser.error('Use a positive duration and an .ogg output path')
    bank, driver = args.bank.read_bytes(), args.driver.read_bytes()
    if digest(bank) != args.bank_sha256 or digest(driver) != args.driver_sha256:
        raise ValueError('Source bank or driver checksum mismatch')
    dsf_bytes = make_dsf(driver, bank, args.group, args.track)
    with tempfile.TemporaryDirectory(prefix='ny-music-sequence-', dir='/var/tmp') as directory:
        work = Path(directory)
        dsf, wav, ogg = work / 'track.dsf', work / 'track.wav', work / 'track.ogg'
        dsf.write_bytes(dsf_bytes)
        subprocess.run([str(args.renderer.resolve()), str(dsf), str(wav), str(args.seconds)],
                       check=True, timeout=max(120, args.seconds * 2))
        with wave.open(str(wav)) as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes()) != (2, 2, 44100, args.seconds * 44100):
                raise ValueError('Incomplete or unexpected renderer output')
            if not any(audio.readframes(audio.getnframes())):
                raise ValueError('Rendered sequence is digitally silent')
        encode(wav, ogg, 'ogg')
        data = ogg.read_bytes()
        # Do not overwrite an existing, different extraction silently.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if args.output.exists():
            if args.output.read_bytes() != data:
                raise ValueError(f'Existing output differs: {args.output}')
        else:
            args.output.write_bytes(data)
        print(f'{digest(data)}  {args.output}')


if __name__ == '__main__':
    main()
