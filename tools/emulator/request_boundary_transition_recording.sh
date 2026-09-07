#!/usr/bin/env bash
set -euo pipefail

frames="${1:-7200}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
control_dir="${repo_root}/.flycast-pvr/control"
request_path="${control_dir}/boundary-transition-recording.request"

mkdir -p "${control_dir}"
printf '%s\n' "${frames}" >"${request_path}"
echo "Requested read-only JD00 boundary recording for ${frames} frames"
