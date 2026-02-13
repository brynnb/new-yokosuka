#!/bin/bash
# =============================================================================
# SCN3 Headless Analysis Script
# =============================================================================
#
# Analyzes a Shenmue MAPINFO.BIN file using Ghidra's headless analyzer
# with the SCN3 processor module, and exports decompiled output to JSON.
#
# Prerequisites:
#   1. Ghidra 11.x+ installed
#   2. GHIDRA_INSTALL_DIR environment variable set
#   3. SCN3 language files copied to Ghidra (see README.md)
#
# Usage:
#   ./analyze.sh <MAPINFO.BIN> [output.json]
#
# Examples:
#   ./analyze.sh extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN
#   ./analyze.sh extracted_files/data/SCENE/01/D000/MAPINFO.BIN dobuita.json
# =============================================================================

set -e

if [ -z "$GHIDRA_INSTALL_DIR" ]; then
    echo "ERROR: GHIDRA_INSTALL_DIR is not set."
    echo "  export GHIDRA_INSTALL_DIR=/path/to/ghidra_11.x"
    exit 1
fi

HEADLESS="$GHIDRA_INSTALL_DIR/support/analyzeHeadless"
if [ ! -f "$HEADLESS" ]; then
    echo "ERROR: analyzeHeadless not found at $HEADLESS"
    exit 1
fi

INPUT_FILE="${1:?Usage: $0 <MAPINFO.BIN> [output.json]}"
# Ensure OUTPUT_FILE is an absolute path so it doesn't get deleted with the temp project
OUTPUT_FILE="${2:-$(basename "$INPUT_FILE" .BIN)_scn3_analysis.json}"
if [[ "$OUTPUT_FILE" != /* ]]; then
    OUTPUT_FILE="$(pwd)/$OUTPUT_FILE"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR=$(mktemp -d)
PROJECT_NAME="SCN3_Analysis"

echo "=== SCN3 Headless Analysis ==="
echo "Input:   $INPUT_FILE"
echo "Output:  $OUTPUT_FILE"
echo "Project: $PROJECT_DIR/$PROJECT_NAME"
echo ""

# Step 1: Import the file with the SCN3 processor and run the loader script
# Step 2: Run analysis + export script
"$HEADLESS" "$PROJECT_DIR" "$PROJECT_NAME" \
    -import "$INPUT_FILE" \
    -processor "SCN3:LE:32:default" \
    -scriptPath "$SCRIPT_DIR/ghidra_scripts" \
    -preScript SCN3Loader.py \
    -postScript ExportSCN3Analysis.py "$OUTPUT_FILE" \
    -analysisTimeoutPerFile 120

# Clean up temp project
rm -rf "$PROJECT_DIR"

echo ""
echo "=== Analysis Complete ==="
echo "Output saved to: $OUTPUT_FILE"
