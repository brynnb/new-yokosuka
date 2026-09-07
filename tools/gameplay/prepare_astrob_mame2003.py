#!/usr/bin/env python3
"""Adapt a modern Astro Blaster 2A ROM ZIP for MAME 2003 Plus.

The modern set uses descriptive board-location suffixes and includes two
small decode PROMs. MAME 2003 Plus has the compatible version-2 driver, but
expects the historical short filenames and does not consume those PROMs.
This tool renames only the required entries and leaves the source untouched.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROM_NAMES = {
    "829b.cpu-u25": "829b",
    **{f"{number}.prom-u{number - 887}": str(number) for number in range(889, 897)},
    "888c.prom-u1": "888",
    "897b.prom-u10": "897",
    "898a.prom-u11": "898",
    **{f"{number}.prom-u{number - 887}": str(number) for number in range(899, 903)},
    "903c.prom-u16": "903",
    "904a.prom-u17": "904",
    **{f"{number}.prom-u{number - 887}": str(number) for number in range(905, 907)},
    "808b.speech-u7": "808b",
    "809a.speech-u6": "809a",
    "810.speech-u5": "810",
    "811.speech-u4": "811",
    "812a.speech-u3": "812a",
}


def prepare(source: Path, output: Path) -> None:
    if source.resolve() == output.resolve():
        raise ValueError("source and output must be different files")

    with ZipFile(source) as archive:
        available = set(archive.namelist())
        missing = sorted(set(ROM_NAMES) - available)
        if missing:
            raise ValueError(
                "source is not the expected astrob2a set; missing: "
                + ", ".join(missing)
            )
        output.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as adapted:
            for source_name, target_name in ROM_NAMES.items():
                adapted.writestr(target_name, archive.read(source_name))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    prepare(args.source, args.output)


if __name__ == "__main__":
    main()
