#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
request_path="${FLYCAST_S1_FACE_TRACE_REQUEST:-${repo_root}/.flycast-pvr/face-trace/control/face-runtime.request}"
frames="${1:-360}"
load_state="${2:-2}"
input_frame="${3:-90}"
input_buttons="${4:-0x4}"
input_frames="${5:-3}"

for value in "${frames}" "${load_state}" "${input_frame}" "${input_frames}"; do
    if ! [[ "${value}" =~ ^-?[0-9]+$ ]]; then
        echo "Frame and state arguments must be decimal integers" >&2
        exit 2
    fi
done
if [[ -e "${request_path}" ]]; then
    echo "A FACE trace request is already pending: ${request_path}" >&2
    exit 1
fi

mkdir -p "$(dirname "${request_path}")"
{
    printf 'frames %s\n' "${frames}"
    printf 'load_state %s\n' "${load_state}"
    printf 'input_frame %s\n' "${input_frame}"
    printf 'input_buttons %s\n' "${input_buttons}"
    printf 'input_frames %s\n' "${input_frames}"
    # Menu slot 3 is a reproducible fixture whose FACE-state addresses are
    # preserved by the save state. Supplying them explicitly keeps the Lua
    # recorder read-only and avoids scanning RAM for name-shaped byte strings.
    # Flycast's Lua memory API expects the cached P1 RAM mirror.
    printf 'face YKB 0x8c5aed68\n'
    printf 'face YMG 0x8c863588\n'
    printf 'face FUC 0x8c95fd88\n'
    printf 'face INE 0x8c965dc8\n'
    # Generic HUMANS facial controller owned by KNJI/GKA_L in displayed save
    # slot 3. Unlike the detailed FACE records above, this 0x48-byte state
    # consumes the model's embedded closed/open -68 morph targets.
    printf 'face KNJI_GENERIC 0x8c87c160\n'
    printf 'face KNJI_CUE_0 0x8c4720b0\n'
    printf 'face KNJI_CUE_1 0x8c4721fc\n'
} > "${request_path}"
echo "Queued Shenmue I FACE runtime capture: ${request_path}"
