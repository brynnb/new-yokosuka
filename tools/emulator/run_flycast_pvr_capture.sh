#!/usr/bin/env bash
set -euo pipefail

disc="${1:-1}"
if [[ "${disc}" != "1" && "${disc}" != "2" && "${disc}" != "3" ]]; then
    echo "Usage: $0 [1|2|3]" >&2
    exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
flycast_root="${FLYCAST_CAPTURE_ROOT:-$(dirname "${repo_root}")/flycast-pvr-capture}"
profile_root="${FLYCAST_PROFILE_ROOT:-${repo_root}/.flycast-pvr}"
game_root="${SHENMUE_DISC_ROOT:-${repo_root}/gamedata/Shenmue-USA}"
cue="${SHENMUE_CUE:-${game_root}/Disc ${disc}/Shenmue (USA) (Disc ${disc}).cue}"

if [[ ! -x "${flycast_root}/build/flycast" ]]; then
    echo "Instrumented Flycast binary not found: ${flycast_root}/build/flycast" >&2
    exit 1
fi
if [[ ! -f "${cue}" ]]; then
    echo "Shenmue disc image not found: ${cue}" >&2
    exit 1
fi

mkdir -p \
    "${profile_root}/config/flycast" \
    "${profile_root}/data" \
    "${profile_root}/control" \
    "${repo_root}/captures/pvr" \
    "${repo_root}/captures/boundary" \
    "${repo_root}/captures/race" \
    "${repo_root}/captures/skeleton"

export XDG_CONFIG_HOME="${profile_root}/config"
export XDG_DATA_HOME="${profile_root}/data"
export FLYCAST_PVR_CAPTURE_DIR="${repo_root}/captures/pvr"
export FLYCAST_RYO_PROBE_REQUEST="${profile_root}/control/ryo-hallway-probe.request"
export FLYCAST_RYO_MATRIX_REQUEST="${profile_root}/control/ryo-matrix-recording.request"
export FLYCAST_RYO_LONG_WALK_REQUEST="${profile_root}/control/ryo-long-walk-recording.request"
export FLYCAST_DRAWER_RECORDING_REQUEST="${profile_root}/control/drawer-recording.request"
export FLYCAST_INPUT_PULSE_REQUEST="${profile_root}/control/input-pulse.request"
export FLYCAST_MEMORY_WRITE_REQUEST="${profile_root}/control/memory-write.request"
export FLYCAST_S2_ACTOR_CAPTURE_REQUEST="${profile_root}/control/s2-animation-actor-capture.request"
export FLYCAST_FRAME_CAPTURE_REQUEST="${profile_root}/control/frame-capture.request"
export FLYCAST_RACE_ROUTE_REQUEST="${profile_root}/control/race-route-recording.request"
export FLYCAST_BOUNDARY_REQUEST="${profile_root}/control/boundary-transition-recording.request"
export FLYCAST_BOUNDARY_OUTPUT="${repo_root}/captures/boundary"
export FLYCAST_RACE_ROUTE_OUTPUT="${repo_root}/captures/race"
export FLYCAST_RYO_MATRIX_OUTPUT="${repo_root}/captures/skeleton"

install -m 0644 \
    "${repo_root}/tools/emulator/ryo_hallway_probe.lua" \
    "${profile_root}/config/flycast/flycast.lua"

flycast_config="config:pvr.rend=4,config:UseReios=yes,config:rend.Resolution=480,config:rend.ThreadedRendering=no,config:rend.DumpTextures=no"
if [[ "${FLYCAST_FORCE_INTERPRETER:-0}" == "1" ]]; then
    flycast_config+=",config:Dynarec.Enabled=no"
fi

exec "${flycast_root}/build/flycast" \
    -config "${flycast_config}" \
    "${cue}"
