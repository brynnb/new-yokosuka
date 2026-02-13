#!/bin/bash
# =============================================================================
# Multi-Scene Bulk Analysis Script
# =============================================================================
#
# Leverages the analyze.sh headless Ghidra pipeline to bulk-process all
# primary game scenes using the calibrated Rosetta Stone mappings.
#
# After Ghidra analysis, runs the Python post-processing pipeline:
#   1. scn3_to_python.py   — Semantic transpilation
#   2. extract_placements.py — Asset placement extraction
#   3. extract_splines.py   — Spline/path extraction
#   4. entity_id_database.py — Entity ID collection
#
# Prerequisites:
#   1. Ghidra 11.x+ installed
#   2. GHIDRA_INSTALL_DIR environment variable set
#   3. SCN3 language files installed (see README.md)
#   4. Extracted game files at SCENE_ROOT
#
# Usage:
#   ./bulk_analyze.sh <scene_root> [output_dir]
#
# Examples:
#   ./bulk_analyze.sh extracted_disc2_v2/data/SCENE
#   ./bulk_analyze.sh extracted_disc2_v2/data/SCENE ./analysis_output
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCENE_ROOT="${1:?Usage: $0 <scene_root> [output_dir]}"
OUTPUT_DIR="${2:-$(pwd)/scn3_analysis_output}"

