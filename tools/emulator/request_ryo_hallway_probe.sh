#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
control_dir="${repo_root}/.flycast-pvr/control"
request_path="${control_dir}/ryo-hallway-probe.request"

mkdir -p "${control_dir}"
touch "${request_path}"
echo "Requested deterministic Ryo hallway probe"
