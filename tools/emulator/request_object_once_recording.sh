#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
control_dir="${repo_root}/.flycast-pvr/control"
memory_base="${1:-0x8c810000}"
memory_bytes="${2:-0x3000}"
load_state="${3:-1}"
input_buttons="${4:-0x4}"
input_start_frame="${5:-61}"
input_frames="${6:-15}"
mkdir -p "${control_dir}"
printf '%s %s %s %s %s %s\n' \
    "${memory_base}" "${memory_bytes}" "${load_state}" \
    "${input_buttons}" "${input_start_frame}" "${input_frames}" \
    > "${control_dir}/object-once-recording.request"
echo "Requested synchronized one-shot object recording at ${memory_base} (${memory_bytes} bytes, load state ${load_state}, input ${input_buttons} at frame ${input_start_frame} for ${input_frames} frames)."
