#!/usr/bin/env python3
"""
Full extraction pipeline for Shenmue asset viewer.

Extracts game files from Dreamcast GDI disc images and processes them
into the format needed by the web viewer.

Steps:
  1. Extract filesystem from each GDI disc image using gditools3.py
  2. Process extracted files into model + texture packs using sync_models.py
  3. Convert sky textures from PVR to PNG using fix_sky_textures.py

Prerequisites:
  - Python 3 with Pillow installed (pip install Pillow)
  - Shenmue GDI disc images placed in gamedata/disc1/ and gamedata/disc2/

Output:
  - public/models/*.MT5          Raw model files
  - public/models/*_textures.bin Texture packs (base + time-of-day variants)
  - public/models.json           Model catalog for the web viewer
  - public/textures/sky/*.png    Sky dome textures

Usage:
  python3 tools/extract_all.py                    # Full pipeline
  python3 tools/extract_all.py --skip-extract     # Skip GDI extraction (if already done)
  python3 tools/extract_all.py --extract-only     # Only extract GDI, don't process
"""

import os
import sys
import subprocess
import shutil
import argparse


def get_paths():
    """Return all relevant directory paths."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    return {
        'script_dir': script_dir,
        'project_dir': project_dir,
        'gamedata_dir': os.path.join(project_dir, 'gamedata'),
        'disc1_dir': os.path.join(project_dir, 'gamedata', 'disc1'),
        'disc2_dir': os.path.join(project_dir, 'gamedata', 'disc2'),
        'extracted_disc1': os.path.join(project_dir, 'extracted_files'),
        'extracted_disc2': os.path.join(project_dir, 'extracted_disc2_v2'),
        'models_dir': os.path.join(project_dir, 'public', 'models'),
        'sky_dir': os.path.join(project_dir, 'public', 'textures', 'sky'),
    }


def find_gdi_file(disc_dir):
    """Find the .gdi file in a disc directory."""
    if not os.path.isdir(disc_dir):
        return None
    for f in os.listdir(disc_dir):
        if f.lower().endswith('.gdi'):
            return os.path.join(disc_dir, f)
    return None


def step_extract_gdi(paths):
    """Step 1: Extract filesystem from GDI disc images."""
    print("\n" + "=" * 60)
    print("STEP 1: Extracting game files from GDI disc images")
    print("=" * 60)

    gditools = os.path.join(paths['script_dir'], 'gditools3.py')

    discs = [
        ("Disc 1", paths['disc1_dir'], paths['extracted_disc1']),
        ("Disc 2", paths['disc2_dir'], paths['extracted_disc2']),
    ]

    for label, disc_dir, extract_dir in discs:
        gdi = find_gdi_file(disc_dir)
        if gdi:
            print(f"\n[{label}] Found: {os.path.basename(gdi)}")
            if os.path.isdir(extract_dir):
                print(f"  Already extracted to {extract_dir}, skipping.")
                print(f"  (Delete this folder to re-extract)")
            else:
                print(f"  Extracting to {extract_dir}...")
                try:
                    subprocess.run([
                        sys.executable, gditools, '-i', gdi,
                        '-o', extract_dir,
                        '--extract-all'
                    ], check=True)
                    print(f"  Done.")
                except subprocess.CalledProcessError as e:
                    print(f"  ERROR: Extraction failed (exit code {e.returncode})")
                    print(f"  You may need to check the GDI file format or track filenames.")
        else:
            print(f"\n[{label}] No .gdi file found in {disc_dir}")
            print(f"  Place your {label} GDI dump files there.")

    has_disc1 = os.path.isdir(paths['extracted_disc1'])
    has_disc2 = os.path.isdir(paths['extracted_disc2'])

    if not has_disc1 and not has_disc2:
        print("\nERROR: No extracted game files found. Cannot continue.")
        print("Place GDI disc images in gamedata/disc1/ and gamedata/disc2/")
        return False

    if not has_disc1:
        print("\nWARNING: Disc 1 not extracted. Some Scenario 1 zones will be missing.")
    if not has_disc2:
        print("\nWARNING: Disc 2 not extracted. Scenario 2 zones and some Scenario 1 zones will be missing.")

    return True


def step_sync_models(paths):
    """Step 2: Process extracted files into model + texture packs."""
    print("\n" + "=" * 60)
    print("STEP 2: Processing models and textures")
    print("=" * 60)

    sync_script = os.path.join(paths['script_dir'], 'sync_models.py')
    print(f"\nRunning sync_models.py...")
    print(f"  Input:  {paths['extracted_disc1']}")
    print(f"          {paths['extracted_disc2']}")
    print(f"  Output: {paths['models_dir']}")

    subprocess.run([sys.executable, sync_script], cwd=paths['project_dir'], check=True)

    # Count results
    if os.path.isdir(paths['models_dir']):
        mt5_count = len([f for f in os.listdir(paths['models_dir']) if f.endswith('.MT5')])
        tex_count = len([f for f in os.listdir(paths['models_dir']) if f.endswith('.bin')])
        print(f"\n  Generated {mt5_count} model files and {tex_count} texture packs")
    else:
        print("\n  WARNING: No output generated")


def step_sky_textures(paths):
    """Step 3: Convert sky PVR textures to PNG."""
    print("\n" + "=" * 60)
    print("STEP 3: Converting sky textures")
    print("=" * 60)

    fix_script = os.path.join(paths['script_dir'], 'convert_sky_textures.py')
    pvr_dir = os.path.join(paths['script_dir'], 'extracted_tex')

    if not os.path.isdir(pvr_dir):
        print(f"\n  Sky PVR files not found in {pvr_dir}")
        print(f"  Sky textures will not be updated.")
        return

    pvr_count = len([f for f in os.listdir(pvr_dir) if f.startswith('air') and f.endswith('.pvr')])
    print(f"\n  Converting {pvr_count} sky textures from {pvr_dir}")
    print(f"  Output: {paths['sky_dir']}")

    subprocess.run([sys.executable, fix_script], cwd=paths['project_dir'], check=True)


def main():
    parser = argparse.ArgumentParser(
        description='Full extraction pipeline for Shenmue asset viewer'
    )
    parser.add_argument('--skip-extract', action='store_true',
                        help='Skip GDI extraction (use existing extracted files)')
    parser.add_argument('--extract-only', action='store_true',
                        help='Only extract GDI disc images, do not process')
    args = parser.parse_args()

    paths = get_paths()

    print("Shenmue Asset Extraction Pipeline")
    print("=" * 60)
    print(f"Project root: {paths['project_dir']}")
    print(f"Game data:    {paths['gamedata_dir']}")

    # Ensure gamedata directories exist
    os.makedirs(paths['disc1_dir'], exist_ok=True)
    os.makedirs(paths['disc2_dir'], exist_ok=True)

    # Step 1: Extract GDI
    if not args.skip_extract:
        if not step_extract_gdi(paths):
            sys.exit(1)
    else:
        print("\nSkipping GDI extraction (--skip-extract)")

    if args.extract_only:
        print("\nDone (--extract-only). Run without this flag to process models.")
        return

    # Step 2: Sync models
    step_sync_models(paths)

    # Step 3: Sky textures
    step_sky_textures(paths)

    # Summary
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"\nOutput files:")
    print(f"  public/models/*.MT5           - Model files")
    print(f"  public/models/*_textures.bin  - Texture packs")
    print(f"  public/models.json            - Model catalog")
    print(f"  public/textures/sky/*.png     - Sky dome textures")
    print(f"\nTo start the viewer:")
    print(f"  npm run dev")
    print(f"\nTo upload assets to R2 (for production):")
    print(f"  node tools/upload_to_r2.js")


if __name__ == '__main__':
    main()
