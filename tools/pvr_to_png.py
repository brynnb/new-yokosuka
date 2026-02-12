#!/usr/bin/env python3
"""
Convert Dreamcast PVR/PVRT texture files to PNG images.

Supports RECTANGLE, TWIDDLED, and TWIDDLED_RECT data formats
with ARGB1555, RGB565, and ARGB4444 color formats.

Usage:
  python3 pvr_to_png.py <pvr_file> <png_file>
  python3 pvr_to_png.py <pvr_file>              # outputs to same name with .png extension
"""

import sys
import os
from pvr_decoder import convert_pvr_to_png


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 pvr_to_png.py <pvr_file> [png_file]")
        sys.exit(1)

    pvr_path = sys.argv[1]
    if len(sys.argv) >= 3:
        png_path = sys.argv[2]
    else:
        png_path = os.path.splitext(pvr_path)[0] + '.png'

    if not os.path.exists(pvr_path):
        print(f"File not found: {pvr_path}")
        sys.exit(1)

    if convert_pvr_to_png(pvr_path, png_path):
        print("Done.")
    else:
        print("Conversion failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
