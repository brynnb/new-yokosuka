#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
control_dir="${repo_root}/.flycast-pvr/control"
mode="${1:-short-step}"

case "${mode}" in
    short-step)
        request_path="${control_dir}/ryo-matrix-recording.request"
        ;;
    long-walk)
        request_path="${control_dir}/ryo-long-walk-recording.request"
        ;;
    *)
        echo "Usage: $0 [short-step|long-walk]" >&2
        exit 2
        ;;
esac

mkdir -p "${control_dir}"
touch "${request_path}"
echo "Requested ${mode} per-VBlank Ryo matrix recording"
