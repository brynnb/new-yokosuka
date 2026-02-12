#!/usr/bin/env python3
"""
Convert PVR sky textures to PNG from original Dreamcast PVR files.

Uses the pvr_decoder module to handle RECTANGLE, TWIDDLED, and
TWIDDLED_RECT data formats.

Usage:
  python3 convert_sky_textures.py                  # Convert all air*.pvr
  python3 convert_sky_textures.py air00.pvr        # Convert specific file(s)
"""

import sys
import os
from pvr_decoder import convert_pvr_to_png


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    # Look for PVR files locally first, then in sibling repo
    pvr_dir = os.path.join(script_dir, "extracted_tex")
    if not os.path.isdir(pvr_dir):
        pvr_dir = os.path.join(os.path.dirname(project_dir),
                               "Shenmue-Export-Tools", "extracted_tex")
    png_dir = os.path.join(project_dir, "public", "textures", "sky")

    if not os.path.isdir(pvr_dir):
        print(f"PVR directory not found.")
        print("Expected tools/extracted_tex/ or Shenmue-Export-Tools/extracted_tex/ alongside new-yokosuka")
        sys.exit(1)

    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        files = sorted([f for f in os.listdir(pvr_dir) if f.startswith('air') and f.endswith('.pvr')])

    print(f"Converting {len(files)} PVR files from {pvr_dir}")
    print(f"Output to {png_dir}\n")

    success = 0
    for f in files:
        pvr_path = f if os.path.isabs(f) else os.path.join(pvr_dir, f)
        basename = os.path.splitext(os.path.basename(pvr_path))[0]
        png_path = os.path.join(png_dir, basename + '.png')
        if convert_pvr_to_png(pvr_path, png_path):
            success += 1

    print(f"\nConverted {success}/{len(files)} textures.")


if __name__ == "__main__":
    main()
