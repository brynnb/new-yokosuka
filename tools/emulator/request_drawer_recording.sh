#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
control_dir="${repo_root}/.flycast-pvr/control"
mkdir -p "${control_dir}"
touch "${control_dir}/drawer-recording.request"
echo "Requested synchronized drawer recording from running Flycast."