# Ensure output dir is absolute
if [[ "$OUTPUT_DIR" != /* ]]; then
    OUTPUT_DIR="$(pwd)/$OUTPUT_DIR"
fi

mkdir -p "$OUTPUT_DIR"

# ================================================================
# PRIMARY SCENES — ordered by importance for the web viewer
# ================================================================
# Format: SCENE_CODE:HUMAN_NAME
PRIMARY_SCENES=(
    "JOMO:Hazuki_Residence"
    "D000:Dobuita_Main"
    "JD00:Sakuragaoka"
    "JU00:Yamanose"
    "JHD0:Hazuki_Exterior"
    "MFSY:Harbor_Amihama"
    "MK80:Harbor_Warehouse"
    "MS08:Warehouse_8"
)

# All scenes (for comprehensive analysis)
ALL_SCENES=(
    "${PRIMARY_SCENES[@]}"
    "ARAR:Abe_Store"
    "BETD:Bet_District"
    "DAZA:Dobuita_Alley_A"
    "DBHB:Dobuita_Barber"
    "DBYO:Dobuita_Bar"
    "DCBN:Dobuita_Convenience"
    "DCHA:Dobuita_China_Shop"
    "DGCT:YOU_Arcade"
    "DJAZ:Dobuita_Jazz_Bar"
    "DKPA:Dobuita_Knocking"
    "DKTY:Dobuita_Kitchen"
    "DMAJ:Dobuita_Mahjong"
    "DNOZ:Nozomi_House"
    "DPIZ:Dobuita_Pizza"
    "DRHT:Dobuita_Right"
    "DRME:Dobuita_Ramen"
    "DRSA:Dobuita_RSA"
    "DSBA:Dobuita_Soba"
    "DSKI:Dobuita_Ski_Shop"
    "DSLI:Dobuita_Slots"
    "DSLT:Dobuita_Slots_Alt"
    "DSUS:Dobuita_Sushi"
    "DTKY:Dobuita_Tokyo"
    "DURN:Dobuita_Restroom"
    "DYKZ:Dobuita_Yokosuka"
    "GMCT:Game_Center"
    "JABE:Abe_Residence"
    "MKSG:Harbor_Storage"
    "MKYU:Harbor_Dock"
    "MS8A:Warehouse_8_Alt"
    "MS8S:Warehouse_8_Story"
    "TATQ:Tattoo_Parlor"
)

# ================================================================
# Parse arguments
# ================================================================
MODE="primary"
if [[ "${3:-}" == "--all" ]]; then
    MODE="all"
fi

if [[ "$MODE" == "all" ]]; then
    SCENES=("${ALL_SCENES[@]}")
else
    SCENES=("${PRIMARY_SCENES[@]}")
fi

echo "=============================================="
echo "  SCN3 Multi-Scene Bulk Analysis"
echo "=============================================="
echo "  Scene root:  $SCENE_ROOT"
echo "  Output dir:  $OUTPUT_DIR"
echo "  Mode:        $MODE (${#SCENES[@]} scenes)"
echo "=============================================="
echo ""

# ================================================================
# Phase 1: Ghidra Analysis (if GHIDRA_INSTALL_DIR is set)
# ================================================================
GHIDRA_AVAILABLE=false
if [ -n "${GHIDRA_INSTALL_DIR:-}" ] && [ -f "$GHIDRA_INSTALL_DIR/support/analyzeHeadless" ]; then
    GHIDRA_AVAILABLE=true
fi

ANALYZED=0
SKIPPED=0
FAILED=0

for scene_entry in "${SCENES[@]}"; do
    IFS=':' read -r SCENE_CODE SCENE_NAME <<< "$scene_entry"

    # Find MAPINFO.BIN — search recursively under scene root
    MAPINFO=$(find "$SCENE_ROOT" -path "*/$SCENE_CODE/MAPINFO.BIN" -type f 2>/dev/null | head -1)

    if [ -z "$MAPINFO" ]; then
        echo "  SKIP  $SCENE_CODE ($SCENE_NAME) — MAPINFO.BIN not found"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    SCENE_OUTPUT_DIR="$OUTPUT_DIR/$SCENE_CODE"
    mkdir -p "$SCENE_OUTPUT_DIR"

    JSON_FILE="$SCENE_OUTPUT_DIR/${SCENE_CODE}_analysis.json"
    PYTHON_FILE="$SCENE_OUTPUT_DIR/${SCENE_CODE}_decompiled.py"
    PLACEMENT_FILE="$SCENE_OUTPUT_DIR/${SCENE_CODE}_placements.json"
    SPLINE_FILE="$SCENE_OUTPUT_DIR/${SCENE_CODE}_splines.json"

    echo "  ---- $SCENE_CODE ($SCENE_NAME) ----"
    echo "    Source: $MAPINFO"

    # Step 1: Ghidra analysis (produces JSON)
    if [ -f "$JSON_FILE" ]; then
        echo "    [1/4] Ghidra analysis: CACHED ($JSON_FILE)"
    elif $GHIDRA_AVAILABLE; then
        echo "    [1/4] Ghidra analysis: RUNNING..."
        if "$SCRIPT_DIR/analyze.sh" "$MAPINFO" "$JSON_FILE" > "$SCENE_OUTPUT_DIR/ghidra.log" 2>&1; then
            echo "    [1/4] Ghidra analysis: DONE"
            ANALYZED=$((ANALYZED + 1))
        else
            echo "    [1/4] Ghidra analysis: FAILED (see $SCENE_OUTPUT_DIR/ghidra.log)"
            FAILED=$((FAILED + 1))
            continue
        fi
    else
        echo "    [1/4] Ghidra analysis: SKIPPED (GHIDRA_INSTALL_DIR not set)"
        # Still run spline extraction directly on the binary
        echo "    [3/4] Spline extraction (direct binary)..."
        python3 "$SCRIPT_DIR/extract_splines.py" "$MAPINFO" "$SPLINE_FILE" 2>&1 | sed 's/^/    /'
        continue
    fi

    # Step 2: Semantic transpilation
    if [ -f "$JSON_FILE" ]; then
        echo "    [2/4] Semantic transpilation..."
        python3 "$SCRIPT_DIR/scn3_to_python.py" "$JSON_FILE" "$PYTHON_FILE" 2>&1 | sed 's/^/    /'
    fi

    # Step 3: Asset placement extraction
    if [ -f "$JSON_FILE" ]; then
        echo "    [3/4] Asset placement extraction..."
        python3 "$SCRIPT_DIR/extract_placements.py" "$JSON_FILE" "$PLACEMENT_FILE" 2>&1 | sed 's/^/    /'
    fi

    # Step 4: Spline extraction (from raw binary)
    echo "    [4/4] Spline extraction..."
    python3 "$SCRIPT_DIR/extract_splines.py" "$MAPINFO" "$SPLINE_FILE" 2>&1 | sed 's/^/    /'

    echo ""
done

# ================================================================
# Phase 2: Build global Entity ID database
# ================================================================
echo ""
echo "  ---- Entity ID Database ----"
ENTITY_DB="$OUTPUT_DIR/entity_id_database.json"
python3 "$SCRIPT_DIR/entity_id_database.py" "$SCENE_ROOT" "$ENTITY_DB" 2>&1 | sed 's/^/  /'

# ================================================================
# Phase 3: Generate combined manifest
# ================================================================
echo ""
echo "  ---- Combined Manifest ----"
python3 -c "
import json, os, glob

output_dir = '$OUTPUT_DIR'
manifest = {
    'scenes': {},
    'total_placements': 0,
    'total_splines': 0,
    'total_models': set(),
}

for scene_dir in sorted(glob.glob(os.path.join(output_dir, '*/')) ):
    code = os.path.basename(os.path.normpath(scene_dir))
    if code == '__pycache__':
        continue

    scene = {'code': code, 'files': {}}

    for ext in ['_analysis.json', '_decompiled.py', '_placements.json', '_splines.json']:
        f = os.path.join(scene_dir, code + ext)
        if os.path.exists(f):
            scene['files'][ext.replace('_', '', 1)] = os.path.relpath(f, output_dir)

    # Count stats
    placement_file = os.path.join(scene_dir, code + '_placements.json')
    if os.path.exists(placement_file):
        with open(placement_file) as pf:
            pdata = json.load(pf)
            n = pdata.get('metadata', {}).get('total_placements', 0)
            scene['placement_count'] = n
            manifest['total_placements'] += n
            for m in pdata.get('by_model', {}):
                manifest['total_models'].add(m)

    spline_file = os.path.join(scene_dir, code + '_splines.json')
    if os.path.exists(spline_file):
        with open(spline_file) as sf:
            sdata = json.load(sf)
            n = sdata.get('metadata', {}).get('total_spline_groups', 0)
            scene['spline_count'] = n
            manifest['total_splines'] += n

    manifest['scenes'][code] = scene

manifest['total_models'] = len(manifest['total_models'])
manifest['scene_count'] = len(manifest['scenes'])

with open(os.path.join(output_dir, 'manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=2)

print(f'  Scenes:     {manifest[\"scene_count\"]}')
print(f'  Placements: {manifest[\"total_placements\"]}')
print(f'  Splines:    {manifest[\"total_splines\"]}')
print(f'  Models:     {manifest[\"total_models\"]}')
print(f'  Manifest:   {os.path.join(output_dir, \"manifest.json\")}')
" 2>&1

echo ""
echo "=============================================="
echo "  Bulk Analysis Complete"
echo "=============================================="
echo "  Analyzed:  $ANALYZED scenes"
echo "  Skipped:   $SKIPPED scenes"
echo "  Failed:    $FAILED scenes"
echo "  Output:    $OUTPUT_DIR"
echo "=============================================="
