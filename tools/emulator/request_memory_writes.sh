#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 || $# % 2 != 0 )); then
    echo "Usage: $0 ADDRESS VALUE [ADDRESS VALUE ...]" >&2
    exit 2
fi

request_path="${FLYCAST_MEMORY_WRITE_REQUEST:-.flycast-pvr/control/memory-write.request}"
mkdir -p "$(dirname "$request_path")"
printf 'frames %s\n' "${FLYCAST_MEMORY_WRITE_FRAMES:-1}" > "$request_path"
while (( $# )); do
    printf '%s %s\n' "$1" "$2" >> "$request_path"
    shift 2
done

echo "Requested emulator memory writes."
