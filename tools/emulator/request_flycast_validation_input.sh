#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
validation_root="${FLYCAST_VALIDATION_ROOT:-${repo_root}/.flycast-pvr/validation}"
request_path="${FLYCAST_VALIDATION_INPUT_REQUEST:-${validation_root}/control/input.request}"
if [[ "${1:-}" == "exit" ]]; then
    if [[ -e "${request_path}" ]]; then
        echo "A validation input request is already pending: ${request_path}" >&2
        exit 1
    fi
    mkdir -p "$(dirname "${request_path}")"
    printf 'exit\n' > "${request_path}"
    echo "Queued isolated Flycast exit request: ${request_path}"
    exit 0
fi
port="${1:-1}"
buttons="${2:-0}"
frames="${3:-1}"
load_state="${4:--1}"
axis_x="${5:-0}"
axis_y="${6:-0}"
trigger_left="${7:-0}"
trigger_right="${8:-0}"

if [[ -e "${request_path}" ]]; then
    echo "A validation input request is already pending: ${request_path}" >&2
    exit 1
fi
mkdir -p "$(dirname "${request_path}")"
printf '%s %s %s %s %s %s %s %s\n' \
    "${port}" \
    "${buttons}" \
    "${frames}" \
    "${load_state}" \
    "${axis_x}" \
    "${axis_y}" \
    "${trigger_left}" \
    "${trigger_right}" \
    > "${request_path}"
echo "Queued isolated Flycast input request: ${request_path}"
