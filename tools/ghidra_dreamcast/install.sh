#!/bin/bash
# =============================================================================
# Install SCN3 processor language files into Ghidra
# =============================================================================
#
# Copies the SLEIGH language definition files into Ghidra's processor
# directory so the SCN3 processor appears in the language list.
#
# No compilation or Gradle build needed — just file copies.
#
# Usage:
#   export GHIDRA_INSTALL_DIR=/path/to/ghidra_11.x
#   ./install.sh
# =============================================================================

set -e

if [ -z "$GHIDRA_INSTALL_DIR" ]; then
    echo "ERROR: GHIDRA_INSTALL_DIR is not set."
    echo "  export GHIDRA_INSTALL_DIR=/path/to/ghidra_11.x"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_LANG="$SCRIPT_DIR/data/languages"
DEST_DIR="$GHIDRA_INSTALL_DIR/Ghidra/Processors/SCN3"
DEST_LANG="$DEST_DIR/data/languages"

echo "=== Installing SCN3 Processor ==="
echo "Source:      $SRC_LANG"
echo "Destination: $DEST_LANG"
echo ""

# Create destination directory
mkdir -p "$DEST_LANG"

# Copy language files
cp "$SRC_LANG/SCN3.slaspec" "$DEST_LANG/"
cp "$SRC_LANG/SCN3.pspec"   "$DEST_LANG/"
cp "$SRC_LANG/SCN3.cspec"   "$DEST_LANG/"
cp "$SRC_LANG/SCN3.ldefs"   "$DEST_LANG/"

# Copy module manifest
cp "$SCRIPT_DIR/Module.manifest" "$DEST_DIR/"

# Compile .slaspec -> .sla (the .ldefs references the compiled binary)
SLEIGH="$GHIDRA_INSTALL_DIR/support/sleigh"
if [ -f "$SLEIGH" ]; then
    echo "Compiling SLEIGH spec..."
    "$SLEIGH" "$DEST_LANG/SCN3.slaspec"
    echo "Compiled SCN3.sla"
else
    echo "WARNING: sleigh compiler not found at $SLEIGH"
    echo "  Ghidra will compile the .slaspec on first use, but this may be slow."
fi

echo ""
echo "Installed files:"
ls -la "$DEST_LANG/"
echo ""
echo "=== Installation Complete ==="
echo ""
echo "The SCN3 processor is now available in Ghidra."
echo "You can verify by running:"
echo "  $GHIDRA_INSTALL_DIR/support/analyzeHeadless /tmp/test TestProject -help"
echo "  (look for SCN3:LE:32:default in the processor list)"
