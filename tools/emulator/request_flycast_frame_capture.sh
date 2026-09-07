#!/usr/bin/env bash
set -euo pipefail

capture_count="${1:-1}"
capture_spacing="${2:-1}"
request_path="${FLYCAST_FRAME_CAPTURE_REQUEST:-.flycast-pvr/control/frame-capture.request}"

if ! [[ "${capture_count}" =~ ^[1-9][0-9]*$ ]] \
    || ! [[ "${capture_spacing}" =~ ^[1-9][0-9]*$ ]]; then
    echo "Usage: $0 [CAPTURE_COUNT] [FRAME_SPACING]" >&2
    exit 2
fi

mkdir -p "$(dirname "${request_path}")"
printf 'captures %s\nspacing %s\n' \
    "${capture_count}" \
    "${capture_spacing}" > "${request_path}"
echo "Requested ${capture_count} synchronized frame capture(s)."
