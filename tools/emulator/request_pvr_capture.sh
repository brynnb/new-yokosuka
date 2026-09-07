#!/usr/bin/env bash
set -euo pipefail

capture_pid="$(pgrep -n -f 'flycast.*Shenmue.*\.(cue|gdi|chd|cdi)$' || true)"
if [[ -z "${capture_pid}" ]]; then
    echo "No running Shenmue Flycast process found." >&2
    exit 1
fi

kill -USR1 "${capture_pid}"
echo "Requested a PowerVR capture from Flycast PID ${capture_pid}."
