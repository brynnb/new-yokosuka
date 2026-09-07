#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
control_dir="${repo_root}/.flycast-pvr/control"

mkdir -p "${control_dir}" "${repo_root}/captures/race"
touch "${control_dir}/race-route-recording.request"
echo "Requested a six-minute native forklift-race route recording from save-state slot 1."
