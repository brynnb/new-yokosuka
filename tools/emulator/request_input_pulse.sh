#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
request_path="${FLYCAST_INPUT_PULSE_REQUEST:-${repo_root}/.flycast-pvr/control/input-pulse.request}"
port="${1:-1}"
buttons="${2:-0x10}"
frames="${3:-30}"
load_state="${4:--1}"
axis_x="${5:-0}"
axis_y="${6:-0}"
trigger_left="${7:-0}"
trigger_right="${8:-0}"

mkdir -p "$(dirname "${request_path}")"
printf '%s %s %s %s %s %s %s %s\n' \
    "${port}" "${buttons}" "${frames}" "${load_state}" "${axis_x}" "${axis_y}" \
    "${trigger_left}" "${trigger_right}" \
    > "${request_path}"
echo "Requested port ${port} buttons ${buttons}, axes ${axis_x},${axis_y}, triggers ${trigger_left},${trigger_right} for ${frames} frames (load state ${load_state})."
